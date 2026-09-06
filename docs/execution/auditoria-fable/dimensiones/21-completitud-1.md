# Auditoría 21 · La lente del negocio

> **Qué se auditó aquí:** lo que un despacho pregunta ANTES de firmar. Precio,
> licencias y asientos, migración desde AutoCAD, soporte, formación, contrato,
> facturación, salida. No las capacidades del editor —eso lo cubren los veinte
> informes anteriores— sino la **compra**: el trayecto que va de «esto dibuja
> bien» a «firmo, pago y muevo a mis ocho personas».
>
> Fecha: 2026-09-05. Árbol inspeccionado: `/home/user/valle-design` en el
> estado de esa fecha.

---

## Nota metodológica previa

Tres reglas me las impuse antes de escribir una línea, por la regla de la casa
«ningún claim sin evidencia»:

1. **Nada de «falta X» sin haber buscado X.** Este informe cita fichero y, donde
   importa, línea. Cuando digo que algo no existe, digo también con qué búsqueda
   lo comprobé.
2. **Ninguna cifra copiada.** El estado del producto lo computa
   `node scripts/cad/rubric.mjs` con sus dos denominadores (HOY y DESTINO). Este
   informe **enlaza**; no reescribe el marcador. Los precios que menciono salen
   de `apps/api/src/modules/commercial/commercial-catalog.bootstrap.ts`
   (`PUBLISHABLE_PLANS`), que es la constante que la migración mexicana siembra.
3. **Lo parcial se dice «todavía no».** Varias cosas de este informe están a
   medio construir y muy bien construidas a medias; eso no es un cero.

También revisé qué cubren ya los veinte informes para no repetirlos:
`grep -ic precio` sobre `docs/execution/auditoria-fable/*.md` da **19 en el 16
(landing) y 0 o 1 en todos los demás**. El 16 audita el EMBUDO —la portada, el
alta, la tarjeta de precios, la fase de prueba— y lo hace muy bien. Lo que
ningún informe mira es la **maquinaria comercial detrás de esa tarjeta**: qué
pasa el día 400, cuando el despacho creció de tres a cuatro personas, quiere su
factura timbrada, pide el SLA por escrito y su director de sistemas pregunta
dónde está la bitácora. Ese es el hueco que este informe llena.

---

## Veredicto

**La maquinaria de cobro está construida con el mismo rigor que el motor CAD y
casi nadie lo sabe.** Hay catálogo real servido de la base, aritmética de
precios en céntimos enteros con una prohibición explícita de dividir entre 100,
checkout de Stripe con tarjeta, OXXO y SPEI, portal del proveedor, historial de
facturas, baja de autoservicio a fin de período, límite de asientos comprobado
en el SERVIDOR, recordatorios de vencimiento y de renovación por outbox
transaccional, reembolsos y disputas correlacionados por webhook, captura fiscal
CFDI 4.0 validada contra los catálogos del SAT, y un SLA interno que declara
RPO/RTO medidos con su ejercicio de restauración cronometrado. Esto es más
infraestructura comercial de la que tienen la mayoría de los productos que ya
facturan.

**Y sin embargo, un despacho de ocho personas hoy no puede comprar.** No por
falta de funciones del CAD: por cinco cosas del negocio.

1. Dos superficies públicas anuncian **«Factura CFDI»** y el producto **no
   timbra**: el modo de emisión es `manual` porque no hay PAC contratado. El
   límite sólo aparece DESPUÉS de iniciar sesión, y el comprador pregunta ANTES.
2. El despacho que crece **no tiene botón para comprar el cuarto asiento**. El
   checkout responde `plan_already_active` y el servidor rechaza la cuarta
   invitación. El único camino es el portal genérico de Stripe, que el producto
   no configura ni declara.
3. **La rúbrica tiene 36 filas y ninguna es de negocio.** Mide el producto
   contra AutoCAD completo; no mide nada de lo que AutoCAD vende además del
   software: licencia por dispositivo o por usuario nombrado, red de
   distribuidores, formación, certificación, soporte con tiempos.
4. **El SLA existe, es bueno, y ningún cliente puede verlo.** Vive en
   `docs/ops/SLA.md`, no se publica, y sus nombres de plan (Piloto ·
   Profesional · Empresa) **no coinciden** con los del catálogo vendible
   (Prueba · Individual · Despacho).
5. **No hay ruta de migración del archivo de un despacho.** DWG está apagado por
   decisión firmada (ADR-0014), lo cual es defendible; lo que no está mirado es
   todo lo demás que un despacho carga consigo: sus patrones `.pat`, sus
   plantillas, su biblioteca de bloques, sus rutinas `.lsp` —que hoy viven en el
   navegador de cada persona y no viajan entre máquinas ni entre socios—.

Ninguno de los cinco es un problema de motor. Los cinco son de dos semanas cada
uno como mucho, y tres son de un día.

### Lo que hay que decir antes que nada

El producto **ya es mejor que Autodesk en la cosa que más miedo da al firmar**:
cuando el período termina, la cuenta pasa a sólo lectura y el usuario sigue
abriendo, imprimiendo y exportando sus planos. Está escrito en `/terms` como
**obligación del servicio, no cortesía revocable**, y probado en
`apps/api/src/modules/auth/guards/entitlement-read-only.pg.spec.ts`. Autodesk
te bloquea. Esa frase, dicha delante de un socio director, vale más que tres
filas de rúbrica, y hoy está enterrada (el informe 16 §3.11 ya lo señaló desde
la lente de la portada; desde la lente comercial es peor: no está en el
material de venta porque no hay material de venta).

---

## 1 · Lo que ya está construido y está bien

Con evidencia, porque lo fácil en un repositorio de este tamaño es declarar que
falta algo que ya está.

### 1.1 · El catálogo comercial es dato, no texto

