import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() name!: string;
  @Index({ unique: true }) @Column() slug!: string;
  @Column() ownerUserId!: string;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('organization_memberships')
@Index(['organizationId', 'userId'], { unique: true })
export class Membership {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index() @Column() organizationId!: string;
  @Index() @Column() userId!: string;
  @Column({ default: 'member' }) role!: string;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('organization_invitations')
export class Invitation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index() @Column() organizationId!: string;
  @Column() email!: string;
  @Column() role!: string;
  @Index({ unique: true }) @Column() tokenHash!: string;
  @Column() expiresAt!: Date;
  @Column({ nullable: true }) consumedAt!: Date | null;
  @Column() invitedByUserId!: string;
  @CreateDateColumn() createdAt!: Date;
}
