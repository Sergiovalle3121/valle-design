"use client";

/**
 * EL PUERTO DE RED de la llamada: unir/salir/mandar señal por `fetch` (vía
 * `designClient.calls`, las mismas cookies first-party y CSRF que el resto
 * del producto) y la entrega en vivo por `EventSource` sobre
 * `GET /v1/calls/rooms/{roomId}/events`.
 *
 * El parseo del stream vive aparte, en `call-signaling-wire.ts`, puro y
 * probado sin `EventSource`. Este archivo es la mitad que SÍ toca el
 * navegador — mismo reparto que `collab/presence-channel.ts` entre la
 * aritmética de presencia y su transporte `BroadcastChannel`.
 *
 * `EventSource` se inyecta por fábrica (`eventSourceFactory`) exactamente
 * por la misma razón que `presence-channel.ts` inyecta `BroadcastChannel`:
 * sin eso, nada de esto se puede ejercitar desde una prueba sin un
 * navegador real detrás.
 */
import { designClient } from "../repositories/client";
import { parseCallWireEvent, type CallWireEvent, type CallWireSignalKind } from "./call-signaling-wire";
import type { CallJoinResponse } from "@valle/design-sdk";

/** Lo mínimo de `EventSource` que este módulo usa. */
export interface CallEventSourcePort {
  addEventListener(type: string, handler: (event: { data: string }) => void): void;
  close(): void;
  readonly readyState: number;
  onerror: ((event: unknown) => void) | null;
}

/** `EventSource.readyState` cuando se rindió — no va a reconectar solo. */
const EVENT_SOURCE_CLOSED = 2;

export type CallEventSourceFactory = (url: string) => CallEventSourcePort;

export const nativeCallEventSourceFactory: CallEventSourceFactory = (url) =>
  new EventSource(url, { withCredentials: true }) as unknown as CallEventSourcePort;

const WIRE_EVENT_TYPES = ["roster", "signal", "ping"] as const;

export interface CallSignalingClient {
  /** Crea o se une a la sala del documento. */
  join(documentId: string, displayName?: string): Promise<CallJoinResponse>;
  leave(roomId: string, participantId: string): Promise<void>;
  sendSignal(
    roomId: string,
    fromParticipantId: string,
    toParticipantId: string,
    kind: CallWireSignalKind,
    payload: Record<string, unknown>,
  ): Promise<void>;
  /** Abre la entrega en vivo. Devuelve la función que la cierra. */
  connect(
    roomId: string,
    participantId: string,
    onEvent: (event: CallWireEvent) => void,
    onError: (error: unknown) => void,
  ): () => void;
}

export function createCallSignalingClient(
  eventSourceFactory: CallEventSourceFactory = nativeCallEventSourceFactory,
): CallSignalingClient {
  return {
    async join(documentId, displayName) {
      return designClient.calls.join({ documentId, displayName });
    },
    async leave(roomId, participantId) {
      await designClient.calls.leave(roomId, participantId);
    },
    async sendSignal(roomId, fromParticipantId, toParticipantId, kind, payload) {
      await designClient.calls.signal(roomId, {
        fromParticipantId,
        toParticipantId,
        kind,
        payload,
      });
    },
    connect(roomId, participantId, onEvent, onError) {
      const url = designClient.calls.eventsUrl(roomId, participantId);
      const source = eventSourceFactory(url);
      for (const type of WIRE_EVENT_TYPES) {
        source.addEventListener(type, (raw) => {
          const parsed = parseCallWireEvent(type, raw.data);
          // Un evento que no pasa la validación se descarta en silencio: es
          // exactamente lo que `call-signaling-wire.spec.ts` prueba, y
          // reportarlo como error de conexión confundiría "el servidor mandó
          // basura" con "la conexión se cayó" — son problemas distintos.
          if (parsed) onEvent(parsed);
        });
      }
      // `EventSource` reintenta la reconexión de red por su cuenta; sólo un
      // `readyState === CLOSED` significa que se rindió de verdad.
      source.onerror = () => {
        if (source.readyState === EVENT_SOURCE_CLOSED) {
          onError(new Error("call_signaling_lost"));
        }
      };
      return () => source.close();
    },
  };
}
