/**
 * Cliente fetch FINO y tipado de la API v1 de Valle Design.
 *
 * - Los tipos provienen ÍNTEGROS de `src/generated/design-api.ts`, generado
 *   desde `packages/contracts/specs/design-api.v1.yaml` (npm run generate).
 * - Transporte real (corrección R3 del contrato): la API responde los cuerpos
 *   DIRECTOS descritos por el spec — sin sobre `ApiSuccessEnvelope`. Un error
 *   HTTP se convierte en `DesignApiError` con el cuerpo contractual
 *   (`code`/`details`/`requestId`; en el 409 CAS, `expected`/`current` al
 *   nivel superior).
 * - MONTAJE DE RUTAS (decisión R1, documentada en el spec): el YAML describe
 *   los recursos como `/v1/<recurso>`; la implementación los monta bajo el
 *   prefijo de producto `/v1/cad/<recurso>`. Este cliente aplica ese mapeo en
 *   UN solo lugar (`resource()`); si el alias 1:1 se despliega algún día,
 *   basta con cambiar `mountPrefix` a `/v1`.
 */

import type { components } from "./generated/design-api";

type Schemas = components["schemas"];

export type CadProject = Schemas["CadProject"];
export type CadProjectCreate = Schemas["CadProjectCreate"];
export type CadProjectUpdate = Schemas["CadProjectUpdate"];
export type CadDocumentSummary = Schemas["CadDocumentSummary"];
export type CadDocumentCreate = Schemas["CadDocumentCreate"];
export type CadDocumentMetaUpdate = Schemas["CadDocumentMetaUpdate"];
export type CadDocumentResource = Schemas["CadDocumentResource"];
export type CadDocumentEnvelope = Schemas["CadDocumentEnvelope"];
export type CadDocumentInline = Schemas["CadDocumentInline"];
export type CadDocumentBlobPointer = Schemas["CadDocumentBlobPointer"];
export type CadDocumentSaveResult = Schemas["CadDocumentSaveResult"];
export type CadDocumentVersionSummary = Schemas["CadDocumentVersionSummary"];
export type CadDocumentVersionDetail = Schemas["CadDocumentVersionDetail"];
export type CadPublicationReceipt = Schemas["CadPublicationReceipt"];
export type CadPublicationCreate = Schemas["CadPublicationCreate"];
export type DxfBackground = Schemas["DxfBackground"];
export type DxfBackgroundUpload = Schemas["DxfBackgroundUpload"];
export type DxfPlacement = Schemas["DxfPlacement"];
export type DxfExport = Schemas["DxfExport"];
export type CadBlock = Schemas["CadBlock"];
export type CadBlockCreate = Schemas["CadBlockCreate"];
export type CadBlockUpdate = Schemas["CadBlockUpdate"];
export type ApiError = Schemas["ApiError"];
export type EntitlementRequiredError = Schemas["EntitlementRequiredError"];
export type CadDocumentVersionConflictError =
  Schemas["CadDocumentVersionConflictError"];

export interface Page<T> {
  items: T[];
  total?: number;
}

export interface PageQuery {
  q?: string;
  limit?: number;
  offset?: number;
}

/** Error HTTP de la API con el cuerpo contractual adjunto. */
export class DesignApiError extends Error {
  readonly status: number;
  readonly body: ApiError | null;
  /** Código contractual (`cad_*` / `entitlement_required`) si viajó. */
  readonly code: string | null;

  constructor(status: number, body: ApiError | null) {
    const message =
      (body && (Array.isArray(body.message) ? body.message.join('; ') : body.message)) ||
      `Design API respondió ${status}`;
    super(message);
    this.name = "DesignApiError";
    this.status = status;
    this.body = body;
    this.code = typeof body?.code === "string" ? body.code : null;
  }

  /** ¿Es el 409 CAS? Si sí, `expected`/`current` describen el conflicto. */
  isVersionConflict(): this is DesignApiError & {
    body: CadDocumentVersionConflictError;
  } {
    return this.code === "cad_document_version_conflict";
  }
}

export interface DesignClientOptions {
  /** Origen de la API, p.ej. `https://design.api.example.com` (sin ruta). */
  baseUrl: string;
  /** Bearer JWT de Platform (o proveedor por llamada). */
  token?: string | (() => string | null | undefined);
  /** fetch alternativo (tests, polyfills). Default: globalThis.fetch. */
  fetch?: typeof fetch;
  /**
   * Prefijo real de montaje de los recursos del YAML. Default `/v1/cad`
   * (decisión R1). El alias 1:1 del spec sería `/v1`.
   */
  mountPrefix?: string;
}

async function parseError(res: Response): Promise<DesignApiError> {
  let body: ApiError | null = null;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    body = null;
  }
  return new DesignApiError(res.status, body);
}

