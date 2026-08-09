/**
 * Extrusión (con ángulo de desmoldeo) y revolución (con ángulo parcial).
 *
 * DESMOLDEO. Un ángulo de desmoldeo hace que la sección crezca (o encoja) con la
 * altura: es lo que permite sacar una pieza de un molde. La sección a la altura
 * `z` es el perfil desplazado `z·tanα`. Con uniones a inglete, cada arista se
 * mueve exactamente `d` en su propia normal, así que los cuatro puntos de una
 * cara lateral SIGUEN SIENDO COPLANARIOS — cosa que no es evidente y que es la
 * razón de que la extrusión con desmoldeo no necesite secciones intermedias:
 * una sola pareja de secciones basta y el sólido es exacto, no aproximado.
 *
 * SENTIDO DE GIRO DE LA REVOLUCIÓN. Aquí hay una trampa que cuesta una tarde. En
 * una extrusión el marco (X, Y, dirección de barrido = Z) es diestro, y por eso
 * un perfil antihorario en XY da normales salientes. En una revolución el perfil
 * vive en el plano (radial, axial) y la dirección de barrido es la TANGENCIAL:
 * radial × axial = −tangencial, o sea el marco es ZURDO. Con la misma fórmula de
 * cosido, las normales salen hacia DENTRO. La corrección es invertir el orden de
 * los anillos de cada sección, y está aquí escrita porque el síntoma —un sólido
 * perfectamente válido con el volumen negativo— no dice nada por sí solo.
 */
import { attachPlanarSurfaces } from "./primitives";
import {
  normalizeProfile,
  offsetProfile,
  profileArea,
  type Profile,
  type Vec2,
} from "./profile";
import { frameToWorld, makeFrame, type SurfaceFrame } from "./surfaces";
import { stitchSections, type SweepSection } from "./sweep-core";
import type { BrepBody } from "./topology";
import { v3RotateAroundAxis, v3Add, v3Scale, vec3, V3_X, V3_Z, type Vec3 } from "./vec3";

export interface ProfileInput {
  outer: readonly Vec2[];
  inners?: readonly (readonly Vec2[])[];
}

export interface ExtrudeOptions {
  profile: ProfileInput;
  /** Altura a lo largo del eje Z del marco. Puede ser negativa. */
  height: number;
  /** Marco del perfil. Por defecto, el plano XY en el origen. */
  frame?: SurfaceFrame;
  /** Ángulo de desmoldeo. Positivo ⇒ la pieza se ENSANCHA al subir. */
  draftAngleRad?: number;
  /** Secciones intermedias. No hacen falta para el sólido, sí para el teselado fino. */
  steps?: number;
}

const DEFAULT_FRAME: SurfaceFrame = makeFrame(vec3(0, 0, 0), V3_Z, V3_X);

/** Extrusión de un perfil a lo largo de la normal de su marco. */
export function extrudeProfile(options: ExtrudeOptions): BrepBody {
  const { height } = options;
  if (height === 0) throw new Error("Una extrusión de altura cero no produce ningún sólido.");
  const frame = options.frame ?? DEFAULT_FRAME;
  const profile = normalizeProfile(options.profile);
  const draft = options.draftAngleRad ?? 0;
  if (Math.abs(draft) >= Math.PI / 2) {
    throw new Error(`Ángulo de desmoldeo ${draft} rad: tiene que estar estrictamente entre −90° y 90°.`);
  }
  const steps = Math.max(1, Math.floor(options.steps ?? 1));
  const sections: SweepSection[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const z = (height * i) / steps;
    const offset = z * Math.tan(draft);
    const shaped = offset === 0 ? profile : offsetProfile(profile, offset);
    sections.push(sectionFromProfile(shaped, frame, z, height < 0));
  }
  return attachPlanarSurfaces(stitchSections(sections, { capStart: true, capEnd: true }));
}

/**
 * Pasa un perfil a una sección del mundo a la altura `z`.
 *
 * `flip` invierte los anillos cuando la extrusión va hacia −Z: sin eso, extruir
 * con altura negativa produce el sólido del revés. Es la misma trampa de
 * lateralidad que la revolución, en su versión más simple.
 */
function sectionFromProfile(profile: Profile, frame: SurfaceFrame, z: number, flip: boolean): SweepSection {
  const map = (points: readonly Vec2[]): Vec3[] => {
    const world = points.map((point) => frameToWorld(frame, point.x, point.y, z));
    return flip ? world.reverse() : world;
  };
  return { outer: map(profile.outer), inners: profile.inners.map(map) };
}

/**
 * Volumen exacto de una extrusión con desmoldeo, por la regla de Simpson.
 *
 * El área de la sección es CUADRÁTICA en el desplazamiento (término constante,
 * término de perímetro y término de esquinas), y Simpson integra exactamente los
 * polinomios de grado ≤ 3. Es decir: esto no es una aproximación numérica, es la
 * respuesta exacta — y por eso sirve de oráculo independiente contra el que
 * contrastar el volumen que sale de integrar sobre las caras del sólido.
 */
export function extrudeVolume(options: ExtrudeOptions): number {
  const profile = normalizeProfile(options.profile);
  const draft = options.draftAngleRad ?? 0;
  const height = options.height;
  const areaAt = (z: number) => {
    const offset = z * Math.tan(draft);
    return profileArea(offset === 0 ? profile : offsetProfile(profile, offset));
  };
  return (Math.abs(height) / 6) * (areaAt(0) + 4 * areaAt(height / 2) + areaAt(height));
}

