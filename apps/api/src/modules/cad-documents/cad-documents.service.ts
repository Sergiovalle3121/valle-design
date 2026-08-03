import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CAD_DOCUMENT_MAX_ARCHIVE_BYTES,
  PersistedCadDocument,
  validateCadDocumentPayload,
} from './cad-document-validation';
import {
  buildCadDocumentBlobPointer,
  CAD_DOCUMENT_BLOB_THRESHOLD_BYTES,
  decodeCadDocumentArchive,
  encodeCadDocumentArchive,
  isStoredCadDocumentBlobPointer,
} from './cad-document-storage';
import { CAD_BLOB_STORE } from './ports/cad-blob-store.port';
import type { CadBlobStore } from './ports/cad-blob-store.port';
import { buildDxf, DxfBox, DxfSegment, DxfText } from './line-dxf';

/**
 * Registro con la colocación del plano DXF de fondo (metadatos, nunca el dibujo
 * crudo). Subconjunto estructural de `SfLineLayout`: se declara aquí para que
 * cad-documents no dependa de las entidades industriales (dirección prohibida).
 */
export interface CadDxfPlacementRecord {
  dxfData: string | null;
  dxfName: string | null;
  dxfOffsetX: number;
  dxfOffsetY: number;
  dxfScale: number;
  dxfRotation: number;
  dxfVisible: boolean;
  dxfOpacity: number;
}

/** DXF background placement (metadata only — the raw DXF is fetched apart). */
export interface CadDxfPlacement {
  name: string;
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  visible: boolean;
  opacity: number;
}

/** Entrada estructural de la colocación DXF; `DxfMetaDto` la satisface. */
export interface CadDxfMetaInput {
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
}

/** Entrada para preparar el guardado del documento canónico (rama CAD). */
export interface CadDocumentSaveInput {
  /** Documento crudo tal como llegó en el DTO (rama JSON inline). */
  document?: Record<string, unknown>;
  /** Documento ya validado (rama archivo gzip); tiene prioridad sobre `document`. */
  validatedDocument?: PersistedCadDocument;
  /** Token de concurrencia optimista declarado por el escritor. */
  expectedVersion?: number;
  /** Valor `cadDocument` persistido hoy (inline o puntero a blob), o null. */
  storedDocument: Record<string, unknown> | null;
  /** Versión actual del documento persistido (0 si nunca se guardó). */
  currentVersion: number;
  /** true cuando el registro contenedor aún no existe (primera escritura). */
  isNewDocument: boolean;
}

/** Resultado de la preparación: documento listo para almacenar + CAS. */
export interface CadDocumentSavePlan {
  expectedVersion: number;
  document: PersistedCadDocument;
  /** true si el documento persistido ya vivía como puntero a blob. */
  storedAsBlobPointer: boolean;
  entityCount: number;
}

/** Metadatos del PDF multi-hoja generado localmente + actor que publica. */
export interface CadPublicationInput {
  paperSpaceIds: string[];
  fileName: string;
  sha256: string;
  bytes: number;
  publishedBy: string;
}

/** Recibo inmutable de publicación anexado al documento canónico. */
export interface CadPublicationReceipt {
  id: string;
  paperSpaceIds: string[];
  fileName: string;
  sha256: string;
  bytes: number;
  publishedAt: string;
  publishedBy: string;
}

export interface CadPublicationPlan {
  publication: CadPublicationReceipt;
  /** Documento resultante (inline o puntero) listo para el CAS del adaptador. */
  storedDocument: Record<string, unknown>;
}

/** Entrada estructural para exportar el layout como DXF (Fase 53). */
export interface CadLayoutDxfInput {
  model: string;
  revision: string;
  footprint: { footprintW: number; footprintH: number; unit: string };
  stations: {
    id: string;
    station: string;
    x: number | null;
    y: number | null;
    w: number | null;
    h: number | null;
    rotation: number | null;
  }[];
  assets: {
    kind: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
    label?: string;
  }[];
  connectors: { from: string; to: string }[];
  annotations: {
    type: string;
    x: number;
    y: number;
    x2?: number;
    y2?: number;
    text?: string;
  }[];
}

