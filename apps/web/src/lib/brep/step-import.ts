/**
 * Importación de STEP (ISO 10303-21): analizador de la parte 21 y reconstrucción
 * del B-rep.
 *
 * Son dos problemas distintos y aquí están separados a propósito.
 *
 * EL ANALIZADOR (`parseStepFile`) sólo entiende de sintaxis: instancias
 * `#n = TIPO(argumentos);`, listas, cadenas entre apóstrofos, enumerados
 * `.T.`, indefinidos `$` y heredados `*`. Devuelve un mapa de instancias sin
 * interpretar nada. Tres detalles que hunden a los analizadores ingenuos y que
 * están tratados:
 *
 *   · Los apóstrofos dentro de una cadena se escapan DUPLICÁNDOLOS (`''`), no
 *     con barra invertida. Un analizador que busque el siguiente `'` corta la
 *     cadena por la mitad.
 *   · Los comentarios `/* … *​/` pueden aparecer en cualquier parte, incluso
 *     partiendo un argumento.
 *   · Una instancia puede ser una entidad COMPLEJA: varias entidades entre
 *     paréntesis, como los contextos con unidades. Se reconocen y se guardan
 *     como lista de partes en vez de reventar.
 *
 * LA RECONSTRUCCIÓN (`importStep`) sólo entiende de semántica: busca los
 * `MANIFOLD_SOLID_BREP`, baja por sus cáscaras y caras, y vuelve a coser la
 * topología con el mismo `BodyBuilder` que usa todo el kernel. Eso último no es
 * pereza: significa que un archivo importado pasa por las MISMAS comprobaciones
 * de cosido que un sólido recién modelado, y que un STEP con caras del revés se
 * rechaza en la importación en vez de convertirse en un sólido inválido.
 *
 * ALCANCE: caras planas con lazos de aristas rectas, que es exactamente lo que
 * escribe el exportador. Una `B_SPLINE_SURFACE` o un `CYLINDRICAL_SURFACE` se
 * rechazan con un mensaje que dice qué entidad no se entiende — no se ignoran en
 * silencio, que produciría un sólido con agujeros.
 */
import { BodyBuilder } from "./body-builder";
import { attachPlanarSurfaces } from "./primitives";
import type { BrepBody } from "./topology";
import { vec3, type Vec3 } from "./vec3";

export type StepValue =
  | { kind: "ref"; id: number }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "enum"; value: string }
  | { kind: "list"; items: StepValue[] }
  | { kind: "undefined" }
  | { kind: "derived" };

export interface StepInstance {
  id: number;
  type: string;
  args: StepValue[];
  /** Partes de una entidad compleja `( A(...) B(...) )`; vacío si es simple. */
  parts: Array<{ type: string; args: StepValue[] }>;
}

export interface StepFile {
  header: Array<{ type: string; args: StepValue[] }>;
  instances: Map<number, StepInstance>;
  schema: string;
}

/** Analiza un archivo STEP en instancias sin interpretar. */
export function parseStepFile(text: string): StepFile {
  const source = stripComments(text);
  const dataStart = source.indexOf("DATA;");
  const headerStart = source.indexOf("HEADER;");
  if (dataStart < 0) throw new Error("El archivo no tiene sección DATA: no es un STEP de la parte 21.");

  const header: Array<{ type: string; args: StepValue[] }> = [];
  if (headerStart >= 0) {
    for (const statement of splitStatements(source.slice(headerStart + "HEADER;".length, dataStart))) {
      const parsed = parseCall(statement);
      if (parsed) header.push(parsed);
    }
  }
  const schemaEntry = header.find((entry) => entry.type === "FILE_SCHEMA");
  const schema =
    schemaEntry && schemaEntry.args[0]?.kind === "list" && schemaEntry.args[0].items[0]?.kind === "string"
      ? schemaEntry.args[0].items[0].value
      : "";

  const endIndex = source.indexOf("ENDSEC;", dataStart);
  const dataText = source.slice(dataStart + "DATA;".length, endIndex < 0 ? undefined : endIndex);
  const instances = new Map<number, StepInstance>();
  for (const statement of splitStatements(dataText)) {
    const match = /^#(\d+)\s*=\s*([\s\S]*)$/.exec(statement.trim());
    if (!match) continue;
    const id = Number(match[1]);
    const body = match[2].trim();
    if (body.startsWith("(")) {
      // Entidad COMPLEJA: `( TIPO_A(...) TIPO_B(...) )`.
      const inner = body.slice(1, body.lastIndexOf(")"));
      const parts: Array<{ type: string; args: StepValue[] }> = [];
      for (const call of splitCalls(inner)) {
        const parsed = parseCall(call);
        if (parsed) parts.push(parsed);
      }
      instances.set(id, { id, type: parts[0]?.type ?? "", args: parts[0]?.args ?? [], parts });
      continue;
    }
    const parsed = parseCall(body);
    if (!parsed) continue;
    instances.set(id, { id, type: parsed.type, args: parsed.args, parts: [] });
  }
  return { header, instances, schema };
}

