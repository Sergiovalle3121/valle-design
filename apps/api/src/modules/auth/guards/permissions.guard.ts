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
import {
  DESIGN_CAD_ENTITLEMENT,
  survivesEntitlementLapse,
} from '@valle-design/contracts';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REVIEW_LINK_SURFACE_KEY } from '../decorators/review-link-surface.decorator';
import { expandCadPermissions } from '../cad-permission-map';
import { DesignAuditLog } from '../../audit-log/design-audit-log.service';
import {
  ENTITLEMENT_SERVICE,
  type EntitlementService,
  type LapsedEntitlement,
} from '../../commercial/ports/commercial.ports';
import type { ReviewAccessContext } from '../../cad-documents/review-link.service';
import {
  TenantContextService,
  type TenantContext,
} from '../../../common/tenant/tenant-context.service';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.types';

/**
 * Applies the local `design.cad` subscription and server-derived CAD RBAC.
 * Review links remain document-scoped and read-only. Denials are audited in
 * the actor tenant without allowing an audit outage to change the response.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tenantCtx: TenantContextService,
    @Inject(ENTITLEMENT_SERVICE)
    private readonly entitlements: EntitlementService,
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
      // A normal first-party session never opens the review-token surface.
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
      // 401, no 403: sin usuario autenticado el problema es de AUTENTICACIÓN.
      // Un 403 aquí le decía al cliente «te conozco y no puedes», cuando la
      // verdad es «no sé quién eres» — y confundía a los interceptores que
      // renuevan sesión ante un 401.
      throw new UnauthorizedException('User not authenticated');
    }

    // The local lookup fails closed for missing tenant/org and expired trials.
    const entitled = await this.entitlements.hasEntitlement(
      DESIGN_CAD_ENTITLEMENT,
      {
        tenantId: user.tenant_id,
        organizationId: user.organization_id,
      },
    );
    if (!entitled) {
      // LA REGLA DE ORO: los datos del usuario JAMÁS quedan rehenes.
      //
      // Hasta esta campaña el vencimiento cerraba TODO, incluido abrir y
      // exportar. Para un producto que sale con tres meses gratis y sin
      // tarjeta eso es letal: el día 91 el arquitecto descubre que sus planos
      // están dentro de un programa que ya no le deja entrar. Ahora el
      // vencimiento degrada a SOLO LECTURA — entra, ve, exporta DXF, imprime
      // — y sólo la ESCRITURA queda detrás del cobro.
      //
      // Sólo aplica a un entitlement que EXISTIÓ y venció (`lapsedEntitlement`
      // lo prueba contra la suscripción real y el reloj). Quien nunca contrató
      // nada sigue viendo el 403 completo de siempre: esto no abre el producto
      // a un desconocido, le devuelve su trabajo a un cliente.
      const lapsed = await this.resolveLapse(user);
      const readable =
        !!lapsed && requiredPermissions.every(survivesEntitlementLapse);
      if (!readable) {
        await this.logDenial(user, 'ENTITLEMENT_DENIED', requiredPermissions);
        throw new ForbiddenException({
          code: 'entitlement_required',
          message: lapsed
            ? `Tu acceso de edición terminó. Puedes seguir abriendo y exportando tus documentos; para volver a editar hace falta el entitlement ${DESIGN_CAD_ENTITLEMENT} vigente.`
            : `El tenant no tiene el entitlement ${DESIGN_CAD_ENTITLEMENT} vigente.`,
          details: {
            entitlement: DESIGN_CAD_ENTITLEMENT,
            reason: lapsed ? 'read_only_after_lapse' : 'not_entitled',
            ...(lapsed
              ? {
                  lapsedAt: lapsed.lapsedAt.toISOString(),
                  lapseReason: lapsed.reason,
                }
              : {}),
          },
        });
      }
      // La petición sigue, pero MARCADA: el resto del backend puede leer
      // `request.entitlementLapse` para no ofrecer una acción de escritura
      // que el guard va a rechazar dos capas más abajo.
      (
        request as Request & { entitlementLapse?: LapsedEntitlement }
      ).entitlementLapse = lapsed!;
      await this.logDenial(user, 'ENTITLEMENT_READ_ONLY', requiredPermissions);
    }

    // 2) Admin pasa el RBAC funcional (el entitlement ya quedó verificado).
    if ((user.role || '').toLowerCase() === 'admin') return true;

    // 3) RBAC cad:* derivado de la membresía activa.
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
   * El vencimiento probado, o `null`.
   *
   * Fallo cerrado por triplicado: un adaptador que no implemente el método
   * (los dobles de prueba, cualquier adaptador futuro) responde `null` y el
   * guard vuelve al 403 completo; una excepción del almacén también responde
   * `null` en vez de propagar. Un error de infraestructura no puede terminar
   * CONCEDIENDO acceso — ni siquiera de lectura.
   */
  private async resolveLapse(
    user: AuthenticatedUser,
  ): Promise<LapsedEntitlement | null> {
    if (!this.entitlements.lapsedEntitlement) return null;
    try {
      return await this.entitlements.lapsedEntitlement(DESIGN_CAD_ENTITLEMENT, {
        tenantId: user.tenant_id,
        organizationId: user.organization_id,
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo resolver el vencimiento del entitlement: ${(err as Error)?.message}`,
      );
      return null;
    }
  }

  /**
   * Bitácora de la denegación con el tenant del actor estampado (contexto
   * ALS abierto a mano — el guard corre antes del TenantInterceptor); jamás
   * rompe la respuesta 403 (fail-soft).
   */
  private async logDenial(
    user: AuthenticatedUser,
    action:
      'ENTITLEMENT_DENIED' | 'ENTITLEMENT_READ_ONLY' | 'PERMISSION_DENIED',
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
