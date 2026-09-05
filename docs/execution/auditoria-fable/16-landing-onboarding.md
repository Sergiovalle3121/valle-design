# Auditoría 16 · Landing, alta de cuenta y los primeros cinco minutos

> Auditoría externa de inversión. Fecha del árbol: 2026-09-05.
> Ámbito: la portada pública y qué promete; precios y su catálogo; el alta
> (fricción, verificación, contraseña, SSO); recuperación de cuenta; el primer
> dibujo; plantillas de arranque; el recorrido guiado; el estado vacío; importar
> el primer DXF; señales de confianza (quién está detrás, dónde viven mis datos,
> qué pasa si dejo de pagar); y la ruta medida desde «llego de un anuncio» hasta
> «tengo algo dibujado».
>
> Todo lo que se afirma aquí se leyó en el árbol. Cada hueco lleva el fichero y
> la línea que se miró para poder decir que falta. Lo parcial se dice «todavía
> no».

---

## Nota metodológica previa

`docs/competitive/rubric.json` tiene **36 categorías y 271 puntos, y ninguna
mide el embudo comercial.** El barrido de las 36 filas (`draw-2d`, `modify`,
`foreign-work`, `dimensions`, `hatch`, `mtext`, `layers`, `blocks`, `dxf`,
`layouts`, `persistence`, `command-line`, `annotation-extras`, `xrefs`,
`performance`, `review`, `json-import`, `api-sdk`, `plugins`, `events`,
`object-storage`, `dwg`, `brep`, `modeling3d`, `wasm`, `geo`, `integrity`,
`growth`, `recognition`, y los siete `toolset-*`) no encuentra una sola que
puntúe la portada, el alta, el precio o el primer minuto. La única que roza
esta dimensión es `recognition` («lo que un dibujante de AutoCAD reconoce en los
primeros cinco minutos»), y mide el ESTUDIO, no el embudo: cinta, texto,
línea de comandos, ejes.

Consecuencia: **esta dimensión no tiene rúbrica que la vigile.** Lo que la
vigila son cuatro suites (`e2e/real/free-launch-funnel.spec.ts`,
`e2e/real/primera-hora.spec.ts`, `e2e/public/demo-studio.spec.ts`,
`src/app/public-pages.spec.ts`) más el gate de Lighthouse, y eso resulta ser
bastante más de lo que tiene el 90 % del SaaS. Pero los huecos que quedan caen
justo donde nadie mira, y por eso los tres defectos más caros de este informe
(§4.1, §4.2, §4.3) llevan meses vivos con CI en verde.

---

## Veredicto

**El camino de «llego de un anuncio» a «tengo una línea dibujada» de Valle
Design es más corto que el de AutoCAD y está MEDIDO, cosa que Autodesk no
publica. Lo que falla es lo que viene después del dibujo: dos de las tres
puertas del estado vacío no funcionan, la promesa que hace el banner de la
demostración no se cumple, y el correo que avisa del fin de la prueba de tres
meses se descarta en silencio en cada envío.**

Nota: **6,5 / 10** contra AutoCAD completo.

La nota es la media de dos mitades que conviene decir por separado:

| | Nota | Por qué |
| --- | --- | --- |
| **El embudo hasta el primer trazo** | 8,5 / 10 | `/demo` abre el editor REAL sin cuenta y sin instalar — AutoCAD no puede ofrecer esto ni con la web app, que exige Autodesk ID. Alta de tres campos con `expect(...).toBe(3)` como gate. Portada con capturas generadas conduciendo el producto. 105 plantillas mexicanas por giro. Recorrido guiado que lee el DIBUJO en vez de contar clics. Embudo cronometrado contra API real: `< 5 min`, `≤ 8 clics`. |
| **Lo que sostiene una compra** | 4,5 / 10 | Sin SSO. Sin aceptación de términos en el alta. Sin aviso de privacidad publicado (plantilla sin abogado). Sin borrado de cuenta ni derechos ARCO. Sin página de estado con telemetría. Sin teléfono, chat ni WhatsApp — sólo `mailto:`. Sin razón social ni domicilio visible. `<html lang="en">` sobre una página 100 % en español. |

La frase de una línea: **el producto se prueba mejor que AutoCAD y se compra
peor.**

### Lo que hay que decir antes que nada

Este es un repositorio donde la superficie pública está construida con más
disciplina que el producto de la mayoría de los competidores. Tres ejemplos que
no son cortesía:

1. **`public-pages.spec.ts:66-79`** prohíbe con expresión regular que la portada
   o el centro de preguntas publiquen una cifra de precio o anuncien «IA»,
   «certificación» o «historial de versiones». Un gate de honestidad de copy es
   algo que no había visto en ningún repo.
2. **`src/lib/marketing/site-evidence.ts:18-20`** importa tres artefactos JSON de
   CI en tiempo de build. La portada literalmente **no puede** decir un número
   que el repositorio no haya medido; si el artefacto desaparece, el build
   revienta.
3. **`components/marketing/FreeLaunchNote.tsx:40-46`** pide el número de días de
   prueba a la API en vez de escribirlo, **y falla en silencio** si la API no
   responde, porque «que un catálogo caído impidiera a alguien registrarse sería
   cambiar una promesa por un embudo roto». Ese razonamiento está en el fichero.

Contra eso, los defectos que siguen duelen más, no menos: son huecos en una
casa bien construida.

---

## 1 · Lo que ya está construido y está bien

### 1.1 · La portada — `apps/web/src/app/page.tsx` (760 líneas)

Ocho bandas en orden de venta: héroe con el plano DIBUJÁNDOSE
(`PlanViewport`, no una captura estática), prueba visual con tres capturas
reales de `public/product/` generadas por `npm run capture:product`,
microdemos de tacto (`ShowcaseFlows`), plantillas, el argumento del modelo de
licencia, capacidades **con su límite escrito en la misma ficha y al mismo
tamaño de letra**, para quién es, «lo que todavía no hacemos», ingeniería
auditable, guías, 38 preguntas con buscador y CTA final.

Dos decisiones que valen dinero:

- **Cada capacidad lleva `limite`** (`page.tsx:140-230`) y el límite se pinta con
  `type-small` dentro de la misma tarjeta, no en letra pequeña al pie. Cinco de
  las siete tarjetas tienen límite escrito. La ficha de DXF declara los 12 MB y
  las 50 000 entidades del importador y que el corpus de ida y vuelta es propio.
- **La sección «Lo que todavía no hacemos»** (`page.tsx:221-247`) va ANTES del
  FAQ, no enterrada al final: cinco objeciones reales, empezando por «No abrimos
  ni escribimos DWG». Esto es una ventaja competitiva real en un mercado donde
  todo el mundo miente sobre DWG.

La portada **no publica una cifra de precio a propósito** y hay un gate que lo
impone. Los importes viven sólo en `/precios`, leídos del catálogo del producto.
Es la aplicación correcta de la regla 4 de la casa («ninguna cifra vive en dos
lugares») al terreno comercial.

### 1.2 · `/demo` — el editor real sin cuenta

`apps/web/src/app/demo/page.tsx` + `demo/DemoStudio.tsx` (87 líneas) +
`components/cad/document-lifecycle/demo-port.ts`.

El spike encontró que el editor toca la red en exactamente tres puntos, todos
dentro del `DocumentLifecyclePort`, y los sustituyó por un puerto que guarda en
`localStorage` con versión monotónica. **Resultado: el mismo bundle, los mismos
comandos, el mismo trazador a PDF, con un plano de casa habitación precargado.**
El banner es permanente y no se puede cerrar «porque una demostración que se
disfraza de producto completo es una promesa falsa».

`e2e/public/demo-studio.spec.ts` lo verifica dibujando de verdad: teclea
`LINE`, `0,0`, `3000,0` en la línea de comandos y afirma que el contador de
entidades sube.

**Esto AutoCAD no lo tiene y no puede tenerlo.** AutoCAD web exige Autodesk ID
antes de ver un lienzo; AutoCAD escritorio exige 8 GB de descarga. Es la ventaja
estructural del navegador y aquí está explotada.

### 1.3 · El alta — `components/AuthPage.tsx` (420 líneas)

Tres campos: nombre, correo, contraseña. Y el gate que lo protege es literal:

```
// free-launch-funnel.spec.ts:148
expect(await page.locator("form input").count()).toBe(3);
```

Lo que está bien hecho, punto por punto:

- **`PasswordField` con medidor de entropía** en vez de la regla
  mayúscula-número-símbolo que empuja a `P@ssw0rd1` (`AuthPage.tsx:210-220`), y
  con mostrar/ocultar. Al ENTRAR no hay medidor, que es lo correcto.
- **`autoComplete` correcto en los cinco campos**, incluido
  `one-time-code` en el desafío MFA para que iOS y Android lo ofrezcan desde el
  teclado (`AuthPage.tsx:391`).
- **El desafío de segundo factor vive en estado, no en la URL**
  (`AuthPage.tsx:40-47`), con la razón escrita: un desafío en la barra de
  direcciones acaba en el historial y en el portapapeles.
