import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Share } from './entities/share.entity';
import { Note } from '../notes/entities/note.entity';
import { randomUUID } from 'crypto';

@Injectable()
export class ShareService {
    constructor(
        @InjectRepository(Share) private shareRepository: Repository<Share>,
        @InjectRepository(Note) private noteRepository: Repository<Note>
    ) { }

    async createShare(userId: string, noteId: string, expiresInHours: number | null): Promise<Share> {
        const note = await this.noteRepository.findOne({ where: { id: noteId, userId } });
        if (!note) throw new NotFoundException('Note not found');

        const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 3600000) : null;
        const share = this.shareRepository.create({
            token: randomUUID(),
            noteId: note.id,
            snapshotContent: note.content,
            expiresAt,
        });

        return this.shareRepository.save(share);
    }

    async getShare(token: string): Promise<Share | null> {
        const share = await this.shareRepository.findOne({ where: { token } });
        if (!share) return null;
        if (share.isRevoked) return null;
        if (share.expiresAt && share.expiresAt < new Date()) return null;

        return share;
    }
}
