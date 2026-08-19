/**
 * CUADRO DE ÁREAS y TABLA DE CANTIDADES, derivados del modelo.
 *
 * Un despacho mexicano entrega el cuadro de áreas y la tabla de puertas y
 * ventanas con cada juego de planos, y hoy los teclea: mide con DIST, apunta en
 * una hoja, escribe un MTEXT. Cuando alguien mueve un muro, el plano cambia y la
 * tabla no — y el error se descubre en obra. Este módulo existe para que las dos
 * tablas se CALCULEN del mismo modelo que dibuja el plano, de modo que no puedan
 * discrepar de él.
 *
 * ## De dónde sale cada número
 *
 *  - **Cantidades de muro**: del propio muro. Longitud del eje, superficie de
 *    paramento (longitud × altura) y volumen (× grosor), agrupados por capa y
 *    grosor, que es como se pide un presupuesto.
 *  - **Descuento de huecos**: del hueco alojado. La superficie de una puerta se
 *    RESTA del paramento de su muro y su volumen del volumen. Es la diferencia
 *    entre una medición y una estimación, y sólo es posible porque el hueco
 *    sabe en qué muro está.
 *  - **Cuadro de áreas**: de los EJES de los muros. Se construye el grafo plano
 *    que forman, se recorren sus caras y cada cara acotada es un local. Nadie
 *    dibuja un polígono de local ni lo etiqueta: si los muros cierran, hay
 *    local; si no cierran, no lo hay, y eso también se dice.
 *
 * ## Área a ejes y área útil, las dos
 *
 * El recorrido de caras da el área A EJES. El área ÚTIL —la que se vende y la
 * que exige el reglamento— se saca metiendo cada lado hacia dentro medio grosor
 * del muro que lo produjo e intersecando los lados consecutivos. Se dan las dos
 * porque significan cosas distintas y confundirlas cuesta dinero: nadie debería
 * tener que adivinar cuál de las dos está mirando.
 *
 * Cuando dos lados consecutivos son paralelos no hay intersección y el área útil
 * de ese local se declara ausente en vez de aproximarse. Un número aproximado
 * en un cuadro de áreas es peor que ninguno: se copia al proyecto ejecutivo.
 *
 * ## Lo roto se NOMBRA, no se descarta
 *
 * Un hueco cuyo muro no existe, o que no cabe en él, no se suma a ninguna tabla
 * y aparece en `problems`. Una tabla de cantidades a la que le faltan tres
 * puertas sin decirlo es exactamente el documento con el que se compra material
 * de menos.
 */
import type { CadDocument, CadPoint2 } from "./cad-document";
import type { CadOpeningEntity, CadOpeningKind } from "./cad-entities-v7";
import type { CadWallEntity } from "./cad-entities-v6";
import { wallLength } from "./wall-geometry";
import { wallOpeningFit } from "./wall-openings";

/**
 * Cuantización de nudos del grafo. Dos extremos que caen dentro de esta
 * distancia son EL MISMO nudo. Es la misma doctrina que la tolerancia de unión
 * de muros: absorbe deriva de coma flotante, no suelda lo que el usuario dejó
 * separado — a esta escala, dos clics distintos jamás caen tan cerca.
 */
export const CAD_ROOM_NODE_TOLERANCE = 1e-6;

export interface CadWallQuantityRow {
  /** Clave de agrupación: la capa y el grosor, que es como se presupuesta. */
  layer: string;
  thickness: number;
  count: number;
  /** Longitud total de eje. */
  length: number;
  /** Superficie de paramento por UNA cara, ya descontados los huecos. */
  faceArea: number;
  /** Volumen de fábrica, ya descontado el de los huecos. */
  volume: number;
  /** Superficie de hueco descontada. Se enseña para poder auditar la resta. */
  openingArea: number;
}

export interface CadOpeningQuantityRow {
  kind: CadOpeningKind;
  width: number;
  height: number;
  count: number;
  /** Marca de tipo legible: `P-090x210`, `V-120x120`. */
  mark: string;
}

export interface CadRoomAreaRow {
  /** Estable dentro de un mismo documento: se numera por orden geométrico. */
  id: string;
  /** Área encerrada por los EJES de los muros. */
  axisArea: number;
  /** Área útil, con los lados metidos medio grosor. Ausente si no se puede. */
  clearArea?: number;
  /** Perímetro a ejes. */
  perimeter: number;
  /** Muros que cierran el local, sin repetir. */
  wallIds: string[];
}

export interface CadBimSchedule {
  walls: CadWallQuantityRow[];
  openings: CadOpeningQuantityRow[];
  rooms: CadRoomAreaRow[];
  /** Lo que no se pudo contar, y por qué. Nunca vacío por conveniencia. */
  problems: string[];
}

