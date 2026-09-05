# 11 · Trabajar con otros: xrefs, contenido, revisión, versiones

**Auditoría Fable · dimensión «colaboración» · 2026-09-05**
**Auditor:** arquitecto de despacho, 20 años, suscripción AutoCAD completa, uso
diario del modelo + layouts + toolsets + el plano que manda el estructurista.
**Método:** lectura del árbol real (`apps/web/src`, `apps/api/src`,
`packages/`), de `docs/competitive/rubric.json`, de `docs/parity/ESCALERA.md`
y de `docs/execution/BACKLOG.md`. Cero cambios en código de producto.
**Cifras del producto:** no se copian aquí. Las computa
`node scripts/cad/rubric.mjs` (regla 4 de cimientos). Lo que sigue son las
filas que toco, con lo que MIRÉ al lado.

---

## 0 · Veredicto en una frase

Los cimientos de colaboración son mejores que los de AutoCAD —presencia real
entre máquinas, enlace de revisión para un cliente sin cuenta, motor de fusión
semántica a tres bandas, historial CAS inmutable en el servidor— pero el bucle
diario del despacho está roto en el último metro: **no puedo NAVEGAR la
biblioteca de dibujos de mi propia oficina desde dentro del CAD, así que para
adjuntar el plano del estructurista tengo que teclear su UUID; nadie me avisa
cuando ese plano cambia; y cuando dos guardamos a la vez, el 409 sale como un
brindis rojo sin un solo botón para resolverlo.**

**Nota contra AutoCAD completo en esta dimensión: 4,5 / 10.**

Justifico el 4,5 y no menos: el enlace de revisión y la presencia entre
máquinas son cosas que AutoCAD necesita un producto de nube aparte para hacer,
y aquí están construidas y con evidencia. Justifico el 4,5 y no más: la
pregunta del lunes no es «¿puedo comentar?», es «¿puedo abrir el plano de mi
compañero?», y hoy la respuesta es «si te sabes el UUID de memoria».

---

## 1 · Lo que MIRÉ y está construido de verdad

No es poco, y buena parte es de calidad alta. Lo enumero primero porque la
regla de la casa es no declarar ausente lo que existe, y en este repo declarar
ausente algo construido es el error caro.

### 1.1 · El motor de referencias externas

`apps/web/src/lib/cad/cad-xrefs.ts` (169 líneas) y el paquete
`apps/web/src/lib/cad/xref/` son un motor de xrefs de verdad, no una maqueta:

- **Adjuntar es UNA transacción.** La cabecera de `cad-xrefs.ts` cuenta el
  defecto que cerró: adjuntar son cuatro escrituras —la capa, los bloques
  proyectados, el INSERT y el registro— y como transacciones sueltas una
  interrupción dejaba «la capa creada y nada dentro». Hoy todas construyen un
  lote y lo aplican con `executeCadEntityCommandBatch`: un `commitChange`, un
  paso de deshacer. Eso está bien pensado.
- **Recargar tampoco tiene estado intermedio.** `reloadCadXref`
  (`cad-xrefs.ts:97`) mete el desligado y el nuevo adjuntado en el mismo lote,
  con el comentario exacto: «recargar es una orden, no dos, y a mitad de camino
  el dibujo no tiene el xref».
- **Ciclos y profundidad.** `xref/xref-graph.ts` con `CAD_XREF_MAX_DEPTH`, y la
  comprobación ocurre en `cadXrefAttachCommands`, ANTES de emitir nada.
- **XBIND distingue enlazar de insertar**, que en AutoCAD son dos resultados
  distintos y aquí también (`bindCadXref` usa la variante `insert`;
  `cadXrefBindCommands(..., 'bind')` conserva el bloque).
- **XCLIP completo**: rectángulo, polígono, invertir, activar/desactivar y
  borrar (`xref/xclip.ts`, 282 líneas; `engine/commands/xrefs.ts:591`), y —lo
  que importa— el recorte se aplica en `professional-blocks.ts`, el único sitio
  por el que pasan render, designación, límites y exportación. No hay dos
  verdades sobre qué se ve y qué se puede seleccionar.
- **Resolución de rutas con su explicación.** `xref/xref-paths.ts` y el informe
  de `XREF ?` dicen POR QUÉ ruta se resolvió cada referencia (relativa,
  absoluta, por nombre) o, sin catálogo, cuáles son las rutas guardadas. AutoCAD
  no te dice tan claro cuál de las tres funcionó.
- **Comandos tecleables**: `XREF`, `XATTACH`, `XBIND`, `XCLIP`,
  `EXTERNALREFERENCES`, y `REFEDIT`/`REFSET`/`REFCLOSE` para la edición en
  sitio (`engine/command-manifest.ts`).

### 1.2 · El enlace de revisión — aquí Valle GANA a AutoCAD

`apps/api/src/modules/cad-documents/entities/cad-review-session.entity.ts` +
`apps/api/src/modules/cad/cad-review-link.controller.ts` +
`apps/web/src/components/cad/collab/ReviewLinkClient.tsx`.

- Token **server-owned**: se guarda `sha256` en `token_hash`, jamás el claro; el
  claro sólo viaja en la respuesta de creación y se enseña una vez.
- Caducidad (`expires_at`) comprobada en CADA petición, revocación inmediata
  (`revoked_at`), aislamiento por inquilino sacado de la fila, nunca del cliente.
- La cabecera de `ReviewLinkClient.tsx` es explícita sobre por qué se retiró el
  token de la URL: historial del navegador, `Referer`, logs de proxy.
- El invitado **no necesita cuenta ni licencia**. Abre el plano en el móvil, sin
  WebGL (`collab/plan-projection.ts` proyecta a trazos planos usando el MISMO
  registro de entidades que el editor), toca un punto y escribe.

Esto es Shared Views de AutoCAD, pero sin obligar al cliente a crearse una
cuenta de Autodesk. Para el arquitecto que manda un plano al cliente por
WhatsApp, esto solo ya vale dinero.

### 1.3 · El ancla de comentario, hecha con criterio

`apps/web/src/lib/cad/collab/comment-anchor.ts`. Tres estados de lectura
—`anchored`, `unanchored`, `unreadable`— y ninguno de ellos inventa una
posición. La cabecera lo dice mejor que yo: «un comentario que dice *esta viga
está mal* apuntando a una viga que no es miente peor que un comentario sin
flecha». El `space: "model" | "paper"` está declarado desde el registro 1 para
no tener que migrar datos después. Bien.

### 1.4 · Presencia real entre máquinas

`collab/presence.ts` (aritmética pura), `collab/presence-channel.ts` (puerto),
`collab/server-presence-channel.ts` (adaptador SSE + `fetch`), API en
`cad-presence.controller.ts`/`cad-presence.service.ts` con limpieza
(`cad-presence-cleanup.service.ts`) y aislamiento por inquilino probado en
PostgreSQL (`cad-presence-tenant-isolation.pg.spec.ts`). Evidencia:
`docs/cad/evidence/live-presence.json`.

El TTL usa el reloj LOCAL a propósito, y está razonado: con el `at` del emisor,
un compañero con el reloj adelantado sería inmortal. Y la reconexión distingue
el corte de red (que `EventSource` reintenta solo) del cierre definitivo (401,
404), que reabre con backoff. Esto es más de lo que AutoCAD hace en su editor de
escritorio: allí no sabes que tu compañero tiene el plano abierto hasta que el
`.dwl` te lo dice al abrir.

### 1.5 · COMPARE: un diff de entidades de verdad

`apps/web/src/lib/cad/compare-documents.ts` (19 KB) +
`compare-revision-clouds.ts` (15 KB) + `engine/commands/compare-drawings.ts`.

El emparejamiento tiene dos pasadas —por id, y por firma geométrica normalizada
para lo que quedó suelto— con la razón escrita: un dibujo que pasó por un DXF de
ida y vuelta trae los mismos objetos con ids nuevos, y sin la segunda pasada el
diff diría «todo borrado y todo añadido», que es literalmente cierto y
completamente inútil. Y separa `geometryChanged` de `propertyChanges`, con la
partición declarada EXHAUSTIVA para que ningún campo cambie sin que el diff lo
vea. Es mejor razonado que DWG Compare, que te pinta colores y ya.

### 1.6 · Concurrencia: CAS, incidente por documento y fusión semántica

- `document-lifecycle/controller.ts:173-175` traduce el 409 del servidor a
  `CadCasConflictError`.
- `cad-conflict-incident.ts` cierra un defecto real y documentado: el
  enclavamiento vivía en un único `saveConflictRef` comparado por número de
  versión, y los números de versión no son únicos entre documentos — un
  conflicto en el plano A detenía el autosave del plano B. Hoy es un registro
  indexado por `documentId`.
- `cad-conflict-resolution.ts` y `cad-collaboration.ts` + `cad-document-merge.ts`
  son un motor de fusión a tres bandas serio: colisiones por entidad,
  colisiones por SECCIÓN (capas, bloques, estilos, presentaciones) y
  `referenceBreaks` — la fusión no se aplica si dejaría una referencia colgante,
  porque el validador del servidor la rechazaría.
- Evidencia medida: `docs/cad/evidence/review-concurrency.json`, con
  `verdict.passed: true`, cinco roles por el camino de identidad REAL (registro,
  verificación, argon2id, invitación, aceptación), fronteras de rol verificadas
  (viewer y enlace NO pueden guardar), un ganador por carrera CAS y conteos
  íntegros. Los vecinos de la máquina están declarados. Eso es honestidad de la
  buena.

### 1.7 · Historial de versiones en el servidor

`apps/api/src/modules/cad-documents/entities/cad-document-version.entity.ts`:
una fila por versión CAS, unicidad `(document_id, version)` que hace la
escritura idempotente, payload inline o puntero a blob, `sha256`. Endpoints
`GET /v1/cad/documents/:id/versions` y `/versions/:version`
(`cad.controller.ts:249` y `:262`), y el segundo **hidrata** el documento
completo, no el puntero, porque «quien restaura una versión histórica necesita
el documento completo».

### 1.8 · Contenido compartido: biblioteca de bloques del inquilino

`sf_cad_blocks` (`entities/sf-cad-block.entity.ts`) con `definition`,
`version` monótona y `legacy_source_id`; rutas `/v1/cad/blocks`; y cableado real
en el editor: `Layout3DEditor.tsx:1657-1665` la carga,
`insertProfessionalBlock` (`:5283`) copia la definición al documento marcándola
`library.scope: "tenant"` con `sourceId`, `syncRedefinedBlockLibrary` (`:5328`)
empuja la redefinición de vuelta a la biblioteca, y `deleteCadBlock` (`:9679`)
la borra con confirmación.

### 1.9 · ADCENTER, paletas de herramientas, ETRANSMIT, REVCLOUD, conjuntos

Todos existen y todos están tecleables (`command-manifest.ts`): `ADCENTER`
(alias AC/ADC/DC), `TOOLPALETTES`/`-TOOLPALETTES`, `ETRANSMIT`, `REVCLOUD`,
`WIPEOUT`, `SHEETSET`, `PUBLISH`, `COMPARE`/`DWGCOMPARE`/`COMPARAR`. El
manifiesto de ETRANSMIT lleva DENTRO la revisión de entrega, que el `.zip` de
AutoCAD no lleva. Eso también es mejor que el original.

---

## 2 · Los huecos, por orden de lo que más duele

### H1 · No hay CATÁLOGO: para adjuntar el plano del compañero hay que teclear su UUID

**AutoCAD:** el gestor de referencias externas abre un explorador de archivos.
Veo la carpeta del proyecto, veo `EST-CIMENTACION.dwg`, lo selecciono, elijo
adjunto/superposición, punto, escala, giro. Cinco segundos. DesignCenter navega
igual por carpetas, unidades de red y dibujos abiertos.

**Valle hoy:** `context.xrefCatalog` está declarado en
`engine/command-types.ts:259` y **NADIE lo provee**. Lo verifiqué:

```
$ grep -rn "xrefCatalog" apps/web/src
command-types.ts:259           ← la declaración
compare-drawings.spec.ts:109   ← una spec
xrefs.spec.ts:102              ← otra spec
xrefs.ts:21,136,200,354,369,372 ← el consumidor
compare-drawings.ts:232,235    ← el otro consumidor
design-center.ts:22            ← la nota de que hará falta
```

Cero hits en `Layout3DEditor.tsx`, cero en cualquier componente. Consecuencias
en cadena:

- `XREF ?` no puede listar los dibujos disponibles; pide que se escriba el
  activo (`engine/commands/xrefs.ts:136`).
- La vía gráfica no es mejor: `CadXrefPalette.tsx:93` es un `<input>` de texto
  con `placeholder="PLANT-ARCH"` y otro para «Revision». Como los documentos
  nuevos son UUID (AGENTS.md: «New documents use generated UUIDs y
  `/studio/[documentId]`»), lo que hay que teclear ahí es
  `f47ac10b-58cc-4372-a567-0e02b2c3d479`. **Nadie hace eso el lunes.**
- `ADCENTER` sólo ofrece como origen las referencias YA adjuntadas
  (`blocks/design-center.ts:12-24`, `cadDesignCenterSources` recorre
  `document.externalReferences`). Es decir: para traerme un bloque del plano de
  instalaciones tengo que adjuntarlo primero como xref. En AutoCAD abro
  DesignCenter y arrastro.
- **`COMPARE` no compara nada.** Sin catálogo la orden declara el límite
  honestamente (`compare-drawings.ts:140`) y no hace nada. El motor de diff más
  cuidado del repo —dos pasadas, nubes por union-find, 46 casos de spec— no
  tiene por dónde recibir el segundo dibujo en producción.

**Dolor real:** llega el DXF del estructurista, lo subo como documento nuevo,
y para colgarlo debajo de mi planta tengo que ir al listado, copiar el UUID de
la barra de direcciones, volver al estudio y pegarlo en un campo que dice
«PLANT-ARCH». Un becario no lo consigue.

**Coste:** un día.

**Cómo se construye:** un `CadXrefCatalogProvider` en
`components/cad/command-line/` que al montar el motor pida
`GET /v1/cad/documents?limit=200` **paginado** (ver D3) y publique nombres +
`assetId` + `revision` en `context.xrefCatalog`, sin `snapshot` (sin contenido:
sólo el índice, que es barato). Cuando una orden necesita el contenido, ya
existe el camino: la petición de anfitrión `{kind:"xref-attach"}` que atiende
`command-line/xref-host.ts`. Para `COMPARE` hace falta su gemela
`{kind:"compare-fetch"}`, que ya está anotada en `engine/host-requests.ts` y
pedida por escrito como `P-express-04`. Y en `CadXrefPalette.tsx` el `<input>`
de texto pasa a ser un `<select>`/combo sobre el mismo catálogo, conservando la
entrada libre para el caso de la ruta relativa.

