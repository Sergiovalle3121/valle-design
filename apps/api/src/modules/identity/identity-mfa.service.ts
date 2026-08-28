import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  Credential,
  IdentityAuditEvent,
  IdentityBackupCode,
  IdentityMfaFactor,
} from './entities/identity.entity';
import {
  DUMMY_PASSWORD_HASH,
  verifyArgon2idPassword,
} from './identity-security';
import {
  BACKUP_CODE_COUNT,
  decryptMfaSecret,
  encryptMfaSecret,
  generateBackupCode,
  generateTotpSecret,
  hashBackupCode,
  matchTotpCounter,
} from './identity-mfa';

/**
 * EL SEGUNDO FACTOR, en su propio servicio.
 *
 * ── POR QUÉ NO VIVE EN `IdentityService` ────────────────────────────────────
 * Vivió ahí una tarde. `IdentityService` pasó de 700 a 931 líneas y el gate del
 * monolito lo dijo con la frase exacta que había que oír: «divídelo; no lo
 * añadas al manifiesto salvo que exista una razón escrita». No la había — el
 * segundo factor no comparte estado con el registro, la verificación de correo
 * ni el restablecimiento de contraseña; sólo comparte la tabla de usuarios.
 *
 * La frontera quedó donde el acoplamiento es real:
 *
 *   · AQUÍ vive todo lo que administra el FACTOR — dar de alta, confirmar,
 *     consumir un código, desactivar, rehacer los respaldos, consultar estado.
 *   · En `IdentityService` se quedan el DESAFÍO y la SESIÓN, porque son
 *     maquinaria de tokens y de cookies que ese servicio ya poseía, y moverlas
 *     habría duplicado el bloqueo pesimista y el consumo condicional que ya
 *     estaban resueltos ahí.
 *
 * `IdentityService` inyecta este servicio; este servicio NO conoce a aquél.
 * La flecha va en un solo sentido a propósito: una dependencia circular entre
 * los dos habría obligado a `forwardRef`, que es la señal de que la frontera
 * está mal puesta.
 */
