# AXOS CAD Tree Status

Last updated: 2026-06-29

## Current tree state

AXOS CAD is beyond seed state. The active workbench already includes a unified 2D/3D editor, local command dock, command palette, layers, lock enforcement, measurements, symbols, DXF import/export, validation, safety checks, flow scoring, local snapshots, and a release-readiness surface.

## This run

This run adds a compound command-engine workflow:

- `arrange_flow_line` arranges selected or sequenced objects into a flow line.
- The command creates previewable `move` operations for every object.
- It creates previewable `connect` operations between sequence steps.
- It emits a `report` operation with direction, spacing, score before, score after, and resulting distance.
- It warns when the proposed line is clipped by the footprint.

The workflow is visible through the existing CAD command dock because the editor already previews and applies command registry operations. It does not introduce a parallel editor, duplicate flow scoring, duplicate connector logic, or a new UI surface.

## Phase evidence

| Backlog phase | Status | Evidence | Next step |
| --- | --- | --- | --- |
| Phase 0 - Audit plus visible fix | Complete for this run | `AXOS_CAD_CAPABILITY_AUDIT.md` plus a reachable command workflow | Keep audit current as PRs land. |
| Phase 17 - Flow Health | Advanced | `flow-optimization.ts`, Flow Health UI, and `arrange_flow_line` | Add richer flow recommendations and before/after preview cards. |
| Phase 21 - Shortcuts and command line | Advanced | Command dock, parser, registry, palette, shortcuts | Add more industrial command examples and history reconciliation. |
| Phase 27 - QA harness | In progress | Pure specs under `apps/web/src/lib/cad` | Add specs for each new command/helper. |

## Next CAD PR

Recommended next phase: add an editable connector workflow or validation issue actions after PR 746 lands, so `Layout3DEditor.tsx` conflicts can be resolved against the latest viewport/minimap changes.
