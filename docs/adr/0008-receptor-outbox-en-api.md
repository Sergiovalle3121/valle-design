# ADR-0008: El receptor de outbox vive en la misma API

- Estado: aceptado
- Fecha: 2026-08-20

## Contexto

ADR-0006 dejó el outbox transaccional completo por el lado emisor: worker con
leases, firma HMAC-SHA256 sobre `<X-Valle-Timestamp>.<raw-body>`,
`Idempotency-Key` estable y dos URLs de receptor (`OUTBOX_EMAIL_WEBHOOK_URL`,
`OUTBOX_DOMAIN_WEBHOOK_URL`). Lo que ningún despliegue tenía era el receptor:
sin él, nadie envía el correo de verificación, nadie se registra y nadie puede
pagar. Es el bloqueante número uno para cobrar el primer peso.

## Decisión

El receptor es un módulo de ESTA API (`apps/api/src/modules/outbox-receiver/`),
no una aplicación aparte ni una función serverless:

- `POST /v1/outbox/email` y `POST /v1/outbox/domain`, públicos: la credencial
  del emisor es la firma sobre los bytes crudos (parser crudo montado en
  `/v1/outbox`, tope 1 MB), con ventana de frescura de ±300 s y comparación en
  tiempo constante.
- Deduplicación durable en `webhook_receipts` (único sobre la clave), con el
  recibo insertado PRIMERO y en la MISMA transacción que el envío: si el
  proveedor falla no queda recibo y la reentrega reintenta; la ventana
  restante (enviado, commit perdido) la cubre la `Idempotency-Key` que viaja
  al proveedor.
- Envío por el puerto `EmailSender` con adaptador de Resend vía `fetch` sin
  SDK, y plantillas en español para lo que el producto encola hoy
  (`identity.verify-email`, `identity.reset-password`,
  `organization.invitation`) con enlaces absolutos sobre
  `OUTBOX_EMAIL_LINK_BASE_URL`.
- Configuración todo-o-nada (`EMAIL_SENDER_PROVIDER`, `EMAIL_SENDER_API_KEY`,
  `EMAIL_SENDER_FROM`, `OUTBOX_EMAIL_LINK_BASE_URL`): sin ninguna, el receptor
  responde 503 y el correo espera en el outbox; con todas, envía; a medias, el
  arranque falla — el mismo patrón que Stripe y el PAC.
- La cola `domain` es, de momento, aceptación durable sin consumo: verificar,
  apuntar el recibo y 200. No existe todavía ningún proyector de eventos, y
  fingirlo sería peor que declararlo.

## Alternativas consideradas

- **Aplicación receptora separada**: aísla fallos, pero duplica despliegue,
  secretos, TLS, monitoreo y base de datos para un tráfico que hoy son
  decenas de correos al día. El costo operativo fijo no se paga con nada.
- **Función serverless**: necesita de todas formas PostgreSQL para el recibo
  durable, más frío de arranque, otro proveedor que configurar y otro sitio
  donde rotar `OUTBOX_WEBHOOK_SECRET`. Ninguna ventaja a esta escala.

## Consecuencias (contras aceptados)

- **La API se llama a sí misma vía HTTPS.** Un salto de red completo (DNS,
  TLS, proxy) para hablar consigo misma. Se acepta porque conserva el
  contrato de ADR-0006 intacto — el día que el receptor se mude a otro
  servicio, sólo cambian dos URLs — y porque la firma sobre bytes crudos se
  verifica igual venga de donde venga.
- **Los dos receptores pueden apuntar al mismo servicio.** Ya estaba
  contemplado en `.env.example` («los dos receptores HTTPS pueden apuntar al
  mismo servicio») antes de existir este módulo; ahora es además el
  despliegue recomendado.
- Un fallo de la API tumba también al receptor. Es tolerable: el outbox
  emisor conserva las filas con reintentos y backoff, así que la caída
  retrasa correo, no lo pierde.
- El envío ocurre dentro de una transacción abierta (acotada por el timeout
  del adaptador). A este volumen, retener una conexión unos segundos es más
  barato que un recibo commiteado de un correo que nunca salió.
