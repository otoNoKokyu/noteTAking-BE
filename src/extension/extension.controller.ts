import { Controller, Post, Body, Headers, InternalServerErrorException } from '@nestjs/common';
import { NotesService } from '../notes/notes.service';
import { randomUUID } from 'crypto';

@Controller('extension')
export class ExtensionController {
    constructor(private readonly notesService: NotesService) { }

    @Post('clip')
    async clipWebContent(
        @Headers('x-user-id') userId: string,
        @Body('url') url: string,
        @Body('title') title: string,
        @Body('content') content: string
    ) {
        if (!userId) throw new Error('Unauthorized');

        try {
            // Create a note with the web clipping
            const noteContent = `Source URL: ${url}\n\n${content}`;
            const savedNote = await this.notesService.create({
                id: randomUUID(),
                content: noteContent,
                inputMethod: 'extension',
            }, userId);

            return savedNote;
        } catch (e) {
            throw new InternalServerErrorException('Failed to clip content');
        }
    }
}
