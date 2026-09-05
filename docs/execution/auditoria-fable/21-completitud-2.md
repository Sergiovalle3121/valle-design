# 21 · Completitud 2 — la lente del navegador

**Lo que sólo un CAD que vive en el navegador puede hacer, y AutoCAD no: enlaces,
colaboración en vivo, cero instalación, cualquier dispositivo, integraciones —
y una sexta palabra que en esta casa está cerrada por decisión.**

---

## Nota metodológica

Las veinte dimensiones auditadas miden a Valle Design **contra AutoCAD, en el
terreno de AutoCAD**: sólidos, cinta, espacio papel, toolsets, interoperabilidad,
rendimiento. Este informe mira el otro terreno, el que AutoCAD no pisa porque su
arquitectura no se lo permite. No repite huecos ajenos: donde otro informe ya
levantó algo, lo cito con su número (`11 · H9`) y sigo.

Miré el árbol, no los informes. Todo lo que afirmo aquí lleva fichero y, cuando
la afirmación es sobre una línea concreta, número de línea, a la altura del `main`
de hoy. **No modifiqué ni una línea de código de producto.** Las cifras de la
rúbrica no se copian: se recomputan con `node scripts/cad/rubric.mjs`, y las que
uso de composición se recomputan con el comando que dejo escrito al lado.

Un aviso sobre el tono. Este repositorio es **más honesto que la mayoría de los
productos que se venden**: `docs/cad/third-party-extension-policy.md` empieza
diciendo que no hay programa de partners; `docs/cad/evidence/touch-support.json`
lista once cosas que **no** midió, empezando por «un dispositivo táctil REAL»;
`offline-capability-matrix.ts` clasifica cuarenta flujos y admite que veinticinco
requieren backend. Casi nada de lo que sigue es un engaño descubierto. Es una
**cola de capacidades que nadie ha construido todavía**, y el hallazgo de fondo
—§3— es la razón estructural por la que nadie la va a construir si no se cambia
algo antes.

---

## 0 · Veredicto en una frase

> Valle Design tiene construidas, probadas y **declaradas con sus límites** casi
> todas las PIEZAS de la ventaja del navegador —enlace de revisión con hash y
> revocación, presencia entre máquinas por SSE, llamada WebRTC con política ICE,
> mensajería con hilos y anclas al dibujo, service worker, diario en IndexedDB,
> gestos táctiles con golden— y **no tiene ninguno de los PRODUCTOS que esas
> piezas existen para formar**: el plano entregado no tiene dirección, ningún
> punto del interior del dibujo tiene URL, el invitado del enlace es invisible
> para el arquitecto y no puede entrar en la llamada, nadie se entera de nada con
> la pestaña cerrada, y una integración desatendida tiene que fingir ser un
> navegador. La ventaja está pagada y sin cobrar.

| | |
|---|---|
| **Nota de la dimensión** | **4,5 / 10** contra lo que un CAD en el navegador puede ser (no contra AutoCAD: en esta lente AutoCAD saca 1) |
| **Lo que está sólido** | Enlace de revisión con token en el fragmento; presencia por SSE entre máquinas; llamada con política ICE y límite de TURN declarado; matriz de sin-red ejecutable; golden táctil con sus once no-medidos publicados; consola pública de la API; política de extensiones que dice que no hay programa |
| **Lo que está roto hoy** | Al invitado se le afirma «Nadie más en este documento ahora mismo» cuando el arquitecto sí está (D1); la afirmación pública de compatibilidad nombra Safari y nada corre en WebKit (D2) |
| **Lo que compone** | Publicar produce un recibo, no un enlace; cero direccionabilidad dentro del dibujo; cero notificación con la pestaña cerrada; cero claves de API; webhook por variable de entorno del operador |
| **Lo que ganaría** | **El plano entregado con dirección propia** — §6 |

---

## 1 · La lente tiene seis palabras y una está cerrada. Se dice primero

La lente que me tocó incluye **«IA»**. En este repositorio esa palabra no es un
hueco: es una **decisión del titular, ejecutada, con guardián**.

`apps/web/src/lib/cad/no-ai-boundary.spec.ts` no es un comentario: es un spec que
corre en `npm run test` y que comprueba tres cosas —que ningún comando ni alias
del registro anuncia IA, que los nueve módulos retirados (`cide-provider.ts`,
`cad-intent.service.ts`, `cad-vision.service.ts`, `copilot-contract.ts`,
`CadCommandDock.tsx`, …) siguen sin estar en `git ls-files`, y que el contrato
OpenAPI no volvió a publicar `/v1/cad/vision` ni `/v1/cad/documents/{id}/intent`—.
Su cabecera cita al titular con todas sus letras: *«valle design no tiene que
tener AI»*, y dice qué se quiere en su lugar: *«mensajería, videollamada y
pantalla compartida — que es comunicación entre personas, no un modelo
proponiendo geometría»*.

**Consecuencia para este informe, y la asumo entera: no propongo ni una función
de IA.** Ni asistente, ni generación de geometría, ni «pregúntale al plano».
Proponerlo sería pedir que se relaje un gate, que es lo primero que esta casa
prohíbe.

Y conviene decir lo que el guardián **no** prohíbe, porque marca la frontera con
precisión: sigue existiendo `lib/cad/commands/registry.ts`, un intérprete
**determinista** de frases («coloca una puerta en 3000,2000») que no es IA —no
hay modelo, no hay inferencia, no sale un byte del navegador y la misma frase da
siempre el mismo resultado—. Esa pieza es la que `14 · §4.1` encontró sin aplicar
en Ctrl+K. No es asunto de este informe, pero sí lo es la lectura: **la única
palabra de la lente que el mercado usa para vender está deliberadamente vacía
aquí, lo que sube el precio de las otras cinco.** Si no vas a decir «IA», más te
vale que «enlace» y «cualquier dispositivo» sean verdad hasta el fondo.

---

## 2 · Lo que ya está construido y está bien

Lo digo primero y con nombres, porque en esta lente es fácil creer que no hay
nada, y hay mucho.

### 2.1 · El enlace de revisión está bien pensado, hasta en dónde viaja el token

