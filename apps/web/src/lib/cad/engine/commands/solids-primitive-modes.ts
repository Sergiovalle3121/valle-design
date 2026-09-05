/**
 * Los MODOS de las primitivas: 2P, 3P y Elíptico de CYLINDER/CONE, Arista de
 * PYRAMID, Arco de POLYSOLID (2026-09-04).
 *
 * La cabecera de `solids-primitives.ts` los declaraba ausentes uno por uno.
 * Estaban ausentes por dialogo, no por kernel: un cilindro por dos puntos es el
 * mismo nodo `extrude` con el centro puesto en otro sitio, y una pirámide por
 * su arista es el mismo abanico con otro radio. Lo que faltaba era la
 * aritmética que traduce lo que el dibujante DESIGNA a lo que la receta pide, y
 * es lo que vive aquí.
 *
 * Viven en un módulo aparte por dos motivos, y el segundo pesa tanto como el
 * primero: (1) es aritmética pura, comprobable sin montar un diálogo; (2)
 * `solids-primitives.ts` tenía 767 líneas contra un techo de 800
 * (`scripts/cad/check-monolith-budget.mjs`), así que meter aquí los modos y
 * llevarse además `offsetPath`/`polysolidFootprint`/el abanico de la pirámide
 * hace que el archivo grande ENCOJA mientras gana funciones.
 *
 * ## La faceta, dicha en números
 *
 * Todo lo curvo sale FACETADO en `CAD_PRIMITIVE_SEGMENTS` lados, y eso cambia
 * el volumen. La casa ya tomó postura con `circleProfile`: corrige el radio por
 * `√(θ/sen θ)` con `θ = 2π/N` para que el polígono encierre exactamente el área
 * del círculo, y por eso el cilindro circular mide `π·r²·h` EXACTO mientras el
 * cono y la esfera —que son revoluciones— se quedan por debajo.
 *
 * `ellipseProfile` respeta esa misma postura y su misma discontinuidad, con un
 * interruptor (`matchArea`) en vez de una segunda doctrina:
 *
 *   - el cilindro elíptico usa la elipse CORREGIDA, así que mide `π·a·b·h`
 *     exacto y, con `a = b = r`, produce el MISMO polígono que `circleProfile`
 *     bit a bit — dos modos de la misma orden no pueden dar dos sólidos
 *     distintos para la misma pieza;
 *   - el cono elíptico usa la elipse INSCRITA, porque su hermano circular es
 *     una revolución facetada: con `a = b = r` los dos dan
 *     `N·r²·h·sen(2π/N)/6`, el volumen del cono facetado, y no uno cada uno.
 *
 * Es decir: la corrección de faceta del cono elíptico es `sen θ / θ` con
 * `θ = 2π/N` (0,99715 con N = 48), y la del cilindro elíptico es 1 porque el
 * área ya está corregida. Los dos números están medidos en el spec.
 *
 * ## Lo que NO entra por aquí
 *
 * El modo **Ttr** (tangente-tangente-radio) de CYLINDER y CONE. No es
 * aritmética de puntos designados: pide resolver tangencias contra DOS
 * entidades del dibujo, que es el trabajo de `intersect.ts` + una designación
 * de objetos que el diálogo de estas órdenes no tiene (ninguna de las ocho
 * primitivas acepta `CAD_ACCEPT_ENTITY_PICK` salvo POLYSOLID Objeto). Se dice
 * en el prompt en vez de ofrecerse.
 */
import type { CadEntity, CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadSolidNode, CadSolidProfile } from "../../cad-entities-v5";
import { cadEntityCurves, curvePointAt } from "../../curve-model";

const EPS = 1e-9;

// ---------------------------------------------------------------------------
// La base de CYLINDER y CONE: centro, 2P, 3P o elíptica
// ---------------------------------------------------------------------------

/** Cómo se designa la base. `centro` es el modo de siempre (centro + radio). */
export type CadBaseMode = "centro" | "2p" | "3p" | "eliptico";

/** Base resuelta, o el motivo por el que esos puntos no describen ninguna. */
export type CadResolvedBase =
  | { kind: "circulo"; center: CadPoint2; radius: number }
  /** `angle`: giro del semieje `a` respecto de +X, en radianes. */
  | { kind: "elipse"; center: CadPoint2; a: number; b: number; angle: number }
  | { kind: "error"; text: string };

