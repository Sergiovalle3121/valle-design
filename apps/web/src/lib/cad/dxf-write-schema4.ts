/**
 * Escritores DXF de los ocho tipos del esquema 4.
 *
 * Cada uno con su código DXF real, no con una aproximación que "se ve
 * parecido": un XLINE que sale como una línea muy larga deja de ser una recta
 * de construcción en cuanto el destinatario la mueve.
 *
 * ## Lo que este módulo sabe y el resto no
 *
 *  · **SOLID** guarda sus vértices en orden de CORBATÍN (10-11-13-12), no de
 *    polígono. Es la trampa clásica de la entidad y se resuelve AQUÍ: el
 *    documento canónico guarda contorno, que es lo que puede leer cualquiera.
 *  · **IMAGE** no lleva su archivo dentro: apunta a un IMAGEDEF que vive en un
 *    diccionario del que a su vez cuelga `ACAD_IMAGE_DICT`, y necesita un
 *    IMAGEDEF_REACTOR que cierre el círculo desde la definición hacia la
 *    inserción. Tres objetos y dos diccionarios para una sola imagen.
 *  · **WIPEOUT** es un IMAGE degenerado: mismo esqueleto, sin archivo, con el
 *    contorno en coordenadas NORMALIZADAS de la imagen (−0,5..+0,5) y su
 *    entrada `ACAD_WIPEOUT_VARS` en la tabla de objetos.
 *
 * Como el fichero que emite este exportador no tenía manejadores (`5`), los
 * objetos que sí los exigen se numeran desde `HANDLE_SEED` y sólo aparecen
 * cuando hay imágenes o enmascaramientos: un dibujo sin ninguno se serializa
 * exactamente igual que antes.
 */
import type { CadDxfPoint, CadDxfPrimitive } from "./dxf-import";
import {
  DXF_ATTDEF_CONSTANT,
  DXF_ATTDEF_INVISIBLE,
  DXF_ATTDEF_PRESET,
  DXF_ATTDEF_VERIFY,
  DXF_TEXT_ANCHOR_CODES,
  type CadDxfImageDefinitionRef,
} from "./dxf-schema4";
import { fmt, pushPair, pushPoint, safeStyleName, safeText } from "./dxf-write-core";

/**
 * Primer manejador libre. Ninguna otra entidad del fichero emite el grupo 5,
 * así que cualquier semilla vale mientras sea estable; 0x100 es la que usan
 * los ficheros reales para el primer objeto de usuario.
 */
const HANDLE_SEED = 0x100;

/** Estado compartido entre la sección ENTITIES y la sección OBJECTS. */
export interface CadDxfSchema4Objects {
  next: number;
  /** Definiciones de imagen ya emitidas, por clave del diccionario. */
  imageDefs: Map<string, { handle: string; definition: CadDxfImageDefinitionRef }>;
  /** Un reactor por INSERCIÓN: apunta de la definición a la entidad IMAGE. */
  reactors: Array<{ handle: string; imageHandle: string; defHandle: string }>;
  /** ¿Hay algún WIPEOUT? Decide si se escribe `ACAD_WIPEOUT_VARS`. */
  wipeouts: number;
  /** Marco de los enmascaramientos: en DXF es GLOBAL, no por entidad. */
  wipeoutFrame: boolean;
}

export function createSchema4Objects(): CadDxfSchema4Objects {
  return {
    next: HANDLE_SEED,
    imageDefs: new Map(),
    reactors: [],
    wipeouts: 0,
    wipeoutFrame: false,
  };
}

function nextHandle(objects: CadDxfSchema4Objects): string {
  objects.next += 1;
  return objects.next.toString(16).toUpperCase();
}

export function schema4ObjectsAreEmpty(objects: CadDxfSchema4Objects): boolean {
  return objects.imageDefs.size === 0 && objects.wipeouts === 0;
}

// ---------------------------------------------------------------------------
// Cabecera de entidad
// ---------------------------------------------------------------------------

function pushEntityHead(
  lines: string[],
  type: string,
  layer: string,
  subclass: string,
  handle?: string,
) {
  pushPair(lines, 0, type);
  if (handle) pushPair(lines, 5, handle);
  pushPair(lines, 100, "AcDbEntity");
  pushPair(lines, 8, layer);
  pushPair(lines, 100, subclass);
}

// ---------------------------------------------------------------------------
// POINT · XLINE · RAY · SOLID
// ---------------------------------------------------------------------------

