import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from './Branch';
import { User } from './User';
import { JournalLine } from './JournalLine';

@Entity('journal_entries')
export class JournalEntry {
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

  @Column({ name: 'branch_id', nullable: true })
  branchId?: string;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch;

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
}
