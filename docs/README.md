# Mapa de documentación

**Empieza por [`IDENTITY.md`](../IDENTITY.md)**: dice en treinta segundos qué es
Valle Design, qué **no** es, y por qué hay identificadores congelados que no se
renombran.

La verdad operativa actual está en los documentos raíz (`README.md`,
`ARCHITECTURE.md`, `PRODUCT.md`, `REPOSITORY_SCOPE.md`, `SECURITY.md`,
`DEPLOYMENT.md`, `RUNBOOK.md`, `AGENTS.md`), los ADR, `guides/`, `ops/` y la
matriz `competitive/`.

Operación de un despliegue vivo, en orden de uso:

| Documento                              | Responde                                                  |
| -------------------------------------- | --------------------------------------------------------- |
| `DEPLOYMENT.md`                        | cómo se construye, se despliega y se REVIERTE una versión |
| `RUNBOOK.md`                           | qué hacer cuando algo falla, con comandos exactos         |
| `docs/ops/SLA.md`                      | qué se promete por plan, cómo se mide y qué NO se promete |
| `docs/guides/backup-restore.md`        | cómo se toma y se VERIFICA un backup                      |
| `docs/guides/environment-variables.md` | inventario de variables y su efecto                       |

[`history/`](history/README.md) es el archivo: la separación del ERP
(`product-split/`), las campañas y trackers vencidos (`execution/`) y los
diagnósticos ya resueltos (`cleanup/`, `audits/`). Se conserva entero como
memoria del proyecto, pero **no describe el runtime de hoy**; su propio README
explica qué fue cada cosa. En `execution/` quedan sólo los `INFORME_*` —evidencia
medida al cierre de cada campaña— y las campañas en curso. Parte de `cad/`
también es bitácora histórica. Cuando una afirmación difiere del código o de la
documentación operativa, prevalecen el OpenAPI, los tests y los documentos
actuales listados arriba.

Los contratos fuente vigentes están en `packages/contracts/specs/`; sólo
`design-api.v1.yaml` y `design-events.v1.yaml` forman parte del producto
standalone.
