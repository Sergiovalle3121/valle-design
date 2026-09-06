# Valle Design CAD Architecture Layer

Last updated: 2026-06-30

## Scope

This document tracks the first dedicated Valle Design CAD architecture layer: architectural and industrial plant layouts are one drawing domain among the many the general-purpose CAD now serves (see `IDENTITY.md` for current product scope — a general 2D CAD that competes with AutoCAD, not an industry-specific tool). The goal is not to clone AutoCAD. The goal is to make the existing Valle Design CAD workbench useful for plant shells, rooms, doors, columns, technical area takeoff, and utility planning.

## Existing CAD implementation inspected

- `apps/web/src/components/cad/editor/Layout3DEditor.tsx`
- `apps/web/src/components/cad/viewport/asset-catalog.ts`
- `apps/web/src/lib/cad/layers.ts`
- `apps/web/src/lib/cad/object-properties.ts`
- `apps/web/src/lib/cad/layout-export-adapter.ts`
- `apps/web/src/lib/cad/templates.ts`
- `apps/web/src/lib/cad/commands/**`
- `docs/cad/VALLE_CAD_CAPABILITY_AUDIT.md` (retirado; el estado de capacidades
  lo computa hoy `scripts/cad/rubric.mjs` y su matriz regenerada)
- `docs/cad/VALLE_CAD_TREE_STATUS.md` (retirado por la misma razón)
- `docs/design/VALLE_DESIGN_LANGUAGE.md` (hoy `docs/design/DESIGN_SYSTEM.md` y
  `docs/design/BRAND.md`)

## What already existed

Valle Design CAD already had one editor, one asset catalog, one layer model, one object inspector, one takeoff modal, one DXF export path, one command registry, and one validation path. The editor already supported a wall drawing tool and wall mesh rendering, but doors and rooms were not exposed as first-class editable architecture primitives and the takeoff logic was still mostly equipment-oriented.

## Architecture primitives

The architecture layer now uses the existing editable asset model:

| Primitive   | Editable object kind | Default layer  | Notes                                                                                        |
| ----------- | -------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| Wall        | `wall`               | `architecture` | Can be traced with the existing `W` wall tool or converted from DXF walls.                   |
| Column      | `column`             | `structure`    | Uses the existing column renderer and inspector metadata.                                    |
| Door        | `door`               | `architecture` | New shared catalog item with a native door/opening archetype and swing arc hint.             |
| Room / area | `room`               | `architecture` | New shared catalog item using the existing editable zone renderer.                           |
| Utilities   | utility asset kinds  | `utilities`    | Power, air, network, maintenance, tool crib, calibration, and eyewash classify as Utilities. |

No new editor, canvas, renderer, layer manager, persistence table, or command engine was created.

## Metadata model

Room classification is local and tag-driven for now:

- `room`
- `use:smt`
- `use:assembly`
- `use:test`
- `use:quality`
- `use:warehouse`
- `use:packing`
- `use:shipping`
- `use:ehs`
- `use:utility`
- `dept:qa`, `dept:warehouse`, etc.

This keeps the current layout API untouched while giving the inspector and takeoff panel enough technical metadata to be useful.

## User-visible wiring

The existing Equipment rail now includes an Architecture card:

- trace wall
- add column
- add door
- add room / area

The existing inspector now shows Engineering CAD fields for supported architecture objects:

- wall length and thickness
- door opening width
- column footprint size
- room area, use, and department
- utility type and footprint

The existing takeoff panel now separates:

- plant area
- occupied area
- open floor area
- room area
- aisle area
- safety/no-go area
- utility area
- wall length
- doors and columns
- area by CAD layer
- area by room use
- area by department

## Engineering validation

The shared CAD validation report now includes architecture-specific issue rows:

- rooms missing a visible label
- rooms missing a `use:*` classification
- rooms below the planning area threshold
- blocked door openings
- walls crossing stations/equipment
- equipment outside any room/department zone when rooms exist
- explicit equipment utility requirements missing a matching utility point
- missing critical saved dimensions for rooms, walls, or doors

These checks reuse `buildCadValidationReport` and the existing design-check modal in `Layout3DEditor`; no parallel validation center was created.

## Export behavior

