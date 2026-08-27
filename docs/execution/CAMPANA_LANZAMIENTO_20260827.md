# Campaña de lanzamiento gratuito — barrido funcional total

**Fecha de arranque:** 27 de agosto de 2026 · **Base:** `main` @ `9592869`
(tras COMMERCIAL-RC1 y la campaña de paridad) ·
**Rama:** `claude/valle-design-launch-campaign-yhxse6`

> Bitácora VIVA mientras la campaña corre. Al publicar
> `INFORME_LANZAMIENTO_20260827.md` este archivo se archiva a
> `docs/history/execution/` en el mismo commit (regla del cierre de ramas,
> `AGENTS.md`).

## La vara

Un arquitecto que no conocemos, en una computadora que no controlamos, dibuja
una planta, la acota, la imprime a PDF, la exporta a DXF, y **los tres archivos
dicen la verdad**. Lo que no aguante esa vara se arregla; lo que no se pueda
arreglar hoy, **se oculta**.

## La regla que ordena todo: FIX-OR-HIDE

Cada capacidad visible pasa por una de tres puertas, y sólo tres:

| Puerta | Significado |
| --- | --- |
| **VERIFICADA** | Funciona, con evidencia numérica. Se queda. |
| **ARREGLADA** | Tenía defecto, se corrigió, hay evidencia nueva. |
| **OCULTA** | No se pudo verificar ni arreglar hoy: desaparece de la superficie hasta ganar su evidencia, con entrada en el backlog. |

Prohibido el cuarto estado: **visible y no verificada**.

## Reglas de no-detención

1. Nunca preguntar. Decidir lo más conservador, bitácora, seguir.
2. Ítem bloqueado > 25 min → bitácora + backlog + siguiente.
3. Esta bitácora se actualiza al cerrar cada ítem. Si el contexto se compacta,
   se relee primero.
4. Tras cada ola: suite completa + goldens con árbol quieto + push.
5. Prohibido: relajar gates, tocar identificadores persistidos
   (`IDENTITY.md` / ADR-0010), renombrar `data-testid`, agregar funciones nuevas.

## Cola

| Ola | Ítem | Estado |
| --- | --- | --- |
| 0 | 0.1 Trial de 90 días como experiencia de producto | **cerrado** |
| 0 | 0.2 Modo solo-lectura post-expiración (regla de oro: sin rehenes) | **cerrado** |
| 0 | 0.3 Aviso de expiración digno (banner + correos 7/1 + mensaje final) | **cerrado** |
| 0 | 0.4 Embudo de registro sin tarjeta medido contra el stack real | **cerrado** |
| 1 | 1.1 Geometría de construcción contra oráculo analítico | **cerrado** |
| 1 | 1.2 Modificación (TRIM/FILLET/OFFSET/ARRAY/MIRROR/ROTATE/SCALE) | **cerrado** |
| 1 | 1.3 Medición, interrogación y valor de las cotas | **cerrado** |
| 1 | 1.4 Ángulos en TODAS las fronteras entre subsistemas | **cerrado** |
| 1 | 1.5 Unidades y escala de punta a punta | **cerrado** |
| 1 | 1.6 Precisión en coordenadas grandes (UTM + lámina de papel) | **cerrado** |
| 2 | 2.1 La Jornada Real (E2E sin un solo mock) | **cerrado** |
| 2 | 2.2 La Jornada Real en CI en cada push a main | **cerrado** |
| 2 | 2.3 Barrido de cables sueltos en la UI | **cerrado** |
| 2 | 2.4 Los errores hablan español humano | **cerrado** |
| 3 | 3.1 Verificador de contenido del PDF | **cerrado** |
| 3 | 3.2 Round-trip numérico DXF + lector independiente | **cerrado** |
| 3 | 3.3 GLB a escala 1:1 verificado | **cerrado** |
| 3 | 3.4 DWG apagado y sin promesas en la superficie | **cerrado** |
| 3 | 3.5 Descargas en modo solo-lectura y desde review link | **cerrado** |
| 4 | 4.1 La primera hora de un desconocido | pendiente |
| 4 | 4.2 Botón «algo salió mal» | pendiente |
| 4 | 4.3 Telemetría mínima decente y declarada | **cerrado** |
| 4 | 4.4 Móvil: embudo público y dashboard | pendiente |
| 5 | 5.1 `DESPLIEGUE-RAILWAY.md` probado | **cerrado** |
| 5 | 5.2 Smoke post-deploy ejecutable | **cerrado** |
| 5 | 5.3 Respaldo diario verificado, Sentry, uptime | pendiente |
| 5 | 5.4 Aviso de privacidad y términos del modo gratuito | **cerrado** |
| 5 | 5.5 Los cinco fixes de producción abiertos | pendiente |
| F | F.1 Suite + Jornada Real + goldens + push | pendiente |
| F | F.2 `INFORME_LANZAMIENTO_20260827.md` | pendiente |
| F | F.3 «Lo que sólo Sergio puede hacer» | pendiente |

