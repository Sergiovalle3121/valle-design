/**
 * Cómo se ESCRIBE el resultado de una consulta.
 *
 * DIST, ID, AREA, LIST y MASSPROP comparten un problema que no es de cálculo:
 * un número sin unidades ni contexto no vale para nada. `3.5` puede ser tres
 * metros y medio o tres pies y seis pulgadas, y el CAD que enseña `3.5` a quien
 * espera `3'-6"` no se usa en Estados Unidos por muy correcto que sea su
 * cálculo.
 *
 * Por eso todo lo que sale de aquí pasa por `unit-format.ts` y `unit-angle.ts`
 * con la configuración VIVA del dibujo (`LUNITS`, `LUPREC`, `AUNITS`,
 * `AUPREC`, `ANGBASE`, `ANGDIR`). Cambiar UNITS cambia lo que imprime DIST, sin
 * que DIST se entere.
 *
 * El formato de los renglones imita al de AutoCAD a conciencia: quien lleva
 * veinte años leyendo `Delta X = …  Delta Y = …` lo encuentra sin buscarlo.
 */
import type { CadEntity, CadPoint2, CadPoint3 } from "../cad-document";
import {
  CAD_ENTITY_REGISTRY,
  type CadEntityRegistry,
  type CadPropertyValue,
} from "../entity-runtime";
import {
  cadActiveUcs,
  cadAngleFormat,
  cadLengthFormat,
  createCadVariableAccess,
  type CadVariableAccess,
} from "../system-variables";
import {
  cadUcsVectorAngle,
  worldAngleToUcs,
  worldToUcs,
  worldVectorToUcs,
  type CadNamedUcs,
} from "../ucs";
import { formatAngle } from "../unit-angle";
import { formatLength } from "../unit-format";
import { cadEntityArea, cadMassProperties, type CadMassProperties } from "./contours";

export interface CadReportFormat {
  length: (value: number) => string;
  /** Un área está en unidades CUADRADAS: el sufijo cambia, la precisión no. */
  area: (value: number) => string;
  angle: (degrees: number) => string;
}

/**
 * El formateador que corresponde a las variables de sistema actuales.
 *
 * Las áreas se escriben SIEMPRE en decimal aunque las longitudes vayan en
 * arquitectónico: `12'-6" cuadrados` no significa nada, y AutoCAD tampoco lo
 * escribe así. Es la única desviación respecto de `LUNITS`, y es deliberada.
 */
export function cadReportFormat(variables: CadVariableAccess): CadReportFormat {
  const length = cadLengthFormat(variables);
  const angle = cadAngleFormat(variables);
  const areaPrecision = Math.max(2, length.precision ?? 4);
  return {
    length: (value) => formatLength(value, length),
    area: (value) => value.toFixed(areaPrecision),
    angle: (degrees) => formatAngle(degrees, angle),
  };
}

/**
 * Todo lo que una consulta necesita saber del entorno: cómo escribir los
 * números y en qué sistema de coordenadas informar.
 *
 * Va junto porque siempre se usa junto, y porque separarlo dejaría comandos que
 * formatean bien pero informan en coordenadas del mundo — el error más difícil
 * de ver, porque el número parece correcto.
 */
export interface CadInquiryLens {
  format: CadReportFormat;
  ucs: CadNamedUcs;
  /**
   * Punto del mundo → punto tal y como hay que enseñarlo.
   *
   * Devuelve TRES coordenadas y no dos. Sobre un SCU de planta la tercera es la
   * cota de siempre; sobre un SCU apoyado en una cara inclinada es la distancia
   * al plano de trabajo, que es justo el número que dice si el punto está sobre
   * la cara o flotando. Recortarlo a dos habría hecho que ID informara la misma
   * coordenada para dos puntos separados un metro.
   */
  point(point: CadPoint2 | CadPoint3): CadPoint3;
  /** Desplazamiento del mundo → desplazamiento en el SCU: gira, no traslada. */
  vector(vector: CadPoint2 | CadPoint3): CadPoint3;
  /** Ángulo del mundo → ángulo en el SCU. */
  angle(degrees: number): number;
  /** Ángulo de un desplazamiento del mundo, medido ya en el plano del SCU. */
  vectorAngle(vector: CadPoint2 | CadPoint3): number;
}

