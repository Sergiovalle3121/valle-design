import {
  commitChange,
  type CadBlockDefinition,
  type CadDocument,
  type CadEntity,
  type CadEntityContext,
  type CadPoint2,
  type CadPoint3,
} from './cad-document';

type CadInsert = Extract<CadEntity, { type: 'insert' }>;

export interface CadBlockDiagnostic {
  code: 'duplicate_block' | 'missing_block' | 'block_cycle' | 'block_depth' | 'missing_attribute';
  severity: 'warning' | 'error';
  block?: string;
  entityId?: string;
  detail: string;
}

export interface CadResolvedInsert {
  entities: CadEntity[];
  diagnostics: CadBlockDiagnostic[];
}

export interface CadBlockBatch {
  key: string;
  block: string;
  layer: string;
  insertIds: string[];
  matrices: [number, number, number, number, number, number][];
  primitiveCount: number;
}

interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const finite = (value: number | undefined, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback;

function multiply(left: Affine, right: Affine): Affine {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function point(matrix: Affine, value: CadPoint2 | CadPoint3): CadPoint3 {
  return {
    x: matrix.a * value.x + matrix.c * value.y + matrix.e,
    y: matrix.b * value.x + matrix.d * value.y + matrix.f,
    z: 'z' in value ? value.z : 0,
  };
}

function vector(matrix: Affine, value: CadPoint3): CadPoint3 {
  return {
    x: matrix.a * value.x + matrix.c * value.y,
    y: matrix.b * value.x + matrix.d * value.y,
    z: value.z,
  };
}

function matrixMetrics(matrix: Affine) {
  const sx = Math.hypot(matrix.a, matrix.b);
  const sy = Math.hypot(matrix.c, matrix.d);
  return {
    sx,
    sy,
    scale: (sx + sy) / 2,
    uniform: Math.abs(sx - sy) <= Math.max(sx, sy, 1) * 1e-9,
    rotation: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI,
    reflected: matrix.a * matrix.d - matrix.b * matrix.c < 0,
  };
}

function insertMatrix(entity: CadInsert, block: CadBlockDefinition): Affine {
  const radians = finite(entity.rotation) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return multiply(
    { a: 1, b: 0, c: 0, d: 1, e: entity.insertion.x, f: entity.insertion.y },
    multiply(
      { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 },
      multiply(
        { a: finite(entity.scale.x, 1), b: 0, c: 0, d: finite(entity.scale.y, 1), e: 0, f: 0 },
        { a: 1, b: 0, c: 0, d: 1, e: -block.basePoint.x, f: -block.basePoint.y },
      ),
    ),
  );
}

function blockMaps(document: Pick<CadDocument, 'blocks'>) {
  const byKey = new Map<string, CadBlockDefinition>();
  const duplicates = new Set<string>();
  for (const block of document.blocks) {
    for (const key of [block.id, block.name]) {
      if (byKey.has(key)) duplicates.add(key);
      else byKey.set(key, block);
    }
  }
  return { byKey, duplicates };
}

function substitute(value: string, attributes: Record<string, string>): string {
  return value.replace(/\{\{([A-Za-z0-9_.:-]{1,128})\}\}/g, (_match, key: string) => attributes[key] ?? '');
}

function resolvedAttributes(block: CadBlockDefinition, insert: CadInsert, diagnostics: CadBlockDiagnostic[]) {
  const result: Record<string, string> = {};
  for (const [key, definition] of Object.entries(block.attributes ?? {})) {
    result[key] = definition.constant
      ? (definition.defaultValue ?? '')
      : (insert.attributes?.[key] ?? definition.defaultValue ?? '');
    if (definition.required && !result[key].trim()) diagnostics.push({
      code: 'missing_attribute',
      severity: 'warning',
      block: block.name,
      entityId: insert.id,
      detail: `INSERT ${insert.id} requires attribute ${key}.`,
    });
  }
  return { ...result, ...(insert.attributes ?? {}) };
}

function resolveProperty<T extends { source: 'byLayer' | 'byBlock' | 'explicit'; value?: unknown }>(
  child: T | undefined,
  parent: T | undefined,
): T | undefined {
  if (!child) return undefined;
  if (child.source !== 'byBlock') return { ...child };
  if (parent?.source === 'explicit') return { ...parent } as T;
  return { ...child, source: 'byLayer', value: undefined };
}

function resolvedContext(child: CadEntityContext | undefined, parent: CadEntityContext | undefined): CadEntityContext | undefined {
  if (!child && !parent) return undefined;
  const presentation = child?.presentation || parent?.presentation ? {
    color: resolveProperty(child?.presentation?.color, parent?.presentation?.color),
    linetype: resolveProperty(child?.presentation?.linetype, parent?.presentation?.linetype),
    lineweight: resolveProperty(child?.presentation?.lineweight, parent?.presentation?.lineweight),
  } : undefined;
  return {
    ...(child ?? {}),
    ...(presentation ? { presentation } : {}),
    ...(child?.metadata ? { metadata: { ...child.metadata } } : {}),
    ...(child?.businessLink ? { businessLink: { ...child.businessLink } } : parent?.businessLink ? { businessLink: { ...parent.businessLink } } : {}),
  };
}

function rectangle(entity: Extract<CadEntity, { type: 'box' | 'station' }>): CadPoint3[] {
  const center = { x: entity.x + entity.w / 2, y: entity.y + entity.h / 2 };
  const radians = entity.rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    { x: -entity.w / 2, y: -entity.h / 2 }, { x: entity.w / 2, y: -entity.h / 2 },
    { x: entity.w / 2, y: entity.h / 2 }, { x: -entity.w / 2, y: entity.h / 2 },
  ].map((corner) => ({ x: center.x + corner.x * cos - corner.y * sin, y: center.y + corner.x * sin + corner.y * cos, z: 0 }));
}

function arcPolyline(entity: Extract<CadEntity, { type: 'arc' }>, segments = 64): CadPoint3[] {
  let sweep = entity.endAngle - entity.startAngle;
  while (sweep <= 0) sweep += 360;
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = (entity.startAngle + sweep * index / segments) * Math.PI / 180;
    return { x: entity.center.x + Math.cos(angle) * entity.radius, y: entity.center.y + Math.sin(angle) * entity.radius, z: entity.center.z };
  });
}

