/**
 * CALCAR DE VERDAD: la geometría del sustrato a la que el cursor se engancha.
 *
 * ## Qué le faltaba a `PDFATTACH`
 *
 * `pdf-underlay.ts` ya coloca la lámina: la escala, la gira, la recorta y la
 * desvanece. Pero una lámina colocada es una IMAGEN, y una imagen no imanta.
 * Calcar encima de un sustrato sin referencias a objeto es dibujar a pulso
 * mirando un fondo gris: la esquina que se ve en la pantalla no es la esquina
 * que queda en el documento, y el error de dos píxeles se descubre al acotar.
 *
 * Lo que aquí se construye es el paso que faltaba: sacar del CONTENIDO
 * VECTORIAL de la página los tramos y los puntos notables, y devolverlos **ya
 * en coordenadas del dibujo**, en la forma exacta que `snap-engine.ts` consume
 * (`Segment` y `Point`). Con eso, el mismo motor de OSNAP que engancha a una
 * polilínea del documento engancha a la lámina de fondo, sin saber que es un
 * PDF y sin una segunda ruta de enganche que mantener.
 *
 * ## No hay lector nuevo
 *
 * Ni una línea de lectura de PDF se escribe aquí. La cadena
 * `pdf-objects → pdf-pages → pdf-content → pdf-curves → pdf-import` ya está
 * probada contra el corpus real y contra el gate `check:pdf-corpus`, y es la
 * que se llama. Lo que se construye es lo otro: la **traducción de página a
 * mundo** —colocación, giro, factor de escala— y los **dos filtros** que
 * deciden qué se ofrece y qué no: el recorte de `PDFCLIP` y el estado del
 * sustrato.
 *
 * `importCadPdf` se invoca con `unitsPerPoint: 1` e inserción en el origen a
 * propósito: así devuelve la página en PUNTOS con la esquina inferior izquierda
 * del papel en (0,0) —el mismo sistema en el que vive `clipBoundary` y el que
 * `worldToPage` invierte— y la colocación la pone la lámina, una sola vez, al
 * final. Pedirle a `importCadPdf` que ya escale sería tener la escala en dos
 * sitios, y dos verdades sobre lo mismo acaban discrepando en cuanto alguien
 * use `PDFSCALE`.
 *
 * ## Las curvas entran EXACTAS y se tesela aquí
 *
 * `curveMode: "spline"` porque una Bézier cúbica ES una NURBS de grado 3: error
 * cero, por álgebra. La aproximación se hace después, con la tolerancia de este
 * módulo, y eso permite dos cosas que el modo polilínea no permitiría: saber
 * qué tramos son cuerdas de una curva —para NO ofrecerlos como punto medio ni
 * como pie de perpendicular, igual que hace `snap-scene.ts`— y calcular el
 * CENTRO del arco cuando la curva de verdad lo es.
 *
 * ## Las intersecciones no se precalculan
 *
 * `snap-engine.ts` cruza los tramos de la escena entre sí y saca la
 * intersección real y la aparente. Precalcularlas aquí sería hacer dos veces lo
 * mismo y, peor, sería hacerlo sin saber contra qué se va a cruzar: lo
 * interesante de calcar es la intersección entre un muro NUEVO y una línea de
 * la lámina, y eso sólo lo sabe el motor cuando tiene las dos. Lo que este
 * módulo entrega son los tramos con su `pathId` y su `ordinal`, que es
 * exactamente lo que el motor necesita para no inventarse una intersección en
 * cada vértice de la misma polilínea.
 *
 * ## Esto NO se llama en cada `pointermove`
 *
 * Leer el PDF entero cuesta milisegundos, no microsegundos. La geometría se
 * saca UNA vez por sustrato —al adjuntarlo, al cambiar de página, al recortar o
 * al reescalar— y se guarda. Para el movimiento del ratón está
 * `cadPdfSnapSceneAdd`, que sólo copia lo que cae cerca del cursor.
 *
 * Correr:  npx tsx src/lib/cad/pdf/pdf-snap-geometry.spec.ts
 */
