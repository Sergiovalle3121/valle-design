/**
 * Extracción de atributos de bloque (ATTEXT / EATTEXT) a CSV: la lista de
 * puertas, la de luminarias… con sus valores por bloque.
 *
 * ## El hueco concreto que esto cierra
 *
 * `DATAEXTRACTION` (`data-extraction/data-extraction.ts`) ya entrega tres
 * cuadros — muros, carpintería, locales — pero los TRES se calculan de la
 * GEOMETRÍA del modelo (longitudes, áreas, huecos alojados en muro). Ninguno
 * lee el atributo de una inserción: un despacho que rotula sus luminarias con
 * un bloque `LUM-01` con atributos `POTENCIA`/`CIRCUITO`/`MARCA` no tenía
 * ninguna orden que le devolviera esos valores, uno por inserción, en un CSV.
 * Eso es lo que hace `ATTEXT` en AutoCAD (hoy fundido en `EATTEXT`/
 * `DATAEXTRACTION` en las versiones modernas) y lo que faltaba aquí: recorrer
 * las inserciones de un bloque y sacar sus atributos EN COLUMNAS, no en el
 * cuadro de cantidades del modelo.
 *
 * ## Por qué una SECCIÓN por bloque, y no una tabla única
 *
 * Dos bloques con atributos distintos (`PUERTA` con `ANCHO`/`ALTO`, `LUM-01`
 * con `POTENCIA`/`CIRCUITO`) no comparten columnas: forzarlos a la misma tabla
 * dejaría celdas vacías cruzadas sin sentido, o obligaría a elegir UN bloque
 * por extracción y perder «todo el plano de un tirón». La salida CSV de
 * `DATAEXTRACTION` ya resuelve exactamente este mismo problema para
 * MUROS/CARPINTERÍA/LOCALES con secciones separadas en un solo archivo
 * (`buildCadDataExtractionCsv`); esto es la misma idea aplicada a bloques.
 *
 * ## Qué NO hace
 *
 * No inventa una posición ni dibuja nada: es lectura pura del documento, como
 * `mechanical-bom.ts` y a diferencia de `block-workflow.ts` (que sí escribe).
 * Se prueba en Node sin motor de comandos.
 */
import type { CadBlockDefinition, CadEntity } from "../cad-document";
import { cadResolveInsertAttributes } from "./block-workflow";

type CadInsertEntity = Extract<CadEntity, { type: "insert" }>;

export interface CadAttributeExtractionRow {
  /** Id de la inserción concreta: la fila del CSV es UNA instancia del bloque. */
  insertId: string;
  /** Valor resuelto de cada etiqueta (constante o de instancia; nunca falta una). */
  values: Record<string, string>;
}

export interface CadAttributeExtractionSection {
  /** Nombre visible del bloque, tal como aparece en la tabla de bloques. */
  block: string;
  /** Las columnas, en el mismo orden en las que se escriben las filas. */
  tags: string[];
  rows: CadAttributeExtractionRow[];
}

/** Un bloque «con atributos» es el que ATTDEF le puso al menos uno. */
export function cadBlockHasAttributes(block: Pick<CadBlockDefinition, "attributes">): boolean {
  return !!block.attributes && Object.keys(block.attributes).length > 0;
}

/**
 * Las inserciones de un bloque concreto. Compara por ID (lo que escribe
 * `cadInsertBlockCommands`) O por NOMBRE (lo que puede traer un DXF
 * importado, ver `cad-burst.ts`), para no perder inserciones legítimas por
 * una diferencia de convención con la que esta orden no tiene que ver.
 */
export function cadBlockInsertsOf(
  entities: readonly CadEntity[],
  block: Pick<CadBlockDefinition, "id" | "name">,
): CadInsertEntity[] {
  return entities.filter(
    (entity): entity is CadInsertEntity =>
      entity.type === "insert" && (entity.block === block.id || entity.block === block.name),
  );
}

/**
 * La sección de UN bloque: sus etiquetas (orden alfabético, estable entre
 * corridas) y una fila por inserción (ordenadas por id, por la misma razón).
 * El valor de cada celda pasa por `cadResolveInsertAttributes`: un atributo
 * CONSTANTE sale con el valor de la definición aunque la inserción no lo
 * traiga, y ninguna columna queda vacía por un atributo que nunca se preguntó
 * (predefinido, T-ola4).
 */
export function cadAttributeExtractionSection(
  entities: readonly CadEntity[],
  block: CadBlockDefinition,
): CadAttributeExtractionSection {
  const tags = Object.keys(block.attributes ?? {}).sort();
  const rows = cadBlockInsertsOf(entities, block)
    .map((insert) => ({
      insertId: insert.id,
      values: cadResolveInsertAttributes(block, insert.attributes ?? {}),
    }))
    .sort((a, b) => a.insertId.localeCompare(b.insertId));
  return { block: block.name, tags, rows };
}

/**
 * Todas las secciones de un documento: un bloque SIN atributos no aporta
 * ninguna (no hay nada que extraer), y las que quedan salen ordenadas por
 * nombre para que el CSV sea reproducible.
 */
export function cadAttributeExtractionSections(
  entities: readonly CadEntity[],
  blocks: readonly CadBlockDefinition[],
): CadAttributeExtractionSection[] {
  return blocks
    .filter(cadBlockHasAttributes)
    .map((block) => cadAttributeExtractionSection(entities, block))
    .sort((a, b) => a.block.localeCompare(b.block));
}

function csvValue(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvLine(values: readonly string[]): string {
  return values.map(csvValue).join(",");
}

/**
 * El CSV: una sección por bloque, con «Identificador» de primera columna
 * —la fila del plano a la que corresponde, para poder volver a encontrarla—
 * y luego una columna por etiqueta. Mismo separador de secciones (línea en
 * blanco) y mismo `\r\n` que `buildCadDataExtractionCsv`, para que Excel abra
 * los dos sin preguntar nada.
 */
export function buildCadAttributeExtractionCsv(sections: readonly CadAttributeExtractionSection[]): string {
  const lines: string[] = [];
  sections.forEach((section, index) => {
    if (index > 0) lines.push("");
    lines.push(section.block.toLocaleUpperCase());
    lines.push(csvLine(["Identificador", ...section.tags]));
    for (const row of section.rows)
      lines.push(csvLine([row.insertId, ...section.tags.map((tag) => row.values[tag] ?? "")]));
  });
  return lines.join("\r\n");
}