export function pushPointEntity(
  lines: string[],
  layer: string,
  position: CadDxfPoint,
) {
  // El estilo (PDMODE) y el tamaño (PDSIZE) NO son de la entidad: viajan como
  // variables de cabecera. La pérdida que eso implica —un documento con puntos
  // de estilos distintos— la declara el manifiesto, no se resuelve aquí.
  pushEntityHead(lines, "POINT", layer, "AcDbPoint");
  pushPoint(lines, position);
}

export function pushXLine(
  lines: string[],
  layer: string,
  basePoint: CadDxfPoint,
  direction: CadDxfPoint,
  ray = false,
) {
  pushEntityHead(lines, ray ? "RAY" : "XLINE", layer, ray ? "AcDbRay" : "AcDbXline");
  pushPoint(lines, basePoint);
  pushPair(lines, 11, fmt(direction.x));
  pushPair(lines, 21, fmt(direction.y));
  pushPair(lines, 31, "0");
}

/**
 * SOLID con el CORBATÍN resuelto.
 *
 * El contorno `a-b-c-d` se escribe `10=a, 11=b, 12=d, 13=c`. Escribirlo en
 * orden de polígono produce un reloj de arena relleno —dos triángulos cruzados—
 * en vez del cuadrilátero, y es un error que sólo se ve al abrir el fichero en
 * otro programa. Un triángulo repite su tercer vértice en el cuarto grupo, que
 * es como DXF representa "sólo tres esquinas".
 */
export function pushSolid(lines: string[], layer: string, points: CadDxfPoint[]) {
  const [a, b, c, d] = points;
  const corners = points.length >= 4 ? [a, b, d, c] : [a, b, c, c];
  pushEntityHead(lines, "SOLID", layer, "AcDbTrace");
  corners.forEach((corner, index) => {
    pushPair(lines, 10 + index, fmt(corner.x));
    pushPair(lines, 20 + index, fmt(corner.y));
    pushPair(lines, 30 + index, "0");
  });
}

// ---------------------------------------------------------------------------
// WIPEOUT · IMAGE — el mismo esqueleto de imagen ráster
// ---------------------------------------------------------------------------

interface Bounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function boundsOf(points: CadDxfPoint[]): Bounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  // Un contorno degenerado (todos los puntos en una recta) tendría lado 0 y
  // convertiría cada vértice normalizado en NaN al dividir.
  return {
    minX,
    minY,
    width: Math.max(1e-9, Math.max(...xs) - minX),
    height: Math.max(1e-9, Math.max(...ys) - minY),
  };
}

/**
 * Vértices del contorno de recorte en coordenadas normalizadas de la imagen.
 *
 * El origen es el CENTRO y el lado completo mide 1, de ahí el −0,5. Las
 * coordenadas se resuelven contra la BASE de la imagen (`uAxis` y `vAxis` son
 * los lados completos, ya con la rotación dentro), no dividiendo por un ancho y
 * un alto: para una imagen girada esos dos números no son ejes de nada y el
 * recorte saldría torcido respecto de la imagen que recorta.
 */
function pushClipBoundary(
  lines: string[],
  boundary: CadDxfPoint[],
  origin: CadDxfPoint,
  uAxis: CadDxfPoint,
  vAxis: CadDxfPoint,
) {
  const determinant = uAxis.x * vAxis.y - uAxis.y * vAxis.x;
  // Base degenerada (imagen de lado cero): no hay sistema que resolver.
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return;
  // El contorno poligonal se CIERRA repitiendo el primer vértice, que es como
  // lo escribe AutoCAD; al leerlo se vuelve a fundir.
  const closed = [...boundary, boundary[0]];
  pushPair(lines, 71, 2); // 2 = poligonal (1 sería rectangular)
  pushPair(lines, 91, closed.length);
  for (const vertex of closed) {
    const dx = vertex.x - origin.x;
    const dy = vertex.y - origin.y;
    pushPair(lines, 14, fmt((dx * vAxis.y - dy * vAxis.x) / determinant - 0.5));
    pushPair(lines, 24, fmt((uAxis.x * dy - uAxis.y * dx) / determinant - 0.5));
  }
}

