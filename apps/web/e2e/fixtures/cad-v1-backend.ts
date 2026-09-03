/**
 * Fake in-memory de la superficie REAL `/v1/cad/*` de la API de Valle Design
 * (R1+R3), servido al navegador por intercepción de rutas de Playwright.
 *
 * MIGRACIÓN R3 de los specs dorados: en el origen cada golden interceptaba
 * las rutas legacy `/line-engineering/layout*`. Desde R2 el adaptador
 * `src/lib/cad-api.ts` reescribe esas llamadas ANTES de tocar la red, así que
 * lo que el navegador pide hoy es la superficie v1:
 *
 *   GET    /v1/cad/documents?limit=200         (resolución model+revision → id)
 *   POST   /v1/cad/documents                   (upsert del primer guardado)
 *   GET    /v1/cad/documents/:id               (apertura HIDRATADA — R3)
 *   PUT    /v1/cad/documents/:id/content       (CAS optimista contractual)
 *   GET/PUT/DELETE /v1/cad/documents/:id/dxf   (plano de fondo)
 *   POST   /v1/cad/documents/:id/publications  (recibo server-managed + CAS)
 *   GET/POST/PATCH/DELETE /v1/cad/blocks       (biblioteca del tenant)
 *
 * Cada respuesta espeja la FORMA REAL de la API (mismos cuerpos, mismos
 * códigos contractuales: 409 `cad_document_version_conflict` con
 * `expected`/`current` al nivel superior, 404 de subrecurso DXF, {items} en
 * listados). Los specs conservan sus flujos y aserciones del origen: este
 * módulo solo mueve el mock de la frontera legacy a la frontera v1.
 *
 * HUELLA: el layout legacy persistía el footprint fuera del documento; en v1
 * vive en `meta.footprintW/footprintH/gridSize` (el adaptador la lee/escribe
 * ahí). `seedFootprint` inyecta la huella del spec en el documento sembrado
 * para que el editor arranque con el MISMO lienzo que en el origen.
 */

import type { BrowserContext, Route } from "@playwright/test";
import { API_ORIGIN } from "./constants";
import { firstPartyRequestFailure } from "./standalone-identity";
import { CadReviewCommentStore } from "./cad-review-comments";
import { CadSheetSetStore } from "./cad-v1-sheet-sets";
import {
  cadReviewLinkRoutes,
  cadReviewSessionResource,
  type CadReviewSessionRow,
} from "./cad-v1-review-links";
import { acknowledgeCadArchive } from "./cad-archive-fixture";

export interface LegacyFootprint {
  footprintW: number;
  footprintH: number;
  unit: string;
  gridSize: number;
}

