# Frentes de la campaña «El lunes de un arquitecto» (2026-09-06)

Cada frente corre en su propia sesión y su propia rama, con **territorio
exclusivo** (§5.2 del prompt maestro). Escribe aquí dos ficheros:

- `F<N>.md` — su bitácora: una entrada por ficha, con la «terminada» escrita
  **antes** de empezar y el estado final (VERIFICADA · ARREGLADA · OCULTA ·
  PARCIAL, con motivo).
- `F<N>-peticiones.md` — su buzón: cada petición dice **qué archivo, qué cambio
  exacto (diff o JSON literal), por qué, y qué prueba lo verifica**. Las aplica
  el coordinador (F0) en grupos secuenciales y **vuelve a medir lo que la
  petición afirma** antes de darla por aplicada.

| Frente | Territorio | Rama | Goldens nuevos |
|---|---|---|---|
| F0 · Coordinador | `rubric.json`, `ESCALERA.md`, `BACKLOG.md`, `monolith-budget.json`, `manifiesto.json`, bitácora | `claude/valle-design-auditoria-bhin78` | 101-119, 190-199 y 210-219 |
| F1 · Monolito | `Layout3DEditor.tsx` en exclusiva y lo que extraiga | (la misma) | — |
| F2 · Verdad de superficie | cadenas, botones y claims de la Ola 1 fuera del monolito (`command-palette.ts`, `palette-actions.ts`, `command-summaries.ts`, `commands/registry.ts`) | `claude/f2-verdad-superficie` (árbol aparte del coordinador) | 190-199 |
| F3 · Bucle 2D | `lib/cad/snap-*`, `entity-runtime.ts`, `selection/`, `engine/commands/{modify-*,draw-basics,entity-commands,view-navigation,inquiry-*}`, `precision-input.ts`, `hatch/`, `draft-settings-host.ts`, `CadDraftSettingsDialog.tsx` | `claude/f3-bucle-2d` | 120-129 |
| F4 · Papel y entrega | `paper-space*.ts`, `plot/` (salvo `aci-palette.ts`), `pdf/`, `viewport-operations.ts`, `dxf-*.ts`, `annotation-scale.ts`, `plot-host.ts`, `plot-commands.ts`, `apps/api/.../cad-dxf-export.ts`, `line-dxf.ts` | `claude/f4-papel-entrega` | 130-139 |
| F5 · Toolsets | `mep-symbols.ts`, `electrical/`, `plant/`, `flatshot*`, `wall-*`, `bim-*`, `mep-*`, `blocks/block-workflow.ts`, `engine/commands/{electrical-*,data-extraction-*,solids-support,draw-wall,plant-*}` | `claude/f5-toolsets` | 140-149 |
| F7 · Modelado 3D (abierto 19:16 UTC) | `lib/cad/interop/` (escritores de malla nuevos), `glb-export.ts`, `engine/commands/{solids-interop,solids-transform}.ts`, `solid3d-build.ts`, `solid3d-adapter.ts`, `cad-entities-v5.ts` (aditivo), entradas aditivas en `commands/registry.ts` y `engine/lazy-commands.ts` | `claude/f7-modelado-3d` | 200-209 |
| F8 · El despacho | `apps/api/src/modules/{organizations,commercial,identity,outbox-receiver,audit-log,support,feedback}`, la landing, el alta, `faq.ts`, `PricingCatalog.tsx`, `app/layout.tsx`, contrato OpenAPI y SDK | `claude/f8-despacho` | 150-159 |
| F9 · Cimientos y piel | `scripts/design/`, `check-lint-budget.mjs`, `lib/cad/render/`, `plot/aci-palette.ts`, `components/cad/ribbon/`, `lazy.ts`, `save-failure.ts`, `document-lifecycle/`, recovery, a11y specs | `claude/f9-cimientos-piel` | 160-169 |
| F10 · Evidencia independiente | `docs/cad/evidence/`, `docs/cad/corpus/oraculos/`, `lib/cad/verification/`, `scripts/cad/` (nuevos) | `claude/f10-evidencia-independiente` | 170-179 |
| F11 · Inventario AutoCAD | sólo `docs/history/execution/frentes-lunes-20260906/F11*.md` | `claude/f11-inventario-autocad` | — |
