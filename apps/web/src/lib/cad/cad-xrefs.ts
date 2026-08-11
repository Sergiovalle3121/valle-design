/**
 * Referencias externas: la API de siempre, sobre la ruta canónica de mutación.
 *
 * Cada función de este archivo llamaba a `commitChange` por su cuenta. Adjuntar
 * un xref son CUATRO escrituras —la capa, los bloques proyectados, el INSERT y
 * el registro— y como transacciones sueltas una interrupción dejaba el
 * documento con la capa creada y nada dentro. Ahora todas construyen un LOTE y
 * lo aplican con `executeCadEntityCommandBatch`: una transacción, un
 * `commitChange`, un paso de deshacer, y ninguna segunda vía de escritura.
 *
 * Las firmas no cambian, así que el editor no se entera. Lo que cambia es que
 * las mismas órdenes están disponibles para el motor de comandos, que es lo que
 * hace que XREF y XBIND se puedan teclear.
 *
 * La proyección vive en `xref/xref-projection.ts`, el grafo en
 * `xref/xref-graph.ts` y los constructores de lotes en `xref/xref-workflow.ts`.
 */
import {
  serializeCadDocument,
  type CadDocument,
  type CadExternalReference,
} from './cad-document';
import { executeCadEntityCommandBatch } from './entity-commands';
import {
  cadXrefAttachCommands,
  cadXrefBindCommands,
  cadXrefDetachCommands,
  cadXrefStatusCommands,
  cadXrefUnloadCommands,
} from './xref/xref-workflow';
import {
  cadXrefRootBlockId,
  projectCadXrefBlocks,
  type CadXrefAssetSnapshot,
} from './xref/xref-projection';

export { CAD_XREF_MAX_DEPTH, analyzeCadXrefGraph } from './xref/xref-graph';
export type { CadXrefGraph, CadXrefGraphIssue } from './xref/xref-graph';
export { cadTenantLayoutUri, isCadTenantAssetUri } from './xref/xref-projection';
export type { CadXrefAssetSnapshot } from './xref/xref-projection';

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

export async function hashCadXrefDocument(document: CadDocument): Promise<string> {
  const bytes = new TextEncoder().encode(serializeCadDocument(document));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function attachCadXref(document: CadDocument, input: {
  id: string;
  snapshot: CadXrefAssetSnapshot;
  mode?: 'attachment' | 'overlay';
  hostAssetId?: string;
  insertion?: Partial<{ x: number; y: number; z: number }>;
  rotation?: number;
  scale?: number;
}): CadDocument {
  return executeCadEntityCommandBatch(
    document,
    cadXrefAttachCommands(document, input),
    `xref:attach:${input.snapshot.assetId}`,
  ).document;
}

export function unloadCadXref(document: CadDocument, xrefId: string): CadDocument {
  const commands = cadXrefUnloadCommands(document, xrefId);
  if (commands.length === 0) return document;
  const reference = document.externalReferences.find((candidate) => candidate.id === xrefId);
  return executeCadEntityCommandBatch(
    document,
    commands,
    `xref:unload:${reference?.assetId ?? reference?.name ?? xrefId}`,
  ).document;
}

export function detachCadXref(document: CadDocument, xrefId: string): CadDocument {
  const commands = cadXrefDetachCommands(document, xrefId);
  const reference = document.externalReferences.find((candidate) => candidate.id === xrefId);
  return executeCadEntityCommandBatch(
    document,
    commands,
    `xref:detach:${reference?.assetId ?? reference?.name ?? xrefId}`,
  ).document;
}

export function reloadCadXref(document: CadDocument, xrefId: string, snapshot: CadXrefAssetSnapshot, hostAssetId?: string): CadDocument {
  const current = document.externalReferences.find((candidate) => candidate.id === xrefId);
  if (!current) throw new Error(`Xref ${xrefId} was not found.`);
  const currentInsert = document.entities.find(
    (entity): entity is Extract<CadDocument['entities'][number], { type: 'insert' }> =>
      entity.type === 'insert' && entity.id === current.insertId,
  );
  // Retirar la proyección vieja y poner la nueva en el MISMO lote: recargar es
  // una orden, no dos, y a mitad de camino el dibujo no tiene el xref.
  const detached = detachCadXref(document, xrefId);
  return executeCadEntityCommandBatch(
    detached,
    cadXrefAttachCommands(detached, {
      id: xrefId,
      snapshot,
      mode: current.mode,
      hostAssetId,
      insertion: currentInsert?.insertion,
      rotation: currentInsert?.rotation,
      scale: currentInsert?.scale.x,
      relativePath: current.relativePath,
    }),
    `xref:reload:${snapshot.assetId}`,
  ).document;
}

/**
 * XBIND en su forma histórica: EXPLOTA el contenido. Es la variante `insert`
 * de AutoCAD; la variante `bind`, que conserva el bloque, está en
 * `cadXrefBindCommands` y la ofrece el comando XBIND.
 */
export function bindCadXref(document: CadDocument, xrefId: string): CadDocument {
  const reference = document.externalReferences.find((candidate) => candidate.id === xrefId);
  return executeCadEntityCommandBatch(
    document,
    cadXrefBindCommands(document, xrefId, 'insert'),
    `xref:bind:${reference?.assetId ?? reference?.name ?? xrefId}`,
  ).document;
}

export function markCadXrefStatus(document: CadDocument, xrefId: string, status: NonNullable<CadExternalReference['status']>, error?: string): CadDocument {
  return executeCadEntityCommandBatch(
    document,
    cadXrefStatusCommands(document, xrefId, status, { error, checkedAt: new Date().toISOString() }),
    `xref:status:${status}`,
  ).document;
}

function rootBlock(document: CadDocument, xrefId: string) {
  return document.blocks.find((block) => block.id === cadXrefRootBlockId(xrefId));
}

export function compareCadXrefVersion(document: CadDocument, xrefId: string, incoming: CadXrefAssetSnapshot): CadXrefVersionComparison {
  const reference = document.externalReferences.find((candidate) => candidate.id === xrefId);
  if (!reference) throw new Error(`Xref ${xrefId} was not found.`);
  const current = rootBlock(document, xrefId)?.entities ?? [];
  const projected = projectCadXrefBlocks(incoming, xrefId, reference.mode ?? 'attachment')
    .find((block) => block.id === cadXrefRootBlockId(xrefId))?.entities ?? [];
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
