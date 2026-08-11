/**
 * Cómo se proyecta un dibujo referenciado dentro del que lo referencia.
 *
 * Sale de `cad-xrefs.ts` sin cambiar una coma de su comportamiento: aquel
 * archivo escribía el documento con su propio `commitChange` —una SEGUNDA ruta
 * de mutación— y ahora se reimplementa sobre lotes de `CadEntityCommand`. Para
 * eso la proyección tiene que ser una función pura a la que puedan llamar los
 * dos: el camino de compatibilidad y el motor de comandos.
 *
 * ## Attachment y overlay, que es lo que se equivoca todo el mundo
 *
 * Un **attachment** arrastra consigo los xrefs que a su vez tenga dentro: si A
 * referencia B y B referencia C, quien abra A ve C. Un **overlay** NO: existe
 * justamente para cortar esa propagación y evitar que dos compañeros que se
 * referencian mutuamente acaben con el dibujo duplicado. Por eso la proyección
 * de un overlay descarta las inserciones de los xrefs anidados, y la de un
 * attachment las conserva.
 */
import type {
  CadBlockDefinition,
  CadDocument,
  CadEntity,
  CadLayerDef,
} from "../cad-document";

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

export type CadXrefMode = "attachment" | "overlay";

const safe = (value: string) => value.trim().replace(/[^a-z0-9_.:-]+/gi, "-").slice(0, 96) || "xref";

export const cadXrefPrefix = (xrefId: string) => `xref:${safe(xrefId)}`;
export const cadXrefRootBlockId = (xrefId: string) => `${cadXrefPrefix(xrefId)}:root`;
export const cadXrefInsertId = (xrefId: string) => `${cadXrefPrefix(xrefId)}:insert`;
export const cadXrefLayerId = (xrefId: string) => `${cadXrefPrefix(xrefId)}:layer`;

export function cadTenantLayoutUri(assetId: string, revision: string) {
  return `tenant-layout://${encodeURIComponent(assetId)}/${encodeURIComponent(revision)}`;
}

export function isCadTenantAssetUri(uri: string) {
  return /^tenant-layout:\/\/[^/]+\/[^/]+$/i.test(uri);
}

/**
 * Una entidad del dibujo referenciado, ya desligada.
 *
 * Las asociatividades se ROMPEN a propósito: una cota asociativa proyectada
 * seguiría apuntando al id de una entidad del OTRO documento, y regenerarla
 * aquí la mandaría a cualquier sitio.
 */
function detachedEntity(
  entity: CadEntity,
  id: string,
  layer: string,
  blockIds: Map<string, string>,
  entityIds: Map<string, string>,
): CadEntity {
  const clone = { ...structuredClone(entity), id, layer } as CadEntity;
  if (clone.type === "insert") return { ...clone, block: blockIds.get(clone.block) ?? clone.block };
  if (clone.type === "connector")
    return { ...clone, from: entityIds.get(clone.from) ?? clone.from, to: entityIds.get(clone.to) ?? clone.to };
  if (clone.type === "hatch")
    return { ...clone, associative: false, boundaryRefs: undefined, associationStatus: "detached" };
  if (clone.type === "dimension")
    return { ...clone, associative: false, references: undefined, associationStatus: "detached" };
  if (clone.type === "mleader")
    return { ...clone, associative: false, references: undefined, associationStatus: "detached" };
  return clone;
}

export function projectCadXrefBlocks(
  snapshot: CadXrefAssetSnapshot,
  xrefId: string,
  mode: CadXrefMode,
): CadBlockDefinition[] {
  const prefix = cadXrefPrefix(xrefId);
  const source = snapshot.document;
  const blockIds = new Map<string, string>();
  source.blocks.forEach((block, index) => {
    const id = `${prefix}:block:${index}:${safe(block.id)}`;
    blockIds.set(block.id, id);
    blockIds.set(block.name, id);
  });
  const externalInsertIds = new Set(
    source.externalReferences
      .filter((reference) => mode === "overlay" || (reference.mode ?? "attachment") === "overlay")
      .map((reference) => reference.insertId)
      .filter((id): id is string => !!id),
  );
  const cloneEntities = (entities: CadEntity[], scope: string) => {
    const selected = mode === "overlay" ? entities.filter((entity) => !externalInsertIds.has(entity.id)) : entities;
    const ids = new Map(selected.map((entity, index) => [entity.id, `${prefix}:${scope}:entity:${index}`]));
    return selected.map((entity, index) =>
      detachedEntity(entity, `${prefix}:${scope}:entity:${index}`, cadXrefLayerId(xrefId), blockIds, ids),
    );
  };
  const blocks: CadBlockDefinition[] = source.blocks.map((block, index) => ({
    ...structuredClone(block),
    id: blockIds.get(block.id)!,
    name: `${safe(snapshot.name)}|${block.name}`,
    entities: cloneEntities(block.entities, `block:${index}`),
    library: { scope: "document", sourceId: snapshot.assetId },
  }));
  const rootIds = new Set(source.modelSpace.entityIds);
  const rootEntities = cloneEntities(
    source.entities.filter((entity) => rootIds.has(entity.id)),
    "root",
  );
  blocks.push({
    id: cadXrefRootBlockId(xrefId),
    name: `XREF|${snapshot.name}|${snapshot.revision}`,
    basePoint: { x: 0, y: 0, z: 0 },
    entities: rootEntities,
    description: `Tenant Xref ${snapshot.assetId}@${snapshot.revision}`,
    keywords: ["xref", snapshot.assetId, snapshot.revision, mode],
    version: snapshot.version,
    library: { scope: "document", tenantId: snapshot.tenantId, sourceId: snapshot.assetId },
  });
  return blocks;
}

/**
 * La capa sobre la que aterriza todo lo que proyecta un xref.
 *
 * **Nace DESBLOQUEADA, y eso es un arreglo.** Nacía bloqueada, y el candado no
 * protegía lo que parecía: el contenido del xref vive dentro de una definición
 * de bloque y no se puede editar de todas formas. Lo que sí impedía era
 * GESTIONAR la referencia — el INSERT que la representa está en esta capa, así
 * que descargarla, desligarla o enlazarla chocaba con el guardia de capa
 * bloqueada del editor y se rechazaba con «Layer … is locked». La referencia
 * quedaba inmanejable desde cualquier ruta que pase por ese guardia.
 *
 * Apagar la capa sigue ocultando el xref entero, que es para lo que se creó.
 */
export function cadXrefLayer(xrefId: string, name: string): CadLayerDef {
  return {
    id: cadXrefLayerId(xrefId),
    name: `XREF|${name}`,
    color: "#64748b",
    visible: true,
    locked: false,
    linetype: "continuous",
    lineweight: 0.18,
  };
}
