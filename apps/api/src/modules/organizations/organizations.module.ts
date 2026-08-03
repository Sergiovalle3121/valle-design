import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialModule } from '../commercial/commercial.module';
import { Session, User } from '../identity/entities/identity.entity';
import {
  PlanCatalog,
  PlanEntitlement,
  Subscription,
} from '../commercial/entities/commercial.entities';
import { OrganizationsController } from './organizations.controller';
import {
  Invitation,
  Membership,
  Organization,
} from './entities/organization.entity';
import { OrganizationAccessService } from './organization-access.service';
import { OrganizationCommercialConfiguration } from './organization-commercial.configuration';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      Membership,
      Invitation,
      Session,
      User,
      PlanCatalog,
      PlanEntitlement,
      Subscription,
    ]),
    CommercialModule,
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationAccessService, OrganizationCommercialConfiguration],
  exports: [OrganizationAccessService],
})
export class OrganizationsModule {}
