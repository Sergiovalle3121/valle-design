# Auditoría 21 · La lente de los modos de fallo

> **Qué se auditó aquí:** lo que pasa cuando algo se rompe. Se cae la red a
> media tarde. El fichero es enorme. Dos personas tocan lo mismo. El navegador
> se queda sin memoria. Y la quinta, que es la más frecuente de las cinco y la
> que ningún informe llama por su nombre: **el usuario se equivoca**.
>
> No es la lente del rendimiento (informe 17), ni la de la colaboración
> (informe 11), ni la del backend (13). Es la lente de la **degradación**: no
> «cuánto tarda» ni «qué falta», sino **qué queda en pantalla y en disco cuando
> el camino feliz se acaba**, y si lo que queda le devuelve al arquitecto su
> trabajo o le devuelve un registro de depuración.
>
> Fecha: 2026-09-05. Árbol inspeccionado: `/home/user/valle-design` en el
> estado de esa fecha.

---

## Nota metodológica

Tres reglas antes de escribir una línea, por la regla de la casa «ningún claim
sin evidencia»:

1. **Nada de «falta X» sin haber buscado X.** Este árbol es enorme y la
   tentación de declarar ausente lo que ya está construido es constante. En
   esta lente esa tentación era peor que en ninguna otra: entré esperando
   encontrar un CAD web sin red de seguridad y me encontré con un diario de
   recuperación con carriles por pestaña, hashes y poda; con un clasificador de
   fallos de guardado de siete casos escrito en español humano; con un guardián
   del contexto WebGL perdido; y con una matriz ejecutable de 34 flujos que
   declara, uno por uno, qué hace el producto sin red. **Media docena de huecos
   que traía apuntados de memoria no existen.** Están en la sección 1, con
   fichero, porque el crédito también necesita evidencia.
2. **Ninguna cifra del marcador se copia.** El estado del producto lo computa
   `node scripts/cad/rubric.mjs` con sus dos denominadores. Este informe
   **enlaza**; no reescribe la puntuación ni propone moverla a mano. Lo que sí
   propone (§5) son criterios nuevos, que es lo que un informe puede aportar a
   una rúbrica sin falsearla.
3. **Lo parcial se dice «todavía no».** Casi todo lo de aquí está a medio
   construir y la mitad construida está bien construida. Eso no es un cero.

Y una cuarta, propia de esta lente: **medir, no razonar**. Dos de los tres
hallazgos que encabezan el informe salen de una medición, no de leer código.
El guion está en
`/tmp/claude-0/-home-user/a149b410-9d4f-511f-86c3-0187f8156e11/scratchpad/hist.mjs`
y copia **verbatim** dos funciones del árbol —el estimador de bytes de
`canonical-history.ts` y el generador de corpus denso de
`dense-editing-harness.ts`— para poder correrlas en Node sin montar el editor.
Los números de §2·H1 son de esa corrida, en esta máquina, y se dicen con la
máquina delante como manda la casa.

### Qué cubren ya los otros veinte, para no repetirlos

Lo comprobé con `grep -ril` sobre `docs/execution/auditoria-fable/*.md`:

| Término | Informes que lo tocan |
|---|---|
| `offline` / `sin conexión` | 03, 14, 20 |
| `409` / conflicto | 05, 11, 13, 14, 15, 19 |
| `autosave` | 11, 13, 19 |
| `recuperaci` | 07, 11, 14, 15, 16 |
| `concurren` | 11, 13, 17, 19 |
| `AbortController` | **ninguno** |
| «fuera de memoria» | **ninguno** |

Los solapes reales y cómo los trato:

- **Informe 11 (colaboración)** posee el terreno de «dos personas»: H4 (el motor
  de fusión CAS no tiene llamador), H11 (nadie avisa antes de pisarse), D4 (el
  resolutor de conflictos es código muerto). **No lo repito.** Lo que añado es
  la concurrencia que NO es entre dos personas sobre un dibujo: dos pestañas y
  una versión de IndexedDB (§3·D1), y la biblioteca de bloques del inquilino,
  que sí pierde escrituras y nadie ha mirado desde ese ángulo (§2·H7).
- **Informe 14 (frontend)** tiene H5 («abrir el dibujo sin red») y §4.3 («el
  editor es lo único del estudio sin `ErrorBoundary`). Los doy por buenos y los
  extiendo con lo que a esa frontera le falta HACER cuando atrape (§2·H11), y
  con lo que la pantalla de apertura caída debería ofrecer y no ofrece (§2·H5).
- **Informe 17 (rendimiento)** tiene H13 (la prueba de fuga cubre 10k y ninguno
  de 100k) y H14 (techo duro de 100.000). Mi lente no mide velocidad: mide qué
  pasa **al cruzar** ese techo, que es distinto y no está mirado (§2·H2, §2·H3,
  §2·H10).
- **Informe 13 (backend)** tiene §3.5 (no hay cuota por organización). Yo miro
  el otro lado del mismo muro: el cliente que choca contra un límite del
  servidor y recibe un mensaje que le dice que vuelva a intentarlo (§2·H2).

---

## Veredicto

**Valle Design tiene la mejor infraestructura de fallo que he visto en un
producto de este tamaño, y una clasificación de errores que la desperdicia.**

La parte de abajo está construida con criterio de ingeniero de sistemas: el CAS
es un `UPDATE … WHERE version = ?` atómico de verdad, no un leer-y-escribir; el
diario de recuperación tiene carril por pestaña en `sessionStorage`, códec
gzip fuera del hilo, hash SHA-256 verificado al leer y poda por edad, por
carril y global; el archivo comprimido está defendido contra bomba de gzip con
un `gunzip` acotado por bytes; el `webglcontextlost` lleva su `preventDefault()`
—la línea que todo el mundo olvida y sin la cual no hay restauración posible—;
y hay una matriz ejecutable de 34 flujos que dice, uno a uno, si funciona sin
red, si degrada y reintenta, o si exige el servidor.

Y encima de todo eso hay **una escalera de decisión que sólo tiene dos
peldaños**: «conflicto» y «todo lo demás». Un `400 Bad Request` —el documento
superó las 100.000 entidades y **no va a caber nunca**— llega a la misma rama
que un `500` pasajero y sale por pantalla como *«El servidor no aceptó el
guardado… espera un momento y vuelve a pulsar Guardar»*. El usuario esperará y
volverá a pulsar Guardar el resto de la tarde.

Los cinco huecos que de verdad importan, ordenados por lo que le cuestan a un
arquitecto real:

1. **Deshacer se queda en UN paso en un plano denso y nadie se lo dice.**
   Medido: a 100.000 entidades un checkpoint estima 48,6 MiB contra un
   presupuesto de 32 MiB, así que la pila se poda hasta el mínimo de uno. A
   20.000 —el plano de todos los días— caben tres. El indicador que lo diría
   existe y está detrás de `?cadDiag=1`.
2. **El error permanente se comporta como transitorio.** Ningún camino
   distingue «esto no va a funcionar nunca» de «esto puede funcionar en diez
   segundos», y el mensaje por defecto invita a reintentar lo imposible.
3. **ARRAY no tiene techo.** `500 × 500` sobre diez objetos son 2.500.000
   entidades. No hay confirmación, no hay tope, no hay cancelación, y el
   documento resultante ya no se puede guardar. AutoCAD lleva treinta años
   preguntando «va a crear N elementos, ¿continúo?».
