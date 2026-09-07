# Campaña VALLE-DESIGN-COMMERCIAL-RC1 — bitácora de ejecución (2026-08-26)

Directiva del titular: llevar el producto «de laboratorio a producto vendible y
verificado» (prompt maestro COMMERCIAL-RC1). Orden obligatorio: Fase 0
(baseline verde) antes que cualquier feature. Un solo escritor; agentes
paralelos sólo de lectura. Una sola rama de campaña
(`claude/valle-design-commercial-rc1-izgdxb`) y un solo PR; nada cuenta hasta
estar fusionado en `main` con CI verde.

## Baseline

- SHA baseline de `origin/main`: `bc4dda1d4f77a6c7dbee9ecbfab27e25e81ba758`.
- Árbol limpio; ramas remotas vivas al inicio: `claude/valle-design-3d-campaign-t0zzad`
  (PR #108 abierto) y `claude/valle-design-p0-3-encuadre-utm` (huérfana,
  contenido ya en `main` vía squash de PR #102/#104 — verificado por
  comparación de contenido, 68/74 archivos idénticos y los 6 restantes con
  `main` por delante).
- PR #108 (reintento de 429 en review concurrency): revisado por diff y
  pruebas — correcto, acotado, con specs; su rojo E2E era preexistente (los
  mismos 5 fallos que `main`). **Decisión: adoptado** en la rama de campaña por
  fast-forward (`bc4dda1..c25a0bb`); el PR se cierra como «adopted» al fusionar
  la campaña, con la rama borrada (política de ramas de CONTRIBUTING.md).

## Fase 0 — diagnóstico del CI rojo de `main`

Estado encontrado: **`main` sin un solo run verde desde el 12 de agosto**
(run 288, último verde). Eras de rojo, cada una con causa verificada en logs
de CI (runs muestreados 289–479):

1. **14→20 ago (runs 289–324):** el workflow moría al arrancar (3–70 s);
   E2E nunca corrió.
2. **20–21 ago (325–335):** primera aparición de
   `e2e/performance/cad-dense-editing-100k.spec.ts` — **nunca pasó en CI**:
   consumía su techo de 1 h, Playwright lo reintentaba (retries=1) y el job
   E2E moría cancelado a los 100 min. Además: 6 goldens heredados rojos (
   cerrados el 23-08 por otra campaña), 1 hallazgo de gitleaks y un smoke de
   despliegue con drenaje fallido (ya cerrados).
3. **22→24 ago (347–408):** `check:dwg-evidence` — artefacto committeado
   desincronizado (decoder-matrix con «cero bundles» vs 7 reales). Resuelto
   en 410 por otra sesión.
4. **24→26 ago (410–479):** tres causas simultáneas y estables:
   `cad-dense-editing-100k` (cuelgue de 1 h + retry → job cancelado a 100 min),
   golden `20-cad-multiple-viewports` y golden `46-cad-pointer-engine` test 2.
   Consecuencia estructural: **todo lo posterior al test ~99 — unos 200 tests,
   el proyecto Firefox completo incluido — no se ejecutó ni una vez desde el
   21-08**; su estado era desconocido.
5. Run 475: `check:governance` por id duplicado en el log de gobernanza
   (resuelto en bc4dda1).

Gates locales reproducidos en verde sobre `bc4dda1`/`c25a0bb` antes de tocar
nada: `check:cad`, `check:dwg` (con espejo del corpus en el pin exacto),
`build`, `typecheck`, `test` (7/7 turbo), `lint`, `lint:check` (API), `sbom`,
`check:licenses`, `test:pg` contra PostgreSQL 16.13 real.

### Causa raíz 1 — dense-100k: designar «Todo» materializaba 100.000 objetos THREE

Con el pipeline por lotes, la única vía que aún creaba un objeto de escena POR
ENTIDAD era la proyección de la selección (grips + realce). Sin presupuesto:
«Todo» sobre 100k construía 100.000 objetos THREE en el hilo principal.
Medido antes del arreglo (Chromium headless, SwiftShader, 4 vCPU):
apertura 10,7 s / detalle 21,1 s (sanos), `paletteOpen` 53 s, y **`selectAll`
sin terminar tras >25 min** (en CI: 1,0 h de techo consumido, 9 runs
consecutivos idénticos). El instrumento del spec no era el problema; el
producto sí.

**Arreglo (producto):** `lib/cad/selection-projection-budget.ts` — política
`GRIPOBJLIMIT` (como AutoCAD): selección ≤400 → proyección por entidad
completa; >400 → cero objetos individuales, el realce lo da el propio lote
(`setSelection` retesela con color de selección) y el recuento del HUD sigue
exacto. La selección NUNCA se trunca. Además: universo de selección memoizado
por documento (antes se reconstruía entero en cada render con la paleta
abierta) y extraído a `components/cad/editor/selection-universe.ts` (el
monolito baja de 20242 a 20237 líneas).

Medido después del arreglo (mismo entorno): `selectAll` **25,9 s y completa
las 100.000** (~60× menos y, sobre todo, ACOTADO). `paletteOpen` 44,6 s —
sigue caro (hay más O(n)-por-render en el monolito; queda para Fase 2 con
perfil en mano), pero acotado y lejos del techo.

**Arreglo (política de capacidad, CI):** la suite `e2e/performance` sale del
job `e2e` a un job propio `e2e-perf` (sólo push/dispatch, Chromium, sin
retries, techo 75 min, artefactos siempre). Sigue **bloqueando** el veredicto
de `main`; lo que ya no puede es dejar sin ejecutar al resto de la suite. El
techo del spec dense baja de 60 a 35 min: con el arreglo ninguna fase legítima
se acerca, y el guion vuelca su artefacto tras cada fase.

