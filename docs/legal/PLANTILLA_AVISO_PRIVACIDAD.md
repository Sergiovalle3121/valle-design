# Plantilla — Aviso de privacidad (borrador para revisión legal, LFPDPPP)

> **No publicar tal cual.** Esqueleto para que un abogado especializado en
> protección de datos (LFPDPPP y su reglamento) lo complete y Sergio lo
> apruebe antes de reemplazar el aviso técnico mínimo que hoy vive en
> `apps/web/src/app/privacy/page.tsx`. Cada `[CORCHETE]` es un dato o una
> decisión que ingeniería NO puede rellenar — y que el validador de
> producción rechaza si queda tal cual (`production-readiness.ts`).

## 1 · Responsable del tratamiento

- Razón social: `[RAZÓN_SOCIAL_PENDIENTE — mismo dato que el de términos]`
- RFC: `[RFC_PENDIENTE]`
- Domicilio: `[DOMICILIO_PENDIENTE]`
- Correo para ejercer derechos ARCO: `[igual a
  NEXT_PUBLIC_BRAND_PRIVACY_EMAIL o un canal dedicado]`

## 2 · Datos que se tratan (base real, no aspiracional)

Lista verificada contra el esquema actual, no inventada:

- Cuenta: correo, nombre visible, derivación Argon2id de la contraseña
  (`apps/api/src/modules/identity/`).
- Sesión: IP, user-agent, expiración (cookie `__Host-valle_session`,
  `SECURITY.md`).
- Organización y membresías (`apps/api/src/modules/organizations/`).
- Documentos CAD y su contenido (`design_blobs`, `cad_documents`) — aislados
  por tenant, nunca compartidos entre organizaciones (`SECURITY.md`,
  "Organizaciones, RBAC y acceso comercial").
- Datos fiscales cuando el cliente los captura para CFDI: RFC, razón social,
  régimen fiscal, uso de CFDI, código postal
  (`apps/api/src/modules/commercial/controllers/tax-profile.controller.ts`).
- Aceptación de términos/privacidad: usuario, organización, documento,
  versión y fecha — **deliberadamente sin IP ni user-agent**
  (`apps/api/src/modules/legal/entities/legal-acceptance.entity.ts`, ver el
  comentario "Qué NO se guarda, y es una decisión, no un olvido").

Si el proveedor de correo (`EMAIL_SENDER_PROVIDER`), el proveedor de pagos
(Stripe) o el PAC de CFDI cambian, esta sección debe revisarse: cada uno es un
tercero que recibe datos.

## 3 · Finalidades

- Primarias (necesarias para prestar el servicio): `[LISTAR — autenticación,
  facturación, soporte, continuidad del servicio]`.
- Secundarias (requieren opt-in, nunca opt-out por defecto):
  `[LISTAR o declarar "no se tratan datos para finalidades secundarias"]`.

## 4 · Transferencias

- Proveedores de infraestructura y su rol (hosting, correo transaccional,
  pasarela de pago, PAC de facturación): `[LISTAR_PENDIENTE]`.
- Transferencias internacionales, si las hay: `[PENDIENTE]`.

## 5 · Conservación y eliminación

- Plazo de conservación por tipo de dato: `[PLAZOS_PENDIENTES]`.
- Qué ocurre al cancelar una organización: `[RETENCIÓN_PENDIENTE — debe
  coincidir con lo que diga la sección 5 de la plantilla de términos]`.

## 6 · Derechos ARCO y medio para ejercerlos

- Procedimiento, plazo de respuesta y requisitos de identificación:
  `[PROCEDIMIENTO_PENDIENTE]`.
- El aviso hoy publicado ya declara que sin correo de privacidad configurado
  el operador debe habilitar un canal antes de ofrecer el servicio a
  terceros (`apps/web/src/app/privacy/page.tsx`) — esa condición no desaparece
  con este documento, se vuelve más estricta.

## 7 · Seguridad de los datos (resumen, sin detalle explotable)

Referencia a `SECURITY.md` sin reproducir detalles de implementación que no
aporten nada al titular de los datos y sí a un atacante (arquitectura interna,
nombres de tablas, mecanismos exactos de rate limiting).

## 8 · Cambios a este aviso

- Mecanismo de notificación de una versión nueva.
- `version`: `[AAAA-MM-DD]` — el aviso de privacidad NO exige aceptación
  explícita en el registro actual (`requiereAceptacion: false` en
  `LEGAL_DOCUMENTS`, porque se acredita entrega, no consentimiento). Si el
  asesor jurídico determina que para algún tratamiento SÍ hace falta
  consentimiento explícito, ese tratamiento necesita su PROPIO mecanismo de
  aceptación — no basta con cambiar la bandera de este documento.
