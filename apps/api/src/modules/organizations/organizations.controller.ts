import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import { DataSource, In, Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/database/unique-violation';
import { normalizeRequiredName } from '../../common/validation/normalized-name';
import { IdentityService, SESSION_COOKIE } from '../identity/identity.service';
import { Session, User } from '../identity/entities/identity.entity';
import { cookie } from '../identity/identity.controller';
import {
  PlanCatalog,
  PlanEntitlement,
  Subscription,
} from '../commercial/entities/commercial.entities';
import {
  EMAIL_SERVICE,
  type EmailService,
} from '../commercial/ports/commercial.ports';
import {
  Invitation,
  Membership,
  Organization,
  type OrganizationRole,
} from './entities/organization.entity';
import { OrganizationAccessService } from './organization-access.service';
import { OrganizationCommercialConfiguration } from './organization-commercial.configuration';
import {
  STANDALONE_CAD_ENTITLEMENT,
  STANDALONE_TRIAL_PLAN_CODE,
} from '../commercial/commercial-catalog.bootstrap';

class OrganizationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}

class InvitationDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(['admin', 'member', 'viewer'])
  role!: Exclude<OrganizationRole, 'owner'>;
}

class InvitationAcceptanceDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;
}

class ActiveOrganizationDto {
  @IsUUID()
  organizationId!: string;
}

@Controller('v1/organizations')
export class OrganizationsController {
  constructor(
    private readonly data: DataSource,
    private readonly identity: IdentityService,
    private readonly access: OrganizationAccessService,
    private readonly commercialConfiguration: OrganizationCommercialConfiguration,
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    @InjectRepository(Invitation)
    private readonly invitations: Repository<Invitation>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  private async actor(req: Request) {
    const auth = await this.identity.authenticate(cookie(req, SESSION_COOKIE));
    if (!auth) throw new ForbiddenException();
    return auth;
  }

  @Get()
  async list(@Req() req: Request) {
    const auth = await this.actor(req);
    const memberships = await this.memberships.findBy({ userId: auth.user.id });
    const organizations = memberships.length
      ? await this.organizations.findBy({
          id: In(memberships.map((membership) => membership.organizationId)),
        })
      : [];
    const byId = new Map(
      organizations.map((organization) => [organization.id, organization]),
    );
    return {
      items: memberships.flatMap((membership) => {
        const organization = byId.get(membership.organizationId);
        return organization
          ? [
              {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
                role: membership.role,
                active: auth.session.activeOrganizationId === organization.id,
              },
            ]
          : [];
      }),
    };
  }

  @Post()
  async create(@Body() body: OrganizationDto, @Req() req: Request) {
    const auth = await this.actor(req);
    const organizationName = normalizeRequiredName(body.name, {
      resource: 'organización',
      minLength: 2,
      maxLength: 160,
    });
    const duplicate = await this.organizations.findOneBy({
      slug: body.slug.toLowerCase(),
    });
    if (duplicate) throw new BadRequestException('El slug ya está en uso.');

    try {
      return await this.data.transaction(async (manager) => {
        if (this.data.options.type === 'postgres') {
          await manager
            .getRepository(User)
            .createQueryBuilder('trial_owner')
            .setLock('pessimistic_write')
            .where('trial_owner.id = :userId', { userId: auth.user.id })
            .getOneOrFail();
        }
        const [trialPlan, trialEntitlement] = await Promise.all([
          manager.findOneBy(PlanCatalog, {
            code: STANDALONE_TRIAL_PLAN_CODE,
          }),
          manager.findOneBy(PlanEntitlement, {
            planCode: STANDALONE_TRIAL_PLAN_CODE,
            entitlementCode: STANDALONE_CAD_ENTITLEMENT,
          }),
        ]);
        if (!trialPlan?.active || !trialEntitlement) {
          throw new ServiceUnavailableException({
            code: 'trial_catalog_unavailable',
            message: 'El trial de Valle Design no está disponible.',
          });
        }
        const existingTrial = await manager
          .getRepository(Organization)
          .createQueryBuilder('owned_organization')
          .innerJoin(
            Subscription,
            'trial_subscription',
            'trial_subscription.organizationId = owned_organization.id AND ' +
              'trial_subscription.planCode = :trialPlanCode',
            { trialPlanCode: STANDALONE_TRIAL_PLAN_CODE },
          )
          .where('owned_organization.ownerUserId = :ownerUserId', {
            ownerUserId: auth.user.id,
          })
          .getOne();
        if (existingTrial) {
          throw new ConflictException({
            code: 'trial_already_granted',
            message: 'Cada propietario puede recibir un solo trial.',
          });
        }

        const organization = await manager.save(
          Organization,
          manager.create(Organization, {
            name: organizationName,
            slug: body.slug.toLowerCase(),
            ownerUserId: auth.user.id,
          }),
        );
        await manager.save(
          Membership,
          manager.create(Membership, {
            organizationId: organization.id,
            userId: auth.user.id,
            role: 'owner',
          }),
        );
        const trialEndsAt = new Date(
          Date.now() + this.commercialConfiguration.trialDays * 86_400_000,
        );
        await manager.save(
          Subscription,
          manager.create(Subscription, {
            organizationId: organization.id,
            tenantId: organization.id,
            planCode: STANDALONE_TRIAL_PLAN_CODE,
            status: 'trialing',
            trialEndsAt,
          }),
        );
        await manager.update(Session, auth.session.id, {
          activeOrganizationId: organization.id,
        });
        return {
          ...organization,
          tenantId: organization.id,
          subscription: {
            planCode: STANDALONE_TRIAL_PLAN_CODE,
            status: 'trialing',
            trialEndsAt,
          },
        };
      });
    } catch (error) {
      if (
        isUniqueViolation(error) &&
        (await this.organizations.findOneBy({ slug: body.slug.toLowerCase() }))
      ) {
        throw new BadRequestException('El slug ya está en uso.');
      }
      throw error;
    }
  }

  @Post('active')
  async activate(@Body() body: ActiveOrganizationDto, @Req() req: Request) {
    const auth = await this.actor(req);
    const access = await this.access.resolve(auth.user.id, body.organizationId);
    if (!access) throw new NotFoundException();
    await this.data.getRepository(Session).update(auth.session.id, {
      activeOrganizationId: access.organization.id,
    });
    return {
      organization: {
        id: access.organization.id,
        name: access.organization.name,
        slug: access.organization.slug,
      },
      tenantId: access.tenantId,
      role: access.membership.role,
      permissions: access.permissions,
    };
  }

  @Get(':organizationId/memberships')
  async listMemberships(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Req() req: Request,
  ) {
    const auth = await this.actor(req);
    const access = await this.access.resolve(auth.user.id, organizationId);
    if (!access) throw new NotFoundException();

    const memberships = await this.memberships.find({
      where: { organizationId },
      order: { createdAt: 'ASC' },
      take: 200,
    });
    const users = memberships.length
      ? await this.users.findBy({
          id: In(memberships.map((membership) => membership.userId)),
        })
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));

