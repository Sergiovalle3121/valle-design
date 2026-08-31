/**
 * Tipos compartidos de la señalización de llamadas. Sin dependencias de
 * NestJS: el store que los usa (`call-room-store.ts`) se prueba sin
 * levantar la aplicación.
 */

/** Los cuatro tipos de mensaje que viajan entre dos pares en negociación. */
export const CALL_SIGNAL_KINDS = [
  'offer',
  'answer',
  'ice-candidate',
  'bye',
] as const;
export type CallSignalKind = (typeof CALL_SIGNAL_KINDS)[number];

export interface CallParticipant {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly joinedAt: number;
  /** Última vez que este participante mandó una señal o tuvo el SSE abierto. */
  lastSeenAt: number;
  /** true mientras su GET .../events sigue conectado. */
  connected: boolean;
}

/** Forma pública de un participante: sin el estado interno de entrega. */
export type CallParticipantView = Pick<
  CallParticipant,
  'id' | 'userId' | 'name' | 'joinedAt'
>;

export interface CallRoom {
  readonly id: string;
  readonly documentId: string;
  readonly tenantId: string;
  readonly createdAt: number;
}

export interface QueuedCallSignal {
  readonly id: string;
  readonly fromParticipantId: string;
  readonly kind: CallSignalKind;
  readonly payload: Record<string, unknown>;
  readonly queuedAt: number;
}

/** Lo que via SSE hacia UN participante: la señal dirigida a él o el roster. */
export type CallServerEvent =
  | { type: 'signal'; signal: QueuedCallSignal }
  | { type: 'roster'; participants: CallParticipantView[] }
  | { type: 'ping'; at: number };

export function toParticipantView(p: CallParticipant): CallParticipantView {
  return { id: p.id, userId: p.userId, name: p.name, joinedAt: p.joinedAt };
}