`apps/api/src/modules/commercial/commercial-catalog.bootstrap.ts` siembra
`PUBLISHABLE_PLANS`: **Individual** (por cuenta, mínimo 1, MXN 199/mes ·
1 990/año, impuesto incluido) y **Despacho** (por usuario, mínimo 3, MXN
169/usuario/mes · 1 690/usuario/año). `GET /v1/commercial/public/plans` los
sirve y `/precios` los pinta. Si el catálogo no responde, la página **se queda
sin importes y lo dice**, con reintento — no inventa un precio de ejemplo. El
comentario del bootstrap explica por qué la constante se duplica y no se importa
de la migración: «una migración es un hecho histórico congelado». Eso es
pensamiento de producto, no de sprint.

### 1.2 · La aritmética de precios no puede mentir

`apps/web/src/lib/commercial/pricing.ts`. Importes en céntimos enteros, cero
divisiones entre 100 en todo el módulo, formateo partiendo la cadena de dígitos
y dejando que `Intl` ponga separadores. Y —esto es lo bueno— la **unidad**
(`por usuario/mes` frente a `por cuenta/mes`), el **mínimo de asientos** y el
**impuesto incluido** se derivan del MISMO dato que el precio:

> «169 al lado de 199 es MENTIRA si el primero es por usuario y exige tres
> asientos».

`minimumChargeCents()` publica lo que de verdad se cobra la primera vez (169 ×
3 = 507), y `annualSaving()` calcula el descuento anual desde los dos importes
publicados, nunca desde un porcentaje escrito a mano que se convierte en
publicidad falsa el día que alguien toca la tabla.

### 1.3 · La compra existe de verdad

`apps/api/src/modules/commercial/controllers/billing.controller.ts`:
`POST checkout-sessions`, `POST billing-portal-sessions`, `GET invoices`,
`POST subscription/cancel`. Con Stripe para México —tarjeta, OXXO y SPEI—
(`adapters/stripe-mexican-payments.spec.ts`), webhook con verificación de firma
sobre el cuerpo crudo (`stripe-webhook.raw-body.ts`), idempotencia
(`commercial-idempotency.spec.ts`) y reembolsos y disputas correlacionados
(`commercial-refunds-disputes.pg.spec.ts`: un reembolso pasa la factura espejo a
`refunded` sin tocar el acceso; una disputa suspende la suscripción; una disputa
sobre una suscripción cancelada **no la resucita**). Ese último test es el tipo
de detalle que sólo escribe quien ya ha vivido el caso.

La baja es autoservicio, a fin de período, y no corta el acceso a lo ya pagado.

### 1.4 · El límite de asientos vive en el servidor

`apps/api/src/modules/commercial/seat-entitlement.service.ts`, y su cabecera
merece citarse porque es exactamente el criterio correcto:

> «El checkout ya cobraba la cantidad correcta de asientos, pero nada impedía
> meter después el triple de miembros [...] Cerrarlo sólo en la interfaz
> —escondiendo el botón de invitar— no es un límite; es una sugerencia que
> cualquiera salta con una petición HTTP.»

Las invitaciones pendientes ocupan asiento; se comprueba al invitar y al
aceptar; y **una organización que quede por encima de su límite conserva a todos
sus miembros** y simplemente no puede añadir más. Expulsar a alguien que ya
trabajaba sería cobrarle al cliente un cambio que no pidió. Correcto.

### 1.5 · Los puertos declaran su degradación

`ports/payment-provider.port.ts` y `ports/cfdi-provider.port.ts`. Sin
credenciales, el adaptador es NULO **y lo dice**: el checkout responde
`checkout_unavailable` y el CFDI queda en `mode: 'manual'`. El comentario del
puerto CFDI es honesto hasta el detalle de nombrar a los PAC candidatos que
todavía no se han contratado.

### 1.6 · El modo de lanzamiento es un interruptor con una sola voz

`apps/web/src/config/launch.ts`. `LAUNCH_MODE` decide qué se ENSEÑA sin apagar
el cobro; el titular de la oferta se construye con el número real del backend
(`freeOfferHeadline(trialDays)`), y `FREE_LAUNCH_PROMISE` está atada a dos
pruebas que la sostienen. Un producto que no puede publicar «3 meses gratis» sin
que una prueba lo verifique es un producto que no va a publicar una mentira por
descuido.

### 1.7 · El SLA está escrito como se escriben los SLA que se cumplen

`docs/ops/SLA.md`, 199 líneas. Define «disponible» como un endpoint concreto y
una consulta PromQL concreta. Distingue respuesta de resolución. Declara
RPO/RTO por plan y **mide** el ejercicio de restauración (2026-08-15, PostgreSQL
16.9, 6,86 s de ciclo completo) diciendo a la vez que **esa medida no se
extrapola**. Y tiene una sección 6 de exclusiones —sin réplica en caliente, sin
multi-región, sin compromiso del navegador del cliente— que es lo que separa un
SLA de un folleto. La regla del documento:

> «un objetivo sin instrumento de medida no es un objetivo, es una promesa».

### 1.8 · La escalera ya sabe qué se puede prometer

`docs/parity/ESCALERA.md`. Siete peldaños, y cada uno dice **qué se le puede
decir a un cliente**. El peldaño 6 es «legal y autorizado para producción — se
puede VENDER activamente, con el alcance exacto que la firma cubrió». Es el
puente entre ingeniería y contrato, y existe. Volveré sobre el peldaño 7.

### 1.9 · La aceptación legal versionada ya está conectada al checkout

`docs/legal/CHECKLIST_PENDIENTES_LEGALES.md` declara como «Falta» que el
checkout exija la aceptación vigente. **Ya no falta**:
`apps/web/src/app/precios/checkout/CheckoutStarter.tsx:86-111` consulta
`GET /v1/legal/documents` y `/acceptances`, y **falla cerrado** si no encuentra
la fila `terms`. Los dos endpoints están en el contrato
(`packages/contracts/specs/design-api.v1.yaml:1063,1080`). El informe 16 §4.8 ya
había detectado que ese checklist describe un árbol que cambió; desde la lente
comercial la conclusión es la misma y más urgente, porque ese checklist es lo
que un abogado va a leer.

