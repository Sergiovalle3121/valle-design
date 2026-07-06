import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { SfCadBlock } from './entities/sf-cad-block.entity';
import { LayoutAsset } from './entities/sf-line-layout.entity';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { LayoutAssetDto } from './dto/line-engineering.dto';

const MAX_BLOCKS_PER_TENANT = 200;
const MAX_ASSETS_PER_BLOCK = 200;

/**
 * Biblioteca de bloques CAD reutilizables (ADR §224). CRUD mínimo y tenant-
 * scoped; la normalización de coordenadas (posiciones relativas al origen del
 * bloque) es responsabilidad del editor al guardar — aquí solo se sanea con el
 * mismo criterio de campos que los assets del layout.
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

  async list(): Promise<
    { id: string; name: string; assets: LayoutAsset[]; createdAt: Date }[]
  > {
    const rows = await this.blocks.find({
      where: this.tenantWhere(),
      order: { name: 'ASC' },
      take: MAX_BLOCKS_PER_TENANT,
    });
    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      assets: b.assets ?? [],
      createdAt: b.created_at,
    }));
  }

  async create(dto: { name: string; assets: LayoutAssetDto[] }, user?: string) {
    const name = (dto.name ?? '').trim().slice(0, 80);
    if (!name) throw new BadRequestException('El bloque necesita un nombre.');
    if (!dto.assets?.length)
      throw new BadRequestException('El bloque necesita al menos 1 asset.');
    if (dto.assets.length > MAX_ASSETS_PER_BLOCK)
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
    const assets: LayoutAsset[] = dto.assets.map((a, i) => ({
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
      created_by: user ?? null,
    });
    const saved = await this.blocks.save(row);
    return {
      id: saved.id,
      name: saved.name,
      assets: saved.assets,
      createdAt: saved.created_at,
    };
  }

  async remove(id: string): Promise<{ removed: true }> {
    const row = await this.blocks.findOne({
      where: { id, ...this.tenantWhere() },
    });
    if (!row) throw new NotFoundException('Bloque no encontrado.');
    await this.blocks.remove(row);
    return { removed: true };
  }
}
