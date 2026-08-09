/**
 * Barrido a lo largo de un camino y solevado entre perfiles.
 *
 * MARCOS QUE NO GIRAN. Llevar un perfil por un camino curvo exige decidir cómo
 * orientarlo en cada punto, y la respuesta ingenua —usar el triedro de Frenet—
 * es mala: la normal de Frenet salta 180° en cada punto de inflexión y no existe
 * en los tramos rectos, de modo que un barrido por una S se retuerce de golpe a
 * mitad de camino. Aquí se usan MARCOS DE MÍNIMA ROTACIÓN calculados por doble
 * reflexión (Wang et al., 2008): cada marco es el anterior transportado sin giro
 * alrededor de la tangente, es estable en las rectas y no da saltos.
 *
 * CAMINOS CERRADOS. Al dar la vuelta, el marco transportado no tiene por qué
 * coincidir con el inicial: sobra un ángulo de torsión. Cerrar el barrido sin
 * más produce una costura retorcida. Aquí se mide ese residuo y se REPARTE entre
 * todas las secciones, que es la corrección estándar y la que hace que un
 * barrido cerrado se cierre de verdad.
 *
 * ESQUINAS. En un vértice del camino el perfil se coloca en el plano bisector.
 * No se estira por `1/cos(θ/2)`, así que en un giro brusco la sección
 * perpendicular al camino queda algo más estrecha que el perfil pedido. Es una
 * aproximación consciente: el estiramiento correcto exige conocer la dirección
 * del giro dentro del perfil, y con perfiles con agujeros deja de ser un simple
 * factor. Está dicho aquí en lugar de descubrirse midiendo.
 */
import { attachPlanarSurfaces } from "./primitives";
import { normalizeProfile, type Profile, type Vec2 } from "./profile";
import { frameToWorld, makeFrame, type SurfaceFrame } from "./surfaces";
import { alignRingStart, resampleRing, stitchSections, type SweepSection } from "./sweep-core";
import type { BrepBody } from "./topology";
import {
  v3Add,
  v3Cross,
  v3Dot,
  v3Length,
  v3Normalize,
  v3RotateAroundAxis,
  v3Scale,
  v3Sub,
  type Vec3,
} from "./vec3";

export interface ProfileInput {
  outer: readonly Vec2[];
  inners?: readonly (readonly Vec2[])[];
}

export interface SweepOptions {
  profile: ProfileInput;
  /** Camino como polilínea. Al menos dos puntos distintos. */
  path: readonly Vec3[];
  /** El camino vuelve a su origen: no lleva tapas y se corrige la torsión. */
  closed?: boolean;
  /** Dirección de referencia para fijar el giro inicial del perfil. */
  upHint?: Vec3;
}

/** Marco de sección: origen sobre el camino y normal = tangente del camino. */
export interface PathFrame {
  frame: SurfaceFrame;
  tangent: Vec3;
}

/**
 * Marcos de mínima rotación a lo largo de una polilínea.
 *
 * Se expone porque es útil por sí solo (colocar texto sobre una curva, orientar
 * un componente a lo largo de una guía) y porque poder inspeccionarlo aparte es
 * lo que permite distinguir un barrido retorcido de un perfil mal orientado.
 */
export function pathFrames(path: readonly Vec3[], closed: boolean, upHint?: Vec3): PathFrame[] {
  const points = dedupePath(path);
  if (points.length < 2) throw new Error("Un barrido necesita un camino con al menos dos puntos distintos.");
  const count = points.length;
  const tangents: Vec3[] = points.map((_, i) => {
    if (closed) {
      const previous = points[(i - 1 + count) % count];
      const next = points[(i + 1) % count];
      return v3Normalize(v3Sub(next, previous));
    }
    if (i === 0) return v3Normalize(v3Sub(points[1], points[0]));
    if (i === count - 1) return v3Normalize(v3Sub(points[count - 1], points[count - 2]));
    return v3Normalize(v3Sub(points[i + 1], points[i - 1]));
  });

  const initial = makeFrame(points[0], tangents[0], upHint);
  const frames: PathFrame[] = [{ frame: initial, tangent: tangents[0] }];
  let reference = initial.xAxis;
  for (let i = 1; i < count; i += 1) {
    reference = doubleReflection(points[i - 1], tangents[i - 1], reference, points[i], tangents[i]);
    frames.push({ frame: frameFrom(points[i], tangents[i], reference), tangent: tangents[i] });
  }

  if (closed) {
    // Torsión residual al cerrar: se mide contra el marco inicial y se reparte.
    const wrapped = doubleReflection(points[count - 1], tangents[count - 1], reference, points[0], tangents[0]);
    const residual = signedAngleAround(wrapped, initial.xAxis, tangents[0]);
    for (let i = 0; i < count; i += 1) {
      const correction = (residual * i) / count;
      const rotated = v3RotateAroundAxis(frames[i].frame.xAxis, frames[i].tangent, correction);
      frames[i] = { frame: frameFrom(points[i], frames[i].tangent, rotated), tangent: frames[i].tangent };
    }
  }
  return frames;
}

