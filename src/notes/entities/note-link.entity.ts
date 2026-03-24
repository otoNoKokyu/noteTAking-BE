import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Note } from './note.entity';

@Entity('note_links')
export class NoteLink {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    sourceNoteId: string;

    @ManyToOne(() => Note, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sourceNoteId' })
    sourceNote: Note;

    @Column()
    targetNoteId: string;

    @ManyToOne(() => Note, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'targetNoteId' })
    targetNote: Note;

    @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
    strengthScore: number;
}
