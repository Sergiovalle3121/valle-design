/**
 * Chaflán y redondeo 3D sobre aristas.
 *
 * CÓMO ESTÁ HECHO. En el plano perpendicular a la arista, el material que sobra
 * es un polígono CONVEXO: el rincón, los dos puntos donde el redondeo es
 * tangente a las caras, y la cadena de vértices donde se cortan las rectas
 * tangentes al cilindro que rueda por el rincón. Ese polígono se extruye a lo
 * largo de la arista y se resta. Un redondeo = UNA booleana.
 *
 * POR QUÉ NO SE HACE CON CORTES POR PLANO, que es lo primero que uno escribe. Un
 * chaflán es, geométricamente, cortar por un plano tangente a las dos caras; con
 * N planos sale el redondeo facetado. Funciona… hasta la cuarta faceta. El
 * problema es que cada booleana triangula el sólido entero, así que la siguiente
 * parte triángulos ya partidos: 14, 27, 52, 86, 144 caras para 1, 2, 3, 4 y 5
 * facetas, y a partir de ahí aparecen astillas de área 1e-8 que el validador
 * —con razón— rechaza. El corte plano tiene además un defecto de fondo: un plano
 * es GLOBAL y no sabe de aristas, de modo que en un sólido cóncavo se lleva
 * material del otro extremo de la pieza. El prisma local no tiene ninguno de los
 * dos problemas.
 *
 * EL REDONDEO ES CIRCUNSCRITO. Las rectas son TANGENTES al cilindro, así que el
 * sólido resultante contiene al redondeo exacto y lo toca en `segments` líneas.
 * Con `segments` grande converge por arriba: el volumen del resultado es siempre
 * algo MAYOR que el del redondeo verdadero, nunca menor.
 *
 * LO QUE NO HAY, dicho aquí y no descubierto midiendo: radio variable,
 * transición esférica donde se encuentran tres redondeos en un vértice, y
 * aristas cóncavas (que exigen AÑADIR material, no quitarlo, y se rechazan por
 * el ángulo diedro).
 */
import { booleanDifference } from "./boolean";
import { extrudeProfile } from "./extrude";
import { polygonSignedArea, type Vec2 } from "./profile";
import { makeFrame } from "./surfaces";
import {
  NO_INDEX,
  bodyBounds,
  edgeDihedralAngle,
  faceGeometricNormal,
  halfEdgeSegment,
  planarBodyVolume,
  type BrepBody,
} from "./topology";
import {
  aabbDiagonal,
  v3Add,
  v3AddScaled,
  v3Cross,
  v3Distance,
  v3Dot,
  v3Normalize,
  v3Scale,
  v3Sub,
  type Vec3,
} from "./vec3";

export interface EdgeGeometry {
  from: Vec3;
  to: Vec3;
  /** Dirección unitaria de la arista. */
  direction: Vec3;
  normalA: Vec3;
  normalB: Vec3;
  /** Diedro INTERIOR: < π convexa, > π cóncava. */
  dihedralRad: number;
}

/** Extrae la geometría de una arista: segmento, normales de sus dos caras y diedro. */
export function edgeGeometry(body: BrepBody, edge: number): EdgeGeometry {
  const record = body.edges[edge];
  if (!record || record.a === NO_INDEX || record.b === NO_INDEX) {
    throw new Error(`La arista ${edge} es de borde o no existe: no tiene dos caras entre las que poner un chaflán.`);
  }
  const segment = halfEdgeSegment(body, record.a);
  return {
    from: segment.from,
    to: segment.to,
    direction: v3Normalize(v3Sub(segment.to, segment.from)),
    normalA: faceGeometricNormal(body, body.loops[body.halfEdges[record.a].loop].face),
    normalB: faceGeometricNormal(body, body.loops[body.halfEdges[record.b].loop].face),
    dihedralRad: edgeDihedralAngle(body, edge) ?? Math.PI,
  };
}

/** Base 2D del plano perpendicular a la arista, con el rincón en el origen. */
function crossSectionBasis(geometry: EdgeGeometry): { e1: Vec3; e2: Vec3 } {
  const e1 = v3Normalize(v3Sub(geometry.normalA, v3Scale(geometry.direction, v3Dot(geometry.normalA, geometry.direction))));
  return { e1, e2: v3Cross(geometry.direction, e1) };
}

/**
 * Sección transversal del material que retira el chaflán, en el plano
 * perpendicular a la arista y con el rincón en el origen.
 *
 * Se expone porque es el ORÁCULO del volumen: el material retirado tiene que ser
 * exactamente el área de este polígono por la longitud de la arista, y esa
 * comprobación no pasa por la booleana. Si el número no cuadra, el prisma no
 * estaba donde debía.
 */
