import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Like, Repository } from 'typeorm';
import { SfCadBlock } from './entities/sf-cad-block.entity';
import { LayoutAsset } from './cad-drawing-shapes';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import {
  SYSTEM_CAD_BLOCK_LIKE,
  isSystemCadBlockKey,
} from './system-cad-blocks';

/**
 * Entrada estructural de un asset al crear un bloque. El DTO validado de
 * line-engineering (LayoutAssetDto) la satisface; se declara aquí para que
 * cad-documents no dependa de los DTOs industriales (dirección prohibida).
 */
export interface CadBlockAssetInput {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  label?: string;
  layer?: string;
}

const MAX_BLOCKS_PER_TENANT = 200;
/**
 * Techo del carril de sistema. Es un número del PRODUCTO, no del cliente, así
 * que no consume la cuota del inquilino: los bloques de fábrica se ven además
 * de los suyos, no en lugar de ellos.
 */
const MAX_SYSTEM_BLOCKS = 200;
const MAX_ASSETS_PER_BLOCK = 200;
const MAX_CANONICAL_ENTITIES_PER_BLOCK = 500;
const MAX_CANONICAL_DEFINITION_BYTES = 1_000_000;

/**
 * Biblioteca de bloques CAD reutilizables (ADR §224). CRUD mínimo y tenant-
 * scoped; la normalización de coordenadas (posiciones relativas al origen del
 * bloque) es responsabilidad del editor al guardar — aquí solo se sanea con el
 * mismo criterio de campos que los assets del layout. El binding de tenant
 * para persistencia viene de TenantContextService, poblado exclusivamente con
 * la sesión y membresía first-party verificadas por el servidor.
 */
@Injectable()
export class CadBlocksService {
  constructor(
    @InjectRepository(SfCadBlock)
    private readonly blocks: Repository<SfCadBlock>,
    private readonly tenantCtx: TenantContextService,
  ) {}

  private tenantWhere(): FindOptionsWhere<SfCadBlock> {
    const tenant = this.tenantCtx.getTenantId();
    return tenant ? { tenant_id: tenant } : { tenant_id: IsNull() };
  }

  /**
   * El carril de sistema: los bloques arquitectónicos que siembra la migración
   * `ArchitecturalBlockLibrarySeed`. Van con `tenant_id IS NULL` y llave
   * `valle:arq:…`; las dos condiciones a la vez, porque `tenant_id IS NULL` por
   * sí solo también describe a los bloques de una sesión sin inquilino.
   */
  private systemLaneWhere(): FindOptionsWhere<SfCadBlock> {
    return {
      tenant_id: IsNull(),
      legacySourceId: Like(SYSTEM_CAD_BLOCK_LIKE),
    };
  }

  /**
   * Fila que se va a MODIFICAR o BORRAR.
   *
   * Busca en el carril del inquilino Y en el de sistema, y sólo entonces
   * decide. Buscar únicamente en el del inquilino habría dado 404 sobre un
   * bloque que el mismo servicio acaba de listar y que el editor muestra en su
   * panel: «no existe» sobre algo que se ve en pantalla manda a quien llama a
   * crearlo otra vez. Existe; lo que no se puede es tocarlo, y eso es un 400
   * con su motivo. Lo ajeno —el bloque de OTRO inquilino— sigue siendo 404,
   * que es lo único que puede responderse sin confirmar que existe.
   */
  private async findForMutation(id: string): Promise<SfCadBlock> {
    const row = await this.blocks.findOne({
      where: [
        { id, ...this.tenantWhere() },
        { id, ...this.systemLaneWhere() },
      ],
    });
    if (!row) throw new NotFoundException('Bloque no encontrado.');
    if (isSystemCadBlockKey(row.legacySourceId))
      throw new BadRequestException(
        'Los bloques de la biblioteca base son de sólo lectura: duplícalo con otro nombre para modificarlo.',
      );
    return row;
  }

