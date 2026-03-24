import { Controller, Get, Post, Body, Patch, Param, Delete, Headers, Query } from '@nestjs/common';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

@Controller('notes')
export class NotesController {
    constructor(private readonly notesService: NotesService) { }

    @Post()
    create(@Body() createNoteDto: CreateNoteDto, @Headers('x-user-id') userId: string) {
        if (!userId) throw new Error('Unauthorized');
        return this.notesService.create(createNoteDto, userId);
    }

    @Get()
    findAll(@Headers('x-user-id') userId: string, @Query('limit') limit?: string) {
        const parsedLimit = limit ? parseInt(limit, 10) : 100;
        return this.notesService.findAll(userId, parsedLimit);
    }

    @Get('timeline')
    findTimeline(@Headers('x-user-id') userId: string) {
        return this.notesService.findTimeline(userId);
    }

    @Get('recall')
    getRecall(@Headers('x-user-id') userId: string) {
        return this.notesService.getRecall(userId);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Headers('x-user-id') userId: string) {
        return this.notesService.findOne(id, userId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateNoteDto: UpdateNoteDto, @Headers('x-user-id') userId: string) {
        return this.notesService.update(id, updateNoteDto, userId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Headers('x-user-id') userId: string) {
        return this.notesService.remove(id, userId);
    }

    @Post(':id/refine')
    refine(@Param('id') id: string, @Headers('x-user-id') userId: string) {
        return this.notesService.refine(id, userId);
    }

    @Get(':id/versions')
    getVersions(@Param('id') id: string, @Headers('x-user-id') userId: string) {
        return this.notesService.getVersions(id, userId);
    }

    @Post(':id/rollback/:versionId')
    rollback(@Param('id') id: string, @Param('versionId') versionId: string, @Headers('x-user-id') userId: string) {
        return this.notesService.rollback(id, versionId, userId);
    }
}
