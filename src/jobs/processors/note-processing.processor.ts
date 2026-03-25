import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Note } from '../../notes/entities/note.entity';
import { AiService } from '../../ai/ai.service';

@Processor('jobs')
export class NoteProcessingProcessor extends WorkerHost {
    private readonly logger = new Logger(NoteProcessingProcessor.name);

    constructor(
        @InjectRepository(Note)
        private readonly notesRepo: Repository<Note>,
        private readonly aiService: AiService,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing job ${job.id} of type ${job.name}`);

        if (job.name === 'process-note') {
            const { noteId } = job.data;
            const note = await this.notesRepo.findOne({ where: { id: noteId } });
            if (!note) return;

            try {
                this.logger.log(`Extracting insights for note ${noteId}...`);
                const insightsData = await this.aiService.extractInsights(note.content);

                let fallbackTitle = 'Untitled Note';
                if (note.content) {
                    const cleanContext = note.content.trim();
                    if (cleanContext.length > 0) {
                        fallbackTitle = cleanContext.length > 40 ? cleanContext.substring(0, 40) + '...' : cleanContext;
                    }
                }

                note.title = insightsData.title || note.title || fallbackTitle;
                note.topic = insightsData.topic || 'General';
                note.tags = insightsData.tags || [];
                note.insights = {
                    todos: insightsData.insights?.todos || [],
                    recommendations: insightsData.insights?.recommendations || []
                };


                this.logger.log(`Insights extracted for note ${noteId}: ${note}`);

                // 2. Determine timeOfDayBucket
                const hour = new Date().getHours();
                if (hour < 12) note.timeOfDayBucket = 'morning';
                else if (hour < 18) note.timeOfDayBucket = 'afternoon';
                else note.timeOfDayBucket = 'evening';

                note.isProcessed = true;
                await this.notesRepo.save(note);
                this.logger.log(`Note ${noteId} updated in DB.`);

                // 3. Upsert to Pinecone
                this.logger.log(`Upserting vector for note ${noteId} to Pinecone...`);
                await this.aiService.upsertVector(note.userId, note.id, note.content);
                this.logger.log(`Vector upserted for note ${noteId}.`);

                this.logger.log(`Finished processing note ${note.id}`);
            } catch (error) {
                this.logger.error(`Failed to process note ${note.id}:`, error);
            }
        } else if (job.name === 'check-similarity') {
            // Stub check-similarity
            this.logger.log('Stub: Check similarity for note ' + job.data.noteId);
        }
    }
}