## Bitácora

### Arranque — mapa del terreno (antes de tocar nada)

Verificación de herencias, como manda la regla 5 («verificar herencias antes de
rehacer»):

- `TRIAL_DAYS` ya existe y su máximo ya es 90
  (`apps/api/src/modules/organizations/organization-commercial.configuration.ts:5`).
  Falta el **modo de producto**, no la variable.
- El guard de entitlement (`permissions.guard.ts`) hoy es binario: sin
  `design.cad` vigente, **403 a todo** — incluido `cad:view`, que es lo que
  usan abrir y exportar. Ésta es la regla de oro de 0.2 y está sin implementar.
- `/precios` lee el catálogo real (`PricingCatalog.tsx`); no hay precios
  escritos a mano. La oferta de fundadores tiene que entrar sin romper esa
  propiedad.
- El árbol está limpio y no hay otra sesión con cambios sin commitear
  (`git status` vacío).



### OLA 0 — cerrada

- **0.2, la regla de oro.** El guard degrada a SOLO LECTURA cuando el
  entitlement EXISTIÓ y venció: entra, ve, exporta DXF, imprime; sólo la
  escritura queda detrás del cobro. Fallo cerrado por triplicado (adaptador sin
  el método, excepción del almacén, vencimiento sin fecha). 10 comprobaciones
  contra PostgreSQL real.
- **0.1, el modo.** `config/launch.ts` decide qué se ENSEÑA; el código de
  Stripe no se toca. `trialDays` viaja en el catálogo público desde
  `TRIAL_DAYS`, y `freeOfferHeadline(90)` dice «3 meses gratis» sin que nadie
  escriba un 90 en un `.tsx`.
- **0.3, el aviso.** `TrialExpiryReminderService` con dos hitos (7 y 1 días),
  idempotencia arbitrada por el único del outbox. `TrialBanner` desde 14 días
  antes, y `canEdit` del dashboard pasa a exigir permiso **y** vigencia.
- **0.4, EL NÚMERO PUBLICABLE.** Contra el stack real (Next + Nest +
  PostgreSQL 16, cero mocks): **6 clics y 7 pantallas auditadas sin una sola
  mención de tarjeta**, de la portada al primer documento. El reloj marcó 2.5 s
  de máquina — mide la latencia del PRODUCTO, no lo que tarda una persona en
  decidir; lo que el número dice es que el producto no añade espera perceptible
  en ningún paso del embudo.

### OLA 1 — cerrada

**675 casos numéricos contra oráculo independiente, 0 desviaciones.**
`npm run check:cad-math`, encadenado en `check:cad`.

Dos defectos REALES encontrados midiendo:

1. **TEXT no llegaba al DXF.** El importador lo creaba, el adaptador lo
   dibujaba y lo giraba, el exportador lo descartaba — con la pérdida
   declarada, así que no era silencioso, pero un DXF con rótulos reexportado
   los perdía todos. El corpus de terceros lo medía sin que nadie lo leyera
   (`ac1027-padded-group-codes`: 3 entidades dentro, 2 fuera). Cerrado en las
   dos direcciones; el artefacto regenerado dice 3 de 3, cero pérdidas.
2. **El origen flotante se contaminaba con el espacio papel.** Un levantamiento
   UTM con una lámina A4 ponía el centroide a medio camino y el empaquetado a
   Float32 perdía centímetros. Medido por el pipeline REAL:
   **2.083e-2 → 2.876e-6 unidades de dibujo (7243× mejor)**, con prueba
   negativa que cuantifica lo que costaba.

