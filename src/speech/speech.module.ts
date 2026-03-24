import { Module } from '@nestjs/common';
import { SpeechGateway } from './speech.gateway';

@Module({
    providers: [SpeechGateway],
})
export class SpeechModule { }