- **`crossLink()`** (`AuthPage.tsx:25-30`) conserva el `returnTo` al saltar entre
  registro e inicio de sesión, «porque quien llega desde precios trae el plan que
  eligió y perderlo es justo donde se cae una compra».
- **`CheckYourInbox`** (`AuthPage.tsx:242-320`) es pantalla propia, dice a QUÉ
  dirección se envió, ofrece reenvío in-situ con temporizador
  (`ResendTimerButton`) y explica los tres motivos por los que un correo no
  llega. La versión anterior era un `<p>` verde sin salida.

### 1.4 · La verificación se auto-canjea

`components/IdentityActionForm.tsx:126-155`. El enlace del correo lleva el token
y al abrirlo **la verificación corre sola**, con guarda `autoVerified` contra el
doble montaje de React en desarrollo. La pantalla muestra un `Spinner`, no un
formulario que se autoenvía. El campo de token queda como respaldo escondido
detrás de «¿Tienes un código?» — la excepción no se convierte en el camino
principal.

### 1.5 · El primer acceso sin jerga — `dashboard/OrganizationOnboarding.tsx`

Dos caminos y ninguno pide un slug: **«Trabajo por mi cuenta»** es un botón que
deriva el nombre del correo, cero campos; **«Tengo un despacho»** pide UN campo
y enseña el identificador derivado, editable sólo si alguien pulsa
«personalizar». La versión anterior pedía teclear un slug conforme a
`[a-z0-9]+(?:-[a-z0-9]+)*`.

### 1.6 · El estado vacío — `dashboard/FirstMinute.tsx`

Tres caminos en vez de dos formularios con seis campos: abrir el plano de
ejemplo, crear en blanco con plantilla, importar un DXF. El plano de ejemplo
sale de `sample-plan.json`, generado por `npm run capture:product` dibujando con
los comandos reales, y **es literalmente el mismo dibujo de la portada**: quien
llegó por la captura del héroe abre exactamente lo que vio. (Los otros dos
caminos están rotos; ver §4.1 y §4.2.)

### 1.7 · El recorrido guiado — `lib/cad/onboarding/guided-tour.ts` (356 líneas)

Cinco pasos que terminan en un PDF, no en cinco globos señalando botones. **El
progreso se lee del DIBUJO, no de los clics** (`guided-tour.ts:123-148`): ¿hay
un muro?, ¿hay una inserción de puerta?, ¿hay una cota? Da igual que la puerta
se colocara desde la paleta, tecleando `I` o arrastrándola. El trazado es la
excepción y llega por una señal del anfitrión, porque trazar no cambia el
documento.

Es saltable, sale una sola vez, y **se mide**: el anfitrión sella inicio y fin y
`cadGuidedTourDuration` da el número, «porque cinco minutos es una afirmación
falsable». La lógica de este módulo es de lo mejor del repositorio.

### 1.8 · El embudo, cronometrado contra el stack real

`e2e/real/free-launch-funnel.spec.ts` recorre portada → registro → verificación
→ sesión → organización → primer documento contra Next.js + NestJS + PostgreSQL
sin una sola intercepción, y afirma tres cosas:

1. **Ninguna pantalla pide tarjeta.** Siete regex de vocabulario de cobro y siete
   selectores de campo de tarjeta, aplicados al `innerText` renderizado de cada
   pantalla del embudo.
2. **El techo del embudo**: `expect(minutes).toBeLessThan(5)` y
   `expect(clicks).toBeLessThanOrEqual(8)`.
3. **La oferta que anuncia la portada es la que concede el backend**: se lee
   `trialDays` de `GET /v1/commercial/public/plans` y se compara con el
   `trialEndsAt` que devuelve la creación de la organización.

Esa tercera afirmación es la que casi nadie hace. «Anunciar tres meses y
conceder catorce sería la peor forma posible de empezar una relación con un
cliente» está escrito en el fichero.

`e2e/real/primera-hora.spec.ts` añade el cronómetro del plano de ejemplo
(`TECHO_EJEMPLO_MS = 45_000`) y no se conforma con que cargue el estudio:
exige que `cad-native-document-count` no sea cero, «porque un ejemplo que abre
vacío es peor que no tenerlo».

### 1.9 · Los precios — `precios/PricingCatalog.tsx` (417 líneas)

- **Sin red de seguridad de precios inventados**: si el catálogo no responde, la
  página se queda sin importes y lo dice, con reintento y con el canal comercial.
  «Un precio de ejemplo en una página pública no es un placeholder: es una
  oferta, y alguien vendrá a reclamarla.»
- **El sello fiscal** (`FiscalSeal`): IVA incluido · Factura CFDI · Cancelas
  cuando quieras. Para un despacho mexicano que hoy paga AutoCAD en dólares y
  recibe un recibo que su contador no puede deducir, esto es una ventaja
  concreta, no un adorno.
- **«Nuestra recomendación»** en vez de «el más vendido»: no hay ese dato y no se
  inventa. La etiqueta dice de quién es la recomendación.
- **El precio futuro se publica durante el lanzamiento gratuito**
  (`plan-future-price`), que es lo honesto y lo que casi nadie hace.

### 1.10 · Qué pasa si dejo de pagar — mejor que AutoCAD

`lib/commercial/trial-phase.ts` + `components/commercial/TrialBanner.tsx`.

Cuatro fases, aviso desde catorce días antes, y la regla de oro:
**`expired` NO significa «se acabó»; significa «se acabó la edición».** La
sesión conserva `cad:view`: el usuario entra, abre sus planos, los imprime y los
exporta a DXF y PDF. Probado en
`apps/api/src/modules/auth/guards/entitlement-read-only.pg.spec.ts`, y escrito
en `/terms` como **obligación del servicio, no cortesía revocable**.

Autodesk te bloquea. Esto es estrictamente mejor, y es un argumento de venta que
la portada todavía no explota lo suficiente (ver §3.11).

### 1.11 · Los sellos de confianza — `marketing/TrustSeals.tsx`

Cuatro sellos y **ninguno es un escudito verde**: cifrado en tránsito
(`__Host-valle_session` Secure, con 503 sobre HTTP plano), Argon2id
(`hashArgon2idPassword` con parámetros fijados), verificación obligatoria
(`login()` rechaza sin `emailVerifiedAt`), y «tus planos siempre exportables».
Cada uno nombra un mecanismo concreto que se puede ir a leer. La cabecera del
fichero explica por qué: «quien sabe algo de esto reconoce el adorno al instante
y deduce, con razón, que lo demás también puede ser adorno».

---

## 2 · La ruta medida: de «llego de un anuncio» a «tengo algo dibujado»

Tres rutas reales, contadas del árbol:

| Ruta | Pasos | Estado |
| --- | --- | --- |
| **A · Anuncio → `/demo` → dibujo** | 2 clics (`Probar sin cuenta` → teclear `LINE`) | ✅ Funciona. Sin cuenta, sin correo, sin instalar. **Imbatible.** |
| **B · Anuncio → alta → plano de ejemplo** | 8 clics, < 5 min, 3 pantallas de correo | ✅ Funciona y está cronometrado (`primera-hora.spec.ts`). |
| **C · Demo → «llévatelo» → cuenta → mi dibujo** | 8 clics | ❌ **Roto.** El dibujo no llega (§4.3). |

La ruta A es la joya. La ruta B es sólida. La ruta C es la que convierte a un
visitante que YA dibujó — el lead más caliente que existe en este producto — y
es la que está rota.

Para comparar: AutoCAD son 30-90 min desde el anuncio (crear Autodesk ID,
verificar, descargar 2-8 GB, instalar, activar). Valle Design son **10 segundos**
por la ruta A. Esa diferencia es el activo.

---

## 3 · Los huecos, por lo que más duele

### 3.1 · El correo de fin de prueba se descarta en silencio (BLOQUEANTE)

**Qué hace AutoCAD:** Autodesk manda correo a los 7 días y a las 24 horas del
fin de la prueba de 30 días, con el enlace de compra.

**Qué hace Valle hoy:** `apps/api/src/modules/commercial/trial-expiry-reminder.service.ts`
existe, está bien escrito (dos hitos, 7 y 1 días; clave de idempotencia por
hito; `readOnlyAfterExpiry: true` en el payload para que el correo no amenace),
está cableado al worker (`outbox-worker.service.ts:105`) y tiene su spec contra
PostgreSQL. Encola con `template: 'commercial.trial-expiry'`
(`trial-expiry-reminder.service.ts:60,138`).

Y **`apps/api/src/modules/outbox-receiver/email-templates.ts:45-72` no tiene un
`case` para esa plantilla.** El `switch` cubre `identity.verify-email`,
`identity.reset-password`, `organization.invitation` y
`commercial.renewal-reminder`; todo lo demás cae en `default:` (línea 72) y
lanza `EmailTemplateError('unknown_template')`.

