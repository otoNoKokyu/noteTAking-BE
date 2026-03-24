import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { NotesModule } from './notes/notes.module';
import { SyncModule } from './sync/sync.module';
import { SearchModule } from './search/search.module';
import { ChatModule } from './chat/chat.module';
import { ShareModule } from './share/share.module';
import { JobsModule } from './jobs/jobs.module';
import { ExtensionModule } from './extension/extension.module';
import { SpeechModule } from './speech/speech.module';
import { AiModule } from './ai/ai.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
            type: 'mysql',
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            username: process.env.DB_USERNAME || 'root',
            password: process.env.DB_PASSWORD || 'password',
            database: process.env.DB_NAME || 'note_taking_db',
            autoLoadEntities: true,
            synchronize: true, // Use only in development
        }),
        BullModule.forRoot({
            connection: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
            },
        }),
        NotesModule,
        SyncModule,
        SearchModule,
        ChatModule,
        ExtensionModule,
        JobsModule,
        ShareModule,
        SpeechModule,
        AiModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule { }
