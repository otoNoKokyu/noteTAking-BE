import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Note } from './note.entity';

@Entity('note_versions')
export class NoteVersion {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    noteId: string;

    @ManyToOne(() => Note, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'noteId' })
    note: Note;

    @Column('text')
    content: string;

    @CreateDateColumn()
    createdAt: Date;
}