export function pushWipeout(
  lines: string[],
  layer: string,
  boundary: CadDxfPoint[],
  objects: CadDxfSchema4Objects,
  frame = false,
) {
  const bounds = boundsOf(boundary);
  objects.wipeouts += 1;
  // El marco es una variable GLOBAL del fichero (`ACAD_WIPEOUT_VARS`): basta
  // con que un enmascaramiento lo quiera para que el fichero lo declare.
  objects.wipeoutFrame = objects.wipeoutFrame || frame;
  pushEntityHead(lines, "WIPEOUT", layer, "AcDbWipeout", nextHandle(objects));
  pushPair(lines, 90, 0);
  pushPoint(lines, { x: bounds.minX, y: bounds.minY });
  pushPair(lines, 11, fmt(bounds.width));
  pushPair(lines, 21, "0");
  pushPair(lines, 31, "0");
  pushPair(lines, 12, "0");
  pushPair(lines, 22, fmt(bounds.height));
  pushPair(lines, 32, "0");
  // Un enmascaramiento no tiene píxeles: su "imagen" mide 1×1 y todo el
  // encuadre lo define el contorno.
  pushPair(lines, 13, "1");
  pushPair(lines, 23, "1");
  pushPair(lines, 70, 7); // mostrar + mostrar sin alinear + recortar
  pushPair(lines, 280, 1); // recorte activo
  pushPair(lines, 281, 50);
  pushPair(lines, 282, 50);
  pushPair(lines, 283, 0);
  pushClipBoundary(
    lines,
    boundary,
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.width, y: 0 },
    { x: 0, y: bounds.height },
  );
}

/**
 * IMAGE + su definición.
 *
 * La definición se comparte por CLAVE: N inserciones de la misma imagen
 * escriben un solo IMAGEDEF, igual que N INSERT comparten un bloque. El
 * reactor, en cambio, es uno por inserción — es el puntero de vuelta de la
 * definición a la entidad.
 */
export function pushImage(
  lines: string[],
  layer: string,
  insertion: CadDxfPoint,
  payload: {
    uVector: CadDxfPoint;
    vVector: CadDxfPoint;
    pixelWidth: number;
    pixelHeight: number;
    brightness?: number;
    contrast?: number;
    fade?: number;
    showImage?: boolean;
    clipBoundary?: CadDxfPoint[];
    definition: CadDxfImageDefinitionRef;
  },
  objects: CadDxfSchema4Objects,
) {
  const existing = objects.imageDefs.get(payload.definition.key);
  const defHandle = existing?.handle ?? nextHandle(objects);
  if (!existing)
    objects.imageDefs.set(payload.definition.key, {
      handle: defHandle,
      definition: payload.definition,
    });
  const imageHandle = nextHandle(objects);
  const reactorHandle = nextHandle(objects);
  objects.reactors.push({ handle: reactorHandle, imageHandle, defHandle });

  pushEntityHead(lines, "IMAGE", layer, "AcDbRasterImage", imageHandle);
  pushPair(lines, 90, 0);
  pushPoint(lines, insertion);
  pushPair(lines, 11, fmt(payload.uVector.x));
  pushPair(lines, 21, fmt(payload.uVector.y));
  pushPair(lines, 31, "0");
  pushPair(lines, 12, fmt(payload.vVector.x));
  pushPair(lines, 22, fmt(payload.vVector.y));
  pushPair(lines, 32, "0");
  pushPair(lines, 13, fmt(payload.pixelWidth));
  pushPair(lines, 23, fmt(payload.pixelHeight));
  pushPair(lines, 340, defHandle);
  pushPair(lines, 70, payload.showImage === false ? 6 : 7);
  pushPair(lines, 280, payload.clipBoundary?.length ? 1 : 0);
  pushPair(lines, 281, Math.round(payload.brightness ?? 50));
  pushPair(lines, 282, Math.round(payload.contrast ?? 50));
  pushPair(lines, 283, Math.round(payload.fade ?? 0));
  pushPair(lines, 360, reactorHandle);
  if (payload.clipBoundary?.length)
    pushClipBoundary(
      lines,
      payload.clipBoundary,
      insertion,
      { x: payload.uVector.x * payload.pixelWidth, y: payload.uVector.y * payload.pixelWidth },
      { x: payload.vVector.x * payload.pixelHeight, y: payload.vVector.y * payload.pixelHeight },
    );
}

// ---------------------------------------------------------------------------
// ATTDEF
// ---------------------------------------------------------------------------

