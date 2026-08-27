# BACKLOG — ordenado por lo que impide vender

Actualizado: 2026-08-22, campaña de cimientos. Cada entrada dice qué falla,
dónde, cómo se reproduce, qué criterio la cierra y qué prueba lo fija. El
orden dentro de cada nivel es el orden recomendado de ataque. Una entrada que
se cierre se BORRA de aquí con su commit en el mensaje — este archivo es la
cola viva, no el museo (el museo es `docs/history/`).

---

## P0 — impide vender o expone al dueño

### P0-1 · Los dos repositorios son PÚBLICOS y toda la gobernanza dice «confidencial»
- **Qué falla:** `Sergiovalle3121/valle-design` y
  `Sergiovalle3121/valle-design-dwg-conformance` responden 200 a un `curl`
  anónimo (verificado 2026-08-22 por API y navegador). LICENSE/NOTICE declaran
  software propietario confidencial. La visibilidad pública es además lo que
  hace funcionar la protección de rama en el plan Free — no es un accidente
  sin causa.
- **Dónde:** configuración del repositorio en GitHub; registro del hallazgo en
  `docs/governance/repository-protection-baseline.json`
  (`visibilityDecision`).
- **Decisión del titular (nadie más puede tomarla):** (a) volver ambos a
  privado y aceptar que la protección remota se apaga (los gates locales y el
  protocolo del titular ya la sustituyen operativamente); (b) GitHub Pro u
  organización: privado CON protección (~4 USD/mes); (c) público deliberado,
  asumiendo exposición del código propietario.
- **Runbook listo para ejecutar en cuanto se decida:** `docs/ops/runbook-repo-protection.md`
  (rescatado 2026-08-24 de `claude/pulido-ola0`) trae los comandos exactos —
  confirmar visibilidad actual, convertir a privado, verificar que branch
  protection/CODEOWNERS sobrevivan el cambio, escanear secretos en TODO el
  historial (no sólo HEAD, un repo público pudo haber sido clonado/forkeado
  antes), inventariar forks/releases/packages ya expuestos.
- **Criterio de aceptación:** la baseline registra la decisión con fecha y el
  gate `check:governance` la refleja; NOTICE y REPOSITORY_PROTECTION dejan de
  tener un asterisco.
- **Estimación:** 15 minutos una vez decidido.

### P0-3 · Las dos rutas de importación DXF divergen — encuadre de cámara YA cerrado; el re-encuadre de datos y el alcance de "unificar" quedan acotados por investigación real
- **Qué decía originalmente:** dos rutas con comportamiento distinto; una
  re-encuadra el plano automáticamente SIN registrar el desplazamiento
  (pérdida de georreferencia silenciosa — viola la garantía 5 del contrato de
  interop); tope de 50,000 entidades (`apps/web/src/lib/cad/dxf-import.ts:267`)
  y corte de ~850 objetos en la ruta editable, ninguno declarado.
- **Parte YA CERRADA — encuadre de cámara** (2026-08-25, campaña post-3D-M1,
  PR #99 + #102): el sub-hallazgo de encuadre de cámara (hallado cerrando
  P0-2, mismo origen) resultó ser dos cosas DISTINTAS, no una — investigado a
  fondo antes de tocar código (`docs/execution/CAMPANA_3D_POST_M1_20260825.md`).
  "Ajustar a la planta" (Shift+F) usa el footprint declarado A PROPÓSITO; NO
  es un bug. El bug real, más angosto: sólo el **encuadre inicial** al abrir
  un documento ignoraba el contenido — arreglado con un `useEffect` que
  reencuadra sobre el contenido real cuando es disjunto del footprint
  (`boundsIntersect`); los seis presets de cámara con nombre tenían el mismo
  problema y se cerraron en la misma fase (`camera-view-presets.ts`, quinto
  parámetro `content`). `e2e/golden/57-cad-utm-precision.spec.ts` ya no rodea
  el gap: prueba el arreglo con un footprint de sitio real (12×10 m).