Y el receptor lo trata como **éxito**:

```ts
// outbox-receiver.service.ts:76-79, 92-97
} catch (error) {
  if (!(error instanceof EmailTemplateError)) throw error;
  outcome = error.code;          // 'unknown_template'
}
...
return { status: rendered ? 'processed' : 'ignored', outcome };
```

Se inserta un `WebhookReceipt` con `outcome='unknown_template'`, se devuelve 200,
el worker marca la entrega como hecha y **no hay reintento, ni cola de muertos,
ni alarma**. El comentario del fichero justifica la decisión para una plantilla
desconocida genérica, y es un razonamiento correcto — pero aquí el productor y
el consumidor son del mismo repositorio y nadie los ata.

**Por qué le duele al usuario:** la oferta entera del lanzamiento es «tres meses
gratis». La cabecera de `trial-phase.ts` describe el fallo exacto: «el usuario se
registra en agosto, entrega dos proyectos, y en noviembre abre el navegador sin
la menor idea de que hoy era el último día». El único aviso que sobrevive es el
`TrialBanner` del tablero, que sólo ve quien entra en los últimos 14 días —
justo lo que no hace un usuario que se olvidó. **Los dos correos que existen
para resolverlo se tiran a la basura en cada envío.**

Es además una violación limpia de la regla 1 de la casa («ningún módulo cuenta
por existir: un subsistema sin importador fuera de sí mismo no está
implementado») y de la meta permanente de `integrity` («cero pérdidas
silenciosas»). La `.pg.spec` del servicio pasa porque comprueba **la fila del
outbox**, no el renderizado.

**Cómo se construye:**
1. `case 'commercial.trial-expiry':` en `email-templates.ts`, con
   `renderTrialExpiryEmail(payload, linkBaseUrl)` que lea
   `{organizationName, planCode, trialEndsAt, daysLeft, readOnlyAfterExpiry}` y
   escriba, con esas palabras, que los planos siguen siendo del usuario.
2. **El gate que faltaba**: una spec que recorra el árbol buscando todo literal
   `template: '...'` / `*_TEMPLATE = '...'` bajo `apps/api/src/modules/` y exija
   que `renderEmailTemplate` lo resuelva sin lanzar. Un productor de plantilla
   sin renderizador se vuelve rojo en CI.
3. Subir el `unknown_template` de `outcome` silencioso a **contador de métrica +
   log de nivel `error`**: sigue sin reintentar (correcto), pero deja de ser
   invisible.

**Cómo se verifica:** `email-templates.spec.ts` con el caso nuevo; el barrido de
cobertura de plantillas en `npm test`; y en
`trial-expiry-reminder.pg.spec.ts`, además de la fila del outbox, pasar el
payload por `renderEmailTemplate` y afirmar que el asunto y el cuerpo salen.

**Esfuerzo:** horas.

---

### 3.2 · «Importa un DXF» no hace nada en el estado vacío (BLOQUEANTE)

**Qué hace AutoCAD:** arrastrar un DWG/DXF al lienzo lo abre. Siempre.

**Qué hace Valle hoy:** en el tablero vacío, `FirstMinute` ofrece tres caminos.
El tercero, «Importa un DXF → Elegir archivo»
(`dashboard/FirstMinute.tsx:140-166`), abre el selector del sistema, el usuario
elige su plano… y **no pasa absolutamente nada.**

La cadena:

```tsx
// dashboard/page.tsx:741-748  (state === "empty")
<FirstMinute
  onImport={(files) => {
    const chosen = splitDocumentSelection([...(files ?? [])]);
    if (chosen) void importDocument(chosen.primary, chosen.sidecars);
  }}
/>
```

```ts
// dashboard/page.tsx:355
const importDocument = async (file, sidecars = {}) => {
  if (!canEdit || !selectedProject || busy) return;   // ← aquí muere
```

`state === "empty"` sólo se alcanza cuando `projectPage.items.length === 0`
(`page.tsx:164-168`), y en ese caso `primerProyecto = ""` (línea 158) y por tanto
`selectedProject === ""`. **La guarda de la línea 355 devuelve siempre.** Sin
error, sin toast, sin `ImportStatus`, sin nada.

Cobertura: `first-minute-import` **no aparece en ninguna prueba** — el único
`data-testid` de `FirstMinute` que toca un golden es `first-minute-sample`
(`primera-hora.spec.ts:108,115`).

**Por qué le duele al usuario:** «Importa un DXF» es la puerta de quien YA tiene
trabajo hecho, es decir, el profesional que se está planteando cambiar de
herramienta. Su primer acto en el producto es un botón que se traga su archivo
sin decir nada. En una evaluación de veinte minutos, eso es el final de la
evaluación.

Y es un «éxito sin efecto» de manual: la regla 2 de la casa
(`check:command-integrity`) prohíbe exactamente esto para los ~192 comandos del
editor, pero el gate no llega al tablero.

**Cómo se construye:** `importDocument` deja de exigir proyecto y lo crea si no
hay, igual que ya hace `abrirPlanoDeEjemplo`:

```ts
const projectId = selectedProject || (await ensureDefaultProject()).id;
```

`sample-plan.ts` ya tiene la secuencia («crear proyecto si hace falta, crear
documento, escribir el contenido») y devuelve `proyectoCreado`; se extrae
`ensureDefaultProject()` de ahí y la usan los dos caminos. Y la guarda deja de
ser un `return` mudo: si aun así falla, `setActionError`.

**Cómo se verifica:** golden nuevo en `e2e/real/` que, sobre una cuenta recién
creada y sin proyectos, pulse `first-minute-import`, suba un DXF de
`e2e/fixtures/`, y afirme el `POST /v1/cad/documents` y la navegación a
`/studio/<id>`. Y una regla en `check:cad` o en la spec del tablero que prohíba
un manejador de evento cuyo cuerpo empiece por un `return` condicionado a
estado que la propia pantalla garantiza vacío.

**Esfuerzo:** horas.

---

### 3.3 · «Crea un plano en blanco» lleva a un botón deshabilitado (ALTA)

**Qué hace AutoCAD:** `Ctrl+N` → elegir `.dwt` → dibujar. Dos gestos.

**Qué hace Valle hoy:** el segundo camino de `FirstMinute`, «Elegir plantilla»
(`FirstMinute.tsx:125-135`), llama a
`onCreateBlank={() => documentNameRef.current?.focus()}`
(`dashboard/page.tsx:741`): lleva el foco al campo «Nombre del documento» del
formulario que ya está en la página. La decisión de no duplicar el formulario es
correcta y está razonada. El problema es lo que el usuario encuentra al llegar:

- el `<select>` «Proyecto» sólo tiene la opción vacía «Selecciona un proyecto»
  (`page.tsx:632-641`), porque no hay proyectos;
- el botón «Crear documento» es `disabled={busy || !selectedProject}`
  (`page.tsx:657`);
- y `createDocument` vuelve a exigir `!selectedProject` (`page.tsx:252`).

**El usuario escribe el nombre de su plano y el botón sigue apagado, sin decirle
por qué.** Tiene que deducir solo que primero hay que crear un «proyecto», un
concepto que la pantalla de bienvenida no le explicó.

De los tres caminos que `FirstMinute` presenta como equivalentes, **sólo uno
funciona sin conocimiento previo.** `first-minute-blank` tampoco tiene prueba.

**Por qué le duele:** la banda dice «Empecemos por ver un plano… cuando quieras
empieza el tuyo». Empezar el tuyo es justo el momento en que el producto se
convierte en tuyo, y ahí es donde se cae.

**Cómo se construye:** misma `ensureDefaultProject()` de §3.2 — el proyecto por
defecto se crea al vuelo con el nombre de la organización, y el `<select>`
aparece ya resuelto. Alternativa mínima: dejar el botón habilitado y que el
`submit` cree el proyecto implícito.

**Cómo se verifica:** golden que, sin proyectos, pulse `first-minute-blank`,
escriba un nombre, pulse «Crear documento» y afirme la navegación a
`/studio/<id>` con las capas de la plantilla en el documento que recibió el
servidor.

**Esfuerzo:** horas (comparte el arreglo con §3.2).

---

### 3.4 · El `returnTo` se pierde en la verificación: la demo y la plantilla no viajan (ALTA)

**Qué hace AutoCAD:** no aplica — AutoCAD no tiene demo anónima. Aquí Valle
inventó un mecanismo que no tiene competencia y luego lo dejó a medio conectar.

**Qué hace Valle hoy:** dos superficies prometen que el trabajo del visitante
viaja a su cuenta nueva:

```tsx
// demo/DemoStudio.tsx:76-77
href={`/register?returnTo=${encodeURIComponent("/dashboard?demo=1")}`}
data-testid="demo-register-cta"
// … "Crea tu cuenta gratis y llévatelo"

// plantillas/[id]/page.tsx:158-160
/* `returnTo` viaja saneado por AuthPage: tras crear la cuenta,
   el tablero abre con la plantilla preseleccionada. */
href={`/register?returnTo=${encodeURIComponent(`/dashboard?plantilla=${id}`)}`}
```