### 1.10 · El canal «algo salió mal» existe, con estado visible

BACKLOG P1-7 cerrado el 2026-08-27: botón en el estudio, cuadro que enseña campo
por campo lo que se manda, casilla de autorización del plano apagada por
defecto, entrega por outbox transaccional. Y además hay bandeja de comentarios
con estados que el propio usuario ve
(`apps/web/src/app/comentarios/FeedbackInbox.tsx`: nuevo · leído · planeado ·
resuelto, cada uno «con lo que SIGNIFICA para quien escribió»). Muy pocos
productos jóvenes cierran ese lazo.

### 1.11 · Existe el procedimiento de la prueba con un arquitecto real

`docs/guides/sesion-con-arquitecto.md`. La regla —**no ayudes, ni una vez**— y
el corolario de que un atasco resuelto por ti es un atasco que el siguiente
cliente vivirá solo. El documento nombra la cifra correcta: «esa diferencia es
la que decide si un despacho paga 199 al mes».

---

## 2 · Los huecos, por lo que le cuestan a la venta

### 2.1 · «Factura CFDI» se anuncia en dos superficies públicas y el producto no timbra (BLOQUEANTE)

**Dónde.** `apps/web/src/app/precios/PricingCatalog.tsx:59-64`, el `FiscalSeal`,
con tres etiquetas **escritas a mano**: «IVA incluido», **«Factura CFDI»**,
«Cancelas cuando quieras». Y `apps/web/src/lib/marketing/faq.ts:322-325`,
renderizada en la PORTADA (`apps/web/src/app/page.tsx:624` monta `<FaqCenter/>`):

> «¿Emiten factura? — **Sí, con CFDI** y los datos fiscales de tu despacho.»

**Qué dice el producto.** `ports/cfdi-provider.port.ts` define
`CfdiIssuanceMode = 'manual' | 'automatic'`, y el adaptador por defecto es
`null-cfdi.provider.ts` con `mode: 'manual'`. `PRODUCT.md` lo llama por su
nombre: «**Caveat fiscal honesto:** no hay PAC contratado [...] El producto no
timbra todavía».

**La asimetría es lo grave.** El límite SÍ se dice, con una frase que viene del
descriptor de la API y no de una constante local, en
`apps/web/src/app/cuenta/facturacion/TaxProfileForm.tsx:183-188` (`issuanceNotice`,
`data-testid="issuance-notice"`). Es decir: **la verdad está detrás del login**,
donde ya estás dentro; **la promesa está fuera**, donde se decide comprar. Para
un despacho mexicano el CFDI no es un detalle: es la diferencia entre un gasto
deducible y uno que no lo es, y es exactamente el argumento con el que este
producto le gana a AutoCAD cobrado en dólares.

Esto choca de frente con la regla 3 de la casa: «ninguna capacidad se anuncia
sin evidencia del límite».

**Cómo se arregla (medio día).** El sello y la respuesta del FAQ dejan de ser
texto y se derivan del dato, igual que los precios. `GET /v1/commercial/public/plans`
—o un `GET /v1/commercial/public/fiscal` hermano— publica el descriptor del
emisor (`{ mode: 'manual' | 'automatic' }`), el sello lee ese campo y muestra
«Factura CFDI» o «Datos fiscales para tu factura (la emitimos nosotros)». Con
una prueba en `apps/web/src/app/precios/commercial-surface.spec.ts` que afirme
que **el sello nunca dice «Factura CFDI» cuando el modo es `manual`**. Ese test
es el gate: el día que se contrate el PAC, el sello cambia solo y nadie tiene
que acordarse.

### 2.2 · El despacho que crece no puede comprar el cuarto asiento (BLOQUEANTE)

**El caso.** Despacho contrata el plan Despacho con sus tres asientos mínimos.
En marzo entra un pasante. El propietario va a invitarlo.

**Qué pasa.** `SeatEntitlementService` devuelve `denial: 'seat_limit_reached'` y
la API rechaza la invitación —correcto, el límite es el que compró—. El
propietario va entonces a comprar el asiento y
`billing.controller.ts:505-511` responde:

```
409 { code: 'plan_already_active',
      message: 'La organización ya tiene ese plan activo.' }
```

**No hay ningún endpoint que cambie `seats`.** Lo comprobé: la única escritura
de `seats` fuera del alta es `billing-webhook.service.ts:277`, que la copia del
intent al activar. `POST billing-portal-sessions` abre el portal de Stripe con
sólo el `providerCustomerId` (`adapters/stripe-payment.provider.ts`), sin
configuración de actualización de cantidad; que ahí se pueda o no cambiar el
número de asientos depende del panel de Stripe del operador y **el producto no
lo declara ni lo prueba**.

**Por qué es lo más caro de esta lista.** Es el único defecto de este informe
que se activa cuando el cliente ya está pagando y contento. Es literalmente el
momento de la expansión —la métrica que decide si un SaaS crece o se estanca— y
el producto responde con un 409 y sin salida. Y el mensaje del 409 es peor que
inútil: le dice al cliente que ya tiene el plan, cuando su problema es que
quiere más de él.

**Cómo se arregla (dos o tres días).** Un `POST /v1/commercial/subscription/seats`
con `{ seats }`, owner/admin, que (a) rechace por debajo del mínimo del plan
—reutilizando `resolveCheckoutSeats`, que ya sabe hacerlo y ya está probado en
`checkout-seats.spec.ts`—, (b) rechace por debajo de `members + pendingInvitations`
con el mismo criterio que `SeatEntitlementService` y diciendo cuántos sobran,
(c) delegue el cambio de cantidad al proveedor y (d) publique el evento de
dominio. La UI ya tiene dónde: `apps/web/src/app/cuenta/facturacion/BillingPortal.tsx:271`
imprime «Asientos contratados: N» y ahí va el botón. Y el mensaje del muro de
invitación en `apps/web/src/app/equipo/TeamRoom.tsx` deja de ser «no quedan
asientos disponibles» y pasa a ser eso con un enlace a comprarlos.