function dedupePath(path: readonly Vec3[], tolerance = 1e-12): Vec3[] {
  const out: Vec3[] = [];
  for (const point of path) {
    if (out.length > 0 && v3Length(v3Sub(out[out.length - 1], point)) <= tolerance) continue;
    out.push({ ...point });
  }
  return out;
}

function frameFrom(origin: Vec3, tangent: Vec3, xHint: Vec3): SurfaceFrame {
  const z = v3Normalize(tangent);
  const projected = v3Sub(xHint, v3Scale(z, v3Dot(xHint, z)));
  const x = v3Length(projected) > 1e-12 ? v3Normalize(projected) : makeFrame(origin, z).xAxis;
  return { origin, xAxis: x, yAxis: v3Cross(z, x), zAxis: z };
}

/** Transporte por doble reflexión (Wang et al. 2008), el paso del marco RMF. */
function doubleReflection(p0: Vec3, t0: Vec3, x0: Vec3, p1: Vec3, t1: Vec3): Vec3 {
  const v1 = v3Sub(p1, p0);
  const c1 = v3Dot(v1, v1);
  if (c1 === 0) return x0;
  const xL = v3Sub(x0, v3Scale(v1, (2 / c1) * v3Dot(v1, x0)));
  const tL = v3Sub(t0, v3Scale(v1, (2 / c1) * v3Dot(v1, t0)));
  const v2 = v3Sub(t1, tL);
  const c2 = v3Dot(v2, v2);
  if (c2 === 0) return v3Normalize(xL);
  return v3Normalize(v3Sub(xL, v3Scale(v2, (2 / c2) * v3Dot(v2, xL))));
}

function signedAngleAround(from: Vec3, to: Vec3, axis: Vec3): number {
  const n = v3Normalize(axis);
  const a = v3Normalize(v3Sub(from, v3Scale(n, v3Dot(from, n))));
  const b = v3Normalize(v3Sub(to, v3Scale(n, v3Dot(to, n))));
  return Math.atan2(v3Dot(v3Cross(a, b), n), Math.max(-1, Math.min(1, v3Dot(a, b))));
}

/** Barrido de un perfil a lo largo de un camino. */
export function sweepProfile(options: SweepOptions): BrepBody {
  const profile = normalizeProfile(options.profile);
  const closed = options.closed ?? false;
  const frames = pathFrames(options.path, closed, options.upHint);
  const sections = frames.map(({ frame }) => sectionAt(profile, frame));
  return attachPlanarSurfaces(stitchSections(sections, { closed, capStart: !closed, capEnd: !closed }));
}

function sectionAt(profile: Profile, frame: SurfaceFrame): SweepSection {
  const map = (points: readonly Vec2[]): Vec3[] => points.map((point) => frameToWorld(frame, point.x, point.y, 0));
  return { outer: map(profile.outer), inners: profile.inners.map(map) };
}

export interface LoftSection {
  profile: ProfileInput;
  frame: SurfaceFrame;
}

export interface LoftOptions {
  sections: readonly LoftSection[];
  /** Cierra el solevado sobre sí mismo (la última sección se cose con la primera). */
  closed?: boolean;
  /**
   * Subdivisiones lineales entre secciones consecutivas.
   *
   * No es cosmético. Entre dos perfiles que no se corresponden, las caras
   * laterales son cuadriláteros ALABEADOS, y un cuadrilátero alabeado no encierra
   * un volumen definido: hay que partirlo en triángulos, y las dos diagonales
   * dan volúmenes distintos. Subdividir reduce el alabeo con el cuadrado del
   * número de pasos, de modo que ambas triangulaciones convergen al sólido
   * reglado de verdad. Con `steps = 1` el sólido es válido pero su volumen
   * depende de una diagonal.
   */
  steps?: number;
}

