import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Membership, Organization } from './entities/organization.entity';
import { permissionsForOrganizationRole } from './organization-permissions';

@Injectable()
export class OrganizationAccessService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
  ) {}

  async resolve(userId: string, organizationId: string | null | undefined) {
    if (!organizationId) return null;
    const membership = await this.memberships.findOneBy({
      organizationId,
      userId,
    });
    if (!membership) return null;
    const organization = await this.organizations.findOneBy({
      id: organizationId,
    });
    if (!organization) return null;
    return {
      organization,
      membership,
      tenantId: organization.id,
      permissions: permissionsForOrganizationRole(membership.role),
    };
  }
}
