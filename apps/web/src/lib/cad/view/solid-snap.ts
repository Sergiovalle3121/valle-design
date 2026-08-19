/**
 * Referencia a objetos (OSNAP) sobre ARISTAS y VÉRTICES de sólidos.
 *
 * ## El problema, dicho con precisión
 *
 * `snap-engine.ts` es 2D de arriba abajo: trabaja sobre `Segment` con dos
 * puntos `{x, y}` y devuelve un punto `{x, y}`. Un sólido no cabe ahí por dos
 * motivos distintos, y sólo uno es obvio.
 *
 *  1. **La cota se pierde.** El vértice superior y el inferior de un prisma
 *     tienen la MISMA proyección en planta. Engancharse a «ese vértice» devuelve
 *     un punto sin z, y dibujar desde él pone la línea en el suelo.
 *  2. **El sitio donde hay que apuntar es otro.** Y esto es lo que de verdad
 *     rompe el gesto. En modo 3D, el puntero se convierte en coordenadas de
 *     dibujo lanzando un rayo contra el plano del SUELO. Así que hoy, para
 *     engancharse a la esquina superior de una caja, hay que colocar el cursor
 *     sobre la SOMBRA de esa esquina en el suelo, no sobre la esquina que se ve
 *     dibujada. Es un enganche que existe pero que nadie puede usar.
 *
 * ## La decisión: proyectar al plano de la vista, no subir el motor a 3D
 *
 * Se proyectan las aristas del sólido a PÍXELES de pantalla y se resuelve el
 * enganche ahí, devolviendo el punto 3D EXACTO. Las razones son de semántica,
 * no de comodidad:
 *
 *  · **La apertura se mide en píxeles.** Es una tolerancia de pantalla, no de
 *    mundo. En espacio de vista la tolerancia ES la apertura, sin conversión y
 *    sin la deriva que tiene bajo perspectiva.
 *  · **La intersección de dos aristas 3D casi nunca existe.** Dos aristas que se
 *    cruzan en la pantalla se cruzan en la pantalla; en el espacio se cruzan
 *    sólo por casualidad. «Intersección aparente» no es una aproximación de un
 *    concepto 3D: es un concepto de PANTALLA, y en 3D es el único que hay.
 *  · **La profundidad ordena los empates.** Dos candidatos a la misma distancia
 *    del cursor se desempatan por cercanía a la cámara, que es lo que un
 *    dibujante espera: se engancha a lo que ve, no a lo que hay detrás.
 *
 * Subir el motor a 3D obligaría a reescribir la prioridad de desempate, el pie
 * de perpendicular y la intersección, es decir, a mantener DOS semánticas de
 * OSNAP. Aquí se reutiliza `SnapType` y `SNAP_PRIORITY` tal cual: la tabla de
 * desempate es la misma que en 2D, y eso es deliberado.
 *
 * ## El coste, que es la única razón por la que esto podría no valer
 *
 * Un sólido de muchas caras no puede convertir un `pointermove` en un cuadro
 * perdido. Lo que hace que quepa es el reparto del trabajo:
 *
 *  · **Proyectar es O(V) y se hace una vez por CÁMARA**, no por movimiento del
 *    ratón. Mientras la cámara no se mueve, la proyección vale.
 *  · **Consultar es local.** Una rejilla uniforme sobre la PANTALLA acota los
 *    candidatos a los de la celda del cursor; el resto del sólido no se toca.
 *  · **Nada se proyecta dos veces.** Los puntos medios y los puntos sobre una
 *    arista se derivan de las proyecciones de los extremos con interpolación
 *    racional exacta (ver `screenParameterToEdgeParameter`), sin volver a pasar
 *    por la cámara.
 *
 * Los números medidos, con su máquina y su carga declaradas, están en
 * `solid-snap.spec.ts`.
 */
import {
  faceCentroid,
  halfEdgeDestination,
  type BrepBody,
  type Vec3,
} from "../../brep";
import { SNAP_PRIORITY, type SnapType } from "../snap-engine";

/** Punto de dibujo con cota: la unidad en la que se habla aquí. */
export type CadSnapPoint3 = Vec3;

/**
 * Proyección de un punto de dibujo a píxeles del lienzo.
 *
 * `w` es el divisor homogéneo de la cámara (la profundidad en espacio de vista
 * bajo perspectiva; `1` bajo proyección paralela). Viaja porque sin él no se
 * puede interpolar a lo largo de una arista sin equivocarse: ver
 * `screenParameterToEdgeParameter`.
 */
export interface CadProjectedPoint {
  x: number;
  y: number;
  w: number;
}

/** `null` para lo que queda detrás de la cámara o fuera de su rango útil. */
export type CadSolidSnapProjector = (point: CadSnapPoint3) => CadProjectedPoint | null;

export interface CadSolidSnapResult {
  /** El punto EXACTO del sólido, en coordenadas de dibujo y con su cota. */
  point: CadSnapPoint3;
  type: SnapType;
  /** Distancia en PÍXELES entre el cursor y la proyección del punto. */
  screenDistancePx: number;
  /** Profundidad del punto. Menor = más cerca de la cámara. */
  depth: number;
  entityId: string;
}

export interface CadSolidSnapSource {
  entityId: string;
  body: BrepBody;
}

export interface CadSolidSnapQuery {
  /** Radio de captura, en píxeles de pantalla. */
  aperturePx: number;
  /** Origen del elástico, en coordenadas de DIBUJO. Sólo lo usa PERPENDICULAR. */
  from?: CadSnapPoint3 | null;
  /** Modos habilitados. Si falta, todos los que este motor sabe resolver. */
  modes?: Partial<Record<SnapType, boolean>>;
  /**
   * Tope de aristas que se cruzan entre sí buscando intersecciones aparentes.
   * Es O(n²) sobre las candidatas de la celda, y sin tope una zona con cien
   * aristas convertiría el enganche en diez mil pruebas.
   */
  maxIntersectionEdges?: number;
}

/** Los modos que este motor sabe resolver sobre un sólido. */
export const CAD_SOLID_SNAP_MODES: readonly SnapType[] = [
  "endpoint",
  "midpoint",
  "geometric-center",
  "perpendicular",
  "nearest",
  "apparent-intersection",
];

/**
 * Topes del índice. Fallo CERRADO: por encima, `buildCadSolidSnapIndex` se
 * niega y dice por qué, en vez de indexar una parte y devolver enganches que
 * parecen correctos mientras se saltan la mitad del sólido.
 */
export const CAD_SOLID_SNAP_MAX_POINTS = 200_000;
export const CAD_SOLID_SNAP_MAX_EDGES = 300_000;

/** Lado de la celda de la rejilla de pantalla, en píxeles. */
export const CAD_SOLID_SNAP_CELL_PX = 64;

/**
 * Celdas que puede ocupar una arista antes de mandarla a la lista larga.
 *
 * Una arista que cruza la pantalla entera tocaría cientos de celdas, y
 * registrarla en todas cuesta más que mirarla siempre. A partir de este número
 * se guarda aparte y se examina en cada consulta: son pocas, y así la rejilla no
 * se llena de la misma arista repetida.
 */
const OVERSIZED_EDGE_CELLS = 24;

export type CadSolidSnapBuild =
  | { ok: true; index: CadSolidSnapIndex }
  | { ok: false; reason: string };

/**
 * Reúne los puntos y aristas de un conjunto de sólidos ya evaluados.
 *
 * Los cuerpos ENTRAN ya evaluados: evaluar un árbol de construcción puede
 * lanzar, y un índice de enganche no es el sitio donde descubrir que un sólido
 * está roto. Quien los reúne decide qué hacer con los que no evalúan.
 */
export function buildCadSolidSnapIndex(
  sources: readonly CadSolidSnapSource[],
): CadSolidSnapBuild {
  let pointCount = 0;
  let edgeCount = 0;
  for (const source of sources) {
    pointCount += source.body.vertices.length + source.body.faces.length;
    edgeCount += source.body.edges.length;
  }
  if (pointCount > CAD_SOLID_SNAP_MAX_POINTS)
    return {
      ok: false,
      reason: `El enganche 3D indexa hasta ${CAD_SOLID_SNAP_MAX_POINTS} puntos y estos sólidos suman ${pointCount}.`,
    };
  if (edgeCount > CAD_SOLID_SNAP_MAX_EDGES)
    return {
      ok: false,
      reason: `El enganche 3D indexa hasta ${CAD_SOLID_SNAP_MAX_EDGES} aristas y estos sólidos suman ${edgeCount}.`,
    };

  const points: CadSnapPoint3[] = [];
  const pointKind = new Uint8Array(pointCount);
  const pointEntity: number[] = [];
  const edgeFrom: number[] = [];
  const edgeTo: number[] = [];
  const edgeEntity: number[] = [];
  const entityIds: string[] = [];

  for (const source of sources) {
    const entity = entityIds.length;
    entityIds.push(source.entityId);
    const base = points.length;
    for (const vertex of source.body.vertices) {
      pointKind[points.length] = 0;
      pointEntity.push(entity);
      points.push(vertex.point);
    }
    for (let face = 0; face < source.body.faces.length; face += 1) {
      pointKind[points.length] = 1;
      pointEntity.push(entity);
      points.push(faceCentroid(source.body, face));
    }
    for (const edge of source.body.edges) {
      // `a` existe siempre; `b` puede no existir en una lámina y no hace falta:
      // la geometría de la arista es la misma por los dos lados.
      const from = source.body.halfEdges[edge.a].origin;
      const to = halfEdgeDestination(source.body, edge.a);
      edgeFrom.push(base + from);
      edgeTo.push(base + to);
      edgeEntity.push(entity);
    }
  }

  return {
    ok: true,
    index: new CadSolidSnapIndex(
      points,
      pointKind,
      pointEntity,
      edgeFrom,
      edgeTo,
      edgeEntity,
      entityIds,
    ),
  };
}

