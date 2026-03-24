import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { AiService } from '../ai/ai.service';
import { Note } from '../notes/entities/note.entity';
import * as crypto from 'crypto';

@Injectable()
export class ChatService {
    constructor(
        @InjectRepository(ChatMessage)
        private chatRepository: Repository<ChatMessage>,
        @InjectRepository(Note)
        private notesRepository: Repository<Note>,
        private aiService: AiService,
    ) { }

    async processQuery(userId: string, query: string, expirationHours: number | null, explicitTopicId?: string): Promise<void> {
        const expiresAt = expirationHours ? new Date(Date.now() + expirationHours * 3600000) : null;

        let finalTopicId = explicitTopicId;
        let finalTopicTitle = "General Conversation";

        if (finalTopicId) {
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
                const topicAnalysis = await this.aiService.detectChatTopic(query, recentUserMsg.content);
                if (topicAnalysis.isNewTopic) {
                    finalTopicId = crypto.randomUUID();
                    finalTopicTitle = topicAnalysis.topicTitle;
                } else {
                    finalTopicId = recentUserMsg.topicId || crypto.randomUUID();
                    finalTopicTitle = recentUserMsg.topicTitle || topicAnalysis.topicTitle;
                }
            } else {
                const topicAnalysis = await this.aiService.detectChatTopic(query, null);
                finalTopicId = crypto.randomUUID();
                finalTopicTitle = topicAnalysis.topicTitle;
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
            const vector = await this.aiService.generateEmbeddings(query);

            if (vector && vector.length > 0) {
                // 2. Search Pinecone for similar notes
                const matches = await this.aiService.searchSimilar(userId, vector);
                const matchIds = matches.map(m => m.id);

                if (matchIds.length > 0) {
                    // 3. Fetch matched notes from DB (FILTER OUT ARCHIVED)
                    const matchedNotes = await this.notesRepository.find({
                        where: { id: In(matchIds), isArchived: false }
                    });

                    if (matchedNotes.length > 0) {
                        // 4. Build context
                        const context = matchedNotes.map(n => `[Note ID: ${n.id}] Title: ${n.title}\nContent: ${n.content}`).join('\n\n');

                        // 5. Generate chat response
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
                    }
                }
            }
        } catch (error) {
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
        const msg = await this.chatRepository.findOne({ where: { id, userId } });
        if (!msg) throw new NotFoundException('Message not found');
        await this.chatRepository.remove(msg);
    }
}
