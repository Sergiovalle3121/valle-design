import {
  layoutToCadDocument,
  migrateCadDocument,
  serializeCadDocument,
  type CadDocument,
} from "@/lib/cad/cad-document";

export type DocumentLifecycleMetric =
  | "download"
  | "parse"
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
export interface DocumentLifecycleTransport {
  request(path: string, init?: RequestInit): Promise<Response>;
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

const clock = () =>
  typeof performance === "undefined" ? Date.now() : performance.now();

/**
 * Puerto documental del editor. Sólo transporta el CadDocument canónico: el
 * motor sigue siendo dueño de comandos, selección y proyección de escena.
 */
export class DocumentLifecycleController {
  constructor(
    private readonly transport: DocumentLifecycleTransport,
    private readonly metrics?: DocumentMetricSink,
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
    const response = await this.transport.request(
      `/v1/cad/documents/${encodeURIComponent(documentId)}`,
    );
    this.metrics?.record("download", clock() - started, { documentId });
    if (!response.ok)
      throw new Error(`No se pudo abrir el documento (${response.status}).`);
    started = clock();
    const text = await response.text();
    const envelope = JSON.parse(text) as Record<string, unknown>;
    this.metrics?.record("parse", clock() - started, {
      documentId,
      bytes: new TextEncoder().encode(text).byteLength,
    });
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
      metadata: envelope,
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
    const response = await this.transport.request(
      `/v1/cad/documents/${encodeURIComponent(documentId)}/content`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadDocument: JSON.parse(serialized),
          expectedCadDocumentVersion: expectedVersion,
        }),
      },
    );
    if (response.status === 409) {
      const body = (await response.json().catch(() => ({}))) as {
        cadDocumentVersion?: number;
      };
      throw new CadCasConflictError(expectedVersion, body.cadDocumentVersion);
    }
    if (!response.ok)
      throw new Error(`No se pudo guardar el documento (${response.status}).`);
    const body = (await response.json()) as Record<string, unknown>;
    return {
      documentId,
      document,
      version: Number(body.cadDocumentVersion ?? expectedVersion + 1),
    };
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
}
