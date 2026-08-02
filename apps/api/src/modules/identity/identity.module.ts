import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Credential, IdentityAuditEvent, OneTimeToken, Session, User } from './entities/identity.entity';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

@Global()
@Module({ imports: [TypeOrmModule.forFeature([User, Credential, Session, OneTimeToken, IdentityAuditEvent])], controllers: [IdentityController], providers: [IdentityService], exports: [IdentityService] })
export class IdentityModule {}
