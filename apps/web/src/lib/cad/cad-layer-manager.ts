import { commitChange, type CadDocument, type CadLayerDef } from './cad-document';

const INVALID_LAYER_NAME = /[<>/\\":;?*|=`,]/;

export function cadLayerIdFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 96 || INVALID_LAYER_NAME.test(trimmed))
    throw new Error('Layer name must contain 1–96 valid DXF characters.');
  return trimmed.replace(/\s+/g, '_');
}

function assertColor(color: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Layer color must be a six-digit hex color.');
  return color.toLowerCase();
}

export function createCadDocumentLayer(
  document: CadDocument,
  input: { name: string; color: string; linetype?: string; lineweight?: number; plot?: boolean },
): CadDocument {
  const existingLayers = document.layers.length ? document.layers : [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false, linetype: 'CONTINUOUS', lineweight: -1, plot: true } satisfies CadLayerDef];
  const id = cadLayerIdFromName(input.name);
  if (existingLayers.some((layer) => layer.id.toLocaleLowerCase() === id.toLocaleLowerCase() || layer.name.toLocaleLowerCase() === input.name.trim().toLocaleLowerCase()))
    throw new Error(`Layer ${input.name.trim()} already exists.`);
  const layer: CadLayerDef = {
    id,
    name: input.name.trim(),
    color: assertColor(input.color),
    visible: true,
    locked: false,
    linetype: input.linetype?.trim() || 'CONTINUOUS',
    lineweight: Number.isFinite(input.lineweight) ? input.lineweight : -1,
    plot: input.plot ?? true,
  };
  return commitChange({ ...document, layers: [...existingLayers, layer].sort((a, b) => a.id.localeCompare(b.id)) }, `layer:create:${id}`);
}

export function updateCadDocumentLayer(
  document: CadDocument,
  id: string,
  patch: Partial<Omit<CadLayerDef, 'id'>>,
): CadDocument {
  const current = document.layers.find((layer) => layer.id === id);
  if (!current) throw new Error(`Layer ${id} was not found.`);
  const name = patch.name === undefined ? current.name : patch.name.trim();
  if (!name || name.length > 96 || INVALID_LAYER_NAME.test(name)) throw new Error('Layer name must contain 1–96 valid DXF characters.');
  if (document.layers.some((layer) => layer.id !== id && layer.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
    throw new Error(`Layer ${name} already exists.`);
  const next: CadLayerDef = {
    ...current,
    ...patch,
    name,
    color: patch.color === undefined ? current.color : assertColor(patch.color),
    ...(patch.linetype !== undefined ? { linetype: patch.linetype.trim() || 'CONTINUOUS' } : {}),
  };
  if (JSON.stringify(next) === JSON.stringify(current)) return document;
  return commitChange({ ...document, layers: document.layers.map((layer) => layer.id === id ? next : layer) }, `layer:update:${id}`);
}

export function deleteCadDocumentLayer(document: CadDocument, id: string, reassignTo: string): CadDocument {
  if (id === '0') throw new Error('Layer 0 cannot be deleted.');
  if (id === reassignTo) throw new Error('Choose a different reassignment layer.');
  if (!document.layers.some((layer) => layer.id === id)) throw new Error(`Layer ${id} was not found.`);
  if (!document.layers.some((layer) => layer.id === reassignTo)) throw new Error(`Reassignment layer ${reassignTo} was not found.`);
  const remap = <T extends { layer: string }>(entity: T): T => entity.layer === id ? { ...entity, layer: reassignTo } : entity;
  return commitChange({
    ...document,
    layers: document.layers.filter((layer) => layer.id !== id),
    entities: document.entities.map(remap),
    blocks: document.blocks.map((block) => ({ ...block, entities: block.entities.map(remap) })),
    paperSpaces: document.paperSpaces.map((space) => ({
      ...space,
      viewports: space.viewports?.map((viewport) => {
        const layerVisibility = viewport.layerVisibility ? { ...viewport.layerVisibility } : undefined;
        const layerOverrides = viewport.layerOverrides ? { ...viewport.layerOverrides } : undefined;
        if (layerVisibility && id in layerVisibility) {
          if (!(reassignTo in layerVisibility)) layerVisibility[reassignTo] = layerVisibility[id];
          delete layerVisibility[id];
        }
        if (layerOverrides && id in layerOverrides) {
          if (!(reassignTo in layerOverrides)) layerOverrides[reassignTo] = layerOverrides[id];
          delete layerOverrides[id];
        }
        return { ...viewport, layerVisibility, layerOverrides };
      }),
    })),
  }, `layer:delete:${id}:reassign:${reassignTo}`);
}
