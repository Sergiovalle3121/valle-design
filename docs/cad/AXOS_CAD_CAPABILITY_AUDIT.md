# AXOS CAD Capability Audit

Last updated: 2026-06-30

## 2026-06-30 - Material route command update

Open CAD PRs inspected before this run included #900 (factory scale), #903
(viewport saved views), #904 (canvas focus workbench), #905 (dock/staging
generator), and #906 (supermarket/kitting generator). All were clean, green, and
already marked ready for Claude Integrator, so this run avoided their
`Layout3DEditor.tsx` and `warehouse-generators.ts` ownership areas.

Existing capability found: the local CAD command dock already passed editable
objects, selected ids, and flow/material connectors into `CadCommandContext`;
the dock and Cmd-K palette already render command registry entries and report
operations.

What this run reused: `CAD_COMMAND_REGISTRY`, `parseCadCommand`,
`suggestCadCommands`, the existing `report` operation renderer, connector state
from `Layout3DEditor`, and `scoreFlowLayout`.

What this run extended: `material-flow-route.ts` now builds deterministic
from-to route reports from existing connectors or selected/object sequence.
`trace_material_route` exposes route distance, longest handoff, connector count,
crossings, backtracking, and route legs through the current command UI.

What this run intentionally did not duplicate: no new CAD editor, route panel,
flow engine, connector model, generator, toolbar, backend endpoint, or
persistence path was created.

Why this is non-redundant: open generator PRs create warehouse/kitting geometry;
this PR analyzes current route geometry through the existing command surface,
so users can inspect material travel without waiting for another editor panel.

## 2026-06-30 - Viewport saved views update

Open CAD PRs inspected before this run included #900 (`codex/cad-tree-active`), which is clean and owns factory-scale plant presets/bounds work. This run avoided that area and selected a Phase 2 viewport navigation slice that can sit on current `main` without duplicating factory-scale helpers.

| Capability | Exists? | Files | Maturity | Gap | Next non-redundant PR | Owner files | Collision risk with open PRs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Large plant viewport navigation | Partial | `apps/web/src/components/line-engineering/Layout3DEditor.tsx`, `apps/web/src/lib/cad/viewport-bookmarks.ts` | usable | Users could switch 2D/3D and use presets, but could not save/restore working views or zoom validation issues in large layouts. | Add minimap/home view after factory-scale PR #900 lands. | `viewport-bookmarks.ts`, existing View popover | Low-medium: localized editor view-menu/issue-selection wiring; avoids #900 plant-scale files. |

Existing capability found: the CAD workbench already had OrbitControls, 2D/3D modes, top/iso/front presets, selection refs, and validation issue rows.

What this run reused: current station/equipment placement maps, existing selection and rebuild path, OrbitControls refs, the View popover, validation quick-fix rows, browser-local session patterns, and the pure CAD helper/spec convention.

What this run extended: local saved camera views keyed by model/revision, fit-current-selection, and zoom-to-issue behavior for collision, clearance, safety, and validation issue rows.

What this run intentionally did not duplicate: no second editor, no minimap system, no validation modal, no command engine change, no DXF path, no backend persistence, no migration, and no alternate geometry model.

Why this is non-redundant: it closes a real large-layout navigation gap by making existing camera/selection/validation surfaces usable at plant scale while open PR #900 continues to own plant bounds and factory presets.

## 2026-06-29 - Safety path zone update

Open CAD PRs inspected before this run included #869 (symbols), #864 (DXF preflight), #861 (validation quick fixes), #858 (dimensions), #853 (templates), #850 (flow), #847 (plot metadata), #844 (warehouse generator), and #838 (line-balance command). This run avoided those primary ownership areas and extended the existing Safety zone path instead of creating another validation center, symbol system, or editor.

