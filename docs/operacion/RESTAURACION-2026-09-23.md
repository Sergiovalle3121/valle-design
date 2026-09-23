# Ejercicio de restauración · 2026-09-23

**Estado: pendiente / no validado.** No se produjo un respaldo con datos reales
en esta tarea y no se ejecutó una restauración PostgreSQL. Los scripts nuevos
quedan preparados para el ejercicio; no son evidencia de recuperación.

| Evidencia exigida | Resultado actual |
| --- | --- |
| SHA-256 del `.vbk` y su `.vbk.sha256` | Pendiente: no existe artefacto de este ejercicio |
| Tamaño del respaldo cifrado | Pendiente: no existe artefacto de este ejercicio |
| Duración de restauración y smoke | Pendiente: no se ejecutó PostgreSQL |
| `pg_restore --exit-on-error`, tablas, conteos, migraciones | Pendiente |
| API compilada y smoke contra base temporal | Pendiente |
| Borrado comprobado de base `valle_restore_verify_*` | Pendiente |

## Lo comprobado sin secretos reales

- Un paquete sintético cifra y autentica dump, checksum, índice y manifiesto;
  la clave errónea o un byte alterado fallan sin dejar archivos extraídos.
- El guard del ejercicio local rechaza host o puerto remoto y parámetros que
  podrían redirigir libpq. La URL y la frase de cifrado se leen del entorno,
  nunca de `argv`.
- Ambos wrappers tienen sintaxis PowerShell 5.1 válida. Se comprobó que no
  hay binarios PostgreSQL disponibles en PATH, `D:\dev\pg16\pgsql\bin` ni
  `C:\Program Files\PostgreSQL` en este entorno. El registro de gobernanza
  `BACKUP-CONTRASENA-ARGV-20260923` conserva el intento previo: Windows
  Device Guard bloqueó `postgres.exe` el 2026-09-23. Este trabajo no hizo un
  nuevo intento ni modifica políticas de Device Guard.
- `node --test` pasó 9/9 pruebas focales (cifrado, SHA por bloques, guard
  local y secretos fuera de argumentos). `npm run check:governance` pasó 11/11;
  `git diff --check` pasó. `work/restaurar.ps1` rechazó una URL remota
  sintética antes de abrir archivo o PostgreSQL.

## Para cerrar el ejercicio

1. Ejecutar `work/respaldo.ps1` con `DATABASE_URL`,
   `BACKUP_ENCRYPTION_PASSPHRASE` y `PG_BIN` suministrados fuera del repositorio.
   Guardar `.vbk` y `.vbk.sha256` fuera del host de base.
2. En un PostgreSQL 16 local utilizable en el puerto 55432, ejecutar
   `work/restaurar.ps1 -Archivo <ruta.vbk>` con las mismas variables de entorno.
   El resultado debe contener `BACKUP VALIDADO` y `Ejercicio local validado`.
3. Anotar aquí fecha/hora UTC, SHA-256, bytes, segundos de restauración,
   versión del servidor, última migración, tablas y conteos verificados, estado
   del smoke y evidencia de que la base temporal desapareció. Si el bloqueo de
   Device Guard persiste, usar otro equipo aislado y aprobado para el ejercicio.

No conectar el ejercicio a servicios externos ni habilitar el dispatcher de
outbox. No presentar esta plantilla como un restore exitoso antes de llenar
los resultados observados.

El inventario actual se toma antes del dump pero no en su mismo snapshot MVCC.
Una restauración exitosa con conteos iguales tampoco verifica cada fila ni mide
el tiempo de recuperación del servicio completo. Registrar estas limitaciones
al cerrar el ejercicio; no anunciar RPO/RTO productivos a partir del script.
