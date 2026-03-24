import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { AiModule } from '../ai/ai.module';
import { Note } from '../notes/entities/note.entity';

@Module({
    imports: [TypeOrmModule.forFeature([ChatMessage, Note]), AiModule],
    controllers: [ChatController],
    providers: [ChatService]
})
export class ChatModule { }
