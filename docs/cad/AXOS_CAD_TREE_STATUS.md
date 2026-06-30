# AXOS CAD Tree Status

Last updated: 2026-06-29

## 2026-06-30 - Viewport saved views and zoom-to-issue

This run advances large-plant viewport work without duplicating the editor or validation center:

- `viewport-bookmarks.ts` provides tested local saved-view helpers for camera snapshots, bookmark cleanup, capped recency, and focus bounds.
- The existing `Layout3DEditor` View popover now lets users save the current 2D/3D camera, restore saved views, delete saved views, and fit the current selection.
- Saved views are local to the browser and keyed by model/revision; no backend contract or migration was added.
- Existing collision, clearance, safety, and validation quick-fix selection now also moves the camera to the affected objects, so large factory issues are easier to find.
- The implementation reuses current selection refs, editable station/equipment geometry, OrbitControls, validation rows, and the existing View popover. It does not create a second viewport system, minimap, validation modal, or CAD editor.

## 2026-06-29 - Safety paths and ESD zones

This run advances Phase 15 (Safety / Aisles / Clearance Engine UI) without adding a parallel engine:

- The existing Safety rail in `Layout3DEditor.tsx` can now create ESD controlled zones, forklift safety paths, and emergency exit paths.
- The shared `evaluateSafetyZones` helper now treats aisles, forklift paths, and emergency exits as keep-clear zones that produce validation blockers when equipment overlaps them.
- ESD zones now surface warning-level issues for overlapping objects that do not carry ESD classification tags.
- Safety-tagged `zone`, `path`, and no-go `fence` assets from templates or manual edits now participate in the existing design-check modal and viewport highlight selection.
- The object inspector classifies emergency / keep-clear routes as aisle-style safety objects.

The implementation reuses the current editable asset model, object tags, layer assignments, validation report, Safety rail, and issue-selection workflow. It does not create another safety engine, renderer, validation center, or persistence path.

## Current tree state

AXOS CAD is beyond seed state. The active workbench already includes a unified 2D/3D editor, local command dock, command palette, layers, lock enforcement, measurements, symbols, DXF import/export, validation, safety checks, flow scoring, local snapshots, CAD templates, and a release-readiness surface.

## 2026-06-29 - Layer visibility hardening

This run upgrades the existing CAD layer workflow:

- `layers.ts` now has tested helpers for isolate-layer visibility, show-all recovery, and layer state summaries.
- `Layout3DEditor.tsx` applies CAD layer visibility per station/asset object in the viewport instead of treating it as export/inspector metadata only.
- The existing CAD layer panel shows visible-layer counts, hidden/locked object totals, an `All` recovery action, and a warning when hidden CAD layers are hiding objects.
- The bottom status bar surfaces hidden/locked layer object counts while preserving the active layer indicator.

The workflow is visible in the existing layer popover and status bar. It reuses current layer assignments, lock enforcement, object ids, station labels, asset groups, and export filtering; it does not introduce a parallel layer manager, editor, or persistence path.

## This run

This run upgrades the existing professional dimensioning workflow:

- `measurements.ts` now supports `edge-horizontal` and `edge-vertical` modes for selected-object clearance dimensions.
- Edge dimensions use the same saved `dim` annotation model as existing measurements, so undo, editable labels, visibility, and DXF export continue through the current path.
- The `Layout3DEditor` two-object dimension panel now exposes `Borde H` and `Borde V` actions alongside direct, horizontal, and vertical center measurements.
- Overlapping objects are labeled as overlap measurements rather than pretending there is usable clearance.

The workflow is visible in the CAD right inspector when exactly two objects are selected. It does not introduce a parallel dimension model, exporter, annotation store, or measurement panel.
This run expands the existing CAD symbol library into a stronger manufacturing block set:

- `symbols.ts` now includes solder paste printer, SPI, pick-and-place, reflow oven, X-ray inspection, ICT, functional test, conformal coating, depaneling, manual assembly, quality gate, label print, and calibration station symbols.
- Each new symbol carries default footprint dimensions, Equipment-layer assignment, manufacturing/search tags, and normalized flow/exception ports.
- The existing `Layout3DEditor.tsx` symbol rail and Cmd-K palette pick these up automatically from `CAD_SYMBOL_LIBRARY`; inserted blocks become editable assets with labels, layer assignment, selection, undo, validation, and DXF export through the current paths.
- No parallel block editor, command registry, DXF exporter, template system, or generator was created.

