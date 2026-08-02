import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan, Trial } from './entities/subscription.entity';
@Module({ imports: [TypeOrmModule.forFeature([Plan, Trial])], exports: [TypeOrmModule] })
export class SubscriptionsModule {}
