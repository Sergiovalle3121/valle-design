# Checklist — pendientes legales antes de lanzar en producción

> Este documento NO es asesoría legal ni sustituye la revisión de un abogado.
> Enumera, campo por campo, qué falta para que Valle Design pueda operar
> públicamente con una identidad legal real. Mientras una fila siga marcada
> `[ ]`, el despliegue productivo real **no debería** anunciarse a clientes —
> y varias filas ya lo impiden técnicamente (columna «Bloquea»).

## Cómo usar esta lista

Cada fila es una decisión o un dato que **sólo Sergio o un asesor jurídico
puede resolver** — ninguna se puede completar por ingeniería. Al llenar un
campo, actualiza la variable de entorno o el archivo correspondiente y
vuelve a correr:

```bash
NODE_ENV=production npm run check:production-config --workspace=web
```

Debe terminar en `OK`. Mientras falte algo, imprime exactamente qué campo y
por qué (ver `apps/web/src/config/production-readiness.ts`).

## Identidad y marca (bloquean el build de producción)

| Campo | Variable / archivo | Estado | Bloquea |
| --- | --- | --- | --- |
| Razón social definitiva (¿sigue siendo "Sergio Valle Enterprise Software" o cambia con la constitución/registro?) | `NEXT_PUBLIC_BRAND_LEGAL_ENTITY` | [ ] | Sí — `check:production-config` |
| Símbolo marcario (`™`/`®`) sólo si hay registro real ante el IMPI | `NEXT_PUBLIC_BRAND_TRADEMARK_STATUS`, `NEXT_PUBLIC_BRAND_TRADEMARK_SYMBOL` | [ ] | El resolvedor ya degrada `®` a vacío si el estado no es `registered` (`packages/contracts/src/brand.ts`) — no hay nada que llenar hasta que exista expediente |
| Correo de soporte con dominio propio | `NEXT_PUBLIC_BRAND_SUPPORT_EMAIL` | [ ] | Sí |
| Correo comercial con dominio propio | `NEXT_PUBLIC_BRAND_SALES_EMAIL` | [ ] | Sí |
| Correo de privacidad con dominio propio | `NEXT_PUBLIC_BRAND_PRIVACY_EMAIL` | [ ] | Sí |
| Dominio público real del sitio | `NEXT_PUBLIC_BRAND_WEBSITE_URL` | [ ] | Sí |
| Origen público real de la API | `NEXT_PUBLIC_API_URL` (se incrusta en el build — ver `apps/web/Dockerfile`) | [ ] | Sí |

## Contenido legal (plantillas en este mismo directorio)

| Documento | Plantilla | Pendiente principal | Estado |
| --- | --- | --- | --- |
| Términos de servicio (texto completo, no el resumen que hoy vive en `/terms`) | `PLANTILLA_TERMINOS_SERVICIO.md` | RFC, razón social, domicilio fiscal, ley y foro aplicables, política de reembolso/cancelación, SLA si se ofrece | [ ] |
| Aviso de privacidad (LFPDPPP) | `PLANTILLA_AVISO_PRIVACIDAD.md` | Responsable con RFC y domicilio, finalidades primarias/secundarias, transferencias, medio para ejercer derechos ARCO, plazo de conservación | [ ] |

Estas plantillas están escritas para que un abogado las complete y Sergio las
apruebe; **no están conectadas a `/terms` ni a `/privacy`** todavía — esas
rutas siguen mostrando el resumen mínimo y sin promesas que ya existe hoy
(`apps/web/src/app/terms/page.tsx`, `apps/web/src/app/privacy/page.tsx`) hasta
que el contenido definitivo esté listo para publicarse.

## Registro de aceptación (mecanismo ya construido, falta conectarlo)

| Pieza | Estado | Dónde |
| --- | --- | --- |
| Versionado de `terms`/`privacy` y registro de aceptación (API) | Hecho | `apps/api/src/modules/legal/` |
| Regla pura "¿aceptó la versión vigente de términos?" (web) | Hecho | `apps/web/src/lib/legal/acceptance-gate.ts` |
| `GET /v1/legal/documents` y `POST /v1/legal/acceptances` en el contrato OpenAPI + SDK generado | **Falta** | requiere `packages/contracts/specs/design-api.v1.yaml` + regenerar `packages/design-sdk` |
| El checkout (`/precios/checkout`) exige aceptación vigente antes de abrir el pago | **Falta** — hoy NO la exige | `apps/web/src/app/precios/checkout/CheckoutStarter.tsx`, `apps/web/src/lib/commercial/checkout.ts` |
| El registro/primer acceso muestra términos con versión y pide aceptación | **Falta** | ninguna pantalla llama hoy a `GET /v1/legal/documents` |

La fila del checkout es del frente comercial (Frente A) y de quien mantenga
el contrato OpenAPI, no de configuración de producción — se documenta aquí
para que no se pierda, no para reclamarla como hecha.

## Fiscal (ya cubierto en `DEPLOYMENT.md`, referenciado y no duplicado)

RFC emisor, régimen fiscal, PAC (proveedor autorizado de certificación) y
código postal para CFDI viven en `DEPLOYMENT.md` §2
(`CFDI_ISSUER_RFC`, `CFDI_ISSUER_TAX_REGIME`, `CFDI_PAC_NAME`,
`CFDI_PAC_API_KEY`). Sin ellos el arranque no falla — la emisión queda
manual, que es una configuración válida mientras la cuenta MX se activa
(`RUNBOOK.md`).

## No es una checklist de ingeniería

Ningún ítem de esta lista se resuelve con código. Si algo aquí parece
requerir una decisión técnica, probablemente está mal ubicado — repórtalo en
vez de inventar una respuesta.

## Dictamen DWG (añadido 2026-08-31)

El expediente para el dictamen jurídico externo que ADR-0004/ADR-0007 exigen
antes de cualquier disponibilidad comercial del DWG está preparado en
[`EXPEDIENTE_DWG_CLEAN_ROOM.md`](EXPEDIENTE_DWG_CLEAN_ROOM.md): procedencia
fuente por fuente, cadena de custodia del corpus, cuatro preguntas concretas
y seis riesgos declarados. Falta encargarlo — es la única acción que ninguna
sesión de ingeniería puede ejecutar, y de la que depende `legalReviewCleared`.