/**
 * Servicio de DOMINIO del documento CAD canónico (WP2b). Opera exclusivamente
 * sobre valores que le pasan (documento persistido, buffers, actor) más su
 * única dependencia propia: el puerto neutral CadBlobStore (WP2c; opcional,
 * igual que en el adaptador industrial — en enterprise lo satisface
 * EnterpriseBlobStoreAdapter sobre el blob store de documents). NUNCA toca
 * repositorios de line-engineering — el ciclo de vida de `sf_line_layouts`
 * (CAS SQL incluido) y el event ledger quedan en `LineEngineeringService`,
 * que delega aquí la lógica CAD pura.
 */
@Injectable()
export class CadDocumentsService {
  constructor(
    @Optional()
    @Inject(CAD_BLOB_STORE)
    private readonly cadBlobs?: CadBlobStore,
  ) {}

  requireCadBlobs(): CadBlobStore {
    if (!this.cadBlobs) {
      throw new ServiceUnavailableException(
        'El almacenamiento de archivos CAD no está disponible.',
      );
    }
    return this.cadBlobs;
  }

  /** Rehidrata un valor `cadDocument` persistido (inline o puntero a blob). */
  async hydrateCadDocument(
    stored: Record<string, unknown>,
  ): Promise<PersistedCadDocument> {
    if (!isStoredCadDocumentBlobPointer(stored)) {
      return validateCadDocumentPayload(stored);
    }
    const compressed = await this.requireCadBlobs().get(
      stored._storage.blobKey,
    );
    const decoded = await decodeCadDocumentArchive(compressed, stored._storage);
    return validateCadDocumentPayload(decoded, {
      maxBytes: CAD_DOCUMENT_MAX_ARCHIVE_BYTES,
    });
  }

  /** Almacena el documento: inline si es compacto, gzip→blob si no (o forzado). */
  async storeCadDocument(
    document: PersistedCadDocument,
    forceArchive = false,
    transaction?: unknown,
  ): Promise<Record<string, unknown>> {
    const bytes = Buffer.byteLength(JSON.stringify(document), 'utf8');
    if (!forceArchive && bytes <= CAD_DOCUMENT_BLOB_THRESHOLD_BYTES) {
      return document;
    }
    const archive = await encodeCadDocumentArchive(document);
    const put = await this.requireCadBlobs().put(
      archive.compressed,
      archive.compressedSha256,
      transaction,
    );
    if (
      put.sha256 !== archive.compressedSha256 ||
      put.size !== archive.compressed.length
    ) {
      throw new ServiceUnavailableException(
        'El almacenamiento CAD no confirmó la integridad del archivo.',
      );
    }
    return buildCadDocumentBlobPointer(document, archive, put.blobKey);
  }

  /** Decodifica y valida un archivo gzip subido con el documento canónico. */
  async decodeCadDocumentUpload(
    compressedCadDocument: Buffer,
  ): Promise<PersistedCadDocument> {
    const decoded = await decodeCadDocumentArchive(compressedCadDocument);
    return validateCadDocumentPayload(decoded, {
      maxBytes: CAD_DOCUMENT_MAX_ARCHIVE_BYTES,
    });
  }

  /**
   * Rehidrata el documento capturado en un snapshot y lo vuelve a almacenar
   * (inline o blob según cómo vivía), listo para asignarse al registro vivo.
   */
  async restoreStoredCadDocument(
    stored: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const restoredDocument = await this.hydrateCadDocument(stored);
    return this.storeCadDocument(
      restoredDocument,
      isStoredCadDocumentBlobPointer(stored),
    );
  }

