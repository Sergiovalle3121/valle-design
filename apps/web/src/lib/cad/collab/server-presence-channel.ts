"use client";

/**
 * TRANSPORTE de la presencia — el SEGUNDO adaptador, el que cruza máquinas.
 *
 * `presence-channel.ts` (que este archivo NO toca) ya declara el puerto —
 * `CadPresenceChannelPort`/`CadPresenceChannelFactory` — y dice literalmente
 * en su cabecera que cerrar el hueco entre máquinas distintas «es un canal en
 * el servidor... un segundo adaptador, sin tocar el modelo, el overlay ni la
 * capa de React». Esto es ese adaptador: `EventSource` para recibir,
 * `fetch` (vía el SDK) para publicar.
 *
 * ## El sobre de red, acoplado a propósito
 *
 * `openCadPresenceTransport` valida cada mensaje con `readEnvelope`, una
 * función PRIVADA de `presence-channel.ts` que exige exactamente
 * `{channel: "valle.cad.presence", version: 1, beat}`. Ese literal no es
 * secreto (está en claro en el archivo), pero SÍ es un acoplamiento real: si
 * cambia allá sin cambiar aquí, este adaptador deja de hablar con el puerto
 * en silencio. `server-presence-channel.spec.ts` lo cubre porque ejercita el
 * `openCadPresenceTransport` REAL (no un doble) contra este adaptador.
 *
 * ## Por qué NO participa un invitado de review link
 *
 * `EventSource` no puede mandar el header `X-Review-Token` (no acepta
 * headers custom), así que sólo puede autenticarse por cookie de sesión
 * first-party — un invitado no tiene una. `use-cad-presence.ts` es quien
 * decide no abrir este transporte para `guest: true`; este archivo se queda
 * ciego a esa distinción a propósito (no es su capa).
 *
 * ## Reconexión
 *
 * `EventSource` ya reintenta solo ante un corte de red — es su comportamiento
 * nativo. Lo que NO hace solo es recuperarse de un cierre DEFINITIVO
 * (`readyState === CLOSED`, p. ej. un 401 porque la sesión expiró, o un 404
 * porque el documento se archivó): ahí se queda "conectado" en apariencia sin
 * estarlo. Este adaptador detecta ese cierre y reabre con backoff exponencial
 * (1 s → 15 s tope), reseteando el backoff en cuanto vuelve a recibir datos.
 */
import type { CadPresenceBeat } from "./presence";
import {
  cadPresenceChannelName,
  type CadPresenceChannelFactory,
  type CadPresenceChannelPort,
} from "./presence-channel";
import { designClient } from "@/lib/cad/repositories/client";

/** Ver "El sobre de red" arriba — debe coincidir con presence-channel.ts. */
const WIRE_ENVELOPE_CHANNEL = "valle.cad.presence";
const WIRE_ENVELOPE_VERSION = 1;

const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

/**
 * `openCadPresenceTransport` sólo pasa el NOMBRE del canal a la factory (el
 * puerto no admite más contexto — no se toca para dárselo). El documentId se
 * recupera del propio nombre en vez de duplicar el formato: `""` como
 * documento produce el PREFIJO exacto que usa cualquier documento real.
 */
function documentIdFromChannelName(name: string): string | null {
  const prefix = cadPresenceChannelName("");
  if (!name.startsWith(prefix)) return null;
  const documentId = name.slice(prefix.length);
  return documentId || null;
}

interface ServerWireBeat {
  peerId: string;
  documentId: string;
  name: string;
  at: number;
  cursor: { x: number; y: number } | null;
  viewport: { minX: number; minY: number; maxX: number; maxY: number } | null;
  guest: boolean;
}

/**
 * Valida el latido que manda el servidor. Mismo fallo-cerrado que
 * `presence.ts`: cualquier cosa a medias se descarta con `null` en vez de
 * producir un compañero fantasma.
 */
function parseServerBeat(raw: unknown, documentId: string): CadPresenceBeat | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const beat = parsed as Partial<ServerWireBeat>;
  if (typeof beat.peerId !== "string" || !beat.peerId) return null;
  if (beat.documentId !== documentId) return null;
  if (typeof beat.name !== "string") return null;
  if (typeof beat.at !== "number" || !Number.isFinite(beat.at)) return null;
  if (typeof beat.guest !== "boolean") return null;
  return {
    peerId: beat.peerId,
    documentId: beat.documentId,
    name: beat.name,
    at: beat.at,
    cursor: beat.cursor ?? null,
    viewport: beat.viewport ?? null,
    guest: beat.guest,
  };
}

/** Extrae el latido propio del sobre que `presence-channel.ts` construye al enviar. */
function extractOutgoingBeat(message: unknown): CadPresenceBeat | null {
  if (!message || typeof message !== "object") return null;
  const beat = (message as { beat?: unknown }).beat;
  if (!beat || typeof beat !== "object") return null;
  const candidate = beat as Partial<CadPresenceBeat>;
  if (typeof candidate.peerId !== "string" || !candidate.peerId) return null;
  return candidate as CadPresenceBeat;
}

class ServerPresenceChannelPort implements CadPresenceChannelPort {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  private source: EventSource | null = null;
  private closed = false;
  private reconnectDelayMs = RECONNECT_INITIAL_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly documentId: string) {
    this.open();
  }

  postMessage(message: unknown): void {
    if (this.closed) return;
    const beat = extractOutgoingBeat(message);
    if (!beat) return;
    // Fire-and-forget: un latido perdido no es un error del producto — el
    // siguiente llega en CAD_PRESENCE_BEAT_MS (mismo principio que el
    // adaptador de BroadcastChannel).
    void designClient.presence
      .publish(this.documentId, {
        peerId: beat.peerId,
        cursor: beat.cursor,
        viewport: beat.viewport,
      })
      .catch(() => undefined);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.source?.close();
    this.source = null;
  }

  private open(): void {
    if (this.closed || typeof EventSource === "undefined") return;
    const url = designClient.presence.streamUrl(this.documentId);
    const source = new EventSource(url, { withCredentials: true });
    this.source = source;
    source.onopen = () => {
      this.reconnectDelayMs = RECONNECT_INITIAL_MS;
    };
    source.onmessage = (event) => {
      this.reconnectDelayMs = RECONNECT_INITIAL_MS;
      const beat = parseServerBeat(event.data, this.documentId);
      if (!beat) return;
      this.onmessage?.({
        data: {
          channel: WIRE_ENVELOPE_CHANNEL,
          version: WIRE_ENVELOPE_VERSION,
          beat,
        },
      });
    };
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        this.source = null;
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
      this.reconnectDelayMs = Math.min(
        this.reconnectDelayMs * 2,
        RECONNECT_MAX_MS,
      );
    }, this.reconnectDelayMs);
  }
}

/**
 * Adaptador por defecto de este módulo. `null` en SSR o donde `EventSource`
 * no existe — la capa de arriba se queda SIN presencia entre máquinas en vez
 * de reventar (mismo contrato que `broadcastPresenceChannel`).
 */
export const serverPresenceChannel: CadPresenceChannelFactory = (name) => {
  if (typeof EventSource === "undefined") return null;
  const documentId = documentIdFromChannelName(name);
  if (!documentId) return null;
  return new ServerPresenceChannelPort(documentId);
};
