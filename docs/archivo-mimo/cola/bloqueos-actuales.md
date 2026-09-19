# Bloqueos actuales — lo escribe el SUPERVISOR (22:15)

**NO BORRES ESTE FICHERO NUNCA.** Lo escribe y lo borra el supervisor, no tu. Si te parece
viejo, escribelo en la bitacora y sigue. `ci-fallo.md` si lo puedes borrar cuando lo resuelvas.

## 19-sep 06:50 · ROJO ABIERTO: ROMPISTE TU PROPIO ARREGLO DEL @ (T7). PRIORIDAD UNO

La corrida 35442446995 (449 commits) cayo por tres specs de web:
- command-engine.spec.ts: «RECTANG @relativo da polilinea» -> tu T7, el arreglo del minuto uno, esta ROTO otra vez.
- src/lib/cad/commands/registry.spec.ts: «parser recognizes coordinate room drafting».
- layout-commands.spec.ts.
Algo que tocaste en OTRO modulo (el parser o el motor) lo rompio. Busca con git log -p desde 11:00 del 18-sep.

**Desde ahora el lanzador corre los 705 specs de web ENTEROS antes de subir (~10 min).** Si uno esta rojo, no se
sube. Y otra vez: **la ventana de merge sigue activa y sigues anadiendo comandos** (TIME, VIEWRES, FIND, MESHREFINE,
MESHCOLLAPSE, MESHCAP despues de la orden). Cada comando nuevo rompe algo y la #209 no entra nunca. Solo arreglos.

## 18-sep 23:58 · EL SUPERVISOR ESTA METIENDO ARREGLOS PEQUENOS DIRECTO A main. COMO RESOLVER LOS CONFLICTOS

Para que el titular pueda abrir cuentas y ver la demo HOY, sin esperar a tus 417 commits, entran a main dos PRs
chicas. Cuando el lanzador traiga main a tu rama, vas a ver conflictos en estos ficheros. Resuelvelos ASI:

- **#217 (CSRF del alta):** main anade `apps/api/src/modules/identity/identity-csrf-cookie.ts` y toca
  `identity.controller.ts` y `main.ts`. Tu rama ya resolvio lo mismo con `identity-cookies.ts`. **Quedate con TU
  version** del controlador y de identity-security.ts, y BORRA de tu rama `identity-csrf-cookie.ts`,
  `identity-csrf-cookie.spec.ts` y el bloque que valida CSRF_COOKIE_DOMAIN en `main.ts` (tu identity-security ya lo
  valida al cargar). Comprueba con `npm run typecheck --workspace=valle-design-api`.
- **#218 (lienzo oscuro):** main QUITA en `Layout3DEditor.tsx` el efecto que hacia
  `setTheme(resolvedScheme === "light" ? "light" : "dark")` y deja un comentario de tres lineas. **Acepta el cambio
  de main**: el lienzo ya no sigue al navegador. Si tu rama movio ese efecto, quitalo tambien alli.

- **#219 (tus propios D05, D09, D10, D11, D18 y D03, sacados con cherry-pick -x):** son TUS commits. Si al
  fusionar chocan, **quedate con la version de tu rama** en esos ficheros: es la mas nueva.

Nada de esto es trabajo nuevo para ti: es solo no deshacerlo al fusionar.

## 18-sep 22:50 · VENTANA DE MERGE: HASTA QUE LA #209 SE MERGEE, CERO COMANDOS NUEVOS. SOLO ARREGLOS

Orden del supervisor, temporal. Llevas 417 commits y la rama NO entra porque cada vuelta anade un comando
nuevo y ese comando rompe algo (ABOUT/STATUS -> cinta; FILL; ahora RULESURF/REVSURF -> ribbon.spec y
ruled-surfaces.spec). Mientras sigas anadiendo, el merge no llega nunca.

**Mientras `gh pr view 209 --json state --jq .state` diga OPEN:**
1. Arregla lo rojo de ci-fallo.md (hoy: `ribbon.spec.ts` «mallas/Mallas tiene 5 botones grandes; deben ser uno
   o dos» y `ruled-surfaces.spec.ts` «REVSURF produce documento»). Si REVSURF no esta terminado, que declare su
   limite con honestidad o sacalo del registro; no lo dejes a medias.
