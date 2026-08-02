import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsController } from './organizations.controller';
import { Invitation, Membership, Organization } from './entities/organization.entity';
@Module({ imports: [TypeOrmModule.forFeature([Organization, Membership, Invitation])], controllers: [OrganizationsController] })
export class OrganizationsModule {}
