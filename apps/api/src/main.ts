import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { useStripeWebhookRawBody } from './modules/commercial/stripe-webhook.raw-body';
import { useOutboxReceiverRawBody } from './modules/outbox-receiver/outbox-receiver.raw-body';
import { installGracefulShutdown } from './bootstrap/graceful-shutdown';
import {
  applyServerTimeouts,
  helmetOptions,
  JSON_BODY_LIMIT,
  serverTimeoutsFromEnv,
  type TimeoutConfigurableServer,
} from './bootstrap/production-hardening';
import { ReadinessState } from './bootstrap/readiness.state';
import { ErrorReportingLogger } from './observability/error-reporting.logger';
import {
  ERROR_REPORTER,
  type ErrorReporter,
} from './observability/error-reporter.port';

function parseAllowedOrigins(raw: string): string[] {
  const value = (raw || '').trim();
  if (!value) return [];
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => String(entry).trim())
          .map((entry) => entry.replace(/^['"]|['"]$/g, ''))
          .map((entry) => entry.replace(/\/+$/, ''))
          .filter(Boolean);
      }
    } catch {
      // Cae al parseo por delimitadores.
    }
  }
  return value
    .split(/[,\n;]+/)
    .map((entry) => entry.trim())
    .map((entry) => entry.replace(/^['"]|['"]$/g, ''))
    .map((entry) => entry.replace(/\/+$/, ''))
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
  });

  // El webhook de la pasarela necesita los BYTES CRUDOS para verificar su
  // firma HMAC, así que su parser se monta ANTES del JSON global y SÓLO en su
  // ruta: el orden de `use` es el orden de ejecución en Express, y el parser
  // crudo marca la petición para que el JSON global no vuelva a tocarla.
  useStripeWebhookRawBody(app);
  // El receptor del outbox PROPIO verifica la misma clase de firma HMAC sobre
  // bytes crudos, así que su parser se monta con la misma regla y en su
  // prefijo exacto (/v1/outbox).
  useOutboxReceiverRawBody(app);

  // El documento canónico inline admite hasta 8 000 000 bytes serializados;
  // el margen extra cubre el framing JSON sin aceptar payloads sin tope.
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });

  // Confiar en el primer salto de proxy (PaaS que termina TLS en un reverse
  // proxy): req.ip refleja el cliente real desde X-Forwarded-For.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Validación/saneo global de entrada (anti mass-assignment): whitelist quita
  // propiedades sin decorador; forbidNonWhitelisted convierte un campo no
  // declarado en un 400 explícito, no en un descarte silencioso.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CSP `default-src 'none'` (la API sólo sirve JSON) y HSTS de un año en
  // producción. Ver `bootstrap/production-hardening.ts`.
  app.use(helmet(helmetOptions()));
  app.use(compression());

  // ── CORS ──────────────────────────────────────────────────────────────────
  const env = process.env.NODE_ENV || 'development';
  const allowedOriginEnv = process.env.ALLOWED_ORIGIN || '';
  const allowedOrigins = parseAllowedOrigins(allowedOriginEnv);
  const defaultDevOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];
  const originsToValidate =
    allowedOrigins.length > 0
      ? allowedOrigins
      : env === 'development'
        ? defaultDevOrigins
        : [];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/+$/, '');
      if (originsToValidate.length === 0) {
        console.error(
          '[CORS] Sin orígenes permitidos configurados (ALLOWED_ORIGIN); se rechaza la solicitud cross-origin.',
        );
        return callback(new Error('CORS not configured'), false);
      }
      if (originsToValidate.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      console.error(
        `[CORS] Origen rechazado: ${normalizedOrigin}. Esperado uno de: ${JSON.stringify(originsToValidate)}`,
      );
      return callback(
        new Error(`Origin not allowed by CORS: ${normalizedOrigin}`),
        false,
      );
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // X-Review-Token: header del review link (Fase 5) — el invitado no tiene
    // Authorization; sin listarlo aquí el preflight CORS mataría el canje.
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Review-Token'],
  });

  // ── Observabilidad ────────────────────────────────────────────────────────
  // El logger de Nest se envuelve para que TODO `logger.error(...)` llegue al
  // puerto de reporte. Es lo que cubre al worker de outbox, cuyos fallos no
  // pasan por el filtro de excepciones: ocurren en un temporizador, sin
  // petición HTTP que filtrar.
  // `app.get` de un token de símbolo devuelve `any`; se pasa por `unknown`
  // para que la aserción sea real y no un `any` disfrazado.
  const reporterRef: unknown = app.get(ERROR_REPORTER);
  const reporter = reporterRef as ErrorReporter;
  app.useLogger(new ErrorReportingLogger(reporter));

  // ── Apagado ordenado ──────────────────────────────────────────────────────
  // `enableShutdownHooks` hace que `app.close()` ejecute los
  // `onApplicationShutdown` (el worker de outbox termina su lote y suelta los
  // leases) y cierre el pool de TypeORM. Sin esto, un despliegue deja filas
  // `processing` con lease colgado hasta que expira.
  app.enableShutdownHooks();

  const timeouts = serverTimeoutsFromEnv();
  const readiness = app.get(ReadinessState);
  const shutdownLogger = new Logger('Shutdown');
  installGracefulShutdown({
    readiness,
    closeApp: async () => {
      await app.close();
      await reporter.flush?.();
    },
    logger: {
      log: (message) => shutdownLogger.log(message),
      warn: (message) => shutdownLogger.warn(message),
      error: (message) => shutdownLogger.error(message),
    },
    drainDelayMs: timeouts.drainDelayMs,
    shutdownGraceMs: timeouts.shutdownGraceMs,
  });

  // ── Arranque ──────────────────────────────────────────────────────────────
  const port = parseInt(process.env.PORT ?? '4000', 10);
  const server = (await app.listen(
    port,
    '0.0.0.0',
  )) as TimeoutConfigurableServer;

  // Timeouts DESPUÉS de `listen`: antes no existe el `http.Server`.
  // `keepAliveTimeout` por encima del idle del balanceador es lo que evita
  // los 502 esporádicos de una conexión cerrada en la ventana equivocada.
  applyServerTimeouts(server, timeouts);

  console.log(
    `Valle Design API escuchando en :${port} (NODE_ENV=${env}) allowedOrigins=${originsToValidate.join(', ')}`,
  );
  console.log(
    `Timeouts: keepAlive=${timeouts.keepAliveTimeoutMs}ms headers=${timeouts.headersTimeoutMs}ms request=${timeouts.requestTimeoutMs}ms; apagado: drenaje=${timeouts.drainDelayMs}ms techo=${timeouts.shutdownGraceMs}ms`,
  );
}

bootstrap().catch((err) => {
  console.error(`❌ Fatal startup error: ${(err as Error).message}`);
  process.exit(1);
});
