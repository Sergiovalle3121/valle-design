import { ForbiddenException } from '@nestjs/common';

/**
 * LA DECISIÓN DE CORS POR PETICIÓN, fuera de `main.ts` para poder probarla.
 *
 * ## Un origen ajeno es un 403, no un 500
 *
 * Antes el rechazo se entregaba al paquete `cors` como un `Error` pelado; el
 * `AllExceptionsFilter` lo trataba como fallo inesperado y respondía 500. En
 * producción, del 17 al 24 de septiembre de 2026, el 100 % de los 5xx del API
 * fueron eso: un escáner de WordPress (POST /wp-json/batch/v1, /index.php…) y
 * un entorno de vista previa apuntando al API de producción. Nada estaba
 * roto, pero la tasa de 5xx y el reporter de errores decían lo contrario, y
 * un aviso real se habría perdido entre ellos.
 *
 * Ahora el rechazo es un `ForbiddenException` con `code: cors_origin_rejected`:
 * el filtro lo contesta como 403 y, como a todo 4xx, no lo registra como
 * error ni lo reporta. La petición sigue sin llegar al handler.
 *
 * La falta de configuración (`ALLOWED_ORIGIN` vacío fuera de desarrollo) SÍ
 * sigue siendo un 500 registrado como error: ahí el defecto es del operador y
 * tiene que llegar al reporter.
 *
 * ## Por qué el origen se sanea antes de registrarlo
 *
 * El callback corre por PETICIÓN, sin autenticar, y el header `Origin` lo
 * escribe quien llama: volcarlo crudo sería inyección de log (saltos de
 * línea, escapes ANSI). Se deja en imprimibles y 200 caracteres, y se
 * registra como warn: señal útil en un incidente, sin dejar que cualquiera
 * infle el reporter mandando cabeceras basura.
 */

export const CORS_ORIGIN_REJECTED = 'cors_origin_rejected';

export type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;

export interface CorsOriginLogger {
  warn(message: string): void;
  error(message: string): void;
}

export function sanitizeOrigin(value: string): string {
  return [...value.slice(0, 200)]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('');
}

export function corsOriginCheck(
  allowedOrigins: readonly string[],
  logger: CorsOriginLogger,
): (origin: string | undefined, callback: CorsOriginCallback) => void {
  return (origin, callback) => {
    // Sin `Origin` no es una petición cross-origin de navegador (curl, el
    // health check, el propio servidor): CORS no tiene nada que decidir.
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/+$/, '');
    if (allowedOrigins.length === 0) {
      logger.error(
        'Sin orígenes permitidos configurados (ALLOWED_ORIGIN); se rechaza la solicitud cross-origin.',
      );
      return callback(new Error('CORS not configured'), false);
    }
    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    logger.warn(
      `Origen rechazado: ${sanitizeOrigin(normalizedOrigin)}. Esperado uno de: ${JSON.stringify(allowedOrigins)}`,
    );
    return callback(
      new ForbiddenException({
        code: CORS_ORIGIN_REJECTED,
        message: 'Este origen no puede usar el API.',
      }),
      false,
    );
  };
}