### OLA 3.1 — el PDF, verificado por su contenido

`plot-pdf-geometry.ts` abre el content stream —inflando Flate— y devuelve
trazos y textos en milímetros de papel. Con eso se comprueba lo que de verdad
importa: **el muro de 3.5 m mide 70 mm a 1:50**, medido sobre los trazos y no
sobre la etiqueta del cajetín.

Tres defectos de este mismo verificador y del cajetín, encontrados al usarlo:

1. El extractor se DESINCRONIZABA leyendo un PDF comprimido: buscaba la palabra
   «stream» por el archivo, y los bytes de un stream comprimido pueden
   contenerla. Al añadir la portada a un juego pasó de leer 50 trazos a 12 —sin
   un solo error— y los que faltaban eran los del dibujo. Ahora ancla cada
   stream a su `N 0 obj` y lee el `/Length` de su propio diccionario.
2. **El cajetín salía con «—» en CLIENTE, FECHA y REVISÓ.** El conjunto ya
   llevaba esos datos en sus `fields` y el cajetín tenía su casilla; los dos
   nunca se encontraban, porque los campos sólo servían para sustituir
   marcadores dentro de atributos que la presentación ya trajera.
3. El guion suelto que `createCadPaperSpace` siembra como marca de hueco se
   trataba como DATO, así que el valor real del conjunto no llegaba nunca.

Un campo vacío en un plano es un plano sin identificar; el gate ahora exige
cero «—» en el cajetín de un juego que declara sus datos.


### OLA 2.1 — La Jornada Real, en verde

`apps/web/e2e/real/jornada-real.spec.ts`. **7 de 7 contra Next.js + NestJS +
PostgreSQL 16 reales, sin un solo `route()`.** Cierra el hallazgo estructural
que seguía vivo: los goldens que teclean comandos usaban backend simulado y las
pruebas contra el backend real inyectaban documentos por API — las dos mitades
nunca se tocaban.

1. Registro → verificación por enlace → organización con la prueba vigente,
   confirmada por `effective: true` del servidor.
2. Proyecto y documento por la UI; guardado por el CAS real declarando la
   versión leída.
3. El estudio REAL (`/studio/[documentId]`, no el legacy con mocks) abre el
   documento que vino de PostgreSQL y su línea de comandos responde.
4. Cierra sesión, vuelve a entrar y se comparan los números UNO A UNO: el muro
   mide 3500, el corto 2400, la cota conserva sus extremos, el hatch su
   contorno y el texto sus acentos carácter a carácter.
5. **DXF verificado por CONTENIDO NUMÉRICO**: se leen los códigos de grupo
   10/20/11/21 de cada LINE y se miden. No se busca la palabra «LINE» — que la
   palabra esté no dice que el muro mida lo que medía. Se comprueban también
   las COORDENADAS de la esquina: un dibujo trasladado tendría las mismas
   longitudes y estaría mal.
6. Review link emitido, abierto en un SEGUNDO contexto de navegador sin sesión,
   con el token en el fragmento; el invitado ve la geometría y comenta. Y se
   comprueba que el token NO reaparece al listar las sesiones.
7. **LA REGLA DE ORO, probada de punta a punta el día 91**: se vence la prueba
   en la base real (arnés `_development/expire-trial`, con las mismas cuatro
   guardas que el capturador de correo) y entonces ABRIR responde 200, EXPORTAR
   responde 200, y sólo ESCRIBIR responde 403 con
   `reason: read_only_after_lapse`.


### OLA 3 — los descargables, verificados por contenido

**767 casos numéricos contra oráculo independiente** tras esta ola.

- **3.2 DXF.** Los 21 tipos que viajan hoy, cada uno con su caso NUMÉRICO, y
  todos leídos por `dxf-parser` — biblioteca de TERCEROS, que no conoce las
  convenciones de este producto y no tiene motivo para ser indulgente con él.
  Es lo más cerca de «AutoCAD lo abre» que se puede estar sin AutoCAD. Más el
  round-trip por el importador propio, que mide otra cosa: fidelidad. El ODA
  File Converter no está en esta máquina, así que el peldaño DXF→DWG→DXF queda
  DECLARADO, no fingido.
