import type { DataSource, EntityManager } from 'typeorm';
import {
  IdentityAuditEvent,
  OneTimeToken,
  User,
} from './entities/identity.entity';
import {
  consumeRemainingTokensWithManager,
  consumeTokenWithManager,
  validOpaqueToken,
} from './identity-token-issuance';

/** Lo que pasó al canjear un enlace de verificación (ver `verifyEmail`). */
export type EmailVerificationOutcome =
  | { outcome: 'verified'; email: string }
  | { outcome: 'already_verified'; email: string }
  | { outcome: 'superseded' }
  | { outcome: 'expired' }
  | { outcome: 'invalid' };

/**
 * Canje del enlace de verificación. Un solo `false` no le sirve a nadie:
 * abrir por segunda vez un enlace que YA verificó, o abrir el enlace viejo
 * tras un cambio de correo, parecían fallos del producto («token inválido»).
 * Cada resultado dice lo que pasó para que el web diga qué hacer; el correo
 * viaja en los dos resultados buenos para que el inicio de sesión llegue
 * ya rellenado. `already_verified` es idempotente: no toca nada.
 */
export async function performEmailVerification(
  dataSource: DataSource,
  hashToken: (token: string) => string,
  raw: string,
): Promise<EmailVerificationOutcome> {
  if (!validOpaqueToken(raw)) return { outcome: 'invalid' };
  return dataSource.transaction(async (manager) => {
    const token = await consumeTokenWithManager(manager, raw, 'verify_email');
    if (!token) return explainUnusableVerification(manager, hashToken, raw);
    const user = await manager.findOneBy(User, { id: token.subjectId });
    if (!user) {
      throw new Error('Identity invariant violated: token subject missing.');
    }
    await manager.update(User, user.id, { emailVerifiedAt: new Date() });
    // Los reenvíos acumulan tokens vigentes; verificado el correo, el resto
    // de enlaces que sigan en la bandeja dejan de abrir nada.
    await consumeRemainingTokensWithManager(manager, user.id, 'verify_email');
    await manager.save(
      IdentityAuditEvent,
      manager.create(IdentityAuditEvent, {
        actorUserId: user.id,
        action: 'identity.email_verified',
      }),
    );
    return { outcome: 'verified', email: user.email };
  });
}

/**
 * Por qué un token de verificación no se pudo canjear. Se mira DESPUÉS de
 * intentar consumirlo, nunca antes: el UPDATE condicional sigue siendo la
 * única puerta, y esto sólo pone nombre a la negativa.
 */
async function explainUnusableVerification(
  manager: EntityManager,
  hashToken: (token: string) => string,
  raw: string,
): Promise<EmailVerificationOutcome> {
  const token = await manager.findOne(OneTimeToken, {
    where: { tokenHash: hashToken(raw), purpose: 'verify_email' },
  });
  if (!token) return { outcome: 'invalid' };
  const user = await manager.findOneBy(User, { id: token.subjectId });
  if (user?.emailVerifiedAt) {
    return { outcome: 'already_verified', email: user.email };
  }
  // Consumido sin que la cuenta esté verificada: lo reemplazó un cambio de
  // correo. El enlace que vale es el del correo más reciente.
  if (token.consumedAt) return { outcome: 'superseded' };
  return { outcome: 'expired' };
}