export function pushAttdef(
  lines: string[],
  layer: string,
  insertion: CadDxfPoint,
  payload: {
    tag: string;
    prompt?: string;
    defaultValue?: string;
    height?: number;
    rotation?: number;
    style?: string;
    alignment?: keyof typeof DXF_TEXT_ANCHOR_CODES;
    invisible?: boolean;
    constant?: boolean;
    verify?: boolean;
    preset?: boolean;
    lockPosition?: boolean;
  },
) {
  const anchor = DXF_TEXT_ANCHOR_CODES[payload.alignment ?? "bottom-left"];
  pushEntityHead(lines, "ATTDEF", layer, "AcDbText");
  pushPoint(lines, insertion);
  pushPair(lines, 40, fmt(Math.max(1e-9, payload.height ?? 250)));
  pushPair(lines, 1, safeText(payload.defaultValue ?? ""));
  if (payload.rotation) pushPair(lines, 50, fmt(payload.rotation));
  pushPair(lines, 7, safeStyleName(payload.style));
  pushPair(lines, 72, anchor.h);
  // Con 72 o 74 distintos de 0, AutoCAD IGNORA el grupo 10 y usa el 11: si no
  // se escribiera, un ATTDEF centrado aterrizaría en el origen del dibujo.
  if (anchor.h !== 0 || anchor.v !== 0) {
    pushPair(lines, 11, fmt(insertion.x));
    pushPair(lines, 21, fmt(insertion.y));
    pushPair(lines, 31, "0");
  }
  pushPair(lines, 100, "AcDbAttributeDefinition");
  pushPair(lines, 3, safeText(payload.prompt ?? payload.tag));
  pushPair(lines, 2, safeText(payload.tag) || "TAG");
  pushPair(
    lines,
    70,
    (payload.invisible ? DXF_ATTDEF_INVISIBLE : 0) |
      (payload.constant ? DXF_ATTDEF_CONSTANT : 0) |
      (payload.verify ? DXF_ATTDEF_VERIFY : 0) |
      (payload.preset ? DXF_ATTDEF_PRESET : 0),
  );
  pushPair(lines, 74, anchor.v);
  pushPair(lines, 280, payload.lockPosition ? 1 : 0);
}

/**
 * ATTRIB posicionado de un INSERT.
 *
 * Su `insertion` ya está en coordenadas del MUNDO —así lo guarda el documento
 * canónico—, así que aquí no se recompone la matriz del bloque: recomponerla
 * era justo lo que dejaba el atributo en un sitio distinto del que el usuario
 * veía en pantalla.
 */
export function pushPositionedAttrib(
  lines: string[],
  layer: string,
  attribute: {
    tag: string;
    value: string;
    insertion: CadDxfPoint;
    height?: number;
    rotation?: number;
    style?: string;
    alignment?: keyof typeof DXF_TEXT_ANCHOR_CODES;
    invisible?: boolean;
  },
) {
  const anchor = DXF_TEXT_ANCHOR_CODES[attribute.alignment ?? "bottom-left"];
  pushEntityHead(lines, "ATTRIB", layer, "AcDbText");
  pushPoint(lines, attribute.insertion);
  pushPair(lines, 40, fmt(Math.max(1e-9, attribute.height ?? 250)));
  pushPair(lines, 1, safeText(attribute.value));
  if (attribute.rotation) pushPair(lines, 50, fmt(attribute.rotation));
  pushPair(lines, 7, safeStyleName(attribute.style));
  pushPair(lines, 72, anchor.h);
  if (anchor.h !== 0 || anchor.v !== 0) {
    pushPair(lines, 11, fmt(attribute.insertion.x));
    pushPair(lines, 21, fmt(attribute.insertion.y));
    pushPair(lines, 31, "0");
  }
  pushPair(lines, 100, "AcDbAttribute");
  pushPair(lines, 2, safeText(attribute.tag) || "TAG");
  pushPair(lines, 70, attribute.invisible ? DXF_ATTDEF_INVISIBLE : 0);
  pushPair(lines, 74, anchor.v);
}

// ---------------------------------------------------------------------------
// Sección OBJECTS
// ---------------------------------------------------------------------------

/**
 * Diccionario de objetos con nombre y todo lo que cuelga de él.
 *
 * Se escribe SÓLO si hay imágenes o enmascaramientos: un dibujo que no los
 * tenga produce byte a byte el mismo fichero que antes de este módulo.
 */