type WallLike = CadWallEntity;
type OpeningLike = CadOpeningEntity;

/**
 * Construye las dos tablas de una sola pasada.
 *
 * Se devuelven juntas y no en dos funciones porque comparten el índice de
 * huecos por muro y la lista de problemas: separarlas obligaría a recorrer el
 * documento dos veces y a decidir cuál de las dos reporta un hueco huérfano.
 */
export function buildCadBimSchedule(document: CadDocument): CadBimSchedule {
  const walls: WallLike[] = [];
  const openings: OpeningLike[] = [];
  for (const entity of document.entities) {
    if (entity.type === "wall") walls.push(entity);
    else if (entity.type === "opening") openings.push(entity);
  }

  const problems: string[] = [];
  const byId = new Map(walls.map((wall) => [wall.id, wall]));
  /** Superficie de hueco por muro, para descontarla del paramento. */
  const openingAreaByWall = new Map<string, number>();
  const openingRows = new Map<string, CadOpeningQuantityRow>();

  for (const opening of openings) {
    const host = byId.get(opening.hostId);
    if (!host) {
      problems.push(
        `El hueco ${opening.id} dice alojarse en el muro ${opening.hostId}, que no está en el dibujo: no se cuenta.`,
      );
      continue;
    }
    const fit = wallOpeningFit(host, opening);
    if (!fit.ok) {
      problems.push(`El hueco ${opening.id} no cabe en el muro ${host.id}: ${fit.problem} No se cuenta.`);
      continue;
    }
    const area = opening.width * opening.height;
    openingAreaByWall.set(host.id, (openingAreaByWall.get(host.id) ?? 0) + area);
    const mark = openingMark(opening);
    const row = openingRows.get(mark);
    if (row) row.count += 1;
    else
      openingRows.set(mark, {
        kind: opening.kind,
        width: opening.width,
        height: opening.height,
        count: 1,
        mark,
      });
  }

  const wallRows = new Map<string, CadWallQuantityRow>();
  for (const wall of walls) {
    const length = wallLength(wall);
    const gross = length * wall.height;
    const discounted = Math.min(openingAreaByWall.get(wall.id) ?? 0, gross);
    if ((openingAreaByWall.get(wall.id) ?? 0) > gross)
      problems.push(
        `Los huecos del muro ${wall.id} suman más superficie que el propio muro: se descuenta el muro entero, no un negativo.`,
      );
    const net = gross - discounted;
    // Clave compuesta capa+espesor. El separador se escribe con el escape
    // `\u0000` y NO como byte crudo: un NUL literal en el fuente hace que git
    // clasifique el archivo como binario, y ahí se pierden el diff, el merge a
    // tres bandas y toda posibilidad de revisión. El carácter en ejecución es el
    // mismo, así que el agrupado no cambia. Se elige U+0000 porque es el único
    // que nunca puede aparecer dentro de un nombre de capa, de modo que dos
    // parejas capa/espesor distintas jamás producen la misma clave.
    const key = `${wall.layer}\u0000${wall.thickness}`;
    const row = wallRows.get(key);
    if (row) {
      row.count += 1;
      row.length += length;
      row.faceArea += net;
      row.volume += net * wall.thickness;
      row.openingArea += discounted;
    } else {
      wallRows.set(key, {
        layer: wall.layer,
        thickness: wall.thickness,
        count: 1,
        length,
        faceArea: net,
        volume: net * wall.thickness,
        openingArea: discounted,
      });
    }
  }

  const rooms = detectCadRooms(walls);
  return {
    walls: [...wallRows.values()].sort(
      (a, b) => a.layer.localeCompare(b.layer) || a.thickness - b.thickness,
    ),
    openings: [...openingRows.values()].sort((a, b) => a.mark.localeCompare(b.mark)),
    rooms: rooms.rooms,
    problems: [...problems, ...rooms.problems],
  };
}

/**
 * Marca de tipo, como la escribe un despacho: `P-090x210`, `V-120x120`.
 *
 * Se redondea a centímetros porque es la precisión con la que se pide una
 * carpintería, y porque sin redondear dos puertas de 900 y 900,0001 —lo que deja
 * un escalado— saldrían como dos tipos distintos en la tabla.
 */
export function openingMark(opening: Pick<CadOpeningEntity, "kind" | "width" | "height">): string {
  const cm = (value: number) => String(Math.round(value / 10)).padStart(3, "0");
  return `${opening.kind === "door" ? "P" : "V"}-${cm(opening.width)}x${cm(opening.height)}`;
}

