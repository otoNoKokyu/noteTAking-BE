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
var SpeechService_1;
import * as common_1 from "@nestjs/common";
import * as config_1 from "@nestjs/config";
import * as stream_1 from "stream";
import * as crypto from "crypto";
import * as WebSocket from "ws";
let SpeechService = SpeechService_1 = class SpeechService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(SpeechService_1.name);
        this.configured = false;
        this.crc32Table = null;
        this.region = this.configService.get('AWS_REGION', 'us-east-1');
        this.accessKeyId = this.configService.get('AWS_ACCESS_KEY_ID', '');
        this.secretAccessKey = this.configService.get('AWS_SECRET_ACCESS_KEY', '');
        if (this.accessKeyId && this.secretAccessKey) {
            this.configured = true;
            this.logger.log(`AWS Transcribe configured for region: ${this.region}`);
            this.logger.log(`AWS Access Key ID: ${this.accessKeyId.substring(0, 8)}...`);
        }
        else {
            this.logger.warn('AWS credentials not set — speech-to-text will be unavailable');
        }
    }
    async startTranscription(onPartial, onFinal, onError, languageCode = 'en-US', sampleRate = 16000) {
        if (!this.configured) {
            onError(new Error('AWS Transcribe not configured'));
            return null;
        }
        const audioStream = new stream_1.PassThrough();
        audioStream.on('error', (err) => {
            this.logger.warn('Audio stream error:', err.message);
        });
        let stopped = false;
        try {
            this.logger.log(`Starting transcription: lang=${languageCode}, rate=${sampleRate}`);
            const url = this.createPresignedUrl(languageCode, sampleRate);
            this.logger.log('Connecting to AWS Transcribe via WebSocket...');
            const ws = new WebSocket(url);
            ws.on('open', () => {
                this.logger.log('WebSocket connected to AWS Transcribe');
            });
            ws.on('message', (data) => {
                try {
                    const message = this.decodeEventStreamMessage(data);
                    if (!message)
                        return;
                    const headers = message.headers;
                    const messageType = headers[':message-type'];
                    const eventType = headers[':event-type'];
                    if (messageType === 'event') {
                        if (eventType === 'TranscriptEvent') {
                            const payload = JSON.parse(message.payload.toString('utf-8'));
                            const results = payload?.Transcript?.Results;
                            if (results && results.length > 0) {
                                for (const result of results) {
                                    if (result.Alternatives && result.Alternatives.length > 0) {
                                        const transcript = result.Alternatives[0].Transcript || '';
                                        if (transcript) {
                                            if (result.IsPartial) {
                                                onPartial(transcript);
                                            }
                                            else {
                                                onFinal(transcript);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    else if (messageType === 'exception') {
                        const payload = message.payload.toString('utf-8');
                        this.logger.error(`AWS Transcribe exception: ${eventType} - ${payload}`);
                        if (!stopped)
                            onError(new Error(`Transcribe error: ${eventType}`));
                    }
                }
                catch (err) {
                    this.logger.error('Error processing transcribe message:', err);
                }
            });
            ws.on('error', (err) => {
                this.logger.error('WebSocket error:', err.message);
                if (!stopped)
                    onError(err);
            });
            ws.on('close', (code, reason) => {
                this.logger.log(`WebSocket closed: code=${code}, reason=${reason}`);
            });
            audioStream.on('data', (chunk) => {
                if (stopped || ws.readyState !== WebSocket.OPEN)
                    return;
                try {
                    const eventMessage = this.encodeAudioEvent(chunk);
                    ws.send(eventMessage);
                }
                catch (err) {
                    this.logger.warn('Error sending audio chunk:', err);
                }
            });
            return {
                audioStream,
                stop: () => {
                    if (stopped)
                        return;
                    stopped = true;
                    this.logger.log('Stopping transcription session');
                    try {
                        if (ws.readyState === WebSocket.OPEN) {
                            const emptyEvent = this.encodeAudioEvent(Buffer.alloc(0));
                            ws.send(emptyEvent, () => {
                                setTimeout(() => ws.close(), 500);
                            });
                        }
                    }
                    catch (_) { }
                    audioStream.end();
                },
            };
        }
        catch (error) {
            this.logger.error('Failed to start transcription:', error?.message || error);
            onError(error);
            return null;
        }
    }
    createPresignedUrl(languageCode, sampleRate) {
        const host = `transcribestreaming.${this.region}.amazonaws.com:8443`;
        const path = '/stream-transcription-websocket';
        const service = 'transcribe';
        const now = new Date();
        const dateStamp = this.toDateStamp(now);
        const amzDate = this.toAmzDate(now);
        const credentialScope = `${dateStamp}/${this.region}/${service}/aws4_request`;
        const queryParams = [
            ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
            ['X-Amz-Credential', `${this.accessKeyId}/${credentialScope}`],
            ['X-Amz-Date', amzDate],
            ['X-Amz-Expires', '300'],
            ['X-Amz-SignedHeaders', 'host'],
            ['language-code', languageCode],
            ['media-encoding', 'pcm'],
            ['sample-rate', sampleRate.toString()],
        ].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        const canonicalQueryString = queryParams
            .map(([k, v]) => `${this.uriEncode(k)}=${this.uriEncode(v)}`)
            .join('&');
        const canonicalHeaders = `host:${host}\n`;
        const signedHeaders = 'host';
        const payloadHash = crypto.createHash('sha256').update('').digest('hex');
        const canonicalRequest = [
            'GET',
            path,
            canonicalQueryString,
            canonicalHeaders,
            signedHeaders,
            payloadHash,
        ].join('\n');
        this.logger.debug(`Canonical Request:\n${canonicalRequest}`);
        const stringToSign = [
            'AWS4-HMAC-SHA256',
            amzDate,
            credentialScope,
            crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
        ].join('\n');
        this.logger.debug(`String to Sign:\n${stringToSign}`);
        const signingKey = this.getSignatureKey(this.secretAccessKey, dateStamp, this.region, service);
        const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
        return `wss://${host}${path}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
    }
    uriEncode(value) {
        return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    }
    getSignatureKey(key, dateStamp, region, service) {
        const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
        const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
        const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
        const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
        return kSigning;
    }
    toDateStamp(date) {
        return date.toISOString().replace(/-|:|\.\d+/g, '').substring(0, 8);
    }
    toAmzDate(date) {
        return date.toISOString().replace(/-|:|\.\d+/g, '').substring(0, 15) + 'Z';
    }
    encodeAudioEvent(audioChunk) {
        const headers = {
            ':content-type': 'application/octet-stream',
            ':event-type': 'AudioEvent',
            ':message-type': 'event',
        };
        const headersBuffer = this.encodeHeaders(headers);
        const totalByteLength = 4 + 4 + 4 + headersBuffer.length + audioChunk.length + 4;
        const message = Buffer.alloc(totalByteLength);
        let offset = 0;
        message.writeUInt32BE(totalByteLength, offset);
        offset += 4;
        message.writeUInt32BE(headersBuffer.length, offset);
        offset += 4;
        const preludeCrc = this.crc32(message.subarray(0, 8));
        message.writeUInt32BE(preludeCrc, offset);
        offset += 4;
        headersBuffer.copy(message, offset);
        offset += headersBuffer.length;
        audioChunk.copy(message, offset);
        offset += audioChunk.length;
        const messageCrc = this.crc32(message.subarray(0, offset));
        message.writeUInt32BE(messageCrc, offset);
        return message;
    }
    decodeEventStreamMessage(data) {
        try {
            if (data.length < 16)
                return null;
            let offset = 0;
            const totalByteLength = data.readUInt32BE(offset);
            offset += 4;
            const headersLength = data.readUInt32BE(offset);
            offset += 4;
            offset += 4;
            const headersEnd = offset + headersLength;
            const headers = {};
            while (offset < headersEnd) {
                const nameLength = data.readUInt8(offset);
                offset += 1;
                const name = data.subarray(offset, offset + nameLength).toString('utf-8');
                offset += nameLength;
                const headerType = data.readUInt8(offset);
                offset += 1;
                if (headerType === 7) {
                    const valueLength = data.readUInt16BE(offset);
                    offset += 2;
                    const value = data.subarray(offset, offset + valueLength).toString('utf-8');
                    offset += valueLength;
                    headers[name] = value;
                }
                else {
                    break;
                }
            }
            const payloadLength = totalByteLength - 12 - headersLength - 4;
            const payload = data.subarray(12 + headersLength, 12 + headersLength + payloadLength);
            return { headers, payload };
        }
        catch (err) {
            this.logger.warn('Failed to decode event stream message:', err);
            return null;
        }
    }
    encodeHeaders(headers) {
        const parts = [];
        for (const [key, value] of Object.entries(headers)) {
            const keyBuf = Buffer.from(key, 'utf-8');
            const valBuf = Buffer.from(value, 'utf-8');
            const header = Buffer.alloc(1 + keyBuf.length + 1 + 2 + valBuf.length);
            let offset = 0;
            header.writeUInt8(keyBuf.length, offset);
            offset += 1;
            keyBuf.copy(header, offset);
            offset += keyBuf.length;
            header.writeUInt8(7, offset);
            offset += 1;
            header.writeUInt16BE(valBuf.length, offset);
            offset += 2;
            valBuf.copy(header, offset);
            parts.push(header);
        }
        return Buffer.concat(parts);
    }
    getCrc32Table() {
        if (this.crc32Table)
            return this.crc32Table;
        const table = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            table[n] = c;
        }
        this.crc32Table = table;
        return table;
    }
    crc32(buf) {
        const table = this.getCrc32Table();
        let crc = 0xffffffff;
        for (let i = 0; i < buf.length; i++) {
            crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }
};
export { SpeechService };
exports.SpeechService = SpeechService = SpeechService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SpeechService);
