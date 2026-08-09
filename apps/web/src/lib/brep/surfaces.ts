/**
 * Superficies portadoras del kernel B-rep (Fase 2).
 *
 * Una cara del B-rep es un TROZO de superficie recortado por lazos. La
 * superficie es infinita (o periódica) y no sabe nada de la topología; los
 * lazos son quienes deciden qué parte de ella existe. Separar las dos cosas es
 * lo que permite que la intersección de dos caras se calcule como intersección
 * de superficies —un problema de geometría— y luego se recorte —un problema de
 * topología—.
 *
 * Las cinco analíticas (plano, cilindro, cono, esfera, toro) van PRIMERO y con
 * fórmula cerrada a propósito: dan resultados exactos contra los que contrastar
 * la NURBS, que sólo tiene métodos numéricos. Cuando una proyección NURBS falla,
 * la primera pregunta útil es "¿y la misma geometría como cilindro analítico
 * qué da?"; si no hubiera analíticas no habría con qué comparar.
 *
 * PARAMETRIZACIONES (todas en el marco local `frame`, ortonormal y diestro):
 *
 *   plano     P(u,v) = O + u·X + v·Y
 *   cilindro  P(u,v) = O + r·(cos u·X + sin u·Y) + v·Z
 *   cono      P(u,v) = O + (r₀ + v·tanα)·(cos u·X + sin u·Y) + v·Z
 *   esfera    P(u,v) = O + r·(cos v cos u·X + cos v sin u·Y + sin v·Z)
 *   toro      P(u,v) = O + (R + r cos v)·(cos u·X + sin u·Y) + r sin v·Z
 *
 * La normal SIEMPRE es `∂P/∂u × ∂P/∂v` normalizada, sin excepciones ni signos
 * ad hoc. Para las cerradas eso da la normal SALIENTE con radios positivos, y
 * el sentido de la cara respecto del sólido lo lleva la topología en su campo
 * `reversed` — no la superficie. Mezclar ambas cosas es cómo se acaba con
 * mallas cuya mitad de caras mira hacia dentro.
 */
import {
  nurbsSurfaceDerivatives,
  nurbsSurfacePoint,
  type NurbsSurface,
} from "./nurbs";
import { resolveTolerance, type BrepTolerance } from "./tolerance";
import {
  v3Add,
  v3AddScaled,
  v3Basis,
  v3Cross,
  v3Dot,
  v3Length,
  v3Normalize,
  v3Scale,
  v3Sub,
  type Vec3,
} from "./vec3";
import { polyRealRoots, quadraticRoots } from "./poly";

/** Marco ortonormal diestro. `zAxis` es la normal de referencia de la superficie. */
export interface SurfaceFrame {
  origin: Vec3;
  xAxis: Vec3;
  yAxis: Vec3;
  zAxis: Vec3;
}

export interface PlaneSurface {
  kind: "plane";
  frame: SurfaceFrame;
}

export interface CylinderSurface {
  kind: "cylinder";
  frame: SurfaceFrame;
  radius: number;
}

export interface ConeSurface {
  kind: "cone";
  frame: SurfaceFrame;
  /** Radio en `v = 0`. El ápice está en `v = -radius / tanα`. */
  radius: number;
  /** Semiángulo de apertura. Positivo ⇒ el cono se ABRE al crecer `v`. */
  halfAngleRad: number;
}

export interface SphereSurface {
  kind: "sphere";
  frame: SurfaceFrame;
  radius: number;
}

export interface TorusSurface {
  kind: "torus";
  frame: SurfaceFrame;
  /** Radio del eje del tubo. */
  majorRadius: number;
  /** Radio del tubo. */
  minorRadius: number;
}

export type BrepSurface =
  | PlaneSurface
  | CylinderSurface
  | ConeSurface
  | SphereSurface
  | TorusSurface
  | NurbsSurface;

export interface SurfaceDerivatives {
  point: Vec3;
  du: Vec3;
  dv: Vec3;
  duu: Vec3;
  duv: Vec3;
  dvv: Vec3;
}

