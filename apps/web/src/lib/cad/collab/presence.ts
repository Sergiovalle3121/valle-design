/**
 * PRESENCIA: quién más está mirando este plano, dónde tiene el cursor y qué
 * trozo del dibujo tiene delante.
 *
 * ## Qué se modela aquí y qué no
 *
 * Aquí está la ARITMÉTICA: aplicar un latido, caducar a quien dejó de latir,
 * ordenar la lista y repartir colores estables. Nada de red, nada de DOM. El
 * transporte es un puerto (`presence-channel.ts`) y hoy tiene un solo
 * adaptador —`BroadcastChannel`, que difunde entre PESTAÑAS DE ESTE
 * navegador—. Ese límite está declarado ahí y en el reporte de la ola, no
 * disimulado: sin un canal en el servidor, la presencia entre máquinas
 * distintas no existe todavía.
 *
 * ## Por qué el TTL usa el reloj LOCAL
 *
 * Cada latido trae el `at` del emisor, y ese reloj no es el mío: dos equipos
 * con diez minutos de desfase son normales, y no hace falta malicia para
 * romperlo. Si la caducidad se calculara con `at`, un compañero con el reloj
 * adelantado sería inmortal y uno atrasado desaparecería nada más aparecer.
 * Por eso `receivedAt` —el reloj de ESTA pestaña, el único que compara
 * consigo mismo— manda para caducar, y `at` se conserva sólo para descartar
 * latidos que llegan desordenados del MISMO emisor.
 *
 * ## Fallo cerrado
 *
 * Un latido de otro documento, sin identidad, o con coordenadas que no son
 * números finitos, se RECHAZA con motivo. No se pinta un cursor «aproximado»:
 * un cursor ajeno en el sitio equivocado es peor que ningún cursor, porque el
 * arquitecto cree que su compañero está mirando otra cosa.
 */
import type { CadPoint2 } from "../cad-document";
import type { CadBounds } from "../entity-runtime";

/** Cada cuánto late una pestaña que no mueve el ratón. */
export const CAD_PRESENCE_BEAT_MS = 4_000;
/** Sin latido en este tiempo, el compañero desaparece de la lista. */
export const CAD_PRESENCE_TTL_MS = 12_000;

export interface CadPresenceBeat {
  /** Identidad de la PESTAÑA, no de la persona: dos pestañas son dos puntos. */
  peerId: string;
  documentId: string;
  /** Nombre visible. Vacío ⇒ se muestra como invitado. */
  name: string;
  /** Reloj del emisor. Sólo ordena latidos del mismo emisor (ver cabecera). */
  at: number;
  /** Cursor en coordenadas de DIBUJO, o null si salió del lienzo. */
  cursor: CadPoint2 | null;
  /** Trozo de dibujo que tiene delante, o null si aún no lo sabe. */
  viewport: CadBounds | null;
  /** true si llega por un review link (invitado sin cuenta). */
  guest: boolean;
}

export interface CadPresencePeer extends CadPresenceBeat {
  /** Color estable derivado de `peerId`. */
  color: string;
  /** Reloj LOCAL del último latido aceptado. Es el que caduca. */
  receivedAt: number;
}

export type CadPresenceRejection =
  | "presence_peer_missing"
  | "presence_document_mismatch"
  | "presence_cursor_not_finite"
  | "presence_viewport_not_finite"
  | "presence_beat_stale";

export type CadPresenceApply =
  | { status: "applied"; peers: Map<string, CadPresencePeer> }
  | { status: "rejected"; reason: CadPresenceRejection };

/**
 * Paleta de compañeros.
 *
 * Ocho tonos bien separados en tono y todos legibles sobre el fondo oscuro del
 * lienzo. No se generan por HSL aleatorio: dos colores casi iguales en dos
 * cursores son indistinguibles justo cuando importa —dos personas trabajando
 * cerca— y el azar los produce a menudo.
 */
export const CAD_PRESENCE_COLORS = [
  "#22d3ee",
  "#f472b6",
  "#a3e635",
  "#fbbf24",
  "#c084fc",
  "#fb7185",
  "#34d399",
  "#60a5fa",
] as const;