/** Puntos que pide cada modo antes de tener la base. */
export function cadBasePicks(mode: CadBaseMode): number {
  return mode === "centro" ? 1 : mode === "2p" ? 2 : 3;
}

const BASE_PROMPTS: Record<CadBaseMode, readonly string[]> = {
  centro: ["Precise el centro de la base"],
  "2p": ["Precise el primer extremo del diámetro de la base", "Precise el segundo extremo del diámetro de la base"],
  "3p": ["Precise el primer punto de la base", "Precise el segundo punto de la base", "Precise el tercer punto de la base"],
  eliptico: [
    "Precise el primer extremo de un eje de la base",
    "Precise el segundo extremo de ese eje",
    "Precise el extremo del otro eje",
  ],
};

export function cadBasePrompt(mode: CadBaseMode, index: number): string {
  const prompts = BASE_PROMPTS[mode];
  return prompts[Math.min(index, prompts.length - 1)];
}

const midpoint = (a: CadPoint2, b: CadPoint2): CadPoint2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const planarDistance = (a: CadPoint2, b: CadPoint2): number => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Los puntos designados, vueltos base.
 *
 * Las distancias se miden EN PLANTA aunque los puntos traigan cota: la base de
 * estas primitivas vive en el plano horizontal de su primer punto (lo dice
 * `spatial: "elevation"`), así que contar la z haría un radio que no es el que
 * se ve. La cota la pone quien llama, con la del primer punto designado.
 */
export function cadResolveBase(mode: CadBaseMode, picks: readonly CadPoint2[]): CadResolvedBase {
  if (mode === "2p") {
    const radius = planarDistance(picks[0], picks[1]) / 2;
    if (!(radius > EPS)) return { kind: "error", text: "los dos puntos del diámetro coinciden y la base no tiene radio." };
    return { kind: "circulo", center: midpoint(picks[0], picks[1]), radius };
  }
  if (mode === "3p") {
    const circle = cadCircumcircle(picks[0], picks[1], picks[2]);
    if (!circle)
      return {
        kind: "error",
        text: "los tres puntos son COLINEALES (o dos coinciden): por una recta no pasa ninguna circunferencia, así que no hay base que construir.",
      };
    return { kind: "circulo", ...circle };
  }
  // Elíptico: los dos primeros puntos son un eje ENTERO; el tercero da el
  // semieje del otro por su distancia al centro, como la orden ELLIPSE.
  const center = midpoint(picks[0], picks[1]);
  const a = planarDistance(picks[0], picks[1]) / 2;
  const b = planarDistance(center, picks[2]);
  if (!(a > EPS) || !(b > EPS)) return { kind: "error", text: "uno de los dos ejes quedó en cero y la elipse no tiene superficie." };
  return { kind: "elipse", center, a, b, angle: Math.atan2(picks[1].y - picks[0].y, picks[1].x - picks[0].x) };
}

/**
 * Circuncentro de tres puntos, o `null` si son colineales.
 *
 * El determinante se compara contra el TAMAÑO del triángulo, no contra un
 * absoluto: tres puntos separados un metro y desviados un micrón dan un
 * determinante grande en unidades de dibujo y siguen siendo, a efectos de
 * dibujo, una recta — y el circuncentro saldría a kilómetros.
 */
export function cadCircumcircle(a: CadPoint2, b: CadPoint2, c: CadPoint2): { center: CadPoint2; radius: number } | null {
  const bx = b.x - a.x;
  const by = b.y - a.y;
  const cx = c.x - a.x;
  const cy = c.y - a.y;
  const cross = bx * cy - by * cx;
  const scale = Math.max(Math.hypot(bx, by), Math.hypot(cx, cy), Math.hypot(cx - bx, cy - by));
  if (scale <= EPS || Math.abs(cross) <= scale * scale * 1e-9) return null;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (cy * b2 - by * c2) / (2 * cross);
  const uy = (bx * c2 - cx * b2) / (2 * cross);
  return { center: { x: a.x + ux, y: a.y + uy }, radius: Math.hypot(ux, uy) };
}

