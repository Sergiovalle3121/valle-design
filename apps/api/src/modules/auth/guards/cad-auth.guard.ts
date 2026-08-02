import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  REVIEW_TOKEN_HEADER,
  ReviewLinkService,
} from '../../cad-documents/review-link.service';
import type { ReviewAccessContext } from '../../cad-documents/review-link.service';
import type { AuthenticatedUser } from '../../../common/types/jwt.types';
import { IdentityService, SESSION_COOKIE } from '../../identity/identity.service';

/**
 * Autenticación server-side de Design (adaptación del JwtAuthGuard+JwtStrategy
 * del origen, sin passport): valida el Bearer JWT emitido por PLATFORM con el
 * secreto compartido vía entorno (JWT_SECRET/SESSION_SECRET — consumo por
 * contrato, no import de código) y puebla `req.user` con la identidad del
 * token. El TenantInterceptor la vierte después en TenantContextService.
 *
 * DIFERENCIA DELIBERADA con el origen: Design NO tiene registro de usuarios
 * propio — la identidad ES el token (Platform revoca acortando expiración o
 * rotando el secreto). Los endpoints @Public() (health) pasan sin token.
 *
 * REVIEW LINKS (Fase 5): sin Bearer, un request puede autenticarse con el
 * header `X-Review-Token` (token de review link server-owned). El guard lo
 * canjea en CADA request (hash + expiración + revocación → revocar mata el
 * token de inmediato) y cuelga del request una identidad SINTÉTICA de solo
 * lectura (`review-link:<sessionId>`, sin permisos cad:*) + el
 * `reviewAccess` que PermissionsGuard usa para imponer el read-only:
 * cualquier ruta fuera de la superficie @ReviewLinkSurface() → 403.
 * Un Bearer presente SIEMPRE gana (y si es inválido, es 401 — jamás se cae
 * al token de review como segundo intento).
 */
@Injectable()
export class CadAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identity: IdentityService,
    @Optional() private readonly reviewLinks?: ReviewLinkService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const cookieHeader = request.headers.cookie || '';
    const rawCookie = cookieHeader.split(';').map(v => v.trim()).find(v => v.startsWith(`${SESSION_COOKIE}=`));
    const sessionCookie = rawCookie ? decodeURIComponent(rawCookie.slice(SESSION_COOKIE.length + 1)) : undefined;
    const auth = await this.identity.authenticate(sessionCookie);
    if (!auth) {
      const reviewToken = request.headers?.[REVIEW_TOKEN_HEADER];
      if (reviewToken !== undefined && this.reviewLinks) {
        return this.activateReviewAccess(request, reviewToken);
      }
      throw new UnauthorizedException('Falta una sesión válida.');
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) {
      const csrfCookie = cookieHeader.split(';').map(v => v.trim()).find(v => v.startsWith('valle_csrf='));
      const csrf = csrfCookie ? decodeURIComponent(csrfCookie.slice('valle_csrf='.length)) : '';
      if (!csrf || request.header('x-csrf-token') !== csrf || this.identity.hashToken(csrf) !== auth.session.csrfHash) {
        throw new ForbiddenException({ code: 'csrf_invalid', message: 'Token CSRF inválido.' });
      }
    }
    const user: AuthenticatedUser = {
      userId: auth.user.id, email: auth.user.email, role: '', tenant_id: null,
      organization_id: null, plant_id: null, permissions: null, scopes: null,
    };
    (request as Request & { user: AuthenticatedUser }).user = user;
    return true;
  }

  /**
   * Canje del review link: valida el token (401 contractual si no) y puebla
   * la identidad sintética del invitado. El tenant sale de la FILA de la
   * sesión (nunca del cliente); TenantInterceptor lo vierte al ALS y el
   * scoping por tenant de TypeORM aplica igual que con un JWT.
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
