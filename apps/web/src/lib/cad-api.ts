"use client";

/**
 * ADAPTADOR LEGACY→v1 DEL EDITOR CAD (R2).
 *
 * El editor (`Layout3DEditor`) llegó del origen con sus ~21 call sites
 * `${API_BASE}/line-engineering/*` INTACTOS. La API real de Valle Design (R1)
 * expone `/v1/cad/*` (contrato `packages/contracts/specs/design-api.v1.yaml`)
 * direccionado por documentId, no por model+revision. Este módulo traduce
 * cada ruta legacy a su equivalente v1 — sin tocar el editor y sin mocks: cada
 * respuesta sintetizada aquí proviene de llamadas REALES a la API.
 *
 * ── MAPA DE RUTAS legacy → /v1/cad ─────────────────────────────────────────
 *  GET    /line-engineering/cad-blocks            → GET    /v1/cad/blocks               ({items}→array)
 *  POST   /line-engineering/cad-blocks            → POST   /v1/cad/blocks               (payload 1:1)
 *  PATCH  /line-engineering/cad-blocks/:id        → PATCH  /v1/cad/blocks/:id           (payload 1:1)
 *  DELETE /line-engineering/cad-blocks/:id        → DELETE /v1/cad/blocks/:id           (204)
 *  GET    /line-engineering/layout                → GET    /v1/cad/documents/:id (+ /dxf) — model+revision
 *                                                   se resuelven contra GET /v1/cad/documents; sin fila se
 *                                                   responde el layout por defecto (semántica legacy: el GET
 *                                                   nunca 404ea por modelo inexistente).
 *  PUT    /line-engineering/layout                → PUT    /v1/cad/documents/:id/content (upsert: crea el
 *                                                   documento si no existe; sólo viaja {cadDocument,
 *                                                   expectedCadDocumentVersion} — CAS idéntico).
 *  PUT    /line-engineering/layout/cad-archive    → PUT    /v1/cad/documents/:id/archive (campo multipart
 *                                                   `layout` → `payload` {expectedCadDocumentVersion}; el gzip
 *                                                   se reempaqueta con la huella/grupos parcheados).
 *  GET    /line-engineering/layout/dxf            → GET    /v1/cad/documents/:id/dxf
 *  PUT    /line-engineering/layout/dxf            → PUT    /v1/cad/documents/:id/dxf     (sin model/revision)
 *  DELETE /line-engineering/layout/dxf            → DELETE /v1/cad/documents/:id/dxf
 *  POST   /line-engineering/layout/cad-intent     → POST   /v1/cad/documents/:id/intent  ({prompt})
 *  POST   /line-engineering/layout/vision         → POST   /v1/cad/vision                (imageDataUrl→image)
 *  POST   /line-engineering/layout/publications   → POST   /v1/cad/documents/:id/publications
 *                                                   (respuesta plana v1 → {publication, cadDocumentVersion})
 *  POST   /line-engineering/layout/clone          → composición v1: GET documento origen + PUT content destino
 *                                                   (mismo CAS del destino; misma semántica del clone legacy).
 *
 * ── SIN EQUIVALENTE EN /v1/cad → 404 limpio (el editor ya lo maneja) ───────
 *  layout/snapshots[...]: versiones de servidor con nombre — no forman parte
 *    del contrato v1 (la historia CAS inmutable vive en /versions, sin
 *    nombre/restauración); los snapshots LOCALES del editor siguen operativos.
 *  layout/approval: flujo de aprobación (gobernanza enterprise).
 *  layout/optimize, layout/optimize-copilot: optimización industrial de
 *    estaciones de línea.
 *  layout/density, layout/clearance: analítica industrial de planta.
 *  layout/{status|heatmap|completeness|bays|quality}: overlays MES/industrial.
 *
 * ── HUELLA Y GRUPOS ────────────────────────────────────────────────────────
 * El layout legacy persistía footprint (W/H/unidad/grid) y `group` por asset
 * en columnas propias. En v1 la única persistencia es el documento canónico:
 * al guardar, este adaptador inyecta `meta.footprintW/footprintH/gridSize`
 * (claves que la API de R1 ya lee para exportar DXF) y los `group` de los
 * assets en las entidades correspondientes; al abrir, los recupera de ahí.
 */

