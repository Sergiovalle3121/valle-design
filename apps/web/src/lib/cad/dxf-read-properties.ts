/**
 * Lectura de CÓMO se dibuja un DXF: tabla LTYPE, propiedades de capa, escala
 * global del guion y la presentación de cada entidad.
 *
 * ## Por qué a mano y sobre los pares crudos
 *
 * El tokenizador entrega geometría: puntos, radios, ángulos. Lo que decide si
 * una línea se ve como un eje o como un muro —el código 6 con el tipo de línea,
 * el 48 con su escala, el 370 con el grosor— o no lo expone o lo expone de
 * formas distintas según el dialecto. Y las tablas LTYPE y LAYER, que son donde
 * un despacho guarda su convención entera, no las expone en absoluto.
 *
 * Se lee, por tanto, igual que HATCH y las cotas: sobre los pares crudos, en
 * UNA sola pasada, porque recorrer el fichero cinco veces para cinco tablas es
 * lo que convierte un DXF de veinte megas en una espera.
 *
 * ## La correspondencia con lo que entrega el tokenizador
 *
 * El resultado se indexa por TIPO y ORDINAL: la presentación de la tercera
 * LWPOLYLINE del fichero. Es el mismo criterio con el que la importación
 * intercala las primitivas del esquema 4, y aguanta que el tokenizador se salte
 * entidades de OTROS tipos, que es lo que de verdad pasa. VERTEX, SEQEND y
 * ATTRIB no cuentan: no son entidades sueltas sino partes de la POLYLINE o del
 * INSERT que las contiene, y contarlas desalinearía todo lo que viniera detrás.
 *
 * ## Fallo cerrado
 *
 * Un grosor que no está en la enumeración de AutoCAD, un tipo de línea que
 * nadie definió o un patrón con texto o formas incrustadas NO se aceptan a
 * medias ni se descartan en silencio: se ajustan a lo representable y sale un
 * aviso que lo NOMBRA. Una línea que se dibuja «casi» del grosor pedido y no lo
 * dice es peor que una que declara su límite.
 *
 * Módulo puro y HOJA: sólo importa tipos.
 */
import type { CadEntityPresentation, CadPropertySource } from "./cad-document";
import { num, rawDxfPairs, type RawDxfPair } from "./dxf-read-core";

/**
 * Enumeración FIJA de grosores de AutoCAD, en centésimas de milímetro.
 *
 * No es una escala continua: el formato admite estos veinticuatro valores y
 * nada más. Un fichero que traiga 47 está mal formado, y redondearlo en
 * silencio a 50 produciría un plano que se imprime distinto del que el
 * remitente mandó sin que nadie se entere.
 */
export const DXF_LINEWEIGHTS: readonly number[] = [
  0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120,
  140, 158, 200, 211,
];

/** Los tres negativos con significado del código 370. */
export const DXF_LINEWEIGHT_BYLAYER = -1;
export const DXF_LINEWEIGHT_BYBLOCK = -2;
export const DXF_LINEWEIGHT_DEFAULT = -3;

/** Nombres reservados del código 6. No son tipos de línea: son herencias. */
const BYLAYER = "BYLAYER";
const BYBLOCK = "BYBLOCK";

export interface CadDxfLinetypeDefinition {
  name: string;
  description?: string;
  /** Longitudes con signo: >0 trazo, <0 hueco, 0 punto. Vacío en la continua. */
  pattern: number[];
}

export interface CadDxfLayerDefinition {
  name: string;
  /** Índice de color ACI. Negativo en el fichero significa capa apagada. */
  colorIndex?: number;
  /** Nombre del tipo de línea de la capa (código 6). */
  linetype?: string;
  /** Grosor en CENTÉSIMAS de milímetro (código 370), tal y como viene. */
  lineweight?: number;
  /** Bandera 1 del código 70: capa congelada. */
  frozen?: boolean;
}

export interface CadDxfEntityProperties {
  type: string;
  presentation?: CadEntityPresentation;
}

export interface CadDxfPropertyWarning {
  code: string;
  message: string;
  entityType?: string;
  layer?: string;
}

