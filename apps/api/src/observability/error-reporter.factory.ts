import { Logger } from '@nestjs/common';
import { NullErrorReporter } from './adapters/null-error-reporter';
import {
  parseSentryDsn,
  SentryHttpErrorReporter,
  type FetchLike,
} from './adapters/sentry-http.error-reporter';
import type { ErrorReporter } from './error-reporter.port';

/**
 * Elige el adaptador de reporte según configuración. Un solo sitio decide,
 * y decide por AUSENCIA: sin `SENTRY_DSN` el reporter es inerte.
 *
 * Se comporta como el `PaymentProvider` del repo: el binding por defecto no
 * hace red, así que los tests, el desarrollo local y cualquier despliegue que
 * no haya elegido proveedor se comportan igual y no dependen de Internet.
 *
 * Un DSN ilegible NO tumba el arranque: se registra el motivo y se cae al
 * adaptador nulo. Quedarse sin telemetría es malo; quedarse sin servicio
 * porque la telemetría estaba mal configurada es peor, y es exactamente el
 * fallo que ocurre a las 3 de la mañana cuando alguien rota un secreto.
 */
export interface ErrorReporterFactoryOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  logger?: { log(message: string): void; warn(message: string): void };
}

export function createErrorReporter(
  options: ErrorReporterFactoryOptions = {},
): ErrorReporter {
  const env = options.env ?? process.env;
  const logger = options.logger ?? new Logger('ErrorReporter');
  const dsnRaw = (env.SENTRY_DSN ?? '').trim();

  if (!dsnRaw) {
    logger.log(
      'Sin SENTRY_DSN: reporte de errores INERTE (los errores siguen en el log del servidor).',
    );
    return new NullErrorReporter();
  }

  const dsn = parseSentryDsn(dsnRaw);
  if (!dsn) {
    // El DSN NO se imprime: lleva la clave pública del proyecto.
    logger.warn(
      'SENTRY_DSN no tiene forma de DSN valido (https://<clave>@<host>/<proyecto>); se usa el reporter inerte.',
    );
    return new NullErrorReporter();
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    logger.warn(
      'SENTRY_DSN configurado pero este runtime no ofrece fetch; se usa el reporter inerte.',
    );
    return new NullErrorReporter();
  }

  logger.log(
    `Reporte de errores activo hacia ${dsn.host} (proyecto ${dsn.projectId}).`,
  );
  return new SentryHttpErrorReporter({
    dsn,
    fetchImpl,
    environment: env.NODE_ENV ?? 'development',
    release: env.RELEASE_VERSION || env.GIT_SHA || undefined,
    serverName: env.HOSTNAME || undefined,
    onTransportError: (kind) =>
      logger.warn(`No se pudo entregar un reporte de error (${kind}).`),
  });
}