import type { CadDocument, CadEntity, CadPoint2, CadPoint3 } from "../cad-document";
import type { Point, Segment, SnapScene } from "../snap-engine";
import { cadClipPath, cadPointInsideBoundary, type CadXclip } from "../xref/xclip";
import { cadPdfFlattenBezier } from "./pdf-curves";
import type { CadPdfPoint } from "./pdf-content";
import { CadPdfImportError, importCadPdf } from "./pdf-import";
import {
  cadFindPdfUnderlay,
  cadPdfClipAsXclip,
  cadPdfUnderlayPlacement,
  type CadPdfUnderlay,
} from "./pdf-underlay";

type CadImageEntity = Extract<CadEntity, { type: "image" }>;

/**
 * Desviación máxima al tesear una curva del sustrato, en PUNTOS de la página.
 *
 * Medio punto: la mitad del trazo más fino que se distingue en una lámina
 * impresa. Va en puntos y no en unidades de dibujo a propósito —es una
 * propiedad del PAPEL, no del plano— así que un sustrato escalado a 1:50 y otro
 * a tamaño real se teselan igual de fino donde el ojo los mira, que es sobre la
 * lámina.
 */
export const CAD_PDF_SNAP_CURVE_TOLERANCE_PT = 0.5;

/**
 * Cuánto puede desviarse una curva de un círculo y seguir dando centro.
 *
 * Dos por ciento del radio. Una Bézier de cuarto de círculo —lo que emite todo
 * exportador al escribir un arco— se desvía 0,026 % donde esto la mide (t = ¼
 * y ¾), así que pasa de sobra; la
 * curva libre de un dibujo a mano alzada no. El número existe para que una
 * curva cualquiera NO regale un centro inventado: un centro falso en un plano
 * es peor que ningún centro, porque el cursor se pega a él con la misma
 * confianza que a uno real.
 */
export const CAD_PDF_SNAP_ARC_TOLERANCE = 0.02;

/** Por qué el sustrato ofrece lo que ofrece —o por qué no ofrece nada. */
export type CadPdfSnapStatus =
  | "ok"
  | "no_underlay"
  | "unloaded"
  | "raster"
  | "no_geometry"
  | "unreadable"
  | "clipped_out";

export interface CadPdfSnapGeometryOptions {
  /** Desviación al tesear curvas, en puntos de página. */
  curveTolerancePt?: number;
  /** Desviación relativa admitida para dar por circular una curva. */
  arcTolerance?: number;
  /** `false` deja fuera los orígenes de los rótulos. Por defecto entran. */
  includeText?: boolean;
}

export interface CadPdfSnapGeometryResult {
  status: CadPdfSnapStatus;
  /** En español y en una frase: qué hay, o por qué no hay nada. */
  note: string;
  /** Tramos del sustrato, en coordenadas del dibujo. Alimentan el motor. */
  segments: Segment[];
  /** Tramos RECTOS de verdad: los únicos aptos para pie de perpendicular. */
  perpendicularSegments: Segment[];
  endpoints: Point[];
  midpoints: Point[];
  centers: Point[];
  /** Origen de cada rótulo de la lámina. */
  insertions: Point[];
  /** Cuántos puntos notables se quedaron fuera por el recorte o por el papel. */
  clippedAway: number;
  /** La colocación con la que se tradujo todo. Sirve para explicarlo. */
  placement: { unitsPerPoint: number; rotation: number; insertion: Point };
}

const empty = (
  status: CadPdfSnapStatus,
  note: string,
  placement: CadPdfSnapGeometryResult["placement"] = {
    unitsPerPoint: 1,
    rotation: 0,
    insertion: { x: 0, y: 0 },
  },
): CadPdfSnapGeometryResult => ({
  status,
  note,
  segments: [],
  perpendicularSegments: [],
  endpoints: [],
  midpoints: [],
  centers: [],
  insertions: [],
  clippedAway: 0,
  placement,
});

