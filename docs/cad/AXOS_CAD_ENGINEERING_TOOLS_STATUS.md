# AXOS CAD Engineering Tools Status

Last updated: 2026-06-30

## Current status

AXOS CAD is now moving from equipment layout toward plant architecture and industrial engineering drafting. This run extends existing systems rather than adding parallel ones.

| Area | Status | Evidence | Next step |
| --- | --- | --- | --- |
| Unified CAD editor | Existing | `Layout3DEditor.tsx` remains the single workbench. | Extract shell only after active CAD PRs land. |
| CAD layers | Extended | `layers.ts` now includes Architecture, Structure, Utilities. | Persist layer assignments after API contract approval. |
| Walls | Extended | Existing wall tool now assigns Architecture tags/layer. | Add wall material/type metadata and wall crossing validation. |
| Columns | Visible | Existing column renderer exposed through architecture quick actions and Structure layer. | Add rectangular/circular column switch if persistence allows. |
| Doors | New visible slice | `door` catalog kind and native door archetype added. | Add wall association and blocked-door validation. |
| Rooms / areas | New visible slice | `room` catalog kind, tag metadata, area takeoff grouping. | Add polygon rooms and room label validation. |
| Utilities | Reused + classified | Existing utility catalog kinds now default to Utilities layer and appear in takeoff. | Add typed voltage/pressure/network metadata. |
| Area takeoff | Extended | `architecture.ts` computes occupied/open/room/aisle/safety/utility area and grouping by layer/use/department. | Add export attachment and release-readiness scoring. |
| Inspector | Extended | `object-properties.ts` exposes architecture technical metadata in the existing inspector. | Add richer equipment utility requirements. |
| DXF export | Extended | Architecture, Structure, Utilities layer colors added to existing adapter. | Add paper-space title-block layer legend. |
| Validation | Existing | Shared `validation-report.ts` remains the target. | Add architecture-specific validation rows. |

## Non-duplication notes

This run intentionally did not duplicate:

- `Layout3DEditor`
- the CAD command engine
- the DXF parser/exporter
- the layer model
- the object inspector
- the takeoff modal
- factory-scale workspace, saved views, focus mode, dock generator, supermarket generator, or material route command from open PRs #900 and #903-#907

## Files added or extended

- `apps/web/src/lib/cad/architecture.ts`
- `apps/web/src/lib/cad/architecture.spec.ts`
- `apps/web/src/lib/cad/layers.ts`
- `apps/web/src/lib/cad/object-properties.ts`
- `apps/web/src/components/line-engineering/asset-catalog.ts`
- `apps/web/src/components/line-engineering/Layout3DEditor.tsx`
- `apps/web/src/lib/cad/layout-export-adapter.ts`
- `docs/cad/AXOS_CAD_ARCHITECTURE_LAYER.md`
- `docs/cad/AXOS_CAD_ENGINEERING_TOOLS_STATUS.md`

## Release readiness impact

The user can now start drafting a plant shell with walls, columns, doors, and rooms, classify rooms by department/use, inspect technical metadata, and copy an area takeoff summary. This is a visible engineering CAD improvement, but not yet a full release package. Architecture validation and typed utility metadata remain the next blockers for release-grade drawings.
