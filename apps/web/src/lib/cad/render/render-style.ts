/**
 * Estilo de trazo de una entidad nativa: lo que el lote instanciado necesita.
 *
 * Vive aparte del orquestador porque no es orquestación: es la traducción de lo
 * que el documento DECLARA —color, tipo de línea y grosor, cada uno con su
 * origen— a lo que la GPU consume: color empaquetado, medio grosor en píxeles y
 * una ranura de patrón.
 *
 * La HERENCIA no se resuelve aquí. `BYLAYER` y `BYBLOCK` son reglas del
 * formato, las aplican también el trazador y el escritor, y con la regla
 * escrita tres veces el plano se ve de una manera, se imprime de otra y se
 * devuelve de una tercera. Vive en `cad-effective-style.ts` y este módulo la
 * consume; lo único que añade es el mapeo a ranura y a píxeles.
 *
 * El `document` es OPCIONAL a propósito: hay llamadores que dibujan una entidad
 * suelta sin documento a mano. Sin él sólo se puede honrar lo EXPLÍCITO, que es
 * exactamente lo que este módulo hacía antes de que la herencia existiera.
 */
import {
  buildCadLinetypeSlots,
  cadLineweightHalfWidthPx,
  resolveCadEntityStyle,
  type CadStyleSource,
} from "../cad-effective-style";
import type { CadDocument } from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";
import type { CadLineStyle } from "./line-batch";

/** Color por defecto, el mismo que usaba la proyección anterior. */
export const CAD_RENDER_DEFAULT_COLOR = 0x60a5fa;
/** Medio grosor por defecto en píxeles: un trazo de 1 px. */
export const CAD_RENDER_DEFAULT_HALF_WIDTH_PX = 0.5;

export type CadRenderStyleSource = CadStyleSource & Pick<CadDocument, "styles">;

export function defaultCadRenderStyle(
  entity: CadNativeEntity,
  document?: CadRenderStyleSource,
): CadLineStyle {
  const value = entity.context?.presentation?.color?.value;
  const color =
    value && /^#[0-9a-f]{6}$/i.test(value)
      ? Number.parseInt(value.slice(1), 16)
      : CAD_RENDER_DEFAULT_COLOR;
  if (!document) {
    // Sin documento no hay de quién heredar. Se honra lo explícito y nada más:
    // adivinar una capa que no se puede leer produciría un trazo que cambia al
    // pasar por otro camino de dibujo, y eso no se diagnostica nunca.
    const weight = entity.context?.presentation?.lineweight;
    return {
      color,
      halfWidthPx:
        weight?.source === "explicit" && typeof weight.value === "number"
          ? cadLineweightHalfWidthPx(weight.value)
          : CAD_RENDER_DEFAULT_HALF_WIDTH_PX,
      linetypeIndex: 0,
      layer: entity.layer,
    };
  }
  const resolved = resolveCadEntityStyle(entity, document);
  return {
    color,
    // El lineweight canónico va en centésimas de milímetro, como en DXF.
    halfWidthPx: cadLineweightHalfWidthPx(resolved.lineweight),
    linetypeIndex: buildCadLinetypeSlots(document).slots.get(resolved.linetype.toUpperCase()) ?? 0,
    layer: entity.layer,
  };
}