- **Parte YA CERRADA — re-encuadre silencioso de DATOS al convertir** (mismo
  día, mismo PR de seguimiento): un agente de exploración read-only mapeó las
  dos rutas con cita `file:line` antes de tocar nada (evita repetir el error
  de asumir la causa desde la prosa del backlog). Hallazgo: hay realmente
  CUATRO caminos de lectura DXF, agrupables en dos — Route A (`DXFIN` +
  importación del dashboard, `dxf-import.ts`/`dxf-cad-document.ts`, proyección
  IDENTIDAD, sin re-encuadre) y Route B (`convertDxfPrimitivesToEditable` en
  `Layout3DEditor.tsx`, conversión del DXF de fondo a entidades editables +
  `Asset` de muro/zona heredados). El re-encuadre silencioso vive SÓLO en
  Route B, en `projectDxfPoint`/`dxfPrimitiveBounds`: resta el rectángulo
  envolvente del DXF para alinear con el backdrop, y ese desplazamiento nunca
  quedaba registrado. Cerrado: `describeDxfOriginOffsetLoss`/
  `buildDxfConversionLossManifest`
  (`components/cad/interop/dxf-editable-import-losses.ts`, 20 aserciones
  unitarias) declara el desplazamiento exacto (`dxf_import:origin_shifted`)
  en `document.lossManifest` — visible en el paquete de entrega y en el
  preflight de exportación, igual que el resto de las pérdidas de este mismo
  flujo. `e2e/golden/27-cad-dxf-loss-manifest.spec.ts` extendido, 3 corridas
  verdes. **Honesto sobre el límite:** esta ruta nunca fue un importador fiel
  de ida y vuelta (medio de lo que produce son `Asset` sin representación DXF
  propia, texto truncado a 80 caracteres) — el desplazamiento queda
  DECLARADO, no auto-revertido al reexportar; prometer lo segundo sería
  fingir una fidelidad que Route B nunca tuvo.
- **Hallazgo que CORRIGE la redacción original — los topes YA estaban
  declarados:** la misma investigación confirmó, cita por cita, que los
  cuatro topes numéricos del código (50.000 en `dxf-import.ts:267`, 40.000 en
  `components/cad/interop/dxf.ts:20`, 850 en `Layout3DEditor.tsx` y 1.500 en
  `dxf-walls.ts`) YA se declaraban al usuario cada uno por el mecanismo que le
  corresponde a su ruta (informe de fidelidad / `lossManifest` / toast — el
  modelo `Asset` heredado no tiene `lossManifest`, así que el toast es su
  mecanismo correcto, no uno degradado). El backlog original afirmaba lo
  contrario sin haberlo verificado contra el código; corregido aquí en vez de
  dejarlo pasar.
- **Qué queda abierto de verdad:** "UNA ruta" en el sentido literal de
  eliminar Route B no es el arreglo correcto — es una función de TRAZADO
  deliberadamente distinta (simplifica a muros/zonas editables desde un
  backdrop), no un segundo importador fiel compitiendo con `DXFIN`. Lo que
  sigue pendiente, si alguien lo prioriza: (a) reversión automática del
  desplazamiento de Route B al reexportar a DXF — exigiría un campo nuevo a
  nivel de documento (bump de esquema) más lógica de exportación, deuda
  aparte, no bloqueante; (b) el propio `parseDxf` (`components/cad/interop/dxf.ts`)
  también re-encuadra en silencio, pero sólo afecta el backdrop de referencia
  —de su propio comentario: "para usar como fondo, no para re-ingenierarlo"—
  nunca escribe en `CadDocument`, así que no es el defecto de pérdida de
  datos que temía esta entrada.
- **Prueba:** `components/cad/interop/dxf-editable-import-losses.spec.ts`
  (20/20) + `e2e/golden/27-cad-dxf-loss-manifest.spec.ts` (3/3 corridas
  vivas). **Estado:** cerrado en el alcance real verificado; lo que queda
  (a/b arriba) es deuda de seguimiento, no bloquea nada hoy.

---

## P1 — bloquea flujos que un despacho espera

### P1-2 · XATTACH por línea de comandos no puede adjuntar (falta la biblioteca)
- **Qué falla:** la orden está completa pero `context.xrefCatalog` nunca se
  provee; la vía gráfica sí adjunta (fetch asíncrono del asset del tenant).
