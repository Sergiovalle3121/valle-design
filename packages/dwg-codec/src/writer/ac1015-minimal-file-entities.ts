/**
 * CÓMO SE EMPUJAN AL ARCHIVO las entidades de un espacio (model space o el
 * contenido de un bloque) y, cuando un INSERT lleva rótulo, su grupo
 * ATTRIB+SEQEND.
 *
 * Vive aparte de `ac1015-minimal-file-writer.ts` desde el 2026-09-04, cuando
 * el intake del ATTRIB empujó aquel archivo por encima del presupuesto de
 * monolito. La costura tiene sentido propio: allá queda el ARMADO del archivo
 * —secciones, directorio, mapa, centinelas—, que no cambia al aprender una
 * clase más; aquí queda el reparto de una LISTA de entidades con su cadena y
 * sus referencias resueltas, que es exactamente lo que cambió.
 *
 * LA FORMA DEL GRUPO DE ATRIBUTOS, MEDIDA (`VALLE-CORPUS-INSERT-ATRIBUTOS`,
 * cuatro INSERT con atributos del corpus admitido):
 * - los ATTRIB y el SEQEND viajan en modo 0 con el INSERT como PROPIETARIO
 *   (H(4) absoluto), no como entidades sueltas del espacio;
 * - los ATTRIB forman su PROPIA cadena enlazada (`first`/`middle`/`last`),
 *   independiente de la del espacio, y con un solo atributo la posición es
 *   `isolated` — así lo escribe el INSERT de un solo ATTRIB del corpus;
 * - cada ATTRIB cierra su flujo con el hard pointer a su STYLE, igual que un
 *   TEXT; el SEQEND no lo lleva;
 * - el SEQEND va en la capa del INSERT que cierra, y los ATTRIB en la suya.
 */
import { throwDwgError } from "../security/parse-error.js";
import { writeAc1015ResolvedEntityBody } from "./ac1015-resolved-writers.js";
import type { Ac1015EntityChainPosition } from "./ac1015-resolved-writers.js";
import type {
  Ac1015AttributeGroupHandles,
  Ac1015MinimalFileEntitySpec,
} from "./ac1015-minimal-file-support.js";

export interface Ac1015ScopeWriteContext {
  /** Las entidades del espacio, ya validadas y normalizadas. */
  readonly entities: readonly Ac1015MinimalFileEntitySpec[];
  /** Sus handles, CONSECUTIVOS (la cadena ±1 depende de ello). */
  readonly entityHandles: readonly number[];
  /** El grupo ATTRIB+SEQEND de cada entidad, o null. */
  readonly attributeGroups: readonly (Ac1015AttributeGroupHandles | null)[];
  /** Handle de la capa de un `layerIndex` del spec. */
  readonly layerHandleOf: (layerIndex: number | undefined) => number;
  /** Handle del BLOCK_RECORD de un `insertBlockIndex` del spec. */
  readonly blockRecordHandleOf: (blockIndex: number) => number;
  /** Handle del STYLE al que apuntan TEXT y ATTRIB. */
  readonly textStyleHandle: number;
  /** Presente = contenido de un bloque (modo 0); ausente = model space. */
  readonly ownerBlockHandle?: number;
  /** Empuja un objeto ya emitido al cuerpo del archivo. */
  readonly push: (handle: number, body: Uint8Array) => void;
}

/**
 * Emite las entidades de un espacio EN ORDEN DE HANDLE: primero todas ellas
 * —la cadena del espacio las quiere consecutivas— y después los grupos de
 * atributos, que es donde el plan reparte sus handles.
 */
export function pushAc1015ScopeEntities(context: Ac1015ScopeWriteContext): void {
  const { entities, entityHandles, attributeGroups } = context;
  const owner =
    context.ownerBlockHandle === undefined
      ? {}
      : { ownerBlockHandle: context.ownerBlockHandle };
  entities.forEach((spec, index) => {
    const handle = entityHandles[index]!;
    const group = attributeGroups[index] ?? null;
    context.push(
      handle,
      writeAc1015ResolvedEntityBody(spec.entity, handle, {
        ...owner,
        layerHandle: context.layerHandleOf(spec.layerIndex),
        chainPosition: chainPositionFor(index, entities.length),
        ...(spec.entity.kind === "text" || spec.entity.kind === "attrib"
          ? { textStyleHandle: context.textStyleHandle }
          : {}),
        ...(spec.insertBlockIndex === undefined
          ? {}
          : { insertBlockHandle: context.blockRecordHandleOf(spec.insertBlockIndex) }),
        ...(group === null
          ? {}
          : {
              attributeHandles: {
                firstAttribHandle: group.attributeHandles[0]!,
                lastAttribHandle:
                  group.attributeHandles[group.attributeHandles.length - 1]!,
                seqendHandle: group.seqendHandle,
              },
            }),
      }),
    );
  });
  entities.forEach((spec, index) => {
    const group = attributeGroups[index] ?? null;
    if (group === null) return;
    pushAttributeGroup(context, spec, entityHandles[index]!, group);
  });
}

/** Los ATTRIB de un INSERT y el SEQEND que los cierra, en su orden de handle. */
function pushAttributeGroup(
  context: Ac1015ScopeWriteContext,
  spec: Ac1015MinimalFileEntitySpec,
  insertHandle: number,
  group: Ac1015AttributeGroupHandles,
): void {
  const attributes = spec.attributes ?? [];
  if (attributes.length !== group.attributeHandles.length) {
    // El plan y las opciones salen de la MISMA lista validada; que difieran
    // sería un writer desincronizado consigo mismo, no una entrada mala.
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      0,
      "The planned attribute handles do not match the attributes of their INSERT.",
    );
  }
  attributes.forEach((attribute, index) => {
    const handle = group.attributeHandles[index]!;
    context.push(
      handle,
      writeAc1015ResolvedEntityBody(attribute.entity, handle, {
        // El propietario de un ATTRIB es el INSERT, no un BLOCK_RECORD: es el
        // vínculo por el que el lector los vuelve a atar.
        ownerBlockHandle: insertHandle,
        layerHandle: context.layerHandleOf(attribute.layerIndex ?? spec.layerIndex),
        textStyleHandle: context.textStyleHandle,
        chainPosition: chainPositionFor(index, attributes.length),
      }),
    );
  });
  context.push(
    group.seqendHandle,
    writeAc1015ResolvedEntityBody({ kind: "seqend" }, group.seqendHandle, {
      ownerBlockHandle: insertHandle,
      layerHandle: context.layerHandleOf(spec.layerIndex),
      chainPosition: "isolated",
    }),
  );
}

/**
 * La posición de una entidad en la cadena enlazada de su lista. Vive aquí
 * porque ahora lo usan DOS cadenas —la del espacio y la de los ATTRIB de un
 * INSERT—, y una copia por cadena podría separarse sin que nada lo viera.
 */
export function chainPositionFor(
  index: number,
  total: number,
): Ac1015EntityChainPosition {
  if (total <= 1) return "isolated";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}
