/**
 * In-memory fake of the AXOS backend, served to the browser via Playwright
 * route interception. The real data layer (apps/web/src/hooks/useApi.ts +
 * lib/apiFetch.ts) sends every call to NEXT_PUBLIC_API_URL (= API_ORIGIN in
 * tests). We intercept that origin and answer with deterministic fixtures,
 * maintaining just enough cross-page state for the golden path:
 *
 *   model → BOM → activate → plan/WO → operator step → NCR
 *
 * Nothing here touches the real NestJS/Postgres backend, so the suite is
 * hermetic, fast and deterministic. Response shapes mirror exactly the fields
 * the pages read (see the per-page contracts gathered for this harness).
 *
 * `useApi` unwraps `{ success, data }` envelopes but also accepts raw bodies, so
 * we return raw shapes for simplicity.
 */

import type { BrowserContext, Route } from '@playwright/test';
import { API_ORIGIN } from './constants';
import { masterJwt } from './session';

type Status = 'DRAFT' | 'ACTIVE' | 'OBSOLETE';

interface BomComponent {
  id: number;
  componentNumber: string;
  description: string | null;
  quantity: number;
  usageFactor: number;
  unit: string;
  extendedCost: number;
  standardCost: number;
}
interface BomHeader {
  id: number;
  model: string;
  productName: string;
  revision: string;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'ACTIVE' | 'OBSOLETE';
  estimatedCost: number;
  baseQuantity: number;
  components: BomComponent[];
}
interface ProductModel {
  id: string;
  modelNumber: string;
  name: string;
  customer: string | null;
  revision: string;
  status: Status;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  activatedAt: string | null;
}
interface WorkOrder {
  id: string;
  folio: string | null;
  model: string;
  revision: string;
  line: string;
  bay: string | null;
  quantityPlanned: number;
  quantityCompleted: number;
  scheduledDate: string | null;
  sequence: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'RELEASED' | 'STAGED' | 'IN_EXECUTION' | 'COMPLETED' | 'CANCELLED';
  consumptionMode: 'BY_UNIT' | 'BY_QTY_FACTOR';
  serialControl: 'NONE' | 'BY_UNIT';
  materialReady: boolean;
  qualityClear: boolean;
  faiRequired: boolean;
  faiApproved: boolean;
  authorizedOperators: string[] | null;
  customer: string | null;
  taktTargetSec: number | null;
  startedAt: string | null;
}
interface Plan {
  id: number;
  workOrder: string;
  model: string;
  quantity: number;
  status: string;
  line: number;
  bahia: number | null;
  shift: string;
  publishedBy: string | null;
  kitId: number | null;
}
interface Ncr {
  id: number;
  ncrNumber: string;
  status: string;
  severity: string;
  partNumber: string;
  category: string;
  description: string;
  sourceType: string;
  quantityAffected: number;
  model: string | null;
  workOrder: string | null;
  lotNumber: string | null;
  serialNumber: string | null;
  line: string | null;
  customer: string | null;
  program: string | null;
  building: string | null;
  warehouse: string | null;
  owner: string | null;
  dispositionNotes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
// Surtido a línea (e-kanban). A staging line is one part the materialist must
// stage at a station for a WO; a replenish call is raised when a line is short.
type StagingStatus = 'PENDING' | 'STAGED' | 'SHORTAGE';
interface StagingLine {
  id: string;
  woId: string;
  station: string;
  sequence: number;
  part: string;
  requiredQty: number;
  stagedQty: number;
  minQty: number;
  status: StagingStatus;
  feederPosition: string | null;
}
interface ReplenishCall {
  id: string;
  woFolio: string | null;
  station: string;
  part: string;
  qty: number;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
  reason: string | null;
  raisedAt: string | null;
}

export interface MockState {
  models: ProductModel[];
  boms: BomHeader[];
  inventory: { partNumber: string; onHand: number; allocated: number; holdStatus: string | null }[];
  parts: Set<string>;
  plans: Plan[];
  workOrders: WorkOrder[];
  ncrs: Ncr[];
  // Surtido a línea: lines per WO + the replenishment calls a shortage raises.
  staging: Map<string, StagingLine[]>;
  replenish: ReplenishCall[];
  seq: { model: number; bom: number; comp: number; plan: number; wo: number; folio: number; ncr: number; stg: number; call: number };
}

export interface MockOptions {
  /** Seed a released WO + plan so the Muro/operator pages have data on load. */
  seedWorkOrder?: boolean;
}

const NOW = () => new Date().toISOString();
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// 1x1 transparent PNG — lets visualAidUrl render as a real <img>.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function seedState(opts: MockOptions): MockState {
  // Baseline reference data: an ACTIVE model with an ACTIVE BOM and ample
  // inventory, so a WO published for it computes Clear-to-Build = "go".
  const state: MockState = {
    models: [
      {
        id: 'mdl-ax1000',
        modelNumber: 'AX-1000',
        name: 'Controlador EV — Gen 2',
        customer: 'ACME Robotics',
        revision: 'A',
        status: 'ACTIVE',
        description: 'Reference model for the E2E golden path.',
        metadata: null,
        createdAt: NOW(),
        activatedAt: NOW(),
      },
    ],
    boms: [
      {
        id: 9001,
        model: 'AX-1000',
        productName: 'Controlador EV — Gen 2',
        revision: 'A',
        status: 'ACTIVE',
        estimatedCost: 12.5,
        baseQuantity: 1,
        components: [
          {
            id: 8001,
            componentNumber: 'CMP-1',
            description: 'Resistor 10k',
            quantity: 2,
            usageFactor: 1,
            unit: 'EA',
            extendedCost: 1.0,
            standardCost: 0.5,
          },
        ],
      },
    ],
    inventory: [{ partNumber: 'CMP-1', onHand: 1000, allocated: 0, holdStatus: null }],
    parts: new Set(['CMP-1']),
    plans: [],
    workOrders: [],
    ncrs: [],
    staging: new Map(),
    replenish: [],
    seq: { model: 1, bom: 9001, comp: 8001, plan: 1, wo: 1, folio: 1, ncr: 1, stg: 0, call: 0 },
  };