function transformedEntity(
  entity: Exclude<CadEntity, CadInsert>,
  matrix: Affine,
  id: string,
  layer: string,
  attributes: Record<string, string>,
  parentContext: CadEntityContext | undefined,
): CadEntity {
  const metrics = matrixMetrics(matrix);
  const context = resolvedContext(entity.context, parentContext);
  const common = { id, layer: entity.layer === '0' ? layer : entity.layer, context };
  if (entity.type === 'box' || entity.type === 'station') {
    const vertices = rectangle(entity).map((value) => point(matrix, value));
    return { ...common, type: 'polyline', vertices, closed: true };
  }
  if (entity.type === 'line') return { ...entity, ...common, start: point(matrix, entity.start), end: point(matrix, entity.end) };
  if (entity.type === 'polyline') return { ...entity, ...common, vertices: entity.vertices.map((value) => ({ ...point(matrix, value), ...(value.bulge !== undefined ? { bulge: metrics.reflected ? -value.bulge : value.bulge } : {}) })) };
  if (entity.type === 'circle') {
    if (metrics.uniform) return { ...entity, ...common, center: point(matrix, entity.center), radius: entity.radius * metrics.scale };
    return { ...common, type: 'ellipse', center: point(matrix, entity.center), majorAxis: vector(matrix, { x: entity.radius, y: 0, z: 0 }), ratio: Math.min(metrics.sx, metrics.sy) / Math.max(metrics.sx, metrics.sy), startParameter: 0, endParameter: 360 };
  }
  if (entity.type === 'arc') {
    if (!metrics.uniform) return { ...common, type: 'polyline', vertices: arcPolyline(entity).map((value) => point(matrix, value)), closed: false };
    return { ...entity, ...common, center: point(matrix, entity.center), radius: entity.radius * metrics.scale, startAngle: entity.startAngle + metrics.rotation, endAngle: entity.endAngle + metrics.rotation };
  }
  if (entity.type === 'ellipse') return { ...entity, ...common, center: point(matrix, entity.center), majorAxis: vector(matrix, entity.majorAxis), ratio: entity.ratio * (metrics.sy / Math.max(metrics.sx, 1e-12)) };
  if (entity.type === 'spline') return { ...entity, ...common, controlPoints: entity.controlPoints.map((value) => point(matrix, value)) };
  if (entity.type === 'text') return { ...entity, ...common, x: point(matrix, entity).x, y: point(matrix, entity).y, text: substitute(entity.text, attributes), height: entity.height === undefined ? undefined : entity.height * metrics.scale, rotation: (entity.rotation ?? 0) + metrics.rotation };
  if (entity.type === 'mtext') return { ...entity, ...common, insertion: point(matrix, entity.insertion), text: substitute(entity.text, attributes), width: entity.width === undefined ? undefined : entity.width * metrics.scale, height: entity.height === undefined ? undefined : entity.height * metrics.scale, rotation: (entity.rotation ?? 0) + metrics.rotation };
  if (entity.type === 'dimension') return { ...entity, ...common, a: point(matrix, entity.a), b: point(matrix, entity.b), ...(entity.c ? { c: point(matrix, entity.c) } : {}), offset: entity.offset === undefined ? undefined : entity.offset * metrics.scale, radius: entity.radius === undefined ? undefined : entity.radius * metrics.scale, arrowSize: entity.arrowSize === undefined ? undefined : entity.arrowSize * metrics.scale, text: entity.text === undefined ? undefined : substitute(entity.text, attributes), associative: false, references: undefined, associationStatus: 'detached' };
  if (entity.type === 'hatch') return { ...entity, ...common, boundaries: entity.boundaries.map((boundary) => boundary.map((value) => point(matrix, value))), origin: entity.origin ? point(matrix, entity.origin) : undefined, scale: (entity.scale ?? 1) * metrics.scale, angle: (entity.angle ?? 0) + metrics.rotation, associative: false, boundaryRefs: undefined, associationStatus: 'detached' };
  if (entity.type === 'mleader') return { ...entity, ...common, vertices: entity.vertices.map((value) => point(matrix, value)), leaderLines: entity.leaderLines?.map((line) => line.map((value) => point(matrix, value))), textPosition: point(matrix, entity.textPosition), text: substitute(entity.text, attributes), textWidth: entity.textWidth === undefined ? undefined : entity.textWidth * metrics.scale, textHeight: entity.textHeight === undefined ? undefined : entity.textHeight * metrics.scale, doglegLength: entity.doglegLength === undefined ? undefined : entity.doglegLength * metrics.scale, arrowSize: entity.arrowSize === undefined ? undefined : entity.arrowSize * metrics.scale, textRotation: (entity.textRotation ?? 0) + metrics.rotation, associative: false, references: undefined, associationStatus: 'detached' };
  if (entity.type === 'connector') return { ...entity, ...common };
  return entity;
}

