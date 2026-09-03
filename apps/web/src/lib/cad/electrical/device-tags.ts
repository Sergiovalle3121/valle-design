/**
 * LA ETIQUETA DEL COMPONENTE: `-M1`, `-PB2`, `-LT3`, sacada del dibujo.
 *
 * ## Qué es y por qué importa tanto como el número de conductor
 *
 * En un proyecto eléctrico cada componente lleva una etiqueta única: el motor
 * es `-M1`, el botón `-PB2`, la luminaria `-LT3`. Esa etiqueta es la que aparece
 * en el esquema, en el plano de gabinete, en la lista de materiales y en la
 * regleta de bornes — y es por lo que el electricista pregunta cuando llama por
 * teléfono. Dos componentes con la misma etiqueta es exactamente el mismo
 * desastre que dos conductores con el mismo número, y se produce de la misma
 * manera: copiando y pegando.
 *
 * ## Dónde vive, y por qué NO en metadatos
 *
 * En los ATRIBUTOS del bloque, no en `context.metadata`. La diferencia importa:
 * un atributo se DIBUJA junto al símbolo —es lo que se lee en el plano
 * impreso—, viaja al DXF como `ATTRIB` dentro del `INSERT`, sale en las
 * extracciones de datos y ya lo sincroniza `ATTSYNC` cuando se redefine el
 * bloque. Un metadato no se ve. La etiqueta de un componente EXISTE para verse.
 *
 * El conductor va por metadatos porque una polilínea no tiene atributos; el
 * componente va por atributos porque los tiene. Cada cosa donde el formato ya
 * la sabe llevar, sin inventar campos.
 *
 * ## De dónde sale el número
 *
 * Del dibujo, como el del conductor y por la misma razón: un contador de sesión
 * daría a dos personas del mismo despacho dos `-M1`. Se lee el mayor de la
 * familia y se suma uno; los huecos no se rellenan, porque el `-M3` de un plano
 * entregado y un `-M3` nuevo serían componentes distintos con el mismo nombre.
 */
import type { CadDocument, CadEntity } from "../cad-document";

/** Atributo con la etiqueta del componente. Mayúsculas, como todo `ATTRIB`. */
export const CAD_IE_TAG = "TAG";
/** Atributo con la descripción, opcional. */
export const CAD_IE_TAG_DESC = "DESCRIPCION";

/**
 * Familias de componente, con el prefijo que se les pone en México.
 *
 * Las letras son las de uso corriente en un esquema —M de motor, PB de botón
 * pulsador, LT de luminaria— y no salen de ninguna norma con derechos: son
 * abreviaturas del castellano y del inglés técnico, del mismo modo que `V` es
 * válvula en el catálogo MEP que ya existe.
 */
export const CAD_IE_FAMILIES: readonly { prefix: string; label: string }[] = [
  { prefix: "M", label: "Motor" },
  { prefix: "PB", label: "Botón pulsador" },
  { prefix: "LT", label: "Luminaria" },
  { prefix: "CT", label: "Contacto" },
  { prefix: "SW", label: "Apagador o interruptor" },
  { prefix: "TB", label: "Tablero" },
  { prefix: "TR", label: "Transformador" },
  { prefix: "SN", label: "Sensor" },
];

export interface CadDeviceTag {
  entityId: string;
  /** La etiqueta completa tal como se lee en el plano: `-M1`. */
  tag: string;
  /** Familia sin el guion ni el número: `M`. */
  prefix: string;
  number: number;
}

/**
 * Parte una etiqueta en familia y número, o `null` si no tiene esa forma.
 *
 * Se admite con guion inicial o sin él —lo teclea una persona— pero se
 * NORMALIZA con guion al escribir, que es como se dibuja en un esquema.
 */
