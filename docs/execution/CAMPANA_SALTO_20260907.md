# Campaña «El salto al 10/10» (2026-09-07)

Adaptación de una sola sesión del prompt maestro del titular (nueve frentes,
coordinador, ventanas de integración). Esta sesión no puede abrir nueve
worktrees con nueve ramas remotas reales: el harness la ata a una sola rama
(`claude/valle-design-10-10-fq3nl3`) y a un solo checkout por repo. La
adaptación real: los "frentes" corren como agentes paralelos de un Workflow
sobre el mismo checkout, en territorios de archivo disjuntos (misma disciplina
que `docs/execution/frentes/README.md` de la campaña anterior, sin las ramas
separadas); yo integro, corro la suite completa, y hago un solo push por ola.

No se relajó ningún gate, ratchet ni bandera. `DWG_IMPORT_FLAG` y
`DWG_EXPORT_FLAG` siguen en `false`. No se admitió ningún archivo de terceros
al corpus (`CORPUS_POLICY.md` exige dos revisores humanos para
`licensed-third-party`; un agente no es un revisor humano). Lo que el F1.1 del
prompt maestro pide se adaptó a lo que un agente puede hacer sin violar esa
política: investigar y dejar un expediente de candidatos con procedencia
verificable, listo para revisión — no descargar bytes ni fusionar bundles.

## Verificación previa (antes de asignar trabajo)

- El "arreglo urgente" de portada #1 del prompt maestro ("14 días gratis en
  texto fijo") **ya está resuelto**: `apps/web/src/config/launch.ts` deriva
  `freeOfferHeadline(trialDays)` del catálogo público real; `FreeLaunchNote.tsx`
  y `PricingCatalog.tsx` lo consumen. No hay texto fijo que arreglar.
- El "arreglo urgente" #2 ("no abrimos archivos DWG" en `page.tsx:397`) **es
  honesto hoy**: los dos flags DWG siguen en `false` en producción. Reescribir
  esa frase ahora sería la mentira, no arreglarla. Se deja como está; el
  prompt maestro mismo lo condiciona a que F1 encienda banderas, y esta
  campaña no las enciende (regla explícita de "lo que esta campaña no hace").

## Ola 1 — lanzada 2026-09-07

| Frente | Territorio | Entregable real esperado |
|---|---|---|
| DWG-Corpus (F1.1) | `valle-design-dwg-conformance` docs/ | Expediente de candidatos de dominio público/CC0 con URL, licencia y veredicto — SIN admitir bundles |
| DWG-Encendido (F1.7) | `docs/adr/`, `docs/cad/evidence/` (lectura) | Paquete de encendido: matriz de soporte, límites, riesgos, checklist, commit de una línea preparado (no aplicado) |
| Kernel3D (F2.1) | scratch dir + `docs/adr/` (nuevo) | Spike medido Manifold vs OpenCascade.js: tamaño WASM, carga, booleana, exactitud, veredicto de licencia — ADR nuevo |
| Portada (F7) | `apps/web/src/app/(public)`, `components/marketing/` | Explorador de capacidades por pestañas (sustituye la lista larga de tarjetas), verificado por los dos hallazgos de arriba |
| EditorUX (F8) | `components/cad/editor`, `palettes`, `onboarding` | Los tres estorbos medidos en pantalla: panel de recorrido tapando la línea de comandos, etiqueta "Seleccionar" encimada, biblioteca de plantillas colapsable |
| Arquitectura-Hueco (F3) | `engine/commands/{wall,door,window,opening}*`, `lib/cad/architecture*` | Puerta/ventana recorta el sólido del muro de verdad (hoy es bloque encima) |

Bitácora de resultados de cada uno, más abajo, escrita tras la ventana de
integración (evidencia medida, no antes).