DXF export continues through `exportCadLayoutDxf`. New Architecture, Structure, and Utilities layer colors were added to the existing DXF layer table. Architecture footprints are treated as critical labeled objects in export preflight so missing labels are visible before release.

## Current limitations

- Room boundaries are rectangular editable zones, not polygonal room envelopes yet.
- Door-wall association is not enforced yet.
- Room/use metadata is local tag metadata and is not persisted through a dedicated backend schema.
- Utilities do not yet carry typed voltage, pressure, network, or owner fields beyond labels/tags/notes.
- Architecture validation is bounding-box based and does not account for rotation or wall-hosted door semantics yet.

## Next CAD phase

The next non-redundant phase should add release-package/title-block readiness: drawing sheet fields, layer legend completeness, revision/approval metadata, and export package summary attached to the current validation/takeoff surfaces.

## CAD Phase 1 drafting extension — 2026-07-07

The first Phase 1 implementation extends the existing command registry and the
existing `Layout3DEditor` command dock. It does **not** add a second CAD editor,
canvas, renderer, command engine, persistence table, or geometry store.

What changed:

- The precision input parser was promoted to the shared CAD library so both the
  editor and deterministic command registry use the same coordinate math.
- The existing command registry now supports coordinate-driven drafting commands:
  - `draw_wall_segment`: `muro 0,0 @5000,0`, `wall 1000,1000 @3000<90 thickness 120`
  - `draw_rect_zone`: `rect 0,0 @4000,2500`, `room 1000,1000 @5000,3000 etiqueta QA`
- These commands emit the same `create` operation used by existing pattern,
  offset, chamfer, and zone commands, so created geometry persists as normal
  layout assets through the canonical document save
  (`designClient.documents.saveContent`/`saveArchive`, see
  `apps/web/src/components/cad/document-lifecycle/design-port.ts`); the legacy
  `/line-engineering/layout` route only survives inside the compatibility
  adapter (`apps/web/src/lib/cad/legacy/layout-http-adapter.ts`) and is
  forbidden elsewhere by `scripts/cad/check-no-line-engineering.mjs`.

Non-redundancy guardrails:

- The precision module lives once, at `apps/web/src/lib/cad/precision-input.ts`.
  The compatibility re-export that used to sit under `components/` was deleted
  when the folder was renamed (identity campaign, 2026-08-22).
- Coordinate drafting reuses `parseCadCommand`, `previewCadCommand`, and
  `executeCadCommand`; no alternate command runner was introduced.
  (`applyCommandOperation` was removed as dead code in the 2026-09-06 monolith
  cleanup — see `docs/execution/frentes/F1-monolito.md`.)
- Walls continue to be normal `wall` assets on the architecture layer; rooms and
  zones continue through the existing editable asset model.

## CAD Phase 1 interactive drafting cascade — 2026-07-07

The second Phase 1 slice wires the pre-existing pure CAD command reducer
(`apps/web/src/lib/cad/cad-command.ts`) into the existing
`Layout3DEditor` workbench. This is a UI wiring pass over the current editor,
not a new drafting subsystem.

User-visible additions:

- Toolbar drafting actions: `Line`, `Pline`, and `Rect`.
- Shortcuts: `L` starts line drafting, `P` starts polyline drafting, `B` starts
  rectangle drafting, and the existing connector action moves to `Shift+L`.
- The shared precision bar now works for wall tracing and the interactive
  reducer-backed drafting tools: `x,y`, `@dx,dy`, `@dist<angle>`, and empty
  Enter to finish chained commands.
- LINE/PLINE create normal editable `wall` assets on the architecture layer.
- RECT creates a normal editable `zone` asset through the same asset/save path.

Non-redundancy guardrails:

- The existing `cad-command.ts` reducer is now wired into `Layout3DEditor`;
  no duplicate reducer or canvas was introduced.
- Created geometry still uses `assetsRef`, `assignObjectsToLayer`, existing undo
  snapshots, existing dirty/save flow, and the canonical document save
  (`designClient.documents.saveContent`/`saveArchive`, see
  `apps/web/src/components/cad/document-lifecycle/design-port.ts`); the legacy
  `/line-engineering/layout` payload shape only survives inside the
  compatibility adapter (`apps/web/src/lib/cad/legacy/layout-http-adapter.ts`)
  and is forbidden elsewhere by `scripts/cad/check-no-line-engineering.mjs`.