  if (opts.seedWorkOrder) {
    state.workOrders.push({
      id: 'wo-seed-1',
      folio: 'WO-SEED-1',
      model: 'AX-1000',
      revision: 'A',
      line: 'SMT-1',
      bay: null,
      quantityPlanned: 100,
      quantityCompleted: 0,
      scheduledDate: null,
      sequence: 10,
      priority: 'MEDIUM',
      status: 'RELEASED',
      consumptionMode: 'BY_UNIT',
      serialControl: 'NONE',
      materialReady: true,
      qualityClear: true,
      faiRequired: false,
      faiApproved: false,
      authorizedOperators: [],
      customer: 'ACME Robotics',
      taktTargetSec: 60,
      startedAt: null,
    });
  }

  return state;
}

function modelKpis(state: MockState) {
  const byStatus: Record<Status, number> = { DRAFT: 0, ACTIVE: 0, OBSOLETE: 0 };
  for (const m of state.models) byStatus[m.status]++;
  return { total: state.models.length, byStatus, active: byStatus.ACTIVE };
}

function planKpis(state: MockState) {
  const open = state.workOrders.filter((w) => w.status !== 'COMPLETED' && w.status !== 'CANCELLED').length;
  const inExecution = state.workOrders.filter((w) => w.status === 'IN_EXECUTION').length;
  return { open, inExecution, planAdherencePct: 1, pctWithReadiness: 1, behindSchedule: 0, total: state.workOrders.length };
}

/**
 * Build the operator-terminal context for a given WO + station. Always returns
 * a non-null station with a .png visual aid so the "Paso N · EST" badge and the
 * visual-aid <img> both render.
 *
 * The station's expected part and "Material en línea" are derived from the WO's
 * model BOM and the live surtido (staging) state, so the terminal reflects what
 * the warehouse actually staged: if a line was flagged short, the operator sees
 * SHORTAGE (red) and is blocked — this is how the warehouse → operator leg of
 * the end-to-end flow stays connected (no hard-coded material).
 */
