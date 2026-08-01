/**
 * Única fuente de verdad del secreto con el que Design VERIFICA los tokens de
 * sesión emitidos por Platform (consumo por contrato: secret compartido vía
 * entorno, nunca import de código de Platform).
 *
 * Adaptación del `jwt-secret.ts` del origen:
 * - Design NO emite tokens ni persiste secretos en base (eso es de Platform);
 *   aquí sólo se resuelve el secreto de VERIFICACIÓN desde el entorno.
 * - `JWT_SECRET` tiene prioridad; `SESSION_SECRET` es el alias que usan los
 *   despliegues de Platform que comparten un único secreto de sesión.
 * - En producción SIN secreto válido LANZA (fail-closed): verificar tokens con
 *   un secreto aleatorio por proceso rechazaría todas las sesiones y taparía
 *   la mala configuración.
 * - En desarrollo/pruebas cae a un default explícito e inseguro.
 *
 * NO inlinear `process.env.JWT_SECRET || '<fallback>'` en ningún sitio: ese
 * patrón reintroduce en silencio un secreto adivinable. Usa este helper.
 */

const MIN_LENGTH = 16;

/** Default SOLO dev/test — claramente inseguro, jamás retornado en prod. */
export const DEV_JWT_SECRET = 'valle-design-dev-only-insecure-secret';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (typeof secret === 'string' && secret.length >= MIN_LENGTH) {
    return secret;
  }

  if (isProd) {
    throw new Error(
      'JWT_SECRET/SESSION_SECRET no está definido (o tiene menos de 16 ' +
        'caracteres) en producción. Design valida los tokens emitidos por ' +
        'Platform con un secreto compartido vía entorno; sin él, ninguna ' +
        'sesión podría verificarse. Define el mismo secreto que firma los ' +
        'tokens en Platform.',
    );
  }

  return DEV_JWT_SECRET;
}
