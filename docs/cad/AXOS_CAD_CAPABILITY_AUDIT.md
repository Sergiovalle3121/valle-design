# AXOS CAD Capability Audit

Last updated: 2026-06-29

This audit tracks the non-redundancy check for the CAD tree sprint. It is scoped to the current mainline CAD implementation and open PR risk observed during this run.

| Capability | Exists? | Files | Maturity | Gap | Next non-redundant PR | Owner files | Collision risk with open PRs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Unified CAD workbench | Yes | `apps/web/src/components/line-engineering/Layout3DEditor.tsx`, `docs/cad-industrial-workbench.md` | strong | Still a large single file; fullscreen shell extraction remains pending. | Extract workbench chrome only after PR 746 lands. | `Layout3DEditor.tsx`, future `cad-workbench/*` | High: PR 746 edits `Layout3DEditor.tsx`. |
| Command dock and registry | Yes | `apps/web/src/lib/cad/commands/*`, `Layout3DEditor.tsx`, `docs/cad-copilot-command-contract.md` | usable | Commands mostly mutate existing objects; few compound industrial workflows. | Add compound commands that reuse `move`/`connect`/`report` operations. | `apps/web/src/lib/cad/commands/*` | Low: no open CAD command PR found. |
| Flow health | Yes | `apps/web/src/lib/cad/flow-optimization.ts`, `Layout3DEditor.tsx` | usable | Flow suggestions are not yet one-click compound workflows. | Preview-first flow-line command and later richer flow panel actions. | `flow-optimization.ts`, `commands/registry.ts` | Low unless touching viewport UI. |
| Layers and locks | Yes | `apps/web/src/lib/cad/layers.ts`, `Layout3DEditor.tsx` | usable | Local only until backend persistence contract is wired. | Persist layer assignments after contract review. | `layers.ts`, layout API types | Medium: avoid if another layer PR opens. |
| Object properties inspector | Yes | `apps/web/src/components/line-engineering/Layout3DEditor.tsx`, `apps/web/src/lib/cad/object-properties.ts` | usable | Rich metadata is local-only until object metadata persistence is approved. | Persist notes/tags/source metadata through the layout API contract. | `object-properties.ts`, editor properties panel | Medium: open CAD PRs also touch `Layout3DEditor.tsx`; keep changes panel-scoped. |
| Industrial symbols | Yes | `apps/web/src/lib/cad/symbols.ts`, `Layout3DEditor.tsx` | usable | Inserted symbols are mapped to current asset archetypes, not native block instances. | Add native block-instance model after symbol persistence decision. | `symbols.ts`, future block helpers | Medium if touching symbol palette UI. |
| DXF import/export | Yes | `apps/web/src/lib/cad/dxf-import.ts`, `dxf-export.ts`, `layout-export-adapter.ts`, `dxf-export-readiness.ts`, `Layout3DEditor.tsx` | strong | Export now has preflight/layer package readiness; editable import still needs layer-selective review. | Layer-selective DXF import review. | `dxf-*`, `Layout3DEditor.tsx` | Medium: this PR owns DXF export readiness only. |
| DXF import/export | Yes | `apps/web/src/lib/cad/dxf-import.ts`, `dxf-export.ts`, `layout-export-adapter.ts`, `Layout3DEditor.tsx` | strong | Editable import is still limited to supported primitives and conversion caps; export labels now travel with footprint geometry. | Layer-selective DXF import review and export preflight warnings. | `dxf-*`, `Layout3DEditor.tsx` | Low this run: no open DXF PR found. |
| Validation center | Partial | `apps/web/src/lib/cad/validation-report.ts`, `collisions.ts`, `safety-zones.ts`, `Layout3DEditor.tsx` | usable | Needs richer issue actions and ignored/local issue state. | Build validation side panel after viewport PRs settle. | `validation-report.ts`, editor UI | Medium due Layout editor churn. |
| Measurements and annotations | Yes | `apps/web/src/lib/cad/measurements.ts`, `annotations.ts`, `Layout3DEditor.tsx` | usable | Dimension styles and release rules are basic. | Add dimension style helper and UI controls. | `measurements.ts`, `annotations.ts` | Low for helper-only; medium for UI. |
| Command palette and shortcuts | Yes | `command-palette.ts`, `keyboard-shortcuts.ts`, `toolbar.ts`, `Layout3DEditor.tsx` | strong | Enter/confirm history reconciliation and clipboard paste remain pending. | Add Enter confirmation and clipboard workflows after editor conflicts settle. | `keyboard-shortcuts.ts`, `toolbar.ts`, `Layout3DEditor.tsx` | Medium: touches editor keyboard handler, but avoids viewport/minimap code. |
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

Open CAD PRs include #799 (`codex/night-cad-rack-row-command`) and #796 (`codex/night-cad-validation-center`), plus draft #746 with viewport/minimap/editor-shell work. This run avoided command-registry expansion, DXF conversion, layers, validation-center internals, viewport/minimap helpers, and shell extraction. The selected improvement extends the existing shortcut and toolbar path: `Layout3DEditor.tsx` already imports `matchCadShortcut`, renders toolbar actions, and routes palette tool entries through `runToolbarAction`, so this PR makes those existing actions keyboard-usable instead of adding another editor or action dispatcher.
Open CAD PRs currently touch shortcuts, layers, validation clearances, and rack-row commands. This run avoided those primary concerns and reused the existing `exportCadLayoutDxf` adapter plus the existing DXF export modal. The selected improvement adds a DXF export readiness helper and wires it into `Layout3DEditor.tsx` so users see entity counts, included layers, hidden-layer exclusions, validation/DXF warnings, and true blockers before downloading.
Open CAD PRs #805, #804, #801, and #796 all edit `Layout3DEditor.tsx`, so this run avoided viewport, shortcut, layer-manager, and validation-center surfaces. The selected improvement extends the existing right properties panel with a pure object-properties helper, local notes, object source/safety metadata, and multi-selection summaries. It reuses existing selection snapshots, CAD layers, tags, DXF import tags, and lock state instead of creating a parallel inspector or object model.
Open CAD PRs touch `Layout3DEditor.tsx`, command registry, layers, shortcuts, toolbar, templates, object properties, and validation report. This run avoided those files and selected DXF export hardening because the existing `Layout3DEditor.tsx` export modal already calls `exportCadLayoutDxf`. The adapter now reuses the existing primitive `text` field so exported station/equipment/safety footprints carry readable DXF labels, and it passes deterministic layer color definitions to the existing exporter.