function operatorContext(state: MockState, woId: string, station: string) {
  const wo = state.workOrders.find((w) => w.id === woId) || state.workOrders[0];
  const model = wo?.model || 'AX-1000';
  const revision = wo?.revision || 'A';
  const bom = state.boms.find((b) => b.model === model) || null;
  const comps = bom?.components ?? [];
  const lines = (wo ? state.staging.get(wo.id) : undefined) ?? [];

  // The station consumes one part: prefer whatever the warehouse flagged short
  // (so the operator sees the actual blocker), else the last BOM component, else
  // a safe default that keeps the seeded golden-path specs green.
  const shortLine = lines.find((l) => l.status === 'SHORTAGE') || null;
  const expectedPart =
    shortLine?.part || comps[comps.length - 1]?.componentNumber || 'CMP-1';

  const line = lines.find((l) => l.part === expectedPart) || null;
  const comp = comps.find((c) => c.componentNumber === expectedPart) || null;
  const requiredQty =
    line?.requiredQty ?? (comp ? round2(comp.quantity * (wo?.quantityPlanned ?? 1)) : 2);
  const material = {
    part: expectedPart,
    requiredQty,
    stagedQty: line?.stagedQty ?? 0,
    // Before the materialist stages anything there is no line yet → PENDING (not
    // a shortage). A shortage only appears once the warehouse flags it.
    status: line?.status ?? 'PENDING',
  };
  const isShort = material.status === 'SHORTAGE';

  return {
    workOrder: {
      id: wo?.id || woId,
      folio: wo?.folio || 'WO-SEED-1',
      model,
      revision,
      line: wo?.line || 'SMT-1',
      quantityPlanned: wo?.quantityPlanned ?? 100,
      quantityCompleted: wo?.quantityCompleted ?? 0,
      consumptionMode: 'BY_UNIT',
      serialControl: 'NONE',
      taktTargetSec: 60,
      programId: null,
    },
    station: {
      station: station || 'EST-10',
      sequence: 1,
      npExpected: expectedPart,
      useFactor: 1,
      stdTimeSec: 45,
      visualAidUrl: `${API_ORIGIN}/visual-aids/file/step-1.png`,
      ctq: false,
    },
    material,
    runnable: !isShort,
    blockers: isShort ? [`Falta material en línea: ${material.part}`] : [],
    skill: { required: false, certified: true, reason: null },
    authorized: true,
  };
}

/** KPIs for the surtido (material-staging) page, derived from live staging state. */
function stagingKpis(state: MockState) {
  const all = [...state.staging.values()].flat();
  const total = all.length;
  const staged = all.filter((l) => l.status === 'STAGED').length;
  const shortage = all.filter((l) => l.status === 'SHORTAGE').length;
  const openCalls = state.replenish.filter((c) => c.status === 'OPEN' || c.status === 'IN_TRANSIT').length;
  const stationsShort = new Set(all.filter((l) => l.status === 'SHORTAGE').map((l) => l.station)).size;
  return {
    totalLines: total,
    stagedLines: staged,
    shortageLines: shortage,
    fillRatePct: total ? staged / total : 0,
    openCalls,
    avgReplenishMinutes: 0,
    stationsShort,
  };
}

export class MockBackend {
  readonly state: MockState;

  constructor(opts: MockOptions = {}) {
    this.state = seedState(opts);
  }