### Causa raíz 2 — golden 46 test 2: la barra del dibujo en curso se tragaba el pick

`draft-toolbar.tsx` (ORTO + entrada dinámica + Terminar/Cerrar) flota sobre el
lienzo con `z-20`; TODO su rectángulo —fondo y padding incluidos— capturaba
los clics. La entrada dinámica hace `flex-wrap`, así que su altura depende de
la métrica de la fuente: por eso la bisección de P1-1b encontró que
`next/font/local` era «la variable» — con las fuentes propias la píldora
crecía y cubría el segundo punto del LINE del golden. Defecto de producto real
(un usuario dibujando bajo la barra pierde el clic), no fragilidad del test.
Sondeado empíricamente: `elementFromPoint` sobre el punto B devolvía el DIV de
la barra tras el primer clic.

**Arreglo:** `pointer-events-none` en el contenedor y `pointer-events-auto`
sólo en los controles (mismo patrón que el dock del tour guiado). Verificado:
46:106 y 46:177 verdes.

### Causa raíz 3 — golden 20: los `fill` desplazan el scroll del panel

Los cinco `fill(...)` previos al drag desplazan el scroll del panel del
paquete de entrega; la miniatura del viewport quedaba fuera del área visible
(boundingBox y≈16 vs y≈422 real) y el drag manual aterrizaba sobre la pestaña
«Model» del encabezado — que CIERRA el panel — y `nth(1)` desaparecía.
Determinista con contenido lo bastante alto (otra vez métricas de fuente).

**Arreglo (spec):** `scrollIntoViewIfNeeded()` antes de medir la caja para los
dos drags manuales. Verificado: golden 20 verde.

### Verificación local tras los arreglos

- Goldens 20 + 46 (ambos tests): **3/3 verdes** (43,5 s), build de producción
  E2E real, mocks en la frontera de red.
- `selection-projection-budget.spec.ts` nuevo (límite exacto, supresión, O(1)
  a 100k) verde; typecheck web verde; presupuesto de monolito verde (20237).
- dense-100k tras el fix: fases completándose (artefacto por fase);
  corrida completa en curso al escribir esta entrada.

(continúa)

## Fase 1 — lo hecho y lo abierto (corte 07:40 UTC)

Hecho y verificado (specs verdes, 412/412 web):
- Booleanas de vanos con diagnóstico tipado y bloqueo de representación
  (`wall-solid-diagnostics.ts`, `wall_opening_not_cut` en el informe de
  validación con muro+vano+causa).
- Capas en 3D por entidad: apagada/congelada no construye el muro; congelada
  sale además de la derivación de masas; apagada cuenta (solo display); el
  vano corta sin mirar su capa (paridad 2D); ocultar/congelar/bloquear depura
  la selección.
- GLB con arquitectura + round-trip por spec (bbox, material, hueco por
  raycast).
- Cantidades sin volumen doble en uniones (medido y declarado por fila).

Abierto (declarado, no escondido):
- Uniones L/T/X en 3D siguen SOLAPANDO volumen visual (sin inglete). Las
  CANTIDADES ya lo descuentan; la malla no. Siguiente paso: booleana de unión
  por pareja en la vecindad afectada.
- Cutaway/corte comercial: los presets sólo mueven cámara.
- Espesores de piso/cielorraso/cubierta siguen siendo constantes de módulo
  (un espesor editable exige bump de esquema + migración + round-trip).
- `detectCadRooms` no resuelve cruces en X sin nodo compartido; el contorno
  cóncavo con patio se deriva del anillo exterior real (cubre patio simple),
  sin bloqueo diagnósticado específico para anillos internos.

## OWNER ACTIONS (registro vivo)

- `OWNER ACTION: RAILWAY` — cuenta, proyecto, servicios, plugin PG16 y
  variables (ver docs/ops/railway.md). Sin esto no hay despliegue real que
  probar; la configuración y el pre-deploy de migraciones quedan listos y
  ensayados localmente.
- `OWNER ACTION: DNS/TLS` — CNAMEs app./api. hacia Railway.
- `OWNER ACTION: SMTP/CORREO` — receptor HTTPS firmado del outbox o
  credenciales del transporte transaccional real.
- `OWNER ACTION: STRIPE TEST` — claves de test para ejecutar la batería
  completa de cobro (trial→checkout $199 MXN→webhooks→OXXO/SPEI→past_due→
  cancelación→reembolso→idempotencia) contra Stripe real; el repo degrada
  declarado sin ellas y los specs existentes cubren la lógica con dobles.
- `OWNER ACTION: STRIPE LIVE` — autorización expresa para cualquier cobro
  real (no se ejecuta en esta campaña).
- `OWNER ACTION: LEGAL` — texto legal FINAL con razón social, RFC,
  domicilio, jurisdicción, SLA y política de reembolsos (las plantillas de
  docs/legal/ siguen sin datos reales). El candado técnico (versión + hash +
  gate de CI + versión visible) ya existe; el contenido definitivo es
  decisión jurídica del titular.
- `OWNER ACTION: CORPUS REAL DWG` — archivos DWG reales y autorizados de
  usuarios para promover la beta más allá de laboratorio (hard cap: DWG
  permanece beta sin ellos).
- `OWNER ACTION: PILOTOS` — mínimo cinco arquitectos externos con proyectos
  reales para declarar GA (Claude no puede simular validación humana).
- `OWNER ACTION: SENTRY/OBSERVABILIDAD` — DSN/cuenta si se contrata.

### Causa raíz 4 — moveMassive: la historia expulsaba el checkpoint recién grabado

