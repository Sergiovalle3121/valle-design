# COLA VALLECAD — orden del titular, 16-sep-2026

Esta cola MANDA sobre cualquier otra lista, incluida `prompt-noche.md`.
**NO leas `hoja-de-ruta-autocad.md` ni `.mimocode/inventario`**: son 350 KB que te dejan
sin contexto para escribir codigo. Ese fue el motivo de que en toda la campana anterior
el 97 % de los tokens se fuera en releer y solo salieran 46 k tokens de codigo.

**La app esta EN PRODUCCION en https://vallecad.com.** Lo que rompas se ve.

**Reglas:**
- Un commit por tarea. Haz, comprueba, commitea, siguiente.
- Antes de dar algo por HECHO, **ejecuta** su comprobacion. Una afirmacion sin comprobacion
  ejecutada se considera falsa: tres revisiones adversariales anteriores encontraron que 13 de
  18 y 19 de 34 de tus «HECHA» no lo estaban.
- **Prohibido** tocar `package.json`, `package-lock.json`, presupuestos, umbrales, aserciones
  de specs, o bajar un gate. Si un gate se pone rojo, arregla la causa.
- Si un hallazgo resulta ser falso al mirarlo, ANOTALO en la bitacora y pasa al siguiente.
  No inventes un arreglo para un problema que no existe.

- El paquete de la API se llama valle-design-api, NO api (apps/api/package.json:2). Si ves
  «No workspaces found: --workspace=api» en cualquier sitio, incluido .mimocode/ci-fallo.md,
  el que esta mal es EL COMANDO, no tu codigo: corrige el comando y sigue. PROHIBIDO anadir un
  alias api a package.json, a workspaces o al lockfile: eso bloquea la integracion entera.

---

## T12 · SERGIO SE VA 48 HORAS (16-sep 15:20). LO UNICO QUE CUENTA ES QUE `main` CAMBIE

Nadie te va a mirar hasta el 18-sep. Sigue vivo el lanzador: cada 20 minutos coge tus
commits, corre los gates locales, los sube, abre/actualiza la PR y pide el auto-merge;
si el CI falla te deja la causa exacta en `.mimocode/ci-fallo.md` y te relanza con ese
aviso. Tu no puedes hacer `git push` (esta bloqueado a proposito, no lo intentes ni
busques la forma): tu trabajo es COMMITEAR en `D:\dev\valle-design` y dejar la rama VERDE.

**REGLA DE ORO DE ESTAS 48 HORAS: no vale acumular trabajo, vale que `main` cambie.**
Mientras el CI este rojo, arreglar el CI es tu tarea principal, PERO CON TOPE: si pasas DOS
vueltas seguidas sin poder arreglar nada —porque ya estaba arreglado, porque el fallo es del
lanzador o del entorno (un workspace mal escrito, VALLE_DWG_CORPUS_MIRROR que en esta laptop no
existe, la red)— deja de mirar el CI, anotalo en la bitacora como «bloqueo fuera de mi
alcance», BORRA .mimocode/ci-fallo.md y sigue bajando por la cola. Quedarte dos dias girando
sobre un fallo que no puedes cerrar es el peor resultado posible: cero commits tampoco vale.
Una rama de 180 commits que nunca se mergea no vale nada;
tres commits mergeados valen mas que trescientos sin mergear.

### 1) El ciclo, cada vuelta, en este orden
-1. **Si existe `.mimocode/bloqueos-actuales.md`, leelo PRIMERO y haz lo que dice.** Lo escribe el
   supervisor con lo que de verdad impide el merge, medido, y el lanzador NO lo sobrescribe (a
   diferencia de `ci-fallo.md`). Si trae un rojo ABIERTO, arreglalo primero; si solo trae
   historia ya resuelta, sigue construyendo con la rotacion de seis frentes de `MISION-48H.md`
   (cambiado el 18-sep 01:50: antes decia «mientras exista, no se anaden comandos nuevos», y como
   este fichero no se borra nunca, eso era una pausa eterna).
   **Y NO LO BORRES NUNCA, ni aunque te parezca viejo.** El 17-sep a las 18:00 lo borraste
   («Delete stale bloqueos-actuales.md») y te quedaste sin el unico canal por el que se te dice
   que ya esta medido y que no hace falta volver a mirar. Si crees que esta desfasado, escribelo
   en la bitacora y sigue trabajando: el fichero se queda. Lo unico que puedes borrar cuando lo
   resuelvas es `ci-fallo.md`, que el lanzador reescribe en cada ciclo.
0. **Si existe `.mimocode/conflicto.md`, leelo ANTES que nada.** Significa que hay una fusion con
   `main` ABIERTA en tu arbol y que mientras no la termines NADA de tu trabajo puede subirse.
   No ejecutes `git merge`, `git rebase` ni `git pull`: tu entorno los bloquea. Lo que si puedes:
   editar los ficheros marcados, `git add` de cada uno y `git commit` al final.
1. Lee `.mimocode/ci-fallo.md` si existe: es el ultimo rojo REAL del CI. Arreglalo primero.
2. Arregla UNA causa por commit, con el minimo cambio. Si un gate te senala, el que esta
   mal es tu codigo: nunca toques el gate, ni su presupuesto, ni el test que te delata.
3. Antes de commitear, pasale a lo que tocaste su comprobacion mas barata (una a la vez,
   esta laptop tiene 8 GB): `npm run typecheck --workspace=web`, `npm run lint --workspace=web`,
   `npm run lint --workspace=valle-design-api`, `npm run test:specs --workspace=web`, y el `check:*`
   concreto del gate que fallo (mejor `node scripts/...` suelto que `check:cad` entero).
4. Anota en la bitacora lo que has hecho y sigue. No esperes a nadie.
5. **ESTAS SOLO: nadie va a leer una pregunta tuya.** No termines nunca una vuelta pidiendole a
   Sergio que ejecute algo ni esperando respuesta. Si una via esta bloqueada de verdad, escribe
   que pasa y que intentaste en `.mimocode/bloqueo.md` y **sigue con la tarea siguiente**. Una
   vuelta que termina preguntando es una vuelta perdida; el 16-sep perdiste dos asi.
6. **La shell es PowerShell 5.1**: `cd X && comando` NO funciona (el operador `&&` no existe).
   Lanza cada comando con su directorio de trabajo, o encadena con `;`. El 16-sep diste por
   fallados cuatro specs de T13 que en realidad nunca llegaron a ejecutarse por esto.

### 2) Trabajo YA HECHO que no tienes que rehacer (ramas de este mismo repositorio)
Otros agentes dejaron cinco ramas partiendo de `main` (b90a9a42). Miralas con
`git log --oneline b90a9a42..<rama>` y `git show <sha>`: los objetos estan en este mismo `.git`.

- `claude/vc-registro` -> PR #212. La casilla de Terminos se marca con el raton y los errores
  del alta salen en espanol. Subida y con auto-merge: **no la toques**, se mergea sola.
