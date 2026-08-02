import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DESIGN_CAD_ENTITLEMENT } from '@valle-design/contracts';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REVIEW_LINK_SURFACE_KEY } from '../decorators/review-link-surface.decorator';
import { expandCadPermissions } from '../cad-permission-map';
import { DesignAuditLog } from '../../audit-log/design-audit-log.service';
import { ENTITLEMENT_CLIENT } from '../../cad-documents/ports/platform-client.ports';
import type { EntitlementClient } from '../../cad-documents/ports/platform-client.ports';
import type { ReviewAccessContext } from '../../cad-documents/review-link.service';
import {
  TenantContextService,
  type TenantContext,
} from '../../../common/tenant/tenant-context.service';
import type { AuthenticatedUser } from '../../../common/types/jwt.types';

/**
 * Autorización del producto Design (adaptación del PermissionsGuard del
 * origen al espacio `cad:*` y al 403 contractual de design-api.v1.yaml):
 *
 * 0. Contexto de REVIEW LINK (Fase 5): un request autenticado por token de
 *    review solo alcanza la superficie @ReviewLinkSurface() (contexto
 *    read-only limitado al documento de la sesión). CUALQUIER otra ruta —
 *    mutación o lectura — responde `403 review_read_only`, lo intente quien
 *    lo intente: el read-only lo impone el backend. Sin verificación de
 *    entitlement aquí: el entitlement se verificó al CREAR la sesión (con el
 *    JWT del autor) y la vida del link está acotada por expiración/revocación
 *    — el invitado no tiene bearer que reenviar a Platform (mismo patrón que
 *    una URL prefirmada).
 * 1. Entitlement comercial: toda ruta con @RequirePermissions exige que el
 *    tenant tenga `design.cad` vigente (puerto ENTITLEMENT_CLIENT; desde
 *    Fase 5 lo satisface PlatformEntitlementClient — HTTP real contra
 *    platform-api con caché breve por tenant y fail-closed). El guard corre
 *    ANTES del TenantInterceptor, así que el bearer y el tenant viajan
 *    explícitos en el contexto de la consulta.
 *    Si falta → `403 entitlement_required` con `details.reason: not_entitled`.
 * 2. RBAC funcional: los permisos del claim se expanden con el mapeo de
 *    transición engineering:* → cad:* (@valle-design/contracts) y deben cubrir TODOS
 *    los requeridos. Si no → `403 entitlement_required` con
 *    `details.reason: permission_denied` y `requiredPermission`.
 * 3. Rol Admin pasa el RBAC (case-insensitive, como el origen). DIFERENCIA
 *    DELIBERADA: sin bypass por email de owner — Design no arrastra el rbac.ts
 *    de Enterprise.
 *
 * Las denegaciones se auditan en la bitácora propia CON EL TENANT DEL ACTOR
 * estampado (el guard corre antes del TenantInterceptor, así que el contexto
 * ALS se abre aquí a mano — sin esto los asientos de denegación quedaban con
 * tenant NULL). Fail-soft: una bitácora caída nunca convierte un 403 en 500.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tenantCtx: TenantContextService,
    @Optional()
    @Inject(ENTITLEMENT_CLIENT)
    private readonly entitlements?: EntitlementClient,
    @Optional() private readonly audit?: DesignAuditLog,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<
      Request & {
        user?: AuthenticatedUser;
        reviewAccess?: ReviewAccessContext;
      }
    >();

    // 0) Contexto de review link: whitelist estricta, todo lo demás 403.
    const isReviewSurface = this.reflector.getAllAndOverride<boolean>(
      REVIEW_LINK_SURFACE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (request.reviewAccess) {
      if (isReviewSurface) return true;
      await this.logReviewDenial(request);
      throw new ForbiddenException({
        code: 'review_read_only',
        message:
          'El contexto de review link es de solo lectura y está limitado al documento compartido.',
        details: {
          sessionId: request.reviewAccess.sessionId,
          documentId: request.reviewAccess.documentId,
        },
      });
    }
    if (isReviewSurface) {
      // La superficie del review link exige el token del link: un JWT — con
      // o sin entitlement — jamás la abre (401 antes de pipes/handler).
      throw new UnauthorizedException({
        code: 'review_token_invalid',
        message:
          'Esta superficie requiere un review link válido (X-Review-Token).',
      });
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      'permissions',
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions?.length) return true;

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // 1) Entitlement comercial design.cad (fail-closed sin cliente). El
    //    bearer del request se reenvía a Platform tal cual (contrato
    //    platform-api.v1.yaml); el guard corre antes del interceptor, así que
    //    tenant y token viajan explícitos.
    const entitled = this.entitlements
      ? await this.entitlements.hasEntitlement(DESIGN_CAD_ENTITLEMENT, {
          tenantId: user.tenant_id,
          bearerToken: extractBearerToken(request),
        })
      : false;
    if (!entitled) {
      await this.logDenial(user, 'ENTITLEMENT_DENIED', requiredPermissions);
      throw new ForbiddenException({
        code: 'entitlement_required',
        message: `El tenant no tiene el entitlement ${DESIGN_CAD_ENTITLEMENT} vigente.`,
        details: {
          entitlement: DESIGN_CAD_ENTITLEMENT,
          reason: 'not_entitled',
        },
      });
    }

    // 2) Admin pasa el RBAC funcional (el entitlement ya quedó verificado).
    if ((user.role || '').toLowerCase() === 'admin') return true;

    // 3) RBAC cad:* con el mapeo de transición engineering:* → cad:*.
    const granted = expandCadPermissions(user.permissions);
    const missing = requiredPermissions.find(
      (permission) => !granted.has(permission),
    );
    if (missing) {
      await this.logDenial(user, 'PERMISSION_DENIED', requiredPermissions);
      throw new ForbiddenException({
        code: 'entitlement_required',
        message: `Faltan permisos requeridos: ${requiredPermissions.join(', ')}`,
        details: {
          entitlement: DESIGN_CAD_ENTITLEMENT,
          reason: 'permission_denied',
          requiredPermission: missing,
        },
      });
    }
    return true;
  }

  /**
   * Bitácora de la denegación con el tenant del actor estampado (contexto
   * ALS abierto a mano — el guard corre antes del TenantInterceptor); jamás
   * rompe la respuesta 403 (fail-soft).
   */
  private async logDenial(
    user: AuthenticatedUser,
    action: 'ENTITLEMENT_DENIED' | 'PERMISSION_DENIED',
    requiredPermissions: string[],
  ): Promise<void> {
    if (!this.audit) return;
    const context: TenantContext = {
      tenant_id: user.tenant_id,
      organization_id: user.organization_id,
      plant_id: user.plant_id,
      user_email: user.email,
      role: user.role,
      permissions: user.permissions,
      scopes: user.scopes,
    };
    try {
      await this.tenantCtx.run(context, () =>
        this.audit!.record({
          actor: user.email,
          action,
          referenceType: 'ENDPOINT',
          referenceId: requiredPermissions.join(','),
          payload: { role: user.role, permissions: user.permissions },
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Auditoría de denegación omitida: ${(err as Error)?.message}`,
      );
    }
  }

  /** Denegación de un contexto de review fuera de su superficie (403). */
  private async logReviewDenial(
    request: Request & { reviewAccess?: ReviewAccessContext },
  ): Promise<void> {
    const access = request.reviewAccess;
    if (!this.audit || !access) return;
    const context: TenantContext = {
      tenant_id: access.tenantId,
      organization_id: null,
      plant_id: null,
      user_email: `review-link:${access.sessionId}`,
      role: null,
      permissions: null,
      scopes: null,
    };
    try {
      await this.tenantCtx.run(context, () =>
        this.audit!.record({
          action: 'REVIEW_ACCESS_DENIED',
          referenceType: 'ENDPOINT',
          referenceId: `${request.method} ${request.path}`,
          payload: {
            sessionId: access.sessionId,
            documentId: access.documentId,
          },
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Auditoría de denegación de review omitida: ${(err as Error)?.message}`,
      );
    }
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers?.authorization;
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
