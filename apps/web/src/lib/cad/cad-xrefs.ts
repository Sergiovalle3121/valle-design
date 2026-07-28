import {
  commitChange,
  serializeCadDocument,
  type CadBlockDefinition,
  type CadDocument,
  type CadEntity,
  type CadExternalReference,
  type CadPoint3,
} from './cad-document';
import { explodeCadInsert } from './professional-blocks';

export const CAD_XREF_MAX_DEPTH = 8;

export interface CadXrefAssetSnapshot {
  tenantId: string;
  assetId: string;
  name: string;
  revision: string;
  version: number;
  document: CadDocument;
  contentHash: string;
  fetchedAt: string;
}

export interface CadXrefGraphIssue {
  code: 'cycle' | 'depth_exceeded' | 'missing_asset_id';
  severity: 'error' | 'warning';
  path: string[];
  detail: string;
}

export interface CadXrefGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string; mode: 'attachment' | 'overlay' }>;
  issues: CadXrefGraphIssue[];
  maxDepth: number;
}

export interface CadXrefVersionComparison {
  xrefId: string;
  currentVersion: number;
  incomingVersion: number;
  currentHash: string;
  incomingHash: string;
  added: string[];
  modified: string[];
  deleted: string[];
  changed: boolean;
}

const safe = (value: string) => value.trim().replace(/[^a-z0-9_.:-]+/gi, '-').slice(0, 96) || 'xref';
const prefixFor = (xrefId: string) => `xref:${safe(xrefId)}`;
const rootBlockId = (xrefId: string) => `${prefixFor(xrefId)}:root`;
const insertId = (xrefId: string) => `${prefixFor(xrefId)}:insert`;
const layerId = (xrefId: string) => `${prefixFor(xrefId)}:layer`;

export function cadTenantLayoutUri(assetId: string, revision: string) {
  return `tenant-layout://${encodeURIComponent(assetId)}/${encodeURIComponent(revision)}`;
}

export function isCadTenantAssetUri(uri: string) {
  return /^tenant-layout:\/\/[^/]+\/[^/]+$/i.test(uri);
}

