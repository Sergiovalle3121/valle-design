import type { CadLayerDef } from "./cad-document";

/** CLAYER accepts a display name; entity.layer must store the persistent id. */
export function resolveCadLayerId(
  layers: readonly Pick<CadLayerDef, "id" | "name">[],
  value: string,
): string | undefined {
  const key = value.trim();
  if (!key) return undefined;
  return (
    layers.find((layer) => layer.id === key) ??
    layers.find((layer) => layer.name.toUpperCase() === key.toUpperCase())
  )?.id;
}
