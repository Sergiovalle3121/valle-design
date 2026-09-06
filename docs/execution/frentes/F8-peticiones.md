# F8 · El despacho — peticiones al coordinador

Formato por petición: qué archivo, qué cambio exacto (diff literal cuando es
corto, descripción precisa cuando no), por qué, qué prueba lo verifica.

---

## 1 · T-63(d) — Aceptar términos y aviso de privacidad al crear la cuenta

**Por qué es una petición y no un cambio mío.** El fix real toca dos
superficies que no están en el territorio de F8:

- `apps/web/src/components/AuthPage.tsx` y `apps/web/src/app/register/` — no
  aparecen en la lista «Tuyo» de F8, y `legal-documents.ts` deja escrito por
  qué una sesión anterior NO tocó `apps/web` para esto: *"apps/web está
  siendo modificado por otro agente en paralelo, así que tocarlo aquí
  produciría un conflicto sin ganar nada que no se pueda añadir después"*.
  El mismo riesgo aplica hoy: no sé qué frente tiene `AuthPage.tsx` abierto.
- `apps/api/src/modules/legal/` (la entidad `LegalAcceptance`, su posible
  migración) tampoco está en `apps/api/src/modules/{organizations,commercial,
  identity,outbox-receiver,audit-log,support,feedback,auth}` — es un módulo
  con dueño propio.

**Lo que investigué, para no repetir el trabajo.**

- `GET /v1/legal/documents` es público (sin sesión) — se puede leer desde el
  formulario de alta sin ningún cambio de contrato.
- `POST /v1/legal/acceptances` exige sesión Y organización activa
  (`legal.controller.ts:requireUser`, `tenantId` obligatorio). **El alta NO
  crea organización** (`identity.service.ts:register` — usuario, credencial,
  token de verificación, evento de auditoría; nada más). Por eso «reusar la
  aceptación del checkout» tal cual, en el formulario de registro, no es
  posible sin cambiar esa ruta o el momento en que se llama: no hay tenant
  todavía.
- `CheckoutStarter.tsx` ya hace exactamente el patrón correcto
  (`legal.documents()` + `legal.acceptances.list()` +
  `hasAcceptedCurrentTerms()` + `legal.acceptances.accept()`), pero corre
  DESPUÉS de que exista sesión y organización — no sirve de plantilla directa
  para el momento del alta.

**La propuesta, en dos partes independientes** (la primera cierra el hueco
de verdad; la segunda es la mejora si además se quiere el registro
server-owned desde el primer segundo):

### Parte 1 — gate en el formulario (obligatoria)

`apps/web/src/components/AuthPage.tsx`, en el `<form>` de `register`:

```diff
+ const [legal, setLegal] = useState<{ terms: LegalDocumentVersion; privacy: LegalDocumentVersion } | null>(null);
+ const [acceptedTerms, setAcceptedTerms] = useState(false);
+ useEffect(() => {
+   if (!register) return;
+   designClient.legal.documents().then(({ documents }) => {
+     const terms = documents.find((d) => d.documento === "terms");
+     const privacy = documents.find((d) => d.documento === "privacy");
+     if (terms && privacy) setLegal({ terms, privacy });
+   });
+ }, [register]);
  ...
+ {register && legal && (
+   <label className="flex items-start gap-2 type-small">
+     <input
+       type="checkbox"
+       required
+       checked={acceptedTerms}
+       onChange={(e) => setAcceptedTerms(e.target.checked)}
+     />
+     <span>
+       Acepto los <Link href={legal.terms.url}>Términos de Servicio</Link>{" "}
+       ({legal.terms.version}) y el{" "}
+       <Link href={legal.privacy.url}>Aviso de Privacidad</Link>{" "}
+       ({legal.privacy.version}).
+     </span>
+   </label>
+ )}
```

Botón «Crear cuenta» deshabilitado mientras `register && !acceptedTerms`.
Esto por sí solo ya arregla el defecto que audita la ficha: hoy NADIE ve ni
confirma nada al crear la cuenta.

### Parte 2 — que el servidor lo exija y lo registre (recomendada)

`apps/api/src/modules/identity/identity.service.ts` — `register()` recibe
además `acceptedTerms: {document: 'terms'|'privacy', version: string}[]`,
válida contra `isKnownLegalVersion` (import de sólo lectura desde
`../legal/legal-documents`, sin tocar el módulo `legal`) y rechaza con 400 si
falta `terms` o la versión no es la vigente. Se persiste dentro de la MISMA
transacción, como metadata del evento `identity.registered` que ya se crea
(`IdentityAuditEvent.metadata`), NO como fila de `legal_acceptances` — así se
evita crear o migrar nada en el módulo `legal`, que no es mío. La limitación
que esto deja escrita: como no hay organización al registrarse, esta
aceptación NO aparece en `GET /v1/legal/acceptances` (que filtra por
`tenantId` de organización) — `CheckoutStarter.tsx` seguiría pidiendo
aceptación otra vez la primera vez que haya organización. Es redundante, no
falso: pedir de nuevo no es mentir. Cerrarlo del todo (que la aceptación del
alta cuente también para el checkout) exigiría que `legal_acceptances`
admitiera filas sin organización, y esa sí es una migración del módulo
`legal`.