/** Cuántos candidatos ofrece el sustrato en total. Cero es una respuesta. */
export const cadPdfSnapCandidateCount = (result: CadPdfSnapGeometryResult): number =>
  result.endpoints.length +
  result.midpoints.length +
  result.centers.length +
  result.insertions.length +
  result.segments.length;

/**
 * De coordenadas de la LÁMINA (puntos, esquina inferior izquierda en el origen)
 * a coordenadas del DIBUJO.
 *
 * Es la inversa exacta de `worldToPage` de `pdf-underlay.ts`, y es el único
 * sitio donde este módulo aplica la colocación. Se saca de los VECTORES de la
 * entidad y no de la ficha porque los vectores son lo que el render usa: si
 * alguien mueve la lámina con `PDFSCALE` o la gira, los vectores cambian y esto
 * la sigue; la ficha guarda el mismo número por comodidad del gestor, y una
 * copia que se consulta es una copia que algún día miente.
 */
export function cadPdfPageToWorld(entity: CadImageEntity): (page: CadPoint2) => Point {
  const { unitsPerPoint, rotation } = cadPdfUnderlayPlacement(entity);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const { x: originX, y: originY } = entity.insertion;
  return (page) => {
    const x = page.x * unitsPerPoint;
    const y = page.y * unitsPerPoint;
    return { x: originX + x * cos - y * sin, y: originY + x * sin + y * cos };
  };
}

/**
 * El CENTRO de una Bézier cúbica que de verdad es un arco de círculo.
 *
 * Devuelve `null` cuando no lo es, y ése es el punto: un exportador escribe los
 * círculos y los arcos como Béziers —el PDF no tiene operador de arco— así que
 * el centro está ahí y se puede recuperar; una curva libre no tiene centro y
 * fabricarle uno pondría un imán donde el dibujo no tiene nada.
 *
 * El método es el circuncentro de tres puntos de la curva (t = 0, ½ y 1), y
 * después se COMPRUEBA en otros dos (t = ¼ y ¾). Sin la comprobación,
 * cualquier curva daría centro, porque por tres puntos no alineados siempre
 * pasa una circunferencia.
 */
export function cadPdfArcCenterOf(
  p0: CadPdfPoint,
  p1: CadPdfPoint,
  p2: CadPdfPoint,
  p3: CadPdfPoint,
  tolerance = CAD_PDF_SNAP_ARC_TOLERANCE,
): { center: CadPdfPoint; radius: number } | null {
  const at = (t: number): CadPdfPoint => {
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    };
  };
  const a = at(0);
  const m = at(0.5);
  const b = at(1);
  const determinant = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
  // Tres puntos alineados: no hay circunferencia que pase por ellos, y el
  // determinante tendiendo a cero mandaría el centro al infinito.
  if (Math.abs(determinant) < 1e-12) return null;
  const sa = a.x * a.x + a.y * a.y;
  const sm = m.x * m.x + m.y * m.y;
  const sb = b.x * b.x + b.y * b.y;
  const center: CadPdfPoint = {
    x: (sa * (m.y - b.y) + sm * (b.y - a.y) + sb * (a.y - m.y)) / determinant,
    y: (sa * (b.x - m.x) + sm * (a.x - b.x) + sb * (m.x - a.x)) / determinant,
  };
  const radius = Math.hypot(a.x - center.x, a.y - center.y);
  if (!(radius > 1e-9)) return null;
  for (const t of [0.25, 0.75]) {
    const point = at(t);
    const measured = Math.hypot(point.x - center.x, point.y - center.y);
    if (Math.abs(measured - radius) > tolerance * radius) return null;
  }
  return { center, radius };
}

/** Un trozo de camino de la página, ya resuelto en puntos. */
interface PageRun {
  points: CadPdfPoint[];
  closed: boolean;
  /**
   * `true` si los puntos son CUERDAS de una curva y no vértices del dibujo.
   *
   * La distinción es la misma que hace `snap-scene.ts` y por la misma razón: el
   * punto medio de la cuerda con que se tesela un arco no existe en el papel, y
   * ofrecerlo llenaría la pantalla de imanes que no corresponden a nada.
   */
  curved: boolean;
  pathId: string;
}

