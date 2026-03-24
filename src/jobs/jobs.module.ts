import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NoteProcessingProcessor } from './processors/note-processing.processor';
import { Note } from '../notes/entities/note.entity';
import { NoteLink } from '../notes/entities/note-link.entity';
import { SynthesisDocument } from '../synthesis/entities/synthesis-document.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Note, NoteLink, SynthesisDocument]),
        BullModule.registerQueue({
            name: 'jobs',
        }),
    ],
    providers: [NoteProcessingProcessor],
})
export class JobsModule { }
