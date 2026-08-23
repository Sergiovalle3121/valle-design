# Plantilla — Términos de servicio (borrador para revisión legal)

> **No publicar tal cual.** Esto es un ESQUELETO para que un abogado lo
> complete y Sergio lo apruebe por escrito antes de reemplazar el resumen
> mínimo que hoy vive en `apps/web/src/app/terms/page.tsx`. Cada
> `[CORCHETE]` es un dato o una decisión que ingeniería NO puede rellenar.
> Mientras un campo siga entre corchetes, esta plantilla NO debe copiarse a
> ninguna variable de entorno ni a la página pública — el validador de
> producción (`apps/web/src/config/production-readiness.ts`) rechaza
> marcadores de plantilla precisamente para evitar ese accidente.
>
> Publicar una versión nueva de este documento en producción exige, además del
> texto, dar de alta una entrada nueva en `LEGAL_DOCUMENTS`
> (`apps/api/src/modules/legal/legal-documents.ts`) con versión y fecha
> reales: **una versión publicada nunca se edita**, y las aceptaciones ya
> registradas contra la versión anterior siguen siendo válidas para lo que la
> persona realmente leyó entonces.

## 1 · Identidad del prestador

- Nombre comercial: `[igual a NEXT_PUBLIC_BRAND_NAME cuando se publique]`
- Razón social: `[RAZÓN_SOCIAL_PENDIENTE]`
- RFC: `[RFC_PENDIENTE]`
- Domicilio fiscal: `[DOMICILIO_PENDIENTE]`
- Representante o contacto legal: `[NOMBRE_PENDIENTE]`
- Correo de contacto legal: `[igual a NEXT_PUBLIC_BRAND_SUPPORT_EMAIL o uno dedicado]`

## 2 · Objeto y alcance del servicio

- Descripción exacta del servicio (usar el alcance real de `IDENTITY.md`; no
  prometer nada que el producto no haga hoy — DWG nativo, colaboración en
  vivo, certificaciones, etc. siguen sin existir mientras `IDENTITY.md` no
  cambie).
- Modalidad: SaaS por suscripción, organización como unidad de contratación
  (coincide con `apps/api/src/modules/organizations/`).
- Disponibilidad declarada: `[SLA_PENDIENTE — o "sin SLA comprometido" si esa
  es la decisión de negocio]`.

## 3 · Cuentas, organizaciones y roles

- Quién puede contratar (`owner`/`admin` de una organización — ya implementado
  en `apps/web/src/lib/commercial/checkout.ts`, `canOpenCheckout`).
- Responsabilidad del cliente sobre las cuentas de su equipo.
- Motivos de suspensión/terminación de cuenta.

## 4 · Precio, facturación y moneda

- Moneda de cobro: `MXN` (hoy es la única soportada —
  `apps/web/src/lib/commercial/public-catalog.ts`, `CATALOG_CURRENCY`; si el
  negocio decide soportar otra moneda, es un cambio de producto, no sólo de
  este texto).
- Medios de pago: tarjeta, OXXO, SPEI (`apps/web/src/lib/commercial/checkout.ts`,
  `PAYMENT_METHOD_OPTIONS`) — los medios en efectivo cubren un solo periodo y
  no se renuevan solos; el texto legal debe explicarlo con la misma claridad
  que ya tiene la UI.
- CFDI: emitido cuando el operador configura un PAC
  (`CFDI_PAC_NAME` + 3 variables en `DEPLOYMENT.md` §2); manual mientras no
  esté configurado.
- **Política de reembolso y cancelación:** `[REEMBOLSO_PENDIENTE — periodo de
  gracia, prorrateo, condiciones]`.

## 5 · Datos, propiedad de los dibujos y confidencialidad

- El cliente conserva la propiedad de sus documentos CAD (`design_blobs`,
  `cad_documents`, aislados por `organization.id` — ver `SECURITY.md`).
- Qué hace el operador con los datos al cancelar la cuenta:
  `[RETENCIÓN_PENDIENTE]`.
- Referencia cruzada al aviso de privacidad (`PLANTILLA_AVISO_PRIVACIDAD.md`).

## 6 · Garantías, límites de responsabilidad y uso profesional

- El texto ya vigente en `/terms` advierte: "revisa cada archivo y entregable
  antes de utilizarlo en fabricación, construcción u otra actividad
  profesional". La versión definitiva debe conservar esa advertencia o una
  equivalente — no es una formalidad, es la línea que separa una herramienta
  de dibujo de una certificación de ingeniería.
- Límite de responsabilidad económica: `[LÍMITE_PENDIENTE]`.
- Exclusión de garantías implícitas: `[TEXTO_PENDIENTE, según jurisdicción]`.

## 7 · Ley aplicable y resolución de disputas

- Ley y foro: `[JURISDICCIÓN_PENDIENTE]`.
- Mecanismo de notificación de cambios a estos términos (debe ser consistente
  con el mecanismo de nueva versión ya implementado en el API: nueva
  `version` + nueva aceptación exigida).

## 8 · Vigencia y versión

- `version`: `[AAAA-MM-DD — debe coincidir EXACTAMENTE con la entrada nueva en
  LEGAL_DOCUMENTS]`
- Fecha de entrada en vigor: `[FECHA_PENDIENTE]`
- Resumen de qué cambió respecto a la versión anterior (para quien ya aceptó
  la vieja).
