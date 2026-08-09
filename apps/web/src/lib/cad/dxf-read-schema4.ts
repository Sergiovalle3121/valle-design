/**
 * Lectura de los ocho tipos del esquema 4 desde un DXF de texto.
 *
 * No se apoya en `dxf-parser`: esa librería no modela XLINE, RAY, WIPEOUT,
 * IMAGE ni los objetos que cuelgan de ellos, así que estas entidades se leen
 * sobre los pares crudos, igual que ya se hacía con HATCH, MTEXT y las cotas.
 *
 * ## Lo que hay que deshacer al leer
 *
 *  · **SOLID** llega en orden de CORBATÍN (10-11-13-12) y el documento canónico
 *    guarda contorno: se reordena aquí, que es exactamente la operación
 *    inversa de la que hace el escritor.
 *  · **WIPEOUT** e **IMAGE** traen su recorte en coordenadas NORMALIZADAS de la
 *    imagen (−0,5..+0,5 desde el centro): vuelven a coordenadas de dibujo con
 *    el punto de inserción y los vectores U/V. Y el contorno viene cerrado con
 *    el primer vértice repetido, que se funde: el documento guarda vértices
 *    ÚNICOS.
 *  · **IMAGE** apunta con su grupo 340 a un IMAGEDEF que vive en un diccionario;
 *    la CLAVE de ese diccionario es la identidad de la definición, así que hay
 *    que recorrer los diccionarios para poder devolver el enlace.
 *  · **POINT** no lleva su estilo: está en `$PDMODE`/`$PDSIZE`, en la cabecera.
 */
import type { CadDxfPoint, CadDxfPrimitive } from "./dxf-import";
import {
  DXF_ATTDEF_CONSTANT,
  DXF_ATTDEF_INVISIBLE,
  DXF_ATTDEF_PRESET,
  DXF_ATTDEF_VERIFY,
  dxfTextAnchorFromCodes,
} from "./dxf-schema4";
import { num, rawDxfPairs, type RawDxfPair } from "./dxf-read-core";

const DEFAULT_LAYER = "0";

/** Tipos DXF que lee este módulo — el importador general debe saltárselos. */
export const DXF_SCHEMA4_ENTITY_TYPES = new Set([
  "POINT",
  "XLINE",
  "RAY",
  "SOLID",
  "WIPEOUT",
  "IMAGE",
  "ATTDEF",
]);

/** Definición de imagen tal y como se reconstruye desde el fichero. */
export interface CadDxfImportedImageDefinition {
  id: string;
  name: string;
  uri: string;
  pixelWidth: number;
  pixelHeight: number;
}

export interface CadDxfSchema4ImportResult {
  primitives: CadDxfPrimitive[];
  imageDefinitions: CadDxfImportedImageDefinition[];
  /**
   * Tipos de la sección ENTITIES en ORDEN de fichero, con el índice de la
   * primitiva del esquema 4 cuando la entidad es de las que lee este módulo.
   *
   * Existe para que el importador pueda INTERCALAR estas primitivas donde
   * estaban en vez de amontonarlas al principio. El orden de la sección
   * ENTITIES ES el orden de dibujo, y para un WIPEOUT eso no es cosmético: su
   * sitio en la pila es lo que decide qué tapa.
   */
  order: CadDxfSchema4Ordinal[];
}

export interface CadDxfSchema4Ordinal {
  type: string;
  /** Índice en `primitives`, o `null` si la entidad no es del esquema 4. */
  schema4Index: number | null;
}

/**
 * Tipos que NO son entidades por derecho propio: cuelgan de la anterior. Se
 * excluyen del orden porque el tokenizador tampoco los cuenta como entidades.
 */
const DXF_SUBENTITY_TYPES = new Set(["VERTEX", "SEQEND", "ATTRIB"]);

/** Vista de una entidad: sus pares, con acceso por código. */
class EntityPairs {
  constructor(private readonly pairs: RawDxfPair[]) {}

  first(code: number): string | undefined {
    return this.pairs.find((pair) => pair.code === code)?.value;
  }

  all(code: number): string[] {
    return this.pairs.filter((pair) => pair.code === code).map((pair) => pair.value);
  }

  number(code: number, fallback: number): number {
    return num(this.first(code)) ?? fallback;
  }

  point(xCode: number, yCode: number): CadDxfPoint | null {
    const x = num(this.first(xCode));
    const y = num(this.first(yCode));
    return x === null || y === null ? null : { x, y };
  }

  layer(): string {
    return this.first(8) || DEFAULT_LAYER;
  }
}

/**
 * Recorre el fichero entregando (tipo, pares) por entidad u objeto, SÓLO de la
 * sección pedida.
 *
 * La sección importa y mucho: un ATTDEF dentro de la sección BLOCKS es la
 * definición de atributo de un bloque —ya la lee el importador de bloques— y
 * leerlo también aquí lo duplicaba como entidad suelta del modelo. Lo mismo
 * valdría para un POINT dentro de un bloque, que llega al dibujo por su INSERT.
 */
