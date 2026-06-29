# AXOS CAD Tree Status

Last updated: 2026-06-29

## Current tree state

AXOS CAD is beyond seed state. The active workbench already includes a unified 2D/3D editor, local command dock, command palette, layers, lock enforcement, measurements, symbols, DXF import/export, validation, safety checks, flow scoring, local snapshots, and a release-readiness surface.

## This run

This run hardens the existing CAD keyboard shortcut path:

- `keyboard-shortcuts.ts` now includes draw/insert/productivity actions for aisle, connector, zone, equipment, text, fit view, grid, object snap, validation, and DXF export.
- `Layout3DEditor.tsx` routes those shortcuts through the existing toolbar, validation, export, grid, and object-snap actions instead of creating a parallel action system.
- The in-editor help overlay lists the newly usable keys so the workflow is discoverable from inside CAD.
- `toolbar.ts` now exposes matching shortcut hints for the command palette/tool index.

The workflow is visible in the CAD workbench immediately: users can press `A`, `L`, `Z`, `I`, `T`, `F`, `G`, `O`, `Shift+V`, and `E` to run existing CAD actions. It does not introduce a parallel editor, duplicate toolbar actions, duplicate validation, or duplicate DXF export logic.

## Phase evidence

| Backlog phase | Status | Evidence | Next step |
| --- | --- | --- | --- |
| Phase 0 - Audit plus visible fix | Complete for this run | `AXOS_CAD_CAPABILITY_AUDIT.md` plus visible keyboard-driven workbench actions | Keep audit current as PRs land. |
| Phase 17 - Flow Health | Advanced | `flow-optimization.ts`, Flow Health UI, and `arrange_flow_line` | Add richer flow recommendations and before/after preview cards. |
| Phase 21 - Shortcuts and command line | Advanced | Command dock, parser, registry, palette, expanded shortcut dispatch | Add Enter/command-history reconciliation after UI conflicts settle. |
| Phase 27 - QA harness | In progress | Pure specs under `apps/web/src/lib/cad` | Add specs for each new command/helper. |

## Next CAD PR

Recommended next phase: add validation issue quick actions or editable connector grips after PR 746 lands, so `Layout3DEditor.tsx` conflicts can be resolved against the latest viewport/minimap changes.