const asPoint3 = (points: readonly CadPdfPoint[]): CadPoint3[] =>
  points.map((point) => ({ x: point.x, y: point.y, z: 0 }));

/** Rejilla de deduplicado, en puntos de página. Muy por debajo de lo visible. */
const GRID = 1e-4;
const keyOf = (point: CadPdfPoint) =>
  `${Math.round(point.x / GRID)}|${Math.round(point.y / GRID)}`;

/**
 * La geometría enganchable de un sustrato ya adjuntado.
 *
 * `bytes` los pone el anfitrión: la ficha guarda la RUTA del archivo, no su
 * contenido, y resolver una ruta no es cosa de un módulo puro. Cuando la ruta
 * es un `data:` —el caso de `PDFATTACH` desde el navegador—
 * `cadPdfBytesFromDataUri` de `pdf-attach-payload.ts` es lo que la convierte,
 * que es lo mismo que ya hace `PDFPAGE` para cambiar de página.
 */
export function cadPdfSnapGeometryOf(
  entity: CadImageEntity,
  underlay: CadPdfUnderlay,
  bytes: Uint8Array,
  options: CadPdfSnapGeometryOptions = {},
): CadPdfSnapGeometryResult {
  const { unitsPerPoint, rotation } = cadPdfUnderlayPlacement(entity);
  const placement = {
    unitsPerPoint,
    rotation,
    insertion: { x: entity.insertion.x, y: entity.insertion.y },
  };

  // FILTRO POR ESTADO. Un sustrato descargado no se ve, y lo que no se ve no
  // imanta: enganchar a una lámina invisible mueve el cursor a un sitio que el
  // usuario no puede señalar ni comprobar. Se mira el estado de la ficha Y el
  // `showImage` de la entidad porque `PDFUNLOAD` escribe los dos, y bastaría
  // que uno se quedara atrás para que la lámina siguiera imantando apagada.
  if (underlay.status !== "loaded" || entity.showImage === false)
    return empty(
      "unloaded",
      `El sustrato «${underlay.fileName}» está descargado: no se dibuja y no engancha. Recárgalo con PDFRELOAD.`,
      placement,
    );

  let imported;
  try {
    imported = importCadPdf(bytes, {
      page: underlay.page,
      // La página en PUNTOS y con el origen en la esquina del papel. La
      // colocación se aplica UNA vez, abajo, y en un solo sitio.
      unitsPerPoint: 1,
      insertion: { x: 0, y: 0, z: 0 },
      curveMode: "spline",
      // Lo que el remitente apagó en su CAD no está en la lámina, así que
      // tampoco puede imantar: engancharía a una línea que nadie ve.
      includeHiddenLayers: false,
    });
  } catch (error) {
    if (!(error instanceof CadPdfImportError)) throw error;
    if (error.code === "scanned_image")
      return empty(
        "raster",
        `«${underlay.fileName}» es un escaneo: no tiene vectores a los que engancharse. Sigue sirviendo para calcar encima a pulso.`,
        placement,
      );
    if (error.code === "no_geometry")
      return empty(
        "no_geometry",
        `La página ${underlay.page} de «${underlay.fileName}» no dejó geometría enganchable.`,
        placement,
      );
    return empty("unreadable", error.message, placement);
  }

  const curveTolerance = options.curveTolerancePt ?? CAD_PDF_SNAP_CURVE_TOLERANCE_PT;
  const arcTolerance = options.arcTolerance ?? CAD_PDF_SNAP_ARC_TOLERANCE;
  const includeText = options.includeText !== false;

  const runs: PageRun[] = [];
  /** Vértices del DIBUJO: los cabos reales, no los de la teselación. */
  const rawEndpoints: CadPdfPoint[] = [];
  const rawCenters: CadPdfPoint[] = [];
  const rawInsertions: CadPdfPoint[] = [];
  let sequence = 0;

  for (const item of imported.entities) {
    const pathId = `${entity.id}:${(sequence += 1)}`;
    if (item.type === "line") {
      runs.push({
        points: [
          { x: item.start.x, y: item.start.y },
          { x: item.end.x, y: item.end.y },
        ],
        closed: false,
        curved: false,
        pathId,
      });
      rawEndpoints.push({ x: item.start.x, y: item.start.y }, { x: item.end.x, y: item.end.y });
      continue;
    }
    if (item.type === "polyline") {
      const points = item.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y }));
      if (points.length < 2) continue;
      runs.push({ points, closed: item.closed === true, curved: false, pathId });
      rawEndpoints.push(...points);
      continue;
    }
    if (item.type === "spline") {
      // `importCadPdf` en modo `spline` emite exactamente una Bézier cúbica por
      // entidad: cuatro puntos de control y nudos `[0 0 0 0 1 1 1 1]`. Cualquier
      // otra cosa no salió de aquí y no se toca.
      const control = item.controlPoints;
      if (control.length !== 4) continue;
      const [p0, p1, p2, p3] = control.map((point) => ({ x: point.x, y: point.y }));
      const flattened = cadPdfFlattenBezier(p0, p1, p2, p3, curveTolerance);
      runs.push({ points: [p0, ...flattened], closed: false, curved: true, pathId });
      // Sólo los CABOS de la curva son extremos. Los puntos intermedios son
      // teselación: cambian con la tolerancia, y un imán que se mueve al
      // cambiar un ajuste no es un extremo de nada.
      rawEndpoints.push(p0, p3);
      const arc = cadPdfArcCenterOf(p0, p1, p2, p3, arcTolerance);
      if (arc) rawCenters.push(arc.center);
      continue;
    }
    if (item.type === "mtext" && includeText)
      rawInsertions.push({ x: item.insertion.x, y: item.insertion.y });
  }

  // --- los dos recortes ----------------------------------------------------
  // El PAPEL es el primero y siempre está: lo que el PDF dibuja fuera del
  // `MediaBox` no aparece en la lámina, así que tampoco puede imantar.
  const sheet: CadXclip = {
    boundary: [
      { x: 0, y: 0 },
      { x: entity.size.width, y: 0 },
      { x: entity.size.width, y: entity.size.height },
      { x: 0, y: entity.size.height },
    ],
    enabled: true,
  };
  const clips: CadXclip[] = [sheet];
  const userClip = cadPdfClipAsXclip(entity);
  if (userClip) clips.push(userClip);

  const insideAll = (point: CadPdfPoint) =>
    clips.every((clip) => cadPointInsideBoundary(point, clip.boundary));
  // El atajo del recorte se decide UNA vez por sustrato, no una por camino.
  const fastPath = clips.every((clip) => isConvex(clip.boundary));

  const toWorld = cadPdfPageToWorld(entity);
  const segments: Segment[] = [];
  const perpendicularSegments: Segment[] = [];
  const midpointKeys = new Set<string>();
  const rawMidpoints: CadPdfPoint[] = [];

  for (const run of runs) {
    for (const piece of clipRun(run, clips, fastPath)) {
      const count =
        Math.max(0, piece.points.length - 1) +
        (piece.closed && piece.points.length > 2 ? 1 : 0);
      if (count === 0) continue;
      const push = (a: CadPdfPoint, b: CadPdfPoint, ordinal: number) => {
        const segment: Segment = {
          a: toWorld(a),
          b: toWorld(b),
          pathId: piece.pathId,
          ordinal,
          pathLength: count,
          closed: piece.closed,
        };
        segments.push(segment);
        // Sólo un tramo RECTO del dibujo es una arista: da pie de
        // perpendicular y da punto medio. Las cuerdas de la curva, no.
        if (piece.curved) return;
        perpendicularSegments.push(segment);
        const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const key = keyOf(middle);
        if (midpointKeys.has(key)) return;
        midpointKeys.add(key);
        rawMidpoints.push(middle);
      };
      for (let index = 1; index < piece.points.length; index += 1)
        push(piece.points[index - 1], piece.points[index], index - 1);
      if (piece.closed && piece.points.length > 2)
        push(piece.points.at(-1)!, piece.points[0], count - 1);
    }
  }

  let clippedAway = 0;
  const collect = (raw: readonly CadPdfPoint[]): Point[] => {
    const seen = new Set<string>();
    const out: Point[] = [];
    for (const point of raw) {
      const key = keyOf(point);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!insideAll(point)) {
        clippedAway += 1;
        continue;
      }
      out.push(toWorld(point));
    }
    return out;
  };

  const endpoints = collect(rawEndpoints);
  const midpoints = collect(rawMidpoints);
  const centers = collect(rawCenters);
  const insertions = collect(rawInsertions);

  const total =
    endpoints.length + midpoints.length + centers.length + insertions.length + segments.length;
  if (total === 0)
    return {
      ...empty(
        "clipped_out",
        userClip
          ? `El recorte de «${underlay.fileName}» no deja dentro nada a lo que engancharse.`
          : `«${underlay.fileName}» dibuja fuera del papel: no queda nada visible a lo que engancharse.`,
        placement,
      ),
      clippedAway,
    };

  return {
    status: "ok",
    note:
      `«${underlay.fileName}» p.${underlay.page}: ${segments.length} tramo(s), ` +
      `${endpoints.length} extremo(s), ${midpoints.length} punto(s) medio(s), ` +
      `${centers.length} centro(s)` +
      (clippedAway ? `; ${clippedAway} punto(s) fuera del recorte` : ""),
    segments,
    perpendicularSegments,
    endpoints,
    midpoints,
    centers,
    insertions,
    clippedAway,
    placement,
  };
}

