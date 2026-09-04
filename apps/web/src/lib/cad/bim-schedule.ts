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
 * ## Tres áreas por local, porque significan tres cosas
 *
 * El recorrido de caras da el área A EJES. Del MISMO anillo salen las otras dos,
 * desplazando cada lado antes de volver a cerrar las esquinas (`bim-areas.ts`):
 *
 *  - **Útil**: cada lado medio grosor hacia dentro. La que se habita y la que
 *    mide un reglamento de dimensión mínima.
 *  - **Construida**: hacia fuera medio grosor si el muro es perimetral —se mide
 *    a paño exterior— y quieto sobre el eje si es medianero —medio para cada
 *    local—. Es la que pide una licencia de construcción, y con ese criterio la
 *    suma de las construidas de todos los locales es la huella construida de la
 *    planta, ni un metro de más ni de menos.
 *
 * Se dan las tres porque confundirlas cuesta dinero: nadie debería tener que
 * adivinar cuál está mirando.
 *
 * Cuando dos lados consecutivos son paralelos no hay intersección y no hay
 * esquina: esas áreas se declaran ausentes, con su motivo en `problems`, en vez
 * de aproximarse. Un número aproximado en un cuadro de áreas es peor que
 * ninguno: se copia al proyecto ejecutivo y nadie vuelve a mirarlo.
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
import { cadWallJunctionOverlaps } from "./wall-junction-overlap";
import { wallOpeningFit } from "./wall-openings";
import { cadPointInBoundary } from "./hatch-associativity";
import { roomDepartmentFromTags, roomUseTypeFromTags } from "./architecture";
import {
  cadRoomBuiltArea,
  cadRoomClearArea,
  type CadRoomSide,
} from "./bim-areas";

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
  /** Volumen de fábrica, ya descontados huecos Y solapes de unión. */
  volume: number;
  /** Superficie de hueco descontada. Se enseña para poder auditar la resta. */
  openingArea: number;
  /**
   * Volumen de SOLAPE de unión descontado (L/T/X): el prisma que dos muros
   * comparten en la esquina, medido con `cadWallJunctionOverlaps` y repartido
   * a partes iguales entre los dos muros. Se enseña para auditar la resta —
   * sin este campo, el descuento sería invisible y el número no se podría
   * defender delante de un presupuesto.
   */
  junctionVolume: number;
}

export interface CadOpeningQuantityRow {
  kind: CadOpeningKind;
  width: number;
  height: number;
  /** Antepecho sobre el suelo (0 en una puerta). Dos antepechos distintos son dos filas. */
  sill: number;
  count: number;
  /** Marca de tipo legible: `P-090x210`, `V-120x120`. */
  mark: string;
}

export interface CadRoomAreaRow {
  /** Estable dentro de un mismo documento: se numera por orden geométrico. */
  id: string;
  /**
   * El nombre que el dibujante ya escribió: el TEXT o MTEXT que cae dentro
   * del anillo del local (Ola E, 2026-09-02). Sin rótulo no hay nombre y el
   * cuadro enseña el `id` (L-01…), que es la verdad y no un invento.
   */
  name?: string;
  /** El uso canónico en español que el clasificador reconoce en el nombre («Recámara», «Baño»…). */
  use?: string;
  /** La entidad de texto de la que salió el nombre. */
  labelId?: string;
  /** Área encerrada por los EJES de los muros. */
  axisArea: number;
  /** Área útil, con los lados metidos medio grosor. Ausente si no se puede. */
  clearArea?: number;
  /**
   * Área CONSTRUIDA: a paño exterior en los muros perimetrales, al eje en los
   * medianeros. Es la que se declara en una licencia. Ausente —y dicho en
   * `problems`— cuando el contorno no deja resolver alguna esquina.
   */
  builtArea?: number;
  /**
   * La parte de la fábrica que le toca a este local: `builtArea − clearArea`.
   * Es lo que la construida añade sobre la útil, y se expone para poder
   * auditar la diferencia entre las dos sin restarlas a mano en la memoria de
   * cálculo. Ausente si falta cualquiera de las dos.
   */
  wallShareArea?: number;
  /** Perímetro a ejes. */
  perimeter: number;
  /** Muros que cierran el local, sin repetir. */
  wallIds: string[];
  /**
   * El anillo a EJES, en sentido antihorario (área con signo positiva) — la
   * misma cara que produce `axisArea`/`perimeter`. Es el contorno que usa
   * `room-solid.ts` para extruir piso y cielorraso: derivarlo de un recorrido
   * DISTINTO habría arriesgado que el cuadro de áreas 2D y la losa 3D
   * discreparan sobre qué es un local, que es justo lo que este módulo existe
   * para impedir en las tablas.
   */
  ring: CadPoint2[];
}