function resolveDefinition(
  block: CadBlockDefinition,
  insert: CadInsert,
  maps: ReturnType<typeof blockMaps>,
  diagnostics: CadBlockDiagnostic[],
  matrix: Affine,
  path: string,
  stack: string[],
  maxDepth: number,
): CadEntity[] {
  if (stack.includes(block.id)) {
    diagnostics.push({ code: 'block_cycle', severity: 'error', block: block.name, entityId: insert.id, detail: `Cycle detected at block ${block.name}.` });
    return [];
  }
  if (stack.length >= maxDepth) {
    diagnostics.push({ code: 'block_depth', severity: 'error', block: block.name, entityId: insert.id, detail: `Block nesting exceeded ${maxDepth} levels.` });
    return [];
  }
  const attributes = resolvedAttributes(block, insert, diagnostics);
  const nextMatrix = multiply(matrix, insertMatrix(insert, block));
  const result: CadEntity[] = [];
  block.entities.forEach((child, index) => {
    const childPath = `${path}:${index}`;
    if (child.type === 'insert') {
      const nested = maps.byKey.get(child.block);
      if (!nested) {
        diagnostics.push({ code: 'missing_block', severity: 'error', block: child.block, entityId: child.id, detail: `Nested INSERT ${child.id} references missing block ${child.block}.` });
        return;
      }
      const nestedInsert: CadInsert = { ...child, attributes: { ...attributes, ...(child.attributes ?? {}) } };
      result.push(...resolveDefinition(nested, nestedInsert, maps, diagnostics, nextMatrix, childPath, [...stack, block.id], maxDepth));
      return;
    }
    const id = `${insert.id}:${childPath}:${child.id}`;
    result.push(transformedEntity(child, nextMatrix, id, insert.layer, attributes, insert.context));
  });
  for (const [key, definition] of Object.entries(block.attributes ?? {})) {
    if (definition.invisible || !definition.position || !attributes[key]) continue;
    const anchor = point(nextMatrix, definition.position);
    result.push({
      id: `${insert.id}:${path}:attribute:${key}`,
      type: 'text', x: anchor.x, y: anchor.y, text: attributes[key],
      height: (definition.height ?? 120) * matrixMetrics(nextMatrix).scale,
      rotation: matrixMetrics(nextMatrix).rotation,
      style: definition.style,
      layer: insert.layer,
      context: resolvedContext(undefined, insert.context),
    });
  }
  return result;
}