/**
 * Perfil ELÍPTICO de `segments` lados, centrado en el origen y con el semieje
 * `a` sobre +X.
 *
 * Con `matchArea` los dos semiejes se escalan por `√(θ/sen θ)` (θ = 2π/N), la
 * MISMA corrección que `circleProfile` documenta, y el polígono encierra
 * exactamente `π·a·b`. Con `a = b` el resultado es idéntico bit a bit a
 * `circleProfile(a, N)`, porque es la misma cuenta con los mismos operandos.
 */
export function ellipseProfile(a: number, b: number, segments: number, matchArea = true): CadPoint2[] {
  if (segments < 3) throw new Error(`Una elipse aproximada necesita al menos 3 segmentos, llegaron ${segments}.`);
  const theta = (2 * Math.PI) / segments;
  const k = matchArea ? Math.sqrt(theta / Math.sin(theta)) : 1;
  return Array.from({ length: segments }, (_, index) => {
    const angle = (2 * Math.PI * index) / segments;
    return { x: a * k * Math.cos(angle), y: b * k * Math.sin(angle) };
  });
}

/** Un perfil local llevado al mundo: girado `angle` y puesto en `center` a la cota `z`. */
export function placeRing(points: readonly CadPoint2[], center: CadPoint2, angle: number, z: number): CadPoint3[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map((point) => ({
    x: center.x + point.x * cos - point.y * sin,
    y: center.y + point.x * sin + point.y * cos,
    z,
  }));
}

// ---------------------------------------------------------------------------
// El abanico base→vértice: lo comparten PYRAMID y el cono elíptico
// ---------------------------------------------------------------------------

/** Anillo regular antihorario de `sides` vértices, girado `rotation` radianes. */
export function regularRing(center: CadPoint2, radius: number, sides: number, z: number, rotation = 0): CadPoint3[] {
  const points: CadPoint3[] = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + (2 * Math.PI * index) / sides;
    points.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle), z });
  }
  return points;
}

/**
 * Sólido de dos anillos (tronco) o de anillo y vértice (pirámide o cono).
 *
 * La base, vista desde arriba, va en sentido antihorario; la cara de abajo
 * lleva el anillo INVERTIDO (normal −Z) y los laterales `[b_i, b_j, t_j, t_i]`,
 * el mismo cosido que `makeBox`. Con `invert` —altura negativa— el sólido es la
 * imagen especular y se invierten TODAS las caras, en vez de razonar sobre cada
 * una.
 *
 * Lo usan la pirámide (anillo regular) y el cono elíptico (anillo de elipse):
 * la misma máquina, dos anillos distintos. Estrenar una segunda habría sido
 * escribir dos veces el mismo cosido para que se desincronizara una vez.
 */
export function ringSolidNode(
  id: string,
  base: readonly CadPoint3[],
  top: { ring: readonly CadPoint3[] } | { apex: CadPoint3 },
  invert: boolean,
): CadSolidNode {
  const sides = base.length;
  const points: CadPoint3[] = [...base];
  const faces: { outer: number[] }[] = [{ outer: base.map((_, index) => index).reverse() }];
  if ("ring" in top) {
    points.push(...top.ring);
    faces.push({ outer: top.ring.map((_, index) => sides + index) });
    for (let i = 0; i < sides; i += 1) {
      const j = (i + 1) % sides;
      faces.push({ outer: [i, j, sides + j, sides + i] });
    }
  } else {
    points.push(top.apex);
    for (let i = 0; i < sides; i += 1) faces.push({ outer: [i, (i + 1) % sides, sides] });
  }
  return { id, op: "brep", points, faces: invert ? faces.map((face) => ({ outer: [...face.outer].reverse() })) : faces };
}

/**
 * La base de PYRAMID designada por una ARISTA: los dos extremos de UN lado.
 *
 * Con lado `L` y `n` lados, el radio a los vértices es `R = L / (2·sen(π/n))` y
 * el apotema `L / (2·tan(π/n))`. El centro cae a la IZQUIERDA del recorrido
 * primero→segundo, que es lo que deja el polígono recorrido en sentido
 * antihorario empezando por el primer extremo — y el sentido antihorario es lo
 * que `ringSolidNode` espera de su base.
 *
 * Devuelve además el GIRO, sin el cual la pirámide tendría el radio correcto y
 * la arista en otro sitio: prometer «esta arista» y dibujar otra es peor que no
 * ofrecer el modo.
 */
