import { BaseEntity, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DeliveryNote } from './DeliveryNote';
import { DeliveryRun } from './DeliveryRun';

@Entity('delivery_run_items')
export class DeliveryRunItem extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'delivery_run_id' })
  deliveryRunId!: string;

  @ManyToOne(() => DeliveryRun, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'delivery_run_id' })
  deliveryRun!: DeliveryRun;

  @Column({ name: 'delivery_note_id' })
  deliveryNoteId!: string;

  @ManyToOne(() => DeliveryNote, (n) => n.runItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'delivery_note_id' })
  deliveryNote!: DeliveryNote;
}
