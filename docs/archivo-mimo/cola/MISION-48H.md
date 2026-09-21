> **VENTANA DE MERGE ACTIVA (19-sep 00:55). LA ROTACION QUEDA SUSPENDIDA HASTA QUE LA #209 SE MERGEE.**
> A las 00:33 anadiste MESHSMOOTH/MORE/LESS pese a la orden de las 22:50: NO mas comandos, familias ni
> redisenos mientras `gh pr view 209 --json state --jq .state` diga OPEN. Solo: arreglar lo rojo de ci-fallo.md,
> los goldens pendientes (18, 193, 20, 22, 84, 32, 33, 31, 23, 40, 48, 50, 212, 214) y los puntos V1-V7 de
> CRITICA-DEMO-18SEP.md que sean ARREGLOS (no V3/V4 grandes). Cuando diga MERGED, vuelve la rotacion de abajo.
>
> **LA PAUSA SE ACABO (18-sep 01:50, orden del titular). NO TE DETENGAS NUNCA.**
> T18 esta cerrado. Ya NO se espera al merge para construir. La regla nueva, cada vuelta:
>
> 1. Si `bloqueos-actuales.md` o `ci-fallo.md` traen un rojo ABIERTO, arreglalo primero (un commit).
>    Suele ser un spec de 3 segundos: correlo suelto antes de commitear. Luego sigue construyendo.
> 2. Si no hay rojo abierto, **construye**. El lanzador sube y mergea solo; tu no esperas a nadie.
>
> **ROTACION POR FRENTES: Sergio quiere TODOS a la vez, no uno.** Un commit por tarea y pasas al
> siguiente frente. Una vuelta completa son SIETE commits: DOS del frente 1 (los tres profesionales de
> la auditoria coincidieron en que es lo que hoy les impide usarlo) y uno de cada uno de los demas:
>
> 1. **Nivel AutoCAD: que un profesional lo use** (cotas que imprimen a su tamano, Ctrl+P que no
>    salga en blanco, designar con ventana dentro de una orden, vista previa al girar/escalar/desfasar,
>    FILLET/CHAMFER/OFFSET sobre polilineas, asociatividad que sobrevive a MOVE).
>    Fuente: `NIVEL-AUTOCAD-MEDIDO.md` (21 puntos con fichero:linea; abre SOLO el `## AREA-N` que
>    vas a hacer) y sobre todo `CAMPANA-NIVEL-AUTOCAD.md` (YA EXISTE, 18-sep 02:09), que manda sobre el
>    orden: empieza por la OLA 1 (T3, el texto del PDF a su tamano). Prefija esos commits con
>    `nivel(T3): ...` para no confundirlos con las T viejas de la cola.
> 2. **El millar y los siete toolsets**, por familias completas, nunca comandos sueltos.
>    Fuente: Fase 2 de abajo (Superficies, Mallas, Transformar-3D, Visualizacion, Render) y despues
>    `CAMPANA-AUTOCAD.md`.
> 3. **3D superior al de AutoCAD.** Fuente: `CAMPANA-3D.md` y los puntos MODELO-1..3 de
>    `NIVEL-AUTOCAD-MEDIDO.md` (vanos que no salen en alzados, cotas que mueren al actualizar
>    SOLDRAW, SUBTRACT que corta en el sitio equivocado).
> 4. **UI, UX, layout y estetica: como se ve es sumamente importante.** Fuente PRIMERA: `CRITICA-DEMO-18SEP.md` (V1-V7, lo que Sergio y el supervisor vieron en produccion); despues Fase 3 de abajo y
>    `tareas/INDICE.md`, seccion «Se ve precario».
> 5. **DWG e interoperabilidad.** Fuente: puntos INTEROP-1..3 de `NIVEL-AUTOCAD-MEDIDO.md` (no hay
>    boton de exportar DWG; las presentaciones se pierden en DXF) y la tarea D07 ($INSUNITS).
> 6. **Lo que bloquea al usuario.** Fuente: `tareas/INDICE.md`, seccion «Bloquean al usuario», y
>    `CAMPANA-PREMIUM.md`.
>
> Si un frente no tiene nada que puedas cerrar en una vuelta, salta al siguiente: nunca te quedes
> parado. Las reglas de siempre siguen vigentes: las seis piezas de cada comando nuevo, cero
> exenciones nuevas, cero gates aflojados, `package.json` intocable, arbol limpio.

