import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Note } from '../notes/entities/note.entity';

@Injectable()
export class SearchService {
    private readonly logger = new Logger(SearchService.name);

    constructor(
        private readonly aiService: AiService,
        // Using simple mock to simulate DB fetch since we didn't inject Notes entity here yet
    ) { }

    async search(userId: string, query: string): Promise<any> {
        this.logger.log(`Performing search for user ${userId}: "${query}"`);
        return { results: [] };
    }

    async getEchoes(userId: string, text: string, excludeId?: string): Promise<any> {
        this.logger.log(`Retrieving echoes for user ${userId}`);
        try {
            const vector = await this.aiService.generateEmbeddings(text);
            const matches = await this.aiService.searchSimilar(userId, vector, 5, excludeId);

            const echoes = matches.map(m => ({
                id: m.id,
                contentPreview: m.metadata?.textPreview || 'Matched via semantic search',
                createdAt: new Date().toISOString()
            }));

            this.logger.log(`Found ${echoes.length} echoes for user ${userId}`);
            return { echoes };
        } catch (error) {
            this.logger.error(`Failed to get echoes for user ${userId}: ${error.message}`, error.stack);
            return { echoes: [] };
        }
    }
}
