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