**Cómo se verifica:** ampliar `golden/87-cad-xattach-tecleado.spec.ts` con un
caso `XREF ?` que LISTE al menos dos dibujos del inquilino sembrados por la
prueba; un golden nuevo de `COMPARE` contra un segundo documento real que
afirme las tres capas `VD-COMPARE-NUEVO/BORRADO/CAMBIADO` sobre el documento que
recibe el servidor; y un caso de paleta que adjunte eligiendo de la lista, sin
teclear un id.

---

### H2 · Nadie me avisa de que la referencia cambió; y preguntarlo ENSUCIA el dibujo

**AutoCAD:** al abrir, y luego cada `XNOTIFYTIME` minutos, comprueba la marca de
tiempo del archivo referenciado y saca el globo «*Un archivo de referencia ha
cambiado*» con un enlace a Recargar. Es de las poquísimas notificaciones de
AutoCAD que nadie desactiva, porque plotear una lámina con la retícula vieja del
estructurista cuesta una obra.

**Valle hoy:** la comprobación existe pero es **manual y por referencia**. Hay
que abrir la paleta de xrefs y pulsar «Compare» en cada una
(`CadXrefPalette.tsx:242-247` → `Layout3DEditor.tsx:5454`
`compareProfessionalXref`). No hay sondeo, no hay comprobación al abrir, no hay
aviso. `grep -i "XREFNOTIFY\|XLOADCTL"` sobre `apps/web/src`: cero.

Y hay algo peor, que es un defecto y no un hueco (ver D1): **pulsar «Compare»
marca el documento como modificado**. `compareProfessionalXref` responde con
`commitBlockMutation(... markCadXrefStatus ...)`, y `markCadXrefStatus`
(`cad-xrefs.ts:137-142`) siempre estampa
`checkedAt: new Date().toISOString()`, que `cadXrefStatusCommands`
(`xref/xref-workflow.ts:268`) escribe como `lastCheckedAt`. El documento
resultante NUNCA es idéntico al de entrada, así que `commitBlockMutation`
(`Layout3DEditor.tsx:5029-5031`) ejecuta `recordHistoryDocument` + `markDirty()`.
Preguntar «¿cambió el plano de Pedro?» consume un paso de deshacer y dispara un
autosave.

**Dolor real:** con seis xrefs abro la paleta y pulso seis botones cada vez que
vuelvo del café. Nunca lo hago. Ploteo con la retícula vieja.

**Coste:** varios días.

**Cómo se construye:** dos piezas, y la segunda es la que gana (ver §4).
(a) **Barato:** al abrir el documento, recorrer `externalReferences` y llamar a
`compareCadXrefVersion` en un lote de solo lectura —extraer una variante
`inspectCadXrefFreshness(document, id, snapshot)` que devuelva la comparación
SIN emitir comandos— y pintar el conteo en el muelle de colaboración; luego
repetir con un intervalo perezoso que se pare con `visibilitychange`, igual que
`use-cad-comments.ts` ya hace. (b) **Correcto:** el servidor ya publica
`design.document.saved` (`cad-documents.repository.ts:401`). Añadir una lectura
inversa —qué documentos declaran a éste como `externalReferences[].assetId`— y
empujar el aviso por el MISMO canal SSE de presencia (`server-presence-channel.ts`,
un sobre `valle.cad.xref` versión 1). Cero sondeo, latencia de segundos.

**Cómo se verifica:** spec de que `inspectCadXrefFreshness` no produce comandos
(el documento sale idéntico por `serializeCadDocument`); golden con dos
contextos de navegador donde A guarda el dibujo referenciado y B ve el aviso sin
tocar nada; y un caso que afirme que tras el aviso el documento de B sigue
`data-state="guardado"`.

---

### H3 · El historial de versiones existe en el servidor y NO SE PUEDE VER

**AutoCAD:** ni con Autodesk Docs es gran cosa, pero al menos hay
`DWGHISTORY` en la versión de escritorio conectada a Drive, y siempre están los
`.bak`, los `.sv$` y `RECOVER`.

**Valle hoy:** la base de datos guarda **cada** versión CAS
(`cad_document_versions`), la API la sirve paginada y hidratada, el SDK la
expone, el repositorio del cliente está escrito:

```
apps/web/src/lib/cad/repositories/versions.ts
  export const versionsRepository = { list, get }
```

…y tiene **cero consumidores**:

```
$ grep -rn "versionsRepository" apps/web/src
apps/web/src/lib/cad/repositories/versions.ts:2   ← su propia definición
```

Lo único que el usuario ve como «versiones» es
`CadCollaborationPalette.tsx:73-81` `versionOptions`, que lee
`document.collaboration.versions` — puntos de control que el propio usuario crea
a mano, **guardados DENTRO del documento** y topados a doce
(`cad-collaboration.ts:477` `.slice(-12)`), cada uno con un
`structuredClone` completo del dibujo (`:471`). Ver D2: eso es una bomba de
tamaño.

**Dolor real:** «el jueves esto estaba bien». En AutoCAD abro el `.bak` o pido
al de sistemas la copia de la noche. Aquí el servidor tiene exactamente esa
versión guardada y la interfaz no tiene ninguna puerta.

**Coste:** un día.

**Cómo se construye:** una sección «Historial» en la paleta de colaboración (o
mejor, en el muelle de estado del documento) que consuma `versionsRepository.list`
con paginación, muestre `version · created_at · created_by · sha256`, y ofrezca
dos acciones: **Previsualizar** (trae `versionsRepository.get` y lo pinta con
`projectCadPlan`, que ya sabe dibujar un documento sin tocar el editor) y
**Comparar con el actual** (llama a `cadCompareDocuments` — el diff bueno, no el
de la paleta). «Restaurar» es un guardado normal contra la versión vigente: se
carga el documento antiguo, se marca sucio y se guarda; el CAS hace el resto.

**Cómo se verifica:** golden contra API real y PostgreSQL (la banda
`e2e/real/`) que guarde tres veces, abra el historial, vea tres filas, compare
la primera con la actual y afirme el conteo de diferencias.

---

### H4 · El 409 no tiene salida: el motor de fusión no lo llama NADIE

**AutoCAD:** no tiene este problema porque no deja tenerlo — el segundo que abre
el `.dwg` lo abre de solo lectura y ve *«en uso por PEDRO»*. Feo, pero nadie
pierde trabajo.

**Valle hoy:** dos personas abren el mismo dibujo (nada lo impide: no hay
bloqueo, no hay `checkout` — lo busqué). Ambos editan. El segundo que guarda
recibe 409, y esto es TODO lo que pasa (`Layout3DEditor.tsx:13126-13143`):

```ts
conflictRegistryRef.current = openCadConflictIncident(...);
setSaveIssue({ kind: "conflict", message: saveError.message, ... });
toast.error(saveError.message, "Conflicto CAS");
return null;
```

