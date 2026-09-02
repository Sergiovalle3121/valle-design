import type { CadNativeEntity } from "./entity-runtime";

/**
 * DIMCLRT — el color del RÓTULO de la cota, que no tiene por qué ser el de sus
 * líneas.
 *
 * El rasterizador de texto lee el color de `context.presentation.color.value`,
 * que es la vía por la que este renderizador lee cualquier color. Así que
 * DIMCLRT se inyecta ahí y, si la cota no lo trae, se hereda el contexto de la
 * entidad tal cual: una cota vieja se pinta exactamente como ayer.
 */
export function cadDimensionTextContext(
  entity: Extract<CadNativeEntity, { type: "dimension" }>,
): CadNativeEntity["context"] {
  if (!entity.textColor) return entity.context;
  return {
    ...entity.context,
    presentation: {
      ...entity.context?.presentation,
      color: { source: "explicit", value: entity.textColor },
    },
  } as CadNativeEntity["context"];
}