4. **El mejor texto de fallo del producto dura doce segundos.** Los tres
   párrafos de `describeCadSaveFailure` —qué pasó, qué pasa con tu trabajo, qué
   puedes hacer— viajan en un toast que se va, y lo que queda es una etiqueta
   de cinco palabras con el resto en un `title` que en una tableta no existe.
5. **«Dibujar funciona sin red» es cierto sólo para los comandos que ya se
   cargaron.** Hay 108 módulos de comandos en carga diferida y el service
   worker no precarga ninguno.

Ninguno de los cinco es un problema de motor. Cuatro son de un día. El primero
es de una semana y es el que decide si un despacho se queda.

### Lo que hay que decir antes que nada

`apps/web/e2e/real/errores-en-espanol.spec.ts` provoca de verdad —contra la API
real y PostgreSQL— las cinco desgracias del día de un arquitecto y afirma sobre
cada una tres cosas: que hay mensaje, que el mensaje es humano y **que hay
salida**. Esa tercera aserción, escrita como código ejecutable y corrida en CI,
es más disciplina de degradación de la que tiene la mayoría del software que ya
factura. Lo que este informe dice es que la vara existe y que hay cinco sitios
donde el producto todavía no la pasa: no que falte la vara.

---

## 1 · Lo que ya está construido y está bien

Con fichero, porque en un árbol de 438.000 líneas lo fácil es declarar ausente
lo que está.

### 1.1 · El guardado sabe fallar en español, y sabe QUÉ decir

`apps/web/src/components/cad/document-lifecycle/save-failure.ts`. Siete casos
(`offline`, `session`, `read-only`, `permission`, `too-large`, `rate-limit`,
`server`), cada uno con título y con un cuerpo que responde tres preguntas en
este orden: qué pasó, **qué pasa con tu trabajo**, qué puedes hacer. La segunda
es la que nadie escribe y es la única que el usuario tiene en la cabeza. El
módulo es puro, no importa el SDK, identifica el error por su FORMA (`status`,
`code`, `body.details.reason`) y por eso se prueba en Node.

El caso `read-only` merece mención aparte: cuando el periodo gratuito termina,
el mensaje dice que los planos siguen siendo suyos y que puede exportarlos.
Es la regla de oro del producto dicha en el momento exacto en que al usuario le
toca oírla.

### 1.2 · El cuarto momento: que vuelva la red

`apps/web/src/components/cad/document-lifecycle/connectivity.ts`. Cuatro oyentes
—`beforeunload`, `pagehide`, `visibilitychange`, `online`— y el comentario de
cabecera explica por qué el cuarto es el que faltaba: *«volver la red NO es una
acción de la persona, y ése es justo el caso que se perdía: nadie va a tocar
nada porque nadie está mirando»*. Está enchufado
(`Layout3DEditor.tsx:13344`) y probado sin navegador con anfitriones inyectados
(`connectivity.spec.ts`). `beforeunload` sólo frena la salida **si de verdad
hay algo sucio**, que es la diferencia entre avisar y molestar.

### 1.3 · El diario de recuperación, con carriles

`apps/web/src/lib/cad/cad-recovery.ts` y `cad-recovery-journal.ts`. El carril
vive en `sessionStorage` —una pestaña, sobreviviendo a recargas, sin
compartirse—, y el comentario razona por qué `localStorage` no habría arreglado
nada. El payload va comprimido por un worker, con `sha256` que **se verifica al
leer**: si no cuadra, el registro se descarta y el bucle sigue con el
checkpoint anterior, en vez de devolverle a la persona un plano que no es el
suyo. Poda por edad (7 días), por carril (3) y global (24), con modo agresivo
cuando `navigator.storage.estimate()` dice que no cabe.

### 1.4 · El CAS es atómico de verdad

`apps/api/src/modules/cad/cad-documents.repository.ts:683-714`. Un solo
`UPDATE … SET cad_document_version = cad_document_version + 1 WHERE id = ? AND
cad_document_version = ?`, y `affected !== 1` es el conflicto. No hay
leer-comparar-escribir, así que dos escritores que leyeron la misma versión no
pueden ganar los dos. La mitad de los productos que dicen tener CAS tienen un
`SELECT` seguido de un `UPDATE`.

### 1.5 · El contexto WebGL perdido tiene guardián

`apps/web/src/components/cad/viewport/webgl-context-guard.ts`. Con el
`preventDefault()` sobre `webglcontextlost` —sin el cual el navegador **nunca**
emite `webglcontextrestored`— y con la razón escrita al lado. El síntoma que
evita está bien descrito en el propio fichero: el lienzo congelado con el
último fotograma, el resto de la interfaz respondiendo, y la persona siguiendo
a dibujar sobre un plano que no ve. Enchufado en `Layout3DEditor.tsx:7638`, con
telón (`setWebglUnavailable("contexto-perdido")`) y rearranque del bucle.

### 1.6 · La matriz de capacidades sin red es ejecutable y no se adorna

`apps/web/src/app/(sw)/offline-capability-matrix.ts`, 34 flujos con tres
veredictos posibles. El reparto: 7 `funciona-sin-red`, 4 `degrada-y-reintenta`,
23 `requiere-backend`. Que veintitrés de treinta y cuatro digan «requiere
backend» es exactamente lo que hace creíbles a los otros once. Cada fila lleva
sus endpoints, sus ficheros de evidencia, el porqué, **y qué nota el usuario**.
Los `degrada-y-reintenta` están obligados a nombrar quién dispara el reintento,
y ese nombre tiene que existir en el árbol.

### 1.7 · Los límites del documento están medidos, no adivinados

`docs/cad/evidence/document-limits.json`. Máquina declarada (Ryzen 5 5500U, 7,4
GB, con agentes vecinos), navegador declarado, `jsHeapLimitBytes` incluido. El
veredicto publica `largestSustainedEntities: 100000`,
`largestSustainedDocumentBytes: 24.669.745`, `largestSustainedCheckpointMs:
1864,9` y —la cifra que más me gusta de todo el repositorio—
`worstCaseLossWindowMs: 16.864,9`: **cuánto trabajo se pierde como máximo si la
pestaña muere**. Casi nadie publica esa cifra porque casi nadie la ha calculado.

### 1.8 · La bomba de gzip está defendida y el archivo se verifica

`apps/api/src/modules/cad-documents/cad-document-storage.ts:114-190`.
`gunzipBounded` corta por bytes **mientras descomprime**, no después; el
`sha256` y el tamaño comprimido se comparan contra el manifiesto guardado antes
de tocar el JSON; y un desajuste de integridad da `503`, no `400`, porque no es
culpa del cliente. Los tres detalles son correctos y los tres se hacen mal
normalmente.

### 1.9 · Las pruebas de desgracia corren en CI de verdad

Esto lo verifiqué porque lo daba por perdido. `.github/workflows/ci.yml:893-946`
—el paso «Playwright E2E (goldens + performance + full-stack real)»— corre la
suite completa con `E2E_REAL_API: "1"`, así que **sí** se ejecutan en cada
corrida `cad-offline-multitab.spec.ts` (red cortada de verdad, mismo plano en
dos pestañas, muerte del renderizador), `cad-conflict-per-document.spec.ts` (el
409 lo emite PostgreSQL), `cad-recovery-lanes.spec.ts` y
`errores-en-espanol.spec.ts`. No son evidencia de escaparate: son gate.

