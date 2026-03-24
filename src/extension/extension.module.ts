import { Module } from '@nestjs/common';
import { ExtensionController } from './extension.controller';
import { NotesModule } from '../notes/notes.module';

@Module({
    imports: [NotesModule],
    controllers: [ExtensionController]
})
export class ExtensionModule { }
