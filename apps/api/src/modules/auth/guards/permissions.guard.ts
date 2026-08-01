import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DESIGN_CAD_ENTITLEMENT } from '@axos/contracts';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { expandCadPermissions } from '../cad-permission-map';
import { DesignAuditLog } from '../../audit-log/design-audit-log.service';
import { ENTITLEMENT_CLIENT } from '../../cad-documents/ports/platform-client.ports';
import type { EntitlementClient } from '../../cad-documents/ports/platform-client.ports';
import type { AuthenticatedUser } from '../../../common/types/jwt.types';

/**
 * Autorización del producto Design (adaptación del PermissionsGuard del
 * origen al espacio `cad:*` y al 403 contractual de design-api.v1.yaml):
 *
 * 1. Entitlement comercial: toda ruta con @RequirePermissions exige que el
 *    tenant tenga `design.cad` vigente (puerto ENTITLEMENT_CLIENT; en R1 lo
 *    satisface el adaptador por configuración — ver platform-client.adapter).
 *    Si falta → `403 entitlement_required` con `details.reason: not_entitled`.
 * 2. RBAC funcional: los permisos del claim se expanden con el mapeo de
 *    transición engineering:* → cad:* (@axos/contracts) y deben cubrir TODOS
 *    los requeridos. Si no → `403 entitlement_required` con
 *    `details.reason: permission_denied` y `requiredPermission`.
 * 3. Rol Admin pasa el RBAC (case-insensitive, como el origen). DIFERENCIA
 *    DELIBERADA: sin bypass por email de owner — Design no arrastra el rbac.ts
 *    de Enterprise.
 *
 * Las denegaciones se auditan en la bitácora propia (fail-soft: una bitácora
 * caída nunca convierte un 403 en un 500).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
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

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      'permissions',
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions?.length) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // 1) Entitlement comercial design.cad (fail-closed sin cliente).
    const entitled = this.entitlements
      ? await this.entitlements.hasEntitlement(DESIGN_CAD_ENTITLEMENT)
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

  /** Bitácora de la denegación; jamás rompe la respuesta 403 (fail-soft). */
  private async logDenial(
    user: AuthenticatedUser,
    action: 'ENTITLEMENT_DENIED' | 'PERMISSION_DENIED',
    requiredPermissions: string[],
  ): Promise<void> {
    if (!this.audit) return;
    try {
      await this.audit.record({
        actor: user.email,
        action,
        referenceType: 'ENDPOINT',
        referenceId: requiredPermissions.join(','),
        payload: { role: user.role, permissions: user.permissions },
      });
    } catch (err) {
      this.logger.warn(
        `Auditoría de denegación omitida: ${(err as Error)?.message}`,
      );
    }
  }
}
