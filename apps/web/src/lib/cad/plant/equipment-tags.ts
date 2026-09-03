/**
 * LA ETIQUETA DEL EQUIPO: `P-101`, `V-201`, `TI-1001`.
 *
 * ## Por qué no reutiliza el módulo eléctrico, aunque se parezca
 *
 * `electrical/device-tags.ts` hace lo mismo para `-M1` y `-PB2`. La forma es
 * OTRA: en una planta la etiqueta no lleva guion delante, el prefijo puede
 * tener hasta tres letras (`TI`, `FIC`) y el correlativo empieza en 101 por
 * unidad, no en 1. Compartir un lector con una opción `¿lleva guion?` habría
 * atado dos convenciones de dos disciplinas distintas al mismo archivo: el día
 * que una cambie, la otra se entera. Son sesenta líneas y viven separadas a
 * propósito.
 *
 * ## Dónde vive, y por qué en atributos
 *
 * En los ATRIBUTOS del bloque, por la misma razón que la etiqueta eléctrica: un
 * atributo se DIBUJA junto al símbolo —es lo que se lee en el P&ID impreso—,
 * viaja al DXF como `ATTRIB` dentro del `INSERT`, sale en las extracciones y
 * `ATTSYNC` ya lo mantiene. La etiqueta de un equipo existe para verse.
 *
 * ## El prefijo lo pone el proyecto, no nosotros
 *
 * Se ofrecen los de uso corriente —`P` bomba, `V` recipiente, `E`
 * intercambiador, `TK` tanque, `K` compresor, y los de instrumento como `TI` o
 * `PI`— porque son abreviaturas conocidas de cualquier libro de proceso, no la
 * tabla de nadie. Pero se admite CUALQUIER prefijo de una a tres letras: la
 * nomenclatura la fija la ingeniería del proyecto y el programa no está para
 * discutirla.
 */
import type { CadDocument, CadEntity } from "../cad-document";

/** Atributo con la etiqueta del equipo. Mayúsculas, como todo `ATTRIB`. */
export const CAD_PL_TAG = "TAG";

export interface CadEquipmentTag {
  entityId: string;
  /** La etiqueta completa tal como se lee: `P-101`. */
  tag: string;
  prefix: string;
  number: number;
}

/**
 * Parte una etiqueta de equipo, o `null` si no tiene esa forma.
 *
 * `P-101`, `TI-1001`, `TK-401`. Se admite tecleada sin guion (`P101`) porque es
 * como se escribe rápido, y se NORMALIZA con guion al escribir, que es como se
 * rotula.
 */
export function cadParseEquipmentTag(
  raw: string,
): { prefix: string; number: number } | null {
  const limpio = raw.trim().toUpperCase().replace(/\s+/gu, "");
  const partido = /^([A-Z]{1,3})-?(\d{1,5})$/u.exec(limpio);
  if (!partido) return null;
  const number = Number(partido[2]);
  return Number.isInteger(number) && number > 0 ? { prefix: partido[1], number } : null;
}

/** La etiqueta como se rotula en el P&ID. */
export const cadFormatEquipmentTag = (prefix: string, number: number): string =>
  `${prefix.toUpperCase()}-${number}`;

/** Los equipos etiquetados del dibujo. */
export function cadEquipmentTagsOf(
  document: Pick<CadDocument, "entities">,
): CadEquipmentTag[] {
  const tags: CadEquipmentTag[] = [];
  for (const entity of document.entities) {
    if (entity.type !== "insert") continue;
    const raw = entity.attributes?.[CAD_PL_TAG];
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const partido = cadParseEquipmentTag(raw);
    if (!partido) continue;
    tags.push({ entityId: entity.id, tag: raw.trim().toUpperCase(), ...partido });
  }
  return tags;
}

/**
 * El siguiente correlativo libre del prefijo.
 *
 * Arranca en 101 —no en 1— porque es la convención de planta: el primer equipo
 * de la unidad 100 es el `P-101`. Los huecos no se rellenan, por lo de siempre:
 * el `P-103` de un plano entregado y uno nuevo serían equipos distintos con el
 * mismo nombre.
 */
export function cadNextEquipmentNumber(
  document: Pick<CadDocument, "entities">,
  prefix: string,
): number {
  const clave = prefix.trim().toUpperCase();
  let mayor = 0;
  for (const tag of cadEquipmentTagsOf(document))
    if (tag.prefix === clave && tag.number > mayor) mayor = tag.number;
  return mayor === 0 ? 101 : mayor + 1;
}

export interface CadEquipmentClash {
  tag: string;
  entityIds: string[];
}

/** Etiquetas de equipo repetidas: dos `P-101` son el mismo equipo o un error. */
export function cadEquipmentClashes(
  document: Pick<CadDocument, "entities">,
): CadEquipmentClash[] {
  const porEtiqueta = new Map<string, string[]>();
  for (const tag of cadEquipmentTagsOf(document)) {
    const clave = cadFormatEquipmentTag(tag.prefix, tag.number);
    porEtiqueta.set(clave, [...(porEtiqueta.get(clave) ?? []), tag.entityId]);
  }
  return [...porEtiqueta.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([tag, entityIds]) => ({ tag, entityIds: [...entityIds].sort() }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/** ¿Es esta inserción un equipo de proceso del catálogo? */
export const cadIsPidInsert = (
  entity: Extract<CadEntity, { type: "insert" }>,
): boolean => entity.block.toUpperCase().startsWith("PID-");

/**
 * Equipos de proceso SIN etiqueta legible.
 *
 * Un equipo sin etiqueta no sale en la lista, ni en la requisición, ni en el
 * isométrico: desaparece del proyecto sin que nadie lo note. Por eso se cuenta.
 */
export function cadUntaggedEquipment(
  document: Pick<CadDocument, "entities">,
): string[] {
  const fuera: string[] = [];
  for (const entity of document.entities) {
    if (entity.type !== "insert" || !cadIsPidInsert(entity)) continue;
    const raw = entity.attributes?.[CAD_PL_TAG];
    if (typeof raw === "string" && cadParseEquipmentTag(raw)) continue;
    fuera.push(entity.id);
  }
  return fuera;
}