`CadSaveStatus.tsx` pinta la etiqueta en rojo con `title={issue.message}`. Es
una ETIQUETA: no hay botón, no hay diálogo, no hay «fusionar / recargar /
sobrescribir». Y el autosave queda enclavado, así que a partir de ahí mi trabajo
no sube.

Mientras tanto, `planCadConflictResolution` —el módulo que decide exactamente
esto, con sus dos invariantes escritas («se guarda SIEMPRE contra la versión del
servidor» y «fusionar con colisiones sin resolver NO produce plan»)— tiene
**cero llamadores en el producto**:

```
$ grep -rn "planCadConflictResolution" apps/web apps/api scripts
cad-conflict-resolution.spec.ts   ← su spec (13 casos)
cad-conflict-resolution.ts:137    ← la definición
apps/api/src/load-probe/review-concurrency.main.ts:20  ← comentario
scripts/cad/review-concurrency-merge.mts:71            ← el script de EVIDENCIA
```

Es decir: **la evidencia de concurrencia que la rúbrica cobra
(`review.concurrency`, 2 puntos) ejercita un camino de fusión que el editor
nunca ejecuta.** El artefacto es verdad sobre el motor; no lo es sobre el
producto. Esto roza la regla 1 de cimientos («un subsistema sin importador fuera
de sí mismo no está implementado») y merece mirada del titular.

**Dolor real:** tarde de entrega, dos personas rematando la misma lámina. Uno
pierde y no tiene forma de recuperar más que copiar a mano.

**Coste:** varios días.

**Cómo se construye:** un `CadConflictDialog` que, al `setSaveIssue({kind:
"conflict"})`, traiga `theirs` (`documents.get(documentId)`), tome `base` del
último documento reconocido —que el controlador ya guarda para el CAS— y `mine`
de `loadedCadDocumentRef`, llame a `planCadConflictResolution("merge", …)` y
enseñe el resumen que el módulo ya devuelve: cuántas entidades se fusionaron
solas, qué colisiones exigen elección, qué secciones, y si hay
`referenceBreaks`. Tres botones: **Fusionar** (deshabilitado hasta
`mergeReady`), **Recargar lo del servidor** y **Sobrescribir**, este último con
el conteo de lo que se pierde. La paleta de colaboración YA tiene la interfaz de
elección por colisión (`CadCollaborationPalette.tsx:117-183`): se reutiliza,
alimentada con `theirs` del servidor en vez de con una versión del documento.

**Cómo se verifica:** golden en la banda real con dos contextos de navegador,
edición disjunta (fusión automática) y edición sobre la MISMA entidad (colisión
que exige elegir), afirmando sobre el documento que queda en PostgreSQL.

---

### H5 · Las paletas de herramientas no se comparten: viven en `localStorage`

**AutoCAD:** las paletas se publican en una ruta de red compartida
(`TOOLPALETTEPATH`) y todo el despacho las hereda; con Autodesk Account se
sincronizan entre máquinas. Es LA herramienta para que el que entra nuevo dibuje
con las convenciones de la casa desde el primer día.

**Valle hoy:** el módulo `lib/cad/tool-palettes.ts` lo declara como su razón de
ser —«su valor no está en ejecutar comandos […] sino en que la CONFIGURACIÓN
viaja: el que entra nuevo hereda las herramientas del despacho»— y a
continuación se guarda donde no viaja:

```ts
// tool-palettes.ts:57-63
export function cadToolPaletteStorageKey(scope) {
  return `valle_cad_toolpalettes:${scope.tenantId||"tenant"}:${scope.userId||"user"}`;
}
```

`session-catalogs.ts:78-82` resuelve `storage()` a `window.localStorage`. La
clave incluye el inquilino y el usuario, pero el almacén es el NAVEGADOR de esa
persona. Cambio de portátil, se pierden. Las hago yo, mi socio no las ve. La
cabecera lo admite («No se añade endpoint ni se toca el contrato — la ola de
contratos pertenece a otra sesión»), pero el resultado es que la promesa del
módulo no se cumple.

**Dolor real:** monto la paleta con nuestros bloques de carpintería y nuestras
capas, y es mía y de nadie más.

**Coste:** varios días (toca contrato + OpenAPI + SDK, que son gates).

**Cómo se construye:** tabla `cad_tool_palettes` con `tenant_id`, `name`,
`tools` JSON, `scope: 'tenant'|'user'` y `version`; rutas
`GET/POST/PATCH/DELETE /v1/cad/tool-palettes` con `cad:view` para leer y
`cad:edit` para escribir las de inquilino. `CadToolPaletteCatalog` ya acepta un
`persist` inyectado (`tool-palettes.ts:165-170`): se le pasa uno que escribe al
servidor y `localStorage` queda como caché de arranque en frío. Nada del motor
cambia.

**Cómo se verifica:** spec de que dos sesiones con el mismo `tenantId` y
distinto `userId` leen la misma paleta de inquilino; y una spec de fallo cerrado
para el `viewer`, que puede leerla y no guardarla.

---

### H6 · El bloque de la biblioteca se redefine y los otros dibujos no se enteran

**AutoCAD:** ninguna maravilla —hay que reinsertar o usar la actualización desde
la paleta de herramientas—, pero al menos DesignCenter y las paletas te dejan
volver a traer la definición sobre el dibujo abierto, y `ATTSYNC` sincroniza los
atributos.

**Valle hoy:** la infraestructura está TODA puesta y no se usa. Al insertar, la
definición se clona al documento con su procedencia
(`Layout3DEditor.tsx:5295-5308`):

```ts
version: libraryRow?.version ?? libraryDefinition.version ?? 1,
library: { ...libraryDefinition.library, scope: "tenant", sourceId: libraryRow?.id },
```

`sf_cad_blocks.version` es «optimistic, monotonic library version incremented on
redefine». Es decir: cada bloque del documento sabe de qué fila viene y con qué
versión entró, y la biblioteca sabe por cuál va. **Nadie compara los dos
números.** Lo busqué: ningún sitio del producto lee `block.library.sourceId`
contra `cadBlocks[i].version`.

**Dolor real:** cambio el bloque de ventana de la casa (marco más grueso) en un
plano y lo empujo a la biblioteca. Los otros catorce planos del proyecto siguen
con la ventana vieja y nada lo dice. Ploteo el juego y salen dos ventanas
distintas.

**Coste:** un día.

**Cómo se construye:** al cargar el documento, cruzar `document.blocks` que
tengan `library.scope === "tenant"` con las filas de `cadBlocks` por `sourceId`;
donde `row.version > block.version`, marcar el bloque como desfasado. Enseñarlo
en `CadBlockPalette.tsx` (badge por bloque) y añadir un comando
`BLOQUEACTUALIZA` que redefina in situ desde la biblioteca reutilizando el
camino de `redefineProfessionalBlock` + `ATTSYNC`, que ya existe
(`blocks/attribute-sync.ts`) y ya conserva lo escrito, añade lo nuevo y retira
la etiqueta huérfana.

**Cómo se verifica:** spec sobre dos documentos y una fila de biblioteca: se
sube la versión, el segundo documento reporta el desfase, se ejecuta el comando,
la geometría queda recalculada y los ATRIBUTOS ESCRITOS sobreviven (que es lo
que `ATTSYNC` ya prueba).

---

### H7 · ETRANSMIT manda un `.json` sin las imágenes, y lo llama paquete

