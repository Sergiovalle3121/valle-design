# F3 · Buzón de peticiones al coordinador

Cada entrada: qué archivo, qué cambio exacto, por qué, qué prueba lo verifica.

## P-01 · `annotation-v4-adapters.ts` también mezcla `endpoint`/`control` donde toca `insertion`

**Archivo.** `apps/web/src/lib/cad/annotation-v4-adapters.ts` (ATTDEF, y
presumiblemente TEXT del esquema 4 — no lo confirmé para todos los tipos del
fichero, sólo até el bloque de ATTDEF que leí al acotar el territorio de
T-14).

**Qué vi.** Igual que `block-text-adapters.ts` antes de mi arreglo de T-14
(este commit), `annotation-v4-adapters.ts:139` emite
`{ kind: "endpoint", point: entity.insertion, label: "Inserción ATTDEF" }` en
vez de `kind: "insertion"`, y sus esquinas van como `kind: "control"`
(línea ~143).

**Por qué no lo arreglé yo.** El fichero no está en la lista de `Dónde` de
T-14 (`entity-runtime.ts`, `snap-scene.ts`, `basic-native-adapters.ts`,
`polyline-entity-adapter.ts`, `point-line-adapters.ts`,
`block-text-adapters.ts`, `wall-entity-adapter.ts`) ni en el territorio
exclusivo de F3 (`lib/cad/{snap-scene.ts, snap-*.ts, entity-runtime.ts,
basic-native-adapters.ts, polyline-entity-adapter.ts, point-line-adapters.ts,
block-text-adapters.ts, wall-entity-adapter.ts, opening-entity-adapter.ts,
selection/, engine/…}`). Como el `CadSnapKind` que consume ya tiene el valor
`insertion` real (T-14 lo añadió), el arreglo en `annotation-v4-adapters.ts`
es ahora mecánico —una línea, el mismo patrón que
`block-text-adapters.ts:148,319`— y no toca ningún otro fichero.

**Cambio exacto propuesto.**
```diff
- { kind: "endpoint", point: entity.insertion, label: "Inserción ATTDEF" },
+ { kind: "insertion", point: entity.insertion, label: "Inserción ATTDEF" },
```
(y revisar si TEXT del mismo fichero tiene el mismo patrón).

**Prueba que lo verifica.** Una entrada más en
`professional-snapping.spec.ts` (o su propio spec) que construya un ATTDEF/
TEXT vía `cadSnapSceneAddEntities` y afirme `snap(...).type === "insertion"`
sobre su punto de inserción.

---

## P-02 · `Previo` (T-21) necesita que el anfitrión escriba `session.lastSelectionIds`

**Archivo.** El campo ya existe:
`apps/web/src/lib/cad/engine/command-types.ts` →
`CadCommandSession.lastSelectionIds?: readonly string[]` (añadido en este
commit, de sólo lectura para los comandos). Lo que falta es quien lo ESCRIBE,
y eso vive fuera de mi territorio: `command-engine-host.ts`
(`components/cad/command-line/`), que no está en la lista de F3.

**Qué hace falta.** Tras cada resultado de comando con
`result.kind === "document"` o `result.kind === "selection"` que arrancó de
un lote de designación (`ERASE`, `MOVE`, `COPY`, `QSELECT`, `FILTER`…), el
anfitrión debería guardar los `entityIds` designados en
`session.lastSelectionIds` antes de pasar el contexto al siguiente comando.

**Por qué importa, pero no bloquea.** Sin este cableado, la palabra clave
`Previo` de «Designe objetos» (T-21, ya construida y probada en
`selection/selection-keywords.ts` y su spec) resuelve siempre a **una lista
vacía** — la respuesta HONESTA («no hay selección previa que recordar»), no
un error ni una mentira. Está declarado así en el propio código
(`selection-keywords.ts`, comentario junto a `CAD_SELECT_PREVIOUS`). El
golden y el spec de `Previo` sólo prueban el camino CON sesión poblada
(inyectando `session.lastSelectionIds` a mano en el contexto de prueba); no
hay ningún golden de navegador que hoy pueda probar el camino real, porque el
anfitrión todavía no lo escribe.

**Cambio exacto propuesto.** En `command-engine-host.ts`, donde se aplica un
`CadCommandResult` con selección (`{kind:"selection", entityIds}`) o donde se
ejecuta un lote de `{kind:"document"}` que arrancó con una selección no
vacía, añadir `session.lastSelectionIds = entityIds` antes de construir el
contexto del siguiente comando.

**Prueba que lo verifica.** Golden de navegador: seleccionar dos objetos con
ERASE (los borra), invocar MOVE y teclear `Previo` — debería designar los
mismos dos ids que ERASE acababa de usar. Hoy ese golden no se puede escribir
porque `lastSelectionIds` nunca se rellena.

---

## P-03 · PAR (T-22) necesita enrutar el puntero a una arista de referencia

**Archivo.** El token ya se reconoce
(`apps/web/src/lib/cad/point-modifiers.ts` → `CAD_POINT_MODIFIER_TOKENS.PAR`)
y `engine/command-engine.ts` ya declara el límite en vez de fingir: teclear
`PAR` responde con un mensaje de error explícito («PAR necesita designar una
arista de referencia con el ratón, y esa ruta todavía no está conectada»),
nunca en silencio.

**Por qué no lo construí yo.** DESDE/M2P/TT se resuelven con PUNTOS
—algo que un comando del motor ya recibe como `CadCommandInput` sin importar
si vinieron del teclado o del ratón—. PAR necesita algo distinto: una
ARISTA (un `entityPick` sobre una entidad concreta) para leer su dirección y
bloquear el ángulo de la captura siguiente. Enrutar el puntero a "designa una
entidad de referencia, no un punto" durante una sub-captura de este tipo es
una decisión de qué escucha el CLIC —mouse routing—, y eso vive fuera de
`engine/command-engine.ts` (el reductor puro que sí pude tocar): en el
enrutador del puntero del estudio, que la propia campaña reserva al
coordinador para T-20 por el mismo motivo (interpretar qué es un clic).

**Qué hace falta.** Cuando `state.pointModifier` no existe pero el usuario
teclea `PAR`, en vez de responder con el mensaje de error actual, el
enrutador de puntero debería:
1. Aceptar el SIGUIENTE clic como una designación de ENTIDAD (no de punto),
   pase lo que pase con el `accepts` mask del paso activo (igual que ya hace
   para los pinzamientos, T-20).
2. Calcular la dirección de esa entidad en el punto más cercano al clic
   (ya existe aritmética parecida en `curve-entity-adapters.ts` para la
   tangente del arco — mismo patrón, otra proyección).
3. Alimentar esa dirección como un ÁNGULO bloqueado al motor —posiblemente
   una variante nueva de `CadResolvedToken`, `{kind:"angleLock", degrees}`,
   hermana de `pointModifier`— para que la distancia tecleada después se
   resuelva sobre esa dirección en vez de la del cursor.

**Prueba que lo verifica.** Golden: `LINE` → `PAR` → clic sobre un muro
horizontal → teclear `500` → el segundo vértice cae a 500 unidades en la
MISMA dirección del muro, no en la del cursor.

---
