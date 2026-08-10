/**
 * XATTACH, XREF y XBIND expresados como lotes de `CadEntityCommand`.
 *
 * ## Por qué se reescribe lo que ya funcionaba
 *
 * `cad-xrefs.ts` hacía cada operación con su propio `commitChange`. Adjuntar
 * un xref son CUATRO escrituras —la capa, los bloques proyectados, el INSERT y
 * el registro de la referencia— y como transacciones separadas una interrupción
 * deja el documento con la capa creada y sin nada dentro. Aquí salen como un
 * lote: una transacción, un paso de deshacer. `cad-xrefs.ts` se reimplementa
 * encima y conserva su firma, así que el editor no cambia.
 *
 * ## El ciclo se detecta ANTES de resolver
 *
 * Un xref que se referencia a sí mismo —o A→B→A— cuelga a quien lo resuelva, y
 * resolver es lo que hacen el render y la exportación. Se comprueba sobre el
 * grafo que QUEDARÍA, antes de emitir una sola orden.
 *
 * ## XBIND: `bind` e `insert` no son lo mismo
 *
 * - **`insert`** explota el contenido en el dibujo: la referencia desaparece y
 *   la geometría queda suelta, con los nombres fusionados.
 * - **`bind`** convierte la referencia en un BLOQUE local: el contenido sigue
 *   siendo una unidad insertable y sus símbolos se renombran con el prefijo
 *   `$0$`, que es lo que impide que un nombre del dibujo referenciado pise uno
 *   del anfitrión.
 *
 * Tenerlos como el mismo botón es el error clásico: quien quería conservar el
 * bloque se encuentra el plano lleno de líneas sueltas.
 */
import type {
  CadDocument,
  CadEntity,
  CadExternalReference,
  CadPoint3,
} from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import { cadEmptyLayerDeleteCommand } from "../cad-symbol-tables";
import type { CadNativeEntity } from "../entity-runtime";
import { resolveCadInsert } from "../professional-blocks";
import { analyzeCadXrefGraph } from "./xref-graph";
import {
  cadTenantLayoutUri,
  cadXrefInsertId,
  cadXrefLayer,
  cadXrefPrefix,
  cadXrefRootBlockId,
  isCadTenantAssetUri,
  projectCadXrefBlocks,
  type CadXrefAssetSnapshot,
  type CadXrefMode,
} from "./xref-projection";

type CadInsertEntity = Extract<CadEntity, { type: "insert" }>;

type CadXrefDocument = Pick<
  CadDocument,
  "entities" | "blocks" | "layers" | "externalReferences" | "modelSpace"
>;

const finite = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Number(value) : fallback;

export function cadFindXref(
  document: Pick<CadDocument, "externalReferences">,
  key: string,
): CadExternalReference | undefined {
  const needle = key.trim().toLocaleLowerCase();
  return (
    document.externalReferences.find((reference) => reference.id === key) ??
    document.externalReferences.find((reference) => reference.name.toLocaleLowerCase() === needle)
  );
}

export interface CadXrefAttachInput {
  id: string;
  snapshot: CadXrefAssetSnapshot;
  mode?: CadXrefMode;
  hostAssetId?: string;
  insertion?: Partial<CadPoint3>;
  rotation?: number;
  scale?: number;
  /** Ruta relativa que se GUARDA. Sin ella se deriva del activo y su revisión. */
  relativePath?: string;
}

/** El registro de la referencia, con las TRES rutas guardadas. */
function referenceFor(input: CadXrefAttachInput, mode: CadXrefMode): CadExternalReference {
  const propagated =
    mode === "attachment"
      ? input.snapshot.document.externalReferences.filter(
          (reference) => (reference.mode ?? "attachment") === "attachment",
        )
      : [];
  const dependencies = [
    ...new Set(propagated.map((reference) => reference.assetId).filter((id): id is string => !!id)),
  ];
  const dependencyEdges = propagated.flatMap((reference) => {
    if (!reference.assetId) return [];
    return [
      ...(reference.dependencyAssetIds ?? []).map((to) => ({
        from: reference.assetId!,
        to,
        mode: reference.mode ?? ("attachment" as const),
      })),
      ...(reference.dependencyEdges ?? []),
    ];
  });
  return {
    id: input.id,
    name: input.snapshot.name,
    uri: cadTenantLayoutUri(input.snapshot.assetId, input.snapshot.revision),
    relativePath: input.relativePath?.trim() || `${input.snapshot.assetId}@${input.snapshot.revision}`,
    revision: input.snapshot.revision,
    loaded: true,
    mode,
    tenantId: input.snapshot.tenantId,
    assetId: input.snapshot.assetId,
    sourceVersion: input.snapshot.version,
    contentHash: input.snapshot.contentHash,
    blockId: cadXrefRootBlockId(input.id),
    insertId: cadXrefInsertId(input.id),
    dependencyAssetIds: dependencies,
    dependencyEdges,
    status: "loaded",
    lastLoadedAt: input.snapshot.fetchedAt,
    lastCheckedAt: input.snapshot.fetchedAt,
  };
}

