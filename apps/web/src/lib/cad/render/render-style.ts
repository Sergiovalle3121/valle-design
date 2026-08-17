/**
 * Estilo de trazo por defecto de una entidad nativa.
 *
 * Vive aparte del orquestador porque no es orquestación: es la traducción de lo
 * que el documento DECLARA —color de presentación, lineweight en centésimas de
 * milímetro— a lo que el lote instanciado necesita —color empaquetado y medio
 * grosor en píxeles—. El pipeline lo reexporta para que quien ya lo importaba de
 * allí no tenga que cambiar de sitio.
 */
import type { CadNativeEntity } from "../entity-runtime";
import type { CadLineStyle } from "./line-batch";

/** Color por defecto, el mismo que usaba la proyección anterior. */
export const CAD_RENDER_DEFAULT_COLOR = 0x60a5fa;
/** Medio grosor por defecto en píxeles: un trazo de 1 px. */
export const CAD_RENDER_DEFAULT_HALF_WIDTH_PX = 0.5;

export function defaultCadRenderStyle(entity: CadNativeEntity): CadLineStyle {
  const value = entity.context?.presentation?.color?.value;
  const color =
    value && /^#[0-9a-f]{6}$/i.test(value)
      ? Number.parseInt(value.slice(1), 16)
      : CAD_RENDER_DEFAULT_COLOR;
  const weight = entity.context?.presentation?.lineweight?.value;
  return {
    color,
    // El lineweight canónico va en centésimas de milímetro, como en DXF. Se
    // convierte a un medio grosor en píxeles con la regla de que 0,25 mm es un
    // trazo fino de 1 px: es una convención, pero explícita y en un solo sitio.
    halfWidthPx:
      typeof weight === "number" && weight > 0
        ? Math.max(CAD_RENDER_DEFAULT_HALF_WIDTH_PX, weight / 50)
        : CAD_RENDER_DEFAULT_HALF_WIDTH_PX,
    linetypeIndex: 0,
    layer: entity.layer,
  };
}
