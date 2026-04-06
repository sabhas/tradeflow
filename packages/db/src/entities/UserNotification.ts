import { BaseEntity, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './User';

@Entity('user_notifications')
export class UserNotification extends BaseEntity {
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
