/**
 * Las RECETAS de las ocho primitivas: de los números a UN nodo del esquema 5.
 *
 * Salió de `solids-primitives.ts` cuando los modos nuevos (2P, 3P, Elíptico,
 * Arista, Arco) lo empujaron por encima del techo de 800 líneas del
 * presupuesto (`scripts/cad/check-monolith-budget.mjs`). La línea de corte no
 * es de conveniencia, es la que ya estaba dibujada en el archivo: allí se
 * PREGUNTA —qué se pide, en qué orden, qué se ofrece— y aquí se ESCRIBE la
 * receta. Ninguna función de este módulo sabe qué es un prompt, y ninguna de
 * las de allí sabe qué es una cara.
 *
 * Cada primitiva sigue siendo UN nodo reeditable, y las curvas siguen saliendo
 * FACETADAS en `CAD_PRIMITIVE_SEGMENTS` caras. Qué mide exactamente cada una
 * —y cuánto se queda por debajo la que se queda— está en
 * `solids-primitives.spec.ts`, medido contra papel.
 */
import type { CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadSolidNode, CadSolidProfile } from "../../cad-entities-v5";
import { circleProfile } from "../../../brep";
import { cadLiftPoint } from "../spatial-point";
import { ellipseProfile, placeRing, regularRing, ringSolidNode } from "./solids-primitive-modes";

/** Caras de una vuelta completa en cilindro, cono, esfera y toro. */
export const CAD_PRIMITIVE_SEGMENTS = 48;

/**
 * Lo que BOX y WEDGE necesitan de su diálogo: dos esquinas y si la primera era
 * el centro. Es la parte del estado que describe la CAJA, sin la máquina de
 * preguntas que la fue llenando.
 */
export interface CadCornerBase {
  first: CadPoint2 | null;
  opposite: CadPoint2 | null;
  centered: boolean;
}

/** Marco horizontal con origen en `at`: la base de la primitiva. */
export function frameAt(at: CadPoint3) {
  return { origin: at, zAxis: { x: 0, y: 0, z: 1 }, xAxis: { x: 1, y: 0, z: 0 } };
}

/** Caja alineada a ejes entre las dos esquinas y a la altura dada, o centrada. */
export function boxBounds(state: CadCornerBase, height: number): { min: CadPoint3; max: CadPoint3 } {
  const first = cadLiftPoint(state.first!);
  const opposite = cadLiftPoint(state.opposite!, state.first!);
  if (state.centered) {
    const dx = Math.abs(opposite.x - first.x);
    const dy = Math.abs(opposite.y - first.y);
    const dz = Math.abs(height) / 2;
    return { min: { x: first.x - dx, y: first.y - dy, z: first.z - dz }, max: { x: first.x + dx, y: first.y + dy, z: first.z + dz } };
  }
  return {
    min: { x: Math.min(first.x, opposite.x), y: Math.min(first.y, opposite.y), z: Math.min(first.z, first.z + height) },
    max: { x: Math.max(first.x, opposite.x), y: Math.max(first.y, opposite.y), z: Math.max(first.z, first.z + height) },
  };
}

export function boxNode(state: CadCornerBase, height: number): CadSolidNode {
  const { min, max } = boxBounds(state, height);
  return { id: "caja", op: "box", min, max };
}

/**
 * La cuña: un triángulo extruido DE CANTO. La cara inclinada baja a lo largo
 * de X desde la altura completa en la primera esquina hasta cero en la
 * opuesta, como en AutoCAD. Marco: X del mundo (con el signo del recorrido
 * primera→opuesta), Z del marco hacia −Y·signo para que la Y del perfil sea
 * la Z del mundo (Y = Z × X), y la extrusión recorre la anchura.
 */
export function wedgeNode(state: CadCornerBase, height: number): CadSolidNode {
  const first = cadLiftPoint(state.first!);
  const opposite = cadLiftPoint(state.opposite!, state.first!);
  const length = opposite.x - first.x;
  const width = opposite.y - first.y;
  const sx = length < 0 ? -1 : 1;
  const profile: CadSolidProfile = { outer: [{ x: 0, y: 0 }, { x: Math.abs(length), y: 0 }, { x: 0, y: height }] };
  return {
    id: "cuna",
    op: "extrude",
    profile,
    frame: { origin: first, xAxis: { x: sx, y: 0, z: 0 }, zAxis: { x: 0, y: -sx, z: 0 } },
    // Desplazamiento = altura·zAxis = (0, −sx·h, 0); para llegar a `width` en Y: h = −width·sx.
    height: -width * sx,
  };
}

export function circleAt(center: CadPoint2, radius: number): CadSolidProfile {
  return { outer: circleProfile(radius, CAD_PRIMITIVE_SEGMENTS).map((point) => ({ x: point.x + center.x, y: point.y + center.y })) };
}