**Prohibido el atajo:** no relajar el límite de asientos «mientras tanto». El
límite está bien puesto y es lo que el cliente compró.

### 2.3 · La rúbrica tiene 36 filas y ninguna mide la compra

`docs/competitive/rubric.json` reparte sus puntos en siete grupos: núcleo,
productividad, extensibilidad, frontera, integridad, reconocimiento y toolsets.
Recorrí las 36 categorías: **ninguna** menciona precio, licencia, asientos,
migración de un despacho, soporte, formación ni contrato.

Eso está bien mientras la rúbrica se lea como lo que declara ser: una matriz de
capacidad técnica. El problema es lo que dice su propio encabezado de alcance:
la cifra de DESTINO es «AutoCAD completo con sus verticales» y su audiencia es
«un inversionista y nosotros mismos». Y lo que Autodesk vende no es un binario:
es **la suscripción**. Un despacho que compara no compara motores de dibujo,
compara paquetes:

| Lo que un despacho compara | AutoCAD | Valle Design, hoy | ¿Lo mide alguna fila? |
| --- | --- | --- | --- |
| Precio por usuario y año | público, en USD | MXN 1 690–1 990/año | no |
| Licencia por usuario nombrado, préstamo, uso simultáneo | sí | asientos por organización | no |
| Distribuidor local que factura y da la cara | red establecida en MX | ninguno | no |
| Formación y certificación | cursos y certificado | cinco guías | no |
| Soporte con tiempos comprometidos | por nivel de suscripción | `docs/ops/SLA.md`, sin publicar | no |
| Lo que pasa con mis DWG de veinte años | los abre | todavía no (ADR-0014) | la fila `dwg`, sólo la técnica |
| Lo que pasa si dejo de pagar | te bloquea | sigues abriendo y exportando | no, **y esta la gana Valle** |

Dos de esas filas Valle Design **las gana hoy** (precio y el modo de sólo
lectura) y no las cuenta en ningún sitio. Tres las pierde y no las declara. Esa
es la definición de una rúbrica que no mide lo que decide la venta.

**Cómo se arregla.** No inflando la rúbrica del CAD: **un grupo nuevo,
`comercial`, con su propio denominador**, en el mismo `rubric.json` y bajo las
mismas reglas de evidencia (evidencia propia frente a independiente; un módulo
no cuenta por existir). Cinco o seis filas, no más:

- `comercial.compra` — comprar, cambiar de plan y cambiar de asientos sin
  escribir a nadie. Evidencia: los endpoints + el golden de compra.
- `comercial.factura` — el comprobante fiscal que el cliente necesita, emitido
  por el producto. Evidencia: el descriptor en modo `automatic` + el spec del
  PAC contra su entorno de pruebas (ya está en BACKLOG P2-6).
- `comercial.migracion` — lo que un despacho trae consigo el primer día (§2.5).
- `comercial.servicio` — SLA publicado y sus nombres coincidiendo con el
  catálogo (§2.4).
- `comercial.salida` — llevarse todo y borrarlo todo (§2.7).
- `comercial.referencia` — un cliente real, medido (§2.9).

Y la regla que lo sostiene, calcada de la regla 4 de la casa: **las cifras del
grupo comercial también las computa `scripts/cad/rubric.mjs`**, y la propuesta
comercial las ENLAZA. Un descuento escrito a mano en un PDF de venta es
exactamente el mismo defecto que un porcentaje escrito a mano en la página de
precios, que `annualSaving()` ya se encarga de hacer imposible.

### 2.4 · El SLA existe, es bueno, y ningún cliente puede verlo

`docs/ops/SLA.md` no está enlazado desde ninguna ruta pública. Lo comprobé:
`COMMERCIAL_LINKS` (`apps/web/src/config/commercial.ts`) tiene `sales`,
`documentation`, `pricing`, `support`, `status`, `contact`, `privacy`, `terms`,
`licenses` — **no hay `sla`**. Y `/terms` dice explícitamente:

> «No se publica un nivel de servicio (SLA): un compromiso de disponibilidad
> requiere un acuerdo escrito con el titular.»

Eso es defendible como postura legal. Lo que **no** es defendible es la
divergencia de nombres: el SLA habla de **Piloto · Profesional · Empresa** y el
catálogo vendible publica **Prueba · Individual · Despacho**. Un cliente que
reciba los dos documentos —y en una compra corporativa los recibe— no va a poder
mapear una tabla contra la otra, y la primera pregunta de su departamento de
compras será cuál de los dos está desactualizado. La respuesta correcta, hoy, es
«el SLA», y eso es exactamente lo que no quieres que pregunten.

Además, la página `/status` es honesta hasta la incomodidad: sin fuente externa
configurada dice «Sin telemetría pública» y se niega a declarar nada. Está bien
razonado, y a la vez es lo primero que mira un director de sistemas. No hay
historial de disponibilidad publicado de ningún tipo.

**Cómo se arregla (un día el 90 %).**
1. Renombrar los niveles del SLA a los del catálogo, o —mejor— declarar en
   `SLA.md` el mapeo explícito plan-vendible → nivel-de-servicio, con una prueba
   que falle si aparece un plan publicable sin nivel asignado. Los nombres de
   plan del catálogo son los que ve el cliente; el SLA es el que se adapta.
