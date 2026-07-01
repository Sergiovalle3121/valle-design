# CAD Manufacturing Depth Plan — Phase 0

- **Date:** 2026-07-01
- **Branch:** `codex/cad-manufacturing-depth`
- **Scope:** frontend / pure TypeScript math in **new files under `apps/web/src/lib/cad/`**. No backend, migrations, auth, tenancy, MES floor-flow, or editor shell changes.
- **Hard stop:** this document is Phase 0 only. Do not implement modules until the owner approves the next single module.

## Guardrails for this work

1. **Do not edit Claude-owned files:**
   - `apps/web/src/components/line-engineering/Layout3DEditor.tsx`
   - `apps/web/src/lib/cad/toolbar.ts`
   - `apps/web/src/lib/cad/command-palette.ts`
   - `apps/web/src/lib/cad/keyboard-shortcuts.ts`
   - `apps/web/src/lib/cad/index.ts`
2. **Do not rewrite existing CAD modules.** New manufacturing-depth modules must sit beside existing helpers in `apps/web/src/lib/cad/` and import/reuse current types or functions when useful.
3. **One module at a time.** Each implementation phase adds exactly one new module plus its focused `.spec.ts`, runs the gate, then stops for owner review.
4. **Math requires tests.** Every formula, assignment heuristic, or what-if calculation must have hand-checkable fixtures in the module spec.
5. **No UI wiring in this branch until Claude-owned editor conflicts settle.** PR notes must state what Claude Code can wire later.

## Phase 0 anti-duplication grep evidence

Commands run before writing this plan:

```bash
rg --files docs apps/web/src/lib/cad apps/web/src/components/line-engineering
rg -n "line-balance|flow-optimization|material-flow-route|warehouse-generators|world-scale|measurements|dimensions|annotations|layers|snapping|symbols|validation-report|dxf-|safety-zones|collisions|object-properties|templates|minimap|viewport-bookmarks|architecture|takt|bottleneck|spaghetti|ergonomics" apps/web/src/lib/cad apps/web/src/components/line-engineering docs/cad -g '!node_modules'
```

Findings:

- Existing **basic line balance** is `apps/web/src/lib/cad/line-balance.ts`. It calculates takt load, bottleneck, missing cycle-time metadata, over-takt stations, balance efficiency, and a score. The new work must extend this with deeper industrial-engineering modules, not replace it.
- Existing **flow** work is `apps/web/src/lib/cad/flow-optimization.ts` and `apps/web/src/lib/cad/material-flow-route.ts`. New spaghetti/layout metrics must consume or complement flow geometry; they must not create another flow engine.
- Existing drawing/CAD subsystems already cover measurements, annotations, layers, snapping, symbols, validation, DXF import/export, safety zones, collisions, object properties, templates, minimap, viewport bookmarks, architecture, world scale, and warehouse generators.
- No existing `line-balance-assignment.ts`, `line-balance-metrics.ts`, `takt-capacity.ts`, `bottleneck-analysis.ts`, `spaghetti-diagram.ts`, `line-layout-metrics.ts`, or `ergonomics-check.ts` files were present during Phase 0.

## Priority backlog — balance first

### 1. `line-balance-assignment.ts` — task-to-station assignment

**What it calculates**

- Assigns work elements/tasks to stations for a target takt/cycle time while respecting precedence constraints.
- Produces station workloads, idle time, efficiency, unassigned/infeasible tasks, and deterministic warnings.
- Supports at least two classic heuristics:
  - **Ranked positional weight (RPW):** task priority = own time + all successor times.
  - **Largest candidate rule (LCR):** priority = descending task time with precedence eligibility.

**Why it does not duplicate**

- Existing `line-balance.ts` scores already-placed stations. It does **not** solve the line balancing assignment problem from task-level precedence data.
- This module should optionally expose adapters that summarize its station result into existing line-balance station shapes, but it must not rewrite `line-balance.ts`.

**New files**

- `apps/web/src/lib/cad/line-balance-assignment.ts`
- `apps/web/src/lib/cad/line-balance-assignment.spec.ts`

**How it is tested**

- Hand-check a small precedence network with known RPW ranks and station assignment under a fixed takt.
- Verify LCR produces deterministic station grouping and respects all predecessors.
- Verify infeasible single tasks over takt are surfaced instead of hidden.
- Verify cycle detection or impossible precedence input returns a safe error/warning.

**Gate**

```bash
node_modules/.bin/ts-node --compiler-options '{"module":"commonjs"}' --project apps/web/tsconfig.json apps/web/src/lib/cad/line-balance-assignment.spec.ts
npx tsc --noEmit -p apps/web/tsconfig.json
npx eslint apps/web/src/lib/cad/line-balance-assignment.ts apps/web/src/lib/cad/line-balance-assignment.spec.ts
```

### 2. `line-balance-metrics.ts` — advanced industrial metrics

**What it calculates**

- Balance delay: `(N × C - Σti) / (N × C)`.
- Line efficiency: `Σti / (N × C)`.
- Smoothness index: `sqrt(Σ(Cmax - Si)^2)` or target-cycle variant when takt is supplied.
- Station utilization, station idle time, total idle time, bottleneck load, and ranked station deltas.

