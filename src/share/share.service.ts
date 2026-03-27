import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Share } from './entities/share.entity';
import { Note } from '../notes/entities/note.entity';
import { randomUUID } from 'crypto';

@Injectable()
export class ShareService {
    private readonly logger = new Logger(ShareService.name);

    constructor(
        @InjectRepository(Share) private shareRepository: Repository<Share>,
        @InjectRepository(Note) private noteRepository: Repository<Note>
    ) { }

    async createShare(userId: string, noteId: string, expiresInHours: number | null): Promise<Share> {
        this.logger.log(`Creating share for note ${noteId} by user ${userId}`);
        const note = await this.noteRepository.findOne({ where: { id: noteId, userId } });
        if (!note) {
            this.logger.warn(`Note ${noteId} not found for user ${userId} during share creation`);
            throw new NotFoundException('Note not found');
        }

        const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 3600000) : null;
        const share = this.shareRepository.create({
            token: randomUUID(),
            noteId: note.id,
            snapshotContent: note.content,
            expiresAt,
        });

        const savedShare = await this.shareRepository.save(share);
        this.logger.log(`Share created with token: ${savedShare.token}`);
        return savedShare;
    }

    async getShare(token: string): Promise<Share | null> {
        this.logger.log(`Retrieving share with token: ${token}`);
        const share = await this.shareRepository.findOne({ where: { token } });
        if (!share) {
            this.logger.warn(`Share with token ${token} not found`);
            return null;
        }
        if (share.isRevoked) {
            this.logger.warn(`Share with token ${token} is revoked`);
            return null;
        }
        if (share.expiresAt && share.expiresAt < new Date()) {
            this.logger.warn(`Share with token ${token} has expired`);
            return null;
        }

        this.logger.log(`Share retrieved for note ${share.noteId}`);
        return share;
    }
}
