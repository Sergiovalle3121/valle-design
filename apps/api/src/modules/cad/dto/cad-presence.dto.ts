import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * DTOs de `/v1/cad/documents/:documentId/presence` (contrato
 * design-api.v1.yaml, tag `presence`). Espejo parcial deliberado de
 * `CadPresenceBeat` (apps/web/src/lib/cad/collab/presence.ts): mismas
 * coordenadas, mismo fallo-cerrado ante valores no finitos — `IsNumber()` de
 * class-validator ya rechaza `NaN`/`Infinity` por defecto.
 *
 * Lo que NO viaja en el cuerpo: `documentId` sale de la ruta, y `name` y
 * `guest` los decide el SERVIDOR (`CadPresenceService`, del email de la
 * sesión y del hecho de que sólo una sesión first-party llega hasta aquí) —
 * un cliente no puede anunciarse con el nombre de otro ni colarse como
 * invitado con una sesión real. `peerId` sí es del cliente: identidad de
 * PESTAÑA, sin privilegio.
 */
export class CadPresenceCursorDto {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;
}

export class CadPresenceViewportDto {
  @IsNumber()
  minX: number;

  @IsNumber()
  minY: number;

  @IsNumber()
  maxX: number;

  @IsNumber()
  maxY: number;
}

export class PublishCadPresenceBeatDto {
  /** Identidad de la PESTAÑA emisora — la genera el cliente, sin significado de privilegio. */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  peerId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CadPresenceCursorDto)
  cursor?: CadPresenceCursorDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CadPresenceViewportDto)
  viewport?: CadPresenceViewportDto | null;
}