export function cylinderNode(center: CadPoint3, radius: number, height: number): CadSolidNode {
  return { id: "cilindro", op: "extrude", profile: circleAt({ x: 0, y: 0 }, radius), frame: frameAt(center), height };
}

export type Ellipse = { a: number; b: number; angle: number };

/**
 * Cilindro ELÍPTICO: el mismo nodo `extrude` con un perfil de elipse y el marco
 * girado, no una receta nueva. El giro va en el `xAxis` del marco —para eso
 * está— en vez de en las coordenadas del perfil: así el nodo sigue diciendo
 * cuánto miden sus ejes cuando alguien lo reedite.
 */
export function cylinderEllipticNode(center: CadPoint3, ellipse: Ellipse, height: number): CadSolidNode {
  return {
    id: "cilindro",
    op: "extrude",
    profile: { outer: ellipseProfile(ellipse.a, ellipse.b, CAD_PRIMITIVE_SEGMENTS) },
    frame: { origin: center, zAxis: { x: 0, y: 0, z: 1 }, xAxis: { x: Math.cos(ellipse.angle), y: Math.sin(ellipse.angle), z: 0 } },
    height,
  };
}

/**
 * Cono ELÍPTICO: el abanico base→vértice de la pirámide, con la elipse
 * INSCRITA de anillo (`matchArea: false`). Así, con los dos semiejes iguales,
 * mide exactamente lo que mide el cono circular de ese radio —que es una
 * revolución facetada— en vez de un 0,3 % más.
 *
 * Con radio superior el anillo de arriba es la misma elipse a escala: el radio
 * tecleado es su semieje MAYOR, y el menor conserva la proporción.
 */
export function coneEllipticNode(center: CadPoint3, ellipse: Ellipse, topRadius: number, height: number): CadSolidNode {
  const profile = ellipseProfile(ellipse.a, ellipse.b, CAD_PRIMITIVE_SEGMENTS, false);
  const base = placeRing(profile, center, ellipse.angle, center.z);
  const apex = { x: center.x, y: center.y, z: center.z + height };
  if (!(topRadius > 1e-9)) return ringSolidNode("cono", base, { apex }, height < 0);
  const scale = topRadius / ellipse.a;
  const ring = placeRing(profile.map((point) => ({ x: point.x * scale, y: point.y * scale })), center, ellipse.angle, center.z + height);
  return ringSolidNode("cono", base, { ring }, height < 0);
}

/** Cono o tronco de cono: el perfil (radial, axial) es el trapecio/triángulo de su media sección. */
export function coneNode(center: CadPoint3, radius: number, topRadius: number, height: number): CadSolidNode {
  const outer: CadPoint2[] = [{ x: 0, y: 0 }, { x: radius, y: 0 }];
  if (topRadius > 1e-9) outer.push({ x: topRadius, y: height });
  outer.push({ x: 0, y: height });
  return { id: "cono", op: "revolve", profile: { outer }, frame: frameAt(center), segments: CAD_PRIMITIVE_SEGMENTS };
}

/** Esfera: media circunferencia (x ≥ 0) cerrada por el eje, revolucionada. */
export function sphereNode(center: CadPoint3, radius: number): CadSolidNode {
  const steps = CAD_PRIMITIVE_SEGMENTS / 2;
  const outer: CadPoint2[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const phi = -Math.PI / 2 + (Math.PI * index) / steps;
    outer.push({ x: index === 0 || index === steps ? 0 : radius * Math.cos(phi), y: radius * Math.sin(phi) });
  }
  return { id: "esfera", op: "revolve", profile: { outer }, frame: frameAt(center), segments: CAD_PRIMITIVE_SEGMENTS };
}

/** Toro: la sección del tubo, desplazada al radio del toro, revolucionada. */
export function torusNode(center: CadPoint3, radius: number, tube: number): CadSolidNode {
  return {
    id: "toro",
    op: "revolve",
    profile: circleAt({ x: radius, y: 0 }, tube),
    frame: frameAt(center),
    segments: CAD_PRIMITIVE_SEGMENTS,
  };
}

/**
 * Pirámide o tronco: el abanico de `ringSolidNode` sobre un anillo regular.
 * El giro lo pone el modo Arista; sin él vale cero y la base sale como salía.
 */
export function pyramidNode(
  center: CadPoint3,
  radius: number,
  topRadius: number,
  sides: number,
  height: number,
  rotation = 0,
): CadSolidNode {
  const base = regularRing(center, radius, sides, center.z, rotation);
  const top =
    topRadius > 1e-9
      ? { ring: regularRing(center, topRadius, sides, center.z + height, rotation) }
      : { apex: { x: center.x, y: center.y, z: center.z + height } };
  return ringSolidNode("piramide", base, top, height < 0);
}
