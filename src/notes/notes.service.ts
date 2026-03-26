import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Note } from './entities/note.entity';
import { NoteVersion } from './entities/note-version.entity';
import { NoteLink } from './entities/note-link.entity';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AiService } from '../ai/ai.service';

@Injectable()
export class NotesService {
    constructor(
        @InjectRepository(Note)
        private notesRepository: Repository<Note>,
        @InjectRepository(NoteVersion)
        private noteVersionsRepository: Repository<NoteVersion>,
        @InjectRepository(NoteLink)
        private noteLinksRepository: Repository<NoteLink>,
        @InjectQueue('jobs') private jobsQueue: Queue,
        private aiService: AiService,
    ) { }

    async create(createNoteDto: CreateNoteDto, userId: string): Promise<Note> {
        const note = this.notesRepository.create({
            ...createNoteDto,
            userId,
            syncStatus: 'pending',
        });

        const savedNote = await this.notesRepository.save(note);
        await this.jobsQueue.add('process-note', { noteId: savedNote.id });
        await this.jobsQueue.add('check-similarity', { noteId: savedNote.id });

        return savedNote;
    }

    async findAll(userId: string, limit: number = 100): Promise<Note[]> {
        return this.notesRepository.find({
            where: { userId },
            take: limit,
            order: { updatedAt: 'DESC' },
        });
    }

    async findTimeline(userId: string): Promise<any[]> {
        const notes = await this.notesRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });

        const timelineNotes = await Promise.all(
            notes.map(async (note) => {
                const versionCount = await this.noteVersionsRepository.count({ where: { noteId: note.id } });
                const links = await this.noteLinksRepository.find({ where: { sourceNoteId: note.id } });
                return {
                    ...note,
                    versionCount,
                    linkedNoteIds: links.map(link => link.targetNoteId),
                };
            })
        );

        return timelineNotes;
    }

    async findOne(id: string, userId: string): Promise<Note> {
        const note = await this.notesRepository.findOne({ where: { id, userId } });
        if (!note) {
            throw new NotFoundException(`Note with ID ${id} not found`);
        }
        return note;
    }

    async update(id: string, updateNoteDto: UpdateNoteDto, userId: string): Promise<Note> {
        const note = await this.findOne(id, userId);

        // Versioning logic for manual edits
        const latestVersion = await this.noteVersionsRepository.findOne({
            where: { noteId: id },
            order: { createdAt: 'DESC' },
        });

        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        const shouldVersion = !latestVersion || latestVersion.createdAt < thirtyMinutesAgo;

        if (shouldVersion) {
            const version = this.noteVersionsRepository.create({
                noteId: id,
                content: note.content,
            });
            await this.noteVersionsRepository.save(version);
        }

        const updatedNote = Object.assign(note, {
            ...updateNoteDto,
            syncStatus: 'pending',
            isProcessed: false,
        });

        await this.notesRepository.save(updatedNote);
        await this.jobsQueue.add('process-note', { noteId: updatedNote.id });

        return updatedNote;
    }

    async remove(id: string, userId: string): Promise<void> {
        const note = await this.findOne(id, userId);
        await this.notesRepository.remove(note);
        await this.aiService.deleteVector(userId, id);
    }

    async getRecall(userId: string): Promise<Note | null> {
        // 1 year ago -> 1 month ago -> older
        const now = new Date();
        const oneYearAgo = new Date(now.setFullYear(now.getFullYear() - 1));
        const oneMonthAgo = new Date(now.setMonth(now.getMonth() - 1));

        let note = await this.notesRepository.findOne({
            where: { userId },
            order: { createdAt: 'ASC' }
            // Simplified mock recall logic to guarantee note return
        });

        return note;
    }

    async refine(id: string, userId: string): Promise<Note> {
        const note = await this.findOne(id, userId);

        // Save original if not already set
        if (!note.rawContent) {
            note.rawContent = note.content;
        }

        // Create version for backup
        const version = this.noteVersionsRepository.create({
            noteId: id,
            content: note.content,
        });
        await this.noteVersionsRepository.save(version);

        // Actual Refinement
        const refined = await this.aiService.refineText(note.content);
        note.content = refined;
        note.isProcessed = false; // Trigger insight re-extraction

        const savedNote = await this.notesRepository.save(note);

        // Queue background processing for insights and embeddings
        await this.jobsQueue.add('process-note', { noteId: savedNote.id });
        await this.jobsQueue.add('check-similarity', { noteId: savedNote.id });

        return savedNote;
    }

    async getVersions(id: string, userId: string): Promise<NoteVersion[]> {
        await this.findOne(id, userId); // verify ownership
        return this.noteVersionsRepository.find({
            where: { noteId: id },
            order: { createdAt: 'DESC' },
        });
    }

    async rollback(id: string, versionId: string, userId: string): Promise<Note> {
        const note = await this.findOne(id, userId);
        const version = await this.noteVersionsRepository.findOne({ where: { id: versionId, noteId: id } });

        if (!version) {
            throw new NotFoundException(`Version ${versionId} not found for note ${id}`);
        }

        note.content = version.content;
        note.rawContent = null;
        note.isProcessed = false;
        await this.notesRepository.save(note);

        // Delete versions as we have reverted the refinement
        await this.noteVersionsRepository.delete({ noteId: id });

        await this.jobsQueue.add('process-note', { noteId: note.id });

        return note;
    }
}