export interface SurfaceProjection {
  u: number;
  v: number;
  point: Vec3;
  distance: number;
  /** `false` cuando el método numérico agotó iteraciones sin converger. */
  converged: boolean;
}

export interface SurfaceLineHit {
  /** Parámetro sobre la recta: `origin + t · direction`. */
  t: number;
  u: number;
  v: number;
  point: Vec3;
}

/**
 * Marco a partir de un origen y un eje Z, eligiendo X de forma determinista.
 * `xHint` permite fijar la referencia angular (importa para que `u = 0` caiga
 * donde el llamante espera); si es paralelo a Z se ignora.
 */
export function makeFrame(origin: Vec3, zAxis: Vec3, xHint?: Vec3): SurfaceFrame {
  const z = v3Normalize(zAxis);
  if (xHint) {
    const projected = v3Sub(xHint, v3Scale(z, v3Dot(xHint, z)));
    if (v3Length(projected) > 1e-12) {
      const x = v3Normalize(projected);
      return { origin, xAxis: x, yAxis: v3Cross(z, x), zAxis: z };
    }
  }
  const basis = v3Basis(z);
  return { origin, xAxis: basis.u, yAxis: basis.v, zAxis: basis.w };
}

/** Punto del marco a partir de coordenadas locales. */
export function frameToWorld(frame: SurfaceFrame, x: number, y: number, z: number): Vec3 {
  let point = frame.origin;
  point = v3AddScaled(point, frame.xAxis, x);
  point = v3AddScaled(point, frame.yAxis, y);
  point = v3AddScaled(point, frame.zAxis, z);
  return point;
}

/** Coordenadas locales de un punto del mundo. */
export function worldToFrame(frame: SurfaceFrame, point: Vec3): Vec3 {
  const d = v3Sub(point, frame.origin);
  return { x: v3Dot(d, frame.xAxis), y: v3Dot(d, frame.yAxis), z: v3Dot(d, frame.zAxis) };
}

/** Dirección del mundo expresada en el marco (sin trasladar). */
export function worldVectorToFrame(frame: SurfaceFrame, vector: Vec3): Vec3 {
  return {
    x: v3Dot(vector, frame.xAxis),
    y: v3Dot(vector, frame.yAxis),
    z: v3Dot(vector, frame.zAxis),
  };
}

export function surfacePoint(surface: BrepSurface, u: number, v: number): Vec3 {
  switch (surface.kind) {
    case "plane":
      return frameToWorld(surface.frame, u, v, 0);
    case "cylinder":
      return frameToWorld(surface.frame, surface.radius * Math.cos(u), surface.radius * Math.sin(u), v);
    case "cone": {
      const radius = coneRadiusAt(surface, v);
      return frameToWorld(surface.frame, radius * Math.cos(u), radius * Math.sin(u), v);
    }
    case "sphere": {
      const r = surface.radius;
      return frameToWorld(
        surface.frame,
        r * Math.cos(v) * Math.cos(u),
        r * Math.cos(v) * Math.sin(u),
        r * Math.sin(v),
      );
    }
    case "torus": {
      const ring = surface.majorRadius + surface.minorRadius * Math.cos(v);
      return frameToWorld(
        surface.frame,
        ring * Math.cos(u),
        ring * Math.sin(u),
        surface.minorRadius * Math.sin(v),
      );
    }
    case "nurbs":
      return nurbsSurfacePoint(surface, u, v);
  }
}

/** Radio del cono a la altura `v`. Puede ser negativo pasado el ápice. */
export function coneRadiusAt(cone: ConeSurface, v: number): number {
  return cone.radius + v * Math.tan(cone.halfAngleRad);
}

/** Ápice del cono, o `null` si el semiángulo es cero (entonces es un cilindro). */
export function coneApex(cone: ConeSurface): Vec3 | null {
  const tan = Math.tan(cone.halfAngleRad);
  if (Math.abs(tan) < 1e-15) return null;
  return frameToWorld(cone.frame, 0, 0, -cone.radius / tan);
}

/**
 * Derivadas primera y segunda. Cerradas para las analíticas; para la NURBS se
 * delega en el algoritmo racional de Piegl A4.4.
 */