export interface CadV1DocumentSeed {
  model: string;
  revision?: string;
  /**
   * Nombre visible del documento. Por defecto es el `model`, que en los goldens
   * es cómodo y en una CAPTURA es un desastre: el estudio pinta este texto como
   * título, y el modelo de los documentos históricos es `AXOS-CAD-STUDIO` —un
   * identificador congelado del ERP del que nació el producto, que en la portada
   * se lee como el nombre del programa. El nombre y el modelo son cosas
   * distintas; que coincidieran era una comodidad del fixture, no del producto.
   */
  name?: string;
  /** Documento canónico (null = fila creada pero nunca guardada, versión 0). */
  document?: Record<string, unknown> | null;
  /** cadDocumentVersion inicial (token CAS). */
  version?: number;
  /** Huella legacy del spec; se inyecta en meta.* del documento sembrado. */
  footprint?: LegacyFootprint;
  /**
   * Respuesta forzada de la APERTURA (GET /documents/:id) — p.ej. 403 para el
   * caso DENIED de los xrefs. La fila sigue apareciendo en el listado (así el
   * adaptador resuelve el id y el editor recibe el status real).
   */
  openStatus?: number;
  openBody?: unknown;
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

interface DocRow {
  id: string;
  name: string;
  projectId: string | null;
  model: string | null;
  revision: string | null;
  document: Record<string, unknown> | null;
  version: number;
  dxf: DxfResource | null;
  available: boolean;
  openStatus?: number;
  openBody?: unknown;
}

export interface LibraryBlockRow {
  id: string;
  name: string;
  assets: unknown[];
  definition: Record<string, unknown> | null;
  version: number;
  createdAt: string;
}

export interface PublicationRequest {
  expectedCadDocumentVersion: number;
  paperSpaceIds: string[];
  fileName: string;
  sha256: string;
  bytes: number;
}

const NOW0 = new Date(0).toISOString();

/** Inyecta la huella legacy en meta.* (misma clave que lee el adaptador R2). */
export function seedFootprint(
  document: Record<string, unknown>,
  footprint: LegacyFootprint,
): Record<string, unknown> {
  const meta =
    document.meta &&
    typeof document.meta === "object" &&
    !Array.isArray(document.meta)
      ? { ...(document.meta as Record<string, unknown>) }
      : {};
  meta.footprintW = footprint.footprintW;
  meta.footprintH = footprint.footprintH;
  meta.gridSize = footprint.gridSize;
  if (footprint.unit) meta.unit = footprint.unit;
  return { ...document, meta };
}

export class CadV1Backend {
  private readonly rows: DocRow[] = [];
  /**
   * Conjuntos de planos: su propia tabla y su propio CAS, en su propio módulo
   * por presupuesto de tamaño (`cad-v1-sheet-sets.ts`).
   */
  readonly sheetSets = new CadSheetSetStore();
  private readonly library: LibraryBlockRow[] = [];
  readonly publicationRequests: PublicationRequest[] = [];
  readonly reviewSessions: CadReviewSessionRow[] = [];
  /**
   * Hilos de comentario, en su propio módulo por presupuesto de tamaño. Se le
   * pasa a ESTE backend como anfitrión para que la validez de un token la
   * decida una sola pieza: si el fixture tuviera dos ideas de «sesión viva»,
   * un golden podría pasar comentando por un enlace ya revocado.
   */
  readonly comments = new CadReviewCommentStore({
    sessionForToken: (token) => {
      const session = this.reviewSessions.find(
        (candidate) => candidate.token === token,
      );
      if (!session) return null;
      return {
        id: session.id,
        documentId: session.documentId,
        allowComments: session.allowComments,
        live:
          !session.revokedAt &&
          session.status === "open" &&
          Date.parse(session.expiresAt) > Date.now(),
      };
    },
    documentExists: (documentId) =>
      this.rows.some((row) => row.id === documentId && row.available),
    authorName: "e2e@valle",
  });
  private seq = 0;

  constructor(seeds: CadV1DocumentSeed[]) {
    for (const seed of seeds) this.register(seed);
  }

  /** Siembra un conjunto de planos ya existente en el servidor. */
  registerSheetSet(resource: Record<string, unknown>): void {
    this.sheetSets.register(resource);
  }

  /** Cada PUT de conjunto recibido, en orden: lo que el servidor VIO. */
  get sheetSetSaves(): ReadonlyArray<{ sheetSetId: string; body: Record<string, unknown> }> {
    return this.sheetSets.saves;
  }

  register(seed: CadV1DocumentSeed): DocRow {
    const document =
      seed.document && seed.footprint
        ? seedFootprint(seed.document, seed.footprint)
        : (seed.document ?? null);
    const row: DocRow = {
      id: `00000000-0000-4000-8000-${String(++this.seq).padStart(12, "0")}`,
      name: seed.name ?? seed.model,
      projectId: null,
      model: seed.model,
      revision: seed.revision ?? "UNIVERSAL",
      document: document ? structuredClone(document) : null,
      version: seed.version ?? 0,
      dxf: null,
      available: true,
      openStatus: seed.openStatus,
      openBody: seed.openBody,
    };
    this.rows.push(row);
    return row;
  }

  /** Registra los handlers v1 en el contexto (tras installMockBackend). */
  async install(context: BrowserContext): Promise<void> {
    await context.route(`${API_ORIGIN}/v1/cad/**`, (route) =>
      this.handle(route),
    );
  }

  /* ── Acceso de los specs (misma interfaz snapshot() de los goldens) ── */

  private row(model: string, revision?: string): DocRow {
    const found = this.rows.find(
      (candidate) =>
        candidate.model === model &&
        (revision === undefined || candidate.revision === revision),
    );
    if (!found)
      throw new Error(`Documento no sembrado: ${model}@${revision ?? "*"}`);
    return found;
  }