/**
 * ¿Es CONVEXO este contorno?
 *
 * Hace falta para saber cuándo se puede tomar el atajo de «todos los vértices
 * dentro, luego el camino entero está dentro». En un contorno convexo eso es un
 * teorema; en uno cóncavo es falso, porque el tramo entre dos vértices de dentro
 * puede salirse por la escotadura y volver. El rectángulo del papel y el que
 * dibuja `PDFCLIP` lo son, así que el atajo se toma casi siempre; el contorno a
 * mano de alguien que llame a `cadPdfClipCommands` con un polígono cualquiera,
 * no, y ahí se recorta de verdad.
 */
function isConvex(boundary: readonly CadPoint2[]): boolean {
  if (boundary.length < 3) return false;
  let sign = 0;
  for (let index = 0; index < boundary.length; index += 1) {
    const a = boundary[index];
    const b = boundary[(index + 1) % boundary.length];
    const c = boundary[(index + 2) % boundary.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-12) continue;
    const current = cross > 0 ? 1 : -1;
    if (sign === 0) sign = current;
    else if (sign !== current) return false;
  }
  return sign !== 0;
}

/**
 * Recorta un camino contra el papel y contra el recorte del usuario.
 *
 * El caso normal —todo dentro y con contornos convexos— no toca nada: se
 * comprueban los vértices y se devuelve el camino tal cual, con su `closed`
 * intacto. Recortar siempre costaría un cruce por tramo en cada sustrato sin
 * recortar, que es la inmensa mayoría.
 *
 * Cuando sí hay que recortar, los trozos salen ABIERTOS: un rectángulo cortado
 * por la mitad ya no es un rectángulo, y decirle al motor que sigue cerrado le
 * haría creer que el primer tramo y el último son vecinos.
 */