| Capability | Exists? | Files | Maturity | Gap | Next non-redundant PR | Owner files | Collision risk with open PRs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Safety zones / aisle validation | Yes | `apps/web/src/lib/cad/safety-zones.ts`, `apps/web/src/lib/cad/collisions.ts`, `apps/web/src/lib/cad/object-properties.ts`, `apps/web/src/components/line-engineering/Layout3DEditor.tsx` | usable | No-go/restricted zones existed, but ESD zones and safety paths were not first-class validation inputs. | Add editable clearance-rule controls per safety zone after active validation/editor PRs settle. | `safety-zones.ts`, `Layout3DEditor.tsx` Safety rail | Medium: `Layout3DEditor.tsx` is active in other CAD PRs, so this run kept edits Safety-panel scoped. |

Existing capability found: the CAD workbench already had a Safety rail, zone assets, object tags, layer assignments, validation highlights, `evaluateSafetyZones`, and the shared `buildCadValidationReport` modal.

What this run reused: editable `zone` and `agvpath` assets, Safety/Aisles layers, object tags, validation highlights, the existing design-check modal, and the object properties safety classification helper.

What this run extended: `CadSafetyZoneKind` now covers ESD zones, forklift paths, and emergency exits. Aisles and paths now report blocker-style obstructions through the existing safety issue list, while ESD zones warn when overlapping objects lack ESD classification.

What this run wired into `Layout3DEditor`: the existing Safety rail now creates ESD zones, forklift safety paths, and emergency exit paths. Current assets tagged as aisles, no-go, restricted, ESD, forklift, or emergency paths are converted into safety zones for the shared validation report.

What this run intentionally did not duplicate: no new editor, no new validation modal, no new path renderer, no new symbol library, no new layer model, and no new persistence path.

Why this is non-redundant: it turns the existing Safety layer from generic no-go rectangles into a more industrial validation workflow for plant layouts, using the workbench objects users can already edit and export.

This audit tracks the non-redundancy check for the CAD tree sprint. It is scoped to the current mainline CAD implementation and open PR risk observed during this run.