### 1.10 · El motor no se cuelga, y un módulo que no llegó no se memoiza como fallido

`command-engine.ts:370-384`: un comando que lanza en `step` no deja el motor con
un prompt vivo; se reanuda el estado y el mensaje sale por el renglón.
`lazy-commands.ts:212-215`: la promesa de un módulo que falló se **borra** del
memo, con la razón escrita —*«una red que se cayó a media descarga es el caso
típico»*—, de modo que volver a teclear la orden vuelve a intentarlo. Y
`engine/index.ts:107-125` no finge un «Hecho» vacío mientras tanto: dice que el
comando aún se está trayendo.

### 1.11 · AUDIT, PURGE y RECOVER preguntan antes de tocar

`engine/commands/manage-audit.ts`. Contar, mostrar, **preguntar**, y sólo
entonces tocar el documento; con la opción por defecto en **No**. El comentario
lo argumenta mejor de lo que yo lo haría: *«un AUDIT que arregla en silencio es
peor que uno que no arregla nada, porque nadie sabe qué perdió al deshacer»*.
Eso es diseño de seguridad de datos, no de interfaz.

---

## 2 · Los huecos, por lo que más duele

### H1 · Deshacer se queda en UN paso en un plano denso, y nadie lo dice

**Lo que la configuración promete.** `Layout3DEditor.tsx:2827-2832` y
`:3749-3752` construyen la historia canónica con `maxEntries: 80` y
`maxRetainedBytes: 32 * 1024 * 1024`. Ochenta pasos de deshacer es una promesa
razonable y es la que un dibujante asume.

**Lo que la aritmética entrega.** `canonical-history.ts:243-256` poda mientras
`retainedBytes > maxRetainedBytes`, y `:154` valora cada entrada con
`defaultEstimateBytes` (`:47-79`), un recorrido del documento que cobra 16 + 2·n
por cadena, 8 por número, 32 + 16·k por objeto. Corrí ese estimador —copiado
verbatim— sobre el corpus denso de `e2e/fixtures/dense-editing-harness.ts`,
también copiado verbatim:

```
entidades: 100 000   JSON: 13.314.909 bytes   estimateBytes: 48,6 MiB
presupuesto: 32,0 MiB   ->   ¿cabe UN checkpoint? NO

  5 000 entidades ->  2,4 MiB  ·  pasos que caben en 32 MiB: 13
 10 000 entidades ->  4,9 MiB  ·  pasos que caben en 32 MiB:  6
 20 000 entidades ->  9,7 MiB  ·  pasos que caben en 32 MiB:  3
 50 000 entidades -> 24,3 MiB  ·  pasos que caben en 32 MiB:  1
100 000 entidades -> 48,6 MiB  ·  pasos que caben en 32 MiB:  1
```

(Máquina: el contenedor de esta sesión, Node v22.22.2. El corpus son 100.000
líneas rectas sin texto, sin hatch, sin cotas y sin bloques —el más barato
posible—, así que estas cifras son un **suelo**: el plano real de un despacho
estima por encima.)

Ochenta no es ochenta. A 20.000 entidades —la escala de
`docs/cad/evidence/cad-plan-benchmark-20k.json`, o sea el plano de todos los
días— son **tres**. A partir de unas 50.000 es **uno**: el suelo que
`enforceBudget` protege a propósito con `this.undoItems.length > 1`, y con buen
criterio, porque expulsar el checkpoint recién grabado convertía «mover 100.000
entidades» en una edición sin deshacer.

**Por qué duele tanto.** El fallo no es que haya un tope: todo CAD web tiene
uno. El fallo es que **es invisible y se disfraza de otra cosa**. La única
señal que recibe el usuario es que el botón Deshacer se apaga, y un botón
Deshacer apagado significa, en todos los programas del mundo, «no queda nada
que deshacer». Aquí significa «se tiró tu historia para no quedarnos sin
memoria». El indicador que lo diría existe —`CadStatusBar.tsx:216-223` pinta
`U{n}/R{n}`— y está encerrado tras `?cadDiag=1`
(`CadDiagnosticsReadout.tsx:66-70`), con el comentario correcto al lado: *«un
arquitecto no puede hacer nada con ninguna de las cuatro»*. Cierto para «Tool:
LINE» y para el contador de entidades. **Falso para la profundidad de
deshacer**, que es lo primero que un dibujante quiere saber antes de intentar
algo arriesgado.

`enforceBudget` ya emite un evento `evict` por cada entrada que tira. Hoy ese
evento sólo llega a `onMetric`. Nadie lo enseña.

**Y hay una consecuencia peor, en el otro extremo.** A escala pequeña el
presupuesto no muerde y el tope real son los 80 pasos… salvo que
`Layout3DEditor.tsx` **no persiste la historia**: `restoreRecoveryCandidate`
(`:4202-4243`) devuelve el documento y llama a `restore(...)`, pero la pila de
deshacer no viaja en el checkpoint. Recuperar tras un cuelgue te devuelve el
dibujo con cero pasos de deshacer. Es defendible; no está dicho en ningún
sitio.

**Cómo se cierra.** Tres piezas, ninguna cara:

1. **Decirlo.** Sacar la profundidad de deshacer del cajón de diagnóstico y
   ponerla en la barra de estado siempre, con la forma en que un dibujante la
   lee: «Deshacer: 3 pasos». Cuando `evict` dispare, un aviso de una sola vez
   por sesión: «Este plano es grande: el historial guarda 3 pasos. Guarda antes
   de una operación grande.» Honesto, accionable, y nunca más de una vez.
2. **Estrechar lo que se retiene.** Hoy cada entrada retiene el **documento
   entero**. Con estructuras persistentes ya hay compartición estructural
   —`sharedTopLevelReferences` existe justo para medirla— pero
   `defaultEstimateBytes` no la aprovecha: cuenta cada `WeakSet` desde cero por
   entrada, así que dos checkpoints que comparten el 99,99 % de las entidades
   cuentan dos veces el 100 %. Estimar por **delta** —lo que cambió respecto a
   la entrada anterior— multiplica por cien la profundidad real sin subir el
   presupuesto ni un byte, que es lo que la casa prohíbe.
3. **Publicar el número.** Añadir a `document-limits.json` un tramo
   `undoDepthByTier`, medido con el mismo arnés que ya publica el checkpoint.
   Un límite medido y publicado deja de ser una sorpresa.

**Peldaño de la escalera:** hoy 2 (enchufado, sin prueba de la propiedad que
importa). Con la profundidad publicada y un gate que afirme «a 20k caben ≥ N
pasos», 5.

---

### H2 · El error PERMANENTE se comporta como transitorio

`describeCadSaveFailure` clasifica 401, 403, 413, 429 y «huele a red». Todo lo
demás —incluido **el 400**— cae en la rama final:

> **No se pudo guardar.** El servidor no aceptó el guardado. Tus cambios siguen
> en este equipo: **espera un momento y vuelve a pulsar Guardar.**