export function surfaceDerivatives(surface: BrepSurface, u: number, v: number): SurfaceDerivatives {
  if (surface.kind === "nurbs") {
    const skl = nurbsSurfaceDerivatives(surface, u, v, 2);
    return { point: skl[0][0], du: skl[1][0], dv: skl[0][1], duu: skl[2][0], duv: skl[1][1], dvv: skl[0][2] };
  }
  const frame = surface.frame;
  const zero: Vec3 = { x: 0, y: 0, z: 0 };
  switch (surface.kind) {
    case "plane":
      return {
        point: frameToWorld(frame, u, v, 0),
        du: frame.xAxis,
        dv: frame.yAxis,
        duu: zero,
        duv: zero,
        dvv: zero,
      };
    case "cylinder": {
      const cos = Math.cos(u);
      const sin = Math.sin(u);
      const r = surface.radius;
      const radial = frameDirection(frame, cos, sin, 0);
      const tangential = frameDirection(frame, -sin, cos, 0);
      return {
        point: frameToWorld(frame, r * cos, r * sin, v),
        du: v3Scale(tangential, r),
        dv: frame.zAxis,
        duu: v3Scale(radial, -r),
        duv: zero,
        dvv: zero,
      };
    }
    case "cone": {
      const cos = Math.cos(u);
      const sin = Math.sin(u);
      const tan = Math.tan(surface.halfAngleRad);
      const radius = coneRadiusAt(surface, v);
      const radial = frameDirection(frame, cos, sin, 0);
      const tangential = frameDirection(frame, -sin, cos, 0);
      return {
        point: frameToWorld(frame, radius * cos, radius * sin, v),
        du: v3Scale(tangential, radius),
        dv: v3Add(v3Scale(radial, tan), frame.zAxis),
        duu: v3Scale(radial, -radius),
        duv: v3Scale(tangential, tan),
        dvv: zero,
      };
    }
    case "sphere": {
      const r = surface.radius;
      const cu = Math.cos(u);
      const su = Math.sin(u);
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const point = frameToWorld(frame, r * cv * cu, r * cv * su, r * sv);
      const du = v3Scale(frameDirection(frame, -su, cu, 0), r * cv);
      const dv = v3Scale(frameDirection(frame, -sv * cu, -sv * su, cv), r);
      const duu = v3Scale(frameDirection(frame, cu, su, 0), -r * cv);
      const duv = v3Scale(frameDirection(frame, -su, cu, 0), -r * sv);
      const dvv = v3Scale(v3Sub(point, frame.origin), -1);
      return { point, du, dv, duu, duv, dvv };
    }
    case "torus": {
      const R = surface.majorRadius;
      const r = surface.minorRadius;
      const cu = Math.cos(u);
      const su = Math.sin(u);
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const ring = R + r * cv;
      const radial = frameDirection(frame, cu, su, 0);
      const tangential = frameDirection(frame, -su, cu, 0);
      return {
        point: frameToWorld(frame, ring * cu, ring * su, r * sv),
        du: v3Scale(tangential, ring),
        dv: v3Add(v3Scale(radial, -r * sv), v3Scale(frame.zAxis, r * cv)),
        duu: v3Scale(radial, -ring),
        duv: v3Scale(tangential, -r * sv),
        dvv: v3Add(v3Scale(radial, -r * cv), v3Scale(frame.zAxis, -r * sv)),
      };
    }
  }
}

function frameDirection(frame: SurfaceFrame, x: number, y: number, z: number): Vec3 {
  return {
    x: frame.xAxis.x * x + frame.yAxis.x * y + frame.zAxis.x * z,
    y: frame.xAxis.y * x + frame.yAxis.y * y + frame.zAxis.y * z,
    z: frame.xAxis.z * x + frame.yAxis.z * y + frame.zAxis.z * z,
  };
}

/**
 * Normal unitaria. En una singularidad paramétrica (polos de la esfera, ápice
 * del cono) `du × dv` es cero y no hay normal definida: se devuelve el vector
 * nulo en vez de inventarse una. Quien tesele debe saltar esos puntos.
 */