El mecanismo receptor existe y es correcto: `useDemoAdoption()` y
`useGalleryStart()` (`dashboard/gallery-start.tsx:47-92`) leen `?demo=1` y
`?plantilla=`, y `startDocumentContent()` los aplica al primer documento.

**Pero el parámetro nunca llega.** El camino real de un usuario nuevo:

1. `/register?returnTo=/dashboard%3Fdemo%3D1` → el alta lee el `returnTo`
   (`AuthPage.tsx:36`)…
2. …y al registrarse **no navega**: pinta `CheckYourInbox` (`AuthPage.tsx:120`).
   El `returnTo` muere en el estado del componente.
3. El correo lleva un enlace a `/verify-email?token=…` construido por
   `renderIdentityEmail` — **sin `returnTo`**, porque el servidor nunca lo
   recibió (`RegisterDto`, `identity.controller.ts:74-79`, tiene tres campos).
4. Verificado, el pie ofrece `<Link href="/login">` **sin `returnTo`**
   (`IdentityActionForm.tsx:189`).
5. `localReturnTo(null)` → `/dashboard` (`lib/session.ts:29-31`).

Resultado: el dibujo que el visitante hizo en la demo sigue en su
`localStorage` (`storedDemoDocument()` no lo borra) pero **el tablero no le
pregunta si quiere adoptarlo**, y la plantilla que eligió en la galería no se
aplica. El comentario de `plantillas/[id]/page.tsx:158` afirma un
comportamiento que el árbol no tiene.

Cobertura: `demo-studio.spec.ts:57-60` sólo comprueba **el `href`**, no que el
dibujo llegue.

**Por qué le duele:** quien dibujó en la demo es el lead más caliente del
embudo — ya invirtió tiempo. Se le prometió por escrito «llévatelo», hizo los
ocho pasos del alta, y su dibujo no está. Eso no es una función que falta: es
una promesa incumplida, que es peor.

**Cómo se construye:** tres piezas pequeñas, ninguna toca el contrato.
1. `AuthPage`, tras el alta, guarda el `returnTo` saneado en `sessionStorage`
   bajo `valle:auth:return-to` (no en la URL, no en una cookie de terceros).
2. `IdentityActionForm`, en el éxito de `verify`, construye
   `href={loginUrl(sessionStorage.getItem("valle:auth:return-to"))}` — la
   función ya existe en `lib/session.ts:41-48` y ya sanea.
3. Alternativa robusta al `sessionStorage` (que no sobrevive a verificar en otro
   dispositivo): que el tablero, al montar SIN parámetro, pregunte igualmente si
   `storedDemoDocument()` existe y ofrezca `DemoAdoptionNote`. Eso cubre el 100 %
   de los casos en el MISMO navegador, que es donde el dibujo está.

**Cómo se verifica:** extender `demo-studio.spec.ts` al recorrido completo
contra la API real: dibujar en `/demo`, registrarse, verificar por enlace,
entrar, y afirmar que el primer documento creado contiene la entidad `line` que
el visitante dibujó. Es la prueba que convierte la promesa del banner en un
hecho.

**Esfuerzo:** un día.

---

### 3.5 · «Ábrelo desde este dispositivo y entrarás directo» es falso (ALTA)

**Qué hace Valle hoy:** `AuthPage.tsx:268` dice, tras el alta:

> Enviamos un enlace de verificación a **tu@correo**. **Ábrelo desde este
> dispositivo y entrarás directo.**

No entras directo. `POST /v1/auth/verify-email` devuelve `{ verified: true }` y
**no crea sesión ni pone cookie** (`identity.controller.ts:638-646`). La propia
pantalla de éxito lo desmiente cuatro ficheros más allá: «Listo, tu correo está
verificado / Ya puedes entrar» + botón «Iniciar sesión»
(`IdentityActionForm.tsx:175-196`).

**Por qué le duele:** es una mentira pequeña en el sitio donde la casa presume
de no decirlas, y añade un paso (volver a teclear correo y contraseña) justo
donde el embudo es más frágil. En un móvil, entre la app de correo y el
navegador, ese paso pierde gente.

**Cómo se construye:** dos opciones, y la buena es la segunda.
- **Barata (minutos):** corregir el texto a «Ábrelo y podrás entrar».
- **Correcta (medio día):** que `verify-email` **abra sesión**. El token es de un
  solo uso, de 24 h, ligado al usuario, y ya lo consume una transacción
  (`identity.service.ts:384`). Emitir la cookie de sesión ahí es el mismo
  material que ya emite `login`, con el mismo `sessionCookiePolicy`. Ahorra un
  paso entero del embudo y arregla de paso §3.4, porque el usuario cae en el
  tablero desde la MISMA pestaña donde estaba el `returnTo`.

**Cómo se verifica:** `free-launch-funnel.spec.ts` pierde el bloque «4 · Sesión»
(el `page.goto("/login")` y los dos `fill`) y afirma en su lugar que tras la
verificación la URL ya es `/dashboard`. Los clics contados bajan de 8 a 6, y ese
número está publicado.

**Esfuerzo:** medio día.

---

### 3.6 · Nadie acepta los términos al crear la cuenta (ALTA)

**Qué hace AutoCAD:** el alta de Autodesk ID exige marcar los Términos de
Servicio y la Declaración de Privacidad, con versión, antes de crear la cuenta.

**Qué hace Valle hoy:** el formulario de alta (`AuthPage.tsx:189-235`) tiene
nombre, correo, contraseña y botón. **Ni una casilla, ni un enlace a `/terms` ni
a `/privacy`.** `AuthShell.tsx` sólo añade un enlace a soporte. El `RegisterDto`
no tiene campo de aceptación.

El mecanismo COMPLETO existe: `apps/api/src/modules/legal/` versiona documentos
y registra aceptaciones, y `lib/legal/acceptance-gate.ts` implementa la regla
pura. Su **único** consumidor en todo el árbol es el checkout
(`precios/checkout/CheckoutStarter.tsx:87-113`), donde el gate falla cerrado y
está bien hecho.

Es decir: **quien paga acepta los términos; quien sólo sube los planos de sus
clientes, no.** Y durante el lanzamiento gratuito nadie paga
(`checkoutIsVisible()` es `false`), así que hoy **nadie acepta nada.**

`docs/legal/CHECKLIST_PENDIENTES_LEGALES.md` lo tiene anotado —«El
registro/primer acceso muestra términos con versión y pide aceptación · **Falta**
· ninguna pantalla llama hoy a `GET /v1/legal/documents`»— y sigue siendo cierto.
(De paso: la fila de arriba, la del checkout, dice «**Falta** — hoy NO la exige»
y **ya está hecha**. El documento miente a la baja.)

**Por qué le duele:** un despacho que sube el plano de un cliente a un servicio
que nunca le hizo aceptar un contrato tiene un problema con su propio cliente.
Y para el operador es exposición: sin registro de aceptación no hay
consentimiento demostrable bajo la LFPDPPP.

**Cómo se construye:** bajo el botón «Crear cuenta», una línea con la versión:
«Al crear la cuenta aceptas los [Términos v2026-08] y el [Aviso de privacidad
v2026-08]» — consentimiento por acción, que es lo que hace Autodesk, no una
casilla más. Tras el `register` con éxito y **antes** de `CheckYourInbox`,
`POST /v1/legal/acceptances` con `{document, version}` para los dos. Los
documentos se piden en el `useEffect` de montaje de `/register` y **no bloquean
el formulario si la llamada falla** (mismo criterio que `FreeLaunchNote`), pero
se reintentan al primer acceso al tablero.

**Cómo se verifica:** extender `e2e/commercial/legal-acceptance-gate.spec.ts` al
alta; y una spec que afirme que tras el embudo real existen dos filas en
`legal_acceptances` para el usuario nuevo.

**Esfuerzo:** un día.

---

### 3.7 · `<html lang="en">` sobre una página entera en español (ALTA)

**Qué hace Valle hoy:**

```tsx
// app/layout.tsx:126-129
const locale = await getLocale();
<html lang={locale} …>
```

```ts
// i18n/config.ts:20
export const defaultLocale: Locale = "en";
```

Sin cookie `valle_locale` — es decir, **para todo visitante nuevo** — el
documento se sirve con `lang="en"`. Y toda la superficie pública está escrita en
español a mano: sólo **dos ficheros** de `src/app/` usan `useTranslations`
(`(sw)/ServiceWorkerRegistrar.tsx` y `(sw)/sin-conexion/page.tsx`). La portada,
el alta, los precios, el tablero y el estudio no pasan por el catálogo.

Y hay una segunda verdad sobre lo mismo, que es lo que la casa prohíbe:

```ts
// lib/seo/page-metadata.ts:43
locale: "es_MX",
```

**`og:locale` dice `es_MX` y `<html lang>` dice `en`, en la misma página.**