2. Despues, los goldens que el CI marco a las 11:42 y que nadie ha comprobado aun, UNO a la vez en local:
   18, 193, 20, 22, 84, 32, 33, 31, 23, 40, 48, 50, 212, 214 (e2e/golden/NN-*.spec.ts). Arregla el producto.
3. Nada de familias nuevas, comandos nuevos ni rediseños. Pulir, arreglar y probar si.

**En cuanto diga MERGED:** vuelves a la rotacion de seis frentes a toda velocidad. Es cuestion de horas.

## 18-sep 21:55 · ROJO ABIERTO: TU T15 (Esc) ROMPIO EL ENCHUFE DE LISP

La corrida 35418397569 (408 commits) cayo por **src/components/cad/lisp/lisp-enchufe.spec.ts:318**:
«y queda dicho que la anterior se abandono, en vez de desaparecer sin rastro». Paso en la corrida de las 19:44 y
falla desde tu **c15f3bdb (NIVEL/T15: Esc conserva trabajo acumulado)**: el enchufe de LISP espera que Esc sobre un
comando suspendido por una rutina deje escrito en el transcript «se abandono sin terminar». Tu T15 esta bien para
COPY/TRIM/OFFSET, pero el camino de LISP tiene que seguir marcando la rutina como abandonada. Arregla el producto,
no el spec. Desde apps/web:

    npx tsx src/components/cad/lisp/lisp-enchufe.spec.ts

Ya esta en el candado: con esto rojo no se sube.

**Y una regla que rompiste en 2f9dd1e9:** pusiste `(_state) =>` en utility-commands.ts para callar al linter. Eso esta
PROHIBIDO (prefijar con _ para silenciar). Si el parametro no se usa, quitalo: `step: () => messageResult(...)`.

## 18-sep 20:35 · ROJO ABIERTO: ABOUT y STATUS SIN PANEL EN LA CINTA

La corrida 35413582459 cayo por mechanical.spec (ya lo arreglaste en 502cb5dd, bien). Pero tus ABOUT y STATUS
(20:11) rompen **src/lib/cad/ribbon.spec.ts**: «todo comando tiene panel por patron; el reposo es solo red de
seguridad» -> [ABOUT, STATUS]. Dales panel en ribbon.ts (CAD_PANEL_NAME_PATTERNS) y comprueba desde apps/web:

    npx tsx src/lib/cad/ribbon.spec.ts
    npx tsx src/components/cad/ribbon/command-icons.spec.ts

Es la pieza 5 de las seis de todo comando nuevo (ubicacion en la cinta). El candado ya corre siempre ribbon.spec,
command-icons y command-labels: con eso rojo no se sube.

## 18-sep 19:00 · EL CANDADO DE GOLDENS SE QUITO: LOS JUZGA EL CI

Correr Playwright en esta laptop mientras trabajas da timeouts por carga (el 13 paso a las 16:24 y fallo a las
18:53 sin cambios en la cinta). Ya no bloquea el push: el lanzador sube cuando pasen los candados rapidos y el
CI dira que goldens fallan de verdad. Tu: sigue con la rotacion y, si el CI marca un golden, arreglalo primero.

## 18-sep 17:10 · TUS ARREGLOS A Y B FUNCIONAN. QUEDA EL GOLDEN 18 (BLOQUES), ROJO DE VERDAD

En local, con tu arbol de las 16:24: dashboard-document-lifecycle y el golden 13 (entrada dinamica) PASAN.
El que falla de verdad es **e2e/golden/18-cad-professional-blocks.spec.ts:59** (BLOCK/INSERT por la biblioteca
del inquilino, atributos, persistencia, DXF y explode): Timeout 15000ms exceeded while waiting on the predicate.
Reproducelo desde apps/web:

    node ../../node_modules/playwright/cli.js test e2e/golden/18-cad-professional-blocks.spec.ts --project=chromium --workers=1 --reporter=line