export function createDesignClient(options: DesignClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const mountPrefix = (options.mountPrefix ?? "/v1/cad").replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;

  const authHeader = (): Record<string, string> => {
    const token =
      typeof options.token === "function" ? options.token() : options.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  /** `/v1/documents/{id}` del YAML → `${baseUrl}${mountPrefix}/documents/{id}`. */
  const resource = (yamlPath: string, query?: PageQuery): string => {
    const mounted = yamlPath.replace(/^\/v1/, mountPrefix);
    const url = new URL(`${baseUrl}${mounted}`);
    if (query) {
      if (query.q !== undefined) url.searchParams.set("q", query.q);
      if (query.limit !== undefined) url.searchParams.set("limit", String(query.limit));
      if (query.offset !== undefined) url.searchParams.set("offset", String(query.offset));
    }
    return url.toString();
  };

  async function call<T>(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<T> {
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const res = await fetchImpl(url, {
      method,
      headers: {
        ...(body !== undefined && !isForm
          ? { "Content-Type": "application/json" }
          : {}),
        ...authHeader(),
      },
      body:
        body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
    if (!res.ok) throw await parseError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    projects: {
      list: (query?: PageQuery & { status?: string }) =>
        call<Page<CadProject>>("GET", resource("/v1/projects", query)),
      create: (input: CadProjectCreate) =>
        call<CadProject>("POST", resource("/v1/projects"), input),
      get: (projectId: string) =>
        call<CadProject>("GET", resource(`/v1/projects/${projectId}`)),
      update: (projectId: string, patch: CadProjectUpdate) =>
        call<CadProject>("PATCH", resource(`/v1/projects/${projectId}`), patch),
      archive: (projectId: string) =>
        call<CadProject>("DELETE", resource(`/v1/projects/${projectId}`)),
    },

    documents: {
      list: (query?: PageQuery & { projectId?: string }) =>
        call<Page<CadDocumentSummary>>("GET", resource("/v1/documents", query)),
      create: (input: CadDocumentCreate) =>
        call<CadDocumentSummary>("POST", resource("/v1/documents"), input),
      /**
       * Apertura HIDRATADA (R3): `cadDocument` llega SIEMPRE completo
       * (inline) aunque se persista como puntero a blob; incluye además la
       * colocación del DXF de fondo (`dxf`) o null.
       */
      open: (documentId: string) =>
        call<CadDocumentResource>("GET", resource(`/v1/documents/${documentId}`)),
      updateMeta: (documentId: string, patch: CadDocumentMetaUpdate) =>
        call<CadDocumentSummary>("PATCH", resource(`/v1/documents/${documentId}`), patch),
      archive: (documentId: string) =>
        call<void>("DELETE", resource(`/v1/documents/${documentId}`)),
      /** Guardado inline con CAS optimista (409 tipado vía DesignApiError). */
      saveContent: (
        documentId: string,
        cadDocument: CadDocumentInline,
        expectedCadDocumentVersion: number,
      ) =>
        call<CadDocumentSaveResult>(
          "PUT",
          resource(`/v1/documents/${documentId}/content`),
          { cadDocument, expectedCadDocumentVersion },
        ),
      /** Guardado de documento grande: gzip multipart (campo `file` + `payload`). */
      saveArchive: (
        documentId: string,
        gzippedDocument: Blob,
        expectedCadDocumentVersion: number,
      ) => {
        const form = new FormData();
        form.append("payload", JSON.stringify({ expectedCadDocumentVersion }));
        form.append("file", gzippedDocument, "cad-document.json.gz");
        return call<CadDocumentSaveResult>(
          "PUT",
          resource(`/v1/documents/${documentId}/archive`),
          form,
        );
      },
      versions: {
        list: (documentId: string, query?: PageQuery) =>
          call<Page<CadDocumentVersionSummary>>(
            "GET",
            resource(`/v1/documents/${documentId}/versions`, query),
          ),
        get: (documentId: string, version: number) =>
          call<CadDocumentVersionDetail>(
            "GET",
            resource(`/v1/documents/${documentId}/versions/${version}`),
          ),
      },
      publications: {
        list: (documentId: string) =>
          call<Page<CadPublicationReceipt>>(
            "GET",
            resource(`/v1/documents/${documentId}/publications`),
          ),
        /** El recibo contractual + el nuevo token CAS (declararlo al guardar). */
        record: (documentId: string, input: CadPublicationCreate) =>
          call<CadPublicationReceipt & { cadDocumentVersion: number }>(
            "POST",
            resource(`/v1/documents/${documentId}/publications`),
            input,
          ),
      },
      dxf: {
        get: (documentId: string) =>
          call<DxfBackground>("GET", resource(`/v1/documents/${documentId}/dxf`)),
        put: (documentId: string, input: DxfBackgroundUpload) =>
          call<DxfBackground>("PUT", resource(`/v1/documents/${documentId}/dxf`), input),
        remove: (documentId: string) =>
          call<void>("DELETE", resource(`/v1/documents/${documentId}/dxf`)),
        export: (documentId: string) =>
          call<DxfExport>("GET", resource(`/v1/documents/${documentId}/export/dxf`)),
      },
    },

    blocks: {
      list: (query?: PageQuery) =>
        call<Page<CadBlock>>("GET", resource("/v1/blocks", query)),
      create: (input: CadBlockCreate) =>
        call<CadBlock>("POST", resource("/v1/blocks"), input),
      get: (blockId: string) => call<CadBlock>("GET", resource(`/v1/blocks/${blockId}`)),
      update: (blockId: string, patch: CadBlockUpdate) =>
        call<CadBlock>("PATCH", resource(`/v1/blocks/${blockId}`), patch),
      remove: (blockId: string) =>
        call<void>("DELETE", resource(`/v1/blocks/${blockId}`)),
    },
  };
}

export type DesignClient = ReturnType<typeof createDesignClient>;