This run hardens the existing CAD keyboard shortcut path:

- `keyboard-shortcuts.ts` now includes draw/insert/productivity actions for aisle, connector, zone, equipment, text, fit view, grid, object snap, validation, and DXF export.
- `Layout3DEditor.tsx` routes those shortcuts through the existing toolbar, validation, export, grid, and object-snap actions instead of creating a parallel action system.
- The in-editor help overlay lists the newly usable keys so the workflow is discoverable from inside CAD.
- `toolbar.ts` now exposes matching shortcut hints for the command palette/tool index.

The workflow is visible in the CAD workbench immediately: users can press `A`, `L`, `Z`, `I`, `T`, `F`, `G`, `O`, `Shift+V`, and `E` to run existing CAD actions. It does not introduce a parallel editor, duplicate toolbar actions, duplicate validation, or duplicate DXF export logic.
This run hardens the existing DXF export workflow:

- `dxf-export-readiness.ts` evaluates the export package before download.
- The existing DXF export modal now shows a ready/blocked state, entity counts, included layers, hidden-layer exclusions, validation warnings, and active DXF import warnings.
- Selection exports now block only when nothing is selected or no entities match the options.
- Hidden Flow/Measurements/Text visibility is reflected in the modal and in the actual downloaded DXF.

The workflow is visible through the existing `Layout3DEditor.tsx` DXF export action. It does not introduce a second exporter, a parallel editor, or a new DXF model; it reuses `exportCadLayoutDxf` and the current modal.
This run upgrades the existing object properties inspector:

- A pure `object-properties` helper derives object bounds, area, center, source metadata, safety classification, warnings, and multi-selection summaries.
- The right inspector now shows local object notes, DXF/source metadata, safety classification, object center, and lock/visibility warnings.
- Multi-selection now shows group bounds, area, station/equipment split, layer spread, and locked/hidden object counts.
- The helper is covered by a pure smoke spec.

The workflow is visible through the existing `Layout3DEditor` properties panel. It does not introduce a parallel inspector, object model, layer model, or DXF metadata path.
This run hardens the professional DXF export path:

- Layout footprint boxes now export their `text` labels as centered DXF `TEXT` entities.
- The existing `Layout3DEditor.tsx` export modal benefits without a new UI path because it already calls `exportCadLayoutDxf`.
- Exported layer tables now receive deterministic AutoCAD color codes for Layout, Equipment, Flow, Aisles, Measurements, Safety, and Text.
- Entity counts include generated footprint labels, so the existing export toast remains honest.

The workflow does not introduce a parallel exporter, a second export modal, or a new geometry model. It reuses `CadDxfPrimitive.text`, `cadLayoutToDxfExportModel`, and `exportCadDxf`.
This run adds an editable CAD template workflow:

- `templates.ts` defines industrial starter layouts for EMS mini factory, SMT line, warehouse racks, and packing/shipping cell.
- Templates instantiate existing asset kinds, connectors, annotations, CAD layer assignments, and tags.
- The equipment rail now exposes a compact "Plantillas CAD" launcher.
- Applying a template creates a local snapshot before mutation, selects the generated editable objects, and primes Flow Health from generated connectors.
- Oversized templates scale to the current footprint and report a warning instead of overflowing silently.

The workflow is visible in `Layout3DEditor` and reuses the current editable layout model. It does not introduce a parallel editor, duplicate symbol systems, duplicate flow scoring, or a new persistence path.

This run hardens the existing Flow Health workbench:

- `flow-optimization.ts` now returns a deterministic reorder preview with before/after score, distance, crossing, and backtracking deltas.
- The existing `Layout3DEditor` Flow Health modal shows the preview as a compact improvement card.
- Users can apply the suggested physical slot order directly from Flow Health; the action records a local snapshot, uses the existing undo stack, respects locked CAD layers, selects affected stations, and recomputes Flow Health.
- The workflow reuses current station placements, connectors, layers, snapping, snapshots, and rebuild paths.
- It does not add another flow engine, another command registry path, another editor, or backend optimization dependency.
This run adds a command-dock line balance workflow:

- `line-balance.ts` computes takt load, bottleneck, missing cycle-time metadata, over-takt stations, balance efficiency, and a deterministic score.
- `analyze_line_balance` is registered in the existing CAD command registry, parser, palette, and CIDE/OpenAI-compatible schema path.
- The current `Layout3DEditor` command preview already renders `report` operations, so users can type `analiza balanceo de linea takt 45s` and see the balance report without a new editor surface.
- The command is honest about partial data: station labels like `CT=42s` are supported, explicit tool metadata is supported, and missing takt/cycle times produce warnings instead of fabricated capacity data.

The workflow does not introduce a parallel Yamazumi panel, backend endpoint, or fake production routing integration. It reuses the command dock, command palette, selected-object context, and report operation rendering that already exist.
This run hardens the existing CAD plot/export package:

- `plot-sheet.ts` now includes package metadata rows for connectors, dimensions, labels, visible/locked layers, active layer, validation severity, DXF warnings, package target, and approval state.
- `Layout3DEditor.tsx` passes current CAD state into the existing PDF exporter, so the toolbar's print/PDF button produces a richer title block without a new export modal.
- `plot-sheet.spec.ts` covers default package rows, warning metadata, layer summaries, and defensive clamping.

The workflow is visible through the existing PDF export button. It reuses the current plot helper, validation state, layer state, annotations, connectors, approval state, and DXF warning state instead of creating a second plot/export system.
## 2026-06-29 - Supermarket and kitting template

This run extends the existing editable template workflow without touching the editor shell:

- `templates.ts` now includes a "Supermarket + kitting" starter layout with receiving drop, incoming QC, material supermarket, kanban lanes, kitting carts, FIFO WIP, line-side delivery, replenishment rack, visual kanban board, forklift/pedestrian aisles, ESD boundary, quarantine, and operator position.
- The existing `Layout3DEditor` template rail picks it up automatically because it already maps `CAD_LAYOUT_TEMPLATES`.
- Applying it creates editable assets, annotations, layer assignments, object tags, connectors, local snapshot coverage, selection, flow-health priming, and DXF-exportable geometry through the current template path.
- `templates.spec.ts` now covers the new template's kanban/kitting tags, safety/aisle layers, and material/flow connectors.

This does not create a second warehouse generator, block system, editor, layer model, flow model, or DXF path. It keeps the current generator PRs independent while giving users another plant-layout starter they can apply immediately.

## Phase evidence