La fase `moveMassive` del estrés denso nunca había funcionado — ni en CI ni en
local — y el porqué no era rendimiento: instrumentado el camino completo, el
commit de mover 100.000 entidades tarda **1,5 s** (snapshot 154 ms, lote
376 ms, canónico 938 ms). El movimiento SE APLICABA… sin dejar paso de
deshacer: el documento denso estima ~51 MB, `CanonicalHistory` tenía
`maxRetainedBytes: 32 MB`, y `enforceBudget()` expulsaba la entrada RECIÉN
grabada. `recordCurrent` devolvía `false` y nadie lo miraba. Un usuario con un
plano grande movía todo y Ctrl+Z no tenía nada que deshacer — pérdida
silenciosa de seguridad de datos, la clase exacta de defecto que esta campaña
existe para eliminar.

**Arreglo:** el presupuesto de bytes acota la PROFUNDIDAD retenida, nunca el
último paso — `enforceBudget` jamás baja de una entrada. Un checkpoint que por
sí solo excede el presupuesto se retiene (suelo de seguridad); el techo sigue
gobernando cuántos pasos MÁS se conservan. Regresión fijada en
`canonical-history.spec.ts` (nuevo) y verificada con los consumidores reales
(document-lifecycle, grips, block-edit-session — verdes).

Del mismo diagnóstico queda MEDIDO y pendiente (Fase 2): con 100.000
designadas el hilo principal encadena tareas de 10-24 s con el editor «en
reposo» (SwiftShader + churn de render), y `paletteOpen` cuesta ~44 s. Ambos
números van al informe de rendimiento; no bloquean el veredicto funcional.

### Causa raíz 5 — el primer run de CI del PR #110: el monolito había crecido

El run 32944747190 (quality-gates, rojo en ~60 s) murió en
`check-monolith-budget`: `Layout3DEditor.tsx` en **20293 líneas** sobre su
asignación de 20242. Las correcciones de la campaña habían engordado el
monolito y la corrida local de gates previa al push no lo cubrió (lección
anotada abajo). Regla respetada — el monolito sólo encoge, el techo no se
toca:

- La exportación GLB completa sale a `lib/cad/glb-export.ts`:
  `planCadGlbExport` (la decisión del botón con sus dos negativas),
  `hideCadGlbOverlays` y `serializeCadGlbBlob` (serialización con
  restauración garantizada). El spec de round-trip pasa ahora por la MISMA
  función que usa el editor.
- El candado de capas bloqueadas del lote sale a
  `lib/cad/entity-command-locks.ts` (nuevo — `entity-commands.ts` está a 21
  líneas de su tope de 800).

Reproducir la cadena COMPLETA de CI en local destapó además, antes de que la
CI llegara a verlos:

- **rules-of-hooks real**: los dos `useMemo` del universo de selección
  (memoización de esta campaña) quedaban DESPUÉS del `return null` de editor
  cerrado — orden de hooks cambiante entre renders. Subieron antes del
  return.
- **Trinquete de avisos de lint**: el `eslint-disable` de `exhaustive-deps`
  abarcaba dos líneas de comentario y no aplicaba a la lista de dependencias
  (7 avisos > presupuesto 6, más 1 directiva sin uso). Recolocado.
- **Prettier en `run-migrations.ts`** (paréntesis) — bloqueaba `lint:check`
  del API.
- `check:dwg-evidence` en local exige el espejo del corpus en el pin exacto
  (`VALLE_DWG_CORPUS_MIRROR` → clon de `valle-design-dwg-conformance` en
  `a60ebe2`); sin él el árbol «sostiene» 0 bundles y el gate falla. No es un
  fallo de producto: es el entorno de CI que hay que reproducir.

**Lección de proceso (fijada como protocolo):** antes de CADA push, la cadena
entera de quality-gates con el espejo del corpus exportado — no un
subconjunto. Sobre `7030a19` quedó verde completa: check:cad · check:dwg ·
check:governance · audit · Redocly · sbom+licencias · turbo build ·
typecheck API/web · tests API unit + pg (166/166) · lint API/web ·
413/413 specs web.

### Estrés denso tras los arreglos (corrida bajo carga, 08:33 UTC)

Con presupuesto de proyección + mapas + historia corregida, la corrida
(REPEATS=1, chromium, servidor de producción, API real en :4000) completó
**9 de 11 fases** antes del techo de 35 min — compartiendo los 4 CPU con la
propia cadena de gates (turbo build + 413 specs + tests pg corrían en
paralelo; anotado en el artefacto como carga vecina):

| fase | mediana |
|---|---|
| paletteOpen | 32,6 s |
| selectAll | 27,9 s |
| **moveMassive** | **7,2 s** (antes: no volvía en 10 min) |
| **undoMassive** | **8,5 s** (antes: no existía paso que deshacer) |
| eraseLayer | 7,7 s |
| undoErase | 10,0 s |
| windowSmall | 73,1 s |
| windowLarge | 74,3 s |
| crossingLarge | 63,5 s |

`lasso` y `pickAndGrips` no llegaron a ejecutarse. Señal de Fase 2 ya
medida: ventana/captura cuestan ~70 s CONSTANTES (independiente del área
seleccionada) — huella de recorrido completo del documento, no del índice
espacial. Corrida limpia (máquina quieta) en curso para el veredicto del
smoke.

### Causa raíz 6 — el LAZO nunca empezaba: el tour guiado flotaba sobre su esquina

Dos corridas limpias del estrés denso murieron en la fase `lasso` (>6 min sin
designar, techo de 35 min consumido). Una sonda dedicada (v2, con
`elementFromPoint` bajo cada esquina) lo cerró sin ambigüedad:

- Las dos esquinas SUPERIORES del bloque del lazo — mundo (36000,27000) y
  (37800,27000) → pantalla (689,427) y (706,427) — caían sobre
  `BUTTON[cad-guided-tour-skip]`: el dock del tour guiado de primer arranque
  flota SOBRE el plano y captura el pointerdown. El lazo EMPIEZA en esa
  esquina: el gesto pulsaba el botón, ninguna marquesina nacía y el sondeo de
  `selection > 0` moría de hambre.