export function cadEdgeBase(
  first: CadPoint2,
  second: CadPoint2,
  sides: number,
): { center: CadPoint2; radius: number; rotation: number } | null {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const length = Math.hypot(dx, dy);
  if (!(length > EPS)) return null;
  const apothem = length / (2 * Math.tan(Math.PI / sides));
  const center = { x: (first.x + second.x) / 2 - (dy / length) * apothem, y: (first.y + second.y) / 2 + (dx / length) * apothem };
  return {
    center,
    radius: length / (2 * Math.sin(Math.PI / sides)),
    rotation: Math.atan2(first.y - center.y, first.x - center.x),
  };
}

// ---------------------------------------------------------------------------
// El recorrido de POLYSOLID: tramos rectos, tramos de arco, y su engrosado
// ---------------------------------------------------------------------------

/** Vértice de un recorrido, con el `bulge` del tramo que ARRANCA en él. */
export interface CadPathVertex {
  x: number;
  y: number;
  z?: number;
  /** `tan(θ/4)` del tramo que sale de este vértice; positivo = antihorario. */
  bulge?: number;
}

const vertexBulge = (vertex: CadPathVertex | undefined): number =>
  vertex && typeof vertex.bulge === "number" && Number.isFinite(vertex.bulge) ? vertex.bulge : 0;

/**
 * El recorrido TESELADO a puntos: los arcos se vuelven segmentos ANTES de
 * engrosarlo.
 *
 * `offsetPath` sabe desplazar rectas con juntas a inglete y nada más. En vez de
 * enseñarle arcos —una segunda geometría de desfase, con su propio caso de
 * radio menor que el desfase— el arco se convierte en la poligonal que el
 * dibujo YA muestra, y el engrosado sigue siendo el de siempre. Es facetado y
 * se dice: un muro curvo de esta orden tiene lados planos.
 *
 * La aritmética del arco no se copia: se pide al modelo de curvas del dibujo
 * (`curve-model`), armando la polilínea que este recorrido ES. Reimplementar
 * aquí `bulge = tan(θ/4)` habría creado una TERCERA versión de la misma curva,
 * y el muro habría dejado de coincidir con la polilínea que lo generó.
 */
export function tessellatePath(
  vertices: readonly CadPathVertex[],
  closed: boolean,
  segments: number,
): CadPoint2[] {
  const plain = vertices.map((vertex) => ({ x: vertex.x, y: vertex.y }));
  if (vertices.length < 2 || !vertices.some((vertex) => Math.abs(vertexBulge(vertex)) > 1e-12)) return plain;
  const entity: CadEntity = {
    id: "recorrido",
    type: "polyline",
    layer: "0",
    closed,
    vertices: vertices.map((vertex) => ({ x: vertex.x, y: vertex.y, z: 0, ...(vertexBulge(vertex) ? { bulge: vertexBulge(vertex) } : {}) })),
  };
  const curves = cadEntityCurves(entity);
  if (!curves || curves.length === 0) return plain;
  const points: CadPoint2[] = [curvePointAt(curves[0], 0)];
  for (const curve of curves) {
    if (curve.kind === "segment") {
      // El extremo TAL CUAL: `a + (b − a)·1` no siempre es `b` en coma flotante,
      // y un recorrido recto tiene que seguir dando el sólido de siempre.
      points.push({ x: curve.b.x, y: curve.b.y });
      continue;
    }
    const steps = Math.max(1, Math.ceil((Math.abs(curve.sweep) * segments) / 360));
    for (let index = 1; index <= steps; index += 1) points.push(curvePointAt(curve, index / steps));
  }
  if (closed) points.pop(); // el tramo de cierre vuelve al primer punto
  return points;
}

/**
 * Dirección con la que el recorrido SALE de su último vértice.
 *
 * Es la tangente de entrada del arco siguiente. En un tramo recto es la propia
 * cuerda; en uno de arco es la cuerda girada `θ/2`, porque la tangente al final
 * de un arco forma con su cuerda el ángulo semiinscrito. Guardarla en vez de
 * deducirla de los dos últimos puntos teselados evita el codo de 3,75° que
 * dejaría encadenar dos arcos con la cuerda del último tramito.
 */