export interface CadBimSchedule {
  walls: CadWallQuantityRow[];
  openings: CadOpeningQuantityRow[];
  rooms: CadRoomAreaRow[];
  /**
   * El contorno exterior de TODA la planta, a ejes, en el mismo sentido
   * positivo que `CadRoomAreaRow.ring` — la cara de área negativa del mismo
   * recorrido que produce los locales, invertida. Es el anillo que extruye la
   * cubierta en `room-solid.ts`: tiene que cubrir la huella entera del
   * edificio, no el interior de un único local. `null` si los muros no
   * cierran ningún contorno.
   */
  exteriorRing: CadPoint2[] | null;
  /**
   * La HUELLA CONSTRUIDA de la planta: la suma de las áreas construidas de
   * todos los locales, que es la superficie que se declara en una licencia.
   * Por cómo se mide cada local —a paño exterior en el perímetro, al eje en el
   * medianero— los locales teselan el contorno exterior desplazado medio
   * grosor hacia fuera, así que esa suma es exactamente esa huella.
   *
   * `null` cuando no hay ningún local, o cuando a alguno le falta su área
   * construida: un total al que le falta un cuarto no es un total, y darlo
   * como si lo fuera es justo el error que este módulo existe para impedir.
   */
  builtArea: number | null;
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
export function buildCadBimSchedule(document: Pick<CadDocument, "entities">): CadBimSchedule {
  const walls: WallLike[] = [];
  const openings: OpeningLike[] = [];
  const labels: RoomLabel[] = [];
  for (const entity of document.entities) {
    if (entity.type === "wall") walls.push(entity);
    else if (entity.type === "opening") openings.push(entity);
    else if (entity.type === "text" && entity.text.trim())
      labels.push({ id: entity.id, text: entity.text, height: entity.height ?? 0, at: { x: entity.x, y: entity.y } });
    else if (entity.type === "mtext" && entity.text.trim())
      labels.push({ id: entity.id, text: entity.text, height: entity.height ?? 0, at: { x: entity.insertion.x, y: entity.insertion.y } });
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
      problems.push(
        `El hueco ${opening.id} no cabe en el muro ${host.id}: ${fit.problem} No se cuenta.`,
      );
      continue;
    }
    const area = opening.width * opening.height;
    openingAreaByWall.set(
      host.id,
      (openingAreaByWall.get(host.id) ?? 0) + area,
    );
    const mark = openingMark(opening);
    // La marca cuenta ancho × alto; el antepecho no entra en ella pero SÍ
    // separa filas: una ventana a 900 y otra a 1.200 no son la misma pieza.
    const rowKey = `${mark}\u0000${opening.sill}`;
    const row = openingRows.get(rowKey);
    if (row) row.count += 1;
    else
      openingRows.set(rowKey, {
        kind: opening.kind,
        width: opening.width,
        height: opening.height,
        sill: opening.sill,
        count: 1,
        mark,
      });
  }