Y el 400 es exactamente lo que devuelve el servidor cuando el documento ya no
cabe. `apps/api/src/modules/cad-documents/cad-document-validation.ts:480-483`:

```ts
if (!Array.isArray(entities) || entities.length > MAX_ENTITIES) {
  throw new BadRequestException(
    `CadDocument admite máximo ${MAX_ENTITIES} entidades.`,
  );
}
```

Lo mismo con `MAX_BLOCKS`, con el esquema no soportado, con ids duplicados, con
`El archivo CAD comprimido excede …`. Ocho o nueve razones distintas, todas
`BadRequestException`, todas permanentes, todas presentadas como «espera un
momento».

**Qué vive el usuario.** Sigue dibujando. El autosave se reprograma en cada
edición (el debounce es de 2 s), así que cada pocos segundos vuelve a intentar,
vuelve a fallar y vuelve a lanzar un toast rojo de doce segundos —o sea, un
toast rojo permanente— mientras la barra de estado dice «Error de guardado ·
cambios pendientes». No hay enclavamiento: el `conflictRegistryRef` de
`Layout3DEditor.tsx:13126-13141` sólo lo hay para el 409, y con razón
explicada. Para el 400 no hay ninguno, y el comentario de al lado —*«a partir
de aquí el autosave deja de reintentar esta misma versión, que el servidor ya
rechazó»*— describe justo la protección que le falta al caso permanente.

**El mensaje que ya existe y no se usa.** El servidor manda la razón en el
cuerpo. `describeCadSaveFailure` **ya sabe leer** `body.details.reason` —lo
hace para distinguir `read_only_after_lapse` del 403 genérico—, así que la
maquinaria está y sólo falta el caso.

**Cómo se cierra (un día).**

1. Añadir la rama `too-many-entities` / `document-invalid` sobre `status === 400`
   en `save-failure.ts`, con el texto que corresponde: *«Este plano superó el
   límite de 100.000 objetos y ya no se puede guardar entero. Divídelo en
   varias láminas o purga lo que no uses (PURGE); mientras tanto tus cambios
   siguen en este equipo y puedes exportarlos a DXF.»* Qué pasó, qué pasa con
   tu trabajo, qué puedes hacer: la misma vara que el módulo ya se impone.
2. Dar al servidor un `code` estable en `details` para cada rechazo permanente,
   para no clasificar por texto.
3. Enclavar el autosave igual que se enclava el conflicto: un fallo permanente
   detiene el reintento automático y deja el botón Guardar como acción
   explícita.
4. `save-failure.spec.ts` cubre hoy 401, 403, 413, 429 y 500 y **no** el 400
   (comprobado: `grep -n "status:" save-failure.spec.ts`). Añadir el caso
   convierte esto en un gate.

---

### H3 · ARRAY no tiene techo: `500 × 500` y el plano deja de poder guardarse

`apps/web/src/lib/cad/engine/commands/modify-array.ts:167-197` valida
**únicamente el límite inferior**:

```ts
if (rows < 1 || cols < 1) return "una matriz rectangular necesita al menos una fila y una columna.";
if (rows * cols < 2)      return "una matriz de un solo elemento no multiplica nada.";
```

No hay tope superior en ninguno de los tres modos (rectangular, polar, de
camino). Un dibujante que quiere 50 columnas y teclea 500 sobre una selección de
diez objetos pide 2.500.000 entidades. Busqué un guardián aguas abajo —en el
anfitrión que aplica el lote, en `entity-commands.ts`, en el reductor— y no
existe: `grep -rn "commands.length >"` no devuelve nada en la ruta de
aplicación.

Lo que pasa entonces, en orden: el lote se construye en el hilo principal y la
pestaña deja de responder; con suerte el navegador la mata y el diario de
recuperación devuelve el trabajo de hace hasta 17 s
(`worstCaseLossWindowMs`); sin suerte la pestaña sobrevive con un documento de
2,5 M de entidades que **ya no se puede guardar nunca** —§H2— y que además
deja el deshacer en un solo paso —§H1—, que resulta que es exactamente el paso
que hace falta.

AutoCAD pregunta desde hace treinta años: *«The number of array elements is
2500000; do you want to continue?»*. No es una cortesía: es el reconocimiento de
que el error de un dígito en un campo numérico es el error más común que comete
un dibujante.

**Cómo se cierra (medio día).** Un umbral en el comando —el mismo número que ya
declara `CAD_DOCUMENT_LIMITS.maxEntities`, que hoy el navegador **ni siquiera
importa** (`grep -rn "CAD_DOCUMENT_LIMITS" apps/web/src` devuelve una única
mención en un comentario)— y una pregunta con el defecto en **No**, igual que la
de AUDIT y PURGE, que ya está escrita y probada en este mismo motor. La regla
se aplica a los tres comandos que multiplican: ARRAY, COPY con múltiple y
DIVIDE/MEASURE con bloque.

---

### H4 · El aviso mejor escrito del producto dura doce segundos

`describeCadSaveFailure` escribe tres párrafos. Salen por `toast.error`
(`Layout3DEditor.tsx:13151`), y `contexts/ToastContext.tsx:42-46` da a los
errores 12.000 ms. Después, lo único que queda en pantalla es
`CadSaveStatus.tsx:70-81`:

> Error de guardado · cambios pendientes

…con el texto completo en el atributo `title`. Es decir: **en una tableta, y
para cualquiera que se levante a por un café, el mensaje que explica qué pasó
con su trabajo desaparece sin dejar rastro.**

El mismo patrón, y peor, en `CadStatusBar.tsx:264-268`:

```tsx
{saveState.dirty && saveState.recoveryWarning && (
  <span className="text-danger-ink" title={saveState.recoveryWarning}>
    Recovery local en riesgo
  </span>
)}
```

«Recovery local en riesgo» es el estado más peligroso que puede alcanzar este
producto: significa que el almacenamiento local se llenó o que IndexedDB no
responde, o sea que **la copia de seguridad que sostiene todos los demás
mensajes tranquilizadores ya no existe**. Se comunica con cuatro palabras en
tipografía `type-micro` (11 px, el suelo del sistema), en rojo, con el
porqué escondido en un tooltip, y sólo mientras el documento esté sucio: en
cuanto un guardado lo limpia un segundo, el aviso desaparece aunque el problema
siga.

**Cómo se cierra (un día).** Un panel de estado del guardado —no un toast— que
se quede mientras el problema exista, con el texto completo, y con acciones:
«Reintentar», «Exportar a DXF», «Ver detalles». `CadSaveStatus` ya recibe el
`issue` entero; sólo hay que darle sitio donde desplegarse al pulsarlo. Y quitar
la condición `saveState.dirty` del aviso de recovery, que no es un estado del
documento sino de la máquina.

---

### H5 · Abrir el dibujo caído no ofrece ni reintentar ni el borrador local

`apps/web/src/app/studio/[documentId]/page.tsx:57-118` clasifica bien —
`invalid`, `deleted`, `forbidden`, `expired`, `offline`, `error`— y luego pinta
una tarjeta centrada con un mensaje y **un solo enlace: «Volver a proyectos»**.

Dos problemas, uno encima del otro:

