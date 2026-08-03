# ADR-0005: `organization.id` es el tenant ID

- Estado: aceptado
- Fecha: 2026-08-02

## Contexto

El producto standalone necesita una frontera de datos simple y verificable. Un
tenant separado de la organización exigiría otra autoridad, un mapeo mutable y
reglas para resolver discrepancias. Aceptar cualquiera de los dos IDs desde el
cliente permitiría confusión de deputy y consultas cross-tenant.

## Decisión

Durante este release, el ID UUID de la organización es también el tenant ID.
No existe un selector de tenant independiente:

- la sesión guarda sólo `activeOrganizationId`;
- el servidor verifica la membresía actual y deriva
  `tenantId = organization.id`;
- roles y permisos se derivan de esa misma membresía;
- suscripción, uso, documentos, blobs, auditoría y outbox deben llevar el mismo
  par organización/tenant; y
- ausencia, membresía inválida o diferencia entre ambos IDs falla cerrada.

Los IDs suministrados por el navegador sólo pueden identificar el recurso
solicitado; nunca sustituyen el contexto derivado. Cambiar la organización
activa es una operación autenticada y con CSRF.

## Consecuencias

El aislamiento puede probarse con dos organizaciones sin depender de claims o
mapeos externos. Los FKs y consultas duplican en algunos lugares organization
y tenant para hacer la invariante auditable; ambos deben coincidir.

Una futura separación entre cuenta comercial, organización y tenant requiere
un ADR nuevo, migración de datos reversible, backfill verificado, compatibilidad
temporal del SDK y pruebas PostgreSQL/E2E cross-tenant. No puede introducirse
aceptando un `tenantId` adicional del cliente.

## Alternativas rechazadas

- Tenant independiente sin autoridad persistida.
- Tenant enviado como header o body.
- Interpretar tenant ausente como acceso global.
- Usar el propietario de la organización en lugar de la membresía actual.