export function cadXrefAttachCommands(
  document: CadXrefDocument,
  input: CadXrefAttachInput,
): CadEntityCommand[] {
  if (!isCadTenantAssetUri(cadTenantLayoutUri(input.snapshot.assetId, input.snapshot.revision)))
    throw new Error("Xrefs require a tenant asset URI.");
  if (
    document.externalReferences.some(
      (reference) => reference.id === input.id || reference.assetId === input.snapshot.assetId,
    )
  )
    throw new Error(`Xref ${input.snapshot.assetId} is already attached.`);
  if (!input.snapshot.document.modelSpace.entityIds.length)
    throw new Error("The referenced drawing has no model-space entities.");

  const mode = input.mode ?? "attachment";
  const reference = referenceFor(input, mode);
  const graph = analyzeCadXrefGraph(
    { externalReferences: [...document.externalReferences, reference] },
    input.hostAssetId ?? "host",
  );
  const blocker = graph.issues.find((issue) => issue.severity === "error");
  // Se comprueba ANTES de emitir una sola orden: un ciclo detectado a medias
  // dejaría la capa y los bloques escritos y la referencia no.
  if (blocker) throw new Error(blocker.detail);

  const scale = Number.isFinite(input.scale) && (input.scale ?? 0) > 0 ? input.scale! : 1;
  const insert: CadInsertEntity = {
    id: reference.insertId!,
    type: "insert",
    block: reference.blockId!,
    insertion: {
      x: finite(input.insertion?.x, 0),
      y: finite(input.insertion?.y, 0),
      z: finite(input.insertion?.z, 0),
    },
    scale: { x: scale, y: scale, z: scale },
    rotation: finite(input.rotation, 0),
    layer: cadXrefLayer(input.id, input.snapshot.name).id,
    context: {
      businessLink: {
        tenantId: input.snapshot.tenantId,
        entityType: "cadXref",
        entityId: input.snapshot.assetId,
      },
    },
  };
  return [
    { type: "layer", op: "upsert", layer: cadXrefLayer(input.id, input.snapshot.name) },
    ...projectCadXrefBlocks(input.snapshot, input.id, mode).map(
      (definition): CadEntityCommand => ({ type: "block", op: "define", definition }),
    ),
    // El xref adjuntado se dibuja AL FRENTE, que es lo que hace `insert` por
    // defecto: colocarlo en un punto arbitrario del z-order reordenaría el
    // espacio de modelo entero.
    { type: "insert", entity: insert as CadNativeEntity },
    { type: "xref", op: "upsert", reference },
  ];
}

/**
 * Órdenes que retiran la PROYECCIÓN de un xref: su INSERT, sus bloques y su
 * capa. Los bloques van de CONTENEDOR a CONTENIDO —el raíz primero— porque la
 * tabla se niega a borrar un bloque que otro todavía inserta.
 */
function withoutProjection(
  document: CadXrefDocument,
  reference: CadExternalReference,
  options: { keepLayer?: boolean } = {},
): CadEntityCommand[] {
  const prefix = `${cadXrefPrefix(reference.id)}:`;
  const rootInsert = reference.insertId ?? cadXrefInsertId(reference.id);
  const projected = document.blocks.filter((block) => block.id.startsWith(prefix));
  const rootId = cadXrefRootBlockId(reference.id);
  const ordered = [
    ...projected.filter((block) => block.id === rootId),
    ...projected.filter((block) => block.id !== rootId),
  ];
  const commands: CadEntityCommand[] = [];
  if (document.entities.some((entity) => entity.id === rootInsert))
    commands.push({ type: "delete", entityId: rootInsert });
  commands.push(...ordered.map((block): CadEntityCommand => ({ type: "block", op: "delete", blockId: block.id })));
  const xrefLayer = cadXrefLayer(reference.id, reference.name);
  // La geometría del xref vive DENTRO de su bloque y el INSERT que la sostiene
  // se borra en este mismo lote, así que la capa queda vacía y no hay nada que
  // reasignar. El destino lo elige el ayudante contra la tabla real: aquí la
  // del xref suele ser la única capa del documento.
  if (!options.keepLayer && document.layers.some((layer) => layer.id === xrefLayer.id))
    commands.push(cadEmptyLayerDeleteCommand(document.layers, xrefLayer.name));
  return commands;
}

export function cadXrefDetachCommands(document: CadXrefDocument, xrefId: string): CadEntityCommand[] {
  const reference = cadFindXref(document, xrefId);
  if (!reference) throw new Error(`Xref ${xrefId} was not found.`);
  return [
    ...withoutProjection(document, reference),
    { type: "xref", op: "delete", xrefId: reference.id },
  ];
}