export function analyzeCadBlocks(document: Pick<CadDocument, 'blocks' | 'entities'>, maxDepth = 16): CadBlockDiagnostic[] {
  const maps = blockMaps(document);
  const diagnostics: CadBlockDiagnostic[] = [...maps.duplicates].map((key) => ({ code: 'duplicate_block', severity: 'error', block: key, detail: `Duplicate block id or name: ${key}.` }));
  const visit = (block: CadBlockDefinition, stack: string[], depth: number) => {
    if (depth >= maxDepth) {
      diagnostics.push({ code: 'block_depth', severity: 'error', block: block.name, detail: `Block nesting exceeded ${maxDepth} levels.` });
      return;
    }
    for (const insert of block.entities.filter((entity): entity is CadInsert => entity.type === 'insert')) {
      const nested = maps.byKey.get(insert.block);
      if (!nested) diagnostics.push({ code: 'missing_block', severity: 'error', block: insert.block, entityId: insert.id, detail: `INSERT ${insert.id} references missing block ${insert.block}.` });
      else if (stack.includes(nested.id)) diagnostics.push({ code: 'block_cycle', severity: 'error', block: nested.name, entityId: insert.id, detail: `Cycle ${[...stack, nested.id].join(' -> ')}.` });
      else visit(nested, [...stack, nested.id], depth + 1);
    }
  };
  document.blocks.forEach((block) => visit(block, [block.id], 0));
  document.entities.filter((entity): entity is CadInsert => entity.type === 'insert').forEach((insert) => {
    const block = maps.byKey.get(insert.block);
    if (!block) diagnostics.push({ code: 'missing_block', severity: 'error', block: insert.block, entityId: insert.id, detail: `INSERT ${insert.id} references missing block ${insert.block}.` });
    else resolvedAttributes(block, insert, diagnostics);
  });
  return diagnostics;
}

export function resolveCadInsert(document: Pick<CadDocument, 'blocks' | 'entities'>, insertOrId: CadInsert | string, maxDepth = 16): CadResolvedInsert {
  const insert = typeof insertOrId === 'string'
    ? document.entities.find((entity): entity is CadInsert => entity.type === 'insert' && entity.id === insertOrId)
    : insertOrId;
  const diagnostics: CadBlockDiagnostic[] = [];
  if (!insert) return { entities: [], diagnostics: [{ code: 'missing_block', severity: 'error', detail: `INSERT ${String(insertOrId)} was not found.` }] };
  const maps = blockMaps(document);
  const block = maps.byKey.get(insert.block);
  if (!block) return { entities: [], diagnostics: [{ code: 'missing_block', severity: 'error', block: insert.block, entityId: insert.id, detail: `INSERT ${insert.id} references missing block ${insert.block}.` }] };
  return { entities: resolveDefinition(block, insert, maps, diagnostics, IDENTITY, 'root', [], maxDepth), diagnostics };
}

