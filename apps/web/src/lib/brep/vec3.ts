/**
 * Álgebra vectorial 3D del kernel B-rep.
 *
 * El CAD 2D ya tiene su `CadVec2` y su afín 2×3 canónica (`lib/cad/transform2d.ts`);
 * nada de eso sirve aquí porque un sólido vive en R³. Este módulo es la base
 * sobre la que se apoya TODO `lib/brep/`: no importa nada del resto del kernel,
 * de modo que el grafo de dependencias del subsistema empieza en un DAG con una
 * sola raíz. Esa disciplina no es estética: `tsc --noEmit` no detecta ciclos de
 * importación y un adaptador que pida un VALOR de vuelta revienta al cargar.
 *
 * Convenio: los vectores se tratan como INMUTABLES. Ninguna función de este
 * archivo escribe sobre sus argumentos; todas devuelven objetos nuevos. Cuesta
 * asignaciones, y a cambio elimina de raíz la clase de bug más cara de un
 * kernel geométrico —el alias compartido que se muta a mitad de un algoritmo—.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Constructor corto. `vec3()` sin argumentos es el origen. */
export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export const V3_ZERO: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
export const V3_X: Vec3 = Object.freeze({ x: 1, y: 0, z: 0 });
export const V3_Y: Vec3 = Object.freeze({ x: 0, y: 1, z: 0 });
export const V3_Z: Vec3 = Object.freeze({ x: 0, y: 0, z: 1 });

export function v3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function v3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function v3Scale(a: Vec3, k: number): Vec3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

export function v3Negate(a: Vec3): Vec3 {
  return { x: -a.x, y: -a.y, z: -a.z };
}

/** `a + b·k`, el paso que más se repite en un evaluador de superficie. */
export function v3AddScaled(a: Vec3, b: Vec3, k: number): Vec3 {
  return { x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k };
}

export function v3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function v3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function v3LengthSq(a: Vec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function v3Length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function v3DistanceSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function v3Distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Normaliza. Un vector de longitud cero NO se normaliza en silencio a otra cosa:
 * devuelve el propio cero. Quien necesite saberlo debe comprobar la longitud
 * antes; devolver `(1,0,0)` "por si acaso" es cómo se cuelan normales inventadas
 * en una malla que luego nadie sabe de dónde salieron.
 */
export function v3Normalize(a: Vec3): Vec3 {
  const len = v3Length(a);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

export function v3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/** Producto mixto `a · (b × c)`: seis veces el volumen del tetraedro que forman. */
export function v3Triple(a: Vec3, b: Vec3, c: Vec3): number {
  return v3Dot(a, v3Cross(b, c));
}

export function v3Equals(a: Vec3, b: Vec3, tol = 1e-9): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.z - b.z) <= tol;
}

export function v3IsZero(a: Vec3, tol = 1e-9): boolean {
  return Math.abs(a.x) <= tol && Math.abs(a.y) <= tol && Math.abs(a.z) <= tol;
}

/** Componente de `a` perpendicular a `unit` (que debe venir normalizado). */
export function v3RejectFromUnit(a: Vec3, unit: Vec3): Vec3 {
  return v3AddScaled(a, unit, -v3Dot(a, unit));
}

/**
 * Base ortonormal a partir de una normal.
 *
 * El eje auxiliar se elige por la componente MÍNIMA de la normal, no por un
 * `if (n.z > 0.9)`: así el producto vectorial nunca degenera, tampoco en los
 * casos casi-paralelos que aparecen al barrer un perfil por un camino curvo.
 * Devuelve `{u, v, w}` diestro, con `w` = normal normalizada.
 */
export function v3Basis(normal: Vec3): { u: Vec3; v: Vec3; w: Vec3 } {
  const w = v3Normalize(normal);
  if (v3IsZero(w)) return { u: V3_X, v: V3_Y, w: V3_Z };
  const ax = Math.abs(w.x);
  const ay = Math.abs(w.y);
  const az = Math.abs(w.z);
  const helper: Vec3 = ax <= ay && ax <= az ? V3_X : ay <= az ? V3_Y : V3_Z;
  const u = v3Normalize(v3Cross(helper, w));
  const v = v3Cross(w, u);
  return { u, v, w };
}

