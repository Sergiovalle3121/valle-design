# CORREO-ALTA · Que darse de alta en VALLECAD no tenga friccion (auditado el 16-sep 15:30)

Un lector recorrio el alta entera (API + web + outbox + plantillas) sobre `main` b90a9a42 y dejo
esto medido, con fichero:linea. La rama `claude/vc-correo` ya tiene 9 commits en esa direccion
(`git log --oneline b90a9a42..claude/vc-correo`): **miralos antes de escribir nada**, y lo que
falte lo haces tu. Un commit por punto.

## 1) El reenvio MATA el enlace que ya esta en la bandeja (esto es lo que rompio el alta de Sergio)
`apps/api/src/modules/identity/identity-token-issuance.ts:109` — al emitir un token nuevo marca
`consumedAt` en TODOS los vigentes del mismo proposito. Para `verify_email` eso significa que
pulsar «Enviar otro correo» invalida el primero; el usuario abre el que llego antes y ve
«El enlace o token no es valido o ya expiro».
Esa rotacion SI es correcta para `reset_password`, `mfa_challenge` y para el cambio de correo
(`identity.service.ts:595-606`).
**Cambio:** parametro `rotacion: 'reemplazar' | 'acumular'`; `sendVerificationEmail`
(`identity.service.ts:368-380`) usa `'acumular'`: los tokens de verificacion vigentes siguen
valiendo hasta caducar, cada uno de un solo uso. Al verificar, consume el resto en la misma
transaccion (`verifyEmail`, `identity.service.ts:396-416`).
**Specs:** `identity-registration.pg.spec.ts` (caso nuevo: 4 reenvios -> 4 tokens vigentes;
verificar con el primero cierra los demas) y `identity.integration.spec.ts:215-222`.

## 2) Todos los fallos de token dicen lo mismo
`identity-token-issuance.ts:130` devuelve `null` sin distinguir «no existe», «ya usado»,
«reemplazado» y «caducado»; el controller (`identity.controller.ts:701-703`) responde siempre 400
y la web lo traduce con un solo mensaje (`apps/web/src/lib/identity-actions.ts:309-311`).
**Cambio:** si el token esta consumido y el usuario YA tiene `emailVerifiedAt` -> respuesta
idempotente 201 `{verified:true, alreadyVerified:true, email}` (abrir el enlace dos veces no es un
error); si no esta verificado -> 400 con mensaje propio («Este enlace ya no sirve: abre el correo
mas reciente o pide otro»). Devuelve tambien `email` para rellenar el login despues.
**OJO, esto toca el contrato:** `packages/contracts/specs/design-api.v1.yaml`
(`EmailVerificationResponse:3687-3692`, `additionalProperties:false`) -> regenerar el SDK
(`npm run generate --workspace=@valle/design-sdk`, byte-igualdad en su `npm test`) y la consola
(`npm run check:api-console`). `identity.integration.spec.ts:215-222` hoy exige 400 al
re-verificar: pasa a exigir 201 con `alreadyVerified`. Eso NO es debilitar el test (la propiedad
«un solo uso» se sigue probando: el segundo canje no cambia nada); dilo en el mensaje del commit.

## 3) Los correos se firman «Valle Design»
`apps/api/src/modules/outbox-receiver/email-templates.ts:38` tiene `PRODUCT_NAME = 'Valle Design'`
a mano, y de ahi salen el asunto (48), la entrada (50-51), las invitaciones (152,160,174) y el pie
del HTML (571-572). La API depende de `@valle-design/contracts` pero no resuelve el manifiesto de
marca en ningun sitio. **Cambio:** leer el nombre del manifiesto compartido, como ya hace la web.

## 4) Donde NO esta el problema (no lo busques ahi)
- El Gmail del dueno **no esta en el codigo de producto**: entra por configuracion de Railway
  (`SUPPORT_EMAIL` en api y `NEXT_PUBLIC_BRAND_SUPPORT_EMAIL` en web, que se incrusta AL COMPILAR).
  El unico literal del repo esta en `apps/web/e2e/fixtures/constants.ts:26` (fixture, fuera del
  runtime): limpialo igualmente.
- `EMAIL_SENDER_FROM` YA admite `Nombre <correo@dominio>` (`email-sender.config.ts:35-36,64-67`,
  documentado en `docs/guides/environment-variables.md:85`): para que el remitente se vea como
  «VALLECAD» basta la variable, no hay que programar nada.
- **El segundo correo no fue un doble envio del alta ni del outbox:** salio de
  `POST /v1/auth/verify-email/resend` (misma plantilla, token nuevo). El doble submit es imposible
  (`identity.service.ts:108-110,156-165`, boton deshabilitado en `ui/Button.tsx:71`), no hay
  reenvio automatico en la pantalla post-registro, y el outbox congela el payload e ignora
  duplicados por `idempotencyKey` (`postgres.adapters.ts:307-340`). Con el punto 1 arreglado, que
  lleguen dos correos deja de ser un problema: los dos enlaces funcionan.

## 5) Marca escrita a mano en la web
`apps/web/src/app/login/page.tsx:35` y `apps/web/src/app/register/page.tsx:54` ponen
«Valle Design» en la metadata, y `identity.controller.ts:56-58` usa 'Valle Design' como
`IDENTITY_MFA_ISSUER` por defecto. Todo eso sale del manifiesto.

## 6) Remate de producto
- Tras verificar, «Iniciar sesion» debe llevar al login con el correo ya puesto (usa el `email`
  del punto 2). Hoy enlaza a `/login` pelado (`IdentityActionForm.tsx:180-199`).
- La pantalla post-registro ya dice a que correo se envio y tiene reenvio con espera de 60 s
  (`ResendTimerButton.tsx`); comprueba que el error del reenvio se VE (la PR #212 ya lo arregla) y
  que menciona mirar en spam.
