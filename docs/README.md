# Mapa de documentación

La verdad operativa actual está en los documentos raíz (`README.md`,
`ARCHITECTURE.md`, `PRODUCT.md`, `SECURITY.md`, `DEPLOYMENT.md`, `RUNBOOK.md`,
`AGENTS.md`), los ADR, `guides/` y la matriz `competitive/`.

`execution/`, `product-split/`, `cleanup/` y parte de `cad/` son bitácoras
históricas preservadas para trazabilidad de decisiones y PR. Describen cortes
anteriores y no deben usarse como inventario del runtime consolidado. Cuando
una afirmación difiere del código o de la documentación operativa, prevalecen
el OpenAPI, los tests y los documentos actuales listados arriba.

Los contratos fuente vigentes están en `packages/contracts/specs/`; sólo
`design-api.v1.yaml` y `design-events.v1.yaml` forman parte del producto
standalone.
