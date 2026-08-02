# Contratos entre productos — specs (Fase 2 de la separación CAD)

Contratos FUENTE (SHARED_PROTOCOL) entre el producto **Design** (CAD, futuro
repo `valle-design`) y el resto de la plataforma (Enterprise ERP/MES +
platform-core). Los tipos TypeScript mínimos derivados a mano viven en
`../src/design-contracts.ts` y se exportan desde `@valle-design/contracts`.

## Qué es cada spec

| Archivo | Formato | Dirección | Qué define |
| --- | --- | --- | --- |
| `design-api.v1.yaml` | OpenAPI 3.1 | Design **expone** | API HTTP del producto CAD bajo `/v1`: proyectos, documentos (crear/abrir/guardar con CAS optimista, inline o gzip 20 MiB), historial de versiones, recibos de publicación, sesiones de revisión y comentarios (tokens server-owned), DXF import/export y biblioteca de bloques. Refleja la semántica REAL que hoy implementa Enterprise bajo `/line-engineering/*` y el modelo `cad_*` de `apps/api/src/modules/cad-documents/`. |
| `design-events.v1.yaml` | AsyncAPI 2.6 | Design **emite** | Eventos de dominio versionados: `design.document.created.v1`, `design.document.published.v1`, `design.layout.released.v1`, `design.document.archived.v1`. Payloads mínimos: ids + tenant + timestamps + actor + deepLink (+ snapshot read-only en el release). |
| `platform-api.v1.yaml` | OpenAPI 3.1 | Design **consume** | Contrato-OBJETIVO (draft) de lo mínimo que Design necesita de Platform: `whoami` (tenant/usuario/permisos `cad:*`), `GET /v1/entitlements/{code}` (→ `{active}`, fail-closed) y `POST /v1/usage` (medición idempotente). Platform lo implementa después de Fase 2. |

## Versionado

- **v1 se congela al cerrar Fase 3** (cuando el SDK generado quede publicado y
  el repo `valle-design` lo consuma). Hasta entonces es borrador validable y
  puede ajustarse.
- Tras el congelamiento, cualquier cambio **incompatible** es un contrato
  nuevo: `design-api.v2.yaml`, canal de evento `.v2`, etc. Los `.v1` no se
  mutan; se deprecian y conviven durante la ventana de migración.
- Cambios **compatibles** (campos opcionales nuevos, métricas de uso nuevas,
  códigos de error adicionales) sí caben en v1 con bump menor de
  `info.version`.
- Los identificadores LEGADOS persistidos `AXOS-CAD-STUDIO` / `UNIVERSAL`
  (campos `model`/`revision` del documento) se leen y escriben tal cual en
  v1. Renombrarlos exige migración de datos y bump de versión del formato del
  documento (`meta.schema`); queda explícitamente fuera de v1.

## Regla de frontera (qué puede guardar Enterprise del CAD)

> **Enterprise solo puede almacenar del CAD: `cadProjectId`,
> `cadDocumentId`, `cadPublicationId`, el deep link y un snapshot de solo
> lectura.**

Nada más: ni el documento canónico, ni geometría, ni tokens de review, ni
rutas internas de la UI de Design reconstruidas a mano. El `deepLink` es una
URL opaca que se guarda y se abre tal cual. Los payloads de
`design-events.v1.yaml` contienen exactamente ese conjunto para que cumplir
la regla sea el camino fácil; cualquier dato adicional se obtiene en caliente
llamando a `design-api.v1.yaml` con el entitlement y permisos del usuario.

## Cómo se generará el SDK (Fase 3 — en el repo `valle-design`)

Estos YAML son el contrato FUENTE; aquí no se genera código. En Fase 3, el
repo `valle-design`:

1. Genera tipos + cliente HTTP desde `design-api.v1.yaml` (p. ej.
   `openapi-typescript` / `@hey-api/openapi-ts`) y los publica como paquete
   SDK versionado en lockstep con el spec (`1.x` ⇄ v1).
2. Genera los tipos de eventos desde `design-events.v1.yaml` (o los valida
   contra los tipos a mano de `design-contracts.ts` con un test de igualdad
   estructural).
3. Enterprise consume el SDK publicado — nunca los YAML directamente — y
   elimina sus llamadas legacy a `/line-engineering/*` conforme migra.
4. El cliente de `platform-api.v1.yaml` se genera igual, detrás de las
   interfaces/shims de plataforma ya previstos en el plan de Fase 1.

Mientras tanto, los tipos mínimos a mano de `../src/design-contracts.ts`
(ids tipados, códigos de evento, permisos, entitlement, códigos de error,
límites) son la única dependencia tipada que Enterprise necesita.

## Validación local

```bash
# OpenAPI (design + platform)
npx -y @redocly/cli lint packages/contracts/specs/design-api.v1.yaml
npx -y @redocly/cli lint packages/contracts/specs/platform-api.v1.yaml

# AsyncAPI (eventos)
npx -y @asyncapi/cli validate packages/contracts/specs/design-events.v1.yaml
```
