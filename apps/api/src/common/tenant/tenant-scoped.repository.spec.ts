import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
  MissingTenantContextError,
  TenantContextService,
  TenantContext,
} from './tenant-context.service';
import {
  createTenantScopedRepository,
  TenantScopedRepository,
} from './tenant-scoped.repository';

@Entity('tsr_test_widgets')
class Widget {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: true })
  tenant_id: string | null;

  @Column({ type: 'varchar' })
  name: string;
}

@Entity('tsr_test_globals')
class GlobalThing {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  name: string;
}

function ctxFor(tenant: string | null): TenantContext {
  return {
    tenant_id: tenant,
    organization_id: null,
    plant_id: null,
    user_email: 'u@test',
    role: null,
    permissions: null,
    scopes: null,
  };
}

describe('TenantScopedRepository (anti-leak)', () => {
  let dataSource: DataSource;
  let ctx: TenantContextService;
  let widgets: TenantScopedRepository<Widget>;
  let globals: TenantScopedRepository<GlobalThing>;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      entities: [Widget, GlobalThing],
    });
    await dataSource.initialize();

    ctx = new TenantContextService();
    widgets = createTenantScopedRepository(Widget, dataSource.manager, ctx);
    globals = createTenantScopedRepository(
      GlobalThing,
      dataSource.manager,
      ctx,
    );

    // Seed two tenants.
    await dataSource.getRepository(Widget).save([
      { tenant_id: 'TENANT_A', name: 'a1' },
      { tenant_id: 'TENANT_A', name: 'a2' },
      { tenant_id: 'TENANT_B', name: 'b1' },
    ]);
    await dataSource
      .getRepository(GlobalThing)
      .save([{ name: 'g1' }, { name: 'g2' }]);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('find() returns only the active tenant rows', async () => {
    const a = await ctx.run(ctxFor('TENANT_A'), () => widgets.find());
    expect(a.map((w) => w.name).sort()).toEqual(['a1', 'a2']);

    const b = await ctx.run(ctxFor('TENANT_B'), () => widgets.find());
    expect(b.map((w) => w.name)).toEqual(['b1']);
  });

  it('count() is tenant-scoped', async () => {
    expect(await ctx.run(ctxFor('TENANT_A'), () => widgets.count())).toBe(2);
    expect(await ctx.run(ctxFor('TENANT_B'), () => widgets.count())).toBe(1);
  });

  it('findOne() cannot reach another tenant row', async () => {
    const leaked = await ctx.run(ctxFor('TENANT_A'), () =>
      widgets.findOne({ where: { name: 'b1' } }),
    );
    expect(leaked).toBeNull();
  });

  it('findBy() with an empty filter still scopes by tenant', async () => {
    const a = await ctx.run(ctxFor('TENANT_A'), () => widgets.findBy({}));
    expect(a).toHaveLength(2);
  });

  it('an OR-array where is scoped on every branch (no leak)', async () => {
    const rows = await ctx.run(ctxFor('TENANT_A'), () =>
      widgets.find({ where: [{ name: 'a1' }, { name: 'b1' }] }),
    );
    // b1 belongs to tenant B → must not appear for tenant A.
    expect(rows.map((w) => w.name)).toEqual(['a1']);
  });

  it('without a tenant in context it does not filter (backward compatible)', async () => {
    const all = await widgets.find(); // no ctx.run → getTenantId() null
    expect(all).toHaveLength(3);
  });

  it('entities without a tenant_id column are never filtered', async () => {
    const all = await ctx.run(ctxFor('TENANT_A'), () => globals.find());
    expect(all).toHaveLength(2);
  });
  // ── ADR §146: las ESCRITURAS del repo scoped estampan tenant ────────────────
  it('create() dentro de contexto estampa tenant_id (lo que se escribe se puede releer scoped)', async () => {
    const saved = await ctx.run(ctxFor('TENANT_A'), () =>
      widgets.save(widgets.create({ name: 'stamped' })),
    );
    expect(saved.tenant_id).toBe('TENANT_A');
    const seen = await ctx.run(ctxFor('TENANT_A'), () =>
      widgets.findBy({ name: 'stamped' }),
    );
    expect(seen).toHaveLength(1);
  });

  it('create() respeta un tenant fijado explícitamente por el caller', () => {
    const w = ctx.run(ctxFor('TENANT_A'), () =>
      widgets.create({ name: 'explicit', tenant_id: 'TENANT_B' }),
    );
    expect(w.tenant_id).toBe('TENANT_B');
  });

  it('create() sin contexto no estampa (backward compatible)', async () => {
    const w = widgets.create({ name: 'no-ctx' });
    expect(w.tenant_id ?? null).toBeNull();
  });
});