`/revision` es una ruta **estática e idéntica para todo el mundo** y el token va
en el **fragmento** (`/revision#cadReview=…`), que no llega al servidor. La
cabecera de `app/revision/page.tsx` razona por qué: un segmento de ruta acabaría
en el log de acceso, en el `Referer` de cualquier enlace externo y en el historial
de todo proxy. Y `Layout3DEditor.tsx:711` (`takeReviewTokenFromLocation`) lo borra
de la barra con `history.replaceState` nada más leerlo y lo guarda en
`sessionStorage`, que muere con la pestaña. El esquema de seguridad del contrato
(`design-api.v1.yaml`, `securitySchemes.reviewToken`) confirma el resto: token
server-owned, sha256 en la fila, caducidad, revocación, y **cualquier ruta fuera
de `/v1/cad/review/*` responde `403 review_read_only`**.

Eso es mejor que la mayoría de los «share link» del mercado y AutoCAD no tiene
nada parecido.

### 2.2 · La presencia entre máquinas existe de verdad

`lib/cad/collab/server-presence-channel.ts` (SSE) más `presence-channel.ts`
(BroadcastChannel) alimentan **el mismo mapa de peers por `peerId`**
(`use-cad-presence.ts:55` y `:141`), con latido cada 4 s, TTL de 12 s medido con
**el reloj local** —razonado en `presence.ts`: dos equipos con diez minutos de
desfase son normales— y rechazo con motivo de todo latido que no sea finito. El
cursor viaja en coordenadas de dibujo y el encuadre también.

### 2.3 · La llamada es un producto, no una demo

`lib/cad/calls/call-ice-policy.ts` distingue el `disconnected` de blip de red
(4 s de gracia) del `failed` sin TURN, y **se rinde diciéndolo** en vez de dejar
«conectando» para siempre. `apps/api/src/modules/calls/call-ice-config.ts` lee
STUN/TURN de entorno y publica `turnConfigured` para que el cliente lo sepa
**antes**. La señalización es `@Sse` (cero `@nestjs/websockets` en el API, y el
controller lo dice), audio/vídeo/pantalla van punto a punto y **nada se persiste**,
con su razón escrita. `ESCALERA.md:377` publica hasta el residual medido: tras un
cruce de ofertas ninguno de los dos extremos llega a `checking`; 4 de 5 corridas.

### 2.4 · La mensajería ya nació con lo que a los comentarios les falta

`messaging_messages` tiene **`parent_message_id`** (hilos) y **`anchor` con el
mismo contrato JSON que `cad_comments.anchor`**, validado en el servidor con la
misma barrera. Los canales son por proyecto o directos, con `last_read_at` por
miembro. Es decir: la capacidad de **responder anclado al dibujo** ya está
construida — en la tabla equivocada para el cliente final (ver `11 · H9` y `H13`).

### 2.5 · La frontera del sin-red es ejecutable, no un párrafo

`app/(sw)/offline-capability-matrix.ts` clasifica cada familia de endpoint en
tres veredictos, con el flujo humano al lado, los archivos donde se comprueba y
lo que la persona VE cuando no hay red. Su spec falla si el contrato añade una
ruta sin veredicto o si la matriz clasifica una ruta fantasma. Recuento de hoy
(`grep -o 'veredicto: "[a-z-]*"' apps/web/src/app/\(sw\)/offline-capability-matrix.ts | sort | uniq -c`):
**9 funcionan sin red, 6 degradan y reintentan, 25 requieren backend.** Que ese
25 esté escrito y no escondido es exactamente la disciplina de la casa.

### 2.6 · El táctil tiene golden y, sobre todo, tiene lista de no-medidos

`e2e/golden/56-cad-tableta-en-obra.spec.ts` conduce el recorrido entero con
contactos —encuadrar con dos dedos, pellizcar, designar, apuntar y soltar,
pulsación larga, acotar— y **afirma sobre el documento que recibe el servidor**,
no sobre la interfaz. `docs/cad/evidence/touch-support.json` publica 30 gestos
vivos, 0 rotos, en tres perfiles de tableta, con unanimidad exigida entre tres
corridas en procesos separados, y con un apartado `alcance.noMedido` de once
entradas que empieza por «un dispositivo táctil REAL» y termina por «el modo 3D».
La honradez de ese artefacto es el mejor documento de esta lente.

### 2.7 · La puerta del integrador está abierta y dice la verdad

`/docs/api` es una **consola pública** generada desde el YAML del contrato
(`operations.generated.json` + `console-contract.spec.ts`, que falla si divergen),
razonada así: «quien evalúa si puede automatizar todavía no tiene cuenta». Y
`docs/cad/third-party-extension-policy.md` abre diciendo que no hay proceso de
revisión, ni mercado, ni firma de código, ni programa de desarrolladores — y lista
las cuatro superficies reales con sus límites, incluido el que más duele: **«No
hay claves de API todavía… es el hueco más citado por quien evalúa automatizar»**.

**Nada de lo que sigue contradice esto.** Todo lo que sigue es lo que falta
**encima**.

---

## 3 · El hallazgo que ordena todo lo demás: la ventaja no tiene dónde puntuar

Esta es la observación que justifica que este informe exista, y es aritmética
sobre ficheros del repositorio, no una opinión.

**La rúbrica mide a Valle Design contra AutoCAD en el terreno de AutoCAD.**
Recomputable con:

```
node -e "const r=require('./docs/competitive/rubric.json');
const g={}; for(const c of r.categories) g[c.group]=(g[c.group]||0)+c.points;
console.log(r.totalPoints, g)"
```

Las 36 filas se reparten en siete grupos —núcleo del plano entregable,
productividad profesional, extensibilidad e integración, frontera avanzada,
integridad y crecimiento, reconocimiento, los siete toolsets—. Léelas una a una:
**dibujo, selección, cotas, sombreado, texto, capas, bloques, DXF, layouts,
guardado, línea de comandos, xrefs, rendimiento, DWG, B-rep, sólidos, WASM, geo,
integridad, crecimiento, reconocimiento y siete toolsets.** De todas ellas, la
única cuyo criterio describe algo que la arquitectura de AutoCAD **no puede
tener** es `review` (5 puntos): «enlaces de revisión con hash, caducidad,
revocación y aislamiento por organización» y «comentarios anclados a la
geometría». `api-sdk`, `events` y `object-storage` (14 puntos entre las tres) son
cimientos de integración y las tres están declaradas de ámbito **`destino`**, no
`hoy`.

O sea: **de todo el tablero, cinco puntos premian la ventaja del navegador, y
ninguno premia que el producto se instale, que funcione en un teléfono, que el
plano entregado tenga URL, que dos personas se vean trabajar o que el cliente
entre sin cuenta.** Un trabajo que cierre los diez huecos de este informe mueve
la cifra de la rúbrica **en cero o casi cero**.