2. Publicar `/sla` con el §1 (definiciones), §2 (niveles), §3 (respuesta) y §6
   (exclusiones), añadiendo `sla` a `COMMERCIAL_LINKS` con su fallback local,
   igual que las otras nueve. Las secciones §4, §5 y §7 —consultas PromQL,
   ejercicio de restauración, comprobaciones ejecutables— se quedan en `docs/`:
   son el respaldo, no el compromiso.
3. Mantener la frase de `/terms` con una corrección: hoy dice que no se publica
   SLA; mañana dirá que el SLA publicado describe los objetivos y que los
   créditos por incumplimiento se pactan por escrito. Eso último ya está escrito
   en `SLA.md` §6 y es la postura correcta.

### 2.5 · No hay ruta de migración del archivo de un despacho

Esta es la sección que más busqué antes de escribirla, porque es la más fácil de
declarar mal.

**Lo que SÍ está** (y es más de lo que esperaba):

| Lo que el despacho trae | Estado |
| --- | --- |
| Tablas de plumas `.ctb` | **entra**: `STYLESMANAGER` carga el `.ctb` del despacho y el estudio publica tres de fábrica (fila `layouts` de la rúbrica, Ola 3 del 2026-09-03) |
| Fuentes `.shx` comunes (txt, simplex, romans, isocp, monotxt) | **se dibujan** con trazos Hershey en visor, lámina y PDF, con las anchuras declaradas como distintas rótulo a rótulo (fila `mtext`) |
| Rutinas AutoLISP | **corren**: intérprete en sandbox con DCL, presupuesto de pasos y una sola puerta de mutación |
| Dibujos en DXF de texto | **entran y vuelven**, con manifiesto de pérdidas y verificación contra ezdxf |
| Varios ficheros a la vez | el importador acepta `multiple` (`apps/web/src/app/dashboard/page.tsx:696`) |

**Lo que NO está, y ninguna fila lo mira:**

1. **DWG.** Apagado por ADR-0014, por instrucción del titular del 2026-08-24: no
   hay presupuesto para ODA/RealDWG y todo el DWG saldrá del códec propio. La
   decisión está firmada y no la discuto. Lo que sí señalo desde esta lente es
   que la ADR asume el costo comercial en una línea —«el producto no ofrecerá
   DWG de forma amplia ni inmediata: esto es un costo consciente»— y **nadie ha
   medido ese costo**. Cuántas de las conversaciones de venta mueren en esa
   pregunta es un dato que hoy no se recoge en ninguna parte, y es el dato que
   debería gobernar la prioridad del laboratorio.
2. **Los patrones `.pat` del despacho.** La propia rúbrica lo dice en la fila
   `hatch`: «faltan los patrones cargados de un `.pat` del despacho». Un
   despacho de arquitectura tiene sus rellenos y los reconoce de un vistazo.
3. **Las plantillas y el cajetín del despacho.** Hay galería de plantillas
   mexicanas (`apps/web/src/lib/marketing/template-gallery.ts`,
   `lib/cad/starter-templates.ts`) y es una fortaleza real. Lo que no hay es
   forma de que **el despacho publique la SUYA**: busqué una plantilla propiedad
   de la organización en el API (`grep -ril plantilla apps/api/src/modules` da
   sólo plantillas de CORREO) y no existe. El cajetín de un despacho con su
   logotipo, sus casillas de revisión y su numeración es identidad corporativa;
   redibujarlo en cada plano nuevo es exactamente el trabajo que un despacho
   dejó de hacer hace veinte años.
4. **La biblioteca de bloques compartida.** Existe el motor (ADCENTER,
   `lib/cad/blocks/design-center.ts`, bloques dinámicos del usuario) y no existe
   la biblioteca de la organización en el servidor.
5. **Y el caso que más me sorprendió: las rutinas `.lsp` no viajan.**
   `apps/web/src/lib/lisp/library.ts` describe la biblioteca «de una
   organización» con validación al subir, versionado monotónico, huella de
   contenido, inventario de comandos `c:` y orden de autocarga —todo—, y dice a
   continuación: «**NO está el almacenamiento**». La implementación conectada es
   `BrowserLispLibraryStore` (`apps/web/src/components/cad/lisp/library-storage.ts`),
   es decir, almacenamiento **del navegador**. Consecuencia para un despacho de
   ocho personas: cada una sube las rutinas en su máquina, nadie comparte el
   estándar del despacho, y limpiar los datos del navegador se las lleva.

   Tres cosas que decir sobre esto, en orden de gravedad:

   - El FAQ público **lo dice bien** (`faq.ts:180-184`: «Hoy en el navegador de
     la computadora donde las escribiste, no en el servidor»). Bien.
   - `PRODUCT.md` dice «un intérprete AutoLISP en sandbox con **biblioteca
     `.lsp` por organización**». Leída por alguien que compra, esa frase promete
     una biblioteca del despacho. Es la misma clase de frase que la casa prohíbe.
   - El FAQ añade «**está en la cola**». Busqué:
     `grep -in "lisp\|\.lsp" docs/execution/BACKLOG.md` → **cero resultados**.
     No está en la cola. Una página pública que cita un backlog inexistente es
     un defecto de veracidad pequeño y del tipo exacto que este repositorio
     persigue en el producto.
   - La cabecera de `library.ts` también quedó vieja: dice «lo tiene mientras
     dure la pestaña», y con `BrowserLispLibraryStore` conectado sobrevive a la
     recarga. Vale la pena corregirla: un comentario que exagera la limitación
     hace que nadie confíe en el resto de los comentarios.

**Cómo se arregla.** Lo grande primero, porque comparten forma: **un
`/v1/cad/assets` por organización** para las tres cosas que un despacho carga
—rutinas `.lsp`, bloques, plantillas y cajetín— con el mismo patrón CAS y de
tenant que ya gobierna documentos. El puerto de LISP ya está listo para eso: el
propio fichero dice que el día que exista el endpoint se escribe un
`ApiLispLibraryStore` con las mismas cinco operaciones. `.pat` es aparte y
mucho más pequeño (es un parser de texto y una tabla). Y **antes que nada**, hoy
mismo: entrar `P1-Neg-1 · persistencia de la biblioteca .lsp por organización`
en el BACKLOG, para que la frase del FAQ deje de ser falsa.

