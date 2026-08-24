/**
 * Paleta de materiales nativos del MURO (esquema 6).
 *
 * `CadWallEntity.material` es OPCIONAL y de un conjunto FINITO y cerrado —no
 * un color libre ni una referencia a una biblioteca externa— por la misma
 * razón que `CadOpeningEntity.kind` es `"door" | "window"` y no una cadena
 * cualquiera: un id que no resuelve no debe poder cruzar la frontera del
 * servidor (ver `assertWallMaterial` en `cad-entity-invariants.ts`, que
 * repite este mismo conjunto sin importar este módulo — la API no depende
 * del cliente). Cinco acabados arquitectónicos comunes cubren el caso de uso
 * real (distinguir muros a simple vista en el visor 3D) sin inventar un
 * sistema de materiales PBR que nada más consume todavía.
 *
 * Un muro SIN `material` no es un muro sin acabado: es el gris genérico que
 * ya dibujaba `wall-solid-three.ts` antes de que este campo existiera
 * (`CAD_WALL_MATERIAL_DEFAULT.color` es ese mismo valor, a propósito, para
 * que ningún documento existente cambie de aspecto al abrirse).
 */

export type CadWallMaterialId =
  | "concrete"
  | "brick"
  | "drywall"
  | "wood"
  | "stucco";

export const CAD_WALL_MATERIAL_IDS: readonly CadWallMaterialId[] = [
  "concrete",
  "brick",
  "drywall",
  "wood",
  "stucco",
];

export interface CadWallMaterialStyle {
  readonly label: string;
  readonly color: number;
}

/** El gris de `wall-solid-three.ts` de antes de que `material` existiera. */
export const CAD_WALL_MATERIAL_DEFAULT: CadWallMaterialStyle = {
  label: "Genérico",
  color: 0xcbd5e1,
};

const CAD_WALL_MATERIAL_STYLES: Readonly<
  Record<CadWallMaterialId, CadWallMaterialStyle>
> = {
  concrete: { label: "Concreto", color: 0x9ca3af },
  brick: { label: "Ladrillo", color: 0xb45309 },
  drywall: { label: "Tablaroca", color: 0xe5e7eb },
  wood: { label: "Madera", color: 0x8a5a34 },
  stucco: { label: "Aplanado", color: 0xd6cfc4 },
};

export function isCadWallMaterialId(
  value: unknown,
): value is CadWallMaterialId {
  return (
    typeof value === "string" &&
    (CAD_WALL_MATERIAL_IDS as readonly string[]).includes(value)
  );
}

/** Estilo visual del material, o el genérico si no viene o no resuelve. */
export function cadWallMaterialStyle(
  material: string | undefined,
): CadWallMaterialStyle {
  if (isCadWallMaterialId(material)) return CAD_WALL_MATERIAL_STYLES[material];
  return CAD_WALL_MATERIAL_DEFAULT;
}