function* walkSection(
  pairs: RawDxfPair[],
  section: string,
): Generator<[string, EntityPairs]> {
  let current = "";
  for (let start = 0; start < pairs.length; start += 1) {
    if (pairs[start].code !== 0) continue;
    const type = pairs[start].value.toUpperCase();
    let end = start + 1;
    while (end < pairs.length && pairs[end].code !== 0) end += 1;
    const entity = new EntityPairs(pairs.slice(start + 1, end));
    if (type === "SECTION") current = (entity.first(2) ?? "").toUpperCase();
    else if (type === "ENDSEC") current = "";
    else if (current === section) yield [type, entity];
    start = end - 1;
  }
}

/** Variable de cabecera `$NOMBRE` seguida de su valor. */
function headerVariable(pairs: RawDxfPair[], name: string, code: number): number | null {
  for (let index = 0; index + 1 < pairs.length; index += 1)
    if (pairs[index].code === 9 && pairs[index].value === name) {
      for (let next = index + 1; next < pairs.length && pairs[next].code !== 9; next += 1)
        if (pairs[next].code === code) return num(pairs[next].value);
      return null;
    }
  return null;
}

/**
 * Devuelve el recorte a coordenadas de dibujo.
 *
 * Se invierte exactamente la normalización del escritor: `x = minX + (u + 0,5)
 * · ancho`. El vértice de cierre repetido se descarta, porque el documento
 * canónico DECLARA el cierre en vez de duplicar el primer punto.
 */
function denormalizeBoundary(
  entity: EntityPairs,
  origin: CadDxfPoint,
  width: number,
  height: number,
): CadDxfPoint[] {
  const us = entity.all(14).map(Number);
  const vs = entity.all(24).map(Number);
  const points: CadDxfPoint[] = [];
  for (let index = 0; index < Math.min(us.length, vs.length); index += 1) {
    if (!Number.isFinite(us[index]) || !Number.isFinite(vs[index])) continue;
    points.push({
      x: origin.x + (us[index] + 0.5) * width,
      y: origin.y + (vs[index] + 0.5) * height,
    });
  }
  const last = points.at(-1);
  if (
    points.length > 3 &&
    last &&
    Math.abs(last.x - points[0].x) < 1e-9 &&
    Math.abs(last.y - points[0].y) < 1e-9
  )
    points.pop();
  return points;
}

