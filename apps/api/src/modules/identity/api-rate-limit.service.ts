import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createOpaqueRateLimitKey } from './identity-security';
import {
  IDENTITY_RATE_LIMIT_STORE,
  type IdentityRateLimitStore,
} from './identity-rate-limit.store';

/**
 * Rate limiting para superficies FUERA de /auth, sobre la misma
 * infraestructura que ya protege la identidad: claves HMAC opacas (ningún
 * identificador en claro en la tabla) y el store PostgreSQL atómico
 * compartido entre réplicas (`identity_rate_limits`).
 *
 * Los techos son GENEROSOS a propósito: no miden el uso legítimo — un
 * dibujante guardando frenéticamente no debe conocer este servicio — sino
 * que acotan el daño de un cliente roto en bucle o un abuso deliberado
 * (visión con LLM detrás, checkout que abre sesiones de pago, comentarios
 * de review con token anónimo). Sin techo, cualquier credencial válida es
 * un amplificador ilimitado.
 *
 * Misma semántica 429 que /auth: `retryAfterSeconds` en el cuerpo.
 */
@Injectable()
export class ApiRateLimitService {
  constructor(
    @Inject(IDENTITY_RATE_LIMIT_STORE)
    private readonly store: IdentityRateLimitStore,
  ) {}

  /**
   * Consume 1 del presupuesto `scope`+`identifiers` (ventana fija de 60 s) y
   * lanza 429 si el techo ya se alcanzó.
   */
  async enforce(
    scope: string,
    identifiers: readonly string[],
    maxPerMinute: number,
  ): Promise<void> {
    const key = createOpaqueRateLimitKey(scope, identifiers);
    const decision = await this.store.consume(key, maxPerMinute, 60_000);
    if (!decision.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'rate_limited',
          message: 'Demasiadas peticiones; inténtalo más tarde.',
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(decision.retryAfterMs / 1_000),
          ),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

/** Techos por minuto de las superficies protegidas (VD-RL-001). */
export const API_RATE_LIMITS = {
  /** Guardado de contenido por documento: muy por encima de un humano. */
  cadContentWritePerDocument: 120,
  /** Subida de archivo gzip por documento: pesa hasta 20 MiB comprimidos. */
  cadArchiveWritePerDocument: 30,
  /** Visión por cuenta: cada llamada cuesta inferencia. */
  cadVisionPerAccount: 10,
  /** Sesiones de checkout por organización: abre recursos en el proveedor. */
  checkoutSessionsPerOrganization: 10,
  /** Comentarios por sesión de review: la superficie anónima-con-token. */
  reviewCommentsPerSession: 30,
  /**
   * Reportes de «algo salió mal» por cuenta. Diez por minuto es holgadísimo
   * para una persona y estrecho para un bucle: el botón manda correo, y un
   * cliente que se atasque reintentando no puede inundar el buzón de soporte.
   */
  supportIncidentsPerAccount: 10,
} as const;
