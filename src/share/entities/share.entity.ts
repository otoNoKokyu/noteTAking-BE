import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('shares')
export class Share {
    @PrimaryColumn()
    token: string;

    @Column()
    noteId: string;

    @Column('text')
    snapshotContent: string;

    @Column({ type: 'timestamp', nullable: true })
    expiresAt: Date;

    @Column({ default: false })
    isRevoked: boolean;

    @CreateDateColumn()
    createdAt: Date;
}
