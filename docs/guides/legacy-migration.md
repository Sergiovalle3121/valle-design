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
| `AXOS_DIM`, `AXOS_MLEADER`, `AXOS_BLOCK` | importador lee viejo+nuevo durante ciclo largo; se versionó `meta.schema` y migraron documentos; Producto aprobó romper/retirar compatibilidad antigua | `dxf-xdata-golden.spec.ts` sin regenerarlo mientras exista lector viejo |

Un golden que falla demuestra incompatibilidad; **no** se actualiza para hacer
verde el cambio. Añadir primero fixture nuevo, lector dual y test de archivo
viejo; migrar y medir; retirar en PR separado con plan de reversión. No hacer
reemplazo global de `AXOS`: los literales son datos/formato.

Las rutas `apps/api/src/migrations/legacy/` citadas en documentos del split son
historia del monorepo y están fuera de la cadena actual; no recrearlas ni
ejecutarlas en Design.