El candado de goldens ahora corre solo 9 rapidos (201, 13, dashboard, 46, 52, 28, 26, 72 y 18); los lentos los
juzga el CI. Con 18 en rojo no se sube nada: es tu prioridad uno.

## 18-sep 16:35 · DESBLOQUEADO: EL ORACULO B YA ESTA REFRESCADO (646224b9). LOS 16 GATES RAPIDOS EN VERDE

Lo que te paro dos vueltas (`terceros-jornada.spec.ts`: «la medicion congelada del oraculo B es de otros
bytes») NO era un defecto: tus T10 (cotas DXF vivas), T11 (muros cortados en vanos) y C08 cambian los
bytes exportados A PROPOSITO. Lo refresque por el camino que manda el spec y revise el diff: solo
bytes, sha256 y el decimal 14; ningun conteo empeora, y ezdxf abre el fichero entero con 0 errores.

**La proxima vez hazlo tu.** Ya hay Python con ezdxf 1.4.4 en `D:\dev\_mimo\venv-ezdxf`. Desde la raiz:

    cd apps/web; npx tsx src/lib/cad/verification/terceros-jornada.spec.ts      (exporta; falla, es normal)
    D:\dev\_mimo\venv-ezdxf\Scripts\python.exe docs/cad/corpus/oraculos/medidas-floorplan.py
    $env:VALLE_ESCRIBIR_JORNADA=1; npx tsx src/lib/cad/verification/terceros-jornada.spec.ts; Remove-Item Env:VALLE_ESCRIBIR_JORNADA
    npx tsx src/lib/cad/verification/terceros-jornada.spec.ts                   (ahora verde)

Y ANTES de commitear: MIRA el diff del artefacto. Si cambia un conteo o una longitud mas alla del
decimal 12, eso es un defecto tuyo, no un artefacto que refrescar. Pasa los .json a LF.

Tus cambios de localizadores en los goldens 26/28/31 y dashboard (`getByTestId('cad-ribbon-command-X')`)
estan bien: mismo gesto, sin ambiguedad con la paleta abierta, ninguna asercion tocada.

Siguiente: el lanzador correra los 22 goldens vigilados antes de subir. Si alguno sale rojo, es tuyo.

## 18-sep 13:55 · ROJO ABIERTO Y PRIORIDAD UNO: TUS CAMBIOS ROMPIERON LA LINEA DE COMANDOS. ARREGLALO ANTES QUE NADA

El 18-sep a las 11:42 tu rama (361 commits) paso por PRIMERA VEZ entera la etapa de Build/Test/Lint.
Despues corrieron los E2E por primera vez y fallaron **22 goldens** (corrida 35375933741). No son 22
bugs: son 3 regresiones tuyas de la campana nivel AutoCAD (T7 `@`, T8 resolveDraftPoint, el arranque
plegado de paletas). Mientras no esten en verde, **nada tuyo llega a main**.

**A) La linea de comandos ya no repite el nombre del comando tras el alias.** Golden 201:
    Expected pattern: /LINE/    Received string: "> LPrecise el primer punto"
El comando SI arranca, pero AutoCAD escribe `L` -> `LINE` y tu motor ya no. Busca que commit quito ese
eco: `git log -p origin/main..HEAD -- apps/web/src/lib/cad/engine/command-engine.ts` y los ficheros de
la linea de comandos. Restauralo; no cambies el golden.

**B) La entrada dinamica no muestra sus campos.** `dashboard-document-lifecycle.spec.ts:108` y golden 13:
tras pulsar «Circulo», `getByTestId('cad-dynamic-field-x')` nunca aparece (60 s). Los campos existen en
`CadDynamicInput.tsx:142`; algo ya no los pinta. Sospechosos: 6859ab0d (T7), a03ec799 (T8).

**C) El boton de Encuadre (Pan) ya no se ve en el estudio.** `cables-sueltos` barridos 1/4, 3/4 y 4/4:
«Encuadre · Space» sigue definido en `toolbar.ts:48` pero no aparece en la superficie. **NO retires su
declaracion** de `cables-sueltos.spec.ts:119`: el control no se quito a proposito, se ha escondido.
Averigua por que (¿la paleta arranca plegada?) y que vuelva a verse.

