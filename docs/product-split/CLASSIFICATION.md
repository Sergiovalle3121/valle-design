# CLASSIFICATION — Clasificación consolidada de componentes (Fase 0)

Consolidado de 8 inventarios paralelos + crítico de completitud. **649 rutas únicas**;
35 clasificaciones en conflicto entre agentes se resolvieron con las reglas y overrides de la
sección final. Esta lista es el insumo del plan de Fase 1 (división de MIXED) y de la lista de
rutas para `git filter-repo` en Fase 3 (los DESIGN_OWNED resultantes tras la Fase 1).

> ⚠️ La lista de filter-repo NO se toma de aquí tal cual: primero la Fase 1 divide los MIXED y
> mueve los 10 archivos industriales que hoy viven dentro de `apps/web/src/lib/cad/`. La lista
> final de extracción se congelará en `FILTER-REPO-PATHS.txt` al cerrar la Fase 1.

## DESIGN_OWNED (211)

Se extrae a valle-design (Fase 3, vía git filter-repo tras la limpieza de Fase 1).

| Ruta | Nota |
|---|---|
| `apps/api/src/migrations/20260706180000-AddCadBlocks.ts` | Tabla de bloques CAD |
| `apps/api/src/migrations/20260724010000-AddCanonicalCadDocument.ts` | Migración exclusivamente CAD: añade cad_document y cad_document_version a sf_line_layouts |
| `apps/api/src/migrations/20260728110000-ProfessionalCadBlockLibrary.ts` | Librería profesional de bloques CAD |
| `apps/api/src/modules/line-engineering/cad-blocks.service.spec.ts` | Pruebas de la biblioteca de bloques CAD |
| `apps/api/src/modules/line-engineering/cad-blocks.service.ts` | Biblioteca de bloques CAD (CadBlockDefinition, versionado, CRUD sf_cad_blocks) |
| `apps/api/src/modules/line-engineering/cad-document-storage.spec.ts` | Pruebas del almacenamiento CAD |
| `apps/api/src/modules/line-engineering/cad-document-storage.ts` | Almacenamiento del CadDocument: gzip, sha256, punteros blob CAS, límites y gunzip acotado |
| `apps/api/src/modules/line-engineering/cad-document-validation.spec.ts` | Pruebas de validación del CadDocument |
| `apps/api/src/modules/line-engineering/cad-document-validation.ts` | Validación del CadDocument v1-v3: entities, blocks, constraints, paperSpaces, viewports, publications, review threads |
| `apps/api/src/modules/line-engineering/cad-intent-tools.spec.ts` | Pruebas de tools/prompts IA CAD |
| `apps/api/src/modules/line-engineering/cad-intent-tools.ts` | Especificación de herramientas CAD y prompts para el modelo; importa CideToolSpec del proveedor general CIDE |
| `apps/api/src/modules/line-engineering/cad-intent.service.ts` | IA CAD NL->tool-calls y copiloto de optimización; opcional; depende de CideProvider (../ai) — riesgo de acoplamiento |
| `apps/api/src/modules/line-engineering/cad-vision-prompt.spec.ts` | Pruebas del prompt de visión |
| `apps/api/src/modules/line-engineering/cad-vision-prompt.ts` | Prompt de visión, anti-SSRF, mensajes multimodales |
| `apps/api/src/modules/line-engineering/cad-vision.service.ts` | Vision->CAD: vectoriza planos vía CIDE multimodal (IA CAD opcional) |
| `apps/api/src/modules/line-engineering/entities/sf-cad-block.entity.ts` | Entidad sf_cad_blocks (block definitions CAD); importa LayoutAsset de la entidad mixta — mover interfaz a contrato compartido en Fase 1 |
| `apps/api/src/modules/line-engineering/line-dxf.spec.ts` | Pruebas del escritor DXF |
| `apps/api/src/modules/line-engineering/line-dxf.ts` | Escritor DXF R12 puro (capas, ACI, círculos/arcos, flip Y) — serialización CAD; el consumidor getLayoutDxf queda enterprise y deberá consumirlo como lib/API |
| `apps/web/e2e/golden/*-cad-*.spec.ts` | 19 specs e2e CAD (10-cad-native-entities … 28-cad-osnap-pointer): entidades nativas, recovery, selección, dynamic input, hatch asociativo, mtext, cotas, mleader, bloques, workbench, viewports, xrefs, colaboración, fillet |
| `apps/web/e2e/golden/*cad*` | 19 specs E2E CAD (10-28) + cad-acceptance-journey.*: corpus dorado del editor, usan AXOS-CAD-STUDIO/UNIVERSAL |
| `apps/web/e2e/golden/10-cad-native-entities.spec.ts` | E2E dorado CAD; importa lib/cad y mockea /line-engineering/layout; depende de fixtures/session (plataforma) |
| `apps/web/e2e/golden/11-cad-recovery-journal.spec.ts` | E2E dorado CAD (recovery) |
| `apps/web/e2e/golden/12-cad-professional-selection.spec.ts` | E2E dorado CAD (selección) |
| `apps/web/e2e/golden/13-cad-dynamic-input.spec.ts` | E2E dorado CAD (dynamic input) |
| `apps/web/e2e/golden/14-cad-associative-hatch.spec.ts` | E2E dorado CAD (hatch asociativo) |
| `apps/web/e2e/golden/15-cad-native-mtext.spec.ts` | E2E dorado CAD (MText) |
| `apps/web/e2e/golden/16-cad-associative-dimensions.spec.ts` | E2E dorado CAD (cotas asociativas) |
| `apps/web/e2e/golden/17-cad-native-mleader.spec.ts` | E2E dorado CAD (MLeader) |
| `apps/web/e2e/golden/18-cad-professional-blocks.spec.ts` | E2E dorado CAD (bloques) |
| `apps/web/e2e/golden/19-cad-professional-workbench.spec.ts` | E2E dorado CAD (workbench) |
| `apps/web/e2e/golden/20-cad-multiple-viewports.spec.ts` | E2E dorado CAD (viewports) |
| `apps/web/e2e/golden/21-cad-xrefs.spec.ts` | E2E dorado CAD (xrefs) |
| `apps/web/e2e/golden/22-cad-compare-collaboration.spec.ts` | E2E dorado CAD (colaboración/compare) |
| `apps/web/e2e/golden/23-cad-native-fillet.spec.ts` | E2E dorado CAD (fillet) |
| `apps/web/e2e/golden/24-cad-canonical-layers.spec.ts` | E2E dorado CAD (capas) |
| `apps/web/e2e/golden/25-cad-trim-extend.spec.ts` | E2E dorado CAD (trim/extend) |
| `apps/web/e2e/golden/26-cad-precision-polyline.spec.ts` | E2E dorado CAD (polilínea de precisión) |
| `apps/web/e2e/golden/27-cad-dxf-loss-manifest.spec.ts` | E2E dorado CAD (manifiesto de pérdida DXF) |
| `apps/web/e2e/golden/28-cad-osnap-pointer.spec.ts` | E2E dorado CAD (osnap) |
| `apps/web/e2e/golden/cad-acceptance-journey*` | Journey de aceptación CAD (.ts + .check.ts). |
| `apps/web/e2e/golden/cad-acceptance-journey.check.ts` | Checker del journey de aceptación CAD |
| `apps/web/e2e/golden/cad-acceptance-journey.ts` | Mapa de evidencia del journey CAD de 50 pasos |
| `apps/web/e2e/performance` | Único archivo: cad-viewport-100k.spec.ts (rendimiento de viewport CAD con 100k entidades). |
| `apps/web/e2e/performance/cad-viewport-100k.spec.ts` | Benchmark 10k/100k entidades generadas en memoria; usa harness compartido |
| `apps/web/scripts/cad-perf-scale.mts` | Script de rendimiento CAD a escala. |
| `apps/web/src/app/dashboard/cad` | Página CAD Studio standalone (63 líneas). Contiene los identificadores persistidos AXOS-CAD-STUDIO / UNIVERSAL hardcodeados; monta Layout3DEditor en modo standalone. |
| `apps/web/src/app/dashboard/cad/page.tsx` | CAD Studio universal; persiste con modelo centinela AXOS-CAD-STUDIO via la API /line-engineering/layout (identificador persistido confirmado, L15) |
| `apps/web/src/components/line-engineering/Minimap.tsx` | Minimapa 2D. Solo lo consume el huérfano LayoutEditor.tsx — puede morir con él. |
| `apps/web/src/components/line-engineering/PlantMinimap.tsx` | Minimapa de planta del editor 3D; importa lib/cad. |
| `apps/web/src/components/line-engineering/ScaleBar.tsx` | Barra de escala del viewport; importa lib/cad. |
| `apps/web/src/components/line-engineering/asset-catalog*.ts` | Catálogo canónico de equipos/activos para el layout (biblioteca de bloques tipo industry pack, + spec). Nota: doble consumidor — el editor de líneas enterprise también lo usa; definir contrato en Fase 1. |
| `apps/web/src/components/line-engineering/asset-catalog.spec.ts` | Spec del catálogo de assets |
| `apps/web/src/components/line-engineering/asset-catalog.ts` | Catálogo de assets/equipos del layout compartido 2D/3D; lo consume cad-intent (tools IA) y el editor CAD — semilla del industry pack manufactura; el único otro consumidor (LayoutEditor 2D) es código muerto |
| `apps/web/src/components/line-engineering/auto-dimensions.ts` | Acotado automático. |
| `apps/web/src/components/line-engineering/cad-array*.ts` | Arreglos/array CAD (+ spec). |
| `apps/web/src/components/line-engineering/cad-array.spec.ts` | Spec de arrays CAD |
| `apps/web/src/components/line-engineering/cad-array.ts` | Patrones/arrays CAD; importado por lib/cad/commands — mover a lib/cad |
| `apps/web/src/components/line-engineering/cad-command*.ts` | Máquina de estados de comandos de dibujo (+ spec). |
| `apps/web/src/components/line-engineering/cad-command.spec.ts` | Spec de comandos de dibujo |
| `apps/web/src/components/line-engineering/cad-command.ts` | Máquina de estados de comandos de dibujo (línea/polilínea) pura |
| `apps/web/src/components/line-engineering/cad-format-detect*.ts` | Detección de formato CAD (+ spec). |
| `apps/web/src/components/line-engineering/cad-format-detect.spec.ts` | Spec de detección de formato |
| `apps/web/src/components/line-engineering/cad-format-detect.ts` | Detección de formato CAD (DXF/DWG) |
| `apps/web/src/components/line-engineering/cad-intent*.ts` | IA CAD (opcional): normalización de intents NL→CAD (+ spec). El backend que consume es CIDE vía rutas line-engineering/* (riesgo de rename). |
| `apps/web/src/components/line-engineering/cad-intent.spec.ts` | Spec de IA CAD intents |
| `apps/web/src/components/line-engineering/cad-intent.ts` | IA CAD (NL→intents): tools formato OpenAI-compatible consumidas por CIDE/Ollama en backend; módulo puro sin red — la dependencia CIDE es de despliegue, no de import (IA CAD opcional en valle-design) |
| `apps/web/src/components/line-engineering/cad-vision*.ts` | IA CAD (opcional): normalización de resultados de visión (+ spec). |
| `apps/web/src/components/line-engineering/cad-vision.spec.ts` | Spec de IA CAD visión |
| `apps/web/src/components/line-engineering/cad-vision.ts` | IA CAD visión (normaliza resultados de visión a geometría); puro |
| `apps/web/src/components/line-engineering/cad-workbench` | 13 archivos: paletas profesionales CAD (bloques, cotas, hatch, mtext, mleader, xrefs, colaboración, layouts, selección, dynamic input, command dock, workspace dock). 100% CAD. |
| `apps/web/src/components/line-engineering/cad-workbench/**` | UI del workbench CAD (13 archivos); CadXrefPalette.tsx persiste revision default 'UNIVERSAL' |
| `apps/web/src/components/line-engineering/cad-workbench/CadCommandDock.spec.ts` | UI CAD workbench |
| `apps/web/src/components/line-engineering/dimension-format*.ts` | Formato de cotas (+ spec). |
| `apps/web/src/components/line-engineering/dimension-format.spec.ts` | Spec de formato de cotas |
| `apps/web/src/components/line-engineering/dimension-format.ts` | Formato de cotas; importado por lib/cad/commands — mover a lib/cad |
| `apps/web/src/components/line-engineering/dxf-snap.ts` | Puntos de snap derivados del DXF. |
| `apps/web/src/components/line-engineering/dxf-walls.ts` | Conversión DXF a muros/huella. |
| `apps/web/src/components/line-engineering/dxf.ts` | Parser DXF del frontend. Igual dxf-walls.ts y dxf-snap.ts. |
| `apps/web/src/components/line-engineering/geom-edit*.ts` | Edición geométrica (+ spec). |
| `apps/web/src/components/line-engineering/geom-edit.spec.ts` | Spec de edición geométrica |
| `apps/web/src/components/line-engineering/geom-edit.ts` | Edición geométrica pura (offset, etc.); importado por lib/cad/commands — mover a lib/cad |
| `apps/web/src/components/line-engineering/geom-measure*.ts` | Medición geométrica (+ spec). |
| `apps/web/src/components/line-engineering/geom-measure.spec.ts` | Spec de medición geométrica |
| `apps/web/src/components/line-engineering/geom-measure.ts` | Medición geométrica pura; importado por lib/cad/commands — mover a lib/cad |
| `apps/web/src/components/line-engineering/plot-scale*.ts` | Escala de ploteo mundo→papel (+ spec). |
| `apps/web/src/components/line-engineering/plot-scale.spec.ts` | Spec de escalas de ploteo |
| `apps/web/src/components/line-engineering/plot-scale.ts` | Escalas de ploteo mundo→papel |
| `apps/web/src/components/line-engineering/plot-sheet*.ts` | Modelo de hoja de ploteo (+ spec). |
| `apps/web/src/components/line-engineering/plot-sheet.spec.ts` | Spec de hoja de ploteo |
| `apps/web/src/components/line-engineering/plot-sheet.ts` | Modelo de hoja de ploteo/cajetín, puro |
| `apps/web/src/components/line-engineering/precision-input*.ts` | Entrada de coordenadas de precisión (+ spec). |
| `apps/web/src/components/line-engineering/precision-input.spec.ts` | Spec CAD de entrada de precisión |
| `apps/web/src/components/line-engineering/precision-input.ts` | Wrapper re-export de lib/cad/precision-input; consumido por lib/cad/commands (capa invertida) — mover a lib/cad |
| `apps/web/src/components/line-engineering/professional-snapping.spec.ts` | Prueba de snapping profesional CAD. |
| `apps/web/src/components/line-engineering/snap-engine*.ts` | Motor de snapping del editor (+ spec). |
| `apps/web/src/components/line-engineering/snap-engine.spec.ts` | Spec del motor de snapping |
| `apps/web/src/components/line-engineering/snap-engine.ts` | Motor de snapping CAD; importado por lib/cad/commands y specs del núcleo — mover a lib/cad |
| `apps/web/src/lib/cad/annotations.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/architecture.spec.ts` | Takeoff arquitectónico (walls/capas) — vertical de design |
| `apps/web/src/lib/cad/array.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/associative-dimension.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/associative-mleader.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/block.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/cad-collaboration.spec.ts` | Colaboración CAD |
| `apps/web/src/lib/cad/cad-document.spec.ts` | Documento canónico CAD |
| `apps/web/src/lib/cad/cad-fillet.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/cad-layer-manager.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/cad-layout-manager.spec.ts` | Layouts/paper space CAD |
| `apps/web/src/lib/cad/cad-line-edit.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/cad-recovery-codec.spec.ts` | Recovery CAD |
| `apps/web/src/lib/cad/cad-recovery.spec.ts` | Recovery CAD |
| `apps/web/src/lib/cad/cad-workspace.spec.ts` | Spec kernel CAD (matches de 'Shift' = tecla, falso positivo industrial) |
| `apps/web/src/lib/cad/cad-xrefs.spec.ts` | Xrefs CAD |
| `apps/web/src/lib/cad/collisions.spec.ts` | Colisión geométrica CAD |
| `apps/web/src/lib/cad/command-line-assist.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/command-palette.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/command-session.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/commands` | 39 archivos / 13.134 líneas: DSL de comandos CAD (parser, executor, registry, transform, history, validators) + esquemas de tools para IA. 100% CAD. |
| `apps/web/src/lib/cad/commands/clean.spec.ts` | Comando CAD |
| `apps/web/src/lib/cad/commands/count.spec.ts` | Comando CAD |
| `apps/web/src/lib/cad/commands/delete.spec.ts` | Comando CAD |
| `apps/web/src/lib/cad/commands/duplicate.spec.ts` | Comando CAD |
| `apps/web/src/lib/cad/commands/geometry-cleanup.spec.ts` | Comando CAD |
| `apps/web/src/lib/cad/commands/label.spec.ts` | Comando CAD |
| `apps/web/src/lib/cad/commands/mirror.spec.ts` | Comando CAD |
| `apps/web/src/lib/cad/commands/move.spec.ts` | Comando CAD |
| `apps/web/src/lib/cad/commands/place-symbol.spec.ts` | Comando CAD |
| `apps/web/src/lib/cad/commands/select.spec.ts` | Comando CAD |
| `apps/web/src/lib/cad/commands/transform.spec.ts` | Comando CAD |
| `apps/web/src/lib/cad/copilot-contract.spec.ts` | IA CAD (opcional) |
| `apps/web/src/lib/cad/curve-tessellate.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/dimension.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/divide-measure.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/dxf-block-document.spec.ts` | DXF corpus inline |
| `apps/web/src/lib/cad/dxf-cad-document.spec.ts` | DXF corpus inline |
| `apps/web/src/lib/cad/dxf-dimension.spec.ts` | DXF corpus inline |
| `apps/web/src/lib/cad/dxf-export-readiness.spec.ts` | DXF export |
| `apps/web/src/lib/cad/dxf-export.spec.ts` | DXF export |
| `apps/web/src/lib/cad/dxf-hatch.spec.ts` | DXF corpus inline |
| `apps/web/src/lib/cad/dxf-import.spec.ts` | DXF import (fixtures = objetos JS inline, no archivos) |
| `apps/web/src/lib/cad/dxf-insert.spec.ts` | DXF corpus inline |
| `apps/web/src/lib/cad/dxf-layer-map.spec.ts` | DXF corpus inline |
| `apps/web/src/lib/cad/dxf-roundtrip.spec.ts` | DXF roundtrip |
| `apps/web/src/lib/cad/dynamic-input.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/editor-snapshot.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/ellipse.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/entity-runtime-benchmark.spec.ts` | Benchmark CAD |
| `apps/web/src/lib/cad/entity-runtime.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/entity-three.spec.ts` | Render three.js CAD |
| `apps/web/src/lib/cad/geom-constraints.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/geom-trim.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/hatch-associativity.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/hatch.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/industry-pack.spec.ts` | Industry packs → design (misión) |
| `apps/web/src/lib/cad/industry-pack.ts` | Framework de Industry Packs (CAD-NEXT-090) — la misión asigna industry packs a design. Igual industry-rollup, architecture, polygon-room, warehouse-generators, safety-zones (validación a nivel de dibujo). |
| `apps/web/src/lib/cad/industry-rollup.spec.ts` | Rollup/BOM de smart objects de packs |
| `apps/web/src/lib/cad/interop-provider.spec.ts` | Interop CAD |
| `apps/web/src/lib/cad/interop-provider.ts` | Único archivo de lib/cad que importa @/config/brand (PRODUCT_LABEL) — invertir con config de branding inyectada |
| `apps/web/src/lib/cad/intersect.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/keyboard-shortcuts.spec.ts` | Spec kernel CAD ('shift' = tecla) |
| `apps/web/src/lib/cad/large-document-transport.spec.ts` | Tests del transporte gzip CAD |
| `apps/web/src/lib/cad/large-document-transport.ts` | gzipCadDocumentJson con CompressionStream — transporte cliente del archivo CAD gzip hacia layout/cad-archive |
| `apps/web/src/lib/cad/layer.spec.ts` | Capas CAD |
| `apps/web/src/lib/cad/layers.spec.ts` | Capas CAD |
| `apps/web/src/lib/cad/layout-export-adapter.spec.ts` | Export de layouts CAD |
| `apps/web/src/lib/cad/linetype.spec.ts` | Linetypes CAD |
| `apps/web/src/lib/cad/live-constraints.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/measurements.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/minimap.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/mleader.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/mtext-layout.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/native-render-budget.spec.ts` | Presupuesto de render CAD |
| `apps/web/src/lib/cad/native-selection-index.spec.ts` | Índice de selección CAD |
| `apps/web/src/lib/cad/native-viewport.spec.ts` | Viewports CAD |
| `apps/web/src/lib/cad/object-properties.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/osnap.spec.ts` | Snapping CAD |
| `apps/web/src/lib/cad/paper-space.spec.ts` | Paper space CAD |
| `apps/web/src/lib/cad/perf-baseline.spec.ts` | Baseline de performance CAD |
| `apps/web/src/lib/cad/plot-sheet.spec.ts` | Ploteo/publicación de hojas CAD |
| `apps/web/src/lib/cad/polar-tracking.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/polygon-room.spec.ts` | Geometría de cuartos poligonales (AXOS-CAD-DEPTH-A6) |
| `apps/web/src/lib/cad/precision-tracking.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/primitive-edit.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/primitives.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/professional-blocks.spec.ts` | Bloques CAD |
| `apps/web/src/lib/cad/professional-snap-query-benchmark.spec.ts` | Benchmark de snapping CAD |
| `apps/web/src/lib/cad/progressive-scene-sync.spec.ts` | Sync progresivo de escena CAD |
| `apps/web/src/lib/cad/rule-engine.spec.ts` | Motor de reglas sobre documento canónico (CAD-NEXT-100) |
| `apps/web/src/lib/cad/safety-zones.spec.ts` | Zonas/pasillos geométricos — contenido de pack de fábrica; confirmar en Fase 1 si enterprise lo consume aparte |
| `apps/web/src/lib/cad/selection-controller.spec.ts` | Selección CAD |
| `apps/web/src/lib/cad/snapping.spec.ts` | Snapping CAD |
| `apps/web/src/lib/cad/snapshots.spec.ts` | Versiones/snapshots CAD |
| `apps/web/src/lib/cad/spline.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/symbols.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/templates.spec.ts` | Plantillas de layout (contenido de industry pack; menciona kanban solo como tag de asset) |
| `apps/web/src/lib/cad/toolbar.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/unit-format.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/validation-report.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/viewport-bookmarks.spec.ts` | Spec kernel CAD |
| `apps/web/src/lib/cad/warehouse-generators.spec.ts` | Generadores paramétricos de racks/docks — industry pack logística |
| `apps/web/src/lib/cad/world-scale.spec.ts` | Spec kernel CAD |
| `docs/cad-contracts-catalog.md` | Catálogo de contratos CAD |
| `docs/cad-copilot-command-contract.md` | Contrato del copiloto CAD |
| `docs/cad/**` | Documentación de arquitectura CAD (AXOS_CAD_ARCHITECTURE_LAYER.md, referencia AXOS-CAD-STUDIO) |
| `docs/execution/AXOS_CAD_GRAND_LEAP_EXECUTION.md` | Doc de ejecución CAD (23 menciones), sin cubrir. |
| `docs/execution/AXOS_CAD_NATIVE_CORE_EXECUTION.md` | Doc de ejecución del núcleo nativo CAD (11 menciones), sin cubrir. |
| `docs/execution/AXOS_CAD_NEXT_EXECUTION.md` | Doc de ejecución 100% CAD (133 menciones). docs/execution/ no aparece en la lista ni lo cubre ningún glob (solo docs/cad/**, docs/ai/**, docs/design/** y los dos docs cad-*.md de raíz). |
| `docs/execution/AXOS_CAD_PROFESSIONAL_DAILY_DRIVER.md` | Doc de ejecución CAD (8 menciones), sin cubrir. |
| `docs/execution/CAD_ACCEPTANCE_JOURNEY_IV.md` | Doc del acceptance journey CAD (los specs e2e correspondientes ya son DESIGN_OWNED), sin cubrir. |
| `docs/execution/CAD_PROFESSIONAL_EXPERIENCE_SCALE_GRAND_LEAP_III.md` | Doc de ejecución CAD (33 menciones), sin cubrir. |
| `docs/execution/CAD_PROFESSIONAL_PARITY_GRAND_LEAP_IV.md` | Doc de ejecución CAD (61 menciones), sin cubrir. |

## MIXED_SPLIT_REQUIRED (45)

Mezcla CAD + enterprise/office. La Fase 1 lo divide; después de dividir, sus mitades pasan a DESIGN_OWNED / ENTERPRISE_OWNED.

| Ruta | Nota |
|---|---|
| `.github/workflows/ci.yml` | Gates que hoy cubren ambos productos (npm test API, test:pg, web test:specs con los 121 specs CAD, smokes ERP); no corre Playwright. valle-design necesita su propio pipeline |
| `DECISIONS.md` | 55 menciones CAD en raíz del repo: decisiones arquitectónicas CAD (p.ej. §214 comandos de patrón, §215 copiloto IA CAD) entre decisiones ERP/MES. Historial de decisiones CAD debería acompañar a valle-design. |
| `apps/api/.env.example` | Documenta DATABASE_URL, DB_HOST/PORT/USERNAME/PASSWORD/DATABASE, SYNCHRONIZE, DB_SSL_STRICT, etc. |
| `apps/api/package.json` | Bloque jest embebido (testRegex .spec.ts, ts-jest, rootDir src) y scripts test/test:pg — design api extrae copia propia |
| `apps/api/src/migrations/20260101000000-Baseline.ts` | Baseline que crea tablas CAD, industriales y de toda la plataforma |
| `apps/api/src/migrations/legacy` | Directorio archivado fuera del glob (nunca ejecutado en prod/CI): 8 archivos Layout*/LineLayout son historia CAD (listados individualmente); los otros 88 son ERP/MES/chat/NPI/platform no-CAD. No requiere split funcional, |
| `apps/api/src/migrations/legacy/20260622150000-AddLineLayout.ts` | Crea sf_line_layouts, tabla fisicamente compartida CAD/industrial |
| `apps/api/src/migrations/legacy/20260622200000-AddLayoutSnapshots.ts` | Extiende sf_line_layouts (snapshots -> design) |
| `apps/api/src/modules/documents/blob/document-blob-lifecycle.service.spec.ts` | Tests del GC neutral con fixtures CAD (SfLineLayout l.5, punteros CAD l.33,89-90,141-159,216-223); se divide junto con el servicio |
| `apps/api/src/modules/documents/blob/document-blob-lifecycle.service.ts` | GC neutral de doc_blobs mezclado con conocimiento CAD: import SfLineLayout (l.7), cadBlobKeyFromStoredDocument (l.32-41), escaneo de layout.cadDocument/snapshots (l.56-75). GC genérico queda en enterprise; ref-counting C |
| `apps/api/src/modules/documents/documents.controller.ts` | Backend REST de PDF Studio (operaciones PDF, forms, anotaciones, NCR) + endpoint neutral POST /documents/blobs/gc; queda en enterprise; el CAD no lo consume |
| `apps/api/src/modules/documents/documents.module.ts` | Wiring neutral+Office pero importa la entidad CAD SfLineLayout (líneas 20/34/58) — en Fase 1 se eliminan esas 3 líneas; el resto queda en enterprise |
| `apps/api/src/modules/documents/documents.service.spec.ts` | Tests de PDF Studio; sin referencias CAD |
| `apps/api/src/modules/engineering/entities/engineering-document.entity.ts` | engineering_documents: VISUAL_AID (enterprise) + PLANT_LAYOUT con content.layers/objects/geometry (editor de layout v1, CAD legacy) — decidir migrar o congelar en Fase 1 |
| `apps/api/src/modules/line-engineering` | 85 archivos: cad-*.ts + sf-cad-block → design; line-balance/staffing/takt/time-study/buffer/changeover/cost + señales MES → enterprise; controller/module/service mezclan ambos |
| `apps/api/src/modules/line-engineering/dto/line-engineering.dto.ts` | 27 DTOs: a DESIGN CadBlock/CadIntent/CadVision/RecordCadPublication/UploadDxf/DxfMeta/LayoutLayer y campos cadDocument de SaveLayoutDto; a ENTERPRISE estaciones, calificaciones, IE, footprint/posiciones/celdas/snapshots; |
| `apps/api/src/modules/line-engineering/entities/sf-line-layout.entity.ts` | sf_line_layouts: a DESIGN cad_document/cad_document_version/layers/dxf_*/cadDocument en snapshots; a ENTERPRISE footprint, approval, connectors, assets, cells, posiciones de snapshots. Requiere migración de tabla en Fase |
| `apps/api/src/modules/line-engineering/line-approval.spec.ts` | Pruebas de line-approval |
| `apps/api/src/modules/line-engineering/line-engineering.controller.ts` | 73 endpoints: 14 CAD (cad-blocks, cad-intent/vision, cad-archive, publications, dxf x4, dxf-export, optimize-copilot), 7 mixtos (layout GET/PUT, clone, snapshots x4, history) y 52 industriales (IE, estaciones, calificaci |
| `apps/api/src/modules/line-engineering/line-engineering.module.ts` | Providers CAD (CadIntent/CadVision/CadBlocks) + industriales; importa DocumentsModule (blob store neutral, circularidad) y entidades MES de 5 módulos; exporta LineEngineeringService a Material Staging/Operator Terminal |
| `apps/api/src/modules/line-engineering/line-engineering.service.spec.ts` | Tests industriales (balance, staffing, SWCT) mezclados con tests CAD (CAS, blob pointers, publications server-managed) |
| `apps/api/src/modules/line-engineering/line-engineering.service.ts` | 4,120 líneas: a DESIGN hydrate/store/CAS del CadDocument, recordCadPublication, saveLayoutArchive, rama CAD de saveLayout/getLayout/snapshots, setDxf/getDxf/clearDxf/getLayoutDxf; a ENTERPRISE IE, estaciones, calificacio |
| `apps/web/.env.example` | Subset a design: NEXT_PUBLIC_API_URL, BACKEND_INTERNAL_URL, FRONTEND_SHARED_KEY, AXOS_SESSION_SECRET, BACKEND_SERVICE_*; el resto (demo, TURN, Giphy, flags office, NEXT_PUBLIC_SELF_SERVICE_PRODUCTS) se queda |
| `apps/web/e2e/fixtures` | Arnés compartido (constants, mock-backend, session) sin contenido CAD; los specs CAD lo consumen — design necesita copia propia. |
| `apps/web/e2e/fixtures/*` | Harness compartido (constants.ts, session.ts login forjado HMAC/JWT, mock-backend.ts fake enterprise 746 líneas sin handlers CAD): lo usan journeys enterprise Y todos los e2e CAD; valle-design necesita copia/extracto |
| `apps/web/e2e/fixtures/**` | constants/mock-backend/session compartidos por specs CAD y enterprise; design necesita copia del subset |
| `apps/web/e2e/fixtures/constants.ts` | Constantes de sesión/secreto compartidas por los fixtures E2E |
| `apps/web/e2e/fixtures/mock-backend.ts` | Mocks de backend sin referencias a line-engineering/CAD; usado por specs enterprise/office |
| `apps/web/e2e/fixtures/session.ts` | Forja la sesión de plataforma (cookie axos_session HMAC + JWT) usada por los E2E CAD; valle-design necesitará su propio stub de identidad |
| `apps/web/e2e/visual-sweep` | Barridos visuales de toda la app que incluyen checks interactivos CAD ('Salir del CAD', botón Cerrar del CAD) — extraer los tests CAD al repo design. |
| `apps/web/e2e/visual-sweep.spec.ts` | Sweep de rutas de todo el dashboard, incluida /dashboard/cad. |
| `apps/web/messages` | Sin namespace CAD (las cadenas del editor están hardcodeadas en español). Claves design/cad a nivel de clave en landing.json (tarjeta 'cad', stack ERP·MES·CAD·AI), products.json (bloque 'design') y pricing.json (SKU 'des |
| `apps/web/package.json` | Scripts test:specs/e2e y pins (@playwright/test 1.56.0, tsx) requeridos por ambos productos |
| `apps/web/playwright.config.ts` | Config única para e2e enterprise+CAD+Office (webServer next dev, mock :4010, workers 1); design deriva su propia copia |
| `apps/web/scripts/run-specs.mjs` | Runner compartido de specs (hoy ejecuta también los specs de lib/cad — ajustar tras el split). |
| `apps/web/src/components/line-engineering` | 72 archivos: 47 CAD design (13 cad-workbench + 34 libs/vistas), 22 industriales enterprise, 3 mixtos (Layout3DEditor, LayoutEditor, design-checks). El claim '~72 archivos de UI CAD' cuenta el directorio entero; la UI CAD |
| `apps/web/src/components/line-engineering/Layout3DEditor.tsx` | 10.562 líneas. Núcleo del editor CAD 3D (60+ imports de lib/cad, three.js, DXF, plot, xrefs, colaboración) → design. ANALYSIS_PANELS con 17 paneles industriales sin gating por standalone, arrangeLine/connectLine, flowMet |
| `apps/web/src/components/line-engineering/LayoutEditor.tsx` | 2.388 líneas, editor 2D fabric.js legado que mezcla DXF con los paneles industriales. HUÉRFANO (sin importadores): candidato a eliminación en vez de split. |
| `apps/web/src/components/line-engineering/design-checks.ts` | 140 líneas, validación pura: solapes/fuera-de-huella (CAD → design) mezclado con checks de estaciones sin colocar y fuera de la cadena de flujo (línea → enterprise). |
| `apps/web/src/lib/cad` | 227 archivos / 53.269 líneas. 217 archivos (51.640 líneas) son CAD puro → design; 10 archivos industriales (line-balance*, flow-optimization*, material-flow-route*, 1.629 líneas) → enterprise. Ver entradas específicas. |
| `apps/web/src/lib/cad/commands/registry.spec.ts` | Registro/parser de comandos CAD (design) + comando analyze_line_balance con takt/line_balance_over_takt (enterprise) |
| `apps/web/src/lib/cad/index.ts` | Barrel que re-exporta el núcleo CAD (design) pero también line-balance (enterprise); podar el re-export en Fase 1 |
| `docs/GO_LIVE_CHECKLIST.md` | 90 menciones CAD: contiene la bitácora completa de las cinco olas CAD (PRs #1127–#1159) mezclada con el go-live enterprise. Las secciones CAD deberían copiarse al repo design. |
| `docs/execution` | El resto del directorio tampoco está clasificado: AXOS_PDF_*, AXOS_SHEETS_OVERNIGHT, AXOS_PRESENTATIONS_*, AXOS_DOCUMENTS_OVERNIGHT son Office (no tocar); ERP_*, VALLE_*, CIDE_*, AXOS_ENTERPRISE_*, AXOS_INTEGRATION_*, AX |
| `docs/execution/ERP_MES_CAD_COLLISION_LEDGER.md` | Ledger que mezcla colisiones ERP/MES/CAD (38 menciones CAD): las entradas CAD van a valle-design, las ERP/MES quedan. |

## ENTERPRISE_OWNED (301)

Permanece en valle-enterprise.

| Ruta | Nota |
|---|---|
| `.github/workflows/sbom.yml` | Generación SBOM CycloneDX; replicar en design |
| `AGENTS.md` | Instrucciones de agentes en raíz con 5 referencias CAD; queda en enterprise pero Fase 1 debe limpiar las referencias y crear el AGENTS.md del repo design. |
| `CHANGELOG.md` | Mención CAD; queda en enterprise (historial del monorepo). |
| `README.md` | README raíz con 4 menciones CAD (copy de producto); queda, con actualización de copy en Fase 1. |
| `THIRD_PARTY_NOTICES.md` | Avisos de terceros del monorepo; design debe generar los suyos desde su propio SBOM |
| `apps/api/scripts` | Resto sin listar: build.js, postinstall.js, backfill-tenant.js/.sql, migrate-sqlite-to-postgres.js, multiworker-soak.js, restore-backup.js — infra del API, no CAD. |
| `apps/api/scripts/bootstrap-smoke.js` | Smoke DI/esquema vs Postgres, sin CAD |
| `apps/api/scripts/golden-flow-smoke.js` | Golden-flow ERP por HTTP real (supertest), verificado sin CAD |
| `apps/api/scripts/jest-postgres.js` | Lanzador de *.pg.spec.ts (TEST_DATABASE_URL obligatorio); hoy sin suites CAD |
| `apps/api/scripts/jest.js` | Lanzador jest con --experimental-vm-modules |
| `apps/api/src/app.module.ts` | Composicion raiz: registra LineEngineeringModule (L36/L152) y DocumentsModule (L112/L222) como imports planos; se edita en Fase 1 para retirar la mitad CAD |
| `apps/api/src/common/database/date-column-type.ts` | Helper de columna fecha; design necesitara equivalente propio |
| `apps/api/src/common/database/json-column-type.ts` | Helper de columna JSON; design necesitara equivalente propio |
| `apps/api/src/common/testing/entity-graph.pg.spec.ts` | Integración Postgres del grafo de entidades completo — cambiará al retirar entidades CAD (verificar en Fase 1) |
| `apps/api/src/migrations/20260704120000-DropInertBayTables.ts` | Limpieza de tablas de bahías (industrial) |
| `apps/api/src/migrations/20260704140000-BackfillMmMaterialFromLegacy.ts` | Backfill material master |
| `apps/api/src/migrations/20260704150000-AddBuyerTrackingToErpPo.ts` | ERP compras |
| `apps/api/src/migrations/20260704160000-BackfillErpPoFromLegacy.ts` | ERP compras |
| `apps/api/src/migrations/20260704170000-AddTitlePlantToErpPo.ts` | ERP compras |
| `apps/api/src/migrations/20260704180000-AddLegacyCreatedAtToErpPo.ts` | ERP compras |
| `apps/api/src/migrations/20260704190000-DropInventoryPositionsMaterialFk.ts` | Inventario |
| `apps/api/src/migrations/20260718050000-AddGenericIeProcessTypes.ts` | Tipos de proceso IE (industrial, no CAD) |
| `apps/api/src/migrations/20260720010000-AddHrPayroll.ts` | HR payroll (solo cita sf_cad_blocks como patrón de columnas en un comentario) |
| `apps/api/src/migrations/20260720030000-AddErpTreasury.ts` | ERP tesorería |
| `apps/api/src/migrations/20260720050000-AddErpFixedAssets.ts` | ERP activos fijos |
| `apps/api/src/migrations/20260720070000-AddErpBudget.ts` | ERP presupuesto |
| `apps/api/src/migrations/20260720090000-AddHrLeave.ts` | HR ausencias |
| `apps/api/src/migrations/20260720110000-AddErpCrm.ts` | ERP CRM |
| `apps/api/src/migrations/20260720130000-AddErpApprovals.ts` | ERP aprobaciones |
| `apps/api/src/migrations/20260720150000-AddErpRfq.ts` | ERP RFQ |
| `apps/api/src/migrations/20260720170000-AddMaintenance.ts` | Mantenimiento |
| `apps/api/src/migrations/20260720190000-AddProdLog.ts` | Log de producción |
| `apps/api/src/migrations/20260720210000-AddErpCustomerPrices.ts` | ERP precios cliente |
| `apps/api/src/migrations/20260720230000-AddCustomerPhone.ts` | ERP clientes |
| `apps/api/src/migrations/20260721010000-AddPayrollJournalLink.ts` | Payroll-finanzas |
| `apps/api/src/migrations/20260721020000-AddPayrollPaymentLink.ts` | Payroll-pagos |
| `apps/api/src/migrations/20260723010000-CreatePeopleCloudWorkforceCore.ts` | HCM workforce core |
| `apps/api/src/migrations/20260723040000-CreateDocumentPlatform.ts` | Crea doc_documents/doc_blobs/doc_document_versions/doc_document_annotations/doc_document_links — plataforma documental + blob store neutral; queda |
| `apps/api/src/migrations/20260723120000-CreateIntegrationCloudFoundation.spec.ts` | Spec integraciones |
| `apps/api/src/migrations/20260723120000-CreateIntegrationCloudFoundation.ts` | Integraciones (outbox/inbox/webhooks) |
| `apps/api/src/migrations/20260724020000-SecureAiTenantActions.ts` | IA general (CIDE) — el CAD IA la consume como proveedor opcional |
| `apps/api/src/migrations/20260724030000-CreateAiRunsTracing.ts` | IA general: tracing de runs |
| `apps/api/src/migrations/20260725010000-SecureDecisionIntelligenceTenant.spec.ts` | Spec decision intelligence |
| `apps/api/src/migrations/20260725010000-SecureDecisionIntelligenceTenant.ts` | Decision intelligence |
| `apps/api/src/migrations/20260725020000-AiActionExactlyOnce.spec.ts` | Spec IA |
| `apps/api/src/migrations/20260725020000-AiActionExactlyOnce.ts` | IA general |
| `apps/api/src/migrations/20260725030000-AiDurableRuns.spec.ts` | Spec IA |
| `apps/api/src/migrations/20260725030000-AiDurableRuns.ts` | IA general |
| `apps/api/src/migrations/20260725040000-CreateAiKnowledge.spec.ts` | Spec IA knowledge |
| `apps/api/src/migrations/20260725040000-CreateAiKnowledge.ts` | IA knowledge |
| `apps/api/src/migrations/20260725050000-AiRunLeaseFencing.spec.ts` | Spec IA |
| `apps/api/src/migrations/20260725050000-AiRunLeaseFencing.ts` | IA general |
| `apps/api/src/migrations/20260725070000-AddErpP2pGrandLeap.ts` | ERP P2P |
| `apps/api/src/migrations/20260725080000-FinancePostingSpine.spec.ts` | Spec finanzas |
| `apps/api/src/migrations/20260725080000-FinancePostingSpine.ts` | Espina de posteo financiero |
| `apps/api/src/migrations/20260725090000-ActionIdempotencyKeys.spec.ts` | Spec idempotencia |
| `apps/api/src/migrations/20260725090000-ActionIdempotencyKeys.ts` | Idempotencia de acciones |
| `apps/api/src/migrations/20260725110000-ErpSdO2cIdempotency.ts` | ERP O2C |
| `apps/api/src/migrations/20260728093000-CreateMigrationCenter.ts` | Centro de migración de datos |
| `apps/api/src/migrations/20260728100000-AddDocumentBlobLifecycle.ts` | Añade gc_marked_at + idx_doc_blobs_gc a doc_blobs (GC neutral) |
| `apps/api/src/migrations/20260728220000-ErpCustomerTenantScopedIdentity.ts` | ERP identidad tenant-scoped |
| `apps/api/src/migrations/20260729010000-ErpInvoiceTenantScopedNumber.ts` | ERP facturación |
| `apps/api/src/migrations/20260729120000-ErpMaterialValuationTenantScopedIdentity.ts` | ERP valoración |
| `apps/api/src/migrations/20260729140000-ErpFinanceConfigTenantScopedIdentity.ts` | ERP config financiera |
| `apps/api/src/migrations/20260729150000-ErpProductionOrderCosting.ts` | ERP costeo de órdenes |
| `apps/api/src/migrations/20260729160000-ErpAccountCostCenterTenantScopedIdentity.ts` | ERP cuentas/centros de costo |
| `apps/api/src/migrations/20260729180000-ErpDocumentFolioTenantScopedUniqueness.ts` | ERP folios |
| `apps/api/src/migrations/20260730100000-ErpTreasuryAssetsTenantScopedIdentity.ts` | ERP tesorería/activos |
| `apps/api/src/migrations/20260730110000-ErpPlanningTenantScopedFolios.ts` | ERP planeación (el match de 'cad' es la palabra 'Cada' en un comentario) |
| `apps/api/src/migrations/20260730120000-ErpSalesOrderLineType.ts` | ERP ventas |
| `apps/api/src/migrations/20260730130000-ErpJournalFunctionalAmounts.ts` | ERP journal |
| `apps/api/src/migrations/20260730140000-ErpPeriodReopenings.ts` | ERP períodos |
| `apps/api/src/migrations/20260731090000-ErpBankMatchExclusivePayment.ts` | ERP bancos |
| `apps/api/src/migrations/20260731100000-ErpBudgetCommitments.ts` | ERP presupuesto |
| `apps/api/src/migrations/legacy/20260607180000-CreateLineEngineering.ts` | Crea sf_line_stations/sf_model_lines (industrial) |
| `apps/api/src/migrations/legacy/20260622160000-AddLayoutDxf.ts` | Columnas dxf_* (DXF crudo inline) en sf_line_layouts — funcionalidad CAD, aunque la tabla es mixta |
| `apps/api/src/migrations/legacy/20260622170000-AddLayoutConnectors.ts` | Extiende sf_line_layouts (conectores usados por analiticas enterprise) |
| `apps/api/src/migrations/legacy/20260622180000-AddLayoutAssets.ts` | Extiende sf_line_layouts (assets del editor) |
| `apps/api/src/migrations/legacy/20260622190000-AddLayoutAnnotations.ts` | Extiende sf_line_layouts (anotaciones del editor) |
| `apps/api/src/migrations/legacy/20260623100000-AddLayoutCells.ts` | Extiende sf_line_layouts (celdas usadas por analiticas enterprise) |
| `apps/api/src/migrations/legacy/20260623110000-AddLayoutApproval.ts` | Extiende sf_line_layouts (aprobacion del layout) |
| `apps/api/src/migrations/legacy/20260701120000-CreateIeLineBalance.ts` | Crea tablas ie_* de balanceo/tiempos |
| `apps/api/src/modules/ai` | Modulo de IA general (runs, tools, insights); sin referencias a line-engineering |
| `apps/api/src/modules/ai-knowledge/ai-knowledge.module.ts` | IA enterprise; importa DocumentsModule (l.4,28) como consumidor neutral de DocumentsService — refuerza que documents queda en enterprise |
| `apps/api/src/modules/ai-knowledge/ai-knowledge.service.ts` | Consume DocumentsService vía moduleRef (l.14,252,304); sin relación con CAD |
| `apps/api/src/modules/ai/**` | IA general CIDE (runs, actions, briefing, pricing, evals). cide-provider.ts es autocontenido y debe vendorizarse a design en Fase 1; usa CIDE_DEFAULT_MODEL (≠ CIDE_MODEL del CAD) |
| `apps/api/src/modules/ai/cide-provider.ts` | Proveedor CIDE general del modulo de IA; la IA CAD lo importa (CideProvider/CideToolSpec/CideEngineError): extraer interfaz chat() minima para design |
| `apps/api/src/modules/ai/evals/ai-fabric-golden.v1.json` | Único golden JSON del repo: evals de IA fabric enterprise, NO CAD |
| `apps/api/src/modules/bay-layout` | Config logistica de bahias; entidad leida por station-bay.service |
| `apps/api/src/modules/bay-layout/entities/bay-layout.entity.ts` | bay_layouts: asignación lógica NP→bahía, no es CAD |
| `apps/api/src/modules/cost-intelligence/cost-intelligence.module.ts` | Importa LineEngineeringModule (consumidor industrial) |
| `apps/api/src/modules/cost-intelligence/cost-intelligence.service.spec.ts` | Spec consumidora de LineEngineeringService y entidades industriales |
| `apps/api/src/modules/cost-intelligence/cost-intelligence.service.ts` | Consumidor industrial: stationRequirements() para horas estandar en COGS |
| `apps/api/src/modules/documents/blob/database-document-blob.store.ts` | Adaptador DB neutral content-addressed (dedup sha256, protección GC); sin conocimiento de dominio |
| `apps/api/src/modules/documents/blob/document-blob-store.ts` | Contrato neutral DocumentBlobStore/StreamingDocumentBlobStore + símbolo DOCUMENT_BLOB_STORE; usado por PDF Studio, Office, CAD e IA — queda como infraestructura neutral (design necesitará copia/equivalente propio) |
| `apps/api/src/modules/documents/entities/document-blob.entity.ts` | Tabla neutral doc_blobs — los bytes viven aquí (columna binaria data); compartida por PDF/Office/CAD/IA |
| `apps/api/src/modules/engineering/dto/engineering-document.dto.ts` | DTOs de EngineeringDocument (incluye viewport/layers/geometry); sin cubrir. |
| `apps/api/src/modules/engineering/engineering.controller.ts` | Controller del módulo engineering (mismo caso que el servicio); sin cubrir. |
| `apps/api/src/modules/engineering/engineering.module.ts` | Módulo NestJS de engineering; sin cubrir. |
| `apps/api/src/modules/engineering/engineering.service.ts` | CRUD de EngineeringDocument cuyo enum es VISUAL_AID \| PLANT_LAYOUT y persiste viewport/layers/geometry (dibujo CAD-ligero legado). La entidad ya está MIXED en la lista pero el servicio no aparece. |
| `apps/api/src/modules/erp-core/services/erp-fin-creditnote-concurrency.pg.spec.ts` | pg-spec ERP, sin CAD |
| `apps/api/src/modules/erp-core/services/erp-fin-payinvoice-concurrency.pg.spec.ts` | pg-spec ERP |
| `apps/api/src/modules/erp-core/services/erp-pp-release-concurrency.pg.spec.ts` | pg-spec ERP |
| `apps/api/src/modules/erp-core/services/erp-pp-run-state.pg.spec.ts` | pg-spec ERP |
| `apps/api/src/modules/erp-core/services/erp-treasury-concurrency.pg.spec.ts` | pg-spec ERP |
| `apps/api/src/modules/event-ledger` | Ledger de auditoria neutral; line-engineering registra y LEE eventos (getLayoutHistory) via EventDomain.ENGINEERING |
| `apps/api/src/modules/floor-quality/entities/sf-quality-hold.entity.ts` | Quality hold leido por station-status |
| `apps/api/src/modules/line-engineering/entities/ie-balance.entities.ts` | 10 entidades IE: work elements, estudios de tiempos, escenarios de balance, skills, recursos, constraints, templates |
| `apps/api/src/modules/line-engineering/entities/sf-line-station.entity.ts` | sf_line_stations: ruteo, NP, factor de uso, tiempo estándar, CTQ + colocación física en piso |
| `apps/api/src/modules/line-engineering/entities/sf-model-line.entity.ts` | sf_model_lines: calificación modelo-línea, changeover SMED, takt |
| `apps/api/src/modules/line-engineering/line-approval.ts` | Formato de eventos de aprobación del layout industrial (con scorecard) |
| `apps/api/src/modules/line-engineering/line-autoarrange.spec.ts` | Pruebas de auto-acomodo |
| `apps/api/src/modules/line-engineering/line-autoarrange.ts` | Auto-acomodo serpentina de estaciones (planeación de planta) |
| `apps/api/src/modules/line-engineering/line-balance-solver.spec.ts` | Pruebas del solver |
| `apps/api/src/modules/line-engineering/line-balance-solver.ts` | Solver de asignación de work elements IE a estaciones |
| `apps/api/src/modules/line-engineering/line-balance.spec.ts` | Pruebas de balanceo |
| `apps/api/src/modules/line-engineering/line-balance.ts` | Matemática pura de balanceo, takt, heatmap, completitud |
| `apps/api/src/modules/line-engineering/line-buffer.spec.ts` | Pruebas de buffers |
| `apps/api/src/modules/line-engineering/line-buffer.ts` | Planeación de WIP/buffers de desacople (ley de Little) |
| `apps/api/src/modules/line-engineering/line-cellflow.spec.ts` | Pruebas de cell-flow |
| `apps/api/src/modules/line-engineering/line-cellflow.ts` | Flujo intra/inter-celda (manufactura celular) |
| `apps/api/src/modules/line-engineering/line-changeover.spec.ts` | Pruebas de changeover |
| `apps/api/src/modules/line-engineering/line-changeover.ts` | Matriz de cambio de modelo SMED |
| `apps/api/src/modules/line-engineering/line-clearance.spec.ts` | Pruebas de clearance |
| `apps/api/src/modules/line-engineering/line-clearance.ts` | Análisis de pasillos/holguras del layout de planta |
| `apps/api/src/modules/line-engineering/line-cohesion.spec.ts` | Pruebas de cohesión |
| `apps/api/src/modules/line-engineering/line-cohesion.ts` | Cohesión espacial de líneas de producción |
| `apps/api/src/modules/line-engineering/line-collision.spec.ts` | Pruebas de colisiones |
| `apps/api/src/modules/line-engineering/line-collision.ts` | Validación de solapes/holguras (SAT) del layout de planta |
| `apps/api/src/modules/line-engineering/line-compare.spec.ts` | Pruebas de comparación |
| `apps/api/src/modules/line-engineering/line-compare.ts` | Comparación A/B de KPIs de layouts |
| `apps/api/src/modules/line-engineering/line-completeness.spec.ts` | Pruebas de completitud documental por estación (implementación en line-balance.ts) |
| `apps/api/src/modules/line-engineering/line-continuity.spec.ts` | Pruebas de continuidad |
| `apps/api/src/modules/line-engineering/line-continuity.ts` | Topología de continuidad del flujo |
| `apps/api/src/modules/line-engineering/line-cost.spec.ts` | Pruebas de costo |
| `apps/api/src/modules/line-engineering/line-cost.ts` | Modelo de costo unitario (labor, piso, capex) |
| `apps/api/src/modules/line-engineering/line-density.spec.ts` | Pruebas de densidad |
| `apps/api/src/modules/line-engineering/line-density.ts` | Rejilla de densidad/ocupación del piso |
| `apps/api/src/modules/line-engineering/line-dossier.spec.ts` | Pruebas del dossier |
| `apps/api/src/modules/line-engineering/line-dossier.ts` | CSV RFC-4180 del expediente del layout |
| `apps/api/src/modules/line-engineering/line-flexline.spec.ts` | Pruebas de flex-line |
| `apps/api/src/modules/line-engineering/line-flexline.ts` | Análisis multi-modelo de línea flexible |
| `apps/api/src/modules/line-engineering/line-flow.spec.ts` | Pruebas de flujo |
| `apps/api/src/modules/line-engineering/line-flow.ts` | Geometría de flujo de material (spaghetti) |
| `apps/api/src/modules/line-engineering/line-flowdir.spec.ts` | Pruebas de dirección de flujo |
| `apps/api/src/modules/line-engineering/line-flowdir.ts` | Dirección de flujo / retrocesos |
| `apps/api/src/modules/line-engineering/line-loops.spec.ts` | Pruebas de bucles |
| `apps/api/src/modules/line-engineering/line-loops.ts` | Balanceo por bucles de operador |
| `apps/api/src/modules/line-engineering/line-optimize.spec.ts` | Pruebas de optimización |
| `apps/api/src/modules/line-engineering/line-optimize.ts` | Optimización 2-opt del orden de estaciones |
| `apps/api/src/modules/line-engineering/line-process-templates.spec.ts` | Pruebas de templates de proceso |
| `apps/api/src/modules/line-engineering/line-process-templates.ts` | Templates de proceso IE por industria; usa IndustryId de @axos/contracts (SHARED_PROTOCOL) |
| `apps/api/src/modules/line-engineering/line-review.spec.ts` | Pruebas de revisión |
| `apps/api/src/modules/line-engineering/line-review.ts` | Consolidación de revisión del layout industrial (punch-list) |
| `apps/api/src/modules/line-engineering/line-scorecard.spec.ts` | Pruebas del scorecard |
| `apps/api/src/modules/line-engineering/line-scorecard.ts` | Scorecard de salud del layout |
| `apps/api/src/modules/line-engineering/line-sensitivity.spec.ts` | Pruebas de sensibilidad |
| `apps/api/src/modules/line-engineering/line-sensitivity.ts` | Barrido de sensibilidad a la demanda |
| `apps/api/src/modules/line-engineering/line-staffing.spec.ts` | Pruebas de staffing |
| `apps/api/src/modules/line-engineering/line-staffing.ts` | Cálculo de personal/utilización |
| `apps/api/src/modules/line-engineering/line-stdwork.spec.ts` | Pruebas de standard work |
| `apps/api/src/modules/line-engineering/line-stdwork.ts` | Tabla de trabajo estándar (manual + caminado vs takt) |
| `apps/api/src/modules/line-engineering/line-takeoff.spec.ts` | Pruebas de take-off |
| `apps/api/src/modules/line-engineering/line-takeoff.ts` | Take-off de cantidades/área del layout de planta |
| `apps/api/src/modules/line-engineering/line-time-study.spec.ts` | Pruebas de estudio de tiempos |
| `apps/api/src/modules/line-engineering/line-time-study.ts` | Tiempo estándar con exclusión IQR |
| `apps/api/src/modules/line-engineering/station-bay.service.spec.ts` | Pruebas de bahías |
| `apps/api/src/modules/line-engineering/station-bay.service.ts` | Puente a Material Staging: bahías por estación (bay_layouts) |
| `apps/api/src/modules/line-engineering/station-status.service.spec.ts` | Pruebas del overlay MES |
| `apps/api/src/modules/line-engineering/station-status.service.ts` | Overlay MES en vivo: floor events, quality holds, replenish calls, work orders |
| `apps/api/src/modules/material-staging/entities/sf-replenish-call.entity.ts` | Senal MES leida por station-status |
| `apps/api/src/modules/material-staging/material-staging.module.ts` | Importa LineEngineeringModule (consumidor industrial) |
| `apps/api/src/modules/material-staging/material-staging.service.spec.ts` | Spec consumidora |
| `apps/api/src/modules/material-staging/material-staging.service.ts` | Consumidor industrial: stationRequirements() para surtido por estacion |
| `apps/api/src/modules/npi/npi.module.ts` | Importa LineEngineeringModule (consumidor industrial) |
| `apps/api/src/modules/npi/npi.service.ts` | Consumidor industrial: balance()/routing() para readiness NPI |
| `apps/api/src/modules/operator-terminal/entities/sf-floor-event.entity.ts` | Senal MES leida por station-status |
| `apps/api/src/modules/operator-terminal/operator-terminal.module.ts` | Importa LineEngineeringModule (consumidor industrial) |
| `apps/api/src/modules/operator-terminal/operator-terminal.service.spec.ts` | Spec que instancia LineEngineeringService posicionalmente (seam fragil) |
| `apps/api/src/modules/operator-terminal/operator-terminal.service.ts` | Consumidor industrial: stationRequirements() para poka-yoke y contexto de trabajo |
| `apps/api/src/modules/outbound/documents.spec.ts` | Documentos de embarque |
| `apps/api/src/modules/outbound/outbound-ship-concurrency.pg.spec.ts` | pg-spec outbound |
| `apps/api/src/modules/planning-orders/planning-order-staging.spec.ts` | Spec que construye LineEngineeringService posicionalmente para probar staging |
| `apps/api/src/modules/production-plan/entities/sf-work-order.entity.ts` | Work order leida por station-status |
| `apps/api/src/modules/production-plan/production-plan.module.ts` | Importa LineEngineeringModule (consumidor industrial) |
| `apps/api/src/modules/production-plan/production-plan.service.ts` | Consumidor industrial: LineEngineeringService.capacity() opcional para carga de linea |
| `apps/api/src/orm.options.spec.ts` | Spec del datasource runtime |
| `apps/api/src/orm.options.ts` | Datasource runtime (DATABASE_URL/DB_*/SQLite dev, SYNCHRONIZE fail-closed en prod, migrationsRun); design necesitará su propio equivalente |
| `apps/api/src/seed` | Ningún seed toca sf_line_layouts/sf_cad_blocks; seed-demo siembra SfLineStation (solo campos industriales) y BayLayout; forbidden-scan es metadata-driven sobre todas las entidades (patrón a replicar en design). Seeds CAD |
| `apps/api/src/seed/seed-demo-clear.ts` | Purga SfLineStation |
| `apps/api/src/seed/seed-demo.ts` | Seed industrial: createStation/listStations (rev A) para surtido demo |
| `apps/api/src/seed/seed-legacy-purge.ts` | Purga SfLineStation |
| `apps/api/src/seed/seed-verify.ts` | Verifica stationRequirements del seed |
| `apps/api/src/typeorm-cli.datasource.ts` | Datasource CLI de migraciones (exige PG; glob excluye legacy/ y *.spec) |
| `apps/api/test/jest-e2e.json` | Config jest e2e muerta (0 archivos *.e2e-spec.ts) |
| `apps/web/e2e/.gitignore` | Ignora artefactos regenerables (.report/.test-results/.cache) |
| `apps/web/e2e/README.md` | Doc del harness golden-path (design recrea la suya) |
| `apps/web/e2e/__visual__` | Reportes/artefactos generados de sweeps; no migrar. |
| `apps/web/e2e/__visual__/**` | 11 PNGs de evidencia committeados; 2 de CAD (report/after-cad-exit-visible.png, report2/cad-cerrar.png) — candidatos a COPIA al manifiesto de design, no a extracción |
| `apps/web/e2e/golden/0*.spec.ts` | E2E de flujos MES/ERP/planta (01-09) |
| `apps/web/e2e/golden/01-login-hub.spec.ts` | Journey de login/hub del shell enterprise (ejercita identidad de plataforma, se queda) |
| `apps/web/e2e/golden/02-npi-model.spec.ts` | Journey NPI |
| `apps/web/e2e/golden/03-planning-muro.spec.ts` | Journey planning |
| `apps/web/e2e/golden/05-quality-ncr.spec.ts` | Journey calidad/NCR |
| `apps/web/e2e/golden/06-materials-shortage.spec.ts` | Journey materiales |
| `apps/web/e2e/golden/07-quality-hold-disposition.spec.ts` | Journey quality hold |
| `apps/web/e2e/golden/08-operator-station.spec.ts` | Journey operator terminal |
| `apps/web/e2e/golden/09-flow-end-to-end.spec.ts` | Journey flujo ERP/MES completo (sin CAD) |
| `apps/web/e2e/golden/0[1-9]-*.spec.ts` | Golden 01-09: login/hub, NPI, planning, quality NCR/holds, materials, operator, flow end-to-end — enterprise. |
| `apps/web/e2e/visual-sweep/**` | Librería del sweep + specs de evidencia UX del app completo (capturan 2 pantallas CAD de pasada) |
| `apps/web/public` | Solo icon.svg, manifest.webmanifest, sw.js — sin assets CAD. |
| `apps/web/scripts/check-nav.mjs` | Verificación de navegación del shell enterprise. |
| `apps/web/src/app/dashboard/documents` | Gestor documental neutral (ManagedFiles); sin referencias CAD/DXF en la UI. |
| `apps/web/src/app/dashboard/engineering` | Hub de ingeniería enterprise (modelos NPI, visual aids, referencias a takt/yamazumi). |
| `apps/web/src/app/dashboard/line-engineering` | Página industrial (work elements, importar estaciones, capa IE, takt) que monta el editor CAD en modo línea. La página se queda; el editor que monta se divide. |
| `apps/web/src/app/dashboard/line-engineering/error.tsx` | Error boundary de la ruta enterprise |
| `apps/web/src/app/dashboard/line-engineering/page.tsx` | Página enterprise de balanceo/takt (→ ENTERPRISE) cuya pestaña cad3d monta Layout3DEditor (línea 271); en Fase 1 la pestaña debe reemplazarse por link/embed al producto design; el resto de la página no se toca |
| `apps/web/src/app/dashboard/material-staging/material-request-queue.spec.ts` | Material staging |
| `apps/web/src/app/dashboard/notifications/_lib/sources.spec.ts` | Notificaciones del shell |
| `apps/web/src/app/dashboard/operador/operator-terminal.utils.spec.ts` | Operator Terminal |
| `apps/web/src/app/dashboard/operador/work-instruction-panel.tsx` | Panel del Operator Terminal con modo 'cad' (visor de modelos técnicos, menciona el contrato CAD); solo sus .utils.spec.ts están listados. |
| `apps/web/src/app/dashboard/operador/work-instruction-panel.utils.spec.ts` | Operator Terminal |
| `apps/web/src/app/dashboard/operador/work-instruction-panel.utils.ts` | Detecta kind 'cad' por extensión (.step/.iges/.dxf/.dwg/.stl/.obj) para ayudas visuales; la fuente no está listada, solo su spec. |
| `apps/web/src/app/dashboard/warehouse/_components/scan-match.spec.ts` | Almacén |
| `apps/web/src/app/globals.css` | Sin reglas CSS CAD (match de 'cad' es falso positivo). |
| `apps/web/src/app/page.tsx` | Landing pública con tarjeta de producto id 'cad'; sin cubrir (products/ y pricing/ sí lo están). |
| `apps/web/src/app/pricing` | Pricing multi-producto (incluye SKU design vía i18n); se queda en enterprise. |
| `apps/web/src/app/products` | Marketing multi-producto del sitio (referencia a Design solo vía i18n); el sitio comercial se queda. |
| `apps/web/src/components/ChatWidget.tsx` | Widget de chat global; solo menciona CAD en comentarios de shell taxonomy |
| `apps/web/src/components/Cide.tsx` | Copiloto general del dashboard; sin imports de CAD |
| `apps/web/src/components/DashboardShell.tsx` | Shell del dashboard que monta el workbench CAD full-screen (documentado en el propio archivo); sin cubrir, a diferencia de routeChrome/operatorChrome que sí lo están. |
| `apps/web/src/components/SearchPalette.tsx` | Paleta de búsqueda global del hub; referencia /dashboard/cad por string, sin imports de código CAD |
| `apps/web/src/components/line-engineering/BufferPlanner.tsx` | Inventario de desacople (WIP). |
| `apps/web/src/components/line-engineering/ChangeoverMatrix.tsx` | Matriz de changeover (SMED). |
| `apps/web/src/components/line-engineering/ClearanceAnalysis.tsx` | Holguras alrededor de estaciones vía API line-engineering/layout/clearance (design tiene su equivalente local en lib/cad/collisions + safety-zones). |
| `apps/web/src/components/line-engineering/CostEstimator.tsx` | Costo por unidad — costos industriales. |
| `apps/web/src/components/line-engineering/DossierExport.tsx` | Expediente con manning + costos + tabla de estaciones vía line-engineering/layout/dossier. |
| `apps/web/src/components/line-engineering/FlexLine.tsx` | Línea flexible. |
| `apps/web/src/components/line-engineering/Layout3D.tsx` | Visor 3D de estaciones con heatmap de tiempos de ciclo (line-engineering/layout/heatmap). Aparentemente huérfano. |
| `apps/web/src/components/line-engineering/LayoutHistory.tsx` | Bitácora vía line-engineering/layout/history. Nota: design necesitará su propio historial de versiones (lib/cad/snapshots ya cubre la parte local). |
| `apps/web/src/components/line-engineering/LayoutScorecard.tsx` | Tarjeta de salud del layout (métricas de línea). |
| `apps/web/src/components/line-engineering/LineBalancePanel.tsx` | Balance de línea local; importa @/lib/cad/line-balance (que también migra a enterprise — reescritura de import). |
| `apps/web/src/components/line-engineering/LineCohesion.tsx` | Cohesión de líneas. |
| `apps/web/src/components/line-engineering/LineContinuity.tsx` | Continuidad de línea. |
| `apps/web/src/components/line-engineering/LineDensity.tsx` | Mapa de ocupación/densidad. |
| `apps/web/src/components/line-engineering/OperatorLoops.tsx` | Bucles de operador — staffing. |
| `apps/web/src/components/line-engineering/ScenarioCompare.tsx` | Comparación de escenarios A/B de línea. |
| `apps/web/src/components/line-engineering/SensitivityChart.tsx` | Sensibilidad a la demanda. |
| `apps/web/src/components/line-engineering/StandardWork.tsx` | Trabajo estándar. |
| `apps/web/src/components/line-engineering/WhatIfSimulator.tsx` | Simulador de capacidad. |
| `apps/web/src/components/line-engineering/YamazumiChart.tsx` | Yamazumi (balanceo) — panel industrial cargado en el editor CAD; hoy también accesible desde CAD standalone (ver riesgo de gating). |
| `apps/web/src/components/line-engineering/arrange-line.ts` | Acomodo de estaciones por secuencia — feature de línea (solo se usa con !standalone). |
| `apps/web/src/components/line-engineering/connect-line.ts` | Conexión secuencial de estaciones (flujo) — feature de línea. |
| `apps/web/src/components/line-engineering/flow-metrics.ts` | Métricas de flujo de material entre centros — industrial. |
| `apps/web/src/components/searchSources.spec.ts` | Búsqueda del shell |
| `apps/web/src/components/ui/LanguageSwitcher.tsx` | Componente global de idioma montado por CadWorkspaceDock — invertir con slot |
| `apps/web/src/contexts/ThemeContext.tsx` | Tema global del shell enterprise; el editor CAD lo consume (shim necesario). |
| `apps/web/src/contexts/ToastContext.tsx` | Toasts del shell; consumido por el editor CAD. |
| `apps/web/src/hooks` | Ningún hook CAD-específico (useApi, useMesSignals, usePermissions, useTenant...). Los matches de 'cad' son falsos positivos ('cada'). |
| `apps/web/src/lib/apiFetch.ts` | Infra HTTP neutral consumida por el editor CAD (shim/copia en design). |
| `apps/web/src/lib/cad/flow-optimization*.ts` | Scoring de flujo de materiales (distancia, cruces, backtracking) — ingeniería industrial, no kernel CAD; autocontenido. |
| `apps/web/src/lib/cad/flow-optimization.spec.ts` | Análisis de flujo industrial (backtracking, distancia, reorden) alojado en lib/cad; reubicar con line-engineering en Fase 1 |
| `apps/web/src/lib/cad/line-balance*.ts` | 6 archivos (line-balance, line-balance-assignment RPW/LCR, line-balance-metrics + specs): takt, cuellos de botella, balanceo — algoritmos industriales autocontenidos infiltrados en lib/cad; mover a enterprise en Fase 1. |
| `apps/web/src/lib/cad/line-balance-assignment.spec.ts` | Spec de asignación de balanceo |
| `apps/web/src/lib/cad/line-balance-assignment.ts` | Asignación RPW/LCR de balanceo de línea, dominio industrial |
| `apps/web/src/lib/cad/line-balance-metrics.spec.ts` | Spec de métricas de balanceo |
| `apps/web/src/lib/cad/line-balance-metrics.ts` | Métricas de balanceo (workload por estación), dominio industrial |
| `apps/web/src/lib/cad/line-balance.spec.ts` | Spec del módulo de balanceo |
| `apps/web/src/lib/cad/line-balance.ts` | Balanceo de línea (dominio industrial) mal ubicado en lib/cad; su único consumidor UI es LineBalancePanel (enterprise) |
| `apps/web/src/lib/cad/material-flow-route*.ts` | Rutas de flujo de material entre estaciones; importa solo flow-optimization. Industrial. |
| `apps/web/src/lib/cad/material-flow-route.spec.ts` | Rutas de flujo de material (receiving→supermarket→SMT→pack) — industrial |
| `apps/web/src/lib/chatApi.ts` | API de chat interno; sin relación de imports con CAD |
| `apps/web/src/lib/cide` | Claims/tipos del proveedor IA general CIDE; la IA CAD depende de él vía backend, se queda en enterprise. |
| `apps/web/src/lib/cide/**` | Tipos/claims frontend de la IA general CIDE (no específicos de CAD) |
| `apps/web/src/lib/cide/claims.spec.ts` | Claims del proveedor CIDE/identidad (la IA CAD lo consume por API) |
| `apps/web/src/lib/dashboardAreas.ts` | Catálogo de áreas del hub enterprise; contiene la entrada /dashboard/cad por string — deberá apuntar a la URL del producto design |
| `apps/web/src/lib/design` | NOMBRE ENGAÑOSO: domains.ts es la paleta visual por departamento del dashboard enterprise (planeación, almacén, MES...). Cero relación con CAD. No incluir en el filter-repo de design. |
| `apps/web/src/lib/design/domains.ts` | A pesar del nombre, es theming de acentos por departamento del dashboard enterprise; no es CAD |
| `apps/web/src/lib/glass.ts` | Estilo glassmorphism del shell; consumido por toda la UI CAD. |
| `apps/web/src/lib/homePersona.spec.ts` | Shell/persona |
| `apps/web/src/lib/industryNav.spec.ts` | Navegación del shell |
| `apps/web/src/lib/industryNav.ts` | Navegación industrial que referencia el CAD ('CAD (layouts de almacén)'). Su .spec sí está listado (ENTERPRISE) pero la fuente no. |
| `apps/web/src/lib/kit-ticket.ts` | Mención menor (comentario sobre import dinámico 'como los editores CAD'); sin cubrir. Riesgo bajo. |
| `apps/web/src/lib/operatorChrome.ts` | Chrome de modo workbench/operador; el editor CAD llama setWorkbenchChrome. |
| `apps/web/src/lib/routeChrome.ts` | Shell taxonomy del dashboard enterprise; solo referencias en comentarios al CAD |
| `docs/MODULE_PURPOSE_MATRIX.md` | Matriz de propósito de módulos con fila CAD/line-engineering; sin cubrir. |
| `docs/TESTING_STRATEGY.md` | Estrategia de pruebas que referencia las suites CAD; sin cubrir; Fase 1 debe extraer la sección CAD al repo design. |
| `docs/ai/**` | Docs de la IA general CIDE/Intelligence Fabric |
| `docs/architecture/REPOSITORY_HEALTH.md` | 5 menciones CAD (salud del monorepo, cuenta suites CAD); sin cubrir. |
| `docs/design/**` | Design language del shell enterprise (AXOS_DESIGN_LANGUAGE/SHELL_TAXONOMY), no el producto CAD |
| `docs/legal/BRAND_AND_TRADEMARK_SWEEP.md` | Barrido de marca que incluye la marca del CAD Studio; sin cubrir. Insumo de Fase 1 para renombrar marca en valle-design. |
| `docs/legal/IP_PROVENANCE.md` | Procedencia de IP con mención CAD; relevante para extraer el CAD con licencias limpias; sin cubrir. |
| `docs/line-engineering-ems-balance-engine.md` | Doc del motor de balanceo de line-engineering (el lado que SE QUEDA); sin cubrir. |
| `docs/product-split` | BASELINE.md, DECISIONS.md y STATE.md son los metadocs vivos de ESTA migración (BASELINE_SHA, respaldos, estado por repo); no clasificados. Deben quedar en enterprise como plan de registro de la extracción. |
| `infra/cide/**` | Infra del motor de inferencia self-hosted (Ollama CPU / vLLM GPU / Railway); design la reutiliza vía CIDE_BASE_URL o duplica el compose |
| `package-lock.json` | Lockfile del monorepo; design genera lockfile propio |
| `package.json` | Raíz del turborepo (workspaces, override multer, scripts de gates); design crea el suyo |
| `scripts/**` | Gates del monorepo: check:brand (allowlista AXOS-CAD-STUDIO y axos-dxf), check:licenses (política SBOM: GPL/AGPL/SSPL bloqueadas), tenant-safety, check:capabilities, commercial-deploy; valle-design necesita equivalentes  |
| `scripts/test-fixtures/**` | Fixtures del analizador tenant-safety (sin CAD) |
| `scripts/test-tenant-safety.mjs` | Guard tenant-safety (root package.json test:tenant-safety) |
| `turbo.json` | Sin tarea test (solo build/lint/dev/start) |

## PLATFORM_OWNED (37)

Identidad/entitlements/billing: permanece físicamente en enterprise; valle-design lo consumirá SOLO vía contratos API (Fase 2).

| Ruta | Nota |
|---|---|
| `apps/api/src/common/tenant/tenant-context.service.ts` | Contexto multi-tenant usado por toda la frontera |
| `apps/api/src/common/tenant/tenant-scoped.repository.ts` | Repos tenant-scoped usados por line-engineering y documents |
| `apps/api/src/migrations/20260705120000-AddAuthHardening.ts` | Endurecimiento de auth |
| `apps/api/src/migrations/20260717190000-AddTenantProvisioningColumns.ts` | Provisioning de tenants |
| `apps/api/src/migrations/20260718020000-AddEmailVerificationColumns.ts` | Verificación de email |
| `apps/api/src/migrations/20260718080000-AddTenantPlanTierColumn.ts` | Plan tier de tenant |
| `apps/api/src/migrations/20260718120000-AddPasswordResetColumns.ts` | Reset de contraseña |
| `apps/api/src/migrations/20260719020000-AddTenantBillingColumns.ts` | Billing de tenant |
| `apps/api/src/migrations/20260725060000-TenantSpineIndexes.spec.ts` | Spec de índices tenant |
| `apps/api/src/migrations/20260725060000-TenantSpineIndexes.ts` | Índices de la espina multi-tenant |
| `apps/api/src/migrations/20260725100000-CreateTenantOnboardingStates.spec.ts` | Spec de la migración de onboarding |
| `apps/api/src/migrations/20260725100000-CreateTenantOnboardingStates.ts` | Onboarding de tenants (incluye su .spec.ts) |
| `apps/api/src/migrations/20260727090000-CreateProductEntitlements.ts` | Crea tenant_product_grants (product_code varchar32 — persiste el código de producto 'design'), product_interest_requests; design consumirá entitlements por API |
| `apps/api/src/migrations/20260727091000-MigrateLegacyPlanTiersToGrants.spec.ts` | Spec de la anterior |
| `apps/api/src/migrations/20260727091000-MigrateLegacyPlanTiersToGrants.ts` | Migración de plan tiers a grants |
| `apps/api/src/migrations/20260728090000-AddBundleProvenanceAndMarket.ts` | Bundles/mercado de entitlements |
| `apps/api/src/migrations/20260728091000-CreateIntelligenceMetering.ts` | Metering de consumo de IA (billing) |
| `apps/api/src/migrations/20260728092000-CreateFoundingPartnerAgreements.ts` | Acuerdos founding partner |
| `apps/api/src/migrations/20260728094000-AddFoundingPartnerCoupon.ts` | Cupones founding partner |
| `apps/api/src/migrations/20260728120000-AddFoundingPartnerCouponWithdrawal.ts` | Retiro de cupones founding partner |
| `apps/api/src/modules/auth` | Guards JWT/permissions, decoradores y entidad Tenant consumidos por line-engineering; design los consumira por API |
| `apps/api/src/modules/auth/**` | JwtAuthGuard/PermissionsGuard/JwtStrategy, tenant-provisioning (lee SELF_SERVICE_PRODUCTS); identidad y RBAC que design consumirá por API |
| `apps/api/src/modules/billing/**` | Stripe (STRIPE_SECRET_KEY/WEBHOOK_SECRET/APP_BASE_URL) y price-resolver.ts que resuelve BILLING_PRICE_MX_DESIGN_SAAS_* vía priceEnvVar del price-book |
| `apps/api/src/modules/entitlements` | Grants por producto; hoy NO protege los endpoints CAD (solo RBAC engineering:*) |
| `apps/api/src/modules/entitlements/**` | ProductCapabilityGuard fail-closed + @RequiresProductCapability + backfill legacy (sunset 2026-12-31); design.cad solo aparece en specs, no en endpoints CAD |
| `apps/api/src/modules/licensing/**` | Licencias firmadas (customer-hosted); plataforma comercial |
| `apps/api/src/seed.ts` | Bootstrap del usuario admin (BACKEND_SERVICE_PASSWORD); sin contenido CAD |
| `apps/web/src/app/dashboard/settings/_lib/rbac.spec.ts` | RBAC — plataforma, se queda; design consume por API |
| `apps/web/src/config/planTiers.spec.ts` | Planes/suscripciones |
| `apps/web/src/contexts/AuthContext.tsx` | Identidad/sesión; el editor CAD lo importa directamente (necesita shim en design). |
| `apps/web/src/contexts/EntitlementsContext.tsx` | Entitlements/licencias de productos. |
| `apps/web/src/contexts/WorkspaceContext.tsx` | Tenant/workspace; importado directamente por el editor CAD. |
| `apps/web/src/hooks/permission-grants.spec.ts` | Permisos/entitlements |
| `apps/web/src/lib/entitlementNav.ts` | Gating de navegación por entitlements. Mapea /dashboard/cad, /dashboard/line-engineering y /dashboard/bay-layout (ruta inexistente) al producto 'design' — re-mapear line-engineering tras el split. |
| `apps/web/src/lib/session.ts` | Firma HMAC de la cookie de sesión de plataforma (replicada por los fixtures E2E CAD) |
| `docs/architecture/VALLE_PRODUCT_CATALOG_AND_ENTITLEMENTS.md` | Doc de catálogo de productos y entitlements (declara design) — pareja del contrato product-catalog.ts; sin cubrir. |
| `docs/commercial/PRODUCT_CATALOG.md` | Catálogo comercial que declara el producto design/CAD (6 menciones); sin cubrir. Comercial/entitlements viven físicamente en enterprise. |

## SHARED_PROTOCOL (11)

Contratos/identificadores compartidos: viven como spec versionado; cada repo tiene su copia generada, sin imports cruzados.

| Ruta | Nota |
|---|---|
| `apps/api/src/common/entities/tenant-base.entity.ts` | Entidad base multi-tenant de las entidades CAD e industriales |
| `apps/web/src/config/brand.spec.ts` | Spec del contrato de marca |
| `apps/web/src/config/brand.ts` | productNames.design, %PRODUCT_DESIGN%, PRODUCT_LABEL.design — marca multi-producto; design la consumirá vía su propia config. |
| `apps/web/src/config/productCatalog.spec.ts` | Spec del catálogo de productos web |
| `apps/web/src/config/productCatalog.ts` | Vista web del catálogo de productos derivada de @axos/contracts (platform-core/erp/mes/design) |
| `packages/contracts/**` | Paquete @axos/contracts completo: tipos/contratos neutrales (brand, pricing, price-book-mx con priceEnvVar de design, bundles, licence, api-response y contratos office). Queda físicamente en enterprise; valle-design lo c |
| `packages/contracts/src/document-authoring.ts` | Tipos AxosAssetReference etc. del editor Word en contracts compartidos |
| `packages/contracts/src/documents.ts` | Tipos DocumentSummary/Detail/Annotation/NcrDraft compartidos api+web para PDF Studio; permanecen en contracts |
| `packages/contracts/src/entitlements.ts` | Máquina de estados de entitlements y funciones puras (grantIsActive/hasCapability) compartidas API↔web; design la consumirá vía API/paquete |
| `packages/contracts/src/pdf-coordinates.ts` | normalizedBoxToPdfPoints usado por pdf-engine; contrato compartido |
| `packages/contracts/src/product-catalog.ts` | Contrato canónico que declara los productos platform-core/erp/mes/design compartido entre server y web |

## OFFICE_NO_TOCAR (44)

Word/Sheets/Presentations/PDF Studio: fuera de alcance; solo se toca el desacople del almacenamiento neutral.

| Ruta | Nota |
|---|---|
| `apps/api/scripts/pdf-grand-leap-benchmark.ts` | Benchmark del PDF engine (documents/pdf, Office); apps/api/scripts solo tiene 4 archivos listados. Debe marcarse para que filter-repo no lo arrastre. |
| `apps/api/src/migrations/20260724020000-CreateSheetsFoundation.spec.ts` | Spec Sheets |
| `apps/api/src/migrations/20260724020000-CreateSheetsFoundation.ts` | Fundación de Sheets |
| `apps/api/src/migrations/20260724030000-CreateDocumentActionProposals.spec.ts` | Spec de la migración de propuestas |
| `apps/api/src/migrations/20260724030000-CreateDocumentActionProposals.ts` | Tabla doc_action_proposals (PDF Studio → propuestas NCR) |
| `apps/api/src/migrations/20260725120000-CreatePresentationsFoundation.spec.ts` | Spec Presentations |
| `apps/api/src/migrations/20260725120000-CreatePresentationsFoundation.ts` | Fundación de Presentations |
| `apps/api/src/migrations/20260726120000-CreateDocumentAuthoring.spec.ts` | Spec de la migración Office |
| `apps/api/src/migrations/20260726120000-CreateDocumentAuthoring.ts` | Tablas doc_authoring_* del editor Word |
| `apps/api/src/modules/document-authoring` | Editor de documentos Office; tambien consume DOCUMENT_BLOB_STORE pero fuera del alcance de esta tarea |
| `apps/api/src/modules/document-authoring/**` | Editor tipo Word completo (servicio, controller, entidades doc_authoring_*, interop docx/render); cero referencias CAD; usa el blob store neutral que queda en enterprise |
| `apps/api/src/modules/documents/documents.service.ts` | Dominio documental de PDF Studio; también consumido por ai-knowledge (IA enterprise) y con puentes NCR/visual-aids; sin código CAD |
| `apps/api/src/modules/documents/dto/document.dto.ts` | DTOs de PDF Studio |
| `apps/api/src/modules/documents/entities/document-action-proposal.entity.ts` | Tabla doc_action_proposals (propuestas NCR desde AcroForms de PDF Studio hacia Calidad enterprise) |
| `apps/api/src/modules/documents/entities/document-annotation.entity.ts` | Tabla doc_document_annotations (anotaciones PDF Studio) |
| `apps/api/src/modules/documents/entities/document-link.entity.ts` | Tabla doc_document_links (links PDF→visual_aid; puente enterprise pero vive en el backend PDF Studio) |
| `apps/api/src/modules/documents/entities/document-version.entity.ts` | Tabla doc_document_versions (versionado PDF Studio; referencia blob_key neutral) |
| `apps/api/src/modules/documents/entities/document.entity.ts` | Tabla doc_documents (documentos PDF Studio) |
| `apps/api/src/modules/documents/pdf/pdf-engine.service.spec.ts` | Tests del motor PDF |
| `apps/api/src/modules/documents/pdf/pdf-engine.service.ts` | Motor de manipulación PDF de PDF Studio (también usado por document-authoring y ai-knowledge); el CAD no lo usa — la publicación PDF CAD se genera en el cliente |
| `apps/api/src/modules/presentations/**` | Backend Presentations |
| `apps/api/src/modules/sheets/**` | Backend Sheets (exceljs) |
| `apps/web/e2e/document-authoring.spec.ts` | Spec del editor de documentos. |
| `apps/web/e2e/golden/10-axos-sheets-professional-core.spec.ts` | Spec de Sheets. |
| `apps/web/src/app/dashboard/pdf-studio` | Ruta PDF Studio. |
| `apps/web/src/app/dashboard/pdf-studio/page.tsx` | PDF Studio UI — principal consumidor frontend de /documents; el CAD no usa estos endpoints |
| `apps/web/src/app/dashboard/presentations` | Ruta Presentations. |
| `apps/web/src/app/dashboard/sheets` | Ruta Sheets. |
| `apps/web/src/components/document-authoring` | Editor tipo Word. |
| `apps/web/src/components/document-authoring/**` | UI del editor Word-like (DocumentsWorkspace, DocumentEditor); consumidor secundario de /documents |
| `apps/web/src/components/pdf-studio` | PDF Studio. |
| `apps/web/src/components/pdf-studio/**` | PDF Studio UI (pdfjs-dist) |
| `apps/web/src/components/pdf-studio/page-organizer.spec.ts` | PDF Studio |
| `apps/web/src/components/presentations` | UI de Presentations. |
| `apps/web/src/components/sheets` | UI de Sheets. |
| `apps/web/src/lib/documentAuthoringApi.ts` | API del editor de documentos — fuera del alcance |
| `apps/web/src/lib/spreadsheet.ts` | Soporte de Sheets — fuera del alcance |
| `apps/web/src/styles/tiptap.css` | Estilos del editor de documentos (TipTap). |
| `packages/document-authoring-engine` | Motor de documentos tipo Word — fuera del alcance |
| `packages/document-authoring-engine/**` | Motor Word-like puro (commands/layout/migration/patch/serialize/validation); cero referencias CAD o de almacenamiento |
| `packages/presentations-engine` | Motor de presentaciones — fuera del alcance |
| `packages/presentations-engine/**` | Motor presentaciones |
| `packages/sheets-engine` | Motor de hojas de cálculo — fuera del alcance |
| `packages/sheets-engine/**` | Motor hojas de cálculo |

## Resolución de conflictos entre agentes

Reglas de precedencia aplicadas: (1) override explícito documentado abajo; (2) si algún agente
identificó mezcla real, MIXED_SPLIT_REQUIRED gana; (3) mayoría. Overrides relevantes:

- `lib/cad/` como conjunto es MIXED: 217/227 archivos son CAD puro, pero 10 archivos de
  balanceo/flujo industrial (`line-balance*`, `flow-optimization*`, `material-flow-route*`)
  salen hacia enterprise en Fase 1. Un glob `lib/cad/**` directo a filter-repo arrastraría
  balanceo de línea a valle-design (hallazgo del crítico).
- Migraciones legacy sobre `sf_line_layout` (AddLayoutDxf/Connectors/Assets/Annotations/
  Snapshots/Cells/Approval): la tabla es mixta → la historia de migraciones queda INTACTA en
  enterprise; valle-design nace con migraciones `cad_*` propias creadas en Fase 1.
  `AddCanonicalCadDocument` sí es exclusivamente CAD → DESIGN_OWNED.
- `modules/documents/`: se divide en Fase 1 — (a) blob/CAS/ManagedFiles neutral (queda,
  ENTERPRISE), (b) editorial Office (queda, NO TOCAR); las entidades/controller/service que
  cruzan ambos → MIXED hasta la división.
- `modules/engineering/` (EngineeringDocument VISUAL_AID|PLANT_LAYOUT, CAD-lite legado):
  ENTERPRISE_OWNED — sirve a Visual Aids/BOM del MES, no es el producto CadDocument.
  Registrado como decisión D-004 (revisable si el usuario quiere ese legado en Design).
- `brand.ts`, `productCatalog.ts`, `tenant-base.entity.ts`: SHARED_PROTOCOL — patrón/contrato
  que cada repo replica; nunca import cruzado.
- Infra de test compartida (`e2e/fixtures/`, `run-specs.mjs`, `visual-sweep`): MIXED — cada
  repo tendrá su copia adaptada (duplicar test-infra es aceptable; duplicar producto no).

### Detalle de los 35 conflictos resueltos

| Ruta | Votos de agentes | Resolución |
|---|---|---|
| `apps/web/src/components/line-engineering/LayoutEditor.tsx` | MIXED_SPLIT_REQUIRED×2, ENTERPRISE_OWNED×1 | MIXED_SPLIT_REQUIRED |
| `apps/web/src/components/line-engineering/design-checks.ts` | MIXED_SPLIT_REQUIRED×1, ENTERPRISE_OWNED×1 | MIXED_SPLIT_REQUIRED |
| `apps/web/src/components/line-engineering/Minimap.tsx` | DESIGN_OWNED×1, ENTERPRISE_OWNED×1, MIXED_SPLIT_REQUIRED×1 | DESIGN_OWNED |
| `apps/web/src/config/brand.ts` | PLATFORM_OWNED×1, SHARED_PROTOCOL×1 | SHARED_PROTOCOL |
| `apps/web/src/contexts/WorkspaceContext.tsx` | PLATFORM_OWNED×1, ENTERPRISE_OWNED×1 | PLATFORM_OWNED |
| `apps/web/e2e/visual-sweep.spec.ts` | MIXED_SPLIT_REQUIRED×1, ENTERPRISE_OWNED×1 | MIXED_SPLIT_REQUIRED |
| `apps/web/scripts/run-specs.mjs` | ENTERPRISE_OWNED×2, MIXED_SPLIT_REQUIRED×1 | MIXED_SPLIT_REQUIRED |
| `apps/api/src/modules/line-engineering/line-dxf.spec.ts` | DESIGN_OWNED×2, MIXED_SPLIT_REQUIRED×1 | DESIGN_OWNED |
| `apps/api/src/modules/line-engineering/entities/sf-line-station.entity.ts` | ENTERPRISE_OWNED×3, MIXED_SPLIT_REQUIRED×1 | ENTERPRISE_OWNED |
| `apps/api/src/modules/line-engineering/entities/sf-line-layout.entity.ts` | MIXED_SPLIT_REQUIRED×4, DESIGN_OWNED×1 | MIXED_SPLIT_REQUIRED |
| `apps/api/src/modules/line-engineering/line-approval.spec.ts` | ENTERPRISE_OWNED×2, MIXED_SPLIT_REQUIRED×1 | MIXED_SPLIT_REQUIRED |
| `apps/api/src/modules/documents/blob/document-blob-lifecycle.service.spec.ts` | MIXED_SPLIT_REQUIRED×3, ENTERPRISE_OWNED×1 | MIXED_SPLIT_REQUIRED |
| `apps/api/src/modules/documents/documents.controller.ts` | OFFICE_NO_TOCAR×1, ENTERPRISE_OWNED×1 | MIXED_SPLIT_REQUIRED |
| `apps/api/src/modules/documents/documents.service.spec.ts` | OFFICE_NO_TOCAR×1, ENTERPRISE_OWNED×1 | MIXED_SPLIT_REQUIRED |
| `apps/api/src/modules/documents/entities/document.entity.ts` | OFFICE_NO_TOCAR×1, ENTERPRISE_OWNED×1 | OFFICE_NO_TOCAR |
| `apps/api/src/modules/documents/entities/document-version.entity.ts` | OFFICE_NO_TOCAR×1, ENTERPRISE_OWNED×1 | OFFICE_NO_TOCAR |
| `apps/api/src/modules/documents/entities/document-annotation.entity.ts` | OFFICE_NO_TOCAR×1, ENTERPRISE_OWNED×1 | OFFICE_NO_TOCAR |
| `apps/api/src/modules/documents/entities/document-link.entity.ts` | OFFICE_NO_TOCAR×1, ENTERPRISE_OWNED×1 | OFFICE_NO_TOCAR |
| `apps/api/src/modules/documents/entities/document-action-proposal.entity.ts` | OFFICE_NO_TOCAR×1, ENTERPRISE_OWNED×1 | OFFICE_NO_TOCAR |
| `apps/api/src/migrations/20260724010000-AddCanonicalCadDocument.ts` | DESIGN_OWNED×3, MIXED_SPLIT_REQUIRED×1 | DESIGN_OWNED |
| `apps/api/src/migrations/legacy/20260622160000-AddLayoutDxf.ts` | DESIGN_OWNED×2, MIXED_SPLIT_REQUIRED×2 | ENTERPRISE_OWNED |
| `apps/api/src/migrations/20260724030000-CreateDocumentActionProposals.ts` | OFFICE_NO_TOCAR×1, ENTERPRISE_OWNED×1 | OFFICE_NO_TOCAR |
| `apps/api/src/migrations/20260724030000-CreateDocumentActionProposals.spec.ts` | OFFICE_NO_TOCAR×1, ENTERPRISE_OWNED×1 | OFFICE_NO_TOCAR |
| `apps/web/src/config/brand.spec.ts` | SHARED_PROTOCOL×1, ENTERPRISE_OWNED×1 | SHARED_PROTOCOL |
| `apps/web/src/config/productCatalog.ts` | SHARED_PROTOCOL×1, PLATFORM_OWNED×1 | SHARED_PROTOCOL |
| `apps/api/src/common/entities/tenant-base.entity.ts` | PLATFORM_OWNED×1, SHARED_PROTOCOL×1 | SHARED_PROTOCOL |
| `apps/api/src/migrations/legacy/20260622170000-AddLayoutConnectors.ts` | MIXED_SPLIT_REQUIRED×1, DESIGN_OWNED×1 | ENTERPRISE_OWNED |
| `apps/api/src/migrations/legacy/20260622180000-AddLayoutAssets.ts` | MIXED_SPLIT_REQUIRED×1, DESIGN_OWNED×1 | ENTERPRISE_OWNED |
| `apps/api/src/migrations/legacy/20260622190000-AddLayoutAnnotations.ts` | MIXED_SPLIT_REQUIRED×1, DESIGN_OWNED×1 | ENTERPRISE_OWNED |
| `apps/api/src/migrations/legacy/20260622200000-AddLayoutSnapshots.ts` | MIXED_SPLIT_REQUIRED×1, DESIGN_OWNED×1 | MIXED_SPLIT_REQUIRED |
| `apps/api/src/migrations/legacy/20260623100000-AddLayoutCells.ts` | MIXED_SPLIT_REQUIRED×1, DESIGN_OWNED×1 | ENTERPRISE_OWNED |
| `apps/api/src/migrations/legacy/20260623110000-AddLayoutApproval.ts` | MIXED_SPLIT_REQUIRED×1, DESIGN_OWNED×1 | ENTERPRISE_OWNED |
| `apps/api/package.json` | ENTERPRISE_OWNED×1, MIXED_SPLIT_REQUIRED×1 | MIXED_SPLIT_REQUIRED |
| `.github/workflows/ci.yml` | MIXED_SPLIT_REQUIRED×1, ENTERPRISE_OWNED×1 | MIXED_SPLIT_REQUIRED |
| `apps/api/.env.example` | ENTERPRISE_OWNED×1, MIXED_SPLIT_REQUIRED×1 | MIXED_SPLIT_REQUIRED |
