/**
 * LA FORMA QUE ENTRA por `GET /v1/calls/rooms/{roomId}/events` — parseo y
 * validación puros, sin `EventSource` ni red. `text/event-stream` no es
 * JSON: cada mensaje llega como un `event: <tipo>` más un `data: <json>`, y
 * lo que aquí se valida es el JSON de ese `data` contra el tipo que trajo el
 * `event`. Cualquier cosa que no encaje EXACTAMENTE se rechaza — igual que
 * `collab/presence-channel.ts` con sus latidos: un evento a medias no se
 * "aproxima", se descarta, porque un roster incompleto es peor que ninguno.
 */

export interface CallWireParticipant {
  id: string;
  userId: string;
  name: string;
  joinedAt: string;
}

export type CallWireSignalKind = 'offer' | 'answer' | 'ice-candidate' | 'bye';

export interface CallWireSignal {
  id: string;
  fromParticipantId: string;
  kind: CallWireSignalKind;
  payload: Record<string, unknown>;
  queuedAt: string;
}

export type CallWireEvent =
  | { type: 'roster'; participants: CallWireParticipant[] }
  | { type: 'signal'; signal: CallWireSignal }
  | { type: 'ping'; at: string };

const SIGNAL_KINDS: readonly CallWireSignalKind[] = [
  'offer',
  'answer',
  'ice-candidate',
  'bye',
];

function isParticipant(value: unknown): value is CallWireParticipant {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<CallWireParticipant>;
  return (
    typeof p.id === 'string' &&
    !!p.id &&
    typeof p.userId === 'string' &&
    !!p.userId &&
    typeof p.name === 'string' &&
    typeof p.joinedAt === 'string' &&
    !!p.joinedAt
  );
}

function isSignal(value: unknown): value is CallWireSignal {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<CallWireSignal>;
  return (
    typeof s.id === 'string' &&
    !!s.id &&
    typeof s.fromParticipantId === 'string' &&
    !!s.fromParticipantId &&
    typeof s.kind === 'string' &&
    SIGNAL_KINDS.includes(s.kind as CallWireSignalKind) &&
    !!s.payload &&
    typeof s.payload === 'object' &&
    typeof s.queuedAt === 'string' &&
    !!s.queuedAt
  );
}

/**
 * `eventType` es el `event:` de la línea SSE (el nombre con el que
 * `EventSource.addEventListener` se suscribió); `rawData` es el `data:` sin
 * parsear. Devuelve `null` ante CUALQUIER forma inesperada — JSON roto,
 * campo faltante, tipo que no casa con `eventType`.
 */
export function parseCallWireEvent(
  eventType: string,
  rawData: string,
): CallWireEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const body = parsed as Record<string, unknown>;

  if (eventType === 'roster') {
    const participants = body.participants;
    if (!Array.isArray(participants) || !participants.every(isParticipant)) {
      return null;
    }
    return { type: 'roster', participants };
  }
  if (eventType === 'signal') {
    if (!isSignal(body.signal)) return null;
    return { type: 'signal', signal: body.signal };
  }
  if (eventType === 'ping') {
    if (typeof body.at !== 'string' || !body.at) return null;
    return { type: 'ping', at: body.at };
  }
  return null;
}