- `claude/vc-landing` -> PR #213. Marca VALLECAD en toda la superficie publica y portada nueva
  de siete secciones. Subida y con auto-merge, pero su CI estaba ROJO al cerrar: el gate de
  superficie publica dice que `apps/web/src/app/page.tsx` nombra a AutoCAD (solo se permite en
  `components/marketing/TrademarkNotice.tsx`; habla del FORMATO), y un script de gate no resuelve
  `@/config/brand` al correr en Node. **No la toques mientras tu rama siga roja.**
- `claude/vc-ribbon` -> subida (7 commits), sin PR. Cinta con paneles de tres filas, desplegable
  de panel y plegado por ancho; sin scroll horizontal a 1366 px.
- `claude/vc-demo3d` -> LOCAL, sin subir (3 commits). La vivienda de dos plantas como recetas
  SOLID3D con sus plantas derivadas. Worktree en `D:\dev\vc-demo3d`; puede tener cambios sin
  commitear: son borradores a medias, no los commitees a ciegas.
- `claude/vc-correo` -> LOCAL, sin subir (9 commits). Los correos se firman con el nombre del
  producto configurado, un solo correo de verificacion y soporte por configuracion. Worktree en
  `D:\dev\vc-correo`; idem, tiene borradores sin commitear.

**Como aprovecharlas, y SOLO cuando tu rama este verde y mergeada:** `git cherry-pick -x <sha>`
uno a uno desde `D:\dev\valle-design`, pasando los gates despues de cada uno. Nunca antes de
estar verde: meterias rojo nuevo en una rama que ya esta roja y no saldrias jamas. Si un
cherry-pick sale vacio porque esa rama ya se mergeo por su PR, `git cherry-pick --skip`.

**Si pasadas 12 horas la #212 o la #213 siguen sin mergearse**, deja de esperarlas: cherry-pickea
sus commits a tu rama (`git log --oneline b90a9a42..claude/vc-registro` y `..claude/vc-landing`),
arregla lo que el CI marque y que entren por tu PR. Lo que importa es que el trabajo llegue a
`main` y se vea en vallecad.com, no que sobreviva una PR concreta.

### 3) Orden del trabajo una vez que `main` tenga tus commits
**LEE `.mimocode/MISION-48H.md`: es la orden del titular para estas 48 horas** (superficies,
mallas, render, familia VIEWBASE, cobertura ancha de comandos, y layout y frontend perfectos,
todo mergeado). Manda sobre cualquier otro orden escrito antes. Resumen de lo inmediato:

1. `claude/vc-correo`: que cualquiera del mundo se de de alta sin friccion. Es lo que mas duele.
   Tienes la auditoria completa, con fichero:linea y los specs que tocar, en
   `.mimocode/tareas/CORREO-ALTA.md`. LEELA ENTERA antes de empezar: la causa de que el enlace
   del correo diera «no es valido» ya esta localizada.
2. `claude/vc-ribbon`: la cinta, si su rama no se mergeo por su cuenta.
3. `claude/vc-demo3d`: la demo 3D con solidos de verdad.
4. Lo que sigue en esta cola: CAMPANA-PREMIUM, T8/T10 (DWG), `tareas/INDICE.md`, CAMPANA-3D,
   CAMPANA-AUTOCAD. Una tarea por commit, siempre.

### 4) Lo que te ha costado corridas de CI hoy: no lo repitas
- Regenerar evidencia sin `VALLE_DWG_CORPUS_MIRROR` (esta laptop no lo tiene): no la regeneres.
- Tocar `package.json` o `package-lock.json`: el lanzador bloquea la integracion entera.
- Superar un presupuesto de `check:monolith-budget`: si un fichero crece, saca lo nuevo a un
  modulo aparte; esos ficheros solo pueden encoger.
- Nombrar a AutoCAD o a cualquier competidor en superficie publica: la unica linea permitida
  vive en `components/marketing/TrademarkNotice.tsx`. Habla del FORMATO (DXF/DWG) y de lo que
  hace el producto.
- Debilitar un test o un gate para que pase: se revierte y pierdes la vuelta entera.
- **La cadena `dwg-codec` (y `@valle-design/dwg-codec`, `packages/dwg-codec`, `../dwg-codec`) no
  puede aparecer en NINGUN fichero salvo los dos que ADR-0009 autoriza — NI EN UN COMENTARIO.**
  `scripts/dwg/check-product-boundary.mjs` busca el literal, no el import. Si necesitas hablar del
  laboratorio DWG en un comentario, descriibelo sin escribir su nombre de paquete.
- **Los scripts de `scripts/**` y `apps/web/scripts/**` corren en Node pelado: el alias `@/...` NO
  se resuelve.** Si un gate falla con `Cannot find module '@/config/brand'`, el arreglo es importar
  por ruta relativa desde el script, no tocar el `tsconfig` ni el gate.
- **`check:surface` prohibe nombrar a AutoCAD (y a cualquier competidor) en superficie publica**,
  incluido `apps/web/src/app/page.tsx`. La unica linea permitida vive en
  `components/marketing/TrademarkNotice.tsx`. Habla del FORMATO (DXF/DWG) y de lo que hace VALLECAD.
- Cuando el CI caiga, la causa exacta la tienes en `.mimocode/ci-fallo.md`, y el gate que la produjo
  casi siempre se puede correr suelto en local (`node scripts/...`): corre ESE, no la cadena entera.

---

### 5) Cuatro reglas que salen de auditar tus cinco ultimas vueltas (16-sep 15:30)

1. **UN COMMIT POR PUNTO NUMERADO, SIN EXCEPCION.** Aunque un bloque tenga cinco puntos, son cinco
   commits: arreglas el punto, corres SU comprobacion, commiteas con el numero delante
   (`fix(T9.3): ...`) y pasas al siguiente. Tu commit `00cd795c` junto cinco causas en 14 ficheros
   y hubo que deshacer tres por separado; eso costo media tarde.
2. **Para enchufar un gate nuevo NO se edita `package.json`.** La unica via permitida es llamarlo
   desde un `.mjs` que ya este encadenado (por ejemplo `scripts/design/check-public-surface.mjs`)
   con un import y una llamada. Si tocas `package.json` o `package-lock.json`, el lanzador bloquea
   la integracion entera y esa vuelta no sube nada.
3. **DEJA EL ARBOL LIMPIO.** Los ficheros de diagnostico temporales van a
   `C:\Users\sergi\AppData\Local\Temp`, NUNCA dentro de `D:\dev\valle-design` (nada de
   `tmp-diag.mts`, `.tmp-spec-results.txt` y similares). El lanzador cuenta tambien los ficheros
   sin seguimiento: si el arbol esta sucio, no puede mover tu rama sobre main despues de un merge
   y se queda esperando. Antes de cerrar cada punto: `git status --short` y que no sobre nada.
4. **No te quedes bloqueado esperando el merge.** La regla de oro es que el CI manda: en cuanto el
   lanzador escriba un fallo nuevo en `.mimocode/ci-fallo.md`, eso es lo primero. Pero si llevas
   mas de seis horas sin un fallo nuevo y sin merge, sigue bajando por la cola en vez de parar:
   trabajo bien hecho y commiteado nunca sobra, lo que sobra es esperar.

## HISTORICO

