#!/usr/bin/env bash
# Synthetic process doubles: no database, Railway account or real rclone needed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_NODE="$(command -v node)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/valle-backup-cron-test.XXXXXXXX")"
TMP_ROOT="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
case "$(cd "$TEST_ROOT" && pwd -P)" in
  "$TMP_ROOT"/valle-backup-cron-test.*) ;;
  *) echo 'Directorio temporal fuera del área esperada.' >&2; exit 1 ;;
esac
trap 'rm -rf -- "$TEST_ROOT"' EXIT
mkdir -p "$TEST_ROOT/bin" "$TEST_ROOT/remote"

cat > "$TEST_ROOT/bin/node" <<'MOCK_NODE'
#!/usr/bin/env bash
set -euo pipefail
script="$1"; shift
case "$script" in
  */backup-envelope.mjs)
    if [ "${MOCK_NODE_MODE:-}" = tamper ] && [ "$1" = pack ]; then
      "$REAL_NODE" "$script" "$@"
      printf 'x' | dd of="$4" bs=1 count=1 conv=notrunc status=none
    else
      exec "$REAL_NODE" "$script" "$@"
    fi
    ;;
  */backup.mjs)
    [ "$1" = '--out' ] && [ "$3" = '--name' ]
    mkdir -p "$2"
    for ext in dump dump.sha256 contents manifest.json; do
      printf 'fixture %s\n' "$ext" > "$2/$4.$ext"
    done
    ;;
  */restore-verify.mjs)
    [ "$1" = '--dump' ] && [ -s "$2" ]
    [ "${MOCK_NODE_MODE:-}" != restore-fail ]
    ;;
  *) echo "Nodo inesperado: $script" >&2; exit 1 ;;