Y no es sólo la rúbrica:

- **`docs/parity/ESCALERA.md` no tiene ni un peldaño de esta lente.**
  `grep -inE "enlace|colabor|dispositivo" docs/parity/ESCALERA.md` no devuelve
  nada. Sus veinte olas se llaman «la cota y el plano inclinado», «el trabajo
  ajeno», «la arquitectura», «el mapa», «el plano escaneado», «la instalación
  eléctrica», «los bloques dinámicos»… todas de paridad CAD. La escalera es el
  documento que dice **qué se puede prometer**; si no hay peldaño, no hay promesa
  posible: ni «se comparte con un enlace» ni «funciona en la tableta» pueden
  subir de peldaño porque no están en la escalera.
- **`docs/execution/BACKLOG.md` no tiene ninguno de estos ítems.**
  `grep -inE "enlace|api key|pwa|safari|webkit|táctil|tableta|push|compartir|integrac" docs/execution/BACKLOG.md`
  sólo devuelve menciones de webhooks como transporte interno de comercial. Cero
  entradas de esta lente en 794 líneas de cola.

**Diagnóstico:** el instrumento de medida del proyecto está calibrado para
alcanzar a AutoCAD y no tiene ninguna casilla para **superarlo por donde AutoCAD
no puede seguir**. Eso explica, sin culpar a nadie, por qué las piezas están
todas construidas y ninguna terminada en producto: cada campaña las dejó al
llegar al punto donde ya no sumaban puntos.

**Recomendación primera, y es barata:** añadir a la rúbrica un grupo `browser`
con las filas que hoy no existen —*el plano entregado tiene dirección*, *el
invitado participa en vivo*, *el producto se instala y se abre sin red*, *el
dibujo es direccionable*, *hay integración desatendida*— y abrir en `ESCALERA.md`
la ola correspondiente. Sin eso, este informe es una lista de deseos; con eso, es
una cola con criterio de terminación. Y **el denominador de la rúbrica sube**, que
es lo honesto: hoy el 90 % se mide sobre un tablero que ignora la mitad del
producto que se está vendiendo.

---

## 4 · Los huecos, por lo que más duele

### H1 · El plano ENTREGADO no tiene dirección: publicar produce un recibo, no un enlace  · BLOQUEANTE

**Qué pasa hoy.** `POST /v1/cad/documents/{documentId}/publications` dice en su
propia descripción del contrato (`design-api.v1.yaml:1895`): *«El PDF multi-hoja
se genera en el cliente; el servidor registra el RECIBO auditable: nombre de
archivo, `sha256`, tamaño en bytes y las hojas (`paperSpaceIds`) incluidas»*. El
recibo es inmutable, entra en `publications` del documento, crea la fila
`cad_publications` y emite `design.document.published.v1`. Todo eso es
excelente **integridad**: prueba qué se publicó. Y no hay **ni un byte** del PDF
en el servidor: `cad-documents.repository.ts:513` crea la fila del recibo y nada
más. Concuerda con `10 · H11` («todo lo adjunto vive DENTRO del documento: no hay
almacén de activos») y con la fila `object-storage` de la rúbrica, cuyo tercer
criterio —adaptador S3/MinIO cableado— es el que falta.

**Dolor real.** El acto que cierra el trabajo de un despacho —entregar la lámina—
termina en la carpeta de descargas y viaja por correo como adjunto. **Es
exactamente lo que hace AutoCAD.** El producto que vive en una URL entrega un
archivo suelto. Y el cliente que recibe ese PDF no tiene forma de saber si es la
última versión: el `sha256` que lo probaría está en un recibo que él no puede ver.

**Coste.** Varios días (el puerto de blobs ya existe; falta el adaptador y la ruta
de lectura).

**Cómo se construye.**
1. Guardar los bytes por el **puerto de blob store que ya está desacoplado**
   (fila `object-storage`, criterio 1, ya conseguido), con el `sha256` que el
   recibo ya calcula como clave de contenido — deduplicación gratis.
2. `GET /v1/cad/publications/{publicationId}` autenticado por un token
   **server-owned del mismo diseño que el de revisión** (fragmento, sha256 en la
   fila, caducidad, revocación); reusar `cad_review_sessions` o una tabla
   hermana, no inventar un tercer mecanismo.
3. La página del enlace enseña, junto al plano: versión del documento, fecha,
   `sha256` corto, hojas incluidas y **el manifiesto de pérdidas** si lo hubo —
   la casa ya exige que el manifiesto viaje con la publicación por lotes
   (`integrity`, criterio 3).
4. Cuando el documento cambia después de publicar, el enlace **lo dice**: «esta
   lámina es de la versión 41; el plano va por la 44». No la actualiza sola —una
   entrega es una entrega—, pero no deja mentir al papel.

**Cómo se verifica.** Golden en `e2e/real/` con API real y PostgreSQL: publicar,
abrir el enlace **en un contexto de navegador sin sesión**, afirmar que el
`sha256` de los bytes servidos es idéntico al del recibo, revocar y afirmar `404`
en la siguiente petición. Más el spec de aislamiento: un recibo del inquilino A
no se sirve con un enlace del B.

---

### H2 · El invitado del enlace es INVISIBLE entre máquinas, y no puede entrar en la llamada  · BLOQUEANTE

**Qué pasa hoy.** `use-cad-presence.ts:141`:

```ts
const serverTransport: CadPresenceTransport | null = guest
  ? null
  : openCadPresenceTransport({ …, factory: serverPresenceChannel });
```

La razón está escrita en la cabecera y es técnica y correcta: *«`EventSource` no
puede mandar `X-Review-Token`, así que esa presencia sigue sin fanout entre
máquinas — "todavía no", declarado, no disimulado»*. Al invitado le queda sólo
`BroadcastChannel`, que sólo alcanza **a sus propias pestañas**.

Y la llamada le está cerrada por construcción: `calls.controller.ts` lleva
`@RequirePermissions('cad:view')` en todo el controller, y el token de revisión
—por el propio contrato— sólo autentica `/v1/cad/review/*`; cualquier otra ruta
es `403 review_read_only`.

**Dolor real.** La frase que vende un CAD en el navegador es «mándale el enlace a
tu cliente y repasen el plano juntos». Hoy: el cliente abre el enlace, el
arquitecto **no lo ve entrar**, el cliente **no ve al arquitecto**, y para hablar
tienen que llamarse por teléfono mientras miran pantallas que ninguno de los dos
sabe si están en el mismo sitio. La presencia y la llamada —dos subsistemas
construidos con esmero, §2.2 y §2.3— **existen para todos menos para la única
persona a la que se le manda un enlace**.