export interface CadDxfProperties {
  /** $LTSCALE: la escala del guion para el dibujo entero. */
  linetypeScale?: number;
  /** $LWDISPLAY: si el dibujo pide mostrar los grosores en pantalla. */
  lineweightDisplay?: boolean;
  linetypes: CadDxfLinetypeDefinition[];
  layers: CadDxfLayerDefinition[];
  /** Presentación de las entidades de ENTITIES, en orden de fichero. */
  entities: CadDxfEntityProperties[];
  /** Ídem por bloque: nombre del BLOCK → sus entidades en orden. */
  blocks: Record<string, CadDxfEntityProperties[]>;
  warnings: CadDxfPropertyWarning[];
}

/** Partes de una POLYLINE o de un INSERT, no entidades por derecho propio. */
const SUB_ENTITY_TYPES = new Set(["VERTEX", "SEQEND", "ATTRIB"]);

/**
 * Ajusta un grosor a la enumeración del formato.
 *
 * Devuelve el valor legal y, si hubo que moverlo, el original para que quien
 * llame pueda declararlo. Ajustar sin declarar sería exactamente el fallo a
 * medias que este producto no comete: el plano se imprimiría con otro grosor y
 * el aviso que lo explicaba no existiría.
 */
export function snapDxfLineweight(raw: number): { value: number; snappedFrom?: number } {
  if (raw === DXF_LINEWEIGHT_BYLAYER || raw === DXF_LINEWEIGHT_BYBLOCK || raw === DXF_LINEWEIGHT_DEFAULT)
    return { value: raw };
  if (DXF_LINEWEIGHTS.includes(raw)) return { value: raw };
  // Fuera de rango por arriba o por abajo: los extremos de la enumeración.
  const clamped = Math.min(Math.max(raw, DXF_LINEWEIGHTS[0]), DXF_LINEWEIGHTS[DXF_LINEWEIGHTS.length - 1]);
  let nearest = DXF_LINEWEIGHTS[0];
  for (const candidate of DXF_LINEWEIGHTS)
    if (Math.abs(candidate - clamped) < Math.abs(nearest - clamped)) nearest = candidate;
  return { value: nearest, snappedFrom: raw };
}

/**
 * Presentación de una entidad a partir de SUS pares.
 *
 * El código 6 ausente significa BYLAYER: es el caso mayoritario de cualquier
 * fichero real y hay que registrarlo como herencia EXPLÍCITAMENTE, porque un
 * documento que no sabe que una entidad hereda no puede repintarla cuando su
 * capa cambia. Lo mismo vale para el 370 ausente.
 */
export function dxfEntityPresentation(
  pairs: readonly RawDxfPair[],
  warnings: CadDxfPropertyWarning[],
  entityType: string,
): CadEntityPresentation | undefined {
  const first = (code: number) => pairs.find((pair) => pair.code === code)?.value;
  const rawLinetype = first(6)?.trim();
  const rawScale = num(first(48));
  const rawWeight = num(first(370));
  const layer = first(8);
  if (rawLinetype === undefined && rawScale === null && rawWeight === null) return undefined;

  const presentation: CadEntityPresentation = {};
  if (rawLinetype !== undefined || rawScale !== null) {
    const upper = (rawLinetype ?? BYLAYER).toUpperCase();
    const source: CadPropertySource =
      upper === BYBLOCK ? "byBlock" : upper === BYLAYER ? "byLayer" : "explicit";
    presentation.linetype = {
      source,
      ...(source === "explicit" ? { value: rawLinetype } : {}),
      // La escala propia viaja pase lo que pase con el origen: una entidad que
      // hereda el tipo de línea y corrige SU escala es lo normal en un detalle.
      ...(rawScale !== null && rawScale > 0 ? { scale: rawScale } : {}),
    };
  }
  if (rawWeight !== null) {
    const { value, snappedFrom } = snapDxfLineweight(Math.round(rawWeight));
    if (snappedFrom !== undefined)
      warnings.push({
        code: "lineweight_no_enumerado",
        message: `Grosor ${snappedFrom} fuera de la enumeración de AutoCAD: se ajusta a ${value} centésimas de mm.`,
        entityType,
        ...(layer ? { layer } : {}),
      });
    presentation.lineweight =
      value === DXF_LINEWEIGHT_BYLAYER
        ? { source: "byLayer" }
        : value === DXF_LINEWEIGHT_BYBLOCK
          ? { source: "byBlock" }
          : { source: "explicit", value };
  }
  return presentation;
}

/** Estado del recorrido: en qué sección y en qué tabla estamos. */
interface Cursor {
  section: string | null;
  expectSectionName: boolean;
  table: string | null;
  block: string | null;
}

