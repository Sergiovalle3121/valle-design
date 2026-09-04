/**
 * El PLAN DE HANDLES de un archivo mínimo AC1015.
 *
 * Vive aparte de `ac1015-minimal-file-writer.ts` desde el 2026-09-01, cuando
 * añadir las entradas LTYPE propias del dibujo empujó aquel archivo por encima
 * del presupuesto de monolito. La costura tiene sentido propio: aquí se decide
 * QUÉ HANDLE lleva cada objeto —una función pura de las opciones, sin emitir
 * un solo byte— y allá queda escribirlos. Que sea pura es lo que permite a las
 * specs y al harness del oráculo comparar el archivo campo a campo sin
 * reconstruirlo.
 */
import { H_DYNAMIC_BASE, H_LAYER_ZERO } from "./ac1015-minimal-file-support.js";
import { validateOptions } from "./ac1015-minimal-file-support.js";
import type {
  Ac1015AttributeGroupHandles,
  Ac1015MinimalFileEntitySpec,
  Ac1015MinimalFileOptions,
  Ac1015MinimalFilePlan,
} from "./ac1015-minimal-file-support.js";

/**
 * Calcula el plan de handles del archivo SIN emitir nada: función pura de
 * las opciones, compartida por el writer y por quien quiera comparar el
 * archivo campo a campo (specs y harness del oráculo externo).
 *
 * EL ORDEN DE LOS DOS ESPACIOS, desde el 2026-09-04: primero TODO model space
 * —sus entidades y después sus grupos de atributos— y a continuación TODA la
 * hoja, de la misma forma; al final, las entradas VPORT ENTITY HEADER de las
 * ventanas, en ese mismo orden. Cada espacio necesita sus handles
 * CONSECUTIVOS para su propia cadena, así que intercalarlos rompería las dos
 * a la vez.
 *
 * EL ORDEN DENTRO DE UN ESPACIO, desde el 2026-09-04: primero TODAS sus
 * entidades y sólo después los grupos ATTRIB+SEQEND de los INSERT que los
 * lleven. No es una comodidad: las posiciones `first`/`middle`/`last` de la
 * cadena de entidades usan los códigos relativos ±1 medidos en el corpus, y
 * ésos exigen handles consecutivos. Intercalar los atributos rompería la
 * cadena del espacio en silencio — sólo sobreviviría la primera entidad al
 * abrir el archivo con un lector ajeno, que es el defecto que
 * `VALLE-CORPUS-INTAKE-A60EBE2` ya midió una vez.
 */
export function planAc1015MinimalFile(
  options: Ac1015MinimalFileOptions = {},
): Ac1015MinimalFilePlan {
  const { layers, linetypes, blocks, modelEntities, paperEntities } =
    validateOptions(options);
  let next = H_DYNAMIC_BASE;
  // Las entradas LTYPE propias van PRIMERO en el tramo dinámico: una capa las
  // referencia por handle, así que tienen que existir antes que ella.
  const linetypeHandles = linetypes.map(() => next++);
  const layerHandles = [H_LAYER_ZERO, ...layers.map(() => next++)];
  /** El grupo de una entidad, o null si no lleva atributos. Consume handles. */
  const takeAttributeGroup = (
    spec: Ac1015MinimalFileEntitySpec,
  ): Ac1015AttributeGroupHandles | null => {
    const attributes = spec.attributes ?? [];
    if (attributes.length === 0) return null;
    const attributeHandles = attributes.map(() => next++);
    return Object.freeze({
      attributeHandles: Object.freeze(attributeHandles),
      seqendHandle: next++,
    });
  };
  const blockRecordHandles: number[] = [];
  const blockEntityHandles: number[][] = [];
  const blockAttributeHandles: (Ac1015AttributeGroupHandles | null)[][] = [];
  const blockEndblkHandles: number[] = [];
  for (const block of blocks) {
    blockRecordHandles.push(next++);
    next++; // BLOCK del bloque
    blockEntityHandles.push(block.entities.map(() => next++));
    blockAttributeHandles.push(block.entities.map(takeAttributeGroup));
    blockEndblkHandles.push(next++); // ENDBLK del bloque
  }
  const modelEntityHandles = modelEntities.map(() => next++);
  const modelAttributeHandles = modelEntities.map(takeAttributeGroup);
  const paperEntityHandles = paperEntities.map(() => next++);
  const paperAttributeHandles = paperEntities.map(takeAttributeGroup);
  /**
   * Una entrada VPORT ENTITY HEADER por VENTANA, repartidas DESPUÉS de las
   * entidades de los dos espacios: sus handles no participan de ninguna
   * cadena, así que caben aquí sin romper nada, y el archivo exige orden de
   * handle creciente.
   */
  const takeViewportHeader = (
    spec: Ac1015MinimalFileEntitySpec,
  ): number | null => (spec.entity.kind === "viewport" ? next++ : null);
  const modelViewportHeaderHandles = modelEntities.map(takeViewportHeader);
  const paperViewportHeaderHandles = paperEntities.map(takeViewportHeader);
  next += 4; // BLOCK/ENDBLK de model space y de paper space
  return Object.freeze({
    linetypeHandles: Object.freeze(linetypeHandles),
    layerHandles: Object.freeze(layerHandles),
    blockRecordHandles: Object.freeze(blockRecordHandles),
    modelEntityHandles: Object.freeze(modelEntityHandles),
    modelAttributeHandles: Object.freeze(modelAttributeHandles),
    paperEntityHandles: Object.freeze(paperEntityHandles),
    paperAttributeHandles: Object.freeze(paperAttributeHandles),
    modelViewportHeaderHandles: Object.freeze(modelViewportHeaderHandles),
    paperViewportHeaderHandles: Object.freeze(paperViewportHeaderHandles),
    blockEntityHandles: Object.freeze(blockEntityHandles.map((h) => Object.freeze(h))),
    blockAttributeHandles: Object.freeze(
      blockAttributeHandles.map((groups) => Object.freeze(groups)),
    ),
    blockEndblkHandles: Object.freeze(blockEndblkHandles),
    handseed: next,
  });
}