**Verifica.** Golden que rellene el formulario de alta, confirme que el botón
está deshabilitado sin marcar la casilla, la marque, envíe, y compruebe (a)
que `POST /v1/identity/register` viaja con `acceptedTerms` y (b) que el
evento `identity.registered` en la auditoría lleva la metadata. Contrato:
`design-api.v1.yaml` (`IdentityRegisterRequest.acceptedTerms`, `required`),
SDK regenerado.

---

## 2 · Petición al monolito — `onDrop` en el lienzo del estudio

**Qué falta.** T-63f pide arrastrar-y-soltar un DXF en **tres** sitios:
estado vacío, tablero y lienzo. Los dos primeros ya están arreglados en esta
rama (`FirstMinute.tsx`, `dashboard/page.tsx` — ver `F8.md`). El tercero — el
propio lienzo del editor, donde alguien con un documento YA abierto suelta un
archivo nuevo para importarlo dentro de la sesión — vive en
`Layout3DEditor.tsx`, exclusivo del coordinador (F0/F1).

**Dónde.** Las cuatro apariciones ACTUALES de `onDrop` en `Layout3DEditor.tsx`
son el reordenado de viewports (grep `onDrop` en ese archivo). Ninguna
importa un archivo.

**Propuesta.** Un `onDrop` a nivel del contenedor del viewport que, cuando
`event.dataTransfer.files` no está vacío (y no es un reordenado de viewport
en curso — hay que distinguir los dos gestos, probablemente por un
`data-viewport-drag` o similar que el reordenado ya use), llame al mismo
camino que ya usa el estudio para abrir un archivo elegido a mano
(`splitDocumentSelection` + el importador nativo del documento abierto, no
`importDocumentFile` del dashboard — dentro del estudio la importación entra
a un documento YA CREADO, no crea uno nuevo).

**Verifica.** Golden dentro de `Layout3DEditor.tsx` que abra un documento,
suelte un DXF sobre el lienzo y compruebe que las entidades se agregan al
documento en curso, sin navegar fuera del estudio.

---

## 3 · Filas para el grupo `comercial` de `rubric.json`

`docs/competitive/rubric.json` es del coordinador. Propuesta de filas para
el grupo `comercial` (compra y crecimiento, facturación declarada con su
límite, expediente del comprador, migración de entrada y salida), con
evidencia REAL de esta rama:

```json
{
  "grupo": "comercial",
  "filas": [
    {
      "id": "comercial-crecimiento-asientos",
      "titulo": "Un despacho que crece puede comprar el asiento que necesita",
      "descripcion": "Checkout de un asiento adicional desde dentro de la organizacion, sin relajar el limite del servidor.",
      "evidencia": [
        "apps/api/src/modules/commercial/controllers/billing.controller.ts (openIntent: seats <= current.seats)",
        "apps/api/src/modules/commercial/commercial-seat-growth.pg.spec.ts",
        "apps/web/src/app/cuenta/facturacion/BillingPortal.tsx (botón «Comprar un asiento más»)",
        "apps/web/src/app/equipo/TeamRoom.tsx (enlace desde el muro de invitación)",
        "apps/web/src/lib/commercial/checkout.ts (PlanSelection.seats)"
      ],
      "estado": "cerrado — T-61, esta rama"
    },
    {
      "id": "comercial-facturacion-declarada",
      "titulo": "Lo que se factura coincide con lo que se anuncia",
      "descripcion": "Factura CFDI solo se anuncia en el modo que el proveedor activo puede cumplir; el sello y el FAQ se derivan del descriptor real, nunca de un literal.",
      "evidencia": [
        "apps/api/src/modules/commercial/controllers/public-catalog.controller.ts (campo cfdi)",
        "apps/web/src/app/precios/PricingCatalog.tsx (FiscalSeal)",
        "apps/web/src/lib/marketing/faq.ts (cfdiFacturaAnswer)",
        "apps/web/src/app/precios/commercial-surface.spec.ts"
      ],
      "estado": "cerrado — T-18a, esta rama"
    },
    {
      "id": "comercial-expediente-comprador",
      "titulo": "Quien compra puede ver quien toco sus planos y bajo que reglas",
      "descripcion": "Bitacora de auditoria con endpoint de lectura y retencion declarada; SLA publicado con los nombres de plan reales.",
      "evidencia": [
        "apps/api/src/modules/audit-log/*.ts (pendiente en esta rama, T-62)",
        "apps/web/src/app/sla/ (pendiente en esta rama, T-62)"
      ],
      "estado": "pendiente — T-62 en curso en esta rama"
    },
    {
      "id": "comercial-migracion-entrada-salida",
      "titulo": "Entrar y salir del producto no pierde datos ni deja al cliente sin exportar",
      "descripcion": "Exportacion de datos personales y borrado de cuenta (derechos ARCO); la lectura tras vencer sigue permitiendo exportar (ya probado en entitlement-read-only.pg.spec.ts).",
      "evidencia": [
        "apps/api/src/modules/commercial/entitlement-read-only.pg.spec.ts (ya existe)",
        "apps/api/src/modules/identity/*.ts (exportar/borrar, pendiente en esta rama, T-62c)"
      ],
      "estado": "pendiente — T-62 en curso en esta rama"
    }
  ]
}
```