- El lazo del PRODUCTO está bien: sobre un bloque sin obstruir designó
  **exactamente 180/180** (9 habitaciones × 20 trazos) con su toast
  «180 objeto(s) por lasso.».

Arreglo en el guion (no en el producto: un dock interactivo debe capturar sus
propios clics): el estrés despacha el tour con «Saltar» antes de medir, como
haría cualquier usuario. Si no aparece en 60 s se publica como hallazgo.

La sonda también DESCOMPUSO el coste de las fases geométricas (~67 s medidos):

- `setSelectionMode` (abrir paleta + modo + cerrar): **~100 s** a 100k —
  coste de arnés por fase que ninguna medición registraba.
- El ARRASTRE en sí (`dragWorld`, 6 pasos por segmento): **~66 s** — cada
  `mouse.move` espera a que el hilo principal suelte sus tareas largas.
  El hit-test y la aplicación son rápidos; la señal de Fase 2 es la
  RESPONSIVIDAD del hilo principal a 100k, no la selección.

### Arreglo de producto: la marquesina resincronizaba la escena nativa entera

`rebuildAll()` tras cada ventana/captura re-hasheaba las 100.000 entidades
(`syncNativeScene()` sin argumentos) por un gesto que NO cambió el documento —
los visuales nativos ya los refresca `applyProfessionalSelection` →
`refreshNativeSelectionVisuals`. Ahora la marquesina reconstruye sólo lo
heredado (`rebuildLegacy`: bloques, activos, cotas, notas, celdas);
`rebuildAll` queda para los caminos que sí mutan el documento.

### Causa raíz 7 — la selección geométrica truncaba a 300 EN SILENCIO

La corrida con el tour despachado (dense7, 10/11 fases — el LAZO midió por
primera vez: 198,3 s) publicó en sus hallazgos el defecto que faltaba: una
ventana sobre 64 habitaciones encierra 1.280 trazos y la selección devolvía
**300** — el tope por defecto de `intersecting`/`path` en
`native-selection-index.ts`. «Mover lo designado» movía 300 de 1.280 y el
producto no lo decía. La vía masiva («Todo», quick-select) SÍ designa
100.000 sin truncar: el tope era exclusivo del camino geométrico.

Arreglo: el tope por defecto pasa a infinito (designar es designar TODO lo
encerrado); queda como parámetro para consumidores que pidan una muestra
acotada explícitamente. El coste visual de una selección masiva ya lo
gobierna el presupuesto de proyección. Regresión en
`native-selection-index.spec.ts` (999/999 sin tope; 300 sólo si se pide).

El techo del estrés denso pasa de 35 a 45 min por ARITMÉTICA MEDIDA, no por
comodidad (el detalle en el propio spec): dense7 murió a 35:00 despachando
la última fase con las 10 anteriores verdes. Ninguna fase individual puede
acercarse al techo.

### Causa raíz 8 — los 7 «404» del estrés: el autoguardado escapaba del fixture

Con el registro de red (≥400 con método y URL) el artefacto se explicó solo a
la primera corrida: `PUT /v1/cad/documents/<id>/archive` — el ARCHIVO DE
RECUPERACIÓN que el editor sube en caliente cada pocos minutos. El fixture de
E2E intercepta `/v1/cad/**` pero no conocía esa ruta y su manejador caía al
404 genérico; el error llegaba a la consola sin URL («Failed to load
resource») y el invariante «sin errores de navegador» tumbaba una corrida
por lo demás verde (dense8: las ONCE fases completas por primera vez, con
undo masivo real, 1280/1280 en ventana y captura, lazo 186,9 s a 180/180 y
pickbox 8,2 s).

Es un hueco del ARNÉS, no del producto: el producto autoguarda con juicio.
El fixture acusa ahora el archivo (200, la misma forma que `/content`) SIN
tocar la versión — bumpearla rompería por CAS los saves explícitos de los
goldens; el golden 11 (recovery-journal) enruta esa ruta a nivel de página y
conserva la precedencia. Tres sondas dirigidas (apertura, paleta, mutación
suelta) no lo habían reproducido porque el autoguardado es PERIÓDICO: sólo
una corrida larga lo dispara.

## FASE 0 — CIERRE: el estrés denso VERDE de punta a punta (12:01 UTC)

Corrida `chromium-2026-08-26T11-30-42-390Z` (REPEATS=1, 4 vCPU, servidor de
producción, API real en :4000): **1 passed (37,5 min)** — la primera corrida
verde de la suite en su historia. `complete: true`, 0 fallos, **0 errores de
navegador**, y los ONCE gestos con sus invariantes exactos:

| fase | mediana | observado |
|---|---|---|
| paletteOpen | 38,6 s | 100.000 en el universo |
| selectAll | 21,0 s | 100000/100000 |
| moveMassive | 6,6 s | deshacer 0→1 |
| undoMassive | 11,1 s | deshacer 1→0 |
| eraseLayer | 6,8 s | 100000→80000 (−20000 exactos) |
| undoErase | 9,2 s | 80000→100000 |
| windowSmall | 67,8 s | 80/80 |
| windowLarge | 63,3 s | **1280/1280** (antes 300, en silencio) |
| crossingLarge | 57,6 s | **1280/1280** |
| lasso | 196,1 s | **180/180** (antes: nunca llegó a ejecutarse) |
| pickAndGrips | 7,3 s | 1 designado, paleta de propiedades poblada |

Nota de honestidad: la corrida se lanzó con el manejador de archivo del
fixture ANTES de su división en módulo propio (fa494e6) — conducta idéntica,
diff de pura organización cazado por el tope de 800 líneas en CI.