/**
 * Parámetro 3D de una arista a partir del parámetro de su PROYECCIÓN.
 *
 * Es la corrección de perspectiva, y saltársela es el error silencioso de este
 * módulo: la mitad de la proyección de una arista NO es la proyección de su
 * mitad en cuanto la arista se aleja del observador. Con una arista de 10 m
 * vista en escorzo, interpolar linealmente en pantalla coloca el punto medio a
 * decímetros de donde está. La cuenta sale de que la proyección es una función
 * racional del parámetro: `u = t·w_b / (w_a + t·(w_b − w_a))`, y esto es su
 * inversa.
 */
export function screenParameterToEdgeParameter(u: number, wa: number, wb: number): number {
  const denominator = wb + u * (wa - wb);
  if (!(Math.abs(denominator) > 1e-12)) return u;
  return (u * wa) / denominator;
}

/** Y la ida: parámetro 3D → parámetro sobre la proyección. */
export function edgeParameterToScreenParameter(t: number, wa: number, wb: number): number {
  const denominator = wa + t * (wb - wa);
  if (!(Math.abs(denominator) > 1e-12)) return t;
  return (t * wb) / denominator;
}

interface ProjectedState {
  px: Float64Array;
  py: Float64Array;
  pw: Float64Array;
  visible: Uint8Array;
  cellPx: number;
  columns: number;
  widthPx: number;
  heightPx: number;
  /**
   * La rejilla, que se construye PEREZOSAMENTE en la primera consulta.
   *
   * Y ésta es la decisión que hace que orbitar no cueste: mientras el usuario
   * arrastra la vista, la cámara cambia en cada cuadro y NADIE consulta el
   * enganche —no se puede enganchar y orbitar a la vez—. Construir los cubos en
   * `project()` pagaría en cada uno de esos cuadros un trabajo que nadie va a
   * usar. Se paga una sola vez, en el primer `pointermove` después de soltar.
   */
  grid: {
    cells: Map<number, number[]>;
    pointCells: Map<number, number[]>;
    oversized: number[];
    liveEdges: number;
  } | null;
}

export class CadSolidSnapIndex {
  private projected: ProjectedState | null = null;

  /** @internal Se construye con `buildCadSolidSnapIndex`. */
  constructor(
    private readonly points: readonly CadSnapPoint3[],
    private readonly pointKind: Uint8Array,
    private readonly pointEntity: readonly number[],
    private readonly edgeFrom: readonly number[],
    private readonly edgeTo: readonly number[],
    private readonly edgeEntity: readonly number[],
    private readonly entityIds: readonly string[],
  ) {}

  get pointCount(): number {
    return this.points.length;
  }

  get edgeCount(): number {
    return this.edgeFrom.length;
  }

  /**
   * Aristas cuyos dos extremos caen delante de la cámara.
   *
   * Fuerza la construcción de la rejilla: es un dato de diagnóstico, no del
   * camino caliente, y devolver `0` mientras la rejilla no existe mentiría.
   */
  get projectedEdgeCount(): number {
    const state = this.projected;
    if (!state) return 0;
    return this.ensureGrid(state).liveEdges;
  }