| Capability | Exists? | Files | Maturity | Gap | Next non-redundant PR | Owner files | Collision risk with open PRs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Unified CAD workbench | Yes | `apps/web/src/components/line-engineering/Layout3DEditor.tsx`, `docs/cad-industrial-workbench.md` | strong | Still a large single file; fullscreen shell extraction remains pending. | Extract workbench chrome only after PR 746 lands. | `Layout3DEditor.tsx`, future `cad-workbench/*` | High: PR 746 edits `Layout3DEditor.tsx`. |
| Command dock and registry | Yes | `apps/web/src/lib/cad/commands/*`, `Layout3DEditor.tsx`, `docs/cad-copilot-command-contract.md` | usable | Commands mostly mutate existing objects; few compound industrial workflows. | Add compound commands that reuse `move`/`connect`/`report` operations. | `apps/web/src/lib/cad/commands/*` | Low: no open CAD command PR found. |
| Flow health | Yes | `apps/web/src/lib/cad/flow-optimization.ts`, `Layout3DEditor.tsx` | strong | Flow Health now has deterministic reorder previews and a reversible apply action; richer walking-path/from-to analytics remain pending. | Add from-to table or operator walking-path overlay. | `flow-optimization.ts`, Flow Health modal in `Layout3DEditor.tsx` | Medium: open CAD PRs also touch `Layout3DEditor.tsx`; keep changes modal-scoped. |
| Flow health | Yes | `apps/web/src/lib/cad/flow-optimization.ts`, `Layout3DEditor.tsx` | usable | Flow suggestions are not yet one-click compound workflows. | Preview-first flow-line command and later richer flow panel actions. | `flow-optimization.ts`, `commands/registry.ts` | Low unless touching viewport UI. |
| Line balance / capacity | Partial | `apps/web/src/lib/cad/line-balance.ts`, `apps/web/src/lib/cad/commands/*`, `Layout3DEditor.tsx` command dock | partial | Report-only command exists; visual Yamazumi/load overlay still needs editor UI after active editor PRs settle. | Wire balance loads into the analysis panel overlay once `Layout3DEditor.tsx` churn is lower. | `line-balance.ts`, `commands/registry.ts`, future analysis panel UI | Low this run: no open command PR; high if editing editor overlay. |
| Layers and locks | Yes | `apps/web/src/lib/cad/layers.ts`, `Layout3DEditor.tsx` | usable | Local only until backend persistence contract is wired. | Persist layer assignments after contract review. | `layers.ts`, layout API types | Medium: avoid if another layer PR opens. |
| Layers and locks | Yes | `apps/web/src/lib/cad/layers.ts`, `Layout3DEditor.tsx` | strong | Viewport visibility now respects CAD layer assignments; local only until backend persistence contract is wired. | Persist layer assignments after contract review and add layer search/filter. | `layers.ts`, layout API types | Medium: open CAD PRs touch `Layout3DEditor.tsx`; helper ownership is low-risk. |
| Object properties inspector | Yes | `apps/web/src/components/line-engineering/Layout3DEditor.tsx`, `apps/web/src/lib/cad/object-properties.ts` | usable | Rich metadata is local-only until object metadata persistence is approved. | Persist notes/tags/source metadata through the layout API contract. | `object-properties.ts`, editor properties panel | Medium: open CAD PRs also touch `Layout3DEditor.tsx`; keep changes panel-scoped. |
| Industrial symbols | Yes | `apps/web/src/lib/cad/symbols.ts`, `Layout3DEditor.tsx` | strong | Manufacturing blocks cover SMT, inspection, test, post-SMT, quality gates, and calibration; native block instances still await the persistence decision. | Add native block-instance model after symbol persistence decision. | `symbols.ts`, future block helpers | Low this run: open editor PRs touch `Layout3DEditor.tsx`, so this PR edits symbol data/specs only. |
| Industrial symbols | Yes | `apps/web/src/lib/cad/symbols.ts`, `Layout3DEditor.tsx` | usable | Inserted symbols are mapped to current asset archetypes, not native block instances. | Add native block-instance model after symbol persistence decision. | `symbols.ts`, future block helpers | Medium if touching symbol palette UI. |
| Shared industrial asset catalog | Yes | `apps/web/src/components/line-engineering/asset-catalog.ts`, `Layout3DEditor.tsx` | usable | Catalog now covers core equipment, logistics, Safety/EHS, and utilities, but inserted items still rely on active layer assignment rather than per-asset default layers. | Add native block-instance metadata/default layer hints after active symbol/template PRs land. | `asset-catalog.ts`, editor equipment rail | Low: this run avoids active `symbols.ts`, `templates.ts`, DXF, layers, commands, validation, flow, measurements, and editor edits. |
| DXF import/export | Yes | `apps/web/src/lib/cad/dxf-import.ts`, `dxf-export.ts`, `layout-export-adapter.ts`, `dxf-export-readiness.ts`, `Layout3DEditor.tsx` | strong | Export now has preflight/layer package readiness; editable import still needs layer-selective review. | Layer-selective DXF import review. | `dxf-*`, `Layout3DEditor.tsx` | Medium: this PR owns DXF export readiness only. |
| Plot / sheet package | Yes | `apps/web/src/components/line-engineering/plot-sheet.ts`, `apps/web/src/components/line-engineering/Layout3DEditor.tsx` | usable | PDF sheet export existed, but the title block only carried basic counts and no CAD readiness/package metadata. | Add vector paper-space drawing and title-block revision metadata after viewport PRs land. | `plot-sheet.ts`, `Layout3DEditor.tsx` export path | Medium: small export-only editor touch while PRs #839 and #746 also edit the editor. |
| DXF import/export | Yes | `apps/web/src/lib/cad/dxf-import.ts`, `dxf-export.ts`, `layout-export-adapter.ts`, `Layout3DEditor.tsx` | strong | Editable import is still limited to supported primitives and conversion caps; export labels now travel with footprint geometry. | Layer-selective DXF import review and export preflight warnings. | `dxf-*`, `Layout3DEditor.tsx` | Low this run: no open DXF PR found. |
| Validation center | Partial | `apps/web/src/lib/cad/validation-report.ts`, `collisions.ts`, `safety-zones.ts`, `Layout3DEditor.tsx` | usable | Needs richer issue actions and ignored/local issue state. | Build validation side panel after viewport PRs settle. | `validation-report.ts`, editor UI | Medium due Layout editor churn. |
| Measurements and annotations | Yes | `apps/web/src/lib/cad/measurements.ts`, `annotations.ts`, `Layout3DEditor.tsx` | strong | Edge-to-edge clearance dimensions are now available; dimension styles and release rules remain basic. | Add dimension style helper and UI controls. | `measurements.ts`, `annotations.ts`, measurement panel in `Layout3DEditor.tsx` | Medium: active CAD PRs also touch `Layout3DEditor.tsx`; keep changes measurement-panel scoped. |
| Command palette and shortcuts | Yes | `command-palette.ts`, `keyboard-shortcuts.ts`, `toolbar.ts`, `Layout3DEditor.tsx` | strong | Enter/confirm history reconciliation and clipboard paste remain pending. | Add Enter confirmation and clipboard workflows after editor conflicts settle. | `keyboard-shortcuts.ts`, `toolbar.ts`, `Layout3DEditor.tsx` | Medium: touches editor keyboard handler, but avoids viewport/minimap code. |
| CAD layout templates | Yes | `apps/web/src/lib/cad/templates.ts`, `Layout3DEditor.tsx` | usable | Templates are local editable starters; no backend template library yet. | Add more domain templates after generator UX settles. | `templates.ts`, editor equipment rail | Medium: small editor insertion, avoid broader shell edits. |
| Warehouse rack generator | Yes | `apps/web/src/lib/cad/warehouse-generators.ts`, `Layout3DEditor.tsx` | usable | Generates rack rows only; supermarket and dock generators remain pending. | Add supermarket lane generator using the same generated asset/annotation contract. | `warehouse-generators.ts`, editor equipment rail | Low: current open CAD PR touches line-balance command files, not generator UI. |
| CAD layout templates | Yes | `apps/web/src/lib/cad/templates.ts`, `Layout3DEditor.tsx` | usable | Templates are local editable starters; no backend template library yet. | Add parametric rack/line generators after current template UX settles. | `templates.ts`, editor equipment rail | Medium: small editor insertion, avoid broader shell edits. |
| Supermarket/kitting template | Yes | `apps/web/src/lib/cad/templates.ts`, `templates.spec.ts`, `Layout3DEditor.tsx` | usable | Template is editable and visible, but not yet parameterized by lane/cart counts. | Add a parametric supermarket generator once generator PR conflicts settle. | `templates.ts`, future generator helper | Low: current run avoids `Layout3DEditor.tsx`, command registry, and warehouse generator PR files. |
| Command palette and shortcuts | Yes | `command-palette.ts`, `keyboard-shortcuts.ts`, `Layout3DEditor.tsx` | usable | More command examples and compound workflows needed. | Add workflow commands before new UI. | `commands/*`, `command-palette.ts` | Low. |
| Local snapshots | Yes | `snapshots.ts`, `Layout3DEditor.tsx` | usable | Session-local; backend version workflow separate. | Snapshot before more high-risk conversions. | `snapshots.ts`, editor versions modal | Medium if touching versions UI. |