- Existing wall tracing remains available; the new drafting tools are keyboard
  and toolbar access to the same precision model for faster CAD-style work.

## CAD Studio decoupling — 2026-07-15

Valle Design CAD was exposed at the time as a first-class universal design
studio at `/dashboard/cad`, instead of being reachable only from the
line-balancing page. **Update (2026-09-06):** `/dashboard/cad`
(`apps/web/src/app/dashboard/cad`) is today a compatibility redirect to
`/dashboard`; CAD opens per document at `/studio/[documentId]`
(`apps/web/src/app/studio/[documentId]`).
The implementation still reuses the existing `Layout3DEditor`, command engine,
layer model, DXF import/export, validation, takeoff, templates, symbols, and
snapshot/version surfaces; no duplicate CAD canvas or persistence model was
introduced.

User-visible changes:

- `/dashboard/cad` opens `Layout3DEditor` in `standalone` mode with the equipment
  and universal CAD library visible first, not the station-balancing tray.
- **Update (2026-09-06):** no global dashboard catalog or command palette
  entry named **Valle Design CAD Studio** exists today
  (`grep -rn "CAD Studio" apps/web/src` finds none). The dashboard
  (`apps/web/src/app/dashboard/page.tsx`) is itself the single project hub for
  architecture, engineering, civil/layout, warehouse, utility, and plant
  design work; see the note below on `/dashboard/cad` and
  `/dashboard/line-engineering`.
- **Update (2026-09-06):** `/dashboard/line-engineering` was retired (identity
  campaign, 2026-08-22 — see `IDENTITY.md`); the directory no longer exists
  (`apps/web/src/app/dashboard/line-engineering`). `/dashboard/cad`
  (`apps/web/src/app/dashboard/cad`) no longer opens the editor directly
  either — it is now a compatibility redirect to `/dashboard`, and CAD opens
  per document at `/studio/[documentId]`
  (`apps/web/src/app/studio/[documentId]`).
- Standalone mode hides line-only arrange/connect shortcuts and uses generic
  labels (`Puntos`, `Biblioteca`) while preserving all advanced CAD capabilities.

Non-redundancy guardrails:

- The route uses a universal CAD workspace key (`AXOS-CAD-STUDIO` /
  `UNIVERSAL`) against the current layout API rather than creating a second
  backend module.
- Existing templates, layers, architecture takeoff, validation report,
  precision-input, OSNAP, plotting, DXF, blocks, snapshots, and Copilot CAD are
  reused directly.

## CAD Studio release-package phase — 2026-07-16

The universal studio now includes a release-package surface directly inside
`Layout3DEditor`. This is the first delivery/readiness layer for real drawing
packages, not a separate document manager.

User-visible additions:

- A **package** action in the CAD toolbar opens a premium delivery panel with
  title-block fields: project, drawing number, discipline, sheet, revision,
  scale, prepared/checked/approved by, and release notes.
- The panel computes an issue-driven readiness percentage from existing editor
  state: title-block completeness, visible layers, editable geometry,
  annotations/dimensions, CAD validation severity, approval state, and DXF
  readiness.
- The panel exposes a copyable JSON manifest with footprint, object counts,
  connector counts, layer counts, validation summary, DXF summary, revision
  fields, and notes so a tenant can attach the manifest to external document
  control or an engineering release workflow.
- From the same panel users can jump to PDF export or DXF preparation, keeping
  plotting/export connected to validation and release metadata.

The same phase also adds broader universal starter templates for non-EMS work:

- `structural-grid-core`: column grid, datum axes, stairs, structural core,
  expansion joint, and seismic/clearance metadata.
- `mep-plantroom`: MEP shell, electrical/mechanical/pump rooms, transformer,
  AHU, compressor, pump skid, service aisle, maintenance envelope, and egress
  door.

Non-redundancy guardrails:

- Release readiness is local/editor-derived and reuses current layout state,
  approvals, validation, DXF readiness, annotations, layers, and export actions.
- No new CAD backend, persistence table, canvas, drawing package module, or
  duplicate validation engine was introduced.
