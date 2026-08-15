import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.types';

/**
 * Contexto comercial de la petición, derivado SÓLO de lo que CadAuthGuard
 * pobló server-side. Vive aparte porque a partir de la ola 2 hay dos
 * controllers bajo `/v1/commercial` (estado/intents y compra) y la regla de
 * quién puede qué no puede existir en dos copias: dos copias es cómo una de
 * ellas se queda sin la comprobación de tenant.
 */

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export interface CommercialRequestContext {
  user: AuthenticatedUser;
  organizationId: string;
}

/** Miembro autenticado de la organización activa (cualquier rol). */
export function requireMember(
  request: AuthenticatedRequest,
): CommercialRequestContext {
  if (!request.user) {
    throw new UnauthorizedException('Falta una sesión válida.');
  }
  const organizationId = request.user.organization_id;
  if (
    !organizationId ||
    request.user.tenant_id !== organizationId ||
    !request.user.role
  ) {
    throw new ForbiddenException({
      code: 'organization_required',
      message: 'Se requiere una organización activa con membresía vigente.',
    });
  }
  return { user: request.user, organizationId };
}

/** Owner o admin: los únicos roles que deciden (o auditan) un upgrade. */
export function requireDecider(
  request: AuthenticatedRequest,
): CommercialRequestContext {
  const context = requireMember(request);
  if (!['owner', 'admin'].includes(context.user.role)) {
    throw new ForbiddenException({
      code: 'owner_or_admin_required',
      message: 'Sólo owner o admin pueden decidir un upgrade.',
    });
  }
  return context;
}

/**
 * Owner. La baja termina el contrato comercial de la organización entera; un
 * admin gestiona el día a día, pero cerrar la cuenta es del dueño.
 */
export function requireOwner(
  request: AuthenticatedRequest,
): CommercialRequestContext {
  const context = requireMember(request);
  if (context.user.role !== 'owner') {
    throw new ForbiddenException({
      code: 'owner_required',
      message: 'Sólo el owner puede cancelar la suscripción.',
    });
  }
  return context;
}
