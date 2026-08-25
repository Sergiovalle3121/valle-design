# Campaña 3D — siguiente fase tras 3D-M1 (25 de agosto de 2026)

Continuación directa de `CAMPANA_3D_M1_20260824.md` (cerrada, PR #99), por
directiva del titular tras el cierre de esa campaña: "no te detengas, vete
en cascada, mergea y dale con la siguiente fase". Mismo entorno de sesión
remota (rama dedicada + PR en vez de push directo a `main`).

## Elección de la siguiente fase

Sin una directiva más específica que "la siguiente fase", se optó por la
opción CONSERVADORA sobre la ambiciosa: en vez de arrancar una pieza nueva y
grande desde cero (p. ej. un plano de corte/cutaway real en el visor 3D en
vivo — la más grande de las anotadas como abiertas en el informe de cierre
de 3D-M1), se retomó **P0-3 del backlog**: la severidad más alta entre lo
que quedó documentado como abierto, ya diagnosticado con precisión durante
la propia campaña 3D-M1 (al cerrar el origen flotante, P0-2), con una
reproducción viva ya escrita (golden 57) que lo rodeaba a propósito sin
arreglarlo. P0-1 (visibilidad de los repositorios) queda fuera: es una
decisión que sólo puede tomar el titular.

## El hallazgo, investigado a fondo antes de tocar código

La lectura inicial de P0-3 en el backlog ("Ajustar a la planta' y el
encuadre inicial encuadran sobre el footprint declarado, nunca sobre los
límites reales de las entidades") resultó IMPRECISA en un punto: existen DOS
comandos de encuadre distintos y semánticamente DIFERENTES, no uno solo:

- `fitView("all")` ("Ajustar a contenido", tecla F) — YA usaba
  `worldBounds("all")`, los límites reales de TODO el contenido del
  documento. Ya funcionaba correctamente para un documento UTM, desde antes
  de esta fase.
- `fitView("plant")` ("Ajustar a la planta", Shift+F) — usa el footprint
  declarado A PROPÓSITO; es un comando distinto, no un bug, para cuando el
  usuario quiere ver el sitio declarado en vez del contenido.

El bug real, más angosto de lo que sugería la redacción del backlog: el
**encuadre inicial** al abrir un documento (`useEffect` que sigue a
`applyInitialCameraFraming` en `Layout3DEditor.tsx`) usaba EXCLUSIVAMENTE el
footprint declarado, sin considerar el contenido — así que un documento con
entidades a magnitud UTM sobre un footprint de sitio normal (12×10 m sin
extender a mano) abría mostrando el vacío, y nada en la interfaz explicaba
por qué ni sugería pulsar F.

## El arreglo

`Layout3DEditor.tsx`: un `useEffect` nuevo, colocado DESPUÉS de la
declaración de `worldBounds`/`fitToBounds`/`fitView` (no junto al otro
`useEffect` de encuadre inicial, que los declara ANTES en el archivo) — el
primer intento los referenciaba desde ahí y el plugin de ESLint del
compilador de React (`react-hooks/immutability`) lo marcó correctamente como
un acceso-antes-de-declarar: funciona en JS puro (la clausura no se ejecuta
hasta después del commit), pero rompe la capacidad del compilador de
reaccionar si esas funciones alguna vez cambiaran — un hallazgo genuino, no
un capricho de lint, corregido moviendo el efecto a su posición correcta en
vez de silenciarlo con un comentario de exclusión.

El propio arreglo, ya en su posición correcta:

```ts
// Footprint sin las entidades (p.ej. UTM) encuadraría al vacío — P0-3.
useEffect(() => {
  const ctx = ctxRef.current;
  const content = open ? worldBounds("all") : null;
  if (!ctx || !content) return;
  if (!boundsIntersect(content, { minX: 0, minY: 0, maxX: ctx.W, maxY: ctx.H }))
    fitToBounds(content);
}, [open, data?.footprint.footprintW, data?.footprint.footprintH, worldBounds, fitToBounds]);
```

Deliberadamente CONSERVADOR: sólo overridea el footprint cuando el contenido
y el footprint son completamente DISJUNTOS (`boundsIntersect` de
`lib/cad/entity-hit-geometry.ts`, ya existente y usado en toda la selección
por ventana) — un documento con contenido dentro o superpuesto al footprint
(el caso común) no cambia de comportamiento en absoluto. Sólo el caso
patológico (contenido fuera del todo, como UTM sobre un footprint pequeño)
dispara el reencuadre automático.

## Hallazgo aparte, documentado y NO arreglado en esta fase

Los seis presets de cámara del visor 3D en vivo (Corte F de 3D-M1,
`camera-view-presets.ts`) siguen encuadrando puramente sobre el footprint.
Si un usuario abre un documento UTM (el encuadre automático ya trae el
contenido a la vista) y luego hace clic en cualquier preset con nombre
(iso/superior/frontal/posterior/lateral), la cámara volvería a apuntar al
footprint vacío. Arreglar esto es un cambio de forma DISTINTA al de este
corte: cada preset fija una DIRECCIÓN con nombre (no sólo un encuadre), así
que el arreglo tendría que preservar la dirección pero cambiar QUÉ se
encuadra — una extensión de `applyCadCameraViewPreset` con un bounds
opcional, no una reutilización directa de `fitToBounds`. Anotado para un
corte futuro; no bloquea el cierre de esta fase.

## Verificación

- `npm run typecheck` (apps/web): limpio.
- `node scripts/cad/check-monolith-budget.mjs`: OK, `Layout3DEditor.tsx` en
  20244/20245 líneas (1 línea de margen).
- `npm run check:lint-budget`: OK, 547/547, sin regresión — el primer
  intento (efecto colocado antes de su dependencia) sí regresionó 4
  categorías de aviso del compilador de React; corregido reubicando el
  efecto, no silenciándolo, antes de volver a correr el trinquete.
- `node scripts/run-specs.mjs` (apps/web): 405/405 verdes, sin cambio.
- Golden 57 (`e2e/golden/57-cad-utm-precision.spec.ts`), REESCRITO para
  probar el arreglo en vez de rodearlo: footprint devuelto a 12×10 m real
  (antes 520.000×2.160.000, la extensión que evitaba el bug), y quitados los
  clics en "Vista superior" y "Ajustar a la planta" — las aserciones de
  visibilidad/render sólo pasan si el encuadre AUTOMÁTICO al abrir ya trajo
  las entidades UTM a la vista, sin que el usuario tenga que saber que hace
  falta pulsar algo. **3 corridas consecutivas, verde las tres.**
- Goldens adyacentes re-ejecutados sin cambio (verifican que el nuevo efecto
  no interfiere con documentos cuyo contenido SÍ vive dentro del footprint,
  el caso común): 47, 48, 53, 54, 58 — 7/7 pruebas verdes.

## Pieza 2: los presets de cámara también prefieren el contenido real

El hallazgo aparte documentado en la pieza 1 (golden 57) se cerró en la
misma fase, sin esperar a un corte separado: los seis presets de cámara del
visor 3D en vivo (`viewPreset()`, `camera-view-presets.ts` de Corte F)
encuadraban puramente sobre el footprint — un clic en cualquiera de ellos
DESPUÉS de que el encuadre automático trajera contenido UTM a la vista
devolvía la cámara al vacío.

`applyCadCameraViewPreset` gana un quinto parámetro OPCIONAL, `content`: si
se da y es disjunto del footprint (mismo criterio que P0-3,
`boundsIntersect`), sustituye al footprint como lo que el preset encuadra —
la DIRECCIÓN nombrada del preset (arriba/frente/atrás/izquierda/derecha) se
conserva, sólo cambia el centro y la distancia. Sin `content`, o cuando se
superpone al footprint, el resultado es bit-idéntico al de antes (probado
explícitamente). `Layout3DEditor.tsx`: `viewPreset()` ahora pasa
`worldBounds("all")` como ese quinto argumento — cambio de una sola línea,
sin costo de presupuesto de monolito.

**Segundo hallazgo del compilador de React, mismo tipo que en la pieza 1**:
`viewPreset` (una función plana, no un hook) estaba declarada ANTES que
`worldBounds`/`fitToBounds` en el monolito. A diferencia del primer hallazgo
(que rompía `react-hooks/immutability` directamente), aquí el efecto fue
indirecto — el trinquete de lint bajó por `react-hooks/preserve-manual-memoization`
(3 avisos nuevos, presupuesto 1): el compilador dejó de poder preservar la
memoización de `fitView` y del efecto de encuadre inicial, ambos genuinamente
memoizados, porque ya no podía razonar con confianza sobre todo el grafo de
dependencias que pasa por `worldBounds`. Mismo diagnóstico, mismo arreglo:
reubicar `viewPreset` después de `worldBounds`/`fitToBounds` (no silenciar),
trinquete de vuelta a 547/547 tras el cambio.

Cubierto con:
- `camera-view-presets.spec.ts`: 5 aserciones nuevas (16 en total) —
  contenido superpuesto al footprint da el mismo resultado que sin contenido
  (aritmética exacta, presets "front" y "top"); contenido disjunto encuadra
  sobre el contenido real conservando la dirección del preset, con el target
  en su centro.
- Golden 57 extendido con una quinta aserción: tras las cuatro que prueban
  el encuadre automático, un clic en "Vista superior" y las tres entidades
  siguen visibles — antes de este cambio, ese clic las habría sacado de
  vista. **3 corridas consecutivas, verde las tres** (incluida esta quinta
  aserción). Goldens 47/48/53/54/58 re-ejecutados sin cambio.

## Estado

Ambas piezas completas y verificadas, en un solo commit (fix + spec + golden
extendido), en la rama de seguridad `claude/valle-design-p0-3-encuadre-utm`
(empujada), NO en `claude/valle-design-3d-campaign-t0zzad` (la de PR #99):
mezclarlas habría reabierto el alcance ya cerrado y documentado de ese PR.

**PR #99 volvió rojo**: el job `E2E Playwright` falló con 5 pruebas caídas,
ninguna tocando el diff de 3D-M1 — dos ya documentadas como intermitentes
preexistentes en `BACKLOG.md` (P1-1/P1-1b) y tres en dominios sin relación
(multipestaña offline, checkout fiscal, CRUD genérico de documentos),
cada una ya reintentada una vez por CI y roja las dos veces — consistente
con contención de recursos en una corrida de 124 pruebas/~42 min contra
Postgres real, no con 5 regresiones reales en subsistemas que este PR no
toca. Sin permiso para relanzar sólo los jobs caídos (`rerun_failed_jobs` →
403 de esta integración), así que no hay una re-corrida limpia propia que
lo confirme del todo — diagnóstico publicado como comentario en el PR
#99 y quedó en observación (el chequeo programado se re-arma solo).

**Actualización — PR #99 fusionado.** Sergio autorizó explícitamente el
merge en esta misma conversación ("no te detengas vete en cascada, mergea y
dale con la siguiente fase", reiterado) con el diagnóstico ya publicado como
comentario en el PR. `merge_pull_request` sobre PR #99 devolvió primero un
405 ("Merge commits are not allowed on this repository") — el repositorio
exige squash o rebase, no merge simple — y tuvo éxito con `squash`: commit
`20500d5c67350f7d23a512859abab59a709f0471` en `main`. El job `E2E
Playwright` seguía rojo en ese momento (mismo run 32795383651 ya
diagnosticado); GitHub aceptó el merge de todas formas, señal de que ese
check no forma parte de la protección de rama requerida del repositorio —
no fue una omisión de esta sesión.

Ejecutado el plan documentado: rama `claude/valle-design-3d-campaign-t0zzad`
reiniciada desde `origin/main` (`git checkout -B ... origin/main`), los dos
commits de esta rama de seguridad traídos por `git cherry-pick` (limpio, sin
conflictos) como `24ea268` (P0-3) y `1f71f39` (presets de cámara). GitHub
había borrado automáticamente la rama vieja `claude/valle-design-3d-campaign-t0zzad`
al fusionar #99 (borrado automático de rama tras merge, configuración del
repositorio) — el primer intento de push con `--force-with-lease` falló por
"stale info" contra una rama que ya no existía; un push normal (sin fuerza)
la recreó sin pérdida, todo su contenido anterior ya vive en `main` vía el
squash. Gates re-verificados sobre el nuevo SHA candidato tras el
cherry-pick: `typecheck` limpio, `check:monolith-budget` OK (20247/20248,
el propio squash de #99 llegó con el techo de este archivo ya en 20248, no
20245), `check:lint-budget` OK (547/547, sin regresión), `node
scripts/run-specs.mjs` 407/407 verdes. PR nuevo abierto para esta fase;
entrada de gobernanza propia (`3D-POST-M1-P0-3-2026-08-25`) en
`docs/governance/assisted-development-log.json`, y la entrada de la campaña
3D-M1 (`3D-M1-CAMPAIGN-2026-08-24`) actualizada a `adopted` con la
evidencia de esta autorización y merge.

**Actualización — PR #102 fusionado.** Mismo patrón que #99: Sergio
autorizó explícitamente el merge en esta misma conversación ("mergea y
sigue avanzando no te detengas no quiero laboratorios quiero un sistema
real y funcional"), CI seguía roja por la misma firma de 5 fallas ya
diagnosticada (comentario propio en el PR, mismo patrón de contención de
recursos que #99, cero solapamiento con este diff), `merge_pull_request`
con `squash` tuvo éxito: commit `51e0104524a80fdc400a9bff7ffd1f0ffb67196e`
en `main`. Rama reiniciada de nuevo desde `origin/main` para la siguiente
pieza.

## Pieza 3: el re-encuadre silencioso de datos en la conversión a editable (núcleo real de P0-3)

Por directiva explícita del titular de no hacer trabajo de "laboratorio" —
investigar sin cerrar— esta pieza se acotó a lo que se pudiera dejar
COMPLETO y verificado en la misma sesión, no a un rediseño especulativo.

**Investigación antes de tocar código** (agente de exploración read-only,
95 herramientas, cita `file:line` para cada afirmación): el backlog nombraba
"dos rutas DXF" en singular; el código tiene CUATRO caminos de lectura, mejor
agrupados en dos comportamientos: Route A (`DXFIN` + importación del
dashboard, proyección identidad, fiel) y Route B
(`convertDxfPrimitivesToEditable` en `Layout3DEditor.tsx`, conversión del
DXF-de-fondo a entidades editables + `Asset` heredados). El re-encuadre
silencioso vive sólo en Route B (`projectDxfPoint`/`dxfPrimitiveBounds`,
resta el rectángulo envolvente del DXF para alinear con el backdrop, nunca
registra ese desplazamiento). El OTRO re-encuadre silencioso que el código
tiene (`parseDxf`, `components/cad/interop/dxf.ts`) resultó ser un caso
aparte: sólo coloca la imagen de referencia del backdrop, nunca escribe en
`CadDocument`, y su propio comentario ya declara que es aproximado ("para
usar como fondo, no para re-ingenierarlo") — no es el defecto de pérdida de
datos que el backlog temía, así que se dejó fuera del arreglo a propósito.

**Hallazgo que corrige al backlog, no lo confirma:** los cuatro topes
numéricos del código (50.000/40.000/850/1.500 entidades, cuatro constantes
sin relación entre sí en cuatro archivos distintos) YA estaban declarados al
usuario, cada uno por el mecanismo de su propia ruta — el `lossManifest` para
las que tienen `CadDocument`, un toast para las que sólo tienen el modelo
`Asset` heredado (que no tiene concepto de `lossManifest`, así que el toast
es su mecanismo CORRECTO, no uno degradado). El backlog original afirmaba lo
contrario sin haberlo verificado línea por línea; se corrigió en vez de
repetirlo.

**El arreglo real, acotado a proporción:** `describeDxfOriginOffsetLoss` +
`buildDxfConversionLossManifest`
(`components/cad/interop/dxf-editable-import-losses.ts`, nuevo) declaran el
desplazamiento exacto aplicado (`dxf_import:origin_shifted`) en
`document.lossManifest`, con las mismas cifras que la conversión usó — ya
visible en el paquete de entrega y en el preflight de exportación DXF, sin
tocar ninguna otra pieza. Deliberadamente NO se construyó una reversión
automática al reexportar: Route B nunca fue un importador fiel (la mitad de
lo que produce son `Asset` sin representación DXF propia, el texto se trunca
a 80 caracteres) — prometer una reversión perfecta habría sido fingir una
fidelidad que esta vía nunca tuvo. El mensaje de la entrada lo dice con
todas sus letras: declarado, no auto-revertido.

Extraído a módulo aparte (no inline en el monolito) por dos razones, no una:
presupuesto de líneas (`Layout3DEditor.tsx` estaba a 6 líneas de su techo
antes de este cambio) y para que la lógica de negocio —qué se declara y
cómo— se pueda probar sin levantar React ni Three.js. El propio cableado en el
monolito reemplazó 18 líneas por una llamada de 5, así que el archivo bajó
de línea neta pese a la funcionalidad nueva.

**Verificación:**
- `dxf-editable-import-losses.spec.ts`: 20/20 aserciones nuevas (casos: sin
  desplazamiento → `null`; sólo un eje desplazado; ambos ejes; el agregador
  con warnings+truncado+desplazamiento juntos, en el mismo orden en que el
  monolito los apilaba a mano).
- `npm run typecheck`, `check:monolith-budget` (20242/20248, BAJÓ pese a la
  función nueva), `check:lint-budget` (547/547) — los tres limpios.
- `node scripts/run-specs.mjs`: 408/408 verdes (407 + 1).
- `e2e/golden/27-cad-dxf-loss-manifest.spec.ts` extendido con la aserción
  del nuevo código de pérdida (el ARC del fixture de este golden ya vive en
  coordenadas no-cero, así que ejercita el desplazamiento sin fixture nuevo)
  — **3 corridas consecutivas en navegador real, verdes las tres**.
  `e2e/golden/38-cad-dxf-placement.spec.ts` (feature vecina, colocación del
  backdrop) re-ejecutado sin cambio.

**Qué queda genuinamente abierto, declarado y no escondido:** reversión
automática del desplazamiento de Route B al reexportar (exigiría un campo
nuevo a nivel de documento, bump de esquema, deuda aparte no bloqueante); el
propio `parseDxf` sigue sin declarar su normalización, pero por la razón de
arriba (backdrop de referencia, nunca toca `CadDocument`) no se considera el
mismo defecto. `BACKLOG.md` y `docs/interop/CONTRATO-INTEROP.md` actualizados
con este cierre y esta distinción.