  /** Register all route handlers on the given browser context. */
  async install(context: BrowserContext): Promise<void> {
    await context.route(`${API_ORIGIN}/**`, (route) => this.handleApi(route));
    // The same-origin bridge: hand back a decode-only admin JWT so the client
    // AuthContext never has to reach a real backend.
    await context.route('**/api/backend/token', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: masterJwt() }),
      }),
    );
  }

  private async handleApi(route: Route): Promise<void> {
    const req = route.request();
    const method = req.method().toUpperCase();
    const url = new URL(req.url());
    const path = url.pathname;
    const q = url.searchParams;
    const body = this.readJson(route);
    const state = this.state;

    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

    // ── Static / auth ──────────────────────────────────────────────────────
    if (path === '/auth/me') return json({ id: 'e2e-master', email: 'master', role: 'Admin' });
    if (path === '/enterprise/buildings' || path === '/enterprise/programs') return json([]);
    if (path.startsWith('/visual-aids/file/')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 });
    }
    if (path === '/visual-aids') return json([]);

    // ── Product models (NPI) ───────────────────────────────────────────────
    if (path === '/product-models' && method === 'GET') return json(state.models);
    if (path === '/product-models/kpis') return json(modelKpis(state));
    if (path === '/product-models' && method === 'POST') {
      const n = state.seq.model++;
      const model: ProductModel = {
        id: `mdl-e2e-${n}`,
        modelNumber: (body.modelNumber as string)?.trim() || `MDL-E2E-${String(n).padStart(3, '0')}`,
        name: (body.name as string) ?? `Model ${n}`,
        customer: (body.customer as string) ?? null,
        revision: (body.revision as string) || '1.0',
        status: 'DRAFT',
        description: (body.description as string) ?? null,
        metadata: (body.metadata as Record<string, unknown>) ?? null,
        createdAt: NOW(),
        activatedAt: null,
      };
      state.models.push(model);
      return json(model, 201);
    }
    const mTransition = path.match(/^\/product-models\/([^/]+)\/(activate|obsolete)$/);
    if (mTransition && method === 'POST') {
      const model = state.models.find((m) => m.id === mTransition[1]);
      if (model) {
        model.status = mTransition[2] === 'activate' ? 'ACTIVE' : 'OBSOLETE';
        model.activatedAt = mTransition[2] === 'activate' ? NOW() : model.activatedAt;
      }
      return json(model ?? {});
    }
    const mModel = path.match(/^\/product-models\/([^/]+)$/);
    if (mModel) {
      const model = state.models.find((m) => m.id === mModel[1]);
      if (method === 'PATCH' && model) Object.assign(model, body);
      return model ? json(model) : json({ message: 'not found' }, 404);
    }

    // ── BOM ────────────────────────────────────────────────────────────────
    if (path === '/bom/headers' && method === 'GET') {
      const model = q.get('model');
      const status = q.get('status');
      let rows = state.boms;
      if (model) rows = rows.filter((b) => b.model === model);
      if (status) rows = rows.filter((b) => b.status === status);
      return json(rows);
    }
    if (path === '/bom/headers' && method === 'POST') {
      const header: BomHeader = {
        id: ++state.seq.bom,
        model: (body.model as string) ?? '',
        productName: (body.productName as string) ?? '',
        revision: (body.revision as string) || '1.0',
        status: 'DRAFT',
        estimatedCost: 0,
        baseQuantity: 1,
        components: [],
      };
      state.boms.push(header);
      return json(header, 201);
    }
    const mBomComp = path.match(/^\/bom\/headers\/(\d+)\/components$/);
    if (mBomComp && method === 'POST') {
      const header = state.boms.find((b) => b.id === Number(mBomComp[1]));
      if (header) {
        const qty = Number(body.quantity) || 1;
        const cost = 1;
        header.components.push({
          id: ++state.seq.comp,
          componentNumber: (body.componentNumber as string) ?? 'PART',
          description: null,
          quantity: qty,
          usageFactor: 1,
          unit: (body.unit as string) || 'EA',
          extendedCost: qty * cost,
          standardCost: cost,
        });
        header.estimatedCost = header.components.reduce((s, c) => s + c.extendedCost, 0);
      }
      return json(header ?? {}, 201);
    }
    const mBomLifecycle = path.match(/^\/bom\/headers\/(\d+)\/(approve|activate|obsolete)$/);
    if (mBomLifecycle && method === 'POST') {
      const header = state.boms.find((b) => b.id === Number(mBomLifecycle[1]));
      if (header) {
        header.status =
          mBomLifecycle[2] === 'approve' ? 'APPROVED' : mBomLifecycle[2] === 'activate' ? 'ACTIVE' : 'OBSOLETE';
      }
      return json(header ?? {});
    }

    // ── Inventory ──────────────────────────────────────────────────────────
    if (path === '/inventory/master-data' && method === 'POST') {
      if (body.partNumber) state.parts.add(String(body.partNumber).toUpperCase());
      return json({ ok: true, partNumber: body.partNumber }, 201);
    }
    if (path === '/inventory/positions') return json(state.inventory);

    // ── Plans (legacy planning) ────────────────────────────────────────────
    if (path === '/plans' && method === 'GET') {
      const model = q.get('model');
      return json(model ? state.plans.filter((p) => p.model === model) : state.plans);
    }
    if (path === '/plans/intelligence') return json({ backlog: 0, readinessRisks: 0, lineLoad: [] });
    if (path === '/plans' && method === 'POST') {
      const n = state.seq.plan++;
      const plan: Plan = {
        id: n,
        workOrder: `WP-E2E-${String(n).padStart(4, '0')}`,
        model: (body.model as string) ?? '',
        quantity: Number(body.quantity) || 0,
        status: 'pending',
        line: Number(body.line) || 1,
        bahia: body.bahia != null ? Number(body.bahia) : null,
        shift: (body.shift as string) || 'T1',
        publishedBy: null,
        kitId: null,
      };
      state.plans.push(plan);
      return json(plan, 201);
    }
    const mPlanId = path.match(/^\/plans\/(\d+)$/);
    if (mPlanId && method === 'DELETE') {
      state.plans = state.plans.filter((p) => p.id !== Number(mPlanId[1]));
      return json({ ok: true });
    }
    if (path === '/pick-lists' && method === 'POST') {
      const plan = state.plans.find((p) => p.id === Number(body.planId));
      if (plan) {
        plan.status = 'published';
        plan.publishedBy = 'Master';
        plan.kitId = 5000 + plan.id;
      }
      const lines = [{ partNumber: 'CMP-1', description: 'Resistor 10k', quantityRequired: 2, unit: 'EA' }];
      return json({ planId: Number(body.planId), kitId: plan?.kitId ?? null, published: true, lineCount: lines.length, lines }, 201);
    }
    const mPickGet = path.match(/^\/pick-lists\/(?:preview\/)?(\d+)$/);
    if (mPickGet && method === 'GET') {
      const lines = [{ partNumber: 'CMP-1', description: 'Resistor 10k', quantityRequired: 2, unit: 'EA' }];
      const preview = path.includes('/preview/');
      return json(
        preview
          ? { planId: Number(mPickGet[1]), quantity: 1, hasBom: true, lineCount: lines.length, lines }
          : { planId: Number(mPickGet[1]), kitId: 5000, published: true, lineCount: lines.length, lines },
      );
    }
    if (path === '/material-requests') return method === 'POST' ? json({ ok: true }, 201) : json([]);

    // ── Production plan / Muro (sf_work_orders) ────────────────────────────
    if (path === '/production-plan' && method === 'GET') return json(state.workOrders);
    if (path === '/production-plan/kpis') return json(planKpis(state));
    if (path === '/production-plan/publish' && method === 'POST') {
      const n = state.seq.wo++;
      const f = state.seq.folio++;
      const wo: WorkOrder = {
        id: `wo-e2e-${n}`,
        folio: `WO-E2E-${String(f).padStart(4, '0')}`,
        model: (body.model as string)?.trim() ?? '',
        revision: (body.revision as string) || 'A',
        line: (body.line as string) || 'SMT-1',
        bay: (body.bay as string)?.trim() || null,
        quantityPlanned: Number(body.quantityPlanned) || 1,
        quantityCompleted: 0,
        scheduledDate: (body.scheduledDate as string) || null,
        sequence: (state.workOrders.length + 1) * 10,
        priority: (body.priority as WorkOrder['priority']) || 'MEDIUM',
        status: 'RELEASED',
        consumptionMode: (body.consumptionMode as WorkOrder['consumptionMode']) || 'BY_UNIT',
        serialControl: (body.serialControl as WorkOrder['serialControl']) || 'NONE',
        materialReady: true,
        qualityClear: true,
        faiRequired: !!body.faiRequired,
        faiApproved: false,
        authorizedOperators: [],
        customer: (body.customer as string)?.trim() || null,
        taktTargetSec: 60,
        startedAt: null,
      };
      state.workOrders.push(wo);
      return json({ ok: true, id: wo.id, folio: wo.folio }, 201);
    }
    const mWoTransition = path.match(/^\/production-plan\/([^/]+)\/(transition|authorize|resequence)$/);
    if (mWoTransition) {
      const wo = state.workOrders.find((w) => w.id === mWoTransition[1]);
      if (wo && body.status) wo.status = body.status as WorkOrder['status'];
      if (wo && body.priority) wo.priority = body.priority as WorkOrder['priority'];
      if (wo && body.sequence != null) wo.sequence = Number(body.sequence);
      if (wo && body.operators) wo.authorizedOperators = body.operators as string[];
      return json({ ok: true });
    }

    // ── Operator terminal ──────────────────────────────────────────────────
    if (path === '/operator-terminal/context') {
      return json(operatorContext(state, q.get('woId') || '', q.get('station') || ''));
    }
    if (path === '/operator-terminal/kpis') {
      return json({ unitsPerHour: 0, unitsToday: 0, openAndons: 0, defectsToday: 0, eventsToday: 0 });
    }
    if (path === '/operator-terminal/floor-events') return json([]);
    if (path.startsWith('/operator-terminal/hour-by-hour/')) return json([]);
    if (path === '/operator-terminal/verify') return json({ ok: true });
    if (
      path === '/operator-terminal/confirm' ||
      path === '/operator-terminal/andon' ||
      path === '/operator-terminal/defect'
    ) {
      return json({ ok: true, message: 'ok', event: {} }, 201);
    }

    // ── Surtido a línea (material-staging / e-kanban) ───────────────────────
    // The staging lines for a WO are exploded from that WO's model BOM, so the
    // part the materialist stages is exactly the BOM part captured in NPI —
    // keeping the model → BOM → WO → surtido → faltante flow connected.
    if (path === '/material-staging/kpis') return json(stagingKpis(state));
    if (path === '/material-staging/replenish' && method === 'GET') return json(state.replenish);
    const mRepTrans = path.match(/^\/material-staging\/replenish\/([^/]+)\/transition$/);
    if (mRepTrans && method === 'POST') {
      const call = state.replenish.find((c) => c.id === mRepTrans[1]);
      if (call && body.status) call.status = body.status as ReplenishCall['status'];
      return json(call ?? { ok: true });
    }
    if (path === '/material-staging/generate' && method === 'POST') {
      const woId = String(body.woId || '');
      const wo = state.workOrders.find((w) => w.id === woId);
      if (!wo) return json({ message: 'WO no encontrada' }, 404);
      if (!state.staging.has(woId)) {
        const bom = state.boms.find((b) => b.model === wo.model);
        const planned = wo.quantityPlanned || 1;
        const lines: StagingLine[] = (bom?.components ?? []).map((c, i) => {
          const required = round2(c.quantity * (c.usageFactor || 1) * planned);
          return {
            id: `stg-${++state.seq.stg}`,
            woId,
            station: 'EST-10',
            sequence: (i + 1) * 10,
            part: c.componentNumber,
            requiredQty: required,
            stagedQty: 0,
            minQty: Math.max(1, Math.round(required * 0.2)),
            status: 'PENDING',
            feederPosition: `F-${String(i + 1).padStart(2, '0')}`,
          };
        });
        state.staging.set(woId, lines);
      }
      return json(state.staging.get(woId) ?? [], 201);
    }
    const mStgWo = path.match(/^\/material-staging\/wo\/(.+)$/);
    if (mStgWo && method === 'GET') return json(state.staging.get(mStgWo[1]) ?? []);
    const mStgAction = path.match(/^\/material-staging\/([^/]+)\/(confirm|shortage)$/);
    if (mStgAction && method === 'POST') {
      const [, lineId, action] = mStgAction;
      let target: StagingLine | undefined;
      let owner: WorkOrder | undefined;
      for (const [wid, lines] of state.staging) {
        const found = lines.find((l) => l.id === lineId);
        if (found) {
          target = found;
          owner = state.workOrders.find((w) => w.id === wid);
          break;
        }
      }
      if (!target) return json({ message: 'línea no encontrada' }, 404);
      if (action === 'confirm') {
        const qty = body.stagedQty != null ? Number(body.stagedQty) : target.requiredQty;
        target.stagedQty = qty;
        target.status = qty > 0 ? 'STAGED' : 'PENDING';
      } else {
        target.status = 'SHORTAGE';
        // A shortage raises an e-kanban replenishment call for the same part.
        state.replenish.unshift({
          id: `call-${++state.seq.call}`,
          woFolio: owner?.folio ?? null,
          station: target.station,
          part: target.part,
          qty: Math.max(0, round2(target.requiredQty - target.stagedQty)),
          priority: 'HIGH',
          status: 'OPEN',
          reason: 'Sin stock en almacén',
          raisedAt: NOW(),
        });
      }
      return json(target, 201);
    }

    // ── Quality / NCR ──────────────────────────────────────────────────────
    if (path === '/ncr' && method === 'GET') return json(state.ncrs);
    if (path === '/ncr' && method === 'POST') {
      const n = state.seq.ncr++;
      const ncr: Ncr = {
        id: n,
        ncrNumber: `NCR-E2E-${String(n).padStart(4, '0')}`,
        status: 'open',
        severity: (body.severity as string) || 'major',
        partNumber: (body.partNumber as string) ?? '',
        category: (body.category as string) ?? '',
        description: (body.description as string) ?? '',
        sourceType: (body.sourceType as string) || 'in-process',
        quantityAffected: Number(body.quantityAffected) || 0,
        model: (body.model as string) ?? null,
        workOrder: (body.workOrder as string) ?? null,
        lotNumber: (body.lotNumber as string) ?? null,
        serialNumber: (body.serialNumber as string) ?? null,
        line: (body.line as string) ?? null,
        customer: (body.customer as string) ?? null,
        program: (body.program as string) ?? null,
        building: null,
        warehouse: null,
        owner: null,
        dispositionNotes: null,
        createdBy: (body.createdBy as string) || 'QA',
        createdAt: NOW(),
        updatedAt: NOW(),
      };
      state.ncrs.unshift(ncr);
      return json(ncr, 201);
    }
    const mNcrStatus = path.match(/^\/ncr\/([^/]+)\/status$/);
    if (mNcrStatus && method === 'PATCH') {
      const ncr = state.ncrs.find((c) => String(c.id) === mNcrStatus[1]);
      if (ncr && body.status) ncr.status = body.status as string;
      return json(ncr ?? {});
    }
    const mNcrId = path.match(/^\/ncr\/([^/]+)$/);
    if (mNcrId && method === 'GET') {
      const ncr = state.ncrs.find((c) => String(c.id) === mNcrId[1]);
      return ncr ? json(ncr) : json({ message: 'not found' }, 404);
    }
    if (path === '/quality/capas') {
      return method === 'POST' ? json({ ok: true, capaNumber: 'CAPA-E2E-1' }, 201) : json([]);
    }

    // ── Default: never 401/403 (that would trip the "Sin acceso" screens). ──
    if (method === 'GET') return json([]);
    return json({ ok: true });
  }

  private readJson(route: Route): Record<string, unknown> {
    try {
      const data = route.request().postDataJSON();
      return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
}

/** Convenience: build + install a fresh mock backend on a context. */
export async function installMockBackend(context: BrowserContext, opts: MockOptions = {}): Promise<MockBackend> {
  const mock = new MockBackend(opts);
  await mock.install(context);
  return mock;
}
