import { DataSource, In, Repository } from 'typeorm';
import {
  Membership,
  Organization,
} from '../organizations/entities/organization.entity';
import { IdentityAuditEvent, Session, User } from './entities/identity.entity';
import type { IdentityMfaService } from './identity-mfa.service';

/**
 * T-62(c) — EL DERECHO ARCO MÍNIMO INDISCUTIBLE: exportar lo propio.
 *
 * Nunca lleva `passwordHash`, tokens de sesión ni secreto/códigos de MFA:
 * son credenciales, no datos personales que alguien pueda pedir de vuelta,
 * y devolverlas sería el defecto de seguridad opuesto al que esta ficha
 * cierra. `mfaStatus` ya resuelve esa frontera (booleano, nunca el secreto);
 * las sesiones sólo llevan lo que ya se le enseña en `/cuenta` (nunca la
 * IP, por la misma regla que ahí).
 *
 * Función libre y no un método de `IdentityService` por la misma razón que
 * `identity-token-issuance.ts`: ese archivo ya pasaba el presupuesto de 800
 * líneas y ésta es una unidad cohesiva propia (una LECTURA agregada de
 * varias tablas, sin efectos secundarios) que no necesita el resto del
 * estado del servicio.
 */
export interface PersonalDataExport {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    emailVerifiedAt: string | null;
    createdAt: string;
  };
  sessions: Array<{
    id: string;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
    userAgent: string | null;
  }>;
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    role: string;
  }>;
  mfa: { enabled: boolean };
  activity: Array<{ action: string; createdAt: string }>;
}

export async function exportPersonalData(
  deps: {
    dataSource: DataSource;
    users: Repository<User>;
    sessions: Repository<Session>;
    audit: Repository<IdentityAuditEvent>;
    mfa: IdentityMfaService;
  },
  userId: string,
): Promise<PersonalDataExport> {
  const user = await deps.users.findOneByOrFail({ id: userId });
  const [sessions, memberships, mfaStatus, activity] = await Promise.all([
    deps.sessions.find({ where: { userId }, order: { createdAt: 'DESC' } }),
    deps.dataSource.getRepository(Membership).findBy({ userId }),
    deps.mfa.mfaStatus(userId),
    deps.audit.find({
      where: { actorUserId: userId },
      order: { createdAt: 'DESC' },
      take: 200,
    }),
  ]);
  const organizationIds = memberships.map((m) => m.organizationId);
  const organizations = organizationIds.length
    ? await deps.dataSource
        .getRepository(Organization)
        .findBy({ id: In(organizationIds) })
    : [];
  const organizationName = new Map(organizations.map((o) => [o.id, o.name]));
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    },
    sessions: sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      revokedAt: s.revokedAt?.toISOString() ?? null,
      userAgent: s.userAgent,
    })),
    memberships: memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: organizationName.get(m.organizationId) ?? '',
      role: m.role,
    })),
    mfa: { enabled: mfaStatus.enabled },
    activity: activity.map((a) => ({
      action: a.action,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