1. **No hay «Reintentar».** El único caso en el que un enlace a `/dashboard`
   ayuda es `deleted`. Para `offline` es una broma cruel: el tablero también
   requiere backend (`offline-capability-matrix.ts`, fila `proyectos`:
   `requiere-backend`), así que la salida ofrecida lleva a otra pantalla rota.
   Para `error` —un 500 pasajero, un balanceador reiniciándose— basta con
   volver a pedirlo, y el producto obliga a recargar a mano.
2. **No dice que el trabajo está aquí.** Si esa persona editó ese documento en
   esta máquina en los últimos siete días, hay un checkpoint suyo en IndexedDB
   —posiblemente con trabajo que nunca llegó al servidor— y esta pantalla no lo
   sabe ni lo menciona. `loadCadRecovery(scope)` es una llamada. El informe 14
   ya pidió abrir el dibujo sin red (su H5); esto es la mitad barata de ese
   trabajo: **decirle que su borrador existe**, aunque todavía no se pueda
   abrir sin servidor.

**Cómo se cierra (un día).** Botón «Reintentar» en `offline` y en `error`, con
reintento automático al oyente `online` —el patrón ya existe y está probado en
`connectivity.ts`—, y una línea más cuando `loadCadRecovery` devuelve
candidato: «Tienes cambios sin subir de este plano en este equipo, guardados
hace N minutos. Se subirán en cuanto vuelva la conexión.»

---

### H6 · «Dibujar funciona sin red» es cierto sólo para lo que ya se cargó

La matriz declara, en la fila `dibujar-acotar-modelar`:

> veredicto: `funciona-sin-red` · seNota: **«Nada. Es el único trozo del producto
> donde la red no se echa de menos.»**

Es la única afirmación de las 34 que mi lente puede falsear. Los comandos no
están en el bundle del editor: `engine/lazy-commands.ts` tiene **108** módulos
en `() => import(...)` (contados), y `engine/index.ts:107-125` devuelve, cuando
la implementación aún no ha llegado, *«todavía no terminó de cargar … vuelva a
teclearlo en un instante»*, arrancando la descarga.

Sin red, esa descarga no llega nunca y la frase se convierte en un bucle. Y el
service worker no salva el caso: `service-worker-policy.ts:86-92` precarga
exactamente la página `/sin-conexion`, el manifiesto, dos iconos y las fuentes;
los chunks de `/_next/static/` van por `stale-while-revalidate`, o sea que están
en caché **sólo si esa persona ya usó ese comando en esa máquina**. Quien pierde
el wifi habiendo dibujado con LINE y PLINE tiene LINE y PLINE; el día que
necesite HATCH, ACOTAR o MATCHPROP por primera vez, no los tiene.

No es un defecto de arquitectura —el diferido es correcto y el informe 17
aplaude sus bytes—, es un defecto de **declaración**: la matriz es un
instrumento de honestidad y esta fila dice «nada» donde debería decir «los
comandos que aún no hayas usado en este equipo no llegarán».

**Cómo se cierra (medio día para la verdad, dos días para arreglarlo).**

1. Corregir `seNota` en esa fila. Es lo primero y cuesta una línea.
2. Precargar en el service worker el **núcleo de dibujo** —los módulos de
   `commands/` que sostienen los comandos que la matriz nombra— y declarar la
   lista. Un `warm` en `requestIdleCallback` al abrir el estudio consigue lo
   mismo sin tocar el worker, y el precedente existe:
   `components/cad/prefetch-studio.ts` ya calienta el estudio así.
3. Un gate: la matriz declara qué comandos promete sin red; una prueba corre
   esos comandos con el `Worker`/`import` bloqueado y afirma que responden.

---

### H7 · La biblioteca de bloques del equipo pierde escrituras en silencio

`apps/api/src/modules/cad-documents/cad-blocks.service.ts:240-259`:

```ts
async update(id, dto) {
  const row = await this.findForMutation(id);
  if (dto.definition !== undefined) {
    row.definition = this.safeDefinition(dto.definition);
    row.version = (row.version ?? 1) + 1;      // sube…
  }
  const saved = await this.blocks.save(row);   // …y nadie la compara jamás
}
```

Hay una columna `version`, se incrementa en cada redefinición, y **no se usa
como precondición en ningún sitio**. Dos personas que redefinen el mismo bloque
de la biblioteca del inquilino a la vez: gana la última, sin 409, sin aviso, sin
rastro. El documento CAD tiene CAS atómico (§1.4), los conjuntos de planos
tienen CAS (`cad-sheet-sets.repository.ts:144-176`), la revisión tiene CAS
(`cad-review.repository.ts:162`). La biblioteca compartida —el único recurso del
producto que por definición tocan varias personas— no lo tiene.

El informe 11 miró este mismo objeto desde otro ángulo (su H6: el bloque se
redefine y los otros dibujos no se enteran). Éste es el problema de antes: no
que la redefinición no se propague, sino que **una de las dos redefiniciones no
ocurrió nunca**.

Y al lado, `remove(id)` (`:261-264`) borra una definición de la biblioteca sin
comprobar quién la usa. Un `INSERT` en el plano de un compañero queda apuntando
a nada.

**Cómo se cierra (dos días).** `expectedVersion` obligatorio en el `PATCH` de
bloque, 409 con la versión vigente —el mismo contrato que ya sirven los
conjuntos de planos, copiable literalmente—, y en el borrado, o recuento de
usos con negativa, o borrado lógico con «lo usan N dibujos, ¿continúo?».

---

### H8 · La importación muere a los 45 segundos aunque esté avanzando

`apps/web/src/lib/cad/document-import-client.ts:131-135`:

```ts
const timeout = setTimeout(
  () => finish(() => reject(new Error("La importación excedió 45 segundos."))),
  options.timeoutMs ?? 45_000,
);
```

El worker informa de progreso (`{ type: "progress", progress, stage }`) y el
cliente lo reenvía a la interfaz… **sin tocar el temporizador**. Es un reloj de
pared, no un detector de atasco: da igual que el worker esté avanzando; a los
45 s se tira todo, el worker se termina, no hay importación parcial, no hay
«sigue esperando», y el mensaje culpa al reloj en vez de ofrecer una salida.

Y el número no está calibrado contra nada. `document-import-validation.ts:27`
admite DXF de hasta 12.000.000 bytes, y busqué en `docs/cad/evidence/` un
artefacto que midiera cuánto tarda el DXF legal más grande en la máquina más
lenta que el producto declara soportar: **no existe**. O sea que el corte no es
un presupuesto medido —como sí lo son los de render, checkpoint y documento—
sino un número redondo. En la máquina declarada de `document-limits.json` (un
Ryzen 5 5500U con agentes vecinos) el mismo artefacto mide 2.515 ms sólo para
SERIALIZAR un documento de 100.000 entidades, y 1.070 ms más para comprimirlo;
importar, migrar e indexar uno del tamaño máximo es trabajo de otro orden, y
nadie lo ha cronometrado.

Al lado hay un `AbortSignal` bien cableado —cancelación real, con
`DOMException("AbortError")`— y en el árbol entero sólo hay **nueve** usos de
`AbortController` (`grep -rn "AbortController" apps/web/src | wc -l`), ninguno
en el editor. Es decir: la pieza para «déjame cancelar esto» existe y está
usada en un solo sitio.

