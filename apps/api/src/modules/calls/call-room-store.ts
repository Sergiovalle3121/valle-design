import { randomUUID } from 'node:crypto';
import {
  type CallParticipant,
  type CallParticipantView,
  type CallRoom,
  type CallServerEvent,
  type CallSignalKind,
  type QueuedCallSignal,
  toParticipantView,
} from './calls.types';

/**
 * Malla completa: cada participante sostiene una `RTCPeerConnection` por
 * cada otro participante. A partir de 5 eso son 10 conexiones repartidas
 * entre 5 pares, cada uno sosteniendo 4 — más de lo que un navegador
 * mantiene sin degradar audio/video en hardware común. En 4, cada quien
 * sostiene 3. Una topología SFU (un servidor de media que reenvía en vez de
 * que cada par se conecte a todos) escalaría más alto, pero eso es
 * infraestructura de servidor de medios que este repositorio no tiene —
 * declarar el tope es preferible a fingir que la malla escala sola.
 */
export const MAX_PARTICIPANTS_PER_ROOM = 4;

/** Desconectado (SSE cerrado) sin reconectar en este margen: se da por
 * perdido — pestaña cerrada, red caída, o colgó sin avisar. */
const PARTICIPANT_OFFLINE_TTL_MS = 45_000;
/** Señal sin recoger en este margen: la negociación que la esperaba ya
 * está muerta, purgarla no pierde nada que siguiera vivo. */
const SIGNAL_TTL_MS = 30_000;
/** Tope del buzón por participante: defensa contra un remitente que manda
 * señales sin que el otro extremo se conecte jamás. */
const MAILBOX_CAP = 64;

export class CallRoomNotFoundError extends Error {
  constructor(roomId: string) {
    super(`La sala ${roomId} no existe o ya terminó.`);
    this.name = 'CallRoomNotFoundError';
  }
}

export class CallParticipantNotFoundError extends Error {
  constructor(participantId: string) {
    super(`El participante ${participantId} no está en esta sala.`);
    this.name = 'CallParticipantNotFoundError';
  }
}

export class CallRoomFullError extends Error {
  constructor(roomId: string) {
    super(
      `La sala ${roomId} ya tiene ${MAX_PARTICIPANTS_PER_ROOM} participantes, el tope de la malla completa.`,
    );
    this.name = 'CallRoomFullError';
  }
}

interface ParticipantState extends CallParticipant {
  mailbox: QueuedCallSignal[];
  listener: ((event: CallServerEvent) => void) | null;
}

interface RoomState extends CallRoom {
  participants: Map<string, ParticipantState>;
}

export interface JoinResult {
  room: CallRoom;
  participant: CallParticipantView;
  participants: CallParticipantView[];
}

/**
 * El estado en memoria de TODAS las salas de llamada del proceso.
 *
 * Sin NestJS, sin red, con el reloj inyectado: se prueba con `now` fijo y
 * sin esperar temporizadores reales. Las señales ICE/SDP NUNCA tocan disco
 * — viven en el array `mailbox` de cada participante y se purgan por TTL.
 * Un reinicio del proceso las pierde, y esa es la garantía correcta para
 * datos que sólo importan durante los segundos que dura una negociación.
 *
 * Un proceso único es la limitación explícita que viene con "en memoria":
 * dos réplicas de la API no comparten salas. Para el volumen de esta
 * función —salas de hasta cuatro personas, señalización de decenas de
 * mensajes por llamada— es la elección correcta; escalar a multi-proceso
 * pediría un adaptador de transporte compartido (Redis pub/sub u otro), que
 * este repositorio no necesita todavía.
 */
export class CallRoomStore {
  private readonly rooms = new Map<string, RoomState>();
  private readonly roomIdByDocument = new Map<string, string>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private documentKey(tenantId: string, documentId: string): string {
    return `${tenantId}:${documentId}`;
  }

  private requireRoom(roomId: string, tenantId: string): RoomState {
    const room = this.rooms.get(roomId);
    if (!room || room.tenantId !== tenantId) {
      throw new CallRoomNotFoundError(roomId);
    }
    return room;
  }

  private requireParticipant(
    room: RoomState,
    participantId: string,
  ): ParticipantState {
    const participant = room.participants.get(participantId);
    if (!participant) throw new CallParticipantNotFoundError(participantId);
    return participant;
  }

