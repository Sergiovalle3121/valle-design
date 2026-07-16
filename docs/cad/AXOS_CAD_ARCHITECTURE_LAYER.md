# AXOS CAD Architecture Layer

Last updated: 2026-06-30

## Scope

This document tracks the first dedicated AXOS CAD architecture layer for factory and industrial engineering layouts. The goal is not to clone AutoCAD. The goal is to make the existing AXOS CAD workbench useful for plant shells, rooms, doors, columns, technical area takeoff, and utility planning.

## Existing CAD implementation inspected

- `apps/web/src/components/line-engineering/Layout3DEditor.tsx`
- `apps/web/src/components/line-engineering/asset-catalog.ts`
- `apps/web/src/lib/cad/layers.ts`
- `apps/web/src/lib/cad/object-properties.ts`
- `apps/web/src/lib/cad/layout-export-adapter.ts`
- `apps/web/src/lib/cad/templates.ts`
- `apps/web/src/lib/cad/commands/**`
- `docs/cad/AXOS_CAD_CAPABILITY_AUDIT.md`
- `docs/cad/AXOS_CAD_TREE_STATUS.md`
- `docs/cad-copilot-command-contract.md`
- `docs/design/AXOS_DESIGN_LANGUAGE.md`

## What already existed

AXOS CAD already had one editor, one asset catalog, one layer model, one object inspector, one takeoff modal, one DXF export path, one command registry, and one validation path. The editor already supported a wall drawing tool and wall mesh rendering, but doors and rooms were not exposed as first-class editable architecture primitives and the takeoff logic was still mostly equipment-oriented.

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
  layout assets through the existing `/line-engineering/layout` save path.

Non-redundancy guardrails:

- `apps/web/src/components/line-engineering/precision-input.ts` is now a thin
  compatibility re-export to the shared CAD precision module.
- Coordinate drafting reuses `parseCadCommand`, `previewCadCommand`,
  `executeCadCommand`, and `applyCommandOperation`; no alternate command runner
  was introduced.
- Walls continue to be normal `wall` assets on the architecture layer; rooms and
  zones continue through the existing editable asset model.

## CAD Phase 1 interactive drafting cascade — 2026-07-07

The second Phase 1 slice wires the pre-existing pure CAD command reducer
(`apps/web/src/components/line-engineering/cad-command.ts`) into the existing
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
  snapshots, existing dirty/save flow, and the existing `/line-engineering/layout`
  payload.
- Existing wall tracing remains available; the new drafting tools are keyboard
  and toolbar access to the same precision model for faster CAD-style work.

## CAD Studio decoupling — 2026-07-15

AXOS CAD is now exposed as a first-class universal design studio at
`/dashboard/cad`, instead of being reachable only from the line-balancing page.
The implementation still reuses the existing `Layout3DEditor`, command engine,
layer model, DXF import/export, validation, takeoff, templates, symbols, and
snapshot/version surfaces; no duplicate CAD canvas or persistence model was
introduced.

User-visible changes:

- `/dashboard/cad` opens `Layout3DEditor` in `standalone` mode with the equipment
  and universal CAD library visible first, not the station-balancing tray.
- The global dashboard catalog and command palette include **AXOS CAD Studio** as
  its own destination for architecture, engineering, civil/layout, warehouse,
  utility, and plant design work.
- `/dashboard/line-engineering` still keeps CAD available for manufacturing line
  engineering, but its description is narrowed back to routing, takt, and
  balance so CAD is not conceptually trapped in EMS balancing.
- Standalone mode hides line-only arrange/connect shortcuts and uses generic
  labels (`Puntos`, `Biblioteca`) while preserving all advanced CAD capabilities.

Non-redundancy guardrails:

- The route uses a universal CAD workspace key (`AXOS-CAD-STUDIO` /
  `UNIVERSAL`) against the current layout API rather than creating a second
  backend module.
- Existing templates, layers, architecture takeoff, validation report,
  precision-input, OSNAP, plotting, DXF, blocks, snapshots, and Copilot CAD are
  reused directly.