  /**
   * Proyecta el índice para una cámara concreta.
   *
   * Se llama al MOVER LA CÁMARA, no al mover el ratón. Ésa es la separación que
   * hace que el enganche 3D quepa en un cuadro: mientras la vista no cambia,
   * cada consulta sólo mira la celda del cursor.
   */
  project(
    projector: CadSolidSnapProjector,
    viewport: { widthPx: number; heightPx: number },
    cellPx = CAD_SOLID_SNAP_CELL_PX,
  ): void {
    const count = this.points.length;
    const px = new Float64Array(count);
    const py = new Float64Array(count);
    const pw = new Float64Array(count);
    const visible = new Uint8Array(count);
    for (let index = 0; index < count; index += 1) {
      const screen = projector(this.points[index]);
      if (!screen) continue;
      px[index] = screen.x;
      py[index] = screen.y;
      pw[index] = screen.w;
      visible[index] = 1;
    }

    const cell = Math.max(8, cellPx);
    this.projected = {
      px,
      py,
      pw,
      visible,
      cellPx: cell,
      columns: Math.max(1, Math.ceil(Math.max(1, viewport.widthPx) / cell)),
      widthPx: viewport.widthPx,
      heightPx: viewport.heightPx,
      grid: null,
    };
  }

  /** Construye la rejilla de pantalla si aún no existe. Ver `ProjectedState.grid`. */
  private ensureGrid(state: ProjectedState): NonNullable<ProjectedState["grid"]> {
    if (state.grid) return state.grid;
    const { px, py, visible, cellPx: cell, columns } = state;
    const cells = new Map<number, number[]>();
    const pointCells = new Map<number, number[]>();
    const oversized: number[] = [];
    let liveEdges = 0;

    const push = (map: Map<number, number[]>, at: number, value: number): void => {
      const bucket = map.get(at);
      if (bucket) bucket.push(value);
      else map.set(at, [value]);
    };

    for (let index = 0; index < px.length; index += 1) {
      if (!visible[index]) continue;
      push(
        pointCells,
        Math.floor(py[index] / cell) * columns + Math.floor(px[index] / cell),
        index,
      );
    }

    for (let edge = 0; edge < this.edgeFrom.length; edge += 1) {
      const a = this.edgeFrom[edge];
      const b = this.edgeTo[edge];
      // Una arista con un extremo detrás de la cámara no se recorta: se
      // descarta. Recortarla exigiría un punto nuevo que no está en el sólido, y
      // engancharse a un punto inventado por el recorte es peor que no
      // engancharse.
      if (!visible[a] || !visible[b]) continue;
      liveEdges += 1;
      const minColumn = Math.floor(Math.min(px[a], px[b]) / cell);
      const maxColumn = Math.floor(Math.max(px[a], px[b]) / cell);
      const minRow = Math.floor(Math.min(py[a], py[b]) / cell);
      const maxRow = Math.floor(Math.max(py[a], py[b]) / cell);
      if ((maxColumn - minColumn + 1) * (maxRow - minRow + 1) > OVERSIZED_EDGE_CELLS) {
        oversized.push(edge);
        continue;
      }
      for (let column = minColumn; column <= maxColumn; column += 1)
        for (let row = minRow; row <= maxRow; row += 1)
          push(cells, row * columns + column, edge);
    }

    state.grid = { cells, pointCells, oversized, liveEdges };
    return state.grid;
  }

  /** Olvida la proyección. La siguiente consulta devuelve `null`. */
  invalidate(): void {
    this.projected = null;
  }

  get ready(): boolean {
    return this.projected !== null;
  }