export function parseRawDxfSchema4(text: string): CadDxfSchema4ImportResult {
  const pairs = rawDxfPairs(text);
  const primitives: CadDxfPrimitive[] = [];
  const order: CadDxfSchema4Ordinal[] = [];

  // 1. Diccionarios y definiciones de imagen. Se leen ANTES que las entidades
  //    porque una IMAGE sin su IMAGEDEF resuelto no puede construirse.
  const keyByHandle = new Map<string, string>();
  const imageDefs = new Map<string, CadDxfImportedImageDefinition>();
  for (const [type, entity] of walkSection(pairs, "OBJECTS")) {
    if (type === "DICTIONARY") {
      const names = entity.all(3);
      const handles = entity.all(350);
      names.forEach((name, index) => {
        if (handles[index]) keyByHandle.set(handles[index], name);
      });
    }
  }
  for (const [type, entity] of walkSection(pairs, "OBJECTS")) {
    if (type !== "IMAGEDEF") continue;
    const handle = entity.first(5);
    const uri = entity.first(1);
    if (!handle || !uri) continue;
    const key = keyByHandle.get(handle) ?? handle;
    imageDefs.set(handle, {
      id: key,
      // El nombre no viaja en el DXF: se reconstruye desde el archivo, que es
      // lo que un usuario reconoce. La pérdida la declara el manifiesto.
      name: uri.split(/[\\/]/).pop() || key,
      uri,
      pixelWidth: entity.number(10, 1),
      pixelHeight: entity.number(20, 1),
    });
  }

  const pointStyle = headerVariable(pairs, "$PDMODE", 70);
  const pointSize = headerVariable(pairs, "$PDSIZE", 40);
  const wipeoutFrame = (() => {
    for (const [type, entity] of walkSection(pairs, "OBJECTS"))
      if (type === "WIPEOUTVARIABLES") return entity.number(70, 0) !== 0;
    return false;
  })();

  // 2. Entidades del MODELO. Las de la sección BLOCKS llegan al dibujo por su
  //    INSERT, no sueltas.
  for (const [type, entity] of walkSection(pairs, "ENTITIES")) {
    if (DXF_SUBENTITY_TYPES.has(type)) continue;
    // El hueco se anota SIEMPRE, aunque la entidad no sea del esquema 4 o se
    // descarte por degenerada: lo que hace útil esta lista es que sea el orden
    // COMPLETO de la sección.
    const slot = order.length;
    order.push({ type, schema4Index: null });
    const claim = () => {
      order[slot].schema4Index = primitives.length;
    };
    const layer = entity.layer();
    const anchor = entity.point(10, 20);
    if (type === "POINT" && anchor) {
      claim();
      primitives.push({
        kind: "point",
        layer,
        points: [anchor],
        schema4: {
          kind: "point",
          ...(pointStyle ? { style: pointStyle } : {}),
          ...(pointSize ? { size: pointSize } : {}),
        },
      });
      continue;
    }
    if ((type === "XLINE" || type === "RAY") && anchor) {
      const direction = entity.point(11, 21);
      if (!direction || (!direction.x && !direction.y)) continue;
      claim();
      primitives.push({
        kind: type === "RAY" ? "ray" : "xline",
        layer,
        points: [anchor],
        schema4: { kind: type === "RAY" ? "ray" : "xline", direction },
      });
      continue;
    }
    if (type === "SOLID" && anchor) {
      const corners = [anchor, entity.point(11, 21), entity.point(12, 22), entity.point(13, 23)];
      if (corners.some((corner) => corner === null)) continue;
      const [a, b, c, d] = corners as CadDxfPoint[];
      // Se deshace el corbatín: 10-11-12-13 → contorno a-b-d-c. Un SOLID
      // triangular repite su tercer vértice en el cuarto grupo.
      const contour =
        Math.abs(c.x - d.x) < 1e-9 && Math.abs(c.y - d.y) < 1e-9 ? [a, b, c] : [a, b, d, c];
      claim();
      primitives.push({ kind: "solid", layer, points: contour, schema4: { kind: "solid" } });
      continue;
    }
    if (type === "WIPEOUT" && anchor) {
      const width = entity.number(11, 0) || entity.number(21, 0);
      const height = entity.number(22, 0) || entity.number(12, 0);
      const boundary = denormalizeBoundary(entity, anchor, width, height);
      if (boundary.length < 3) continue;
      claim();
      primitives.push({
        kind: "wipeout",
        layer,
        points: boundary,
        schema4: { kind: "wipeout", frame: wipeoutFrame },
      });
      continue;
    }
    if (type === "IMAGE" && anchor) {
      const definition = imageDefs.get(entity.first(340) ?? "");
      // Una IMAGE cuyo IMAGEDEF no está en el fichero no se puede reconstruir:
      // se deja pasar como no soportada en vez de inventar una definición.
      if (!definition) continue;
      const uVector = entity.point(11, 21) ?? { x: 1, y: 0 };
      const vVector = entity.point(12, 22) ?? { x: 0, y: 1 };
      const pixelWidth = entity.number(13, definition.pixelWidth);
      const pixelHeight = entity.number(23, definition.pixelHeight);
      const clip = denormalizeBoundary(
        entity,
        anchor,
        Math.abs(uVector.x) * pixelWidth,
        Math.abs(vVector.y) * pixelHeight,
      );
      claim();
      primitives.push({
        kind: "image",
        layer,
        points: [anchor],
        schema4: {
          kind: "image",
          uVector,
          vVector,
          pixelWidth,
          pixelHeight,
          brightness: entity.number(281, 50),
          contrast: entity.number(282, 50),
          fade: entity.number(283, 0),
          showImage: (entity.number(70, 7) & 1) !== 0,
          ...(clip.length >= 3 ? { clipBoundary: clip } : {}),
          definition: {
            key: definition.id,
            path: definition.uri,
            pixelWidth: definition.pixelWidth,
            pixelHeight: definition.pixelHeight,
          },
        },
      });
      continue;
    }
    if (type === "ATTDEF" && anchor) {
      const flags = entity.number(70, 0);
      const alignment = dxfTextAnchorFromCodes(entity.number(72, 0), entity.number(74, 0));
      // Con 72 o 74 distintos de 0, la posición REAL es el grupo 11: leer el 10
      // dejaría todo ATTDEF centrado en el origen del dibujo.
      const aligned = alignment === "bottom-left" ? anchor : entity.point(11, 21) ?? anchor;
      claim();
      primitives.push({
        kind: "attdef",
        layer,
        points: [aligned],
        schema4: {
          kind: "attdef",
          tag: entity.first(2) ?? "TAG",
          prompt: entity.first(3) ?? "",
          defaultValue: entity.first(1) ?? "",
          height: entity.number(40, 250),
          rotation: entity.number(50, 0),
          style: entity.first(7) ?? "Standard",
          alignment,
          invisible: (flags & DXF_ATTDEF_INVISIBLE) !== 0,
          constant: (flags & DXF_ATTDEF_CONSTANT) !== 0,
          verify: (flags & DXF_ATTDEF_VERIFY) !== 0,
          preset: (flags & DXF_ATTDEF_PRESET) !== 0,
          lockPosition: entity.number(280, 0) !== 0,
        },
      });
    }
  }

  // Sólo viajan las definiciones que alguna inserción usa: un catálogo con
  // entradas huérfanas no es fidelidad, es basura heredada.
  const used = new Set(
    primitives
      .map((primitive) => (primitive.schema4?.kind === "image" ? primitive.schema4.definition.key : null))
      .filter((key): key is string => key !== null),
  );
  return {
    primitives,
    imageDefinitions: [...imageDefs.values()].filter((definition) => used.has(definition.id)),
    order,
  };
}
