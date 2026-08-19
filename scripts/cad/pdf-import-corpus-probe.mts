/**
 * Sonda de la matriz del corpus de PDF.
 *
 * Imprime la matriz por stdout y nada más; `build-pdf-import-corpus.mjs` la
 * ejecuta con `tsx` y la vuelca al artefacto. Existe por la misma razón que la
 * sonda del corpus de DXF: la medición usa el importador REAL, que es TypeScript
 * dentro de `apps/web`, y un `.mjs` no lo puede importar directamente.
 */
import { buildCadPdfCorpusMatrix } from "../../apps/web/src/lib/cad/pdf/pdf-corpus-matrix";

process.stdout.write(JSON.stringify(buildCadPdfCorpusMatrix()));
