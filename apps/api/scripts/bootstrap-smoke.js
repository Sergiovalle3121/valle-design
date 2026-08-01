/**
 * Bootstrap DI smoke test (compiled-artifact gate) — adaptado del monorepo
 * origen para valle-design.
 *
 * Arranca el grafo COMPLETO compilado de la aplicación (NestFactory.create +
 * app.init), lo que instancia cada provider y resuelve los guards de cada
 * controller. Atrapa fallos de inyección de dependencias en tiempo de arranque
 * (p. ej. un guard cuyo servicio no es alcanzable en el módulo) que ni `tsc`
 * ni las pruebas unitarias aisladas detectan.
 *
 * Uso (gate pre-merge):
 *   npm run build
 *   DATABASE_URL=postgres://user:pass@host:5432/db node scripts/bootstrap-smoke.js
 *
 * Sale con 0 si el arranque es limpio, 1 ante cualquier error de DI/bootstrap.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
  console.error(
    '[bootstrap-smoke] FAIL: define DATABASE_URL (o DB_HOST) hacia PostgreSQL — el app usa tipos de columna postgres-only.',
  );
  process.exit(1);
}

(async () => {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');

  let app;
  try {
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    await app.init(); // resuelve providers + guards de rutas — donde afloran los bugs de DI
    console.log(
      '[bootstrap-smoke] OK — application graph initialized cleanly.',
    );
    await app.close();
    process.exit(0);
  } catch (err) {
    console.error(
      '[bootstrap-smoke] FAIL — bootstrap error:\n',
      err && err.message ? err.message : err,
    );
    try {
      if (app) await app.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
})();
