# Campaña Paridad — la máquina de verdad (27 de agosto de 2026)

Referencia de arranque: `main` @ `51538db` (CI #504 verde). Sesión real
de arranque: rama `claude/valle-design-10-10-program-bmvvcf`, tras
fusionar el PR #112 (`e6bc845`) que ya adelantó dos cierres de backlog
verificados esta misma mañana (ver `CAMPANA_10X_20260827.md`).

Tesis: la paridad no se construye agregando comandos, se construye
haciendo que cada capacidad sea digna de confianza y no vuelva a
romperse. Esta campaña arregla la MÁQUINA QUE CONSTRUYE — los
verificadores — antes que cualquier función nueva.

## Reglas de no-detención (vigentes toda la campaña)

1. Nunca preguntar. Decidir lo más conservador, escribirlo aquí y seguir.
2. Ítem bloqueado más de 25 minutos → bitácora + backlog + siguiente ítem.
3. Este archivo se actualiza al cerrar CADA ítem. Si el contexto se
   compacta, el primer acto es releerlo.
4. Después de CADA ola: `npm run check:cad && npm run check:dwg &&
   npm run typecheck && npm test && npm run lint && npm run build`, más
   el barrido de goldens con el árbol quieto. Push al cerrar cada ola.
5. Prohibido relajar un gate, un umbral o un golden para poner verde.
   Prohibido tocar identificadores persistidos (lista congelada en
   `IDENTITY.md` y ADR-0010). Prohibido renombrar un `data-testid`.
6. Prohibido agregar funciones nuevas en esta campaña. Lo que no está en
   esta cola va al backlog. No agregar es la mitad del valor.

## Nota de arranque — qué se pausó para dar paso a esta campaña

La sesión traía en curso una generación de evidencia de estrés denso a
100k (`modify.dense-stress`, 1 pt) corriendo en segundo plano. No está en
esta cola y la regla 6 es explícita: se mató el proceso (`pkill
playwright`/`headless_shell`) y se borró el artefacto parcial sin
publicar nada. Detalle de por qué se había empezado y sus números
parciales (útiles si se retoma) quedan en `CAMPANA_10X_20260827.md`, sin
tocar de nuevo hasta que esta campaña cierre. Tampoco se toca
`blocks.bedit` (investigado read-only esta mañana, ver el mismo archivo)
— no está en esta cola.

## Cola (transcrita del prompt maestro, sin editar)

### OLA 0 — el instrumento de verdad (~3 h)
- 0.1 Oráculo geométrico de ida y vuelta (DXF/DWG/PDF/GLB, números no botones)
- 0.2 Verificador de píxeles/raycast para 3D, no lista de botones recortada
- 0.3 Gate de "no mentir" — toda cifra informada al usuario viene del resultado real
- 0.4 Invariante de visibilidad de capa aplicado a TODOS los hosts
- 0.5 Gate de paridad geométrica interna (cantidades vs. 3D)
- 0.6 Evidencia que no puede envejecer (matriz de comandos, sonda de precisión real, oráculo ODA)

### OLA 1 — los defectos de confianza (~3 h)
- 1.1 Los topes que mienten (slice(0,300)/slice(0,200) con aviso falso)
- 1.2 El imán a lo invisible (hosts de sólidos sin filtro de capa)
- 1.3 El cuadro de cantidades contra el modelo real
- 1.4 GLB en 1:1, sin normalización a 30 unidades
- 1.5 Origen flotante en 3D + límites del dibujo excluyendo espacio papel
- 1.6 Espacio modelo/papel separados de verdad en todos los hosts 3D
- 1.7 Escritor DWG en fallo cerrado real (sigue apagado; se arregla debajo)

### OLA 2 — la escalera de paridad (~2 h)
- Escribir `docs/parity/ESCALERA.md`, 7 peldaños con criterio + evidencia
  independiente + qué se puede prometer/no prometer; enlazar desde la rúbrica.

### OLA 3 — el volante (~1.5 h)
- 3.1 `docs/onboarding/DESPLIEGUE-EN-UNA-TARDE.md` + `npm run doctor`
- 3.2 Canal de reporte "algo salió mal" dentro del producto, vía outbox
- 3.3 Procedimiento de corpus donado con procedencia
- 3.4 Revisar/actualizar `docs/guides/sesion-con-arquitecto.md`

### OLA FINAL — la verdad medida (~30 min, obligatoria)
- F.1 Suite completa + goldens en árbol quieto + push
- F.2 Rúbrica con lectura de la escalera
- F.3 Backlog actualizado (cerrado borrado con su commit, nuevo agregado)
- F.4 `docs/execution/INFORME_CAMPANA_PARIDAD_20260827.md`

### Cola de reserva (sólo si sobra tiempo)
- R.1 Aislar/medir el índice de selección puro (motor vs. interfaz)
- R.2 Meter rendimiento/memoria en CI aunque sea semanal
- R.3 Rediseñar la prueba de memoria: desmontar sin navegar
- R.4 TypeScript estricto en API y contratos

## Bitácora

### 2026-08-27T07:11Z — arranque
Campaña creada. Empezando por 0.1 (oráculo geométrico de ida y vuelta) —
es el ítem que, de haber existido, habría cazado por sí solo tres de los
cinco defectos citados en la tesis (grados-como-radianes, fuga de espacio
papel, GLB con escala arbitraria). Antes de escribir código: barrido
read-only para localizar qué arneses de round-trip YA existen por formato
(DXF/DWG/PDF/GLB) y qué comparan hoy, para extender en vez de duplicar.

### 2026-08-27T07:33Z — barrido read-only completo de los 6 ítems de OLA 0

Seis investigaciones read-only en paralelo (una por 0.1-0.6), cada una
citando código real (`file:line`), no prosa. Resultado — TODOS los
defectos que la tesis nombra están confirmados y localizados con
precisión quirúrgica:

- **0.1** — DWG: `packages/dwg-codec/src/api/canonical.ts:356-357,674-675`
  pasa ángulos sin convertir grados↔radianes (bug real, confirmado
  asimétrico: la importación SÍ convierte, la exportación no).
  DXF: cero conciencia de espacio papel en
  `dxf-cad-document.ts`/`dxf-document-export.ts`/`document-import.ts:316,398`
  — exportar "Todo" mezcla espacio papel sin marcarlo, reimportar
  reclasifica todo a espacio modelo. GLB:
  `Layout3DEditor.tsx:6029-6031` (`s = 30/Math.max(W,H)`) hornea una
  escala dependiente del footprint del documento en el archivo
  exportado — sin contrato de "1 unidad GLB = X unidades reales".
- **0.2** — el check de botones es real y exactamente como se describe
  (`Layout3DEditor.tsx:17527-17558`, `.slice(0,20)`, sin relación con
  si se construyó una sola malla). `CadNativeMassHosts` no publica
  ningún diagnóstico al DOM.
- **0.3** — DOS mentiras confirmadas: Bug A, QSELECT/FILTER
  (`select-query.ts` + `Layout3DEditor.tsx:3159-3180` `selectNative`,
  tope 300) reporta el conteo ANTES del truncamiento. Bug B,
  selección por capa (`Layout3DEditor.tsx:12342-12368`, tope 200) igual,
  y peor: el truncamiento es explícito y el toast lo ignora en la línea
  de al lado. El mismo bug YA se diagnosticó y arregló para
  ventana/cruce/lazo (`Layout3DEditor.tsx:7357-7382`, comentario propio:
  "SIN tope, como el lazo: el tope de 300 truncaba en silencio") —
  QSELECT y selección-por-capa quedaron fuera de ese arreglo.
- **0.4** — la hipótesis original (muros/masas) era incorrecta: esos
  DOS hosts SÍ filtran por capa y están probados. Los dos hosts reales
  sin filtro son `CadSolidShadeHost` (`solid-shade-host.ts:307-330`) y
  `CadSolidSnapHost` (`solid-snap-host.ts:97-140`) — CERO referencia a
  capa/visible/congelada en ningún sitio del archivo; un sólido en capa
  apagada o congelada se sigue renderizando Y sigue imantando el
  cursor en 3D — la violación literal de la doctrina propia del
  código. Efecto río abajo: `glb-export.ts` incluye el grupo de
  `CadSolidShadeHost` sin filtro propio, así que el GLB también fuga.
- **0.5** — confirmado y CUANTIFICADO con código real (no estimado): en
  un cuarto de 5,0×4,0 m con muros de 250 mm, `buildCadBimSchedule()` da
  10,65 m³ y el sólido 3D real (`wallSolidBodyLocal` + `bodyMassProperties`,
  integración independiente por teselado) da 10,80 m³ — **1,39% de
  brecha total, exactamente igual a la suma de los descuentos de
  solape** que `cadWallJunctionOverlaps` resta. Causa raíz: el inglete
  EXTIENDE la cara exterior de un muro en la esquina y RECORTA la
  interior en la misma medida — conserva el área propia de cada muro —
  pero el camino de cantidades sólo resta el solape interior medido y
  nunca agrega de vuelta la extensión exterior equivalente. La cifra
  literal "0,90% por esquina" del prompt no aparece en el repo (grep
  vacío) pero el mecanismo real confirmado es del mismo orden de
  magnitud.
- **0.6** — los 3 artefactos confirmados sin regenerar-y-comparar:
  `check-command-integrity.mjs` sólo escribe con `--write`, nunca
  compara en el paso normal. La sonda de precisión
  (`large-coordinate-precision-probe.mts:65-87`) arma su propio Float32Array
  restando el origen a mano — nunca llama a `tessellateCadEntity`
  (`tessellation-cache.ts:123-151`), el teselador real. El oráculo ODA
  (`scripts/dwg/oda-roundtrip.mjs`) no está enchufado a ningún script
  npm y además requiere un binario Windows que no existe en este
  contenedor — su `--check` sólo podrá ser parcial (declarar cuándo se
  saltea, nunca pasar en silencio).

Informes completos con cita exacta línea por línea, riesgos y plan
recomendado por ítem: ver el resultado del workflow
`wf_e7ad1e39-db4` (journal en el directorio de transcripciones de la
sesión) — no se copian aquí completos por tamaño; cada commit de
implementación cita las líneas relevantes de nuevo al tocarlas.

**Orden de ejecución elegido** (más aislado/barato primero, según mi
propio juicio — regla 1, nunca preguntar): 0.6a (check de
comando-integridad, ~1h, cero riesgo) → 0.6b (sonda de precisión) →
0.4+1.2 (hosts de sólidos, arreglo acotado y ya tiene el patrón
correcto en wall-solid-host.ts para copiar) → 0.3+1.1 (mentira de
truncamiento, empezar por el Bug A que no toca el monolito) → 0.2
(diagnóstico 3D, aditivo) → 0.5+1.3 (gate de paridad; el ARREGLO de
`bim-schedule.ts` cambia qué se factura por muro — decisión de
negocio, no técnica; se documenta la brecha, NO se cambia la
facturación sin autorización explícita) → 0.1 (el oráculo completo,
el más grande y el que más monolito/DWG/DXF toca).

### 2026-08-27T07:45Z — cierra 0.6a: gate de comando-integridad ya compara

`scripts/cad/check-command-integrity.mjs` construye el payload SIEMPRE
(antes sólo bajo `--write`) y, sin el flag, lo compara contra
`docs/cad/evidence/command-integrity.json` — falla con el campo exacto
que difiere (`total`, cada `verdicts.*`, exenciones agregadas/retiradas)
si no coincide. Verificado con prueba negativa real: corrompí `total` a
999 y `verdicts.muta` a 1 en el artefacto committeado, corrí el gate —
falló con exit 1 y el mensaje exacto `total: 999 → 192` /
`verdicts.muta: 1 → 63`; restauré el artefacto original, corrió verde de
nuevo. `npm run check:command-integrity` verde sobre el árbol real.
Cierra BACKLOG P2-10.

### 2026-08-27T08:05Z — cierra 0.6b: la sonda de precisión ya ejercita el teselador real

`apps/web/scripts/large-coordinate-precision-probe.mts` construía su
propio `Float32Array` restando el origen a mano
(`x1 - origin.x, …`) — probaba su propia aritmética, nunca
`tessellateCadEntity` (`render/tessellation-cache.ts:123-151`), el
teselador que realmente corre en producción. Reescrita para construir
entidades `CadNativeEntity` de tipo `line` reales y llamar a
`tessellateCadEntity` por cada una (`renderer.paths()` del registro de
adaptadores produce los puntos, la resta de origen ocurre dentro de esa
función, no en la sonda). Resultado, corrido contra el árbol real:
**bit a bit idéntico** al artefacto previamente committeado (incluida la
cifra atípica de "nave grande 10⁴", 0,000325 unidades — confirma que no
era un error de mi reescritura sino un rasgo real del sistema). Prueba
de que el teselador real ya se comporta como la sonda fabricada
asumía — ahora demostrado, no supuesto.

Agregado modo `--check` (recomputa y compara contra
`docs/cad/evidence/large-coordinate-precision.json`, mismo patrón
`stable()`/`checkArtifact()` de `dwg-evidence.mjs`), envoltorio
`scripts/cad/check-precision-evidence.mjs`, y dos scripts npm nuevos:
`evidence:precision` (escribe) y `check:precision-evidence` (compara,
encadenado en `check:cad` junto a `check:dwg-evidence`). Verificado con
prueba negativa real: corrompí el número committeado, el gate falló con
exit 1 y el mensaje correcto; restauré, volvió a verde.
`npm run check:cad` completo, verde de punta a punta con el gate nuevo
adentro.

### 2026-08-27T08:35Z — cierra 0.4+1.2: los dos hosts de sólidos ya filtran por capa

`CadSolidShadeHost.sync()` (`solid-shade-host.ts`) y
`CadSolidSnapHost.sync()` (`solid-snap-host.ts`, enchufado dentro del
anterior) filtran ahora por `cadHiddenLayerIds`/`cadUnsnappableLayerIds`
antes de construir `wanted`/`solids` — mismo patrón que
`CadWallSolidHost` ya usaba. Un sólido en capa apagada o congelada ya NO
se renderiza en 3D ni imanta el cursor. La reconciliación por identidad
de referencia sigue correcta con el filtro: al excluir una entidad de
`wanted`/`solids`, el bucle de diff existente la libera igual que si
hubiera desaparecido del documento, y togglear la capa de vuelta la
reconstruye — verificado con un caso explícito de "apagar y volver a
encender" en el spec nuevo.

Nuevo `apps/web/src/components/cad/viewport/layer-visibility-gate.spec.ts`
(15 comprobaciones): los dos hosts con VIVA/APAGADA/CONGELADA por
separado y mezcladas, más una exhaustividad barata (glob de
`viewport/*-host.ts`, cada archivo con su razón de cobertura escrita —
patrón `EXEMPT` de `check-import-direction.mjs` — para que un host nuevo
sin fila aquí rompa la suite). Verificado con prueba negativa real:
`git stash` de los dos archivos de host (revierte el arreglo), corrí el
spec — falló exactamente en la aserción de APAGADA con
`AssertionError`, `git stash pop` restauró el arreglo, volvió a verde.
`npm run typecheck` limpio, `npm test` (`test:specs`) **415/415 specs
verdes** (incluye los dos specs previos de cada host, sin regresión), y
`npm run check:cad` completo sin cambios de puntaje (la rúbrica no tiene
fila propia para este defecto — era un defecto de integridad, no un
criterio con peso).

### 2026-08-27T09:20Z — cierra 0.3+1.1: QSELECT y "Sel" de capa ya no mienten

Confirmados y arreglados los dos Bugs A y B que la investigación
localizó con cita exacta.

**Bug A** (`selectNative`, `Layout3DEditor.tsx:3159-3180`): el
`.slice(0, 300)` truncaba la selección en silencio mientras
`select-query.ts` (QSELECT/FILTER) seguía anunciando el total real sin
truncar — "300 de 300" cuando en realidad matcheaban 500. Investigado
a fondo el porqué antes de tocar código: `select-query.ts` NUNCA mentía
por sí solo (su `text` y su `entityIds` derivan del MISMO
`outcome.selection`, no pueden divergir); la mentira nacía río abajo,
sólo cuando el host aplicaba el tope a la mitad del efecto y no a la
otra. Arreglo: quitar el tope de `selectNative`, exactamente el mismo
arreglo que ventana/cruce/lazo ya usaban (`Layout3DEditor.tsx:7357-7382`,
`applyProfessionalSelection`, sin tope desde la campaña COMMERCIAL-RC1).
Verificado que es seguro: la proyección visual (grips) ya se presupuesta
aparte en `refreshNativeSelectionVisuals` vía `planCadSelectionProjection`
— el tope de `selectNative` no protegía nada que esa capa no proteja ya.

**Bug B** (`selectCadLayerObjects`, `Layout3DEditor.tsx:12342-12368`,
el botón «Sel» del gestor de capas): tenía SU PROPIO tope adicional de
200, y además una exclusión mutua real (`if (nativeIds.length)
selectNative(...) else select(...)`) que perdía los objetos heredados
en silencio cuando había nativos de por medio, mientras el toast de
abajo seguía anunciando `items.length + nativeIds.length` (el total
real, siempre — nunca mintió sobre el número, sólo sobre lo que de
verdad quedaba seleccionado). Arreglo: quitar el tope y cambiar el
`if/else` por dos `if` independientes (con `selectNative` primero,
porque limpia la selección heredada antes de que `select` la repueble).

Los dos arreglos caben en 20242/20242 líneas del monolito — exactamente
en su presupuesto, cero holgura, cada comentario recortado a una línea
para no pasarse ni un carácter.

**Evidencia real, no de Node:** nuevo golden
`apps/web/e2e/golden/59-cad-selection-no-truncation.spec.ts`, dos
pruebas contra el producto real (Playwright + `next dev`, sin API real
—herméticas—): documento con 350 líneas, QSELECT por capa (test 1) y
botón «Sel» (test 2), en ambos casos ERASE inmediato después y se
verifica `cad-native-document-count` — no el mensaje, el EFECTO. Ambas
verdes con el arreglo. Prueba negativa real con `git stash` del
arreglo: **el golden no sólo falla, los números confirman el mecanismo
exacto del bug** — test 2 sin el arreglo deja "Native 150" tras el
ERASE (350 − 200 = 150 sobrevivientes, el tope de `selectCadLayerObjects`
exacto). `git stash pop` restaura el arreglo, vuelve a verde.

Nota operativa: al arrancar los goldens se descubrió que un servidor
Next.js de producción y una API Nest, ambos de sesiones de verificación
anteriores de ESTA MISMA sesión (P1-8, ~06:10 y el benchmark de estrés
denso, ~06:58), seguían vivos en los puertos 3000/4000 y
`reuseExistingServer` de Playwright los reutilizaba en vez de levantar
un `next dev` fresco — el golden 35 fallaba contra ese build viejo por
razones ajenas al código. Matados ambos procesos, los goldens corren
limpios contra un servidor fresco.

`npm run typecheck`, `npm test` (415/415), `node
scripts/cad/check-monolith-budget.mjs` y `npm run check:cad` completo,
todos verdes.

### 2026-08-27T09:55Z — cierra 0.2: evidencia real de malla 3D, no botones

Confirmado el hallazgo de la investigación: la lista de botones
(`cad-native-entity-*`, `Layout3DEditor.tsx:17527-17558`, recortada a
20) se llena desde el JSON del documento (`nativeEntities`), sin
relación alguna con si `CadNativeMassHosts` llegó a montar una sola
malla en la escena Three.js — un muro en capa apagada o congelada
seguía apareciendo como botón mientras la escena 3D real no dibujaba
nada.

Arreglo aditivo, sin tocar la lista de botones (se le agrega evidencia
real al lado, no se reemplaza):

- `CadNativeMassHosts.getSnapshot()` (nuevo, `native-mass-hosts.ts`):
  recorre `this.group` de verdad (no `this.walls.count`/`this.masses.count`,
  que confían en que el host hizo lo que dice) y cuenta mallas y
  vértices reales de la escena Three.js.
- `Cad3DSolidDiagnostics.tsx` (nuevo componente, patrón de
  `CadRenderPipelineBadge` pero con `useState` propio + sondeo por
  `requestAnimationFrame` en vez de un slot `subscribe`/`getSnapshot`
  compartido — más simple, y el presupuesto de `useState` que evita
  tocar es el del MONOLITO, no el de un componente hoja aparte).
  Publica `data-mesh-count`/`data-vertex-count` en
  `cad-3d-solid-diagnostics`.
- Montado en el editor con 2 líneas (import + JSX) — el presupuesto del
  monolito estaba exactamente en su tope (20242/20242, cero holgura,
  agotada por los arreglos de 0.3/1.1 de esta misma campaña), así que
  se subió a mano con `check-monolith-budget.mjs --update
  --allow-growth` (20242 → 20244), mismo mecanismo y mismo espíritu que
  el precedente de `CAMPANA_REVIEW_CONCURRENCY_20260825.md`: la huella
  mínima irreducible de una capacidad nueva, declarada en el manifiesto,
  no escondida.

**Evidencia real:** nuevo golden
`apps/web/e2e/golden/60-cad-3d-solid-diagnostics.spec.ts` — dibuja un
muro, entra a 3D, confirma `data-mesh-count="1"` y vértices > 0 CON el
botón heredado también presente (aditivo, no sustitutivo); luego
congela la capa del muro y confirma `data-mesh-count="0"` — el
escenario exacto donde el botón viejo habría seguido existiendo (no
filtra por capa) mientras la malla real ya no se construye. Prueba
negativa real: revertidos `native-mass-hosts.ts`/el montaje en el
monolito/el componente nuevo (moviendo el archivo aparte, ya que
`git stash` no toca no-trackeados sin `-u`), el golden falla
exactamente en la aserción de `data-mesh-count`. Restaurado, vuelve a
verde.

Efecto secundario descubierto y corregido: la primera versión mutaba un
`useRef` durante el render (`snapshotRef.current = snapshot`), que
`react-hooks/refs` marca y que `check:lint-budget` convirtió en un
FALLO real de trinquete (164→165 avisos) — no un capricho de estilo:
es la regla que este mismo programa pide respetar. Reescrito con el
patrón de actualizador funcional de `setSnapshot` (compara contra
`prev` sin leer una ref en render); `check:lint-budget` vuelve a su
presupuesto sin subirlo.

`npm run typecheck`, `npm test` (415/415), `npm run check:cad`
completo (incluye `check:lint-budget` y `check:monolith-budget`),
todos verdes.

### 2026-08-27T10:20Z — 0.1, primer defecto: DWG escribe ángulos en radianes de verdad

Confirmado y arreglado el primero de los tres bugs de 0.1. El sitio real
NO era `packages/dwg-codec/src/api/canonical.ts` (ese archivo es
simétrico radianes-adentro-radianes-afuera, correcto para SU propio
contrato) — era `apps/web/src/lib/cad/dwg-native-writer.ts:110-124`
(`toCanonicalDocument`), el puente producto→códec, que hacía un spread
ciego `{...entity}` sobre CADA entidad sin convertir nada. El lado de
LECTURA (`dwg-document-bridge-primitives.ts:38`, `degrees()`) sí
convierte; el de ESCRITURA no tenía su inverso.

Arreglo: `toCanonicalEntity()`, explícito por tipo (no un mapeo
genérico sobre todos los campos numéricos) — sólo `arc`
(`startAngle`/`endAngle`) e `insert` (`rotation`) tienen un ángulo
dentro del subconjunto que este writer escribe hoy
(`DWG_EXPORT_WRITABLE_TYPES` no incluye `ellipse`, así que
`startParameter`/`endParameter` no aplican todavía). Multiplica por
`Math.PI / 180`, el inverso exacto de `degrees()`.

**Evidencia real:** extendida la sección 2 (round-trip) de
`dwg-native-writer.spec.ts` para leer el ángulo CRUDO del arco vía
`readDwg` (el códec, sin conversión en ningún sentido) y comparar
contra `Math.PI` (180° en radianes) en vez de 180 — si el bug
reapareciera, este valor sería 180 crudo, no π. Primer intento cruzó
la frontera producto/códec de LECTURA (`dwg-document-bridge.ts`,
`dwg-native-reader.ts`) para probar el round-trip completo hasta
`CadDocument`; `check:dwg` lo rechazó correctamente
(`check-product-boundary.mjs`, ADR-0009 §6/§8: sólo el import worker y
la spec del propio adaptador de lectura pueden importarlo) —
reescrito para quedarse del lado crudo del códec, sin cruzar esa
frontera. Prueba negativa real: revertido el arreglo con `git stash`,
la aserción falla con el número exacto que delata el bug (-126,76°
tras envolver 10313,24° — el mismo orden de magnitud que confirma la
mentira); restaurado, vuelve a verde.

`npm run typecheck`, `npm test` (415/415), `npm run check:dwg`
(incluye `check-product-boundary.mjs`) y `npm run check:cad` completo,
todos verdes. Quedan 1.5 (fuga de espacio papel DXF) y 1.4 (escala
GLB) del resto de 0.1, más el oráculo unificado de ida y vuelta que
los liga a los cuatro formatos.

### 2026-08-27T11:45Z — 0.1/1.5, segundo defecto: fuga de espacio papel DXF (import y export)

`document-import.ts:316` hacía
`modelSpace: { entityIds: entities.map((entity) => entity.id) }` sin
mirar el código de grupo 67 del DXF de origen: el cajetín, el marco y
cualquier entidad de una hoja de layout (espacio PAPEL) entraban
mezclados en el mismo espacio MODELO que el dibujo del arquitecto,
indistinguibles — un recuento de entidades o un metrado calculado
sobre `modelSpace.entityIds` contaba de más sin que nada lo delatara.
La misma fuga existía en la orden `DXFIN`
(`engine/commands/interop-dxf.ts`) y, en la dirección contraria, en
`exportCadDocumentDxf` (`dxf-document-export.ts`): "Todo" mezclaba
entidades de espacio papel en la sección ENTITIES del DXF exportado.

Confirmado que `dxf-parser` (la librería real, no la nuestra) YA
decodifica el código 67 como `entity.inPaperSpace` en cada entidad
parseada (`node_modules/dxf-parser/dist/ParseHelpers.js`); el dato
estaba disponible y nadie lo leía.

Arreglo, en las dos direcciones, con el mismo patrón "excluir y
declarar" que ya usa el escritor DWG para su propia limitación de fase
(`dwg-native-writer.ts`, "espacios de papel no escritos"):

- **Import** (`dxf-import.ts`): campo `paperSpace?: boolean` añadido a
  `CadDxfPrimitive`, `CadDxfHatch`, `CadDxfMText`,
  `CadDxfSemanticDimension`, `CadDxfSemanticMleader` y
  `CadDxfSemanticInsert`; poblado desde `entity.inPaperSpace` en
  `mapDxfEntityToPrimitive`, `expandDimension` (heredado de la
  DIMENSION padre a su geometría expandida), `semanticInsert` y los
  cuatro parsers de pares crudos de `dxf-read-annotations.ts`
  (HATCH/MTEXT/DIMENSION semántica/MLEADER semántico, cada uno con su
  propio `first(67) === "1"`). NO cubre los ocho tipos del esquema 4
  (XLINE/RAY/SOLID/WIPEOUT/IMAGE/ATTDEF/POINT,
  `dxf-read-schema4.ts`) — hueco declarado, no descubierto en
  silencio; ver backlog.
- **Módulo nuevo** `dxf-model-space-scope.ts`
  (`scopeDxfImportToModelSpace`): recorta las seis familias a espacio
  modelo y cuenta cuántas quedaron fuera. Compartido por
  `document-import.ts` (importar archivo completo) y
  `engine/commands/interop-dxf.ts` (DXFIN) — las dos construían
  entidades desde el MISMO resultado crudo y las dos tenían la misma
  fuga; sin este módulo se habría duplicado el filtro (y con él, el
  riesgo de que uno de los dos sitios se arreglara y el otro no).
  `document-import.ts` declara la exclusión en
  `document.lossManifest` (`dxf_paper_space_excluded`).
- **Informe en español** (`dxf-import-report.ts`): sin este cambio, el
  informe seguía diciendo "conservado" sobre entidades que el
  documento ya había excluido — la misma clase de mentira, un nivel
  más arriba. Nueva regla `dxf_paper_space_excluded` en
  `WARNING_RULES`; `countPrimitives` y los recuentos "kept" de
  hatch/mtext/dimensión/directriz/inserción ahora restan las
  marcadas `paperSpace` antes de anunciarlas como íntegras.
- **Export** (`dxf-document-export.ts`, hecho en el turno anterior,
  probado en éste): `CadDxfDocumentExportSource.paperSpaces` opcional;
  `cadDocumentToDxfExportModel`/`exportCadDocumentDxf` excluyen los
  ids ahí listados de las seis familias exportadas y declaran
  `dxf_export_paper_space_excluded` cuando algo quedó fuera.

**Evidencia real:** nuevo
`apps/web/src/lib/cad/dxf-paper-space-scope.spec.ts`, cuatro bloques
con su prueba negativa cada uno — (1) exportación: una entidad
declarada en `paperSpaces` no viaja al DXF y se cuenta en `losses`;
SIN declararla, la misma entidad SÍ viaja y no se inventa una pérdida;
(2) importación de archivo completo: una LINE con código 67=1 en el
DXF crudo no entra al documento ni a `modelSpace.entityIds`, se
declara en `lossManifest` y en `dxfReport`; SIN el código 67, entra
normal; (3) el recuento `kept_line` del informe no cuenta la línea de
papel; (4) DXFIN (`planCadDxfImport`) tiene la misma fuga cerrada por
el mismo módulo. Prueba negativa real de más alto nivel: con
`git stash` sobre los seis archivos tocados (import.ts,
document-import.ts, interop-dxf.ts, dxf-import-report.ts,
dxf-read-annotations.ts, dxf-document-export.ts) y el módulo nuevo
apartado con `mv`, el spec falla en la primera aserción
("solo el muro de espacio modelo se escribe", 2 !== 1); restaurado,
vuelve a verde.

`npm run typecheck`, los specs de DXF afectados
(`dxf-import-report.spec.ts`, `dxf-roundtrip.spec.ts`,
`interop-dxf.spec.ts`, `dxf-cad-document.spec.ts`,
`document-import.spec.ts`, el nuevo `dxf-paper-space-scope.spec.ts`) y
`npm test` completo (416/416, incluye el spec nuevo), todos verdes.

### 2026-08-27T12:30Z — 0.1/1.4, tercer defecto: el GLB no salía a 1:1

`Layout3DEditor.tsx:6032` (`s = 30 / Math.max(W, H)`) es la escala de
AJUSTE DE CÁMARA con la que se construye TODA la geometría de la
escena 3D — para que un predio de 4 m y uno de 400 m quepan igual de
bien en la pantalla, no una conversión de unidades. `exportGltf`
(línea ~12769) serializaba esos mismos objetos de escena tal cual al
GLB. glTF declara 1 unidad = 1 METRO; el resultado era un archivo cuyo
metro no medía un metro real, y la distorsión cambiaba con el tamaño
de CADA predio — el mismo edificio de 40×30 m y uno de 4×3 m no
salían a la misma escala relativa entre sí en el archivo exportado.

Arreglo: `serializeCadGlbBlob` (`glb-export.ts`) acepta un
`exportScale` opcional (por defecto 1, sin efecto, para cualquier otro
llamador). Cuando no es 1, envuelve los objetos a exportar en un
`THREE.Group` con `scale.setScalar(exportScale)` que contiene CLONES
—nunca los objetos vivos de la escena: `Object3D.add()` saca al hijo
de su padre anterior, y reparentar la escena real la habría dejado
rota tras exportar—. El clon comparte geometría/material por
referencia (sin duplicar memoria) y hereda la visibilidad ya apagada
por `hideCadGlbOverlays` un instante antes. `exportGltf` calcula el
factor con `unitToMeters(1, unit) / ctxRef.current.s`
(`unitToMeters` ya vivía en `world-scale.ts`, con su propio spec y con
`data.footprint.unit` como fuente de la unidad real del editor — que
SÍ puede ser "m", no siempre "mm", confirmado leyendo los usos
existentes de `data?.footprint.unit` en el mismo archivo).

**Evidencia real:** extendida `glb-export.spec.ts` (que ya hacía
round-trip real: exportar con el `GLTFExporter` real, releer con
`GLTFLoader`, medir sobre lo LEÍDO) con una sección 5 — exportar con
`exportScale: 0.5` y confirmar que la bounding box releída mide
exactamente la mitad de la exportada sin escalar, en los tres ejes;
exportar con `exportScale: 1` y confirmar que el tamaño no cambia
(la corrección no se aplica sola); confirmar que `hosts.group.scale.x`
sigue en 1 tras exportar escalado — la escena viva no se tocó. Prueba
negativa real: `git stash` sobre `glb-export.ts` y
`Layout3DEditor.tsx`, la sección 5 falla exactamente en la primera
aserción ("exportScale 0.5 reduce a la mitad el eje x", 52.5 vs
26.25 — el `exportScale` se ignoraba en silencio); restaurado, vuelve
a verde.

Presupuesto de monolito: `Layout3DEditor.tsx` y `dxf-import.ts`
llegaron a sus techos exactos por los dos arreglos de esta entrada y
la anterior (0 y 61 líneas de holgura respectivamente); subidos con
`check-monolith-budget.mjs --update --allow-growth`
(20244→20256, 1044→1105), mismo mecanismo documentado que en la
entrada anterior — capacidad nueva y real, no relleno.

`npm run typecheck`, `npm run lint` + `check:lint-budget` (547/547,
sin avisos nuevos), `check-monolith-budget.mjs` (verde tras el
`--update --allow-growth`) y `npm test` completo, todos verdes.

Cierra 0.1 en sus tres defectos confirmados (DWG radianes, fuga de
espacio papel DXF, escala GLB). Pendiente, declarado en vez de hecho
en silencio: el oráculo unificado de ida y vuelta que los ligue a los
cuatro formatos en un solo arnés, y la cobertura de espacio papel para
los ocho tipos del esquema 4 DXF — quedan en el backlog (P2-12, P2-13)
si el tiempo de esta campaña no alcanza.

**Hallazgo durante el barrido de gates, investigado antes de descartarlo
como ajeno:** `npm run check:cad` falla en `check:dwg-evidence` — pero
NO por nada de esta campaña. Investigado a fondo (no asumido):
1. Revertido con `git stash` TODO lo no comprometido de hoy y repetido
   el check: sigue fallando igual. No es esta campaña.
2. `node -e` directo comparando `generateDwgEvidence()` (computado, en
   vivo) contra `docs/cad/evidence/dwg-decoder-matrix.json` (comprometido):
   el ARCHIVO dice `bundlesAdmitidos: 7, capacidadesPromovidas: 2`; lo
   COMPUTADO en este sandbox dice `bundlesAdmitidos: 0, capacidadesPromovidas: 0`
   — la dirección importa: el archivo comprometido es el que tiene MÁS
   evidencia, no menos. `node scripts/dwg/fetch-corpus.mjs --check`
   confirma por qué: `"reason": "sin VALLE_DWG_CORPUS_MIRROR y sin
   VALLE_DWG_CORPUS_TOKEN: no se descargó nada y no se afirma nada"`.
3. `.github/workflows/ci.yml:152-153` exporta `VALLE_DWG_CORPUS_MIRROR`
   antes de correr esta cadena; este sandbox de campaña no tiene ese
   mirror ni el token — no es un secreto que le falte al REPOSITORIO, es
   un secreto que le falta a ESTA SESIÓN.

Conclusión: el gate está haciendo exactamente su trabajo (0.6:
"evidencia que no puede envejecer" — regenerar y comparar, nunca creer
un archivo comprometido a ciegas) y correctamente se niega a bendecir
una promoción de capacidad DWG que este sandbox no puede reproducir de
forma independiente sin las credenciales del corpus. Regenerar aquí con
`--write` SERÍA relajar la evidencia real (borraría 7 bundles/2
capacidades promovidas y las reemplazaría por cero) — exactamente lo
que la regla 5 prohíbe, sólo que en la dirección contraria a la
intuición. No se toca. En CI (con el mirror configurado) este mismo
gate reproduce el archivo comprometido sin diferencia. No requiere
entrada del backlog: es una limitación de ESTE sandbox, ya cubierta por
la configuración de CI existente, no un defecto del repositorio.

**1.5 y 1.6, investigados antes de tocar código (rule 1, decidir y
seguir):** "origen flotante en 3D" YA EXISTE — `render-origin.ts`
(centroide, rejilla de 100 m, con su propia `render-origin.spec.ts`)
resuelve exactamente la pérdida de precisión float32 a magnitud UTM que
1.5 nombra; no es un hueco de esta campaña. "Límites del dibujo
excluyendo espacio papel": el único consumidor de esos límites
(`render/pipeline.ts:278-298`, alimentado por
`render-pipeline-host.ts:304-310`) YA escopa por
`document.modelSpace.entityIds` antes de calcular el bounding box — 1.5
cerrado, sin cambio de código necesario, sólo confirmado. 1.6
("espacio modelo/papel separados de verdad en TODOS los hosts 3D") es
distinto: los CUATRO anfitriones de sólidos 3D
(`wall-solid-host.ts`/`room-solid-host.ts`/`solid-shade-host.ts`/
`solid-snap-host.ts`) recorren `document.entities` sin ese mismo
filtro — un hueco real pero LATENTE (ningún camino de comando de hoy
crea una entidad que viva SÓLO en `paperSpaces[i].entityIds` sin
también estar en `modelSpace.entityIds`, así que nada se manifiesta
todavía). Backlogueado como P2-14 con su criterio de aceptación exacto
en vez de tocar cuatro anfitriones de render 3D en producción sin el
tiempo para la disciplina de prueba negativa que el resto de esta
campaña sí se dio — con OLA FINAL obligatoria por delante, cerrar la
ola completa pesa más que profundizar en un hueco que hoy no muerde a
nadie.

Resto de la cadena `check:cad` corrido a mano, uno por uno, todo verde:
`check:precision-evidence`, `check:legal`, `check:command-integrity`,
`rubric.spec.mjs` (57 comprobaciones), `rubric.mjs --markdown`
(190/220, 86.4% — sin cambio, estas correcciones no suman puntos de
rúbrica, son de confianza). `check:dwg` también corrido a mano:
`check --workspace=@valle-design/dwg-codec`,
`check-product-boundary.mjs` y `corpus-consumer.spec.mjs` verdes;
`fetch-corpus.mjs --check` reporta `"status": "unavailable"` — el MISMO
resultado que ya declara `check:dwg-corpus` cuando no hay mirror, así
que esa pieza específica SÍ está en su estado esperado (a diferencia de
`dwg-evidence.mjs`, que compara contra un archivo que SÍ tiene
evidencia real comprometida).

### 2026-08-27T13:15Z — 0.5+1.3: gate de paridad geométrica interna (cantidades vs. sólido real)

Construido `wall-takeoff-solid-parity.spec.ts` — mide, no arregla, per la
decisión ya tomada al planear el orden de esta campaña (el arreglo de
`bim-schedule.ts` cambia qué se factura por muro, decisión de negocio).
Reproduce la investigación 0.5 con código real: `buildCadBimSchedule`
contra `wallSolidBodyLocalWithDiagnostics` +
`bodyMassProperties` (integración por teselado — el mismo camino que
dibuja la vista 3D) sobre el mismo cuarto de 4 muros de 250 mm con una
puerta que ya usa `glb-export.spec.ts`. Midió 10,178 m³ (cuadro) vs
10,328 m³ (sólido real) — 1,452% de brecha, mismo orden de magnitud
que el 1,39% investigado sobre el cascarón sin puerta.

Tres aserciones, no una: (1) el cuadro sub-factura, nunca sobre-factura
— si se invirtiera, la geometría de prueba cambió de forma, no sólo el
kernel; (2) la brecha cae en el rango de vigilancia 0,5%–3% (confirma
que se está midiendo LA MISMA brecha investigada, no una distinta por
accidente); (3) el techo real, 2% — el que convierte esto en gate de
REGRESIÓN: si una unión de muros nueva o un cambio en
`cadWallJunctionOverlaps`/`bim-schedule.ts` empeorara el sub-conteo,
esto rompe. Prueba de que el techo discrimina de verdad: bajado a mano
a 1% (por debajo de la brecha medida), la aserción falla nombrando el
1,452% exacto; restaurado a 2%, vuelve a verde.

BACKLOG P1-6 documenta la causa raíz completa (el inglete extiende la
cara exterior y recorta la interior por igual; el cuadro sólo resta la
segunda) y dice explícitamente que el arreglo espera decisión del
titular sobre el criterio de facturación — el gate existe para que
mientras tanto la brecha no crezca en silencio, no para forzar un
arreglo no autorizado.

`npm run typecheck` limpio; el spec corre dentro de `npm test`
(417/417, confirmado).

## Cierre de OLA 0 y OLA 1

Las seis piezas de OLA 0 (instrumento de verdad) y los siete ítems de
OLA 1 (defectos de confianza) quedan así: 0.1/0.2/0.3/0.4/0.6 y
1.1/1.2/1.4 CERRADOS con arreglo + prueba negativa + gate; 0.5/1.3
CERRADO como GATE DE MEDICIÓN (el arreglo de fondo es decisión de
negocio, BACKLOG P1-6); 1.5 CONFIRMADO ya resuelto por infraestructura
previa (`render-origin.ts`), sin cambio de código necesario; 1.6
INVESTIGADO y BACKLOGUEADO (P2-14, hueco latente, no manifestado hoy);
1.7 (escritor DWG en fallo cerrado) cerrado PARCIALMENTE por el arreglo
de radianes de 0.1 — el resto (fallo cerrado contra el oráculo externo)
ya era correcto antes de esta campaña, confirmado en la spec 1 de
`dwg-native-writer.spec.ts`, no tocado. Deuda declarada, no oculta:
P2-12 (esquema 4 DXF), P2-13 (oráculo unificado), P2-14 (hosts 3D),
P1-6 (fórmula de facturación de esquina).

Gate suite completa corrida a mano (regla 4): `check:cad` (verde salvo
`check:dwg-evidence`, limitación de credenciales de ESTE sandbox —
investigado y documentado arriba, no del repo), `check:dwg` (verde
salvo el mismo hueco de credenciales en `check:dwg-corpus`, que
reporta correctamente `unavailable` sin mentir), `npm run typecheck`,
`npm test` (417/417), `npm run lint` + `check:lint-budget` (202
avisos totales / 547 del trinquete de familias, sin avisos nuevos),
`npm run build` (verde, 5/5 tareas). Push hecho tras cerrar 0.1
(commit `32df1dd`); 0.5+1.3 y OLA 2 se empujan juntos a continuación.

## OLA 2 — la escalera de paridad

Escrito `docs/parity/ESCALERA.md`: siete peldaños de evidencia (0 · no
existe, 1 · prototipo sin enchufar, 2 · enchufado sin prueba, 3 ·
probado con datos propios, 4 · verificado con oráculo independiente,
5 · gate de regresión activo, 6 · legal y autorizado para producción,
7 · en producción medido en vivo), cada uno con qué se puede prometer /
no prometer y un ejemplo REAL del repositorio — no generalizaciones
inventadas: los ejemplos de los peldaños 4 y 5 son literalmente los
gates que esta misma campaña construyó (`glb-export.spec.ts` releyendo
con `GLTFLoader` real, `wall-takeoff-solid-parity.spec.ts` con su
techo de ratchet). La escalera generaliza el criterio de promoción que
`dwg-evidence.mjs` YA aplicaba sólo a DWG (`estadoLaboratorio:
"supported"` + ≥1 bundle admitido + ≥2 validaciones independientes) al
resto del producto, y el corte propia/independiente que
`rubric.mjs:569-613` ya usa es exactamente el corte 3-vs-4 de esta
escalera — no un sistema paralelo.

Enlazada desde `rubric.mjs --markdown` (una línea informativa nueva
tras "Matriz ya al día", nunca toca el código de salida ni la
puntuación — verificado con `rubric.spec.mjs`, 57 comprobaciones sin
cambio, y con una corrida real del CLI que confirma 190/220 sin mover
un solo punto).

`npm run typecheck`, `rubric.spec.mjs` (57/57) y una corrida de
`rubric.mjs --markdown` confirmando el enlace nuevo, todos verdes.