# ORDEN DEL TITULAR (17-sep 10:40): EL MILLAR DE COMANDOS. VALLECAD TIENE QUE SUPERAR A AUTOCAD EN TODO

Sergio lo ha dicho sin matices: **VALLECAD tiene que tener los comandos de AutoCAD completo —el millar
de la base y los de sus siete toolsets— y superarlo en todos los sentidos.** Esta es tu mision hasta
nuevo aviso. Todo lo que sigue en este fichero sigue vigente y se aplica a esta orden.

## El objetivo, medido
- **Hoy:** 356 nombres de comando en `apps/web/src/lib/cad/engine/command-manifest.ts`. Una auditoria
  esta midiendo cuantos de esos son reales y cuantos solo registran un nombre.
- **Meta:** AutoCAD base (~1.000 comandos) mas los siete toolsets. **El mapa ya existe, no lo inventes:**
  `.mimocode/hoja-de-ruta-autocad.md` (10 fases: nucleo 3D, Arquitectura, MEP, Electrico, edificio por
  niveles, Mecanico, Map, Raster, Plant 3D) y `.mimocode/inventario/` (9 dominios con lo que ya hay).

## Como leer la hoja de ruta SIN quedarte sin contexto (son 350 KB entre las dos)
La prohibicion de leerla que tenias queda levantada, pero **UNA FASE POR VUELTA, nunca entera**:
    grep -n "^### Fase" .mimocode/hoja-de-ruta-autocad.md        # indice de fases y sus lineas
    sed -n '57,146p' .mimocode/hoja-de-ruta-autocad.md           # solo la fase que toca
Del inventario, abre solo el fichero del dominio en el que estes trabajando.

## Orden de conquista
0. **Lo que ya tienes tiene que llegar a main primero** (Fase 0 de abajo). Mil comandos en una rama que
   no mergea valen cero. Si el CI esta rojo, eso va antes que cualquier comando nuevo.
1. **AutoCAD base por familias completas, en orden de uso real de un arquitecto o ingeniero:**
   dibujo 2D y modificacion -> anotacion y cotas -> capas, bloques y referencias -> presentacion,
   laminas y trazado -> solidos, superficies y mallas -> documentacion desde el modelo (VIEWBASE) ->
   visualizacion y render -> parametrico y restricciones -> datos, tablas y campos -> utilidades.
2. **Luego los toolsets, en el orden de la hoja de ruta:** Arquitectura -> MEP -> Electrico ->
   Mecanico -> Map 3D -> Raster -> Plant 3D.

## «Superar en todos los sentidos» no es solo contar comandos
Cada eje tiene su medida y su gate; que ninguno empeore mientras anades comandos:
- **Rendimiento:** 60 fps con 100.000 entidades (`check:etapas-100k`, `check:slo-navegador`).
- **Sin instalar nada:** todo corre en el navegador; nada que exija un plugin o un binario nativo.
- **Colaboracion en vivo:** presencia y edicion simultanea que AutoCAD no tiene de serie.
- **DWG/DXF sin licencia de terceros:** lectura propia (AC1015/AC1018 hoy; la moderna esta autorizada en T10).
- **Espanol y normas mexicanas de dibujo de primera:** rotulos, prompts y `check:normas-mx` en verde.
- **Ergonomia:** la cinta, la linea de comandos y las paletas tal como pide la Fase 3 de este fichero.

## LA VARA: que cuenta como comando y que NO
- **Cuenta** solo si cumple las cuatro condiciones de la regla 2 de este fichero: esta en el manifiesto,
  se alcanza desde la cinta y desde la linea de comandos con su alias de AutoCAD, tiene un spec que
  CONDUCE el comando real contra el motor real y comprueba geometria o comportamiento, y esta documentado.