/** Quita los comentarios sin tocar el contenido de las cadenas. */
function stripComments(text: string): string {
  let out = "";
  let index = 0;
  let inString = false;
  while (index < text.length) {
    const char = text[index];
    if (inString) {
      out += char;
      if (char === "'") {
        if (text[index + 1] === "'") {
          out += "'";
          index += 2;
          continue;
        }
        inString = false;
      }
      index += 1;
      continue;
    }
    if (char === "'") {
      inString = true;
      out += char;
      index += 1;
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 2;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/** Parte una sección en sentencias terminadas en `;`, respetando cadenas y paréntesis. */
function splitStatements(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      current += char;
      if (char === "'") {
        if (text[index + 1] === "'") {
          current += "'";
          index += 1;
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === ";" && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Parte `A(...) B(...)` en llamadas sueltas. */
function splitCalls(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === "'") {
        if (text[index + 1] === "'") index += 1;
        else inString = false;
      }
      continue;
    }
    if (char === "'") inString = true;
    else if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        out.push(text.slice(start, index + 1).trim());
        start = index + 1;
      }
    }
  }
  return out.filter(Boolean);
}

function parseCall(text: string): { type: string; args: StepValue[] } | null {
  const trimmed = text.trim();
  const open = trimmed.indexOf("(");
  if (open < 0) return null;
  const type = trimmed.slice(0, open).trim().toUpperCase();
  const close = trimmed.lastIndexOf(")");
  if (close <= open) return null;
  return { type, args: parseArguments(trimmed.slice(open + 1, close)) };
}

function parseArguments(text: string): StepValue[] {
  const out: StepValue[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  const flush = () => {
    const token = current.trim();
    current = "";
    if (token.length > 0) out.push(parseValue(token));
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      current += char;
      if (char === "'") {
        if (text[index + 1] === "'") {
          current += "'";
          index += 1;
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      flush();
      continue;
    }
    current += char;
  }
  flush();
  return out;
}

function parseValue(token: string): StepValue {
  if (token === "$") return { kind: "undefined" };
  if (token === "*") return { kind: "derived" };
  if (token.startsWith("#")) return { kind: "ref", id: Number(token.slice(1)) };
  if (token.startsWith("'")) return { kind: "string", value: token.slice(1, -1).replace(/''/g, "'") };
  if (token.startsWith(".") && token.endsWith(".")) return { kind: "enum", value: token.slice(1, -1) };
  if (token.startsWith("(")) return { kind: "list", items: parseArguments(token.slice(1, -1)) };
  const numeric = Number(token);
  if (Number.isFinite(numeric)) return { kind: "number", value: numeric };
  // Un valor tipado como `LENGTH_MEASURE(1.E-07)`: se guarda su contenido.
  const call = parseCall(token);
  if (call) return { kind: "list", items: call.args };
  return { kind: "string", value: token };
}

// --- Reconstrucción del B-rep ---------------------------------------------

export interface StepImportResult {
  body: BrepBody;
  schema: string;
  /** Nombres de los `MANIFOLD_SOLID_BREP` encontrados. */
  solids: string[];
}

/** Reconstruye un cuerpo B-rep a partir del texto de un archivo STEP. */
export function importStep(text: string, tolerance = 1e-7): StepImportResult {
  const file = parseStepFile(text);
  const resolve = (value: StepValue | undefined): StepInstance => {
    if (!value || value.kind !== "ref") throw new Error(`Se esperaba una referencia #n y llegó ${JSON.stringify(value)}.`);
    const instance = file.instances.get(value.id);
    if (!instance) throw new Error(`El archivo referencia #${value.id}, que no existe.`);
    return instance;
  };

  const pointOf = (instance: StepInstance): Vec3 => {
    if (instance.type === "VERTEX_POINT") return pointOf(resolve(instance.args[1]));
    if (instance.type !== "CARTESIAN_POINT") {
      throw new Error(`Se esperaba CARTESIAN_POINT y llegó ${instance.type} (#${instance.id}).`);
    }
    const coordinates = instance.args[1];
    if (coordinates?.kind !== "list") throw new Error(`CARTESIAN_POINT #${instance.id} sin lista de coordenadas.`);
    const numbers = coordinates.items.map((item) => (item.kind === "number" ? item.value : NaN));
    if (numbers.some((value) => !Number.isFinite(value))) {
      throw new Error(`CARTESIAN_POINT #${instance.id} con coordenadas no numéricas.`);
    }
    return vec3(numbers[0], numbers[1], numbers[2] ?? 0);
  };

  const builder = new BodyBuilder(tolerance);
  const solids: string[] = [];
  let faceCount = 0;

  for (const instance of file.instances.values()) {
    if (instance.type !== "MANIFOLD_SOLID_BREP" && instance.type !== "BREP_WITH_VOIDS") continue;
    solids.push(instance.args[0]?.kind === "string" ? instance.args[0].value : "");
    const shell = resolve(instance.args[1]);
    if (shell.type !== "CLOSED_SHELL" && shell.type !== "OPEN_SHELL") {
      throw new Error(`Se esperaba CLOSED_SHELL y llegó ${shell.type} (#${shell.id}).`);
    }
    const faces = shell.args[1];
    if (faces?.kind !== "list") throw new Error(`La cáscara #${shell.id} no trae lista de caras.`);
    for (const faceRef of faces.items) {
      const face = resolve(faceRef);
      if (face.type !== "ADVANCED_FACE" && face.type !== "FACE_SURFACE") {
        throw new Error(`Se esperaba ADVANCED_FACE y llegó ${face.type} (#${face.id}).`);
      }
      const surface = resolve(face.args[2]);
      if (surface.type !== "PLANE") {
        throw new Error(
          `La cara #${face.id} se apoya en ${surface.type}, y este importador sólo entiende PLANE. No se ignora en silencio porque saltársela dejaría un sólido con un agujero.`,
        );
      }
      const sameSense = face.args[3]?.kind === "enum" ? face.args[3].value === "T" : true;
      const bounds = face.args[1];
      if (bounds?.kind !== "list") throw new Error(`La cara #${face.id} no trae lista de contornos.`);

      let outer: Vec3[] | null = null;
      const inners: Vec3[][] = [];
      for (const boundRef of bounds.items) {
        const bound = resolve(boundRef);
        const boundSense = bound.args[2]?.kind === "enum" ? bound.args[2].value === "T" : true;
        const loop = resolve(bound.args[1]);
        if (loop.type !== "EDGE_LOOP") throw new Error(`Se esperaba EDGE_LOOP y llegó ${loop.type} (#${loop.id}).`);
        const points = loopPointsOf(loop, resolve, pointOf);
        const oriented = boundSense ? points : [...points].reverse();
        if (bound.type === "FACE_OUTER_BOUND") outer = oriented;
        else inners.push(oriented);
      }
      if (!outer) {
        // Sin FACE_OUTER_BOUND explícito, el primer contorno hace de exterior.
        outer = inners.shift() ?? null;
      }
      if (!outer) throw new Error(`La cara #${face.id} no tiene ningún contorno.`);
      const finalOuter = sameSense ? outer : [...outer].reverse();
      const finalInners = sameSense ? inners : inners.map((hole) => [...hole].reverse());
      builder.addPolygon(finalOuter, { inners: finalInners });
      faceCount += 1;
    }
  }

  if (faceCount === 0) {
    throw new Error(
      "El archivo no contiene ningún MANIFOLD_SOLID_BREP con caras. Un STEP de superficies sueltas o de mallas no describe un sólido y este importador no lo convierte en uno.",
    );
  }
  return { body: attachPlanarSurfaces(builder.build()), schema: file.schema, solids };
}

/** Puntos de un EDGE_LOOP, en orden de recorrido y honrando los sentidos. */
function loopPointsOf(
  loop: StepInstance,
  resolve: (value: StepValue | undefined) => StepInstance,
  pointOf: (instance: StepInstance) => Vec3,
): Vec3[] {
  const list = loop.args[1];
  if (list?.kind !== "list") throw new Error(`EDGE_LOOP #${loop.id} sin lista de aristas orientadas.`);
  const points: Vec3[] = [];
  for (const item of list.items) {
    const oriented = resolve(item);
    if (oriented.type !== "ORIENTED_EDGE") {
      throw new Error(`Se esperaba ORIENTED_EDGE y llegó ${oriented.type} (#${oriented.id}).`);
    }
    // ORIENTED_EDGE(nombre, inicio*, fin*, arista, orientación): la arista es el
    // argumento 3 y la orientación el 4. Los dos `*` de en medio son valores
    // DERIVADOS —los hereda de la arista— y contarlos como si no estuvieran
    // desplaza todos los índices, que es el error clásico al leer STEP a mano.
    const forward = oriented.args[4]?.kind === "enum" ? oriented.args[4].value === "T" : true;
    const edge = resolve(oriented.args[3]);
    if (edge.type !== "EDGE_CURVE") throw new Error(`Se esperaba EDGE_CURVE y llegó ${edge.type} (#${edge.id}).`);
    // EDGE_CURVE(nombre, inicio, fin, geometría, mismo_sentido).
    const edgeForward = edge.args[4]?.kind === "enum" ? edge.args[4].value === "T" : true;
    // El sentido efectivo es la COMBINACIÓN de los dos: la orientación de la
    // arista dentro del lazo y la de la propia curva respecto de sus vértices.
    const start = forward === edgeForward ? edge.args[1] : edge.args[2];
    points.push(pointOf(resolve(start)));
  }
  return points;
}