/** Color estable de un compañero: mismo id ⇒ mismo color en todas las pestañas. */
export function cadPeerColor(peerId: string): string {
  // FNV-1a de 32 bits: barato, sin dependencias y bien repartido para cadenas
  // cortas. No es criptografía y no pretende serlo.
  let hash = 0x811c9dc5;
  for (let index = 0; index < peerId.length; index += 1) {
    hash ^= peerId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return CAD_PRESENCE_COLORS[hash % CAD_PRESENCE_COLORS.length];
}

/**
 * Aplica un latido sobre el mapa de compañeros y devuelve uno NUEVO.
 *
 * Inmutable a propósito: React compara por identidad y un `Map` mutado en el
 * sitio no vuelve a pintar la lista. El coste es una copia de un mapa que en
 * la práctica tiene menos de una decena de entradas.
 */
export function applyCadPresenceBeat(
  peers: ReadonlyMap<string, CadPresencePeer>,
  beat: CadPresenceBeat,
  documentId: string,
  receivedAt: number,
): CadPresenceApply {
  if (!beat.peerId) return { status: "rejected", reason: "presence_peer_missing" };
  if (beat.documentId !== documentId)
    return { status: "rejected", reason: "presence_document_mismatch" };
  if (beat.cursor && !isFinitePoint(beat.cursor))
    return { status: "rejected", reason: "presence_cursor_not_finite" };
  if (beat.viewport && !isFiniteBounds(beat.viewport))
    return { status: "rejected", reason: "presence_viewport_not_finite" };

  const previous = peers.get(beat.peerId);
  // Reordenación del MISMO emisor: `at` sí es comparable consigo mismo.
  if (previous && Number.isFinite(beat.at) && beat.at < previous.at)
    return { status: "rejected", reason: "presence_beat_stale" };

  const next = new Map(peers);
  next.set(beat.peerId, {
    ...beat,
    at: Number.isFinite(beat.at) ? beat.at : receivedAt,
    color: cadPeerColor(beat.peerId),
    receivedAt,
  });
  return { status: "applied", peers: next };
}

/**
 * Quita a los que dejaron de latir. Devuelve el MISMO mapa si no caducó nadie,
 * para que el temporizador de poda no provoque un render por segundo.
 */
export function pruneCadPresence(
  peers: ReadonlyMap<string, CadPresencePeer>,
  now: number,
  ttlMs = CAD_PRESENCE_TTL_MS,
): ReadonlyMap<string, CadPresencePeer> {
  let expired = false;
  for (const peer of peers.values()) {
    if (now - peer.receivedAt > ttlMs) {
      expired = true;
      break;
    }
  }
  if (!expired) return peers;
  const next = new Map<string, CadPresencePeer>();
  for (const [id, peer] of peers)
    if (now - peer.receivedAt <= ttlMs) next.set(id, peer);
  return next;
}

/**
 * Lista ordenada para enseñar: primero quien tiene el cursor sobre el plano
 * —es con quien puedes chocar ahora mismo—, luego por nombre, y el `peerId`
 * desempata para que dos personas con el mismo nombre no bailen en la lista.
 */
export function cadPresenceRoster(
  peers: ReadonlyMap<string, CadPresencePeer>,
): CadPresencePeer[] {
  return [...peers.values()].sort((left, right) => {
    if (!!left.cursor !== !!right.cursor) return left.cursor ? -1 : 1;
    const byName = left.name.localeCompare(right.name, "es");
    return byName !== 0 ? byName : left.peerId.localeCompare(right.peerId);
  });
}

/**
 * ¿Estamos mirando lo mismo? Es la pregunta que responde «quién está viendo
 * qué» sin obligar a nadie a leer coordenadas: si los dos rectángulos se
 * solapan, ese compañero tiene delante parte de tu pantalla.
 */
export function cadPresenceSharesView(
  mine: CadBounds | null,
  theirs: CadBounds | null,
): boolean {
  if (!mine || !theirs) return false;
  return (
    mine.minX <= theirs.maxX &&
    theirs.minX <= mine.maxX &&
    mine.minY <= theirs.maxY &&
    theirs.minY <= mine.maxY
  );
}

function isFinitePoint(point: CadPoint2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isFiniteBounds(bounds: CadBounds): boolean {
  return (
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxY)
  );
}
