import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsCadCommentAnchor } from '../../cad/cad-comment-anchor';
import { MESSAGING_CHANNEL_KINDS } from '../entities/messaging-channel.entity';

/**
 * DTOs de la superficie /v1/messaging/* (contrato design-api.v1.yaml). La
 * pipe global valida con whitelist + forbidNonWhitelisted: un campo no
 * declarado es un 400 explícito. El ancla reutiliza EXACTAMENTE la misma
 * barrera de forma que los comentarios de revisión CAD
 * (`IsCadCommentAnchor` de `apps/api/src/modules/cad/cad-comment-anchor.ts`)
 * — no se reinventa.
 */

export class CreateChannelDto {
  @IsIn(MESSAGING_CHANNEL_KINDS)
  kind: 'project' | 'direct';

  /** Obligatorio con kind: 'project'. Ignorado en 'direct'. */
  @ValidateIf((dto: CreateChannelDto) => dto.kind === 'project')
  @IsUUID()
  projectId?: string;

  /** Obligatorio con kind: 'project'. Ignorado en 'direct'. */
  @ValidateIf((dto: CreateChannelDto) => dto.kind === 'project')
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  /** Obligatorio con kind: 'direct': el otro miembro de la conversación. */
  @ValidateIf((dto: CreateChannelDto) => dto.kind === 'direct')
  @IsUUID()
  memberUserId?: string;
}

export class ListChannelMessagesQueryDto {
  /** Cursor opaco devuelto por la página anterior; omitido = más recientes. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;

  /** Responde a otro mensaje del mismo canal; null/omitido = mensaje raíz. */
  @IsOptional()
  @IsUUID()
  parentMessageId?: string | null;

  /** Ancla en el dibujo (JSON libre, mismo contrato que CadComment.anchor). */
  @IsOptional()
  @IsObject()
  @IsCadCommentAnchor()
  anchor?: Record<string, unknown> | null;
}
