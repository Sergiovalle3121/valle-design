import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('subscription_plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index({ unique: true }) @Column() code!: string;
  @Column() name!: string;
  @Column({ type: 'simple-json' }) entitlements!: Record<string, unknown>;
  @Column({ default: true }) active!: boolean;
}

@Entity('subscription_trials')
export class Trial {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index() @Column() organizationId!: string;
  @Column() planId!: string;
  @Column() startsAt!: Date;
  @Column() endsAt!: Date;
  @Column({ nullable: true }) cancelledAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
}