T0, T9 y T11 ya estan hechas o superadas por T13; su texto completo vive en
`.mimocode/tareas/HISTORICO-T0-T9-T11.md`. No hace falta leerlo salvo que el CI vuelva a
sacar algo de ahi.

---

## VALVULA DE ESCAPE · QUE HACER SI EL CI SE ATASCA Y NO HAY NADIE (17-sep 18:20)

Sergio esta fuera dos dias y el supervisor puede no estar. Esta es la unica regla que te permite
seguir cuando la regla general («verde antes que nada nuevo») te dejaria parado sin avanzar.

**Cuenta las vueltas.** Si la MISMA causa de CI sale roja **cuatro vueltas seguidas** (unos 80
minutos) y en cada una intentaste un arreglo de verdad y distinto:

1. Escribe `.mimocode/atascado.md` con: la firma exacta del fallo (el nombre del job, el paso y
   la linea del log), los cuatro intentos, y por que fallo cada uno. Se breve y concreto.
2. **Sigue con la mision del millar.** No te quedes en bucle: los comandos nuevos se acumulan en
   la rama y entran todos juntos el dia que el bloqueo caiga, igual que pasaron los 280 de hoy.
3. Reintenta el bloqueo **una vez cada cinco vueltas**, no en todas. Si en el reintento se te
   ocurre una causa nueva, anotala en `atascado.md`.
4. Si la causa cambia, el contador se reinicia: eso es progreso, no atasco.

**Lo que esta prohibido para desatascarte, siempre y sin excepcion:** aflojar un gate, subir un
techo, anadir un fichero a `allowances`, anadir una exencion a
`command-integrity-exemptions.json`, correr cualquier trinquete con `--update`, poner
`eslint-disable`, prefijar con `_` para callar al linter, marcar un test como `skip`, o tocar el
fichero del propio gate. Un gate aflojado no es un bloqueo resuelto: es el bloqueo escondido, y
se descubre igual, mas tarde y peor.

**Y un caso que NO es atasco:** el job `E2E Playwright` sale rojo por arrastre cuando
`Contrato · Build · Test · Lint · Smoke` cae antes (sus cuatro fragmentos quedan `skipped`).
Arregla el primero y el segundo se resuelve solo.

---

## T18-CIERRE-2 · MEDIDO POR EL SUPERVISOR A LAS 17:55: T18 ESTA HECHO. NO REPITAS NADA DE ABAJO

Todo lo que dicen las dos secciones siguientes (T18-CIERRE de las 13:50 y T18 de las 11:00) **ya lo
hiciste**. Lo comprobe yo sobre tu arbol a las 17:55, gate por gate, no de oidas:

- El trinquete de lint (apartado D) esta resuelto: `lint` de web y de api salen con codigo 0.
- Los cuatro ficheros que vaciaste siguen vivos y sin avisos por encima de su presupuesto.
- `ui-command-reach`: **315 de 315 comandos alcanzables con el raton**, verde.
- `check:governance`: verde (11 pass, 0 fail). `build-command-manifest`: 315 comandos en 118 modulos.
- `check:api-console`: verde, 110 operaciones sincronizadas con el contrato.
- Sonda de integridad: **315 comandos, 0 ROJO, 0 exitos falsos, 85 mutan + 49 delegan**.
- La sonda, su verificador y la lista de exenciones de tu rama son **byte a byte** identicos a los de
  `main`: no tocaste el instrumento de medida. Eso es exactamente lo que se te pidio.
- Los tres tests de la api que quedaban los arreglaste en `b2d65f7b` y `2e32deb3`. El artefacto de
  integridad lo refresque yo en `bedec92d` (era un rojo seguro por un fichero generado).

**Lo unico que falta es el veredicto del CI sobre esos arreglos.** Mientras la PR #209 no diga
`MERGED`, tu tarea es que salga verde, y nada mas. En cuanto diga `MERGED`, la pausa de
`.mimocode/MISION-48H.md` se levanta SOLA y sigues con el millar de comandos: un comando por commit,
su spec conduciendo el motor, sin stubs en el manifiesto. No esperes a que nadie te de permiso.

Las dos secciones de abajo se quedan solo como historia de lo que se midio y cuando.

---

## T18-CIERRE · MEDIDO POR EL SUPERVISOR A LAS 13:50 (HISTORICO, YA CUMPLIDO)

Lo verifique yo, gate por gate, sobre tu arbol de trabajo. **Quince gates deterministas del CI estan
en VERDE**: json-keys, doctor, fonts, contrast, surface, conventions, legal, authz, monolith-budget,
cad-math (ya regeneraste el dictamen OpenAPI: bien), template-gallery, precision-evidence,
command-integrity, e2e-localizadores y auditoria.

Y la sonda de integridad, medida por mi: **310 comandos, 0 ROJO, 0 exitos falsos, 134 con efecto
verificado**. T18 apartados A, B, C y E: HECHOS. VIEWBASE funcionando. Bien hecho.

**Lo unico que queda es el apartado D, el trinquete de lint.** CORRECCION de las 13:55: los dos
ficheros de identidad de la api YA ESTAN resueltos. Lo que falla ahora son **12 avisos
`@typescript-eslint/no-unused-vars`** en los cuatro ficheros que vaciaste al retirar los stubs, cada
uno con presupuesto 0:

    apps/web/src/lib/cad/engine/commands/meshes.ts               -> 2
    apps/web/src/lib/cad/engine/commands/surfaces.ts             -> 2
    apps/web/src/lib/cad/engine/commands/transform-3d-extra.ts   -> 5
    apps/web/src/lib/cad/engine/commands/view-visualization.ts   -> 3

Son imports y helpers que quedaron sin usar al quitar los comandos. **Los cuatro ficheros siguen
vivos** (los carga `lazy-commands.ts` y `all-commands.ts` y cada uno exporta algo que se usa), asi que
NO los borres: borra dentro lo que ya no se usa. Si al final alguno se queda sin nada que exportar,
entonces si retiralo tambien de `lazy-commands.ts` y de `all-commands.ts`.

Sin `eslint-disable`, sin prefijar con `_` para callar al linter, sin tocar
`scripts/check-lint-budget.mjs` ni su JSON, y PROHIBIDO `--update`. Comprueba con:

    node scripts/check-lint-budget.mjs

**En cuanto eso este verde, tus 251 commits tienen el camino libre a `main` por primera vez.** Ese es
el momento en que se reanuda la orden del millar, con la vara de un comando por commit y su spec.

---

## T18 · AUDITORIA DE TU NOCHE (17-sep 11:00): 57 DE 62 COMANDOS SON RELLENO Y HAY 4 TRAMPAS. ESTO VA ANTES QUE TODO

Una auditoria con verificacion adversaria reviso los 67 commits que hiciste solo el 16-sep. Resultado:
**de los 62 comandos que anadiste, 2 funcionan (VIEWSECTION, VIEWDETAIL), 3 a medias (VIEWBASE,
VIEWPROJ, VIEWEDIT) y 57 son relleno (92 %).** Tu recuento con efecto verificado subio de 131 a 136:
cinco en toda la noche. Y hubo cuatro trampas contra los gates. **Hasta que esta tarea este hecha, esta
PROHIBIDO anadir un solo comando nuevo** (la orden del millar en MISION-48H.md queda en pausa).

