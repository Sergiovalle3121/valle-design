/**
 * Propiedades másicas por DOS caminos independientes.
 *
 * Éste es el chequeo que pedía el encargo, y el que de verdad caza los errores:
 * el volumen y el área se calculan integrando sobre las CARAS del sólido
 * (teorema de la divergencia sobre la topología cosida) y sumando sobre los
 * TRIÁNGULOS de la malla teselada. Los dos números tienen que coincidir. Si
 * divergen, o el teselado está mal o la topología miente — y como los dos
 * caminos no comparten ni una línea de código, el que esté mal es uno de los
 * dos, no los dos a la vez.
 *
 * En este kernel las caras son planas, así que la coincidencia debe ser
 * EXACTA, no aproximada: los dos caminos integran la misma superficie, sólo que
 * uno lo hace por caras y el otro por triángulos. Una divergencia de 1e-9 ya es
 * un síntoma. Contra el valor CERRADO (πr²h, 2π²Rr²) la coincidencia sí es
 * aproximada, porque el sólido facetado no es el sólido exacto, y ahí lo que se
 * comprueba es la convergencia al refinar.
 *
 * SIGNO. El volumen sale del producto mixto de cada triángulo con el origen, así
 * que un sólido con las normales del revés da volumen NEGATIVO en los dos
 * caminos. No se toma valor absoluto en ningún sitio: ese signo es información.
 */
import { meshTriangle, meshTriangleCount, tessellateBody, type BrepMesh } from "./tessellate";
import { planarBodyArea, planarBodyVolume, type BrepBody } from "./topology";
import { v3Cross, v3Length, v3Scale, v3Sub, v3Triple, type Vec3 } from "./vec3";

export interface MassProperties {
  volume: number;
  area: number;
  centroid: Vec3;
}

/**
 * Volumen con signo de una malla cerrada: `⅙ Σ a · (b × c)`.
 *
 * Cada triángulo aporta el volumen con signo del tetraedro que forma con el
 * ORIGEN. Los aportes de los tetraedros que sobran se cancelan exactamente
 * porque la superficie es cerrada, lo que hace que el resultado no dependa de
 * dónde esté el origen — propiedad que la spec comprueba trasladando el sólido.
 */
export function meshVolume(mesh: BrepMesh): number {
  let total = 0;
  const count = meshTriangleCount(mesh);
  for (let i = 0; i < count; i += 1) {
    const [a, b, c] = meshTriangle(mesh, i);
    total += v3Triple(a, b, c);
  }
  return total / 6;
}

/** Área de una malla: la suma de las áreas de sus triángulos. */
export function meshArea(mesh: BrepMesh): number {
  let total = 0;
  const count = meshTriangleCount(mesh);
  for (let i = 0; i < count; i += 1) {
    const [a, b, c] = meshTriangle(mesh, i);
    total += v3Length(v3Cross(v3Sub(b, a), v3Sub(c, a))) / 2;
  }
  return total;
}

/**
 * Centroide de una malla cerrada, ponderado por volumen.
 *
 * El centroide de un tetraedro está en la media de sus cuatro vértices, y con el
 * origen como cuarto vértice eso es `(a+b+c)/4`. Ponderando por el volumen con
 * signo de cada tetraedro, los aportes de fuera del sólido se cancelan igual que
 * en el volumen.
 */
export function meshCentroid(mesh: BrepMesh): Vec3 {
  let volume = 0;
  let accumulated: Vec3 = { x: 0, y: 0, z: 0 };
  const count = meshTriangleCount(mesh);
  for (let i = 0; i < count; i += 1) {
    const [a, b, c] = meshTriangle(mesh, i);
    const tetra = v3Triple(a, b, c) / 6;
    volume += tetra;
    const centre = v3Scale({ x: a.x + b.x + c.x, y: a.y + b.y + c.y, z: a.z + b.z + c.z }, 1 / 4);
    accumulated = {
      x: accumulated.x + centre.x * tetra,
      y: accumulated.y + centre.y * tetra,
      z: accumulated.z + centre.z * tetra,
    };
  }
  if (volume === 0) return { x: 0, y: 0, z: 0 };
  return v3Scale(accumulated, 1 / volume);
}

export interface MassPropertyComparison {
  /** Integrando sobre las caras del B-rep. */
  byFaces: { volume: number; area: number };
  /** Sumando sobre los triángulos de la malla. */
  byMesh: { volume: number; area: number; centroid: Vec3 };
  /** Diferencia relativa de volumen entre los dos caminos. */
  volumeDrift: number;
  /** Diferencia relativa de área entre los dos caminos. */
  areaDrift: number;
  triangles: number;
}

/**
 * Calcula las propiedades por los dos caminos y devuelve también su discrepancia.
 *
 * Devolver la discrepancia en vez de comprobarla aquí es deliberado: quien llama
 * sabe qué tolerancia le vale, y un kernel que decide por su cuenta que 1e-6
 * "está bien" esconde justo la información que se necesita para depurar.
 */
export function compareMassProperties(body: BrepBody): MassPropertyComparison {
  const mesh = tessellateBody(body);
  const byFaces = { volume: planarBodyVolume(body), area: planarBodyArea(body) };
  const byMesh = { volume: meshVolume(mesh), area: meshArea(mesh), centroid: meshCentroid(mesh) };
  const relative = (a: number, b: number) => (Math.abs(a) < 1e-12 ? Math.abs(a - b) : Math.abs(a - b) / Math.abs(a));
  return {
    byFaces,
    byMesh,
    volumeDrift: relative(byFaces.volume, byMesh.volume),
    areaDrift: relative(byFaces.area, byMesh.area),
    triangles: meshTriangleCount(mesh),
  };
}

/** Propiedades másicas de un cuerpo, por el camino de la malla. */
export function bodyMassProperties(body: BrepBody): MassProperties {
  const mesh = tessellateBody(body);
  return { volume: meshVolume(mesh), area: meshArea(mesh), centroid: meshCentroid(mesh) };
}