**Por qué le duele:**
- **Accesibilidad, WCAG 3.1.1 (nivel A):** NVDA y VoiceOver eligen la voz por
  `lang`. Un lector de pantalla lee «Dibuja tus planos en el navegador» con
  fonemas ingleses: ininteligible. **Y el gate de axe no lo caza**: `axe` valida
  `html-has-lang` y `valid-lang` (el atributo existe y es un código válido), no
  que coincida con el contenido. `e2e/a11y/axe-superficies.spec.ts` pasa en
  verde sobre un fallo de nivel A.
- **SEO:** el mercado objetivo declarado es México. Servir `lang="en"` en la
  página que quiere posicionar para «plano arquitectónico», «CAD en línea» y
  «plantilla de plano» es regalarle señal al competidor.

**Cómo se construye:** dos líneas y una decisión.
1. `defaultLocale = "es"` en `i18n/config.ts` y la spec
   `catalog-contract.spec.ts:81` (que hoy afirma «el requisito de la campaña es
   inglés por defecto») pasa a afirmar `"es"`, con la razón escrita: el producto
   es es-MX y AGENTS.md exige «Spanish es-MX in new copy».
2. Si el titular quiere conservar el inglés por defecto, entonces el default se
   resuelve por `Accept-Language` con `es` como respaldo, y `og:locale` deja de
   estar escrito a mano: sale del mismo `locale`.

**Cómo se verifica:** una spec de superficie que abra `/`, `/register` y
`/precios` sin cookie y afirme `document.documentElement.lang === "es"` y que
coincide con el `og:locale` del `<head>`. Es exactamente la clase de gate «una
cifra, un sitio» que la casa ya aplica al resto.

**Esfuerzo:** horas.

---

### 3.8 · Sin SSO: ni Google, ni Microsoft, ni SAML (ALTA)

**Qué hace AutoCAD:** Autodesk ID acepta Google, Apple y Microsoft; los planes
Premium/Enterprise traen SSO SAML con el directorio del cliente.

**Qué hace Valle hoy:** nada. El barrido de `oauth|sso|saml|oidc|sign in with`
sobre `apps/web/src` y `apps/api/src` **devuelve cero ficheros**. Diecinueve
rutas `/v1/auth`, ninguna federada.

Esto **ya está en el backlog** como `P1-F3` (BACKLOG.md:324-347) con el terreno
mapeado y la decisión de titular identificada («qué hacer cuando el correo del
proveedor coincide con una cuenta de contraseña ya verificada»). El propio
backlog dice: «Es lo que más subiría la conversión del embudo». Estoy de
acuerdo, y añado dos matices que el backlog no recoge:

- **Con SSO, §3.5 y §3.6 desaparecen**: Google entrega el correo ya verificado,
  y el consentimiento se pide una sola vez en la primera pantalla autenticada.
  El embudo baja de 8 clics a 3 y de tres pantallas de correo a cero.
- **SAML no es lo mismo que Google** y no debería ir en la misma campaña: SAML es
  requisito de compra de despachos de +50 personas y llega después.

**Cómo se verifica:** lo que el backlog ya pide, más el número del embudo
medido con y sin SSO en `free-launch-funnel.spec.ts` — porque si la razón es la
conversión, el clic ahorrado es la métrica.

**Esfuerzo:** semanas (campaña, como dice el backlog).

---

### 3.9 · No hay forma de borrar la cuenta ni de exportar los datos personales (ALTA)

**Qué hace AutoCAD:** Autodesk tiene autoservicio de cierre de cuenta y un
portal de privacidad con solicitud de acceso/borrado.

**Qué hace Valle hoy:** las 19 rutas de `identity.controller.ts` son register,
login, mfa (×5), session, logout, sessions (×4), activity, verify-email (×2),
password (×2). **No hay `DELETE /v1/auth/account` ni exportación.** El barrido de
`eliminar cuenta|borrar cuenta|delete account|ARCO` sobre los dos `src/` no
devuelve nada.

Y `/privacy` (135 líneas) no es un aviso: es una descripción de la superficie
técnica que dice, en su intro y otra vez en el cuerpo, «El operador de cada
despliegue debe completar los plazos, bases jurídicas y **derechos aplicables**
antes de prestar un servicio público». La plantilla real está sin abogado en
`docs/legal/PLANTILLA_AVISO_PRIVACIDAD.md` y no está conectada.

**Por qué le duele:** en la conversación de compra de un despacho, «¿y si me
quiero ir?» se responde hoy con «escríbeme un correo». Bajo la LFPDPPP los
derechos ARCO exigen un medio para ejercerlos y el aviso tiene que nombrarlo.
Para el visitante, la señal es que se puede entrar pero no salir — y en un
producto que pide subir los planos de terceros, eso pesa.

**Cómo se construye:** el mínimo defendible son dos operaciones y una pantalla.
- `POST /v1/auth/account/export` → encola un trabajo que produce un ZIP con los
  documentos del usuario en DXF (el trazador ya existe) más un JSON de perfil,
  entregado por el outbox como el resto.
- `DELETE /v1/auth/account` con **contraseña reciente** (el patrón ya existe en
  `disableMfa`) → anonimiza `User`, revoca todas las sesiones y transfiere o
  borra la organización si es su único dueño.
- En `/cuenta`, la sección «Tu cuenta y tus datos» con las dos acciones y el
  plazo declarado.

**Cómo se verifica:** `.pg.spec` que cree una cuenta con un documento, ejecute
el borrado y afirme que ni el correo ni el documento sobreviven y que la sesión
queda revocada. Y la fila correspondiente en el checklist legal deja de estar
en `[ ]`.

**Esfuerzo:** varios días (comparte terreno con la auditoría 15).

---

### 3.10 · Las señales de confianza institucionales no existen (MEDIA)

**Qué hace AutoCAD:** logo de Autodesk, empresa cotizada, NASDAQ ADSK, dirección
en San Rafael, `health.autodesk.com` con uptime real, teléfono por país, chat,
red de distribuidores certificados, SOC 2 e ISO 27001.

**Qué hace Valle hoy** — cuatro huecos, todos verificados:

1. **No hay «quiénes somos».** No existe `/nosotros`, `/acerca` ni
   `/quienes-somos`. `/equipo` es la sala de equipo privada
   (`equipo/page.tsx:11-13`, `robots: noindex`). Lo único que un visitante ve de
   la entidad es `BRAND.copyright` en el pie (`SiteFooter.tsx:70`). Sin razón
   social, sin domicilio, sin fundador, sin año.
2. **`/status` dice que no sabe nada.** Con `NEXT_PUBLIC_STATUS_URL` sin
   configurar, la página muestra el badge «Sin telemetría pública» y el párrafo
   «No se declara ningún estado operativo desde esta página»
   (`status/page.tsx:49-56`). Es honesto —y `public-pages.spec.ts:86-87` lo
   **exige** por regex— pero el enlace «Estado del sistema» está en el pie de
   todas las públicas (`SiteFooter.tsx:33`). Un comprador que hace clic en
   «Estado» y lee «no hay telemetría» recibe una señal peor que si el enlace no
   existiera. Es un roce con `fix-or-hide`.
3. **El único canal es `mailto:`.** `/contact` (81 líneas) no tiene formulario
   —lo dice: «Esta página no contiene un formulario simulado»— y con los correos
   `.invalid` del manifiesto de desarrollo, `configuredEmail()`
   (`config/commercial.ts:6-10`) los filtra y la página queda **sin ningún canal**
   («Este despliegue todavía no tiene un correo público configurado»). En México,
   sin WhatsApp ni teléfono, la evaluación de un despacho de diez personas se
   detiene ahí.
4. **Cero prueba social, y está asumido.** La cabecera de `page.tsx:76-79` lo
   dice: «Tres cosas que NO están aquí y no es un olvido: testimonios (no existe
   ni uno real), logotipos de clientes (igual) y cifras de precio». La sustitución
   por `EngineeringEvidence` es inteligente y honesta. Pero un comprador de CAD
   compra riesgo, y hoy no hay ni un nombre que lo comparta.

**Cómo se construye:** por orden de valor por hora:
- `/nosotros` con razón social, domicilio fiscal, año de fundación, quién
  escribe el código y por qué existe el producto. Es una página estática y
  cambia la conversación entera.
- **Estado real y barato**: una función programada que hace `GET /v1/health` cada
  cinco minutos y escribe `public/status.json` con las últimas 24 h; `/status` lo
  pinta. Deja de ser una página que confiesa no saber.
- **WhatsApp Business** con enlace `wa.me` en el pie y en `/contact`, detrás de
  la misma variable de configuración que los correos.
- **El primer testimonio no se inventa: se gana.** La instrumentación para
  pedirlo (el usuario que exportó su primer PDF) no existe todavía; ver §3.12.

**Esfuerzo:** un día lo primero y lo tercero; varios días el estado.

---

### 3.11 · La ventaja de «tus planos siguen siendo tuyos» está enterrada (MEDIA)

