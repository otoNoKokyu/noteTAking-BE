import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { AiService } from '../ai/ai.service';
import { Note } from '../notes/entities/note.entity';
import * as crypto from 'crypto';

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);

    constructor(
        @InjectRepository(ChatMessage)
        private chatRepository: Repository<ChatMessage>,
        @InjectRepository(Note)
        private notesRepository: Repository<Note>,
        private aiService: AiService,
    ) { }

    async processQuery(userId: string, query: string, expirationHours: number | null, explicitTopicId?: string): Promise<void> {
        this.logger.log(`Processing query for user ${userId}: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);
        const expiresAt = expirationHours ? new Date(Date.now() + expirationHours * 3600000) : null;

        let finalTopicId = explicitTopicId;
        let finalTopicTitle = "General Conversation";

        if (finalTopicId) {
            this.logger.log(`Using explicit topic ID: ${finalTopicId}`);
            const existingMsg = await this.chatRepository.findOne({ where: { topicId: finalTopicId, userId } });
            if (existingMsg && existingMsg.topicTitle) {
                finalTopicTitle = existingMsg.topicTitle;
            }
        } else {
            const recentUserMsg = await this.chatRepository.findOne({
                where: { userId, role: 'user' },
                order: { createdAt: 'DESC' }
            });

            if (recentUserMsg) {
                this.logger.log(`Analyzing topic continuation for user ${userId}`);
                const topicAnalysis = await this.aiService.detectChatTopic(query, recentUserMsg.content);
                if (topicAnalysis.isNewTopic) {
                    finalTopicId = crypto.randomUUID();
                    finalTopicTitle = topicAnalysis.topicTitle;
                    this.logger.log(`New topic detected: ${finalTopicTitle} (${finalTopicId})`);
                } else {
                    finalTopicId = recentUserMsg.topicId || crypto.randomUUID();
                    finalTopicTitle = recentUserMsg.topicTitle || topicAnalysis.topicTitle;
                    this.logger.log(`Continuing topic: ${finalTopicTitle} (${finalTopicId})`);
                }
            } else {
                this.logger.log(`No recent messages found, starting new topic for user ${userId}`);
                const topicAnalysis = await this.aiService.detectChatTopic(query, null);
                finalTopicId = crypto.randomUUID();
                finalTopicTitle = topicAnalysis.topicTitle;
                this.logger.log(`Started new topic: ${finalTopicTitle} (${finalTopicId})`);
            }
        }

        // Save user message
        const userMsg = this.chatRepository.create({
            userId,
            role: 'user',
            content: query,
            expiresAt,
            topicId: finalTopicId,
            topicTitle: finalTopicTitle
        });
        await this.chatRepository.save(userMsg);

        // Call AI Module here (stubbed for now)
        let assistantContent = "I could not find an answer in your notes.";
        let referencedNoteIds: any[] = [];

        try {
            // 1. Generate query embedding
            this.logger.log(`Generating embedding for query...`);
            const vector = await this.aiService.generateEmbeddings(query);

            if (vector && vector.length > 0) {
                // 2. Search Pinecone for similar notes
                this.logger.log(`Searching for similar notes for user ${userId}...`);
                const matches = await this.aiService.searchSimilar(userId, vector);
                const matchIds = matches.map(m => m.id);

                if (matchIds.length > 0) {
                    this.logger.log(`Found ${matchIds.length} potentially relevant notes.`);
                    // 3. Fetch matched notes from DB (FILTER OUT ARCHIVED)
                    const matchedNotes = await this.notesRepository.find({
                        where: { id: In(matchIds), isArchived: false }
                    });

                    if (matchedNotes.length > 0) {
                        this.logger.log(`Building context from ${matchedNotes.length} notes.`);
                        // 4. Build context
                        const context = matchedNotes.map(n => `[Note ID: ${n.id}] Title: ${n.title}\nContent: ${n.content}`).join('\n\n');

                        // 5. Generate chat response
                        this.logger.log(`Requesting AI response for user ${userId}...`);
                        const aiResponse = await this.aiService.chat(query, context);

                        // aiResponse is now a parsed object from AiService
                        assistantContent = aiResponse.answer || "I could not find an answer in your notes.";

                        // Only include referencedNoteIds that actually exist in matchedNotes
                        const validIds = new Set(matchedNotes.map(n => n.id));
                        const rawIds = (aiResponse.referencedNoteIds || []).filter(id => validIds.has(id));
                        referencedNoteIds = rawIds.map(id => {
                            const m = matchedNotes.find(n => n.id === id);
                            return { id, title: m.title };
                        });
                        this.logger.log(`AI response received. Referenced ${referencedNoteIds.length} notes.`);
                    } else {
                        this.logger.log('No non-archived notes found in database matches.');
                    }
                } else {
                    this.logger.log('No similar notes found in Pinecone.');
                }
            } else {
                this.logger.warn('Failed to generate embedding for chat query.');
            }
        } catch (error) {
            this.logger.error(`Error during query synthesis: ${error.message}`, error.stack);
            assistantContent = "An error occurred while synthesizing an answer.";
        }

        // Save assistant message
        const aiMsg = this.chatRepository.create({
            userId,
            role: 'assistant',
            content: assistantContent,
            referencedNotes: referencedNoteIds,
            expiresAt,
            topicId: finalTopicId,
            topicTitle: finalTopicTitle
        });
        await this.chatRepository.save(aiMsg);
    }

    async getHistory(userId: string): Promise<ChatMessage[]> {
        // Delete expired logic could be a cron job, or we can filter them out here.
        return this.chatRepository.createQueryBuilder('chat')
            .where('chat.userId = :userId', { userId })
            .andWhere('(chat.expiresAt IS NULL OR chat.expiresAt > :now)', { now: new Date() })
            .orderBy('chat.createdAt', 'ASC')
            .getMany();
    }

    async deleteMessage(id: string, userId: string): Promise<void> {
        this.logger.log(`Deleting chat message ${id} for user ${userId}`);
        const msg = await this.chatRepository.findOne({ where: { id, userId } });
        if (!msg) {
            this.logger.warn(`Message ${id} not found for user ${userId}`);
            throw new NotFoundException('Message not found');
        }
        await this.chatRepository.remove(msg);
        this.logger.log(`Message ${id} deleted successfully`);
    }
}
