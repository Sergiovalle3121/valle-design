/**
 * Sección plana de un sólido: los contornos cerrados donde un plano lo corta.
 *
 * Es lo que devuelve SECTION, y lo que hace de un sólido algo ACOTABLE: la huella
 * del corte es geometría 2D del dibujo, se puede sombrear, medir y publicar en
 * una lámina. Sin esto, un modelo 3D es una isla dentro del propio documento.
 *
 * ## Por qué no se resuelve con una booleana
 *
 * Intersecar el sólido con una losa muy fina daría un CUERPO delgado, no una
 * región: habría que decidir después cuál de sus dos caras es «la sección», y con
 * un espesor pequeño la respuesta depende de la tolerancia. Cortar cara a cara y
 * encadenar los segmentos da directamente el contorno, sin espesor que elegir.
 *
 * ## El algoritmo, y el detalle que lo hace correcto
 *
 * Para cada cara se clasifican sus vértices por el signo de su distancia al plano
 * y se recogen los puntos donde el contorno lo cruza. Esos puntos están TODOS
 * sobre la recta intersección del plano de la cara con el plano de corte, así que
 * se ordenan a lo largo de esa recta y se emparejan de dos en dos: el primer par
 * entra en la cara, el segundo vuelve a entrar, y así. Emparejarlos en el orden
 * en que aparecen alrededor del contorno —que es la tentación— produce segmentos
 * que salen de la cara en cuanto ésta es cóncava o tiene un agujero.
 *
 * Después los segmentos se encadenan por extremos coincidentes. Un sólido cerrado
 * cortado por un plano da siempre contornos CERRADOS; si alguno queda abierto, el
 * cuerpo no era estanco y eso es información, no un caso que tapar.
 */
import type { CadPoint3 } from "./cad-document";
import type { CadSolidPlane } from "./cad-entities-v5";
import { loopPoints, type BrepBody, type Vec3 } from "../brep";

interface Segment {
  from: Vec3;
  to: Vec3;
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

function normalized(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!(length > 0)) throw new Error("El plano de sección necesita una normal no nula.");
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

/**
 * Contornos de la sección, en coordenadas del mundo.
 *
 * `tolerance` es ABSOLUTA y se escala con el tamaño del cuerpo en la llamada; un
 * valor fijo funcionaría para una pieza de milímetros y clasificaría mal los
 * vértices de una nave de cien metros.
 */
export function sectionLoopsOfSolid(body: BrepBody, plane: CadSolidPlane): CadPoint3[][] {
  const normal = normalized(plane.normal as Vec3);
  const origin = plane.origin as Vec3;
  const scale = bodyScale(body);
  const tolerance = 1e-9 * Math.max(1, scale);
  const distance = (point: Vec3) => dot(sub(point, origin), normal);

  const segments: Segment[] = [];
  for (const face of body.faces) {
    const crossings: Vec3[] = [];
    for (const loop of face.loops) {
      const points = loopPoints(body, loop);
      for (let index = 0; index < points.length; index += 1) {
        const a = points[index];
        const b = points[(index + 1) % points.length];
        const da = distance(a);
        const db = distance(b);
        // Un vértice EXACTAMENTE sobre el plano se cuenta una vez, no dos: si se
        // añadiera desde sus dos aristas, el emparejamiento posterior vería un
        // número par de puntos duplicados y fabricaría un segmento de longitud
        // cero justo en la esquina.
        if (Math.abs(da) <= tolerance) {
          crossings.push(a);
          continue;
        }
        if (Math.abs(db) <= tolerance) continue;
        if (da * db < 0) {
          const t = da / (da - db);
          crossings.push({
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t,
          });
        }
      }
    }
    if (crossings.length < 2) continue;
    // Los cruces de una cara PLANA viven todos sobre una recta. Ordenarlos por su
    // proyección sobre esa recta y emparejarlos de dos en dos es lo que mantiene
    // los segmentos dentro de la cara aunque sea cóncava o tenga agujeros.
    const direction = lineDirection(crossings, tolerance);
    if (!direction) continue;
    const sorted = [...crossings].sort((a, b) => dot(a, direction) - dot(b, direction));
    const unique: Vec3[] = [];
    for (const point of sorted) {
      const previous = unique[unique.length - 1];
      if (previous && length3(sub(point, previous)) <= tolerance * 10) continue;
      unique.push(point);
    }
    for (let index = 0; index + 1 < unique.length; index += 2)
      segments.push({ from: unique[index], to: unique[index + 1] });
  }

  return chainSegments(segments, Math.max(tolerance * 1e3, 1e-9 * scale)).map((loop) =>
    loop.map((point) => ({ x: point.x, y: point.y, z: point.z })),
  );
}

const length3 = (vector: Vec3): number => Math.hypot(vector.x, vector.y, vector.z);

function bodyScale(body: BrepBody): number {
  let scale = 1;
  for (const vertex of body.vertices)
    scale = Math.max(scale, Math.abs(vertex.point.x), Math.abs(vertex.point.y), Math.abs(vertex.point.z));
  return scale;
}

/** Dirección de la recta que contiene los cruces, o `null` si son coincidentes. */
function lineDirection(points: readonly Vec3[], tolerance: number): Vec3 | null {
  const first = points[0];
  for (const point of points) {
    const delta = sub(point, first);
    if (length3(delta) > tolerance * 10) return normalized(delta);
  }
  return null;
}

/**
 * Encadena segmentos sueltos en contornos cerrados.
 *
 * Los contornos ABIERTOS se descartan y no se cierran a la fuerza: un contorno
 * abierto significa que el cuerpo tenía una rendija, y cerrarlo con una recta
 * inventada produciría una región con un lado que nadie dibujó.
 */
function chainSegments(segments: readonly Segment[], tolerance: number): Vec3[][] {
  const pending = segments.filter((segment) => length3(sub(segment.to, segment.from)) > tolerance);
  const used = new Array<boolean>(pending.length).fill(false);
  const loops: Vec3[][] = [];

  for (let start = 0; start < pending.length; start += 1) {
    if (used[start]) continue;
    used[start] = true;
    const loop: Vec3[] = [pending[start].from, pending[start].to];
    let extended = true;
    while (extended) {
      extended = false;
      const tail = loop[loop.length - 1];
      if (length3(sub(tail, loop[0])) <= tolerance) break;
      for (let index = 0; index < pending.length; index += 1) {
        if (used[index]) continue;
        const segment = pending[index];
        if (length3(sub(segment.from, tail)) <= tolerance) {
          used[index] = true;
          loop.push(segment.to);
          extended = true;
          break;
        }
        if (length3(sub(segment.to, tail)) <= tolerance) {
          used[index] = true;
          loop.push(segment.from);
          extended = true;
          break;
        }
      }
    }
    if (loop.length < 4) continue;
    if (length3(sub(loop[loop.length - 1], loop[0])) > tolerance) continue;
    loop.pop();
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