export function chamferCrossSection(geometry: EdgeGeometry, radius: number, segments: number): Vec2[] {
  if (radius <= 0) throw new Error(`El radio de un chaflán tiene que ser positivo, llegó ${radius}.`);
  const { normalA, normalB, dihedralRad } = geometry;
  if (dihedralRad >= Math.PI - 1e-9) {
    throw new Error(`La arista es plana (diedro ${((dihedralRad * 180) / Math.PI).toFixed(2)}°): no hay rincón que achaflanar.`);
  }
  if (dihedralRad <= 1e-9) throw new Error("La arista tiene diedro nulo: las dos caras coinciden.");
  const count = Math.max(1, Math.floor(segments));
  const { e1, e2 } = crossSectionBasis(geometry);
  const to2 = (vector: Vec3): Vec2 => ({ x: v3Dot(vector, e1), y: v3Dot(vector, e2) });
  const nA = to2(normalA);
  const nB = to2(normalB);
  const cos = nA.x * nB.x + nA.y * nB.y;
  if (cos <= -1 + 1e-12) throw new Error("Las dos caras de la arista son opuestas: no hay bisectriz.");
  // Centro del cilindro inscrito: el punto a distancia `radius` de las dos caras.
  const centre: Vec2 = {
    x: (-radius * (nA.x + nB.x)) / (1 + cos),
    y: (-radius * (nA.y + nB.y)) / (1 + cos),
  };

  const lines: Array<{ n: Vec2; h: number }> = [];
  lines.push({ n: nA, h: 0 }); // La propia cara A pasa por el rincón.
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const m = slerp2(nA, nB, t);
    lines.push({ n: m, h: m.x * centre.x + m.y * centre.y + radius });
  }
  lines.push({ n: nB, h: 0 });

  const polygon: Vec2[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < lines.length - 1; i += 1) {
    const point = intersectLines(lines[i], lines[i + 1]);
    if (!point) throw new Error("Dos rectas tangentes consecutivas son paralelas: revisa el número de facetas.");
    polygon.push(point);
  }
  return polygonSignedArea(polygon) < 0 ? polygon.reverse() : polygon;
}

function slerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  const cos = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
  const angle = Math.acos(cos);
  if (angle < 1e-12) return { ...a };
  const sin = Math.sin(angle);
  const wa = Math.sin((1 - t) * angle) / sin;
  const wb = Math.sin(t * angle) / sin;
  const x = a.x * wa + b.x * wb;
  const y = a.y * wa + b.y * wb;
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}

function intersectLines(p: { n: Vec2; h: number }, q: { n: Vec2; h: number }): Vec2 | null {
  const det = p.n.x * q.n.y - p.n.y * q.n.x;
  if (Math.abs(det) < 1e-12) return null;
  return { x: (p.h * q.n.y - q.h * p.n.y) / det, y: (p.n.x * q.h - q.n.x * p.h) / det };
}

/** Volumen exacto que retira el chaflán: área de la sección por la longitud de la arista. */
export function chamferRemovedVolume(geometry: EdgeGeometry, radius: number, segments: number): number {
  const area = Math.abs(polygonSignedArea(chamferCrossSection(geometry, radius, segments)));
  return area * v3Distance(geometry.from, geometry.to);
}

export interface ChamferOptions {
  /** Facetas del redondeo. 1 = chaflán plano. */
  segments?: number;
  /**
   * Cuánto sobresale el prisma cortante por cada extremo de la arista, en
   * múltiplos de la diagonal del cuerpo. Tiene que bastar para salir del sólido;
   * pasarse no rompe nada en un convexo, pero en uno cóncavo puede alcanzar
   * geometría lejana, y de eso avisa `removalTolerance`.
   */
  overshoot?: number;
  /**
   * Desvío relativo admitido entre el material retirado y el que predice la
   * sección del chaflán. Por defecto 1e−6: suficiente para el ruido de coma
   * flotante de una booleana y estrecho para atrapar un corte que se fue.
   */
  removalTolerance?: number;
}

/**
 * Herramienta de corte de una arista: el prisma del material sobrante.
 *
 * Se expone porque poder pedirlo por separado es lo que permite depurar un
 * chaflán que sale raro sin tener que adivinar dentro de la booleana.
 */
export function chamferCutter(body: BrepBody, geometry: EdgeGeometry, radius: number, options: ChamferOptions = {}): BrepBody {
  const profile = chamferCrossSection(geometry, radius, options.segments ?? 1);
  const overshoot = Math.max(aabbDiagonal(bodyBounds(body)), 1) * (options.overshoot ?? 0.05);
  const { e1 } = crossSectionBasis(geometry);
  const start = v3AddScaled(geometry.from, geometry.direction, -overshoot);
  const height = v3Distance(geometry.from, geometry.to) + 2 * overshoot;
  return extrudeProfile({ profile: { outer: profile }, height, frame: makeFrame(start, geometry.direction, e1) });
}

/**
 * Chaflán (`segments = 1`) o redondeo facetado sobre un conjunto de aristas.
 *
 * La geometría de TODAS las aristas se captura sobre el cuerpo original antes de
 * cortar nada. Recalcularla sobre el cuerpo ya cortado sería lo natural —los
 * índices de arista cambian con cada corte— pero haría que el resultado
 * dependiera del orden en que se listaron las aristas, y dos aristas simétricas
 * darían chaflanes distintos.
 */