- **NO cuenta, y no se registra:** un nombre que solo abre un aviso, devuelve «no implementado» o no
  hace nada verificable. **Si todavia no puedes implementarlo de verdad, NO lo metas en el manifiesto
  ni en la cinta**: un boton que no funciona es peor que no tenerlo.
- **Un alias no es un comando nuevo** (ROTATE3D -> 3DROTATE, REGEN3D -> REGEN): registralo, pero no
  lo sumes al contador.
- **Maximo TRES comandos por commit, cada uno con su spec.** Nunca mas 13 en un commit como anoche:
  asi no hay forma de saber cual funciona.
- **La exencion no es la via facil (regla nueva del 17-sep 18:40).** Si la sonda deja tu comando en
  `no-concluyente`, la primera respuesta es **ensenarle a la sonda a conducirlo** (el
  auto-respondedor vive en `apps/web/scripts/command-integrity-probe.mts` y ya sabe responder
  numeros, puntos y designaciones). Declararlo en `command-integrity-exemptions.json` es el ultimo
  recurso, no el atajo. **Y si DOS comandos seguidos te salen no-concluyentes, para de anadir
  comandos y ensena a la sonda:** con nadie mirando dos dias, una exencion por comando convertiria
  el millar en mil nombres sin medir, que es exactamente lo que la auditoria de esta manana
  encontro. Hoy hay 9 exenciones sobre 315 comandos; que siga siendo una rareza.
  (El gate ya exige que cada exencion nombre el spec que CI ejecuta, el fragmento que CONDUCE el
  comando y la asercion que COMPRUEBA su efecto, y valida las tres. No intentes esquivarlo.)

## ANTES DE COMITEAR UN COMANDO NUEVO: ESTA LISTA, SIEMPRE (17-sep 22:50)

Los candados del lanzador te han bloqueado el push dos veces esta noche por lo mismo: comandos
a medio registrar. Primero 5 avisos `no-unused-vars` en `meshes.ts` y `surfaces.ts`; despues
esto, que lo cazo en 23 segundos:

    comandos registrados sin icono: 3DFACE, CONVTOMESH, CONVTOSOLID, MESH, SURFOFFSET
    el panel «Mallas» no tiene icono declarado

Un comando no esta hecho hasta que estan las SEIS piezas, y todas en el MISMO commit:

1. el descriptor (su modulo en `engine/commands/`),
2. el rotulo en `command-labels.ts`  — sin esto **la aplicacion entera deja de renderizar**,
3. el resumen en `command-summaries.ts`,
4. el **icono** en `command-icons.ts` (y si abres un panel nuevo, su icono en `ribbon-icons.ts`),
5. su sitio en la cinta (`ribbon-order.ts` / `ribbon.ts`),
6. su spec conduciendo el motor de verdad.

Y estos cuatro comandos, en este orden, antes de `git commit`. Los cuatro juntos tardan menos
de cuatro minutos y te ahorran una corrida de hora y media:

    cd apps/web
    npx tsx src/components/cad/ribbon/command-icons.spec.ts
    npx tsx src/components/cad/ribbon/ribbon-icons.spec.ts
    cd .. && cd ..
    node scripts/cad/build-command-manifest.mjs && node scripts/cad/check-ribbon-coverage.mjs && node scripts/cad/ui-command-reach.mjs
    npm run check:lint-budget

Si añades un panel nuevo a la cinta, suma tambien `npx tsx src/lib/cad/ribbon.spec.ts` y
`npx tsx src/lib/cad/ribbon-layout.spec.ts`.

## El contador
Al cerrar cada vuelta, una linea en la bitacora con este formato exacto, para que se pueda seguir:
    CONTADOR 2026-09-17 HH:MM · comandos reales N · alias M · objetivo 1000 · familia en curso X

