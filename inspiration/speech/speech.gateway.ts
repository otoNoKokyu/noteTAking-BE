// @ts-nocheck
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SpeechGateway_1;
import * as websockets_1 from "@nestjs/websockets";
import * as common_1 from "@nestjs/common";
import * as socket_io_1 from "socket.io";
import * as speech_service_1 from "./speech.service";
let SpeechGateway = SpeechGateway_1 = class SpeechGateway {
    constructor(speechService) {
        this.speechService = speechService;
        this.logger = new common_1.Logger(SpeechGateway_1.name);
        this.sessions = new Map();
        this.pendingChunks = new Map();
        this.initializing = new Set();
    }
    handleConnection(client) {
        this.logger.log(`Client connected: ${client.id}`);
    }
    handleDisconnect(client) {
        this.logger.log(`Client disconnected: ${client.id}`);
        this.stopSession(client.id);
    }
    async handleStartTranscription(client, data) {
        this.stopSession(client.id);
        this.initializing.add(client.id);
        this.pendingChunks.set(client.id, []);
        const session = await this.speechService.startTranscription((transcript) => {
            client.emit('transcript-partial', { transcript });
        }, (transcript) => {
            client.emit('transcript-final', { transcript });
        }, (error) => {
            client.emit('transcript-error', { message: error.message });
        }, data?.languageCode ?? 'en-US', data?.sampleRate ?? 16000);
        this.initializing.delete(client.id);
        if (session) {
            this.sessions.set(client.id, session);
            client.emit('transcription-started', { status: 'ok' });
            const buffered = this.pendingChunks.get(client.id);
            if (buffered && buffered.length > 0) {
                this.logger.log(`Flushing ${buffered.length} buffered chunks for ${client.id}`);
                for (const chunk of buffered) {
                    session.audioStream.write(chunk);
                }
            }
            this.pendingChunks.delete(client.id);
        }
        else {
            this.pendingChunks.delete(client.id);
            client.emit('transcript-error', {
                message: 'Failed to start transcription session',
            });
        }
    }
    handleAudioChunk(client, data) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const session = this.sessions.get(client.id);
        if (session) {
            session.audioStream.write(buffer);
            return;
        }
        if (this.initializing.has(client.id)) {
            const chunks = this.pendingChunks.get(client.id);
            if (chunks) {
                chunks.push(buffer);
            }
            return;
        }
        this.logger.debug(`Dropping audio chunk for ${client.id}: no session`);
    }
    handleStopTranscription(client) {
        this.stopSession(client.id);
        client.emit('transcription-complete', { status: 'stopped' });
    }
    stopSession(clientId) {
        this.initializing.delete(clientId);
        this.pendingChunks.delete(clientId);
        const session = this.sessions.get(clientId);
        if (session) {
            session.stop();
            this.sessions.delete(clientId);
            this.logger.log(`Transcription session stopped for: ${clientId}`);
        }
    }
};
export { SpeechGateway };
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], SpeechGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('start-transcription'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], SpeechGateway.prototype, "handleStartTranscription", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('audio-chunk'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], SpeechGateway.prototype, "handleAudioChunk", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('stop-transcription'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], SpeechGateway.prototype, "handleStopTranscription", null);
exports.SpeechGateway = SpeechGateway = SpeechGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: { origin: '*' },
        namespace: '/speech',
    }),
    __metadata("design:paramtypes", [speech_service_1.SpeechService])
], SpeechGateway);