export async function hashCadXrefDocument(document: CadDocument): Promise<string> {
  const bytes = new TextEncoder().encode(serializeCadDocument(document));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function detachedEntity(entity: CadEntity, id: string, layer: string, blockIds: Map<string, string>, entityIds: Map<string, string>): CadEntity {
  const clone = { ...structuredClone(entity), id, layer } as CadEntity;
  if (clone.type === 'insert') return { ...clone, block: blockIds.get(clone.block) ?? clone.block };
  if (clone.type === 'connector') return { ...clone, from: entityIds.get(clone.from) ?? clone.from, to: entityIds.get(clone.to) ?? clone.to };
  if (clone.type === 'hatch') return { ...clone, associative: false, boundaryRefs: undefined, associationStatus: 'detached' };
  if (clone.type === 'dimension') return { ...clone, associative: false, references: undefined, associationStatus: 'detached' };
  if (clone.type === 'mleader') return { ...clone, associative: false, references: undefined, associationStatus: 'detached' };
  return clone;
}

function projectedBlocks(snapshot: CadXrefAssetSnapshot, xrefId: string, mode: 'attachment' | 'overlay') {
  const prefix = prefixFor(xrefId);
  const source = snapshot.document;
  const blockIds = new Map<string, string>();
  source.blocks.forEach((block, index) => {
    const id = `${prefix}:block:${index}:${safe(block.id)}`;
    blockIds.set(block.id, id);
    blockIds.set(block.name, id);
  });
  const externalInsertIds = new Set(source.externalReferences
    .filter((reference) => mode === 'overlay' || (reference.mode ?? 'attachment') === 'overlay')
    .map((reference) => reference.insertId).filter((id): id is string => !!id));
  const cloneEntities = (entities: CadEntity[], scope: string) => {
    const selected = mode === 'overlay' ? entities.filter((entity) => !externalInsertIds.has(entity.id)) : entities;
    const ids = new Map(selected.map((entity, index) => [entity.id, `${prefix}:${scope}:entity:${index}`]));
    return selected.map((entity, index) => detachedEntity(entity, `${prefix}:${scope}:entity:${index}`, layerId(xrefId), blockIds, ids));
  };
  const blocks: CadBlockDefinition[] = source.blocks.map((block, index) => ({
    ...structuredClone(block),
    id: blockIds.get(block.id)!,
    name: `${safe(snapshot.name)}|${block.name}`,
    entities: cloneEntities(block.entities, `block:${index}`),
    library: { scope: 'document', sourceId: snapshot.assetId },
  }));
  const rootIds = new Set(source.modelSpace.entityIds);
  const rootEntities = cloneEntities(source.entities.filter((entity) => rootIds.has(entity.id)), 'root');
  blocks.push({
    id: rootBlockId(xrefId),
    name: `XREF|${snapshot.name}|${snapshot.revision}`,
    basePoint: { x: 0, y: 0, z: 0 },
    entities: rootEntities,
    description: `Tenant Xref ${snapshot.assetId}@${snapshot.revision}`,
    keywords: ['xref', snapshot.assetId, snapshot.revision, mode],
    version: snapshot.version,
    library: { scope: 'document', tenantId: snapshot.tenantId, sourceId: snapshot.assetId },
  });
  return blocks;
}

function withoutProjection(document: CadDocument, xrefId: string, keepLayer = false): CadDocument {
  const prefix = `${prefixFor(xrefId)}:`;
  const reference = document.externalReferences.find((candidate) => candidate.id === xrefId);
  const rootInsert = reference?.insertId ?? insertId(xrefId);
  return {
    ...document,
    layers: keepLayer ? document.layers : document.layers.filter((layer) => layer.id !== layerId(xrefId)),
    blocks: document.blocks.filter((block) => !block.id.startsWith(prefix)),
    entities: document.entities.filter((entity) => entity.id !== rootInsert),
    modelSpace: { entityIds: document.modelSpace.entityIds.filter((id) => id !== rootInsert) },
    externalReferences: document.externalReferences.filter((candidate) => candidate.id !== xrefId),
  };
}

export function analyzeCadXrefGraph(document: Pick<CadDocument, 'externalReferences'>, hostAssetId = 'host', maxDepth = CAD_XREF_MAX_DEPTH): CadXrefGraph {
  const edges: CadXrefGraph['edges'] = [];
  const adjacency = new Map<string, string[]>();
  const addEdge = (from: string, to: string, mode: 'attachment' | 'overlay') => {
    edges.push({ from, to, mode });
    adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  };
  const issues: CadXrefGraphIssue[] = [];
  document.externalReferences.forEach((reference) => {
    const assetId = reference.assetId?.trim();
    if (!assetId) {
      issues.push({ code: 'missing_asset_id', severity: 'warning', path: [reference.id], detail: `${reference.name} has no tenant asset id.` });
      return;
    }
    addEdge(hostAssetId, assetId, reference.mode ?? 'attachment');
    (reference.dependencyAssetIds ?? []).forEach((dependency) => addEdge(assetId, dependency, reference.mode ?? 'attachment'));
    (reference.dependencyEdges ?? []).forEach((edge) => addEdge(edge.from, edge.to, edge.mode));
  });
  let observedDepth = 0;
  const visit = (node: string, path: string[]) => {
    observedDepth = Math.max(observedDepth, path.length - 1);
    if (path.length - 1 > maxDepth) {
      issues.push({ code: 'depth_exceeded', severity: 'error', path, detail: `Xref depth exceeds ${maxDepth}: ${path.join(' -> ')}` });
      return;
    }
    for (const next of adjacency.get(node) ?? []) {
      const cycleAt = path.indexOf(next);
      if (cycleAt >= 0) {
        const cycle = [...path.slice(cycleAt), next];
        if (!issues.some((issue) => issue.code === 'cycle' && issue.path.join('|') === cycle.join('|')))
          issues.push({ code: 'cycle', severity: 'error', path: cycle, detail: `Xref cycle: ${cycle.join(' -> ')}` });
        continue;
      }
      visit(next, [...path, next]);
    }
  };
  visit(hostAssetId, [hostAssetId]);
  return {
    nodes: [...new Set([hostAssetId, ...edges.flatMap((edge) => [edge.from, edge.to])])].sort(),
    edges,
    issues,
    maxDepth: observedDepth,
  };
}

export function attachCadXref(document: CadDocument, input: {
  id: string;
  snapshot: CadXrefAssetSnapshot;
  mode?: 'attachment' | 'overlay';
  hostAssetId?: string;
  insertion?: Partial<CadPoint3>;
  rotation?: number;
  scale?: number;
}): CadDocument {
  if (!isCadTenantAssetUri(cadTenantLayoutUri(input.snapshot.assetId, input.snapshot.revision))) throw new Error('Xrefs require a tenant asset URI.');
  if (document.externalReferences.some((reference) => reference.id === input.id || reference.assetId === input.snapshot.assetId)) throw new Error(`Xref ${input.snapshot.assetId} is already attached.`);
  if (!input.snapshot.document.modelSpace.entityIds.length) throw new Error('The referenced drawing has no model-space entities.');
  const mode = input.mode ?? 'attachment';
  const propagated = mode === 'attachment'
    ? input.snapshot.document.externalReferences.filter((reference) => (reference.mode ?? 'attachment') === 'attachment')
    : [];
  const dependencies = [...new Set(propagated.map((reference) => reference.assetId).filter((id): id is string => !!id))];
  const dependencyEdges = propagated.flatMap((reference) => {
    if (!reference.assetId) return [];
    return [
      ...(reference.dependencyAssetIds ?? []).map((to) => ({ from: reference.assetId!, to, mode: reference.mode ?? 'attachment' as const })),
      ...(reference.dependencyEdges ?? []),
    ];
  });
  const reference: CadExternalReference = {
    id: input.id,
    name: input.snapshot.name,
    uri: cadTenantLayoutUri(input.snapshot.assetId, input.snapshot.revision),
    relativePath: `${input.snapshot.assetId}@${input.snapshot.revision}`,
    revision: input.snapshot.revision,
    loaded: true,
    mode,
    tenantId: input.snapshot.tenantId,
    assetId: input.snapshot.assetId,
    sourceVersion: input.snapshot.version,
    contentHash: input.snapshot.contentHash,
    blockId: rootBlockId(input.id),
    insertId: insertId(input.id),
    dependencyAssetIds: dependencies,
    dependencyEdges,
    status: 'loaded',
    lastLoadedAt: input.snapshot.fetchedAt,
    lastCheckedAt: input.snapshot.fetchedAt,
  };
  const graph = analyzeCadXrefGraph({ externalReferences: [...document.externalReferences, reference] }, input.hostAssetId ?? 'host');
  const blocker = graph.issues.find((issue) => issue.severity === 'error');
  if (blocker) throw new Error(blocker.detail);
  const blocks = projectedBlocks(input.snapshot, input.id, mode);
  const xrefLayer = { id: layerId(input.id), name: `XREF|${input.snapshot.name}`, color: '#64748b', visible: true, locked: true, linetype: 'continuous', lineweight: 0.18 };
  const scale = Number.isFinite(input.scale) && (input.scale ?? 0) > 0 ? input.scale! : 1;
  const insert: Extract<CadEntity, { type: 'insert' }> = {
    id: reference.insertId!, type: 'insert', block: reference.blockId!,
    insertion: { x: Number(input.insertion?.x) || 0, y: Number(input.insertion?.y) || 0, z: Number(input.insertion?.z) || 0 },
    scale: { x: scale, y: scale, z: scale }, rotation: Number(input.rotation) || 0,
    layer: xrefLayer.id,
    context: { businessLink: { tenantId: input.snapshot.tenantId, entityType: 'cadXref', entityId: input.snapshot.assetId } },
  };
  return commitChange({
    ...document,
    layers: [...document.layers, xrefLayer].sort((a, b) => a.id.localeCompare(b.id)),
    blocks: [...document.blocks, ...blocks].sort((a, b) => a.id.localeCompare(b.id)),
    entities: [...document.entities, insert].sort((a, b) => a.id.localeCompare(b.id)),
    modelSpace: { entityIds: [...document.modelSpace.entityIds, insert.id].sort() },
    externalReferences: [...document.externalReferences, reference].sort((a, b) => a.id.localeCompare(b.id)),
  }, `xref:attach:${input.snapshot.assetId}`);
}

export function unloadCadXref(document: CadDocument, xrefId: string): CadDocument {
  const reference = document.externalReferences.find((candidate) => candidate.id === xrefId);
  if (!reference) throw new Error(`Xref ${xrefId} was not found.`);
  if (!reference.loaded) return document;
  const rootInsert = reference.insertId ?? insertId(xrefId);
  return commitChange({
    ...document,
    entities: document.entities.filter((entity) => entity.id !== rootInsert),
    modelSpace: { entityIds: document.modelSpace.entityIds.filter((id) => id !== rootInsert) },
    externalReferences: document.externalReferences.map((candidate) => candidate.id === xrefId ? { ...candidate, loaded: false, status: 'unloaded' } : candidate),
  }, `xref:unload:${reference.assetId ?? reference.name}`);
}

export function detachCadXref(document: CadDocument, xrefId: string): CadDocument {
  const reference = document.externalReferences.find((candidate) => candidate.id === xrefId);
  if (!reference) throw new Error(`Xref ${xrefId} was not found.`);
  return commitChange(withoutProjection(document, xrefId), `xref:detach:${reference.assetId ?? reference.name}`);
}

export function reloadCadXref(document: CadDocument, xrefId: string, snapshot: CadXrefAssetSnapshot, hostAssetId?: string): CadDocument {
  const current = document.externalReferences.find((candidate) => candidate.id === xrefId);
  if (!current) throw new Error(`Xref ${xrefId} was not found.`);
  const currentInsert = document.entities.find((entity): entity is Extract<CadEntity, { type: 'insert' }> => entity.type === 'insert' && entity.id === current.insertId);
  const detached = withoutProjection(document, xrefId);
  return attachCadXref(detached, {
    id: xrefId,
    snapshot,
    mode: current.mode,
    hostAssetId,
    insertion: currentInsert?.insertion,
    rotation: currentInsert?.rotation,
    scale: currentInsert?.scale.x,
  });
}

export function bindCadXref(document: CadDocument, xrefId: string): CadDocument {
  const reference = document.externalReferences.find((candidate) => candidate.id === xrefId);
  if (!reference) throw new Error(`Xref ${xrefId} was not found.`);
  if (!reference.loaded || !reference.insertId) throw new Error('Load the Xref before binding it.');
  const exploded = explodeCadInsert(document, reference.insertId);
  const prefix = `${prefixFor(xrefId)}:`;
  return commitChange({
    ...exploded,
    blocks: exploded.blocks.filter((block) => !block.id.startsWith(prefix)),
    externalReferences: exploded.externalReferences.filter((candidate) => candidate.id !== xrefId),
  }, `xref:bind:${reference.assetId ?? reference.name}`);
}

export function markCadXrefStatus(document: CadDocument, xrefId: string, status: NonNullable<CadExternalReference['status']>, error?: string): CadDocument {
  const now = new Date().toISOString();
  return commitChange({
    ...document,
    externalReferences: document.externalReferences.map((reference) => reference.id === xrefId ? { ...reference, status, loaded: status === 'loaded' ? reference.loaded : status === 'unloaded' ? false : reference.loaded, lastCheckedAt: now, error } : reference),
  }, `xref:status:${status}`);
}

function rootBlock(document: CadDocument, xrefId: string) {
  return document.blocks.find((block) => block.id === rootBlockId(xrefId));
}

export function compareCadXrefVersion(document: CadDocument, xrefId: string, incoming: CadXrefAssetSnapshot): CadXrefVersionComparison {
  const reference = document.externalReferences.find((candidate) => candidate.id === xrefId);
  if (!reference) throw new Error(`Xref ${xrefId} was not found.`);
  const current = rootBlock(document, xrefId)?.entities ?? [];
  const projected = projectedBlocks(incoming, xrefId, reference.mode ?? 'attachment').find((block) => block.id === rootBlockId(xrefId))?.entities ?? [];
  const currentById = new Map(current.map((entity) => [entity.id, JSON.stringify(entity)]));
  const incomingById = new Map(projected.map((entity) => [entity.id, JSON.stringify(entity)]));
  const added = [...incomingById.keys()].filter((id) => !currentById.has(id));
  const deleted = [...currentById.keys()].filter((id) => !incomingById.has(id));
  const modified = [...incomingById.keys()].filter((id) => currentById.has(id) && currentById.get(id) !== incomingById.get(id));
  return {
    xrefId,
    currentVersion: reference.sourceVersion ?? 0,
    incomingVersion: incoming.version,
    currentHash: reference.contentHash ?? '',
    incomingHash: incoming.contentHash,
    added, modified, deleted,
    changed: reference.contentHash !== incoming.contentHash || added.length + modified.length + deleted.length > 0,
  };
}
