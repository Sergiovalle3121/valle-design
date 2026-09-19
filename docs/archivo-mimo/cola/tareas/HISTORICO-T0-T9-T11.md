# HISTORICO · T0, T9 y T11 (16-sep-2026)

Se sacaron de `cola-vallecad.md` a las 16:15 del 16-sep porque estaban hechas o superadas
por la medicion de T13 (los cuatro specs rojos), y sus 12 KB le quitaban contexto a MiMo
cada vuelta. Se conservan porque documentan decisiones y trampas ya pagadas: si algo de
aqui vuelve a aparecer en el CI, la explicacion esta en este fichero.

---

## T11 · LO QUE TUMBO EL CI DE TU PUSH f1c0ea1f (16-sep 13:41) — ARREGLALO ANTES QUE NADA

El check requerido «Contrato · Build · Test · Lint · Smoke» murio en `check:monolith-budget`:

    apps/web/src/lib/cad/dxf-import.ts: 1070 lineas supera su asignacion de 1069.
    Este archivo solo puede encoger — mueve el codigo nuevo a un modulo aparte.

Tu diff sobre main en ese fichero es +6/-5. Saca lo que anadiste (o una funcion auxiliar entera)
a un modulo nuevo `apps/web/src/lib/cad/dxf-import-<tema>.ts` e importalo; el fichero tiene que
quedar en <= 1069 lineas. PROHIBIDO tocar `scripts/cad/check-monolith-budget.mjs` o sus presupuestos.
Comprobacion: `npm run check:monolith-budget`.

Y OJO: ese job ejecuta `npm run check:cad` entero y se para en el PRIMER gate rojo, asi que detras
de este puede haber otro. Corre `npm run check:cad` completo en local y arregla todo lo que salga
(salvo lo que exija `VALLE_DWG_CORPUS_MIRROR`, que aqui no existe: eso NO lo regeneres). Los 4
fragmentos E2E ni siquiera corrieron (skipped) porque dependen de este job: hasta que Contrato
este verde no hay senal de E2E. Commit por punto, push, y mira `gh run list --branch` antes de
darlo por hecho.

## T9 · PRIMERO DE TODO (16-sep, 10:35): EL CI ESTA ROJO EN CINCO PASOS DISTINTOS

Un revisor REPRODUJO el check requerido «Contrato · Build · Test · Lint · Smoke» sobre este arbol,
sin red ni Docker, y falla en CINCO sitios. Si arreglas uno solo y subes, el CI vuelve a caer y
pierdes 90 minutos de corrida. **Arregla los cinco, corre las cinco comprobaciones locales, y
solo entonces commitea.** Un commit por punto esta bien; lo que no vale es subir a medias.

### 1) `check:cad-math` — el importador DXF DUPLICA (y descoloca) las definiciones de bloque
Regresion de tu D43 (`36d86e5c`). En `apps/web/src/lib/cad/document-import.ts:380`
`blocks: [...blockParts.blocks, ...paperBlockParts.blocks]` mete el catalogo de bloques DOS veces
(una por espacio). Los bloques de un DXF son UN catalogo del documento, no uno por espacio:
reusa `blockParts.blocks` y limita `paperBlockParts` a sus `inserts`, resolviendo los ids
contra el catalogo del modelo. Specs rojos: `terceros-bloques.spec.ts` («el lector trae la
unica definicion de bloque del fichero», «y 17 bloques con su definicion») y
`terceros-jornada.spec.ts`. Comprobacion: `npm run check:cad-math`.

### 2) Typecheck web — 4 errores TS2322
`apps/web/src/lib/cad/associative-dimension.spec.ts:96-99`: faltan las `z` en los vertices.
Comprobacion: `npm run typecheck --workspace=web`.

### 3) Lint API — 30 errores de prettier en 9 ficheros de `apps/api/src` que tocaste
`npm run lint:fix` en apps/api los formatea; REVISA el diff, no lo apliques a ciegas.
Comprobacion: `npm run lint --workspace=valle-design-api`.

### 4) Lint web — 1 error `no-require-imports`
`apps/web/src/components/cad/palettes/CadLayoutManager.spec.ts:156`: `require("node:fs")` → import estatico.
Comprobacion: `npm run lint --workspace=web`.

### 5) Web specs — 14 de 681 en rojo. Y varios NO son «actualizar el spec»:
- `command-icons.spec`: «comandos registrados sin icono: 3DMOVE, 3DROTATE…». Ponles icono de
  verdad (mira como lo tienen MOVE y ROTATE), no los excluyas del spec.