### A) Deshaz las cuatro trampas (un commit cada una)
1. **588d2206** — juntaste `hatchPickMode` y `hatchPickSolid` en un solo `useState<{mode,solid}>`
   (`Layout3DEditor.tsx:1434`) solo para bajar el contador de 119 a 118. El propio gate dice que la
   descomposicion SACA estado del monolito, no lo comprime. **Revierte esa fusion y saca estado de verdad**:
   `activeViewPreset` (de tu cf568fe5) o el estado de HATCH a un hook propio. Ese commit ademas borro los
   alias ROTATE3D y REGEN3D que habias metido a mano en `command-manifest.ts`, que es un fichero GENERADO:
   si los quieres, van en `commands/*.ts`.
2. **4b4cdb86** — `CadLienzoAncho.spec.ts:23` paso de comprobar el comportamiento (`useState(true)`, el
   recorrido arranca minimizado) a comprobar que el fichero contiene la palabra «minimized». Eso tapa
   una regresion real: desde b5f4013d el recorrido arranca desplegado (`guided-tour.ts:261`). **Restaura
   una asercion de comportamiento y arregla la regresion.**
3. **adb75533** — declaraste a DVIEW exento en `command-integrity-exemptions.json:13`. DVIEW repite el
   mismo menu con cada respuesta, sin fin (`view-visualization.ts:73-84`). **Quita la exencion y saca DVIEW
   del manifiesto** hasta que termine y cambie la camara, con un spec que lo conduzca.
4. **eb75aa1b THICKEN** — responde «superficie espesada N unidades» sin hacer nada, declara
   `mutates:true` y el alias esta mal escrito («ESPEZAR»). **Retiralo.** Y lo mismo con la frase de las
   tres luces («creada con intensidad N — requiere WebGL»): o crean algo o dicen que no existen.

### B) Retira el relleno (sin anunciar nada que no funcione)
Saca del manifiesto, de la cinta (`ribbon.ts`, `ribbon-order.ts`, `command-labels.ts`) y de cualquier
texto de la web estos 57: Render (los 13), Mallas (18, todos salvo MESH), Superficies (10 + THICKEN),
los 4 de transform-3d-extra (3DALIGN, 3DSCALE, MIRROR3D, 3DARRAY), los 8 de visualizacion (3DWALK,
3DFLY, 3DSWIVEL, CAMERA, NAVVCUBE, NAVBAR, VISUALSTYLES, DVIEW) y VIEWUPDATE. **Un boton que no hace nada
es peor que no tenerlo.** Cuando los implementes de verdad, vuelven a entrar uno a uno.
- **MESH y PLANESURF** insertan un solid3d VACIO (`points:[]`, `faces:[]`) y dicen «malla creada».
  O generan geometria real (MESH con el constructor de `solids-primitive-modes.ts:227`, PLANESURF
  triangulando el contorno) o rechazan la orden. Su spec debe exigir `points.length > 0` y area o
  volumen mayor que cero.
- **3DALIGN, 3DSCALE, MIRROR3D, 3DARRAY** dicen «pendiente del kernel», pero `transform3d` YA existe
  (`transform-3d.ts:96-110`). Esos cuatro son los mas baratos de hacer bien: hazlos DESPUES de retirar.

### B-0) EL ORDEN QUE TE AHORRA UNA CORRIDA DE CI (17-sep 13:00) — LEE ESTO ANTES DE B
Vas muy bien: el manifiesto ya bajo de 362 a **313** y la sonda de tu rama es identica a la de `main`
(no la tocaste: correcto). Pero acabas de subir `ebde42a1` con la evidencia VIEJA
(`docs/cad/evidence/command-integrity.json` dice 362) y por eso el CI va a caer en
`check:command-integrity` sin decirte nada nuevo.

**Haz estas dos cosas en la MISMA vuelta, y en este orden, antes del siguiente push:**
1. **Retira el relleno que queda** (son los que siguen en el manifiesto):
   `3DALIGN`, `3DSCALE`, `MIRROR3D`, `3DARRAY`, `3DWALK`, `3DFLY`, `3DSWIVEL`, `CAMERA`, `NAVVCUBE`,
   `NAVBAR`, `VISUALSTYLES`, `VIEWUPDATE`. Y decide sobre `MESH` y `PLANESURF`: o generan geometria de
   verdad (apartado B) o salen tambien.
2. **Y SOLO DESPUES** regenera la evidencia UNA vez:
       node scripts/cad/check-command-integrity.mjs --write
   Commiteala aparte. Si la regeneras antes de retirar, la subes con unos 35 ROJO y pierdes 35 minutos
   de CI para enterarte de algo que ya sabes.

Comprueba antes de dar la vuelta por terminada, en este orden y todo en verde:
    node scripts/cad/check-command-integrity.mjs
    node scripts/cad/ui-command-reach.mjs --write     (si el gate lo pide)
    node scripts/cad/build-command-manifest.mjs
    npm run typecheck --workspace=web

### B-bis) AVISO IMPORTANTE (17-sep 12:20): la sonda de integridad de `main` ya es mas estricta
El supervisor mergeo en `main` el commit `4a6f6eaf` con cuatro reglas nuevas en
`apps/web/scripts/command-integrity-probe.mts`. Sobre `main` no marca en rojo NI UN comando legitimo
(294 comandos, 0 rojos), pero **sobre tu rama va a marcar en rojo unos 35 de los comandos de relleno**
en cuanto recojas `main`. Las reglas son:
- **R1:** un comando con `mutates:true` que termina sin aplicar lote, sin delegar y sin declarar su
  limite sale ROJO.
- **R2:** un lote cuyo unico cambio es una entidad SIN geometria (brep con `points`/`faces` vacios,
  area o volumen 0) ya NO cuenta como «muta»: sale ROJO. Esto marca a MESH y PLANESURF.
- **R3:** un mensaje no puede ser a la vez exito y limite. «creada ... requiere WebGL» sale ROJO. Se
  analiza por clausulas, asi que ya no sirve mezclar una promesa con un «pendiente» o un «requiere».
- **R4:** una exencion solo vale si el spec que cita CONDUCE el comando y comprueba su efecto.

**La respuesta correcta a esos rojos es el apartado B de arriba: RETIRAR el relleno.** No es tocar la
sonda, ni anadir exenciones, ni reescribir los mensajes para esquivar las reglas nuevas. Si intentas
cualquiera de esas tres cosas, se revierte y se pierde la vuelta: la sonda y el fichero de exenciones
son del supervisor, no tuyos. Cuando un comando funcione de verdad y su spec lo demuestre, volvera a
entrar y la sonda lo dira sola.

### B-ter) COMO RESOLVER EL CONFLICTO CON `main` EN LOS FICHEROS DE LA SONDA (17-sep 12:20)
Tu PR quedo en conflicto (DIRTY) en cuanto `main` recibio la sonda endurecida. Para estos tres
ficheros el criterio general NO aplica; resolverlos mal deshace el endurecimiento y se revierte:

