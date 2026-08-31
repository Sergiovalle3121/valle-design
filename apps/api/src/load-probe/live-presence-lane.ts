/**
 * CARRIL de presencia EN VIVO (colaboración por servidor).
 *
 * Vive en su propio módulo — no inline en `review-concurrency.main.ts` — a
 * propósito: ese archivo está en `scripts/cad/monolith-budget.json` con
 * asignación de sólo-encoger (887 líneas), y sumarle un carril nuevo ahí
 * habría violado ese presupuesto. `review-concurrency.main.ts` y
 * `live-presence.main.ts` importan `runLivePresenceLane` desde aquí en vez
 * de duplicarla.
 *
 * Mide dos cosas sobre la aplicación REAL por HTTP (mismos actores, misma
 * app, mismo documento que el resto de un probe):
 *
 *  · `connectMs`/`firstEventMs`: cuánto tarda en abrir el stream SSE
 *    (`GET .../presence/stream`) y en recibir el primer evento (el snapshot
 *    inicial, que puede llegar vacío antes de que el publicador emita nada).
 *  · `cursorLatencyMs`: de cada latido publicado (`POST .../presence`) al
 *    momento en que el OYENTE lo recibe por su propio stream — el `seq` va
 *    codificado en `cursor.x` para emparejar envío/recepción sin depender del
 *    reloj de la aplicación, sólo del propio `performance.now()` del probe.
 *
 * NO mide la caducidad por TTL (doce segundos reales alargarían el probe sin
 * aportar nada que `cad-presencia-viva.spec.ts` no pruebe ya con dos
 * navegadores de verdad) — se declara en el reporte, no se esconde.
 */
import { randomUUID } from 'node:crypto';
import { round, summarize, type LatencyStats } from './load-driver';
import {
  apiCall,
  LoadProbeSetupError,
  type IntegratorSession,
} from './integrator-session';

export interface LivePresenceLaneResult {
  connectMs: number;
  firstEventMs: number | null;
  cursorLatencyMs: LatencyStats;
  beatsSent: number;
  beatsReceived: number;
  ttlMeasured: false;
}

export async function runLivePresenceLane(options: {
  documentId: string;
  publisher: IntegratorSession;
  listener: IntegratorSession;
  beatCount?: number;
  intervalMs?: number;
}): Promise<LivePresenceLaneResult> {
  const {
    documentId,
    publisher,
    listener,
    beatCount = 20,
    intervalMs = 200,
  } = options;
  // `apiCall` toma el `baseUrl` de CADA sesión (`IntegratorSession.baseUrl`),
  // no de un parámetro aparte — publisher/listener ya lo llevan.
  const streamPath = `/v1/cad/documents/${documentId}/presence/stream`;

  const connectStarted = performance.now();
  const response = await apiCall(listener, streamPath);
  if (response.status !== 200 || !response.body) {
    throw new LoadProbeSetupError(
      `Stream de presencia respondió ${response.status}, se esperaba 200 con cuerpo.`,
    );
  }
  const connectMs = performance.now() - connectStarted;

  const received = new Map<number, number>();
  let firstEventAt: number | null = null;
  const publisherPeerId = `probe-publisher-${randomUUID().slice(0, 8)}`;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const dataLine = raw
          .split('\n')
          .find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        if (firstEventAt === null) firstEventAt = performance.now();
        let parsed: unknown;
        try {
          parsed = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue;
        }
        const beat = parsed as {
          peerId?: unknown;
          cursor?: { x?: unknown } | null;
        };
        if (
          typeof beat.peerId === 'string' &&
          beat.peerId === publisherPeerId &&
          beat.cursor &&
          typeof beat.cursor.x === 'number'
        ) {
          const seq = Math.round(beat.cursor.x);
          if (!received.has(seq)) received.set(seq, performance.now());
        }
      }
    }
  })();

  const sentAt = new Map<number, number>();
  for (let seq = 0; seq < beatCount; seq += 1) {
    const began = performance.now();
    await apiCall(publisher, `/v1/cad/documents/${documentId}/presence`, {
      method: 'POST',
      body: {
        peerId: publisherPeerId,
        cursor: { x: seq, y: 0 },
        viewport: null,
      },
    });
    sentAt.set(seq, began);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  // Margen para que los últimos latidos terminen de llegar antes de cerrar.
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  await reader.cancel().catch(() => undefined);
  await pump.catch(() => undefined);

  const latencies: number[] = [];
  for (const [seq, sentMs] of sentAt) {
    const receivedMs = received.get(seq);
    if (receivedMs !== undefined) latencies.push(receivedMs - sentMs);
  }

  return {
    connectMs: round(connectMs),
    firstEventMs:
      firstEventAt === null ? null : round(firstEventAt - connectStarted),
    cursorLatencyMs: summarize(latencies),
    beatsSent: beatCount,
    beatsReceived: received.size,
    ttlMeasured: false,
  };
}