## Existing implementation inspected

- `AGENTS.md`
- `README.md`
- `AXOS_OS_ARCHITECTURE.md`
- `docs/cad-copilot-command-contract.md`
- `docs/codex-night-log.md`
- `docs/cad-tool-summary.md`
- `docs/cad-industrial-workbench.md`
- `docs/cad-roadmap-fase-66-69.md`
- `docs/cad-contracts-catalog.md`
- `docs/design/AXOS_DESIGN_LANGUAGE.md`
- `docs/design/AXOS_SHELL_TAXONOMY.md`
- `apps/web/src/lib/routeChrome.ts`
- `apps/web/src/components/line-engineering/Layout3DEditor.tsx`
- `apps/web/src/lib/cad/**`
- `apps/web/src/lib/cad/commands/**`

## Current run decision

Open CAD PRs #864, #861, #858, #853, #850, #847, #844, and #838 touch `Layout3DEditor.tsx`, DXF preflight, validation, dimensions, flow, templates, warehouse generators, and command registry files. This run avoided those active ownership areas and extended the existing data-driven symbol path in `apps/web/src/lib/cad/symbols.ts`. `Layout3DEditor.tsx` already imports `CAD_SYMBOL_LIBRARY`, renders it in the symbol rail, filters/searches it, inserts selected symbols as editable assets, assigns their CAD layer, selects the object, and sends the resulting footprint through the existing DXF export path, so no new editor, block system, or export workflow was created.

