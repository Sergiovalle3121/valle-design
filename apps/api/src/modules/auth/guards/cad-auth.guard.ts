import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REVIEW_LINK_SURFACE_KEY } from '../decorators/review-link-surface.decorator';
import {
  REVIEW_TOKEN_HEADER,
  ReviewLinkService,
} from '../../cad-documents/review-link.service';
import type { ReviewAccessContext } from '../../cad-documents/review-link.service';
import { parseCookieHeader } from '../../identity/identity.controller';
import {
  CSRF_COOKIE,
  IdentityService,
  SESSION_COOKIE,
} from '../../identity/identity.service';
import { MAX_TOKEN_LENGTH } from '../../identity/identity-security';
import { OrganizationAccessService } from '../../organizations/organization-access.service';

/**
 * Authenticates the first-party session and derives tenant, organization,
 * role and permissions from a current server-side membership. No tenant or
 * permission value supplied by the client is trusted.
 */
@Injectable()
export class CadAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identity: IdentityService,
    private readonly organizations: OrganizationAccessService,
    @Optional() private readonly reviewLinks?: ReviewLinkService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const reviewToken = request.headers[REVIEW_TOKEN_HEADER];
    const isReviewSurface = this.reflector.getAllAndOverride<boolean>(
      REVIEW_LINK_SURFACE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // A review URL is an explicit, document-scoped authentication context.
    // Browsers may also send an existing first-party cookie; on an endpoint
    // deliberately marked as a review surface the supplied review token must
    // win, otherwise signed-in users could never open shared links.
    if (isReviewSurface && reviewToken !== undefined && this.reviewLinks) {
      return this.activateReviewAccess(request, reviewToken);
    }

    const sessionCookie = parseCookieHeader(
      request.headers.cookie,
      SESSION_COOKIE,
    );
    const auth = await this.identity.authenticate(sessionCookie);
    if (!auth) {
      if (reviewToken !== undefined && this.reviewLinks) {
        return this.activateReviewAccess(request, reviewToken);
      }
      throw new UnauthorizedException('Falta una sesión válida.');
    }

    if (!isSafeMethod(request.method)) {
      this.assertCsrf(request, auth.session.csrfHash);
    }

    const access = await this.organizations.resolve(
      auth.user.id,
      auth.session.activeOrganizationId,
    );
    const user: AuthenticatedUser = {
      userId: auth.user.id,
      email: auth.user.email,
      role: access?.membership.role ?? '',
      tenant_id: access?.tenantId ?? null,
      organization_id: access?.organization.id ?? null,
      plant_id: null,
      permissions: access?.permissions ?? null,
      scopes: null,
    };
    (request as Request & { user: AuthenticatedUser }).user = user;
    return true;
  }

  private assertCsrf(request: Request, expectedHash: string): void {
    const header = request.header('x-csrf-token');
    const cookieValue = parseCookieHeader(request.headers.cookie, CSRF_COOKIE);
    const valid =
      !!header &&
      header.length <= MAX_TOKEN_LENGTH &&
      !!cookieValue &&
      this.identity.tokensMatch(header, cookieValue) &&
      this.identity.tokenMatchesHash(header, expectedHash);
    if (!valid) {
      throw new ForbiddenException({
        code: 'csrf_invalid',
        message: 'Token CSRF inválido.',
      });
    }
  }

  /**
   * Review tokens are redeemed on every request and receive a synthetic,
   * document-scoped read-only identity. PermissionsGuard limits the surface.
   */
  private async activateReviewAccess(
    request: Request,
    rawToken: string | string[],
  ): Promise<boolean> {
    const session = await this.reviewLinks!.redeem(
      Array.isArray(rawToken) ? rawToken[0] : rawToken,
    );
    const user: AuthenticatedUser = {
      userId: `review-link:${session.id}`,
      email: `review-link:${session.id}`,
      role: '',
      tenant_id: session.tenant_id,
      organization_id: session.organization_id,
      plant_id: session.plant_id,
      permissions: [],
      scopes: null,
    };
    const target = request as Request & {
      user: AuthenticatedUser;
      reviewAccess: ReviewAccessContext;
    };
    target.user = user;
    target.reviewAccess = this.reviewLinks!.toAccessContext(session);
    return true;
  }
}

function isSafeMethod(method: string): boolean {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}
