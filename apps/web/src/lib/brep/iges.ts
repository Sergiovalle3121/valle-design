/**
 * IGES 5.3: escritura y lectura de un B-rep facetado.
 *
 * IGES es de 1980 y se nota: registros de 80 columnas, cinco secciones, cadenas
 * en formato Hollerith (`5HHOLA`) y punteros que son NÚMEROS DE LÍNEA de la
 * sección de directorio. Nada de eso es difícil, pero todo es fácil de hacer
 * mal, y el archivo resultante o se abre o no: no hay término medio.
 *
 * LAS CINCO SECCIONES, y qué se juega cada una:
 *
 *   S  Start      texto libre para humanos.
 *   G  Global     delimitadores, unidades, precisión, autor. Es donde se dice
 *                 que el separador es la coma y el terminador el punto y coma;
 *                 escribirlo mal hace ilegible TODO lo demás.
 *   D  Directory  dos líneas de nueve campos de ocho columnas por entidad.
 *   P  Parameter  los datos, con el puntero a su directorio en las columnas
 *                 65-72 de CADA línea. Olvidarlo en las líneas de continuación
 *                 es el error más común.
 *   T  Terminate  cuántas líneas tiene cada sección.
 *
 * LOS PUNTEROS SON IMPARES. Cada entrada de directorio ocupa dos líneas, así que
 * la entidad k-ésima vive en la línea `2k+1`. Un puntero par es un puntero mal
 * calculado, y aquí se genera siempre desde el índice para que no haya forma de
 * equivocarse a mano.
 *
 * REPRESENTACIÓN ELEGIDA. Cada cara plana se escribe como Tipo 144 (superficie
 * paramétrica recortada) sobre Tipo 190 (superficie plana), con sus contornos
 * como Tipo 142 (curva sobre superficie) que apunta a un Tipo 102 (curva
 * compuesta) de Tipos 110 (rectas). Es la representación estándar de una cara
 * con agujeros; la alternativa fácil —Tipo 106 forma 63, curva plana cerrada— no
 * sabe expresar agujeros y habría que mentir sobre ellos.
 *
 * ALCANCE: caras planas de aristas rectas, lo mismo que escribe el exportador.
 * Una superficie que no sea Tipo 190 se rechaza al leer con un mensaje que dice
 * cuál, en vez de saltársela y dejar un sólido con un boquete.
 */
import { BodyBuilder } from "./body-builder";
import { attachPlanarSurfaces } from "./primitives";
import { faceCentroid, faceGeometricNormal, loopPoints, type BrepBody } from "./topology";
import { v3Basis, vec3, type Vec3 } from "./vec3";

export interface IgesExportOptions {
  /** Nombre del producto. */
  name?: string;
  /** Fecha en formato IGES `YYYYMMDD.HHNNSS`. Se pide para que el archivo sea reproducible. */
  timestamp?: string;
  author?: string;
  organization?: string;
}

interface DirectoryEntry {
  type: number;
  form: number;
  parameters: string[];
}

/** Acumulador de entidades; el puntero de cada una sale de su posición. */
class IgesWriter {
  private readonly entries: DirectoryEntry[] = [];

  /** Añade una entidad y devuelve su PUNTERO de directorio (siempre impar). */
  add(type: number, parameters: (string | number)[], form = 0): number {
    this.entries.push({ type, form, parameters: parameters.map((value) => formatValue(value)) });
    return this.entries.length * 2 - 1;
  }

  build(header: { name: string; timestamp: string; author: string; organization: string; maxCoordinate: number }): string {
    const startLines = [pad72("Valle Design - B-rep facetado exportado a IGES 5.3")];

    const global = [
      "1H,",
      "1H;",
      hollerith(header.name),
      hollerith(`${header.name}.igs`),
      hollerith("valle-design-brep"),
      hollerith("1.0"),
      "32",
      "38",
      "6",
      "308",
      "15",
      hollerith(header.name),
      "1.0",
      "2",
      hollerith("MM"),
      "1",
      "0.0",
      hollerith(header.timestamp),
      "1.0E-7",
      formatValue(header.maxCoordinate),
      hollerith(header.author),
      hollerith(header.organization),
      "11",
      "0",
      hollerith(header.timestamp),
    ].join(",");
    const globalLines = wrap(global + ";", 72);

    // Sección de parámetros: hay que conocer cuántas líneas ocupa cada entidad
    // ANTES de escribir el directorio, porque el directorio lo declara.
    const parameterLines: string[] = [];
    const parameterStart: number[] = [];
    const parameterCount: number[] = [];
    for (const entry of this.entries) {
      parameterStart.push(parameterLines.length + 1);
      const text = `${entry.type},${entry.parameters.join(",")};`;
      const chunks = wrap(text, 64);
      parameterLines.push(...chunks);
      parameterCount.push(chunks.length);
    }

    const directoryLines: string[] = [];
    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i];
      directoryLines.push(
        [
          field(entry.type),
          field(parameterStart[i]),
          field(0),
          field(0),
          field(0),
          field(0),
          field(0),
          field(0),
          "00000000",
        ].join(""),
      );
      directoryLines.push(
        [field(entry.type), field(0), field(0), field(parameterCount[i]), field(entry.form), "        ", "        ", "        ", field(0)].join(""),
      );
    }

    const out: string[] = [];
    startLines.forEach((line, index) => out.push(record(line, "S", index + 1)));
    globalLines.forEach((line, index) => out.push(record(line, "G", index + 1)));
    directoryLines.forEach((line, index) => out.push(record(line, "D", index + 1)));
    let cursor = 0;
    for (let i = 0; i < this.entries.length; i += 1) {
      const pointer = i * 2 + 1;
      for (let k = 0; k < parameterCount[i]; k += 1) {
        // El puntero al directorio va en las columnas 65-72 de CADA línea de
        // parámetros, también en las continuaciones.
        out.push(record(pad(parameterLines[cursor], 64) + field(pointer), "P", cursor + 1));
        cursor += 1;
      }
    }
    out.push(
      record(
        terminateField("S", startLines.length) +
          terminateField("G", globalLines.length) +
          terminateField("D", directoryLines.length) +
          terminateField("P", parameterLines.length),
        "T",
        1,
      ),
    );
    return out.join("\n") + "\n";
  }
}

