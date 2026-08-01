import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { getJwtSecret } from './common/config/jwt-secret';

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
  // Fail-closed ANTES de construir el grafo DI: en producción, sin secreto de
  // verificación de tokens (JWT_SECRET/SESSION_SECRET) el arranque debe caer
  // ruidosamente, no servir 401 a toda sesión válida.
  getJwtSecret();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
  });

  // El documento canónico inline admite hasta 8 000 000 bytes serializados;
  // el margen extra cubre el framing JSON sin aceptar payloads sin tope.
  app.useBodyParser('json', { limit: '16mb' });

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

  app.use(helmet());
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
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Arranque ──────────────────────────────────────────────────────────────
  const port = parseInt(process.env.PORT ?? '4000', 10);
  await app.listen(port, '0.0.0.0');
  console.log(
    `Valle Design API escuchando en :${port} (NODE_ENV=${env}) allowedOrigins=${originsToValidate.join(', ')}`,
  );
}

bootstrap().catch((err) => {
  console.error(`❌ Fatal startup error: ${(err as Error).message}`);
  process.exit(1);
});