export function pathEndTangent(vertices: readonly CadPathVertex[]): CadPoint2 | null {
  if (vertices.length < 2) return null;
  const from = vertices[vertices.length - 2];
  const to = vertices[vertices.length - 1];
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (!(length > EPS)) return null;
  const chord = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const bulge = vertexBulge(from);
  if (Math.abs(bulge) < 1e-12) return chord;
  const half = 2 * Math.atan(bulge);
  return { x: chord.x * Math.cos(half) - chord.y * Math.sin(half), y: chord.x * Math.sin(half) + chord.y * Math.cos(half) };
}

/**
 * `bulge` del tramo `from → to` para que el arco arranque TANGENTE a
 * `tangent`, que es el arco por defecto de POLYSOLID y de PLINE.
 *
 * El ángulo entre la tangente y la cuerda es la mitad del arco, así que
 * `bulge = tan(θ/4) = tan(ang/2)`. Media vuelta exacta (`ang = ±π`) no describe
 * ningún arco —sería un giro completo sobre el mismo punto— y se rechaza.
 */
export function tangentBulge(from: CadPoint2, to: CadPoint2, tangent: CadPoint2): number | null {
  const cx = to.x - from.x;
  const cy = to.y - from.y;
  if (!(Math.hypot(cx, cy) > EPS)) return null;
  const angle = Math.atan2(tangent.x * cy - tangent.y * cx, tangent.x * cx + tangent.y * cy);
  if (Math.abs(Math.abs(angle) - Math.PI) < 1e-6) return null;
  return Math.abs(angle) < 1e-12 ? 0 : Math.tan(angle / 2);
}

/**
 * Desplaza un recorrido de tramos rectos una distancia `offset` hacia su
 * izquierda (positiva) con juntas a inglete. En un cambio de sentido brusco
 * (los dos tramos casi opuestos) el inglete se dispara; se rechaza antes.
 */
export function offsetPath(points: readonly CadPoint2[], offset: number, closed: boolean): CadPoint2[] | null {
  const count = points.length;
  const normal = (a: CadPoint2, b: CadPoint2) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  };
  const result: CadPoint2[] = [];
  for (let index = 0; index < count; index += 1) {
    const prev = closed || index > 0 ? points[(index - 1 + count) % count] : null;
    const next = closed || index < count - 1 ? points[(index + 1) % count] : null;
    const nPrev = prev ? normal(prev, points[index]) : null;
    const nNext = next ? normal(points[index], next) : null;
    let direction: CadPoint2;
    if (nPrev && nNext) {
      const dot = nPrev.x * nNext.x + nPrev.y * nNext.y;
      if (dot < -0.9) return null;
      direction = { x: (nPrev.x + nNext.x) / (1 + dot), y: (nPrev.y + nNext.y) / (1 + dot) };
    } else direction = (nPrev ?? nNext)!;
    result.push({ x: points[index].x + direction.x * offset, y: points[index].y + direction.y * offset });
  }
  return result;
}

/** La huella del muro: el recorrido engrosado según su justificación. */
export function polysolidFootprint(
  points: readonly CadPoint2[],
  width: number,
  justify: "left" | "center" | "right",
  closed: boolean,
): CadSolidProfile | null {
  const cleaned = points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > EPS);
  if (cleaned.length < 2) return null;
  const left = justify === "center" ? width / 2 : justify === "left" ? 0 : width;
  const right = left - width;
  const a = offsetPath(cleaned, left, closed);
  const b = offsetPath(cleaned, right, closed);
  if (!a || !b) return null;
  if (closed) {
    // Cuál de los dos anillos es el contorno depende del sentido del recorrido:
    // en uno antihorario la izquierda queda DENTRO. Decide el área, no el lado.
    const area = (ring: readonly CadPoint2[]) =>
      Math.abs(ring.reduce((sum, p, i) => sum + p.x * ring[(i + 1) % ring.length].y - ring[(i + 1) % ring.length].x * p.y, 0)) / 2;
    const [outer, inner] = area(a) >= area(b) ? [a, b] : [b, a];
    return { outer, inners: [[...inner].reverse()] };
  }
  return { outer: [...a, ...[...b].reverse()] };
}
