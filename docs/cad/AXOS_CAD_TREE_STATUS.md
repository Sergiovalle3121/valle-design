# AXOS CAD Tree Status

Last updated: 2026-06-29

## Current tree state

AXOS CAD is beyond seed state. The active workbench already includes a unified 2D/3D editor, local command dock, command palette, layers, lock enforcement, measurements, symbols, DXF import/export, validation, safety checks, flow scoring, local snapshots, CAD templates, and a release-readiness surface.

## This run

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

## Phase evidence

| Backlog phase | Status | Evidence | Next step |
| --- | --- | --- | --- |
| Phase 0 - Audit plus visible fix | Complete for this run | `AXOS_CAD_CAPABILITY_AUDIT.md` plus visible keyboard-driven workbench actions | Keep audit current as PRs land. |
| Phase 17 - Flow Health | Advanced | `flow-optimization.ts`, Flow Health UI, and `arrange_flow_line` | Add richer flow recommendations and before/after preview cards. |
| Phase 21 - Shortcuts and command line | Advanced | Command dock, parser, registry, palette, expanded shortcut dispatch | Add Enter/command-history reconciliation after UI conflicts settle. |
| Phase 0 - Audit plus visible fix | Complete for this run | `AXOS_CAD_CAPABILITY_AUDIT.md` plus a visible export modal improvement | Keep audit current as PRs land. |
| Phase 7 - DXF Export Pro Workflow | Advanced | `dxf-export.ts`, `layout-export-adapter.ts`, `dxf-export-readiness.ts`, and the visible DXF export modal | Add optional validation report attachment/package metadata after export contract review. |
| Phase 17 - Flow Health | Advanced | `flow-optimization.ts`, Flow Health UI, and command-registry flow workflows | Add richer flow recommendations and before/after preview cards. |
| Phase 0 - Audit plus visible fix | Complete for this run | `AXOS_CAD_CAPABILITY_AUDIT.md` plus a reachable export workflow | Keep audit current as PRs land. |
| Phase 7 - DXF Export Pro Workflow | Advanced | Export modal, `layout-export-adapter.ts`, `dxf-export.ts`, footprint labels, layer colors | Add export preflight warnings and selected-layer export. |
| Phase 17 - Flow Health | Advanced | `flow-optimization.ts`, Flow Health UI, and command workflows | Add richer flow recommendations and before/after preview cards. |
| Phase 0 - Audit plus visible fix | Complete for this run | `AXOS_CAD_CAPABILITY_AUDIT.md` plus a reachable command workflow | Keep audit current as PRs land. |
| Phase 17 - Flow Health | Advanced | `flow-optimization.ts`, Flow Health UI, `arrange_flow_line`, and template-seeded flow health | Add richer flow recommendations and before/after preview cards. |
| Phase 21 - Shortcuts and command line | Advanced | Command dock, parser, registry, palette, shortcuts | Add more industrial command examples and history reconciliation. |
| Phase 23 - CAD project / layout templates | Usable | `templates.ts` plus the equipment-rail template launcher | Add parametric rack/line generators with user inputs. |
| Phase 27 - QA harness | In progress | Pure specs under `apps/web/src/lib/cad` | Add specs for each new command/helper. |

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