export function chamferEdges(body: BrepBody, edges: readonly number[], radius: number, options: ChamferOptions = {}): BrepBody {
  if (edges.length === 0) throw new Error("No se indicó ninguna arista que achaflanar.");
  const relativeTolerance = options.removalTolerance ?? 1e-6;
  const geometries = edges.map((edge) => {
    if (!Number.isInteger(edge) || edge < 0 || edge >= body.edges.length) {
      throw new Error(`Índice de arista fuera de rango: ${edge} (el cuerpo tiene ${body.edges.length}).`);
    }
    const geometry = edgeGeometry(body, edge);
    if (geometry.dihedralRad > Math.PI + 1e-9) {
      throw new Error(
        `La arista ${edge} es CÓNCAVA (diedro ${((geometry.dihedralRad * 180) / Math.PI).toFixed(1)}°). Redondear un rincón entrante exige AÑADIR material, y esta implementación sólo resta.`,
      );
    }
    return geometry;
  });

  // RECHAZO EXPLÍCITO: dos aristas que comparten vértice.
  //
  // Sus prismas cortantes se solapan cerca del vértice común y la resta
  // encadenada produce astillas de área ~1e-8 que rompen los invariantes. Mezclar
  // dos redondeos en un vértice exige una transición esférica —el "corner blend"
  // de los kernels comerciales— que aquí NO está implementada. Vale más decirlo
  // en la llamada que reventar dentro del BSP con un mensaje sobre la arista 106.
  for (let i = 0; i < geometries.length; i += 1) {
    for (let j = i + 1; j < geometries.length; j += 1) {
      if (!edgesShareVertex(geometries[i], geometries[j])) continue;
      throw new Error(
        `Las aristas ${edges[i]} y ${edges[j]} comparten un vértice. Fundir dos redondeos en una esquina exige una transición esférica que este kernel no implementa: sus prismas cortantes se solapan y el resultado sale con astillas degeneradas. Achaflana aristas que no se toquen, o hazlo en pasos separados asumiendo la esquina viva.`,
      );
    }
  }

  let current = body;
  for (let i = 0; i < geometries.length; i += 1) {
    const geometry = geometries[i];
    const cutter = chamferCutter(current, geometry, radius, options);
    const next = booleanDifference(current, cutter);
    assertRemovalMatches(current, next, geometry, radius, options.segments ?? 1, edges[i], relativeTolerance);
    current = next;
  }
  return current;
}

/** Redondeo: el mismo corte con varias facetas tangentes al cilindro. */
export function filletEdges(body: BrepBody, edges: readonly number[], radius: number, segments = 8): BrepBody {
  return chamferEdges(body, edges, radius, { segments });
}

/**
 * Comprueba que el corte se ha llevado EXACTAMENTE el material previsto.
 *
 * La primera versión de esta red medía a qué distancia de la arista aparecían
 * vértices nuevos, y era una mala medida: el BSP parte los polígonos del sólido
 * por los planos del cortante EN TODA su extensión, así que aparecen vértices
 * nuevos lejísimos de la arista sin que se haya retirado ni un gramo de material
 * ahí. El prisma en L la hacía saltar con un chaflán perfectamente correcto.
 *
 * Lo que sí mide el problema real es el VOLUMEN: un chaflán limpio retira
 * exactamente el área de su sección por la longitud de la arista. Si el prisma
 * cortante alcanza geometría que no debía, o si se sale del sólido porque las
 * caras adyacentes son más cortas que el chaflán, el número deja de cuadrar — y
 * el mensaje dice cuánto se esperaba y cuánto se fue.
 */
function assertRemovalMatches(
  before: BrepBody,
  after: BrepBody,
  geometry: EdgeGeometry,
  radius: number,
  segments: number,
  edge: number,
  relativeTolerance: number,
): void {
  const expected = chamferRemovedVolume(geometry, radius, segments);
  const removed = planarBodyVolume(before) - planarBodyVolume(after);
  if (Math.abs(removed - expected) <= relativeTolerance * Math.max(expected, 1e-12)) return;
  throw new Error(
    `El chaflán de la arista ${edge} retiró ${removed.toPrecision(8)} de material y su sección predice ${expected.toPrecision(8)}. O el prisma cortante alcanzó geometría que no era suya —es local en la sección pero se extiende a lo largo de la arista—, o las caras adyacentes son más cortas que el propio chaflán. Baja el radio o revisa la arista.`,
  );
}

/** ¿Comparten las dos aristas alguno de sus extremos? */
function edgesShareVertex(a: EdgeGeometry, b: EdgeGeometry, tolerance = 1e-9): boolean {
  for (const pointA of [a.from, a.to]) {
    for (const pointB of [b.from, b.to]) {
      if (v3Distance(pointA, pointB) <= tolerance) return true;
    }
  }
  return false;
}

/** Punto del eje del cilindro de redondeo, para inspección y pruebas. */
export function filletAxisPoint(geometry: EdgeGeometry, radius: number): Vec3 {
  const cos = v3Dot(geometry.normalA, geometry.normalB);
  return v3Add(geometry.from, v3Scale(v3Add(geometry.normalA, geometry.normalB), -radius / (1 + cos)));
}