- **3.3 GLB.** El muro de 3.5 m mide 3.5 en el archivo, en los TRES ejes, y el
  MISMO muro dentro de un predio diez veces mayor sigue midiendo 3.5 — que es
  la afirmación entera, porque el defecto original hacía que cada archivo
  saliera con una escala distinta según el tamaño de su predio. La primera
  versión de este spec aplicaba la escala dos veces y midió 0.035: se corrigió
  a sí mismo antes de acusar al producto.
- **3.4 DWG.** Gate que audita las 9 menciones de DWG en la superficie pública
  y exige que cada una lleve su límite declarado a menos de 240 caracteres. Y
  que la bandera de exportación siga naciendo apagada EN EL CÓDIGO.
- **3.5 Descargas sin rehenes.** Probado en la Jornada Real: con el entitlement
  vencido, `GET /export/dxf` responde 200.


### OLA 5 (parte) y 4.3 — despliegue, smoke, telemetría y legal

- **5.1 `docs/onboarding/DESPLIEGUE-RAILWAY.md`.** La ruta exacta: tres
  servicios, TODAS las variables con su valor u origen (incluida
  `TRIAL_DAYS=90` y el aviso de que las `NEXT_PUBLIC_*` se incrustan AL
  COMPILAR), los dominios mismo-sitio que la cookie `SameSite=Lax` exige, el
  orden de arranque, las migraciones y cómo verificar. Con 🔑 marcando lo que
  sólo Sergio puede hacer.
- **5.2 `npm run smoke:railway`.** Ejecutable contra la URL de producción.
  **Probado de verdad contra el stack local levantado: 9/9 verdes**, incluido
  el registro con correo real. Una comprobación que no se pudo hacer se
  declara OMITIDA y nunca cuenta como verde — un smoke que dice «todo bien»
  habiendo saltado el registro da permiso para anunciar.
- **4.3 Telemetría de activación.** `GET /health/metrics/activation`, tras el
  mismo `METRICS_TOKEN` que las otras métricas. **No añade ni una recolección
  nueva**: los cuatro números se DERIVAN de filas que el producto ya escribe
  para operar (`organizations`, `subscriptions`, `usage_ledger`). Sin contenido
  de planos, sin nombres, sin correos, sin identificadores. Si se retirase el
  endpoint, el producto no dejaría de recoger nada.
- **5.4 Legal, versión 2026-08-27.** Los términos describen el lanzamiento
  gratuito y ponen POR ESCRITO la regla de oro donde el cliente la lee: «tus
  documentos no quedan condicionados al pago». El aviso de privacidad declara
  la telemetría de activación — declaración y endpoint se publicaron en el
  mismo cambio, a propósito. Los dos añaden que son BORRADOR pendiente de
  revisión legal. El candado de inmutabilidad acepta la versión nueva con sus
  hashes recalculados.

### OLA 2.3 — Barrido de cables sueltos

**Lo que se buscaba.** La clase de defecto que la campaña nombró y que ya había
aparecido dos veces: «calculan pero el anfitrión no las deja aplicar». Un
control impecable —controlado, con su etiqueta, con su `title`— cuyo efecto no
llega a ninguna parte.

**Cómo se buscó.** No leyendo código: pulsando. Se enumeraron los **81 controles
visibles** del estudio contra el stack real (Next.js + NestJS + PostgreSQL) y se
pulsó cada uno sobre una carga LIMPIA, midiendo cinco señales, porque un botón
de CAD puede trabajar sin tocar el DOM:

| Señal | Por qué hace falta |
| --- | --- |
| DOM/texto | lo obvio, y lo único que ve una prueba normal |
| píxeles del lienzo | cambiar de vista repinta y no toca el DOM |
| descarga iniciada | exportar PNG/GLB no cambia la pantalla |
| selector de archivos | importar DXF abre el diálogo del navegador |
| petición a la API | abrir la paleta de revisión sólo consulta |

**Lo que encontró.**

