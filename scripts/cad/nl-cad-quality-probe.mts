/**
 * Sonda del banco de calidad NL→CAD.
 *
 * Importa el corpus y el arnés REALES del producto —no una copia— y escupe por
 * stdout el JSON crudo de la corrida. Nada más: `scripts/cad/nl-cad-quality.mjs`
 * lo ejecuta con `tsx`, le añade la máquina declarada y escribe el artefacto.
 *
 * La separación existe porque el corpus vive en `apps/web/src` (es producto: lo
 * compila el mismo typecheck y lo ejercita la misma spec) y la orquestación vive
 * en `scripts/` (es herramienta). Un banco cuyo corpus viviera en `scripts/`
 * podría desviarse del producto sin que nada lo notara.
 */
import { runNlCadBenchmark, NL_CAD_BENCHMARK_ID } from "../../apps/web/src/lib/cad/nl-quality/index";

const run = runNlCadBenchmark();

process.stdout.write(
  JSON.stringify({
    benchmarkId: NL_CAD_BENCHMARK_ID,
    summary: run.summary,
    results: run.results,
  }),
);
