/**
 * TRANSPORTE de la presencia — el puerto y su único adaptador de hoy.
 *
 * ## Lo que este archivo SÍ hace y lo que NO
 *
 * Difunde latidos entre las pestañas de ESTE navegador
 * (`BroadcastChannel`). Es el caso real más frecuente de un despacho pequeño
 * —el mismo arquitecto con el plano abierto en dos pantallas, o la becaria en
 * el equipo compartido— y es lo que se puede sostener sin inventar
 * infraestructura: la API no tiene hoy ningún canal en vivo (ni WebSocket ni
 * SSE: comprobado, no hay ninguno en `apps/api`).
 *
 * NO difunde entre máquinas distintas. Dos arquitectos en dos portátiles no se
 * ven el cursor. Decirlo aquí importa porque la alternativa —enseñar la
 * insignia «2 conectados» que en realidad cuenta pestañas propias— es
 * exactamente el resultado a medias que parece correcto que este repositorio
 * prohíbe. Cerrar ese hueco es un canal en el servidor, y el puerto de abajo
 * es su punto de entrada: un segundo adaptador, sin tocar el modelo, el
 * overlay ni la capa de React.
 *
 * ## Por qué el canal es un puerto inyectable
 *
 * `BroadcastChannel` no existe en Node, y la lógica que importa —serializar,
 * filtrar el eco de uno mismo, rechazar basura— sí se puede probar. El puerto
 * la deja probada con un doble de dos métodos.
 */
import type { CadPresenceBeat } from "./presence";

/** Lo mínimo de `BroadcastChannel` que este módulo usa. */
export interface CadPresenceChannelPort {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export type CadPresenceChannelFactory = (
  name: string,
) => CadPresenceChannelPort | null;

/** Sobre del mensaje. El tipo marcado evita confundirlo con otro tráfico. */
interface CadPresenceEnvelope {
  channel: "valle.cad.presence";
  version: 1;
  beat: CadPresenceBeat;
}

const CHANNEL_TAG = "valle.cad.presence";

/** Nombre del canal: un documento, una conversación. */
export function cadPresenceChannelName(documentId: string): string {
  return `${CHANNEL_TAG}.${documentId}`;
}

/**
 * Adaptador por defecto. Devuelve null donde no hay `BroadcastChannel` (SSR,
 * navegadores viejos, contextos con el API bloqueado) para que la capa de
 * arriba se quede SIN presencia en vez de reventar el estudio: perder los
 * cursores no puede costar el editor.
 */
export const broadcastPresenceChannel: CadPresenceChannelFactory = (name) => {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(name) as unknown as CadPresenceChannelPort;
  } catch {
    return null;
  }
};

/** Resultado de la sonda. Se cachea: el soporte no cambia en una sesión. */
let probed: boolean | null = null;

/**
 * ¿Hay transporte de presencia en este navegador?
 *
 * Se responde ABRIENDO un canal de sonda y cerrándolo, no mirando si el
 * símbolo existe: hay contextos donde `BroadcastChannel` está declarado y su
 * constructor lanza (particiones de almacenamiento, políticas estrictas). La
 * diferencia importa porque de esta respuesta depende que la interfaz diga
 * «no hay nadie más» o «no puedo saberlo», y esas dos frases no son la misma.
 *
 * El resultado se cachea para que se pueda leer durante el render sin coste.
 */
export function cadPresenceChannelAvailable(): boolean {
  if (probed !== null) return probed;
  const channel = broadcastPresenceChannel(`${CHANNEL_TAG}.probe`);
  probed = !!channel;
  channel?.close();
  return probed;
}

export interface CadPresenceTransport {
  /** Emite un latido. Silencioso si el canal no está disponible. */
  send(beat: CadPresenceBeat): void;
  close(): void;
  /** false cuando no hubo canal: la interfaz lo dice en vez de fingir. */
  readonly connected: boolean;
}

/**
 * Abre el transporte de presencia de un documento.
 *
 * `selfPeerId` filtra el eco: `BroadcastChannel` no se entrega a sí mismo,
 * pero el filtro se queda porque un futuro adaptador de servidor SÍ suele
 * devolver lo que uno emite, y descubrirlo entonces significa verse a uno
 * mismo como un segundo cursor sobre el propio cursor.
 */
export function openCadPresenceTransport(options: {
  documentId: string;
  selfPeerId: string;
  onBeat: (beat: CadPresenceBeat) => void;
  factory?: CadPresenceChannelFactory;
}): CadPresenceTransport {
  const factory = options.factory ?? broadcastPresenceChannel;
  const channel = factory(cadPresenceChannelName(options.documentId));
  if (channel) {
    channel.onmessage = (event) => {
      const beat = readEnvelope(event.data);
      if (!beat || beat.peerId === options.selfPeerId) return;
      options.onBeat(beat);
    };
  }
  return {
    connected: !!channel,
    send(beat) {
      if (!channel) return;
      const envelope: CadPresenceEnvelope = {
        channel: CHANNEL_TAG,
        version: 1,
        beat,
      };
      try {
        channel.postMessage(envelope);
      } catch {
        // Un latido perdido no es un error del producto: el siguiente llega en
        // CAD_PRESENCE_BEAT_MS y el compañero caduca solo si dejan de llegar.
      }
    },
    close() {
      if (!channel) return;
      channel.onmessage = null;
      channel.close();
    },
  };
}

/**
 * Valida el sobre. Cualquier cosa que no sea EXACTAMENTE un latido de esta
 * versión se descarta: por un `BroadcastChannel` puede pasar tráfico de otra
 * parte de la aplicación, y un objeto a medias produciría un compañero
 * fantasma sin nombre plantado en el (0,0) del dibujo.
 */
function readEnvelope(data: unknown): CadPresenceBeat | null {
  if (!data || typeof data !== "object") return null;
  const envelope = data as Partial<CadPresenceEnvelope>;
  if (envelope.channel !== CHANNEL_TAG || envelope.version !== 1) return null;
  const beat = envelope.beat;
  if (!beat || typeof beat !== "object") return null;
  if (typeof beat.peerId !== "string" || !beat.peerId) return null;
  if (typeof beat.documentId !== "string" || !beat.documentId) return null;
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
