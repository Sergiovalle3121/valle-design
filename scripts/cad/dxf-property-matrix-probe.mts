/**
 * Sonda de la matriz de PROPIEDADES DXF.
 *
 * Imprime la matriz por stdout y nada más; `build-dxf-property-matrix.mjs` la
 * ejecuta con `tsx` y la vuelca al artefacto. Misma razón que la sonda del
 * corpus externo: la medición usa el lector, el escritor y el estilo de trazo
 * REALES, que son TypeScript dentro de `apps/web`, y un `.mjs` no los importa.
 */
import { buildCadDxfPropertyMatrix } from "../../apps/web/src/lib/cad/dxf-property-matrix";

process.stdout.write(JSON.stringify(buildCadDxfPropertyMatrix()));
