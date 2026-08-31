/**
 * Aritmética pura del chat de equipo: agrupado por día, hilos y el ancla al
 * dibujo. Sin React, sin `fetch` — el host (`apps/web/src/components/cad/
 * messaging/`) es quien la conecta a la API y al DOM.
 *
 * ## El ancla NO se reinventa aquí
 *
 * Un mensaje puede apuntar a un punto del dibujo con el MISMO contrato JSON
 * que un comentario de revisión (`../collab/comment-anchor.ts`,
 * `CadCommentAnchorPoint`) y se PINTA con el MISMO colocador de chinchetas
 * (`../collab/overlay-model.ts`, `placeCadCommentPins`) — este módulo sólo
 * adapta un `TeamMessage` anclado a la forma `CadCommentPin` que ese
 * colocador ya sabe proyectar. Duplicar esa aritmética aquí habría creado dos
 * visores del mismo ancla que, tarde o temprano, dejan de coincidir.
 */
import type { CadCommentAnchorSpace } from "../collab/comment-anchor";
import { readCadCommentAnchor } from "../collab/comment-anchor";
import type { CadCommentPin } from "../collab/overlay-model";

export interface TeamMessageAuthor {
  userId: string;
  email: string;
  displayName: string | null;
}

export interface TeamMessage {
  id: string;
  channelId: string;
  author: TeamMessageAuthor;
  body: string;
  parentMessageId: string | null;
  anchor: Record<string, unknown> | null;
  /** ISO 8601, como lo devuelve la API. */
  createdAt: string;
}

/* ─────────────────────────────── Agrupado por día ─────────────────────────── */

export interface TeamMessageDayGroup {
  /** `YYYY-MM-DD` en el reloj LOCAL del navegador — es una clave, no UTC. */
  dayKey: string;
  /** "Hoy" / "Ayer" / fecha larga en es-MX. */
  label: string;
  messages: TeamMessage[];
}

/**
 * Agrupa por día de calendario LOCAL y ordena los grupos cronológicamente.
 * Dentro de cada grupo conserva el orden de llegada de `messages` — quien
 * llama decide si eso es ascendente o descendente.
 */
export function groupMessagesByDay(
  messages: readonly TeamMessage[],
  options: { now?: Date; locale?: string } = {},
): TeamMessageDayGroup[] {
  const now = options.now ?? new Date();
  const locale = options.locale ?? "es-MX";
  const todayKey = localDayKey(now);
  const yesterdayKey = localDayKey(new Date(now.getTime() - 86_400_000));

  const order: string[] = [];
  const buckets = new Map<string, TeamMessage[]>();
  for (const message of messages) {
    const key = localDayKey(new Date(message.createdAt));
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(message);
    } else {
      buckets.set(key, [message]);
      order.push(key);
    }
  }

  return [...order]
    .sort()
    .map((key) => ({
      dayKey: key,
      label: dayLabel(key, todayKey, yesterdayKey, locale),
      messages: buckets.get(key)!,
    }));
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayLabel(
  key: string,
  todayKey: string,
  yesterdayKey: string,
  locale: string,
): string {
  if (key === todayKey) return "Hoy";
  if (key === yesterdayKey) return "Ayer";
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/* ──────────────────────────────────── Hilos ────────────────────────────────── */

export interface TeamMessageThread {
  root: TeamMessage;
  replies: TeamMessage[];
}

/**
 * Agrupa respuestas bajo su mensaje raíz. Una respuesta cuyo `parentMessageId`
 * no está en `messages` (el padre quedó en una página anterior, todavía sin
 * cargar) se OMITE del hilo — no se inventa un raíz sintético — y es
 * responsabilidad del host pedir más historial si necesita reconstruirlo.
 */
export function buildMessageThreads(
  messages: readonly TeamMessage[],
): TeamMessageThread[] {
  const roots: TeamMessage[] = [];
  const repliesByParent = new Map<string, TeamMessage[]>();
  for (const message of messages) {
    if (!message.parentMessageId) {
      roots.push(message);
      continue;
    }
    const bucket = repliesByParent.get(message.parentMessageId);
    if (bucket) bucket.push(message);
    else repliesByParent.set(message.parentMessageId, [message]);
  }
  return roots.map((root) => ({
    root,
    replies: [...(repliesByParent.get(root.id) ?? [])].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    ),
  }));
}

/* ────────────────────────────── Chinchetas de ancla ────────────────────────── */

export interface TeamMessagePin extends CadCommentPin {
  messageId: string;
  space: CadCommentAnchorSpace;
}

/**
 * Mensajes anclados → chinchetas, en el mismo formato que
 * `placeCadCommentPins` ya sabe proyectar sobre la cámara viva. Un ancla
 * `unreadable` o `unanchored` NO produce chincheta — fallo cerrado, igual que
 * los comentarios de revisión (ver `comment-anchor.ts`).
 */
export function messageAnchorPins(
  messages: readonly TeamMessage[],
): TeamMessagePin[] {
  const pins: TeamMessagePin[] = [];
  let ordinal = 0;
  for (const message of messages) {
    const read = readCadCommentAnchor(message.anchor);
    if (read.status !== "anchored") continue;
    ordinal += 1;
    pins.push({
      id: message.id,
      messageId: message.id,
      world: { x: read.anchor.x, y: read.anchor.y },
      resolved: false,
      ordinal,
      space: read.anchor.space,
    });
  }
  return pins;
}
