import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User';
import { JournalLine } from './JournalLine';

@Entity('journal_entries')
export class JournalEntry extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'entry_date', type: 'date' })
  entryDate!: string;

  @Column({ nullable: true })
  reference?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ default: 'posted' })
  status!: string;

  @Column({ name: 'source_type', nullable: true })
  sourceType?: string;

  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId?: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @OneToMany(() => JournalLine, (l) => l.journalEntry)
  lines!: JournalLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt?: Date;
}