| Backlog phase | Status | Evidence | Next step |
| --- | --- | --- | --- |
| Phase 0 - Audit plus visible fix | Complete for this run | `AXOS_CAD_CAPABILITY_AUDIT.md` plus visible keyboard-driven workbench actions | Keep audit current as PRs land. |
| Phase 17 - Flow Health | Advanced | `flow-optimization.ts`, Flow Health UI, and `arrange_flow_line` | Add richer flow recommendations and before/after preview cards. |
| Phase 17 - Flow Health | Strong | `flow-optimization.ts`, Flow Health UI, reorder preview card, and reversible apply action | Add from-to table, operator walking path, or recommendation severity filters. |
| Phase 21 - Shortcuts and command line | Advanced | Command dock, parser, registry, palette, expanded shortcut dispatch | Add Enter/command-history reconciliation after UI conflicts settle. |
| Phase 0 - Audit plus visible fix | Complete for this run | `AXOS_CAD_CAPABILITY_AUDIT.md` plus a visible export modal improvement | Keep audit current as PRs land. |
| Phase 7 - DXF Export Pro Workflow | Advanced | `dxf-export.ts`, `layout-export-adapter.ts`, `dxf-export-readiness.ts`, and the visible DXF export modal | Add optional validation report attachment/package metadata after export contract review. |
| Phase 17 - Flow Health | Advanced | `flow-optimization.ts`, Flow Health UI, and command-registry flow workflows | Add richer flow recommendations and before/after preview cards. |
| Phase 0 - Audit plus visible fix | Complete for this run | `AXOS_CAD_CAPABILITY_AUDIT.md` plus a reachable export workflow | Keep audit current as PRs land. |
| Phase 7 - DXF Export Pro Workflow | Advanced | Export modal, `layout-export-adapter.ts`, `dxf-export.ts`, footprint labels, layer colors | Add export preflight warnings and selected-layer export. |
| Phase 17 - Flow Health | Advanced | `flow-optimization.ts`, Flow Health UI, and command workflows | Add richer flow recommendations and before/after preview cards. |
| Phase 0 - Audit plus visible fix | Complete for this run | `AXOS_CAD_CAPABILITY_AUDIT.md` plus a reachable command workflow | Keep audit current as PRs land. |
| Phase 17 - Flow Health | Advanced | `flow-optimization.ts`, Flow Health UI, `arrange_flow_line`, and template-seeded flow health | Add richer flow recommendations and before/after preview cards. |
| Phase 18 - Line balance / capacity overlay | Partial | `line-balance.ts`, `analyze_line_balance`, command-dock report rows | Wire load colors/Yamazumi overlay into the analysis panel after editor conflicts settle. |
| Phase 21 - Shortcuts and command line | Advanced | Command dock, parser, registry, palette, shortcuts | Add more industrial command examples and history reconciliation. |
| Phase 11 - Blocks / industrial symbols pro | Stronger | `symbols.ts`, existing symbol rail, Cmd-K palette, and symbol spec coverage | Add native block instances after the persistence contract is settled. |
| Phase 23 - CAD project / layout templates | Usable | `templates.ts` plus the equipment-rail template launcher | Add parametric rack/line generators with user inputs. |
| Phase 22 - Plot / sheet / title block | Advanced | `plot-sheet.ts`, `plot-sheet.spec.ts`, and the existing `Layout3DEditor.tsx` PDF export button | Add vector paper-space drawing and title-block revision metadata. |
| Phase 4 - Professional dimensioning system | Advanced | `measurements.ts`, saved dimension annotations, DXF export, and `Borde H`/`Borde V` in the right inspector | Add dimension styles and critical-measurement validation rules. |
| Phase 23 - Supermarket/kitting template | Usable | `templates.ts`, `templates.spec.ts`, existing `Layout3DEditor` template rail | Add parametric lane/cart counts after generator conflicts settle. |
| Phase 27 - QA harness | In progress | Pure specs under `apps/web/src/lib/cad` | Add specs for each new command/helper. |
| Phase 8 - Layers Pro / Layer Manager | Advanced | `layers.ts`, object-level viewport layer filtering, `All` recovery, hidden/locked object counts | Persist layer assignments and add layer search/filter. |

## Next CAD PR

Recommended next phase: add validation issue quick actions or editable connector grips after PR 746 lands, so `Layout3DEditor.tsx` conflicts can be resolved against the latest viewport/minimap changes.
Recommended next phase: add a layer-selective DXF import review or a validation-report attachment option for DXF packages, depending on which open CAD PRs land first.
| Phase 0 - Audit plus visible fix | Complete for this run | `AXOS_CAD_CAPABILITY_AUDIT.md` plus reachable inspector improvements | Keep audit current as PRs land. |
| Phase 9 - Object Properties Pro | Advanced | `object-properties.ts`, properties panel metadata, notes, multi-selection summaries | Persist notes/tags/source metadata through the layout API contract. |
| Phase 6 - Editable DXF Import Workflow | Partial | DXF import tags now surface in the inspector as source metadata | Add layer-selective editable DXF import review. |
| Phase 27 - QA harness | In progress | `object-properties.spec.ts` covers metadata and selection summaries | Add specs for each new helper. |

## Next CAD PR

Recommended next phase: persist object notes/tags/source metadata through the layout API after the object metadata contract is reviewed, or move to editable connector actions if `Layout3DEditor.tsx` churn remains high.
Recommended next phase: add DXF export preflight warnings for empty selection, hidden layers, missing footprint labels, and unsupported converted DXF entities once the active editor PRs settle.
Recommended next phase: add an editable connector workflow or validation issue actions after PR 746 lands, so `Layout3DEditor.tsx` conflicts can be resolved against the latest viewport/minimap changes.

## Validation center update

PR #796 advances the existing validation center by making the design-check modal use the shared CAD validation report for collisions, clearances, safety, and flow. User-visible additions are clearance warning rows, selection/highlight on clearance issues, CAD validation severity in the status bar, and release-readiness counts that distinguish blockers from warnings. It does not add a parallel validation engine, collision helper, CAD shell, or flow model.
Recommended next phase: add a parametric rack row or SMT line generator with user inputs, building on `templates.ts` and the existing editable asset/connector model.
Recommended next phase: add vector paper-space drawing from `plot-scale.ts`, or wait for PR #746 to land before adding viewport-aware sheet previews.

