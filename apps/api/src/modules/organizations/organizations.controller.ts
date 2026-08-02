import { BadRequestException, Body, Controller, ForbiddenException, NotFoundException, Post, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { DataSource, Repository } from 'typeorm';
import { IdentityService, SESSION_COOKIE } from '../identity/identity.service';
import { cookie } from '../identity/identity.controller';
import { Invitation, Membership, Organization } from './entities/organization.entity';
class OrganizationDto { @IsString() @MinLength(2) name!: string; @IsString() @MinLength(2) slug!: string; }
class InvitationDto { @IsEmail() email!: string; @IsIn(['admin', 'member', 'viewer']) role!: string; }
@Controller('v1/organizations')
export class OrganizationsController {
  constructor(private readonly data: DataSource, private readonly identity: IdentityService, @InjectRepository(Membership) private readonly memberships: Repository<Membership>, @InjectRepository(Invitation) private readonly invitations: Repository<Invitation>) {}
  private async actor(req: Request) { const auth = await this.identity.authenticate(cookie(req, SESSION_COOKIE)); if (!auth) throw new ForbiddenException(); const csrf = req.header('x-csrf-token'); if (!csrf || csrf !== cookie(req, 'valle_csrf') || this.identity.hashToken(csrf) !== auth.session.csrfHash) throw new BadRequestException({ code: 'csrf_invalid' }); return auth; }
  @Post() async create(@Body() body: OrganizationDto, @Req() req: Request) { const { user } = await this.actor(req); return this.data.transaction(async m => { const organization = await m.save(Organization, m.create(Organization, { name: body.name, slug: body.slug.toLowerCase(), ownerUserId: user.id })); await m.save(Membership, m.create(Membership, { organizationId: organization.id, userId: user.id, role: 'owner' })); return organization; }); }
  @Post(':organizationId/invitations') async invite(@Body() body: InvitationDto, @Req() req: Request) { const { user } = await this.actor(req); const organizationId = String(req.params.organizationId); const membership = await this.memberships.findOneBy({ organizationId, userId: user.id }); if (!membership || !['owner', 'admin'].includes(membership.role)) throw new NotFoundException(); const raw = this.identity.newToken(); await this.invitations.save(this.invitations.create({ organizationId, email: this.identity.normalizeEmail(body.email), role: body.role, tokenHash: this.identity.hashToken(raw), expiresAt: new Date(Date.now() + 7 * 86400_000), invitedByUserId: user.id })); return { accepted: true, ...(process.env.NODE_ENV === 'test' ? { token: raw } : {}) }; }
}