export function surfaceNormal(surface: BrepSurface, u: number, v: number): Vec3 {
  const d = surfaceDerivatives(surface, u, v);
  return v3Normalize(v3Cross(d.du, d.dv));
}

/** Proyección de punto a superficie. Cerrada para las analíticas. */
export function surfaceProject(
  surface: BrepSurface,
  point: Vec3,
  tolerance?: Partial<BrepTolerance>,
): SurfaceProjection {
  const tol = resolveTolerance(tolerance);
  if (surface.kind === "nurbs") return projectOnNurbs(surface, point, tol);
  const local = worldToFrame(surface.frame, point);
  switch (surface.kind) {
    case "plane":
      return finishProjection(surface, local.x, local.y, point);
    case "cylinder": {
      const u = Math.atan2(local.y, local.x);
      return finishProjection(surface, u, local.z, point);
    }
    case "cone": {
      const rho = Math.hypot(local.x, local.y);
      const u = rho <= tol.linear ? 0 : Math.atan2(local.y, local.x);
      const tan = Math.tan(surface.halfAngleRad);
      const cos2 = 1 / (1 + tan * tan);
      const v = (tan * (rho - surface.radius) + local.z) * cos2;
      return finishProjection(surface, u, v, point);
    }
    case "sphere": {
      const length = v3Length(local);
      if (length <= tol.linear) return finishProjection(surface, 0, 0, point);
      const u = Math.atan2(local.y, local.x);
      const v = Math.asin(Math.max(-1, Math.min(1, local.z / length)));
      return finishProjection(surface, u, v, point);
    }
    case "torus": {
      const rho = Math.hypot(local.x, local.y);
      const u = rho <= tol.linear ? 0 : Math.atan2(local.y, local.x);
      const v = Math.atan2(local.z, rho - surface.majorRadius);
      return finishProjection(surface, u, v, point);
    }
  }
}

function finishProjection(surface: BrepSurface, u: number, v: number, from: Vec3): SurfaceProjection {
  const projected = surfacePoint(surface, u, v);
  return { u, v, point: projected, distance: v3Length(v3Sub(projected, from)), converged: true };
}

/**
 * Proyección sobre NURBS: rejilla de arranque + Newton sobre las dos ecuaciones
 * de ortogonalidad `(S−P)·Sᵤ = 0`, `(S−P)·Sᵥ = 0`.
 *
 * La rejilla NO es un lujo. Newton desde un único punto medio converge al
 * mínimo LOCAL más cercano, y una superficie con curvatura tiene varios; sin
 * arranques múltiples la proyección devuelve un punto que está sobre la
 * superficie pero no es el más próximo, y la clasificación dentro/fuera que
 * depende de ella se equivoca en silencio.
 */
function projectOnNurbs(surface: NurbsSurface, point: Vec3, tol: BrepTolerance): SurfaceProjection {
  const uMin = surface.knotsU[surface.degreeU];
  const uMax = surface.knotsU[surface.countU];
  const vMin = surface.knotsV[surface.degreeV];
  const vMax = surface.knotsV[surface.countV];
  const samples = 8;
  let bestU = uMin;
  let bestV = vMin;
  let bestDistance = Infinity;
  for (let i = 0; i <= samples; i += 1) {
    const u = uMin + ((uMax - uMin) * i) / samples;
    for (let j = 0; j <= samples; j += 1) {
      const v = vMin + ((vMax - vMin) * j) / samples;
      const distance = v3Length(v3Sub(nurbsSurfacePoint(surface, u, v), point));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestU = u;
        bestV = v;
      }
    }
  }
  let u = bestU;
  let v = bestV;
  let converged = false;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const d = surfaceDerivatives(surface, u, v);
    const delta = v3Sub(d.point, point);
    const f = v3Dot(delta, d.du);
    const g = v3Dot(delta, d.dv);
    if (Math.abs(f) <= tol.linear && Math.abs(g) <= tol.linear) {
      converged = true;
      break;
    }
    const j11 = v3Dot(d.du, d.du) + v3Dot(delta, d.duu);
    const j12 = v3Dot(d.du, d.dv) + v3Dot(delta, d.duv);
    const j22 = v3Dot(d.dv, d.dv) + v3Dot(delta, d.dvv);
    const det = j11 * j22 - j12 * j12;
    if (Math.abs(det) < 1e-18) break;
    u = Math.min(uMax, Math.max(uMin, u - (f * j22 - g * j12) / det));
    v = Math.min(vMax, Math.max(vMin, v - (g * j11 - f * j12) / det));
  }
  const projected = nurbsSurfacePoint(surface, u, v);
  return { u, v, point: projected, distance: v3Length(v3Sub(projected, point)), converged };
}

