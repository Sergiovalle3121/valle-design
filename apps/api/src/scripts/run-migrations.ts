/**
 * Corredor de migraciones INDEPENDIENTE del arranque — el pre-deploy real.
 *
 * El arranque de la API ya aplica migraciones (`MIGRATIONS_RUN=true`), pero un
 * despliegue serio las quiere ANTES de sustituir el proceso viejo: si la
 * migración falla, el despliegue se aborta con el servicio anterior intacto
 * (fail-closed), en vez de descubrirlo con la API nueva a medio arrancar.
 * Railway (y cualquier orquestador con hook de pre-deploy) ejecuta este script
 * desde el MISMO dist compilado que la imagen ya lleva:
 *
 *   node apps/api/dist/scripts/run-migrations.js
 *
 * Reusa `ormOptions()` — misma URL, mismo SSL, mismos presupuestos de conexión
 * y la MISMA lista de migraciones que el arranque — con dos diferencias
 * deliberadas: nunca sincroniza esquema (`synchronize` prohibido aquí incluso
 * fuera de producción) y nunca deja la aplicación corriendo. Sale 0 sólo si
 * TODAS las migraciones pendientes aplicaron; cualquier error sale 1 con la
 * causa en stderr.
 */
import { DataSource, type DataSourceOptions } from 'typeorm';
import { ormOptions } from '../orm.options';

async function main(): Promise<void> {
  const options = ormOptions() as DataSourceOptions & {
    autoLoadEntities?: boolean;
  };
  if (options.type !== 'postgres') {
    throw new Error(
      'El pre-deploy de migraciones sólo opera contra PostgreSQL: define DATABASE_URL.',
    );
  }
  // `autoLoadEntities` es de Nest, no de TypeORM puro; las migraciones no
  // necesitan el grafo de entidades para aplicarse.
  delete options.autoLoadEntities;
  const dataSource = new DataSource({
    ...options,
    synchronize: false,
    migrationsRun: false,
    logging: ['error', 'schema', 'migration'],
  });
  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    if (applied.length === 0) {
      console.log('Migraciones: nada pendiente — el esquema ya está al día.');
    } else {
      for (const migration of applied)
        console.log(`Migración aplicada: ${migration.name}`);
      console.log(`Migraciones: ${applied.length} aplicadas.`);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Migraciones: FALLO — el despliegue debe abortarse.',
    error instanceof Error ? error.stack ?? error.message : error,
  );
  process.exitCode = 1;
});
