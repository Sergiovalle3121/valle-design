/**
 * LA MÁQUINA DE ESTADOS DE LA LLAMADA — aritmética pura, sin navegador.
 *
 * `inactiva → llamando → conectando → en-curso → colgada`. Los medios
 * (cámara, micrófono, pantalla) y el transporte (WebRTC, SSE) viven en otros
 * archivos de este directorio y en `components/cad/calls/`; aquí sólo hay un
 * reductor: `(estado, evento) → estado nuevo`, determinista y sin efectos.
 *
 * ## Por qué la fase se DERIVA en vez de guardarse
 *
 * Con varios pares (malla completa, hasta cuatro), "la llamada está
 * conectada" no es un booleano que alguien active: es la lectura de cuántos
 * enlaces hay y en qué estado está cada uno. Guardar la fase aparte del mapa
 * de enlaces abre la puerta a que se desincronicen (un enlace se cae y nadie
 * actualiza la fase). Derivarla en cada transición cierra esa puerta: sólo
 * hay una fuente de verdad.
 *
 * ## Qué significa cada fase con VARIOS participantes
 *
 * - `llamando`: en la sala, solo — nadie más se ha unido todavía.
 * - `conectando`: hay al menos otro participante, pero NINGÚN enlace llegó a
 *   `connected` todavía.
 * - `en-curso`: al menos UN enlace está `connected`. Si otro participante
 *   tiene mala conexión, esa llamada sigue "en curso" para los que sí se
 *   oyen — un enlace roto no apaga la sala entera.
 */

export type CallHangupReason =
  | 'local'
  | 'room-full'
  | 'access-denied'
  | 'signaling-lost'
  | 'ice-failed-no-turn'
  | 'ice-failed';

export interface CallRosterEntry {
  participantId: string;
  userId: string;
  name: string;
}

export interface CallIceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export type PeerLinkStatus =
  | 'negotiating'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export interface PeerLink {
  participantId: string;
  status: PeerLinkStatus;
}

export type CallPhase = 'llamando' | 'conectando' | 'en-curso';

export interface ActiveCallState {
  phase: CallPhase;
  roomId: string;
  participantId: string;
  self: CallRosterEntry;
  roster: CallRosterEntry[];
  peers: Record<string, PeerLink>;
  iceServers: CallIceServerConfig[];
  turnConfigured: boolean;
}

export type CallState =
  | { phase: 'inactiva' }
  | ActiveCallState
  | { phase: 'colgada'; reason: CallHangupReason };

export const INACTIVE_CALL_STATE: CallState = { phase: 'inactiva' };

export type CallEvent =
  | {
      type: 'joined';
      roomId: string;
      participantId: string;
      self: CallRosterEntry;
      roster: CallRosterEntry[];
      iceServers: CallIceServerConfig[];
      turnConfigured: boolean;
    }
  | { type: 'roster-updated'; roster: CallRosterEntry[] }
  | { type: 'peer-negotiating'; participantId: string }
  | { type: 'peer-connected'; participantId: string }
  | { type: 'peer-reconnecting'; participantId: string }
  | { type: 'peer-failed'; participantId: string }
  | { type: 'hangup'; reason: CallHangupReason }
  | { type: 'reset' };

function isActive(state: CallState): state is ActiveCallState {
  return (
    state.phase === 'llamando' ||
    state.phase === 'conectando' ||
    state.phase === 'en-curso'
  );
}

function derivePhase(peers: Record<string, PeerLink>): CallPhase {
  const links = Object.values(peers);
  if (links.length === 0) return 'llamando';
  return links.some((link) => link.status === 'connected')
    ? 'en-curso'
    : 'conectando';
}

/** Reconcilia el mapa de enlaces contra un roster nuevo: agrega a quien
 * llega, quita a quien se fue, conserva el estado de quien sigue. */
function syncPeers(
  previous: Record<string, PeerLink>,
  roster: CallRosterEntry[],
  selfParticipantId: string,
): Record<string, PeerLink> {
  const next: Record<string, PeerLink> = {};
  for (const entry of roster) {
    if (entry.participantId === selfParticipantId) continue;
    next[entry.participantId] = previous[entry.participantId] ?? {
      participantId: entry.participantId,
      status: 'negotiating',
    };
  }
  return next;
}

function withPeerStatus(
  state: ActiveCallState,
  participantId: string,
  status: PeerLinkStatus,
): CallState {
  if (!(participantId in state.peers)) return state; // ya no está en la sala
  const peers = {
    ...state.peers,
    [participantId]: { participantId, status },
  };
  return { ...state, peers, phase: derivePhase(peers) };
}

export function reduceCallState(state: CallState, event: CallEvent): CallState {
  switch (event.type) {
    case 'joined': {
      if (state.phase !== 'inactiva') return state;
      const peers = syncPeers({}, event.roster, event.participantId);
      return {
        phase: derivePhase(peers),
        roomId: event.roomId,
        participantId: event.participantId,
        self: event.self,
        roster: event.roster,
        peers,
        iceServers: event.iceServers,
        turnConfigured: event.turnConfigured,
      };
    }
    case 'roster-updated': {
      if (!isActive(state)) return state;
      const peers = syncPeers(state.peers, event.roster, state.participantId);
      return {
        ...state,
        roster: event.roster,
        peers,
        phase: derivePhase(peers),
      };
    }
    case 'peer-negotiating':
      return isActive(state)
        ? withPeerStatus(state, event.participantId, 'negotiating')
        : state;
    case 'peer-connected':
      return isActive(state)
        ? withPeerStatus(state, event.participantId, 'connected')
        : state;
    case 'peer-reconnecting':
      return isActive(state)
        ? withPeerStatus(state, event.participantId, 'reconnecting')
        : state;
    case 'peer-failed':
      return isActive(state)
        ? withPeerStatus(state, event.participantId, 'failed')
        : state;
    case 'hangup':
      return state.phase === 'colgada'
        ? state
        : { phase: 'colgada', reason: event.reason };
    case 'reset':
      return state.phase === 'colgada' ? INACTIVE_CALL_STATE : state;
    default:
      return state;
  }
}