esac
MOCK_NODE
cat > "$TEST_ROOT/bin/rclone" <<'MOCK_RCLONE'
#!/usr/bin/env bash
set -euo pipefail
command="$1"; source="$2"; dest="$3"
case "$dest" in test:*) dest="$MOCK_REMOTE_ROOT/${dest#test:}" ;; *) exit 44 ;; esac
case "$command" in
  copy)
    [ "$4" = '--immutable' ]
    # The source of every transfer must contain ciphertext and checksum only.
    [ "$(find "$source" -maxdepth 1 -type f | wc -l | tr -d ' ')" = 2 ]
    for file in "$source"/*; do
      case "$file" in *.vbk|*.vbk.sha256) ;; *) exit 41 ;; esac
    done
    mkdir -p "$dest"
    if [ "${MOCK_RCLONE_MODE:-}" = copy-fail ]; then
      cp "$source"/*.vbk "$dest/"
      exit 42
    fi
    cp "$source"/* "$dest/"
    ;;
  check)
    [ "$4" = '--download' ] && [ "$5" = '--one-way' ]
    [ "${MOCK_RCLONE_MODE:-}" != check-fail ] || exit 43
    for file in "$source"/*; do cmp -s "$file" "$dest/$(basename "$file")"; done
    ;;
  *) echo "rclone inesperado: $command" >&2; exit 1 ;;
esac
MOCK_RCLONE
chmod +x "$TEST_ROOT/bin/node" "$TEST_ROOT/bin/rclone"

export PATH="$TEST_ROOT/bin:$PATH" REAL_NODE
export DATABASE_URL='postgres://fixture:secret@localhost:5432/fixture'
export BACKUP_ENCRYPTION_PASSPHRASE='frase-sintetica-para-prueba-cron-123456'
export RCLONE_REMOTE='test:bucket' MOCK_REMOTE_ROOT="$TEST_ROOT/remote"
export BACKUP_RETENTION_DAYS=14

fail() {
  echo "FAIL: $*" >&2
  if [ -f "$TEST_ROOT/cron.log" ]; then cat "$TEST_ROOT/cron.log" >&2; fi
  exit 1
}
assert_no_new_root_files() {
  [ "$(find "$BACKUP_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ')" = 3 ] || fail 'Se creó un archivo raíz tras fallar.'
}
assert_preserved() {
  [ "$(cat "$BACKUP_DIR/valle-design-old.vbk")" = 'previous encrypted' ] || fail 'Se alteró el respaldo anterior.'
  [ "$(cat "$BACKUP_DIR/valle-design-old.vbk.sha256")" = 'previous checksum' ] || fail 'Se alteró el hash anterior.'
  [ "$(cat "$BACKUP_DIR/previous.dump")" = 'previous clear' ] || fail 'Se alteró el respaldo claro anterior.'
}
case_root() {
  export BACKUP_DIR="$TEST_ROOT/$1"
  mkdir -p "$BACKUP_DIR"
  printf 'previous encrypted\n' > "$BACKUP_DIR/valle-design-old.vbk"
  printf 'previous checksum\n' > "$BACKUP_DIR/valle-design-old.vbk.sha256"
  printf 'previous clear\n' > "$BACKUP_DIR/previous.dump"
  touch -d '40 days ago' "$BACKUP_DIR/valle-design-old.vbk" "$BACKUP_DIR/valle-design-old.vbk.sha256"
}
run_cron() { bash "$SCRIPT_DIR/backup-cron.sh" > "$TEST_ROOT/cron.log" 2>&1; }

case_root no-key
unset BACKUP_ENCRYPTION_PASSPHRASE
if run_cron; then fail 'Aceptó la ausencia de clave.'; fi
assert_no_new_root_files; assert_preserved
export BACKUP_ENCRYPTION_PASSPHRASE='frase-sintetica-para-prueba-cron-123456'

case_root no-remote
unset RCLONE_REMOTE
if run_cron; then fail 'Aceptó la ausencia de destino externo.'; fi
assert_no_new_root_files; assert_preserved
export RCLONE_REMOTE='test:bucket'

case_root inline-credentials
export RCLONE_REMOTE='test,pass=synthetic:bucket'
if run_cron; then fail 'Aceptó credenciales embebidas en el argumento remoto.'; fi
assert_no_new_root_files; assert_preserved
export RCLONE_REMOTE='test:bucket'

for mode in copy-fail check-fail; do
  case_root "$mode"
  export MOCK_RCLONE_MODE="$mode"
  if run_cron; then fail "Aceptó el fallo de $mode."; fi
  assert_no_new_root_files; assert_preserved
  [ -n "$(find "$BACKUP_DIR" -mindepth 2 -name '*.dump' -print -quit)" ] || fail "No conservó el claro en $mode."
done
unset MOCK_RCLONE_MODE

for mode in restore-fail tamper; do
  case_root "$mode"
  export MOCK_NODE_MODE="$mode"
  if run_cron; then fail "Aceptó el fallo de $mode."; fi
  assert_no_new_root_files; assert_preserved
  [ -n "$(find "$BACKUP_DIR" -mindepth 2 -name '*.dump' -print -quit)" ] || fail "No conservó el claro en $mode."
done
unset MOCK_NODE_MODE

case_root success
run_cron || { cat "$TEST_ROOT/cron.log" >&2; fail 'Falló la pasada sintética correcta.'; }
assert_preserved
[ "$(find "$BACKUP_DIR" -maxdepth 1 -name '*.vbk' | wc -l | tr -d ' ')" = 2 ] || fail 'Falta el archivo cifrado local.'
[ "$(find "$BACKUP_DIR" -mindepth 2 -name '*.dump' | wc -l | tr -d ' ')" = 0 ] || fail 'Quedó el claro tras subida confirmada.'
new_archive="$(find "$BACKUP_DIR" -maxdepth 1 -name '*.vbk' ! -name '*old*' -print -quit)"
[ -n "$new_archive" ] || fail 'Falta el archivo nuevo.'
[ -f "$new_archive.uploaded" ] || fail 'Falta la marca de subida comprobada.'
remote_archive="$(find "$TEST_ROOT/remote" -name "$(basename "$new_archive")" -print -quit)"
cmp -s "$new_archive" "$remote_archive" || fail 'Los bytes remotos difieren.'
if find "$TEST_ROOT/remote" -type f ! -name '*.vbk' ! -name '*.vbk.sha256' | grep -q .; then
  fail 'Se transfirió material sin cifrar.'
fi
if grep -Fq 'frase-sintetica-para-prueba-cron-123456' "$TEST_ROOT/cron.log"; then
  fail 'La frase secreta apareció en el log.'
fi

# Rotación: sólo un paquete con marca y edad suficiente puede desaparecer.
touch -d '40 days ago' "$new_archive" "$new_archive.sha256" "$new_archive.uploaded"
run_cron || { cat "$TEST_ROOT/cron.log" >&2; fail 'Falló la segunda pasada correcta.'; }
assert_preserved
[ ! -e "$new_archive" ] && [ ! -e "$new_archive.sha256" ] && [ ! -e "$new_archive.uploaded" ] || fail 'No rotó el paquete ya confirmado.'
[ "$(find "$BACKUP_DIR" -maxdepth 1 -name '*.vbk' | wc -l | tr -d ' ')" = 2 ] || fail 'Rotó un respaldo viejo sin marca.'
echo 'backup-cron.spec.sh: 9 escenarios PASS (preflight, restore/auth/copy/check fallidos, éxito cifrado y rotación con marca).'