export function cadInquiryLens(variables?: CadVariableAccess): CadInquiryLens {
  const access = variables ?? createCadVariableAccess();
  const ucs = cadActiveUcs(access);
  return {
    format: cadReportFormat(access),
    ucs,
    point: (point) => worldToUcs(point, ucs),
    vector: (vector) => worldVectorToUcs(vector, ucs),
    angle: (degrees) => worldAngleToUcs(degrees, ucs),
    vectorAngle: (vector) => cadUcsVectorAngle(vector, ucs),
  };
}

function flat(point: CadPoint2 | CadPoint3): { x: number; y: number; z: number } {
  return { x: point.x, y: point.y, z: "z" in point ? point.z : 0 };
}

/** `X = 10.00  Y = 20.00  Z = 0.00`, con el formato del dibujo. */
export function formatCadPoint(
  point: CadPoint2 | CadPoint3,
  format: CadReportFormat,
): string {
  const p = flat(point);
  return `X = ${format.length(p.x)}  Y = ${format.length(p.y)}  Z = ${format.length(p.z)}`;
}

export interface CadDistanceReport {
  distance: number;
  planarDistance: number;
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  /** Ángulo en el plano XY, en grados del mundo. */
  angleXY: number;
  /** Ángulo desde el plano XY: 0 si ambos puntos están a la misma cota. */
  angleFromXY: number;
}

export function cadDistanceBetween(
  from: CadPoint2 | CadPoint3,
  to: CadPoint2 | CadPoint3,
): CadDistanceReport {
  const a = flat(from);
  const b = flat(to);
  const deltaX = b.x - a.x;
  const deltaY = b.y - a.y;
  const deltaZ = b.z - a.z;
  const planar = Math.hypot(deltaX, deltaY);
  return {
    distance: Math.hypot(planar, deltaZ),
    planarDistance: planar,
    deltaX,
    deltaY,
    deltaZ,
    angleXY: (Math.atan2(deltaY, deltaX) * 180) / Math.PI,
    angleFromXY: (Math.atan2(deltaZ, planar) * 180) / Math.PI,
  };
}

/** El volcado de DIST, renglón a renglón. */
export function formatCadDistanceReport(
  report: CadDistanceReport,
  format: CadReportFormat,
): string[] {
  return [
    `Distancia = ${format.length(report.distance)}, ` +
      `Ángulo en plano XY = ${format.angle(report.angleXY)}, ` +
      `Ángulo desde plano XY = ${format.angle(report.angleFromXY)}`,
    `Delta X = ${format.length(report.deltaX)}   ` +
      `Delta Y = ${format.length(report.deltaY)}   ` +
      `Delta Z = ${format.length(report.deltaZ)}`,
  ];
}

/**
 * Acumulador de AREA: suma y resta encadenadas.
 *
 * AutoCAD no calcula «el área»: lleva un TOTAL al que se le añaden y se le
 * restan trozos hasta que el usuario da por buena la cuenta. Medir el hueco de
 * un forjado es literalmente eso —sumar la losa, restar los huecos— y sin el
 * acumulador hay que hacerlo con una calculadora al lado.
 */
export interface CadAreaAccumulator {
  total: number;
  perimeterTotal: number;
  /** Cuántas piezas se han sumado y cuántas restado. */
  added: number;
  subtracted: number;
}

export const EMPTY_CAD_AREA: CadAreaAccumulator = {
  total: 0,
  perimeterTotal: 0,
  added: 0,
  subtracted: 0,
};

export function accumulateCadArea(
  accumulator: CadAreaAccumulator,
  area: number,
  perimeter: number,
  mode: "add" | "subtract",
): CadAreaAccumulator {
  const sign = mode === "add" ? 1 : -1;
  return {
    total: accumulator.total + sign * area,
    perimeterTotal: accumulator.perimeterTotal + sign * perimeter,
    added: accumulator.added + (mode === "add" ? 1 : 0),
    subtracted: accumulator.subtracted + (mode === "subtract" ? 1 : 0),
  };
}

export function formatCadAreaReport(
  accumulator: CadAreaAccumulator,
  format: CadReportFormat,
): string {
  const pieces = accumulator.added + accumulator.subtracted;
  const detail =
    pieces > 1
      ? ` (${accumulator.added} sumada(s), ${accumulator.subtracted} restada(s))`
      : "";
  return (
    `Área = ${format.area(accumulator.total)}, ` +
    `Perímetro = ${format.length(accumulator.perimeterTotal)}${detail}`
  );
}

function formatPropertyValue(value: CadPropertyValue, format: CadReportFormat): string {
  if (typeof value === "number") return format.length(value);
  if (typeof value === "boolean") return value ? "sí" : "no";
  return value;
}

