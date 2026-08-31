/**
 * Cómo se nombra UNA CARA de un sólido para que siga siendo la misma mañana.
 *
 * ## El defecto que ya existe, y que este módulo viene a cerrar
 *
 * `BrepBody` no tiene identificadores: caras, aristas y medias-aristas son
 * arrays, y todo son índices —`topology.ts` lo declara en su cabecera («ÍNDICES,
 * NO PUNTEROS»), y hace bien, porque un B-rep con punteros no se serializa—.
 *
 * El problema es que esos índices YA se están persistiendo. Los nodos `fillet` y
 * `chamfer` del esquema 5 guardan `edges: number[]`
 * (`cad-entities-v5.ts:154` y `:161`): índices crudos en el cuerpo del operando.
 * Basta con que alguien edite el operando —cambie la altura de la extrusión de
 * debajo— para que esos números apunten a OTRA arista. No falla: redondea la
 * arista equivocada, en silencio. Es el fallo más caro que puede tener un
 * modelador, porque el usuario no se entera hasta que mide la pieza.
 *
 * El modelado directo multiplica ese riesgo por cien: cada empujón nombra una
 * cara, y esa cara tiene que seguir siendo la misma tras cualquier edición
 * anterior en el árbol.
 *
 * ## La decisión: huella geométrica, índice como vía rápida, tres respuestas
 *
 * Una `CadSolidFaceRef` lleva el índice —porque el 99 % de las veces es correcto
 * y comprobarlo cuesta O(1)— y además una HUELLA de lo que esa cara es
 * geométricamente: su plano, su centroide, su área y la forma de sus lazos. El
 * índice nunca se cree sin comprobar la huella.
 *
 * Resolver devuelve **tres cosas distintas, nunca dos**:
 *
 *  1. Casa por índice. El caso normal, O(1).
 *  2. El índice falla pero **exactamente una** cara del cuerpo casa: se usa, se
 *     marca `healed` y quien llama reescribe el índice. La referencia se cura
 *     sola y deja constancia.
 *  3. Cero candidatas, o DOS O MÁS: **se falla con motivo**. No se elige la
 *     primera. Una cara ambigua es exactamente el momento en que el silencio
 *     cuesta una pieza mal fabricada.
 *
 * El TIPO persistido vive en `cad-entities-v5.ts`, con el resto del esquema:
 * viaja en el documento del cliente y lo valida el servidor, así que su sitio
 * es el módulo del esquema y no éste. Aquí vive el ALGORITMO que lo resuelve.
 *
 * Esto NO es nombrado topológico general —ése es un problema de investigación
 * abierto y nadie lo resuelve del todo—. Es una huella exacta para las
 * operaciones que este producto hace, que **degrada a un error explícito** en
 * cuanto deja de bastar. Es la diferencia entre un sistema que se sabe sus
 * límites y uno que adivina.
 *
 * ## Por qué la huella va CUANTIZADA
 *
 * Dos evaluaciones del mismo árbol no producen bit a bit los mismos flotantes:
 * pasan por intersecciones y sumas de miles de términos. Comparar por igualdad
 * exacta haría que una cara dejara de reconocerse a sí misma. Todo se cuantiza
 * al mismo `BREP_TOLERANCE.linear` que usa el kernel, y en las direcciones
 * además se fija el signo canónico para que la misma normal no se escriba de dos
 * maneras.
 */
import {
  BREP_TOLERANCE,
  aabbDiagonal,
  bodyBounds,
  faceCentroid,
  faceGeometricNormal,
  faceHalfEdges,
  faceInnerLoops,
  faceOuterLoop,
  loopHalfEdges,
  planarFaceArea,
  v3Dot,
  v3Length,
  v3Scale,
  type BrepBody,
  type Vec3,
} from "../../brep";
import type { CadSolidFaceRef } from "../cad-entities-v5";

export type { CadSolidFaceRef };

export type CadFaceRefResolution =
  | { ok: true; face: number; healed: boolean }
  | { ok: false; reason: string; candidates: number[] };

/** Cuantiza a un múltiplo del paso. Elimina la deriva entre dos evaluaciones. */
function quantize(value: number, step: number): number {
  if (!Number.isFinite(value)) return value;
  const snapped = Math.round(value / step) * step;
  // `+ 0` normaliza el −0, que no es igual a 0 bajo `Object.is` y rompería
  // cualquier comparación de huellas escrita con cuidado.
  return snapped + 0;
}

/**
 * Signo canónico de una dirección.
 *
 * `n` y `−n` describen el mismo plano pero son huellas distintas. Se fija el
 * signo por la primera componente no nula, de modo que la misma cara escriba
 * siempre la misma normal — y la distancia al origen se voltea con ella para
 * que el plano siga siendo el mismo.
 */
function canonicalDirection(v: Vec3): { dir: Vec3; flipped: boolean } {
  const eps = 1e-12;
  const components: Array<keyof Vec3> = ["x", "y", "z"];
  for (const axis of components) {
    const value = v[axis];
    if (Math.abs(value) > eps) {
      if (value < 0)
        return { dir: { x: -v.x, y: -v.y, z: -v.z }, flipped: true };
      return { dir: v, flipped: false };
    }
  }
  return { dir: v, flipped: false };
}

