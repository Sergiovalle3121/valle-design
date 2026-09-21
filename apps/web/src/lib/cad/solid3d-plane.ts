/**
 * Transforma un plano de coordenadas del mundo a coordenadas locales del sólido.
 *
 * `evaluateSolidTree` evalúa el árbol en local y coloca al final. Si el plano
 * de corte se escribe en coordenadas del mundo, el corte ocurre a la altura
 * equivocada cuando el sólido tiene colocación (tz, dz, tx, etc.).
 */
import type { CadSolidPlacement } from "./cad-entities-v5";
import { resolveSolidPlacement } from "./solid3d-build";

export function cadSolidWorldPlaneToLocal(
  plane: { origin: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } },
  placement?: CadSolidPlacement,
): { origin: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } } {
  const m = resolveSolidPlacement(placement);
  const isIdentity =
    m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 &&
    m.e === 0 && m.f === 0 && m.dz === 0 &&
    m.m02 === 0 && m.m12 === 0 && m.m20 === 0 && m.m21 === 0 && m.m22 === 1 &&
    m.tx === 0 && m.ty === 0 && m.tz === 0;
  if (isIdentity) return plane;
  const Tx = m.e + m.tx;
  const Ty = m.f + m.ty;
  const Tz = m.dz + m.tz;
  const ox = plane.origin.x - Tx;
  const oy = plane.origin.y - Ty;
  const oz = plane.origin.z - Tz;
  const det3 =
    m.a * (m.d * m.m22 - m.m12 * m.m21) -
    m.c * (m.b * m.m22 - m.m12 * m.m20) +
    m.m02 * (m.b * m.m21 - m.d * m.m20);
  if (Math.abs(det3) < 1e-12) return plane;
  const invDet = 1 / det3;
  const aj00 = (m.d * m.m22 - m.m12 * m.m21) * invDet;
  const aj01 = (m.m02 * m.m21 - m.c * m.m22) * invDet;
  const aj02 = (m.c * m.m12 - m.m02 * m.d) * invDet;
  const aj10 = (m.m12 * m.m20 - m.b * m.m22) * invDet;
  const aj11 = (m.a * m.m22 - m.m02 * m.m20) * invDet;
  const aj12 = (m.m02 * m.b - m.a * m.m12) * invDet;
  const aj20 = (m.b * m.m21 - m.d * m.m20) * invDet;
  const aj21 = (m.c * m.m20 - m.a * m.m21) * invDet;
  const aj22 = (m.a * m.d - m.c * m.b) * invDet;
  const localOrigin = {
    x: aj00 * ox + aj01 * oy + aj02 * oz,
    y: aj10 * ox + aj11 * oy + aj12 * oz,
    z: aj20 * ox + aj21 * oy + aj22 * oz,
  };
  const nx = plane.normal.x;
  const ny = plane.normal.y;
  const nz = plane.normal.z;
  const localNormalRaw = {
    x: aj00 * nx + aj01 * ny + aj02 * nz,
    y: aj10 * nx + aj11 * ny + aj12 * nz,
    z: aj20 * nx + aj21 * ny + aj22 * nz,
  };
  const nLen = Math.hypot(localNormalRaw.x, localNormalRaw.y, localNormalRaw.z) || 1;
  return {
    origin: localOrigin,
    normal: { x: localNormalRaw.x / nLen, y: localNormalRaw.y / nLen, z: localNormalRaw.z / nLen },
  };
}
