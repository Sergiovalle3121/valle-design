/**
 * La superficie del INVITADO del backend de mentira: canjear un review link y
 * revocarlo.
 *
 * Sale de `cad-v1-backend.ts` por el presupuesto de tamaño —el mismo motivo que
 * sacó los hilos de comentario y los conjuntos de planos— y porque es una
 * superficie con reglas propias: no lleva cookie de primera parte ni CSRF, se
 * identifica SÓLO por la cabecera `x-review-token`, y sus tres formas de
 * rechazar (inválido, revocado, caducado) son justo lo que sus goldens miran.
 *
 * El estado sigue viviendo en el backend: aquí sólo se decide qué contestar.
 */
export interface CadReviewSessionRow {
  id: string;
  documentId: string;
  token: string;
  status: "open" | "closed";
  allowComments: boolean;
  expiresAt: string;
  revokedAt: string | null;
  closedAt: string | null;
}

export interface CadReviewLinkReply {
  body: unknown;
  status: number;
}

/** El recurso de sesión tal y como lo devuelve la API real. */
export function cadReviewSessionResource(
  session: CadReviewSessionRow,
  createdAt: string,
): Record<string, unknown> {
  return {
    id: session.id,
    documentId: session.documentId,
    status: session.status,
    hasShareLink: true,
    allowComments: session.allowComments,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    closedAt: session.closedAt,
    createdAt,
    createdBy: "e2e@valle",
  };
}

export interface CadReviewLinkDeps {
  sessions: CadReviewSessionRow[];
  /** El documento que ve el invitado, ya en la forma que espera el cliente. */
  documentPayload(documentId: string): Record<string, unknown> | null;
  now: string;
}

/**
 * Atiende las dos rutas del invitado. `null` cuando la ruta no es suya, para
 * que el enrutador del backend siga probando.
 */
export function cadReviewLinkRoutes(
  input: { path: string; method: string; reviewToken: string },
  deps: CadReviewLinkDeps,
): CadReviewLinkReply | null {
  if (input.path === "/v1/cad/review/context" && input.method === "GET") {
    const token = input.reviewToken;
    const session = deps.sessions.find((candidate) => candidate.token === token);
    if (!token || !session)
      return { body: { code: "review_token_invalid", message: "El review link no es válido." }, status: 401 };
    if (session.revokedAt || session.status !== "open")
      return { body: { code: "review_token_revoked", message: "El review link fue revocado." }, status: 401 };
    if (Date.parse(session.expiresAt) <= Date.now())
      return { body: { code: "review_token_expired", message: "El review link expiró." }, status: 401 };
    const document = deps.documentPayload(session.documentId);
    if (!document)
      return { body: { message: "Documento CAD no encontrado.", requestId: "e2e" }, status: 404 };
    return {
      body: {
        session: cadReviewSessionResource(session, deps.now),
        readOnly: true,
        document,
      },
      status: 200,
    };
  }

  const closeMatch = input.path.match(/^\/v1\/cad\/review-sessions\/([^/]+)\/close$/);
  if (closeMatch && input.method === "POST") {
    const session = deps.sessions.find((candidate) => candidate.id === closeMatch[1]);
    if (!session)
      return { body: { message: "Sesión de revisión no encontrada.", requestId: "e2e" }, status: 404 };
    if (session.status === "closed")
      return { body: { code: "review_session_closed", message: "Ya estaba cerrada." }, status: 409 };
    session.status = "closed";
    session.closedAt = deps.now;
    session.revokedAt = deps.now;
    return { body: cadReviewSessionResource(session, deps.now), status: 200 };
  }
  return null;
}
