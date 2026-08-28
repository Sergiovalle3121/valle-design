# Historia del proyecto

Esto es el archivo, no el manual. Nada de lo que hay aquí describe el runtime de
hoy: son cortes anteriores, planes ya ejecutados y auditorías de problemas ya
resueltos. Se conservan enteros porque son la memoria del proyecto y parte del
expediente de autoría — **no se borra nada de aquí**.

Cuando una afirmación de esta carpeta difiera del código, prevalecen el código,
el OpenAPI, los tests y los documentos operativos vigentes. La verdad de hoy
empieza en [`IDENTITY.md`](../../IDENTITY.md) y sigue en `README.md`,
`ARCHITECTURE.md`, `PRODUCT.md`, `REPOSITORY_SCOPE.md`, los ADR, `docs/guides/`
y `docs/ops/`.

Se archivó el 2026-08-22, durante la campaña de identidad, por una razón
concreta: quien abría `docs/` se encontraba primero con la historia del ERP del
que nació el producto y después —si llegaba— con lo que el producto es.

## `product-split/` — la separación del ERP

Cómo se extrajo Valle Design del monorepo del ERP (Axos OS / Valle Enterprise) en
2026: inventarios, clasificación de propiedad archivo por archivo, grafo de
importaciones, matriz de aceptación, plan por fases, riesgos y rollback, y los
registros congelados de la extracción (`MANIFEST-SHA256.txt`,
`FILTER-REPO-PATHS.txt`). Ahí viven casi todas las menciones de
«valle-enterprise» y rutas de un contenedor que ya no existe.

**Lo único que NO se archivó de esa carpeta es `docs/product-split/DATA-MIGRATION.md`,
que sigue vivo**: documenta las tablas que el CLI de migración
(`apps/api/src/migration-cli/`) todavía lee, y el propio CLI imprime esa ruta en
su ayuda. Ese CLI no es residuo: es la puerta por la que un cliente del ERP viejo
trae sus datos a Valle Design.

## `execution/` — campañas y trackers vencidos

Planes y bitácoras de cortes cerrados: los _Grand Leap_, el _native core_, el
_daily driver_, las diez sesiones de la Ola 2, la campaña 10/10, las bitácoras
operativas de las campañas de 8 h y de DWG, y el diario de la campaña de
cierre de ramas del 24-08 (`CIERRE_RAMAS_20260824.md`; su informe de cierre
medido se quedó en `docs/execution/`, ver el párrafo siguiente) y el diario de
la campaña de lanzamiento gratuito del 27-08
(`CAMPANA_LANZAMIENTO_20260827.md`; su informe, con las tres columnas de
FIX-OR-HIDE y la lista GO/NO-GO, es
`docs/execution/INFORME_LANZAMIENTO_20260827.md`), y el de la campaña de firma
propia del 28-08 (`CAMPANA_FIRMA_20260828.md` — paleta v2, cuenta segura, canal
de comentarios y los cimientos del modo universitario; su informe es
`docs/execution/INFORME_CAMPANA_FIRMA_20260828.md`).

Cuidado al leerlos: uno de ellos cita un baseline de 8 761 líneas para
`Layout3DEditor.tsx` cuando el archivo real tiene más de 22 000, y otro fija una
misión que venció el 28 de julio. Son fotografías con fecha, no inventarios.

**Los `INFORME_*` se quedaron en `docs/execution/`** a propósito: son evidencia
medida al cierre de cada campaña, no planes vencidos.

## `cleanup/` y `audits/` — diagnósticos ya resueltos

`cleanup/BASELINE.md` y las dos auditorías (`main-rojo-e2e-20260809.md`,
`valle-design-baseline-20260803.md`) describen problemas que ya se corrigieron.
Siguen citándose desde el código —`apps/web/playwright.config.ts` y el golden 19
explican con ellas por qué existe cierta configuración— así que se conservan
íntegras y sus rutas se actualizaron en esos comentarios.
