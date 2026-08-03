import {
  layoutToCadDocument,
  migrateCadDocument,
  serializeCadDocument,
  type CadDocument,
} from "@/lib/cad/cad-document";
import { gzipCadDocumentJson } from "@/lib/cad/large-document-transport";

/**
 * The API stores documents above this boundary in the blob store. Sending the
 * same payload through the archive route avoids first materialising a second,
 * very large JSON request body in Nest.
 */
export const CAD_DOCUMENT_ARCHIVE_THRESHOLD_BYTES = 1_000_000;

export type DocumentLifecycleMetric =
  | "transport"
  | "migration"
  | "indexing"
  | "scene-sync"
  | "render"
  | "serialization";

export interface DocumentMetricSink {
  record(
    name: DocumentLifecycleMetric,
    durationMs: number,
    detail?: { documentId?: string; bytes?: number },
  ): void;
}

export interface DocumentLifecycleResource {
  cadDocument?: unknown;
  cadDocumentVersion?: number;
}

export interface DocumentLifecycleSaveReceipt {
  cadDocumentVersion: number;
}

/** Typed document operations supplied by the generated Design client. */
export interface DocumentLifecyclePort {
  open(documentId: string): Promise<DocumentLifecycleResource>;
  saveContent(
    documentId: string,
    document: CadDocument,
    expectedVersion: number,
  ): Promise<DocumentLifecycleSaveReceipt>;
  saveArchive(
    documentId: string,
    archive: Blob,
    expectedVersion: number,
  ): Promise<DocumentLifecycleSaveReceipt>;
  versionConflict(error: unknown): { current?: number } | null;
}

export interface OpenDocumentResult {
  documentId: string;
  document: CadDocument;
  version: number;
  metadata: Record<string, unknown>;
}

export interface SaveDocumentResult {
  documentId: string;
  document: CadDocument;
  version: number;
}

export class CadCasConflictError extends Error {
  readonly code = "cad_cas_conflict";
  constructor(
    readonly expectedVersion: number,
    readonly serverVersion?: number,
  ) {
    super(
      "El documento cambió en el servidor. Recarga o resuelve el conflicto antes de guardar.",
    );
  }
}

export type CadDocumentArchiveEncoder = (json: string) => Promise<Blob>;

const clock = () =>
  typeof performance === "undefined" ? Date.now() : performance.now();

/**
 * Puerto documental del editor. Sólo transporta el CadDocument canónico: el
 * motor sigue siendo dueño de comandos, selección y proyección de escena.
 */
export class DocumentLifecycleController {
  constructor(
    private readonly port: DocumentLifecyclePort,
    private readonly metrics?: DocumentMetricSink,
    private readonly encodeArchive: CadDocumentArchiveEncoder = gzipCadDocumentJson,
  ) {}

  async open(
    documentId: string,
    adapters: {
      index?: (document: CadDocument) => void | Promise<void>;
      syncScene?: (document: CadDocument) => void | Promise<void>;
      render?: () => void | Promise<void>;
    } = {},
  ): Promise<OpenDocumentResult> {
    let started = clock();
    const envelope = await this.port.open(documentId);
    // The generated client owns fetch + JSON decoding, so this is deliberately
    // one transport metric rather than fictitious download/parse sub-phases.
    this.metrics?.record("transport", clock() - started, { documentId });
    started = clock();
    const document =
      envelope.cadDocument == null
        ? layoutToCadDocument({}, { unit: "mm" })
        : migrateCadDocument(envelope.cadDocument);
    this.metrics?.record("migration", clock() - started, { documentId });
    if (adapters.index) {
      started = clock();
      await adapters.index(document);
      this.metrics?.record("indexing", clock() - started, { documentId });
    }
    if (adapters.syncScene) {
      started = clock();
      await adapters.syncScene(document);
      this.metrics?.record("scene-sync", clock() - started, { documentId });
    }
    if (adapters.render) {
      started = clock();
      await adapters.render();
      this.metrics?.record("render", clock() - started, { documentId });
    }
    return {
      documentId,
      document,
      version: Number(envelope.cadDocumentVersion ?? 0),
      metadata: { ...envelope },
    };
  }

  async save(
    documentId: string,
    document: CadDocument,
    expectedVersion: number,
  ): Promise<SaveDocumentResult> {
    const started = clock();
    // Deterministic serialization is measured independently and is also the
    // semantic boundary used by reopen/round-trip characterization tests.
    const serialized = serializeCadDocument(document);
    this.metrics?.record("serialization", clock() - started, {
      documentId,
      bytes: new TextEncoder().encode(serialized).byteLength,
    });
    const bytes = new TextEncoder().encode(serialized).byteLength;
    try {
      const receipt =
        bytes > CAD_DOCUMENT_ARCHIVE_THRESHOLD_BYTES
          ? await this.port.saveArchive(
              documentId,
              await this.gzip(serialized),
              expectedVersion,
            )
          : await this.port.saveContent(
              documentId,
              JSON.parse(serialized) as CadDocument,
              expectedVersion,
            );
      return {
        documentId,
        document,
        version: receipt.cadDocumentVersion,
      };
    } catch (error) {
      const conflict = this.port.versionConflict(error);
      if (conflict)
        throw new CadCasConflictError(expectedVersion, conflict.current);
      throw error;
    }
  }

  async createVersion(
    documentId: string,
    document: CadDocument,
    expectedVersion: number,
  ): Promise<SaveDocumentResult> {
    // El backend crea una versión inmutable en el mismo CAS; no existe un
    // segundo endpoint/modelo de snapshots que pueda divergir del canónico.
    return this.save(documentId, document, expectedVersion);
  }

  private async gzip(serialized: string) {
    const encodedArchive = await this.encodeArchive(serialized);
    return encodedArchive.type === "application/gzip"
      ? encodedArchive
      : new Blob([encodedArchive], { type: "application/gzip" });
  }
}
