# ADR-0002: API y SDK contract-first

- Estado: aceptado
- Fecha: 2026-08-02

## Contexto

La API NestJS, los tipos compartidos y `@valle/design-sdk` pueden divergir. CI
ya valida OpenAPI y un test compara SDK/contratos.

## Decisión

Los YAML versionados en `packages/contracts/specs/` son la fuente pública. Un
cambio se hace de forma aditiva o con nueva versión, se valida con Redocly,
regenera `packages/design-sdk/src/generated/design-api.ts` y pasa su test de
compatibilidad. El frontend debe usar `/v1/cad/*`; adaptadores legacy son una
transición, no una API alternativa. AsyncAPI describe intención contractual;
un publicador no-op no demuestra entrega de eventos.

## Consecuencias

Un endpoint sin spec o un spec sin implementación se marca parcial. Cambios
rompientes exigen migración/deprecación. El SDK no contiene reglas de dominio.

## Alternativas rechazadas

Generar spec desde decoradores (no es el flujo existente); clientes manuales
como fuente; importar módulos internos del API.
