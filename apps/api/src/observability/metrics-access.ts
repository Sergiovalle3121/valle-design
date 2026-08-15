import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Control de acceso de `GET /metrics`.
 *
 * Tres estados, y la diferencia entre el primero y el segundo es deliberada:
 *
 *   · `disabled`     → no hay `METRICS_TOKEN`. El endpoint responde 404, no
 *     401. Un 401 confirma que el endpoint existe y que hay algo detrás; un
 *     despliegue que no ha decidido exponer métricas no debería anunciar la
 *     superficie. **Desactivado es el valor por defecto**: la observabilidad
 *     se enciende a propósito, no por omisión.
 *   · `unauthorized` → hay token configurado y el de la petición no coincide.
 *   · `granted`      → coinciden.
 *
 * Por qué esto y no el guard de sesión: quien scrapea es Prometheus, no una
 * persona. No tiene cookie, ni CSRF, ni organización activa, y darle una
 * sesión de servicio sería crear una credencial de usuario para una máquina.
 * Un bearer dedicado, comparado en tiempo constante, es la superficie mínima.
 *
 * Por qué el cuerpo de `/metrics` merece protección aunque sean agregados:
 * publica el volumen de peticiones por ruta, el backlog del outbox y el
 * estado del pool. Eso es un mapa de la carga y de las rutas existentes —
 * reconocimiento gratis para quien busque por dónde apretar.
 */

export type MetricsAccess = 'disabled' | 'unauthorized' | 'granted';

/** Mínimo razonable: un token corto se prueba por fuerza bruta. */
export const MIN_METRICS_TOKEN_LENGTH = 16;

export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Comparación en tiempo constante sobre el SHA-256 de ambos valores: iguala
 * las longitudes (requisito de `timingSafeEqual`) sin filtrar por el tiempo
 * cuántos caracteres del token acertó quien lo intenta.
 */
export function tokensMatch(expected: string, presented: string): boolean {
  const a = createHash('sha256').update(expected, 'utf8').digest();
  const b = createHash('sha256').update(presented, 'utf8').digest();
  return timingSafeEqual(a, b);
}

export function evaluateMetricsAccess(
  configuredToken: string | undefined,
  authorizationHeader: string | undefined,
): MetricsAccess {
  const expected = (configuredToken ?? '').trim();
  if (!expected || expected.length < MIN_METRICS_TOKEN_LENGTH) {
    return 'disabled';
  }
  const presented = extractBearer(authorizationHeader);
  if (!presented) return 'unauthorized';
  return tokensMatch(expected, presented) ? 'granted' : 'unauthorized';
}