### 2.6 · La bitácora existe y ningún cliente puede leerla

`apps/api/src/modules/audit-log/design-audit-log.service.ts` escribe asientos
con actor, acción, referencia y payload, con ámbito de tenant, y **escribe
siempre** (lanza si la base falla). La consumen el guard de permisos, los
enlaces de revisión y el adaptador CAD.

Ahora la parte que importa para una venta: **es de sólo escritura**. No hay
`@Controller` en el módulo (`grep "@Controller\|@Get" apps/api/src/modules/audit-log`
no devuelve nada) y no hay ninguna ruta de bitácora en el contrato
(`grep -n audit packages/contracts/specs/design-api.v1.yaml` sólo da los intents
de upgrade y las notas de auditoría de otros endpoints).

Un despacho de veinte personas, o cualquier cliente con un responsable de
sistemas, pregunta esto en la primera reunión: quién abrió el plano del cliente,
quién lo exportó, quién revocó el enlace de revisión, quién sacó a alguien de la
organización. Los datos están. Nadie puede verlos sin acceso a PostgreSQL.

**Cómo se arregla (dos días).** `GET /v1/organizations/{id}/audit-log` paginado,
owner/admin, con filtro por acción y rango de fechas, y su pantalla en
`/cuenta`. Con la regla que el propio servicio ya insinúa: el payload no puede
llevar datos personales que la bitácora no necesite. Es también el prerrequisito
del derecho ARCO de acceso (§2.8).

### 2.7 · Salir es fácil por plano y no existe por despacho

La promesa de salida es excelente y está probada: al vencer, la sesión conserva
`cad:view` y el usuario exporta a DXF y a PDF. Por documento hay incluso
`ETRANSMIT` con su ZIP (`lib/cad/etransmit/zip-writer.ts`).

Lo que no existe es la salida **de la organización**:

- No hay exportación masiva. Un despacho con cuatrocientos planos se los lleva
  de cuatrocientos en cuatrocientos.
- No hay borrado de organización ni de cuenta. Lo comprobé: el único `@Delete`
  de identidad y organizaciones es
  `identity.controller.ts:497` (`sessions/:sessionId`). El informe 16 §3.9 ya lo
  señaló desde la lente del usuario; desde la lente comercial pesa más, porque
  es una obligación de la LFPDPPP (derechos ARCO) y aparece como pendiente en
  `docs/legal/PLANTILLA_AVISO_PRIVACIDAD.md`.
- No hay política de reembolso publicada. La maquinaria de reembolso existe y
  está probada; la política —lo que el cliente puede exigir— está en la
  checklist legal como pendiente y no en ninguna página.

Un despacho pregunta «¿y si mañana cierran ustedes?» y la respuesta hoy es
buena por plano y muda por despacho. La respuesta buena es: exportación completa
de la organización, iniciada por el propietario, entregada por el mismo outbox
que ya entrega todo lo demás.

### 2.8 · El expediente que pide un comprador corporativo no existe todavía

Busqué los términos que aparecen en cualquier cuestionario de compra
(`grep -ril` sobre `docs`, `apps`, `packages`):

| Lo que piden | En el árbol |
| --- | --- |
| ISO 27001 / SOC 2 | sólo se mencionan en los informes 15 y 16 como ausencia |
| Pentest externo | ningún resultado |
| DPA / acuerdo de encargado del tratamiento | ninguno (`encargado del tratamiento`: cero) |
| Subencargados (lista de proveedores) | sólo el informe 15 |
| Residencia de datos | cero |
| Aviso de privacidad definitivo | plantilla sin completar, `/privacy` es un resumen |
| Términos definitivos | `/terms` se declara a sí mismo «borrador pendiente de revisión legal» |
| Razón social, RFC, domicilio | `CHECKLIST_PENDIENTES_LEGALES.md`, todas las filas en `[ ]` |

Aquí hay que ser justo en dos direcciones. Primero: `/terms` diciendo en voz
alta «no ha pasado revisión legal profesional» es **más honesto que el 95 % de
los términos de servicio de internet**, y encaja con la cultura de la casa.
Segundo: esa misma honestidad es, en una compra corporativa, una respuesta que
detiene el expediente. Las dos cosas son verdad a la vez, y por eso la salida no
es suavizar el texto sino **completarlo**: las filas de esa checklist no las
resuelve ingeniería —lo dice el propio documento— y son hoy el camino crítico
comercial más largo del repositorio, porque dependen de un tercero (abogado,
constitución, IMPI, PAC) y no de una campaña.

Nota operativa: la checklist está desactualizada en dos de sus filas (§1.9). Un
documento legal que el titular va a llevar a un abogado y que describe un árbol
que ya cambió es un defecto barato de arreglar y caro de descubrir en la reunión.

### 2.9 · Ningún cliente real, medido: el peldaño 7 está vacío

`docs/parity/ESCALERA.md`, peldaño 7 («en producción, medido en vivo»):

> «**ninguna fila del producto está aquí todavía de forma medida**».

Y desde la lente comercial eso significa exactamente esto: **no hay ni un
cliente de referencia**. No hay caso de estudio, no hay logotipo, no hay
testimonio, no hay historial de disponibilidad, no hay «llevamos N meses con M
despachos». `docs/guides/sesion-con-arquitecto.md` es el **procedimiento** para
sentar a un arquitecto delante del producto —y es un procedimiento excelente—;
busqué el **registro** de una sesión ejecutada y sólo lo referencian dos
informes de campaña, ninguno con el resultado de una sesión real.

