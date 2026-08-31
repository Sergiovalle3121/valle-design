import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CALL_SIGNAL_KINDS, type CallSignalKind } from './calls.types';

/** Crear o unirse a la sala del documento. Idempotente por (tenant, documentId). */
export class JoinCallRoomDto {
  @IsUUID()
  documentId!: string;

  /** El nombre para mostrar en las miniaturas; si falta, se usa el correo. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}

export class LeaveCallRoomDto {
  @IsUUID()
  participantId!: string;
}

/**
 * Un mensaje de señalización dirigido a OTRO participante de la misma sala.
 * `payload` es opaco a propósito: lo que lleva dentro (SDP, candidato ICE) lo
 * define el navegador, no este contrato — el servidor sólo lo enruta.
 */
export class PostCallSignalDto {
  @IsUUID()
  fromParticipantId!: string;

  @IsUUID()
  toParticipantId!: string;

  @IsIn(CALL_SIGNAL_KINDS)
  kind!: CallSignalKind;

  @IsObject()
  payload!: Record<string, unknown>;
}