**AutoCAD:** eTransmit empaqueta el DWG, sus xrefs, sus imágenes, sus fuentes,
sus tablas de plumas y sus plantillas, y opcionalmente los enlaza o los
convierte. Es lo que mando al contratista.

**Valle hoy:** `etransmit/etransmit.ts` está bien construido y es honesto
—declara en el manifiesto lo que NO viaja, con su motivo— pero el anfitrión
nunca le da los bytes:

```
$ grep -rn "resolvedAssets" apps/web/src
etransmit/etransmit.ts        ← la definición del parámetro
etransmit/etransmit.spec.ts   ← la única vez que se pasa
```

`engine/commands/etransmit-commands.ts:137` llama a
`buildCadTransmittalPackage` sin `resolvedAssets`, así que la rama de
`etransmit.ts:171-181` marca TODA xref y TODA imagen como
`included: false, reason: "sin bytes disponibles"`. Y el único archivo que sí
viaja es `${nombre}.json` (`etransmit.ts:145-147`): el documento canónico de
Valle. Sin DXF, sin PDF.

**Dolor real:** el contratista abre el ZIP y encuentra un `.json` que su AutoCAD
no lee y un manifiesto que dice que faltan las tres imágenes del levantamiento
escaneado. Mando el paquete por correo y me llaman a los diez minutos.

**Coste:** varios días.

**Cómo se construye:** un `etransmit-assets-host.ts` en `command-line/` que,
antes de empaquetar, recorra `externalReferences` e `imageDefinitions` y traiga
los bytes por el mismo camino que `fetchCadXrefSnapshot` y el adjuntado de
imágenes ya usan; pasarlos como `resolvedAssets` indexado por `assetId` y por
`uri`, que es exactamente lo que `resolve()` (`etransmit.ts:157-158`) espera. Y
añadir al ZIP, junto al `.json`, el **DXF** del documento —`exportCadDxf` ya
existe y la API tiene `GET /documents/:id/export/dxf`— y el **PDF de las
láminas** por el camino de `PUBLISH`. El manifiesto ya sabe declarar lo que
viaja y lo que no; sólo hay que darle algo que declarar.

**Cómo se verifica:** ampliar `golden/88` (la cadena AUDIT · PURGE · LAYTRANS ·
CHECKSTANDARDS · ETRANSMIT) afirmando sobre los BYTES del ZIP: que contiene el
`.dxf`, que contiene la imagen adjunta y que el manifiesto la lista con
`included: true`.

---

### H8 · Al cliente sólo le puedo enseñar el ESPACIO MODELO, nunca la lámina

**AutoCAD:** Shared Views publica lo que elijas, y lo normal es publicar la
presentación con su cajetín, su escala y su norte.

**Valle hoy:** `collab/plan-projection.ts:84` recorre
`document.modelSpace.entityIds` y sólo eso. `paperSpaces` no aparece en el
módulo (`grep paperSpace` sobre él: cero). El `space: "paper"` del ancla de
comentario está declarado y nunca se produce: `cadCommentAnchor`
(`comment-anchor.ts:94-113`) recibe `space` opcional y el único llamador
—`ReviewLinkClient.tsx` y `StudioCollaborationLayer.tsx:184`— lo llama sin él,
así que siempre es `"model"`.

**Dolor real:** mando al cliente la maraña del modelo —replanteo, ejes,
anotaciones a escala de modelo, el detalle de la escalera pegado a la planta—
en vez de la lámina A1 limpia que él sabe leer. El cliente comenta sobre cosas
que no van a salir impresas.

**Coste:** varios días.

**Cómo se construye:** `projectCadPlan(document, { space: "paper", layout })`
que proyecte la presentación: el marco de papel, el cajetín y, por cada
viewport, la porción de modelo recortada y transformada por su escala. El
`paper-space.ts` y `cad-paper-viewport.ts` ya tienen esa matemática (la usa el
trazado). En la creación del enlace, un selector de qué publicar (modelo o una
lámina), guardado en `cad_review_sessions` como columna nueva `scope`. El ancla
del comentario pasa a llevar `space: "paper"` y `layout`, que el formato YA
admite sin migración.

**Cómo se verifica:** golden `56-cad-review-link-guest` ampliado: se publica una
lámina, el invitado ve el cajetín, coloca un comentario y el autor lo ve
anclado SOBRE LA LÁMINA, no sobre el modelo.

---

### H9 · Al comentario del cliente no se le puede CONTESTAR, y nadie se entera de que llegó

**AutoCAD:** no tiene comentarios, así que aquí Valle parte ganando. Pero lo que
hay se queda a medias.

**Valle hoy:**

- `cad_comments` (`entities/cad-comment.entity.ts`) **no tiene `parent_id`**.
  Las columnas son `review_session_id`, `document_id`, `author`, `body`,
  `anchor`, `resolved`. El tipo del cliente lo confirma:
  `CadCommentThread` (`use-cad-comments.ts:62-72`) es un comentario suelto con
  un `ordinal`. Un «hilo» de un solo mensaje no es un hilo. La única respuesta
  posible al cliente es abrir otro comentario en otro sitio, o cerrarlo sin
  decir nada.
- Las rutas son `list`, `create`, `resolve` (`cad-review.controller.ts:72-98`).
  **No hay editar ni borrar.** Un comentario escrito con una errata se queda.
- **No hay ninguna notificación.** El único evento de dominio que la caja de
  salida publica para CAD es `design.document.saved` y
  `design.document.published` (`cad-documents.repository.ts:401` y `:552`).
  Ningún `design.comment.created`. El autor se entera si tiene el dibujo abierto
  y el sondeo de 5 s (`CAD_COMMENTS_POLL_MS`) corre. No hay correo, no hay
  insignia en el listado de documentos, no hay bandeja de «comentarios sin
  resolver» de todo el proyecto.
- El ancla es un punto fijo. `comment-anchor.ts:60` dice literalmente que
  `entityId` «no se usa para posicionar —posiciona `x`/`y`». Si muevo la fachada
  dos metros, la chincheta del cliente se queda donde estaba.

**Dolor real:** el cliente comenta el viernes a las 22:00. Lo veo el martes
porque casualmente abro ese plano. Y cuando lo veo no puedo contestarle «ya está
corregido en la revisión B»: sólo puedo marcarlo resuelto, que para él es
silencio.

**Coste:** varios días.

**Cómo se construye:** (a) columna `parent_id` (nullable, FK a la propia tabla)
+ `POST /v1/cad/comments/:id/replies` y el mismo verbo en la superficie del
enlace; `CollabThreadPanel` ya pinta una lista, sólo cambia el agrupado. (b) Un
evento de dominio `design.comment.created` por la caja de salida existente
—firmado, con `Idempotency-Key`, sin cuerpo en logs, como manda AGENTS— y un
consumidor que mande el correo transaccional al autor del documento. (c) Un
contador de comentarios sin resolver por documento en `GET /v1/cad/documents`,
pintado en el listado. (d) Reanclado: al cargar, si `anchor.entityId` existe y la
entidad se movió, desplazar la chincheta por el mismo delta; si la entidad ya no
está, marcar el comentario «apunta a algo que ya no existe» —que es información
que el módulo YA dice que quiere dar.

**Cómo se verifica:** spec de anclaje que mueva la entidad y afirme que la
chincheta la sigue; spec de que borrar la entidad produce el estado marcado, no
una chincheta huérfana; y un caso de la caja de salida para el evento nuevo,
con su verificación de firma.