Esta sección se actualizará cuando T-61/T-62 avancen en esta misma rama; por
ahora deja la propuesta completa para que el coordinador la aplique cuando
convenga, sin esperar a que F8 termine.

---

## 4 · T-62(d) — `costo-comparado.json` sin una cifra que pude verificar yo mismo

**Qué pide la ficha.** «El argumento de precio contra AutoCAD no tiene una
sola cifra respaldada — y si va a compararse, va con fecha, fuente y
caducidad vigilada por un gate.»

**Por qué es una petición y no un archivo con un número dentro.** Intenté
verificar un precio actual y citable de AutoCAD con `WebSearch`/`WebFetch`:

- `WebSearch` devolvió un fragmento agregado que citaba
  `autodeskmexico.com/producto/autocad-suscripcion-anual/` con una cifra en
  MXN, pero un resumen de buscador no es una fuente que se pueda citar —no
  vi la página, no sé si el fragmento está actualizado ni si mezcla IVA,
  promoción o el plan LT con el completo.
- `WebFetch` a `www.autodeskmexico.com` y a `www.autodesk.com` devolvió los
  dos `EGRESS_BLOCKED`: el proxy de red de este entorno no deja salir hacia
  esos dominios. No es un fallo transitorio — es la política de red del
  entorno, y no me corresponde intentar rodearla.

Publicar una cifra que no pude comprobar de primera mano —con fecha exacta
de captura y, idealmente, una URL o una captura de pantalla que alguien
pueda auditar— sería exactamente el defecto que esta ficha existe para
cerrar: un número que "suena a que alguien lo verificó" sin que nadie lo
haya hecho. Mejor una petición honesta que una comparación con una fuente
que ni yo mismo pude confirmar.

**Lo que SÍ dejo listo, para que aplicar la cifra sea lo único que falte:**

- `costo-comparado.json` no existe todavía. Cuando exista, debe llevar como
  mínimo: `{concepto, valleMXN, competidorMXN, fuente (URL), fechaCaptura,
  verificadoPor, maxAgeDays}` — el mismo espíritu que el checker `manual`
  de `scripts/cad/rubric.mjs` (firma + fecha + caducidad, `ageDays >
  maxAgeDays` falla el gate).
- El gate de caducidad (`scripts/legal/check-cost-comparison-expiry.mjs` o
  similar, ya que `scripts/legal/` es territorio de F8) puede escribirse
  ahora mismo, con el JSON vacío o con una `fixture` de prueba — es
  mecánica pura, no depende de tener la cifra real. Si el coordinador
  prefiere que F8 lo escriba de todos modos (sin la cifra, con el hueco
  marcado), dígalo y se hace en la siguiente entrada de esta bitácora.

**Verifica, cuando alguien con acceso a `autodesk.com`/una fuente citable
ponga la cifra real:** el gate falla si `ageDays > maxAgeDays` o si falta
`fuente`/`verificadoPor`; una spec que confirme que el JSON referenciado
desde la página de precios (si se usa ahí) coincide byte a byte con el
archivo fuente.

---

## 5 · T-62(c) — Borrar la cuenta (la otra mitad de ARCO)

**Qué se cerró en esta rama.** Exportar los datos personales propios:
`GET /v1/auth/export` + botón de descarga en `/cuenta` (ver `F8.md`).

**Qué queda fuera, y por qué es una decisión y no una omisión.** Borrar la
cuenta no es un `DELETE FROM identity_users WHERE id = ...`: hay que
decidir, con el peso de una ficha propia, qué pasa cuando quien pide
borrarse es:

