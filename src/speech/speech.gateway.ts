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

// Helper function to build CORS origins from environment
function getCorsOrigins(configService: ConfigService): string[] {
    const allowedOrigins = configService.get<string>('ALLOWED_ORIGINS');
    if (allowedOrigins) {
        return allowedOrigins.split(',').map(o => o.trim());
    }
    return ['http://localhost:5173', 'http://localhost:3000'];
}

@WebSocketGateway({
    cors: {
        origin: true, // Allow all origins - will be validated server-side
        credentials: true,
    },
    namespace: '/speech',
    transports: ['websocket', 'polling'],
})
export class SpeechGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private transcribeClient: TranscribeStreamingClient;
    private activeStreams: Map<string, boolean> = new Map();
    private allowedOrigins: string[];

    constructor(private configService: ConfigService) {
        this.allowedOrigins = getCorsOrigins(configService);
        
        this.transcribeClient = new TranscribeStreamingClient({
            region: this.configService.get<string>('AWS_REGION') || 'us-east-1',
            credentials: {
                accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
                secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
            },
        });
        
        console.log('SpeechGateway initialized with allowed origins:', this.allowedOrigins);
    }

    handleConnection(client: Socket) {
        // Validate origin on connection
        const origin = client.request.headers.origin;
        
        if (!this.isOriginAllowed(origin)) {
            console.warn(`Connection attempt from unauthorized origin: ${origin}`);
            client.disconnect(true);
            return;
        }
        
        console.log(`Client connected to speech gateway: ${client.id} from ${origin}`);
    }

    private isOriginAllowed(origin: string | undefined): boolean {
        if (!origin) return true; // Allow requests without origin (like localhost)
        
        return this.allowedOrigins.some(allowedOrigin => {
            // Exact match or wildcard match
            if (allowedOrigin === origin) return true;
            if (allowedOrigin.includes('*')) {
                const pattern = allowedOrigin.replace(/\*/g, '.*');
                return new RegExp(`^${pattern}$`).test(origin);
            }
            return false;
        });
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