export function cadParseDeviceTag(raw: string): { prefix: string; number: number } | null {
  const limpio = raw.trim().toUpperCase().replace(/^-/u, "");
  const partido = /^([A-Z]{1,3})(\d{1,4})$/u.exec(limpio);
  if (!partido) return null;
  const number = Number(partido[2]);
  return Number.isInteger(number) && number > 0
    ? { prefix: partido[1], number }
    : null;
}

/** La etiqueta como se escribe en el plano. */
export const cadFormatDeviceTag = (prefix: string, number: number): string =>
  `-${prefix.toUpperCase()}${number}`;

/** Los componentes etiquetados del dibujo, leídos de sus atributos. */
export function cadDeviceTagsOf(
  document: Pick<CadDocument, "entities">,
): CadDeviceTag[] {
  const tags: CadDeviceTag[] = [];
  for (const entity of document.entities) {
    if (entity.type !== "insert") continue;
    const raw = entity.attributes?.[CAD_IE_TAG];
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const partido = cadParseDeviceTag(raw);
    if (!partido) continue;
    tags.push({ entityId: entity.id, tag: raw.trim(), ...partido });
  }
  return tags;
}

/** El siguiente número libre de la familia: el mayor que hay, más uno. */
export function cadNextDeviceNumber(
  document: Pick<CadDocument, "entities">,
  prefix: string,
): number {
  const clave = prefix.trim().toUpperCase();
  let mayor = 0;
  for (const tag of cadDeviceTagsOf(document))
    if (tag.prefix === clave && tag.number > mayor) mayor = tag.number;
  return mayor + 1;
}

/** Una etiqueta repetida, con quiénes la llevan. */
export interface CadDeviceTagClash {
  tag: string;
  entityIds: string[];
}

/**
 * Etiquetas repetidas en el dibujo.
 *
 * Mismo criterio que los conductores: dos componentes con la misma etiqueta es
 * el error que no se ve en la pantalla y sí en la obra, y entra por copiar y
 * pegar, por un DXF ajeno o por fusionar dos dibujos.
 */
export function cadDeviceTagClashes(
  document: Pick<CadDocument, "entities">,
): CadDeviceTagClash[] {
  const porEtiqueta = new Map<string, string[]>();
  for (const tag of cadDeviceTagsOf(document)) {
    const clave = cadFormatDeviceTag(tag.prefix, tag.number);
    porEtiqueta.set(clave, [...(porEtiqueta.get(clave) ?? []), tag.entityId]);
  }
  return [...porEtiqueta.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([tag, entityIds]) => ({ tag, entityIds: [...entityIds].sort() }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * Componentes SIN etiqueta: inserciones de un símbolo eléctrico que nadie
 * numeró.
 *
 * Se reconocen por su bloque —los símbolos del catálogo llevan id `MEP-…`— y
 * por su capa de servicio eléctrico. Un componente sin etiqueta no sale en la
 * lista de materiales ni en la regleta: desaparece del proyecto sin que nadie
 * lo note, que es justamente por lo que se cuenta aquí.
 */
export function cadUntaggedDevices(
  document: Pick<CadDocument, "entities">,
  isElectrical: (entity: Extract<CadEntity, { type: "insert" }>) => boolean,
): string[] {
  const fuera: string[] = [];
  for (const entity of document.entities) {
    if (entity.type !== "insert") continue;
    if (!isElectrical(entity)) continue;
    const raw = entity.attributes?.[CAD_IE_TAG];
    if (typeof raw === "string" && cadParseDeviceTag(raw)) continue;
    fuera.push(entity.id);
  }
  return fuera;
}

/** ¿Es esta inserción un componente eléctrico del catálogo? */
export const cadIsElectricalInsert = (
  entity: Extract<CadEntity, { type: "insert" }>,
): boolean =>
  entity.layer.toUpperCase().startsWith("IE-") ||
  /^MEP-(LUMINARIA|CONTACTO|APAGADOR|TABLERO)$/u.test(entity.block.toUpperCase());