**Coste.** Varios días.

**Cómo se construye.** El obstáculo real es una sola cosa: `EventSource` no
manda cabeceras. Tres caminos y uno claramente mejor:
1. **(Recomendado) Canjear el token por una cookie de sesión de revisión.** Al
   canjear `X-Review-Token` en `/v1/cad/review/context`, el servidor emite una
   cookie **HttpOnly, `SameSite=Lax`, `Secure`, con el prefijo `__Host-`**,
   ámbito de ruta `/v1/cad/review`, con la misma caducidad y la misma revocación
   que la fila de la sesión. `EventSource` la manda sola por ser mismo origen. El
   token en claro sigue sin salir del fragmento; la credencial ambiental que se
   crea es **más estrecha** que la de sesión normal, no más ancha, y no habilita
   ninguna mutación fuera de comentar (que ya es `POST` con su propio guard).
2. Un `fetch` con `ReadableStream` en vez de `EventSource` — funciona y sí manda
   cabeceras, pero hay que reimplementar reconexión y backoff, que
   `server-presence-channel.ts` **ya tiene resueltos** (detecta `readyState ===
   CLOSED` y reabre de 1 s a 15 s). Tirar eso sería caro y peor.
3. Token en la query del stream: **no**, por lo mismo que la ruta de revisión no
   lleva el token — acabaría en los logs.

Con la cookie, lo demás es cableado: el servidor fija `guest: true` en el latido
(**nunca el cliente**), y la llamada obtiene un permiso derivado
`review:call` desde la fila de la sesión, con tope de un invitado por sala y sin
pantalla compartida entrante. Si el titular no quiere invitados en la llamada,
entonces el producto tiene que **decirlo** en la página del enlace, no callarlo.

**Cómo se verifica.** Golden en `e2e/real/` con dos contextos de navegador: uno
con sesión, otro **sin cuenta** abriendo el enlace; afirmar que cada uno ve el
cursor del otro moverse a coordenadas de dibujo conocidas; revocar la sesión de
revisión y afirmar que el stream del invitado muere en menos de un latido. Y un
spec de que el `guest` del latido lo pone el servidor y un latido con
`guest: false` desde el contexto de revisión se rechaza.

---

### H3 · Ningún punto del interior del dibujo tiene URL  · ALTA

**Qué pasa hoy.** `app/studio/[documentId]/page.tsx` **no lee ni un parámetro de
consulta ni de fragmento**: `grep -n "useSearchParams\|searchParams" apps/web/src/app/studio` no
devuelve nada. El único estado que viaja por URL en todo el editor es el token de
revisión (`Layout3DEditor.tsx:711`) y dos interruptores de diagnóstico
(`CadDiagnosticsReadout.tsx:69`, `render-pipeline-preference.ts:80`). No hay
enlace a una hoja, ni a una vista, ni a una entidad, ni a un comentario, ni a un
estado de capas.

**Dolor real.** «Mira el arranque de la escalera del eje C» se resuelve hoy con
una captura de pantalla por WhatsApp. En un CAD de escritorio eso es inevitable:
no hay dirección que mandar. En el navegador **la dirección es gratis** y es la
segunda cosa que cualquiera espera de una aplicación web después de que cargue.
Además, sin esto **la notificación de H7 no tiene a dónde llevar** y el
comentario del cliente no tiene permalink.

**Coste.** Un día para la lectura/escritura del fragmento; varios más para que
cada superficie publique su estado.

**Cómo se construye.** Un módulo único `lib/cad/deep-link.ts` con el mismo
criterio que ya se usó para el token: **fragmento, no consulta** (no viaja al
servidor, no entra en logs ni en `Referer`). Gramática corta y versionada:
`#v=1&hoja=<paperSpaceId>&vista=<cx,cy,escala>&sel=<entityId>&com=<commentId>`.
Un botón «Copiar enlace a esta vista» que escribe el fragmento con lo que hoy
está activo, y un lector en la apertura del documento que restaura en este orden:
hoja → encuadre → selección → comentario abierto. **Fix-or-hide en la
degradación:** un `entityId` que ya no existe no puede abrir el plano en silencio
en otra parte; tiene que decir «el enlace apunta a algo que ya no está en el
dibujo», que es información que `comment-anchor.ts` ya declara querer dar.

**Cómo se verifica.** Golden que abre un enlace profundo y afirma la
transformación mundo↔pantalla dentro de tolerancia y la entidad designada; golden
del caso degradado, que afirma el aviso visible y que **no** hay salto de cámara.
Y un spec de la gramática: un fragmento con `v=2` desconocido se ignora entero en
vez de aplicarse a medias.

---

### H4 · Se le dice a Google que Valle funciona en Safari, y nada corre nunca en WebKit  · ALTA, y es una regla de la casa

**Qué pasa hoy.** `apps/web/src/lib/seo/structured-data.ts:61` emite, dentro del
JSON-LD de `SoftwareApplication` que la portada sirve (`app/page.tsx:341`):

```ts
operatingSystem: "Navegador web (Chrome, Edge, Firefox, Safari)",
```

Y `apps/web/playwright.config.ts` declara **dos** proyectos: `chromium` y
`firefox`. `grep -rin "webkit" .github apps/web/e2e` no devuelve un solo proyecto,
lane ni smoke. El propio `touch-support.json` lo pone en su lista de no-medidos:
*«Safari de iPadOS y su gestión propia de gestos: aquí sólo corre Chromium»*. No
existe en `docs/` ningún documento de navegadores compatibles: **esa línea del
JSON-LD es la única declaración pública de compatibilidad del producto**, y va
dirigida a un buscador, que la muestra como si el producto la hubiera firmado —
razonamiento que el propio fichero usa, dos párrafos más arriba, para negarse a
publicar un precio inventado.

AGENTS.md, «Delicate files»: *«No button, import format, price, security statement
or compatibility claim may be shown unless the backing behavior and relevant
boundary are tested»*. Esto es una **afirmación de compatibilidad sin prueba**, y
encima es la que más importa: **el iPad no tiene otro motor**. Todo el discurso de
«la tableta en la obra» descansa sobre un navegador que nunca se ha ejecutado.

**Coste.** Horas para la parte honesta; un día para la lane.

