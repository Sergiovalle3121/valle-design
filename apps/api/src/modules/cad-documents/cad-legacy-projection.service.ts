import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FindOptionsWhere, IsNull, LessThanOrEqual } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
  TenantScopedRepository,
  getTenantRepositoryToken,
} from '../../common/tenant/tenant-scoped.repository';
import { isUniqueViolation } from '../../common/database/unique-violation';
import { isStoredCadDocumentBlobPointer } from './cad-document-storage';
import { CadDocument } from './entities/cad-document.entity';
import { CadDocumentVersion } from './entities/cad-document-version.entity';

/**
 * Recorte estructural de la fila legacy `sf_line_layouts` que la proyección
 * necesita. Se declara aquí (y no se importa la entidad industrial) porque la
 * dirección permitida es line-engineering→cad-documents, nunca al revés.
 */
export interface LegacyCadLayoutInput {
  /** `sf_line_layouts.id` — se persiste como `legacy_source_id`. */
  id: string;
  tenantId: string | null;
  model: string;
  revision: string;
  /** Valor `cad_document` TAL CUAL vive en la fila (inline o puntero a blob). */
  cadDocument: Record<string, unknown> | null;
  /** Token CAS de la fila legacy. */
  cadDocumentVersion: number;
  /** Capas CAD de la fila legacy (LayoutLayer[] estructural). */
  layers?: readonly unknown[] | null;
  plantId?: string | null;
  organizationId?: string | null;
  createdBy?: string | null;
}

export type CadLegacyProjectionResult =
  | { status: 'skipped'; reason: 'sin_documento' | 'version_anterior' }
  | {
      status: 'projected';
      documentId: string;
      version: number;
      versionRecorded: boolean;
    };

/**
 * Proyección de compatibilidad (WP3): replica en las tablas CAD propias
 * (`cad_documents` + `cad_document_versions`) cada guardado CAD exitoso sobre
 * la tabla legacy `sf_line_layouts`, para que el producto Design lea su propio
 * modelo de datos sin esperar la copia histórica de Fase 4.
 *
 * Semántica (idempotente y monótona):
 * - Upsert por (tenant_id, legacy_source_id = sf_line_layouts.id).
 * - Solo avanza: el documento proyectado se actualiza si la versión CAS
 *   entrante es >= la proyectada; una versión menor NUNCA retrocede la fila
 *   (el guard vive en el UPDATE condicional, no en un check-then-save).
 * - El historial `cad_document_versions` registra la versión aceptada una sola
 *   vez — el índice único (document_id, version) hace la escritura idempotente.
 * - Un layout sin `cadDocument` no proyecta nada.
 *
 * El payload se copia TAL CUAL vive en la fila legacy (JSON inline o puntero a
 * blob de `cad-document-storage`): la proyección jamás duplica bytes de blobs.
 * Este servicio no conoce el ciclo de vida legacy: el llamador (adaptador
 * industrial) decide cuándo invocarla y la envuelve en fail-soft.
 */
@Injectable()
export class CadLegacyProjectionService {
  private readonly logger = new Logger(CadLegacyProjectionService.name);

  constructor(
    @Inject(getTenantRepositoryToken(CadDocument))
    private readonly documents: TenantScopedRepository<CadDocument>,
    @Inject(getTenantRepositoryToken(CadDocumentVersion))
    private readonly versions: TenantScopedRepository<CadDocumentVersion>,
  ) {}