---

### H10 · Los permisos son de toda la organización: no hay proyecto ni documento

**AutoCAD:** tampoco los tiene —son permisos de carpeta de Windows—, pero
precisamente por eso un CAD de navegador que compite tiene que ser MEJOR aquí, y
es de las pocas cosas por las que un despacho paga sin discutir.

**Valle hoy:** `apps/api/src/modules/organizations/organization-permissions.ts`
es la tabla entera:

```ts
owner: CAD_PERMISSIONS,  admin: CAD_PERMISSIONS,
member: ['cad:view','cad:edit','cad:review','cad:publish'],
viewer: ['cad:view','cad:review'],
```

No hay tabla de miembros por proyecto (`cad_projects` existe; un
`cad_project_members` no) ni ACL por documento. Traducción: **cualquier
`member` de la organización puede editar y publicar CUALQUIER dibujo del
inquilino.** El colaborador externo al que doy de alta para que dibuje la
carpintería puede tocar el proyecto del hospital.

**Dolor real:** contrato a un delineante por tres semanas. O le doy `viewer`
(y no puede dibujar) o le doy la casa entera.

**Coste:** semanas.

**Cómo se construye:** tabla `cad_project_members` (`tenant_id`, `project_id`,
`user_id`, `role`) y un `CadProjectAccessGuard` que se componga con el
`PermissionsGuard` existente: el permiso derivado del rol de organización sigue
siendo el techo, y la pertenencia al proyecto lo acota. Fallo cerrado cuando el
documento no tiene proyecto. Regla de compatibilidad: sin filas de pertenencia,
el comportamiento es el de hoy, para no romper inquilinos vivos.

**Cómo se verifica:** una spec PostgreSQL en la banda de aislamiento —hay tres
ya (`cad-tenant-isolation.pg.spec.ts`, `cad-presence-tenant-isolation.pg.spec.ts`,
`tenant-rls-coverage.pg.spec.ts`)— que afirme 403 al abrir, guardar, comentar y
publicar un documento de un proyecto del que no se es miembro.

---

### H11 · Dos personas pueden pisarse sin que nada lo diga antes

**AutoCAD:** el `.dwl`. Abro un dibujo que Pedro tiene abierto y me lo dice al
abrir, en el título, y me lo da de solo lectura.

**Valle hoy:** la presencia me enseña el CURSOR de Pedro
(`presence.ts:40-53`: `peerId`, `name`, `at`, `cursor`, `viewport`, `guest`) y
eso es todo. El latido **no lleva** si Pedro está editando, qué tiene
seleccionado ni en qué versión del documento está. Y el muelle nace PLEGADO
(`StudioCollaborationLayer.tsx:136` `useState(true)`, por una razón buena y
documentada: abierto se comía los clics del panel derecho y tumbaba 38
goldens). Así que puedo pasarme veinte minutos dibujando sobre la misma lámina
que Pedro sin verlo, hasta el 409 del H4.

**Coste:** un día para el aviso; varios días si se quiere el bloqueo blando.

**Cómo se construye:** añadir dos campos al latido —`editing: boolean` (hay
cambios sin guardar) y `documentVersion: number`— y un aviso NO modal en la
barra de estado: «Pedro está editando este dibujo». Con `documentVersion` en el
latido, además, el 409 deja de ser una sorpresa: en cuanto el latido de Pedro
trae una versión mayor que la mía, puedo avisar ANTES de que el usuario siga
escribiendo. El sobre de red ya está versionado
(`server-presence-channel.ts:49-50`), así que se sube a la versión 2 con
lectura tolerante.

**Cómo se verifica:** ampliar `live-presence.json` con el campo nuevo y una
spec que rechace un latido con `documentVersion` no finito, igual que ya rechaza
un cursor no finito.

---

### H12 · No hay `XOPEN`: no puedo abrir el plano referenciado para arreglarlo

**AutoCAD:** selecciono la xref, `XOPEN`, y el dibujo original se abre en su
propia pestaña. Es lo que hago cuando veo que el estructurista se dejó una capa
encendida y tengo permiso para tocarlo.

**Valle hoy:** no está en el registro. Lo comprobé contra
`engine/command-manifest.ts`: `XREF`, `XATTACH`, `XBIND`, `XCLIP`,
`EXTERNALREFERENCES`, `REFEDIT`, `REFSET`, `REFCLOSE` sí; `XOPEN` no. Y el
`sourceId` para abrirlo está en la referencia (`assetId` + `revision`), así que
falta sólo la orden.

**Coste:** horas.

**Cómo se construye:** un comando `XOPEN` que designe una inserción, resuelva su
referencia y emita una petición de anfitrión `{kind:"open-document",
documentId}` que el estudio atienda con `window.open('/studio/<id>')`. Mismo
reparto que PLOT.

**Cómo se verifica:** caso en `xrefs.spec.ts` de que designar una inserción que
no es xref lo dice y no abre nada; golden que afirme la navegación.

---

### H13 · Dos sistemas de comentarios y dos motores de diff conviviendo

**Valle hoy:** en el mismo estudio hay:

- `CadCollaborationPalette.tsx` → escribe hilos en
  `document.collaboration.threads` (dentro del documento), con
  `addCadReviewThread`/`resolveCadReviewThread` de `cad-collaboration.ts`.
- `StudioCollaborationLayer.tsx` → escribe en `cad_comments` del servidor por
  `reviewsRepository.comments`.

Son dos superficies que no se ven entre sí. Un comentario que el cliente deja
por el enlace de revisión va a la tabla; un comentario que el arquitecto escribe
en la paleta va al documento. Nadie los junta.

Y lo mismo con el diff: `cad-collaboration.ts` `diffCadDocuments`
(por rutas de propiedad) vive en la paleta, mientras
`compare-documents.ts` `cadCompareDocuments` (dos pasadas, firma normalizada,
separación geometría/propiedad) —el bueno, el que la ESCALERA presume— sólo lo
usa un comando que no puede ejecutarse (H1).

**Coste:** varios días.

**Cómo se construye:** declarar `cad_comments` como la única fuente y dejar
`document.collaboration.threads` en modo lectura de compatibilidad (los hilos
persistidos no se borran ni se renombran: son identificadores persistidos). La
sección «Comments & markups» de la paleta pasa a consumir `useCadComments`. Y
`diffCadDocuments` se retira a favor de `cadCompareDocuments` en cuanto la
paleta pueda pedirle al servidor la versión contra la que comparar (H3).

**Cómo se verifica:** una spec de frontera que falle si un componente nuevo
importa `addCadReviewThread`, al estilo de las que ya vigilan la frontera de
producto DWG.

---

### H14 · La paleta de colaboración está en INGLÉS

Regla de la casa: «Spanish es-MX in new copy». La paleta que un despacho
mexicano abre para revisar dice, textualmente:

- `CadCollaborationPalette.tsx:547` — «Comments & markups»
- `:541` — «Apply atomic merge»
- `:562-563` — «Comment on …» / «Drawing-level comment»
- `:572` — «Assign to»
- `:582-584` — «Cloud» / «Arrow» / «Note»
- `:592` — «Add»
- `:109` y `:213` — etiqueta por defecto del enlace: «Authenticated design review»
- `CadXrefPalette.tsx:84-85` — «EXTERNAL REFERENCES» / «N linked»
- `:93`, `:108` — «Asset / model», «Revision»
- `:149-150`, `:190` — «Attachment», «Overlay», «Attach tenant Xref»,
  «Resolving tenant asset…»