export function pushSchema4Objects(
  lines: string[],
  objects: CadDxfSchema4Objects,
) {
  if (schema4ObjectsAreEmpty(objects)) return;
  const rootHandle = nextHandle(objects);
  const imageDictHandle = objects.imageDefs.size ? nextHandle(objects) : null;
  const wipeoutVarsHandle = objects.wipeouts ? nextHandle(objects) : null;

  pushPair(lines, 0, "SECTION");
  pushPair(lines, 2, "OBJECTS");

  pushPair(lines, 0, "DICTIONARY");
  pushPair(lines, 5, rootHandle);
  pushPair(lines, 100, "AcDbDictionary");
  if (imageDictHandle) {
    pushPair(lines, 3, "ACAD_IMAGE_DICT");
    pushPair(lines, 350, imageDictHandle);
  }
  if (wipeoutVarsHandle) {
    pushPair(lines, 3, "ACAD_WIPEOUT_VARS");
    pushPair(lines, 350, wipeoutVarsHandle);
  }

  if (imageDictHandle) {
    pushPair(lines, 0, "DICTIONARY");
    pushPair(lines, 5, imageDictHandle);
    pushPair(lines, 330, rootHandle);
    pushPair(lines, 100, "AcDbDictionary");
    for (const [key, entry] of objects.imageDefs) {
      pushPair(lines, 3, safeText(key));
      pushPair(lines, 350, entry.handle);
    }
    for (const [, entry] of objects.imageDefs) {
      pushPair(lines, 0, "IMAGEDEF");
      pushPair(lines, 5, entry.handle);
      pushPair(lines, 330, imageDictHandle);
      pushPair(lines, 100, "AcDbRasterImageDef");
      pushPair(lines, 90, 0);
      // Grupo 1: la RUTA, nunca los píxeles. Que el DXF no lleve la imagen
      // dentro es exactamente lo que declara el manifiesto de pérdidas.
      pushPair(lines, 1, safeText(entry.definition.path));
      pushPair(lines, 10, fmt(entry.definition.pixelWidth));
      pushPair(lines, 20, fmt(entry.definition.pixelHeight));
      pushPair(lines, 11, "1");
      pushPair(lines, 21, "1");
      pushPair(lines, 280, entry.definition.loaded === false ? 0 : 1);
      pushPair(lines, 281, 0);
    }
    for (const reactor of objects.reactors) {
      pushPair(lines, 0, "IMAGEDEF_REACTOR");
      pushPair(lines, 5, reactor.handle);
      pushPair(lines, 330, reactor.imageHandle);
      pushPair(lines, 100, "AcDbRasterImageDefReactor");
      pushPair(lines, 90, 2);
      pushPair(lines, 330, reactor.imageHandle);
    }
  }

  if (wipeoutVarsHandle) {
    pushPair(lines, 0, "WIPEOUTVARIABLES");
    pushPair(lines, 5, wipeoutVarsHandle);
    pushPair(lines, 330, rootHandle);
    pushPair(lines, 100, "AcDbWipeoutVariables");
    pushPair(lines, 70, objects.wipeoutFrame ? 1 : 0);
  }

  pushPair(lines, 0, "ENDSEC");
}

// ---------------------------------------------------------------------------
// Variables de cabecera derivadas del modelo
// ---------------------------------------------------------------------------

/**
 * `$PDMODE` y `$PDSIZE` del fichero.
 *
 * En DXF el estilo de punto es del DIBUJO, no del punto. El documento canónico
 * lo guarda por entidad —estrictamente más expresivo—, así que al exportar hay
 * que elegir uno: gana el mayoritario, y si hay más de uno el manifiesto lo
 * declara. `null` = no hay puntos y no se escribe la variable.
 */
export function schema4PointVariables(
  primitives: readonly CadDxfPrimitive[],
): { pdmode: number; pdsize: number } | null {
  const styles = new Map<number, number>();
  const sizes = new Map<number, number>();
  let seen = 0;
  for (const primitive of primitives) {
    if (primitive.kind !== "point" || primitive.schema4?.kind !== "point") continue;
    seen += 1;
    const style = primitive.schema4.style ?? 0;
    const size = primitive.schema4.size ?? 0;
    styles.set(style, (styles.get(style) ?? 0) + 1);
    sizes.set(size, (sizes.get(size) ?? 0) + 1);
  }
  if (!seen) return null;
  const winner = (counts: Map<number, number>) =>
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  return { pdmode: winner(styles), pdsize: winner(sizes) };
}