  /** El id que el servidor le dio a un documento sembrado. */
  idFor(model: string, revision?: string): string {
    return this.row(model, revision).id;
  }

  snapshotFor(
    model: string,
    revision?: string,
  ): {
    document: Record<string, unknown>;
    version: number;
  } {
    const row = this.row(model, revision);
    return {
      document: structuredClone(row.document) as Record<string, unknown>,
      version: row.version,
    };
  }

  /** Reemplaza el documento fuente (p.ej. changeSource de los xrefs). */
  replaceDocument(
    model: string,
    revision: string | undefined,
    document: Record<string, unknown>,
    version?: number,
  ): void {
    const row = this.row(model, revision);
    row.document = structuredClone(document);
    row.version = version ?? row.version + 1;
  }

  /** Disponibilidad de la fila: false = el GET responde 404 (fuente retirada). */
  setAvailable(
    model: string,
    revision: string | undefined,
    value: boolean,
  ): void {
    this.row(model, revision).available = value;
  }

  get libraryRows(): LibraryBlockRow[] {
    return structuredClone(this.library);
  }

  /**
   * Siembra una fila de la biblioteca del inquilino, como hace la migración del
   * producto.
   *
   * Existe porque el catálogo arquitectónico —30 bloques con `tenant_id NULL`—
   * lo publica el servidor a todo inquilino, y un golden que quiera afirmar
   * «coloqué una puerta DE LA BIBLIOTECA» no puede empezar creándola: eso
   * probaría BLOCK, no la biblioteca. El `id` de fila lo pone el servidor, así
   * que aquí también.
   */
  seedLibraryBlock(input: {
    name: string;
    definition: Record<string, unknown>;
    assets?: unknown[];
  }): LibraryBlockRow {
    const row: LibraryBlockRow = {
      id: `library-seed-${this.library.length + 1}`,
      name: input.name,
      assets: input.assets ?? [],
      definition: input.definition,
      version: 1,
      createdAt: NOW0,
    };
    this.library.push(row);
    return row;
  }

  /* ─────────────────────────── Router v1 ─────────────────────────── */

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const notFound = (message: string) =>
      json({ message, requestId: "e2e" }, 404);
    const body = (): Record<string, unknown> => {
      try {
        const parsed = request.postDataJSON() as unknown;
        return parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    };

    // La superficie `/v1/cad/review/*` es la del INVITADO: no lleva cookie de
    // sesión ni CSRF de primera parte, y exigírselos aquí haría imposible el
    // caso que este fixture existe para reproducir. `/v1/cad/review-sessions/*`
    // NO entra (no acaba en barra): ésa es del autor y sí exige sesión.
    // Un EventSource (presencia) no manda cookie ni cabeceras entre orígenes: se
    // contesta como flujo vacío ANTES de la comprobación de primera parte, o su
    // 401 JSON acaba en «MIME type» en consola (golden 10, medido).
    if (method === "GET" && (request.headers()["accept"] ?? "").includes("text/event-stream"))
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: "retry: 600000\n\n" });
    const authFailure = firstPartyRequestFailure(request);
    if (authFailure && !path.startsWith("/v1/cad/review/")) return json(authFailure.body, authFailure.status);

    const commentReply = this.comments.handle({
      path,
      method,
      body,
      reviewToken: request.headers()["x-review-token"] ?? "",
      query: url.searchParams,
    });
    if (commentReply) return json(commentReply.body, commentReply.status);

    // ── Documentos: listado (resolución model+revision del adaptador) ──
    if (path === "/v1/cad/documents" && method === "GET") {
      const items = this.rows.filter((row) => row.available).map(summaryOf);
      return json({ items, total: items.length });
    }
    if (path === "/v1/cad/documents" && method === "POST") {
      const dto = body();
      const row = this.register({
        model: String(dto.model ?? dto.name ?? `doc-${this.seq + 1}`),
        revision: typeof dto.revision === "string" ? dto.revision : undefined,
        document: null,
        version: 0,
      });
      row.name = String(dto.name ?? row.model ?? "Documento");
      return json(summaryOf(row), 201);
    }

