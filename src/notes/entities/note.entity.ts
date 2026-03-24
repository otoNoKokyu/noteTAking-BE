import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('notes')
export class Note {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @Column({ default: '' })
    title: string;

    @Column('text')
    content: string;

    @Column('text', { nullable: true })
    rawContent: string;

    @Column({ default: 'durable' })
    type: string;

    @Column({ nullable: true })
    inputMethod: string;

    @Column({ nullable: true })
    topic: string;

    @Column('json', { nullable: true })
    tags: string[];

    @Column('json', { nullable: true })
    insights: { todos?: string[], recommendations?: string[] };

    @Column({ nullable: true })
    timeOfDayBucket: string;

    @Column({ default: 'pending' })
    syncStatus: string;

    @Column({ default: false })
    isProcessed: boolean;

    @Column({ default: false })
    isArchived: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    lastRecalledAt: Date;
}