**DEFECTO 1 — ARREGLADO. El selector «Papel del plano» de la barra superior era
un cable suelto.** Guardaba la elección en un `useState` (`plotPaper`) que **no
leía nadie**: `publishSheetSetPdf()` construye las hojas desde los espacios de
papel del documento y jamás consultaba esa variable. El usuario elegía A0 y
salía lo que dijera cada hoja. Y el copiloto en lenguaje natural empeoraba la
mentira: la orden «imprime en A3» (VD-CAD-PLOT-003) escribía en ese mismo estado
muerto y su comentario afirmaba que «el papel pedido se pasa directo».

Resolución, con la regla FIX-OR-HIDE y sin funciones nuevas:

* el selector huérfano **se retira de la superficie**. El papel se elige POR HOJA
  en el panel de layouts (`changeActivePaper`), que escribe en el documento, es
  deshacible y es el único que la publicación lee — que además es la semántica
  correcta: un conjunto mezcla planos A1 con detalles A3;
* «imprime en A3» **pasa a ser verdad**: aplica el papel a la hoja activa por esa
  misma vía canónica antes de publicar.

**DEFECTO 2 — DECLARADO. `aiBusy`, estado de sólo escritura.** El gate estático
nuevo lo cazó en cuanto se escribió. No es un control que mienta: el bloque
entero del copiloto IA heredado (`requestAiProposal`, `applyAiProposal`,
`applyAiIntent`) es **inalcanzable** — ninguna llamada lo invoca, ningún botón lo
expone. Como no hay superficie visible que prometa nada, no hay nada que ocultar;
queda declarado con su razón en `EXENTOS` y anotado en el backlog (cablearlo con
su indicador de «pensando…» o retirar el bloque).

**Los cinco sin efecto, declarados uno a uno.** Un «0 muertos» sólo vale si la
lista de excepciones es corta y está razonada:

| Control | Por qué no opera |
| --- | --- |
| Vista 3D | el estudio carga ya en vista 3D |
| Model | la pestaña de espacio modelo ya está seleccionada |
| Seleccionar / mover | es la herramienta activa al cargar |
| Puntos | es la pestaña abierta del panel izquierdo |
| Guardar | sobre un documento **sin cambios**, `persistCanonicalSave` corta antes de la red a propósito (idempotencia documentada). Su cableado lo prueba la segunda prueba, que lo pulsa CON un cambio y comprueba el PUT |

Y el barrido exige que los declarados **sigan existiendo**: una excepción que
sobrevive al control que la justificaba es basura que esconde defectos.

**La otra mitad, que es la que importa.** Que pase algo en pantalla no basta: la
campaña exige que el efecto llegue al documento PERSISTIDO. La segunda prueba
crea una capa desde el gestor de capas, guarda con el botón del estudio y vuelve
a leer el documento **por la API**: la capa está en PostgreSQL, con su nombre.

**Evidencia permanente.**

* `apps/web/e2e/real/cables-sueltos.spec.ts` — el barrido y la prueba de
  persistencia. **2/2 verdes**: 81 controles · 67 con efecto · 5 sin efecto (5
  declarados) · 3 no localizables (deshabilitados con razón: nada que deshacer,
  nada que rehacer, nada seleccionado que encuadrar).
* `apps/web/src/components/cad/editor/ui-wiring.spec.ts` — el gate estático de
  la MISMA forma del defecto, en `npm test`: **180 estados auditados, 0
  huérfanos**. El barrido tarda seis minutos y necesita PostgreSQL; este corre en
  un segundo en cada commit.

**Estado del árbol:** `npm test --workspace=web` 429/429 · `npm run check:cad`
EXIT=0 (trinquete de monolito **apretado**: 141 → 140 `useState`, porque el
selector huérfano se fue).

### OLA 2.4 — Los errores hablan español humano

**El método.** No leer código: provocar los fallos. La red se cortó de verdad
(`setOffline`), la sesión se invalidó de verdad (un `logout` contra la API con el
estudio abierto y trabajo sin guardar), el conflicto lo emitió PostgreSQL con su
contador CAS, y los dos DXF entraron por el mismo `input` que usa una persona.

**Lo primero que salió, y era exactamente lo que se buscaba.** Al cortar la red
guardando, el aviso en pantalla decía:

