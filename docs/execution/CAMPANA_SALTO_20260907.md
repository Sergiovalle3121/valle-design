# Campaña «El salto al 10/10» (2026-09-07)

Adaptación de una sola sesión del prompt maestro del titular (nueve frentes,
coordinador, ventanas de integración). Esta sesión no puede abrir nueve
worktrees con nueve ramas remotas reales: el harness la ata a una sola rama
(`claude/valle-design-10-10-fq3nl3`) y a un solo checkout por repo. La
adaptación real: los "frentes" corren como agentes paralelos de un Workflow
sobre el mismo checkout, en territorios de archivo disjuntos (misma disciplina
que `docs/history/execution/frentes-lunes-20260906/README.md` de la campaña anterior, sin las ramas
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

## Resultados de la Ola 1 (integrados 2026-09-07)

**DWG-Corpus (F1.1) — cero candidatos admitidos, y es el resultado correcto.**
El entorno de esta sesión sale a Internet por un proxy de lista-blanca: sólo
`github.com`/`raw.githubusercontent.com` son alcanzables (confirmado contra
~25 dominios, incluidos controles negativos). Las fuentes .gov, los portales
de datos abiertos y Wikimedia Commons quedaron sin poder verificarse in situ.
Los únicos candidatos alcanzables (ejemplos de QCAD/LibreCAD/FreeCAD) tienen
licencias GPLv3/GPLv2/LGPLv2.1 — están en la lista explícita de "Material
prohibido" de `CORPUS_POLICY.md`. Expediente completo, con la matriz de
dominios probados y un candidato de alta prioridad para seguimiento manual
(dataset NIST PDR de DWG+DXF reales), en
`valle-design-dwg-conformance/docs/CANDIDATOS_TERCEROS_20260907.md`. Ningún
byte se descargó; ningún bundle se tocó. **Todavía no**: repetir la búsqueda
desde un entorno sin esa restricción de red, o que Sergio visite las 2-3 URL
señaladas como prioritarias.

**DWG-Encendido (F1.7) — hallazgo real que cambia la conversación.** El
paquete (`docs/cad/evidence/DWG_PAQUETE_ENCENDIDO_20260907.md`) confirma con
las cifras vivas de `dwg-decoder-matrix.json` la asimetría del corpus por
versión (AC1015: 26 tipos/25 archivos; AC1018/1024/1027/1032: 7 tipos/8
archivos cada una, todas en 0 discrepancias) y aclara algo que esta campaña
no sabía: el flag general `DWG_IMPORT_FLAG` (bloqueado, 7/7 puertas cerradas)
es distinto del mecanismo que YA firmó el titular el 2026-08-24
(`DWG_BETA_AUTHORIZATION.ownerSigned = true`, ADR-0009) y que ya está
cableado en el Dockerfile como `NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA` — import
AC1015 en un perfil acotado. La exportación, en cambio, no tiene NINGÚN
componente de UI que consuma `DWG_EXPORT_FLAG` (verificado por grep): encender
ese flag hoy no tendría ningún efecto visible, y su oráculo externo sigue en
4/24 casos. Ninguno de los dos flags de esta campaña se tocó. **Todavía no**:
el segundo oráculo independiente (LibreDWG binario) no se pudo instalar en
este entorno; el dictamen legal externo sigue sin encargo visible en el repo.

**Kernel3D (F2.1) — spike medido, ADR-0017 aceptado.** manifold-3d
(Apache-2.0, no MIT como asumía el encargo original — corregido leyendo el
LICENSE real) mide 0.54 MB de WASM, ~24 ms de init y booleanas
submilisegundo, con 0 error en volúmenes poliédricos exactos y 0.16% de error
de teselado en un cilindro (misma clase de límite que el B-rep facetado
propio, no una regresión). opencascade.js mide 65.8 MB de WASM, ~1.4 s de
init y booleanas de 55-62 ms, pero con exactitud de punto flotante real
(error relativo ~1.4e-14% en el mismo cilindro) y STEP/IGES nativos — la
única vía libre que resuelve ADR-0016 en su sentido literal. La sección
legal LGPL-2.1+Open CASCADE Exception cita el texto real de la excepción y se
ancla en el propio `check-dependency-licenses.mjs` del repo (LGPL* está en
`REVIEW_PREFIXES`: revisión legal humana obligatoria, no aprobación
automática). Veredicto condicional según cuál demanda se nombre; ninguna
integración se hizo. Directorio scratch de 137 MB borrado al cerrar.

**Portada (F7) — explorador de capacidades por pestañas.** Sustituye la
retícula de siete tarjetas por seis pestañas (Dibujo·Anotación·Entrega·3D·
Toolsets·Colaboración) en `CapabilityExplorer.tsx`, reutilizando capturas
reales del producto (verificadas pixel a pixel, reasignadas donde la captura
no correspondía a su pie original) y plantillas reales del catálogo; sin
ninguna imagen inventada. Los dos "arreglos urgentes" del encargo original se
confirmaron innecesarios (ver arriba). Gates verdes con evidencia: spec
nuevo, sistema de diseño (7 reglas), contrato de primitivas, honestidad
pública/SEO. **Todavía no**: el e2e de axe sobre `/` y el `npm test` completo
del monorepo no corrieron durante la ola (el árbol no estaba quieto — otra
ficha de la misma ola editaba el checkout en simultáneo); se corren en la
ventana de integración de todas formas, más abajo.

**EditorUX (F8) — los tres estorbos arreglados y verificados contra el editor
real con Playwright**, más un bloqueo de entorno resuelto de paso
(`packages/dwg-codec` nunca se había compilado, lo que rompía el typecheck).
La primera versión de esta ficha violó un candado real: subió el techo de
`Layout3DEditor.tsx` en `monolith-budget.json` (17235→17275) con
`--allow-growth`, y ese archivo declara "un archivo listado sólo puede
bajar". Se corrigió por extracción antes de integrar (ver más abajo).

**Arquitectura-Hueco (F3) — el encargo describía un estado que el repo ya no
tiene.** Con 127+37+51 aserciones reales ejecutadas
(`wall-openings.spec.ts`, `wall-solid.spec.ts`, `flatshot-solids.spec.ts`),
el hueco de una puerta/ventana YA recorta de verdad el contorno del muro en
planta (dos caras partidas por el vano, jambas reales), YA hace un corte
booleano real en el sólido 3D, y YA se resta en FLATSHOT/GLB — sin romper el
invariante paramétrico de `wall`/`opening`. La frase "hoy es bloque encima"
de la fila F3 de este mismo documento (arriba) era heredada de la plantilla
genérica del encargo y no describe este repositorio: se corrige aquí. El
único gap real adyacente (sub-conteo de ~1.4% en esquinas a inglete en el
cuadro de cantidades) ya tiene gate propio (`wall-takeoff-solid-parity.spec.ts`)
y es una decisión de negocio pendiente en `BACKLOG.md`, no un defecto técnico
de este frente. Ningún archivo se tocó.
