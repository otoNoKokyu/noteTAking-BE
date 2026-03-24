import { Controller, Get, Post, Body, Headers, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
    constructor(private readonly searchService: SearchService) { }

    @Get()
    async search(@Headers('x-user-id') userId: string, @Query('q') q: string) {
        return this.searchService.search(userId, q);
    }

    @Post('echoes')
    async getEchoes(
        @Headers('x-user-id') userId: string,
        @Body('text') text: string,
        @Body('excludeId') excludeId?: string
    ) {
        return this.searchService.getEchoes(userId, text, excludeId);
    }
}
