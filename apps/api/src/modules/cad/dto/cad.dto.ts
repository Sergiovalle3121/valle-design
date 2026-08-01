import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * DTOs de la superficie /v1/cad/* (contrato design-api.v1.yaml). La pipe
 * global valida con whitelist + forbidNonWhitelisted: un campo no declarado
 * es un 400 explícito. Los objetos libres del dominio (documento canónico,
 * definición de bloque, ancla) se declaran @IsObject y los valida el dominio
 * (cad-document-validation / CadBlocksService), no la pipe.
 */

/* ─────────────────────────────── Paginación ────────────────────────────── */

export class PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/* ─────────────────────────────── Proyectos ─────────────────────────────── */

export class ListProjectsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';
}

export class CreateCadProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateCadProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';
}

/* ─────────────────────────────── Documentos ────────────────────────────── */

export class ListDocumentsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class CreateCadDocumentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  /** Alias LEGADO opaco (p. ej. AXOS-CAD-STUDIO). Se persiste tal cual. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  revision?: string;
}

export class UpdateCadDocumentMetaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  /** null = sacar el documento de su proyecto. */
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  layers?: Record<string, unknown>[] | null;
}

export class SaveCadContentDto {
  /** Documento canónico inline; lo valida el dominio (límites reales). */
  @IsObject()
  cadDocument: Record<string, unknown>;

  /**
   * Token CAS. Se declara opcional A PROPÓSITO: omitirlo debe responder el
   * 400 contractual `cad_document_version_required` del dominio, no un 400
   * genérico de la pipe.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedCadDocumentVersion?: number;
}

/* ────────────────────────────── Publicaciones ──────────────────────────── */

export class RecordCadPublicationDto {
  @IsInt()
  @Min(0)
  expectedCadDocumentVersion: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(128, { each: true })
  paperSpaceIds: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName: string;

  @Matches(/^[A-Fa-f0-9]{64}$/)
  sha256: string;

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  bytes: number;
}

/* ─────────────────────────────── Plano DXF ─────────────────────────────── */

export class DxfPlacementDto {
  @IsOptional()
  @IsNumber()
  offsetX?: number;

  @IsOptional()
  @IsNumber()
  offsetY?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  scale?: number;

  @IsOptional()
  @IsNumber()
  rotation?: number;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  opacity?: number;
}

export class UploadDxfDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  /** Contenido DXF crudo (texto). Límite real del contrato: 12 000 000. */
  @IsString()
  @MinLength(1)
  @MaxLength(12_000_000)
  data: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DxfPlacementDto)
  placement?: DxfPlacementDto;
}

/* ──────────────────────────────── Bloques ──────────────────────────────── */

export class CadBlockAssetDto {
  @IsString()
  @MaxLength(64)
  id: string;

  @IsString()
  @MaxLength(24)
  kind: string;

  @IsNumber()
  x: number;

  @IsNumber()
  y: number;

  @IsNumber()
  @IsPositive()
  w: number;

  @IsNumber()
  @IsPositive()
  h: number;

  @IsOptional()
  @IsNumber()
  rotation?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  layer?: string;
}

export class CreateCadBlockDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CadBlockAssetDto)
  assets?: CadBlockAssetDto[];

  /** Definición canónica; sus límites los valida CadBlocksService. */
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;
}

export class UpdateCadBlockDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;
}

export class ListBlocksQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

/* ────────────────────────────── Intent/Vision ──────────────────────────── */

export class CadIntentFootprintDto {
  @IsString()
  @MaxLength(16)
  unit: string;

  @IsNumber()
  @IsPositive()
  footprintW: number;

  @IsNumber()
  @IsPositive()
  footprintH: number;
}

export class CadIntentStationDto {
  @IsString()
  @MaxLength(64)
  id: string;

  @IsString()
  @MaxLength(120)
  station: string;

  @IsOptional()
  @IsNumber()
  x?: number | null;

  @IsOptional()
  @IsNumber()
  y?: number | null;

  @IsOptional()
  @IsNumber()
  w?: number | null;

  @IsOptional()
  @IsNumber()
  h?: number | null;
}

export class CadIntentConnectorDto {
  @IsString()
  @MaxLength(64)
  from: string;

  @IsString()
  @MaxLength(64)
  to: string;
}

export class CadIntentContextDto {
  @ValidateNested()
  @Type(() => CadIntentFootprintDto)
  footprint: CadIntentFootprintDto;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CadIntentStationDto)
  stations: CadIntentStationDto[];

  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CadIntentConnectorDto)
  connectors: CadIntentConnectorDto[];
}

export class CadIntentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt: string;

  /**
   * Contexto del plano para el prompt del modelo. Opcional: sin él, el
   * mediador arma un contexto vacío con la unidad del documento.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => CadIntentContextDto)
  context?: CadIntentContextDto;
}

export class CadVisionDto {
  /** Imagen del plano como data URL embebido (data:image/...;base64,...). */
  @IsString()
  @MinLength(1)
  @MaxLength(15_000_000)
  image: string;
}
