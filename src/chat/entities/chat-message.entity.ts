import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('chat_messages')
export class ChatMessage {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @Column()
    role: string; // 'user' or 'assistant'

    @Column('text')
    content: string;

    @Column('json', { nullable: true })
    referencedNotes: any[];

    @Column({ type: 'timestamp', nullable: true })
    expiresAt: Date;

    @CreateDateColumn()
    createdAt: Date;

    @Column({ nullable: true })
    topicId: string;

    @Column({ nullable: true })
    topicTitle: string;
}