Open CAD PRs include #799 (`codex/night-cad-rack-row-command`) and #796 (`codex/night-cad-validation-center`), plus draft #746 with viewport/minimap/editor-shell work. This run avoided command-registry expansion, DXF conversion, layers, validation-center internals, viewport/minimap helpers, and shell extraction. The selected improvement extends the existing shortcut and toolbar path: `Layout3DEditor.tsx` already imports `matchCadShortcut`, renders toolbar actions, and routes palette tool entries through `runToolbarAction`, so this PR makes those existing actions keyboard-usable instead of adding another editor or action dispatcher.
Open CAD PRs currently touch shortcuts, layers, validation clearances, and rack-row commands. This run avoided those primary concerns and reused the existing `exportCadLayoutDxf` adapter plus the existing DXF export modal. The selected improvement adds a DXF export readiness helper and wires it into `Layout3DEditor.tsx` so users see entity counts, included layers, hidden-layer exclusions, validation/DXF warnings, and true blockers before downloading.
Open CAD PRs #805, #804, #801, and #796 all edit `Layout3DEditor.tsx`, so this run avoided viewport, shortcut, layer-manager, and validation-center surfaces. The selected improvement extends the existing right properties panel with a pure object-properties helper, local notes, object source/safety metadata, and multi-selection summaries. It reuses existing selection snapshots, CAD layers, tags, DXF import tags, and lock state instead of creating a parallel inspector or object model.
Open CAD PRs touch `Layout3DEditor.tsx`, command registry, layers, shortcuts, toolbar, templates, object properties, and validation report. This run avoided those files and selected DXF export hardening because the existing `Layout3DEditor.tsx` export modal already calls `exportCadLayoutDxf`. The adapter now reuses the existing primitive `text` field so exported station/equipment/safety footprints carry readable DXF labels, and it passes deterministic layer color definitions to the existing exporter.
PR 746 edits `Layout3DEditor.tsx`, `PlantMinimap.tsx`, `ScaleBar.tsx`, and new CAD scale/minimap helpers. This run avoided viewport and editor shell work. The selected improvement extends the existing command registry with a compound flow-line command that is already reachable through the CAD command dock and palette because `Layout3DEditor.tsx` consumes registry commands through `parseCadCommand`, `previewCadCommand`, and `executeCadCommand`.
PR 746 still touches `Layout3DEditor.tsx`, so this run avoided the editor viewport and analysis panel. The selected improvement adds `analyze_line_balance` to the existing command registry. It is reachable through the current command dock/palette path and reuses report operations instead of adding a second analysis UI. Cycle times come from explicit command metadata or station labels such as `CT=42s`, with honest warnings when takt or cycle-time data is missing.
Open CAD PRs #839, #838, and #746 touch the rack generator, command registry, and viewport/editor shell areas. This run avoided generator, command, minimap, scale-bar, validation-center, layer, and DXF internals. The selected improvement extends the existing plot/PDF export path: `Layout3DEditor.tsx` already calls `plotSheetModel`, so the PR adds CAD package metadata to that title block instead of creating a new exporter or parallel sheet workflow.
Open CAD PRs #847, #844, #839, and #838 touch `Layout3DEditor.tsx`, warehouse generator files, plot package files, and command registry files. This run avoided those primary areas and extended the existing template system in `apps/web/src/lib/cad/templates.ts`, which `Layout3DEditor.tsx` already renders through `CAD_LAYOUT_TEMPLATES`. The selected improvement adds a visible supermarket/kitting template without creating a second generator, command path, editor, layer model, flow model, or DXF export path.

