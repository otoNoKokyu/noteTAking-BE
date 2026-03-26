import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private pinecone: Pinecone;
    private genAI: GoogleGenerativeAI;
    private pineconeIndex: any;

    constructor(private configService: ConfigService) {
        const pcApiKey = this.configService.get<string>('PINECONE_API_KEY');
        const geminiApiKey = this.configService.get<string>('GEMINI_API_KEY');

        if (pcApiKey) {
            this.pinecone = new Pinecone({ apiKey: pcApiKey });
            const indexName = this.configService.get<string>('PINECONE_INDEX') || 'note-embeddings';
            this.logger.log(`Initializing Pinecone index: ${indexName}`);
            this.pineconeIndex = this.pinecone.index(indexName);
        } else {
            this.logger.warn('PINECONE_API_KEY missing. Pinecone features will fail.');
        }

        if (geminiApiKey) {
            this.genAI = new GoogleGenerativeAI(geminiApiKey);
        } else {
            this.logger.warn('GEMINI_API_KEY missing. Gemini features will fail.');
        }
    }

    async generateEmbeddings(text: string): Promise<number[]> {
        try {
            const model = this.genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
            const result = await model.embedContent(text);
            const vector = result.embedding.values.slice(0, 1024);
            return vector;
        } catch (error) {
            this.logger.error('Embedding generation failed', error);
            return [];
        }
    }

    async upsertVector(userId: string, noteId: string, text: string) {
        const vector = await this.generateEmbeddings(text);
        if (!vector || vector.length === 0) {
            this.logger.warn(`Skipping upsert for note ${noteId}: Empty vector`);
            return;
        }

        this.logger.log(`Upserting vector for note ${noteId} to namespace ${userId}. Dimension: ${vector.length}`);

        try {
            await this.pineconeIndex.namespace(userId).upsert({
                records: [{
                    id: noteId,
                    values: vector,
                    metadata: { textPreview: text.substring(0, 200) }
                }]
            });
        } catch (error) {
            this.logger.error(`Pinecone upsert failed for note ${noteId}: ${error.message}`, error.stack);
            throw error;
        }
    }

    async searchSimilar(userId: string, vector: number[], topK: number = 5, excludeId?: string): Promise<any[]> {
        const queryResp = await this.pineconeIndex.namespace(userId).query({
            vector,
            topK,
            includeMetadata: true
        });

        let matches = queryResp.matches || [];
        if (excludeId) {
            matches = matches.filter(m => m.id !== excludeId);
        }
        return matches;
    }

    async deleteVector(userId: string, noteId: string) {
        try {
            this.logger.log(`Deleting vector for note ${noteId} from namespace ${userId}`);
            await this.pineconeIndex.namespace(userId).deleteOne(noteId);
        } catch (error) {
            this.logger.error(`Pinecone deletion failed for note ${noteId}: ${error.message}`, error.stack);
        }
    }

    async refineText(text: string): Promise<string> {
        try {
            const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const prompt = `You are a precision editor. Take the following raw, unstructured brain-dump or voice transcription and rewrite it as a clean, structured, and professional version. 
            
Rules:
- Preserve every idea — do not remove any information. 
- Use clear, continuous prose.
- Avoid excessive markdown headers (###) unless strictly necessary for separating distinct topics. 
- Output only the refined text, nothing else.

Note:
${text}`;
            const result = await model.generateContent(prompt);
            return result.response.text().trim();
        } catch (error) {
            this.logger.error(`Refinement failed: ${error.message}`, error.stack);
            throw error;
        }
    }

    async extractInsights(text: string): Promise<any> {
        const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `You are a silent cognitive extraction engine for a minimalist note-taking system. Analyze the note content below and return only a JSON object in this exact structure — no markdown, no code fences, no explanation.

{
  "title": "Concise contextual title (max 60 chars)",
  "topic": "1-2 word high-level category",
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "A concise 1-2 sentence summary of the note",
  "insights": {
    "todos": ["Verb-first action item"],
    "dates": ["Standardized date or deadline"],
    "recommendations": ["Core suggestion from text"]
  }
}

Rules:
- Trivial Detection: If input has fewer than 3 meaningful words, return {"trivial": true} only.
- Todos must begin with a calm action verb (e.g., "Review", "Draft", "Email"). Strip all emotional filler.
- Extract todos, dates, and recommendations if they are mentioned or strongly implied. If none, return [].
- Topic must be broad and structural (e.g., "Finance", "Engineering"). Use tags for granular terms.
- Return ONLY valid JSON. 

Note content to analyze:
"""
${text}
"""`;
        const result = await model.generateContent(prompt);
        const jsonMatch = result.response.text().match(/\{.*\}/s);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                this.logger.error('Failed to parse Gemini insight JSON.');
            }
        }
        return { topic: 'General', tags: [] };
    }

    async chat(query: string, context: string): Promise<any> {
        const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `You are a personal knowledge assistant. You only answer using the notes provided below — never use outside knowledge. If the answer is not in the notes, say so explicitly.
        
Return a JSON object with this exact structure, no markdown, no code fences:
{
  "answer": "Your detailed answer",
  "referencedNoteIds": ["id1", "id2"]
}

User Question: ${query}

Notes Context:
"""
${context}
"""`;
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{.*\}/s);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                this.logger.error('Failed to parse Gemini chat JSON.');
            }
        }
        return { answer: text, referencedNoteIds: [] };
    }

    async detectChatTopic(query: string, previousContext: string | null): Promise<{ isNewTopic: boolean, topicTitle: string }> {
        const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `You are a conversational topic analyzer. The user is asking a new question in a chat. 
Determine if this new question is a continuation of the previous conversation or if it starts a completely new, unrelated topic.

Previous Conversation Context:
"""
${previousContext || 'No previous context.'}
"""

New Question:
"""
${query}
"""

Rules:
1. Return a JSON object ONLY, with exactly two fields: "isNewTopic" (boolean) and "topicTitle" (string).
2. If it's a new topic, "isNewTopic" should be true, and "topicTitle" should be a 2-4 word title for this new topic.
3. If it continues the previous conversation, "isNewTopic" should be false, and "topicTitle" should still be a 2-4 word title representing the ongoing topic.
4. Do not include markdown formatting or code fences in your output, just the raw JSON.`;

        try {
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const jsonMatch = text.match(/\{.*\}/s);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            this.logger.error('Failed to parse detectChatTopic JSON.', error);
        }

        // Fallback
        return { isNewTopic: true, topicTitle: "New Conversation" };
    }

    async summarizeCluster(topic: string, notes: string[]): Promise<any> {
        const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const joined = notes.join('\n\n---\n\n');
        const prompt = `You are an analytical assistant. Below are a series of notes written by one person on a related topic. Generate:
1) A 3–5 sentence summary
2) A list of recurring themes
3) A list of open questions or unresolved ideas.
Be concise. Use only what is in the notes — do not add external information. Return a JSON object with this exact structure, no markdown:

{
  "summary": "The 3-5 sentence summary",
  "themes": ["theme 1", "theme 2"],
  "openQuestions": ["question 1", "question 2"]
}

Notes:
"""
${joined}
"""`;
        const result = await model.generateContent(prompt);
        const jsonMatch = result.response.text().match(/\{.*\}/s);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) { }
        }
        return { summary: "Failed to generate summary.", recurringThemes: [], openQuestions: [] };
    }
}
