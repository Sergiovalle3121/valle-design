import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CadDocumentsRepository } from '../cad/cad-documents.repository';
import { CallRoomStore, MAX_PARTICIPANTS_PER_ROOM } from './call-room-store';
import {
  resolveCallIceConfig,
  type CallIceServerConfig,
} from './call-ice-config';
import { toWireParticipant, type WireParticipant } from './calls-wire';
import type { CallServerEvent, CallSignalKind } from './calls.types';

/** Cada cuánto se purgan participantes offline vencidos y señales muertas. */
const SWEEP_INTERVAL_MS = 15_000;

export interface JoinCallRoomResult {
  roomId: string;
  documentId: string;
  participantId: string;
  participants: WireParticipant[];
  iceServers: CallIceServerConfig[];
  turnConfigured: boolean;
  maxParticipants: number;
}

/**
 * La fachada NestJS del store puro: ciclo de vida (barrido periódico) y la
 * única verificación que SÍ necesita base de datos — que `documentId`
 * exista y pertenezca al tenant del actor. `CadDocumentsRepository.
 * getDocument` corre bajo RLS (el `TenantContextService` ya dejó el tenant
 * del actor en ALS antes de llegar aquí, ver `TenantInterceptor`), así que
 * un documentId de otro tenant nunca abre una sala: la consulta no encuentra
 * la fila y `getDocument` lanza 404 antes de que exista ninguna sala.
 */
@Injectable()
export class CallsService implements OnModuleInit, OnModuleDestroy {
  private readonly store = new CallRoomStore();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private readonly documents: CadDocumentsRepository) {}

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => this.store.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  async join(
    tenantId: string,
    documentId: string,
    actor: { userId: string; email: string; displayName?: string },
  ): Promise<JoinCallRoomResult> {
    await this.documents.getDocument(documentId);
    const result = this.store.join(tenantId, documentId, {
      userId: actor.userId,
      name: actor.displayName?.trim() || actor.email,
    });
    const ice = resolveCallIceConfig();
    return {
      roomId: result.room.id,
      documentId: result.room.documentId,
      participantId: result.participant.id,
      participants: result.participants.map(toWireParticipant),
      iceServers: ice.iceServers,
      turnConfigured: ice.turnConfigured,
      maxParticipants: MAX_PARTICIPANTS_PER_ROOM,
    };
  }

  leave(tenantId: string, roomId: string, participantId: string): void {
    this.store.leave(tenantId, roomId, participantId);
  }

  signal(
    tenantId: string,
    roomId: string,
    fromParticipantId: string,
    toParticipantId: string,
    kind: CallSignalKind,
    payload: Record<string, unknown>,
  ): void {
    this.store.postSignal(
      tenantId,
      roomId,
      fromParticipantId,
      toParticipantId,
      kind,
      payload,
    );
  }

  connect(
    tenantId: string,
    roomId: string,
    participantId: string,
    listener: (event: CallServerEvent) => void,
  ): () => void {
    return this.store.connect(tenantId, roomId, participantId, listener);
  }
}
