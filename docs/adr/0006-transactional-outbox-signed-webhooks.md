# ADR-0006: Outbox transaccional y webhooks firmados

- Estado: aceptado
- Fecha: 2026-08-02

## Contexto

Registro, verificación, reset, invitaciones y eventos CAD producen efectos
externos. Llamar a un proveedor dentro de la transacción mantiene locks durante
la red; llamarlo después de confirmar puede perder el efecto si el proceso cae.
No hay un proveedor de correo ni broker incluido en este repositorio.

## Decisión

Persistir email y eventos de dominio en outboxes PostgreSQL dentro de la misma
transacción que su agregado. Un worker del API:

- reclama lotes con `FOR UPDATE SKIP LOCKED` y leases por worker;
- renueva el lease durante una entrega larga;
- ofrece entrega at-least-once con idempotency key estable;
- reintenta con backoff y jitter;
- recupera leases vencidos y marca intentos agotados como `dead`; y
- emite telemetría sin payload, recipient, tenant ni texto del proveedor.

El transporte envía POST a un receptor de email y otro de eventos. Ambos son
HTTPS en producción y se autentican con HMAC-SHA256 sobre
`<X-Valle-Timestamp>.<raw-body>`. La firma viaja en `X-Valle-Signature` y la
clave de deduplicación en `Idempotency-Key`.

El receptor debe verificar bytes crudos, firma y frescura antes de actuar,
aceptar durablemente antes de responder 2xx y deduplicar la clave. El runtime
no considera una respuesta fallida como entrega y nunca guarda el cuerpo de
respuesta del proveedor.

## Consecuencias

PostgreSQL es obligatorio para el dispatcher; SQLite no ofrece la semántica de
lease multi-worker. Producción falla al arrancar si el worker o transporte no
están configurados, porque de lo contrario correo crítico quedaría varado.

Puede haber duplicados si el receptor completa el efecto pero pierde la
respuesta. La idempotencia downstream es por tanto parte obligatoria del
contrato. Operación debe monitorear backlog, edad, reintentos, leases perdidos y
dead letters y necesita un proceso auditado de replay; editar estados a mano no
es seguro.

## Alternativas rechazadas

- Enviar por red dentro de la transacción.
- Fire-and-forget después del commit.
- Entrega exactly-once declarativa sin deduplicación downstream.
- Poller SQLite multi-réplica.
- Firmar JSON reserializado o registrar payloads/tokens para depuración.