    // La superficie del INVITADO vive en `cad-v1-review-links.ts`: canjear el
    // link y revocarlo tienen reglas propias (sólo cabecera, tres formas de
    // rechazar) y el presupuesto de tamaño de este fixture no da para tenerlas
    // aquí además de los conjuntos de planos.
    const sessionResource = (session: CadReviewSessionRow) =>
      cadReviewSessionResource(session, NOW0);
    const reviewReply = cadReviewLinkRoutes(
      { path, method, reviewToken: request.headers()["x-review-token"] ?? "" },
      {
        sessions: this.reviewSessions,
        now: NOW0,
        documentPayload: (documentId) => {
          const target = this.rows.find((candidate) => candidate.id === documentId);
          if (!target) return null;
          return {
            id: target.id,
            name: target.name,
            model: target.model,
            revision: target.revision,
            cadDocumentVersion: target.version,
            layers: null,
            cadDocument: structuredClone(target.document),
            dxf: target.dxf ? { ...target.dxf.placement } : null,
          };
        },
      },
    );
    if (reviewReply) return json(reviewReply.body, reviewReply.status);

    // ── Conjuntos de planos: su propia tabla y su propio CAS ──
    const sheetSetReply = this.sheetSets.handle({ path, method, body });
    if (sheetSetReply) return json(sheetSetReply.body, sheetSetReply.status);

