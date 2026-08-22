# Separación del ERP — lo que sigue vivo

De esta carpeta sólo queda un documento en uso: **`DATA-MIGRATION.md`**, que
describe las tablas del ERP de origen que el CLI de migración
(`apps/api/src/migration-cli/`) todavía lee. El propio CLI imprime esta ruta en
su ayuda, así que no se mueve.

Ese CLI **no es residuo**: es la puerta por la que un cliente del ERP viejo trae
sus datos a Valle Design. Es adquisición de clientes, no deuda técnica. Ver
[`IDENTITY.md`](../../IDENTITY.md).

El resto de la documentación de la separación —inventarios, clasificación, grafo
de importaciones, matriz de aceptación, plan por fases, riesgos y los registros
congelados de la extracción— se archivó en
[`docs/history/product-split/`](../history/product-split/) el 2026-08-22.