**Como comprobarlo, en local y sin Postgres** (desde `apps/web`, uno a la vez):

    node ../../node_modules/playwright/cli.js test e2e/golden/201-cad-alias-enter.spec.ts --project=chromium --workers=1 --reporter=line

Los 22 estan ahora en `D:\dev\_mimo\goldens-vigilados.txt`: **el lanzador no sube nada hasta que pasen
todos en local.** Lista: 201, 13, 46, 52, 72, 28, 26, 23, 40, 214, 212, 50, 48, 84, 18, 20, 22, 31, 32,
33, 193 y dashboard-document-lifecycle. Arregla A y B primero: casi seguro se llevan a la mitad.

## 18-sep 11:00 · EL ROJO DE 3b565875 (699/700) YA ESTA ARREGLADO EN ba3b3329. NO LO TOQUES

solids-boolean-placement.spec.ts (tu nivel 3D-03) pasaba sus 4 comprobaciones pero las anunciaba por
**stderr** (process.stderr.write y console.error). El runner del CI solo lee stdout: un spec que sale con 0
sin nada en stdout cuenta como MUDO y falla. Ya esta en stdout. **Regla: en los specs, console.log, nunca
console.error para el resultado.** El candado local ahora aplica la misma regla.

## 18-sep 01:50 · NO TE DETENGAS: LA PAUSA SE ACABO. LEE LA CABECERA NUEVA DE MISION-48H.md

Orden del titular: todos los frentes a la vez (nivel AutoCAD, el millar y los 7 toolsets, 3D,
UI/estetica, DWG, bloqueos del usuario), un commit por frente y rotando. Ya no se espera al merge.
Lo unico abierto de este fichero es el rotulo de SURFTRIM de abajo. Todo lo demas es historia.

**Tu mensaje de arranque todavia dice «Mientras exista, cero comandos nuevos». Esa frase quedo
OBSOLETA a las 01:50 y el supervisor la anula aqui:** el lanzador ya la tiene corregida en disco,
pero el proceso en marcha conserva el texto viejo hasta que se reinicie. Manda este fichero.

## 18-sep 01:45 · EL ROJO DE 2374f12c YA ESTA ARREGLADO. NO TOQUES session-storage.spec.ts

`ci-fallo.md` te llego con el log vacio. La causa, medida y reproducida aqui:

    session-storage.spec.ts: Los fixtures hermeticos solo pueden tocar localStorage para
    valle_theme, valle_demo_document ... + 'e2e\fixtures\tool-palette.ts: localStorage). Si el boton no es'

No era codigo: era **la palabra `localStorage` en un COMENTARIO** que escribiste en
`e2e/fixtures/tool-palette.ts` (944b1676). Ese spec escanea el TEXTO de los fixtures a proposito:
es un gate de seguridad (ninguna credencial escondida en localStorage). **Arreglado en `2a517fbb`**
reescribiendo el comentario. **PROHIBIDO anadir claves a `CLAVES_PERMITIDAS`**: eso es bajar un
gate de seguridad. Nada mas fallo; los E2E ni llegaron a correr (se saltan si cae el build).

### Y el siguiente rojo ya esta en tu arbol, sin commitear
`src/lib/cad/engine/command-labels.spec.ts` esta ROJO ahora mismo con tus cambios sin commitear:

    SURFTRIM: un rotulo de boton no termina en punto

Quitale el punto al rotulo de SURFTRIM y, **antes de commitear**, desde `apps/web`:

    npx tsx src/lib/cad/engine/command-labels.spec.ts

Es la TERCERA vez esta noche que cae el CI por un spec de `tsx` que tarda 3 segundos en local
(`command-labels` por SURFOFFSET, `session-storage` por el comentario). Cada uno cuesta ~20 min de
CI y retrasa el merge de 316 commits. **Regla: si tocas etiquetas, resumenes, iconos o fixtures,
corre su spec suelto antes de commitear.**

