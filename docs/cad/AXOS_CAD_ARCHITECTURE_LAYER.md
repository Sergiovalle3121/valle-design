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
- `docs/codex-night-log.md`
- `docs/design/AXOS_DESIGN_LANGUAGE.md`

## What already existed

AXOS CAD already had one editor, one asset catalog, one layer model, one object inspector, one takeoff modal, one DXF export path, one command registry, and one validation path. The editor already supported a wall drawing tool and wall mesh rendering, but doors and rooms were not exposed as first-class editable architecture primitives and the takeoff logic was still mostly equipment-oriented.

## Architecture primitives

The architecture layer now uses the existing editable asset model:

| Primitive | Editable object kind | Default layer | Notes |
| --- | --- | --- | --- |
| Wall | `wall` | `architecture` | Can be traced with the existing `W` wall tool or converted from DXF walls. |
| Column | `column` | `structure` | Uses the existing column renderer and inspector metadata. |
| Door | `door` | `architecture` | New shared catalog item with a native door/opening archetype and swing arc hint. |
| Room / area | `room` | `architecture` | New shared catalog item using the existing editable zone renderer. |
| Utilities | utility asset kinds | `utilities` | Power, air, network, maintenance, tool crib, calibration, and eyewash classify as Utilities. |

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
- `use:office`
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

## Export behavior

DXF export continues through `exportCadLayoutDxf`. New Architecture, Structure, and Utilities layer colors were added to the existing DXF layer table. Architecture footprints are treated as critical labeled objects in export preflight so missing labels are visible before release.

## Current limitations

- Room boundaries are rectangular editable zones, not polygonal room envelopes yet.
- Door-wall association is not enforced yet.
- Room/use metadata is local tag metadata and is not persisted through a dedicated backend schema.
- Utilities do not yet carry typed voltage, pressure, network, or owner fields beyond labels/tags/notes.
- Architecture validation rules such as walls crossing equipment and doors blocked remain future work.

## Next CAD phase

The next non-redundant phase should add engineering validation rules for the architecture layer: unlabeled rooms, doors blocked, walls crossing equipment, utilities missing for equipment, and title-block completeness. This should extend `validation-report.ts` rather than creating a parallel validation engine.