function remapBlockEntityIds(entities: CadEntity[], blockId: string): CadEntity[] {
  const ids = new Map(entities.map((entity, index) => [entity.id, `${blockId}:entity:${index}`]));
  return entities.map((entity, index) => {
    const id = `${blockId}:entity:${index}`;
    if (entity.type === 'connector') return { ...structuredClone(entity), id, from: ids.get(entity.from) ?? entity.from, to: ids.get(entity.to) ?? entity.to };
    return { ...structuredClone(entity), id };
  });
}

export function defineCadBlock(
  document: CadDocument,
  options: { id: string; name: string; entityIds: string[]; basePoint: CadPoint3; attributes?: CadBlockDefinition['attributes']; description?: string; keywords?: string[]; library?: CadBlockDefinition['library']; businessLink?: CadBlockDefinition['businessLink']; replaceSelection?: boolean; insertId?: string },
): CadDocument {
  const name = options.name.trim();
  if (!name) throw new Error('Block name is required.');
  if (document.blocks.some((block) => block.id === options.id || block.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error(`Block ${name} already exists.`);
  const selected = options.entityIds.map((id) => document.entities.find((entity) => entity.id === id)).filter((entity): entity is CadEntity => !!entity);
  if (!selected.length) throw new Error('A block requires at least one selected entity.');
  const block: CadBlockDefinition = {
    id: options.id, name, basePoint: { ...options.basePoint }, entities: remapBlockEntityIds(selected, options.id),
    attributes: structuredClone(options.attributes ?? {}), description: options.description?.trim(), keywords: [...new Set(options.keywords ?? [])],
    version: 1, library: options.library ?? { scope: 'document' }, businessLink: options.businessLink ? { ...options.businessLink } : undefined,
  };
  block.thumbnail = { svg: buildCadBlockThumbnail(block) };
  const replace = options.replaceSelection !== false;
  const insert: CadInsert = { id: options.insertId ?? `${options.id}:insert:1`, type: 'insert', block: block.id, insertion: { ...options.basePoint }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, attributes: Object.fromEntries(Object.entries(block.attributes ?? {}).map(([key, value]) => [key, value.defaultValue ?? ''])), layer: selected[0].layer };
  const removed = new Set(options.entityIds);
  const entities = replace ? [...document.entities.filter((entity) => !removed.has(entity.id)), insert] : [...document.entities];
  const modelSpace = replace
    ? [...document.modelSpace.entityIds.filter((id) => !removed.has(id)), insert.id].sort()
    : [...document.modelSpace.entityIds];
  return commitChange({ ...document, blocks: [...document.blocks, block].sort((a, b) => a.id.localeCompare(b.id)), entities: entities.sort((a, b) => a.id.localeCompare(b.id)), modelSpace: { entityIds: modelSpace } }, `block:define:${name}`);
}

export function insertCadBlock(document: CadDocument, options: { id: string; block: string; insertion: CadPoint3; scale?: Partial<CadPoint3>; rotation?: number; layer?: string; attributes?: Record<string, string>; context?: CadEntityContext }): CadDocument {
  const maps = blockMaps(document);
  const block = maps.byKey.get(options.block);
  if (!block) throw new Error(`Block ${options.block} was not found.`);
  if (document.entities.some((entity) => entity.id === options.id)) throw new Error(`Entity ${options.id} already exists.`);
  const insert: CadInsert = {
    id: options.id, type: 'insert', block: block.id, insertion: { ...options.insertion },
    scale: { x: finite(options.scale?.x, 1), y: finite(options.scale?.y, 1), z: finite(options.scale?.z, 1) },
    rotation: finite(options.rotation), layer: options.layer ?? '0', context: options.context,
    attributes: Object.fromEntries(Object.entries(block.attributes ?? {}).map(([key, definition]) => [key, definition.constant ? (definition.defaultValue ?? '') : (options.attributes?.[key] ?? definition.defaultValue ?? '')])),
  };
  const diagnostics: CadBlockDiagnostic[] = [];
  resolvedAttributes(block, insert, diagnostics);
  if (diagnostics.some((item) => item.code === 'missing_attribute')) throw new Error(diagnostics.map((item) => item.detail).join(' '));
  return commitChange({ ...document, entities: [...document.entities, insert].sort((a, b) => a.id.localeCompare(b.id)), modelSpace: { entityIds: [...document.modelSpace.entityIds, insert.id].sort() } }, `block:insert:${block.name}`);
}

export function redefineCadBlock(document: CadDocument, blockKey: string, entities: CadEntity[], basePoint?: CadPoint3): CadDocument {
  const maps = blockMaps(document);
  const target = maps.byKey.get(blockKey);
  if (!target) throw new Error(`Block ${blockKey} was not found.`);
  if (!entities.length) throw new Error('A block definition cannot be empty.');
  const blocks = document.blocks.map((block) => {
    if (block.id !== target.id) return block;
    const next = { ...block, basePoint: basePoint ? { ...basePoint } : block.basePoint, entities: remapBlockEntityIds(entities, block.id), version: (block.version ?? 1) + 1, thumbnail: undefined };
    return { ...next, thumbnail: { svg: buildCadBlockThumbnail(next) } };
  });
  const candidate = { ...document, blocks };
  const cycles = analyzeCadBlocks(candidate).filter((item) => item.code === 'block_cycle');
  if (cycles.length) throw new Error(cycles.map((item) => item.detail).join(' '));
  return commitChange(candidate, `block:redefine:${target.name}`);
}

export function replaceCadBlock(document: CadDocument, sourceKey: string, targetKey: string, attributeMap: Record<string, string> = {}): CadDocument {
  const maps = blockMaps(document);
  const source = maps.byKey.get(sourceKey);
  const target = maps.byKey.get(targetKey);
  if (!source || !target) throw new Error('Source and target blocks must exist.');
  const defaults = target.attributes ?? {};
  const entities = document.entities.map((entity): CadEntity => {
    if (entity.type !== 'insert' || ![source.id, source.name].includes(entity.block)) return entity;
    const attributes = Object.fromEntries(Object.entries(defaults).map(([key, definition]) => {
      const sourceAttribute = attributeMap[key] ?? key;
      return [key, definition.constant ? (definition.defaultValue ?? '') : (entity.attributes?.[sourceAttribute] ?? definition.defaultValue ?? '')];
    }));
    return { ...entity, block: target.id, attributes };
  });
  return commitChange({ ...document, entities }, `block:replace:${source.name}:${target.name}`);
}

export function explodeCadInsert(document: CadDocument, insertId: string): CadDocument {
  const insert = document.entities.find((entity): entity is CadInsert => entity.type === 'insert' && entity.id === insertId);
  if (!insert) throw new Error(`INSERT ${insertId} was not found.`);
  const resolved = resolveCadInsert(document, insert);
  if (resolved.diagnostics.some((item) => item.severity === 'error')) throw new Error(resolved.diagnostics.map((item) => item.detail).join(' '));
  const entities = [...document.entities.filter((entity) => entity.id !== insertId), ...resolved.entities].sort((a, b) => a.id.localeCompare(b.id));
  const modelIds = new Set(document.modelSpace.entityIds);
  modelIds.delete(insertId);
  resolved.entities.forEach((entity) => modelIds.add(entity.id));
  return commitChange({ ...document, entities, modelSpace: { entityIds: [...modelIds].sort() } }, `block:explode:${insert.block}`);
}

export function purgeUnusedCadBlocks(document: CadDocument): { document: CadDocument; purged: string[] } {
  const maps = blockMaps(document);
  const used = new Set<string>();
  const visit = (key: string) => {
    const block = maps.byKey.get(key);
    if (!block || used.has(block.id)) return;
    used.add(block.id);
    block.entities.filter((entity): entity is CadInsert => entity.type === 'insert').forEach((insert) => visit(insert.block));
  };
  document.entities.filter((entity): entity is CadInsert => entity.type === 'insert').forEach((insert) => visit(insert.block));
  const purged = document.blocks.filter((block) => !used.has(block.id)).map((block) => block.id);
  if (!purged.length) return { document, purged };
  return { document: commitChange({ ...document, blocks: document.blocks.filter((block) => used.has(block.id)) }, `block:purge:${purged.length}`), purged };
}

export function searchCadBlocks(blocks: CadBlockDefinition[], query: string): CadBlockDefinition[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return blocks.filter((block) => {
    const haystack = [block.name, block.description ?? '', ...(block.keywords ?? []), block.businessLink?.entityType ?? '', block.businessLink?.entityId ?? ''].join(' ').toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function previewPoints(entity: CadEntity): CadPoint2[] {
  if (entity.type === 'line') return [entity.start, entity.end];
  if (entity.type === 'polyline') return entity.vertices;
  if (entity.type === 'box' || entity.type === 'station') return rectangle(entity);
  if (entity.type === 'circle') return Array.from({ length: 33 }, (_, index) => ({ x: entity.center.x + Math.cos(index / 32 * Math.PI * 2) * entity.radius, y: entity.center.y + Math.sin(index / 32 * Math.PI * 2) * entity.radius }));
  if (entity.type === 'arc') return arcPolyline(entity, 32);
  if (entity.type === 'ellipse') return Array.from({ length: 33 }, (_, index) => { const angle = index / 32 * Math.PI * 2; const perpendicular = { x: -entity.majorAxis.y * entity.ratio, y: entity.majorAxis.x * entity.ratio }; return { x: entity.center.x + entity.majorAxis.x * Math.cos(angle) + perpendicular.x * Math.sin(angle), y: entity.center.y + entity.majorAxis.y * Math.cos(angle) + perpendicular.y * Math.sin(angle) }; });
  if (entity.type === 'hatch') return entity.boundaries.flat();
  return [];
}

export function buildCadBlockThumbnail(block: CadBlockDefinition, size = 160): string {
  const paths = block.entities.filter((entity) => entity.type !== 'insert').map(previewPoints).filter((points) => points.length > 1);
  const points = paths.flat();
  if (!points.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#0f172a"/></svg>`;
  const minX = Math.min(...points.map((value) => value.x)); const maxX = Math.max(...points.map((value) => value.x));
  const minY = Math.min(...points.map((value) => value.y)); const maxY = Math.max(...points.map((value) => value.y));
  const scale = (size - 16) / Math.max(maxX - minX, maxY - minY, 1);
  const pathData = paths.map((path) => path.map((value, index) => `${index ? 'L' : 'M'}${(8 + (value.x - minX) * scale).toFixed(2)} ${(size - 8 - (value.y - minY) * scale).toFixed(2)}`).join(' ')).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" rx="10" fill="#0f172a"/><path d="${pathData}" fill="none" stroke="#67e8f9" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

export function buildCadInsertBatches(document: Pick<CadDocument, 'blocks' | 'entities'>): CadBlockBatch[] {
  const maps = blockMaps(document);
  const groups = new Map<string, CadBlockBatch>();
  for (const insert of document.entities.filter((entity): entity is CadInsert => entity.type === 'insert')) {
    const block = maps.byKey.get(insert.block);
    if (!block) continue;
    const color = insert.context?.presentation?.color?.value ?? insert.context?.presentation?.color?.source ?? 'layer';
    const key = `${block.id}|${insert.layer}|${color}`;
    const batch = groups.get(key) ?? { key, block: block.id, layer: insert.layer, insertIds: [], matrices: [], primitiveCount: block.entities.length };
    const matrix = insertMatrix(insert, block);
    batch.insertIds.push(insert.id);
    batch.matrices.push([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]);
    groups.set(key, batch);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
