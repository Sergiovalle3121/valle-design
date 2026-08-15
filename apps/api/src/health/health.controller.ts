import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReadinessState } from '../bootstrap/readiness.state';
import { Public } from '../modules/auth/decorators/public.decorator';

/**
 * Probes de liveness/readiness para orquestadores y monitores (adaptado del
 * origen; sin throttler en Design R1).
 *
 * - `GET /health`       → liveness: el proceso está arriba y sirviendo. Nunca
 *   toca la base, así un parpadeo de BD no pone a la plataforma en
 *   restart-loop.
 * - `GET /health/ready` → readiness: además verifica que la base responde un
 *   `SELECT 1` Y que no queda ninguna migración pendiente. HTTP 200 con
 *   `{status:'ok'}` cuando está sana y 503 con `{status:'degraded'}` si no,
 *   para que el balanceador saque la instancia de rotación sin matarla.
 *
 * Por qué readiness mira las migraciones: durante un despliegue conviven la
 * instancia vieja y la nueva; si la nueva recibe tráfico con el esquema a
 * medio migrar, sirve peticiones contra columnas que aún no existen. «La base
 * responde» no es lo mismo que «la base está lista».
 *
 * Y por qué readiness mira TAMBIÉN el drenaje: al recibir SIGTERM el proceso
 * sigue vivo y sano —termina lo que aceptó— pero ya no debe recibir tráfico
 * nuevo. Liveness debe seguir en 200 (si respondiera 503, el supervisor
 * mataría el contenedor a mitad del drenaje, que es justo lo contrario de lo
 * que se busca) y readiness debe pasar a 503 para que el balanceador saque la
 * réplica de rotación. Es la diferencia entre un despliegue invisible y una
 * ráfaga de 502 en cada release.
 */
@Controller()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly readiness: ReadinessState,
  ) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', time: new Date().toISOString() };
  }

  @Public()
  @Get('health/ready')
  async ready() {
    const startedAt = Date.now();
    if (this.readiness.isDraining) {
      throw new ServiceUnavailableException({
        status: 'draining',
        reason:
          'El proceso recibio una senal de apagado y esta drenando: termina lo ' +
          'que ya acepto y no debe recibir trafico nuevo.',
        drainingSince: this.readiness.since?.toISOString(),
        time: new Date().toISOString(),
      });
    }
    try {
      await this.dataSource.query('SELECT 1');
      const pending = await this.hasPendingMigrations();
      if (pending) {
        throw new ServiceUnavailableException({
          status: 'degraded',
          db: 'up',
          migrations: 'pending',
          reason:
            'Hay migraciones sin aplicar: el esquema todavía no corresponde a ' +
            'esta versión. La instancia no debe recibir tráfico hasta que la ' +
            'cadena esté al día.',
          time: new Date().toISOString(),
        });
      }
      return {
        status: 'ok',
        db: 'up',
        migrations: 'up-to-date',
        latencyMs: Date.now() - startedAt,
        time: new Date().toISOString(),
      };
    } catch (err) {
      // Un 503 ya formado (migraciones pendientes) se propaga tal cual.
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException({
        status: 'degraded',
        db: 'down',
        reason: (err as Error).message,
        time: new Date().toISOString(),
      });
    }
  }

  /**
   * ¿Queda alguna migración por aplicar? Sólo aplica en el carril de
   * migraciones; con `synchronize` (dev SQLite) el esquema lo materializan las
   * entidades y no hay cadena que consultar. Si la consulta misma falla, se
   * responde `false`: readiness ya comprobó que la base responde.
   */
  private async hasPendingMigrations(): Promise<boolean> {
    const { synchronize, migrations } = this.dataSource.options ?? {};
    if (synchronize) return false;
    if (!migrations || (Array.isArray(migrations) && !migrations.length)) {
      return false;
    }
    try {
      return await this.dataSource.showMigrations();
    } catch {
      return false;
    }
  }
}