## Warehouse generator update

This run adds the first parametric warehouse generator:

- `warehouse-generators.ts` creates editable rack bays, forklift aisle assets, and text labels from rows, bays per row, bay width, rack depth, aisle width, orientation, and prefix.
- `Layout3DEditor.tsx` exposes the generator in the existing equipment rail, creates a local snapshot before mutation, assigns CAD layers/tags, selects generated objects, and refreshes the current 3D/2D viewport.
- Oversized rack layouts are capped/scaled with warnings instead of overflowing silently.

The workflow is visible in CAD and reuses the current editable layout model. It does not duplicate the existing `arrange_rack_rows` command, because that command arranges selected racks while this generator creates new rack rows.

Recommended next phase: add a supermarket lane generator or receiving/shipping dock generator using the same generator output contract.
## 2026-06-29 - Validation quick fixes

This run hardens the visible CAD validation center:

- `validation-report.ts` now emits normalized issue rows for collisions, clearances, safety-zone issues, and poor flow score.
- Each issue row carries severity, affected object ids, a suggested fix, and a user action label.
- The existing `Layout3DEditor` design-check modal now shows the top validation quick fixes inside the CAD validation card.
- Clicking a collision, clearance, or safety quick fix reuses the current select/rebuild path to select the affected objects.
- Clicking a flow quick fix reuses the existing Flow Health modal instead of adding another flow panel.

The workflow is visible through the existing `Shift+V`/design-check validation path. It does not introduce a second validation engine, validation modal, collision helper, safety helper, flow model, or command registry path.

Recommended next phase: add zoom-to-issue or one-click safe remediation after the active editor/generator PRs settle.
## DXF critical label preflight

This run hardens the existing DXF export preflight:

- `dxf-export-readiness.ts` now accepts optional export labels and a `requiresLabel` marker on readiness entities.
- The existing `Layout3DEditor.tsx` DXF summary builder passes station names and asset labels into that helper.
- The current Exportar DXF modal now surfaces a warning when included critical industrial footprints have no visible user label.
- Hidden or unselected critical footprints only warn when the user includes them through export options.
- The readiness spec covers included, hidden, and selection-scoped missing-label cases.

The workflow remains on the existing export path: no second exporter, no new modal, no parallel geometry model, and no backend contract change.

## Next CAD PR

Recommended next phase: layer-selective editable DXF import review, or selected-layer DXF export after the active `Layout3DEditor.tsx` PRs settle.
## Command line assist update

This run makes the existing Copiloto CAD command line easier to use without changing the command registry:

- `command-line-assist.ts` derives ranked suggestions from the existing command registry.
- Suggestions adapt to selected object count and reuse selected object labels for pair commands like measure distance and clearance aisle.
- The existing `Layout3DEditor` command dock now shows ready/pending suggestion rows instead of three static chips.
- Clicking a ready suggestion immediately uses the same preview-first command flow as manual command entry.
- Missing-selection states are explicit, so users see why a command cannot preview yet.

This advances Phase 21 (shortcuts + command line) while avoiding active PR areas for registry semantics, layers, validation, DXF, symbols, templates, flow, and safety.
## 2026-06-29 - EHS and utilities asset blocks

This run extends the existing shared asset catalog instead of creating a third symbol/block system:

- `asset-catalog.ts` now includes Safety/EHS blocks for fire extinguishers, eyewash, emergency exits, first aid, spill kits, and PPE stations.
- `asset-catalog.ts` now includes Utilities blocks for power panels, compressed air, network drops, maintenance areas, tool cribs, and calibration stations.
- `Layout3DEditor.tsx` already renders `ASSET_CATEGORIES` in the Equipment rail, so these blocks are immediately insertable, editable, selectable, duplicateable, measurable, and included in the existing DXF export adapter.
- The blocks reuse existing asset archetypes instead of adding new Three.js rendering paths.
- `asset-catalog.spec.ts` covers uniqueness, grouping, footprints, and archetype reuse.

Phase evidence: Phase 11 (Blocks / industrial symbols) advances from generic core equipment toward a fuller plant-layout library. Next non-redundant step is native block-instance metadata/default layer hints after active `symbols.ts` and template PRs settle.