**Qué hace AutoCAD:** al vencer la suscripción, AutoCAD deja de abrir. Tus DWG
son tuyos, pero necesitas AutoCAD para abrirlos. Ese es el candado del negocio.

**Qué hace Valle hoy:** al vencer, la cuenta pasa a solo lectura y **conserva
`cad:view`**: abre, ve, imprime y exporta a DXF y PDF, para siempre. Está
probado (`entitlement-read-only.pg.spec.ts`), está escrito en `/terms` como
obligación del servicio, y está en el cuarto sello de `TrustSeals` y en el
`FREE_LAUNCH_PROMISE`.

**Dónde falla:** en la portada aparece como un renglón dentro de la tarjeta
«Se paga por mes y se cancela desde el portal» (`page.tsx:203-216`), sin
titular propio, y en `/precios` como el cuarto punto de una lista de cuatro. En
`TrustSeals` sólo lo ve quien ya está en el formulario de alta.

**Por qué importa:** es el ÚNICO argumento del producto que ataca directamente
el miedo que retiene a la gente en AutoCAD. No es una función: es la respuesta a
«¿y si esto no funciona?».

**Cómo se construye:** una banda propia en la portada, entre «El modelo» y
«Capacidades», con el titular en `type-title` y el enlace a `/terms` donde está
la obligación escrita. Sin cifras nuevas y sin claim nuevo: el material ya está
probado, sólo cambia de sitio y de tamaño.

**Cómo se verifica:** `public-pages.spec.ts` afirma que la frase aparece en la
portada y que el enlace apunta a la sección de `/terms` que la contiene, para
que nadie la borre de un lado sin el otro.

**Esfuerzo:** horas.

---

### 3.12 · El embudo no se puede medir en producción (MEDIA)

**Qué hace AutoCAD:** Autodesk instrumenta el trial completo y contacta por
correo y por teléfono a quien se atasca.

**Qué hace Valle hoy:** **cero analítica de producto.** El barrido de
`analytics|posthog|plausible|gtag|mixpanel|amplitude|telemetr` sobre
`apps/web/src` devuelve ficheros cuya coincidencia es «telemetría» en un
comentario o `CadDiagnosticsReadout` (diagnóstico del editor, no de embudo).
`BACKLOG.md:420-429` (`P1-FE3`) confirma que falta el endpoint de Web Vitals de
campo, no sólo el de producto.

Y el estado del recorrido guiado vive en `localStorage` con la clave del usuario
(`components/cad/onboarding/tour-host.ts:35-37`), con la razón escrita — es una
preferencia de este navegador. Correcto para el usuario, y a la vez significa
que **nadie en Valle Design puede saber cuánta gente termina el recorrido**, ni
cuántos altas llegan al primer PDF, ni en qué paso se cae la mitad.

**Por qué le duele al negocio:** todo este informe habla de dónde se pierde
gente, y la única razón por la que puedo señalar §3.2 y §3.4 es que leí el
código. Con instrumentación se habrían visto en la primera semana.

**Cómo se construye:** sin producto de terceros y sin cookies, que encaja con la
postura de privacidad de la casa:
- `POST /v1/telemetry/funnel` con `{event, at}` sobre la sesión ya autenticada,
  y una tabla `funnel_events` con seis eventos declarados:
  `account_created`, `email_verified`, `org_created`, `first_document`,
  `tour_completed`, `first_export`. Sin PII más allá del `userId` que ya está en
  la sesión.
- El recorrido guiado y `plot-host` ya emiten las señales; sólo hay que
  reenviarlas.
- Un panel interno en `/comentarios/admin` (que ya existe como área privada) con
  los seis números y la caída entre pasos.

**Cómo se verifica:** `.pg.spec` de la tabla y su índice; y el recorrido real de
`free-launch-funnel.spec.ts` afirma que al terminar hay cuatro filas para el
usuario nuevo. Ojo con la regla de la casa: la cifra la publica el artefacto,
nadie la escribe a mano.

**Esfuerzo:** varios días.

---

### 3.13 · El rendimiento móvil de la portada sigue por debajo de su propio objetivo (MEDIA)

**Qué hace AutoCAD:** autodesk.com puntúa mal en móvil también. Este no es un
hueco contra AutoCAD; es un hueco contra el propio criterio escrito.

**Qué hace Valle hoy — y aquí hay que corregir el backlog.** `P1-FE6`
(BACKLOG.md:478-545) describe 1 093 KB de tipografías y LCP móvil de 8,9 s.
**Eso ya no es cierto**: `scripts/design/subset-fonts.py` generó los
subconjuntos, `public/fonts/` pesa **552 KB** en total, y el layout precarga sólo
**dos caras (220 KB)** — Inter romana y Space Grotesk (`config/fonts-generated.ts`,
`layout.tsx:135-146`). El resto llega a demanda con `font-display: swap` y
métricas de respaldo sincronizadas con Arial.

Lo que sigue abierto, medido por el propio gate
(`scripts/perf/lighthouserc.mobile.json`, nota `//rendimiento`):

> «Medido tras el arreglo: **/ 81**, /precios 85, /register 87, **LCP 4,1-5,0 s**.
> Umbral en 0,78.»

El criterio de aceptación de `P1-FE6` pedía **LCP < 4 s y rendimiento > 85**. La
portada da 81 y 4,1-5,0 s. **El ítem está a un 80 % hecho y su texto describe un
mundo que ya no existe** — un doc que miente aunque sea a la baja es, por la
regla 4 de la casa, un defecto.

La siguiente palanca ya está identificada en el propio JSON: «~272 KB gzip de JS
de primera carga hasta en /docs (el suelo de todas las rutas)… cada 50 KB gzip
menos son ~0,5 s de LCP móvil simulado».

**Por qué le duele:** el visitante mexicano llega por el teléfono. Cinco
segundos hasta el titular en 4G es donde se pierde el tráfico pagado.

**Cómo se construye:** dieta de layout por grupo de rutas. `app/layout.tsx` monta
hoy `I18nProvider` + `ThemeProvider` + `DesignAuthProvider` + `ToastProvider`
para TODAS las rutas, incluidas las públicas, que no necesitan sesión ni toasts.
Un `(public)/layout.tsx` con `ThemeProvider` solo, y `DesignAuthProvider` movido
al grupo autenticado, quita el proveedor de sesión —y su `fetch` de arranque— del
camino crítico de la portada.

**Cómo se verifica:** el gate ya existe. Se sube `categories:performance` de
0,78 a 0,82 cuando la medición lo permita —**nunca antes**, y nunca se baja— y se
reescribe `P1-FE6` con las cifras de hoy.

**Esfuerzo:** varios días.

---

### 3.14 · `/demo` puede apagarse y la portada seguiría ofreciéndolo (MEDIA)

**Qué hace Valle hoy:** `demoIsVisible()` (`config/launch.ts:113-115`) tiene
**un solo consumidor en todo el árbol**: la propia `/demo/page.tsx:28`, que hace
`notFound()`.

Mientras tanto, con `NEXT_PUBLIC_DEMO_MODE=off`:
- el segundo CTA del héroe (`page.tsx:380-388`, `data-testid="hero-demo-cta"`,
  «Probar sin cuenta») lleva a un **404**;
- el pie lo ofrece igual (`SiteFooter.tsx:31`);
- y `PUBLIC_ROUTES` lo incluye sin condición (`config/site-routes.ts:159`), así
  que **el `sitemap.xml` anuncia a Google una URL que devuelve 404**.

**Por qué le duele:** es `fix-or-hide` al revés — lo que no está disponible sigue
siendo visible. Y el precio se paga en el sitio más caro: la segunda acción del
héroe, la que el propio comentario del código llama «TOCAR el producto».

**Cómo se construye:** `demoIsVisible()` gobierna los tres sitios. Como es una
variable `NEXT_PUBLIC_*` que se hornea al compilar, la portada puede leerla en
servidor sin coste, y `sitemap.ts` filtra `PUBLIC_ROUTES` por la misma función.

**Cómo se verifica:** `public-pages.spec.ts` gana una regla: toda ruta enlazada
desde la portada o el pie o bien existe siempre, o bien su enlace está detrás de
la misma bandera que la esconde. Es la misma clase de regla que ya defiende
`/login` y `/register`.

**Esfuerzo:** horas.

---

### 3.15 · El alta no tiene ninguna defensa contra abuso (MEDIA)

**Qué hace AutoCAD:** reCAPTCHA en el alta de Autodesk ID y bloqueo de dominios
desechables.

**Qué hace Valle hoy:** `POST /v1/auth/register`
(`identity.controller.ts:353-358`) sólo aplica
`this.limit('register.ip', [req.ip])`, y el `max` por defecto de `limit()` es
**8 por minuto** (línea 247) — unas 11 500 altas por IP y día. No hay CAPTCHA, ni
prueba de trabajo, ni lista de dominios desechables, ni límite por dominio de
correo.