- **Dónde:** `apps/web/src/lib/cad/engine/commands/xrefs.ts` (orden),
  `Layout3DEditor.tsx` → `fetchCadXrefSnapshot`/`attachProfessionalXref`.
- **Diseño:** petición de host asíncrona al patrón de PLOT: la orden emite
  `{kind:"xref-attach", assetId…}`, el anfitrión responde «adjuntando…»,
  reutiliza `attachProfessionalXref` y el resultado llega por `note()`. O
  bien: pre-cargar el catálogo del tenant (nombres, sin contenido) al montar
  y proveer `xrefCatalog` con snapshots bajo demanda.
- **Criterio:** `XATTACH nombre` adjunta lo mismo que la vía gráfica; el
  arnés de integridad lo reclasifica de honesto-limitado a delegado.
- **Estimación:** 1 día.

### P1-3 · BEDIT como editor real de bloques (hoy: puerta al panel)
La redefinición existe en el panel (redefine + versión propagada); falta la
edición EN SITIO de la definición. **Diseño esbozado:** modo de edición que
monta las entidades de la definición como documento temporal en el lienzo,
guarda de vuelta con `replace` de la definición + regeneración de inserciones
(el camino de `redefineProfessionalBlock` ya existe). **Criterio:** el
criterio `blocks.bedit` de la rúbrica pasa con evidencia real.
**Estimación:** 2–3 días.

### P1-5 · Marcar visibilidad por operación en el contrato OpenAPI
`x-visibility: public|internal|experimental` en las 79 operaciones de
`packages/contracts/specs/design-api.v1.yaml` + el gate del contrato exige la
marca en operaciones nuevas + publicar la lista `public` inicial (propuesta en
`docs/api/POLITICA-API-PUBLICA.md`). **Criterio:** `check:cad-contract` falla
ante operación sin marca. **Estimación:** medio día.

---

## P2 — deuda que crece con intereses

### P2-1 · Techos silenciosos de snap y selección (medir antes de subir)
`maxSegments: 96` del osnap, `search(..., 48)` de candidatos, tope 300 de
`selectNative` (QSELECT grande designa 300 y no lo dice), 4_096 del boundary.
**Criterio:** cada tope o se elimina con medición de coste, o se DECLARA al
usuario al alcanzarse. **Prueba:** spec de un QSELECT con 500 coincidencias.
**Estimación:** 1 día con mediciones.

### P2-2 · Intersecciones de snap sobre teselado en vez de analíticas
`curve-model.ts` tiene intersecciones analíticas; el snap de intersección usa
segmentos teselados en trazos densos → imanta a ~px del cruce real con curvas.
**Criterio:** intersección línea-arco exacta a 1e-9 en spec. **Estimación:**
1 día.

### P2-3 · architecture@100k a SLO (25.3 s → ≤5 s; 8.57 fps → ≥30)
El criterio `performance.architecture-100k` de la rúbrica lo mantiene visible
y RESTA hasta cumplirse. La campaña de pulido atacó el cuello el 22-08
(subida por lotes, atlas, culling): re-medir tras su merge y actualizar la
evidencia con máquina declarada. **Estimación:** heredar de pulido + 1 día de
medición honesta.

### P2-4 · Los majors de dependencias diferidos
TS7 (migración de tsconfig ×4), ESLint 10, TypeORM 1.x, next 16.3 (política de
App Control o `--webpack`), @types/node 26 (cuando el runtime sea 26),
Playwright 1.62 (ventana dedicada con regeneración de goldens en frío). Tabla
completa con el desbloqueo verificado de cada uno en
`docs/deps-majors-bloqueados.md` (migrado 2026-08-24 desde el PR #87, cerrado
sin fusionar — su `package.json` fijaba versiones bloqueadas, fusionarlo
habría sido una regresión). **Regla:** una ventana por grupo, nunca en mitad
de campañas de goldens.

