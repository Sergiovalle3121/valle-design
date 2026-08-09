import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TenantScopedRepository,
  getTenantRepositoryToken,
} from '../../common/tenant/tenant-scoped.repository';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { CadSheetSet } from '../cad-documents/entities/cad-sheet-set.entity';

/** Tope de hojas por conjunto. Un `.dst` real rara vez pasa de doscientas. */
export const MAX_SHEETS_PER_SET = 500;

export interface SheetSetContent {
  fields: Record<string, string>;
  numbering: {
    prefix: string;
    start: number;
    step: number;
    padding: number;
    suffix: string;
  };
  sheets: SheetSetRow[];
  subsets?: SheetSetSubsetRow[];
}

/**
 * Fila de hoja tal y como se persiste. Se declara con campos y no como
 * `Record<string, unknown>` para que el DTO validado encaje sin conversiones:
 * un `as` en el borde del controlador anularía justo la validación que la pipe
 * acaba de hacer.
 */
export interface SheetSetRow {
  id: string;
  order: number;
  documentId: string;
  layoutId: string;
  title: string;
  number: string;
  numberLocked?: boolean;
  revision: string;
  fields?: Record<string, string>;
  includeInPublish?: boolean;
}

export interface SheetSetSubsetRow {
  id: string;
  name: string;
  sheetIds: string[];
}

export interface CreateSheetSetInput {
  name: string;
  description?: string;
  projectId?: string;
  fields?: Record<string, string>;
  numbering?: SheetSetContent['numbering'];
}

export interface SaveSheetSetInput {
  expectedVersion: number;
  name?: string;
  description?: string | null;
  fields?: Record<string, string>;
  numbering?: SheetSetContent['numbering'];
  sheets: SheetSetRow[];
  subsets?: SheetSetSubsetRow[];
}

const DEFAULT_NUMBERING: SheetSetContent['numbering'] = {
  prefix: 'A-',
  start: 101,
  step: 1,
  padding: 0,
  suffix: '',
};

/**
 * Ciclo de vida de los conjuntos de planos (`cad_sheet_sets`).
 *
 * Todas las lecturas y escrituras van por el repositorio TENANT-SCOPED: el
 * tenant sale del contexto autenticado, nunca del cliente.
 *
 * ## El CAS no es opcional
 *
 * `save` compara `expectedVersion` con la versión almacenada y responde 409 con
 * la vigente cuando no coinciden. Es la misma disciplina que el documento
 * canónico y por la misma razón: reordenar un conjunto reescribe el número de
 * casi todas sus hojas, así que dos guardados concurrentes sin CAS no pierden
 * un campo — pierden la numeración entera de una de las dos personas.
 */
@Injectable()
export class CadSheetSetsRepository {
  constructor(
    @Inject(getTenantRepositoryToken(CadSheetSet))
    private readonly sheetSets: TenantScopedRepository<CadSheetSet>,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async list(query: {
    projectId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: CadSheetSet[]; total: number }> {
    const [items, total] = await this.sheetSets.findAndCount({
      ...(query.projectId ? { where: { projectId: query.projectId } } : {}),
      order: { created_at: 'DESC' },
      take: Math.min(200, Math.max(1, query.limit ?? 50)),
      skip: Math.max(0, query.offset ?? 0),
    });
    return { items, total };
  }

  async get(sheetSetId: string): Promise<CadSheetSet> {
    const row = await this.sheetSets.findOne({ where: { id: sheetSetId } });
    if (!row) throw new NotFoundException('Sheet set not found');
    return row;
  }

  async create(input: CreateSheetSetInput): Promise<CadSheetSet> {
    const content: SheetSetContent = {
      fields: input.fields ?? {},
      numbering: input.numbering ?? DEFAULT_NUMBERING,
      sheets: [],
    };
    const entity = this.sheetSets.create({
      name: input.name,
      description: input.description ?? null,
      projectId: input.projectId ?? null,
      content: content as unknown as Record<string, unknown>,
      version: 1,
      tenant_id: this.tenantCtx.getTenantId() ?? null,
    });
    return this.sheetSets.save(entity);
  }

  /**
   * Guarda el conjunto entero con CAS.
   *
   * Se relee la fila DENTRO de la misma operación y se compara la versión antes
   * de escribir. Sin la relectura, `expectedVersion` compararía contra lo que
   * el cliente creía y no contra lo que hay, que es no comprobar nada.
   */
  async save(
    sheetSetId: string,
    input: SaveSheetSetInput,
  ): Promise<CadSheetSet> {
    const row = await this.get(sheetSetId);
    if (row.version !== input.expectedVersion)
      throw new ConflictException({
        error: 'version_conflict',
        message:
          'El conjunto de planos cambió desde la última lectura; vuelve a cargarlo antes de guardar.',
        currentVersion: row.version,
        expectedVersion: input.expectedVersion,
      });
    if (input.sheets.length > MAX_SHEETS_PER_SET)
      throw new ConflictException({
        error: 'too_many_sheets',
        message: `Un conjunto admite como máximo ${MAX_SHEETS_PER_SET} hojas.`,
      });

    const previous = row.content as unknown as SheetSetContent;
    const content: SheetSetContent = {
      fields: input.fields ?? previous.fields ?? {},
      numbering: input.numbering ?? previous.numbering ?? DEFAULT_NUMBERING,
      sheets: input.sheets,
      ...(input.subsets ? { subsets: input.subsets } : {}),
    };

    row.content = content as unknown as Record<string, unknown>;
    row.version = row.version + 1;
    if (input.name !== undefined) row.name = input.name;
    if (input.description !== undefined) row.description = input.description;
    return this.sheetSets.save(row);
  }

  /**
   * Borra el conjunto. SOLO el conjunto: los dibujos y sus presentaciones no se
   * tocan, porque un conjunto es una lista ordenada de referencias y no el
   * contenido al que apunta.
   */
  async remove(sheetSetId: string): Promise<void> {
    const row = await this.get(sheetSetId);
    await this.sheetSets.remove(row);
  }
}
