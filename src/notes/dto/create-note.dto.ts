import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateNoteDto {
    @IsString()
    @IsNotEmpty()
    id: string; // The UUID comes from the client in offline-first sync

    @IsString()
    @IsNotEmpty()
    content: string;

    @IsString()
    @IsOptional()
    inputMethod?: string;
}