- `apps/web/scripts/command-integrity-probe.mts` -> **SIEMPRE la version de MAIN**, entera. No la
  mezcles con nada tuyo: tu rama no debe tener ni una linea propia en ese fichero.
      git checkout --theirs -- apps/web/scripts/command-integrity-probe.mts   (en una fusion, MAIN es --theirs)
      git add apps/web/scripts/command-integrity-probe.mts
- `scripts/cad/command-integrity-exemptions.json` -> **SIEMPRE la version de MAIN** (nueve exenciones,
  ninguna tuya; la de DVIEW ya la quitaste y main nunca la tuvo). Mismo procedimiento.
- `docs/cad/evidence/command-integrity.json` -> **NO lo resuelvas a mano ni eligiendo un lado**: es
  evidencia GENERADA. Resuelve primero los otros dos, y cuando el arbol este sin conflictos:
      node scripts/cad/check-command-integrity.mjs --write
  Eso lo reescribe con lo que de verdad mide la sonda nueva sobre TU codigo. Commitealo aparte con
  `fix(ci): regenerar command-integrity con la sonda endurecida de main`.

Ese fichero regenerado va a mostrar **unos 35 ROJO**: son tus comandos de relleno, y es correcto que
salgan. El gate va a fallar hasta que los retires (apartado B). Ese es el orden: resolver la fusion,
regenerar la evidencia, y despues retirar el relleno hasta que la sonda diga 0 rojos.

### C) Arregla VIEWBASE, que esta a medias — Y LA SONDA YA LO MARCA EN ROJO
**Medido por el supervisor a las 13:20 con la sonda endurecida: VIEWBASE sale ROJO.** El motivo
confirma el diagnostico: cuando se conduce automaticamente se queda en
«VIEWBASE: escriba una altura o pulse Intro» y **termina sin aplicar ningun lote**, es decir, NO crea
la vista. La altura y el nombre que guardas fuera de `state` (`viewbase-commands.ts:240, 258`) el motor
no los ve (`command-engine.ts:468`), y por eso el flujo no se cierra. Arreglar esto no es cosmetico:
es la diferencia entre que VIEWBASE funcione y que no.
De los 10 rojos que da la sonda hoy sobre tu rama, 9 son relleno que hay que retirar (3DALIGN, 3DARRAY,
3DSCALE, CAMERA, MESH, MIRROR3D, NAVBAR, NAVVCUBE, PLANESURF) y el decimo es este VIEWBASE, que hay que
ARREGLAR, no retirar: es la tesis del producto.


Guarda `_name` y `_cutHeight` fuera de `state` (`viewbase-commands.ts:240, 258`) y el motor no los ve
(`command-engine.ts:468`): la vista siempre se llama «Vista», siempre sale en planta y la altura de
corte se ignora. Pasa `name`, `cutHeight` y `dir` a `ViewbaseState` y respeta Alzado e Isometrica. En
`viewbase-commands.spec.ts:118-155` exige `kind === 'document'` y comprueba `viewport.name` y
`view.kind` (quita el `else` que acepta `'message'`).

### D) El CI en verde, sin tocar presupuestos
- `check:lint-budget`: 12 avisos `no-unused-vars` en `meshes.ts`, `surfaces.ts`, `render-commands.ts` y
  `view-visualization.ts`, que tienen presupuesto 0. Quitalos del codigo. **Prohibido `--update`.**
- `check:monolith-budget`: se arregla con el punto A1, no de otra forma.

### E) El tercer rojo del CI: el dictamen del contrato OpenAPI (YA PUEDES ARREGLARLO)
`check:cad-math` cae porque el dictamen congelado del oraculo OpenAPI habla de los bytes de un contrato
anterior (sha `b49cf909`) y el `packages/contracts/specs/design-api.v1.yaml` de tu rama es otro (sha
`2b8bbe24`, lo cambio el arreglo del correo 2c91e333 que cherry-pickeaste). El contrato es VALIDO: el
supervisor lo comprobo el 17-sep a las 11:30. Solo hay que volver a congelar el dictamen.
**La herramienta ya esta instalada** en esta laptop (`openapi-spec-validator` 0.9.0, la version exacta
que exige el script). Ejecuta, desde `D:\dev\valle-design`:

    python docs/cad/corpus/oraculos/censo-openapi.py

Escribe UN fichero, `docs/cad/corpus/oraculos/openapi-spec-validator-0.9.0.json`, y debe terminar con
`-> VALIDO`. Commitealo solo, con el mensaje
`fix(ci): volver a congelar el dictamen OpenAPI para el contrato actual (sha 2b8bbe24)`.
Esto SI es regenerar evidencia y SI esta permitido: el gate lo exige de forma determinista y la
herramienta es la fijada por el repo. Despues corre `node scripts/cad/rubric.mjs --markdown --check`;
si tambien se queja del contrato, regenera la matriz como hiciste en 51a2b024 y commitea aparte.

### LA NUEVA VARA (sustituye a la de MISION-48H.md mientras dure la pausa)
- **UN comando por commit**, no tres.
- Un comando entra al manifiesto SOLO con un spec que pase por `command-engine` con su alias, aplique el
  lote con `executeCadEntityCommandBatch` y MIDA la geometria o la vista resultante. Un spec que solo
  comprueba `kind === 'message'` o que el nombre existe no vale. Los recuentos de comprobaciones no se
  escriben a mano.
- **Nunca** escribas una frase de exito («creada», «espesada», «definida», «establecido») si el
  comando no cambio nada. Nunca disenes un mensaje para que una sonda lo clasifique distinto: eso es la
  trampa mas grave que se puede hacer aqui, y se detecta.

Cuando A, B, C y D esten hechos y el CI este verde, la orden del millar se reanuda con esta vara.

---

## T17 · LINT WEB: 8 ERRORES EN TU CODIGO NUEVO DE RENDER/SUPERFICIES/3D (16-sep 20:10)

La fusion con main ya esta cerrada (bien hecho) y el typecheck pasa. Ahora el candado se para aqui:

    npm run lint --workspace=web   ->  65 problemas: 8 ERRORES, 57 avisos

Los 8 errores son todos `@typescript-eslint/no-explicit-any` («Unexpected any. Specify a different
type») y estan en el codigo que acabas de escribir para la campana:

    apps/web/src/lib/cad/engine/commands/render-commands.ts
    apps/web/src/lib/cad/engine/commands/render.spec.ts
    apps/web/src/lib/cad/engine/commands/surfaces.ts
    apps/web/src/lib/cad/engine/commands/transform-3d-viz.spec.ts

Los 57 avisos NO bloquean nada: no los toques. `--fix` no arregla ninguno de los 8; hay que poner
tipos de verdad. Ya lo hiciste bien una vez hoy en `a96d449a` («reemplazar any por interfaces
minimas en dxf-semantic-blocks.ts»): mismo patron, interfaces minimas con los campos que de verdad
usas, nunca `unknown` con casts ni `eslint-disable`.

Corre `npm run lint --workspace=web` (unos 200 s) para ver fichero y linea exactos, arreglalos en un
commit por fichero, y vuelve a correrlo hasta que diga 0 errores. Detras de esto solo queda el
`lint:fix` de la api (T14) y ya sube.

