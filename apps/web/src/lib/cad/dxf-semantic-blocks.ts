import type { CadEntityPresentation } from "./cad-document";
import {
  decodeComponent,
  insertSignature,
  type RawBlockXdata,
} from "./dxf-block-xdata";
import type {
  CadDxfBlockAttributeDefinition,
  CadDxfSemanticBlock,
  CadDxfSemanticInsert,
} from "./dxf-block-types";
import type {
  CadDxfImportWarning,
  CadDxfPrimitive,
} from "./dxf-import";
import { mapDxfEntityToPrimitive } from "./dxf-import";
import { dxfPropertyIndex } from "./dxf-read-properties";

const DEFAULT_LAYER = "0";

export function semanticInsert(
  entity: any,
  xdata: RawBlockXdata,
  presentation?: CadEntityPresentation,
): CadDxfSemanticInsert {
  const block = String(entity?.name ?? entity?.block ?? '');
  const x = Number(entity?.position?.x) || 0;
  const y = Number(entity?.position?.y) || 0;
  const rotation = Number(entity?.rotation) || 0;
  const queue = xdata.insertAttributes.get(insertSignature(block, x, y, rotation));
  const attributes = queue?.shift() ?? {};
  return {
    block,
    insertion: { x, y },
    scaleX: Number(entity?.xScale) || 1,
    scaleY: Number(entity?.yScale) || 1,
    rotation,
    layer: String(entity?.layer || DEFAULT_LAYER),
    attributes,
    ...(presentation ? { presentation } : {}),
    ...(entity?.inPaperSpace === true ? { paperSpace: true } : {}),
  };
}

export function semanticBlocks(
  parsedBlocks: Record<string, any>,
  xdata: RawBlockXdata,
  warnings: CadDxfImportWarning[],
  blockProperties: Record<string, ReturnType<typeof dxfPropertyIndex>>,
): CadDxfSemanticBlock[] {
  return Object.entries(parsedBlocks).filter(([name]) => !name.startsWith('*')).map(([name, raw]) => {
    const primitives: CadDxfPrimitive[] = [];
    const inserts: CadDxfSemanticInsert[] = [];
    const attributes: Record<string, CadDxfBlockAttributeDefinition> = {};
    // Ordinal POR TIPO dentro del bloque: el mismo criterio con el que se
    // sincroniza el recorrido crudo con lo que entrega el tokenizador.
    const ordinals = new Map<string, number>();
    const presentationAt = blockProperties[name];
    const nextPresentation = (type: string): CadEntityPresentation | undefined => {
      const ordinal = ordinals.get(type) ?? 0;
      ordinals.set(type, ordinal + 1);
      return presentationAt?.(type, ordinal);
    };
    for (const entity of Array.isArray(raw?.entities) ? raw.entities : []) {
      const type = String(entity?.type ?? '').toUpperCase();
      const presentation = nextPresentation(type);
      if (type === 'INSERT') { inserts.push(semanticInsert(entity, xdata, presentation)); continue; }
      if (type === 'ATTDEF') {
        const tag = String(entity?.tag ?? '').trim();
        if (tag) attributes[tag] = {
          defaultValue: String(entity?.text ?? ''), prompt: String(entity?.prompt ?? tag),
          ...(entity?.startPoint ? { position: { x: Number(entity.startPoint.x) || 0, y: Number(entity.startPoint.y) || 0 } } : {}),
          ...(Number(entity?.textHeight) > 0 ? { height: Number(entity.textHeight) } : {}),
          invisible: !!entity?.invisible, constant: !!entity?.constant,
        };
        continue;
      }
      const mapped = mapDxfEntityToPrimitive(entity);
      if (mapped.primitive)
        primitives.push(presentation ? { ...mapped.primitive, presentation } : mapped.primitive);
      if (mapped.warning) warnings.push(mapped.warning);
    }
    const metadata = xdata.definitions.get(name);
    const version = Number(metadata?.get('version'));
    const scope = metadata?.get('libraryScope');
    const libraryScope: CadDxfSemanticBlock['libraryScope'] = scope === 'tenant' || scope === 'document' ? scope : undefined;
    return {
      name,
      basePoint: { x: Number(raw?.position?.x) || 0, y: Number(raw?.position?.y) || 0 },
      primitives,
      inserts,
      attributes,
      ...(Number.isInteger(version) && version > 0 ? { version } : {}),
      ...(metadata?.has('description') ? { description: decodeComponent(metadata.get('description')) } : {}),
      ...(metadata?.has('keywords') ? { keywords: decodeComponent(metadata.get('keywords')).split('\n').filter(Boolean) } : {}),
      ...(libraryScope ? { libraryScope } : {}),
      ...(metadata?.has('libraryTenantId') && decodeComponent(metadata.get('libraryTenantId')) ? { libraryTenantId: decodeComponent(metadata.get('libraryTenantId')) } : {}),
      ...(metadata?.has('businessEntityType') && decodeComponent(metadata.get('businessEntityType')) ? { businessEntityType: decodeComponent(metadata.get('businessEntityType')) } : {}),
      ...(metadata?.has('businessEntityId') && decodeComponent(metadata.get('businessEntityId')) ? { businessEntityId: decodeComponent(metadata.get('businessEntityId')) } : {}),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
