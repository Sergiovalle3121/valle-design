/**
 * Campos que se rellenan solos.
 *
 * ## El problema
 *
 * El cajetín de un plano dice su número, su título, su escala, su fecha y su
 * revisión. Escribirlos a mano en veinte hojas garantiza que dentro de un mes
 * tres digan la revisión anterior — no porque nadie sea descuidado, sino
 * porque la información vive en dos sitios y sólo se actualiza uno.
 *
 * ## La sintaxis
 *
 * La de AutoCAD: `%<SheetNumber>%`. Se escribe una vez en el bloque de cajetín
 * y se resuelve en el momento de publicar, contra el conjunto y la hoja. Un
 * campo que no se conoce **se deja tal cual** en vez de vaciarse: un cajetín
 * con `%<Cliente>%` a la vista dice qué falta; uno vacío no dice nada y se
 * imprime así.
 */
import type { CadPaperSpace } from "../cad-document";
import type { CadSheetSet, CadSheetSetSheet } from "./sheet-set";
import { ordered } from "./sheet-set";

/** `%<Campo>%`, con el nombre sin distinguir mayúsculas. */
const FIELD = /%<\s*([A-Za-z0-9_.-]+)\s*>%/g;

export interface CadSheetFieldContext {
  set: CadSheetSet;
  sheet: CadSheetSetSheet;
  /** Presentación de la que sale la hoja, si está cargada. */
  layout?: CadPaperSpace;
  /** Fecha de publicación. Se inyecta: `new Date()` haría los planos irreproducibles. */
  date: string;
  /** Escalas de las ventanas de la presentación, ya formateadas. */
  scales?: readonly string[];
}

/**
 * Diccionario resuelto de una hoja.
 *
 * El orden de precedencia es el que la gente espera: lo propio de la hoja gana
 * sobre lo común del conjunto, y los campos calculados —número, total, fecha—
 * ganan sobre los dos, porque son la verdad del momento de publicar y no una
 * copia guardada.
 */
export function cadSheetFieldValues(context: CadSheetFieldContext): Record<string, string> {
  const { set, sheet, layout } = context;
  const sheets = ordered(set);
  const position = sheets.findIndex((candidate) => candidate.id === sheet.id) + 1;
  const scales = context.scales ?? layoutScales(layout);

  return {
    // Comunes del conjunto, primero: cualquiera de los de abajo los pisa.
    ...lower(set.fields),
    ...lower(sheet.fields ?? {}),
    sheetset: set.name,
    sheetsetdescription: set.description ?? "",
    sheetnumber: sheet.number,
    sheettitle: sheet.title,
    sheetrevision: sheet.revision,
    sheetcount: String(sheets.length),
    sheetposition: String(position),
    // `3 de 12`, que es lo que de verdad se imprime en un cajetín.
    sheetof: `${position} de ${sheets.length}`,
    layoutname: layout?.name ?? "",
    scale: scales.length === 1 ? scales[0] : scales.join(" / "),
    date: context.date,
    documentid: sheet.documentId,
    layoutid: sheet.layoutId,
  };
}

function lower(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.toLowerCase(), value]));
}

function layoutScales(layout?: CadPaperSpace): string[] {
  if (!layout?.viewports?.length) return [];
  return [...new Set(layout.viewports.map((viewport) => `1:${viewport.scale}`))];
}

/**
 * Sustituye los campos de un texto.
 *
 * Lo desconocido se queda escrito. Es deliberado: un `%<Cliente>%` visible en
 * el plano es un error que salta a la vista al revisarlo; un hueco en blanco
 * pasa la revisión y llega a obra.
 */
export function resolveCadSheetFields(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(FIELD, (match, name: string) => {
    const value = values[name.toLowerCase()];
    return value === undefined ? match : value;
  });
}

/** Campos sin resolver que quedan en un texto. Para avisar antes de publicar. */
export function unresolvedCadSheetFields(
  text: string,
  values: Record<string, string>,
): string[] {
  return [...text.matchAll(FIELD)]
    .map((match) => match[1])
    .filter((name) => values[name.toLowerCase()] === undefined);
}

export interface CadSheetTitleBlockResult {
  attributes: Record<string, string>;
  /** Nombres de campo que no se pudieron resolver, sin repetir. */
  unresolved: string[];
}

/**
 * Cajetín de una hoja con todos sus campos resueltos.
 *
 * Devuelve los atributos listos para escribir en la presentación, y la lista
 * de lo que no se pudo resolver. Las dos cosas: publicar con un campo colgando
 * es legítimo —a veces el cliente aún no tiene nombre— pero tiene que quedar
 * dicho.
 */
export function resolveCadSheetTitleBlock(
  context: CadSheetFieldContext,
): CadSheetTitleBlockResult {
  const values = cadSheetFieldValues(context);
  const source = context.layout?.titleBlock?.attributes ?? {};
  const attributes: Record<string, string> = {};
  const unresolved = new Set<string>();

  for (const [key, value] of Object.entries(source)) {
    attributes[key] = resolveCadSheetFields(value, values);
    for (const missing of unresolvedCadSheetFields(value, values)) unresolved.add(missing);
  }

  // Los cuatro que un cajetín siempre lleva se rellenan cuando la plantilla NO
  // los trae: un conjunto de planos sin número de plano no es un conjunto.
  //
  // Sólo cuando faltan. Pisarlos siempre destrozaría una plantilla que ya los
  // compone a su manera —«Hoja %<SheetOf>%» quedaría reducido a «1 de 4»— y el
  // sentido de tener plantilla es precisamente que el estudio decida el texto.
  const fill = (key: string, value: string) => {
    if (!value) return;
    if (!attributes[key]?.trim()) attributes[key] = value;
  };
  fill("SHEET_NO", context.sheet.number);
  fill("TITLE", context.sheet.title);
  fill("REVISION", context.sheet.revision);
  fill("SHEET_OF", values.sheetof);

  return { attributes, unresolved: [...unresolved].sort() };
}