### Lo que cambie en el lanzador (para que no vuelva a pasar)
El candado «specs de web afectados» ahora corre SIEMPRE los 16 specs que escanean el arbol
(session-storage, ui-wiring, design-system, catalog-contract...) y los hermanos exactos de cada
fichero que cambias, sin tope. Antes cortaba en 20 por orden alfabetico y `command-labels.spec.ts`
se quedaba fuera. Cuesta 52 s. No tienes que hacer nada: si algo de eso esta rojo, no se sube.

## 22:40 · LOS BARRIDOS NO ENCONTRARON NI UN CONTROL MUERTO. YA LOS ARREGLE YO.

Esto es importante y va a tu favor, asi que lee los numeros:

    Barrido 1/4: 116 de 465 controles · 113 con efecto · 0 sin efecto (0 declarados) · 2 no localizables
    Barrido 4/4: 115 de 465 controles · 112 con efecto · 0 sin efecto (0 declarados) · 2 no localizables

**Cero controles sin efecto.** Con 320 comandos y la cinta rehecha, el barrido que existe para
cazar botones muertos no encontro ninguno. Eso es un buen sintoma del trabajo.

Los dos fallaban por lo mismo, y no era un defecto: una **declaracion caduca**. La lista de
excepciones eximia a «Seleccionar — Seleccionar y mover objetos.» —el gemelo que vivia en la
paleta de herramientas extraida— y ese control ya no esta en la superficie; el barrido solo
encuentra «Seleccionar / mover», que SI tiene efecto. El gate lo canta y dice que hacer: «esta
declarado como sin efecto observable, pero ya no existe: retira la declaracion». Es la misma
regla que las exenciones de la sonda: **una deuda saldada se retira**. Retirada en `b2aab090`.

No se puede verificar aqui (el barrido se salta sin la API real), asi que lo juzga el CI. Si
vuelve rojo, sera por otra cosa y te lo digo.

**Con esto, de los seis grupos del censo, CUATRO eran contratos caducos por renombres tuyos y
ninguno un defecto de producto.** Te quedan dos: el recorrido guiado (decision de producto, mas
abajo) y la referencia MED sobre polilinea.

## 22:30 · TRES DE LOS FALLOS YA ESTAN DIAGNOSTICADOS O ARREGLADOS. LEE ESTO PRIMERO

### Los cinco de trazado: ERAN UNA TRADUCCION. Ya los arregle yo.

`102`, `104` y `108` morian con «Expected substring: Viewports · 1 — element(s) not found».
No era un defecto: tradujiste el gestor de presentaciones al espanol (`Viewports · N` ->
`Ventanas · N`, «Standard scale» -> «Escala estandar», «Custom» -> «Personalizada», «Reset» ->
«Restablecer») y los goldens seguian esperando el ingles. **La traduccion es lo correcto** —el
producto es para dibujantes mexicanos y tener «Custom scale» en medio de una UI en espanol era
la inconsistencia—, asi que lo caduco era la prueba. Cambie los seis literales y nada mas; la
intencion de cada asercion sigue igual de exigente. **Medido: los cinco tests en verde, 2,3
min.** Fue en el commit `8bcce035` (donde tambien entro mi cambio del tope de CI).

### `primera-hora`: es TUYO, y es una decision de producto que tienes que tomar

    e2e/real/primera-hora.spec.ts:151
    Locator: getByTestId('cad-guided-tour-step-lamina')  ->  element(s) not found

El paso existe (`guided-tour.ts:58`, id «lamina»). Lo que pasa es tu commit **`037a9620`
«recorrido guiado arranca plegado»**, de la campaña de dejar el lienzo mas grande: el dock
arranca minimizado, asi que el contenido del paso no esta en la pagina y el golden, que exige
que el recorrido «sale una vez», falla.

Las dos cosas que querias son buenas y se pueden tener las dos: **que un recien llegado VEA el
recorrido la primera vez, y que a partir de entonces el lienzo mande.** Eso es lo que yo haria:
arrancar desplegado solo cuando no hay registro previo del recorrido, y plegado en adelante.
Si decides otra cosa, cambia el golden Y explica en el commit por que un desconocido no necesita
ver el recorrido — pero no lo cambies solo para que pase.

