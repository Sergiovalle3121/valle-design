/**
 * Comentarios de revisión en la frontera de red, espejo de `cad_comments` y de
 * los dos controladores reales (`cad-review.controller.ts` para el autor,
 * `cad-review-link.controller.ts` para el invitado).
 *
 * Vive fuera de `cad-v1-backend.ts` por el presupuesto de tamaño: aquel
 * archivo ronda las 700 líneas y el gate de monolito corta los nuevos en 800.
 * La separación además deja aparte lo que este fixture existe para reproducir:
 * el AISLAMIENTO. Un token de revisión ve el hilo de SU sesión y nada más, y
 * si el golden no puede fallar por eso, no está probando lo que dice probar.
 */

export interface ReviewCommentRow {
  id: string;
  documentId: string;
  reviewSessionId: string | null;
  author: string;
  body: string;
  anchor: Record<string, unknown> | null;
  resolved: boolean;
  createdAt: string;
}

export interface ReviewCommentSession {
  id: string;
  documentId: string;
  allowComments: boolean;
  /** false ⇒ cerrada o revocada: el canje muere. */
  live: boolean;
}

export interface ReviewCommentHost {
  /** Sesión viva para un token, o null (token desconocido/expirado/revocado). */
  sessionForToken(token: string): ReviewCommentSession | null;
  documentExists(documentId: string): boolean;
  /** Con quién firma la superficie del autor. */
  authorName: string;
}

export interface ReviewCommentReply {
  status: number;
  body: unknown;
}

const AUTHOR_LIST = /^\/v1\/cad\/documents\/([^/]+)\/comments$/;
const AUTHOR_RESOLVE = /^\/v1\/cad\/comments\/([^/]+)\/resolve$/;
const LINK_RESOLVE = /^\/v1\/cad\/review\/comments\/([^/]+)\/resolve$/;

export class CadReviewCommentStore {
  readonly rows: ReviewCommentRow[] = [];
  private seq = 0;

  constructor(private readonly host: ReviewCommentHost) {}

  /** Devuelve null si la ruta no es de comentarios (el router sigue). */
  handle(input: {
    path: string;
    method: string;
    body: () => Record<string, unknown>;
    reviewToken: string;
    query: URLSearchParams;
  }): ReviewCommentReply | null {
    const { path, method } = input;

    /* ── Superficie del AUTOR ─────────────────────────────────────────── */
    const authorList = path.match(AUTHOR_LIST);
    if (authorList) {
      const documentId = authorList[1];
      if (!this.host.documentExists(documentId))
        return notFound("Documento CAD no encontrado.");
      if (method === "GET") {
        const sessionFilter = input.query.get("reviewSessionId");
        const resolvedFilter = input.query.get("resolved");
        return {
          status: 200,
          body: {
            items: this.rows
              .filter((row) => row.documentId === documentId)
              .filter(
                (row) => !sessionFilter || row.reviewSessionId === sessionFilter,
              )
              .filter(
                (row) =>
                  resolvedFilter === null ||
                  row.resolved === (resolvedFilter === "true"),
              )
              .map(resource),
          },
        };
      }
      if (method === "POST") {
        const dto = input.body();
        const body = String(dto.body ?? "").trim();
        if (!body) return badRequest("El comentario no puede estar vacío.");
        return {
          status: 201,
          body: resource(
            this.insert({
              documentId,
              reviewSessionId:
                typeof dto.reviewSessionId === "string" ? dto.reviewSessionId : null,
              author: this.host.authorName,
              body,
              anchor: anchorOf(dto.anchor),
            }),
          ),
        };
      }
    }

    const authorResolve = path.match(AUTHOR_RESOLVE);
    if (authorResolve && method === "POST") {
      const row = this.rows.find((candidate) => candidate.id === authorResolve[1]);
      if (!row) return notFound("Comentario no encontrado.");
      row.resolved = true;
      return { status: 200, body: resource(row) };
    }

    /* ── Superficie del REVIEW LINK (invitado, sin sesión) ─────────────── */
    if (!path.startsWith("/v1/cad/review/comments")) return null;

    const session = this.host.sessionForToken(input.reviewToken);
    if (!input.reviewToken || !session) {
      return {
        status: 401,
        body: {
          code: "review_token_invalid",
          message: "El review link no es válido.",
        },
      };
    }
    if (!session.live) {
      return {
        status: 401,
        body: {
          code: "review_token_revoked",
          message: "El review link fue revocado.",
        },
      };
    }

    if (path === "/v1/cad/review/comments" && method === "GET") {
      // AISLAMIENTO: sólo el hilo de SU sesión. Ni otros hilos del mismo
      // documento ni, por supuesto, los de otro documento.
      return {
        status: 200,
        body: {
          items: this.rows
            .filter(
              (row) =>
                row.documentId === session.documentId &&
                row.reviewSessionId === session.id,
            )
            .map(resource),
        },
      };
    }

    if (path === "/v1/cad/review/comments" && method === "POST") {
      if (!session.allowComments) return commentsDisabled();
      const dto = input.body();
      const body = String(dto.body ?? "").trim();
      if (!body) return badRequest("El comentario no puede estar vacío.");
      return {
        status: 201,
        body: resource(
          this.insert({
            documentId: session.documentId,
            reviewSessionId: session.id,
            author: "anonymous",
            body,
            anchor: anchorOf(dto.anchor),
          }),
        ),
      };
    }

    const linkResolve = path.match(LINK_RESOLVE);
    if (linkResolve && method === "POST") {
      if (!session.allowComments) return commentsDisabled();
      const row = this.rows.find((candidate) => candidate.id === linkResolve[1]);
      // Fuera del hilo de la sesión, el comentario "no existe" para el invitado.
      if (!row || row.reviewSessionId !== session.id)
        return notFound("Comentario no encontrado.");
      row.resolved = true;
      return { status: 200, body: resource(row) };
    }

    return { status: 404, body: { message: "No encontrado.", requestId: "e2e" } };
  }

  private insert(
    input: Omit<ReviewCommentRow, "id" | "resolved" | "createdAt">,
  ): ReviewCommentRow {
    this.seq += 1;
    const row: ReviewCommentRow = {
      ...input,
      id: `00000000-0000-4000-a000-${String(this.seq).padStart(12, "0")}`,
      resolved: false,
      // Instantes ESTRICTAMENTE crecientes: el orden del hilo es el orden de
      // llegada, y con la resolución del reloj dos comentarios seguidos
      // empatarían y el número de la chincheta bailaría entre recargas.
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, this.seq)).toISOString(),
    };
    this.rows.push(row);
    return row;
  }
}

function resource(row: ReviewCommentRow) {
  return {
    id: row.id,
    documentId: row.documentId,
    reviewSessionId: row.reviewSessionId,
    author: row.author,
    body: row.body,
    anchor: row.anchor,
    resolved: row.resolved,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
  };
}

function anchorOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function notFound(message: string): ReviewCommentReply {
  return { status: 404, body: { message, requestId: "e2e" } };
}

function badRequest(message: string): ReviewCommentReply {
  return { status: 400, body: { message, requestId: "e2e" } };
}

function commentsDisabled(): ReviewCommentReply {
  return {
    status: 403,
    body: {
      code: "review_comments_disabled",
      message: "Esta sesión de revisión no admite comentarios.",
    },
  };
}