**Ojo con esto, que es la regla mas importante de la campana:** si anades comandos nuevos con `any`
para salir rapido, el candado te va a parar cada vez. Escribe los tipos a la primera.

---

## T16 · YA PUEDES COMPROBAR EN LOCAL CASI TODO LO QUE TE TUMBA EL CI (16-sep 19:35)

Hasta ahora solo podias correr typecheck y lint, y el resto lo adivinabas esperando 35 minutos a
GitHub. Eso se acabo: el entorno esta montado. **Usalo antes de dar nada por hecho.**

### Tu bateria local (todo desde `D:\dev\valle-design`, UNO a la vez, la laptop tiene 8 GB)
| Comprobacion | Comando | Estado medido hoy |
|---|---|---|
| Typecheck web | `npm run typecheck --workspace=web` | verde (15 s) |
| Lint web | `npm run lint --workspace=web` | verde (135 s) |
| Lint api | `npm run lint --workspace=valle-design-api` | **ROJO: 3 errores** (ver T14) |
| Specs web | `npm run test:specs --workspace=web` | **ROJO: 4 de 681** (ver T13) |
| Frontera DWG | `node scripts/dwg/check-product-boundary.mjs` | **ROJO** (ver abajo) |
| E2E golden | desde `apps/web`: `npx playwright test e2e/golden/<fichero>` | ya se puede (navegadores instalados) |

**Playwright ya tiene Chromium y Firefox instalados.** El `webServer` del config arranca `npm run dev`
solo y reutiliza el que ya este levantado, asi que un golden suelto se corre sin montar nada mas.
Eso significa que **los cuatro fragmentos de E2E que tumban la PR ya los puedes reproducir aqui**,
incluido el inestable de T15. Nunca mas digas «esto no se puede comprobar en local» sin intentarlo.

Lo unico que SIGUE sin poder comprobarse aqui: los tests que necesitan Postgres (no hay servidor ni
Docker) y los gates de evidencia DWG que exigen `VALLE_DWG_CORPUS_MIRROR`. Esos dos, y solo esos,
los juzga el CI.

### ROJO NUEVO que nadie te habia dicho: el gate de frontera DWG
    node scripts/dwg/check-product-boundary.mjs
    Error: DWG product boundary: runtime import/reference found in packages\contracts\src\brand.ts

La causa es tu commit `57d634e2` (D49): en `packages/contracts/src/brand.ts:19` escribiste el nombre
del paquete del laboratorio DWG **dentro de un comentario**. El gate busca la cadena literal en
CUALQUIER fichero que no sean los dos que autoriza ADR-0009; un comentario no es excepcion.

**Arreglo:** reescribe ese comentario sin nombrar el paquete (di «el paquete del laboratorio DWG,
que vive en el mismo scope» y ya esta; la rama `claude/vc-landing` lo resolvio asi y paso el CI).
Comprueba con el mismo comando: tiene que terminar sin error.

### Orden para desatascar la PR, en este orden y un commit cada uno
1. T14 — `npm run lint:fix --workspace=valle-design-api` (3 errores de formato).
2. Este T16 — el comentario de `brand.ts:19`.
3. T13 — los cuatro specs rojos, corriendo cada uno suelto.
4. T15 — la linea del golden inestable.
Cuando esos cuatro esten verdes en local, el candado del lanzador te deja subir y el CI juzga el
resto. Ahi es donde empieza a moverse `main`.

---

## T15 · EL TEST INESTABLE QUE VIVE EN MAIN Y TE VA A TUMBAR EL CI AL AZAR (16-sep 18:30)

`apps/web/e2e/golden/160-cad-borrar-documento.spec.ts:93` falla de forma intermitente y **ya esta en
main**, asi que puede reventar cualquier corrida tuya sin que tengas la culpa. Hoy tumbo el
fragmento 2/4 de la PR #212 y hubo que relanzarlo.

**Por que falla:** la linea 92 espera con `await expect.poll(() => archiveCalls).toBe(1)`, y esa
condicion se cumple en cuanto la peticion entra en el mock, ANTES de que la promesa del cliente
resuelva y `setTarget(null)` cierre el dialogo de confirmacion. En ese instante el texto
«Planta baja — casa Reforma» existe DOS veces en la pagina (el `<strong>` de la tarjeta y el `<h2>`
del dialogo «¿Borrar ...?»), asi que el `getByText(...)` de la linea 93 lanza strict mode violation
y falla en el acto, sin reintentos.

**Arreglo minimo (refuerza el test, no lo debilita): UNA linea** entre el `expect.poll` y la 93:

    await expect(page.getByRole("dialog")).toBeHidden();

Asi se comprueba que el dialogo ya se cerro antes de afirmar que la tarjeta desaparecio. **NO**
toques el selector, **NO** anadas `.first()`, **NO** subas timeouts, **NO** cambies nada de
produccion.

**Como se comprueba:** en esta laptop Playwright no tiene navegadores instalados, asi que lo juzga
el CI: haz ese cambio solo, en su propio commit, y mira que los cuatro fragmentos pasen. Si algun
dia hay navegadores, el gate local es, desde `apps/web`:
`npx playwright test e2e/golden/160-cad-borrar-documento.spec.ts --repeat-each=5` (5 de 5 verdes).

**Aparte, para que no persigas un fantasma:** `node scripts/dwg/check-product-boundary.mjs` NO se
puede correr en esta laptop porque `packages/dwg-codec/dist` no esta compilado y el script muere al
cargar `dist/index.js` antes de escanear. En el CI si corre y esta verde. Si lo necesitas en local,
primero `npm.cmd run build --workspace=@valle-design/dwg-codec` desde la raiz.

---

## T14 · LO UNICO QUE BLOQUEA TU PUSH AHORA MISMO (16-sep 18:20)

El candado local del lanzador corre `npm run lint --workspace=valle-design-api` antes de subir y sale
en rojo con **3 errores y 294 avisos**. Los avisos NO bloquean; los tres errores SI, y los tres son
de formato (`prettier/prettier`), o sea que se arreglan solos:

    npm run lint:fix --workspace=valle-design-api

Estan aqui:
- `apps/api/src/...:46:57` — Replace `process.env` con salto de linea.
- `...:49:9` — Replace `performEmailVerification, type EmailVerificationOutcome` con saltos.
- `...:409:37` — Replace `this.dataSource, (t) => this.hashToken(t), raw` con saltos.

Corre `lint:fix`, MIRA EL DIFF (no lo apliques a ciegas: si toca ficheros que no son tuyos,
quedate solo con los tres arreglos), commitea con `fix(lint): ...` y vuelve a la cola. En cuanto
eso pase, el lanzador sube tus 218 commits y arranca el CI.

Ojo: el paquete de la API se llama `valle-design-api`. `--workspace=api` NO existe.

---

## T13 · LOS CUATRO SPECS QUE HOY TE IMPIDEN MERGEAR (medidos el 16-sep a las 15:50)

`npm run test:specs --workspace=web` sobre TU rama da **677 de 681 verdes**. Los cuatro rojos son:

