import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Client as PgClient } from 'pg';
import { Subject } from 'rxjs';

export interface CadPresenceNotification {
  tenantId: string;
  documentId: string;
  /**
   * El peer que de verdad cambió. Sin esto, cualquier notificación del
   * documento (p. ej. el latido periódico de OTRO peer) obligaría a
   * reenviar el snapshot ENTERO a cada suscriptor — y cada reenvío de una
   * fila que no cambió resetea el reloj LOCAL de caducidad del receptor
   * (`receivedAt` en `presence.ts`), alargando el TTL real muy por encima de
   * `CAD_PRESENCE_TTL_MS` para cualquier peer que ya dejó de latir. Medido:
   * sin este campo, un peer que cierra la pestaña tardaba hasta el DOBLE del
   * TTL en desaparecer para quien seguía escuchando (evidencia en
   * `cad-presencia-viva.spec.ts`).
   */
  peerId: string;
}

/** Canal `LISTEN`/`NOTIFY` compartido — usado también por `CadPresenceService` al publicar. */
export const CAD_PRESENCE_CHANNEL = 'valle_cad_presence';

/**
 * El BUS de fan-out de presencia entre réplicas.
 *
 * ── Por qué NO es sólo un `Subject` de proceso ─────────────────────────────
 * Con una sola réplica de la API, un `Subject` bastaría: quien publica y
 * quien escucha viven en el mismo proceso. Con varias réplicas detrás de un
 * balanceador, el peer B puede estar conectado por SSE a la réplica 2 mientras
 * el peer A publica su latido contra la réplica 1 — sin un canal ENTRE
 * procesos, B nunca se entera. `LISTEN`/`NOTIFY` de PostgreSQL es ese canal:
 * ya es la base de datos compartida, y el payload que necesita transportar es
 * mínimo (`{tenantId, documentId}`, muy por debajo del tope de 8 KB de
 * NOTIFY) porque cada réplica RELEE el estado real de
 * `cad_presence_beats` en vez de confiar en el cuerpo de la notificación
 * (`CadPresenceService.snapshot`).
 *
 * ── Dos caminos hacia el mismo Subject ──────────────────────────────────────
 * `publishLocal()` alimenta el Subject de ESTE proceso al instante — la
 * réplica que acaba de escribir el latido no espera su propio roundtrip de
 * NOTIFY para servir a sus propios clientes SSE. El cliente LISTEN dedicado
 * alimenta el MISMO Subject cuando la notificación viene de OTRA réplica.
 * Ambos caminos son idempotentes en el consumidor: `CadPresenceService.stream`
 * relee el snapshot completo del documento en cada evento, así que una
 * notificación duplicada sólo repite un `SELECT` barato.
 *
 * ── Por qué se apaga sola en SQLite ─────────────────────────────────────────
 * `LISTEN`/`NOTIFY` no existe fuera de PostgreSQL. En desarrollo de un solo
 * proceso (fallback SQLite, ver `orm.options.ts`) no hace falta: no hay una
 * segunda réplica a la que avisar, así que `publishLocal()` sola ya cierra el
 * círculo. Sin esto el bus lanzaría al arrancar en cualquier `npm test` que
 * no configure PostgreSQL.
 */
@Injectable()
export class CadPresenceBus
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CadPresenceBus.name);
  private readonly subject = new Subject<CadPresenceNotification>();
  private client: NotifyCapableClient | null = null;
  private stopped = false;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.dataSource.options.type !== 'postgres') return;
    await this.connectListener();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.subject.complete();
    if (this.client) {
      await this.client.end().catch(() => undefined);
      this.client = null;
    }
  }

  /** Fan-out EN PROCESO, sin esperar al roundtrip de NOTIFY (ver cabecera). */
  publishLocal(notification: CadPresenceNotification): void {
    this.subject.next(notification);
  }

  /** Notificaciones de fan-out — de este proceso Y de cualquier otra réplica. */
  stream() {
    return this.subject.asObservable();
  }

  private async connectListener(): Promise<void> {
    if (this.stopped) return;
    const connectionString = postgresConnectionString(this.dataSource);
    // El shim ambiental de `pg` (migration-cli/pg.d.ts) sólo declara
    // connect/query/end; `.on()` se añade aquí vía el cast a la interfaz
    // local de abajo — sin sumar `@types/pg` como dependencia nueva.
    const client = new PgClient({
      connectionString,
    }) as unknown as NotifyCapableClient;
    client.on('notification', (message) => {
      if (message.channel !== CAD_PRESENCE_CHANNEL || !message.payload) return;
      const parsed = parseNotification(message.payload);
      if (parsed) this.subject.next(parsed);
    });
    client.on('error', (error) => {
      this.logger.warn(
        `Conexión LISTEN de presencia caída (${error.name}); reconectando.`,
      );
      this.client = null;
      this.scheduleReconnect();
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${CAD_PRESENCE_CHANNEL}`);
      this.client = client;
      this.logger.log('Escuchando presencia CAD entre réplicas (LISTEN).');
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'PgListenError';
      this.logger.warn(
        `No se pudo abrir el canal LISTEN de presencia (${kind}); reintentando.`,
      );
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connectListener();
    }, 2_000);
    this.reconnectTimer.unref();
  }
}

interface PgNotificationMessage {
  channel: string;
  payload?: string;
}

/**
 * Superficie MÍNIMA de `pg.Client` que este archivo usa — declarada aquí en
 * vez de tomada de un shim ajeno (ver el porqué junto al `require` de
 * arriba).
 */
interface NotifyCapableClient {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<unknown>;
  end(): Promise<void>;
  on(
    event: 'notification',
    listener: (message: PgNotificationMessage) => void,
  ): void;
  on(event: 'error', listener: (error: Error) => void): void;
}

function parseNotification(payload: string): CadPresenceNotification | null {
  try {
    const parsed = JSON.parse(payload) as Partial<CadPresenceNotification>;
    if (typeof parsed.tenantId !== 'string' || !parsed.tenantId) return null;
    if (typeof parsed.documentId !== 'string' || !parsed.documentId)
      return null;
    if (typeof parsed.peerId !== 'string' || !parsed.peerId) return null;
    return {
      tenantId: parsed.tenantId,
      documentId: parsed.documentId,
      peerId: parsed.peerId,
    };
  } catch {
    return null;
  }
}

/**
 * `pg.Client` necesita su PROPIA conexión dedicada para `LISTEN` (no puede
 * compartir el pool de TypeORM, que reutiliza y libera conexiones sin avisar
 * — perdería el LISTEN a la primera vez que el pool reciclara la sesión). Se
 * reconstruye la cadena de conexión con lo que YA usa `orm.options.ts` en vez
 * de duplicar sus reglas de SSL/host: si `DATABASE_URL` está, es la MISMA
 * cadena; si no, se arma desde las variables `DB_*` individuales.
 */
export function postgresConnectionString(dataSource: DataSource): string {
  const options = dataSource.options as {
    url?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
  };
  if (options.url) return options.url;
  const user = encodeURIComponent(options.username ?? '');
  const password = encodeURIComponent(options.password ?? '');
  const host = options.host ?? 'localhost';
  const port = options.port ?? 5432;
  const database = options.database ?? '';
  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}
