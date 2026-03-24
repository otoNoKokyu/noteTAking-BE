import { Controller, Get, Post, Body, Param, Delete, Headers } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) { }

    @Post()
    async createChat(
        @Headers('x-user-id') userId: string,
        @Body('query') query: string,
        @Body('expirationHours') expirationHours: number,
        @Body('explicitTopicId') explicitTopicId?: string
    ) {
        if (!userId) throw new Error('Unauthorized');
        return this.chatService.processQuery(userId, query, expirationHours, explicitTopicId);
    }

    @Get()
    async getHistory(@Headers('x-user-id') userId: string) {
        return this.chatService.getHistory(userId);
    }

    @Delete(':id')
    async deleteMessage(@Param('id') id: string, @Headers('x-user-id') userId: string) {
        return this.chatService.deleteMessage(id, userId);
    }
}
