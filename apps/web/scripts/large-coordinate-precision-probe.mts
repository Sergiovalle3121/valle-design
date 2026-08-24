#!/usr/bin/env node
/**
 * Genera la evidencia de precisión con coordenadas GRANDES (orden UTM,
 * ~10⁶–10⁷) en `docs/cad/evidence/large-coordinate-precision.json`.
 *
 * La medición vive en `src/lib/cad/render/large-coordinate-precision.ts` —
 * pura, sin THREE, y compartida con el spec que la convierte en gate
 * (`large-coordinate-precision.spec.ts`). Este script sólo la corre y
 * escribe el resultado; duplicar la medición aquí sería exactamente el tipo
 * de desvío silencioso entre «lo que se prueba» y «lo que se documenta» que
 * el resto del pipeline de teselado ya evita con el mismo patrón (ver
 * `tessellate.worker.ts` y su reserva síncrona).
 */
import { writeFileSync } from "node:fs";
import { measureCadLargeCoordinatePrecisionSuite } from "../src/lib/cad/render/large-coordinate-precision";

const reports = measureCadLargeCoordinatePrecisionSuite();
const worst = reports[reports.length - 1]!;
const summary = {
  generatedBy: "apps/web/scripts/large-coordinate-precision-probe.mts",
  conclusion:
    worst.maxAbsErrorDrawingUnits <= 1e-3
      ? `CORREGIDO: con el origen flotante de escena, el error a magnitud 10⁷ baja a ${worst.maxAbsErrorDrawingUnits} unidades de dibujo (antes, 0,375). El documento y la exportación siguen sin perder nada (float64 de punta a punta).`
      : `SIN CORREGIR: a magnitud 10⁷ el camino de render sigue perdiendo hasta ${worst.maxAbsErrorDrawingUnits} unidades de dibujo por cuantización float32. El arreglo es el origen flotante de escena (backlog P0-2).`,
  reports,
};

const target = process.argv[2];
const json = JSON.stringify(summary, null, 2);
if (target) writeFileSync(target, `${json}\n`);
else process.stdout.write(`${json}\n`);
