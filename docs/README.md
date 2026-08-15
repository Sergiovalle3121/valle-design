# Mapa de documentación

La verdad operativa actual está en los documentos raíz (`README.md`,
`ARCHITECTURE.md`, `PRODUCT.md`, `SECURITY.md`, `DEPLOYMENT.md`, `RUNBOOK.md`,
`AGENTS.md`), los ADR, `guides/`, `ops/` y la matriz `competitive/`.

Operación de un despliegue vivo, en orden de uso:

| Documento | Responde |
| --------- | -------- |
| `DEPLOYMENT.md` | cómo se construye, se despliega y se REVIERTE una versión |
| `RUNBOOK.md` | qué hacer cuando algo falla, con comandos exactos |
| `docs/ops/SLA.md` | qué se promete por plan, cómo se mide y qué NO se promete |
| `docs/guides/backup-restore.md` | cómo se toma y se VERIFICA un backup |
| `docs/guides/environment-variables.md` | inventario de variables y su efecto |

`execution/`, `product-split/`, `cleanup/` y parte de `cad/` son bitácoras
históricas preservadas para trazabilidad de decisiones y PR. Describen cortes
anteriores y no deben usarse como inventario del runtime consolidado. Cuando
una afirmación difiere del código o de la documentación operativa, prevalecen
el OpenAPI, los tests y los documentos actuales listados arriba.

Los contratos fuente vigentes están en `packages/contracts/specs/`; sólo
`design-api.v1.yaml` y `design-events.v1.yaml` forman parte del producto
standalone.
