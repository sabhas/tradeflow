import { BaseEntity, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DeliveryNote } from './DeliveryNote';

@Entity('proof_of_delivery')
export class ProofOfDelivery extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'delivery_note_id' })
  deliveryNoteId!: string;

  @ManyToOne(() => DeliveryNote, (n) => n.proofOfDeliveries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'delivery_note_id' })
  deliveryNote!: DeliveryNote;

  @Column()
  type!: string;

  @Column({ type: 'text' })
  reference!: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
