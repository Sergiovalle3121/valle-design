/**
 * La forma que SALE por HTTP/SSE: fechas en ISO 8601 (igual que el resto del
 * contrato — ver `Timestamp` en `design-api.v1.yaml`), nunca el epoch en
 * milisegundos que usa el store internamente para la aritmética de TTL. Un
 * sólo punto de conversión evita que un participante llegue con `joinedAt`
 * como número por un camino (la respuesta de `POST /rooms`) y como string
 * por otro (el roster que viaja por SSE).
 */
import type {
  CallParticipantView,
  CallServerEvent,
  QueuedCallSignal,
} from './calls.types';

export interface WireParticipant {
  id: string;
  userId: string;
  name: string;
  joinedAt: string;
}

export function toWireParticipant(
  participant: CallParticipantView,
): WireParticipant {
  return {
    id: participant.id,
    userId: participant.userId,
    name: participant.name,
    joinedAt: new Date(participant.joinedAt).toISOString(),
  };
}

export interface WireSignal {
  id: string;
  fromParticipantId: string;
  kind: QueuedCallSignal['kind'];
  payload: Record<string, unknown>;
  queuedAt: string;
}

export type WireCallServerEvent =
  | { type: 'signal'; signal: WireSignal }
  | { type: 'roster'; participants: WireParticipant[] }
  | { type: 'ping'; at: string };

export function toWireEvent(event: CallServerEvent): WireCallServerEvent {
  if (event.type === 'roster') {
    return {
      type: 'roster',
      participants: event.participants.map(toWireParticipant),
    };
  }
  if (event.type === 'ping') {
    return { type: 'ping', at: new Date(event.at).toISOString() };
  }
  return {
    type: 'signal',
    signal: {
      id: event.signal.id,
      fromParticipantId: event.signal.fromParticipantId,
      kind: event.signal.kind,
      payload: event.signal.payload,
      queuedAt: new Date(event.signal.queuedAt).toISOString(),
    },
  };
}