    const byId = (id: string) => this.rows.find((row) => row.id === id);
    const docMatch = path.match(/^\/v1\/cad\/documents\/([^/]+)(?:\/(.+))?$/);
    if (docMatch) {
      const row = byId(docMatch[1]);
      const rest = docMatch[2] ?? "";
      // ── Presencia: el latido responde 204 (el flujo SSE se contesta arriba,
      // antes de la comprobación de primera parte). Va ANTES de comprobar la
      // fila: un documento que este fixture no conoce también late.
      if (rest === "presence" && method === "POST") return route.fulfill({ status: 204, body: "" });

      // ── Apertura HIDRATADA (semántica R3: nunca un puntero a blob) ──
      if (!rest && method === "GET") {
        if (row?.openStatus) {
          return json(row.openBody ?? { message: "forbidden" }, row.openStatus);
        }
        if (!row || !row.available)
          return notFound("Documento CAD no encontrado.");
        return json({
          ...summaryOf(row),
          cadDocument: structuredClone(row.document),
          // ADITIVO R3: la apertura incluye la colocación del DXF (o null).
          dxf: row.dxf ? { ...row.dxf.placement } : null,
        });
      }
      if (!row || !row.available)
        return notFound("Documento CAD no encontrado.");


      // Rollback acotado de importación. La autorización first-party/CSRF
      // ya se comprobó arriba; este fixture conserva la misma precondición
      // observable que la API real (vacío, versión 0, sin DXF).
      if (rest === "provisional" && method === "DELETE") {
        if (row.version !== 0 || row.document !== null || row.dxf !== null) {
          return json(
            {
              message: "El documento ya no es provisional.",
              requestId: "e2e",
            },
            409,
          );
        }
        row.available = false;
        return route.fulfill({ status: 204, body: "" });
      }

      // ── Contenido canónico (CAS contractual) ──
      if (rest === "content" && method === "PUT") {
        const dto = body();
        const expected = dto.expectedCadDocumentVersion;
        if (typeof expected !== "number") {
          return json(
            {
              code: "cad_document_version_required",
              message:
                "expectedCadDocumentVersion es obligatorio al guardar el documento CAD.",
              requestId: "e2e",
            },
            400,
          );
        }
        if (expected !== row.version)
          return this.conflict(json, expected, row.version);
        row.document = structuredClone(dto.cadDocument) as Record<
          string,
          unknown
        >;
        row.version += 1;
        const entities = (row.document as { entities?: unknown[] }).entities;
        return json({
          cadDocumentId: row.id,
          cadDocumentVersion: row.version,
          entityCount: Array.isArray(entities) ? entities.length : 0,
          storedAsBlobPointer: false,
        });
      }

      // ── Archivo de recuperación (autosave): ACUSE sin CAS — ver helper ──
      if (rest === "archive" && method === "PUT")
        return acknowledgeCadArchive(row, json);

      // ── Listado de revisiones del documento (el autor gestiona sus enlaces) ──
      if (rest === "review-sessions" && method === "GET") {
        const status = url.searchParams.get("status");
        return json({
          items: this.reviewSessions
            .filter((session) => session.documentId === row.id)
            .filter((session) => !status || session.status === status)
            .map(sessionResource),
        });
      }

      // ── Review link SERVER-OWNED: el token se emite AQUÍ y sólo aquí ──
      if (rest === "review-sessions" && method === "POST") {
        const dto = body();
        const session: CadReviewSessionRow = {
          id: `00000000-0000-4000-9000-${String(this.reviewSessions.length + 1).padStart(12, "0")}`,
          documentId: row.id,
          // Forma del token real (`vdrl_` + 256 bits): el fixture no lo
          // persiste en ningún documento, igual que la API.
          token: `vdrl_e2e_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
          status: "open",
          allowComments: dto.allowComments !== false,
          expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          revokedAt: null,
          closedAt: null,
        };
        this.reviewSessions.push(session);
        return json(
          { session: sessionResource(session), shareToken: session.token },
          201,
        );
      }

      // ── Plano DXF de fondo (subrecurso 404 cuando no existe) ──
      if (rest === "dxf") {
        if (method === "GET") {
          return row.dxf
            ? json(row.dxf)
            : notFound("El documento no tiene plano DXF de fondo.");
        }
        if (method === "PUT") {
          const dto = body();
          const placementInput =
            dto.placement && typeof dto.placement === "object"
              ? (dto.placement as Partial<DxfResource["placement"]>)
              : {};
          const name = String(dto.name ?? "plano.dxf");
          row.dxf = {
            name,
            data: String(dto.data ?? ""),
            placement: {
              name,
              offsetX: Number(placementInput.offsetX ?? 0) || 0,
              offsetY: Number(placementInput.offsetY ?? 0) || 0,
              scale: Number(placementInput.scale ?? 1) || 1,
              rotation: Number(placementInput.rotation ?? 0) || 0,
              visible: placementInput.visible !== false,
              opacity: Number(placementInput.opacity ?? 0.5),
            },
          };
          return json(row.dxf);
        }
        if (method === "DELETE") {
          row.dxf = null;
          return route.fulfill({ status: 204, body: "" });
        }
      }

      // ── Publicaciones (recibo plano v1 + CAS + recibo embebido) ──
      if (rest === "publications" && method === "POST") {
        const dto = body() as unknown as PublicationRequest;
        if (dto.expectedCadDocumentVersion !== row.version) {
          return this.conflict(
            json,
            dto.expectedCadDocumentVersion,
            row.version,
          );
        }
        this.publicationRequests.push(structuredClone(dto));
        row.version += 1;
        const receipt = {
          id: `publication-${this.publicationRequests.length}`,
          documentId: row.id,
          paperSpaceIds: dto.paperSpaceIds,
          fileName: dto.fileName,
          sha256: dto.sha256,
          bytes: dto.bytes,
          publishedAt: NOW0,
          publishedBy: "e2e-user",
        };
        // Server-managed: la API real también anexa el recibo embebido.
        if (row.document) {
          const embedded = Array.isArray(row.document.publications)
            ? (row.document.publications as unknown[])
            : [];
          const { documentId: _omit, ...embeddedReceipt } = receipt;
          void _omit;
          row.document.publications = [...embedded, embeddedReceipt];
        }
        return json({ ...receipt, cadDocumentVersion: row.version }, 201);
      }

    }

    // ── Biblioteca de bloques del tenant ──
    if (path === "/v1/cad/blocks" && method === "GET") {
      const query = (url.searchParams.get("q") ?? "")
        .toLocaleLowerCase()
        .trim();
      const terms = query.split(/\s+/).filter(Boolean);
      const items = this.library.filter((rowEntry) => {
        if (!terms.length) return true;
        const definition = rowEntry.definition ?? {};
        const haystack = [
          rowEntry.name,
          (definition as { description?: string }).description ?? "",
          ...((definition as { keywords?: unknown }).keywords instanceof Array
            ? (definition as { keywords: unknown[] }).keywords.filter(
                (value): value is string => typeof value === "string",
              )
            : []),
          JSON.stringify(
            (definition as { businessLink?: unknown }).businessLink ?? {},
          ),
        ]
          .join(" ")
          .toLocaleLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
      return json({ items });
    }
    if (path === "/v1/cad/blocks" && method === "POST") {
      const dto = body();
      const rowEntry: LibraryBlockRow = {
        id: `library-${this.library.length + 1}`,
        name: String(dto.name ?? "BLOQUE"),
        assets: Array.isArray(dto.assets) ? (dto.assets as unknown[]) : [],
        definition:
          dto.definition && typeof dto.definition === "object"
            ? (dto.definition as Record<string, unknown>)
            : null,
        version: 1,
        createdAt: NOW0,
      };
      this.library.push(rowEntry);
      return json(rowEntry, 201);
    }
    const blockMatch = path.match(/^\/v1\/cad\/blocks\/([^/]+)$/);
    if (blockMatch) {
      const rowEntry = this.library.find(
        (candidate) => candidate.id === blockMatch[1],
      );
      if (!rowEntry) return notFound("Bloque no encontrado.");
      if (method === "PATCH") {
        const dto = body();
        if (typeof dto.name === "string") rowEntry.name = dto.name;
        if (dto.definition && typeof dto.definition === "object") {
          rowEntry.definition = dto.definition as Record<string, unknown>;
          rowEntry.version += 1;
        }
        return json(rowEntry);
      }
      if (method === "DELETE") {
        this.library.splice(this.library.indexOf(rowEntry), 1);
        return route.fulfill({ status: 204, body: "" });
      }
    }

    // ── Visión: degradación determinista ──
    if (path === "/v1/cad/vision" && method === "POST") {
      return json({ available: false, walls: [], assets: [] }, 201);
    }

    return notFound(`Ruta v1 no contemplada por el fixture: ${method} ${path}`);
  }

  private conflict(
    json: (body: unknown, status?: number) => Promise<void>,
    expected: number,
    current: number,
  ): Promise<void> {
    return json(
      {
        code: "cad_document_version_conflict",
        message:
          "El dibujo cambió desde la última carga. Recarga y compara antes de guardar.",
        expected,
        current,
        requestId: "e2e",
      },
      409,
    );
  }
}

function summaryOf(row: DocRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    model: row.model,
    revision: row.revision,
    cadDocumentVersion: row.version,
    layers: null,
    legacySourceId: null,
    createdAt: NOW0,
    updatedAt: NOW0,
    createdBy: "e2e-user",
  };
}

/**
 * Conveniencia para el patrón dominante de los goldens: un único documento
 * `AXOS-CAD-STUDIO@UNIVERSAL` con la huella del spec. Devuelve el backend con
 * la MISMA interfaz `snapshot()` que exponían los mocks legacy.
 */
export async function installCadV1Backend(
  context: BrowserContext,
  seed: {
    document: Record<string, unknown> | null;
    version?: number;
    footprint?: LegacyFootprint;
    model?: string;
    revision?: string;
    /** Nombre visible; por defecto el modelo. Ver `CadV1DocumentSeed.name`. */
    name?: string;
  },
): Promise<{
  backend: CadV1Backend;
  snapshot: () => { document: Record<string, unknown>; version: number };
}> {
  const model = seed.model ?? "AXOS-CAD-STUDIO";
  const revision = seed.revision ?? "UNIVERSAL";
  const backend = new CadV1Backend([
    {
      model,
      revision,
      name: seed.name,
      document: seed.document,
      version: seed.version ?? 0,
      footprint: seed.footprint,
    },
  ]);
  await backend.install(context);
  return {
    backend,
    snapshot: () => backend.snapshotFor(model, revision),
  };
}

/**
 * Variante tipada del patrón estándar de los goldens GET/PUT: documento único
 * del estudio con snapshot tipado como el `CadDocument` del spec.
 */
export async function installCadStudioBackend<TDoc>(
  context: BrowserContext,
  document: TDoc,
  footprint?: LegacyFootprint,
): Promise<{
  backend: CadV1Backend;
  snapshot: () => { document: TDoc; version: number };
}> {
  const { backend, snapshot } = await installCadV1Backend(context, {
    document: document as unknown as Record<string, unknown>,
    footprint,
  });
  return {
    backend,
    snapshot: () => {
      const current = snapshot();
      return {
        document: current.document as unknown as TDoc,
        version: current.version,
      };
    },
  };
}
