#!/usr/bin/env bash
#
# BACKUP PROGRAMADO DEL VPS: crear → VERIFICAR → subir (opcional) → rotar.
#
# Este script existe porque «hay scripts de backup» y «hay backups» son dos
# estados distintos del mundo: backup.mjs y restore-verify.mjs llevaban meses
# en el repo sin que nadie los ejecutara cada noche. La política que impone:
#
#   1. NINGÚN backup cuenta sin verificar. Aquí restore-verify.mjs corre
#      SIEMPRE, en la misma pasada: si la restauración de prueba falla, el
#      script falla entero y el cron lo grita (ver MAILTO abajo). Un .dump
#      sin restaurar no es un backup, es un archivo.
#   2. La copia sale de la máquina si hay a dónde: con RCLONE_REMOTE definido
#      (p. ej. un bucket R2/S3 configurado en rclone) los cuatro artefactos se
#      suben; un backup que vive en el mismo disco que la base comparte
#      destino con ella.
#   3. FALLA RUIDOSO: set -euo pipefail + trap. Un cron que falla en silencio
#      es peor que no tener cron — mantiene la sensación de tener copia.
#   4. La rotación local corre SOLO tras verificar (y subir, si procede):
#      nunca se borra lo viejo antes de saber que lo nuevo sirve.
#
# Requisitos del host (no van en la imagen del API; esto corre EN el VPS):
#   - Node 20+, binarios cliente de PostgreSQL 16 (PG_BIN si no están en PATH),
#   - una copia del repo (o al menos de scripts/ops/) junto a este script,
#   - rclone configurado, sólo si se usa RCLONE_REMOTE.
#
# Variables:
#   DATABASE_URL           obligatoria — la base a copiar
#   BACKUP_DIR             destino local (default /srv/valle/backups)
#   RCLONE_REMOTE          remoto rclone tipo "r2:valle-backups" (opcional)
#   BACKUP_RETENTION_DAYS  días que se conservan los backups locales (default 14)
#   PG_BIN                 directorio de binarios de PostgreSQL 16 (opcional)
#
# Línea de cron exacta (diaria a las 03:15 UTC, con aviso por correo al fallar):
#
#   MAILTO=tu-correo@dominio.mx
#   15 3 * * * DATABASE_URL=postgres://... RCLONE_REMOTE=r2:valle-backups /srv/valle/repo/scripts/ops/backup-cron.sh >> /var/log/valle-backup.log 2>&1
#
# La retención del plan (SLA.md §2) manda sobre el default: Profesional exige
# backups cada 6 h y 30 días — cuatro líneas de cron y BACKUP_RETENTION_DAYS=30.
set -euo pipefail

trap 'echo "BACKUP-CRON FALLÓ (línea $LINENO). NO hay backup verificado de esta pasada." >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/srv/valle/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Falta DATABASE_URL: un backup no puede adivinar contra qué base correr." >&2
  exit 1
fi

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
NAME="valle-design-${STAMP}"

echo "== backup-cron ${STAMP} =="

# 1 · Crear el backup con su inventario verificable (4 artefactos).
node "${SCRIPT_DIR}/backup.mjs" \
  --url "${DATABASE_URL}" \
  --out "${BACKUP_DIR}" \
  --name "${NAME}"

# 2 · VERIFICAR: restaurar en una base temporal del mismo servidor y borrarla.
#     Si esto no imprime «BACKUP VALIDADO», el script muere aquí y el cron
#     avisa. Sin este paso, el paso 1 sólo produjo un archivo.
node "${SCRIPT_DIR}/restore-verify.mjs" \
  --dump "${BACKUP_DIR}/${NAME}.dump" \
  --url "${DATABASE_URL}"

# 3 · Subida opcional fuera de la máquina (R2/S3 vía rclone), por año/mes.
if [ -n "${RCLONE_REMOTE:-}" ]; then
  DEST="${RCLONE_REMOTE}/$(date -u +%Y/%m)"
  for EXT in dump dump.sha256 contents manifest.json; do
    rclone copyto "${BACKUP_DIR}/${NAME}.${EXT}" "${DEST}/${NAME}.${EXT}"
  done
  echo "Subido a ${DEST}: ${NAME}.{dump,dump.sha256,contents,manifest.json}"
else
  echo "AVISO: RCLONE_REMOTE sin definir — el backup verificado se queda SOLO"
  echo "en este disco. Si el disco muere, muere con la base que debía proteger."
fi

# 4 · Rotación local, SOLO llegados aquí (nuevo backup verificado y subido).
find "${BACKUP_DIR}" -maxdepth 1 -name 'valle-design-*' -type f \
  -mtime "+${RETENTION_DAYS}" -print -delete | sed 's/^/rotado: /'

echo "== backup-cron OK: ${BACKUP_DIR}/${NAME}.dump verificado =="