**Why it does not duplicate**

- Existing `line-balance.ts` has a simple balance efficiency and score. It does not provide full industrial-engineering metric breakdowns or formula-level auditability.
- This module should accept generic station workloads and can be reused by `line-balance-assignment.ts` after approval.

**New files**

- `apps/web/src/lib/cad/line-balance-metrics.ts`
- `apps/web/src/lib/cad/line-balance-metrics.spec.ts`

**How it is tested**

- Use a hand-known fixture, e.g. station times `[40, 35, 25]` with cycle `45`: total idle `35`, efficiency `100 / 135 = 74.074%`, balance delay `25.926%`.
- Verify smoothness index manually from the chosen formula.
- Verify zero/invalid cycle input is rejected safely.

### 3. `takt-capacity.ts` — takt vs. cycle vs. capacity gap

**What it calculates**

- Required takt from available production time and customer demand.
- Current line capacity from bottleneck/cycle time and available time.
- Gap between required units and current capacity, required cycle-time reduction, and demand/capacity status.

**Why it does not duplicate**

- Existing `line-balance.ts` accepts a takt and reports overloads. It does not derive takt from demand/calendar time or calculate capacity gap.

**New files**

- `apps/web/src/lib/cad/takt-capacity.ts`
- `apps/web/src/lib/cad/takt-capacity.spec.ts`

**How it is tested**

- Example: 7.5 productive hours = 27,000 seconds, demand 600 units → required takt `45s/unit`.
- Example: bottleneck cycle `50s`, 27,000 seconds available → current capacity `540 units`, gap `-60 units` vs. demand 600.
- Verify planned downtime/breaks and parallel-line count are handled explicitly.

### 4. `bottleneck-analysis.ts` — bottleneck and what-if impact

**What it calculates**

- Identifies primary and secondary bottlenecks from station/task workloads.
- Runs pure what-if scenarios: move task A from station X to Y, split/remove/reduce task time, or change target takt.
- Returns before/after bottleneck, capacity impact, idle-time impact, and feasibility warnings.

**Why it does not duplicate**

- Existing `line-balance.ts` identifies the current bottleneck only. It does not model scenario deltas or task movement effects.
- This should reuse `line-balance-metrics.ts` once that module is approved, not duplicate formulas.

**New files**

- `apps/web/src/lib/cad/bottleneck-analysis.ts`
- `apps/web/src/lib/cad/bottleneck-analysis.spec.ts`

**How it is tested**

- Hand fixture where moving a 10-second task removes one bottleneck but creates another.
- Verify no-op moves produce zero deltas.
- Verify impossible moves return warnings and leave the baseline intact.

## Secondary backlog — manufacturing layout analysis only after balance modules

### 5. `spaghetti-diagram.ts` — material/person travel distance

**What it calculates**

- Ordered path distance over layout points/stations.
- Repeated-segment and backtracking metrics.
- Optional load-weighted travel distance for material routes.

**Why it does not duplicate**

- Existing `flow-optimization.ts` scores flow health and reorder previews; `material-flow-route.ts` reports from-to routing. This module would focus on classic spaghetti distance/path metrics and should consume existing route/point structures where possible.

**New files**

- `apps/web/src/lib/cad/spaghetti-diagram.ts`
- `apps/web/src/lib/cad/spaghetti-diagram.spec.ts`

**How it is tested**

- 3-4-5 triangle and rectangle path fixtures with exact manual distances.
- Repeated segment/backtrack fixture with known counts.

### 6. `line-layout-metrics.ts` — line layout geometry metrics

**What it calculates**

- Distance between consecutive stations.
- Area per station and density within a provided footprint.
- Compactness/spacing warnings for line layouts.

**Why it does not duplicate**

- Existing `measurements.ts`, `world-scale.ts`, and `architecture.ts` provide geometry primitives and plant takeoffs. They do not produce manufacturing-line layout KPIs.

**New files**

- `apps/web/src/lib/cad/line-layout-metrics.ts`
- `apps/web/src/lib/cad/line-layout-metrics.spec.ts`

**How it is tested**

- Known coordinate station chain with exact distances.
- Known footprint and station count with exact density/area-per-station.

### 7. `ergonomics-check.ts` — configurable station ergonomics rules

**What it calculates**

- Rule-based warnings for reach distance, bench height, work envelope, and clearance inputs.
- Severity and remediation messages from configurable thresholds.

**Why it does not duplicate**

- Existing `safety-zones.ts` validates spatial safety/no-go zones; this module checks human-factor station parameters and remains a pure rule evaluator.

**New files**

- `apps/web/src/lib/cad/ergonomics-check.ts`
- `apps/web/src/lib/cad/ergonomics-check.spec.ts`

**How it is tested**

- Boundary-value tests at acceptable/warning/critical thresholds.
- Custom rule configuration test to prove it is not hard-coded to one plant standard.

## Proposed next approval

Approve **only module 1: `line-balance-assignment.ts`** next.

Reason: it is the highest-value gap. It changes line balance from a station scorecard into a real industrial-engineering assignment solver while avoiding UI/editor conflicts and avoiding duplication of existing station-level `line-balance.ts`.
