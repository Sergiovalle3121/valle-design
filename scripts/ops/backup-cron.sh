#!/usr/bin/env bash
# Respaldo programado: dump → restore aislado → cifrar → verificar → subir → comprobar remoto.
# El único material que se entrega a rclone es el paquete .vbk y su SHA-256.
# Antes de confirmar la subida, un fallo conserva lo anterior y el área .pending-*.
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/srv/valle/backups}"
PENDING_DIR=''
trap 'echo "BACKUP-CRON FALLÓ (línea $LINENO). Área pendiente: ${PENDING_DIR:-no creada}." >&2' ERR

# Comprobar configuración y herramientas antes de abrir un dump o tocar la retención.
if [ -z "${DATABASE_URL:-}" ] || [ -z "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ] ||
   [ "${#BACKUP_ENCRYPTION_PASSPHRASE}" -lt 20 ] || [ -z "${RCLONE_REMOTE:-}" ]; then
  echo 'Faltan DATABASE_URL, BACKUP_ENCRYPTION_PASSPHRASE (mínimo 20 caracteres) o RCLONE_REMOTE.' >&2
  exit 1
fi
if ! [[ "$RCLONE_REMOTE" =~ ^[A-Za-z][A-Za-z0-9_-]*:[A-Za-z0-9][A-Za-z0-9._/-]*$ ]]; then
  echo 'RCLONE_REMOTE debe nombrar un remoto rclone configurado y una ruta, sin credenciales embebidas.' >&2
  exit 1
fi
for binary in node rclone sha256sum cmp mktemp; do
  if ! command -v "$binary" >/dev/null 2>&1; then
    echo "Falta herramienta requerida: $binary." >&2
    exit 1
  fi
done

mkdir -p -- "$BACKUP_DIR"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
PENDING_DIR="$(mktemp -d "$BACKUP_DIR/.pending-valle-design-${STAMP}-XXXXXXXX")"
NAME="${PENDING_DIR##*/}"
NAME="${NAME#.pending-}"
ENCRYPTED_DIR="$PENDING_DIR/encrypted"
VERIFY_DIR="$PENDING_DIR/verified"
mkdir -- "$ENCRYPTED_DIR" "$VERIFY_DIR"

echo "== backup-cron ${STAMP} =="

# El dump y el restore de prueba viven únicamente en el área privada pendiente.
node "$SCRIPT_DIR/backup.mjs" --out "$PENDING_DIR" --name "$NAME"
node "$SCRIPT_DIR/restore-verify.mjs" --dump "$PENDING_DIR/$NAME.dump"

# El paquete portable autentica el dump, checksum, índice e inventario juntos.
ARCHIVE="$ENCRYPTED_DIR/$NAME.vbk"
node "$SCRIPT_DIR/backup-envelope.mjs" pack "$PENDING_DIR" "$NAME" "$ARCHIVE" >/dev/null
(
  cd "$ENCRYPTED_DIR"
  sha256sum "$NAME.vbk" > "$NAME.vbk.sha256"
  sha256sum -c "$NAME.vbk.sha256" >/dev/null
)

# Ejercicio criptográfico local: autenticar, extraer y comparar los cuatro archivos.
node "$SCRIPT_DIR/backup-envelope.mjs" unpack "$ARCHIVE" "$VERIFY_DIR" >/dev/null
for extension in dump dump.sha256 contents manifest.json; do
  cmp -- "$PENDING_DIR/$NAME.$extension" "$VERIFY_DIR/$NAME.$extension"
done

# La carpeta fuente contiene sólo ciphertext y su checksum. --immutable evita
# sobrescribir un objeto remoto anterior con el mismo nombre; check --download
# lee los bytes remotos aun si el backend no ofrece hashes. --one-way permite
# otros respaldos históricos en el destino.
DEST="${RCLONE_REMOTE}/$(date -u +%Y/%m)"
(
  # La herramienta de transporte sólo necesita su propia configuración y el
  # paquete cifrado; no recibe la conexión PostgreSQL ni la frase de cifrado.
  unset DATABASE_URL BACKUP_DATABASE_URL TEST_DATABASE_URL BACKUP_ENCRYPTION_PASSPHRASE PGPASSWORD
  rclone copy "$ENCRYPTED_DIR" "$DEST" --immutable
  rclone check "$ENCRYPTED_DIR" "$DEST" --download --one-way
)

# Conservar copia cifrada local sin sobrescribir. En este punto la subida ya
# pasó la comparación remota. El claro se elimina sólo después de ambos links.
ln -- "$ARCHIVE" "$BACKUP_DIR/$NAME.vbk"
ln -- "$ENCRYPTED_DIR/$NAME.vbk.sha256" "$BACKUP_DIR/$NAME.vbk.sha256"
# La marca se crea sólo tras verificar ambos bytes remotos y conservar ambos
# archivos locales. Es una constancia histórica, no una orden de borrado.
printf 'remote-byte-check OK %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BACKUP_DIR/$NAME.vbk.uploaded"
rm -- "$PENDING_DIR/$NAME.dump" "$PENDING_DIR/$NAME.dump.sha256" \
  "$PENDING_DIR/$NAME.contents" "$PENDING_DIR/$NAME.manifest.json"
rm -- "$VERIFY_DIR/$NAME.dump" "$VERIFY_DIR/$NAME.dump.sha256" \
  "$VERIFY_DIR/$NAME.contents" "$VERIFY_DIR/$NAME.manifest.json"
rmdir -- "$VERIFY_DIR"
rm -- "$ARCHIVE" "$ENCRYPTED_DIR/$NAME.vbk.sha256"
rmdir -- "$ENCRYPTED_DIR" "$PENDING_DIR"
PENDING_DIR=''

echo "== backup-cron OK: $NAME.vbk verificado y subido =="