Open CAD PRs #850, #847, #844, #839, and #838 touch flow health, plot metadata, warehouse/rack generators, command registry, docs, and small slices of `Layout3DEditor.tsx`. This run avoided those lib ownership areas and selected the existing measurement workflow: `measurements.ts` already powered center-to-center permanent dimensions, annotations, the right inspector list, undo history, and DXF export. The PR extends the same helper/UI path with edge-horizontal and edge-vertical clearance dimensions instead of adding a second dimension system.
Open CAD PRs #864, #861, #858, #853, #850, #847, #844, and #838 touch DXF preflight, validation quick fixes, dimensions, templates, flow, plot metadata, warehouse generators, and command registry. This run avoided those helpers and reused the existing CAD layer model. The selected improvement makes current CAD layer visibility object-level in the viewport, adds tested isolate/show-all/summary helpers, and wires the existing layer panel/status bar so users can recover from isolated layers and see hidden/locked object counts.

## Validation center update

The next non-redundant CAD gap selected for PR #796 is visible clearance validation. The clearance helper already existed in `apps/web/src/lib/cad/collisions.ts` and was aggregated by `apps/web/src/lib/cad/validation-report.ts`, but the design-check modal only surfaced collisions and safety-zone issues. The PR wires that existing report into `Layout3DEditor.tsx` so release readiness, highlights, and modal rows share one validation source.
Open CAD PRs touched validation, layers, shortcuts, and command-registry workflows, so this run avoided those primary areas. The selected improvement adds pure CAD layout templates in `apps/web/src/lib/cad/templates.ts` and wires them into the existing equipment rail in `Layout3DEditor.tsx`. The templates instantiate current editable assets, connectors, annotations, layer assignments, tags, local snapshots, and Flow Health state instead of introducing a parallel editor or persistence model.

Open CAD PRs #844 and #839 touch warehouse/rack generators plus `Layout3DEditor.tsx`, and #838 owns command-registry line-balance work. This run avoided generators, command expansion, layers, DXF, validation internals, and shell extraction. The selected improvement extends the existing `flow-optimization.ts` scoring helper with a reorder preview and wires the existing Flow Health modal to show before/after deltas plus a layer-lock-aware apply action. No parallel flow model, editor, command system, or backend path was added.
Open CAD PR #838 touches `apps/web/src/lib/cad/commands/*`, `line-balance.ts`, and command-contract docs, so this run avoided the command registry. The selected improvement adds a visible rack row generator in the existing `Layout3DEditor` equipment rail and reuses the existing editable asset, annotation, CAD layer, tag, snapshot, selection, validation, and DXF export paths. It complements the existing `arrange_rack_rows` command, which rearranges selected racks, by creating new rack rows from user parameters.
## 2026-06-29 validation quick fixes update

Open CAD PRs #853, #850, #847, #844, #839, and #838 touch templates, flow, plot/DXF package metadata, warehouse/rack generators, and command registry work. This run avoided those primary ownership areas and extended the existing validation path instead.