/** Ángulo sin signo entre dos vectores, en radianes, estable cerca de 0 y π. */
export function v3Angle(a: Vec3, b: Vec3): number {
  const na = v3Normalize(a);
  const nb = v3Normalize(b);
  const cross = v3Length(v3Cross(na, nb));
  const dot = v3Dot(na, nb);
  return Math.atan2(cross, dot);
}

/**
 * Ángulo CON signo de `a` a `b` medido alrededor de `axis` (regla de la mano
 * derecha), en `(-π, π]`. Lo necesita la revolución parcial y la clasificación
 * angular de caras alrededor de una arista.
 */
export function v3SignedAngle(a: Vec3, b: Vec3, axis: Vec3): number {
  const n = v3Normalize(axis);
  const pa = v3Normalize(v3RejectFromUnit(a, n));
  const pb = v3Normalize(v3RejectFromUnit(b, n));
  const dot = Math.max(-1, Math.min(1, v3Dot(pa, pb)));
  const sign = v3Dot(v3Cross(pa, pb), n);
  const angle = Math.acos(dot);
  return sign < 0 ? -angle : angle;
}

/** Rotación de Rodrigues alrededor de un eje que pasa por el origen. */
export function v3RotateAroundAxis(point: Vec3, axis: Vec3, angleRad: number): Vec3 {
  const k = v3Normalize(axis);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dot = v3Dot(k, point);
  const cross = v3Cross(k, point);
  return {
    x: point.x * cos + cross.x * sin + k.x * dot * (1 - cos),
    y: point.y * cos + cross.y * sin + k.y * dot * (1 - cos),
    z: point.z * cos + cross.z * sin + k.z * dot * (1 - cos),
  };
}

/** Caja alineada a ejes. `min > max` en algún eje significa caja VACÍA. */
export interface Aabb3 {
  min: Vec3;
  max: Vec3;
}

export function aabbEmpty(): Aabb3 {
  return {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };
}

export function aabbIsEmpty(box: Aabb3): boolean {
  return box.min.x > box.max.x || box.min.y > box.max.y || box.min.z > box.max.z;
}

export function aabbExpand(box: Aabb3, point: Vec3): Aabb3 {
  return {
    min: {
      x: Math.min(box.min.x, point.x),
      y: Math.min(box.min.y, point.y),
      z: Math.min(box.min.z, point.z),
    },
    max: {
      x: Math.max(box.max.x, point.x),
      y: Math.max(box.max.y, point.y),
      z: Math.max(box.max.z, point.z),
    },
  };
}

export function aabbFromPoints(points: readonly Vec3[]): Aabb3 {
  let box = aabbEmpty();
  for (const point of points) box = aabbExpand(box, point);
  return box;
}

export function aabbUnion(a: Aabb3, b: Aabb3): Aabb3 {
  if (aabbIsEmpty(a)) return b;
  if (aabbIsEmpty(b)) return a;
  return aabbExpand(aabbExpand(a, b.min), b.max);
}

/** Diagonal de la caja; 0 si está vacía. Sirve de escala para tolerancias relativas. */
export function aabbDiagonal(box: Aabb3): number {
  if (aabbIsEmpty(box)) return 0;
  return v3Distance(box.min, box.max);
}

export function aabbCenter(box: Aabb3): Vec3 {
  if (aabbIsEmpty(box)) return { x: 0, y: 0, z: 0 };
  return v3Scale(v3Add(box.min, box.max), 0.5);
}

/** ¿Se solapan las cajas, con holgura `tol`? Prueba barata previa a cualquier intersección. */
export function aabbOverlaps(a: Aabb3, b: Aabb3, tol = 0): boolean {
  if (aabbIsEmpty(a) || aabbIsEmpty(b)) return false;
  return (
    a.min.x - tol <= b.max.x &&
    b.min.x - tol <= a.max.x &&
    a.min.y - tol <= b.max.y &&
    b.min.y - tol <= a.max.y &&
    a.min.z - tol <= b.max.z &&
    b.min.z - tol <= a.max.z
  );
}

export function aabbContainsPoint(box: Aabb3, point: Vec3, tol = 0): boolean {
  if (aabbIsEmpty(box)) return false;
  return (
    point.x >= box.min.x - tol &&
    point.x <= box.max.x + tol &&
    point.y >= box.min.y - tol &&
    point.y <= box.max.y + tol &&
    point.z >= box.min.z - tol &&
    point.z <= box.max.z + tol
  );
}