import {
  migrateCadDocument,
  type CadDocument,
} from "@/lib/cad/cad-document";
import {
  cadDocumentToEditorSnapshot,
  splitTags,
} from "@/lib/cad/editor-snapshot";
import { API_BASE, rawApiFetch } from "@/lib/apiFetch";

const LEGACY_PREFIX = "/line-engineering/";

/** Huella por defecto del origen (LineEngineeringService.DEFAULT_FOOTPRINT). */
const DEFAULT_FOOTPRINT = {
  footprintW: 20_000,
  footprintH: 10_000,
  unit: "mm",
  gridSize: 500,
} as const;

interface LegacyFootprint {
  footprintW: number;
  footprintH: number;
  unit: string;
  gridSize: number;
}

interface LegacyAsset {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
  shape?: "rect" | "circle";
  layer?: string;
  group?: string;
  tags?: string[];
}

interface DocumentSummary {
  id: string;
  projectId: string | null;
  name: string;
  model: string | null;
  revision: string | null;
  cadDocumentVersion: number;
}

interface OpenedDocument extends DocumentSummary {
  cadDocument: Record<string, unknown> | null;
}

interface DxfResource {
  name: string;
  data: string;
  placement: {
    name: string;
    offsetX: number;
    offsetY: number;
    scale: number;
    rotation: number;
    visible: boolean;
    opacity: number;
  };
}

/** ¿Es esta URL una ruta legacy del editor CAD? */
export function isLegacyCadRequest(input: RequestInfo | URL): boolean {
  if (typeof input !== "string" && !(input instanceof URL)) return false;
  return parseUrl(input).pathname.startsWith(LEGACY_PREFIX);
}

/** Traduce y ejecuta una petición legacy contra la API v1 real. */
export async function handleLegacyCadRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = parseUrl(input as string | URL);
  const method = (init?.method ?? "GET").toUpperCase();
  const route = url.pathname.slice(LEGACY_PREFIX.length).replace(/\/+$/, "");
  try {
    // ── Biblioteca de bloques del tenant ──────────────────────────────────
    if (route === "cad-blocks") {
      if (method === "GET") return listBlocks();
      if (method === "POST") return forward("POST", "/v1/cad/blocks", init);
    }
    const blockMatch = route.match(/^cad-blocks\/([^/]+)$/);
    if (blockMatch) {
      if (method === "PATCH")
        return forward("PATCH", `/v1/cad/blocks/${blockMatch[1]}`, init);
      if (method === "DELETE")
        return forward("DELETE", `/v1/cad/blocks/${blockMatch[1]}`, init);
    }

    // ── Layout (documento canónico) ───────────────────────────────────────
    if (route === "layout") {
      if (method === "GET") return openLayout(scopeOf(url));
      if (method === "PUT") return saveLayout(parseJsonBody(init));
    }
    if (route === "layout/cad-archive" && method === "PUT") {
      return saveLayoutArchive(init);
    }

    // ── Plano DXF de fondo ────────────────────────────────────────────────
    if (route === "layout/dxf") {
      if (method === "GET") return getDxfRoute(scopeOf(url));
      if (method === "PUT") return putDxfRoute(parseJsonBody(init));
      if (method === "DELETE") return deleteDxfRoute(scopeOf(url));
    }

    // ── IA (intent / visión) y publicaciones ──────────────────────────────
    if (route === "layout/cad-intent" && method === "POST") {
      return intentRoute(parseJsonBody(init));
    }
    if (route === "layout/vision" && method === "POST") {
      return visionRoute(parseJsonBody(init));
    }
    if (route === "layout/publications" && method === "POST") {
      return publicationsRoute(parseJsonBody(init));
    }
    if (route === "layout/clone" && method === "POST") {
      return cloneRoute(parseJsonBody(init));
    }

    // ── Endpoints sin equivalente en /v1/cad: 404 limpio y documentado ────
    return legacyNotFound(route);
  } catch (error) {
    if (error instanceof UpstreamFailure) return error.response;
    const message =
      error instanceof Error ? error.message : "Error del adaptador CAD.";
    return json({ message }, 502);
  }
}