  private safeDefinition(value: Record<string, unknown> | undefined) {
    if (!value) return null;
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_CANONICAL_DEFINITION_BYTES)
      throw new BadRequestException('La definición canónica supera 1 MB.');
    const copy = JSON.parse(serialized) as Record<string, unknown>;
    if (typeof copy.id !== 'string' || typeof copy.name !== 'string')
      throw new BadRequestException('La definición necesita id y name.');
    if (!Array.isArray(copy.entities) || copy.entities.length < 1)
      throw new BadRequestException(
        'La definición necesita al menos una entidad.',
      );
    if (copy.entities.length > MAX_CANONICAL_ENTITIES_PER_BLOCK)
      throw new BadRequestException(
        `Máximo ${MAX_CANONICAL_ENTITIES_PER_BLOCK} entidades por bloque.`,
      );
    if (!copy.basePoint || typeof copy.basePoint !== 'object')
      throw new BadRequestException('La definición necesita basePoint.');
    return copy;
  }

  async list(query = ''): Promise<
    {
      id: string;
      name: string;
      assets: LayoutAsset[];
      definition: Record<string, unknown> | null;
      version: number;
      createdAt: Date;
    }[]
  > {
    const own = await this.blocks.find({
      where: this.tenantWhere(),
      order: { name: 'ASC' },
      take: MAX_BLOCKS_PER_TENANT,
    });
    // Sin inquilino, `tenantWhere()` YA es el carril de sistema: volver a
    // pedirlo devolvería cada bloque de fábrica dos veces.
    const system = this.tenantCtx.getTenantId()
      ? await this.blocks.find({
          where: this.systemLaneWhere(),
          order: { name: 'ASC' },
          take: MAX_SYSTEM_BLOCKS,
        })
      : [];
    const rows = [...system, ...own].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return rows
      .map((b) => ({
        id: b.id,
        name: b.name,
        assets: b.assets ?? [],
        definition: b.definition ?? null,
        version: b.version ?? 1,
        createdAt: b.created_at,
      }))
      .filter((row) => {
        if (!terms.length) return true;
        const definition = row.definition ?? {};
        const haystack = [
          row.name,
          definition.description,
          ...(Array.isArray(definition.keywords)
            ? definition.keywords.filter(
                (value): value is string => typeof value === 'string',
              )
            : []),
          JSON.stringify(definition.businessLink ?? {}),
        ]
          .join(' ')
          .toLocaleLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
  }

  async create(
    dto: {
      name: string;
      assets?: CadBlockAssetInput[];
      definition?: Record<string, unknown>;
    },
    user?: string,
  ) {
    const name = (dto.name ?? '').trim().slice(0, 80);
    if (!name) throw new BadRequestException('El bloque necesita un nombre.');
    const definition = this.safeDefinition(dto.definition);
    if (!dto.assets?.length && !definition)
      throw new BadRequestException(
        'El bloque necesita assets o una definición canónica.',
      );
    if ((dto.assets?.length ?? 0) > MAX_ASSETS_PER_BLOCK)
      throw new BadRequestException(
        `Máximo ${MAX_ASSETS_PER_BLOCK} assets por bloque.`,
      );
    const count = await this.blocks.count({ where: this.tenantWhere() });
    if (count >= MAX_BLOCKS_PER_TENANT)
      throw new BadRequestException(
        `Límite de ${MAX_BLOCKS_PER_TENANT} bloques alcanzado; borra alguno.`,
      );
    const clampPos = (v: unknown, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    const assets: LayoutAsset[] = (dto.assets ?? []).map((a, i) => ({
      id: String(a.id || `b${i}`).slice(0, 64),
      kind: String(a.kind || 'box').slice(0, 24),
      x: Number(a.x) || 0,
      y: Number(a.y) || 0,
      w: clampPos(a.w, 1),
      h: clampPos(a.h, 1),
      rotation: Number(a.rotation) || 0,
      ...(a.label ? { label: String(a.label).slice(0, 64) } : {}),
      ...(a.layer ? { layer: String(a.layer).slice(0, 64) } : {}),
    }));
    const row = this.blocks.create({
      tenant_id: this.tenantCtx.getTenantId(),
      plant_id: this.tenantCtx.getPlantId(),
      name,
      assets,
      definition,
      version: 1,
      created_by: user ?? null,
    });
    const saved = await this.blocks.save(row);
    return {
      id: saved.id,
      name: saved.name,
      assets: saved.assets,
      definition: saved.definition,
      version: saved.version,
      createdAt: saved.created_at,
    };
  }

  async update(
    id: string,
    dto: { name?: string; definition?: Record<string, unknown> },
  ) {
    const row = await this.findForMutation(id);
    if (dto.name !== undefined) row.name = dto.name.trim().slice(0, 80);
    if (dto.definition !== undefined) {
      row.definition = this.safeDefinition(dto.definition);
      row.version = (row.version ?? 1) + 1;
    }
    const saved = await this.blocks.save(row);
    return {
      id: saved.id,
      name: saved.name,
      assets: saved.assets ?? [],
      definition: saved.definition ?? null,
      version: saved.version ?? 1,
      createdAt: saved.created_at,
    };
  }

  async remove(id: string): Promise<{ removed: true }> {
    await this.blocks.remove(await this.findForMutation(id));
    return { removed: true };
  }
}