  private rosterOf(room: RoomState): CallParticipantView[] {
    return [...room.participants.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map(toParticipantView);
  }

  private broadcastRoster(room: RoomState): void {
    const participants = this.rosterOf(room);
    for (const participant of room.participants.values()) {
      participant.listener?.({ type: 'roster', participants });
    }
  }

  /** Crea o reutiliza la sala del documento y añade un participante nuevo. */
  join(
    tenantId: string,
    documentId: string,
    actor: { userId: string; name: string },
  ): JoinResult {
    const key = this.documentKey(tenantId, documentId);
    const existingRoomId = this.roomIdByDocument.get(key);
    let room = existingRoomId ? this.rooms.get(existingRoomId) : undefined;
    if (!room) {
      const roomId = randomUUID();
      room = {
        id: roomId,
        documentId,
        tenantId,
        createdAt: this.now(),
        participants: new Map(),
      };
      this.rooms.set(roomId, room);
      this.roomIdByDocument.set(key, roomId);
    }
    if (room.participants.size >= MAX_PARTICIPANTS_PER_ROOM) {
      throw new CallRoomFullError(room.id);
    }
    const participant: ParticipantState = {
      id: randomUUID(),
      userId: actor.userId,
      name: actor.name,
      joinedAt: this.now(),
      lastSeenAt: this.now(),
      connected: false,
      mailbox: [],
      listener: null,
    };
    room.participants.set(participant.id, participant);
    this.broadcastRoster(room);
    return {
      room: {
        id: room.id,
        documentId: room.documentId,
        tenantId: room.tenantId,
        createdAt: room.createdAt,
      },
      participant: toParticipantView(participant),
      participants: this.rosterOf(room),
    };
  }

  leave(tenantId: string, roomId: string, participantId: string): void {
    const room = this.requireRoom(roomId, tenantId);
    this.requireParticipant(room, participantId);
    room.participants.delete(participantId);
    if (room.participants.size === 0) {
      this.rooms.delete(roomId);
      this.roomIdByDocument.delete(this.documentKey(tenantId, room.documentId));
      return;
    }
    this.broadcastRoster(room);
  }

  postSignal(
    tenantId: string,
    roomId: string,
    fromParticipantId: string,
    toParticipantId: string,
    kind: CallSignalKind,
    payload: Record<string, unknown>,
  ): void {
    const room = this.requireRoom(roomId, tenantId);
    const sender = this.requireParticipant(room, fromParticipantId);
    const recipient = this.requireParticipant(room, toParticipantId);
    sender.lastSeenAt = this.now();
    const signal: QueuedCallSignal = {
      id: randomUUID(),
      fromParticipantId,
      kind,
      payload,
      queuedAt: this.now(),
    };
    if (recipient.listener) {
      recipient.listener({ type: 'signal', signal });
      return;
    }
    recipient.mailbox.push(signal);
    if (recipient.mailbox.length > MAILBOX_CAP) recipient.mailbox.shift();
  }

  /**
   * Abre la entrega para un participante: vuelca su buzón (señales que
   * llegaron mientras no tenía el SSE abierto), manda el roster actual, y
   * deja el `listener` puesto para lo que llegue en vivo. Devuelve la
   * función de cierre — el controller la invoca en el teardown del
   * Observable, cuando el navegador cierra la conexión.
   */
  connect(
    tenantId: string,
    roomId: string,
    participantId: string,
    listener: (event: CallServerEvent) => void,
  ): () => void {
    const room = this.requireRoom(roomId, tenantId);
    const participant = this.requireParticipant(room, participantId);
    participant.connected = true;
    participant.lastSeenAt = this.now();
    participant.listener = listener;
    listener({ type: 'roster', participants: this.rosterOf(room) });
    for (const signal of participant.mailbox) {
      listener({ type: 'signal', signal });
    }
    participant.mailbox = [];
    return () => {
      const stillRoom = this.rooms.get(roomId);
      const stillParticipant = stillRoom?.participants.get(participantId);
      if (!stillParticipant || stillParticipant.listener !== listener) return;
      stillParticipant.connected = false;
      stillParticipant.lastSeenAt = this.now();
      stillParticipant.listener = null;
    };
  }

  /** Barrido periódico: participantes offline vencidos, señales muertas, salas vacías. */
  sweep(): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      let changed = false;
      for (const participant of [...room.participants.values()]) {
        if (
          !participant.connected &&
          now - participant.lastSeenAt > PARTICIPANT_OFFLINE_TTL_MS
        ) {
          room.participants.delete(participant.id);
          changed = true;
          continue;
        }
        const fresh = participant.mailbox.filter(
          (signal) => now - signal.queuedAt <= SIGNAL_TTL_MS,
        );
        if (fresh.length !== participant.mailbox.length) {
          participant.mailbox = fresh;
        }
      }
      if (room.participants.size === 0) {
        this.rooms.delete(room.id);
        this.roomIdByDocument.delete(
          this.documentKey(room.tenantId, room.documentId),
        );
      } else if (changed) {
        this.broadcastRoster(room);
      }
    }
  }

  /** Sólo para diagnóstico/pruebas: cuántas salas hay vivas ahora mismo. */
  roomCount(): number {
    return this.rooms.size;
  }
}