Inspected files included `Layout3DEditor.tsx`, `validation-report.ts`, `collisions.ts`, `safety-zones.ts`, `flow-optimization.ts`, `commands/*`, DXF helpers, layer/object-property helpers, templates, symbols, keyboard/toolbar helpers, route chrome, CAD docs, and design docs.

Existing capability found: `buildCadValidationReport` already aggregates collisions, clearance issues, safety-zone issues, and flow score, and `Layout3DEditor.tsx` already opens a visible design-check modal from that report.

What was reused: existing collision/clearance/safety/flow helpers, existing validation state, existing selection/rebuild/toast paths, and the existing Flow Health modal handoff.

What was extended: `CadValidationReport` now includes normalized issue rows with severity, affected object ids, action labels, and suggested fixes. The validation modal now shows those quick-fix rows without adding a new validation engine.

What was intentionally not duplicated: no new CAD editor, validation center, collision helper, safety helper, flow model, command registry branch, DXF workflow, or layer model.
## DXF critical label preflight update

Open CAD PRs #858, #853, #850, #847, #844, #839, and #838 already touch dimensions, templates/generators, flow, plot metadata, `Layout3DEditor.tsx`, and command registry areas. This run avoided creating another exporter, validation surface, or layout model. It extends the existing `dxf-export-readiness.ts` helper and passes label metadata from the existing `Layout3DEditor.tsx` export summary so the current DXF modal warns when included industrial footprints need visible labels before release.

The capability reused:

- `apps/web/src/lib/cad/dxf-export-readiness.ts`
- `apps/web/src/components/line-engineering/Layout3DEditor.tsx`
- `apps/web/src/lib/cad/layout-export-adapter.ts`
- `apps/web/src/lib/cad/dxf-export.ts`
- `apps/web/src/lib/cad/layers.ts`

The non-redundant gap closed is export readiness for unlabeled critical footprints. The next DXF PR should focus on layer-selective editable import review or selected-layer export after active editor PRs settle.
## Command line assist update

Open CAD PRs currently touch safety paths, layer isolation, symbols, DXF label preflight, validation quick fixes, edge-clearance dimensions, templates, flow health, plot metadata, warehouse generators, and line-balance command registry files. This run avoided those primary files except for a small localized `Layout3DEditor.tsx` dock insertion.

The selected gap was command-line discoverability. The command registry, parser, command palette, and command dock already existed, but the visible Copiloto CAD dock still exposed only three fixed chips. `apps/web/src/lib/cad/command-line-assist.ts` now ranks existing registry examples by current text query and selection count, and `Layout3DEditor.tsx` wires those suggestions into the existing preview-first command flow. It does not add command ids, duplicate the parser, duplicate the palette, or create another action dispatcher.
## 2026-06-29 - EHS and utilities asset catalog update

Open CAD PRs at run start included #870 (layer visibility), #869 (manufacturing symbols), #864 (DXF critical label preflight), #861 (validation quick fixes), #858 (edge clearance dimensions), #853 (supermarket kitting template), #850 (flow health reorder preview), #847 (plot package metadata), #844 (warehouse generator), #838 (line-balance command), and draft #746 (viewport/minimap/editor shell). This run avoided `Layout3DEditor.tsx`, `apps/web/src/lib/cad/symbols.ts`, `apps/web/src/lib/cad/templates.ts`, DXF helpers, layers, commands, validation, flow, and measurements.

The selected non-redundant improvement extends the existing shared `asset-catalog.ts` used by `Layout3DEditor.tsx` and the 2D layout editor. New Safety/EHS and Utilities groups add editable fire extinguisher, eyewash, emergency exit path, first-aid, spill kit, PPE station, power panel, compressed-air drop, network drop, maintenance area, tool crib, and calibration station blocks. These reuse the existing mesh archetypes (`cabinet`, `path`, `bin`, `column`, `zone`, `shelf`, `desk`) and are visible through the current Equipment rail because it already renders `ASSET_CATEGORIES`.