  /**
   * Valida el guardado del documento canónico ANTES del CAS del adaptador:
   * exige el token de concurrencia, valida el payload, fija los recibos de
   * publicación (server-managed: el escritor debe hacer eco exacto de lo que
   * leyó) y rechaza a un escritor desfasado sobre un registro recién creado.
   * No persiste nada — devuelve el plan que el adaptador almacena y CASea.
   */
  async prepareCadDocumentSave(
    input: CadDocumentSaveInput,
  ): Promise<CadDocumentSavePlan> {
    const expected = input.expectedVersion;
    if (expected === undefined) {
      throw new BadRequestException({
        code: 'cad_document_version_required',
        message:
          'expectedCadDocumentVersion es obligatorio al guardar el documento CAD.',
      });
    }
    const validated =
      input.validatedDocument ?? validateCadDocumentPayload(input.document);
    const persistedDocument = input.storedDocument
      ? await this.hydrateCadDocument(input.storedDocument)
      : null;
    const persistedPublications: unknown[] = Array.isArray(
      persistedDocument?.publications,
    )
      ? (persistedDocument.publications as unknown[])
      : [];
    const requestedPublications: unknown[] = Array.isArray(
      validated.publications,
    )
      ? (validated.publications as unknown[])
      : [];
    const publicationMutationRequested =
      Object.prototype.hasOwnProperty.call(validated, 'publications') === true;
    const publicationSignature = (raw: unknown) => {
      const value =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      return JSON.stringify([
        value.id,
        value.paperSpaceIds,
        value.fileName,
        value.sha256,
        value.bytes,
        value.publishedAt,
        value.publishedBy,
      ]);
    };
    // Publication receipts are server-managed. A current writer must echo
    // the exact list it read; only the publication endpoint may append one.
    // A stale writer reaches the CAS afterwards and receives the normal 409.
    if (
      expected === input.currentVersion &&
      publicationMutationRequested &&
      (requestedPublications.length !== persistedPublications.length ||
        requestedPublications.some(
          (receipt, index) =>
            publicationSignature(receipt) !==
            publicationSignature(persistedPublications[index]),
        ))
    ) {
      throw new BadRequestException({
        code: 'cad_publications_server_managed',
        message:
          'Los recibos de publicación sólo pueden crearse mediante el endpoint de publicación.',
      });
    }
    if (persistedPublications.length || publicationMutationRequested) {
      validated.publications = persistedPublications;
    }
    if (input.isNewDocument && expected !== 0) {
      throw new ConflictException({
        code: 'cad_document_version_conflict',
        message:
          'El dibujo cambió desde la última carga. Recarga y compara antes de guardar.',
        expected,
        current: 0,
      });
    }
    return {
      expectedVersion: expected,
      document: validated,
      storedAsBlobPointer: isStoredCadDocumentBlobPointer(input.storedDocument),
      entityCount: Array.isArray(validated.entities)
        ? validated.entities.length
        : 0,
    };
  }

  /**
   * Construye el recibo inmutable de publicación y el documento siguiente
   * (meta.version+1, entrada de historial y recibo anexado), validado y listo
   * para el CAS del adaptador. El actor lo aporta el llamador.
   */
  async appendCadPublication(
    storedCadDocument: Record<string, unknown>,
    input: CadPublicationInput,
    transaction?: unknown,
  ): Promise<CadPublicationPlan> {
    const current = await this.hydrateCadDocument(storedCadDocument);
    const paperSpaces: unknown[] = Array.isArray(current.paperSpaces)
      ? (current.paperSpaces as unknown[])
      : [];
    const publishableIds = new Set(
      paperSpaces.flatMap((rawSpace) => {
        if (!rawSpace || typeof rawSpace !== 'object') return [];
        const space = rawSpace as Record<string, unknown>;
        return typeof space.id === 'string' && space.includeInPublish !== false
          ? [space.id]
          : [];
      }),
    );
    const paperSpaceIds = input.paperSpaceIds.map((id) => id.trim());
    if (
      new Set(paperSpaceIds).size !== paperSpaceIds.length ||
      paperSpaceIds.some((id) => !publishableIds.has(id))
    ) {
      throw new BadRequestException(
        'La publicación contiene hojas duplicadas, excluidas o inexistentes.',
      );
    }
    const publishedAt = new Date().toISOString();
    const publication: CadPublicationReceipt = {
      id: randomUUID(),
      paperSpaceIds,
      fileName: input.fileName.trim(),
      sha256: input.sha256.toLowerCase(),
      bytes: input.bytes,
      publishedAt,
      publishedBy: input.publishedBy,
    };
    const meta =
      current.meta &&
      typeof current.meta === 'object' &&
      !Array.isArray(current.meta)
        ? (current.meta as Record<string, unknown>)
        : {};
    const contentVersion = Number.isInteger(Number(meta.version))
      ? Number(meta.version)
      : 0;
    const history: unknown[] = Array.isArray(current.history)
      ? (current.history as unknown[])
      : [];
    const publications: unknown[] = Array.isArray(current.publications)
      ? (current.publications as unknown[])
      : [];
    const nextDocument = validateCadDocumentPayload(
      {
        ...current,
        meta: { ...meta, version: contentVersion + 1 },
        history: [
          ...history,
          {
            version: contentVersion + 1,
            label: `Publicar ${publication.fileName}`,
          },
        ],
        publications: [...publications, publication],
      },
      { maxBytes: CAD_DOCUMENT_MAX_ARCHIVE_BYTES },
    );
    const storedDocument = await this.storeCadDocument(
      nextDocument,
      isStoredCadDocumentBlobPointer(storedCadDocument),
      transaction,
    );
    return { publication, storedDocument };
  }