**Coste:** horas. **Cómo se verifica:** ampliar la spec del sistema de diseño
(`components/ui/design-system.spec.ts`) con una regla que barra las paletas CAD
buscando cadenas de interfaz en inglés, con lista de excepciones escrita para
los nombres de comando (que en AutoCAD son en inglés a propósito).

---

## 3 · Defectos del código, con fichero y línea

### D1 · Preguntar si una xref cambió ENSUCIA el documento y gasta un deshacer

**Dónde:** `apps/web/src/components/cad/editor/Layout3DEditor.tsx:5454-5498`
(`compareProfessionalXref`), vía `apps/web/src/lib/cad/cad-xrefs.ts:137-142`
(`markCadXrefStatus`) y `apps/web/src/lib/cad/xref/xref-workflow.ts:252-273`
(`cadXrefStatusCommands`).

**Qué pasa:** `markCadXrefStatus` estampa siempre
`checkedAt: new Date().toISOString()`, que se escribe como `lastCheckedAt`. El
documento resultante nunca es idéntico al de entrada, así que la guarda de
`commitBlockMutation` (`Layout3DEditor.tsx:4999`, `if (mutated === checkpoint)`)
no dispara nunca y se ejecutan `recordHistoryDocument(checkpoint)` y
`markDirty()` (`:5008` y `:5029`). Comprobar la frescura de una referencia —una
operación de LECTURA— produce un paso de deshacer y encola un autosave.

**Por qué importa:** en un despacho con dos personas en el mismo plano, uno
comprobando sus seis xrefs genera seis escrituras CAS que compiten con el
trabajo del otro y producen 409 que nadie provocó dibujando. Y el
`Ctrl+Z` del usuario se come una operación que él no hizo.

**Arreglo:** separar la INSPECCIÓN de la MARCA. Una
`inspectCadXrefFreshness(document, xrefId, snapshot): CadXrefVersionComparison`
pura, que no emite comandos, para el botón «Comparar»; y reservar
`markCadXrefStatus` para el cambio de estado REAL (`missing`, `denied`,
`unloaded`) — y aun ahí, omitir el comando cuando `status` y `error` no cambian.

---

### D2 · Los puntos de control se guardan DENTRO del documento: hasta 13× el tamaño

**Dónde:** `apps/web/src/lib/cad/cad-collaboration.ts:463-480`
(`createCadVersion`).

```ts
const snapshot: CadVersionSnapshot = {
  ...,
  document: structuredClone({ ...document, collaboration: undefined }),
};
... versions: [...state.versions.filter(...), snapshot].slice(-12)
```

**Qué pasa:** cada punto de control mete una copia COMPLETA del dibujo dentro
del propio dibujo, hasta doce. Un documento de 1 MB con doce puntos de control
pesa ~13 MB, y ese peso viaja en CADA guardado CAS, en cada autosave, en cada
carga y en el journal de recuperación. El presupuesto publicado en
`docs/cad/evidence/document-limits.json` (20 000 entidades sostenidas) se mide
sobre el dibujo, no sobre el dibujo multiplicado por trece.

**Por qué importa:** un usuario que use la función como está etiquetada
—«Checkpoint», un botón que invita a pulsarlo— degrada su propio guardado hasta
cruzar el umbral de archivo comprimido (`CAD_DOCUMENT_ARCHIVE_THRESHOLD_BYTES`)
y, con un plano grande, hasta el límite del documento. Y todo ello duplicando un
historial que el servidor YA guarda gratis en `cad_document_versions` (H3).

**Arreglo:** el punto de control deja de embeber el documento y guarda sólo
`{ id, label, createdAt, createdBy, contentHash, casVersion }`, apuntando a la
fila de `cad_document_versions`. Hidratar cuando alguien lo abre, por
`versionsRepository.get`. Los campos persistidos no se renombran: `document`
pasa a opcional y se lee si está (documentos ya guardados), no se escribe nunca
más.

---

### D3 · La resolución de una xref por alias falla en silencio con más de 200 documentos

**Dónde:** `apps/web/src/lib/cad/legacy/layout-http-adapter.ts:302-313`
(`resolveDocumentId`).

```ts
const page = await v1<{ items: DocumentSummary[] }>("/v1/cad/documents?limit=200");
const row = page.items.find((item) => item.model === model && (item.revision ?? "A") === revision);
if (!row) return null;
```

`200` es el tope duro del contrato (`apps/api/src/modules/cad/dto/cad.dto.ts:44`,
`@Max(200)`) y aquí **no hay paginación**: no se usa `offset`, no hay bucle.

**Qué pasa:** en un inquilino con más de 200 documentos, un xref cuyo destino
caiga fuera de la primera página resuelve `null`. `fetchCadXrefSnapshot`
(`Layout3DEditor.tsx:5413-5417`) recibe entonces un 404 y lanza «Referenced
tenant CAD asset is missing», y el editor marca la referencia como `missing`
(`:5486`). El dibujo está ahí, con permisos correctos, y el producto dice que no
existe.

**Por qué importa:** es exactamente el fallo que aparece cuando el despacho
crece, es decir, cuando el cliente ya pagó. Y es indistinguible de un borrado
real: el mensaje es el mismo.

**Arreglo:** paginar con `offset` hasta encontrar o agotar, con un tope
declarado; o mejor, añadir al contrato un filtro `?model=&revision=` que resuelva
en el servidor con índice. Mientras tanto, distinguir en el mensaje «no está en
las primeras 200» de «no existe» — un `missing` que miente es peor que un error
que explica.

Bonus del mismo módulo: `documentIdCache` (`:273`) nunca se invalida al
renombrar un documento, y cada resolución sin caché lista 200 documentos, así
que abrir un dibujo con seis xrefs son seis listados completos.

---

### D4 · El motor de resolución de conflictos CAS no tiene ningún llamador de producto

**Dónde:** `apps/web/src/lib/cad/cad-conflict-resolution.ts:137`
(`planCadConflictResolution`).

**Qué pasa:** sus únicos llamadores son su propia spec y
`scripts/cad/review-concurrency-merge.mts`, que es el generador del artefacto de
evidencia. El editor (`Layout3DEditor.tsx:13124-13143`) resuelve el 409 con un
`toast.error` y un enclavamiento del autosave.

**Por qué importa:** más allá del hueco de producto (H4), es un problema de
INTEGRIDAD de la evidencia. `docs/cad/evidence/review-concurrency.json` declara
en `method.semanticMerge` que «la fusión del 409 NO es una copia: es
`planCadConflictResolution` **del editor**». Es verdad que es el módulo del
editor; no es verdad que el editor lo ejecute. La fila `review.concurrency` de
la rúbrica cobra 2 puntos por un camino que ningún usuario puede recorrer. Bajo
la regla 1 de cimientos —«ningún módulo cuenta por existir […] un subsistema sin
importador fuera de sí mismo no está implementado»— esto merece decisión del
titular: o se cablea (H4), o la redacción de la evidencia dice «el motor que el
editor usará», no «del editor».

---