/**
 * Intersección recta-superficie. La recta es `origin + t · direction`, con `t`
 * sin acotar: recortar el segmento es cosa de quien llama.
 *
 * Nota sobre el cono: la ecuación algebraica describe DOS mantos (el cono y su
 * reflejo respecto del ápice). Las soluciones con radio negativo pertenecen al
 * manto reflejado y se descartan. Omitir ese filtro es el error clásico que
 * hace aparecer intersecciones "detrás" del vértice.
 */
export function surfaceLineIntersect(
  surface: BrepSurface,
  origin: Vec3,
  direction: Vec3,
  tolerance?: Partial<BrepTolerance>,
): SurfaceLineHit[] {
  const tol = resolveTolerance(tolerance);
  if (surface.kind === "nurbs") return intersectNurbsLine(surface, origin, direction, tol);
  const frame = surface.frame;
  const a = worldToFrame(frame, origin);
  const b = worldVectorToFrame(frame, direction);
  const hits: number[] = [];
  switch (surface.kind) {
    case "plane": {
      if (Math.abs(b.z) <= 1e-15) break;
      hits.push(-a.z / b.z);
      break;
    }
    case "cylinder": {
      const qa = b.x * b.x + b.y * b.y;
      const qb = 2 * (a.x * b.x + a.y * b.y);
      const qc = a.x * a.x + a.y * a.y - surface.radius * surface.radius;
      hits.push(...quadraticRoots(qa, qb, qc));
      break;
    }
    case "cone": {
      const tan = Math.tan(surface.halfAngleRad);
      const qa = b.x * b.x + b.y * b.y - tan * tan * b.z * b.z;
      const qb = 2 * (a.x * b.x + a.y * b.y - tan * tan * a.z * b.z - surface.radius * tan * b.z);
      const qc =
        a.x * a.x + a.y * a.y - tan * tan * a.z * a.z - 2 * surface.radius * tan * a.z - surface.radius * surface.radius;
      for (const t of quadraticRoots(qa, qb, qc)) {
        if (coneRadiusAt(surface, a.z + t * b.z) < -tol.linear) continue;
        hits.push(t);
      }
      break;
    }
    case "sphere": {
      const qa = b.x * b.x + b.y * b.y + b.z * b.z;
      const qb = 2 * (a.x * b.x + a.y * b.y + a.z * b.z);
      const qc = a.x * a.x + a.y * a.y + a.z * a.z - surface.radius * surface.radius;
      hits.push(...quadraticRoots(qa, qb, qc));
      break;
    }
    case "torus": {
      const R = surface.majorRadius;
      const r = surface.minorRadius;
      const qa = b.x * b.x + b.y * b.y + b.z * b.z;
      const qb = 2 * (a.x * b.x + a.y * b.y + a.z * b.z);
      const qc = a.x * a.x + a.y * a.y + a.z * a.z;
      const k = R * R - r * r;
      const c4 = qa * qa;
      const c3 = 2 * qa * qb;
      const c2 = qb * qb + 2 * qa * (qc + k) - 4 * R * R * (qa - b.z * b.z);
      const c1 = 2 * qb * (qc + k) - 4 * R * R * (qb - 2 * a.z * b.z);
      const c0 = (qc + k) * (qc + k) - 4 * R * R * (qc - a.z * a.z);
      hits.push(...polyRealRoots([c4, c3, c2, c1, c0]));
      break;
    }
  }
  return hits
    .filter((t) => Number.isFinite(t))
    .sort((x, y) => x - y)
    .map((t) => {
      const point = v3AddScaled(origin, direction, t);
      const projection = surfaceProject(surface, point, tol);
      return { t, u: projection.u, v: projection.v, point };
    });
}

