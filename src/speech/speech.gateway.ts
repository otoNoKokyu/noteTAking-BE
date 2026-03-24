import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
    TranscribeStreamingClient,
    StartStreamTranscriptionCommand,
} from '@aws-sdk/client-transcribe-streaming';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/speech' })
export class SpeechGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private transcribeClient: TranscribeStreamingClient;
    private activeStreams: Map<string, boolean> = new Map();

    constructor(private configService: ConfigService) {
        this.transcribeClient = new TranscribeStreamingClient({
            region: this.configService.get<string>('AWS_REGION') || 'us-east-1',
            credentials: {
                accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
                secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
            },
        });
    }

    handleConnection(client: Socket) {
        console.log(`Client connected to speech gateway: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected from speech gateway: ${client.id}`);
        this.stopTranscription(client.id);
    }

    @SubscribeMessage('start-transcription')
    async handleStartTranscription(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
        if (this.activeStreams.has(client.id)) {
            this.stopTranscription(client.id);
        }

        const languageCode = data?.languageCode || 'en-US';
        const sampleRate = data?.sampleRate || 16000;

        let isStopped = false;
        const chunkQueue: Buffer[] = [];
        let waitingResolve: ((buf: Buffer | null) => void) | null = null;

        const onAudioChunk = (audioData: ArrayBuffer | Buffer) => {
            if (isStopped) return;
            const buf = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);
            if (waitingResolve) {
                const resolve = waitingResolve;
                waitingResolve = null;
                resolve(buf);
            } else {
                chunkQueue.push(buf);
            }
        };

        const onStop = () => {
            isStopped = true;
            if (waitingResolve) {
                const resolve = waitingResolve;
                waitingResolve = null;
                resolve(null);
            }
            client.off('audio-chunk', onAudioChunk);
            client.off('stop-transcription', onStop);
        };

        client.on('audio-chunk', onAudioChunk);
        client.on('stop-transcription', onStop);

        const audioStream = async function* () {
            while (!isStopped || chunkQueue.length > 0) {
                if (chunkQueue.length > 0) {
                    const chunk = chunkQueue.shift();
                    if (chunk) yield { AudioEvent: { AudioChunk: chunk } };
                } else {
                    const chunk = await new Promise<Buffer | null>((resolve) => {
                        waitingResolve = resolve;
                    });
                    if (!chunk) break;
                    yield { AudioEvent: { AudioChunk: chunk } };
                }
            }
        };

        const command = new StartStreamTranscriptionCommand({
            LanguageCode: languageCode,
            MediaEncoding: 'pcm',
            MediaSampleRateHertz: sampleRate,
            AudioStream: audioStream(),
        });

        try {
            this.activeStreams.set(client.id, true);
            const response = await this.transcribeClient.send(command);

            client.emit('transcription-started', { status: 'ok' });
            this.consumeTranscriptInfo(client, response.TranscriptResultStream);

        } catch (error) {
            console.error('Transcription start failed:', error);
            this.activeStreams.delete(client.id);
            client.emit('transcript-error', { message: error.message });
        }
    }

    @SubscribeMessage('stop-transcription')
    handleStopTranscription(@ConnectedSocket() client: Socket) {
        this.stopTranscription(client.id);
        client.emit('transcription-complete', { status: 'stopped' });
    }

    private stopTranscription(clientId: string) {
        if (this.activeStreams.has(clientId)) {
            this.activeStreams.delete(clientId);
        }
    }

    private async consumeTranscriptInfo(client: Socket, transcriptStream: any) {
        try {
            for await (const event of transcriptStream) {
                if (!this.activeStreams.has(client.id)) break;

                const results = event.TranscriptEvent?.Transcript?.Results;
                if (results && results.length > 0) {
                    const result = results[0];
                    if (result.Alternatives && result.Alternatives.length > 0) {
                        const transcript = result.Alternatives[0].Transcript;

                        if (result.IsPartial) {
                            client.emit('transcript-partial', { transcript });
                        } else {
                            client.emit('transcript-final', { transcript });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error in transcript stream:', error);
            client.emit('transcript-error', { message: error.message });
        } finally {
            this.activeStreams.delete(client.id);
            client.emit('transcription-complete', { status: 'stopped' });
        }
    }
}
