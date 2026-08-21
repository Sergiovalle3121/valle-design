#!/usr/bin/env node
/**
 * REPLAY AUDITADO DE FILAS `dead` DEL OUTBOX.
 *
 * Es la herramienta que el RUNBOOK promete para INC-2: las filas `dead` NO se
 * reintentan solas (deliberado — ocho intentos fallidos son un diagnóstico,
 * no mala suerte), y editarlas a mano con UPDATE suelto no deja rastro de qué
 * se tocó ni por qué. Este script hace UNA cosa: devolver filas `dead`
 * concretas a `pending` con el contador a cero, e imprimir un JSON auditable
 * de exactamente lo que tocó, para pegarlo en el informe del incidente.
 *
 * POR QUÉ ES SEGURO REINYECTAR: la entrega del outbox es at-least-once y el
 * RECEPTOR deduplica de forma durable por `Idempotency-Key` — el receptor de
 * esta misma API con el único de `webhook_receipts.idempotency_key`, y el
 * proveedor de correo con la Idempotency-Key nativa que viaja en cada envío.
 * Reinyectar una fila cuyo efecto ya ocurrió produce un 200 sin efecto nuevo,
 * no un correo duplicado. Lo que NO hace este script — y no debe hacer nadie —
 * es cambiar la clave de idempotencia o marcar filas `sent` a mano: eso sí
 * rompe la garantía en ambos sentidos.
 *
 * El orden correcto sigue siendo el del RUNBOOK: primero corregir la CAUSA
 * (receptor caído, secreto rotado a medias, URL equivocada), después
 * reinyectar. Reinyectar contra un receptor roto sólo fabrica ocho fallos más.
 *
 * Uso:
 *   node scripts/ops/outbox-replay.mjs --queue email --id <uuid> [--dry-run]
 *   node scripts/ops/outbox-replay.mjs --queue domain --all-dead [--dry-run]
 *   node scripts/ops/outbox-replay.mjs --help
 *
 * Flags:
 *   --queue email|domain  cola a tocar (obligatorio)
 *   --id <uuid>           UNA fila concreta (falla si no existe o no está dead)
 *   --all-dead            todas las filas dead de la cola
 *   --dry-run             muestra lo que tocaría, sin tocar nada
 *   --url postgres://...  conexión (o DATABASE_URL)
 *
 * El JSON de salida lista id, intentos, fechas y clase de error de cada fila
 * — nunca payloads ni destinatarios: el rastro del incidente no necesita PII.
 */
import {
  parseArgs,
  query,
  redactUrl,
  requireDatabaseUrl,
  resolveBinary,
} from './pg-tools.mjs';

const USAGE = `Replay auditado de filas dead del outbox.

Uso:
  node scripts/ops/outbox-replay.mjs --queue email --id <uuid> [--dry-run]
  node scripts/ops/outbox-replay.mjs --queue domain --all-dead [--dry-run]

Flags:
  --queue email|domain   cola a tocar (obligatorio)
  --id <uuid>            una fila concreta; falla si no existe o no esta dead
  --all-dead             todas las filas dead de la cola
  --dry-run              imprime lo que tocaria, sin tocar nada
  --url postgres://...   conexion (tambien vale DATABASE_URL)

Antes de reinyectar, corrige la CAUSA (RUNBOOK.md INC-2). Reinyectar es
seguro porque el receptor deduplica por Idempotency-Key; cambiar claves o
marcar filas sent a mano NO lo es.`;

const TABLES = { email: 'email_outbox', domain: 'domain_outbox' };
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

function fail(message) {
  console.error(message);
  console.error('');
  console.error(USAGE);
  process.exit(1);
}

const queue = typeof args.queue === 'string' ? args.queue : null;
if (!queue || !(queue in TABLES)) {
  fail('Falta --queue email|domain.');
}
const table = TABLES[queue];

const id = typeof args.id === 'string' ? args.id : null;
const allDead = args['all-dead'] === true;
if (!id && !allDead) {
  fail('Indica QUÉ reinyectar: --id <uuid> o --all-dead.');
}
if (id && allDead) {
  fail('--id y --all-dead son excluyentes: o una fila, o todas.');
}
if (id && !UUID_RE.test(id)) {
  // Validación estricta ANTES de tocar SQL: el id se interpola como literal.
  fail(`--id no es un UUID válido: ${id}`);
}
const dryRun = args['dry-run'] === true;

const url = requireDatabaseUrl(typeof args.url === 'string' ? args.url : null);
const psql = resolveBinary('psql');

// Las columnas del informe: qué fila, cuántas veces falló, cuándo y con qué
// CLASE de error (last_error ya viene redactado por el dispatcher). Nunca
// payload, recipient ni idempotency key completa.
const REPORT_COLUMNS = `
  json_build_object(
    'id', o.id,
    'estadoPrevio', o.status,
    'intentos', o.attempt_count,
    'creadaEn', to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'falloEn', to_char(o.failed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'ultimoError', left(o.last_error, 200)
  )`;

const filter = id
  ? `o.status = 'dead' AND o.id = '${id}'`
  : `o.status = 'dead'`;

// La rama real captura el estado PREVIO en una CTE antes del UPDATE:
// `RETURNING` vería la fila ya puesta a cero, y un informe que dice
// «intentos: 0» no documenta nada. `last_error` NO se borra a propósito: es
// el diagnóstico del incidente y sólo lo sobreescribirá un fallo nuevo.
const sql = dryRun
  ? `SELECT COALESCE(json_agg(${REPORT_COLUMNS} ORDER BY o.created_at), '[]'::json)
     FROM ${table} AS o WHERE ${filter}`
  : `WITH objetivo AS (
       SELECT o.id, o.status, o.attempt_count, o.created_at, o.failed_at,
              o.last_error
         FROM ${table} AS o
        WHERE ${filter}
          FOR UPDATE
     ), tocadas AS (
       UPDATE ${table} AS t
          SET status = 'pending',
              attempt_count = 0,
              available_at = now(),
              locked_at = NULL,
              lock_owner = NULL,
              failed_at = NULL
         FROM objetivo
        WHERE t.id = objetivo.id
    RETURNING t.id
     )
     SELECT COALESCE(json_agg(${REPORT_COLUMNS} ORDER BY o.created_at), '[]'::json)
     FROM objetivo AS o
     JOIN tocadas ON tocadas.id = o.id`;

const [[raw]] = query(psql.path, url, sql.replace(/\s+/g, ' ').trim());
const rows = JSON.parse(raw);

const report = {
  herramienta: 'outbox-replay',
  ejecutadoEn: new Date().toISOString(),
  base: redactUrl(url),
  cola: queue,
  modo: dryRun ? 'dry-run (nada tocado)' : 'replay (filas devueltas a pending)',
  seleccion: id ? `id=${id}` : 'all-dead',
  filas: rows,
  total: rows.length,
};
console.log(JSON.stringify(report, null, 2));

if (id && rows.length === 0) {
  console.error('');
  console.error(
    `La fila ${id} no existe en ${table} o no está en estado dead. ` +
      'Nada se tocó: este script sólo reinyecta filas dead.',
  );
  process.exit(1);
}

if (!dryRun && rows.length > 0) {
  console.error('');
  console.error(
    `${rows.length} fila(s) devueltas a pending con attempt_count=0. ` +
      'El worker las tomará en su próximo lote; vigila que el backlog baja:',
  );
  console.error(
    `  curl -sS -H "Authorization: Bearer $METRICS_TOKEN" $API/health/metrics/commercial | jq '.outbox.${queue}'`,
  );
}
