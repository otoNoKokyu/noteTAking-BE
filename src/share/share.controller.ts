import { Controller, Get, Post, Body, Param, Headers, NotFoundException } from '@nestjs/common';
import { ShareService } from './share.service';

@Controller('shares')
export class ShareController {
    constructor(private readonly shareService: ShareService) { }

    @Post()
    async createShare(
        @Headers('x-user-id') userId: string,
        @Body('noteId') noteId: string,
        @Body('expiresInHours') expiresInHours: number
    ) {
        if (!userId) throw new Error('Unauthorized');
        return this.shareService.createShare(userId, noteId, expiresInHours);
    }

    @Get(':token')
    async getSharedNote(@Param('token') token: string) {
        const share = await this.shareService.getShare(token);
        if (!share) throw new NotFoundException('Note not found or link expired.');
        return share;
    }
}
