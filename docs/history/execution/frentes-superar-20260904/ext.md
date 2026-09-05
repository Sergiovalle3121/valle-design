# F9 · Extensibilidad sin fingir .NET

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/history/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/lisp/**`
- `apps/web/src/lib/plugins/** (nuevo si no existe)`
- `packages/design-sdk/**`
- `docs/api/**`
- `apps/web/src/app/docs/api/**`

## Cola

1. SDK de plugins JS como contrato público versionado: sandbox, permisos declarados, ciclo de vida, API estable de documento/comandos/UI, documentación de desarrollador y dos plugins de ejemplo.

2. AutoLISP: las funciones `vl-*`/`vla-*` más usadas por rutinas de despacho, DCL completo, y un corpus de rutinas LISP reales de internet **con licencia clara** como prueba de compatibilidad, con su procedencia registrada.

3. Tokens de API por organización y webhooks documentados (el outbox ya existe).

4. Marcar visibilidad por operación en el contrato (P1-5, abierto).

5. Declarar el puente .NET/VBA como imposible con honestidad y dejar escrita la alternativa (este SDK).

## Cierre

Fila de automatización sin criterios abiertos salvo el .NET declarado imposible.

## Lo que hay que tener presente

El corpus LISP ajeno necesita licencia y procedencia escritas antes de entrar. La red sólo alcanza GitHub.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/history/execution/frentes-superar-20260904/ext-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-ext` sobre la rama `campana/superar/ext`. Commits sí;
  **push a origin no** (el coordinador hace un push por ventana).
- **R6 Las reglas de la casa, intactas.** Prohibido relajar gates, umbrales, goldens o
  presupuestos. Prohibido tocar identificadores persistidos (IDENTITY.md, ADR-0010).
  Prohibido renombrar `data-testid`. Fix-or-hide: lo que no gana su evidencia no es visible.
  Ningún claim sin evidencia; lo parcial se declara «todavía no» en tu bitácora, con fecha.
  Las banderas `DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` NO se encienden en esta campaña.
- **R7 Bitácora.** Este archivo es tu memoria. Si tu contexto se compacta, lo relees primero.
  Nunca se pregunta al titular: se decide, se anota y se sigue.

## Cómo se valida antes de dar algo por hecho

```
cd /home/user/vd-ext
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### 2026-09-04 · Entrega 1 · Las variables de sistema que ya existían, enchufadas al LISP

Lo que había, medido antes de tocar nada: el producto ya tenía la tabla de ~55 variables
de sistema (`apps/web/src/lib/cad/system-variables.ts`) con SETVAR/GETVAR, y el intérprete
LISP la ignoraba. `getvar` sólo sabía contestar CLAYER e INSUNITS; `setvar` lanzaba
SIEMPRE. Consecuencia medida: el prólogo con el que empieza media biblioteca de despacho
—`(setq old (getvar "CMDECHO")) (setvar "CMDECHO" 0)`— mataba la rutina ajena en su línea
2, y `runCommand` (que sólo aplicaba `result.kind === "document"`) hacía que
`(command "SETVAR" …)`, `(command "UNITS" …)`, COLOR, LTSCALE y LWEIGHT devolvieran nil
sin configurar nada: «éxito sin efecto» de los que prohíbe la regla 2 de la casa.

Lo construido:

- `host.ts` — el puerto gana `variables?(): CadVariableAccess`. **Opcional** a propósito:
  quien implementa el puerto fuera de este subsistema sigue compilando y conserva el
  comportamiento de antes, que es un límite declarado y no un valor inventado.
- `document-host.ts` — la tabla se PRESTA (`CadLispHostOptions.variables`) o, si nadie la
  presta, se crea una sembrada con el documento (`CLAYER` = capa activa, `INSUNITS` =
  `meta.unit`, con el mapeo único en `insunitsOfDocument`). Y `activeLayer()` pasa a LEER
  `CLAYER`: es lo que hace que `(setvar "CLAYER" "MUROS")` tenga efecto de verdad —la
  entidad siguiente nace en MUROS— en vez de ser otra casilla que se escribe y no hace nada.
- `builtins/interaction.ts` — `getvar`/`setvar` consultan `CAD_SYSTEM_VARIABLES` con sus
  tres reglas intactas (sólo lectura, `coerceCadSystemVariable`, y lo que no está no se
  inventa); `commandContext` pasa la tabla del anfitrión en vez de dejar que cada comando
  fabricara una de usar y tirar; y `runCommand` aplica `result.kind === "variables"`,
  distinguiendo `publish` (el sistema, que sí puede tocar las de sólo lectura) de `set`.
- `interactive.ts` y `routine.ts` — el préstamo llega hasta el anfitrión por las dos
  puertas de sesión, para que enchufarlo desde el editor sea UNA línea (P-ext-01).

Evidencia: `npx tsx src/lib/lisp/sysvars.spec.ts` → 66 aserciones verdes (la rutina con
prólogo y epílogo corre entera y deja sus cuatro segmentos; `(command "SETVAR" "OSMODE" 33)`
se lee después con `(getvar "OSMODE")`; AREA/PERIMETER/UCSXDIRX rechazan la escritura;
LUNITS 9 y LUPREC 99 se rechazan diciendo qué admiten; un anfitrión sin `variables()`
conserva el comportamiento viejo). `interaction.spec.ts` sube de 51 a 55 aserciones: las
dos que fijaban la carencia (`OSMODE` «no existe», `setvar` rechaza siempre) se
SUSTITUYEN por cuatro más fuertes. `sandbox-surface.spec.ts` suma
`lib/cad/system-variables` al inventario de dependencias externas con su justificación.
`npm run typecheck` verde en el árbol entero.

### 2026-09-04 · Entrega 2 · Los builtins que faltaban para que una rutina ajena cargue y designe

La entrega 1 arregló el prólogo, pero no el prólogo de VERDAD. Una rutina de despacho no
escribe `(setvar "OSMODE" 0)` —eso apaga las referencias del compañero—: escribe
`(setvar "OSMODE" (logand (getvar "OSMODE") (~ 33)))`. Medido antes de tocar nada,
ejecutando la tabla y no grepeando: de las 34 funciones que usa una rutina descargada en su
primera pantalla, faltaban las 34. La tabla tenía 151 builtins y ninguno era `logand`.

Lo construido, por módulos:

- `builtins/strings.ts` — `vl-string->list`, `-left-trim`, `-right-trim`, `-position`,
  `-elt` y `-mismatch`. El recorte por conjunto de caracteres se unifica en `trimSide`, que
  usa también `vl-string-trim`: el segundo argumento es un CONJUNTO, no una subcadena, y las
  tres tenían que interpretarlo igual.
- `builtins/lists.ts` — `vl-list*` (el último argumento es la COLA), `vl-remove-if-not`,
  `vl-member-if`, `vl-member-if-not` y `vl-sort-i`. Los dos `member-if` recorren la cadena de
  celdas y devuelven el NODO, no una copia. `vl-sort-i` es ESTABLE a propósito: se pregunta
  al comparador al revés para que los empatados conserven su orden, que es lo que hace
  utilizable el gesto para el que existe —reordenar en paralelo la lista de nombres por la de
  áreas—.
- `builtins/arithmetic.ts` — `logand`, `logior`, `lsh`, `boole` y `~`, en 32 bits con signo.
  `lsh` corta a cero a partir de 32 bits porque JavaScript enmascara la cuenta a cinco y
  `1 << 32` valdría 1: el tipo de diferencia que convierte una máscara en otra sin fallar.
  `boole` se implementa como la tabla de verdad de cuatro bits que es, así que responden las
  dieciséis funciones y no sólo las cuatro con nombre.
- `builtins/vl.ts` (nuevo) — `vl-load-com` como no-op honesto que devuelve nil (es lo que
  hace el AutoCAD de hoy: no promete COM, promete no matar en la línea 1 a quien la copia por
  costumbre), `vl-symbol-name`, `vl-symbol-value` y `vl-filename-base`/`-directory`/
  `-extension`, que son manipulación de cadenas y por eso sí entran.
- `builtins/unavailable.ts` (nuevo) — `nentsel`, `getfiled`, la E/S de ficheros entera
  (`open`, `close`, `read-line`, `write-line`, `read-char`, `write-char`) y cinco entradas del
  puente COM (`vlax-*`) EXISTEN en la tabla y lanzan diciendo qué falta y por qué. Juntas en
  un módulo para que la lista de lo que este producto no sabe hacer del lenguaje se vea entera
  en un diff.
- `builtins/selection.ts` — `entsel`, que reutiliza la petición `prompt-selection` y el
  `pickPointOf` que ya existía (exportado desde `interaction.ts`). Devuelve `(nombre punto)`
  con su límite escrito: el punto es el CENTRO del contorno, no el clic, porque el anfitrión
  contesta a una designación con nombres y no con coordenadas.
- `builtins/osnap.ts` (nuevo) — `osnap` CONDUCE el motor de captura del producto
  (`snap-engine` + `snap-scene`), no una geometría propia, y traduce los nombres de modo con
  la tabla de `osnap-bits`, la misma que traduce OSMODE. Sin ventana no hay APERTURA —que se
  mide en píxeles—, así que se resuelve modo a modo y gana el más cercano; la prioridad del
  editor sólo desempata a igual distancia. Razonado en el módulo: con la regla del cursor,
  `(osnap p "end,cen")` junto a un círculo habría devuelto el extremo de una línea del otro
  lado del plano.
- `builtins/entities.ts` — `textbox`, que mide con `measureCadMText`, el MISMO medidor que
  dibuja el rótulo; y el reconocimiento de los nombres de la tabla de símbolos en `entget`
  (lee la capa como objeto) y su rechazo explícito en `entmod`/`entdel`, con la ruta buena
  escrita en el mensaje.
- `builtins/tables.ts` (nuevo) — `tblnext` y `tblobjname`, y `tblsearch` MOVIDA aquí desde
  `interaction.ts` para que las tres lean el mismo registro. El registro de capa vive en
  `dxf/layer-record.ts`: código 70 con el bit 1 = CONGELADA (antes decía `!visible`, que es
  otra cosa) y el 62 en NEGATIVO cuando la capa está apagada, que es la codificación de
  AutoCAD y la que distingue los tres estados.
- `builtins/interaction.ts` — `commandContext` pasa ahora `layers`. Sin ella, `-LAYER`
  contestaba «No existe la capa "MUROS"» teniéndola delante: un comando que decide sobre un
  dato que nadie le pasa decide mal siempre.

Evidencia: `npx tsx src/lib/lisp/builtins-faltantes.spec.ts` → 112 aserciones verdes, todas
de VALOR concreto. La primera es la que importa: la rutina de despacho completa —`vl-load-com`,
prólogo con máscara de bits, `tblsearch` para no duplicar la capa, `(command "-LAYER" "N" …)`,
`CLAYER`, `RECTANG` y epílogo— corre entera, deja el rectángulo en su capa y devuelve OSMODE a
39. `entsel` conducido por `ScriptedResponder` devuelve un par cuyo `car` alimenta a `entget`.
Las declaradas fuera de alcance lanzan con su motivo. `builtins.spec.ts` (81),
`interaction.spec.ts` (55), `entity-functions.spec.ts` (61), `acceptance.spec.ts` (25),
`corpus.spec.ts` (48), `corpus-enchufado.spec.ts` (60), `sysvars.spec.ts` (66),
`factory.spec.ts` (33) y el resto del subsistema siguen verdes; `sandbox-surface.spec.ts`
suma cuatro dependencias externas al inventario con su justificación (snap-engine,
snap-scene, osnap-bits, mtext-layout y aci-palette). `npm run typecheck` y `npm run check:cad`
verdes en el árbol entero. La tabla pasa de 151 a 191 builtins (144 en el núcleo),
contados ejecutando la tabla y no grepeando.

### 2026-09-04 · Entrega 3 · El puente Visual LISP, con su frontera dicha en voz alta

Lo que había, medido antes de tocar nada: **cero apariciones** de `vlax-*`/`vla-*` en el
árbol salvo cinco nombres declarados fuera de alcance en `builtins/unavailable.ts`. La mitad
moderna de AutoLISP —la que usa cualquier rutina publicada después de 1999— no existía, y
`(vlax-ename->vla-object e)` contestaba que aquí no hay ActiveX. Cierto para el objeto de
APLICACIÓN; falso para las entidades, que es donde el 90 % de esas rutinas trabaja: leer la
capa de un objeto y cambiarla, medir el área de una polilínea, recorrer una curva por
longitud. Todo eso son preguntas sobre el documento canónico y todas tienen respuesta exacta.

Lo construido:

- `values.ts` — un valor nuevo del union, `vla-object`, respaldado por el HANDLE de la
  entidad y no por un puntero COM. Cada acceso lo resuelve contra el documento en ese
  momento, y de ahí salen las tres propiedades que lo hacen mejor que el original: no hay
  puntero colgante (`vlax-erased-p` contesta T donde AutoCAD revienta), no hay estado que
  pueda discrepar del documento, y `vlax-release-object` no tiene nada que liberar, así que
  es un no-op honesto y no una promesa. La variante nueva obligó a repasar los dos `switch`
  exhaustivos del subsistema —`typeName` y `printLisp`— y el encadenado de `type`, que caía
  en un `"STR"` por defecto: `(type obj)` dice VLA-OBJECT, que es lo que comprueba media
  rutina antes de llamar a `vla-get-*`.
- `builtins/vlax.ts` (nuevo) — la ida y la vuelta (`vlax-ename->vla-object`,
  `vlax-vla-object->ename`, `vlax-object-p`, `vlax-erased-p`, `vlax-release-object`);
  `vlax-get`/`vlax-put`/`vlax-get-property`/`vlax-put-property`/`vlax-property-available-p`;
  y los pares `vla-get-<Prop>`/`vla-put-<Prop>` GENERADOS de una sola tabla de propiedades
  —Layer, Color, Linetype, LinetypeScale, TextString, Height, InsertionPoint, StartPoint,
  EndPoint, Center, Radius, Closed, Coordinates, Area y Length—. Se generan y no se escriben
  a mano porque escritos a mano habría treinta oportunidades de que `(vla-get-Layer o)` y
  `(vlax-get o 'Layer)` acabaran contestando cosas distintas.
- **La escritura sale por `host.apply`.** Un `vla-put-Layer` produce un `CadEntityCommand`
  —`replace` para la geometría, pasando por el único traductor DXF; `presentation` para el
  color y el tipo de línea, que es el mismo comando que escriben COLOR, CHPROP y MATCHPROP—
  y no una mutación. La spec lo comprueba por la etiqueta del lote, no sólo por el resultado:
  un puente que mutara el documento por su cuenta pasaría igual de verde la primera mitad.
- **Y la escritura se RELEE.** Cada propiedad declara qué tiene que devolver la lectura
  después de escribirla; se aplica, se relee y se compara. No es paranoia: el traductor DXF
  ignora en silencio los códigos que un tipo no atiende, y sin esta comprobación un
  `vla-put-*` sobre un tipo no previsto devolvería el valor escrito sin haber cambiado nada.
  Encontró un defecto real durante la propia construcción (el color PorBloque volvía como 7).
- `dxf/to-entity.ts` — el TEXT de una línea caía en el `default` de `dxfPatchEntity`, y ahí
  pasaban dos cosas malas a la vez: un `(1 . "NUEVO")` se aceptaba y NO se aplicaba —«éxito
  sin efecto» de manual, con la rutina dando por renumerado un eje que seguía igual— y un
  `(10 …)` se rechazaba con un motivo que no era el suyo. Se atiende con los mismos códigos
  que emite `from-entity`. Arregla de paso `entmod` sobre un rótulo, que es el gesto con el
  que se renumera una fila de ejes.
- `builtins/vlax.ts` — la familia `vlax-curve-*` (`getStartPoint`, `getEndPoint`,
  `getPointAtDist`, `getDistAtPoint`, `getClosestPointTo`, `getArea`, `isClosed`) sobre la
  geometría DEL PRODUCTO: los contornos salen de `cadEntityContours` —el registro de
  adaptadores, el mismo que alimenta AREA, MASSPROP y REGION, que ya sabe teselar el bulge de
  una polilínea y una NURBS—, el área de `cadEntityArea` (πr² exacto para un círculo, no el
  polígono de 192 lados) y el punto a una distancia de `pointAtDistance`, con la que DIVIDE y
  MEASURE reparten sus marcas. Se prefirió `inquiry/contours` a `geom-measure` por eso mismo:
  el `polygonArea` de `geom-measure` mide la teselación y se queda un 0,014 % por debajo del
  número que el comando AREA le enseña al usuario en la misma pantalla.
- `builtins/unavailable.ts` — la frontera, reescrita. Se BORRAN de la lista
  `vlax-ename->vla-object`, `vlax-get-property` y `vlax-put-property` (ese borrado es la
  prueba de que existen) y se declaran con su motivo el lado de aplicación
  (`vlax-get-acad-object`, `vlax-create-object`, `vlax-get-or-create-object`,
  `vlax-import-type-library`, `vlax-invoke`, `vlax-invoke-method`,
  `vlax-method-applicable-p`), los nueve reactores `vlr-*` —cuyo motivo NO es la ausencia de
  COM sino el sandbox: un reactor ejecuta código de la rutina dentro del ciclo de edición y
  ni el presupuesto ni el paso único de deshacer sobrevivirían a eso— y las seis funciones de
  parametrización de curva, que piden un parámetro interno que este producto no publica.
- Tres funciones más que parecen accesorias y no lo son: `vlax-3d-point`,
  `vlax-variant-value` y `vlax-safearray->list`. Aquí no hay variantes ni safearrays —una
  propiedad de punto YA es la lista de tres reales—, así que las dos últimas son la
  identidad. Estarlo hace que
  `(vlax-safearray->list (vlax-variant-value (vla-get-StartPoint o)))`, que es como está
  escrita media biblioteca publicada, corra sin tocar una letra.

Evidencia: `npx tsx src/lib/lisp/vlax-compat.spec.ts` → **141 aserciones verdes**.
`(vlax-vla-object->ename (vlax-ename->vla-object e))` devuelve el mismo ename y dos objetos
de la misma entidad son `eq`; `(vla-put-Layer o "MUROS")` deja la entidad en MUROS EN EL
DOCUMENTO y el lote se llama `LISP vla-put-Layer` con un solo comando `replace`;
`(vlax-curve-getPointAtDist e d)` se compara contra `pointAtDistance` aplicada a los
contornos del producto en tres casos —línea, polilínea cerrada y arco— con tolerancia 1e-9, y
`vlax-curve-getArea` contra `cadEntityArea` en otros tres; `(type obj)` es VLA-OBJECT; y las
veintidós funciones de la frontera lanzan comprobando el TEXTO de su motivo, no sólo que
fallen. Cierra una rutina de despacho entera: `vl-load-com`, `ssget "X"` por LWPOLYLINE,
`vlax-ename->vla-object`, `vlax-property-available-p`, `vla-get-Area` acumulada,
`vla-put-Layer` y `vlax-release-object`, que devuelve 1200.0 y deja la polilínea en MUROS.
`sandbox-surface.spec.ts` (780) suma `lib/cad/inquiry/contours` y `lib/cad/divide-measure` al
inventario con su justificación escrita. `builtins-faltantes.spec.ts` pasa de 112 a 120: las
dos aserciones que fijaban la ausencia del puente están SUSTITUIDAS por siete —cinco de
frontera nueva y dos que exigen el puente por la puerta del dibujo—. La suite entera de
`apps/web`: **607/607 specs verdes**. `npm run typecheck` verde en el árbol completo. La
tabla pasa de 191 a **258 builtins** (161 en el núcleo), contados ejecutando la tabla.


### 2026-09-04 · Entrega 4 · El SDK de plugins gana sus permisos, su ciclo de vida y dos ejemplos

Lo que había, medido antes de tocar nada: `plugins/api.ts` con un registro compuesto correcto
—no muta el del producto, rechaza pisar un comando suyo, escribe por `host.apply`— y **ningún
importador fuera de `lib/lisp/`**, así que por la regla 1 de la casa el SDK de plugins no está
implementado. Y una carencia de diseño dentro de lo que sí había: todos los plugins tenían la
misma llave. El que sólo cuenta capas podía escribir en el dibujo igual que el que dibuja un
cajetín, y `createPluginDocumentApi(host, "acme-tools")` concedía todo con sólo saberse un id.

Lo construido:

- `plugins/permissions.ts` (nuevo) — los cuatro permisos del manifiesto v1
  (`documento:lectura`, `documento:escritura`, `comandos:registro`, `ui:panel`), cada uno con
  la frase que se le enseña al usuario en `PLUGIN_PERMISSION_MEANING` (la spec comprueba las
  dos listas una contra otra, así que un permiso nuevo no puede entrar sin su explicación), y
  el rechazo con NOMBRE: `PluginPermissionError`, con `pluginId` y `permission` como datos y
  no dentro de una cadena que habría que parsear. No es un `LispError`, y eso es deliberado:
  `vl-catch-all-apply` no lo atrapa (`isCatchable` sólo es cierto para `LispError`), por la
  misma razón por la que no atrapa el corte por presupuesto — un permiso que el código medido
  puede tragarse y reintentar no es un permiso.
- `plugins/api.ts` — el manifiesto v1 (`manifiesto: 1` y `permisos`, los dos OBLIGATORIOS:
  un permiso que se puede omitir se omite, y un registro que trate «no lo declaró» como
  «puede hacerlo todo» convierte el manifiesto en documentación). `createPluginDocumentApi`
  recibe ahora el manifiesto —o los permisos ya validados que guarda el registro— y no un id
  suelto, y los HACE CUMPLIR llamada a llamada: leer pide `documento:lectura`, `apply` y
  `newEntityId` piden `documento:escritura`. Un plugin sin escritura recibe el error nombrado,
  no un `apply` que no hace nada, que sería el «éxito sin efecto» de la regla 2 aplicado a la
  peor superficie posible: el autor creería haber escrito.
- **La segunda puerta, que era la que dejaba el permiso en un adorno.** Un comando de plugin
  no pasa por la API de documento: lo conduce el motor, y su lote lo aplica `runCommand`. Así
  que ahí también se comprueba. El registro compuesto publica `otorgamiento(comando)` —de
  quién es y qué se le concedió—, `builtins/interaction.ts` lo consulta por `pluginGrantOf` de
  forma estructural (el registro que recibe puede ser el del producto, el compuesto o el de
  una spec) y exige `documento:escritura` antes de aplicar un resultado `document` **y** uno
  `variables`: `CLAYER` decide en qué capa nace lo siguiente y `OSMODE` dónde engancha el
  cursor, así que la tabla de sesión también es escritura por el camino largo.
- **La etiqueta del paso de deshacer dice quién.** `plugin:marco-lamina MARCOLAMINA` en vez de
  `LISP MARCOLAMINA`, el mismo prefijo que ya ponía `createPluginDocumentApi`, para que el
  historial se lea igual venga el cambio por la puerta que venga.
- **Ciclo de vida explícito.** `register` valida y ACTIVA; `activate` reindexa y llama al
  plugin; `deactivate` retira nombre, alias, variante con guion y paneles y lo deja inactivo
  pero en la lista; `unregister` además lo borra. Los caminos que fallan tampoco dejan
  huérfanos: un `activate` que lanza deja el registro como estaba, y un `deactivate` que lanza
  no impide la retirada — se anota en el diario del plugin en vez de tragarse. Y reactivar
  vuelve a comprobar los choques, porque entre la baja y el alta otro plugin ha podido
  quedarse con el nombre.
- **Presupuesto compartido con el del LISP.** La API de documento cobra pasos y celdas de un
  `LispMeter`, el mismo tipo que corta a una rutina `.lsp`; el registro se lo presta al plugin
  desde `PluginHostEnvironment.meter`. Quien no presta ninguno no obtiene «sin límite»:
  obtiene uno propio con el presupuesto por defecto.
- `plugins/examples/marco-lamina.ts` (nuevo) — el ejemplo que ESCRIBE. MARCOLAMINA (alias
  MLAM) pide las dos esquinas de la lámina y un margen, y dibuja el borde del papel y el marco
  interior con el margen izquierdo doble, que es el de encuadernación. Las dos polilíneas
  salen en el MISMO lote: Ctrl+Z quita la lámina entera y no media. Y con una lámina más
  pequeña que su margen no dibuja un marco del revés ni se queda callado: dice qué midió y qué
  necesitaba (regla 2 de la casa, dentro de un plugin).
- `plugins/examples/recuento-capas.ts` (nuevo) — el ejemplo de SÓLO LECTURA. Publica un panel
  (`ui:panel`), registra RECUENTOCAPAS (alias RCAP, `mutates: false`, termina en su primer
  paso porque una consulta no pregunta nada) y cuenta los objetos de cada capa con
  `recuentoPorCapa`, una función pura que usan las tres bocas —el comando, el `activate` que
  deja la primera nota y el panel que el editor monte cuando exista— para que no acaben
  contando cosas distintas. Enseña las capas VACÍAS con 0, que es justo lo que se busca antes
  de purgar, y no esconde en «0» la entidad que llegó de un dibujo ajeno con una capa que no
  está en la tabla. **No declara `documento:escritura`, y ése es el punto del ejemplo.**

Evidencia: `npx tsx src/lib/lisp/plugins-permisos.spec.ts` → **124 aserciones verdes**. Los
dos ejemplos se dan de alta enteros y activos; el de sólo lectura lee sus dos capas y recibe
`PluginPermissionError` al intentar `apply`, con el documento en cero entidades, cero
escrituras acumuladas y cero pasos de deshacer; un plugin que pide `LINE` se rechaza en bloque
y su comando bueno tampoco queda suelto; `(command "MARCOLAMINA" '(0 0) '(420 297) 10)`
conducido desde LISP con el registro compuesto inyectado por `COMMAND_REGISTRY` dibuja el
borde en (0,0)-(420,297) y el marco en (20,10)-(410,287) —el margen izquierdo doblado— y deja
**una** etiqueta, `plugin:marco-lamina MARCOLAMINA`, con las dos escrituras dentro del mismo
lote; el mismo comando en un plugin sin `documento:escritura` no dibuja nada y el fallo nombra
el permiso, y `vl-catch-all-apply` no se lo traga; `deactivate` retira nombre, alias y variante
con guion, y el panel se va con su plugin; y el medidor prestado deja cortada también a la
rutina que lo prestó, que es lo que significa «compartido». `dcl-and-plugins.spec.ts` sigue
verde en 55 —sus manifiestos se actualizan al contrato nuevo, ninguna aserción se retira—,
`sandbox-surface.spec.ts` en 837 sobre 44 módulos **sin una dependencia externa nueva**, y
`npm run typecheck` verde en el árbol completo.

Lo que NO cabe aquí y va como petición: el cableado al estudio (cargar un plugin, componer el
registro, montar sus paneles) vive en `components/cad/`, fuera del territorio del subsistema.
Está escrito entero como **P-ext-03** en `ext-peticiones.md`.


### 2026-09-04 · Corrección de la entrega 3 · El puente partido por su junta natural

`npm run check:cad` estaba ROJO por culpa de la entrega 3: `builtins/vlax.ts` llegó a 1060
líneas y el presupuesto de monolito deja 800 a un archivo no presupuestado. Añadirlo al
manifiesto no es una opción —la regla de la casa sólo permite que ese presupuesto BAJE— y
dejar el árbol rojo tampoco: un frente que deja un gate en rojo se revierte entero en la
integración y se lleva por delante las cuatro entregas.

Se parte por la junta que ya tenía escrita, no por el número de líneas:

- `builtins/vlax-curves.ts` (165) — la curva como cadena de puntos: `CURVE_TYPES`,
  `curveContour`, `measuredPoints`, `polylineLength`, `curveLength`, `projectOnSegment` y
  `closestOnCurve`. Es el módulo más BAJO del puente y por eso se lleva también
  `expectedTypeName`, que usan los tres: una función que los tres importan no puede vivir en
  el que importa a los otros dos, que sería un ciclo.
- `builtins/vlax-properties.ts` (598) — la tabla `vla-get-*`/`vla-put-*` con sus quince
  propiedades, el paso de un objeto a la entidad viva, y las dos reglas que hacen honesta la
  escritura: sale por `host.apply` con comandos canónicos, y se RELEE para comparar.
- `builtins/vlax.ts` (404) — la instalación de los builtins, que ya no necesita conocer la
  tabla: sólo preguntarle.

Sin cambiar una línea de comportamiento: `vlax-compat.spec.ts` sigue en 141,
`builtins-faltantes.spec.ts` en 120, `sandbox-surface.spec.ts` pasa a 881 sobre 46 módulos
—dos más, ninguna dependencia externa nueva— y la suite entera de `apps/web` en **608/608**.
`Presupuesto de monolito OK: 2587 archivos`. Queda rojo `check:dwg-evidence`, que es de
entorno y no de este frente: sin `VALLE_DWG_CORPUS_MIRROR` apuntando al clon de conformidad,
ese gate miente (AGENTS.md lo dice con esas palabras).


### 2026-09-05 · Entrega 5 · La matriz de cobertura, generada; el puente .NET, declarado

Lo que había, medido antes de tocar nada: `docs/api/` con un solo documento (la política de
la API pública) y CERO frontera publicada del lenguaje. Las cuatro entregas anteriores
movieron la tabla de 151 a 258 entradas y ningún documento lo sabía. Por la regla 3 de la
casa —ninguna capacidad se anuncia sin evidencia de su límite—, todo lo construido en este
frente era, hasta hoy, un claim sin frontera.

Y una carencia peor que la ausencia: un `.md` con las cifras tecleadas no falla nunca. Se
lee, se cree y se cita. Por eso esto no es un documento, es un GENERADOR con su gate.

Lo construido:

- `builtins/unavailable.ts` — la frontera pasa de ser un efecto secundario de instalar la
  tabla a ser DATO: `LISP_FUERA_DE_ALCANCE` (nombre, familia, motivo) e `installUnavailable`
  recorriéndola y nada más. No hay una segunda vía para declarar una función fuera de alcance
  sin que aparezca en la matriz publicada. El motivo que lanza el intérprete y el que publica
  el documento son ahora la MISMA cadena, así que no pueden discrepar.
- `docs/api/autolisp-cobertura.json` (nuevo, GENERADO) — las 258 entradas de
  `CAD_LISP_BUILTINS` leídas en caliente, cada una con su tabla (núcleo o CAD), su clase
  (función o constante), su origen (AutoLISP o extensión de este producto) y su columna:
  **188 implementadas, 40 con límite declarado y 30 «todavía no»** (161 en el núcleo, 97 en
  la tabla CAD). El recuento vive ahí y en ningún otro sitio.
- `lisp/cobertura.spec.ts` (nuevo, 133 aserciones) — es a la vez el generador (`--update`) y
  el gate. Lee la tabla viva y falla si el JSON no la refleja: una función nueva sin
  clasificar es roja CON SU NOMBRE, una clasificada que ya no existe también, y el fichero se
  compara además byte a byte, porque los límites y los motivos envejecen igual que los
  nombres. Tres decisiones que lo hacen algo más que un volcado:
  1. **Tres columnas y no dos.** «Implementada / no implementada» miente en las dos
     direcciones: `entsel` existe y su punto es el centro del contorno —quien la dé por
     implementada a secas escribirá un TRIM que recorta del lado equivocado—, y `nentsel` no
     está pero está DICHA, que no es lo mismo que un «no function definition».
  2. **La columna 3 se comprueba EJECUTÁNDOLA.** Se llaman las 30 y cada una tiene que
     fallar repitiendo su motivo palabra por palabra. Si alguien convirtiera una en un no-op
     silencioso —el «éxito sin efecto» de la regla 2— el gate se pone rojo antes de que una
     rutina dé por escrito un fichero que no existe.
  3. **Los límites se PROVOCAN.** La variable que no está en la tabla, la tabla de símbolos
     que no es LAYER, el `trans` entre dos sistemas, el `entmake` de un HATCH, el área que no
     se escribe, el modo de `ssget` que no existe y el punto de `entsel` en el centro del
     contorno. Un límite escrito y no comprobado es una promesa.
  Y lo que NO se escribe a mano dentro del propio generador: los tipos que `entmake` admite
  salen de `ENTMAKE_SUPPORTED`, y los límites del puente VLA se DERIVAN de `VLA_PROPERTIES`
  —una propiedad sin escritor es de sólo lectura y su `readOnlyReason` es el límite; una con
  escritor y con motivo escribe en unos tipos y se niega en los otros—.
- `docs/api/EXTENSIBILIDAD.md` (nuevo) — la guía del desarrollador: cómo se carga un `.lsp`
  (APPLOAD, orden de lectura, un fichero roto no detiene a los demás, `load` desde dentro),
  cómo se escribe un plugin, las cuatro garantías del anfitrión y los cuatro permisos. **No
  escribe ni una cifra**: enlaza al JSON. Y eso no es una promesa editorial, es mecánico —el
  spec lee el `.md`, quita los bloques de código y falla si queda un dígito en la prosa que
  no sea una fecha, un ADR, «v1» o «2D»/«3D»; además comprueba que ningún tramo de código en
  línea sea un número a secas, que era la forma obvia de saltarse la regla.
- `docs/api/PUENTE-DOTNET-VBA.md` (nuevo) — por qué no habrá `.NET`, VBA ni ObjectARX, sin
  rodeos: no hay CLR en una pestaña, pero sobre todo el problema no es el runtime sino el
  MODELO DE OBJETOS de otro fabricante, que habría que clonar versión a versión; VBA es un
  runtime licenciado que su propio dueño dejó morir; un `.arx` es C++ enlazado contra las
  cabeceras de una versión exacta. No se escribe «nunca»: se escribe la condición de
  reapertura, como hace ADR-0016 con el 3D exacto. Y el camino que sí existe, familia por
  familia, con su coste: VBA → AutoLISP es traducción casi renglón a renglón porque el modelo
  ActiveX es el mismo; .NET → plugin es reescritura del acceso conservando el algoritmo;
  ObjectARX → no hay traducción, hay proyecto. **La traducción del macro VBA que publica el
  documento SE EJECUTA**: el spec la extrae del `.md` por su marcador, la corre contra un
  dibujo y comprueba que deja el círculo en `EJES` con su radio y el rótulo en `TEXTOS`. Un
  ejemplo de migración que no se ejecuta es la captura de pantalla de una migración.
- `docs/api/POLITICA-API-PUBLICA.md` — decía «79 operaciones OpenAPI». El manifiesto generado
  del contrato dice `operationCount: 104` (79 es el número de RUTAS) y el documento de al lado
  decía «73». Se quita la cifra y se enlaza el generado, que es lo que manda la regla 4. Las
  otras dos copias equivocadas están fuera de este territorio y van escritas enteras como
  **P-ext-04** en `ext-peticiones.md`, junto con el enlace de los documentos nuevos desde el
  README y la política de extensiones.

Verificado sobre el árbol quieto: `npx tsx src/lib/lisp/cobertura.spec.ts` en 133 aserciones,
`npm run typecheck` verde, `npm test` en **609/609** specs y `Presupuesto de monolito OK:
2589 archivos`. Sigue rojo `check:dwg-evidence`, que es de entorno —falta
`VALLE_DWG_CORPUS_MIRROR`— y se comprobó que falla igual con el árbol sin mis cambios.


### 2026-09-05 · Cierre de la tanda · lo verificado, y el claim que NO se sostuvo

Este bloque no añade capacidad: comprueba la que se dijo. Se corrió todo sobre el árbol
QUIETO (committeado), como manda la costumbre operativa de la casa.

**Los siete commits del frente, contados de verdad** (`git log --oneline campana/superar/ext
^646b969`): `b2815da`, `1870bc7`, `b6d0db9`, `05e61bc`, `356830e`, `a8b5501`, `773f3c3`.
`git diff --stat b2815da^..773f3c3` da 42 archivos y todos caen dentro del territorio del
frente: `apps/web/src/lib/lisp/**`, `docs/api/**` y estos dos documentos de ejecución. Ni un
archivo compartido, ni una migración, ni el esquema del documento canónico.

**Gates, con su salida literal.**

- `npm run typecheck` → `Tasks: 8 successful, 8 total · Time: 17.834s`. **Verde.**
- `npm run check:command-integrity` → `Integridad de comandos OK: 294 comandos · 83 mutan
  verificado · 48 delegan · 22 informan · 132 declaran su límite · 9 exentos declarados ·
  0 éxitos falsos.`
- `npm run check:cad` → **rojo en `check:dwg-evidence`**, y no es de este frente. La
  aserción que rompe es «el artefacto del disco coincide con lo que el árbol sostiene hoy»:
  el JSON en disco declara `bundlesAdmitidos: 7` y aquí se regenera con `0`, porque
  `VALLE_DWG_CORPUS_MIRROR` está sin apuntar en este entorno (`env | grep VALLE` no devuelve
  nada) y AGENTS.md declara esa variable como condición de entorno de ese gate. Prueba de
  que no es mío: `git log b2815da^..773f3c3 -- docs/cad/evidence/ scripts/dwg/
  packages/dwg-codec/` no devuelve **ningún** commit, y `docs/cad/evidence/
  dwg-decoder-matrix.json` no ha cambiado desde `646b969`.
- Como `check:cad` corta ahí, los **catorce** gates que van detrás en la cadena se corrieron
  uno por uno y **todos verdes**: `check:precision-evidence` (peor error 2,88e-6 unidades a
  magnitud 10⁷), `check:cad-math` (`901 casos numéricos verificados contra oráculo
  independiente · 0 desviaciones`), `check:legal`, `check:command-integrity`,
  `check:e2e-localizadores`, `check:auditoria`, `check:authz` (`113 handlers auditados`),
  `rubric.spec.mjs` (`59 comprobaciones verdes`), `rubric.mjs --markdown --check`
  (`TOTAL 233/271 (86 %)`), `check:template-gallery`, `check:dxf-corpus`,
  `check:pdf-corpus`, `check:dxf-props` y `check:api-console` (`104 operaciones
  sincronizadas con el contrato`).

- `npm test` → **608/609 specs**, y la que falla no es de este frente:
  `src/lib/cad/benchmark/plan-budget.spec.ts`, con
  `panFrameP95Ms: 27.343 ms supera 27 ms` — un presupuesto de tiempo de fotograma que
  depende de la máquina, rebasado por un 1,3 %. Se corrió tres veces suelto sobre el MISMO
  árbol: roja (28,045 ms), verde y verde. Es decir, ondea en esta máquina. No la toqué y no
  recalibré el presupuesto: relajar un umbral para ponerse en verde está prohibido, y el
  perfil de 20.000 entidades no se vuelve a medir desde un frente que no dibuja. Prueba de
  que no es mía: el frente no tocó **ningún** archivo de `lib/cad/` (`git diff --name-only
  b2815da^..HEAD | grep lib/cad/` no devuelve nada) y ese spec no alcanza `lib/lisp` por
  ningún import. Los 92 suites de la API pasan (`798 passed, 221 skipped`).

**Las ocho specs del frente, corridas de nuevo:** `sysvars` 66, `builtins-faltantes` 120,
`vlax-compat` 141, `plugins-permisos` 124, `cobertura` 141, `interaction` 55,
`sandbox-surface` 881 sobre 46 módulos, `dcl-and-plugins` 55. Todas verdes.

**Dos afirmaciones, comprobadas SIN fiarse de su propia spec.**

1. *«La tabla pasa a 258 builtins, 161 en el núcleo.»* Se leyó la tabla viva en una sonda
   aparte: `CORE_LISP_BUILTINS.size` = 161 y `CAD_LISP_BUILTINS.size` = 258 —la tabla CAD
   CONTIENE al núcleo, así que 258 es la superficie entera y 97 lo que añade el CAD—, y
   `docs/api/autolisp-cobertura.json` publica 258 entradas con
   `{total: 258, implementada: 188, limite: 40, todaviaNo: 30, nucleo: 161, cad: 97}`.
   Cuadra. La sonda se borró: no deja rastro en el árbol.
2. *«Un plugin sin `documento:escritura` no dibuja, ni por la puerta del comando.»* La spec
   lo prueba con un comando de mentira; aquí se probó con el ejemplo REAL. Se registró
   `MARCO_LAMINA_PLUGIN` tal cual y luego una copia idéntica con el permiso QUITADO del
   manifiesto, y se corrió la misma línea
   `(command "MARCOLAMINA" (list 0 0) (list 420 297) 10)` contra ambos:
   - con el permiso → `{"ok":true,"entidades":2}` (las dos polilíneas del marco);
   - sin el permiso → `{"ok":false,"entidades":0}` y el mensaje
     `El plugin "marco-lamina-sin-escritura" intentó ejecutar MARCOLAMINA sin el permiso
     "documento:escritura"…`.
   El permiso es la diferencia entre dibujar y no dibujar, no una etiqueta.

**El claim que NO se sostuvo, y por eso se arregló.** El reconocimiento de la tanda decía
haber dejado escritas dos peticiones —la marca `x-visibility` en el contrato y los tokens de
API por organización— y hasta las citaba por número. `grep "^### P-ext"
ext-peticiones.md` devolvía **cuatro**: P-ext-01..04. Las dos no existían. Se escribieron
enteras (`81cc4ef`): **P-ext-05** con la clasificación completa de las 104 operaciones
(15 `public`, 25 `experimental`, 64 `internal`), la regla que la produce y el gate que exige
la marca; **P-ext-06** con la entidad, las dos migraciones, la resolución en `CadAuthGuard`
y —la mitad que importa— lo que un token NO puede hacer. El reparto de P-ext-05 se comprobó
por script contra el YAML: 104 operaciones, cero duplicadas, cero `operationId` inventado,
ninguna de `/v1/cad` sin clasificar y las nueve familias cuadrando una por una.

**Y un defecto encontrado al cerrar, en territorio propio** (`e7f5097`).
`docs/api/POLITICA-API-PUBLICA.md` declara el manifiesto de plugins «formato estable v1» y
seguía describiéndolo como `{ id, name, version, commands?, panels? }`: la forma ANTERIOR a
la entrega 4, que hizo obligatorios `manifiesto` y `permisos`. Una declaración de
estabilidad que describe una forma que el registro rechaza es peor que no declarar nada,
porque el desarrollador escribe el objeto que el documento le enseña y `register` se lo
devuelve. Se corrigió el bloque —los dos campos obligatorios, los cuatro permisos, la cuarta
garantía (la escritura exige `documento:escritura` por las dos puertas y el rechazo no es
capturable con `vl-catch-all-apply`) y el límite de que los permisos acotan el documento y
no la página— y se cerró por GATE, no por cuidado: `cobertura.spec.ts` DERIVA la lista de
`PLUGIN_PERMISSIONS` y exige que la política nombre cada permiso. Comprobado mutando:
renombrar `ui:panel` en el documento devuelve `1` con
`AssertionError: la política nombra el permiso «ui:panel»`. 133 → 141 aserciones.


## «Todavía no»

- **2026-09-04 · `osnap` sin apertura, y «cen» sobre una línea.** Sin ventana no hay APERTURA
  en píxeles, así que `osnap` no devuelve nil por «estar lejos»: gana el punto notable más
  cercano del modo pedido. Y el adaptador de LINE del producto publica su punto medio como
  enganche de clase `center`, así que `(osnap p "cen")` sobre una línea contesta su punto
  medio y AutoCAD no lo haría; no se filtra aquí —dejaría al cursor imantando una cosa y a la
  rutina otra— y la corrección va escrita como P-ext-02 en `ext-peticiones.md`, porque
  `lib/cad/basic-native-adapters.ts` está fuera de mi territorio.
- **2026-09-04 · El punto de `entsel` es el centro del contorno, no el clic.** El anfitrión
  contesta a una designación con nombres de entidad; el punto del ratón no viaja por ese
  canal. Lo que dependa de QUÉ LADO se designó —el trozo que recorta TRIM— saldrá del lado
  del centro. Cerrarlo exige que la petición `prompt-selection` lleve también el punto, y eso
  es un cambio del puerto que toca al editor.
- **2026-09-04 · Las tablas de símbolos siguen siendo sólo LAYER.** BLOCK, STYLE, LTYPE y
  DIMSTYLE se rechazan por su nombre. `entmod` sobre un registro de capa se niega: la
  escritura de la tabla va por `-LAYER`, que es la única ruta que produce comandos canónicos
  de capa.
- **2026-09-04 · `textbox` mide la maqueta, no el contorno del trazo.** No baja de cero por
  el rabo de una «g», y la rotación no entra (la caja se pide en el sistema del texto, como
  en AutoLISP). Quien centre verticalmente notará una fracción de la altura.
- **2026-09-04 · CORREGIDO por la entrega 3.** Lo que decía esta línea —«`vlax-*`/`vla-*` no
  existen y no van a existir»— era cierto de todo el puente y ha dejado de serlo de su mitad
  útil: el puente de ENTIDADES existe (`builtins/vlax.ts`). Lo que sigue fuera, y con su
  motivo en el mensaje de error, es el lado de APLICACIÓN de ActiveX
  (`vlax-get-acad-object`, `vlax-create-object`, `vlax-invoke`…), los reactores `vlr-*` y la
  parametrización interna de curvas. Se deja escrito en vez de borrado: el «todavía no» de
  una entrega es la prueba de lo que la siguiente construyó.
- **2026-09-04 · El puente VLA responde quince propiedades, no el catálogo de ActiveX.**
  Layer, Color, Linetype, LinetypeScale, TextString, Height, InsertionPoint, StartPoint,
  EndPoint, Center, Radius, Closed, Coordinates, Area y Length. Una propiedad que no está
  —`Rotation`, `Normal`, `Thickness`, `Handle`, `ObjectName`— lanza nombrando las que sí y
  la puerta completa, `(entget e)`, que devuelve TODOS los códigos de la entidad. No se
  añaden a bulto: cada una necesita saber por qué comando canónico se escribe, y las que
  todavía no lo tienen valdrían más como «éxito sin efecto» que como propiedad.
- **2026-09-04 · El objeto VLA sólo envuelve entidades del espacio modelo.** No hay
  `ModelSpace`, ni `Blocks`, ni `Layers` como COLECCIONES navegables: `(vla-get-ModelSpace
  doc)` no existe porque no existe `doc`. Recorrer el dibujo se hace con `entnext`/`ssget`, y
  las tablas de símbolos con `tblnext`/`tblobjname`, que es la ruta que sí llega al documento
  canónico. Publicar colecciones exigiría decidir qué comando canónico produce un
  `(vla-add… )` de cada una, y eso es una entrega propia.
- **2026-09-04 · `vlax-curve-*` mide sobre la TESELACIÓN, y por eso `getDistAtPoint` tiene
  tolerancia relativa.** La curva llega aquí como la cadena de puntos que dibuja el producto;
  un punto exactamente sobre un arco cae hasta una diezmilésima del tamaño de la curva fuera
  de la cuerda que lo aproxima. La tolerancia se mide en proporción a la longitud de la curva
  —1e-4 de ella— para que la regla valga igual en un plano en milímetros y en uno de
  topografía. Consecuencia declarada: sobre una curva muy grande, dos puntos separados por
  menos de esa fracción se consideran el mismo punto de la curva. El tercer argumento de
  `getClosestPointTo` (extender la curva más allá de sus extremos) se rechaza por lo mismo:
  prolongar una teselación devolvería un punto que no está sobre la curva verdadera.
- **2026-09-04 · El TEXT heredado tiene DOS colores y `vla-get-Color` prefiere el bueno.** El
  rótulo del editor antiguo guarda un `color` propio, anterior a `context.presentation`. Lo
  que se DIBUJA sale de la presentación (`buildCadMTextSprite` la lee), así que
  `vla-get-Color` lee la presentación primero y sólo cae al campo heredado cuando no hay
  ninguna —si no, un rótulo rojo se declararía PorCapa—; `vla-put-Color` escribe siempre la
  presentación, que es lo que editan COLOR, CHPROP y MATCHPROP. Consecuencia declarada: tras
  escribir el color de un TEXT heredado, la paleta de propiedades —que publica el campo
  viejo por su adaptador— seguirá mostrando el anterior. Unificarlo es del lado de
  `lib/cad/text-entity-adapter.ts`, fuera de este territorio.
- **2026-09-04 · `vla-put-Closed` no cierra una SPLINE, y `vla-put-StartPoint` no mueve un
  arco.** Las dos se niegan con su motivo (cerrar una spline cambia su vector de nudos, no
  una bandera; el arranque de un arco es consecuencia de su centro, su radio y su ángulo) y
  las dos nombran la alternativa. Es la aplicación de la misma regla que ya tenían las
  variables de sólo lectura de la tabla del producto.

- **2026-09-04 · La tabla del editor todavía no está prestada.** Cada ejecución LISP recibe
  hoy una tabla propia sembrada con el documento, así que `(getvar "OSMODE")` no ve lo que
  el dibujante configuró con OSNAP ni al revés. El cableado está escrito entero en
  `ext-peticiones.md` (P-ext-01) porque `components/cad/lisp/lisp-runtime.ts` y
  `components/cad/command-line/use-command-engine.ts` están fuera de mi territorio (R1).
- **2026-09-04 · Las variables no persisten, y `INSUNITS` no reescribe la cabecera.** Lo
  primero ya lo declaraba la propia tabla (`CadDocument` no tiene sección donde ponerlas).
  Lo segundo es su consecuencia por este lado: `(setvar "INSUNITS" 6)` cambia la tabla de la
  sesión, no `meta.unit`, igual que hace el SETVAR tecleado — el subsistema LISP no alcanza
  la cabecera del documento y no va a fingir que sí.
- **2026-09-04 · `CMDECHO` se guarda pero no silencia nada.** El prólogo de despacho corre y
  el valor se lee y se restaura, que es lo que desbloquea las rutinas ajenas; lo que todavía
  no existe es un eco de comandos del que `CMDECHO 0` pueda librar, porque el subsistema
  LISP no imprime la traza del comando que despacha.
- **2026-09-04 · `runCommand` sigue tirando el `text`/`notice` de los comandos.** Un
  `(command "GETVAR" "LTSCALE")` termina en un resultado `message` que nadie imprime.
  Encauzarlo exige que `runCommand` pueda ceder una petición de escritura (hoy es una
  función corriente, no un generador) y queda para la entrega en la que toque la salida.

- **2026-09-04 · El SDK de plugins sigue sin importador fuera de `lib/lisp/`, así que por la
  regla 1 no está implementado.** El manifiesto, los permisos que se hacen cumplir, el ciclo de
  vida y los dos ejemplos existen y se prueban; lo que no existe es la puerta por la que un
  plugin llega al editor. Se declara así, con todas sus letras, en vez de contarlo como
  entregado: el diseño completo del cableado está en `ext-peticiones.md` (P-ext-03) y
  `docs/cad/third-party-extension-policy.md` —fuera de este territorio— sigue diciendo «no
  cableada», que es la verdad hasta que la petición se aplique.
- **2026-09-04 · Los permisos acotan el DOCUMENTO, no la página.** Un plugin corre en el mismo
  hilo que el editor: no hay worker ni iframe, y por tanto `ui:panel` no impide que el
  componente que el anfitrión monte haga lo que quiera con el DOM. Lo que sí está cerrado por
  completo es el documento, porque sólo se alcanza por `PluginDocumentApi`. El aislamiento
  real es una entrega propia y hoy la política de extensiones ya lo dice en «no garantizamos».
- **2026-09-04 · `documento:lectura` no se hace cumplir DENTRO de un comando de plugin.** El
  motor le pasa al descriptor su propio contexto —entidades, capas, variables— y ese contexto
  no sabe de plugins. Lo que sí se hace cumplir en esa puerta es la ESCRITURA, que es donde
  está el daño. Cerrar también la lectura exigiría que el motor construyera un contexto
  recortado por dueño, y eso es un cambio de `lib/cad/engine/` (territorio ajeno) con su propia
  spec; se declara en vez de insinuar que el permiso de lectura vale para las dos superficies.
- **2026-09-04 · Un plugin sigue sin poder DEFINIRSE fuera del bundle.** Los dos ejemplos son
  módulos TypeScript del propio árbol: no hay carga de un `.js` de un tercero, ni firma, ni
  procedencia. Cargar código de fuera exige decidir cómo se ejecuta sin `eval` —que el
  subsistema no tiene y `sandbox-surface.spec.ts` prohíbe— y eso es una entrega propia con su
  ADR. Hoy el SDK es el contrato con el que se escribe un plugin, no el mecanismo con el que
  se instala.
- **2026-09-04 · El `notice` de un comando de plugin no se imprime.** MARCOLAMINA devuelve el
  renglón con las medidas de la lámina y `runCommand` sigue tirando `text`/`notice`, como ya
  declaraba la entrega 1. La rutina dibuja bien y no lee ese texto; encauzarlo es la misma
  tarea pendiente de la salida.
- **2026-09-05 · La columna «implementada» es un DEFECTO POR OMISIÓN, no una verificación.**
  Una función sin límite declarado y sin negativa cae en esa columna por descarte. Lo que el
  gate garantiza es que nadie añade una función sin que el JSON cambie y ese cambio se vea en
  el diff; lo que NO garantiza es que las 188 se comporten como en AutoCAD en todo caso
  extremo. Comprobarlo exigiría un oráculo externo —AutoCAD corriendo las mismas rutinas—, que
  es justo la evidencia independiente que la rúbrica de la casa exige para conceder un tope.
  Se dice aquí en vez de dejar que el número se lea como una certificación.
- **2026-09-05 · La matriz no se publica todavía en la consola de `/docs/api`.** El JSON vive
  en `docs/` y lo enlaza la guía; pintarlo en la página pública es una entrega propia —una
  tabla con sus filtros, su spec de contrato y su diseño— y `apps/web/src/app/docs/api/` sí es
  territorio de este frente, así que es una decisión de alcance y no un impedimento.
- **2026-09-05 · El gate de «ninguna cifra suelta» cubre los dos documentos nuevos, no
  `docs/api/POLITICA-API-PUBLICA.md`.** Ese documento tiene cifras legítimas —los plazos de
  deprecación son la política misma, no un recuento derivado— y una prohibición ciega de
  dígitos lo habría roto. La cifra que sí era un recuento se quitó; distinguirlas
  automáticamente no lo sabe hacer este gate.

- **2026-09-05 · Las seis peticiones siguen pendientes, y sin ellas dos entregas no cuentan
  por la regla 1.** P-ext-01 (prestar la tabla de variables de la sesión del editor),
  P-ext-02 (el punto medio de una línea publicado como enganche de «centro»), P-ext-03
  (cablear el SDK de plugins al estudio), P-ext-04 (las dos cifras tecleadas y los enlaces
  que faltan), P-ext-05 (`x-visibility` en el contrato) y P-ext-06 (tokens de API por
  organización) están escritas enteras en `ext-peticiones.md` y **ninguna aplicada**. Se
  comprobó al cerrar que el SDK de plugins sigue sin importador fuera de `lib/lisp/`
  (`grep -rn "lisp/plugins" apps/web/src` fuera de ese directorio no devuelve nada), así que
  por la regla 1 de la casa la entrega 4 NO está implementada y así queda dicho. El
  coordinador las aplica; este frente no toca `components/cad/**`, `docs/cad/**`,
  `packages/contracts/**` ni `apps/api/**`.
- **2026-09-05 · La marca `x-visibility` está DISEÑADA, no aplicada.** La clasificación de
  las 104 operaciones se comprobó exhaustiva contra el YAML, pero el contrato sigue sin una
  sola marca y `POLITICA-API-PUBLICA.md` sigue con su regla por defecto vigente («TODO es
  `internal` salvo que la documentación pública lo nombre»). Hasta que P-ext-05 se aplique,
  ningún integrador puede leer del contrato qué puede congelar, y la deuda declarada de esa
  política sigue siendo deuda: no se borró, porque borrarla describiría como hecho algo que
  está escrito y no aplicado.
- **2026-09-05 · Los tokens de API siguen sin existir: una máquina no puede autenticarse.**
  89 de 104 operaciones exigen `sessionCookie` y no hay ni una API key. P-ext-06 lleva el
  diseño completo, pero exige entidad, DOS migraciones, guard y contrato —todo fuera de este
  territorio, y las migraciones expresamente prohibidas por R2—. Sin esto, la superficie que
  P-ext-05 clasifica como `public` es inalcanzable para lo único que consume una API
  pública, que es un programa; es la mitad que le falta a la fila de automatización.
- **2026-09-05 · `check:cad` no llega al final en este entorno.** Corta en
  `check:dwg-evidence` por falta de `VALLE_DWG_CORPUS_MIRROR`. Los catorce gates que van
  detrás se corrieron uno por uno y están verdes (lista en la bitácora), pero **la cadena
  entera no se ha visto verde de una pieza aquí** y no se va a fingir que sí. Quien la corra
  con el espejo del corpus apuntado verá si queda algo detrás; arreglarlo desde este frente
  habría sido tocar evidencia DWG ajena.
- **2026-09-05 · El gate nuevo de la política comprueba los NOMBRES, no las frases.** La
  sección 8 de `cobertura.spec.ts` exige que `POLITICA-API-PUBLICA.md` nombre los cuatro
  permisos y los dos campos obligatorios del manifiesto, así que un quinto permiso la pone
  roja. Lo que NO comprueba es que la explicación de cada permiso siga diciendo la verdad:
  el texto que se le enseña al usuario vive en `PLUGIN_PERMISSION_MEANING` y la política lo
  ENLAZA en vez de copiarlo, precisamente para no tener dos verdades, pero si la garantía
  (4) que describe las dos puertas envejeciera, ninguna corrida se pondría roja. Cerrar eso
  pide derivar la prosa del código, y eso es un generador, no una aserción.
- **2026-09-05 · `npm test` queda en 608/609 y no lo arreglé.** La que falla es
  `lib/cad/benchmark/plan-budget.spec.ts` por un presupuesto de tiempo de fotograma que
  ondea en esta máquina (27,343 ms y 28,045 ms contra un techo de 27 ms en dos corridas, y
  verde en otras dos sobre el mismo árbol). No es de este territorio, el frente no tocó ni
  un archivo de `lib/cad/`, y la única «solución» a mano habría sido subir el techo, que es
  exactamente lo que la casa prohíbe. Queda declarado para que quien integre sepa que ese
  rojo existe y por qué no lo tapé.
- **2026-09-05 · La matriz de cobertura sigue sin pintarse en `/docs/api`.** Es decisión de
  alcance y no impedimento —`apps/web/src/app/docs/api/` sí es territorio de este frente—:
  la tanda prefirió cerrar con las peticiones que faltaban antes que abrir una página nueva
  con su spec de contrato. Queda como la primera candidata de la tanda siguiente, junto con
  los tiles de lista de DCL (`start_list`/`add_list`/`end_list`, `mode_tile`, `get_attr`),
  el `entmake` de TEXT/HATCH/DIMENSION y la documentación de los webhooks del outbox.