**Cómo se construye.**
1. **Hoy, fix-or-hide:** o se recorta el claim a `Chrome, Edge, Firefox` —lo
   probado— o se añade la lane. Recortar no es rendirse: es dejar de afirmar lo
   que no se sostiene, y es reversible en el mismo commit en que la lane exista.
2. **La lane:** un proyecto `webkit` con un carril de humo de seis casos, no la
   suite entera (que duplicaría runner sin necesidad): abrir el estudio, dibujar
   una línea, guardar contra la API, acotar, trazar a PDF y abrir un enlace de
   revisión. Con la misma política que ya existe para Firefox
   (`ESCALERA.md:304`): bajo demanda en rama por etiqueta del commit, obligatorio
   en `main`.
3. **El gate que impide que vuelva a divergir**, y es el que de verdad cierra
   esto: un spec que lea los proyectos de `playwright.config.ts` y la cadena
   `operatingSystem` del JSON-LD y **falle si no coinciden**. Es el mismo patrón
   con el que `console-contract.spec.ts` impide que la consola prometa una
   operación retirada.

**Cómo se verifica.** El propio spec de coincidencia, más la lane en verde. Y
mientras la lane no exista, el claim recortado: **cero afirmaciones sin evidencia
es la fila que más pesa comercialmente** (`integrity`, 13 puntos).

---

### H5 · La instalación existe a medias y el producto no la ofrece nunca  · ALTA

**Qué pasa hoy.** `app/manifest.ts` declara `display: "standalone"`,
`start_url: "/dashboard"`, `scope: "/"`, `lang: "es-MX"`, tres iconos y las
categorías. Y **no declara**: `display_override`, `shortcuts`, `file_handlers`,
`share_target`, `protocol_handlers` ni `launch_handler`. Los iconos son
`/icon` (32×32, `app/icon.tsx:24`), `/apple-icon` (180×180,
`app/apple-icon.tsx:19`) y un SVG con `sizes: "any"` — **ningún PNG de 192 ni de
512**. En todo el árbol no hay una sola aparición de `beforeinstallprompt`
(`grep -rn "beforeinstallprompt" apps/web/src` → vacío): el producto **nunca**
invita a instalarse. Y el service worker registra `install`, `activate`,
`message` y `fetch` (`service-worker-source.ts:246-303`) — no hay `push`, que es
el H7.

**Dolor real.** «Sin instalar nada» está en la portada dos veces
(`app/page.tsx:205` y `:360`) y es verdad. Pero para un CAD que se usa ocho horas
al día, **poder** instalarse —ventana propia sin barra de direcciones, icono en el
dock, arranque desde el escritorio— no contradice la promesa: la completa. Hoy el
producto se queda en «es una pestaña», y esa es la mitad de la ventaja que el
navegador regala.

**Coste.** Un día, en cuatro pasos independientes.

**Cómo se construye, en orden de valor por hora:**
1. Iconos de 192 y 512 px **generados desde `components/brand/logo-geometry.ts`**
   por `scripts/brand/build-brand-assets.mjs` —que ya gobierna el logo, el
   favicon, el icono iOS y las tarjetas sociales con un `--check` que impide la
   deriva—, más `purpose: "any maskable"` (ver D3).
2. `shortcuts` con dos entradas: «Nuevo plano» y «Mis planos». Aparecen al pulsar
   largo el icono; cuestan seis líneas.
3. Una invitación a instalar **discreta y descartable**, en el tablero y no en el
   estudio, sólo cuando `beforeinstallprompt` dispara de verdad (fix-or-hide: si
   el navegador no lo ofrece, no se pinta un botón que no hace nada).
4. `file_handlers` para `.dxf` más `window.launchQueue`: doble clic en un DXF del
   escritorio abre Valle Design con el archivo dentro. **Con su límite declarado**
   al lado, porque es Chromium/Edge y no Safari ni Firefox.

**Cómo se verifica.** Un spec del manifiesto que afirme que **cada icono
declarado responde 200 con exactamente el tamaño que declara** —la misma técnica
con la que `service-worker-policy.ts` verificó sus seis entradas de precacheo
antes de declararlas—; un golden que afirme que el atajo lleva a la ruta; y para
el punto 4, un golden con `launchQueue` inyectado y su fila en la matriz de
capacidades.

---

### H6 · Nadie se entera de nada con la pestaña cerrada  · ALTA

**Qué pasa hoy.** Cero `Notification`, cero `PushManager`, cero `showNotification`
y ningún `addEventListener("push")` en el service worker. Los comentarios se
descubren por sondeo cada 5 s **con el dibujo abierto** (`11 · H9`), y los únicos
eventos de dominio publicados son `design.document.saved` y
`design.document.published`.

**Complemento, no repetición.** `11 · H9` propone —y hace bien— el evento
`design.comment.created` por la caja de salida y un correo transaccional. Lo que
aquí falta es **la otra mitad, la que sólo tiene el navegador**: el aviso llega al
teléfono del arquitecto **sin instalar una aplicación, sin tienda y sin proyecto
de móvil**, que es precisamente lo que AutoCAD resuelve cobrando una app aparte.

**Coste.** Varios días, **después** de H5 (en iOS, Web Push exige la PWA
instalada, 16.4+ — y ese es un límite que se declara, no que se esconde).

**Cómo se construye.** Sobre la caja de salida que ya existe, firmada y con
idempotencia: una tabla de suscripciones por usuario y dispositivo, par de claves
VAPID en entorno (nunca en código, como `CALLS_TURN_*`), un `push` en el service
worker y un `notificationclick` que abre **el enlace profundo de H3**. Regla
férrea heredada del outbox: **el cuerpo del comentario no viaja en la
notificación** —el invariante de la casa es no registrar cuerpos, destinatarios ni
identificadores de inquilino—; viaja «tienes un comentario nuevo en *Casa
Zapata · planta baja*» y la dirección.

**Cómo se verifica.** Un caso en el arnés de la caja de salida que afirme la firma
y la idempotencia del nuevo evento; un spec que afirme que **el payload de push no
contiene el cuerpo del comentario ni el id de inquilino**; y la fila
correspondiente en la matriz de sin-red.

---

### H7 · Una integración desatendida tiene que fingir ser un navegador  · ALTA

**Qué pasa hoy.** `design-api.v1.yaml` declara exactamente **dos** esquemas de
seguridad: `sessionCookie` (opaca, HttpOnly, con `X-CSRF-Token` en las
mutaciones) y `reviewToken` (sólo `/v1/cad/review/*`). El SDK generado lo
confirma desde el otro lado: `packages/design-sdk/src/compat.spec.ts:351` afirma
que la cabecera `Authorization` **es `null`**. No hay clave de API, ni token de
servicio, ni credencial de cliente.