Ocho causas raíz medidas y corregidas para llegar aquí; el detalle de cada
una está arriba. Pendiente de Fase 0: dos pasadas completas de gates locales
sobre el SHA final, fusión y CI de main verde (Chromium+Firefox+e2e-perf).

## El primer E2E COMPLETO en meses: lo que destapó (13:00-16:00 UTC)

Con el estrés denso fuera del job E2E, el PR corrió por primera vez desde
el 20-08 las suites REALES (contra API y PostgreSQL de verdad) y los
goldens completos. Cuatro asertos caducados frente a cambios que main hizo
el 22-08 — ninguno era de esta campaña, y ninguno había podido fallar antes
porque el cuelgue del denso mataba el job antes de llegar:

- **fiscal-checkout 7**: `/studio` sin documento manda al TABLERO desde
  c83a9e1 (el estudio abre por documento); el aserto afirmaba la conducta
  retirada.
- **studio-real-api 5-12/18/20**: el selector del importador clavaba la
  lista `accept` exacta y shapefile la creció — pasa a CONTENencia. Además
  la importación publica ahora DOS «status» (conteo + completitud) y el
  modo estricto exigía acotar el locator.
- **studio-real-api 16**: el campo se llama «Código de verificación» desde
  el rediseño de identidad; `getByLabel("Token")` ya no existía.
- **legal**: el mock de identidad y el spec del gate de aceptación clavaban
  la versión 2026-08-15 retirada — ahora LEEN el espejo
  `LEGAL_PAGE_VERSIONS` (publicar versión nueva no vuelve a romperlos).

Y una REGRESIÓN de esta campaña que el golden 24 cazó (para eso están):
la purga de selección al commit usaba el conjunto no-designable entero y
soltaba lo designado al APAGAR una capa — pero apagar es sólo display
(mover una selección previa sobre capa apagada es flujo AutoCAD que el
golden fija) y bloquear veta la edición con aviso SIN soltar la
designación. La purga queda acotada a lo inexistente y a la capa CONGELADA.

Último rojo: el propio mecanismo del arnés en `offline-multitab` — en el
runner de CI ni `Page.crash` ni `chrome://crash` estrellan el renderizador
(dos corridas × dos intentos; en local estrella al instante). El guion
intenta el estrellamiento 15 s y, si el entorno no lo permite, cae al
cierre sin `beforeunload` — el MISMO escenario declarado del ramal de
Firefox — diciéndolo por consola. La afirmación del producto (el checkpoint
confirmado sobrevive a la reapertura) se ejercita en ambos caminos.

Estado a las 16:40 UTC: `e6c4609` con las DOS pasadas locales de gates
completas TODO-VERDE (PASE1D/PASE2D) y el run 497 de CI **encolado ~100
minutos** por el backlog/atasco de runners de GitHub — sin permiso de
Actions para cancelarlo/relanzarlo desde esta sesión; este mismo commit lo
sustituye vía el grupo de concurrencia del PR. Los 141 tests del E2E
anterior ya estaban verdes con el único rojo en el mecanismo de
estrellamiento ya corregido.

---

# INFORME FINAL — VALLE-DESIGN-COMMERCIAL-RC1 (corte 16:50 UTC)

## Estado global: RC TÉCNICO LOCAL DEMOSTRADO · fusión pendiente de infra de GitHub

`main` sigue estable en `bc4dda1` (intacto). La rama de campaña
`claude/valle-design-commercial-rc1-izgdxb` (`2a52daa`) tiene:

- **Dos pasadas consecutivas COMPLETAS de gates locales TODO-VERDE** sobre el
  SHA final y sobre los tres SHAs previos (19 gates × 2: check:cad completo
  con espejo del corpus, check:dwg, governance, audit, Redocly,
  sbom+licencias, build, typecheck API/web, tests API unit + pg 166/166,
  lint API/web, 413/413 specs web, 3 benchmarks bloqueantes).
- El último run E2E COMPLETO de CI: **141 verdes, 1 rojo** — y ese rojo era
  el mecanismo de estrellamiento del arnés, corregido y verificado local
  (4/4) en el SHA final.
- El run 497 de CI lleva ~100 min ENCOLADO (incidente/backlog de runners de
  GitHub; sin permiso de Actions desde esta sesión para cancelar/relanzar) y
  el push de este informe tampoco generó run en minutos — la fusión queda
  AUTOMATIZADA (trigger + suscripción del PR): en cuanto Actions despierte y
  el run salga verde, se saca el PR de borrador, se fusiona por squash, se
  verifica main CI (quality-gates + e2e Chromium+Firefox + e2e-perf denso),
  se cierra #108 como adoptado y se borran las ramas absorbidas.

## Score verdadero: 60/100

| Fase | Estado | Evidencia |
|---|---|---|
| 0 · Baseline verde | **HECHA** (local + 141/142 CI) | 8 causas raíz medidas; estrés denso 11/11 por primera vez en su historia; gates 2× mismo SHA |
| 1 · 3D honesto | **SUSTANCIAL** | booleanas fail-closed con diagnóstico, capas por entidad en 3D, GLB con edificio (spec round-trip + E2E del botón), cantidades sin volumen doble. Abierto: uniones L/T/X visuales, cutaway, espesores de losa |
| 2 · Rendimiento vivo | **MEDIDA, no gateada** | selectAll 21-28 s, move 6,5-9 s, ventana 50-73 s (constante: hilo principal), lazo 187-198 s, paleta 32-43 s a 100k SwiftShader — declarado, nunca presentado como GPU real. Falta memoria ×20 y objetivo ≤100 ms a 10k |
| 3 · DWG beta | **NO ABORDADA** | writeCanonicalDwg existe (lab); sin flag/preflight/manifest. **PRÓXIMO P0** |
| 4 · Railway/prod | **HECHA salvo OWNER ACTION** | migraciones pre-deploy ensayadas, restore RTO 1,47 s, cabeceras, railway.json+docs |
| 5 · Legal/cobro | **CANDADO HECHO** | contentHash+gate en CI (negativo probado), versión visible, contradicción comercial corregida; Stripe test/live = OWNER ACTION |
| 6 · Aceptación | **NO ABORDADA** | OWNER ACTION: PILOTOS |