### D5 · El selector Cloud/Arrow/Note no dibuja nunca una nube

**Dónde:** `apps/web/src/components/cad/palettes/CadCollaborationPalette.tsx:108`
(estado), `:196` (se guarda `markup: { kind, color: "#f43f5e" }`), `:576-585`
(el `<select>`), `:607` (el único consumo).

**Qué pasa:** el usuario elige «Cloud», el valor se persiste en el hilo del
documento y lo único que ocurre es que en la lista aparece la palabra «cloud».
Lo verifiqué: `grep -rn "\.markup"` sobre todo `apps/web/src` da tres hits, los
tres en este mismo archivo. Ninguna nube, ninguna flecha, ninguna nota llega
nunca al lienzo.

**Por qué importa:** viola fix-or-hide directamente. Un control que ofrece tres
formas de marcar el plano y no marca ninguna es una promesa incumplida en la
superficie, que es justo lo que la regla 3 de cimientos prohíbe. Además el color
`#f43f5e` es un hex suelto fuera de `globals.css`, contra la regla de oro del
sistema de diseño (aunque aquí es discutible: es dato del hilo, no marca).

**Arreglo:** o el `markup` genera geometría real —`REVCLOUD` ya existe y sabe
dibujar la nube; bastaría con emitir el comando sobre la envolvente de la
entidad comentada— o el `<select>` se retira hasta que la genere.

---

### D6 · `versionsRepository` y `blocksRepository` son código muerto

**Dónde:** `apps/web/src/lib/cad/repositories/versions.ts` y
`apps/web/src/lib/cad/repositories/blocks.ts`.

Ambos exportan un repositorio contra el SDK generado, ambos están re-exportados
en `repositories/index.ts`, y ninguno tiene un solo consumidor. La biblioteca de
bloques se usa de verdad, pero por la puerta de compatibilidad
(`legacyCadFetch("cad-blocks")`, `Layout3DEditor.tsx:1660`), no por ésta.

**Por qué importa:** dos puertas a la misma tabla, y la canónica es la que nadie
usa. Cuando alguien toque el contrato de bloques, actualizará el SDK y el
repositorio muerto, y el producto seguirá hablando por la otra puerta sin que
ningún gate lo note.

**Arreglo:** o el editor migra a `blocksRepository` (y `legacyCadFetch` pierde
la rama `cad-blocks`), o el repositorio se borra. `versionsRepository` no se
borra: se cablea (H3).

---

## 4 · La apuesta ganadora

> **La referencia externa VIVA del inquilino: el plano del estructurista cambió
> hace cuatro minutos, mi lámina me lo dice sola, con las nueve diferencias
> marcadas en nubes de revisión y un botón para recargar.**

Por qué ésta y no otra:

**AutoCAD estructuralmente no puede.** Sus xrefs son ARCHIVOS en un disco de
red. Lo máximo que puede hacer es mirar la marca de tiempo cada
`XNOTIFYTIME` minutos y sacar un globo que dice «un archivo de referencia ha
cambiado» — sin decir cuál cambió de verdad, sin decir QUÉ cambió, y sin poder
decírtelo cuando tú no estás mirando. Recargas a ciegas y luego buscas a ojo
qué se movió. Autodesk lleva veinte años sin poder mejorarlo porque el sistema
de archivos no le da más.

**Valle SÍ puede, y las cuatro piezas ya están construidas y probadas.** Las
xrefs de Valle no son archivos: son documentos de la misma base de datos, del
mismo inquilino, con versión CAS monótona.

1. El servidor ya publica `design.document.saved` por la caja de salida
   (`cad-documents.repository.ts:401`), con firma HMAC, reintentos y
   `Idempotency-Key`.
2. Ya hay un canal SSE por documento que cruza máquinas y se reconecta con
   backoff (`collab/server-presence-channel.ts`, evidencia en
   `docs/cad/evidence/live-presence.json`).
3. Ya existe `compareCadXrefVersion` (`cad-xrefs.ts:149`), que no dice «cambió»:
   dice qué entidades se añadieron, cuáles se modificaron y cuáles
   desaparecieron, comparando la proyección vieja con la nueva.
4. Ya existe `compare-revision-clouds.ts`, que convierte esas diferencias en
   nubes de revisión sobre tres capas con nombre.

Lo que falta es el cable: una lectura inversa en el servidor —qué documentos
declaran a éste en `externalReferences[].assetId`— y el reparto del aviso por el
canal que ya existe. Eso es días, no meses, y convierte cuatro subsistemas
probados en el único flujo que un despacho no puede dejar de usar.

**La frase de venta, que es lo que decide un cambio de suscripción:**
en AutoCAD me entero de que la cimentación cambió cuando ploteo mal. En Valle me
entero mientras dibujo, con las nueve diferencias marcadas, sin salir del plano
y sin abrir el archivo de nadie.

Y hay un segundo movimiento que sale gratis del mismo cable: el enlace de
revisión (§1.2) apunta a un documento vivo, no a un PDF exportado. El cliente
que abrió el enlace la semana pasada ve HOY la versión de hoy. Sumado a la
lámina en espacio papel (H8), eso es «el plano del proyecto vive en una URL que
nunca caduca y siempre está al día» — que es una frase que AutoCAD no puede
decir con un `.dwg` en una carpeta.

**Requisito previo, y por eso H1 encabeza la lista:** nada de esto se sostiene
si adjuntar la referencia exige teclear un UUID. El catálogo del inquilino no es
una comodidad; es la puerta por la que entra la apuesta entera.

---

## 5 · Resumen para el titular

| # | Hueco | Severidad | Esfuerzo |
|---|---|---|---|
| H1 | Sin catálogo del inquilino: xref/ADCENTER/COMPARE inservibles en producción | bloqueante | un día |
| H2 | Sin aviso de xref cambiada; comprobarla ensucia el dibujo | bloqueante | varios días |
| H3 | Historial CAS invisible (`versionsRepository` sin consumidores) | alta | un día |
| H4 | El 409 no ofrece fusionar/recargar/sobrescribir | alta | varios días |
| H5 | Paletas de herramientas en `localStorage`: no se comparten | alta | varios días |
| H6 | Bloque de biblioteca redefinido no propaga a otros dibujos | alta | un día |
| H7 | ETRANSMIT manda un `.json` sin imágenes ni DXF | alta | varios días |
| H8 | El invitado sólo ve espacio modelo, nunca la lámina | alta | varios días |
| H9 | Comentarios sin respuesta, sin edición y sin notificación | alta | varios días |
| H10 | Permisos sólo de organización: no hay proyecto ni documento | media | semanas |
| H11 | La presencia no dice quién está editando ni en qué versión | media | un día |
| H12 | Falta `XOPEN` | media | horas |
| H13 | Dos sistemas de comentarios y dos motores de diff | media | varios días |
| H14 | Paletas de colaboración y de xrefs en inglés | baja | horas |

Defectos: **D1** (compare ensucia), **D2** (checkpoints embebidos, 13× tamaño),
**D3** (xref `missing` falso con >200 documentos), **D4** (evidencia de
concurrencia sobre un camino sin llamador de producto), **D5** (markup que no
dibuja), **D6** (dos repositorios muertos).

Ninguna de estas conclusiones es «nunca». Todas son «todavía no», y la mitad
—H1, H3, H6, H12, H14 y los seis defectos— caben en una sola ola.