**Linea base MEDIDA el 17-sep a las 19:40, con la sonda nueva de main (#215): usala como punto
de partida y no inventes otra.** Sobre tu rama fusionada:

    315 comandos en el manifiesto (118 modulos)
    109 mutan verificado  +  52 delegan   =  161 con EFECTO VERIFICADO
     23 informan · 122 declaran su limite · 9 exentos declarados
      0 exitos falsos · 0 ROJOS en las dos pasadas (plano2d y solidos3d)

«Comandos reales» del contador = los 161 con efecto verificado. Los 122 que declaran su limite
NO cuentan como hechos: son honestos, que es distinto. Y cada vez que subas el numero, que sea
porque la sonda lo dice, no porque tu lo digas: el artefacto
`docs/cad/evidence/command-integrity.json` es la fuente y el lanzador lo refresca solo.

Contra el objetivo: AutoCAD base ronda los 1.000 comandos mas sus siete toolsets. **161 de 1000
demostrados.** Ese es el numero honesto de hoy, y es el que hay que mover.

---

# MISION 48 H · VALLECAD TIENE QUE TENER TODO LO QUE TIENE AUTOCAD (orden del titular, 16-sep 15:55)

Sergio deja la laptop encendida dos dias y se va. Nadie te va a revisar. Su orden, literal: que
VALLECAD tenga **superficies, mallas, render, la familia VIEWBASE y los miles de comandos de
AutoCAD**, que quede **esteticamente perfecto, con una ingenieria de layout y de frontend
perfecta**, y que **todo quede mergeado en `main`**.

## LA UNICA METRICA
Commits MERGEADOS en `main` y visibles en vallecad.com. Trabajo en la rama sin mergear vale cero.
Hoy, 16-sep, la cuenta es CERO: 183 commits tuyos llevan horas esperando. Eso es lo primero que
hay que romper.

## ORDEN DE BATALLA (no lo cambies)

### FASE 0 — Desatascar (ahora mismo, antes de cualquier cosa nueva)
`T13` de la cola: los cuatro specs rojos (`service-worker-harness`, `mechanical`, `solids`,
`ribbon`). Con esos cuatro en verde el CI pasa y tus 183 commits entran en `main`.
Cuando el lanzador escriba «Integrado en main», pasas a la Fase 1. Tope: si dos vueltas seguidas
no puedes arreglar nada porque el fallo es del entorno, anotalo y sigue (regla de T12).

### FASE 1 — Lo que Sergio ve al abrir la web (frentes ya construidos, solo hay que aterrizarlos)
Las ramas `claude/vc-correo`, `claude/vc-ribbon` y `claude/vc-demo3d` traen trabajo hecho que NO
esta en `main`. Cherry-pickea cada una a tu rama, una por una, pasando gates (ver T12 §2).
Con eso el sitio ya se ve distinto: marca VALLECAD, alta sin friccion, cinta sin saturar, demo 3D.

### FASE 2 — LA CAMPANA DE COBERTURA (el grueso de las 48 h)
Medida el 16-sep contra `command-manifest.ts` (301 comandos): Solidos 23/23, Visualizacion 10/20,
Transformar-3D 3/8, **Superficies 0/14**, **Render 1/13**, **Mallas 0/15**, **VIEWBASE 0/6**.
Se cierran **por familias completas**, en este orden, porque asi es como un arquitecto las usa:

**2.1 · Familia VIEWBASE (6) — documentacion desde el modelo. Es la tesis del producto.**
`VIEWBASE`, `VIEWPROJ`, `VIEWSECTION`, `VIEWDETAIL`, `VIEWEDIT`, `VIEWUPDATE`.
Ya tienes `SOLVIEW`/`SOLDRAW` funcionando: delega en ellos, no reescribas el motor.
Las fichas A1-A7 de `CAMPANA-AUTOCAD.md` ya traen el spec de cada una.

**2.2 · Superficies (14)** — `PLANESURF`, `SURFNETWORK`, `SURFPATCH`, `SURFBLEND`, `SURFEXTEND`,
`SURFFILLET`, `SURFOFFSET`, `SURFTRIM`, `SURFUNTRIM`, `SURFSCULPT`, `CONVTOSURFACE`, y las
variantes de superficie de `LOFT`, `SWEEP` y `REVOLVE`. Empieza por `PLANESURF` y `CONVTOSURFACE`
(las mas simples, y de ellas dependen las demas) y sigue por `SURFOFFSET` y `SURFTRIM`.

**2.3 · Mallas (15)** — `MESH` (primitivas), `CONVTOMESH`, `CONVTOSOLID`, `MESHSMOOTH`,
`MESHSMOOTHMORE`, `MESHSMOOTHLESS`, `MESHREFINE`, `MESHSPLIT`, `MESHCREASE`, `MESHUNCREASE`,
`MESHCOLLAPSE`, `MESHEXTRUDE`, `MESHMERGE`, `MESHCAP`, y las mallas regladas clasicas
(`RULESURF`, `TABSURF`, `REVSURF`, `EDGESURF`, `3DFACE`).

**2.4 · Transformar-3D, lo que falta (5)** — `3DALIGN`, `3DSCALE`, `MIRROR3D`, `3DARRAY`, `ALIGN`.

**2.5 · Visualizacion, lo que falta (10)** — `3DWALK`, `3DFLY`, `3DSWIVEL`, `VPOINT`, `PLAN`,
`CAMERA`, `DVIEW`, `NAVVCUBE` pulsable de verdad, `NAVBAR` acoplada, y `VISUALSTYLES` que PINTEN
distinto (Alambre, Oculto, Sombreado, Sombreado con aristas, Realista, Conceptual).

**2.6 · Render (13)** — `RENDER`, `RENDERCROP`, `RENDERWIN`, `RENDERPRESETS`, `RENDEREXPOSURE`,
`RENDERENVIRONMENT`, `MATBROWSER`/`MATERIALS`, `MATERIALMAP`, `MATERIALATTACH`, `POINTLIGHT`,
`SPOTLIGHT`, `DISTANTLIGHT`, `SUNPROPERTIES`, `GEOGRAPHICLOCATION`. En navegador: WebGL con
sombras y oclusion ambiental, y que la imagen renderizada se exporte a PNG con la escala pedida.

**2.7 · Cobertura ancha** — cuando esas familias esten cerradas, sigue con `CAMPANA-AUTOCAD.md`,
`CAMPANA-3D.md`, `CAMPANA-PREMIUM.md` y `tareas/INDICE.md` hasta agotarlas. AutoCAD ronda el millar
de comandos; el camino para acercarse es familia completa a familia completa, nunca comandos
sueltos que no se alcanzan desde ningun sitio.

### FASE 3 — LAYOUT Y FRONTEND PERFECTOS (en paralelo: una ficha de esta fase cada tres de la 2)
Sergio dice que el sitio «se ve barato y saturado». Objetivo: que un ingeniero abra el estudio y lo
sienta AutoCAD, no una web.
- **Cinta**: pestanas Inicio · Insertar · Anotar · Parametrico · Vista · Solidos 3D · Superficies ·
  Mallas · Render · Salida. Grupos nombrados, 1-2 botones grandes mas pequenos en dos o tres filas,
  grupos plegables, **sin scroll horizontal a 1366 px**, tooltip con nombre, alias y una linea de
  ayuda. Todo comando nuevo de la Fase 2 entra en su grupo el mismo dia que nace.
- **Iconografia**: UNA familia de iconos, mismo grosor de trazo, misma rejilla, mismo tamano
  optico. Nada de mezclar estilos; si un icono no existe, se dibuja en ese mismo sistema.
- **Lienzo y paletas**: el lienzo manda (>= 75 % del alto util a 1800x962); paletas laterales
  plegables y acoplables; linea de comandos acoplada abajo con historial y autocompletado; barra de
  estado con OSNAP, ORTO, POLAR, REJILLA, GROSOR, MODELO/PAPEL y coordenadas vivas.
- **Tema**: el estudio en oscuro por defecto (como AutoCAD), la web publica en claro. Tokens del
  sistema de diseno, jamas colores a mano; relleno y tinta son tokens distintos y `--primary` no es
  relleno de boton.
- **Ritmo y aire**: una escala de espaciado y se respeta; tipografia con jerarquia clara; menos
  tarjetas y mas aire en las paginas publicas; ninguna pantalla con dos elementos compitiendo por
  ser el principal.
- **Rendimiento percibido**: nada de saltos de layout al cargar; el lienzo a 60 fps con 100k
  entidades (ya hay bancos: `check:etapas-100k`, `check:slo-navegador`).
Gates que lo vigilan y tienen que quedar verdes: `check:contrast`, `check:surface`, `check:fonts`,
`check:ribbon-coverage`, `ui-command-reach`, `check:lighthouse`.

## MINAS DEL PRESUPUESTO DE MONOLITO (medido el 17-sep 18:15, lo vas a pisar si no lo sabes)

El gate `check:monolith-budget` da un maximo de **800 lineas** a todo fichero versionado que no
tenga permiso propio en `scripts/cad/monolith-budget.json` (12 permisos heredados, y sus techos
solo pueden BAJAR). Ya tumbo una corrida hoy: `identity.controller.ts` a 833.

Medi el arbol entero. Estos ficheros estan **exactamente en 800 lineas**: una linea mas y el CI
cae.

    apps/web/src/lib/cad/verification/terceros-jornada.spec.ts
    packages/dwg-codec/src/container/ac1015-header-variables.ts
    packages/dwg-codec/tests/unit/entities-complex.spec.ts
    scripts/cad/rubric.spec.mjs
    scripts/dwg/dxf-oracle.mjs

Y estos tres estan a 2-6 lineas del techo **y son justo los que toca anadir un comando nuevo**:

    apps/web/src/lib/cad/render/pipeline.ts                        798
    apps/web/src/lib/cad/entity-commands.ts                        794
    apps/web/src/components/cad/command-line/command-engine-host.ts 784

**Regla, entonces:** antes de anadir lineas a cualquiera de esos, extrae a un modulo nuevo lo
que toque (un tipo de comando de entidad por fichero, un paso del pipeline por fichero). Cuesta
5 minutos y evita 15 de corrida. **PROHIBIDO** anadir un fichero a `allowances` o tocar
`scripts/cad/check-monolith-budget.mjs`; y `--update` sigue prohibido en todos los trinquetes.
Comprueba siempre con `node scripts/cad/check-monolith-budget.mjs` antes de comitear.

## REGLAS DE LA CAMPANA (esto separa «hecho» de «parece hecho»)
1. **UNA FICHA POR COMMIT.** Mensaje en espanol con la ficha delante: `feat(2.2/SURFOFFSET): ...`.
2. **Un comando no existe hasta que cumple las cuatro cosas:** esta en
   `apps/web/src/lib/cad/engine/command-manifest.ts`; se alcanza desde la cinta Y desde la linea de
   comandos con su alias de AutoCAD; tiene un spec que **conduce el comando real contra el motor
   real y comprueba geometria o comportamiento** (nunca un grep del fuente, nunca un spec que se
   prueba a si mismo); y aparece en la documentacion del comando.
3. **Antes de empezar una ficha**, `grep -rn "<COMANDO>" apps/web/src/lib/cad/engine/command-manifest.ts`.
   Si ya existe, compruebalo con el arnes de `solview-commands.spec.ts`: si funciona, marcalo como
   «ya existia» en la bitacora y pasa a la siguiente. Cero redundancia.
4. **Nunca debilites un gate ni un test.** Si crees que un spec esta mal, commit aparte que empiece
   por `test:` explicando por que la propiedad que comprobaba sigue cubierta.
5. **Nunca toques `package.json` ni `package-lock.json`.** Bloquea la integracion entera.
6. **Arbol limpio** al cerrar cada ficha (`git status --short` vacio); los ficheros temporales van
   fuera del repo.
7. **No inventes capacidades en la UI ni en los textos.** Si `SURFSCULPT` aun no esta, la cinta no
   lo anuncia. DWG solo se reclama para AC1015/AC1018.
8. **Cada vuelta empieza leyendo** `.mimocode/ci-fallo.md` (si existe) y `.mimocode/cola-vallecad.md`.
9. **Bitacora**: al cerrar cada ficha, una linea en `docs/execution/` diciendo que hueco media, que
   codigo reutilizaste y con que spec lo demostraste.

## QUE NO HAY QUE HACER
No abras ramas nuevas: commitea en `D:\dev\valle-design` sobre tu rama y el lanzador sube, abre PR
y pide el auto-merge cada 20 minutos. No intentes hacer `push` (esta bloqueado a proposito). No
esperes instrucciones: cuando cierres una ficha, coge la siguiente sin preguntar.