1. `apps/web/src/app/(sw)/service-worker-harness.spec.ts`
2. `apps/web/src/lib/cad/engine/commands/mechanical.spec.ts`
3. `apps/web/src/lib/cad/engine/commands/solids.spec.ts`
4. `apps/web/src/lib/cad/ribbon.spec.ts`

Mientras esos cuatro sigan rojos, el CI de la PR #209 cae y **no se mergea nada**. Son tu tarea
numero uno: uno por commit, y para cada uno corre SOLO su fichero antes de commitear
(`cd apps/web && npx tsx src/lib/cad/ribbon.spec.ts`, etc.; mira como los invoca
`apps/web/scripts/run-specs.mjs` si alguno necesita otro arranque). Cuando los cuatro esten verdes,
corre la tanda completa una vez para confirmar que no rompiste otro.

Dos de ellos apuntan a cosas que tocaste tu esta tarde: `solids.spec.ts` y `mechanical.spec.ts`
(comandos 3D y de mecanica) y `ribbon.spec.ts` (la cinta). El de `service-worker-harness` es del
arnes del service worker.

**Regla que no se negocia:** arreglas el CODIGO para que el spec pase. Si de verdad crees que un
spec esta mal, no lo borres ni lo relajes: explicalo en la bitacora con la evidencia y cambialo en
un commit APARTE cuyo mensaje empiece por `test:` y diga por que la propiedad que comprobaba sigue
cubierta en otro sitio. Tres veces hoy revertimos «arreglos» que eran un test debilitado.

Ojo: el candado local del lanzador ya NO corre estos specs (se quito el 16-sep a las 15:50 porque
levantaba 8 procesos de node y te robaba la memoria). Eso significa que **ahora tus commits se
suben aunque los specs esten rojos**, y el veredicto te llega por `.mimocode/ci-fallo.md` unos 35
minutos despues. Aprovechalo: no subas basura, corre el spec del fichero que tocas.

---

## DESPUES: las 49 tareas de `.mimocode/tareas/`

Las produjeron 71 agentes de revision el 16-sep, cada hallazgo confirmado por un esceptico
independiente contra el codigo (16 hallazgos mas fueron refutados y ya estan descartados).
Cada una trae fichero, linea, el arreglo concreto y su criterio de terminado.

**Lee `.mimocode/tareas/INDICE.md`** y trabaja en ese orden. Cada tarea es un fichero
`Dxx.md` de 5 KB como mucho: **abre SOLO el de la tarea que vas a hacer**, nunca todos.

**Los siete primeros bloquean al usuario. Empieza por ahi, en orden:**

- **D01** La casilla de Terminos no es pulsable con raton (nadie puede registrarse).
  Trae el reemplazo exacto de clases en `Toggle.tsx:52` y por que NO se resuelve envolviendo
  todo en el `<label>`.
- **D02** Produccion puede arrancar SIN proveedor de correo: nadie verifica su cuenta jamas.
- **D03** Entrar con la contrasena CORRECTA y el correo sin verificar responde
  «Credenciales invalidas»: la app miente al usuario.
- **D04** La cookie CSRF la escribe `api.vallecad.com` sin `Domain`, asi que el JavaScript de
  `vallecad.com` no puede leerla.
- **D05** El boton de registro de `/demo` queda pintado DETRAS del editor.
- **D06** Los legales: cambiar el nombre obliga a PUBLICAR version nueva, no a editar.
- **D07** El DXF del cliente entra siempre en milimetros porque se ignora `$INSUNITS`.

Despues siguen 24 de «se ve precario» (la paleta que parte palabras, el boton de soporte que
parece una pestana rota encima de la Biblioteca, «Release Sin validar», el panel de onboarding
que se come 480x346 px del dibujo, y las nueve fases de la marca VALLECAD), 14 de capacidad
frente a AutoCAD y 4 de deuda interna.

**La marca:** el producto se llama **VALLECAD**, en mayusculas. `vallecad` en minusculas solo
en dominios y buzones. Nunca «ValleCAD», nunca «Valle Design». El repositorio SIGUE llamandose
`valle-design` y NO se renombra: de ese nombre cuelgan Railway, el CI y el repo del corpus.

---

## ORDEN DEL TITULAR (16-sep 11:40) — SUPERADA por `.mimocode/MISION-48H.md` (15:55)
*Se conserva porque el criterio de diseno sigue valiendo; el ORDEN de trabajo lo fija la
mision de 48 h, no esta seccion. Donde dice «T9», hoy lee «T13».*


El titular compara VALLECAD con AutoCAD en capturas y su veredicto es que la cinta (ribbon) y la
portada se ven pobres. Por eso, DESPUES de T9 (el CI) el orden es:

1. **`.mimocode/CAMPANA-PREMIUM.md`, empezando por las fichas de la CINTA y del DEMO CON SOLIDOS**
   (P-fichas del frente `taller-jerarquia` y `demo-con-solidos`): la cinta de Inicio mide 5.934 px
   con la barra de desplazamiento oculta y los 23 comandos de solidos empiezan en el pixel 5.124;
   el demo son 22 entidades 2D y al pulsar 3D se ve una planta tumbada. Eso es lo primero que hay
   que cambiar para que se vea el salto. Luego el resto de P-fichas (portada, textos).
2. T8 (textos DWG) y T10 (firma DWG moderna).
3. `.mimocode/tareas/INDICE.md` (lo que quede de las 49 D).
4. `.mimocode/CAMPANA-3D.md` (33 fichas C), alternando con lo que quede de P.
5. `.mimocode/CAMPANA-AUTOCAD.md`: la cobertura 3D y de entregables ficha por ficha (A1-F5), con la
   regla de medir de nuevo y elegir por valor para un arquitecto cuando se acabe. Nunca te paras.

**Y COMMITEA Y DEJA QUE EL LANZADOR SUBA A MENUDO:** el titular quiere VER el avance en
vallecad.com. Un commit por ficha; el lanzador integra cada 30 minutos. Nada de acumular.

---

## REGLA DE HIGIENE (anadida a las 01:05 del 16-sep)

Antes de CADA commit, borra los ficheros temporales que hayas creado para investigar.
Ahora mismo tienes dos tirados en el arbol que NO deben entrar en el repositorio:

- `apps/web/.ribbon-probe.mts`
- `scripts/tmp-missing-summaries.mjs`

Borralos. Y en general: nunca commitees ficheros cuyo nombre empiece por `tmp-`, `.probe`,
`scratch` o similar. El repositorio es el producto.

Los modulos de verdad que extraigas SI van al commit — `layout-approval.ts`,
`same-string-map.ts`, `clash-summary.ts` y `command-engine-host-download.ts` estan bien.

---

## REGLA NUEVA Y DURA (16-sep, 10:20) — ARTEFACTOS DE EVIDENCIA

**PROHIBIDO regenerar cualquier fichero de `docs/cad/evidence/` o `docs/dwg/`** salvo que la
tarea lo pida con nombre y apellido.

