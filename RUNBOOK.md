# Runbook operativo

## Salud y triage

1. `curl -fsS http://HOST:4000/health` separa caída del API de fallo del web.
2. Revisar error fatal: secreto, PostgreSQL y `SYNCHRONIZE=false` son guards de
   arranque. Confirmar migraciones con `npm run migration:run` desde `apps/api`.
3. Para 401 validar Bearer/expiración y secreto compartido; para 403 revisar
   `cad:*`, `design.cad` y modo entitlement; para CORS revisar origen exacto.
4. Ante conflicto de guardado no forzar versión: recargar, comparar y reintentar
   usando CAS. Ante blob faltante preservar BD/logs y no ejecutar GC.

## Incidentes

- **Sospecha cross-tenant:** detener escrituras, preservar logs/backup, revocar
  acceso, reproducir con `test:pg`; no corregir filas manualmente sin alcance.
- **Pérdida/corrupción:** poner servicio en mantenimiento, tomar snapshot
  forense y seguir `docs/guides/backup-restore.md`.
- **Platform/CIDE caído:** entitlement productivo niega acceso; CIDE debe
  degradar. No cambiar a `allow-all`/mock para ocultarlo.
- **Migración legacy:** detener y usar `verify`/`rollback` del archivo exacto;
  el origen es read-only.

Diagnóstico ampliado: `docs/guides/troubleshooting.md`.