/**
 * El volcado de LIST: todo lo que el documento sabe de una entidad.
 *
 * Las propiedades salen del REGISTRO (`properties.read`), no de una lista
 * escrita a mano. Es la diferencia entre un LIST que enseña los tipos de hoy y
 * uno que enseñará los que registren T7 y las olas siguientes sin tocar este
 * archivo.
 */
export function describeCadEntity(
  entity: CadEntity,
  format: CadReportFormat,
  registry: CadEntityRegistry = CAD_ENTITY_REGISTRY,
): string[] {
  const lines: string[] = [];
  lines.push(`${entity.type.toUpperCase()}   Capa: "${"layer" in entity ? entity.layer : "—"}"`);
  lines.push(`  Identificador: ${entity.id}`);

  const context = "context" in entity ? entity.context : undefined;
  if (context?.handle) lines.push(`  Handle: ${context.handle}`);
  const presentation = context?.presentation;
  lines.push(
    `  Color: ${describeSource(presentation?.color?.source, presentation?.color?.value)}` +
      `   Tipo de línea: ${describeSource(presentation?.linetype?.source, presentation?.linetype?.value)}` +
      `   Grosor: ${describeSource(
        presentation?.lineweight?.source,
        presentation?.lineweight?.value === undefined
          ? undefined
          : `${presentation.lineweight.value} mm`,
      )}`,
  );
  if (context?.elevation !== undefined)
    lines.push(`  Elevación: ${format.length(context.elevation)}`);

  if (!registry.supports(entity)) {
    lines.push("  (entidad heredada: el registro nativo no la describe)");
    return lines;
  }

  const properties = registry.adapter(entity).properties.read(entity);
  for (const [key, value] of Object.entries(properties).sort(([a], [b]) => a.localeCompare(b)))
    lines.push(`  ${key}: ${formatPropertyValue(value, format)}`);

  const measured = cadEntityArea(entity, registry);
  if (measured) {
    lines.push(`  Área: ${format.area(measured.area)}`);
    lines.push(`  ${measured.assumedClosed ? "Longitud" : "Perímetro"}: ${format.length(measured.perimeter)}`);
  }

  const bounds = registry.adapter(entity).bounds.bounds(entity);
  lines.push(
    `  Extensión: (${format.length(bounds.minX)}, ${format.length(bounds.minY)}) – ` +
      `(${format.length(bounds.maxX)}, ${format.length(bounds.maxY)})`,
  );

  if (context?.metadata)
    for (const [key, value] of Object.entries(context.metadata))
      lines.push(`  [meta] ${key}: ${value === null ? "—" : value}`);

  return lines;
}

function describeSource(source: string | undefined, value: unknown): string {
  if (!source || source === "byLayer") return "PorCapa";
  if (source === "byBlock") return "PorBloque";
  return value === undefined ? String(source) : String(value);
}

/** El volcado de MASSPROP para una región 2D. */
export function formatCadMassProperties(
  properties: CadMassProperties,
  format: CadReportFormat,
): string[] {
  return [
    "---------------- REGIONES ----------------",
    `Área:                    ${format.area(properties.area)}`,
    `Perímetro:               ${format.length(properties.perimeter)}`,
    `Rectángulo delimitador:  X: ${format.length(properties.bounds.minX)} – ${format.length(properties.bounds.maxX)}`,
    `                         Y: ${format.length(properties.bounds.minY)} – ${format.length(properties.bounds.maxY)}`,
    `Centroide:               X: ${format.length(properties.centroid.x)}`,
    `                         Y: ${format.length(properties.centroid.y)}`,
    `Momentos de inercia:     X: ${properties.momentsOfInertia.x.toExponential(4)}`,
    `                         Y: ${properties.momentsOfInertia.y.toExponential(4)}`,
    `Producto de inercia:     XY: ${properties.productOfInertia.toExponential(4)}`,
    `Radios de giro:          X: ${format.length(properties.radiiOfGyration.x)}`,
    `                         Y: ${format.length(properties.radiiOfGyration.y)}`,
    "Momentos principales y direcciones X-Y respecto del centroide:",
    `                         I: ${properties.principal.major.toExponential(4)} a ${format.angle(properties.principal.angleDeg)}`,
    `                         J: ${properties.principal.minor.toExponential(4)} a ${format.angle(properties.principal.angleDeg + 90)}`,
  ];
}

export { cadMassProperties };