**Lo que paso y por que existe esta regla.** Tu commit `63d2378e` («resolve stale evidence
artifacts») regenero `dwg-decoder-matrix.json` y `dwg-roundtrip.json`. Lo hiciste en un entorno
SIN la variable `VALLE_DWG_CORPUS_MIRROR`, asi que el generador no vio ningun bundle del corpus
independiente y escribio honestamente «CERO BUNDLES ADMITIDOS, CERO CAPACIDADES PROMOVIDAS».

Eso no actualizo el artefacto: lo VACIO. Borro 7 bundles admitidos, 14 validaciones
independientes y 2 capacidades promovidas que SI existen. Y el CI, que si engancha el espejo del
corpus, recalculo 7/14/2, vio que el fichero decia 0/0/0 y **reventó, dejando 53 commits tuyos
sin mergear durante horas.**

**La leccion, que aplica a cualquier artefacto generado:** un generador sin sus entradas no
produce «el estado actual», produce «el estado de un entorno incompleto». Si un gate se queja de
que un artefacto esta obsoleto y tu no tienes las entradas para regenerarlo de verdad, NO lo
regeneres: anotalo en la bitacora como bloqueado por entorno y sigue con otra tarea.

**Como saber si tienes las entradas:** `echo $VALLE_DWG_CORPUS_MIRROR`. Si esta vacia, cualquier
gate o generador de DWG que corras da un resultado FALSO. Lo mismo vale para cualquier gate que
lea un espejo, un corpus o un servicio externo.

**Los que SI puedes regenerar cuando tu cambio lo exija**, porque sus entradas estan en el repo:
`command-integrity.json`, `ui-command-reach.json`, `template-gallery.json` e
`independencia-por-fila.json`. Esos cuatro cambiaron bien esta noche.

---

## T8 · URGENTE: la app ya importa DWG y la web dice que no (16-sep, 10:30)

Hoy se encendieron en produccion las banderas `NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA`,
`NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA` y `NEXT_PUBLIC_DWG_MODERN_IMPORT_BETA`. El titular ya
habia firmado la beta (`DWG_BETA_AUTHORIZATION.ownerSigned: true`, ADR-0009, 24-ago).
**CORRECCION 10:40:** el codec LEE AC1015-AC1032, pero en PRODUCCION solo entran **AC1015 y AC1018
(AutoCAD 2000-2006)**. `NEXT_PUBLIC_DWG_MODERN_IMPORT_BETA` es un NO-OP porque
`DWG_MODERN_BETA_AUTHORIZATION.ownerSigned` vale `false` en `dwg-interop-flag.ts`: la familia
moderna (AC1024/AC1027/AC1032, AutoCAD 2010-2018+, el formato por defecto de cualquier AutoCAD
actual) NO tiene firma del titular. **En los textos NO afirmes mas que 2000-2006** hasta que el
titular firme la moderna (eso es un cambio de UNA linea que solo el puede autorizar; NO lo hagas tu).

**Contradiccion que ahora es una MENTIRA al cliente:**
- `apps/web/src/app/precios/PricingCatalog.tsx:42` — «VALLECAD no lee ni escribe DWG»
- `apps/web/src/app/sla/SlaPage.tsx:217` — «no promete compatibilidad DWG nativa»
- `apps/web/src/app/docs/dxf-vs-dwg/page.tsx:89` — «una lectura de DWG seria una reconstruccion aproximada»
- `apps/web/src/components/cad/interop/cad-format-detect.ts:5` — «que aun no parseamos en casa»

**Haz tres cosas, una por commit:**
1. Averigua leyendo `dwg-native-reader.ts`, `document-import.ts` y `CAPABILITIES.md` EXACTAMENTE
   que entra hoy: versiones, tipos de entidad (LINE, CIRCLE, ARC, LWPOLYLINE, TEXT, INSERT...),
   y que se pierde (ATTRIB, HATCH, DIMENSION, paper space, xrefs...). Escribelo en la bitacora.
2. Cambia esos textos para decir LA VERDAD COMPLETA: importacion DWG en beta, versiones
   AutoCAD 2000-2018+, lista de entidades que entran, lista de lo que aun se pierde, y que la
   exportacion DWG NO esta disponible. Ni una palabra mas de lo que el codigo sostiene.
   Respeta el gate `check:surface` (marcas ajenas solo en `TrademarkNotice.tsx`).
3. Comprueba que el selector de archivos de importacion OFRECE `.dwg` cuando la bandera esta
   encendida (`session-catalogs.ts:178` hoy dice que no se ofrece). Si no lo ofrece, arreglalo:
   de nada sirve importar DWG si el usuario no puede elegir el archivo.

**Terminado cuando:** `grep -rn "no lee ni escribe DWG\|aun no parseamos" apps/web/src` no
devuelve nada, un spec comprueba que con `NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA=true` el selector
acepta `.dwg`, y `check:surface`, `check:legal` y `check:governance` siguen verdes.

---

## T10 · FIRMA DEL TITULAR: la familia moderna de DWG (AC1024/AC1027/AC1032) queda AUTORIZADA (16-sep 11:30)

El titular ha ordenado que la importacion DWG funcione con los archivos que manda un cliente
actual (AutoCAD 2010-2026 guardan en AC1024/AC1027/AC1032), y ha dado luz verde expresa.
En `apps/web/src/lib/cad/dwg-interop-flag.ts`, `DWG_MODERN_BETA_AUTHORIZATION` esta sin firma.
**Firmala** siguiendo EXACTAMENTE el patron de `DWG_AC1018_BETA_AUTHORIZATION`: `ownerSigned: true`,
`adrRef` al ADR-0009 (o la seccion que corresponda), `signedDate: "2026-09-16"`,
`legalReviewStatus: "pending_parallel"`. No toques los gates de promocion general
(`DWG_PROMOTION_GATES`): esto es la BETA de solo importacion, igual que las otras dos.
Actualiza los specs que vigilan esa constante y el registro de gobernanza
(`docs/governance/assisted-development-log.json`) con la entrada de la firma.
**Terminado cuando:** `dwgModernBetaImportIsEnabled(true) === true` en un spec que importe el
modulo real; `readDwgNeutralDatabase` acepta AC1024/AC1027/AC1032 con las tres banderas en
`true` (spec con un fixture de cada version del corpus del laboratorio); `check:governance` verde.
Con eso, la variable `NEXT_PUBLIC_DWG_MODERN_IMPORT_BETA=true` que ya esta en Railway deja de
ser un no-op. Y en T8, los textos publicos pueden decir «AutoCAD 2000 a 2026».

---

## REGLA DURA (13:00): `package.json` y `package-lock.json` SIEMPRE IDENTICOS A `origin/main`
Tu commit b774e226 los «restauro al estado pre-#208»: deshizo las subidas de seguridad de main
(next 16.3.5, sharp 0.35.4, multer 2.3.0) y dejo la rama con diferencias en package*.json, que es
exactamente lo que el lanzador bloquea. El supervisor los volvio a poner iguales a main.
**La unica forma valida de tocarlos es `git checkout origin/main -- package.json package-lock.json`.**
Comprobacion antes de cada commit: `git diff origin/main -- "*package.json" "*package-lock.json"` VACIO — TODOS los package.json del monorepo (raiz, apps/web, apps/api, packages/*), no solo el de la raiz.