Hard-caps respetados: ninguna prueba borrada ni saltada; ningún timeout
subido «a secas» (cada techo con aritmética medida y arreglos de algoritmo
antes); ninguna pérdida silenciosa — al contrario: DOS pérdidas silenciosas
de datos ENCONTRADAS y corregidas (deshacer expulsado a 100k; selección
geométrica truncada a 300).

## Próximos P0 exactos

1. Al despertar Actions: veredicto del run sobre `2a52daa` → fusión → main
   CI verde con Firefox y e2e-perf (la automatización queda armada).
2. Fase 2 formal: ciclo de memoria ×20 y selección ≤100 ms a 10k; atacar la
   RESPONSIVIDAD del hilo principal a 100k (arrastre ~66 s: tareas largas de
   render/teselación — medido con sonda).
3. Fase 3 DWG beta: flag de producto sobre writeCanonicalDwg + preflight +
   manifest de pérdidas + round-trip. OWNER ACTION: CORPUS REAL para GA.

## OWNER ACTIONS pendientes (registro completo arriba)

RAILWAY (cuenta+secretos+dominio), DNS/TLS, SMTP, STRIPE test y live, texto
legal definitivo (razón social/RFC/jurisdicción), CORPUS REAL DWG, PILOTOS,
SENTRY.

---

# CASCADA POST-FUSIÓN (orden del titular: «mergear e integrar todo y seguir»)

## Fusión ejecutada

Actions despertó, el run del PR #110 salió **verde completo** (quality-gates,
E2E Chromium + Firefox, e2e-perf denso 100k, gitleaks) y el PR se fusionó
por **squash**: `main = 848e0d3`. El PR #108 se cerró como ADOPTADO (su
contenido viaja dentro de la fusión). La rama de campaña se reinició desde
`origin/main` para la cascada. El run 499 de CI sobre `main@848e0d3` quedó
en marcha con verificación automatizada (trigger re-armado); su veredicto se
registra abajo cuando termine.

## FASE 2 — cerrada la parte medible en este entorno

`e2e/performance/cad-editor-memory-cycles.spec.ts` (nuevo, carril
`CAD_PERF_E2E=1`), corrido DOS veces — la primera destapó dos defectos del
propio guion, corregidos antes de aceptar número alguno:

- **Memoria ×20 (INVARIANTE BLOQUEANTE — verde).** 20 ciclos de
  abrir/cerrar el estudio con un dibujo de 10.000 entidades; GC forzado por
  CDP (2 pasadas) + `JSHeapUsedSize` tras cada ciclo. Cerrar el estudio ES
  navegación completa en este producto (`window.location.assign`), así que
  el ciclo navega al tablero — mismo sitio, mismo proceso de renderer — y
  mide la retención posible por diseño. Resultado: base 4,1 MB → final
  5,8 MB, **crecimiento 1,7 MB** contra presupuesto max(25 MB, 10 %) =
  25 MB. **CUMPLE con margen 14×.** (La primera versión navegaba a
  `about:blank` — reino nuevo, número trivial de 1,3 MB; corregida.)
- **Selección por ventana a 10k (PUBLICADA, no gateada).** Modo VENTANA
  explícito por la paleta (la primera corrida cayó SOBRE un trazo y midió un
  move-drag de 1 entidad — inválida y dicha). Marquesina de 160×120 px en el
  centro: **1.023 entidades designadas en 6.349,5 ms** — objetivo comercial
  ≤100 ms → **NO CUMPLE en Intel Xeon 2,10 GHz · SwiftShader (raster por
  software, sin GPU real)**. El número se publica con su hardware al lado y
  NO se presenta como GPU real; el veredicto en hardware de cliente queda
  como medición pendiente del piloto. El trabajo de producto que este número
  señala (responsividad del hilo principal en designación masiva) ya está en
  Próximos P0.
- Artefacto JSON: `e2e/.artifacts/cad-editor-memory-cycles/` (esquema
  `urn:valle-design:schema:cad-memory-cycles-run:v1`, hardware declarado).

Sigue abierto de Fase 2: responsividad del hilo principal a 100k (tareas
largas de teselación medidas con sonda) — producto, no medición.

## FASE 3 — DWG beta controlada (núcleo entregado, §8 al pie de la letra)

Tres piezas nuevas + el guardián actualizado:

- **`src/lib/cad/dwg-export-flag.ts`** — espejo de escritura de
  `dwg-interop-flag.ts`: `DWG_EXPORT_FLAG` nace apagada; gates congelados
  como hechos (`publicWriterExists: true`, `externalOracleVerified: false`);
  autorización del titular registrada (ADR-0009 §8, firma 2026-08-25,
  perfil `AC1015_EXPORT_2D_V1`, legal `pending_parallel`);
  `dwgBetaExportIsEnabled` = bandera ∧ firma ∧ CERO bloqueos — **fallo
  cerrado**: encender la bandera sin el oráculo externo (§8.2, ODA File
  Converter — OWNER ACTION) deja la exportación rechazada y los bloqueos lo
  dicen por su nombre.