@Injectable()
export class IdentityMfaService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Credential)
    private readonly credentials: Repository<Credential>,
    @InjectRepository(IdentityMfaFactor)
    private readonly mfaFactors: Repository<IdentityMfaFactor>,
    @InjectRepository(IdentityBackupCode)
    private readonly backupCodes: Repository<IdentityBackupCode>,
  ) {}

  /**
   * Verificación de contraseña con el MISMO coste haya credencial o no.
   *
   * Se repite aquí en vez de pedírsela a `IdentityService` porque pedírsela
   * habría invertido la flecha de dependencia por una línea. Lo que NO se
   * repite es el hash señuelo: sale de `identity-security`, que es donde vive
   * la constante, para que no puedan divergir.
   */
  private verifyPassword(hash: string, password: string): Promise<boolean> {
    return verifyArgon2idPassword(hash, password);
  }

  /** El factor sólo cuenta cuando el usuario demostró que su aplicación funciona. */
  async confirmedMfaFactor(userId: string): Promise<IdentityMfaFactor | null> {
    const factor = await this.mfaFactors.findOneBy({ userId });
    return factor?.confirmedAt ? factor : null;
  }

  /** ¿Tiene esta cuenta segundo factor activo? Lo consulta la página de cuenta. */
  async mfaStatus(userId: string): Promise<{
    enabled: boolean;
    pending: boolean;
    confirmedAt: Date | null;
    backupCodesRemaining: number;
  }> {
    const factor = await this.mfaFactors.findOneBy({ userId });
    const backupCodesRemaining = factor?.confirmedAt
      ? await this.backupCodes.count({
          where: { userId, consumedAt: IsNull() },
        })
      : 0;
    return {
      enabled: Boolean(factor?.confirmedAt),
      pending: Boolean(factor && !factor.confirmedAt),
      confirmedAt: factor?.confirmedAt ?? null,
      backupCodesRemaining,
    };
  }

  /**
   * Empieza el alta: secreto nuevo, cifrado y SIN confirmar.
   *
   * Volver a llamar mientras el alta está a medias sustituye el secreto — es lo
   * que pasa cuando alguien cierra la página a mitad y vuelve a entrar, y la
   * alternativa (fallar con «ya empezaste un alta») obligaría a inventar un
   * botón de cancelar para un estado que no le importa a nadie.
   *
   * Lo que NO se puede hacer es sustituir un factor YA CONFIRMADO: eso sería
   * desactivar el segundo factor sin pedir ni el código ni la contraseña, o
   * sea, exactamente el agujero que el factor viene a tapar.
   */
  async beginMfaEnrollment(userId: string): Promise<string> {
    if (await this.confirmedMfaFactor(userId)) {
      throw new BadRequestException({
        code: 'mfa_already_enabled',
        message:
          'Esta cuenta ya tiene segundo factor. Desactívalo antes de dar de alta otro.',
      });
    }
    const secret = generateTotpSecret();
    const existing = await this.mfaFactors.findOneBy({ userId });
    if (existing) {
      await this.mfaFactors.update(
        { id: existing.id },
        { secretCiphertext: encryptMfaSecret(secret), lastUsedStep: null },
      );
    } else {
      await this.mfaFactors.save(
        this.mfaFactors.create({
          userId,
          type: 'totp',
          secretCiphertext: encryptMfaSecret(secret),
        }),
      );
    }
    return secret;
  }

  /**
   * Confirma el alta con un código y ENTREGA los códigos de respaldo.
   *
   * Los códigos se devuelven aquí y en ningún otro sitio nunca más: se guardan
   * en hash, así que el servidor no puede volver a enseñarlos. Es incómodo a
   * propósito — un producto que puede reimprimir tus códigos de respaldo es un
   * producto que puede entregárselos a quien se haga pasar por ti.
   */
  async confirmMfaEnrollment(
    userId: string,
    code: string,
  ): Promise<string[] | null> {
    const factor = await this.mfaFactors.findOneBy({ userId });
    if (!factor || factor.confirmedAt) return null;
    const secret = decryptMfaSecret(factor.secretCiphertext);
    // El alta sella la misma marca de consumo que el inicio de sesión, y por la
    // misma razón: el código con el que se confirma el alta NO puede servir
    // luego para entrar. Tiene que ser el paso QUE CASÓ (ver el comentario de
    // `consumeSecondFactor`), no el actual.
    const matched = secret ? matchTotpCounter(secret, code, Date.now()) : null;
    if (matched === null) return null;

    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      generateBackupCode(),
    );
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        IdentityMfaFactor,
        { id: factor.id },
        {
          confirmedAt: new Date(),
          lastUsedStep: String(matched),
          lastUsedAt: new Date(),
        },
      );
      await manager.delete(IdentityBackupCode, { userId });
      await manager.save(
        IdentityBackupCode,
        codes.map((code) =>
          manager.create(IdentityBackupCode, {
            userId,
            codeHash: hashBackupCode(code),
          }),
        ),
      );
      await manager.save(
        IdentityAuditEvent,
        manager.create(IdentityAuditEvent, {
          actorUserId: userId,
          action: 'identity.mfa_enabled',
        }),
      );
    });
    return codes;
  }

  /**
   * Un código válido, TOTP o de respaldo, consumido de forma que no se repita.
   *
   * TOTP: se rechaza cualquier paso de tiempo menor o IGUAL al último aceptado.
   * Ésa es la defensa contra repetición, y sin ella un código visto de reojo o
   * copiado de un registro sigue sirviendo durante los noventa segundos de la
   * ventana de tolerancia.
   *
   * Respaldo: el consumo es un UPDATE condicional sobre `consumedAt IS NULL`,
   * así que dos peticiones simultáneas con el mismo código sólo pueden ganar
   * una. Un `SELECT` seguido de `UPDATE` habría dejado pasar las dos.
   */
  async consumeSecondFactor(
    userId: string,
    code: string,
  ): Promise<'totp' | 'backup_code' | null> {
    const factor = await this.confirmedMfaFactor(userId);
    if (!factor) return null;

    const secret = decryptMfaSecret(factor.secretCiphertext);
    const matched = secret ? matchTotpCounter(secret, code, Date.now()) : null;
    if (matched !== null) {
      // EL PASO QUE CASÓ, no el paso actual. La versión anterior guardaba
      // `totpCounter(Date.now())`, y con la ventana de deriva ±1 eso dejaba un
      // agujero de reutilización de un minuto entero: el código del paso N,
      // aceptado en N, volvía a casar en N+1 por deriva −1 y la comprobación
      // `N+1 > N` no lo veía. Cada código valía dos veces.
      const last = factor.lastUsedStep ? Number(factor.lastUsedStep) : -1;
      if (matched <= last) return null;
      // Compare-and-set sobre el valor que se leyó: dos peticiones simultáneas
      // con el mismo código leen el mismo `last` y las dos pasarían la
      // comprobación de arriba. Sólo una gana el UPDATE; la otra ve
      // `affected === 0` y se va con las manos vacías. Es la misma forma que ya
      // usan los códigos de respaldo un poco más abajo.
      const claimed = await this.mfaFactors
        .createQueryBuilder()
        .update()
        .set({ lastUsedStep: String(matched), lastUsedAt: new Date() })
        .where(
          factor.lastUsedStep === null
            ? 'id = :id AND lastUsedStep IS NULL'
            : 'id = :id AND lastUsedStep = :previous',
          { id: factor.id, previous: factor.lastUsedStep },
        )
        .execute();
      if (!claimed.affected) return null;
      return 'totp';
    }

    const result = await this.backupCodes
      .createQueryBuilder()
      .update()
      .set({ consumedAt: new Date() })
      .where('userId = :userId AND codeHash = :hash AND consumedAt IS NULL', {
        userId,
        hash: hashBackupCode(code),
      })
      .execute();
    return result.affected ? 'backup_code' : null;
  }

  /**
   * Desactivar exige la CONTRASEÑA, no sólo la sesión.
   *
   * Una sesión abierta en una máquina desatendida es justo el escenario contra
   * el que sirve un segundo factor. Si bastara con estar dentro para quitarlo,
   * quien se sienta delante de esa pantalla lo apaga en dos clics y ya no hay
   * factor. Pedir la contraseña convierte «tengo su pantalla» en «además tengo
   * su contraseña», que es un listón muy distinto.
   */
  async disableMfa(userId: string, password: string): Promise<boolean> {
    const credential = await this.credentials.findOneBy({ userId });
    const valid = await this.verifyPassword(
      credential?.algorithm === 'argon2id'
        ? credential.passwordHash
        : DUMMY_PASSWORD_HASH,
      password,
    );
    if (!credential || !valid) return false;

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(IdentityMfaFactor, { userId });
      await manager.delete(IdentityBackupCode, { userId });
      await manager.save(
        IdentityAuditEvent,
        manager.create(IdentityAuditEvent, {
          actorUserId: userId,
          action: 'identity.mfa_disabled',
        }),
      );
    });
    return true;
  }

  /** Códigos nuevos: los viejos dejan de valer en la misma transacción. */
  async regenerateBackupCodes(
    userId: string,
    password: string,
  ): Promise<string[] | null> {
    const credential = await this.credentials.findOneBy({ userId });
    const valid = await this.verifyPassword(
      credential?.algorithm === 'argon2id'
        ? credential.passwordHash
        : DUMMY_PASSWORD_HASH,
      password,
    );
    if (!credential || !valid || !(await this.confirmedMfaFactor(userId))) {
      return null;
    }
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      generateBackupCode(),
    );
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(IdentityBackupCode, { userId });
      await manager.save(
        IdentityBackupCode,
        codes.map((code) =>
          manager.create(IdentityBackupCode, {
            userId,
            codeHash: hashBackupCode(code),
          }),
        ),
      );
    });
    return codes;
  }
}