El límite **está declarado** en `third-party-extension-policy.md` con estas
palabras: *«una integración desatendida tiene que mantener viva una sesión, lo
cual es una limitación real y no un descuido de documentación»*. La integridad
está intacta; lo que falta es la capacidad, y no está en la cola de nadie (§3).

**Dolor real.** El despacho que quiere que su ERP cree el documento del proyecto
nuevo, o que un `cron` exporte el DXF de cada plano aprobado, hoy tiene que
guardar una contraseña de una persona y renovar cookies. Eso no se hace: se
abandona la integración. Es **la fila `api-sdk`, de ámbito destino, con la consola
pública ya construida y la puerta cerrada al final del pasillo.**

**Coste.** Varios días.

**Cómo se construye.** Claves de API **de la organización**, no de la persona:
`POST /v1/identity/api-keys` devuelve el secreto **una sola vez** (prefijo visible
+ secreto; en la fila sólo el hash con el mismo algoritmo que ya usa identidad);
esquema `bearerAuth` en el contrato; ámbitos derivados **en el servidor** de un rol
—nunca del cliente, invariante de la casa—; el mismo limitador de tasa por cuenta
que ya existe sobre PostgreSQL; `lastUsedAt` y revocación inmediata. Y un detalle
que hay que escribir en el contrato o se convierte en agujero: **una petición con
`Bearer` no lleva CSRF y no debe exigirlo** (no hay credencial ambiental que
robar), mientras que una con cookie lo sigue exigiendo entero.

**Cómo se verifica.** Spec de que una clave no puede exceder los permisos del rol
del que deriva; golden de que una clave del inquilino A recibe `404` sobre un
documento del B; spec de que una petición `Bearer` **sin** CSRF se acepta y una
con cookie **sin** CSRF se rechaza; y la entrada correspondiente en la política de
extensiones, que hoy dice que esto no existe y tendría que decir qué existe y con
qué límite.

---

### H8 · El webhook lo configura el operador; el cliente no puede darse de alta  · MEDIA

**Qué pasa hoy.** El destino es una **variable de entorno del despliegue**:
`OUTBOX_DOMAIN_WEBHOOK_URL` y `OUTBOX_EMAIL_WEBHOOK_URL`, leídas en
`webhook-outbox.transport.ts:102` y `:107`. Un solo receptor para todo el
despliegue, igual para todos los inquilinos. La política lo dice sin adornos:
*«no hay panel para que un tercero se dé de alta solo»*.

**Dolor real.** «Integración» en 2026 significa que el cliente pega su URL y
elige eventos. Aquí significa escribirle al operador. La fila `events` de la
rúbrica sigue sin su punto por «evidencia operacional sostenida y replay
auditado» — pero incluso con ese punto ganado, **la integración sigue sin ser del
cliente**.

**Coste.** Varios días, **después** de H7 (sin clave de API, el cliente no puede
gestionar sus propios endpoints por programa; con panel, sí, pero medio camino).

**Cómo se construye.** Tabla `cad_webhook_endpoints` por inquilino (URL, secreto
propio, lista de eventos, activo, creado por), el despachador abanica por
inquilino reusando leases, reintentos y cola muerta **tal cual están**; guarda
anti-SSRF obligatoria (rechazar rangos privados, `localhost`, IPv6 mapeado y
resolver **una** vez para evitar rebinding); y un registro de entregas visible
para el cliente con código de respuesta y latencia — sin cuerpos, como manda el
invariante.

**Cómo se verifica.** Spec del guarda anti-SSRF con la tabla de casos; spec de
aislamiento (un endpoint del inquilino A jamás recibe un evento del B); y el
artefacto de replay que ya existe, extendido a dos inquilinos.

---

### H9 · Cero cifras de un dispositivo real, y el aviso de pantalla estrecha promete un umbral que nada sostiene  · MEDIA

**Qué pasa hoy.** El golden táctil y su artefacto son ejemplares (§2.6) **y sus
propias palabras son el hueco**: *«Nadie debe citar este archivo como "funciona en
tableta": dice "funciona con táctil emulado en Chromium"»*. Los tres perfiles
medidos son tabletas (1024×707, 768×963, 870×963); **no hay perfil de teléfono**,
aunque el aviso de pantalla estrecha se dispara por debajo de 1100 px y por tanto
en todos ellos. Y `CadSmallScreenNotice.tsx:39` afirma en su comentario que
`CAD_DOCK_BREAKPOINT_PX` es *«el mismo umbral que el CSS que oculta los muelles… Si
alguien mueve uno sin el otro, el aviso mentiría — por eso está escrito aquí»* —
pero la constante **no la consume nadie**: el editor lleva `max-[1100px]:hidden`
escrito a mano en `Layout3DEditor.tsx:15482` y `:16403`. El razonamiento es
correcto y el mecanismo que lo sostiene no existe (ver D4).

**Dolor real.** «Desde la obra con un navegador» (`app/page.tsx:257`) es la
promesa, y el aparato con el que se cumple —un iPad— es exactamente el que nunca
se ha probado (H4). Lo que hay medido es sólido; lo que falta es el aparato.

**Coste.** Horas para el gate del umbral; un día para el perfil de teléfono; el
dispositivo real es una decisión del titular, no de código.

**Cómo se construye y se verifica.** (a) Un spec que lea `Layout3DEditor.tsx`,
extraiga los `max-[<n>px]:hidden` de los dos muelles y afirme `n ===
CAD_DOCK_BREAKPOINT_PX` — barato, y convierte un comentario en un gate. (b) Un
cuarto perfil de 390×844 en `touch-support-probe.mts`, que es donde el aviso
importa. (c) Para el aparato real: una corrida manual en un iPad con captura,
publicada como artefacto con su máquina declarada, exactamente como se hizo con
`slo-navegador.mjs`, que **se niega a publicar** cifras de GPU en el contenedor
(`ESCALERA.md:503`). El precedente de negarse ya está escrito; falta usarlo a
favor una vez.

---

### H10 · El navegador es un sistema operativo y Valle no le habla: ni disco, ni portapapeles del sistema, ni arrastrar un archivo al lienzo  · MEDIA