- `CadCommandLine.spec.ts:109`: renombraste `navigatedRef` a `navigated` y el spec quedo atras.
  PERO LO GRAVE ES OTRA COSA — tu commit `1451affe` (T2) NO arreglo Enter: Enter YA ejecutaba lo
  tecleado (el codigo anterior hacia `onSubmit(submitted)` incondicional y el golden 85 lo
  probaba desde el PR #178). Lo que hiciste fue ANADIR una intercepcion (si navegas con flechas,
  Enter manda la sugerencia) con una justificacion falsa (los atributos aria-* no interceptan
  teclas), y quitar `aria-activedescendant`, con lo que el golden 162 se rompe y el lector de
  pantalla pierde el descendiente activo. **Revierte la intercepcion de `CadCommandLine.tsx:239-244`
  y restaura `aria-activedescendant={suggestions.length > 0 ? ...}`** como exige el golden 162:33.
  Lo unico bueno de ese commit es el reorden de sugerencias (`sugerirComandos`): eso se queda.
- Tu golden nuevo `201-cad-alias-enter.spec.ts:38` NO PUEDE PASAR: espera /LINE/, /CIRCLE/... en
  el log y el motor escribe prompts en espanol («Precise el primer punto», «Precise el centro»,
  «Designe objetos», «Designe los bordes de corte», «Precise el punto inicial»). Asevera contra
  esos prompts (o contra `cad-command-prompt` como hace el golden 85) y CORRELO antes de darlo por hecho.
- Tu dedup de T3 (`CadCommandLine.tsx:61-68`) es CODIGO MUERTO: el registro revienta ante nombres
  duplicados, asi que nunca hay datos duplicados. Las sugerencias duplicadas que se ven en
  produccion vienen de que la lista se PINTA dos veces (busca el segundo render). Borra el dedup y
  su spec de grep `CadSugerenciasDuplicadas.spec.ts`, y arregla el render doble.
- `CadLienzoAncho.spec.ts:23` y `CadToolPaletteAncho.spec.ts:21`: son grep del fuente y estan
  caducos. Sustituyelos por specs que MIDAN (Playwright: lienzo >= 75 % del viewport a 1800x962;
  ninguna etiqueta de la paleta con `scrollWidth > clientWidth` a 1280/1440/1800).
- `import-report-view.spec.ts:90-95` (tu D07): `dxf-import-report.ts:432-455` anade la fila
  «degraded» a CUALQUIER DXF sin HEADER. La fila solo aparece cuando hay entidades y NO hay
  `$INSUNITS`; un DXF vacio no la muestra.
- `dxf-cad-document.spec.ts` y `dxf-xdata-app-names.spec.ts`: fallan por MLEADER/MULTILEADER,
  de otro cambio tuyo de la rama. Averigua cual y arreglalo.
- `independencia-rubrica.spec.ts`: el censo cambio por una mejora de precision real (7243x).
  Regenera con `cd apps/web && VALLE_ESCRIBIR_CENSO=1 npx tsx src/lib/cad/verification/independencia-rubrica.spec.ts`,
  LEE el `git diff`: si solo cambian filas de precision que MEJORAN, commitea; si alguna fila
  baja a cero o desaparece (esta laptop NO tiene `VALLE_DWG_CORPUS_MIRROR`), revierte y anota
  «bloqueado por entorno».
Comprobacion: `npm run test:specs --workspace=web` con codigo 0.

### 6) Debilitaste dos cosas y hay que deshacerlo
`dxf-export-loss-manifest.ts:409` (bajaste la severidad de una perdida) y el filtro nuevo de
`dxf-document-export.ts:153`. Reviertelos. Bajar la severidad de una perdida para que un spec
calle es exactamente lo que la cola prohibe.

### 7) Gate de marca sin enchufar — SIN TOCAR package.json (corregido 12:50)
**ERROR MIO en la version anterior de este punto:** te dije que anadieras `check:brand-literal` a
package.json. El lanzador bloquea CUALQUIER cambio en package.json o package-lock.json (no
distingue scripts de dependencias) y por eso NO ha subido tus 5 commits: «Integracion bloqueada:
la rama cambia dependencias (package.json)». Arreglo:
1. Deshaz SOLO el hunk de package.json (`git checkout origin/main -- package.json` si es el unico
   cambio, o edita a mano) y commitea «revertir package.json: el lanzador no lo permite». NO
   reviertas el commit entero: el resto de lo que hiciste ahi vale.
2. Enchufa el gate desde un script que YA corre en `check:cad` sin tocar package.json: al final de
   `scripts/design/check-public-surface.mjs` (que ya esta en la cadena) importa y ejecuta
   `check-brand-literal.mjs` (o haz que `check-brand-literal.mjs` exporte una funcion y llamala).
   Comprueba con `npm run check:surface` que corre y que falla si metes un «Valle Design» visible.