    return {
      items: memberships.flatMap((membership) => {
        const user = usersById.get(membership.userId);
        return user
          ? [
              {
                id: membership.id,
                userId: user.id,
                email: user.email,
                displayName: user.displayName,
                role: membership.role,
                currentUser: user.id === auth.user.id,
                createdAt: membership.createdAt,
              },
            ]
          : [];
      }),
    };
  }

  @Post(':organizationId/invitations')
  async invite(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Body() body: InvitationDto,
    @Req() req: Request,
  ) {
    const auth = await this.actor(req);
    const access = await this.access.resolve(auth.user.id, organizationId);
    if (!access || !['owner', 'admin'].includes(access.membership.role)) {
      throw new NotFoundException();
    }

    const raw = this.identity.newToken();
    const invitation = await this.data.transaction(async (manager) => {
      const saved = await manager.save(
        Invitation,
        manager.create(Invitation, {
          organizationId,
          email: this.identity.normalizeEmail(body.email),
          role: body.role,
          tokenHash: this.identity.hashToken(raw),
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
          invitedByUserId: auth.user.id,
        }),
      );
      await this.email.enqueue(
        {
          organizationId,
          tenantId: organizationId,
          to: saved.email,
          template: 'organization.invitation',
          payload: {
            invitationId: saved.id,
            token: raw,
            organizationName: access.organization.name,
          },
          idempotencyKey: `organization-invitation:${saved.id}`,
        },
        { native: manager },
      );
      return saved;
    });
    return {
      accepted: true,
      invitationId: invitation.id,
    };
  }

  @Post('invitations/accept')
  async accept(@Body() body: InvitationAcceptanceDto, @Req() req: Request) {
    const auth = await this.actor(req);
    const tokenHash = this.identity.hashToken(body.token);
    return this.data.transaction(async (manager) => {
      const invitation = await manager.findOne(Invitation, {
        where: { tokenHash },
      });
      if (
        !invitation ||
        invitation.consumedAt ||
        invitation.expiresAt <= new Date() ||
        invitation.email !== this.identity.normalizeEmail(auth.user.email)
      ) {
        throw new BadRequestException('Invitación inválida o expirada.');
      }
      const consumedAt = new Date();
      const result = await manager
        .createQueryBuilder()
        .update(Invitation)
        .set({ consumedAt })
        .where('id = :id AND consumedAt IS NULL', { id: invitation.id })
        .execute();
      if (!result.affected) {
        throw new BadRequestException('La invitación ya fue utilizada.');
      }
      const membershipRepository = manager.getRepository(Membership);
      await membershipRepository
        .createQueryBuilder()
        .insert()
        .values({
          organizationId: invitation.organizationId,
          userId: auth.user.id,
          role: invitation.role,
        })
        .orIgnore()
        .execute();
      const membership = await membershipRepository.findOneByOrFail({
        organizationId: invitation.organizationId,
        userId: auth.user.id,
      });
      if (!auth.session.activeOrganizationId) {
        await manager.update(Session, auth.session.id, {
          activeOrganizationId: invitation.organizationId,
        });
      }
      return {
        accepted: true,
        organizationId: invitation.organizationId,
        role: membership.role,
      };
    });
  }
}
