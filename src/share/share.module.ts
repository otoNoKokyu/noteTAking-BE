import { Module } from '@nestjs/common';
import { ShareService } from './share.service';
import { ShareController } from './share.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Share } from './entities/share.entity';
import { Note } from '../notes/entities/note.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Share, Note])],
    controllers: [ShareController],
    providers: [ShareService]
})
export class ShareModule { }