export interface RevolveOptions {
  /**
   * Perfil en el plano (radial, axial): `x` es la distancia al eje —nunca
   * negativa— e `y` la coordenada a lo largo del eje.
   */
  profile: ProfileInput;
  /** Ángulo barrido. Por defecto, la vuelta completa. */
  angleRad?: number;
  /** Facetas en las que se divide el barrido. */
  segments?: number;
  /** Marco: `origin` es un punto del eje, `zAxis` el eje, `xAxis` la referencia radial. */
  frame?: SurfaceFrame;
}

/**
 * Revolución de un perfil alrededor del eje de su marco.
 *
 * El resultado es FACETADO: `segments` planos en lugar de una superficie de
 * revolución exacta. Está dicho aquí y no escondido, porque cambia lo que se
 * puede esperar del volumen: con N facetas, revolucionar un rectángulo da
 * exactamente un prisma de base N-gonal, no un cilindro. Ese valor exacto es el
 * que usa la spec como ancla, y la convergencia a Pappus con N creciente es la
 * segunda comprobación.
 */
export function revolveProfile(options: RevolveOptions): BrepBody {
  const frame = options.frame ?? DEFAULT_FRAME;
  const angle = options.angleRad ?? 2 * Math.PI;
  const segments = Math.max(3, Math.floor(options.segments ?? 32));
  if (angle === 0) throw new Error("Una revolución de ángulo cero no produce ningún sólido.");
  if (Math.abs(angle) > 2 * Math.PI + 1e-12) {
    throw new Error(`Ángulo de revolución ${angle} rad: no puede pasar de una vuelta completa.`);
  }
  const profile = normalizeProfile(options.profile);
  const negativeRadius = [profile.outer, ...profile.inners].flat().find((point) => point.x < -1e-12);
  if (negativeRadius) {
    throw new Error(
      `El perfil de una revolución no puede cruzar el eje: el punto (${negativeRadius.x}, ${negativeRadius.y}) tiene radio negativo.`,
    );
  }
  const full = Math.abs(Math.abs(angle) - 2 * Math.PI) <= 1e-12;
  const sectionCount = full ? segments : segments + 1;
  const sections: SweepSection[] = [];
  for (let i = 0; i < sectionCount; i += 1) {
    sections.push(revolvedSection(profile, frame, (angle * i) / segments));
  }
  return attachPlanarSurfaces(
    stitchSections(sections, { closed: full, capStart: !full, capEnd: !full }),
  );
}

/**
 * Sección de la revolución al ángulo `theta`, con los anillos YA INVERTIDOS.
 *
 * La inversión es la corrección de lateralidad explicada en la cabecera: el
 * marco (radial, axial, tangencial) es zurdo, y sin invertir los anillos el
 * sólido sale con todas las normales hacia dentro.
 */
function revolvedSection(profile: Profile, frame: SurfaceFrame, theta: number): SweepSection {
  const map = (points: readonly Vec2[]): Vec3[] =>
    [...points]
      .reverse()
      .map((point) => {
        const radial = v3RotateAroundAxis(frame.xAxis, frame.zAxis, theta);
        return v3Add(frame.origin, v3Add(v3Scale(radial, point.x), v3Scale(frame.zAxis, point.y)));
      });
  return { outer: map(profile.outer), inners: profile.inners.map(map) };
}

/**
 * Volumen EXACTO de la revolución facetada de un perfil.
 *
 * Cada faceta gira `Δ = ángulo/N`, y un elemento de área a distancia `x` del eje
 * barre en ese giro un triángulo de área `½ x² sin Δ` en lugar del sector
 * circular `½ x² Δ` que barrería la revolución exacta. Integrando sobre el
 * perfil, el volumen facetado es `(N/2)·sin Δ · ∮x²dy`.
 *
 * Con `Δ → 0` esto tiende a `ángulo · ∫∫x dA`, que es el teorema de Pappus. El
 * factor `sin Δ / Δ` es EXACTAMENTE lo que separa el sólido facetado del exacto:
 * tenerlo escrito evita la discusión recurrente de si el kernel "pierde
 * volumen". No lo pierde; lo pierde el facetado, en la cantidad conocida.
 */
export function revolveVolume(options: RevolveOptions): number {
  const profile = normalizeProfile(options.profile);
  const angle = options.angleRad ?? 2 * Math.PI;
  const segments = Math.max(3, Math.floor(options.segments ?? 32));
  const step = angle / segments;
  const moment = profile.inners.reduce(
    (total, hole) => total + axialSweepMoment(hole),
    axialSweepMoment(profile.outer),
  );
  return (segments / 2) * Math.sin(step) * moment;
}

/**
 * `∮ x² dy` sobre el contorno, que por Green vale `2·∫∫ x dA`.
 *
 * Es el momento que necesita Pappus, no el momento de inercia: `∫∫x dA` es
 * `área · radio del centroide`. Con el contorno antihorario sale positivo y con
 * un agujero horario sale negativo, así que la resta de los agujeros es
 * automática — el mismo truco de signos que en `profileArea`, y por la misma
 * razón: un agujero mal orientado tiene que hacer SUBIR el resultado, no bajarlo
 * en silencio.
 */
function axialSweepMoment(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += (b.y - a.y) * (a.x * a.x + a.x * b.x + b.x * b.x);
  }
  return total / 3;
}
