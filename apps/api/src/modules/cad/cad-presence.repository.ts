import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { CadPresenceBeat } from './entities/cad-presence-beat.entity';

export interface CadPresenceBeatWrite {
  peerId: string;
  name: string;
  cursor: { x: number; y: number } | null;
  viewport: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

/**
 * Acceso fino a `cad_presence_beats`. Sin CAS, sin historia: cada latido
 * SOBRESCRIBE la fila de su `(tenant, documento, peer)` — la última posición
 * es la única que importa.
 *
 * ── Por qué NO usa `TenantScopedRepository` ─────────────────────────────────
 * El filtro automático de esa clase lee el tenant del
 * `AsyncLocalStorage` de la petición en curso — correcto para un handler
 * normal, pero `CadPresenceService.stream()` reacciona a un `Subject` que
 * dispara SINCRÓNICAMENTE dentro de la petición de OTRO peer (el que acaba
 * de publicar, ver `CadPresenceBus`): en ese instante, el ALS activo es el de
 * quien PUBLICÓ, no el de quien está ESCUCHANDO. Confiar en el ALS ahí
 * mezclaría el tenant equivocado. Por eso el tenant llega SIEMPRE como
 * parámetro explícito — la misma disciplina que el resto de la base ya exige
 * para los métodos que `TenantScopedRepository` no cubre — y nunca del ALS.
 */
@Injectable()
export class CadPresenceRepository {
  constructor(
    @InjectRepository(CadPresenceBeat)
    private readonly beats: Repository<CadPresenceBeat>,
  ) {}

  async upsert(
    tenantId: string,
    documentId: string,
    input: CadPresenceBeatWrite,
  ): Promise<void> {
    await this.beats.upsert(
      {
        tenant_id: tenantId,
        documentId,
        peerId: input.peerId,
        // 160 es el tope de la columna (ver migración); recortar aquí en vez
        // de dejar que el driver lo rechace con un error de CHECK opaco.
        name: input.name.slice(0, 160),
        cursorX: input.cursor?.x ?? null,
        cursorY: input.cursor?.y ?? null,
        viewportMinX: input.viewport?.minX ?? null,
        viewportMinY: input.viewport?.minY ?? null,
        viewportMaxX: input.viewport?.maxX ?? null,
        viewportMaxY: input.viewport?.maxY ?? null,
        // Siempre false: esta superficie exige sesión first-party (ver
        // cabecera de la entidad) — nunca hay un invitado detrás de un POST
        // autenticado aquí.
        guest: false,
        updatedAt: new Date(),
      },
      { conflictPaths: ['tenant_id', 'documentId', 'peerId'] },
    );
  }

  /**
   * UN peer, si su latido sigue dentro del TTL — `null` si no existe o ya
   * caducó. Es la lectura que alimenta el push EN VIVO (`CadPresenceService.
   * stream`): sólo el peer que de verdad cambió, nunca el documento entero
   * (ver `CadPresenceBus` para el porqué).
   */
  async findLivePeer(
    tenantId: string,
    documentId: string,
    peerId: string,
    ttlMs: number,
  ): Promise<CadPresenceBeat | null> {
    return this.beats.findOne({
      where: {
        tenant_id: tenantId,
        documentId,
        peerId,
        updatedAt: MoreThan(new Date(Date.now() - ttlMs)),
      },
    });
  }

  /** Peers vivos de un documento: latido dentro del TTL, más recientes primero. */
  async snapshot(
    tenantId: string,
    documentId: string,
    ttlMs: number,
  ): Promise<CadPresenceBeat[]> {
    return this.beats.find({
      where: {
        tenant_id: tenantId,
        documentId,
        updatedAt: MoreThan(new Date(Date.now() - ttlMs)),
      },
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * Barrido de TTL: cruza TODOS los tenants a propósito (es un job de
   * mantenimiento, no una operación por request), así que no lleva
   * `tenant_id` en absoluto — igual que documenta la base para este tipo de
   * barrido (ver `CadPresenceCleanupService`).
   */
  async deleteExpired(ttlMs: number): Promise<number> {
    const result = await this.beats
      .createQueryBuilder()
      .delete()
      .from(CadPresenceBeat)
      .where('"updated_at" < :cutoff', {
        cutoff: new Date(Date.now() - ttlMs),
      })
      .execute();
    return result.affected ?? 0;
  }
}
