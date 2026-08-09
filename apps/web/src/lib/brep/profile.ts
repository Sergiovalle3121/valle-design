/**
 * Perfiles 2D: la entrada de extrusión, revolución, barrido y solevado.
 *
 * Un perfil vive en el plano local de un marco, no en el mundo. Trabajar en 2D
 * no es una comodidad: la orientación de un lazo (¿antihorario o no?) sólo
 * significa algo respecto de una normal, y en cuanto los puntos están en R³ hay
 * que arrastrar esa normal a todas partes. En el plano del perfil la pregunta
 * tiene una respuesta con signo —el área— y ahí se acaba la discusión.
 *
 * CONVENIO. El contorno exterior va ANTIHORARIO (área positiva) y los agujeros
 * HORARIOS (área negativa). Así el área del perfil es la suma directa de las
 * áreas con signo, sin ningún valor absoluto de por medio: un agujero mal
 * orientado hace que el área SUBA en vez de bajar, y eso se detecta.
 */
import { frameToWorld, type SurfaceFrame } from "./surfaces";
import type { Vec3 } from "./vec3";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Profile {
  /** Contorno exterior, antihorario. */
  outer: Vec2[];
  /** Agujeros, horarios. Nunca `undefined` tras `normalizeProfile`. */
  inners: Vec2[][];
}

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

/** Área con signo por la fórmula del zapato. Positiva ⇒ antihorario. */
export function polygonSignedArea(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

export function polygonIsCounterClockwise(points: readonly Vec2[]): boolean {
  return polygonSignedArea(points) > 0;
}

/** Perímetro del lazo cerrado. */
export function polygonPerimeter(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    total += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return total;
}

/**
 * Pone el perfil en el convenio: exterior antihorario, agujeros horarios.
 *
 * También elimina los puntos repetidos consecutivos. Un perfil que llega de un
 * CAD 2D casi siempre trae el primer punto duplicado al final, y ese duplicado
 * produce una arista degenerada que el constructor de cuerpos rechaza — con un
 * mensaje correcto pero desconcertante para quien sólo dibujó un rectángulo.
 */
export function normalizeProfile(profile: { outer: readonly Vec2[]; inners?: readonly (readonly Vec2[])[] }, tolerance = 1e-9): Profile {
  const clean = (points: readonly Vec2[]): Vec2[] => {
    const out: Vec2[] = [];
    for (const point of points) {
      const last = out[out.length - 1];
      if (last && Math.hypot(last.x - point.x, last.y - point.y) <= tolerance) continue;
      out.push({ x: point.x, y: point.y });
    }
    while (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= tolerance) {
      out.pop();
    }
    return out;
  };
  const outer = clean(profile.outer);
  if (outer.length < 3) throw new Error(`Un perfil necesita al menos 3 puntos distintos, llegaron ${outer.length}.`);
  if (!polygonIsCounterClockwise(outer)) outer.reverse();
  const inners = (profile.inners ?? [])
    .map(clean)
    .filter((hole) => hole.length >= 3)
    .map((hole) => (polygonIsCounterClockwise(hole) ? [...hole].reverse() : hole));
  return { outer, inners };
}

/** Área del perfil con los agujeros ya restados. */
export function profileArea(profile: Profile): number {
  return profile.inners.reduce((area, hole) => area + polygonSignedArea(hole), polygonSignedArea(profile.outer));
}

/** Lleva el perfil al mundo a través de un marco. */
export function profileToWorld(profile: Profile, frame: SurfaceFrame, z = 0): { outer: Vec3[]; inners: Vec3[][] } {
  const map = (points: readonly Vec2[]): Vec3[] => points.map((point) => frameToWorld(frame, point.x, point.y, z));
  return { outer: map(profile.outer), inners: profile.inners.map(map) };
}

/**
 * ¿Está el punto dentro del polígono? Cruce de rayo con desempate estable.
 *
 * La comparación `(a.y > y) !== (b.y > y)` cuenta cada arista exactamente una
 * vez aunque el rayo pase justo por un vértice, que es donde las
 * implementaciones ingenuas cuentan dos veces y dan "fuera" para un punto que
 * está claramente dentro.
 */
export function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** ¿Está dentro del perfil, es decir, dentro del contorno y fuera de todo agujero? */
export function pointInProfile(point: Vec2, profile: Profile): boolean {
  if (!pointInPolygon(point, profile.outer)) return false;
  return !profile.inners.some((hole) => pointInPolygon(point, hole));
}

/**
 * Desplazamiento de un polígono con uniones a inglete (miter).
 *
 * `distance` positiva ENSANCHA un contorno antihorario. Cada vértice se mueve a
 * lo largo de la bisectriz, con longitud `d / cos(θ/2)`, de modo que cada arista
 * queda exactamente a distancia `d` de la original — que es lo que hace que las
 * caras laterales de una extrusión con desmoldeo sigan siendo PLANAS.
 *
 * LÍMITE DE INGLETE. En un pico muy agudo la bisectriz se dispara al infinito.
 * Se recorta a `miterLimit · |d|`, lo que despunta la esquina. Es una
 * aproximación, y por eso está el `miterLimit` a la vista en la firma en vez de
 * escondido dentro.
 *
 * LO QUE ESTA FUNCIÓN NO HACE: resolver auto-intersecciones. Desplazar hacia
 * dentro más de lo que mide la pieza produce un polígono que se cruza consigo
 * mismo. En vez de devolver basura, se comprueba que el signo del área se
 * conserva y se lanza si no. Un desmoldeo que colapsa el perfil es un error del
 * modelo, no algo que el kernel deba maquillar.
 */
export function offsetPolygon(points: readonly Vec2[], distance: number, miterLimit = 8): Vec2[] {
  if (distance === 0) return points.map((point) => ({ ...point }));
  const count = points.length;
  const out: Vec2[] = [];
  for (let i = 0; i < count; i += 1) {
    const previous = points[(i - 1 + count) % count];
    const current = points[i];
    const next = points[(i + 1) % count];
    const inDirection = normalize2(current.x - previous.x, current.y - previous.y);
    const outDirection = normalize2(next.x - current.x, next.y - current.y);
    // Normal exterior de un contorno antihorario: girar la dirección −90°.
    const normalIn = { x: inDirection.y, y: -inDirection.x };
    const normalOut = { x: outDirection.y, y: -outDirection.x };
    let bisector = { x: normalIn.x + normalOut.x, y: normalIn.y + normalOut.y };
    const length = Math.hypot(bisector.x, bisector.y);
    if (length < 1e-12) {
      // Inversión de 180°: no hay bisectriz; se usa la normal de entrada.
      bisector = normalIn;
    } else {
      bisector = { x: bisector.x / length, y: bisector.y / length };
    }
    const cos = bisector.x * normalOut.x + bisector.y * normalOut.y;
    const scale = Math.min(Math.abs(distance) / Math.max(cos, 1e-6), miterLimit * Math.abs(distance));
    const signed = distance >= 0 ? scale : -scale;
    out.push({ x: current.x + bisector.x * signed, y: current.y + bisector.y * signed });
  }
  // COMPROBACIÓN DE COLAPSO. Mirar sólo el signo del área NO basta, y el
  // contraejemplo es el más simple posible: un cuadrado de lado 4 encogido 5
  // vuelve del revés con sus cuatro esquinas a la vez y sale otra vez
  // antihorario, con área +36. Lo que sí delata el colapso es que alguna arista
  // ha INVERTIDO su dirección: si (B'−A')·(B−A) ≤ 0, ese lado se ha cruzado.
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    const original = { x: points[j].x - points[i].x, y: points[j].y - points[i].y };
    const offset = { x: out[j].x - out[i].x, y: out[j].y - out[i].y };
    if (original.x * offset.x + original.y * offset.y <= 0) {
      throw new Error(
        `El desplazamiento de ${distance} colapsa el perfil: la arista ${i}→${j} invierte su dirección. El ángulo de desmoldeo es demasiado grande para esta altura.`,
      );
    }
  }
  if (Math.sign(polygonSignedArea(points)) !== Math.sign(polygonSignedArea(out))) {
    throw new Error(`El desplazamiento de ${distance} invierte la orientación del perfil.`);
  }
  return out;
}