/**
 * DESCARGAR conserva la definición y el registro: sólo quita lo que se dibuja.
 * Es lo que permite volver a cargarlo sin ir a buscar la ruta otra vez.
 */
export function cadXrefUnloadCommands(document: CadXrefDocument, xrefId: string): CadEntityCommand[] {
  const reference = cadFindXref(document, xrefId);
  if (!reference) throw new Error(`Xref ${xrefId} was not found.`);
  if (!reference.loaded) return [];
  const rootInsert = reference.insertId ?? cadXrefInsertId(reference.id);
  const commands: CadEntityCommand[] = [];
  if (document.entities.some((entity) => entity.id === rootInsert))
    commands.push({ type: "delete", entityId: rootInsert });
  commands.push({
    type: "xref",
    op: "upsert",
    reference: { ...reference, loaded: false, status: "unloaded" },
  });
  return commands;
}

export function cadXrefStatusCommands(
  document: CadXrefDocument,
  xrefId: string,
  status: NonNullable<CadExternalReference["status"]>,
  options: { error?: string; checkedAt: string } = { checkedAt: "" },
): CadEntityCommand[] {
  const reference = cadFindXref(document, xrefId);
  if (!reference) throw new Error(`Xref ${xrefId} was not found.`);
  return [
    {
      type: "xref",
      op: "upsert",
      reference: {
        ...reference,
        status,
        loaded: status === "unloaded" ? false : reference.loaded,
        ...(options.checkedAt ? { lastCheckedAt: options.checkedAt } : {}),
        ...(options.error === undefined ? {} : { error: options.error }),
      },
    },
  ];
}

/** Cambia las rutas guardadas de una referencia sin tocar su proyección. */
export function cadXrefPathCommands(
  document: CadXrefDocument,
  xrefId: string,
  paths: Pick<CadExternalReference, "uri" | "relativePath" | "name">,
): CadEntityCommand[] {
  const reference = cadFindXref(document, xrefId);
  if (!reference) throw new Error(`Xref ${xrefId} was not found.`);
  return [{ type: "xref", op: "upsert", reference: { ...reference, ...paths } }];
}

export type CadXrefBindMode = "bind" | "insert";

/**
 * XBIND.
 *
 * En `insert` se explota; en `bind` los bloques proyectados se REBAUTIZAN con
 * el prefijo `$0$` y dejan de ser una referencia externa para ser bloques del
 * dibujo. El INSERT sobrevive apuntando al bloque renombrado, así que lo que
 * era un xref sigue siendo una unidad que se puede mover de una pieza.
 */
export function cadXrefBindCommands(
  document: CadXrefDocument,
  xrefId: string,
  mode: CadXrefBindMode,
): CadEntityCommand[] {
  const reference = cadFindXref(document, xrefId);
  if (!reference) throw new Error(`Xref ${xrefId} was not found.`);
  if (!reference.loaded || !reference.insertId)
    throw new Error("Load the Xref before binding it.");

  if (mode === "insert") {
    const insert = document.entities.find(
      (entity): entity is CadInsertEntity => entity.type === "insert" && entity.id === reference.insertId,
    );
    if (!insert) throw new Error(`INSERT ${reference.insertId} was not found.`);
    const resolved = resolveCadInsert(document, insert);
    const blocking = resolved.diagnostics.filter((item) => item.severity === "error");
    if (blocking.length) throw new Error(blocking.map((item) => item.detail).join(" "));
    return [
      ...resolved.entities.map((entity): CadEntityCommand => ({
        type: "insert",
        entity: entity as CadNativeEntity,
      })),
      ...withoutProjection(document, reference, { keepLayer: true }),
      { type: "xref", op: "delete", xrefId: reference.id },
    ];
  }

  const prefix = `${cadXrefPrefix(reference.id)}:`;
  const projected = document.blocks.filter((block) => block.id.startsWith(prefix));
  // El renombrado `$0$` es lo que evita que un nombre del dibujo referenciado
  // pise uno del anfitrión. Sin él, enlazar dos xrefs que ambos definen «PUERTA»
  // deja una tabla con dos «PUERTA» y cada INSERT resuelto al azar.
  const localName = (name: string) => `${reference.name}$0$${name.replace(/^[^|]*\|/, "")}`;
  return [
    ...projected.map((block): CadEntityCommand => ({
      type: "block",
      op: "redefine",
      definition: {
        ...block,
        name: localName(block.name),
        library: { scope: "document", sourceId: reference.assetId },
      },
    })),
    { type: "xref", op: "delete", xrefId: reference.id },
  ];
}

export type { CadXrefAssetSnapshot, CadXrefMode } from "./xref-projection";
