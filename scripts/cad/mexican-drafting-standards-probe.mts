/**
 * Sonda de las normas de dibujo mexicano: vuelca el artefacto a stdout.
 *
 * No mide nada. Su único trabajo es cruzar la frontera entre TypeScript —donde
 * viven las tablas que usa el producto— y el guion de publicación, que es Node
 * a secas. El reparto es el mismo que el de las demás sondas del repositorio, y
 * por la misma razón: aquí no se decide NADA. Todo lo que sale por stdout lo
 * decide el código del producto, de modo que el artefacto no puede decir una
 * cosa mientras la aplicación hace otra.
 */
import { buildCadMexicanDraftingEvidence } from "../../apps/web/src/lib/cad/standards/mexican-drafting-evidence";

process.stdout.write(`${JSON.stringify(buildCadMexicanDraftingEvidence(), null, 2)}\n`);
