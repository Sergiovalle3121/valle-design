import { randomBytes } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import type { EmailService } from '../commercial/ports/commercial.ports';
import {
  OneTimeToken,
  OneTimeTokenPurpose,
  User,
} from './entities/identity.entity';
import { hashOpaqueToken, MAX_TOKEN_LENGTH } from './identity-security';

/**
 * Los tokens de un solo uso de correo (verificar cuenta, restablecer
 * contraseña, verificar el correo nuevo tras cambiarlo) y el desafío de MFA
 * comparten esta forma: bloquear al sujeto, invalidar el token anterior de
 * ese propósito, guardar el nuevo. Separado de `IdentityService` — que ya
 * pasaba el presupuesto de 800 líneas — porque es una unidad cohesiva propia
 * que no toca sesiones ni contraseñas, sólo la tabla `OneTimeToken` y el
 * outbox de correo.
 */

const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function validOpaqueToken(raw: string): boolean {
  return raw.length <= MAX_TOKEN_LENGTH && OPAQUE_TOKEN_PATTERN.test(raw);
}

export async function lockIdentitySubject(
  dataSource: DataSource,
  manager: EntityManager,
  userId: string,
): Promise<void> {
  if (dataSource.options.type !== 'postgres') return;
  await manager
    .getRepository(User)
    .createQueryBuilder('identity_user')
    .setLock('pessimistic_write')
    .where('identity_user.id = :userId', { userId })
    .getOneOrFail();
}

export async function enqueueIdentityEmail(
  email: EmailService,
  manager: EntityManager,
  user: User,
  token: OneTimeToken,
  raw: string,
  template: string,
  path: string,
): Promise<void> {
  await email.enqueue(
    {
      organizationId: null,
      tenantId: null,
      to: user.email,
      template,
      payload: {
        token: raw,
        path: `${path}?token=${encodeURIComponent(raw)}`,
        expiresAt: token.expiresAt.toISOString(),
      },
      idempotencyKey: `${template}:${token.id}`,
    },
    { native: manager },
  );
}

export async function issueIdentityEmailToken(
  dataSource: DataSource,
  email: EmailService,
  user: User,
  purpose: OneTimeTokenPurpose,
  ttlMs: number,
  template: string,
  path: string,
): Promise<void> {
  await dataSource.transaction((manager) =>
    issueIdentityEmailTokenWithManager(
      dataSource,
      email,
      manager,
      user,
      purpose,
      ttlMs,
      template,
      path,
    ),
  );
}

/**
 * Igual que `issueIdentityEmailToken`, pero DENTRO de una transacción que ya
 * existe. `IdentityService.updateProfile` la necesita así: cambiar el correo
 * y encolar su verificación tienen que caer juntos o ninguno — un correo
 * cambiado sin verificación pendiente encolada dejaría la cuenta con un
 * correo nuevo que nadie ha demostrado poder leer.
 */
export async function issueIdentityEmailTokenWithManager(
  dataSource: DataSource,
  email: EmailService,
  manager: EntityManager,
  user: User,
  purpose: OneTimeTokenPurpose,
  ttlMs: number,
  template: string,
  path: string,
): Promise<void> {
  const raw = randomBytes(32).toString('base64url');
  await lockIdentitySubject(dataSource, manager, user.id);
  await manager
    .createQueryBuilder()
    .update(OneTimeToken)
    .set({ consumedAt: new Date() })
    .where(
      'subjectId = :userId AND purpose = :purpose AND consumedAt IS NULL',
      { userId: user.id, purpose },
    )
    .execute();
  const token = await manager.save(
    OneTimeToken,
    manager.create(OneTimeToken, {
      subjectId: user.id,
      purpose,
      tokenHash: hashOpaqueToken(raw),
      expiresAt: new Date(Date.now() + ttlMs),
    }),
  );
  await enqueueIdentityEmail(email, manager, user, token, raw, template, path);
}

export async function consumeTokenWithManager(
  manager: EntityManager,
  raw: string,
  purpose: OneTimeTokenPurpose,
): Promise<OneTimeToken | null> {
  const token = await manager.findOne(OneTimeToken, {
    where: { tokenHash: hashOpaqueToken(raw), purpose },
  });
  if (!token || token.consumedAt || token.expiresAt <= new Date()) {
    return null;
  }
  const result = await manager
    .createQueryBuilder()
    .update(OneTimeToken)
    .set({ consumedAt: new Date() })
    .where('id = :id AND consumedAt IS NULL', { id: token.id })
    .execute();
  return result.affected ? token : null;
}