// ---------------------------------------------------------------------------
// Cuadro de áreas: las caras del grafo plano de los ejes
// ---------------------------------------------------------------------------

interface GraphEdge {
  from: string;
  to: string;
  wallId: string;
  thickness: number;
}

/**
 * Detecta los locales que cierran los muros.
 *
 * El algoritmo es el recorrido de caras de un grafo plano, que es el estándar y
 * el único que no exige que nadie dibuje el contorno del local:
 *
 *  1. Cada eje de muro es una arista, PARTIDA en los puntos donde acaba otro
 *     muro sobre ella. Sin ese partido, una T no une nada y una planta con
 *     tabiques interiores no cierra ni un local.
 *  2. Cada arista da dos semi-aristas opuestas. Desde una, la siguiente de la
 *     cara es la que sigue en orden angular a la de vuelta.
 *  3. Cada ciclo cerrado es una cara. Las de área POSITIVA son locales; la
 *     negativa es el contorno exterior de la planta, que no es un local.
 */
export function detectCadRooms(walls: readonly WallLike[]): {
  rooms: CadRoomAreaRow[];
  problems: string[];
} {
  const problems: string[] = [];
  const points = new Map<string, CadPoint2>();
  const key = (point: CadPoint2): string => {
    const quantum = CAD_ROOM_NODE_TOLERANCE;
    const id = `${Math.round(point.x / quantum)}:${Math.round(point.y / quantum)}`;
    if (!points.has(id)) points.set(id, { x: point.x, y: point.y });
    return id;
  };

  const axes = walls
    .map((wall) => ({
      wall,
      a: { x: wall.start.x, y: wall.start.y },
      b: { x: wall.end.x, y: wall.end.y },
    }))
    .filter((axis) => Math.hypot(axis.b.x - axis.a.x, axis.b.y - axis.a.y) > CAD_ROOM_NODE_TOLERANCE);
  if (axes.length === 0) return { rooms: [], problems };

  const ends = axes.flatMap((axis) => [axis.a, axis.b]);
  const edges: GraphEdge[] = [];
  for (const axis of axes) {
    // Los puntos INTERIORES donde acaba otro muro parten esta arista: es lo que
    // convierte una T en un nudo del grafo. Sin esto, un tabique que llega a un
    // muro perimetral no cierra el local que forma con él.
    const cuts = ends
      .map((end) => projectOnSegment(axis.a, axis.b, end))
      .filter((cut): cut is { t: number; point: CadPoint2 } => cut !== null)
      .sort((left, right) => left.t - right.t);
    const chain = [axis.a, ...cuts.map((cut) => cut.point), axis.b];
    for (let index = 1; index < chain.length; index += 1) {
      const from = key(chain[index - 1]);
      const to = key(chain[index]);
      if (from === to) continue;
      edges.push({ from, to, wallId: axis.wall.id, thickness: axis.wall.thickness });
    }
  }
  if (edges.length === 0) return { rooms: [], problems };

  /** Semi-aristas salientes por nudo, ordenadas por ángulo. */
  const outgoing = new Map<string, GraphEdge[]>();
  const push = (edge: GraphEdge) => {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  };
  for (const edge of edges) {
    push(edge);
    push({ ...edge, from: edge.to, to: edge.from });
  }
  const angleOf = (edge: GraphEdge): number => {
    const from = points.get(edge.from)!;
    const to = points.get(edge.to)!;
    return Math.atan2(to.y - from.y, to.x - from.x);
  };
  for (const list of outgoing.values()) list.sort((left, right) => angleOf(left) - angleOf(right));

  const visited = new Set<string>();
  const half = (edge: GraphEdge) => `${edge.from}>${edge.to}`;
  const faces: { ring: GraphEdge[]; area: number }[] = [];
  for (const [, list] of outgoing)
    for (const start of list) {
      if (visited.has(half(start))) continue;
      const ring: GraphEdge[] = [];
      let current = start;
      // Cota dura: cada semi-arista se visita una vez, así que una cara no puede
      // tener más lados que semi-aristas hay. El tope existe porque un grafo mal
      // formado colgaría el editor, y colgar el editor no es una opción.
      for (let guard = 0; guard <= edges.length * 2 + 1; guard += 1) {
        if (visited.has(half(current))) break;
        visited.add(half(current));
        ring.push(current);
        const siblings = outgoing.get(current.to) ?? [];
        const back = siblings.findIndex((edge) => edge.to === current.from);
        if (back < 0) break;
        current = siblings[(back - 1 + siblings.length) % siblings.length];
        if (half(current) === half(start)) break;
      }
      if (ring.length >= 3) faces.push({ ring, area: signedArea(ring, points) });
    }

  const rooms: CadRoomAreaRow[] = [];
  for (const face of faces) {
    // El contorno EXTERIOR de la planta sale con área negativa en este recorrido
    // y no es un local: es el aire de alrededor.
    if (!(face.area > 0)) continue;
    const ring = face.ring.map((edge) => points.get(edge.from)!);
    const perimeter = ringPerimeter(ring);
    const wallIds = [...new Set(face.ring.map((edge) => edge.wallId))].sort();
    const clear = clearArea(face.ring, points);
    rooms.push({
      id: "",
      axisArea: face.area,
      ...(clear === null ? {} : { clearArea: clear }),
      perimeter,
      wallIds,
    });
    if (clear === null)
      problems.push(
        `Un local de ${round(face.area)} a ejes tiene lados paralelos consecutivos y su área útil no está definida: se da sólo la de ejes.`,
      );
  }

  // La numeración es GEOMÉTRICA (de mayor a menor área) y no de recorrido: el
  // orden del recorrido depende de en qué muro empezó el grafo, así que
  // reabrir el dibujo renumeraría los locales sin que nadie los hubiera tocado.
  rooms.sort((left, right) => right.axisArea - left.axisArea);
  rooms.forEach((room, index) => {
    room.id = `L-${String(index + 1).padStart(2, "0")}`;
  });
  return { rooms, problems };
}

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Proyección de un punto sobre el INTERIOR de un segmento. `null` si no cae. */
function projectOnSegment(
  a: CadPoint2,
  b: CadPoint2,
  point: CadPoint2,
): { t: number; point: CadPoint2 } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!(length > CAD_ROOM_NODE_TOLERANCE)) return null;
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (length * length);
  if (t <= CAD_ROOM_NODE_TOLERANCE || t >= 1 - CAD_ROOM_NODE_TOLERANCE) return null;
  const foot = { x: a.x + dx * t, y: a.y + dy * t };
  const distance = Math.hypot(point.x - foot.x, point.y - foot.y);
  return distance <= CAD_ROOM_NODE_TOLERANCE ? { t, point: foot } : null;
}