**Qué pasa hoy.** Cero `showOpenFilePicker`, cero `showSaveFilePicker`, cero
`FileSystemFileHandle` en todo `apps/web/src`. El único `onDrop` del editor es
para reordenar espacios (`Layout3DEditor.tsx:17825`): **arrastrar un DXF al lienzo
no hace nada**. `navigator.clipboard` sólo se usa para `writeText` (enlace de
revisión, token, CSV de mediciones, secreto de MFA); el portapapeles de geometría
es interno y `ESCALERA.md:191` lo declara con precisión: *«No toca el portapapeles
del SISTEMA… ni pegar en otra pestaña del navegador. Todavía no.»*

**Dolor real.** El viaje de ida y vuelta con un DXF es «descargar → buscarlo en
Descargas → volver a subirlo». Un CAD de escritorio guarda en el sitio de donde
abrió. Esta es la única parte de la lente donde **el navegador es hoy peor**, y es
también donde el navegador **ya trae la solución**: File System Access da
identidad de archivo y guardado en sitio en Chromium y Edge.

**Coste.** Varios días.

**Cómo se construye.** Un adaptador `lib/cad/fs/local-file-handle.ts` detrás de
comprobación de capacidad, con caída declarada a `<input type=file>` + descarga.
**Fix-or-hide estricto:** la entrada «Guardar en el archivo original» sólo se
pinta cuando hay handle; en Safari y Firefox no aparece y no se disculpa. Más una
zona de soltar sobre el lienzo que acepte lo que el validador ya acepta (y no lo
que el `accept` diverge: `10 · D-5`).

**Cómo se verifica.** Golden en Chromium con la API sustituida por un doble que
afirma que se escribió **en el mismo handle** y no se descargó nada; spec de la
caída; y la fila correspondiente en la matriz de capacidades, que hoy no
contempla el disco local.

---

## 5 · Defectos concretos, con fichero y línea

### D1 · Al cliente se le afirma que no hay nadie mirando, y sí lo hay  · el peor de los seis

`use-cad-presence.ts:199-203` calcula:

```ts
connected:
  (channelAvailable || (serverChannelAvailable && !guest)) && enabled && !!documentId,
```

con el comentario *«Con cualquiera de los dos, "nadie en la lista" es una
afirmación real»*. Para un invitado de enlace, `serverChannelAvailable && !guest`
es `false` — pero `channelAvailable` es `true` en cualquier navegador moderno
(`presence-channel.ts:83` sólo prueba que `BroadcastChannel` se construya). Luego
`connected` sale **true** con un transporte que sólo alcanza a las otras pestañas
del propio invitado.

Y `CollabThreadPanel.tsx:94-101`, el panel que el invitado tiene delante
(`ReviewLinkClient.tsx:252` lo monta), pinta entonces:

> **«Nadie más en este documento ahora mismo.»**

mientras el arquitecto está en ese mismo plano desde otra máquina. **Es una
afirmación falsa mostrada al usuario en la superficie de cara al cliente**, que es
justo lo que la fila `integrity` existe para impedir. El componente hizo lo
correcto —distinguir «no hay transporte» de «no hay nadie»—; el cálculo de
`connected` es el que miente, porque suma un transporte que no puede ver a nadie.

**Arreglo mínimo, hoy y sin esperar a H2:** `connected` debe exigir el transporte
**capaz de ver a otras personas** —`serverChannelAvailable && !guest`— y el panel,
para el invitado, decir la verdad concreta: «No se puede mostrar quién más está
viendo este plano desde este enlace». Cuando H2 aterrice, la frase desaparece
sola porque la condición pasa a ser cierta.

### D2 · La única declaración pública de compatibilidad nombra un motor que nunca se ejecuta

`lib/seo/structured-data.ts:61` → ver H4. Es un defecto y no sólo un hueco porque
la casa prohíbe expresamente mostrar una afirmación de compatibilidad sin la
prueba y la frontera al lado, y porque el mismo fichero, veinte líneas antes,
argumenta esa misma disciplina para negarse a publicar un precio.

### D3 · El manifiesto comenta un `maskable` que el código no declara

`app/manifest.ts:45-47`:

```ts
// `any maskable` deja que Android recorte el icono con la forma del
// lanzador que tenga el usuario: el fondo sólido aguanta el recorte.
purpose: "any",
```

El comentario describe `any maskable`; el valor es `any`. Consecuencia real: el
lanzador de Android **no** puede enmascarar el icono y lo mete en una placa
blanca, que es el aspecto de «página web con atajo» que la cabecera del propio
fichero dice querer evitar. Un comentario que describe un comportamiento que el
código no tiene es peor que ningún comentario: el siguiente lector no vuelve a
mirar.

### D4 · Una constante que dice ser el umbral compartido y no la consume nadie

`CadSmallScreenNotice.tsx:39` exporta `CAD_DOCK_BREAKPOINT_PX = 1100` con el
razonamiento de que si alguien mueve uno sin el otro «el aviso mentiría». El
`grep` del identificador en todo `apps/web/src` devuelve **dos líneas, ambas del
mismo fichero**, mientras `Layout3DEditor.tsx:15482` y `:16403` llevan
`max-[1100px]:hidden` literal. El acoplamiento que el comentario promete no
existe. Arreglo en §H9(a).

### D5 · La cabecera de `presence.ts` describe un producto anterior

`lib/cad/collab/presence.ts:9-14` afirma: *«El transporte es un puerto
(`presence-channel.ts`) y hoy tiene un solo adaptador —`BroadcastChannel`, que
difunde entre PESTAÑAS DE ESTE navegador—… sin un canal en el servidor, la
presencia entre máquinas distintas no existe todavía.»* Es falso desde que
`server-presence-channel.ts` existe y `use-cad-presence.ts:55` lo consume; la
cabecera de ese hook ya describe los **dos** transportes. Duele más de lo que
parece porque `presence.ts` es el fichero al que va quien quiere saber si hay
presencia en vivo, y le dice que no la hay.

### D6 · El invitado ve una promesa de alcance que el producto no puede cumplir del todo

`ReviewLinkClient.tsx:274`: *«Este enlace da acceso únicamente a este plano.»* Es
cierto y está bien dicho. Lo que no se dice, y el cliente no puede adivinar, es lo
que **no** trae el enlace: sólo espacio modelo, nunca la lámina (`11 · H8`), sin
presencia real (D1), sin poder responder a su propio comentario (`11 · H9`) y sin
poder descargarse el PDF (H1). Cuatro límites que el usuario descubre uno a uno.
La casa ya tiene el patrón para esto —la matriz de capacidades, el manifiesto de
pérdidas, la columna de límites— y esta superficie, que es la que ve **quien
paga**, no lo usa.