function clipRun(run: PageRun, clips: readonly CadXclip[], fastPath: boolean): PageRun[] {
  const inside = (point: CadPdfPoint) =>
    clips.every((clip) => cadPointInsideBoundary(point, clip.boundary));
  if (fastPath && run.points.every(inside)) return [run];

  const opened =
    run.closed && run.points.length > 2 ? [...run.points, run.points[0]] : run.points;
  let pieces: CadPoint3[][] = [asPoint3(opened)];
  for (const clip of clips) {
    const next: CadPoint3[][] = [];
    for (const piece of pieces) next.push(...cadClipPath(piece, clip));
    pieces = next;
  }
  return pieces
    .filter((piece) => piece.length >= 2)
    .map((piece, index) => ({
      points: piece.map((point) => ({ x: point.x, y: point.y })),
      closed: false,
      curved: run.curved,
      pathId: `${run.pathId}:clip:${index}`,
    }));
}

/**
 * La geometría enganchable del sustrato que se llama así, en un documento.
 *
 * `key` es lo mismo que aceptan las órdenes de `PDFCLIP` y compañía: el id de la
 * entidad, el id corto del sustrato o el nombre del archivo. Un sustrato que no
 * está no es un error: es cero candidatos con su motivo, porque preguntar por
 * un sustrato que se acaba de desadjuntar es lo más normal del mundo.
 */