  // Solape de unión por muro: el volumen compartido de cada pareja se parte
  // a la mitad entre sus dos muros — la suma total descuenta el solape UNA vez.
  const junctionVolumeByWall = new Map<string, number>();
  for (const overlap of cadWallJunctionOverlaps(walls)) {
    junctionVolumeByWall.set(
      overlap.aId,
      (junctionVolumeByWall.get(overlap.aId) ?? 0) + overlap.volume / 2,
    );
    junctionVolumeByWall.set(
      overlap.bId,
      (junctionVolumeByWall.get(overlap.bId) ?? 0) + overlap.volume / 2,
    );
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
    const wallGrossVolume = net * wall.thickness;
    const junctionDiscount = Math.min(
      junctionVolumeByWall.get(wall.id) ?? 0,
      wallGrossVolume,
    );
    const wallVolume = wallGrossVolume - junctionDiscount;
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
      row.volume += wallVolume;
      row.openingArea += discounted;
      row.junctionVolume += junctionDiscount;
    } else {
      wallRows.set(key, {
        layer: wall.layer,
        thickness: wall.thickness,
        count: 1,
        length,
        faceArea: net,
        volume: wallVolume,
        openingArea: discounted,
        junctionVolume: junctionDiscount,
      });
    }
  }

  const rooms = detectCadRooms(walls);
  for (const room of rooms.rooms) nameCadRoom(room, labels);
  return {
    walls: [...wallRows.values()].sort(
      (a, b) => a.layer.localeCompare(b.layer) || a.thickness - b.thickness,
    ),
    openings: [...openingRows.values()].sort((a, b) =>
      a.mark.localeCompare(b.mark) || a.sill - b.sill,
    ),
    rooms: rooms.rooms,
    exteriorRing: rooms.exteriorRing,
    builtArea: rooms.builtArea,
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
interface RoomLabel {
  id: string;
  text: string;
  height: number;
  at: CadPoint2;
}

/**
 * El nombre del local es el rótulo que ya está dentro de él (Ola E,
 * 2026-09-02). Medido antes: el cuadro decía «L-03» porque la fila no tenía
 * campo de nombre, y el único módulo que nombra locales en español
 * (`architecture.ts`) operaba sobre los rectángulos del planificador, no sobre
 * el grafo de muros. Aquí se cose esa costura por el camino que ya sigue
 * cualquier despacho: se escribe «RECÁMARA» dentro del cuarto.
 *
 * Con varios rótulos dentro gana el de mayor altura de texto y, a igual
 * altura, el más cercano al centro del local: el rótulo del local es el
 * grande; una nota pequeña en la esquina no lo rebautiza.
 */
export function nameCadRoom(room: CadRoomAreaRow, labels: readonly RoomLabel[]): void {
  const inside = labels.filter((label) => cadPointInBoundary(label.at, room.ring));
  if (inside.length === 0) return;
  const centroid = room.ring.reduce(
    (total, point) => ({ x: total.x + point.x / room.ring.length, y: total.y + point.y / room.ring.length }),
    { x: 0, y: 0 },
  );
  const distance = (label: RoomLabel) => Math.hypot(label.at.x - centroid.x, label.at.y - centroid.y);
  const [best] = [...inside].sort((a, b) => b.height - a.height || distance(a) - distance(b));
  const name = best.text.replace(/\s+/g, " ").trim();
  room.name = name;
  room.labelId = best.id;
  if (roomUseTypeFromTags(undefined, name) !== "unclassified") room.use = roomDepartmentFromTags(undefined, name);
}

export function openingMark(
  opening: Pick<CadOpeningEntity, "kind" | "width" | "height">,
): string {
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
 *  4. La semi-arista GEMELA de cada lado dice qué hay al otro lado del muro:
 *     si pertenece a otra cara-local, el muro es medianero; si no, es
 *     perimetral. Es lo único que hace falta para medir el área construida, y
 *     sale del mismo recorrido — no hay una segunda pasada que pudiera
 *     discrepar de la primera sobre qué es un local.
 */
export function detectCadRooms(walls: readonly WallLike[]): {
  rooms: CadRoomAreaRow[];
  problems: string[];
  exteriorRing: CadPoint2[] | null;
  builtArea: number | null;
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
    .filter(
      (axis) =>
        Math.hypot(axis.b.x - axis.a.x, axis.b.y - axis.a.y) >
        CAD_ROOM_NODE_TOLERANCE,
    );
  if (axes.length === 0)
    return { rooms: [], problems, exteriorRing: null, builtArea: null };

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
      edges.push({
        from,
        to,
        wallId: axis.wall.id,
        thickness: axis.wall.thickness,
      });
    }
  }
  if (edges.length === 0)
    return { rooms: [], problems, exteriorRing: null, builtArea: null };

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
  for (const list of outgoing.values())
    list.sort((left, right) => angleOf(left) - angleOf(right));

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
      if (ring.length >= 3)
        faces.push({ ring, area: signedArea(ring, points) });
    }

  // Las semi-aristas que pertenecen a una cara-LOCAL. Un lado cuya gemela está
  // en este conjunto separa dos locales (medianero); cualquier otro da a la
  // calle, a un patio o a nada (perimetral). Se calcula de una vez, antes de
  // medir, porque un local necesita saberlo de sus vecinos y el orden en que
  // salen las caras del recorrido no está garantizado.
  const roomHalves = new Set<string>();
  for (const face of faces)
    if (face.area > 0) for (const edge of face.ring) roomHalves.add(half(edge));

  const rooms: CadRoomAreaRow[] = [];
  let exteriorFace: { ring: GraphEdge[]; area: number } | null = null;
  for (const face of faces) {
    // El contorno EXTERIOR de la planta sale con área negativa en este recorrido
    // y no es un local: es el aire de alrededor. Si hubiera más de una cara
    // negativa —muros en más de una componente conexa—, se queda la de área
    // más negativa: el envolvente de todo el conjunto.
    //
    // Área EXACTAMENTE cero es un caso distinto y no es el exterior: sale de
    // una planta que no cierra —un muro suelto, una U abierta— cuyo recorrido
    // traza el mismo tramo de ida y de vuelta y cancela a área nula. Tratar
    // ese cero como "el exterior" expondría un anillo degenerado (con puntos
    // repetidos, encierra nada) a `room-solid.ts`; se descarta igual que un
    // local de área nula, sin volverse el contorno de nada.
    if (!(face.area > 0)) {
      if (
        face.area < 0 &&
        (exteriorFace === null || face.area < exteriorFace.area)
      )
        exteriorFace = face;
      continue;
    }
    const ring = face.ring.map((edge) => points.get(edge.from)!);
    const perimeter = ringPerimeter(ring);
    const wallIds = [...new Set(face.ring.map((edge) => edge.wallId))].sort();
    const sides: CadRoomSide[] = face.ring.map((edge) => ({
      from: points.get(edge.from)!,
      to: points.get(edge.to)!,
      thickness: edge.thickness,
      shared: roomHalves.has(`${edge.to}>${edge.from}`),
    }));
    const clear = cadRoomClearArea(sides);
    const built = cadRoomBuiltArea(sides);
    rooms.push({
      id: "",
      axisArea: face.area,
      ...(clear.area === null ? {} : { clearArea: clear.area }),
      ...(built.area === null ? {} : { builtArea: built.area }),
      ...(clear.area === null || built.area === null
        ? {}
        : { wallShareArea: built.area - clear.area }),
      perimeter,
      wallIds,
      ring,
    });
    // Cada motivo se nombra por lo que es. «Lados paralelos» y «más estrecho
    // que sus propios muros» son averías distintas del dibujo y se arreglan de
    // forma distinta: colapsarlas en un mismo aviso obligaría a quien lo lee a
    // adivinar cuál de las dos tiene delante.
    if (clear.area === null && built.area === null)
      problems.push(
        `Un local de ${round(face.area)} a ejes tiene lados paralelos consecutivos: sin esquina que resolver no hay área útil ni área construida, así que se da sólo la de ejes.`,
      );
    else if (clear.area === null)
      problems.push(
        `Un local de ${round(face.area)} a ejes es más estrecho que sus propios muros: al meter los lados medio grosor el contorno se cierra sobre sí mismo y no hay área útil que dar.`,
      );
    else if (built.area === null)
      problems.push(
        `Un local de ${round(face.area)} a ejes no deja resolver su contorno a paño exterior: se dan la de ejes y la útil, pero no la construida.`,
      );
  }

  // La numeración es GEOMÉTRICA (de mayor a menor área) y no de recorrido: el
  // orden del recorrido depende de en qué muro empezó el grafo, así que
  // reabrir el dibujo renumeraría los locales sin que nadie los hubiera tocado.
  rooms.sort((left, right) => right.axisArea - left.axisArea);
  rooms.forEach((room, index) => {
    room.id = `L-${String(index + 1).padStart(2, "0")}`;
  });
  // Mismo sentido positivo que los anillos de local: la cara exterior circula
  // al revés que las caras que encierra, así que se invierte al exponerla.
  const exteriorRing = exteriorFace
    ? exteriorFace.ring.map((edge) => points.get(edge.from)!).reverse()
    : null;
  // La huella de la planta es la SUMA de las construidas, no una medición
  // aparte del contorno exterior: si fueran dos cálculos distintos podrían
  // discrepar, y el cuadro dejaría de cuadrar consigo mismo. Si a un local le
  // falta la suya, no hay total — un total incompleto se presenta igual que uno
  // completo y ahí está el error caro.
  const builtArea =
    rooms.length > 0 && rooms.every((room) => room.builtArea !== undefined)
      ? rooms.reduce((total, room) => total + room.builtArea!, 0)
      : null;
  return { rooms, problems, exteriorRing, builtArea };
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
  if (t <= CAD_ROOM_NODE_TOLERANCE || t >= 1 - CAD_ROOM_NODE_TOLERANCE)
    return null;
  const foot = { x: a.x + dx * t, y: a.y + dy * t };
  const distance = Math.hypot(point.x - foot.x, point.y - foot.y);
  return distance <= CAD_ROOM_NODE_TOLERANCE ? { t, point: foot } : null;
}

function signedArea(
  ring: readonly GraphEdge[],
  points: Map<string, CadPoint2>,
): number {
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