- **`src/lib/cad/dwg-native-writer.ts`** — el SEGUNDO punto autorizado que
  importa el códec (el de escritura). Preflight puro contra el subconjunto
  §8.1 (qué viaja y qué no, SIN escribir); proyección campo a campo al
  canónico del laboratorio (nada de `as` al documento entero; espacios de
  papel se vacían Y se declaran como pérdida); TRES estados, nunca dos:
  `exito` / `exito_con_perdidas` (bytes + manifiesto que nombra EXACTAMENTE
  qué no viajó) / `rechazado` (gate cerrado o cero entidades escribibles —
  un DWG vacío que dice ser tu plano es peor que un error). El documento
  original NUNCA se toca: función pura, bytes nuevos o nada.
- **`src/lib/cad/dwg-native-writer.spec.ts`** — verde: (1) con los gates
  REALES la exportación se rechaza aunque la bandera esté encendida y los
  bloqueos nombran el oráculo y la OWNER ACTION; (2) round-trip con gates
  inyectados como si el oráculo hubiera pasado: línea/círculo/arco + MURO →
  `exito_con_perdidas`, el muro en el manifiesto por su tipo, `readDwg`
  relee exactamente lo escribible con coordenadas intactas (<1e-6);
  (3) documento sólo-muros → `rechazado` sin archivo; (4) preflight puro.
- **`scripts/dwg/check-product-boundary.mjs`** — el writer y su spec son
  ahora los ÚNICOS importadores autorizados del adaptador de escritura
  (verificación paralela a la del lector); el botón del producto se añade a
  la lista el día que el oráculo §8.2 esté corrido, no antes.

Cumplimiento del prompt: AC1015 ✓ (writer del laboratorio, clean-room — sin
ODA/RealDWG/Teigha/SDK de Autodesk/servicio pagado), preflight ✓, manifiesto
de pérdidas ✓, estados éxito/éxito-con-pérdidas/rechazado ✓, flag apagada
por defecto ✓, el archivo del cliente nunca se sobrescribe ✓ (la exportación
produce bytes nuevos). El cableado de interfaz queda POST-oráculo por
mandato de §8.2 — cablearlo hoy sería fingir que el gate no existe.

## FASE 1 (remanente) — uniones L/T con volumen: la esquina limpia llega al 3D

La planta 2D ya derivaba el inglete de la L y el empalme de la T
(`wall-joins.ts`, función pura de las recetas, nunca persistida) — pero el
volumen 3D de cada muro se extruía de su RECTÁNGULO crudo: dos cajas
solapadas en la esquina (volumen doble visible + z-fighting en caras
coincidentes) y una MUESCA abierta en la escuadra exterior. La corrección es
cableado, no matemática nueva — el mismo modelo probado de la planta, ahora
extruido:

- `wall-solid.ts`: `wallSolidBodyLocal` acepta las uniones y extruye el
  contorno AJUSTADO (cada esquina deslizada por su cara la extensión firmada
  de su extremo, en el marco local del muro). El anillo siempre es simple —
  las caras largas viven en rectas paralelas y con longitud positiva los
  testeros no pueden cruzarse — y si un recorte consume una cara entera,
  degrada a la caja base, el mismo `?? footprint` de la planta: nunca un
  sólido del revés. Sin uniones, la caja de siempre: el muro solitario no
  paga nada.
- `wall-solid-host.ts`: la firma de reconciliación pasa de par a TERNA
  (muro por referencia, vanos por referencia, uniones POR VALOR): mover un
  VECINO reconstruye la esquina de este muro aunque este muro no cambiara de
  referencia — la dependencia que las referencias no pueden ver. Las
  uniones se derivan contra el documento entero SIN filtrar por capa,
  paridad exacta con `wallDocumentJoins` de la planta: un muro de capa
  apagada no se construye, pero sigue dando forma a la esquina del vecino.
- Probado con números, no con capturas (`wall-solid.spec.ts`, 37 verdes):
  el inglete simétrico CONSERVA el volumen del muro (cede un triángulo, gana
  el otro); un rayo por el triángulo interior cedido ya no toca al muro
  (volumen doble eliminado) y la escuadra exterior que las cajas dejaban
  abierta ahora se rellena; el par en L suma EXACTAMENTE sus volúmenes
  nominales; el que llega a la T se recorta hasta la cara del pasante
  (1.375×200×2.400 exacto) y el pasante no se toca; el vano sigue restando
  exactamente su volumen en un muro con inglete. El anfitrión probado en
  `wall-solid-host.spec.ts`: mover al vecino reconstruye, mismo documento no
  reconstruye, capa apagada forma la esquina.
- El GLB exporta estos mismos grupos de escena (`glb-export.ts`), así que el
  edificio exportado lleva las esquinas limpias sin tocar el exportador.
- La X (cruce por el interior de ambos ejes) queda como está EN AMBAS
  vistas por decisión previa del modelo 2D («dos pasantes por el mismo
  punto es un cruce, no una T»): los volúmenes se interpenetran sin
  z-fighting y las CANTIDADES ya descuentan el solape por otra vía. Igual
  que los ingletes de 3+ muros en un punto: ola 2, declarado en
  `wall-joins.ts`.

## FASE 6 — Aceptación comercial: los tres proyectos canónicos, de punta a punta

`e2e/real/cad-acceptance-projects.spec.ts` + `e2e/fixtures/acceptance-projects.ts`
(carril real: `E2E_REAL_API=1`, API NestJS + PostgreSQL 16, cero mocks).
Corrida local Chromium: **4/4 verdes en 50,9 s**. Tres corridas para llegar —
las dos primeras cayeron en el MISMO sitio y el fallo enseñó el producto:

- **El contrato del preflight DXF, ejercitado de verdad.** La primera
  pulsación de «Descargar DXF» sobre un documento con pérdidas ENSEÑA el
  manifiesto y no descarga nada; una pérdida que elimina geometría (muros
  paramétricos) exige además la casilla de aceptación, y la segunda
  pulsación es la que descarga. El guion inicial asumía descarga directa
  (como el documento de arco de `studio-real-api`); el de aceptación ahora
  recorre el contrato como lo haría el piloto: mira el informe, acepta con
  conocimiento, descarga.