> **Sin conexión**
> Failed to fetch

El título estaba bien y el cuerpo era el `TypeError` del navegador, en inglés,
tal cual. El editor tomaba `saveError.message` y lo pintaba: para un corte de red
eso es la frase de la librería; para un 401, «Design API respondió 401». Tres
formas distintas de enseñarle a un arquitecto el registro de depuración.

**DEFECTO 1 — ARREGLADO.** `document-lifecycle/save-failure.ts`: un módulo puro
que convierte cualquier fallo de guardado en un aviso con las **tres** cosas que
tiene que tener, siempre las tres — qué pasó, **qué pasa con su trabajo** y qué
puede hacer. Siete casos: sin red, sesión caducada, periodo gratuito terminado,
sin permiso, demasiado grande, demasiadas peticiones, y el resto. Su spec (59
comprobaciones) no juzga la redacción: exige las tres partes y prohíbe la jerga.

La prueba encontró un fallo en mis propias frases —el caso «sin permiso» no
decía qué pasaba con los cambios sin guardar— y se corrigió antes de entrar.

Y el caso del 403 por expiración dice la **regla de oro de la campaña en el
instante exacto en que el usuario duda de ella**: «tus planos siguen siendo
tuyos: puedes abrirlos y exportarlos a DXF y a PDF cuando quieras».

**DEFECTO 2 — ARREGLADO. Los errores duraban lo mismo que un acuse de recibo.**
Toda tarjeta se iba a los 3,5 s. Un «Guardado» se entiende de un vistazo; «Tu
sesión expiró, vuelve a iniciar sesión» pide una DECISIÓN, y desaparecía antes de
que nadie la leyera: en pantalla sólo quedaba «Error de guardado · cambios
pendientes», sin decir por qué. Los errores viven ahora 12 s. Un mensaje que no
da tiempo a leerse no es un mensaje.

**DEFECTO 3 — ARREGLADO. 33 avisos titulados «3D».** Un usuario leía «**3D** — No
se pudo guardar la versión» o «**3D** — El DXF supera 12 MB»: una etiqueta interna
del editor encabezando mensajes que no tenían nada que ver con 3D. Cada título
pasa a nombrar lo que el usuario estaba haciendo: *Plano DXF*, *Versiones*,
*Plantillas*, *Revisión*, *Guardado*, *Cotas*, *Celdas*, *Cantidades*, *Modelo 3D*.

**Lo que ya estaba bien y se comprobó en vez de suponerse.** El informe de
importación DXF (`dxf-import-report.ts`) ya traducía cada pérdida a español llano
con sus tres columnas, incluido el recorte por límite de entidades; el conflicto
CAS ya se contaba como un choque de versiones y no como un 409; el botón de
importar vuelve a habilitarse siempre (`finally`), así que un DXF roto no deja la
interfaz muerta.

**Evidencia permanente.**

* `apps/web/e2e/real/errores-en-espanol.spec.ts` — **5/5 verdes** contra el stack
  real. Para cada fallo exige: que HAYA mensaje (un fallo silencioso es peor:
  el usuario sigue dibujando creyéndose a salvo), que sea HUMANO (una lista de
  ocho patrones de jerga que jamás deben llegar a un ojo — trazas, `[object
  Object]`, códigos HTTP desnudos, `Failed to fetch`, `Unauthorized`…) y que
  haya SALIDA (nada de «Guardando…» eterno). En el caso de la red, además,
  demuestra la vuelta: se restablece, se guarda y la capa dibujada durante el
  corte aparece en PostgreSQL.
* `save-failure.spec.ts` — 59 comprobaciones en `npm test`.

**El diario offline y la recuperación multipestaña, verificados con la red
genuinamente cortada:** `cad-offline-multitab` + `cad-recovery-lanes` +
`cad-conflict-per-document` → **13/13 verdes** contra Next.js + NestJS +
PostgreSQL reales.

**Estado del árbol:** `npm test --workspace=web` **430/430** · `npm run check:cad`
EXIT=0 (monolito en 20 242 líneas y 140 `useState`, sin crecer) · regresión en el
stack real: barrido de cables + Jornada Real **9/9**.
