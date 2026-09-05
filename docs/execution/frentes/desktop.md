# F10 · Escritorio, sin internet e inglés

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/i18n/**`
- `apps/web/public/manifest*`
- `apps/web/src/app/(sw)* (nuevo)`
- `apps/desktop/** (nuevo)`
- `claves de i18n nuevas (no reescribir componentes ajenos)`

## Cola

1. PWA instalable con service worker que sirve el estudio sin red, sobre el journal offline que ya existe.

2. Empaquetado de escritorio (Tauri) que abre archivos locales y funciona en LAN sin servidor público, con evaluación HONESTA de qué sigue requiriendo el backend.

3. en-US completo del estudio y las páginas públicas por claves, medido por un script de cobertura de claves, con las unidades imperiales de F4.

4. Plotter: tamaños de rollo y sangrado en el diálogo de PLOT.

## Cierre

Goldens del modo sin red; instalador de escritorio generado en CI; en-US medido por script de cobertura.

## Lo que hay que tener presente

Sólo claves nuevas: no reescribas componentes de otros frentes. Si una cadena vive dentro de un componente ajeno, pide la extracción por el archivo de peticiones.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/desktop-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-desktop` sobre la rama `campana/superar/desktop`. Commits sí;
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
cd /home/user/vd-desktop
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### 2026-09-04 · Entrega 2 · El service worker y su política, probada sobre los bytes servidos

Existe `/sw`. El cuerpo del worker vive como constante de texto en
`apps/web/src/app/(sw)/service-worker-source.ts`, compuesto desde
`service-worker-policy.ts` —que es TypeScript de verdad y por eso importa las fuentes
versionadas por contenido de `@/config/fonts-generated`, en vez de repetir sus hashes a
mano como haría un `public/sw.js`—, y lo sirve el route handler
`(sw)/sw/route.ts` con `Content-Type: text/javascript`, `Service-Worker-Allowed: /` y
`Cache-Control: no-cache`.

**Lo que hace que el spec valga algo:** `service-worker-harness.spec.ts` llama al `GET` de
la ruta, lee el cuerpo y ejecuta ESA CADENA con `new Function` contra dobles de `self`,
`caches`, `fetch` y `clients`. Los bytes probados son los bytes servidos —medido: 10 983
bytes por HTTP contra `next start`, idénticos a los que evalúa el test—. No hay una
reimplementación de la política dentro del test que pueda irse separando de la que corre
en el navegador.

Once bloques verdes. Los seis que pedía la entrega —el precacheo de la lista declarada;
la navegación sin red que cae en su copia; la que cae en `/sin-conexion` por no tenerla;
`/v1/cad/documents/x` que ni se mira ni se guarda y propaga el error crudo; los métodos
que no son GET; y `activate` dejando exactamente una caché— más cinco que salieron de
probar el propio spec: `network-first` de verdad (no `cache-first` disfrazado), lo
personalizado y lo opaco que no se guardan, `stale-while-revalidate` sobre lo inmutable,
el refresco del cascarón con su margen, y la premisa de todo lo anterior — que ninguna
página de `src/app` lee cookies en el servidor, porque el día que una lo haga esta caché
guardaría la pantalla de una persona en el disco de otra.

**Cómo se ganó la confianza:** 18 mutantes sembrados en la fuente del worker (quitar el
guardia de `/v1/`, el de método, el de origen, aceptar opacas, no purgar en `activate`,
purgarlo todo, servir caché primero en navegación, quitar la caída a `/sin-conexion`,
precacheo tolerante a 404…). Los tres primeros pases dejaron vivos cuatro, y cada
superviviente destapó algo real: el guardia de `/v1/` sólo se ejercía en la forma que no
importa (faltaba la NAVEGACIÓN a `/v1/*`, que es como llega un enlace de revisión); el
`ignoreVary` del rescate estaba justificado con un motivo FALSO en su comentario —no es
que difieran las cabeceras, es que el Cache API se niega a devolver nada ante un
`Vary: *`—; y `network-first` era indistinguible de `cache-first` sin una aserción de
despliegue nuevo. Los cuatro están muertos y los comentarios corregidos.

Medido contra el servidor de verdad (`next start` + `curl`): las seis URL del cascarón
responden 200, y `/sin-conexion` sale con `Vary: rsc, next-router-state-tree,
next-router-prefetch, next-router-segment-prefetch, Accept-Encoding` y `Cache-Control:
private, no-cache, no-store`. Lo segundo no estorba —el Cache API no mira las directivas
HTTP—, y ambas cosas están escritas donde se leen.

Árbol verde: `npm run typecheck` (8/8), `node scripts/run-specs.mjs` (606/606, el spec
nuevo descubierto dentro de `(sw)`), `next build` con `/sw` en la lista de rutas,
`check-monolith-budget` OK, eslint sin avisos nuevos. Los tres archivos: 209, 316 y 740
líneas.

### 2026-09-04 · Entrega 3 · El registro del worker y el aviso de versión nueva, con la máquina de estados probada

`ServiceWorkerRegistrar.tsx` (281 líneas) registra `/sw` con ámbito `/` enganchado al
evento `load`, se desregistra solo en desarrollo salvo bandera, y ofrece recargar cuando
llega una versión nueva. Pero el componente **no decide nada**: toda la decisión vive en
`update-lifecycle.ts` (310 líneas), un reductor puro al que se le inyectan los eventos y
que devuelve estado + EFECTOS COMO DATOS (`saltar-espera`, `recargar`, `armar-plazo`). Ésa
es la razón de que exista `update-lifecycle.spec.ts` (454 líneas, **13 bloques verdes**):
los tres eventos que mueven este ciclo —`updatefound`, `statechange`, `controllerchange`—
sólo los emite un service worker instalándose encima de otro service worker, o sea un
navegador y dos despliegues distintos. La decisión sí se puede ejercer aquí; el cableado
no.

**Los dos defectos que este reductor para,** y el segundo es el que importa:

1. **El bucle de recarga.** La receta que circula por ahí es «recarga en
   `controllerchange`». Con `clients.claim()` en `activate`, ese evento llega solo; si el
   worker se activa otra vez, la página recargada vuelve a recargar. La guarda `recargado`
   vive en UNA sola función (`conRecarga`), y el bloque 10 del spec la prueba sobre el
   ESPACIO ENTERO —6 fases × controlado × descartado × recargado × 14 eventos = 672
   combinaciones—: desde un estado que ya recargó, ningún evento puede emitir otra
   recarga. Es lo que hace que añadir un evento mañana no reabra el bucle por una salida
   que se olvidó de mirar la guarda.
2. **La recarga que nadie pidió.** Peor que el bucle. Este worker llama a `skipWaiting()`
   en `install`, así que toma el mando SOLO: la página recibe un `controllerchange` que
   nadie pidió y la receta de arriba recargaría encima de un plano abierto — el histórico
   de deshacer vive en RAM. Aquí se avisa y se recarga **sólo si se pidió**.

Y la regla que la entrega pedía por su nombre: **la primera instalación no avisa.** Un
worker que se instala sin controlador vivo no es una actualización, es la primera visita
de este navegador; el bloque 1 lo comprueba PASO A PASO y no sólo al final, porque el
aviso duraría los segundos del `clients.claim()` y mirar sólo el estado final lo dejaba
pasar (lo dejó pasar: ver los mutantes).

**Cómo se ganó la confianza:** 7 mutantes sembrados en el reductor (recargar en cualquier
`controllerchange`; quitar la guarda del bucle; avisar en la primera instalación; recargar
antes del relevo; que el rechazo del registro no cambie de fase; aceptar `worker-listo`
desde cualquier fase; que `avisoVisible` ignore el descarte). El primer pase dejó vivo el
de la primera instalación —el spec sólo miraba el estado final— y ese superviviente es el
que hizo reescribir el bloque 1. Los 7 están muertos.

**Lo añadido sobre lo pedido, y por qué:**

- **El worker escucha un mensaje** (`SW_MENSAJE_SALTAR_ESPERA`). Sin él, `postMessage` a un
  worker en espera no hace nada y tampoco da error: el botón «recargar» se quedaría mudo.
  Bloque 10 nuevo del harness (ahora 12 verdes, 11 805 bytes servidos): el mensaje
  declarado salta la espera, y ni un objeto, ni un mensaje vacío, ni otro texto lo hacen.
  No se subió `SW_POLICY_REVISION`: la revisión existe para INVALIDAR lo guardado, y añadir
  un oyente no vuelve mala ni una respuesta en caché.
- **Un plazo de 4 s** (`PLAZO_DE_RELEVO_MS`). Se pide el relevo y no llega —otra pestaña
  sostiene al worker en espera—: al vencer se recarga a secas. Sin él, el botón gira para
  siempre.
- **El aviso se puede cerrar**, y vuelve con la SIGUIENTE versión. Un aviso que no se cierra
  tapa una esquina del área de dibujo hasta que el usuario ceda.
- **Copy por claves, segunda superficie del producto.** El aviso no escribe ni una palabra
  en el `.tsx`: sale del namespace `appUpdate` (4 claves en `en`/`es`). Y el spec de copy
  se generalizó a una TABLA —`src/i18n/offline-copy.spec.ts` → `key-driven-copy.spec.ts`,
  296 líneas— con una fila por superficie y una regla 9 nueva: **ningún namespace de los
  catálogos puede quedarse sin fila**, con `language` como única excepción declarada (sus
  etiquetas son nativas y romperían la regla «se tradujo de verdad»). 28 claves vigiladas.

Árbol verde: `npm run typecheck` (8/8), `node scripts/run-specs.mjs` (**607/607**, uno más
que ayer), eslint sin avisos sobre `src/app/(sw)` y `src/i18n`. `npm run check:cad` se
detiene en `check:dwg-evidence` por falta de `VALLE_DWG_CORPUS_MIRROR` en esta máquina —el
propio AGENTS.md avisa de que ese gate miente por entorno—; es anterior a esta entrega y
ningún archivo tocado aquí es DWG.

### 2026-09-04 · Entrega 4 · La matriz de lo que sigue pidiendo servidor, contrastada contra el contrato

**El número, primero: 79/79 endpoints del contrato clasificados en 34 filas — 7 funcionan
sin red, 4 degradan y reintentan, 23 requieren backend.** Lo imprime
`npx tsx 'src/app/(sw)/offline-capability-matrix.spec.ts'` (13 bloques verdes) y no está
escrito a mano en ninguna parte: sale de contar la matriz y de contar el contrato, y el
spec falla si los dos números no coinciden.

`offline-capability-matrix.ts` (773 líneas) es un módulo tipado, no un documento. Cada
fila lleva el flujo humano dicho como lo diría quien dibuja («Buscar un bloque del equipo e
insertarlo», no `GET /v1/cad/blocks`), su veredicto, sus endpoints normalizados, los
archivos donde se comprueba, el porqué y —el campo que hace que la frontera sirva de
algo— **qué se nota** sin red.

**Por qué contra el código y no contra la memoria.** Una matriz escrita a mano envejece en
dos direcciones y las dos son silenciosas: le crecen endpoints que nadie clasificó y le
sobreviven endpoints que ya no existen. El spec lee tres fuentes y cierra las dos:

- `packages/contracts/specs/design-api.v1.yaml`, que es la AUTORIDAD según AGENTS.md: sus
  79 rutas tienen que estar todas en una fila (nada sin veredicto) y ninguna fila puede
  clasificar algo que no esté ahí (nada fantasma).
- `apps/web/src/lib/cad/legacy/layout-http-adapter.ts`, la única puerta del editor a la
  red: sus 11 familias `/v1/cad/...` —comentarios incluidos, porque su cabecera ES el mapa
  de rutas— tienen que estar clasificadas **por una fila que cite el propio adaptador**.
  Clasificarlas desde otra fila cualquiera cumpliría la letra y no la intención.
- El árbol de cliente entero —**1 071 archivos** de `apps/web/src` y
  `packages/design-sdk/src`, sin specs ni generados; la cifra la imprime el propio spec—,
  para que la cobertura no dependa de que alguien se acuerde de mirar un archivo nuevo. **La matriz se excluye a sí misma de ese barrido**: si no, una
  fila fantasma se avalaría sola, porque el endpoint inventado aparecería «en el código»
  por estar escrito en la lista que se está comprobando.

**Lo que el barrido encontró y no se sabía.** Cuatro familias del contrato no las llama
NADIE desde el navegador (`upgrade-intents` ×3 y `webhooks/stripe`); están marcadas
`sinPuertaEnElNavegador`, y el spec comprueba que esa marca no se use de atajo: si mañana
una pantalla las llama, falla. Y al revés: una fila SIN la marca cuyos endpoints no llame
nadie también falla.

**Las tres reglas que dan valor a las otras.** Una fila «funciona sin red» no puede listar
endpoints **y** no puede apoyarse en un archivo que tenga puerta a la red (`designClient`,
`apiFetch`, `legacyCadFetch`, `fetch(`, `XMLHttpRequest`, `EventSource`). Eso obligó a
corregir la primera fila que se escribió: el cascarón NO puede citar
`service-worker-source.ts` como prueba de que funciona sin red —el cuerpo del worker es
`network-first`—, sino la política y la página. La premisa de todo esto,
`SW_NEVER_CACHE_PREFIXES`, **se importa** de la política del worker en vez de copiarse: si
alguien decidiera cachear `/v1/`, la matriz dejaría de describir el producto y el bloque 1
lo grita. Y «degrada y reintenta» exige nombrar QUIÉN reintenta, con dos mecanismos
legítimos y distinguidos a propósito: código nuestro (el oyente de `online`, el backoff de
presencia) o el reintento nativo de `EventSource`, que sólo vale si la fila se apoya en él
declarándolo. El primero recupera trabajo de una persona; el segundo sólo reabre un caño.

**El veredicto más incómodo, escrito entero:** `abrir-el-dibujo` requiere backend aunque el
borrador esté en la máquina. El efecto que ofrece la recuperación arranca con
`if (!open || !data || ...) return`, o sea que sólo corre DESPUÉS de que el GET del
documento haya vuelto. Sin red se entra por el `catch` que pinta «No se pudo cargar el
layout» y el journal —que tiene el trabajo— no se llega a mirar. Es el único de los 34 que
describe un defecto y no una imposibilidad, y por eso salió de aquí la petición
**P-desktop-03** con su diseño completo (incluida la restricción de que el monolito sólo
puede encoger, así que hay que EXTRAER, no añadir).

**La matriz y la pantalla, atadas.** `/sin-conexion` promete seis cosas y esas seis frases
son copy, que se cambia sin tocar código. `PROMESAS_DE_SIN_CONEXION` ata cada clave del
namespace `offline` a su fila y a su veredicto: si un veredicto cambia y la pantalla sigue
prometiendo lo de antes, falla el bloque 12.

**Cómo se ganó la confianza:** 9 mutantes, 9 muertos — quitar un endpoint de una fila
(lo caza la puerta del editor), inventar `/v1/cad/documents/:id/lock` (lo caza el
contrato), declarar la biblioteca de bloques como «funciona sin red», colar un `/v1/` en
una fila local, quitar `sinPuertaEnElNavegador` al webhook, citarse a sí misma como
evidencia, quitar el `reintento` a una fila que degrada, desatar la promesa de la pantalla,
y vaciar `SW_NEVER_CACHE_PREFIXES` en la política del worker.

Árbol verde: `npm run typecheck` (8/8), `node scripts/run-specs.mjs` (**608/608**, uno más
que la entrega 3), eslint sin avisos sobre los dos archivos nuevos.
`npm run check:cad` recorre sus gates —incluidos `check:lint-budget`,
`check:conventions`, `check:no-industrial-domain` y `check:monolith-budget`— y se detiene,
como ayer, en `check:dwg-evidence` por falta de `VALLE_DWG_CORPUS_MIRROR` en esta máquina;
se comprobó apartando los dos archivos nuevos que el fallo es idéntico sin ellos.

### 2026-09-05 · Entrega 5 · La cobertura de en-US, medida, y el contrato de catálogos

**Las dos cifras, primero, con su fecha: cobertura por claves 33/8 019 = 0,4 % (medido el
2026-09-05, y es un TECHO); superficie pendiente 7 986 textos en español cableados fuera de
claves, en 601 de 1 062 archivos de `apps/web/src`.** Por área: `lib/cad` 5 495 (371/659
archivos), `components/cad` 674 (84/152), `app/docs` 253 (10/11), marketing y páginas
públicas 585 (38/49), el resto del árbol 979 (98/191). Las imprime
`npx tsx src/i18n/catalog-contract.spec.ts` y no están escritas a mano en ninguna parte:
salen de contar los catálogos y de barrer el árbol en la misma ejecución.

`src/i18n/coverage.ts` es el instrumento y **no lee un solo archivo**: son funciones puras
que reciben texto y devuelven datos. Ésa es la condición para que los cuatro caminos de
fallo se puedan ejercer contra fixtures en vez de escribir un JSON roto en `messages/`.

**Lo que SÍ es gate, y por qué sólo eso.** El contrato de catálogos: mismas claves en los
dos idiomas, ningún valor vacío, los mismos marcadores ICU, las mismas fichas de marca,
ningún namespace declarado en un índice y no en el otro, ningún JSON huérfano. Los
catálogos los alimenta este frente y sólo este frente, así que un rojo ahí es siempre
culpa de quien lo puso rojo. **El barrido NO es gate y no lleva presupuesto**: `lib/cad` y
`components/cad` son territorio ajeno, y cualquier frente que añada una cadena en español
—haciendo su trabajo, correctamente— pondría la suite en rojo por algo que no es suyo. Un
gate que castiga a quien no puede arreglarlo se apaga a la semana, y con él se iría también
la parte que sí valía. Lo único que el barrido se exige es a sí mismo: un SUELO de textos
encontrados, para que romper el detector no suba la cobertura publicada al 100 % sin
traducir una frase. Suelo, nunca techo: añadir español no lo rompe.

**Lo que ya cubría otro spec y lo que no.** `key-driven-copy.spec.ts` vigila por SUPERFICIE
—una fila por pantalla, con su consumidor— y exime a `language` de la regla «se tradujo de
verdad», con razón: sus etiquetas son nativas. Pero esa exención lo dejaba fuera de TODO, y
la regla 8 de aquel spec sólo recorre las filas: hoy `language` es el primer namespace al
que alguien le comprueba la paridad y los vacíos. Y nadie comprobaba que `messages/en.ts` y
`messages/es.ts` declaren el MISMO juego de namespaces — el día que uno se olvide en un
índice, ese idioma pierde la pantalla entera y next-intl no dice nada.

**La decisión que cambia la cifra por un factor grande: los comentarios no cuentan.** Un
barrido crudo de «líneas con texto español» da 6 892 líneas en este árbol; casi todas son
comentarios, que en esta casa están en español POR NORMA. Contarlos mide cuánto se
documenta, no cuánto queda por traducir. El escáner separa comentarios, literales de cadena
y nodos de texto JSX, y sólo cuenta los dos últimos.

**La honestidad del detector, dicha en la dirección incómoda.** Cuenta FRASES: texto con un
espacio, o una palabra capitalizada con carácter español. `"Guardar"` suelto no se cuenta
porque un token sin espacios ni acentos no se distingue de un identificador sin abrir el
archivo. O sea que la superficie pendiente es un SUELO y la cobertura que sale de ella un
TECHO — no «alrededor del 0,4 %»: **como mucho** 0,4 %. El spec lo deja escrito con un
ejemplo vivo («Capas del plano», copy real que el detector no cuenta) en vez de con un
comentario.

Tampoco sabe QUIÉN lee el texto: entran los mensajes de consola, el cuerpo del service
worker y la prosa de datos de `offline-capability-matrix.ts` (102 textos, medidos). Se
cuentan igual. La alternativa —una lista de exclusiones «esto no es copy de verdad»— es
exactamente el sitio donde una cifra empieza a esconder cosas. Lo único excluido es el
propio instrumento y los specs, por la regla que ya se aplicó a la matriz: nada puede ser
su propia evidencia.

**Cómo se ganó la confianza: 22 mutantes, 22 muertos.** Los primeros pases dejaron vivos
cuatro y los cuatro cambiaron el código, no el spec:

- **El texto JSX con una cifra en medio.** Prohibir la llave en el nodo (`>[^<>{}]+<`)
  perdía 72 frases reales de este árbol —«Cerrar las otras {n} sesiones»—; permitirla sin
  más metía `cuando(sesion.createdAt)` dentro de lo que se cuenta como copy. Se midieron
  las dos y se escribió la tercera salida: la interpolación se VACÍA, igual que ya se hacía
  con el `${…}` de una plantilla.
- **El literal de regex.** `if (/["']/.test(x)) return say("No se pudo …")` es una línea
  normal de este motor, y la comilla del regex emparejaba con la del mensaje: el mensaje
  dejaba de contarse. El escáner ahora salta los regex enteros, con su clase `[…]` —donde
  la barra no cierra nada— y su heurística de posición.
- **Una guarda que no mataba ningún mutante.** La primera versión del salto de regex traía
  una defensa contra el JSX que ningún caso ejercía; en JavaScript válido un `/` pegado a
  `( , = : [ ! & | ? ;` es siempre un regex, y el de `</div>` va detrás de `<`, que por eso
  no está en la lista. Se quitó en vez de dejarla «por si acaso».
- **Un comentario que exageraba su riesgo.** Decía que una comilla suelta se tragaría «el
  resto del archivo»; el estado no cruza de línea, así que se traga el resto de SU LÍNEA.
  Corregido: un comentario que exagera se deja de leer igual que uno que calla.

Los fixtures que matan a los dos últimos supervivientes salieron del propio producto: las
**marcas imperiales** (`12' 6"`, una comilla simple y una doble sin pareja en mitad de un
nodo de texto) y **dos etiquetas en línea con la frase en la segunda**.

Árbol verde: `npm run typecheck` (8/8), los dos specs nuevos entran solos en `npm test` por
el glob `src/**/*.spec.ts`, eslint sin avisos sobre `src/i18n`.

## «Todavía no»

### 2026-09-04 · El worker no lo registra nadie (actualizado tras la entrega 3)

`/sw` se sirve y desde la entrega 3 existe también quien lo registra
(`ServiceWorkerRegistrar.tsx`), pero **ningún navegador lo instala todavía**: nadie monta
el componente. Su único sitio sensato es `apps/web/src/app/layout.tsx`, que está fuera del
territorio de este frente (R1). Queda pedido con diseño completo en
`desktop-peticiones.md` (P-desktop-01, corregida en la entrega 3: el componente se llama
`ServiceWorkerRegistrar` y va DENTRO de `<I18nProvider>`, porque su aviso saca el texto de
claves). Hasta que se monte, lo que existe son las piezas probadas, no el comportamiento
en el navegador de nadie.

### 2026-09-04 · «Abre sin red DESPUÉS de haberse abierto una vez con red»

No hay manifiesto de build: la caché es en tiempo de ejecución, así que no existe una
lista de los `/_next/static/*` que el estudio necesita —esa lista sólo la conoce el
compilador—. La primera visita de un navegador nuevo **sin conexión** sigue sin abrir
nada. Está escrito así en la copia de `/sin-conexion` y en la cabecera de
`service-worker-policy.ts`, y no se insinúa de otra forma en ninguna parte.

### 2026-09-04 · El cascarón precacheado lleva el idioma del momento en que se guardó

`/sin-conexion` se renderiza bajo demanda porque el idioma sale de la cookie
`valle_locale`. El worker guarda la respuesta que le den, así que quien cambie a español
después del precacheo verá el cascarón en inglés hasta el siguiente refresco (12 h). La
alternativa —precachear una variante por idioma y elegirla en el `fetch`— no se hizo.

### 2026-09-04 · Instalable, todavía no

El manifiesto declara iconos de 32×32, 180×180 y un SVG. Chrome exige un PNG de al menos
192×192 para ofrecer la instalación, así que **hoy la PWA no es instalable** por mucho que
el worker exista. Es trabajo de la entrega de instalabilidad, no de ésta.

### 2026-09-04 · El cableado del componente no tiene spec, sólo la decisión

`update-lifecycle.spec.ts` prueba QUÉ se decide con cada evento; nadie prueba que
`ServiceWorkerRegistrar.tsx` traduzca bien los eventos del navegador a esos eventos —que
enganche `statechange` al worker correcto, que limpie sus oyentes, que mande el mensaje al
worker EN ESPERA y no al controlador—. Para eso hace falta un DOM y un doble de
`navigator.serviceWorker`, y `apps/web` corre sus specs con `tsx` sin entorno de
navegador: no hay jsdom ni navegadores de Playwright instalados en esta máquina
(`/root/.cache/ms-playwright` está vacío). El componente se mantuvo delgado a propósito
—registra, escucha y ejecuta efectos, sin una sola decisión propia— justamente porque esa
parte es la que no se puede probar aquí. Se declara: **lo probado es la máquina de
estados, no el cableado**.

### 2026-09-04 · Nadie ha visto el aviso en un navegador

Corolario del anterior y de P-desktop-01: como el componente no está montado, el aviso de
versión nueva no se ha pintado nunca en una pantalla real. Su copy, sus tokens y sus
claves están comprobados por `key-driven-copy.spec.ts`; su comportamiento, por
`update-lifecycle.spec.ts`. Que se vea bien encima del área de dibujo del estudio, con el
dock y los toasts en pantalla, está sin comprobar.

### 2026-09-04 · La bandera de desarrollo no está documentada

`NEXT_PUBLIC_SW_EN_DESARROLLO=1` es la única forma de registrar el worker en local, y hoy
sólo la conoce quien lea `update-lifecycle.ts`. `.env.example` está en la raíz, fuera del
territorio (R1): pedido en P-desktop-02 con el texto exacto y su sitio en el archivo.

### 2026-09-04 · El empaquetado de escritorio (Tauri) no se puede construir en esta máquina

La entrega 2 de la cola son DOS cosas: el empaquetado de escritorio y la evaluación honesta
de qué sigue requiriendo el backend. La segunda está construida (entrega 4). La primera no,
y no por falta de tiempo: `cargo` 1.94 está instalado y crates.io responde, pero faltan las
dependencias de sistema que Tauri necesita para compilar en Linux —`gtk+-3.0`,
`webkit2gtk-4.1` y `libsoup-3.0` no los encuentra `pkg-config`—, y este entorno no instala
paquetes de sistema. Levantar un `apps/desktop/` con su `tauri.conf.json` sin poder
compilar ni una vez sería andamiaje que finge: se declara en vez de fingirse.

### 2026-09-04 · La matriz no la consume ninguna pantalla

Regla 1 de la campaña de cimientos: un módulo no cuenta por existir. Hoy
`offline-capability-matrix.ts` tiene dos consumidores reales —su spec y la política del
worker, de la que importa `SW_NEVER_CACHE_PREFIXES`— y **ninguna superficie de producto**.
Los dos sitios donde se ganaría el sueldo son `/sin-conexion` (que hoy escribe a mano seis
frases que la matriz ya sabe) y la sección «Límites declarados» del README. Lo primero
exigiría rehacer el namespace `offline` para que las frases salieran de las filas, con su
copy en dos idiomas; lo segundo está fuera del territorio de este frente. Mientras tanto,
lo que existe es una frontera comprobable, no una frontera publicada.

### 2026-09-04 · La matriz clasifica lo que el navegador llama, no lo que la API implementa

Las tres fuentes que lee el spec son de CLIENTE y de CONTRATO. Que
`POST /v1/cad/documents/:id/content` esté clasificado «degrada y reintenta» dice lo que
pasa en el navegador cuando no hay red; no dice nada sobre lo que hace `apps/api` si el
servidor pierde su base de datos. Esa otra frontera —la del backend consigo mismo— no la
cubre este módulo y no debe deducirse de él.

### 2026-09-05 · El en-US no existe: lo que existe es su medida

La entrega 3 de la cola pide «en-US completo del estudio y las páginas públicas por
claves». Lo construido hoy es el INSTRUMENTO que lo mide, y su primera lectura es
**0,4 %**. Ni una pantalla del estudio ni una página pública se ha migrado a claves en esta
entrega; las tres superficies que hablan por catálogo (`language`, `offline`, `appUpdate`)
son de las entregas 1 y 3. La cifra no mejora por existir el medidor, y decirlo así es la
mitad del trabajo: 7 986 textos es el tamaño real de lo que falta, y no se sabía.

### 2026-09-05 · Las unidades imperiales de F4 no están en ningún catálogo

La misma entrega de la cola pide el en-US «con las unidades imperiales de F4». Los
catálogos de hoy no tienen una sola clave de unidades, y el formateo de longitudes vive en
`lib/cad`, territorio ajeno. Cuando esas claves existan, el contrato de catálogos las
vigilará sin tocar nada; hoy no hay nada que vigilar.

### 2026-09-05 · La superficie medida cuenta texto que nadie ve en una pantalla

El barrido cuenta lo que un archivo ESCRIBE como texto y no sabe quién lo lee: mensajes de
consola, el cuerpo del service worker y la prosa de datos de `offline-capability-matrix.ts`
(102 textos, medidos) están dentro de los 7 986. Separarlos exigiría decidir archivo por
archivo qué llega a una pantalla, y esa lista sería el sitio perfecto para esconder deuda.
Se declara en vez de descontarse.

### 2026-09-05 · El barrido sólo mira `apps/web/src`

`packages/design-sdk/src` y `apps/api/src` no se barren. El SDK es generado y la API no
tiene interfaz, pero sus mensajes de error sí pueden acabar delante de una persona a través
del cliente. Añadirlos es una línea en el recorrido del spec; no se hizo porque las áreas
declaradas —y la cifra que se publica— son de la aplicación web, y mezclar dos árboles en
un mismo porcentaje sin declarar cuál pesa cuánto lo volvería ilegible.

### 2026-09-05 · Nadie impide que la superficie pendiente suba

Es la consecuencia deliberada de no poner presupuesto: mañana `lib/cad` puede tener 6 000
textos en español y ningún gate se pondrá rojo. Lo que hay es una medida que se vuelve a
tomar cada vez que corre la suite y una bitácora fechada con la lectura anterior. Ponerle
techo exigiría que el frente dueño de cada área lo aceptara como suyo; eso es una decisión
del coordinador, no de este frente (R1).
