import { BaseEntity, Column, Entity, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from './Role';

@Entity('permissions')
export class Permission extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  resource!: string;

  @Column()
  action!: string;

  @Column({ unique: true })
  code!: string;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles!: Role[];
}