  /** Proyección de lectura de la colocación DXF (null = sin plano de fondo). */
  toDxfPlacement(layout: CadDxfPlacementRecord): CadDxfPlacement | null {
    if (!layout.dxfData) return null;
    return {
      name: layout.dxfName || 'plano.dxf',
      offsetX: Number(layout.dxfOffsetX) || 0,
      offsetY: Number(layout.dxfOffsetY) || 0,
      scale: Number(layout.dxfScale) || 1,
      rotation: Number(layout.dxfRotation) || 0,
      visible: layout.dxfVisible !== false,
      opacity: Number(layout.dxfOpacity ?? 0.5),
    };
  }

  /** Aplica (mutando el registro) la colocación DXF saneada campo a campo. */
  applyDxfMeta(layout: CadDxfPlacementRecord, meta: CadDxfMetaInput): void {
    if (meta.offsetX !== undefined)
      layout.dxfOffsetX = Number(meta.offsetX) || 0;
    if (meta.offsetY !== undefined)
      layout.dxfOffsetY = Number(meta.offsetY) || 0;
    if (meta.scale !== undefined)
      layout.dxfScale = clampPos(meta.scale, layout.dxfScale || 1);
    if (meta.rotation !== undefined)
      layout.dxfRotation = Number(meta.rotation) || 0;
    if (meta.visible !== undefined) layout.dxfVisible = !!meta.visible;
    if (meta.opacity !== undefined)
      layout.dxfOpacity = Math.min(1, Math.max(0, Number(meta.opacity) || 0));
  }

  /**
   * Serializa el layout como DXF AutoCAD R12 (Fase 53): estaciones, equipo,
   * muros/zonas, flujo y anotaciones sobre capas CAD nombradas, vía `buildDxf`.
   */
  buildLayoutDxf(input: CadLayoutDxfInput): {
    model: string;
    revision: string;
    unit: string;
    filename: string;
    dxf: string;
  } {
    const fp = input.footprint;

    const boxes: DxfBox[] = [];
    const centerById = new Map<string, { cx: number; cy: number }>();
    for (const s of input.stations) {
      if (s.x === null || s.y === null || s.w === null || s.h === null)
        continue;
      boxes.push({
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        rotation: s.rotation ?? 0,
        label: s.station,
        layer: 'ESTACIONES',
      });
      centerById.set(s.id, { cx: s.x + s.w / 2, cy: s.y + s.h / 2 });
    }
    for (const a of input.assets ?? []) {
      const layer =
        a.kind === 'wall' ? 'MUROS' : a.kind === 'zone' ? 'ZONAS' : 'EQUIPO';
      boxes.push({
        x: a.x,
        y: a.y,
        w: a.w,
        h: a.h,
        rotation: a.rotation ?? 0,
        label: a.label || a.kind,
        layer,
      });
    }

    const segments: DxfSegment[] = [];
    for (const c of input.connectors ?? []) {
      const a = centerById.get(c.from),
        b = centerById.get(c.to);
      if (a && b)
        segments.push({
          x1: a.cx,
          y1: a.cy,
          x2: b.cx,
          y2: b.cy,
          layer: 'FLUJO',
        });
    }

    const texts: DxfText[] = [];
    for (const an of input.annotations ?? []) {
      if (an.type === 'dim' && an.x2 !== undefined && an.y2 !== undefined) {
        segments.push({
          x1: an.x,
          y1: an.y,
          x2: an.x2,
          y2: an.y2,
          layer: 'COTAS',
        });
      } else if (an.type === 'text' && an.text) {
        texts.push({ x: an.x, y: an.y, text: an.text, layer: 'TEXTO' });
      }
    }

    const dxf = buildDxf({
      footprintW: fp.footprintW,
      footprintH: fp.footprintH,
      unit: fp.unit,
      boxes,
      segments,
      texts,
    });
    const slug = `${input.model}_${input.revision}`.replace(
      /[^a-zA-Z0-9_-]+/g,
      '-',
    );
    return {
      model: input.model,
      revision: input.revision,
      unit: fp.unit,
      filename: `layout_${slug}.dxf`,
      dxf,
    };
  }
}

/** Coerce to a positive finite number, falling back to `fallback` otherwise. */
function clampPos(n: number, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