function formatValue(value: string | number): string {
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) throw new Error(`Valor no finito en la exportación IGES: ${value}`);
  if (Number.isInteger(value)) return `${value}`;
  return value.toPrecision(12).replace(/0+$/, "").replace(/\.$/, ".0");
}

function hollerith(text: string): string {
  return `${text.length}H${text}`;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

function pad72(text: string): string {
  return pad(text, 72);
}

/** Campo de 8 columnas justificado a la derecha, como manda el directorio IGES. */
function field(value: number | string): string {
  const text = `${value}`;
  return text.length >= 8 ? text.slice(-8) : " ".repeat(8 - text.length) + text;
}

/**
 * Registro de 80 columnas EXACTAS: 72 de contenido, 1 de sección y 7 de
 * secuencia.
 *
 * Los 7 —y no 8— son la trampa: los campos del directorio miden 8 columnas y el
 * de secuencia mide 7, porque la letra de sección se come una. Con 8 el archivo
 * sale de 81 columnas y hay lectores que lo rechazan entero sin decir por qué.
 */
function record(content: string, section: string, sequence: number): string {
  const number = `${sequence}`;
  return pad72(content) + section + (number.length >= 7 ? number.slice(-7) : " ".repeat(7 - number.length) + number);
}

/** Campo de la sección de terminación: letra + cuenta justificada en 7 columnas. */
function terminateField(section: string, count: number): string {
  const number = `${count}`;
  return section + (number.length >= 7 ? number.slice(-7) : " ".repeat(7 - number.length) + number);
}

/** Parte un texto largo en trozos que quepan en `width` columnas, cortando por comas. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const token of text.split(/(?<=,)/)) {
    if (current.length + token.length > width && current.length > 0) {
      out.push(current);
      current = "";
    }
    current += token;
  }
  if (current.length > 0) out.push(current);
  return out.length > 0 ? out : [""];
}

/** Escribe el cuerpo como archivo IGES 5.3. */
export function exportIges(body: BrepBody, options: IgesExportOptions = {}): string {
  const writer = new IgesWriter();
  let maxCoordinate = 1;
  for (const vertex of body.vertices) {
    maxCoordinate = Math.max(maxCoordinate, Math.abs(vertex.point.x), Math.abs(vertex.point.y), Math.abs(vertex.point.z));
  }

  for (let face = 0; face < body.faces.length; face += 1) {
    const normal = faceGeometricNormal(body, face);
    const origin = faceCentroid(body, face);
    const basis = v3Basis(normal);
    const originPointer = writer.add(116, [origin.x, origin.y, origin.z, 0]);
    const normalPointer = writer.add(123, [basis.w.x, basis.w.y, basis.w.z]);
    const referencePointer = writer.add(123, [basis.u.x, basis.u.y, basis.u.z]);
    // Tipo 190 forma 1: superficie plana PARAMETRIZADA (con dirección de
    // referencia). La forma 0 no la lleva y deja la parametrización a la
    // interpretación del lector, que es justo lo que no queremos al reimportar.
    const surfacePointer = writer.add(190, [originPointer, normalPointer, referencePointer], 1);

    const boundaryPointers = body.faces[face].loops.map((loop) => {
      const points = loopPoints(body, loop);
      const linePointers = points.map((point, index) => {
        const next = points[(index + 1) % points.length];
        return writer.add(110, [point.x, point.y, point.z, next.x, next.y, next.z]);
      });
      const compositePointer = writer.add(102, [linePointers.length, ...linePointers]);
      // Tipo 142: CRTN=0 (sin especificar cómo se creó), BPTR=0 (no hay curva en
      // espacio de parámetros), PREF=2 (manda la curva 3D).
      return writer.add(142, [0, surfacePointer, 0, compositePointer, 2]);
    });

    const [outer, ...inners] = boundaryPointers;
    writer.add(144, [surfacePointer, 1, inners.length, outer, ...inners]);
  }

  return writer.build({
    name: options.name ?? "VALLE_DESIGN_SOLID",
    timestamp: options.timestamp ?? "19700101.000000",
    author: options.author ?? "Valle Design",
    organization: options.organization ?? "Valle Design",
    maxCoordinate,
  });
}

// --- Lectura ---------------------------------------------------------------

export interface IgesEntity {
  pointer: number;
  type: number;
  form: number;
  parameters: string[];
}

export interface IgesFile {
  entities: Map<number, IgesEntity>;
  global: string[];
}

/** Analiza un archivo IGES en entidades indexadas por su puntero de directorio. */
export function parseIges(text: string): IgesFile {
  const lines = text.split(/\r?\n/).filter((line) => line.length >= 73);
  const globalText: string[] = [];
  const directory: string[] = [];
  const parameterLines: Array<{ pointer: number; content: string }> = [];
  for (const line of lines) {
    const section = line[72];
    const content = line.slice(0, 72);
    if (section === "G") globalText.push(content);
    else if (section === "D") directory.push(content);
    else if (section === "P") {
      const pointer = Number(line.slice(64, 72).trim());
      parameterLines.push({ pointer, content: line.slice(0, 64) });
    }
  }

  // Los parámetros de una entidad son la concatenación de sus líneas, hasta `;`.
  const parameterText = new Map<number, string>();
  for (const { pointer, content } of parameterLines) {
    parameterText.set(pointer, (parameterText.get(pointer) ?? "") + content.trimEnd());
  }

  const entities = new Map<number, IgesEntity>();
  for (let i = 0; i + 1 < directory.length; i += 2) {
    const first = directory[i];
    const second = directory[i + 1];
    const type = Number(first.slice(0, 8).trim());
    const form = Number(second.slice(32, 40).trim() || "0");
    const pointer = i + 1;
    const raw = parameterText.get(pointer) ?? "";
    const body = raw.split(";")[0];
    const parameters = body.split(",").map((value) => value.trim());
    entities.set(pointer, { pointer, type, form, parameters: parameters.slice(1) });
  }
  return { entities, global: globalText };
}

export interface IgesImportResult {
  body: BrepBody;
  faces: number;
}

/** Reconstruye un cuerpo B-rep a partir del texto de un archivo IGES. */
export function importIges(text: string, tolerance = 1e-7): IgesImportResult {
  const file = parseIges(text);
  const builder = new BodyBuilder(tolerance);
  const get = (pointer: number): IgesEntity => {
    const entity = file.entities.get(pointer);
    if (!entity) throw new Error(`El archivo IGES referencia el puntero ${pointer}, que no existe en el directorio.`);
    return entity;
  };
  const numberAt = (entity: IgesEntity, index: number): number => {
    const value = Number(entity.parameters[index]);
    if (!Number.isFinite(value)) {
      throw new Error(`Parámetro ${index} de la entidad tipo ${entity.type} (puntero ${entity.pointer}) no es numérico: "${entity.parameters[index]}".`);
    }
    return value;
  };

  /** Puntos de un contorno Tipo 142 → 102 → 110. */
  const boundaryPoints = (pointer: number): Vec3[] => {
    const boundary = get(pointer);
    if (boundary.type !== 142) throw new Error(`Se esperaba un Tipo 142 y llegó el ${boundary.type} (puntero ${pointer}).`);
    const composite = get(numberAt(boundary, 3));
    if (composite.type !== 102) {
      throw new Error(`El contorno apunta al tipo ${composite.type} en vez de a una curva compuesta (102).`);
    }
    const count = numberAt(composite, 0);
    const points: Vec3[] = [];
    for (let i = 0; i < count; i += 1) {
      const line = get(numberAt(composite, 1 + i));
      if (line.type !== 110) {
        throw new Error(
          `La curva compuesta contiene un tipo ${line.type}; este importador sólo entiende rectas (110). No se ignora porque saltarse un tramo deja el contorno abierto.`,
        );
      }
      points.push(vec3(numberAt(line, 0), numberAt(line, 1), numberAt(line, 2)));
    }
    return points;
  };

  let faces = 0;
  for (const entity of file.entities.values()) {
    if (entity.type !== 144) continue;
    const surface = get(numberAt(entity, 0));
    if (surface.type !== 190) {
      throw new Error(
        `La cara recortada se apoya en una superficie tipo ${surface.type}; este importador sólo entiende planos (190).`,
      );
    }
    const innerCount = numberAt(entity, 2);
    const outer = boundaryPoints(numberAt(entity, 3));
    const inners: Vec3[][] = [];
    for (let i = 0; i < innerCount; i += 1) inners.push(boundaryPoints(numberAt(entity, 4 + i)));
    builder.addPolygon(outer, { inners });
    faces += 1;
  }
  if (faces === 0) {
    throw new Error("El archivo IGES no contiene ninguna superficie recortada (Tipo 144): no describe ningún sólido facetado.");
  }
  return { body: attachPlanarSurfaces(builder.build()), faces };
}