**Cómo se cierra (medio día).** Reiniciar el temporizador en cada `progress`
—si hay progreso no hay atasco— y bajar el corte a, digamos, 20 s **sin
progreso**, que es lo que de verdad se quiere detectar. Y donde hoy hay un
rechazo, ofrecer las dos salidas: «Seguir esperando» y «Cancelar». El diálogo
de progreso ya existe (`app/dashboard/import-status.tsx`).

---

### H9 · Nada mira la memoria mientras el producto corre

El producto sabe medir memoria: `lib/cad/benchmark/browser-harness.ts:273-287`
lee `performance.memory.jsHeapSizeLimit` y `navigator.deviceMemory`, y
`e2e/performance/cad-viewport-100k.spec.ts:308-313` publica `usedJSHeapSize`.
Ambos son **instrumentos de medición**, no de producto: `grep -rn
"performance.memory\|deviceMemory"` sobre `apps/web/src` fuera de `benchmark/`
no devuelve nada.

O sea: en marcha, con el plano abierto, **nadie mira el montón**. No hay
muestreo, no hay umbral, no hay degradación, no hay aviso. El techo se descubre
estrellándose contra él, y estrellarse contra él en un navegador es que el
proceso del renderizador muere sin evento y sin `beforeunload`.

Lo que salva la situación —y hay que decirlo— es que el diario de recuperación
está diseñado exactamente para esa muerte: checkpoint a los 3 s y luego cada 15
s (`Layout3DEditor.tsx:4188-4190`), IndexedDB sobrevive al proceso, y la pérdida
máxima está medida y publicada en 16,9 s. La red de seguridad existe. Lo que no
existe es el aviso **antes** de caer.

**Cómo se cierra (dos días).** Un muestreo de `performance.memory` cada pocos
segundos donde el navegador lo expone (Chromium, que es la mayoría del mercado
al que este producto va), tres tramos sobre `usedJSHeapSize / jsHeapSizeLimit`:

- **> 60 %** — acortar el intervalo de checkpoint de 15 s a 5 s. Barato,
  invisible y reduce la ventana de pérdida justo cuando sube el riesgo.
- **> 75 %** — aviso persistente: «Este plano está usando mucha memoria. Guarda
  ahora; puede que el navegador cierre la pestaña.» Con botón Guardar al lado.
- **> 88 %** — degradación declarada: bajar el LOD, purgar la caché de
  teselado, y **decirlo**, porque un producto que se pone borroso sin explicar
  por qué parece roto.

Los tres tramos son honestos: no prometen impedir la caída, prometen avisarla.

---

### H10 · No hay escalera de degradación cuando el plano no cabe

Éste es el hueco conceptual del que cuelgan H2, H3 y H9. Hoy el producto tiene
dos estados: **cabe** y **no cabe**, y el segundo se descubre en el peor
momento posible (al guardar, o al morir la pestaña). Entre uno y otro no hay
nada: ni un aviso al cruzar el 80 % del límite de entidades, ni un
`Objetos: 94.300 / 100.000` en la barra de estado, ni una sugerencia de PURGE
cuando la auditoría ya sabe que hay 12.000 huérfanos, ni una propuesta de
dividir en láminas.

Lo llamativo es que **todas las piezas están**: `AUDIT` sabe contar huérfanos y
duplicados; `PURGE` sabe quitarlos con previsualización; `OVERKILL` sabe fundir
duplicados; el contador de entidades del documento existe
(`cad-native-document-count`, hoy tras `?cadDiag=1`); y el límite es una
constante exportada en `packages/contracts`. Lo único que falta es el hilo que
las une y que el navegador importe la constante que el contrato ya publica.

**Cómo se cierra (tres días).** Un «medidor de salud del plano» en la barra de
estado, visible siempre a partir del 70 % del límite, que abre un panel con lo
que se puede hacer, en orden de rendimiento: purgar (con la cuenta real),
fundir duplicados (con la cuenta real), llevar a xref, dividir en láminas. Es
la conversación que un CAD tiene que saber tener con su usuario antes de
decirle que no.

---

### H11 · El editor sigue sin frontera de error propia — y a la frontera le falta una cosa más

El informe 14 §4.3 ya lo encontró y lo confirmo:
`components/cad/CadStudioHost.tsx:146` y `:163` envuelven la capa de
colaboración y la mensajería con `ErrorBoundary`, con el razonamiento correcto
al lado (*«un comentario con una forma inesperada tumbaba hasta aquí el estudio
entero, dibujo incluido»*), y **el editor no está envuelto**. Un error de
render en 22.000 líneas de componente deja la pantalla en blanco.

Lo que añado desde esta lente es qué debe HACER esa frontera cuando por fin
exista, porque una frontera que sólo pinta «algo salió mal» y ofrece
«Reintentar» —que es lo que hace hoy `components/ui/ErrorBoundary.tsx:78`—
pierde el trabajo igual:

1. **Escribir el checkpoint ANTES de pintar el fallback.** En
   `componentDidCatch` todavía se tiene el documento en las referencias;
   `saveCadRecovery` es una llamada. Sin esto, se pierden hasta 15 s.
2. **Ofrecer la exportación a DXF desde la pantalla de fallo.** El exportador es
   TypeScript en la pestaña y no necesita ni React ni servidor: es la salida que
   convierte una caída en un susto.
3. **Reintentar tiene que recargar desde el checkpoint**, no desde el servidor,
   o el remonte descarta justo lo que la caída no había subido.

Y un defecto adyacente que cierra el círculo: `command-engine.ts:184` llama a
`descriptor.begin(context)` **sin** `try/catch`, mientras `:371` sí protege
`descriptor.step(...)`. Un comando que lanza al arrancar —leyendo un accesor
que el anfitrión no expone en ese estado— escapa del reductor hacia React. Con
el editor sin frontera, ese camino va de «teclear un comando en el momento
raro» a «pantalla en blanco» sin escalas.

---

### H12 · Nadie puede borrar un plano (y el método para hacerlo no tiene llamador)

`apps/web/src/lib/cad/repositories/documents.ts:21` expone
`archive: (documentId) => designClient.documents.archive(documentId)`. Busqué su
llamador en todo el árbol de producto: **no existe** —el único consumidor de ese
repositorio es `sheet-set-design-port.ts:31`, y sólo usa `open`—. La API
implementa el borrado como archivado lógico
(`cad.controller.ts:169-176`, `@RequirePermissions('cad:admin')`), o sea que la
decisión correcta ya está tomada en el servidor; lo que falta es la mitad de
arriba.

Consecuencias en las dos direcciones, y las dos son de mi lente:

- **El usuario que se equivoca creando** —tres planos de prueba el primer día,
  el import duplicado, la copia «bueno_final_v2»— no tiene forma de limpiar.
  Su tablero acumula ruido para siempre, y el ruido en el tablero es
  exactamente lo que hace que la gente deje de fiarse de un listado.
- **El usuario que se equivoca borrando** no existe todavía, y ése es el
  momento de diseñar la papelera: cuando se cablee el botón, que traiga
  «Restaurar» al lado. Añadir el borrado sin la vuelta atrás es crear un modo
  de fallo nuevo en un producto que hoy no lo tiene.

Se relaciona con el informe 13 §3.3 (blobs y versiones crecen sin recolector):
sin archivado desde la interfaz, nada marca nunca un documento como candidato a
recolectar.

