import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { Role } from './Role';

@Entity('permissions')
export class Permission {
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
