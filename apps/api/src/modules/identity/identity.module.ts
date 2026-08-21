import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CommercialModule } from '../commercial/commercial.module';
import {
  Credential,
  IdentityAuditEvent,
  IdentityRateLimit,
  OneTimeToken,
  Session,
  User,
} from './entities/identity.entity';
import { ApiRateLimitService } from './api-rate-limit.service';
import { IdentityController } from './identity.controller';
import {
  BoundedMemoryIdentityRateLimitStore,
  IDENTITY_RATE_LIMIT_STORE,
} from './identity-rate-limit.store';
import { IdentityService } from './identity.service';
import { PostgresIdentityRateLimitStore } from './postgres-identity-rate-limit.store';

@Global()
@Module({
  imports: [
    CommercialModule,
    TypeOrmModule.forFeature([
      User,
      Credential,
      Session,
      OneTimeToken,
      IdentityAuditEvent,
      IdentityRateLimit,
    ]),
  ],
  controllers: [IdentityController],
  providers: [
    IdentityService,
    ApiRateLimitService,
    {
      provide: IDENTITY_RATE_LIMIT_STORE,
      inject: [DataSource],
      useFactory: (database: DataSource) =>
        database.options.type === 'postgres'
          ? new PostgresIdentityRateLimitStore(database)
          : new BoundedMemoryIdentityRateLimitStore(),
    },
  ],
  exports: [IdentityService, IDENTITY_RATE_LIMIT_STORE, ApiRateLimitService],
})
export class IdentityModule {}