### P2-5 · Bajar los avisos de lint por familias (presupuesto en `scripts/lint-budget.json`)
Web: 163 `react-hooks/refs` viven en el monolito — bajan al ritmo de
`DEUDA-MONOLITO.md`, no con parches cosméticos. API: 338 `no-unsafe-*`
concentrados en specs (tipar `response.body` con los tipos del SDK) y en
`migration-cli` + `cfdi-issuance.service.ts` (19, RUTA DE DINERO: tipar
primero). **Criterio:** el presupuesto baja en cada campaña que toque esos
archivos; `--update` committeado con el diff.

### P2-6 · CFDI contra el entorno de pruebas real del PAC
Herencia declarada: el flujo de timbrado está probado contra specs propios;
falta la corrida contra el sandbox real del proveedor. **Criterio:** un
timbrado y una cancelación reales en sandbox, con evidencia guardada.

### P2-7 · Exponer el consumo por organización (los datos YA se acumulan)
`UsageLedger` registra desde hoy documentos guardados/publicados. Falta:
métrica de almacenamiento (bytes de blobs por organización) y una pantalla o
endpoint interno «¿cuánto estamos usando?». **Estimación:** 1 día. Habilita:
responder al primer cliente enterprise.

### P2-8 · Mecanismo anti-pisado para PRs externos del corpus
Idea rescatada del PR #2 cerrado del repo de conformidad:
`pull_request_target` + verificador del commit base, para el día que se
acepten donaciones por PR de terceros. Hoy no hay superficie externa (bundles
firmados por el titular); activar SOLO con la primera donación externa.

### P2-9 · social-card y logo-geometry: dirección de imports
`lib/seo/social-card.tsx` está exento en `check:conventions` (importa
geometría del logo desde components/, y el gate del sistema de diseño lo
referencia por ruta). **Criterio:** `logo-geometry` a un módulo neutro
(config/brand), social-card junto a sus rutas OG, exención retirada (el gate
exige retirarla al sanar).

### P2-11 · Auditoría de veracidad de los `.md` vivos + índice de 30 segundos
- **Qué falta:** no hay una pasada sistemática que confirme que cada `.md`
  vivo bajo `docs/` (fuera de `docs/history/`, que ya se sabe archivo)
  describe el estado REAL del repo y no residuo de una decisión superada; ni
  un `docs/README.md` que oriente en 30 segundos a quien llega, con el mismo
  patrón que `docs/history/README.md` ya usa para sí mismo ("la verdad de
  hoy empieza en `IDENTITY.md` y sigue en `ARCHITECTURE.md`, `PRODUCT.md`,
  `REPOSITORY_SCOPE.md`…").
- **Origen:** se inició con subagentes en paralelo durante la campaña de
  cierre de ramas del 2026-08-24, pero no sobrevivió a una compactación de
  contexto (sin hallazgos recuperables en disco) y no respondía a un pedido
  explícito del titular — se documenta aquí en vez de relanzarse a ciegas
  sobre una premisa no verificada o perderse en silencio.
- **Alcance si se retoma:** pasada doc por doc bajo `docs/` contra el
  código/tests reales (no asumir, verificar cada afirmación como el resto de
  esta campaña); escribir `docs/README.md`.
- **Estimación:** medio día de auditoría + lo que cueste cada corrección
  real que aparezca.

---

## Herencias verificables de campañas anteriores (dueño: revisar informes)

- Bloques dinámicos (R.1 de pulido, criterio `blocks.dynamic` de la rúbrica).
- Nota de crédito CFDI (reserva de pulido).
- Kernel WASM con paridad verde Y enchufado (criterio `wasm` de la rúbrica:
  hoy nadie lo importa).
- Descomposición del monolito: método y meta en
  `docs/execution/DEUDA-MONOLITO.md`; primer escalón sugerido: los
  anfitriones de selección y capas.
- `npm run doctor` (R.5): diagnóstico de entorno de desarrollador nuevo
  (Node, PG, VALLE_DWG_CORPUS_MIRROR, puertos, App Control de Windows).
- Accesibilidad del embudo público con lector de pantalla real (R.4).
- Auditoría de arranque: qué se descarga antes del primer trazo (R.3).
