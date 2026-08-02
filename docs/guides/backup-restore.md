# Backup y restore

## PostgreSQL

El respaldo debe cubrir en un mismo snapshot tablas CAD, versiones,
publicaciones, review sessions, auditoría y `design_blobs`; separar blobs rompe
punteros content-addressed.

```bash
pg_dump --format=custom --no-owner --file=valle-design.dump "$DATABASE_URL"
pg_restore --list valle-design.dump >/dev/null
createdb valle_design_restore_test
pg_restore --exit-on-error --no-owner --dbname=valle_design_restore_test valle-design.dump
```

En el entorno restaurado, ejecutar migraciones compatibles, arrancar API y
probar salud, conteos por tenant, lectura/hidratación de documentos grandes,
versiones, hashes de blobs, CAS y un export DXF. Registrar fecha, versión de app,
PostgreSQL y RPO/RTO medidos. Cifrar el backup, restringir acceso y probar
restauración periódicamente. SQLite (`dev.sqlite`) no es backup productivo.

## Archivo de migración legacy

El CLI genera manifest + NDJSON + blobs con SHA-256. Conservar el directorio
completo, no solo `manifest.json`; `import` verifica hashes antes de escribir.
`rollback` solo corresponde al mismo manifiesto. No sustituye un backup general.

## Restore de emergencia

Detener escrituras, conservar snapshot forense, restaurar en base nueva, validar
y cambiar conexión de forma atómica. No restaurar sobre producción activa ni
mezclar dump y blobs de instantes diferentes. Tras conmutar, comprobar dos
tenants y rotar credenciales expuestas durante el incidente.