function normalize2(x: number, y: number): Vec2 {
  const length = Math.hypot(x, y);
  if (length === 0) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

/**
 * Desplaza el perfil ENTERO como material: `distance > 0` añade material.
 *
 * Consecuencia que confunde a quien la ve por primera vez: los agujeros se hacen
 * MÁS PEQUEÑOS. Es lo correcto — si la pieza engorda, el material invade el
 * agujero. El mismo signo aplicado a un lazo horario ya produce ese efecto, así
 * que no hace falta ninguna corrección: el convenio de orientación se encarga.
 */
export function offsetProfile(profile: Profile, distance: number, miterLimit = 8): Profile {
  return {
    outer: offsetPolygon(profile.outer, distance, miterLimit),
    inners: profile.inners.map((hole) => offsetPolygon(hole, distance, miterLimit)),
  };
}

/** Polígono regular de `sides` lados inscrito en un círculo de radio `radius`. */
export function regularPolygon(sides: number, radius: number, startAngle = 0): Vec2[] {
  if (sides < 3) throw new Error(`Un polígono necesita al menos 3 lados, llegaron ${sides}.`);
  return Array.from({ length: sides }, (_, i) => {
    const angle = startAngle + (2 * Math.PI * i) / sides;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}

/** Rectángulo antihorario. */
export function rectangle(width: number, height: number, centre: Vec2 = { x: 0, y: 0 }): Vec2[] {
  const hw = width / 2;
  const hh = height / 2;
  return [
    { x: centre.x - hw, y: centre.y - hh },
    { x: centre.x + hw, y: centre.y - hh },
    { x: centre.x + hw, y: centre.y + hh },
    { x: centre.x - hw, y: centre.y + hh },
  ];
}

/**
 * Círculo APROXIMADO por un polígono, con el radio corregido para que el área
 * coincida con la del círculo real.
 *
 * Un polígono inscrito de N lados encierra `cos²(π/N)` veces menos área que su
 * círculo; con 32 lados eso es un 0,5 % menos, que en un volumen se nota. Al
 * escalar el radio por `1/cos(π/N)`… en realidad la corrección exacta de ÁREA es
 * `√(θ / sin θ)` con `θ = 2π/N`, y es la que se aplica. Quien quiera el polígono
 * inscrito literal pasa `matchArea: false`.
 */
export function circleProfile(radius: number, segments = 64, matchArea = true): Vec2[] {
  if (segments < 3) throw new Error(`Un círculo aproximado necesita al menos 3 segmentos.`);
  const theta = (2 * Math.PI) / segments;
  const effective = matchArea ? radius * Math.sqrt(theta / Math.sin(theta)) : radius;
  return regularPolygon(segments, effective);
}