---

## 3 · Defectos concretos del código, con fichero y línea

### D1 · `openDatabase` no maneja `blocked`: dos pestañas y un cambio de versión cuelgan el recovery para siempre, y en silencio

`apps/web/src/lib/cad/cad-recovery.ts:128-146`. La promesa resuelve en
`onsuccess` y rechaza en `onerror`. **No hay `onblocked`, no hay tiempo de
espera, y no se registra `database.onversionchange` en la conexión abierta.**

`DATABASE_VERSION` es 2. Cuando una pestaña vieja mantiene abierta la versión 1
y una pestaña nueva pide la 2, IndexedDB emite `blocked` en la nueva y **no
emite ni `success` ni `error`**: la promesa no se resuelve nunca. Y como no
rechaza, el `onError` de `createCadCheckpointQueue`
(`Layout3DEditor.tsx:4175-4185`) tampoco se dispara, así que no sale «Recovery
local en riesgo» ni ningún otro aviso: la barra dice «Recovery local activo»
mientras **ningún checkpoint se está escribiendo**. Es el peor tipo de fallo de
esta lente: la red de seguridad se apaga y el indicador sigue en verde.

La ventana concreta es el día de un despliegue que suba `DATABASE_VERSION` con
gente trabajando. Ya pasó una vez (la versión 1 existió) y volverá a pasar.

**Arreglo (media hora).** Tres líneas: `request.onblocked` que rechaza con un
error nombrado; un `setTimeout` de guardia que rechaza si en 10 s no hubo
`success`, `error` ni `blocked`; y `database.onversionchange = () =>
database.close()` en el `onsuccess`, para que la pestaña vieja suelte la
conexión en vez de bloquear a la nueva. Comprobable con un doble de IndexedDB
en el spec que ya existe.

### D2 · El presupuesto de historial no cuenta el `after` de rehacer: hasta el doble de lo presupuestado

`canonical-history.ts:164-172`. Al deshacer, la entrada se mueve a `redoItems` y
se le cuelga el estado actual:

```ts
undo(current: T = this.current) {
  const item = this.undoItems.pop();
  item.after = current;        // <- un SEGUNDO documento retenido…
  this.redoItems.push(item);   // …que nunca se estima ni se suma
```

`retainedBytes` sólo contabilizó `entry.before` en `recordCurrent` (`:154`).
`item.after` es otro documento completo y no entra en la cuenta. Con la pila de
rehacer llena, el montón realmente retenido llega a ser **el doble** del
presupuesto declarado — 64 MiB donde el código dice 32. En un plano denso, donde
§H1 ya deja la pila en un elemento, importa poco; en el plano de 10.000, donde
caben seis pasos y se deshace y rehace todo el día, importa.

**Arreglo:** sumar `estimateBytes(current)` al pasar a rehacer y restarlo al
volver o al limpiar. Cuatro líneas, y el spec de al lado ya tiene el andamio.

### D3 · Valorar el checkpoint cuesta un recorrido completo del documento, en el hilo principal, en cada edición

`canonical-history.ts:154` llama a `defaultEstimateBytes(before)` en **cada**
`recordCurrent`, y `pushHistory` se llama desde cuarenta y cinco sitios de
`Layout3DEditor.tsx`. Medido con el estimador copiado verbatim, mediana de cinco
pasadas, en el contenedor de esta sesión:

```
  5 000 entidades ->   6,0 ms
 10 000 entidades ->  12,3 ms
 20 000 entidades ->  25,7 ms
 50 000 entidades ->  66,0 ms
100 000 entidades -> 137,0 ms
```

En el portátil de un despacho, más. Y esto es **encima** de `snapshotDocument()`,
que reconstruye el documento entero y cuyo coste el propio comentario de
`Layout3DEditor.tsx:3779-3784` ya reconoce. O sea: cada comando en un plano
denso paga dos recorridos completos del documento antes de dibujar nada, y el
segundo sólo sirve para calcular un número que —por §H1— acaba tirando la
entrada de todas formas.

El informe 17 persiguió los O(n) por **render** (su §4.2 y H10). Éste es un O(n)
por **edición**, que es peor porque no se puede saltar un cuadro.

**Arreglo:** estimar por delta (lo que cambió respecto a la entrada anterior),
que además es lo que arregla la profundidad en §H1; o, como mínimo, memoizar el
tamaño estimado en el propio documento inmutable, que sólo cambia cuando cambia
el documento.

### D4 · `begin()` sin `try/catch`, `step()` con él

`lib/cad/engine/command-engine.ts:184` frente a `:370-384`. Ya razonado en
§H11·3. Cuatro líneas, mismo patrón que la protección que ya existe justo
debajo.

### D5 · `save-failure.spec.ts` cubre cinco estados y no el que más duele

`components/cad/document-lifecycle/save-failure.spec.ts`: hay casos para 401,
403 (dos, incluido el de la razón `read_only_after_lapse`), 413, 429 y 500. No
hay ninguno para 400. Como el módulo tampoco tiene rama para 400 (§H2), el
gate bendice el comportamiento actual. Es el caso de manual de por qué una
prueba que sólo confirma lo que el código hace no es una prueba.

### D6 · El contenedor de todos los avisos de fallo está pintado con color crudo

`contexts/ToastContext.tsx:115`:

```
bg-white/85 dark:bg-neutral-900/85 border-black/5 dark:border-white/10
shadow-[0_8px_30px_-8px_rgba(0,0,0,0.25)]
```

Blanco puro, `neutral-900`, negro al 5 % y una sombra arbitraria: cuatro
violaciones de la regla de oro de `AGENTS.md` («no hex fuera de `globals.css`,
no tamaño fuera de la escala») en el componente que dibuja **todos** los
mensajes de error del producto. El informe 18 posee este terreno y no me meto en
él; lo anoto aquí sólo porque es la superficie de mi lente: la pantalla que la
persona mira en su peor momento es la única del estudio que no se parece al
producto.

### D7 · `documentsRepository.archive` no tiene llamador de producto

`lib/cad/repositories/documents.ts:21`. Mismo patrón que el informe 11 encontró
en `versionsRepository` y `blocksRepository` (su D6): capa de repositorio
completa, cero consumidores. Ver §H12.

---

## 4 · Cómo se construye, en orden

Ordenado por dolor evitado ÷ días. Ninguno relaja un gate, un umbral, un golden
ni un presupuesto; tres de ellos **añaden** gate.

**Día 1 — Los cuatro arreglos de una tarde.**
`onblocked` + guardia de tiempo + `onversionchange` en `openDatabase` (D1).
`try/catch` en `begin()` (D4). Rama 400 en `describeCadSaveFailure` con su caso
en el spec (H2 + D5). Corregir el `seNota` de la fila `dibujar-acotar-modelar`
de la matriz sin red (H6·1). Cuatro cosas, cuatro pruebas, ningún riesgo.

**Día 2 — Que el usuario no pueda romperse el plano de un teclazo.**
Techo y confirmación en ARRAY / COPY múltiple / DIVIDE con bloque, importando
`CAD_DOCUMENT_LIMITS.maxEntities` del contrato en vez de escribir un número
(H3). Temporizador de importación por atasco y no por reloj, con «Seguir
esperando» y «Cancelar» (H8).