### `studio-real-api`: es MIO, y NO se reproduce en esta laptop

    e2e/real/studio-real-api.spec.ts:202
    locator.fill: strict mode violation: getByLabel('Nombre') resolved to 2 elements

Monte un spec de diagnostico contra el servidor local y en `/register` **`getByLabel("Nombre")`
encuentra UN solo elemento**: los rotulos de esa pagina son «Nombre», «Correo electronico»,
«Contrasena» y la casilla de Terminos. Asi que necesita el contexto de pila completa del CI
(build de produccion, API real, Postgres) para aparecer, y no me invento la causa. Queda para
la proxima corrida; si vuelve, lo persigo con la traza del CI. Los pasos 5-12, 13-15 y 16 de ese
mismo spec SI pasaron al reintentar, asi que no es el alta lo que esta roto.

## EL CENSO DE E2E (reparto original, con las correcciones de arriba)

Corrida **35300771925** sobre `dcdcc3a5` (297 commits). Lo bueno primero: **«Contrato · Build ·
Test · Lint · Smoke» PASO ENTERO por primera vez en esta rama**, y con el tambien
«Despliegue · Imagen reproducible + arranque productivo», Gitleaks y Lighthouse. Los cuatro
fragmentos de Playwright corrieron por fin. Dos terminaron (89 y 85 pruebas en verde cada uno) y
**dos se CANCELARON al llegar a los 60 min de tope** — eso ultimo no es un fallo de producto y ya
lo arregle yo (ver abajo).

**Y el dato que reparte culpas:** en `main` (corrida 35295899318) los cuatro fragmentos salieron
en VERDE. Asi que lo que falla aqui es una regresion de esta rama, no deuda vieja.

### TUYO — el area de presentaciones y trazado (lo mas gordo)

    e2e/golden/102-auditoria-imprimir-reimprimir.spec.ts:307  «2. crear la hoja»
    e2e/golden/102-auditoria-imprimir-reimprimir.spec.ts:438  «imprimir, cambiar la escala y volver a imprimir»
    e2e/golden/102-auditoria-imprimir-reimprimir.spec.ts:479  «teclear PLOT saca la hoja...»
    e2e/golden/104-auditoria-plot-extension.spec.ts:86        «PLOT: control contra caso (Extension y Limites)»
    e2e/golden/108-auditoria-escala-bloqueada.spec.ts:57      «hoja recien creada, escala apagada y candado mudo»

Los tres de 102 mueren en el MISMO sitio y con el mismo mensaje:

    await page.getByRole("button", { name: "+ Hoja" }).click();
    await expect(page.getByTestId("cad-layout-manager")).toContainText("Viewports · 1");
    -> Error: expect(locator).toContainText(expected) failed — Timeout 15000ms

O sea: **crear una hoja ya no deja una ventana dentro**. No es que el boton se haya movido de
pestaña —lo pulsa por su rotulo— es que el comportamiento cambio. Mira lo que tocaste en
presentaciones (LAYOUT, MVIEW, SOLVIEW, VIEWBASE) y en los valores por defecto de una hoja
nueva. Lo estoy reproduciendo en esta laptop para darte la causa exacta; si lo tengo antes que
tu, lo escribo aqui.

    cd apps/web
    node ../../node_modules/playwright/cli.js test e2e/golden/102-auditoria-imprimir-reimprimir.spec.ts --project=chromium --workers=1 --reporter=line

### TUYO — el barrido de cables sueltos, en los DOS fragmentos que terminaron

    e2e/real/cables-sueltos.spec.ts:429  «barrido 1/4 · ningun control visible se pulsa sin consecuencia»
    e2e/real/cables-sueltos.spec.ts:429  «barrido 4/4 · idem»

Ese barrido pulsa TODOS los controles visibles del estudio y exige que cada uno tenga
consecuencia. Con 320 comandos y la cinta rehecha, lo mas probable es que hayas dejado botones
nuevos que no hacen nada medible: es exactamente el relleno, pero en la UI en vez de en el
manifiesto. Saca la lista de culpables del propio informe del barrido.

