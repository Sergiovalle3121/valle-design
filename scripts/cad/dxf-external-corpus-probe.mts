/**
 * Sonda de la matriz del corpus DXF externo.
 *
 * Imprime la matriz por stdout y nada más; `build-dxf-external-corpus.mjs` la
 * ejecuta con `tsx` y la vuelca al artefacto. Existe por la misma razón que la
 * sonda del registro de comandos: la medición usa el lector y el escritor
 * REALES, que son TypeScript dentro de `apps/web`, y un `.mjs` no los puede
 * importar directamente.
 */
import { buildCadDxfExternalCorpusMatrix } from "../../apps/web/src/lib/cad/dxf-external-corpus-matrix";

process.stdout.write(JSON.stringify(buildCadDxfExternalCorpusMatrix()));