Esta es, de las once, la que menos se arregla con código y la que más decide.
Un despacho no pregunta «¿cuántos puntos tienen contra AutoCAD?»: pregunta
«¿quién más lo usa?». Y la infraestructura para responderla algún día ya está
puesta —el canal de incidentes por outbox, la bandeja de comentarios con
estados, la telemetría opt-in—; lo que falta es correr la sesión, anotarla y
tener el primer despacho.

### 2.10 · El argumento de precio contra AutoCAD no tiene una sola cifra respaldada

El encargo de esta auditoría dice que Valle Design «compite contra AutoCAD
completo, la suscripción cara». Busqué el respaldo de esa comparación en
`docs/competitive/` y no existe: `grep -rn "USD\|dólar\|precio" docs/competitive/*.md`
devuelve tres resultados y los tres hablan de catálogos de fabricante de
tubería, no de lo que cuesta AutoCAD.

Es decir: la afirmación comercial **central** del producto —«cuesta una fracción
de lo que pagas»— es la única afirmación importante de este repositorio que **no
tiene artefacto de evidencia**, en un proyecto que exige oráculo externo para
declarar que una cota mide bien. Y es la afirmación más fácil de respaldar de
todas: el precio de lista de AutoCAD es público.

**Cómo se arregla (medio día).** Un `docs/competitive/costo-comparado.json` con
la misma disciplina que el resto de la evidencia: importe, moneda, período,
fecha de consulta, URL de origen y captura archivada; regenerado por un script
que **falle si el dato tiene más de N días** —exactamente el mecanismo de
`manualMaxAgeDays` que `rubric.json` ya usa—. La página de precios y cualquier
material de venta leen de ahí y nunca de un `.tsx`. Un precio de la competencia
escrito a mano en una landing caduca en silencio, y cuando caduca se convierte
en publicidad comparativa falsa, que es un problema legal y no de diseño.

### 2.11 · Formación: cinco guías excelentes y ningún itinerario

`DOC_GUIDES` (`apps/web/src/config/site-routes.ts:65`) tiene cinco guías, están
bien escritas y cada una declara sus límites. `/educacion` es un modelo de
honestidad: cuenta lo que hoy se puede hacer con un grupo y **no** anuncia el
plan educativo porque está tras flag apagado, con las dos decisiones que faltan
escritas (qué dominios institucionales y qué capacidad de soporte para el pico
de altas de un semestre). BACKLOG P1-F4 lo tiene en cola.

Lo que no existe es lo que compra un despacho cuando cambia de herramienta:
**el primer día de ocho personas**. Ni un itinerario ordenado («del AutoCAD que
sabes a esto, en cuatro horas»), ni un mapa de equivalencias de comandos —que
sería barato, porque el registro de ~192 comandos y la tabla de 129 alias de
`acad.pgp` ya existen y ya se verifican en `check:command-integrity`—, ni una
sesión de arranque asistida como servicio. Y no hay certificación, que en el
mundo AutoCAD es parte de por qué un delineante no se quiere mover: su currículo
dice AutoCAD.

Aquí no hay ningún defecto: hay una pieza de negocio que nadie ha construido
porque nadie la ha listado. La listo.

---

## 3 · Defectos concretos, con fichero y línea

Los seis que un gate podría vigilar mañana.

### 3.1 · `FiscalSeal` afirma «Factura CFDI» desde una constante local

`apps/web/src/app/precios/PricingCatalog.tsx:60-64`. Las tres etiquetas están
escritas a mano en el componente. El descriptor real
(`GET /v1/commercial/tax-profile` → `issuance.mode`) no llega a esta página.
**Efecto:** una promesa fiscal pública que el producto no cumple.
**Contradice:** `PRODUCT.md` («el producto no timbra todavía») y la regla 3 de
`AGENTS.md`.

### 3.2 · La respuesta «¿Emiten factura?» del FAQ no lleva su límite

`apps/web/src/lib/marketing/faq.ts:322-325`, renderizada en la portada
(`apps/web/src/app/page.tsx:624`). Es la única respuesta del FAQ de la categoría
`precios` que afirma una capacidad sin decir dónde acaba; las otras cuatro
—tarjeta, fin del período, cancelación, educación— lo hacen ejemplarmente.

### 3.3 · `plan_already_active` es la respuesta equivocada a «quiero más asientos»

`apps/api/src/modules/commercial/controllers/billing.controller.ts:505-511`. El
409 es correcto para «vuelve a comprar lo que ya tienes» e incorrecto para el
caso real que lo dispara. No hay ruta alternativa que ofrecer en el mensaje
porque no existe.

### 3.4 · El módulo `audit-log` no tiene controlador

`apps/api/src/modules/audit-log/` contiene módulo, servicio, entidad y su spec
de PostgreSQL, y ningún `@Controller`. Ninguna ruta de bitácora en
`packages/contracts/specs/design-api.v1.yaml`.

### 3.5 · Los niveles de `SLA.md` §2 no existen en el catálogo

`docs/ops/SLA.md` §2 y §3 y §5 hablan de Piloto · Profesional · Empresa;
`commercial-catalog.bootstrap.ts` publica `standalone-trial` («Prueba»),
`individual` y `despacho`. Dos vocabularios para la misma cosa, y uno de los dos
va en el contrato con el cliente.

### 3.6 · El FAQ cita un backlog que no existe, y `library.ts` exagera su límite

`faq.ts:184` dice de la persistencia de rutinas «está en la cola»;
`grep -in "lisp\|\.lsp" docs/execution/BACKLOG.md` no devuelve nada. Y la
cabecera de `apps/web/src/lib/lisp/library.ts:19-21` dice «lo tiene mientras
dure la pestaña» cuando el almacén conectado es
`BrowserLispLibraryStore` y sobrevive a la recarga. Dos direcciones opuestas del
mismo descuido: uno promete de más, el otro se acusa de más.

---

## 4 · La secuencia que yo seguiría

