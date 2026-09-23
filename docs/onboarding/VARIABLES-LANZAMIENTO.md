# Variables y cuentas para lanzar VALLECAD

Auditoría del código y del Dockerfile al 2026-09-23. Esta página
describe lo que el repositorio **lee o exige**; no confirma qué valores hay en
Railway, Resend, Stripe o DNS. No copies claves a Git, a un ticket ni a un
comando que quede en el historial. Mantén `staging` y `production` con bases y
credenciales separadas.

## Antes de copiar variables

La topología prevista es web en `https://vallecad.com`, API en
`https://api.vallecad.com` y PostgreSQL 16. Para servicios **nuevos**, Railway
ya no admite optar por Config as Code (`railway.json`); los archivos
`apps/api/railway.json` y `apps/web/railway.json` sólo son referencia para
servicios que ya lo usaban. Configura el Dockerfile, el comando de predespliegue,
el inicio y el healthcheck en Railway o migra a su Infrastructure as Code.
Comprueba la configuración aplicada en el detalle del despliegue. Fuentes:
[Railway Config as Code](https://docs.railway.com/config-as-code) y
[variables de Railway](https://docs.railway.com/variables).

`NEXT_PUBLIC_*` se incorpora al JavaScript durante el **build**; cambiarlo
requiere otro despliegue con build. Railway entrega variables al build, pero un
Dockerfile necesita declarar los `ARG` pertinentes. El Dockerfile declara y
reenvía `NEXT_PUBLIC_LAUNCH_MODE` y `NEXT_PUBLIC_APP_VERSION` al build; el gate
`check:deploy` detecta si se pierde esa ruta. Sin configurar la primera, el modo
sigue siendo `free`; sin la segunda, los reportes muestran `desarrollo`.
Antes de mostrar Checkout al público, hace falta además probar las credenciales,
webhooks y flujos de Stripe de extremo a extremo. Lectores:
`apps/web/Dockerfile`, `apps/web/src/config/launch.ts`.

## API: base, sesión y correo

| Variable exacta | Ejemplo inocuo o decisión | Lector / límite |
| --- | --- | --- |
| `NODE_ENV` | `production` | `apps/api/src/orm.options.ts`, `apps/api/src/modules/outbox-receiver/email-sender.config.ts`: activa las compuertas productivas. |
| `DATABASE_URL` | Referencia `${{Postgres.DATABASE_URL}}` **si el servicio se llama `Postgres`** | `apps/api/src/orm.options.ts`: PostgreSQL obligatorio en producción. Confirma el nombre real del servicio en Railway; no pegues la URL en documentos. |
| `SYNCHRONIZE` | `false` | `apps/api/src/orm.options.ts`: obligatorio explícitamente en producción. |
| `MIGRATIONS_RUN` | `false` **si** se configuró y comprobó el predespliegue; de otro modo `true` con una sola réplica | `apps/api/src/orm.options.ts`, `apps/api/src/scripts/run-migrations.ts`: el default con `DATABASE_URL` es ejecutar migraciones también al arrancar. El predespliegue del repo es `node apps/api/dist/scripts/run-migrations.js`; no supongas que un servicio nuevo aplicó `railway.json`. |
| `DB_SSL_STRICT` | Mantener el default productivo (`true`) | `apps/api/src/orm.options.ts`: `false` desactiva la validación del certificado y requiere una decisión operativa explícita. |
| `ALLOWED_ORIGIN` | `https://vallecad.com` | `apps/api/src/main.ts`: origen CORS exacto del web. |
| `CSRF_COOKIE_DOMAIN` | `.vallecad.com` | `apps/api/src/modules/identity/identity-csrf-cookie.ts`: necesario cuando el web y la API usan esos dos hosts; permite al web leer `valle_csrf` y devolver `X-CSRF-Token`. No cambia la cookie de sesión HttpOnly. |
| `IDENTITY_RATE_LIMIT_KEY_SECRET` | Secreto único generado fuera del repo, ≥32 caracteres | `apps/api/src/modules/identity/identity-security.ts`: obligatorio en producción; el mismo en todas las réplicas. |
| `IDENTITY_MFA_ENCRYPTION_KEY` | Secreto distinto, ≥32 caracteres | `apps/api/src/modules/identity/identity-mfa.ts`: obligatorio en producción. |
| `TRIAL_DAYS` | `90` **si** Sergio aprueba la oferta de tres meses; default `14` | `apps/api/src/modules/organizations/organization-commercial.configuration.ts`: entero 1–90; un valor inválido impide el arranque. El catálogo público transmite la duración a la web. |

El worker de correo corre dentro de la API y entrega al receptor firmado de la
**misma API**, no a un webhook de Resend. En producción se requieren estas
variables adicionales:

| Variable exacta | Ejemplo inocuo o decisión | Lector / límite |
| --- | --- | --- |
| `OUTBOX_DISPATCHER_ENABLED` | `true` | `apps/api/src/modules/commercial/outbox-worker.service.ts`: obligatorio en producción y requiere PostgreSQL. |
| `OUTBOX_EMAIL_WEBHOOK_URL` | `https://api.vallecad.com/v1/outbox/email` | `apps/api/src/modules/commercial/webhook-outbox.transport.ts`: URL HTTPS del receptor propio. |
| `OUTBOX_DOMAIN_WEBHOOK_URL` | `https://api.vallecad.com/v1/outbox/domain` | Mismo transporte; receptor propio de eventos de dominio. |
| `OUTBOX_WEBHOOK_SECRET` | Secreto distinto, ≥32 caracteres | `apps/api/src/modules/commercial/webhook-outbox.transport.ts` y `apps/api/src/modules/outbox-receiver/outbox-receiver.controller.ts`: firma HMAC compartida. |
| `EMAIL_SENDER_PROVIDER` | `resend` | `apps/api/src/modules/outbox-receiver/email-sender.config.ts`: único adaptador implementado. |
| `EMAIL_SENDER_API_KEY` | Clave de envío de Resend; **sin valor de ejemplo** | `apps/api/src/modules/outbox-receiver/email-sender.config.ts`, `adapters/resend-email.sender.ts`: obligatoria con las otras tres variables de correo. |
| `EMAIL_SENDER_FROM` | `VALLECAD <no-reply@vallecad.com>` **sólo después** de verificar el dominio | `apps/api/src/modules/outbox-receiver/email-sender.config.ts`: remitente visible y dominio verificado en Resend. |
| `OUTBOX_EMAIL_LINK_BASE_URL` | `https://vallecad.com` | `apps/api/src/modules/outbox-receiver/email-sender.config.ts`, `email-templates.ts`: enlaces absolutos de verificación, restablecimiento e invitación; HTTPS sin credenciales, query ni fragmento. |

Las cuatro variables de `EMAIL_SENDER_*`/`OUTBOX_EMAIL_LINK_BASE_URL` se ponen
juntas: una configuración parcial falla. En `NODE_ENV=production` también falla
el arranque si faltan las cuatro. Fuera de producción, el adaptador nulo
responde 503 y deja los mensajes pendientes en el outbox. Los tests del
adaptador prueban el contrato de red con dobles; no prueban entrega real.

## Soporte y marca

| Variable exacta | Ejemplo inocuo o decisión | Lector / límite |
| --- | --- | --- |
| `SUPPORT_EMAIL` | `soporte@vallecad.com`, después de crear un buzón que Sergio revise | `apps/api/src/modules/support/support.service.ts`, `apps/api/src/modules/feedback/feedback.service.ts`: recibe reportes y avisos del outbox. Sin ella, incidentes responden 503; feedback queda guardado sin aviso por correo. |
| `BRAND_SUPPORT_EMAIL` | El mismo buzón de soporte | `apps/api/src/common/brand/product-brand.ts`: aparece en el pie de correos; si falta, usa `SUPPORT_EMAIL`. No crea un buzón. |
| `BRAND_PRODUCT_NAME_DESIGN`, `BRAND_NAME` | `VALLECAD` | `apps/api/src/common/brand/product-brand.ts`: nombre visible en correo y MFA. |
| `IDENTITY_MFA_ISSUER` | `VALLECAD` | `apps/api/src/modules/identity/identity.controller.ts`: emisor mostrado en la aplicación TOTP; si falta, toma el nombre del producto. |
| `PRODUCT_OPERATOR_EMAILS` | Lista de operadores autorizados, separada por comas | `apps/api/src/modules/feedback/product-operators.ts`: sin ella nadie entra a `/comentarios/admin`; no sustituye el buzón de soporte. |

Para la web, configura **antes del build** `NEXT_PUBLIC_API_URL=https://api.vallecad.com`,
`NEXT_PUBLIC_SITE_URL=https://vallecad.com`, `NEXT_PUBLIC_BRAND_WEBSITE_URL`,
`NEXT_PUBLIC_BRAND_SUPPORT_EMAIL`, `NEXT_PUBLIC_BRAND_SALES_EMAIL` y
`NEXT_PUBLIC_BRAND_PRIVACY_EMAIL` con URLs/correos operables del dominio, más
`NEXT_PUBLIC_BRAND_PRODUCT_NAME_DESIGN=VALLECAD` y `NEXT_PUBLIC_BRAND_NAME=VALLECAD`.
Los lectores son `apps/web/src/config/brand.ts`, `site-routes.ts` y
`apps/web/scripts/check-production-config.mts`; el gate de build rechaza los
contactos de plantilla `*.invalid`. Los enlaces comerciales opcionales
`NEXT_PUBLIC_SUPPORT_URL`, `NEXT_PUBLIC_CONTACT_URL` y similares tienen páginas
internas como respaldo (`apps/web/src/config/commercial.ts`). Resend sólo envía
correo saliente: configurar `SUPPORT_EMAIL` y mostrarlo en la web **no crea una
bandeja de entrada**.
La activación y prueba del reenvío `soporte@vallecad.com` hacia el Gmail que
Sergio gestione está en [SOPORTE-RECEPCION.md](SOPORTE-RECEPCION.md); sigue
pendiente hasta que él verifique la recepción real.

## Stripe: sólo cuando se decida cobrar

Con el modo web `free` el checkout no se muestra. La API, sin ninguna de las
cuatro variables siguientes, usa `NullPaymentProvider` y publica
`checkout: external` en `GET /v1/commercial/public/plans`; no cobra en Stripe.
Con las cuatro, se activa Stripe Checkout hospedado. Una configuración parcial
impide el arranque (`apps/api/src/modules/commercial/adapters/stripe-payment.provider.ts`,
`apps/api/src/modules/commercial/commercial.module.ts`).

| Variable exacta | Ejemplo inocuo o decisión | Lector / límite |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Clave de **test** en staging; clave **live** sólo al autorizar cobro real | `apps/api/src/modules/commercial/adapters/stripe-payment.provider.ts`: nunca en web ni en Git. |
| `STRIPE_WEBHOOK_SECRET` | Secreto del endpoint de **ese entorno** | `apps/api/src/modules/commercial/adapters/stripe-payment.provider.ts`: firma de cuerpo crudo, mínimo 16 caracteres. No reutilices el secreto de test en live. |
| `STRIPE_CHECKOUT_SUCCESS_URL` | `https://vallecad.com/cuenta/facturacion/retorno` | `apps/api/src/modules/commercial/adapters/stripe-payment.provider.ts`: retorno HTTPS. |
| `STRIPE_CHECKOUT_CANCEL_URL` | La misma ruta de retorno | `apps/api/src/modules/commercial/adapters/stripe-payment.provider.ts`: el estado de pago se consulta en la suscripción, no se deduce de la URL. |
| `STRIPE_PORTAL_RETURN_URL` | La misma ruta, opcional | `apps/api/src/modules/commercial/adapters/stripe-payment.provider.ts`: si falta, usa la URL de éxito. |

`POST /v1/commercial/webhooks/stripe` recibe los eventos. Sergio debe crear
**dos endpoints separados** si usa staging/test y producción/live, con sus
respectivos secretos, y seleccionar los tipos que procesa
`apps/api/src/modules/commercial/billing-webhook.service.ts`:
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `invoice.paid`,
`invoice.payment_failed`, `customer.subscription.deleted`, `charge.refunded` y
`charge.dispute.created`. Los eventos asíncronos son necesarios para OXXO/SPEI.
El controlador verifica firma y bytes crudos; la reentrega se deduplica por ID
de evento (`apps/api/src/modules/commercial/controllers/billing-webhook.controller.ts`).
Stripe documenta [endpoints y eventos](https://docs.stripe.com/api/webhook_endpoints).

Los importes viven en `plan_prices` y se mandan como `price_data` al crear la
sesión: **no existe** una variable `STRIPE_PRICE_ID` que haya que copiar del
dashboard (`apps/api/src/modules/commercial/adapters/stripe-payment.provider.ts`).
Revisar catálogo, moneda, fiscalidad y los flujos de tarjeta/OXXO/SPEI con una
cuenta Stripe de prueba sigue pendiente; las pruebas con dobles no autorizan
activar pagos live.

## Acciones externas de Sergio y comprobación

1. En Railway, confirmar nombres reales de servicios, variables y entorno sin
   exportar ni imprimir secretos. Para servicios nuevos, configurar manualmente
   los campos de `apps/*/railway.json` o usar la vía actual de Infrastructure as
   Code; validar que el predespliegue corre antes de la API.
2. Asociar `vallecad.com` y `api.vallecad.com` a los servicios correctos. Copiar
   **exactamente** los registros de ruta y de verificación TXT que muestre
   Railway. Para el ápice se necesita CNAME flattening/ALIAS/ANAME según el
   proveedor DNS; Railway no publica una IP A fija. Ver
   [dominios Railway](https://docs.railway.com/networking/domains/working-with-domains).
3. En Resend, verificar el dominio de envío con los registros DNS **que muestre
   esa cuenta**, comprobar estado de envío verificado y crear una clave limitada
   a envío para ese dominio. Ver [verificación de dominios](https://resend.com/changelog/domain-verification-events)
   y [permisos de claves](https://resend.com/changelog/new-api-key-permissions).
   Crear además un buzón/reenviador **entrante** para soporte, ventas y privacidad
   y probar que alguien recibe y contesta esos mensajes.
4. Cuando se apruebe cobrar, crear en Stripe el endpoint test, probar Checkout y
   sus eventos; sólo entonces repetir con credenciales live y cambiar el build
   web ya corregido para mostrar el checkout. No inferir pago de una redirección.

Comprobaciones locales sin credenciales ni red de proveedores, después de
`npm ci`:

```bash
npm run check:deploy
npm test --workspace=valle-design-api -- --runInBand --runTestsByPath src/modules/outbox-receiver/email-sender.config.spec.ts src/modules/outbox-receiver/adapters/resend-email.sender.spec.ts src/modules/commercial/adapters/stripe-payment.provider.spec.ts
```

`npm run check:production-config --workspace=web` valida la marca durante un
build con `NODE_ENV=production` y valores públicos reales; fuera de producción
sólo informa. Tras desplegar, `npm run smoke:railway -- --web
https://vallecad.com --api https://api.vallecad.com` comprueba salud y el embudo
gratuito. `--email <buzón-de-prueba>` registra una cuenta y acepta HTTP 202 (o
409 si ya existe), **no comprueba recepción en la bandeja**: revisar el mensaje
y abrir su enlace es una verificación manual aparte. Este smoke no prueba
Stripe Checkout, webhooks, atención del buzón ni restauración de respaldos.