function flushRecord(
  cursor: Cursor,
  type: string,
  pairs: RawDxfPair[],
  result: CadDxfProperties,
): void {
  const upper = type.toUpperCase();
  if (cursor.section === "TABLES" && cursor.table === "LTYPE" && upper === "LTYPE") {
    const name = pairs.find((pair) => pair.code === 2)?.value?.trim();
    if (!name) return;
    const pattern = pairs.filter((pair) => pair.code === 49).map((pair) => num(pair.value) ?? 0);
    // Código 74 distinto de 0: el elemento lleva texto o una forma incrustada.
    // El patrón de guiones se conserva —es lo que sí sabemos dibujar— y la
    // parte que no, se declara. Callarla daría un tipo de línea que se llama
    // igual y se ve distinto, que se descubre al imprimir.
    if (pairs.some((pair) => pair.code === 74 && (num(pair.value) ?? 0) !== 0))
      result.warnings.push({
        code: "linetype_complejo",
        message: `El tipo de línea "${name}" lleva texto o formas incrustadas: se conserva sólo su patrón de guiones.`,
      });
    result.linetypes.push({
      name,
      ...(pairs.find((pair) => pair.code === 3)?.value ? { description: pairs.find((pair) => pair.code === 3)!.value } : {}),
      pattern,
    });
    return;
  }
  if (cursor.section === "TABLES" && cursor.table === "LAYER" && upper === "LAYER") {
    const name = pairs.find((pair) => pair.code === 2)?.value?.trim();
    if (!name) return;
    const colorIndex = num(pairs.find((pair) => pair.code === 62)?.value);
    const linetype = pairs.find((pair) => pair.code === 6)?.value?.trim();
    const rawWeight = num(pairs.find((pair) => pair.code === 370)?.value);
    const flags = num(pairs.find((pair) => pair.code === 70)?.value) ?? 0;
    let lineweight: number | undefined;
    if (rawWeight !== null) {
      const { value, snappedFrom } = snapDxfLineweight(Math.round(rawWeight));
      if (snappedFrom !== undefined)
        result.warnings.push({
          code: "lineweight_no_enumerado",
          message: `Grosor ${snappedFrom} de la capa "${name}" fuera de la enumeración: se ajusta a ${value} centésimas de mm.`,
          layer: name,
        });
      // Una CAPA no puede heredar de sí misma: BYLAYER en un registro LAYER no
      // significa nada y se lee como «lo que diga el trazador».
      lineweight = value === DXF_LINEWEIGHT_BYLAYER || value === DXF_LINEWEIGHT_BYBLOCK
        ? DXF_LINEWEIGHT_DEFAULT
        : value;
    }
    result.layers.push({
      name,
      ...(colorIndex !== null ? { colorIndex } : {}),
      ...(linetype ? { linetype } : {}),
      ...(lineweight !== undefined ? { lineweight } : {}),
      ...((flags & 1) === 1 ? { frozen: true } : {}),
    });
    return;
  }
  if (SUB_ENTITY_TYPES.has(upper)) return;
  if (cursor.section === "ENTITIES") {
    result.entities.push({ type: upper, ...presentationOrNothing(pairs, result.warnings, upper) });
    return;
  }
  if (cursor.section === "BLOCKS" && cursor.block && upper !== "BLOCK" && upper !== "ENDBLK") {
    (result.blocks[cursor.block] ??= []).push({
      type: upper,
      ...presentationOrNothing(pairs, result.warnings, upper),
    });
  }
}

function presentationOrNothing(
  pairs: RawDxfPair[],
  warnings: CadDxfPropertyWarning[],
  type: string,
): { presentation?: CadEntityPresentation } {
  const presentation = dxfEntityPresentation(pairs, warnings, type);
  return presentation ? { presentation } : {};
}

/**
 * Una sola pasada sobre los pares: cabecera, tablas, bloques y entidades.
 *
 * El recorrido es plano a propósito. Un DXF de texto no tiene anidamiento
 * sintáctico: lo que hay son marcadores `0` que abren registros y secciones que
 * se cierran con `ENDSEC`. Escribirlo como una gramática costaría más y no
 * encontraría un solo fallo más.
 */