**Días 3-4 — Que el fallo se quede en pantalla mientras exista.**
Panel de estado del guardado con el texto completo y acciones (Reintentar ·
Exportar DXF · Detalles), sustituyendo al tooltip (H4). «Reintentar» y mención
del borrador local en la pantalla de apertura caída (H5). Aviso de recovery en
riesgo independiente de `dirty`.

**Días 5-7 — La profundidad de deshacer deja de mentir.**
Estimación por delta en `CanonicalHistory` + contabilidad del `after` (H1·2,
D2, D3). Profundidad de deshacer fuera de `?cadDiag=1` y en la barra de estado,
con el aviso de una sola vez cuando `evict` dispara (H1·1). Tramo
`undoDepthByTier` en `document-limits.json`, medido con el arnés que ya existe
(H1·3). **Gate nuevo:** a 20.000 entidades el historial conserva al menos N
pasos, con N medido y versionado.

**Días 8-9 — La biblioteca compartida deja de perder escrituras.**
`expectedVersion` obligatorio y 409 en la redefinición de bloque, copiando
literalmente el contrato de conjuntos de planos; recuento de usos antes del
borrado (H7). **Gate nuevo:** una prueba contra la API real con dos escritores
concurrentes sobre el mismo bloque, hermana de
`cad-conflict-per-document.spec.ts`.

**Días 10-12 — La escalera de degradación.**
Muestreo de `performance.memory` con tres tramos (H9). Medidor de salud del
plano con las acciones que ya existen detrás: PURGE, OVERKILL, xref, dividir en
láminas (H10). Frontera de error del editor que escribe checkpoint antes del
fallback y ofrece DXF (H11), cerrando §4.3 del informe 14.

**Después, cuando toque:** archivado y papelera desde el tablero, con
«Restaurar» en el mismo commit que el botón de borrar (H12). Precarga del núcleo
de comandos y su gate sin red (H6·2 y H6·3).

---

## 5 · Lo que esto le hace a la rúbrica

El marcador lo computa `node scripts/cad/rubric.mjs` y este informe **no lo
reescribe**. Lo que sí observa es dónde la rúbrica no está mirando.

De las 36 filas, la que más se acerca a esta lente es `persistence` (8 puntos,
`persistence.cas` · `persistence.recovery` · `persistence.real-e2e` ·
`persistence.offline`), y su texto de `gap` dice que quedó cerrada en la ola E1.
Es verdad y está bien ganada: cubre CAS, journal con integridad, recorrido real
contra PostgreSQL y offline/multi-pestaña/cierre forzado con presupuesto
publicado. **Lo que no cubre —y no debería cubrir, porque es otra cosa— es lo
que este informe mide:**

- que **el aviso de un fallo permanente sea distinto del de uno transitorio**;
- que **la profundidad de deshacer prometida sea la entregada** a la escala del
  plano real;
- que **una operación del usuario no pueda dejar el documento fuera de los
  límites** que el servidor va a rechazar;
- que **exista escalera de degradación** entre «cabe» y «no cabe».

Cuatro propiedades, ninguna medida hoy por ninguna fila. La forma de la casa
para eso es un criterio con su evidencia ejecutable, no un punto regalado. Mi
propuesta, para que la escriba quien mantiene la rúbrica y la compute el guion:

| criterio propuesto | evidencia que lo probaría |
|---|---|
| El fallo permanente no se anuncia como transitorio | caso 400 en `save-failure.spec.ts` + el aviso afirmado en `errores-en-espanol.spec.ts` |
| La profundidad de deshacer prometida es la entregada | tramo `undoDepthByTier` en `document-limits.json` con mínimo por escala |
| Ninguna operación deja el documento fuera del límite del servidor | prueba de ARRAY por encima del techo que exige confirmación |
| El almacenamiento local avisa cuando deja de proteger | spec de `openDatabase` bloqueado que exige aviso visible |

Los cuatro se pueden medir hoy con el andamiaje que ya existe, y ninguno se
puede conceder «por existir el módulo», que es la regla 1 de la campaña de
cimientos.

---

## 6 · La apuesta ganadora

AutoCAD tiene treinta años de fallos aprendidos, y aun así, cuando a un
arquitecto se le va la luz, lo que le espera al volver es el Administrador de
Recuperación de Dibujos: una lista de ficheros `.sv$` con nombres de máquina,
horas y una pregunta que nadie sabe contestar del todo. Es mejor que nada y es
la vara que la industria acepta.

Valle Design puede ganar ahí, y la parte difícil ya está hecha: hay diario con
carril por pestaña, con hash verificado, con poda, con la ventana de pérdida
medida y publicada en 16,9 segundos, y con un clasificador de fallos que le dice
a la persona, en español y en su peor momento, que su trabajo no se ha perdido.
Nadie en el mercado publica su ventana de pérdida. Nadie escribe «qué pasa con
tu trabajo» como segundo párrafo obligatorio de un aviso de error.

Lo que falta para cobrar esa ventaja no es más motor: es **que el producto no
se contradiga a sí mismo cuando falla**. Que no invite a reintentar lo
imposible. Que no apague el botón Deshacer sin decir por qué. Que no deje que
un dígito de más convierta un plano en un archivo que ya no se puede guardar.
Que no ponga el mensaje mejor escrito del producto en un tooltip de 11 píxeles.

Esas cuatro frases se dicen delante de un socio director en veinte segundos, y
las cuatro son de una a tres semanas de trabajo. Después de eso, la frase que se
puede decir en una demostración es la que ningún competidor puede decir:

> **Apaga el portátil sin guardar. Dime qué perdiste.**

Y la respuesta, medida y publicada, es: diecisiete segundos como máximo.

---

## 7 · Resumen para quien decide

- **Lo mejor:** la infraestructura de degradación es de primera —CAS atómico,
  diario con carriles e integridad, guardián de WebGL, matriz ejecutable de 34
  flujos sin red, ventana de pérdida medida y publicada— y las pruebas que la
  sostienen **corren en CI de verdad**, contra API real y PostgreSQL.
- **Lo peor:** encima de esa infraestructura hay una clasificación de errores de
  dos peldaños. Un `400` permanente se le presenta al usuario como «espera un
  momento y vuelve a pulsar Guardar».
- **La medición que hay que leer dos veces:** el historial promete 80 pasos y
  entrega **3 a 20.000 entidades y 1 a partir de 50.000**, en silencio, con el
  botón Deshacer apagándose como si no quedara nada que deshacer. El indicador
  que lo diría existe y está detrás de `?cadDiag=1`.
- **El teclazo que rompe un plano:** `ARRAY 500 × 500` no pregunta, no tiene
  tope y produce un documento que no se puede guardar nunca más.
- **Lo que hay que arreglar esta semana:** las cuatro cosas del Día 1 (§4).
  Media jornada de trabajo, cero riesgo, y quitan de en medio dos fallos
  silenciosos y una frase falsa en la matriz.
- **Lo que no está roto y parecía que sí:** offline, checkpoints, integridad del
  archivo, bomba de gzip, atomicidad del CAS, contexto WebGL perdido,
  confirmación en AUDIT/PURGE, chunk de comandos que no llega. Ocho cosas que
  entré a buscar convencido de que faltaban y están, bien hechas y con la razón
  escrita al lado.