function signedArea(ring: readonly GraphEdge[], points: Map<string, CadPoint2>): number {
  let total = 0;
  for (const edge of ring) {
    const from = points.get(edge.from)!;
    const to = points.get(edge.to)!;
    total += from.x * to.y - to.x * from.y;
  }
  return total / 2;
}

function ringPerimeter(ring: readonly CadPoint2[]): number {
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const from = ring[index];
    const to = ring[(index + 1) % ring.length];
    total += Math.hypot(to.x - from.x, to.y - from.y);
  }
  return total;
}

/**
 * Área ÚTIL: la cara del anillo metida hacia dentro medio grosor del muro que
 * la produjo, con las esquinas resueltas por intersección de los lados
 * desplazados. Es exactamente el mismo criterio con el que se limpia un inglete
 * en `wall-joins.ts`, aplicado al interior del local.
 *
 * `null` cuando dos lados consecutivos son paralelos: no hay intersección y no
 * hay esquina. Véase la cabecera sobre por qué no se aproxima.
 */
function clearArea(ring: readonly GraphEdge[], points: Map<string, CadPoint2>): number | null {
  const lines = ring.map((edge) => {
    const from = points.get(edge.from)!;
    const to = points.get(edge.to)!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) return null;
    // El anillo interior se recorre en sentido antihorario (área positiva), así
    // que la normal que apunta HACIA DENTRO del local es la de la izquierda.
    const offset = edge.thickness / 2;
    const nx = (-dy / length) * offset;
    const ny = (dx / length) * offset;
    return {
      point: { x: from.x + nx, y: from.y + ny },
      direction: { x: dx / length, y: dy / length },
    };
  });
  if (lines.some((line) => line === null)) return null;

  const corners: CadPoint2[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index]!;
    const next = lines[(index + 1) % lines.length]!;
    const cross = current.direction.x * next.direction.y - current.direction.y * next.direction.x;
    if (Math.abs(cross) < 1e-9) return null;
    const dx = next.point.x - current.point.x;
    const dy = next.point.y - current.point.y;
    const t = (dx * next.direction.y - dy * next.direction.x) / cross;
    corners.push({
      x: current.point.x + current.direction.x * t,
      y: current.point.y + current.direction.y * t,
    });
  }
  let total = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const from = corners[index];
    const to = corners[(index + 1) % corners.length];
    total += from.x * to.y - to.x * from.y;
  }
  const area = total / 2;
  // Un local más estrecho que sus muros se cierra sobre sí mismo al meter los
  // lados: el área sale negativa o nula y lo honesto es no dar ninguna.
  return area > 0 ? area : null;
}