export function parseRawDxfProperties(text: string): CadDxfProperties {
  const pairs = rawDxfPairs(text);
  const result: CadDxfProperties = {
    linetypes: [],
    layers: [],
    entities: [],
    blocks: {},
    warnings: [],
  };
  const cursor: Cursor = { section: null, expectSectionName: false, table: null, block: null };
  let pendingType: string | null = null;
  let pendingPairs: RawDxfPair[] = [];
  let headerVariable: string | null = null;
  let expectTableName = false;

  const flush = () => {
    if (pendingType !== null) flushRecord(cursor, pendingType, pendingPairs, result);
    pendingType = null;
    pendingPairs = [];
  };

  for (const pair of pairs) {
    if (pair.code === 0) {
      const type = pair.value.toUpperCase();
      flush();
      if (type === "SECTION") {
        cursor.expectSectionName = true;
        cursor.table = null;
        cursor.block = null;
        continue;
      }
      if (type === "ENDSEC" || type === "EOF") {
        cursor.section = null;
        cursor.table = null;
        cursor.block = null;
        continue;
      }
      if (type === "TABLE") {
        expectTableName = true;
        continue;
      }
      if (type === "ENDTAB") {
        cursor.table = null;
        continue;
      }
      if (type === "ENDBLK") {
        cursor.block = null;
        continue;
      }
      pendingType = type;
      pendingPairs = [];
      continue;
    }
    if (cursor.expectSectionName && pair.code === 2) {
      cursor.section = pair.value.toUpperCase();
      cursor.expectSectionName = false;
      continue;
    }
    if (expectTableName && pair.code === 2) {
      cursor.table = pair.value.toUpperCase();
      expectTableName = false;
      continue;
    }
    if (cursor.section === "HEADER") {
      if (pair.code === 9) {
        headerVariable = pair.value.toUpperCase();
        continue;
      }
      if (headerVariable === "$LTSCALE" && pair.code === 40) {
        const value = num(pair.value);
        if (value !== null && value > 0) result.linetypeScale = value;
        headerVariable = null;
        continue;
      }
      if (headerVariable === "$LWDISPLAY" && pair.code === 290) {
        result.lineweightDisplay = num(pair.value) === 1;
        headerVariable = null;
        continue;
      }
      continue;
    }
    // El nombre del BLOCK abre su lista; se registra antes de acumular pares
    // para que las entidades que vengan detrás caigan en el bloque correcto.
    if (cursor.section === "BLOCKS" && pendingType === "BLOCK" && pair.code === 2) {
      cursor.block = pair.value.trim();
      result.blocks[cursor.block] ??= [];
    }
    pendingPairs.push(pair);
  }
  flush();
  return result;
}

/**
 * Índice por tipo y ordinal. Se construye una vez y se consulta por cada
 * entidad que entrega el tokenizador, en su orden.
 */
export function dxfPropertyIndex(
  entries: readonly CadDxfEntityProperties[],
): (type: string, ordinal: number) => CadEntityPresentation | undefined {
  const byType = new Map<string, CadDxfEntityProperties[]>();
  for (const entry of entries) {
    const list = byType.get(entry.type);
    if (list) list.push(entry);
    else byType.set(entry.type, [entry]);
  }
  return (type, ordinal) => byType.get(type.toUpperCase())?.[ordinal]?.presentation;
}

/**
 * Comprueba que cada tipo de línea NOMBRADO esté DEFINIDO, y declara los que
 * no. Un nombre sin definición se dibuja continuo; que eso pase es defendible,
 * que pase callando no.
 */
export function auditDxfLinetypeReferences(properties: CadDxfProperties): CadDxfPropertyWarning[] {
  const defined = new Set(properties.linetypes.map((entry) => entry.name.toUpperCase()));
  const missing = new Map<string, string>();
  const consider = (name: string | undefined, layer?: string) => {
    if (!name) return;
    const upper = name.toUpperCase();
    if (upper === BYLAYER || upper === BYBLOCK || upper === "CONTINUOUS") return;
    if (!defined.has(upper) && !missing.has(upper)) missing.set(upper, layer ?? "");
  };
  for (const layer of properties.layers) consider(layer.linetype, layer.name);
  for (const entry of [...properties.entities, ...Object.values(properties.blocks).flat()])
    consider(entry.presentation?.linetype?.value);
  return [...missing].map(([name, layer]) => ({
    code: "linetype_sin_definicion",
    message: `El tipo de línea "${name}" se usa y no está definido en la tabla LTYPE: se dibuja continuo.`,
    ...(layer ? { layer } : {}),
  }));
}