- **Propietario único de una organización con más gente dentro.** ¿Se
  bloquea el borrado hasta transferir la propiedad? ¿Se transfiere sola al
  admin más antiguo? Las dos son decisiones de producto, no de
  implementación, y las dos tienen consecuencias para terceros que no
  pidieron nada.
- **Propietario o miembro con documentos CAS en curso.** El almacén CAS es
  compartido por diseño (varias versiones referencian los mismos blobs);
  borrar a la persona no puede borrar blobs que otro documento vivo sigue
  necesitando, y "anonimizar" al autor de cada versión histórica es un
  recorrido de datos que hay que probar con PostgreSQL real antes de
  ejecutarlo contra una cuenta de verdad.
- **Con una suscripción activa.** ¿Se cancela primero? ¿Qué pasa con la
  factura/CFDI ya emitido, que por ley fiscal mexicana no se puede borrar?

**Propuesta mínima, para cuando se aborde:** un flujo en DOS pasos —
`POST /v1/auth/delete-request` (confirma con contraseña, como
`updateProfile`, y devuelve qué bloquea el borrado si algo lo bloquea:
"eres propietario único de N organizaciones", "tienes documentos con otras
personas") y, sólo si nada lo bloquea, `POST /v1/auth/delete-confirm` con
un token de un solo uso enviado por correo (mismo patrón que
`issueIdentityEmailToken`) que de verdad anonimiza (no borra la fila:
`email = null`, `displayName = null`, credenciales borradas, sesiones
revocadas) para no romper las referencias históricas de auditoría/CAS.

**Verifica, cuando se implemente:** spec de PostgreSQL real con los tres
casos bloqueantes de arriba, y uno que confirme que un documento CAS
compartido con otro miembro sigue intacto después de que el autor se borre.

---

## 6 · T-64 — Nada de lo que configura el despacho se comparte

**No empezada.** Investigado lo suficiente para saber que es una petición
clara, no sólo por territorio.

**Por qué es una petición.**

- **Territorio.** La ficha pide `/v1/cad/assets` (un módulo `apps/api/src/
  modules/cad/` o uno nuevo de configuración de despacho) y tocar
  `apps/web/src/components/cad/lisp/*` — ninguno de los dos está en la
  lista «Tuyo» de F8 (`{organizations,commercial,identity,outbox-receiver,
  audit-log,support,feedback,auth}` en el API; `{landing,billing,team,
  account,organization}*` en los componentes del web). Es territorio de
  quien lleve el editor CAD (F0/F1 u otro frente de esta misma campaña).
- **Descubrimiento arquitectónico, para no repetir el trabajo.** El puerto
  que la ficha señala como "ya escrito y esperando"
  (`apps/web/src/lib/lisp/library.ts`, `LispLibraryStore`) es SÍNCRONO A
  PROPÓSITO — la propia cabecera del archivo lo dice: *"hacerlo asíncrono
  aquí obligaría a que la carga de la biblioteca contaminase de promesas el
  arranque de la sesión LISP"*. Una implementación respaldada por
  `/v1/cad/assets` tiene que ser asíncrona (es una llamada de red). Esto NO
  es un simple "escribir el adaptador que falta": exige decidir cómo la
  sesión LISP obtiene sus rutinas de organización sin bloquear su arranque
  —¿precarga async una vez al abrir el documento, con esta interfaz
  síncrona sirviendo desde una caché ya resuelta? ¿se vuelve asíncrona toda
  la cadena de arranque?— y esa decisión es del dueño del arranque de la
  sesión CAD, no de quien sólo escribe el endpoint.

**Propuesta para quien la retome:**

1. `POST/GET/DELETE /v1/cad/assets` (o un módulo de configuración de
   despacho aparte) con aislamiento por tenant, empezando por las rutinas
   `.lsp` como dice la ficha.
2. Un adaptador `RestLispLibraryStore` que NO implemente `LispLibraryStore`
   directamente (es síncrono) sino que precargue al abrir el documento
   (ya existe un momento así: donde hoy se inicializa
   `InMemoryLispLibraryStore` por sesión) y sirva desde esa copia — el
   mismo patrón que ya usa `/v1/cad/blocks` en otras partes del editor, que
   la propia ficha señala como el único almacén compartido que sí existe.
3. Migrar paletas, plantillas, atajos y el `.ctb`/`.lin` a la misma ruta
   DESPUÉS de las rutinas, no en el mismo cambio — son formatos distintos
   con su propio parser/validador cada uno.

**Verifica, cuando se implemente:** spec de aislamiento por inquilino
contra PostgreSQL real (como pide la ficha), y una prueba de que abrir el
mismo documento desde dos organizaciones distintas nunca mezcla rutinas.