---

## 6 · La apuesta ganadora

> **El plano entregado deja de ser un archivo y pasa a ser una dirección: una URL
> que el cliente abre en el teléfono sin cuenta y sin instalar nada, que lleva la
> versión, el `sha256` y las pérdidas declaradas al lado del dibujo, que se
> revoca, que caduca, y en la que el arquitecto y el cliente **se ven** mirando el
> mismo punto mientras hablan.**

### Por qué ésta y no otra

**AutoCAD estructuralmente no puede.** Su entrega es un archivo: un `.dwg` en una
carpeta o un PDF adjunto a un correo. Para que ese archivo tenga dirección,
Autodesk necesita **vender otro producto** (Docs, el visor, otra suscripción, otra
alta de usuario para el cliente del despacho). El cliente final del arquitecto
mexicano no va a crear una cuenta de Autodesk para ver su casa. **Un enlace que
se abre en el teléfono del cliente sin cuenta es una frase que AutoCAD no puede
decir con ningún precio.**

**Y aquí no hay que inventar casi nada.** Las piezas están todas, probadas:

1. **El recibo de publicación** con `sha256`, tamaño y hojas incluidas, inmutable
   y server-managed, con su `409` de CAS y su evento de dominio
   (`design-api.v1.yaml:1895`, `cad-documents.repository.ts:513`). Es la prueba de
   **qué** se entregó; hoy no tiene los bytes al lado.
2. **El puerto de blob store desacoplado**, ya conseguido en la rúbrica; falta el
   adaptador.
3. **El mecanismo de enlace server-owned entero**: hash, caducidad, revocación,
   aislamiento por organización, token en el fragmento, `403 review_read_only`
   fuera de su superficie. No hay que diseñarlo: hay que reusarlo.
4. **El manifiesto de pérdidas**, que la casa ya obliga a que viaje con el
   documento, con el DXF y con la publicación por lotes.
5. **Un codificador de QR propio y probado** (`lib/qr/qr-encode.ts` con su
   oráculo y su round-trip), hoy usado sólo para el alta de MFA. El enlace de la
   lámina impreso como QR en el cajetín es **el plano de papel de la obra
   apuntando a su versión viva**, y no cuesta una dependencia nueva.
6. **La presencia con cursor y encuadre** y **la llamada con política ICE**, que
   sólo necesitan que el invitado tenga transporte (H2).

### El orden, que también es el argumento

**H1** (los bytes y el enlace) → **H2** (el invitado existe y se le ve) → **H3**
(el enlace apunta a un punto, no a un documento) → **H6** (con la pestaña
cerrada, avisa) → **H5** (y para que avise en un iPhone, se instala). Cinco
huecos, un solo relato, y cada uno deja al siguiente más barato.

### La frase de venta, que es lo que decide un cambio de suscripción

> En AutoCAD entrego un PDF por correo y a los tres días nadie sabe si el que
> tiene el maestro de obra es el bueno. En Valle Design entrego una dirección: el
> cliente la abre en su teléfono sin instalar nada, la lámina dice de qué versión
> es y qué se perdió al exportarla, yo veo su cursor sobre el eje que no entiende
> y se lo explico por la llamada que ya está dentro del plano — y el día que
> caduque, caduca.

### Lo que NO es esta apuesta, dicho para que nadie lo lea de más

No es co-edición simultánea: el guardado sigue siendo cola de un escritor con CAS
y `409`, que es la decisión correcta para un CAD y está probada. No es BIM. Y no
es IA: §1.

---

## 7 · Resumen para quien decide

| # | Hueco | Severidad | Esfuerzo |
|---|---|---|---|
| H1 | Publicar produce un recibo, no un enlace: la entrega sigue siendo un archivo adjunto | bloqueante | varios días |
| H2 | El invitado del enlace es invisible entre máquinas y no puede entrar en la llamada | bloqueante | varios días |
| H3 | Ningún punto del dibujo tiene URL: no hay enlace a una hoja, una vista ni un comentario | alta | un día + |
| H4 | Se afirma compatibilidad con Safari y nada corre nunca en WebKit | alta | horas / un día |
| H5 | La PWA existe a medias y nunca se ofrece: sin iconos de instalación, sin atajos, sin manejador de archivos | alta | un día |
| H6 | Sin Web Push: con la pestaña cerrada no llega nada | alta | varios días |
| H7 | Sin claves de API: una integración desatendida tiene que fingir ser un navegador | alta | varios días |
| H8 | El webhook lo configura el operador por variable de entorno, no el cliente | media | varios días |
| H9 | Cero medidas en un dispositivo real; el umbral del aviso de pantalla estrecha no está acoplado a nada | media | horas + decisión |
| H10 | Ni disco, ni portapapeles del sistema, ni arrastrar un archivo al lienzo | media | varios días |

Defectos: **D1** (se le dice al cliente que no hay nadie mirando y sí lo hay),
**D2** (claim de Safari sin prueba), **D3** (`maskable` comentado y no
declarado), **D4** (constante de umbral sin consumidores), **D5** (cabecera de
`presence.ts` caducada), **D6** (el enlace no declara sus cuatro límites).

**Y por encima de los diez, el de §3:** ni la rúbrica, ni `ESCALERA.md`, ni
`BACKLOG.md` tienen una sola casilla para nada de esto. Mientras eso siga así,
cerrar cualquiera de los diez huecos **baja** el rendimiento aparente de la
sesión que lo haga, porque no mueve la cifra. Ése es el hueco que hay que cerrar
primero, y se cierra escribiendo filas, no código.

**Lo primero que yo haría el lunes, en este orden:** (1) **D1**, media hora, y es
una afirmación falsa delante del cliente; (2) **H4** en su versión honesta
—recortar el claim y escribir el spec que ata el JSON-LD a los proyectos de
Playwright—, medio día; (3) **D3, D4 y D5**, un rato cada uno, los tres son
comentarios que mienten sobre su propio código; (4) abrir la ola de esta lente en
`ESCALERA.md` y las filas en la rúbrica (§3), medio día; (5) **H1**, que es la
apuesta y la única de la lista que cambia la conversación comercial.

Ninguna de estas conclusiones es «nunca». Todas son «todavía no».

---

*Informe escrito en español. Todas las rutas son relativas a la raíz del
monorepo. Ninguna línea de código de producto se modificó durante esta auditoría.
Las cifras de la rúbrica no se copian aquí: se recomputan con
`node scripts/cad/rubric.mjs`.*