  async projectFromLegacyLayout(
    layout: LegacyCadLayoutInput,
  ): Promise<CadLegacyProjectionResult> {
    if (!layout.cadDocument) {
      return { status: 'skipped', reason: 'sin_documento' };
    }
    const incomingVersion = Math.max(
      0,
      Math.floor(Number(layout.cadDocumentVersion) || 0),
    );
    const name = this.deriveName(layout);
    const model = (layout.model ?? '').trim().slice(0, 64) || null;
    const revision = (layout.revision ?? '').trim().slice(0, 16) || null;
    const layers = this.sanitizeLayers(layout.layers);

    let existing = await this.findProjected(layout);
    if (!existing) {
      const row = this.documents.create({
        name,
        model,
        revision,
        cadDocument: layout.cadDocument,
        cadDocumentVersion: incomingVersion,
        layers,
        legacySourceId: layout.id,
        created_by: layout.createdBy ?? null,
      });
      // El tenant lo manda la FILA LEGACY, no el contexto: una proyección del
      // lane de sistema (tenant NULL) debe quedarse en ese lane.
      row.tenant_id = layout.tenantId ?? null;
      row.organization_id = layout.organizationId ?? null;
      row.plant_id = layout.plantId ?? null;
      try {
        const saved = await this.documents.save(row);
        const versionRecorded = await this.recordVersion(
          layout,
          saved.id,
          incomingVersion,
        );
        return {
          status: 'projected',
          documentId: saved.id,
          version: incomingVersion,
          versionRecorded,
        };
      } catch (err) {
        // Carrera de primera proyección: el índice único parcial por
        // (tenant, legacy_source_id) arbitra; el perdedor continúa como update.
        if (!isUniqueViolation(err)) throw err;
        existing = await this.findProjected(layout);
        if (!existing) throw err;
      }
    }

    if (incomingVersion < existing.cadDocumentVersion) {
      return { status: 'skipped', reason: 'version_anterior' };
    }
    // Guard monótono a nivel SQL: solo avanza si la fila sigue en una versión
    // <= a la entrante — un escritor concurrente más nuevo nunca es pisado.
    const result = await this.documents.update(
      {
        ...this.tenantLane(layout),
        id: existing.id,
        cadDocumentVersion: LessThanOrEqual(incomingVersion),
        deleted_at: IsNull(),
      },
      // El mismo cast que usa el CAS legacy: QueryDeepPartialEntity no modela
      // bien columnas JSON tipadas como Record<string, unknown>.
      {
        name,
        model,
        revision,
        cadDocument: layout.cadDocument,
        cadDocumentVersion: incomingVersion,
        layers,
      } as unknown as QueryDeepPartialEntity<CadDocument>,
    );
    if (!result.affected) {
      return { status: 'skipped', reason: 'version_anterior' };
    }
    const versionRecorded = await this.recordVersion(
      layout,
      existing.id,
      incomingVersion,
    );
    return {
      status: 'projected',
      documentId: existing.id,
      version: incomingVersion,
      versionRecorded,
    };
  }

  /** Inserta la fila de historial si esa versión no existe aún (idempotente). */
  private async recordVersion(
    layout: LegacyCadLayoutInput,
    documentId: string,
    version: number,
  ): Promise<boolean> {
    const exists = await this.versions.findOne({
      where: { ...this.tenantLane(layout), documentId, version },
    });
    if (exists) return false;
    const row = this.versions.create({
      documentId,
      version,
      cadDocument: layout.cadDocument as Record<string, unknown>,
      sha256: this.storedDocumentSha256(
        layout.cadDocument as Record<string, unknown>,
      ),
      created_by: layout.createdBy ?? null,
    });
    row.tenant_id = layout.tenantId ?? null;
    row.organization_id = layout.organizationId ?? null;
    row.plant_id = layout.plantId ?? null;
    try {
      await this.versions.save(row);
      return true;
    } catch (err) {
      // (document_id, version) único: otra proyección concurrente ya la
      // registró — mismo resultado, no es un error.
      if (isUniqueViolation(err)) {
        this.logger.debug?.(
          `Versión ${version} del documento ${documentId} ya registrada.`,
        );
        return false;
      }
      throw err;
    }
  }

  private findProjected(
    layout: LegacyCadLayoutInput,
  ): Promise<CadDocument | null> {
    return this.documents.findOne({
      where: { ...this.tenantLane(layout), legacySourceId: layout.id },
    });
  }

  /** Predicado del lane del tenant de la fila legacy (NULL = lane sistema). */
  private tenantLane<T extends CadDocument | CadDocumentVersion>(
    layout: LegacyCadLayoutInput,
  ): FindOptionsWhere<T> {
    return {
      tenant_id: layout.tenantId ?? IsNull(),
    } as FindOptionsWhere<T>;
  }

  /** sha256 del archivo comprimido (puntero) o del JSON inline; null si n/d. */
  private storedDocumentSha256(stored: Record<string, unknown>): string | null {
    if (isStoredCadDocumentBlobPointer(stored)) {
      return stored._storage.sha256.toLowerCase();
    }
    try {
      return createHash('sha256').update(JSON.stringify(stored)).digest('hex');
    } catch {
      return null;
    }
  }

  private sanitizeLayers(
    layers: readonly unknown[] | null | undefined,
  ): Record<string, unknown>[] | null {
    if (!Array.isArray(layers)) return null;
    return layers.filter(
      (layer): layer is Record<string, unknown> =>
        !!layer && typeof layer === 'object' && !Array.isArray(layer),
    );
  }

  private deriveName(layout: LegacyCadLayoutInput): string {
    return (
      [layout.model, layout.revision]
        .map((part) => (part ?? '').trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 160) || 'CAD'
    );
  }
}