  /**
   * Mejor enganche bajo un píxel del lienzo, o `null`.
   *
   * Sin proyección previa devuelve `null` en vez de proyectar sobre la marcha:
   * proyectar dentro de un `pointermove` es exactamente el coste que este
   * reparto existe para no pagar, y esconderlo aquí lo haría invisible.
   */
  query(cursorX: number, cursorY: number, options: CadSolidSnapQuery): CadSolidSnapResult | null {
    const state = this.projected;
    if (!state) return null;
    const aperture = Math.abs(options.aperturePx);
    if (!(aperture > 0)) return null;
    const modes = options.modes;
    const on = (type: SnapType): boolean => !modes || modes[type] !== false;

    const candidates: CadSolidSnapResult[] = [];
    const consider = (
      point: CadSnapPoint3,
      screenX: number,
      screenY: number,
      depth: number,
      type: SnapType,
      entity: number,
    ): void => {
      const distance = Math.hypot(screenX - cursorX, screenY - cursorY);
      if (distance > aperture) return;
      candidates.push({
        point,
        type,
        screenDistancePx: distance,
        depth,
        entityId: this.entityIds[entity],
      });
    };

    // --- Puntos: vértices (endpoint) y centroides de cara (geometric-center) ---
    for (const index of this.pointsNear(state, cursorX, cursorY, aperture)) {
      const type: SnapType = this.pointKind[index] === 1 ? "geometric-center" : "endpoint";
      if (!on(type)) continue;
      consider(
        this.points[index],
        state.px[index],
        state.py[index],
        state.pw[index],
        type,
        this.pointEntity[index],
      );
    }

    // --- Aristas: punto medio, punto más cercano y pie de perpendicular ------
    const near = this.edgesNear(state, cursorX, cursorY, aperture);
    for (const edge of near) {
      const a = this.edgeFrom[edge];
      const b = this.edgeTo[edge];
      const wa = state.pw[a];
      const wb = state.pw[b];
      const entity = this.edgeEntity[edge];
      const from = this.points[a];
      const to = this.points[b];

      if (on("midpoint")) {
        const t = 0.5;
        const u = edgeParameterToScreenParameter(t, wa, wb);
        consider(
          lerp3(from, to, t),
          state.px[a] + (state.px[b] - state.px[a]) * u,
          state.py[a] + (state.py[b] - state.py[a]) * u,
          wa + (wb - wa) * u,
          "midpoint",
          entity,
        );
      }

      if (on("nearest")) {
        const u = clamp01(
          projectOnSegment(cursorX, cursorY, state.px[a], state.py[a], state.px[b], state.py[b]),
        );
        const t = screenParameterToEdgeParameter(u, wa, wb);
        consider(
          lerp3(from, to, t),
          state.px[a] + (state.px[b] - state.px[a]) * u,
          state.py[a] + (state.py[b] - state.py[a]) * u,
          wa + (wb - wa) * u,
          "nearest",
          entity,
        );
      }

      if (on("perpendicular") && options.from) {
        // El pie de la perpendicular se calcula en el ESPACIO, no en la
        // pantalla: una perpendicular que sólo lo parece desde este ángulo no
        // es una perpendicular, y es justo el punto que un dibujante usa para
        // acotar. Después se proyecta para ver si cae dentro de la apertura.
        const t = clamp01(perpendicularParameter(options.from, from, to));
        const u = edgeParameterToScreenParameter(t, wa, wb);
        consider(
          lerp3(from, to, t),
          state.px[a] + (state.px[b] - state.px[a]) * u,
          state.py[a] + (state.py[b] - state.py[a]) * u,
          wa + (wb - wa) * u,
          "perpendicular",
          entity,
        );
      }
    }

    // --- Intersección aparente: cruce en PANTALLA de dos aristas -------------
    if (on("apparent-intersection")) {
      const limit = options.maxIntersectionEdges ?? 24;
      const pool = near.length > limit ? near.slice(0, limit) : near;
      for (let i = 0; i < pool.length; i += 1) {
        for (let j = i + 1; j < pool.length; j += 1) {
          const hit = this.apparentIntersection(state, pool[i], pool[j]);
          if (hit) consider(hit.point, hit.x, hit.y, hit.depth, "apparent-intersection", hit.entity);
        }
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((left, right) => {
      const pl = SNAP_PRIORITY.indexOf(left.type);
      const pr = SNAP_PRIORITY.indexOf(right.type);
      if (pl !== pr) return pl - pr;
      if (left.screenDistancePx !== right.screenDistancePx)
        return left.screenDistancePx - right.screenDistancePx;
      // Empate a distancia de pantalla: gana lo que está DELANTE. Es lo que
      // convierte «engancho a lo que veo» en una regla y no en una casualidad.
      return left.depth - right.depth;
    });
    return candidates[0];
  }

  private pointsNear(
    state: ProjectedState,
    cursorX: number,
    cursorY: number,
    aperture: number,
  ): number[] {
    const grid = this.ensureGrid(state);
    const found: number[] = [];
    for (const at of this.cellsInBox(state, cursorX, cursorY, aperture)) {
      const bucket = grid.pointCells.get(at);
      if (bucket) found.push(...bucket);
    }
    return found;
  }

  private edgesNear(
    state: ProjectedState,
    cursorX: number,
    cursorY: number,
    aperture: number,
  ): number[] {
    const grid = this.ensureGrid(state);
    const seen = new Set<number>();
    const found: number[] = [];
    for (const at of this.cellsInBox(state, cursorX, cursorY, aperture)) {
      const bucket = grid.cells.get(at);
      if (!bucket) continue;
      for (const edge of bucket)
        if (!seen.has(edge)) {
          seen.add(edge);
          found.push(edge);
        }
    }
    for (const edge of grid.oversized)
      if (!seen.has(edge)) {
        seen.add(edge);
        found.push(edge);
      }
    return found;
  }

  private *cellsInBox(
    state: ProjectedState,
    cursorX: number,
    cursorY: number,
    aperture: number,
  ): Generator<number> {
    const cell = state.cellPx;
    const minColumn = Math.floor((cursorX - aperture) / cell);
    const maxColumn = Math.floor((cursorX + aperture) / cell);
    const minRow = Math.floor((cursorY - aperture) / cell);
    const maxRow = Math.floor((cursorY + aperture) / cell);
    for (let column = minColumn; column <= maxColumn; column += 1)
      for (let row = minRow; row <= maxRow; row += 1) yield row * state.columns + column;
  }

  /**
   * Cruce en pantalla de dos aristas proyectadas.
   *
   * En el espacio esas dos aristas casi nunca se tocan, así que hay DOS puntos
   * candidatos —uno en cada arista— y hay que elegir. Se devuelve el que está
   * más cerca de la cámara, que es el que el usuario está viendo; el de detrás
   * lo tapa el propio sólido.
   */
  private apparentIntersection(
    state: ProjectedState,
    left: number,
    right: number,
  ): { point: CadSnapPoint3; x: number; y: number; depth: number; entity: number } | null {
    const a1 = this.edgeFrom[left];
    const b1 = this.edgeTo[left];
    const a2 = this.edgeFrom[right];
    const b2 = this.edgeTo[right];
    // Dos aristas que comparten un vértice se cruzan en ese vértice, y ése ya
    // es un `endpoint` con más prioridad: contarlo aquí sólo añade ruido.
    if (a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2) return null;
    const rx = state.px[b1] - state.px[a1];
    const ry = state.py[b1] - state.py[a1];
    const sx = state.px[b2] - state.px[a2];
    const sy = state.py[b2] - state.py[a2];
    const denominator = rx * sy - ry * sx;
    if (!(Math.abs(denominator) > 1e-9)) return null;
    const qpx = state.px[a2] - state.px[a1];
    const qpy = state.py[a2] - state.py[a1];
    const u1 = (qpx * sy - qpy * sx) / denominator;
    const u2 = (qpx * ry - qpy * rx) / denominator;
    if (u1 < 0 || u1 > 1 || u2 < 0 || u2 > 1) return null;
    const x = state.px[a1] + u1 * rx;
    const y = state.py[a1] + u1 * ry;
    const depth1 = state.pw[a1] + (state.pw[b1] - state.pw[a1]) * u1;
    const depth2 = state.pw[a2] + (state.pw[b2] - state.pw[a2]) * u2;
    const front = depth1 <= depth2;
    const edge = front ? left : right;
    const u = front ? u1 : u2;
    const a = front ? a1 : a2;
    const b = front ? b1 : b2;
    const t = screenParameterToEdgeParameter(u, state.pw[a], state.pw[b]);
    return {
      point: lerp3(this.points[a], this.points[b], t),
      x,
      y,
      depth: front ? depth1 : depth2,
      entity: this.edgeEntity[edge],
    };
  }
}

// ---------------------------------------------------------------------------
// Aritmética auxiliar
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function lerp3(from: CadSnapPoint3, to: CadSnapPoint3, t: number): CadSnapPoint3 {
  // t = 0 y t = 1 devuelven el punto EXACTO, sin pasar por la interpolación.
  // No es micro-optimización: es lo que garantiza que engancharse a un extremo
  // devuelva el vértice tal cual está en el sólido, bit a bit.
  if (t <= 0) return from;
  if (t >= 1) return to;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  };
}

function projectOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lengthSquared = vx * vx + vy * vy;
  if (!(lengthSquared > 1e-12)) return 0;
  return ((px - ax) * vx + (py - ay) * vy) / lengthSquared;
}

/** Parámetro del pie de la perpendicular desde `point` sobre la recta 3D `a→b`. */
function perpendicularParameter(point: CadSnapPoint3, a: CadSnapPoint3, b: CadSnapPoint3): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const vz = b.z - a.z;
  const lengthSquared = vx * vx + vy * vy + vz * vz;
  if (!(lengthSquared > 1e-12)) return 0;
  return ((point.x - a.x) * vx + (point.y - a.y) * vy + (point.z - a.z) * vz) / lengthSquared;
}