/* ═══════════════════════════ Utilidades base ═══════════════════════════ */

class UpstreamFailure extends Error {
  constructor(readonly response: Response) {
    super(`Upstream ${response.status}`);
  }
}

function parseUrl(input: string | URL): URL {
  if (input instanceof URL) return input;
  try {
    return new URL(input);
  } catch {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost";
    return new URL(input, origin);
  }
}

function scopeOf(url: URL): { model: string; revision: string } {
  return {
    model: (url.searchParams.get("model") ?? "").trim(),
    revision: (url.searchParams.get("revision") ?? "A").trim() || "A",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function legacyNotFound(route: string): Response {
  return json(
    {
      message: `El endpoint legacy line-engineering/${route} no existe en el contrato /v1/cad de Valle Design.`,
    },
    404,
  );
}

function parseJsonBody(init?: RequestInit): Record<string, unknown> {
  const body = init?.body;
  if (typeof body !== "string") return {};
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Reenvío 1:1 (método+cuerpo+headers) a una ruta v1. */
function forward(
  method: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return rawApiFetch(`${API_BASE}${path}`, { ...(init ?? {}), method });
}

async function v1<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await rawApiFetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new UpstreamFailure(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function v1Json(method: string, path: string, body: unknown): Promise<Response> {
  return rawApiFetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ═══════════════════ Resolución model+revision → documento ═══════════════ */

/** Caché de sesión: "model|revision" → documentId (el editor es el único escritor). */
const documentIdCache = new Map<string, string>();

async function resolveDocumentId(
  model: string,
  revision: string,
): Promise<string | null> {
  const key = `${model}|${revision}`;
  const cached = documentIdCache.get(key);
  if (cached) return cached;
  // El contrato v1 no filtra por alias legacy: se listan los documentos del
  // tenant (tope de listado v1: 200) y se aparea model+revision aquí.
  const page = await v1<{ items: DocumentSummary[] }>(
    "/v1/cad/documents?limit=200",
  );
  const row = page.items.find(
    (item) => item.model === model && (item.revision ?? "A") === revision,
  );
  if (!row) return null;
  documentIdCache.set(key, row.id);
  return row.id;
}

/** Upsert legacy: los PUT creaban la fila si no existía. */
async function ensureDocumentId(
  model: string,
  revision: string,
): Promise<string> {
  const existing = await resolveDocumentId(model, revision);
  if (existing) return existing;
  const created = await v1<DocumentSummary>("/v1/cad/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model, model, revision }),
  });
  documentIdCache.set(`${model}|${revision}`, created.id);
  return created.id;
}

/* ═════════════════════════ Bloques del tenant ════════════════════════════ */

async function listBlocks(): Promise<Response> {
  const res = await rawApiFetch(`${API_BASE}/v1/cad/blocks`);
  if (!res.ok) return res;
  const body = (await res.json()) as { items?: unknown[] };
  // El endpoint legacy devolvía el array pelado; v1 envuelve en {items}.
  return json(body.items ?? []);
}

/* ═══════════════════ Layout: abrir / guardar / clonar ════════════════════ */

function isBlobPointer(value: unknown): boolean {
  const storage =
    value && typeof value === "object"
      ? (value as { _storage?: { kind?: unknown } })._storage
      : null;
  return !!storage && storage.kind === "document_blob";
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function footprintFromMeta(raw: Record<string, unknown> | null): LegacyFootprint {
  const meta =
    raw && typeof raw.meta === "object" && raw.meta && !Array.isArray(raw.meta)
      ? (raw.meta as Record<string, unknown>)
      : {};
  return {
    footprintW: positiveNumber(meta.footprintW) ?? DEFAULT_FOOTPRINT.footprintW,
    footprintH: positiveNumber(meta.footprintH) ?? DEFAULT_FOOTPRINT.footprintH,
    unit:
      typeof meta.unit === "string" && meta.unit ? meta.unit : DEFAULT_FOOTPRINT.unit,
    gridSize: positiveNumber(meta.gridSize) ?? DEFAULT_FOOTPRINT.gridSize,
  };
}

/** Grupos por id de asset guardados en las entidades del documento. */
function groupsFromEntities(doc: CadDocument): Map<string, string> {
  const groups = new Map<string, string>();
  for (const entity of doc.entities) {
    if (entity.type === "box" && entity.group) groups.set(entity.id, entity.group);
    else if (entity.type === "circle" && entity.legacy?.group)
      groups.set(entity.id, entity.legacy.group);
  }
  return groups;
}

function defaultApproval() {
  return { status: "draft", by: null, at: null, note: null };
}

function emptyLayout(model: string, revision: string) {
  return {
    model,
    revision,
    footprint: { ...DEFAULT_FOOTPRINT },
    stations: [],
    dxf: null,
    connectors: [],
    assets: [],
    annotations: [],
    cells: [],
    layers: [],
    cadDocument: null,
    cadDocumentVersion: 0,
    approval: defaultApproval(),
  };
}

/**
 * Documento canónico → respuesta Layout legacy. Las colecciones del editor
 * (assets/anotaciones/conectores/colocaciones) se extraen con las MISMAS
 * reglas del editor (`cadDocumentToEditorSnapshot`): las entidades nativas
 * profesionales (cotas asociativas, polilíneas, hatch, …) NO se proyectan —
 * viajan dentro de `cadDocument` y el editor las preserva.
 */
function layoutFromDocument(
  model: string,
  revision: string,
  row: OpenedDocument,
  dxf: DxfResource | null,
) {
  const base = emptyLayout(model, revision);
  base.cadDocumentVersion = row.cadDocumentVersion ?? 0;
  if (!row.cadDocument) {
    return { ...base, dxf: dxf ? placementMeta(dxf) : null };
  }
  const doc = migrateCadDocument(row.cadDocument);
  const snap = cadDocumentToEditorSnapshot(doc);
  const groups = groupsFromEntities(doc);
  const assets: LegacyAsset[] = snap.assets.map((asset) => ({
    ...asset,
    ...(snap.layers[asset.id] ? { layer: snap.layers[asset.id] } : {}),
    ...(groups.has(asset.id) ? { group: groups.get(asset.id) } : {}),
    ...(snap.tags[asset.id] ? { tags: splitTags(snap.tags[asset.id]) } : {}),
  }));
  const stations = snap.placements.map(([id, placement]) => ({
    id,
    station: id,
    line: "",
    ctq: false,
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
    rotation: placement.rotation,
  }));
  return {
    ...base,
    footprint: footprintFromMeta(row.cadDocument),
    stations,
    assets,
    annotations: snap.annotations,
    connectors: snap.connectors,
    dxf: dxf ? placementMeta(dxf) : null,
    cadDocument: row.cadDocument,
  };
}

async function openLayout(scope: {
  model: string;
  revision: string;
}): Promise<Response> {
  const { model, revision } = scope;
  if (!model) return json({ message: "model es obligatorio." }, 400);
  const id = await resolveDocumentId(model, revision);
  // Semántica legacy: un modelo sin fila devuelve el layout por defecto (el
  // editor arranca en un lienzo vacío; el primer guardado crea el documento).
  if (!id) return json(emptyLayout(model, revision));
  const res = await rawApiFetch(`${API_BASE}/v1/cad/documents/${id}`);
  if (res.status === 404) {
    documentIdCache.delete(`${model}|${revision}`);
    return json(emptyLayout(model, revision));
  }
  if (!res.ok) return res;
  const row = (await res.json()) as OpenedDocument;
  if (isBlobPointer(row.cadDocument)) {
    // Limitación v1 conocida: los documentos >1 MB viajan como puntero a blob
    // y el contrato aún no expone su descarga. Preferimos un error de carga
    // explícito a abrir un lienzo vacío que podría PISAR el dibujo real al
    // guardar (el CAS lo permitiría). Se resuelve al cerrar el hueco en R3.
    return json(
      {
        message:
          "El documento CAD vive en el almacén de blobs y el contrato v1 aún no expone su descarga.",
      },
      502,
    );
  }
  const dxf = await fetchDxf(id);
  return json(layoutFromDocument(model, revision, row, dxf));
}

/**
 * Parchea (sobre una copia) el documento canónico saliente con la huella y
 * los grupos por asset que el layout legacy persistía fuera del documento.
 */
function patchCanonicalDocument(
  raw: Record<string, unknown>,
  footprint: LegacyFootprint | null,
  assets: LegacyAsset[],
): Record<string, unknown> {
  const doc = structuredClone(raw);
  if (footprint) {
    const meta =
      doc.meta && typeof doc.meta === "object" && !Array.isArray(doc.meta)
        ? (doc.meta as Record<string, unknown>)
        : {};
    meta.footprintW = footprint.footprintW;
    meta.footprintH = footprint.footprintH;
    meta.gridSize = footprint.gridSize;
    if (footprint.unit) meta.unit = footprint.unit;
    doc.meta = meta;
  }
  const groupByAsset = new Map<string, string | undefined>(
    assets.map((asset) => [asset.id, asset.group]),
  );
  if (groupByAsset.size && Array.isArray(doc.entities)) {
    for (const entry of doc.entities as Record<string, unknown>[]) {
      if (!entry || typeof entry !== "object") continue;
      const id = typeof entry.id === "string" ? entry.id : "";
      if (!groupByAsset.has(id)) continue;
      const group = groupByAsset.get(id);
      if (entry.type === "box") {
        if (group) entry.group = group;
        else delete entry.group;
      } else if (
        entry.type === "circle" &&
        entry.legacy &&
        typeof entry.legacy === "object"
      ) {
        const legacy = entry.legacy as Record<string, unknown>;
        if (group) legacy.group = group;
        else delete legacy.group;
      }
    }
  }
  return doc;
}

interface SaveContentResult {
  cadDocumentId: string;
  cadDocumentVersion: number;
  entityCount: number;
  storedAsBlobPointer: boolean;
}

function savedLayoutResponse(
  payload: Record<string, unknown>,
  cadDocument: Record<string, unknown>,
  cadDocumentVersion: number,
) {
  const model = String(payload.model ?? "");
  const revision = String(payload.revision ?? "A");
  const positions = Array.isArray(payload.positions)
    ? (payload.positions as {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        rotation: number;
      }[])
    : [];
  const cleared = Array.isArray(payload.cleared)
    ? (payload.cleared as string[])
    : [];
  const stations = [
    ...positions.map((p) => ({
      id: p.id,
      station: p.id,
      line: "",
      ctq: false,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      rotation: p.rotation,
    })),
    ...cleared.map((id) => ({
      id,
      station: id,
      line: "",
      ctq: false,
      x: null,
      y: null,
      w: null,
      h: null,
      rotation: null,
    })),
  ];
  return {
    model,
    revision,
    footprint: payload.footprint ?? { ...DEFAULT_FOOTPRINT },
    stations,
    connectors: payload.connectors ?? [],
    assets: payload.assets ?? [],
    annotations: payload.annotations ?? [],
    cells: payload.cells ?? [],
    dxf: payload.dxf ?? null,
    cadDocument,
    cadDocumentVersion,
    approval: defaultApproval(),
  };
}

async function saveLayout(payload: Record<string, unknown>): Promise<Response> {
  const model = String(payload.model ?? "").trim();
  const revision = String(payload.revision ?? "A").trim() || "A";
  if (!model) return json({ message: "model es obligatorio." }, 400);
  const rawDocument = payload.cadDocument;
  if (!rawDocument || typeof rawDocument !== "object") {
    return json({ message: "cadDocument es obligatorio." }, 400);
  }
  const id = await ensureDocumentId(model, revision);
  const cadDocument = patchCanonicalDocument(
    rawDocument as Record<string, unknown>,
    (payload.footprint as LegacyFootprint | undefined) ?? null,
    Array.isArray(payload.assets) ? (payload.assets as LegacyAsset[]) : [],
  );
  const res = await v1Json("PUT", `/v1/cad/documents/${id}/content`, {
    cadDocument,
    expectedCadDocumentVersion: payload.expectedCadDocumentVersion,
  });
  if (!res.ok) return res;
  const result = (await res.json()) as SaveContentResult;
  await propagateDxfPlacement(id, payload.dxf);
  return json(
    savedLayoutResponse(payload, cadDocument, result.cadDocumentVersion),
  );
}

async function saveLayoutArchive(init?: RequestInit): Promise<Response> {
  const form = init?.body;
  if (!(form instanceof FormData)) {
    return json({ message: "El payload multipart es obligatorio." }, 400);
  }
  const layoutRaw = form.get("layout");
  const file = form.get("file");
  if (typeof layoutRaw !== "string" || !(file instanceof Blob)) {
    return json(
      { message: "El archivo CAD gzip y el payload del layout son obligatorios." },
      400,
    );
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(layoutRaw) as Record<string, unknown>;
  } catch {
    return json({ message: "El payload del layout no es JSON válido." }, 400);
  }
  const model = String(payload.model ?? "").trim();
  const revision = String(payload.revision ?? "A").trim() || "A";
  if (!model) return json({ message: "model es obligatorio." }, 400);

  // Reempaqueta el gzip con la huella/grupos parcheados (ver cabecera).
  if (
    typeof DecompressionStream === "undefined" ||
    typeof CompressionStream === "undefined"
  ) {
    return json(
      { message: "Este navegador no ofrece gzip para dibujos CAD grandes." },
      400,
    );
  }
  let document: Record<string, unknown>;
  try {
    const text = await new Response(
      file.stream().pipeThrough(new DecompressionStream("gzip")),
    ).text();
    document = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return json({ message: "El archivo CAD gzip no se pudo leer." }, 400);
  }
  const patched = patchCanonicalDocument(
    document,
    (payload.footprint as LegacyFootprint | undefined) ?? null,
    Array.isArray(payload.assets) ? (payload.assets as LegacyAsset[]) : [],
  );
  const gz = await new Response(
    new Blob([JSON.stringify(patched)], { type: "application/json" })
      .stream()
      .pipeThrough(new CompressionStream("gzip")),
  ).blob();

  const id = await ensureDocumentId(model, revision);
  const outbound = new FormData();
  outbound.append(
    "payload",
    JSON.stringify({
      expectedCadDocumentVersion: payload.expectedCadDocumentVersion,
    }),
  );
  outbound.append("file", gz, "cad-document.json.gz");
  const res = await rawApiFetch(`${API_BASE}/v1/cad/documents/${id}/archive`, {
    method: "PUT",
    body: outbound,
  });
  if (!res.ok) return res;
  const result = (await res.json()) as SaveContentResult;
  await propagateDxfPlacement(id, payload.dxf);
  return json(savedLayoutResponse(payload, patched, result.cadDocumentVersion));
}

async function cloneRoute(payload: Record<string, unknown>): Promise<Response> {
  const fromModel = String(payload.fromModel ?? "").trim();
  const fromRevision = String(payload.fromRevision ?? "A").trim() || "A";
  const toModel = String(payload.toModel ?? "").trim();
  const toRevision = String(payload.toRevision ?? "A").trim() || "A";
  if (!fromModel || !toModel) {
    return json({ message: "fromModel y toModel son obligatorios." }, 400);
  }
  const sourceId = await resolveDocumentId(fromModel, fromRevision);
  if (!sourceId) {
    return json({ message: "No existe un layout origen para clonar." }, 404);
  }
  const source = await v1<OpenedDocument>(`/v1/cad/documents/${sourceId}`);
  if (!source.cadDocument) {
    return json(
      { message: "El layout origen no tiene documento CAD para clonar." },
      404,
    );
  }
  if (isBlobPointer(source.cadDocument)) {
    return json(
      {
        message:
          "El layout origen vive en el almacén de blobs; el contrato v1 aún no permite clonarlo desde el navegador.",
      },
      502,
    );
  }
  const targetId = await ensureDocumentId(toModel, toRevision);
  const target = await v1<OpenedDocument>(`/v1/cad/documents/${targetId}`);
  // Los recibos de publicación son SERVER-MANAGED por documento (el dominio
  // rechaza `cad_publications_server_managed` si el escritor los forja): el
  // clon nace SIN publicaciones — es un dibujo nuevo, no un set publicado.
  const cloned = structuredClone(source.cadDocument) as Record<string, unknown>;
  cloned.publications = [];
  const res = await v1Json("PUT", `/v1/cad/documents/${targetId}/content`, {
    cadDocument: cloned,
    expectedCadDocumentVersion: target.cadDocumentVersion ?? 0,
  });
  if (!res.ok) return res;
  const result = (await res.json()) as SaveContentResult;
  return json({
    cloned: true,
    documentId: targetId,
    cadDocumentVersion: result.cadDocumentVersion,
  });
}

/* ══════════════════════════ Plano DXF de fondo ═══════════════════════════ */

/** Caché corta: el flujo de apertura pide meta (layout) y datos (layout/dxf)
 *  seguidos — así el DXF se descarga UNA vez, no dos. */
const dxfCache = new Map<string, { at: number; body: DxfResource }>();
const DXF_CACHE_TTL_MS = 30_000;

function placementMeta(dxf: DxfResource) {
  const { offsetX, offsetY, scale, rotation, visible, opacity } = dxf.placement;
  return { offsetX, offsetY, scale, rotation, visible, opacity };
}

async function fetchDxf(documentId: string): Promise<DxfResource | null> {
  const cached = dxfCache.get(documentId);
  if (cached && Date.now() - cached.at < DXF_CACHE_TTL_MS) return cached.body;
  const res = await rawApiFetch(`${API_BASE}/v1/cad/documents/${documentId}/dxf`);
  if (res.status === 404) {
    dxfCache.delete(documentId);
    return null;
  }
  if (!res.ok) throw new UpstreamFailure(res);
  const body = (await res.json()) as DxfResource;
  dxfCache.set(documentId, { at: Date.now(), body });
  return body;
}

async function getDxfRoute(scope: {
  model: string;
  revision: string;
}): Promise<Response> {
  const id = await resolveDocumentId(scope.model, scope.revision);
  if (!id) return json({ message: "El documento no tiene plano DXF." }, 404);
  const dxf = await fetchDxf(id);
  if (!dxf) return json({ message: "El documento no tiene plano DXF." }, 404);
  return json(dxf);
}

async function putDxfRoute(payload: Record<string, unknown>): Promise<Response> {
  const model = String(payload.model ?? "").trim();
  const revision = String(payload.revision ?? "A").trim() || "A";
  if (!model) return json({ message: "model es obligatorio." }, 400);
  const id = await ensureDocumentId(model, revision);
  dxfCache.delete(id);
  return v1Json("PUT", `/v1/cad/documents/${id}/dxf`, {
    name: payload.name ?? "plano.dxf",
    data: payload.data,
  });
}

async function deleteDxfRoute(scope: {
  model: string;
  revision: string;
}): Promise<Response> {
  const id = await resolveDocumentId(scope.model, scope.revision);
  if (!id) return json({ message: "Documento CAD no encontrado." }, 404);
  dxfCache.delete(id);
  return forward("DELETE", `/v1/cad/documents/${id}/dxf`);
}

/**
 * El guardado legacy persistía la colocación del DXF con el layout. En v1 la
 * colocación vive en el subrecurso `/dxf` (que exige también los datos), así
 * que sólo cuando la colocación cambió se re-sube el plano con ella. Es
 * best-effort: el fondo es opcional y su fallo no debe romper un guardado.
 */
async function propagateDxfPlacement(
  documentId: string,
  meta: unknown,
): Promise<void> {
  if (!meta || typeof meta !== "object") return;
  try {
    const current = await fetchDxf(documentId);
    if (!current) return;
    const next = meta as Record<string, number | boolean>;
    const fields = [
      "offsetX",
      "offsetY",
      "scale",
      "rotation",
      "visible",
      "opacity",
    ] as const;
    const changed = fields.some(
      (field) =>
        next[field] !== undefined &&
        next[field] !== (current.placement as Record<string, unknown>)[field],
    );
    if (!changed) return;
    dxfCache.delete(documentId);
    await v1Json("PUT", `/v1/cad/documents/${documentId}/dxf`, {
      name: current.name,
      data: current.data,
      placement: {
        offsetX: next.offsetX,
        offsetY: next.offsetY,
        scale: next.scale,
        rotation: next.rotation,
        visible: next.visible,
        opacity: next.opacity,
      },
    });
  } catch {
    /* colocación best-effort — el guardado principal ya fue exitoso */
  }
}

/* ═════════════════════ IA (intent/visión) y publicaciones ════════════════ */

async function intentRoute(payload: Record<string, unknown>): Promise<Response> {
  const model = String(payload.model ?? "").trim();
  const revision = String(payload.revision ?? "A").trim() || "A";
  if (!model) return json({ message: "model es obligatorio." }, 400);
  const id = await ensureDocumentId(model, revision);
  return v1Json("POST", `/v1/cad/documents/${id}/intent`, {
    prompt: payload.prompt,
  });
}

function visionRoute(payload: Record<string, unknown>): Promise<Response> {
  return v1Json("POST", "/v1/cad/vision", { image: payload.imageDataUrl });
}

async function publicationsRoute(
  payload: Record<string, unknown>,
): Promise<Response> {
  const model = String(payload.model ?? "").trim();
  const revision = String(payload.revision ?? "A").trim() || "A";
  if (!model) return json({ message: "model es obligatorio." }, 400);
  const id = await resolveDocumentId(model, revision);
  if (!id) {
    return json({ message: "No existe un documento CAD para publicar." }, 404);
  }
  const res = await v1Json("POST", `/v1/cad/documents/${id}/publications`, {
    expectedCadDocumentVersion: payload.expectedCadDocumentVersion,
    paperSpaceIds: payload.paperSpaceIds,
    fileName: payload.fileName,
    sha256: payload.sha256,
    bytes: payload.bytes,
  });
  if (!res.ok) return res;
  // v1 responde el recibo PLANO + cadDocumentVersion; el editor espera
  // {publication, cadDocumentVersion} (forma legacy).
  const body = (await res.json()) as Record<string, unknown> & {
    cadDocumentVersion: number;
  };
  const { cadDocumentVersion, ...publication } = body;
  return json({ publication, cadDocumentVersion });
}
