# Migración y retirada de legado

## Enterprise → Design

Desde `apps/api`, usar primero dry-run:

```bash
npm run migrate:from-enterprise -- export --out /backup/design --dry-run
npm run migrate:from-enterprise -- export --out /backup/design
npm run migrate:from-enterprise -- import --archive /backup/design --dry-run
npm run migrate:from-enterprise -- import --archive /backup/design
npm run migrate:from-enterprise -- verify
```

Definir `DATABASE_URL_SOURCE` (el CLI la abre read-only) y
`DATABASE_URL_TARGET`; filtrar con `--tenant` si procede. El import es
idempotente por tenant + `legacy_source_id`; no borrar el origen. Ante fallo,
corregir la causa, re-verificar hashes y usar `--resume` solo si se acepta no
revalidar bytes ya importados. `rollback --archive` borra exactamente lo
registrado por ese manifiesto y blobs huérfanos resultantes.

## Condiciones de retiro: no negociables

| Histórico                                | Puede retirarse solo cuando…                                                                                                                           | Evidencia que se conserva                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `AXOS-CAD-STUDIO` + `UNIVERSAL`          | hay lector bidireccional; migración/backfill y rollback probados; conteos por valor cuadran; quedan cero filas viejas en **todos** los entornos        | `persisted-identifiers.spec.ts` hasta conteo cero confirmado            |
| `AXOS_DIM`, `AXOS_MLEADER`, `AXOS_BLOCK` | **escritura ya retirada**: se emite `VALLE_*`. La LECTURA sólo se retira cuando los archivos de clientes estén migrados de forma verificable — cosa que el producto no controla | `dxf-xdata-golden.spec.ts` (bytes reales, sin regenerar) y `dxf-xdata-app-names.spec.ts` (equivalencia campo a campo) |

Un golden que falla demuestra incompatibilidad; **no** se actualiza para hacer
verde el cambio. Añadir primero fixture nuevo, lector dual y test de archivo
viejo; migrar y medir; retirar en PR separado con plan de reversión. Un
buscar-y-reemplazar global sobre estos literales NO es un renombre: son datos y
formato de archivo, no nombres de código.

Las rutas `apps/api/src/migrations/legacy/` citadas en documentos del split son
historia del monorepo y están fuera de la cadena actual; no recrearlas ni
ejecutarlas en Design.

## Cambio de nombre de producto → Valle Design

El producto se llama **Valle Design**: un sistema de diseño arquitectónico 2D
que compite con AutoCAD de Autodesk. El nombre anterior se retiró de todo el
código, la interfaz, los estilos, la documentación y la licencia.

Lo que **sigue** conteniendo ese literal, y por qué no puede quitarse hoy:

| Dónde                                                             | Qué es                                                       | Por qué se queda                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `AXOS-CAD-STUDIO` / `UNIVERSAL`                                   | centinelas `model`/`revision` en filas existentes             | son DATOS en la base; retirarlos es un backfill verificado, no un renombre (fila superior de esta tabla)           |
| `AXOS_DIM`, `AXOS_MLEADER`, `AXOS_BLOCK`                          | marcas XDATA dentro de DXF ya exportados                      | ya no se ESCRIBEN; se leen para no dejar ilegibles los archivos que están en discos de clientes                    |
| `axos_theme`, `axos_locale`, `axos_cad_workspace`, `axos:cad:*`   | claves de `localStorage`/cookie del navegador de cada usuario | se leen una vez y se migran a la clave `valle_*`; ver `apps/web/src/lib/storage-rename.ts`                          |
| `axos_access_token`, el secreto de sesión de la plataforma origen | literales dentro de expresiones regulares NEGATIVAS           | los guards prueban que esos valores NO aparecen; quitar el literal apaga el guard sin que ningún test se ponga rojo |
| `docs/history/product-split/MANIFEST-SHA256.txt`, `FILTER-REPO-PATHS.txt` | registros congelados de la extracción desde el monorepo       | describen rutas y hashes que existieron en OTRO repositorio; reescribirlos falsificaría el registro                 |

Las claves de navegador de la tercera fila desaparecen solas: cada usuario que
vuelve a entrar migra la suya. Las dos primeras filas requieren decisión de
Producto y una migración de datos, no un commit.
