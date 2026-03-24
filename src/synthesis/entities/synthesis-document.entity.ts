import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('synthesis_documents')
export class SynthesisDocument {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @Column()
    clusterTopic: string;

    @Column('text')
    summary: string;

    @Column('json', { nullable: true })
    recurringThemes: string[];

    @Column('json', { nullable: true })
    openQuestions: string[];

    @Column('json', { nullable: true })
    linkedNoteIds: string[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
