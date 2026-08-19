import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import {
  Invitation,
  Membership,
} from '../organizations/entities/organization.entity';
import { Subscription } from './entities/commercial.entities';

/**
 * LÍMITE DE ASIENTOS como entitlement de la API.
 *
 * El checkout ya cobraba la cantidad correcta de asientos, pero nada impedía
 * meter después el triple de miembros: el plan Despacho se contrataba para
 * tres y servía para treinta. Cerrarlo sólo en la interfaz —escondiendo el
 * botón de invitar— no es un límite; es una sugerencia que cualquiera salta
 * con una petición HTTP. Por eso vive aquí y lo consulta el servidor.
 *
 * Dos decisiones gobiernan el cálculo:
 *
 * 1. Las INVITACIONES pendientes ocupan asiento. Si no lo hicieran, un
 *    despacho de tres asientos podría mandar veinte invitaciones y quedarse
 *    con veinte miembros: cada aceptación por separado vería sitio libre en el
 *    instante en que se comprueba. Una invitación viva es un asiento
 *    comprometido, igual que una reserva en un restaurante.
 *
 * 2. Se comprueba DOS veces: al invitar y al ACEPTAR. La primera es cortesía
 *    —dice el problema a quien puede resolverlo, cuando puede resolverlo—; la
 *    segunda es el límite de verdad, porque entre invitar y aceptar pueden
 *    pasar siete días y una bajada de plan.
 *
 * Lo que este servicio NO hace: quitar el acceso a nadie. Una organización que
 * quede por encima de su límite (bajada de plan, backfill de la migración)
 * conserva a todos sus miembros y sencillamente no puede añadir más. Expulsar
 * a alguien que ya trabajaba sería cobrarle al cliente el precio de un cambio
 * que no pidió; bloquear la entrada del siguiente es exactamente el límite que
 * compró.
 */

export type SeatDenialReason =
  /** La organización no tiene suscripción: no hay asientos que repartir. */
  | 'subscription_missing'
  /** Los asientos pagados ya están ocupados u ofrecidos. */
  | 'seat_limit_reached';

export interface SeatAvailability {
  /** Asientos pagados de la suscripción vigente. */
  seats: number;
  /** Miembros actuales de la organización (incluye al propietario). */
  members: number;
  /** Invitaciones vivas: emitidas, sin consumir y sin caducar. */
  pendingInvitations: number;
  /** Asientos libres; nunca negativo. */
  available: number;
  denial: SeatDenialReason | null;
}

@Injectable()
export class SeatEntitlementService {
  constructor(private readonly database: DataSource) {}

  /**
   * Foto de los asientos de la organización.
   *
   * Acepta un `EntityManager` para poder ejecutarse DENTRO de la transacción
   * que añade el miembro: contar fuera de ella y decidir dentro deja la
   * ventana por la que dos aceptaciones simultáneas entran las dos.
   */
  async availability(
    organizationId: string,
    manager: EntityManager = this.database.manager,
    now: Date = new Date(),
  ): Promise<SeatAvailability> {
    const subscription = await manager.findOneBy(Subscription, {
      organizationId,
      tenantId: organizationId,
    });
    if (!subscription) {
      return {
        seats: 0,
        members: 0,
        pendingInvitations: 0,
        available: 0,
        denial: 'subscription_missing',
      };
    }
    const [members, pendingInvitations] = await Promise.all([
      manager.countBy(Membership, { organizationId }),
      manager
        .createQueryBuilder(Invitation, 'invitation')
        .where('invitation.organizationId = :organizationId', {
          organizationId,
        })
        .andWhere('invitation.consumedAt IS NULL')
        .andWhere('invitation.expiresAt > :now', { now })
        .getCount(),
    ]);
    const seats = Math.max(1, Number(subscription.seats) || 1);
    const occupied = members + pendingInvitations;
    const available = Math.max(0, seats - occupied);
    return {
      seats,
      members,
      pendingInvitations,
      available,
      denial: available > 0 ? null : 'seat_limit_reached',
    };
  }

  /**
   * Igual que `availability` pero ignorando las invitaciones pendientes.
   *
   * Es la comprobación del momento de ACEPTAR: la invitación que se está
   * consumiendo ya está contada como pendiente, así que restarla dos veces
   * dejaría fuera al último invitado de un plan lleno justo hasta el borde.
   * Aquí lo que importa es si su silla existe, no si estaba reservada.
   */
  async availabilityForAcceptance(
    organizationId: string,
    manager: EntityManager = this.database.manager,
  ): Promise<SeatAvailability> {
    const snapshot = await this.availability(organizationId, manager);
    if (snapshot.denial === 'subscription_missing') return snapshot;
    const available = Math.max(0, snapshot.seats - snapshot.members);
    return {
      ...snapshot,
      available,
      denial: available > 0 ? null : 'seat_limit_reached',
    };
  }
}

/** Mensaje accionable: dice el número y dice qué hacer con él. */
export function seatDenialMessage(
  reason: SeatDenialReason,
  snapshot: SeatAvailability,
): string {
  if (reason === 'subscription_missing') {
    return 'Esta organización no tiene una suscripción activa, así que no tiene asientos que asignar.';
  }
  const invited = snapshot.pendingInvitations;
  return (
    `Tu plan incluye ${snapshot.seats} ${snapshot.seats === 1 ? 'asiento' : 'asientos'} y ya ` +
    `${invited > 0 ? `hay ${snapshot.members} en uso y ${invited} ${invited === 1 ? 'invitación pendiente' : 'invitaciones pendientes'}` : `están los ${snapshot.members} en uso`}. ` +
    'Cancela una invitación pendiente o contrata más asientos para añadir a alguien más.'
  );
}
