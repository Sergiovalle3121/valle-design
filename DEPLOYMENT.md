# Despliegue

## Artefactos y requisitos

Node 20 (según `.nvmrc`), npm 10 y PostgreSQL 16. `npm ci` y `npm run build`
construyen contracts, SDK, API y web. El web incorpora
`NEXT_PUBLIC_API_URL` durante build; debe coincidir con el origen real.

## Secuencia productiva

1. Respaldar PostgreSQL y verificar restauración (véase guía de backup).
2. Configurar variables de `docs/guides/environment-variables.md`; como mínimo
   `NODE_ENV=production`, PostgreSQL, `SYNCHRONIZE=false`, secreto JWT,
   `ALLOWED_ORIGIN`, entitlement Platform y URL pública del API.
3. Ejecutar gates y migraciones en staging. No usar `synchronize`.
4. Desplegar API (`node apps/api/dist/main.js`) y comprobar `/health`.
5. Construir/desplegar web (`next build`, `next start`) con URL correcta.
6. Smoke de autenticación, tenant A/B, save CAS, lectura y export DXF.

Compose es desarrollo: expone credenciales conocidas y MinIO aún no participa
en el runtime. No es una receta productiva. El rollback de aplicación exige
compatibilidad de esquema; restaurar BD solo según el runbook y con ventana.
