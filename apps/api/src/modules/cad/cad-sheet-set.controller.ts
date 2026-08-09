import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CadSheetSetsRepository } from './cad-sheet-sets.repository';
import type { CadSheetSet } from '../cad-documents/entities/cad-sheet-set.entity';
import {
  CreateCadSheetSetDto,
  ListSheetSetsQueryDto,
  SaveCadSheetSetDto,
} from './dto/cad.dto';

/**
 * Superficie HTTP de los conjuntos de planos (`/v1/cad/sheet-sets`, tag
 * `sheet-sets` del contrato design-api.v1).
 *
 * Un conjunto es el equivalente del `.dst` de AutoCAD: una lista ORDENADA de
 * referencias a presentaciones de varios dibujos, con su numeración y sus
 * campos comunes. Vive en su propia tabla porque agrupa hojas de varios
 * documentos y ninguno de ellos puede ser su dueño.
 *
 * Escritura con CAS optimista sobre `version`, igual que el documento
 * canónico: `PUT` manda `expectedVersion` y un desajuste es 409 con la versión
 * vigente. Nunca se sobrescribe.
 */
@Controller('v1/cad')
export class CadSheetSetController {
  constructor(private readonly sheetSets: CadSheetSetsRepository) {}

  @Get('sheet-sets')
  @RequirePermissions('cad:view')
  async list(@Query() query: ListSheetSetsQueryDto) {
    const { items, total } = await this.sheetSets.list(query);
    return { items: items.map(summaryResource), total };
  }

  @Post('sheet-sets')
  @RequirePermissions('cad:edit')
  async create(@Body() dto: CreateCadSheetSetDto) {
    return sheetSetResource(await this.sheetSets.create(dto));
  }

  @Get('sheet-sets/:sheetSetId')
  @RequirePermissions('cad:view')
  async get(@Param('sheetSetId', ParseUUIDPipe) sheetSetId: string) {
    return sheetSetResource(await this.sheetSets.get(sheetSetId));
  }

  @Put('sheet-sets/:sheetSetId')
  @RequirePermissions('cad:edit')
  async save(
    @Param('sheetSetId', ParseUUIDPipe) sheetSetId: string,
    @Body() dto: SaveCadSheetSetDto,
  ) {
    return sheetSetResource(await this.sheetSets.save(sheetSetId, dto));
  }

  @Delete('sheet-sets/:sheetSetId')
  @RequirePermissions('cad:admin')
  @HttpCode(204)
  async remove(@Param('sheetSetId', ParseUUIDPipe) sheetSetId: string) {
    await this.sheetSets.remove(sheetSetId);
  }
}

interface StoredContent {
  fields?: Record<string, string>;
  numbering?: Record<string, number | string>;
  sheets?: unknown[];
  subsets?: unknown[];
}

/** Cabecera del conjunto: lo que necesita una lista, sin traer las hojas. */
function summaryResource(row: CadSheetSet) {
  const content = (row.content ?? {}) as StoredContent;
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    sheetCount: content.sheets?.length ?? 0,
    version: row.version,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  };
}

function sheetSetResource(row: CadSheetSet) {
  const content = (row.content ?? {}) as StoredContent;
  return {
    ...summaryResource(row),
    fields: content.fields ?? {},
    numbering: content.numbering ?? {
      prefix: 'A-',
      start: 101,
      step: 1,
      padding: 0,
      suffix: '',
    },
    sheets: content.sheets ?? [],
    ...(content.subsets ? { subsets: content.subsets } : {}),
  };
}
