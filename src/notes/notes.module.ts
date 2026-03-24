import { Module } from '@nestjs/common';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from './entities/note.entity';
import { NoteVersion } from './entities/note-version.entity';
import { NoteLink } from './entities/note-link.entity';
import { BullModule } from '@nestjs/bullmq';

@Module({
    imports: [
        TypeOrmModule.forFeature([Note, NoteVersion, NoteLink]),
        BullModule.registerQueue({
            name: 'jobs',
        }),
    ],
    controllers: [NotesController],
    providers: [NotesService],
    exports: [NotesService]
})
export class NotesModule { }
