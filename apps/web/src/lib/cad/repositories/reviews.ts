import { designClient } from "./client";
import type { CadCommentAnchorPoint } from "@/lib/cad/collab/comment-anchor";

/**
 * Revisión y comentarios: las DOS superficies del contrato, una al lado de la
 * otra a propósito.
 *
 * - `reviewsRepository` es la del AUTOR: sesión + permiso `cad:review`.
 * - `reviewLinkRepository(token)` es la del INVITADO: sin cookie, autenticada
 *   por el token server-owned en `X-Review-Token`, y acotada por el BACKEND a
 *   UN documento —el de la sesión— con todo lo demás en 403 `review_read_only`.
 *
 * Comparten forma (`list`/`create`/`resolve`) porque el panel de hilos es el
 * mismo componente en el estudio y en la página pública. Lo que NO comparten
 * es el alcance, y por eso son dos objetos y no uno con una bandera: una
 * bandera se pasa mal una vez y el invitado acaba llamando a la ruta del
 * autor.
 */
export const reviewsRepository = {
  list: (documentId: string, status?: "open" | "closed") =>
    designClient.reviews.list(documentId, status ? { status } : undefined),
  create: (
    documentId: string,
    input?: {
      shareLink?: boolean;
      allowComments?: boolean;
      shareLinkTtlMinutes?: number;
    },
  ) => designClient.reviews.create(documentId, input),
  close: (sessionId: string) => designClient.reviews.close(sessionId),
  redeem: (token: string) => designClient.reviewLink(token).context(),

  /** Hilos del documento vistos por el autor (todas las sesiones). */
  comments: {
    list: (
      documentId: string,
      query?: { reviewSessionId?: string; resolved?: boolean },
    ) => designClient.reviews.comments.list(documentId, query),
    create: (
      documentId: string,
      input: {
        body: string;
        anchor?: CadCommentAnchorPoint | null;
        reviewSessionId?: string | null;
      },
    ) =>
      designClient.reviews.comments.create(documentId, {
        ...input,
        // El contrato declara `anchor` como JSON LIBRE y openapi-typescript
        // traduce eso a `Record<string, never>`, un tipo al que no se le puede
        // asignar ningún objeto con campos. La conversión es aquí, en el
        // único punto donde el ancla cruza al SDK, y el tipo de VERDAD lo
        // impone `comment-anchor.ts` en las dos direcciones.
        anchor: (input.anchor ?? null) as unknown as Record<string, never> | null,
      }),
    resolve: (commentId: string) =>
      designClient.reviews.comments.resolve(commentId),
  },
};

/**
 * Superficie del invitado. Recibe el token en cada llamada en vez de
 * guardarlo: quien lo custodia es la página del enlace, que lo tiene en
 * `sessionStorage` (muere con la pestaña) y nunca en `localStorage`.
 */
export function reviewLinkRepository(token: string) {
  const surface = designClient.reviewLink(token);
  return {
    context: () => surface.context(),
    comments: {
      list: () => surface.comments.list(),
      create: (input: { body: string; anchor?: CadCommentAnchorPoint | null }) =>
        surface.comments.create({
          ...input,
          // El SDK declara el ancla como JSON libre; el tipo con nombre no
          // lleva firma de índice y por eso no encaja solo. La forma de
          // verdad la impone `comment-anchor.ts` al escribir y al leer.
          anchor: (input.anchor ?? null) as Record<string, unknown> | null,
        }),
      resolve: (commentId: string) => surface.comments.resolve(commentId),
    },
  };
}