// ── VD-TEN-001: modo estricto (fail-closed) ────────────────────────────────
describe('TenantScopedRepository strict mode (fail-closed)', () => {
  let dataSource: DataSource;
  let ctx: TenantContextService;
  let widgets: TenantScopedRepository<Widget>;
  let globals: TenantScopedRepository<GlobalThing>;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      entities: [Widget, GlobalThing],
    });
    await dataSource.initialize();

    ctx = new TenantContextService();
    widgets = createTenantScopedRepository(Widget, dataSource.manager, ctx, {
      strict: true,
    });
    globals = createTenantScopedRepository(
      GlobalThing,
      dataSource.manager,
      ctx,
      {
        strict: true,
      },
    );

    // Dos tenants + una fila de sistema (tenant NULL).
    await dataSource.getRepository(Widget).save([
      { tenant_id: 'TENANT_A', name: 'a1' },
      { tenant_id: 'TENANT_A', name: 'a2' },
      { tenant_id: 'TENANT_B', name: 'b1' },
      { tenant_id: null, name: 's1' },
    ]);
    await dataSource.getRepository(GlobalThing).save([{ name: 'g1' }]);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('SIN tenant en contexto → solo el lane de sistema, NUNCA filas de tenants', async () => {
    const rows = await widgets.find(); // sin ctx.run → tenant null
    expect(rows.map((w) => w.name)).toEqual(['s1']);
    expect(await widgets.count()).toBe(1);
    expect(await widgets.findOne({ where: { name: 'a1' } })).toBeNull();
    expect(await widgets.findOneBy({ name: 'b1' })).toBeNull();
    expect(await widgets.exists({ where: { name: 'b1' } })).toBe(false);
  });

  it('un OR-array sin contexto se acota al lane de sistema en cada rama', async () => {
    const rows = await widgets.find({
      where: [{ name: 'a1' }, { name: 's1' }],
    });
    expect(rows.map((w) => w.name)).toEqual(['s1']);
  });

  it('con tenant A → solo filas de A (ni B ni la de sistema)', async () => {
    const rows = await ctx.run(ctxFor('TENANT_A'), () => widgets.find());
    expect(rows.map((w) => w.name).sort()).toEqual(['a1', 'a2']);
  });

  it('entidades sin columna tenant no se ven afectadas por strict', async () => {
    expect(await globals.find()).toHaveLength(1);
  });

  it('escritura sin contexto queda en el lane de sistema y es releíble ahí', async () => {
    const saved = await widgets.save(widgets.create({ name: 's2' }));
    expect(saved.tenant_id ?? null).toBeNull();
    const seen = await widgets.findBy({});
    expect(seen.map((w) => w.name).sort()).toEqual(['s1', 's2']);
  });

  it('requireTenantId() lanza fail-closed sin contexto y devuelve el tenant activo', () => {
    expect(() => ctx.requireTenantId('spec')).toThrow(
      MissingTenantContextError,
    );
    const tenant = ctx.run(ctxFor('TENANT_A'), () => ctx.requireTenantId());
    expect(tenant).toBe('TENANT_A');
  });
});
