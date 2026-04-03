import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './User';

@Entity('user_notifications')
export class UserNotification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ length: 64 })
  type!: string;

  @Column({ length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  body?: string;

  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
