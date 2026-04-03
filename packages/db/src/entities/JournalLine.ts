import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Account } from './Account';
import { JournalEntry } from './JournalEntry';

@Entity('journal_lines')
export class JournalLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'journal_entry_id' })
  journalEntryId!: string;

  @ManyToOne(() => JournalEntry, (e) => e.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry!: JournalEntry;

  @Column({ name: 'account_id' })
  accountId!: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  debit!: string;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  credit!: string;
}