Lo que sí está bien: el correo repetido no se filtra (202 `{accepted:true}` en
ambos caminos, con hash en las dos ramas para igualar el tiempo,
`identity.service.ts:94-103`) — la resistencia a enumeración es correcta.

**Por qué duele:** cada alta **encola un correo transaccional**. Una campaña de
altas desde IPs rotadas quema la reputación del dominio de envío, y el día que
eso pasa, los correos de verificación de los usuarios REALES caen en spam — es
decir, el embudo entero deja de funcionar por una razón que nadie va a mirar en
el código.

**Cómo se construye:** ninguna de las tres piezas exige un tercero.
1. Límite adicional por **dominio de correo** (`register.domain`), más estricto
   que el de IP.
2. Lista de dominios desechables versionada en el repo; con el correo en la
   lista se acepta el 202 igual (sin filtrar) pero **no se encola el correo**.
3. Un `Retry-After` progresivo por IP en vez de la ventana fija.

**Cómo se verifica:** `.pg.spec` del limitador con las tres reglas, y un
contador de correos encolados por hora que un panel pueda leer.

**Esfuerzo:** un día.

---

### 3.16 · `/reset-password` sigue con el campo de contraseña sencillo (BAJA)

Ya está en el backlog como **`P1-F1`** (BACKLOG.md:274-289), con estimación de 30
minutos, y **sigue siendo cierto**: `IdentityActionForm.tsx:266-278` usa
`<Input type="password">` con la pista «Entre 12 y 128 caracteres», mientras el
alta usa `PasswordField` con mostrar/ocultar y medidor de entropía y la pista
«Mínimo 12 caracteres».

Añado sólo lo que el backlog no dice: **las dos pantallas dan pistas distintas
sobre la misma regla**, y la que llega en el peor momento (acabo de olvidar mi
contraseña) es la peor de las dos. El aviso del backlog sobre el localizador
anclado (`/^Contrase/iu`) de `studio-real-api.spec.ts` es correcto y hay que
respetarlo.

**Esfuerzo:** horas.

---

## 4 · Defectos del código, con fichero y línea

### 4.1 · `commercial.trial-expiry` no tiene renderizador y se descarta en silencio

- **Dónde:** `apps/api/src/modules/outbox-receiver/email-templates.ts:40-76`
  (el `switch` y su `default:` en la línea 72) frente a
  `apps/api/src/modules/commercial/trial-expiry-reminder.service.ts:60,138`.
- **Escenario:** una organización creada en modo lanzamiento tiene
  `status='trialing'` y `trialEndsAt = hoy+90d`
  (`organizations.controller.ts:235,248`). A los 83 días,
  `TrialExpiryReminderService.runOnce()` la selecciona correctamente
  (`trial-expiry-reminder.service.ts:116-123`) y encola un
  `email_outbox` con `template='commercial.trial-expiry'`. El receptor llama a
  `renderEmailTemplate`, cae en `default:`, lanza
  `EmailTemplateError('unknown_template')`,
  `outbox-receiver.service.ts:76-79` lo captura, devuelve
  `{status:'ignored', outcome:'unknown_template'}` con **200**, y el worker marca
  la entrega hecha. **El usuario nunca recibe el aviso, ni a 7 días ni a 1 día, y
  ningún contador se mueve.** Lo mismo a 89 días.
- **Por qué importa:** la oferta comercial entera del lanzamiento es una prueba
  de tres meses, y el mecanismo diseñado para que nadie se lleve la sorpresa del
  día 91 está muerto en su último tramo. `trial-expiry-reminder.pg.spec.ts` pasa
  porque afirma la fila del outbox, no el renderizado.
- **Arreglo:** el `case` que falta, más una spec que barra todos los literales
  `template:` del árbol y exija que `renderEmailTemplate` los resuelva. Y subir
  `unknown_template` de `outcome` silencioso a log de error con contador.

### 4.2 · `importDocument` devuelve mudo en el único estado donde se le llama sin proyecto

- **Dónde:** `apps/web/src/app/dashboard/page.tsx:355`
  (`if (!canEdit || !selectedProject || busy) return;`), invocado desde
  `page.tsx:742-747` dentro de la rama `state === "empty"`.
- **Escenario:** cuenta recién creada, cero proyectos → `page.tsx:158` fija
  `primerProyecto = ""` y `page.tsx:164-168` fija `state="empty"` → se pinta
  `FirstMinute` → el usuario pulsa «Elegir archivo», selecciona su DXF → la
  guarda de la línea 355 devuelve. **Sin error, sin `ImportStatus`, sin
  navegación.**
- **Por qué importa:** es el camino de quien ya tiene trabajo hecho, y es un
  «éxito sin efecto» en el minuto uno del producto. Sin cobertura:
  `first-minute-import` no aparece en ninguna prueba.
- **Arreglo:** extraer `ensureDefaultProject()` de `dashboard/sample-plan.ts` y
  usarla en `importDocument` y en `createDocument`; la guarda que quede debe
  llamar a `setActionError`, nunca `return` mudo.

### 4.3 · El `returnTo` no sobrevive a la verificación de correo

- **Dónde:** `apps/web/src/components/IdentityActionForm.tsx:189`
  (`href="/login"`, sin `returnTo`), a la salida de la cadena que empieza en
  `apps/web/src/app/demo/DemoStudio.tsx:76` y
  `apps/web/src/app/plantillas/[id]/page.tsx:160`.
- **Escenario:** el visitante dibuja en `/demo`, pulsa «Crea tu cuenta gratis y
  llévatelo» (`returnTo=/dashboard?demo=1`), se registra, abre el enlace del
  correo (que no lleva `returnTo` porque `RegisterDto` no tiene ese campo),
  pulsa «Iniciar sesión», y `localReturnTo(null)` lo deja en `/dashboard` **sin
  `?demo=1`**. `useDemoAdoption()` (`gallery-start.tsx:81-84`) no se activa y el
  dibujo se queda en `localStorage` sin que nadie lo ofrezca. Idéntico para
  `?plantilla=` desde la galería.
- **Por qué importa:** el banner promete por escrito «llévatelo» y no se cumple.
  El comentario de `plantillas/[id]/page.tsx:158` afirma «tras crear la cuenta,
  el tablero abre con la plantilla preseleccionada», que el árbol no hace.
  `demo-studio.spec.ts:57-60` sólo comprueba el `href`.
- **Arreglo:** ver §3.4. El respaldo robusto es que el tablero ofrezca la
  adopción cuando `storedDemoDocument()` exista, con o sin parámetro.

### 4.4 · «Ábrelo desde este dispositivo y entrarás directo» contradice al servidor

- **Dónde:** `apps/web/src/components/AuthPage.tsx:268` frente a
  `apps/api/src/modules/identity/identity.controller.ts:638-646`
  (`return { verified: true }`, sin cookie de sesión).
- **Escenario:** cualquier alta. El usuario abre el enlace, la verificación corre
  sola, y la pantalla siguiente le pide iniciar sesión
  (`IdentityActionForm.tsx:175-196`). No entró directo.
- **Por qué importa:** claim sin respaldo en la superficie donde la casa presume
  de no tenerlos, y un paso de más en el punto más frágil del embudo.

### 4.5 · Dos verdades sobre el idioma de la misma página

- **Dónde:** `apps/web/src/app/layout.tsx:128` (`lang={locale}`) con
  `apps/web/src/i18n/config.ts:20` (`defaultLocale = "en"`), frente a
  `apps/web/src/lib/seo/page-metadata.ts:43` (`locale: "es_MX"`).
- **Escenario:** visitante nuevo sin cookie `valle_locale` → `<html lang="en">`
  sobre una página cuyo `<h1>` es «Dibuja tus planos en el navegador» y cuyo
  `og:locale` dice `es_MX`.
- **Por qué importa:** WCAG 3.1.1 nivel A (la voz del lector de pantalla), y
  `axe` no lo caza porque sólo valida que el atributo exista y sea un código
  válido — `e2e/a11y/axe-superficies.spec.ts` pasa sobre un fallo real.

### 4.6 · La lista `accept` del importador del estado vacío diverge de la del tablero

- **Dónde:** `apps/web/src/app/dashboard/FirstMinute.tsx:156`
  (`accept=".dxf,.json,.shp,.shx,.dbf,.prj,.cpg"`) frente a
  `apps/web/src/app/dashboard/page.tsx:691-694`
  (`.dxf,.json,.shp,.shx,.dbf,.prj,.cpg,.obj,.stl,.gltf,.glb,.dae` más `.dwg`
  cuando `isDwgNativeImportBetaEnabled()`).
- **Escenario:** dos selectores de fichero que alimentan **el mismo**
  `importDocumentFile`, con dos listas distintas. En el estado vacío el diálogo
  del sistema **agrisa** `.obj`, `.stl`, `.glb` y `.dae`, y agrisa `.dwg` incluso
  en un despliegue con la beta encendida. `dashboard-dwg-import-beta.spec.ts`
  conduce el camino del tablero, no el del estado vacío, así que la divergencia
  no se ve.