/**
 * Solevado entre perfiles distintos.
 *
 * DOS PROBLEMAS QUE NADIE ESPERA, y que aquí se resuelven antes de coser:
 *
 *   1. Distinto número de puntos. Se remuestrea todo al máximo, repartiendo por
 *      LONGITUD DE ARCO. Emparejar por índice el vértice 3 de un triángulo con
 *      el vértice 3 de un dodecágono da un sólido válido y visiblemente absurdo.
 *   2. Punto de arranque distinto. Solevar entre dos cuadrados girados 45° sin
 *      alinear el arranque produce una pieza retorcida media vuelta. Se busca la
 *      rotación del anillo que minimiza la suma de distancias al cuadrado.
 *
 * Lo que NO se resuelve: perfiles con distinto número de agujeros. Se rechaza,
 * porque no hay ninguna correspondencia razonable que inventar.
 */
export function loftProfiles(options: LoftOptions): BrepBody {
  const inputs = options.sections;
  if (inputs.length < 2) throw new Error(`Un solevado necesita al menos 2 secciones, llegaron ${inputs.length}.`);
  const profiles = inputs.map((section) => normalizeProfile(section.profile));
  const holeCount = profiles[0].inners.length;
  for (let i = 1; i < profiles.length; i += 1) {
    if (profiles[i].inners.length !== holeCount) {
      throw new Error(
        `Solevado imposible: la sección 0 tiene ${holeCount} agujero(s) y la ${i} tiene ${profiles[i].inners.length}. No hay correspondencia que inventar.`,
      );
    }
  }
  const outerCount = Math.max(...profiles.map((profile) => profile.outer.length));
  const innerCounts = Array.from({ length: holeCount }, (_, h) => Math.max(...profiles.map((profile) => profile.inners[h].length)));

  const sections: SweepSection[] = [];
  for (let i = 0; i < profiles.length; i += 1) {
    const world = sectionAt(profiles[i], inputs[i].frame);
    let outer = resampleRing(world.outer, outerCount);
    const inners = world.inners.map((hole, h) => resampleRing(hole, innerCounts[h]));
    if (sections.length > 0) {
      outer = alignRingStart(outer, sections[sections.length - 1].outer);
      for (let h = 0; h < inners.length; h += 1) {
        inners[h] = alignRingStart(inners[h], sections[sections.length - 1].inners[h]);
      }
    }
    sections.push({ outer, inners });
  }
  const closed = options.closed ?? false;
  const steps = Math.max(1, Math.floor(options.steps ?? 1));
  const refined = steps === 1 ? sections : subdivideSections(sections, steps, closed);
  return attachPlanarSurfaces(stitchSections(refined, { closed, capStart: !closed, capEnd: !closed }));
}

/** Inserta `steps − 1` secciones interpoladas entre cada par consecutivo. */
function subdivideSections(sections: readonly SweepSection[], steps: number, closed: boolean): SweepSection[] {
  const lerpRing = (a: readonly Vec3[], b: readonly Vec3[], t: number): Vec3[] =>
    a.map((point, i) => v3Add(point, v3Scale(v3Sub(b[i], point), t)));
  const out: SweepSection[] = [];
  const pairs = closed ? sections.length : sections.length - 1;
  for (let i = 0; i < pairs; i += 1) {
    const from = sections[i];
    const to = sections[(i + 1) % sections.length];
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      out.push({
        outer: lerpRing(from.outer, to.outer, t),
        inners: from.inners.map((hole, h) => lerpRing(hole, to.inners[h], t)),
      });
    }
  }
  if (!closed) out.push(sections[sections.length - 1]);
  return out;
}

/**
 * Volumen exacto de un solevado entre DOS secciones paralelas por la fórmula del
 * prismatoide: `h/6 · (A₀ + 4·A_m + A₁)`.
 *
 * Vale sólo cuando las dos secciones son paralelas y las caras laterales
 * planas, que es justo la geometría de un tronco de pirámide. Sirve de oráculo
 * independiente del cosido, y se rechaza explícitamente en cuanto la geometría
 * se sale de ese caso en lugar de devolver un número que parece bueno.
 */
export function prismatoidVolume(bottom: readonly Vec3[], top: readonly Vec3[], axis: Vec3): number {
  if (bottom.length !== top.length) throw new Error("El prismatoide necesita dos anillos con el mismo número de puntos.");
  const unit = v3Normalize(axis);
  const height = v3Dot(v3Sub(top[0], bottom[0]), unit);
  const middle = bottom.map((point, i) => v3Scale(v3Add(point, top[i]), 0.5));
  const area = (ring: readonly Vec3[]): number => {
    let sum: Vec3 = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < ring.length; i += 1) {
      sum = v3Add(sum, v3Cross(ring[i], ring[(i + 1) % ring.length]));
    }
    return Math.abs(v3Dot(sum, unit)) / 2;
  };
  return (Math.abs(height) / 6) * (area(bottom) + 4 * area(middle) + area(top));
}
