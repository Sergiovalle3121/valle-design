import { Injectable, type MessageEvent } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { concat, defer, from, interval, merge, type Observable } from 'rxjs';
import { concatMap, filter, map } from 'rxjs/operators';
import { CadPresenceRepository } from './cad-presence.repository';
import { CAD_PRESENCE_CHANNEL, CadPresenceBus } from './cad-presence.bus';
import { CadDocumentsRepository } from './cad-documents.repository';
import type { CadPresenceBeat } from './entities/cad-presence-beat.entity';

/**
 * Mismos valores que `apps/web/src/lib/cad/collab/presence.ts`
 * (`CAD_PRESENCE_BEAT_MS`/`CAD_PRESENCE_TTL_MS`) — DECLARADAMENTE una copia y
 * no una importación: el API y el web app son paquetes separados sin
 * dependencia cruzada (ver AGENTS.md, "no runtime dependency on another
 * product"), y la aritmética de caducidad no cambia con la frecuencia que
 * justificaría una dependencia compartida sólo para esto.
 */
export const CAD_PRESENCE_BEAT_MS = 4_000;
export const CAD_PRESENCE_TTL_MS = 12_000;
/** Ritmo del `ping` SSE — mantiene vivas las conexiones detrás de un proxy inactivo. */
const SSE_PING_MS = 15_000;

export interface CadPresenceBeatInput {
  peerId: string;
  cursor: { x: number; y: number } | null;
  viewport: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

/** Espejo de `CadPresenceBeat` del cliente (presence.ts) — lo que viaja por SSE. */
export interface CadPresenceWireBeat {
  peerId: string;
  documentId: string;
  name: string;
  at: number;
  cursor: { x: number; y: number } | null;
  viewport: { minX: number; minY: number; maxX: number; maxY: number } | null;
  guest: boolean;
}

/**
 * Presencia EN VIVO por servidor: el segundo adaptador del puerto
 * `CadPresenceChannelPort` (ver `apps/web/.../collab/presence-channel.ts`),
 * esta vez cruzando máquinas de verdad.
 *
 * El documento canónico NO SE TOCA — ni lectura de `cad_document`, ni CAS, ni
 * cola de guardado. Sólo se usa `CadDocumentsRepository.getDocument` para la
 * MISMA verificación de pertenencia tenant-scoped que ya hacen
 * `CadReviewRepository`/`CadSheetSetsRepository`: un `documentId` de otro
 * tenant responde 404, nunca datos ajenos.
 */
@Injectable()
export class CadPresenceService {
  constructor(
    private readonly repository: CadPresenceRepository,
    private readonly bus: CadPresenceBus,
    private readonly documents: CadDocumentsRepository,
    private readonly dataSource: DataSource,
  ) {}

  async publishBeat(
    tenantId: string,
    documentId: string,
    authorEmail: string,
    input: CadPresenceBeatInput,
  ): Promise<void> {
    await this.documents.getDocument(documentId);
    await this.repository.upsert(tenantId, documentId, {
      peerId: input.peerId,
      name: displayNameFromEmail(authorEmail),
      cursor: input.cursor,
      viewport: input.viewport,
    });
    // En proceso primero (cero latencia para las réplica que acaba de
    // escribir), NOTIFY después (para las demás — ver cabecera del bus).
    const notification = { tenantId, documentId, peerId: input.peerId };
    this.bus.publishLocal(notification);
    if (this.dataSource.options.type === 'postgres') {
      await this.dataSource.query('SELECT pg_notify($1, $2)', [
        CAD_PRESENCE_CHANNEL,
        JSON.stringify(notification),
      ]);
    }
  }

  async snapshotBeats(
    tenantId: string,
    documentId: string,
  ): Promise<CadPresenceWireBeat[]> {
    const rows = await this.repository.snapshot(
      tenantId,
      documentId,
      CAD_PRESENCE_TTL_MS,
    );
    return rows.map(toWireBeat);
  }

  /**
   * `documentId`/`tenantId` llegan YA CAPTURADOS por el controller (fuera de
   * cualquier callback async) — ver la nota de `cad-presence.controller.ts`
   * sobre por qué el `AsyncLocalStorage` del tenant no puede leerse dentro de
   * un stream que sigue vivo más allá de la petición que lo abrió.
   */
  async stream(
    tenantId: string,
    documentId: string,
  ): Promise<Observable<MessageEvent>> {
    await this.documents.getDocument(documentId);

    const snapshotEvents = () =>
      from(this.snapshotBeats(tenantId, documentId)).pipe(
        concatMap((beats) =>
          beats.map((beat): MessageEvent => ({ data: beat })),
        ),
      );

    // SÓLO el peer que cambió, nunca el documento entero: reenviar una fila
    // sin cambios cada vez que OTRO peer late resetea el reloj LOCAL de
    // caducidad de quien escucha (`receivedAt` en presence.ts) y duplica el
    // TTL real — medido en `cad-presencia-viva.spec.ts` antes de este
    // filtro. Un `findLivePeer` que no encuentra nada (caducó entre el
    // NOTIFY y esta lectura) no emite evento: la ausencia no es una señal,
    // el TTL local del cliente es quien decide que alguien se fue.
    const live = this.bus.stream().pipe(
      filter(
        (notification) =>
          notification.tenantId === tenantId &&
          notification.documentId === documentId,
      ),
      concatMap((notification) =>
        from(
          this.repository.findLivePeer(
            tenantId,
            documentId,
            notification.peerId,
            CAD_PRESENCE_TTL_MS,
          ),
        ),
      ),
      filter((row): row is NonNullable<typeof row> => row !== null),
      map((row): MessageEvent => ({ data: toWireBeat(row) })),
    );

    // `ping` lleva un `type` propio a propósito: `EventSource.onmessage` sólo
    // recibe eventos del tipo por defecto ("message"), así que el cliente no
    // necesita filtrar el ping — nunca llega a `onmessage`, sólo lo vería
    // quien registrara `addEventListener('ping', …)`, y nadie lo hace.
    const heartbeat = interval(SSE_PING_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: {} })),
    );

    return concat(defer(snapshotEvents), merge(live, heartbeat));
  }
}

function toWireBeat(row: CadPresenceBeat): CadPresenceWireBeat {
  return {
    peerId: row.peerId,
    documentId: row.documentId,
    name: row.name,
    at: row.updatedAt.getTime(),
    cursor:
      row.cursorX === null || row.cursorY === null
        ? null
        : { x: row.cursorX, y: row.cursorY },
    viewport:
      row.viewportMinX === null ||
      row.viewportMinY === null ||
      row.viewportMaxX === null ||
      row.viewportMaxY === null
        ? null
        : {
            minX: row.viewportMinX,
            minY: row.viewportMinY,
            maxX: row.viewportMaxX,
            maxY: row.viewportMaxY,
          },
    guest: row.guest,
  };
}

/**
 * Nombre visible derivado del EMAIL de la sesión autenticada — nunca de un
 * campo que mande el cliente (ver `cad-presence.dto.ts`): así nadie puede
 * anunciarse por SSE con el nombre de un compañero.
 */
function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local.slice(0, 160);
}