### TUYO, probablemente — la referencia MED sobre polilinea

    e2e/golden/120-cad-polyline-midpoint-snap.spec.ts:58  «MED, y solo MED, sobre un tramo de
    POLYLINE anuncia "medio" en el HUD»   (tarda 2,1 min y falla tambien al reintentar)

### MIO — identidad y primera hora (no lo toques)

    e2e/dashboard-document-lifecycle.spec.ts:8   locator.fill: timeout de 60 s
    e2e/real/primera-hora.spec.ts:142            «el recorrido guiado sale una vez, lleva a un PDF»
    e2e/real/studio-real-api.spec.ts:199         «registra y verifica por el harness seguro»

De estos me encargo yo. Ojo: en `studio-real-api` los pasos 5-12, 13-15 y 16 SI pasaron al
reintentar, asi que el 1-4 puede ser orden o estado compartido, no un defecto del alta.

## LO QUE YA ARREGLE YO (no lo repitas)

- **`.github/workflows/ci.yml`: el tope de cada fragmento pasa de 60 a 90 min.** Medido: en
  `main` los fragmentos tardan 31, 43, 44 y 49 min, asi que 60 dejaba 11 min de margen al mas
  lento; con esta rama dos se cancelaron. Un fragmento cancelado tiñe de rojo sin enseñar nada.
  Cada fragmento suma su rebanada de goldens MAS una rebanada del barrido de cables sueltos, que
  por si sola declara 30 min de tope. Esto no afloja ninguna prueba: corre las mismas y las deja
  terminar. **Cuando vuelva a rozar el tope, lo que toca es repartir en mas rebanadas** (el
  inventario se parte por indice modulo cuatro y los titulos dicen «barrido k/4»: hay que
  cambiar las dos cosas a la vez), no seguir subiendo el reloj.
- **`c638b8f2`**: la fusion con `main` (#216, SLICE + R7), resuelta combinando las dos mitades
  de `solids-modify.ts` porque las dos hacen falta.
- **`badf26f5`**: las zonas de clic del ViewCube con 24 px de lado libre. Tu golden 215 pasa
  **3 de 3**, medido aqui.

## AHORA PUEDES SEGUIR AÑADIENDO COMANDOS MIENTRAS ESPERAS — CON UNA CONDICION

Rectifico lo que te dije antes. Como los siete candados del lanzador mantienen la rama subible,
que sigas con el millar mientras el CI corre (una hora por vuelta) es buen uso del tiempo. La
condicion es doble y no se negocia:

1. **Cada comando entra COMPLETO en el mismo commit**: descriptor, rotulo en
   `command-labels.ts`, resumen, icono, sitio en la cinta y su spec. SURFOFFSET sin rotulo tumbo
   la aplicacion entera un rato («Fallo de render: el comando SURFOFFSET no tiene rótulo»), y con
   eso cualquier golden que corra mientras tanto falla por algo que no es lo que mide.
2. **El trinquete de lint se queda en verde.** Ya te bloqueo un push: 5 avisos
   `no-unused-vars` en `meshes.ts`, `meshes.spec.ts`, `surfaces.ts` y `surfaces.spec.ts`, todos
   con presupuesto 0. Corre `npm run check:lint-budget` antes de comitear.

Y la prioridad sigue siendo la de arriba: **los goldens rotos van ANTES que un comando nuevo**.
Sin E2E verde no hay merge, y sin merge los 300 commits siguen valiendo cero.

## LO QUE VALE ORO Y YA SABES QUE PUEDES HACER

- Los goldens de Playwright **corren en esta laptop** (el config levanta Next y usan backend
  falso; Postgres solo lo piden los de pila completa):
  `cd apps/web && node ../../node_modules/playwright/cli.js test <spec> --project=chromium --workers=1 --reporter=line`
  Deja captura, traza y `error-context.md` en `e2e/.test-results/`.
- Un spec de web suelto: `cd apps/web && npx tsx <spec>`. Segundos, no diez minutos.
- `gh` funciona: `gh run view <ID> --log-failed`. Y `gh pr checks` MEZCLA corridas viejas: mira
  los `jobs` de la ultima corrida por su ID.
- **NO corras jest de la api aqui** (faltan los binarios de better-sqlite3): su juez es el CI.
