#!/usr/bin/env node
/**
 * CHEQUEO DE ALERTAS CONTRA /metrics — el monitoreo mínimo que convierte los
 * umbrales de SLA.md §4 en un aviso real.
 *
 * Sin Prometheus ni Grafana desplegados, los umbrales del SLA eran números en
 * un documento: nadie los estaba midiendo, y el propio SLA §6 dice que un
 * despliegue que no mide no puede acogerse a los objetivos. Este script es el
 * instrumento más pequeño que los mide de verdad: descarga `/metrics` una
 * vez, evalúa los umbrales y SALE con código ≠0 si algo está mal. Quien lo
 * ejecuta cada 15 minutos (`.github/workflows/monitor.yml`) convierte ese
 * código de salida en un correo al dueño — el workflow rojo ES la alerta.
 *
 * Qué evalúa, y de dónde sale cada número (SLA.md §4, «Umbrales de alerta»):
 *   · `valle_outbox_oldest_pending_age_seconds{queue} > 900` → Sev-2: el
 *     outbox lleva >15 min sin drenar; los correos de verificación no llegan.
 *   · `valle_outbox_backlog{queue,status="dead"} > 0`        → filas muertas:
 *     ocho intentos fallidos; exigen diagnóstico humano (RUNBOOK INC-2).
 *   · El endpoint no responde / no autentica / no trae las series → FALLO:
 *     un monitoreo que no puede medir no informa «todo bien», informa «no sé»,
 *     y «no sé» del estado de producción es una alerta.
 *
 * Variables: MONITOR_METRICS_URL (https://api.../metrics) y
 * MONITOR_METRICS_TOKEN (el METRICS_TOKEN del despliegue).
 *
 * Imprime un JSON con el veredicto y cada medición — apto para pegar en el
 * incidente. Nunca imprime el token.
 */

const URL_ENV = 'MONITOR_METRICS_URL';
const TOKEN_ENV = 'MONITOR_METRICS_TOKEN';

/** Umbrales de SLA.md §4 (los mismos números, no una copia que derive). */
const MAX_OLDEST_PENDING_AGE_SECONDS = 900;
const MAX_DEAD_ROWS = 0;
const FETCH_TIMEOUT_MS = 30_000;

const metricsUrl = process.env[URL_ENV];
const token = process.env[TOKEN_ENV];

if (!metricsUrl || !token) {
  console.error(
    `Faltan ${!metricsUrl ? URL_ENV : ''}${!metricsUrl && !token ? ' y ' : ''}${!token ? TOKEN_ENV : ''}. ` +
      'Este script exige ambos: sin URL no hay qué medir y sin token /metrics responde 404. ' +
      'El workflow monitor.yml decide ANTES de llamar aquí si el monitoreo está configurado.',
  );
  process.exit(2);
}

/**
 * Parser mínimo del formato de exposición de Prometheus: sólo lo que este
 * chequeo necesita (gauges con etiquetas), sin dependencia nueva.
 */
function parseSeries(body) {
  const series = new Map();
  for (const line of body.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(-?[\d.eE+]+|NaN)\s*$/.exec(
      line,
    );
    if (!match) continue;
    const labels = {};
    if (match[2]) {
      for (const pair of match[2].slice(1, -1).matchAll(
        /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g,
      )) {
        labels[pair[1]] = pair[2].replace(/\\(["\\n])/g, (_, c) =>
          c === 'n' ? '\n' : c,
        );
      }
    }
    const list = series.get(match[1]) ?? [];
    list.push({ labels, value: Number(match[3]) });
    series.set(match[1], list);
  }
  return series;
}

function verdict(ok, checks, note) {
  const report = {
    herramienta: 'check-alerts',
    ejecutadoEn: new Date().toISOString(),
    endpoint: metricsUrl,
    veredicto: ok ? 'SANO' : 'ALERTA',
    ...(note ? { motivo: note } : {}),
    mediciones: checks,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(ok ? 0 : 1);
}

let body;
try {
  const response = await fetch(metricsUrl, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'error',
  });
  if (!response.ok) {
    // 404 = METRICS_TOKEN sin configurar en el API (o token equivocado: el
    // endpoint responde 404 también a un Bearer inválido, a propósito).
    verdict(false, [], `El endpoint respondió ${response.status}: sin métricas no hay monitoreo.`);
  }
  body = await response.text();
} catch (error) {
  verdict(
    false,
    [],
    `No se pudo consultar /metrics (${error?.name ?? 'Error'}): un monitoreo que no puede medir es una alerta, no un «todo bien».`,
  );
}

const series = parseSeries(body);
const ages = series.get('valle_outbox_oldest_pending_age_seconds') ?? [];
const backlog = series.get('valle_outbox_backlog') ?? [];

const checks = [];
let healthy = true;

// El exportador publica SIEMPRE la serie de edad (0 cuando la cola está
// vacía). Su ausencia no es una cola sana: es un exportador que no es el
// esperado, y eso también es una alerta.
if (ages.length === 0) {
  healthy = false;
  checks.push({
    chequeo: 'outbox_oldest_pending_age_seconds',
    resultado: 'ALERTA',
    detalle: 'La serie no aparece en la respuesta: ¿es este el /metrics del API?',
  });
}
for (const { labels, value } of ages) {
  const over = value > MAX_OLDEST_PENDING_AGE_SECONDS;
  if (over) healthy = false;
  checks.push({
    chequeo: 'outbox_oldest_pending_age_seconds',
    cola: labels.queue ?? '(sin etiqueta)',
    valor: value,
    umbral: MAX_OLDEST_PENDING_AGE_SECONDS,
    resultado: over ? 'ALERTA: el outbox lleva >15 min sin drenar (RUNBOOK INC-2)' : 'ok',
  });
}

const deadRows = backlog.filter((row) => row.labels.status === 'dead');
for (const { labels, value } of deadRows) {
  const over = value > MAX_DEAD_ROWS;
  if (over) healthy = false;
  checks.push({
    chequeo: 'outbox_backlog_dead',
    cola: labels.queue ?? '(sin etiqueta)',
    valor: value,
    umbral: MAX_DEAD_ROWS,
    resultado: over
      ? 'ALERTA: filas dead — diagnóstico humano y replay auditado (RUNBOOK INC-2)'
      : 'ok',
  });
}
if (deadRows.length === 0) {
  // Las series de backlog sólo existen para los estados presentes; cero filas
  // dead legítimamente no emite serie. Se deja constancia de que se miró.
  checks.push({
    chequeo: 'outbox_backlog_dead',
    valor: 0,
    umbral: MAX_DEAD_ROWS,
    resultado: 'ok (sin filas dead reportadas)',
  });
}

verdict(healthy, checks);
