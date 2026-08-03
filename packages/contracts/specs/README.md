# Contratos fuente de Valle Design

Estos archivos describen la superficie versionada del producto standalone.

| Archivo | Formato | Qué define |
| --- | --- | --- |
| `design-api.v1.yaml` | OpenAPI 3.1 | Identidad y sesiones first-party, organizaciones, membresías e invitaciones, estado comercial y API CAD canónica `/v1/cad/*`. |
| `design-events.v1.yaml` | AsyncAPI 2.6 | Eventos de dominio `design.*.v1` emitidos mediante el outbox local. |

La API no consume una identidad o catálogo comercial externo. El servidor
resuelve organización, tenant, rol, permisos, suscripción y entitlements desde
PostgreSQL; el navegador usa cookies first-party y CSRF.

## Versionado

Los cambios incompatibles crean una versión nueva. Los cambios aditivos pueden
entrar en v1 con su revisión correspondiente. Los centinelas históricos
`AXOS-CAD-STUDIO` / `UNIVERSAL` y los nombres XDATA se conservan únicamente en
la frontera `legacy`; retirarlos requiere migración verificable.

## SDK generado

`packages/design-sdk` genera sus tipos desde `design-api.v1.yaml`. El gate
`npm run check:cad-contract` compara operaciones del OpenAPI, SDK generado y
router Nest real; cualquier divergencia falla CI.

## Validación local

```bash
npx -y @redocly/cli@1.34.3 lint packages/contracts/specs/design-api.v1.yaml
npm run check:cad-contract
```