Ordenada por lo que desbloquea una venta partido por lo que cuesta. No es una
lista de deseos: es lo que hace falta para que un despacho de ocho personas
pueda firmar y crecer.

**Ola 1 · Dejar de prometer lo que no se hace (1 día).** §3.1 y §3.2: el sello
fiscal y la respuesta del FAQ se derivan del descriptor, con la prueba que
impide que «Factura CFDI» aparezca en modo `manual`. §3.6: entrar
`P1-Neg-1 · biblioteca .lsp por organización` al BACKLOG y corregir la cabecera
de `library.ts`. Actualizar las dos filas ya cerradas de
`CHECKLIST_PENDIENTES_LEGALES.md`. Coste casi nulo, y es lo único de esta lista
que corrige afirmaciones falsas vivas.

**Ola 2 · Que un cliente pueda crecer (3 días).** §2.2: el endpoint de asientos,
su validación reutilizando `resolveCheckoutSeats` y `SeatEntitlementService`, el
botón en `BillingPortal.tsx` y el enlace desde el muro de invitación de
`TeamRoom.tsx`. Un golden que compre tres asientos, choque contra el límite,
compre el cuarto e invite. Esta ola es la que más dinero mueve.

**Ola 3 · El expediente que pide un comprador (2 días de ingeniería, más el
tiempo del titular).** §2.4: publicar `/sla` y unificar los nombres de plan con
su prueba. §2.6: `GET /v1/organizations/{id}/audit-log` y su pantalla. §2.10:
`costo-comparado.json` con caducidad vigilada. Lo que no es ingeniería —razón
social, dominio, correos propios, abogado, PAC— arranca aquí en paralelo porque
es el camino crítico más largo y no lo acelera nadie del equipo.

**Ola 4 · Que un despacho pueda entrar y salir entero (1–2 semanas).** §2.5: el
`/v1/cad/assets` por organización para rutinas, bloques, plantillas y cajetín,
empezando por las rutinas porque su puerto ya está escrito y esperando. §2.7:
exportación completa de la organización y borrado de organización y cuenta —que
además es el derecho ARCO—. `.pat` cae aquí si sobra tiempo; es pequeño.

**Ola 5 · Que la rúbrica mida la compra (2 días).** §2.3: el grupo `comercial`
en `rubric.json` con su denominador propio, sus filas y su regla de evidencia,
y la matriz regenerada. A partir de ahí, todo lo anterior se puntúa como se
puntúa el resto del producto y deja de vivir sólo en este informe.

**Ola 6 · El primer cliente, medido.** §2.9 y §2.11: correr la sesión de
`docs/guides/sesion-con-arquitecto.md` de verdad, anotarla como se anota un
benchmark, y escribir el itinerario del primer día generándolo desde el registro
de comandos y la tabla de alias que ya existen. Es la única ola cuyo resultado no
depende de escribir código, y la única que puede subir una fila al peldaño 7.

---

## 5 · Lo que NO hay que hacer, dicho para que quede escrito

- **No relajar el límite de asientos** para que el cliente de §2.2 pueda invitar
  «mientras tanto». El límite está bien puesto, está en el servidor y es lo que
  se compró. El arreglo es venderle el asiento, no regalárselo por un agujero.
- **No suavizar `/terms`.** Que diga «no ha pasado revisión legal profesional»
  es un activo de confianza. Se sustituye por el texto revisado cuando exista,
  no por uno que aparente solidez antes.
- **No anunciar DWG** —ni «pronto», ni «en beta», ni en una nota de prensa— por
  presión comercial. ADR-0014 está firmada, ADR-0012 §3 dice qué haría falta y
  las banderas `DWG_IMPORT_FLAG`/`DWG_EXPORT_FLAG` están en `false` a propósito.
  Lo que sí propongo es **medir** cuánto cuesta esa decisión en ventas perdidas,
  que hoy es un número que nadie tiene.
- **No inventar un porcentaje de disponibilidad** para el plan de lanzamiento.
  `SLA.md` §2 ya explica por qué el Piloto no lleva compromiso —no hay historial
  operativo— y esa honestidad es la que hace creíbles el 99,5 % y el 99,9 % de
  las otras dos columnas.
- **No escribir el precio de AutoCAD a mano en la landing.** Si va a compararse,
  va con fecha, fuente y caducidad vigilada por un gate, como todo lo demás en
  este repositorio.

---

## 6 · Resumen

Valle Design tiene un motor CAD auditado en veinte dimensiones y una maquinaria
de cobro que nadie había auditado y que resulta estar a la altura del motor:
catálogo real, aritmética que no puede mentir, checkout mexicano con OXXO y
SPEI, asientos comprobados en el servidor, reembolsos y disputas resueltos, y un
SLA medible.

Lo que le falta para que un despacho firme no es potencia: es **la superficie
comercial alrededor de esa maquinaria**. Dos superficies públicas prometen una
factura que el producto no timbra; el cliente que crece no tiene botón para
comprar el cuarto asiento; el SLA está escrito y guardado en un cajón con los
nombres de plan equivocados; la bitácora se escribe y nadie puede leerla; el
despacho no puede traer sus patrones, sus plantillas ni sus rutinas compartidas,
ni llevarse su archivo entero el día que se vaya; el argumento de precio contra
AutoCAD no tiene una sola cifra respaldada; y ninguna fila del producto ha
llegado todavía al peldaño 7 de la escalera, que es la forma técnica de decir
que aún no hay un cliente.

Nada de eso es «nunca». Cuatro de los once son de un día. Y la rúbrica, que hoy
mide 36 filas de capacidad técnica contra AutoCAD completo, debería medir
también las seis que deciden la firma —comprar, facturar, migrar, servir, salir
y referenciar— bajo exactamente las mismas reglas de evidencia que gobiernan
todo lo demás en esta casa: nada cuenta por existir, todo lleva su límite al
lado, y ninguna cifra vive en dos lugares.