export function cadPdfSnapGeometry(
  document: Pick<CadDocument, "entities">,
  key: string,
  bytes: Uint8Array,
  options: CadPdfSnapGeometryOptions = {},
): CadPdfSnapGeometryResult {
  const found = cadFindPdfUnderlay(document, key);
  if (!found)
    return empty("no_underlay", `No hay ningún PDF adjuntado con el nombre o el id «${key}».`);
  return cadPdfSnapGeometryOf(found.entity, found.underlay, bytes, options);
}

export interface CadPdfSnapSceneOptions {
  /** Cursor. Con él, sólo entra en la escena lo que cae dentro de `radius`. */
  cursor?: Point | null;
  /** Radio de la ventana, en unidades de dibujo. */
  radius?: number;
}

/**
 * Vuelca la geometría del sustrato en la escena que consume `snap-engine.ts`.
 *
 * Muta la escena en vez de devolver otra, igual que `cadSnapSceneAddEntities` y
 * por lo mismo: esto corre dentro del movimiento del ratón y fabricar una
 * escena nueva por sustrato sería basura que el recolector acaba cobrando en
 * mitad de un arrastre.
 *
 * La ventana por cursor no es un adorno. El motor cruza los tramos entre sí
 * buscando intersecciones —O(n²)— y una lámina de arquitectura tiene miles: sin
 * ventana, arrastrar el ratón sobre un sustrato grande convertiría cada
 * `pointermove` en millones de pruebas.
 */
export function cadPdfSnapSceneAdd(
  scene: SnapScene,
  geometry: CadPdfSnapGeometryResult,
  options: CadPdfSnapSceneOptions = {},
): void {
  scene.segments ??= [];
  scene.perpendicularSegments ??= [];
  scene.endpoints ??= [];
  scene.midpoints ??= [];
  scene.centers ??= [];
  scene.insertions ??= [];

  const { cursor, radius } = options;
  const near =
    cursor && Number.isFinite(radius) && (radius as number) > 0
      ? (point: Point) => Math.hypot(point.x - cursor.x, point.y - cursor.y) <= (radius as number)
      : null;
  // Un tramo entra si CUALQUIERA de sus dos cabos está cerca. Exigir los dos
  // dejaría fuera justamente la línea larga que cruza por delante del cursor,
  // que es la que más se engancha al calcar.
  const nearSegment = near ? (segment: Segment) => near(segment.a) || near(segment.b) : null;

  scene.segments.push(...(nearSegment ? geometry.segments.filter(nearSegment) : geometry.segments));
  scene.perpendicularSegments.push(
    ...(nearSegment
      ? geometry.perpendicularSegments.filter(nearSegment)
      : geometry.perpendicularSegments),
  );
  scene.endpoints.push(...(near ? geometry.endpoints.filter(near) : geometry.endpoints));
  scene.midpoints.push(...(near ? geometry.midpoints.filter(near) : geometry.midpoints));
  scene.centers.push(...(near ? geometry.centers.filter(near) : geometry.centers));
  scene.insertions.push(...(near ? geometry.insertions.filter(near) : geometry.insertions));
}