/**
 * Intersección recta-NURBS por muestreo + Newton de tres ecuaciones sobre
 * `(u, v, t)`. Es aproximada por construcción y así se documenta: una NURBS de
 * grado alto puede tener más cortes que muestras. `samples` sube la densidad
 * cuando el llamante sabe que su superficie es retorcida.
 */
function intersectNurbsLine(
  surface: NurbsSurface,
  origin: Vec3,
  direction: Vec3,
  tol: BrepTolerance,
  samples = 12,
): SurfaceLineHit[] {
  const uMin = surface.knotsU[surface.degreeU];
  const uMax = surface.knotsU[surface.countU];
  const vMin = surface.knotsV[surface.degreeV];
  const vMax = surface.knotsV[surface.countV];
  const unit = v3Normalize(direction);
  const found: SurfaceLineHit[] = [];
  for (let i = 0; i <= samples; i += 1) {
    for (let j = 0; j <= samples; j += 1) {
      let u = uMin + ((uMax - uMin) * i) / samples;
      let v = vMin + ((vMax - vMin) * j) / samples;
      let t = v3Dot(v3Sub(nurbsSurfacePoint(surface, u, v), origin), unit) / v3Length(direction);
      let ok = false;
      for (let iteration = 0; iteration < 48; iteration += 1) {
        const d = surfaceDerivatives(surface, u, v);
        const residual = v3Sub(d.point, v3AddScaled(origin, direction, t));
        if (v3Length(residual) <= tol.linear) {
          ok = true;
          break;
        }
        // Jacobiano 3×3 de columnas (Sᵤ, Sᵥ, −D).
        const solved = solve3x3(d.du, d.dv, v3Scale(direction, -1), v3Scale(residual, -1));
        if (!solved) break;
        u = Math.min(uMax, Math.max(uMin, u + solved.x));
        v = Math.min(vMax, Math.max(vMin, v + solved.y));
        t += solved.z;
      }
      if (!ok) continue;
      const point = v3AddScaled(origin, direction, t);
      if (found.some((hit) => Math.abs(hit.t - t) <= 1e-7)) continue;
      found.push({ t, u, v, point });
    }
  }
  return found.sort((x, y) => x.t - y.t);
}

/** Resuelve `[c0 c1 c2] · x = rhs` por Cramer. `null` si es singular. */
function solve3x3(c0: Vec3, c1: Vec3, c2: Vec3, rhs: Vec3): Vec3 | null {
  const det = v3Dot(c0, v3Cross(c1, c2));
  if (Math.abs(det) < 1e-18) return null;
  return {
    x: v3Dot(rhs, v3Cross(c1, c2)) / det,
    y: v3Dot(c0, v3Cross(rhs, c2)) / det,
    z: v3Dot(c0, v3Cross(c1, rhs)) / det,
  };
}

/** ¿La superficie se cierra sobre sí misma en `u`? Manda al teselado coser el borde. */
export function surfaceIsPeriodicU(surface: BrepSurface): boolean {
  return surface.kind === "cylinder" || surface.kind === "cone" || surface.kind === "sphere" || surface.kind === "torus";
}

/** ¿Y en `v`? Sólo el toro. */
export function surfaceIsPeriodicV(surface: BrepSurface): boolean {
  return surface.kind === "torus";
}

/** Plano por punto y normal, con referencia angular opcional. */
export function planeFromPointNormal(origin: Vec3, normal: Vec3, xHint?: Vec3): PlaneSurface {
  return { kind: "plane", frame: makeFrame(origin, normal, xHint) };
}

/** Distancia con signo de un punto al plano: positiva del lado de la normal. */
export function planeSignedDistance(plane: PlaneSurface, point: Vec3): number {
  return v3Dot(v3Sub(point, plane.frame.origin), plane.frame.zAxis);
}