/** Paso de cuantización lineal, relativo al tamaño del cuerpo. */
function linearStep(body: BrepBody): number {
  const diagonal = aabbDiagonal(bodyBounds(body));
  const scale = diagonal > 1e-12 ? diagonal : 1;
  // La tolerancia del kernel es absoluta; a escala UTM eso es más apretado que
  // la propia representación. Se toma la MÁS FLOJA de las dos.
  return Math.max(BREP_TOLERANCE.linear, scale * 1e-9);
}

/** La huella de la cara `face` del cuerpo `body`. */
export function cadFaceRefFromBody(
  body: BrepBody,
  face: number,
): CadSolidFaceRef {
  if (face < 0 || face >= body.faces.length)
    throw new Error(
      `El cuerpo no tiene la cara ${face}: tiene ${body.faces.length} cara(s), numeradas desde 0.`,
    );

  const step = linearStep(body);
  const rawNormal = faceGeometricNormal(body, face);
  const length = v3Length(rawNormal);
  const unit = length > 1e-12 ? v3Scale(rawNormal, 1 / length) : rawNormal;
  const { dir } = canonicalDirection(unit);

  const centroid = faceCentroid(body, face);
  const outer = faceOuterLoop(body, face);

  return {
    index: face,
    plane: {
      nx: quantize(dir.x, BREP_TOLERANCE.angular),
      ny: quantize(dir.y, BREP_TOLERANCE.angular),
      nz: quantize(dir.z, BREP_TOLERANCE.angular),
      d: quantize(v3Dot(dir, centroid), step),
    },
    centroid: {
      x: quantize(centroid.x, step),
      y: quantize(centroid.y, step),
      z: quantize(centroid.z, step),
    },
    loopSize: loopHalfEdges(body, outer).length,
    innerLoops: faceInnerLoops(body, face).length,
    area: quantize(Math.abs(planarFaceArea(body, face)), step * step),
  };
}

/** ¿La cara `face` del cuerpo casa con esta huella? */
export function cadFaceMatchesRef(
  body: BrepBody,
  face: number,
  ref: CadSolidFaceRef,
): boolean {
  if (face < 0 || face >= body.faces.length) return false;
  const actual = cadFaceRefFromBody(body, face);
  const step = linearStep(body);
  const angularStep = BREP_TOLERANCE.angular * 4;

  if (actual.loopSize !== ref.loopSize) return false;
  if (actual.innerLoops !== ref.innerLoops) return false;
  if (Math.abs(actual.plane.nx - ref.plane.nx) > angularStep) return false;
  if (Math.abs(actual.plane.ny - ref.plane.ny) > angularStep) return false;
  if (Math.abs(actual.plane.nz - ref.plane.nz) > angularStep) return false;
  if (Math.abs(actual.plane.d - ref.plane.d) > step * 4) return false;
  if (Math.abs(actual.centroid.x - ref.centroid.x) > step * 4) return false;
  if (Math.abs(actual.centroid.y - ref.centroid.y) > step * 4) return false;
  if (Math.abs(actual.centroid.z - ref.centroid.z) > step * 4) return false;

  // El área se compara RELATIVA: su cuantización es cuadrática y a escala
  // grande el paso absoluto deja de significar nada.
  const areaScale = Math.max(Math.abs(actual.area), Math.abs(ref.area), 1);
  if (Math.abs(actual.area - ref.area) / areaScale > 1e-6) return false;

  return true;
}

/**
 * Resuelve la referencia contra un cuerpo. Tres respuestas, nunca dos.
 *
 * Quien recibe `healed: true` DEBE reescribir el índice del nodo con la cara
 * devuelta: si no lo hace, la próxima resolución vuelve a pagar el barrido
 * completo y la curación no sirve de nada.
 */
export function cadResolveFaceRef(
  body: BrepBody,
  ref: CadSolidFaceRef,
): CadFaceRefResolution {
  if (body.faces.length === 0)
    return {
      ok: false,
      reason: "El cuerpo no tiene ninguna cara.",
      candidates: [],
    };

  // 1 · Vía rápida.
  if (cadFaceMatchesRef(body, ref.index, ref))
    return { ok: true, face: ref.index, healed: false };

  // 2 · Barrido: ¿casa exactamente una?
  const candidates: number[] = [];
  for (let face = 0; face < body.faces.length; face += 1) {
    if (face === ref.index) continue;
    if (cadFaceMatchesRef(body, face, ref)) candidates.push(face);
  }

  if (candidates.length === 1)
    return { ok: true, face: candidates[0], healed: true };

  if (candidates.length === 0)
    return {
      ok: false,
      reason:
        `La cara a la que apunta esta operación ya no existe en el sólido: ninguna de las ` +
        `${body.faces.length} caras casa con su plano, su centroide y su contorno. ` +
        `Una edición anterior del árbol la consumió.`,
      candidates: [],
    };

  return {
    ok: false,
    reason:
      `La cara a la que apunta esta operación es AMBIGUA: ${candidates.length} caras del sólido ` +
      `casan con la misma huella (${candidates.map((c) => c + 1).join(", ")}). Elegir una en ` +
      `silencio redondearía o empujaría la equivocada, así que no se elige.`,
    candidates,
  };
}

/**
 * Cuántas medias-aristas tiene la cara, contando TODOS sus lazos.
 *
 * Vive aquí y no en la huella porque el lazo exterior basta para desempatar y
 * este número cambia cuando aparece un agujero, que ya cubre `innerLoops`.
 */
export function cadFaceHalfEdgeCount(body: BrepBody, face: number): number {
  return faceHalfEdges(body, face).length;
}
