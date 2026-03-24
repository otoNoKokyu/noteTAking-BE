import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotesService } from './notes.service';
import { Note } from './entities/note.entity';
import { NoteVersion } from './entities/note-version.entity';
import { NoteLink } from './entities/note-link.entity';
import { AiService } from '../ai/ai.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('NotesService', () => {
    let service: NotesService;
    let aiService: AiService;
    let notesRepo: any;
    let noteVersionsRepo: any;
    let jobsQueue: any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NotesService,
                {
                    provide: getRepositoryToken(Note),
                    useValue: {
                        findOne: jest.fn(),
                        create: jest.fn(),
                        save: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(NoteVersion),
                    useValue: {
                        create: jest.fn(),
                        save: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(NoteLink),
                    useValue: {
                        find: jest.fn(),
                    },
                },
                {
                    provide: AiService,
                    useValue: {
                        refineText: jest.fn(),
                    },
                },
                {
                    provide: getQueueToken('jobs'),
                    useValue: {
                        add: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<NotesService>(NotesService);
        aiService = module.get<AiService>(AiService);
        notesRepo = module.get(getRepositoryToken(Note));
        noteVersionsRepo = module.get(getRepositoryToken(NoteVersion));
        jobsQueue = module.get(getQueueToken('jobs'));
    });

    it('refine should update content and save version', async () => {
        const noteId = '123';
        const userId = 'user1';
        const originalNote = { id: noteId, userId, content: 'raw content', title: 'test' };
        const refinedContent = 'refined content';

        notesRepo.findOne.mockResolvedValue(originalNote);
        aiService.refineText = jest.fn().mockResolvedValue(refinedContent);
        notesRepo.save.mockImplementation((n) => Promise.resolve(n));
        noteVersionsRepo.create.mockReturnValue({});
        noteVersionsRepo.save.mockResolvedValue({});

        const result = await service.refine(noteId, userId);

        expect(notesRepo.findOne).toHaveBeenCalledWith({ where: { id: noteId, userId } });
        expect(aiService.refineText).toHaveBeenCalledWith('raw content');
        expect(noteVersionsRepo.create).toHaveBeenCalledWith({ noteId, content: 'raw content' });
        expect(notesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ content: refinedContent }));
        expect(jobsQueue.add).toHaveBeenCalledWith('process-note', { noteId });
        expect(result.content).toBe(refinedContent);
        expect(result.rawContent).toBe('raw content');
    });
});