- **Proyecto 1 · VIVIENDA (22 entidades nativas, a mano):** perímetro en L,
  particiones en T, vanos alojados, ejes, luminarias, rótulos. Registro→
  organización→proyecto por el harness real; contenido por CAS; los seis
  muros visibles como SÓLIDOS nativos en 3D (las uniones de esta misma
  cascada, vivas contra la API real); DXF por navegador (con manifiesto
  aceptado) y por el endpoint del servidor; relectura íntegra.
  openMs 1.824 · exportDxfMs 4.869.
- **Proyecto 2 · PLANO REAL (8.000 entidades):** la mezcla `plano-real` del
  banco de pruebas (modelo declarado de archivo de despacho mexicano:
  caras de muro cortas, cadenas de cotas, carpintería repetida, achurados,
  rótulos) importada por la interfaz («Importado: 8000 entidades»), abierta
  entera (HUD Native 8000) y releída íntegra por la API.
  importMs 2.160 · openMs 2.567.
- **Proyecto 3 · OFICINA (2.000 entidades):** mezcla `architecture`
  (carga dirigida: expansión de bloques, hatch, atlas) — importa, abre,
  exporta DXF (>50 KB reales) y relee íntegro.
  importMs 2.240 · openMs 2.034 · exportDxfMs 17.915.
- **Métricas publicadas, no gateadas:** artefacto JSON
  (`urn:valle-design:schema:cad-acceptance-projects-run:v1`) con hardware
  declarado (Xeon 2,10 GHz · SwiftShader). Lo funcional BLOQUEA (recuentos
  exactos, CAS, relecturas, sólidos, secciones DXF); los milisegundos se
  publican con su máquina al lado. Los proyectos 2-3 corren sólo en
  Chromium por criterio de carril (igual que e2e-perf, declarado en el
  spec); la vivienda corre en ambos navegadores.
- Ambos generadores de corpus VALIDADOS contra el validador real de la API
  antes de escribir el guion (sonda directa a `validateCadDocumentPayload`).

Los PILOTOS con despachos reales siguen siendo OWNER ACTION — esto es la
evidencia previa: el recorrido que un piloto haría, verde y medido.

---

# VEREDICTO DE LA CASCADA (corte 18:57 UTC)

## Los dos veredictos de CI que faltaban — ambos VERDES

- **main run 499 (`848e0d3`): SUCCESS completo** (18:11 UTC). Los cinco
  jobs verdes: gitleaks, quality-gates (34 pasos), **E2E Chromium +
  Firefox completo**, **e2e-perf denso 100k** (11,5 min con
  `CAD_DENSE_REPEATS=1`) y despliegue reproducible. `main` recuperó su
  veredicto con la campaña fusionada — el objetivo central de GATES
  FINALES, cumplido y verificado.
- **PR #111 run 502 (`0fa09b1`, la cascada entera): SUCCESS a la primera**
  (41 min, 18:57 UTC). La misma matriz, ahora con las cuatro entregas de
  la cascada dentro — incluida la VIVIENDA de aceptación corriendo en
  Firefox por primera vez en CI, y el spec del writer DWG dentro de los
  415/415.

## Score verdadero actualizado: 70/100

| Fase | Estado | Qué cambió en la cascada |
|---|---|---|
| 0 · Baseline verde | **HECHA y RATIFICADA** | main CI verde completo (run 499); estrés denso verde también en main |
| 1 · 3D honesto | **HECHA salvo ola 2** | + uniones L/T con volumen (inglete probado por rayos y volúmenes exactos, 37 aserciones; vecino en la firma). Abierto declarado: cutaway, espesores de losa editables (piden esquema), X/nudos 3+ (ola 2 del modelo 2D) |
| 2 · Rendimiento vivo | **MEDIDA COMPLETA, no gateada** | + memoria ×20 VERDE (1,7 de 25 MB, margen 14×); + selección 10k publicada (6,35 s SwiftShader vs objetivo 100 ms — NO cumple ahí; hardware declarado). Producto pendiente: responsividad del hilo principal |
| 3 · DWG beta | **NÚCLEO HECHO, gate cerrado** | flag fallo-cerrado + preflight + 3 estados + manifiesto + round-trip verde; frontera de importadores ampliada. OWNER ACTION: oráculo ODA §8.2 (y recién entonces, interfaz) |
| 4 · Railway/prod | **HECHA salvo OWNER ACTION** | sin cambios: cuenta/secretos/dominio del titular |
| 5 · Legal/cobro | **CANDADO HECHO** | sin cambios: Stripe test/live = OWNER ACTION (claves); guardianes de claims ya en main (BIM, DWG-compat, reemplaza-AutoCAD, contentHash legal) |
| 6 · Aceptación | **EVIDENCIA HECHA; pilotos OWNER** | + tres proyectos canónicos de punta a punta contra la API real, 4/4 verdes local y en CI (vivienda también Firefox); métricas publicadas con hardware |

Hard-caps respetados en toda la cascada: ninguna prueba borrada ni
saltada; ningún umbral inventado (el de selección se publica, no se gatea,
con la razón escrita); ninguna pérdida silenciosa — al contrario, el guion
de aceptación EJERCITA el contrato de pérdida declarada del DXF de punta a
punta. El documento del cliente no se sobrescribe en ningún camino nuevo.

## OWNER ACTIONS (sin cambios, registro completo arriba)

RAILWAY, DNS/TLS, SMTP, STRIPE test y live, texto legal definitivo,
ORÁCULO ODA (§8.2) + corpus DWG real, PILOTOS, SENTRY.