- **Por qué importa:** la capacidad existe y la puerta del primer minuto no la
  ofrece. Es la copia que empieza a divergir el día que alguien arregla sólo una,
  exactamente lo que `page.tsx:571-576` razona para no duplicar formularios.
- **Arreglo:** una constante exportada (`documentImportAccept()`) junto a
  `document-import-client.ts`, consumida por los dos.

### 4.7 · El recorrido guiado sólo reconoce un muro dibujado a mano en la capa `MURO`

- **Dónde:** `apps/web/src/lib/cad/onboarding/guided-tour.ts:131`
  (`entity.layer === "MURO" && (entity.type === "line" || "polyline")`).
- **Escenario:** el comentario de arriba (líneas 124-127) promete que «el que
  alguien dibuje a mano en la capa de muros» cuenta, «porque decirle "eso no
  cuenta" a quien acaba de dibujar un muro con LINE sería mentirle». Pero:
  - la plantilla de remodelación (`starter-templates.ts:219-220`) arranca en
    `MURO-DEM` y sus capas son `MURO-EXI`, `MURO-DEM`, `MURO-NUE` — **`MURO` no
    está entre ellas**;
  - las plantillas de la galería y de la demo ponen su geometría en la capa
    `architecture` (`templates.ts:378`, vía `template-document.ts`).
  En los dos casos, un muro dibujado con `LINE` en la capa activa **nunca** marca
  el paso, y el acompañante se queda diciendo «todavía no» delante de un muro
  hecho.
- **Arreglo:** `entity.layer.toUpperCase().startsWith("MURO")` o, mejor, cotejar
  contra la capa cuyo rol declara la plantilla, que ya viaja en el documento.

### 4.8 · `docs/legal/CHECKLIST_PENDIENTES_LEGALES.md` describe un árbol que ya cambió

- **Dónde:** `docs/legal/CHECKLIST_PENDIENTES_LEGALES.md`, sección «Registro de
  aceptación», fila «El checkout exige aceptación vigente antes de abrir el
  pago · **Falta** — hoy NO la exige».
- **Escenario:** `precios/checkout/CheckoutStarter.tsx:31-113` **sí la exige**,
  con estado `checking-legal` que corre antes que nada y que falla **cerrado** si
  no hay fila `terms`.
- **Por qué importa:** por la regla 4 de la casa, un doc que contradice al árbol
  es un defecto aunque se equivoque a la baja: la siguiente sesión que lea el
  checklist puede reimplementar lo que ya está, o —peor— dudar de las filas que
  sí siguen abiertas. La fila del registro/primer acceso **sí sigue siendo
  cierta** (§3.6).

### 4.9 · `P1-FE6` del backlog describe un problema ya resuelto en un 80 %

- **Dónde:** `docs/execution/BACKLOG.md:478-545` frente a
  `apps/web/public/fonts/` (552 KB en cinco subconjuntos),
  `apps/web/src/config/fonts-generated.ts` (dos precargas) y la nota
  `//rendimiento` de `scripts/perf/lighthouserc.mobile.json` (/ 81, LCP 4,1-5,0 s).
- **Por qué importa:** el ítem sigue enumerando 1 093 KB de tipografía, tres
  ficheros TTF y un LCP de 8,9 s. Nada de eso está en el árbol. Lo que queda
  abierto es sólo la última mitad (81 < 85 y 4,1-5,0 s > 4 s) y su palanca ya no
  es tipografía sino el suelo de JS del layout compartido — que es una entrada
  distinta con un plan distinto.

---

## 5 · La apuesta ganadora

**Cerrar el puente de la demostración: que el dibujo que un desconocido hizo en
`/demo` aparezca en su cuenta, con su nombre, sin que tenga que hacer nada.**

No es la función más grande de esta lista. Es la que, si funciona, ningún CAD de
escritorio puede copiar.

El razonamiento, por partes:

**Uno.** AutoCAD no puede ofrecer «dibuja antes de registrarte». No es que no
quiera: es que su producto pesa 8 GB y su web app exige Autodesk ID antes del
lienzo. Valle Design **ya tiene** el editor real corriendo sin cuenta
(`/demo`), con la línea de comandos, las capas, las cotas y el trazador a PDF —
y el `demo-port.ts` que lo hace posible está construido y probado. Ese activo ya
está pagado.

**Dos.** El acto de dibujar es el compromiso. Quien ha trazado una línea, medido
una pared y sacado un PDF con su cajetín ya invirtió atención — que es la moneda
cara. En ese instante, el coste de crear la cuenta deja de ser una barrera y pasa
a ser una formalidad: **la cuenta ya no es el precio de entrar, es la forma de no
perder lo hecho.** Ese es el único momento del embudo en el que el usuario quiere
registrarse.

**Tres.** Hoy ese momento se desperdicia. El banner promete «llévatelo»
(`DemoStudio.tsx:78`), el mecanismo receptor está escrito
(`gallery-start.tsx:76-101`), y el parámetro que los une se pierde en la
verificación de correo (§4.3). **Está a un `sessionStorage` y a una prueba de
navegador de funcionar.**

**Cuatro.** Cerrado, encadena con el resto del informe y cambia la naturaleza
del producto:

- Con la sesión abierta al verificar (§3.5), el visitante cae en su tablero desde
  la misma pestaña donde estaba el `returnTo`, y ve **su** plano, no un tablero
  vacío. El embudo baja de 8 clics a 6, y ese número está medido y publicado.
- Con SSO (§3.8), baja a 3 clics y desaparecen las tres pantallas de correo. El
  recorrido completo pasa a ser: dibujo → «Continuar con Google» → mi dibujo en
  mi cuenta. **Menos de sesenta segundos desde el anuncio hasta un documento
  propio en la nube.**
- Y entonces la portada puede decir algo que Autodesk no puede escribir en la
  suya: **«Dibuja ahora. La cuenta, si te gusta.»** Con la demo detrás
  respaldándolo, es una afirmación comprobable en diez segundos por cualquiera
  que llegue del anuncio — que es exactamente la clase de claim que esta casa
  sabe defender con evidencia.

El resto de los huecos de este informe son deuda que hay que pagar: los términos,
el borrado de cuenta, el aviso de fin de prueba, las señales de confianza. Son
condición para vender. Pero **no hacen que nadie prefiera Valle Design sobre
AutoCAD.** El puente de la demostración sí.

---

## 6 · Resumen para el comité de inversión

| Pregunta | Respuesta del árbol |
| --- | --- |
| ¿La portada promete lo que el producto hace? | **Sí**, y con dos gates que lo imponen (`public-pages.spec.ts`, `site-evidence.ts`). Mejor que cualquier competidor. |
| ¿Cuánto cuesta llegar a dibujar? | **10 s** sin cuenta; **< 5 min y ≤ 8 clics** con cuenta, ambos medidos contra el stack real. AutoCAD: 30-90 min. |
| ¿El alta tiene fricción? | Tres campos, sin tarjeta, con gate. **Sin SSO** (`P1-F3`), y tres pantallas de correo que la sesión-al-verificar eliminaría. |
| ¿Se puede recuperar la cuenta? | Sí, con revocación de sesiones al restablecer (`identity.service.ts:430-437`). El campo de contraseña es el sencillo (`P1-F1`). |
| ¿Hay plantillas de arranque? | **105 mexicanas por giro**, con escaparate público, ficha, lámina PDF y hash de deriva en CI. Muy por encima de los `.dwt` de AutoCAD. |
| ¿Hay tutorial? | Sí, y **lee el dibujo en vez de contar clics**. Termina en un PDF. Se mide. |
| ¿Funciona el estado vacío? | **Uno de tres caminos.** El de importar no hace nada (§4.2); el de crear en blanco muere en un botón deshabilitado (§3.3). |
| ¿Se puede importar el primer DXF? | Por el tablero sí, con manifiesto de pérdidas. Por el estado vacío **no**. |
| ¿Quién está detrás? | **Nadie visible.** Sin `/nosotros`, sin razón social, sin domicilio. |
| ¿Dónde viven mis datos? | Dicho en `/seguridad` y en `TrustSeals` con mecanismos concretos. **Sin aviso de privacidad publicado** ni derechos ARCO. |
| ¿Qué pasa si dejo de pagar? | **Conservas ver y exportar, siempre**, probado y escrito como obligación. **Mejor que AutoCAD**, y enterrado en la portada. |
| ¿Me avisan antes de que termine la prueba? | El servicio existe, está cableado y probado. **El correo se descarta en silencio en cada envío** (§4.1). |

**Nota final: 6,5 / 10.** El embudo hasta el primer trazo compite y en varios
tramos gana. Lo que sostiene una compra —legal, confianza institucional,
ciclo de vida de la cuenta— está por debajo del mínimo que un despacho de diez
personas necesita el primer día. Los tres defectos de §4.1, §4.2 y §4.3 son días
de trabajo, no meses, y los tres caen dentro de los cinco minutos que este
producto ya sabe medir.