Regla permanente: **package.json y package-lock.json no se tocan nunca**; si un cambio los necesita,
anotalo en la bitacora como bloqueado y busca otra via.

**REGLA PERMANENTE:** un spec que lee el fichero fuente con `readFileSync` y busca cadenas NO es
un spec, es un grep, y se considera falso. Los specs importan y ejecutan el codigo real.

**COMMITEA CADA PUNTO EN CUANTO SU COMPROBACION PASE (anadido 11:32).** No acumules los siete
puntos en el arbol sin commitear: llevas mas de una hora con 14 ficheros modificados y cero commits,
y cada relanzamiento del lanzador te obliga a re-orientarte. Un commit local por punto es SEGURO:
el lanzador solo sube a GitHub en la integracion. Orden: 1) bloques DXF → commit; 2) typecheck →
commit; 3) prettier api → commit; 4) lint web → commit; 5) cada spec → commit; 6) revertir
debilitamientos → commit; 7) gate de marca → commit. Si un punto se atasca mas de 20 minutos,
commitea lo que ya pasa, anota el bloqueo en la bitacora y sigue con el siguiente.

**Comprobacion final, las cinco, antes del ultimo commit:**
`npm run check:cad-math && npm run typecheck --workspace=web && npm run lint --workspace=valle-design-api && npm run lint --workspace=web && npm run test:specs --workspace=web`

## T0 · (HECHO el 16-sep, presupuesto OK en CI — se deja como referencia): el CI esta ROJO y por eso no se mergea NADA

Medido en la corrida 35061036006 de la PR #209. El paso **CAD contract and legacy-route gates**
falla con `Presupuesto de monolito: 3 problema(s)`:

- `apps/web/src/components/cad/editor/Layout3DEditor.tsx` — **16909 lineas**, asignacion 16896
- `apps/web/src/lib/cad/dxf-export.ts` — **960 lineas**, asignacion 959
- `apps/web/src/lib/cad/plant/clash.ts` — **817 lineas**, maximo 800 (no presupuestado)

El check **E2E Playwright** sale rojo EN CASCADA: sus cuatro fragmentos quedan `skipped`.
Arreglando esto se ponen verdes los dos checks requeridos y el lanzador mergea solo.

**Como se arregla y de ninguna otra forma:** sacando codigo a modulos aparte. El presupuesto
SOLO PUEDE ENCOGER. Prohibido subir el numero del manifiesto o meter `clash.ts` en el.

**Terminado cuando:** `npm run check:cad` pasa en local y la PR pone en verde
`Contrato · Build · Test · Lint · Smoke` y `E2E Playwright (PostgreSQL · Chromium + Firefox)`.

**Hasta que esto este verde, todo lo demas que hagas se queda sin mergear.**

---

## T9 · MEDICION DEL SUPERVISOR SOBRE TU COMMIT 00cd795c (16-sep 11:51) — NO ESTA RESUELTO

Tu mensaje dice «resolver las cinco causas del fallo». Ejecute los specs sobre ese commit exacto,
en una copia aislada, y SEIS siguen en rojo (codigo de salida 1 con `npx tsx`):

- apps/web/src/components/cad/editor/CadLienzoAncho.spec.ts
- apps/web/src/components/cad/editor/CadToolPaletteAncho.spec.ts
- apps/web/src/components/cad/interop/import-report-view.spec.ts
- apps/web/src/lib/cad/dxf-cad-document.spec.ts
- apps/web/src/lib/cad/dxf-xdata-app-names.spec.ts
- apps/web/src/components/cad/command-line/CadCommandLine.spec.ts

Verdes de verdad: command-icons, independencia-rubrica, terceros-bloques (los puntos 1-4 si estan
bien). El punto 5 esta a medias: solo hiciste los iconos.

**Antes de dar por hecho el punto 5, corre estos seis uno por uno con `npx tsx` y pega los codigos
de salida en la bitacora.** Despues `npm run test:specs --workspace=web` con codigo 0. Una
afirmacion de «resuelto» con specs rojos se considera falsa y bloquea la PR otra hora.

Para CadCommandLine: la instruccion completa esta arriba en T9 punto 5 (revertir la intercepcion
de Enter, restaurar `aria-activedescendant`, spec por render y no por grep, golden 201 contra los
prompts en espanol, borrar el dedup muerto y buscar el render doble).
Para dxf-cad-document y dxf-xdata: `git log -S MULTILEADER --oneline b90a9a42..HEAD` te dice que
commit tuyo lo rompio.

---

