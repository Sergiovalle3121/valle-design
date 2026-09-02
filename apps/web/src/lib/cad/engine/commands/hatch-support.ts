/**
 * Resolución de contornos para HATCH, GRADIENT y BOUNDARY.
 *
 * ## Contornos con curvas
 *
 * Un contorno real casi nunca es un polígono: es una recta, un arco, otra recta
 * y una spline. El motor de sombreado trabaja con polígonos, así que las curvas
 * hay que teselarlas — y ahí está la trampa.
 *
 * La teselación la hace `cadEntityBoundaryPaths`, que es EXACTAMENTE la misma
 * función que usa `regenerateAssociativeHatches` cuando la geometría se mueve.
 * Eso no es comodidad: es la condición para que la asociatividad signifique
 * algo. Si la orden teselara con una resolución derivada de la vista —más fina
 * al estar cerca, más basta al alejarse— el contorno creado y el regenerado
 * serían distintos, y el primer movimiento del arco cambiaría el relleno sin
 * que nadie hubiera tocado el patrón. Peor todavía: el mismo dibujo saldría
 * distinto según el zoom que tuviera quien lo hizo.
 *
 * La tolerancia de COSIDO —cuándo dos extremos de curva son «el mismo punto»—
 * sí se cambia desde la Ola D (2026-09-02): HPGAPTOL o la palabra `Tolerancia`
 * de la orden (`cadHatchGapTolerance`). El regenerador de sombreados
 * asociativos sigue cosiendo con la de fábrica, así que un contorno que sólo
 * cierra con tolerancia no se puede seguir: el HATCH que sale de él nace NO
 * asociativo, y la orden lo dice en su prompt. Guardar la tolerancia en cada
 * sombreado sería tocar el formato persistido, y eso es decisión del titular.
 *
 * Que la resolución dependa del DIBUJO (del radio del arco, no del zoom) es la
 * mejora pendiente, y hay que hacerla en `cadEntityBoundaryPaths` para que los
 * dos lados se muevan a la vez. Queda dicho aquí y en el PR.
 */
import type { CadPoint2 } from "../../cad-document";
import {
  cadBoundariesCross,
  cadBoundarySelfIntersects,
  cadBoundarySignedArea,
  cadPointInBoundary,
  resolveCadHatchRegionWithSources,
  stitchCadBoundaryPaths,
  type CadBoundaryPath,
} from "../../hatch-associativity";
import { CAD_ENTITY_REGISTRY, cadEntityBoundaryPaths } from "../../entity-runtime";
import { pointsBounds } from "../../entity-hit-geometry";
import type { CadCommandContext } from "../command-types";

export type CadIslandStyle = "normal" | "outer" | "ignore";

/** La tolerancia de cosido de fábrica de `stitchCadBoundaryPaths`. */
export const CAD_HATCH_STITCH_DEFAULT = 1e-4;

/**
 * La tolerancia de hueco EFECTIVA: la tecleada en la orden (`Tolerancia`), si
 * no la variable HPGAPTOL, y nunca menos que la de fábrica. Es el mismo número
 * que recibe `stitchCadBoundaryPaths`, y es lo que hace que el DWG con 34
 * líneas mal empatadas (huecos de un milímetro) se sombree con HPGAPTOL = 2.
 */
export function cadHatchGapTolerance(context: CadCommandContext, override?: number | null): number {
  const typed = override ?? Number(context.variables?.get("HPGAPTOL") ?? 0);
  return Number.isFinite(typed) && typed > CAD_HATCH_STITCH_DEFAULT ? typed : CAD_HATCH_STITCH_DEFAULT;
}

export interface CadHatchRegion {
  boundaries: CadPoint2[][];
  /** Entidades de las que salió el contorno. Son las `boundaryRefs` del HATCH. */
  sourceIds: string[];
}

/**
 * Caminos candidatos a formar contorno.
 *
 * Los HATCH se excluyen: sus «bordes» son el contorno que ya rellenan, y
 * dejarlos entrar haría que sombrear junto a un sombreado detectara la región de
 * aquél. Texto, cotas y directrices ya devuelven vacío por su cuenta.
 */
export function cadCandidateBoundaryPaths(
  context: CadCommandContext,
  entityIds?: readonly string[],
): CadBoundaryPath[] {
  const ids = entityIds ?? context.entityIds;
  const paths: CadBoundaryPath[] = [];
  for (const entityId of ids) {
    const entity = context.entity?.(entityId);
    if (!entity || entity.type === "hatch") continue;
    paths.push(...cadEntityBoundaryPaths(entity, CAD_ENTITY_REGISTRY));
  }
  return paths;
}

/**
 * Entidades cuyo contorno se CRUZA CONSIGO MISMO, para poder decirlo.
 *
 * Sin esto, un contorno autointersecante acababa en el mismo mensaje que un
 * perímetro abierto —«cierra el perímetro»— y ése es un consejo equivocado: el
 * perímetro está cerrado, lo que pasa es que se cruza. El dibujante se pone a
 * buscar un hueco que no existe. Con el nombre de la entidad delante, la
 * corrección es evidente.
 */
export function cadSelfIntersectingBoundarySources(
  context: CadCommandContext,
  entityIds?: readonly string[],
): string[] {
  const culpables = new Set<string>();
  for (const path of cadCandidateBoundaryPaths(context, entityIds))
    if (cadBoundarySelfIntersects(path.points)) culpables.add(path.sourceId);
  return [...culpables];
}

/** Región que contiene un punto interior. `null` si el punto no está encerrado. */
export function cadHatchRegionAtPoint(
  point: CadPoint2,
  context: CadCommandContext,
  islandStyle: CadIslandStyle,
  gapTolerance: number = cadHatchGapTolerance(context),
): CadHatchRegion | null {
  const built = stitchCadBoundaryPaths(cadCandidateBoundaryPaths(context), gapTolerance);
  if (built.loops.length === 0) return null;
  const resolved = resolveCadHatchRegionWithSources(built, point, islandStyle);
  return resolved.boundaries.length > 0 ? resolved : null;
}

/**
 * Un punto INTERIOR de un anillo, para poder resolver islas sobre una selección
 * de objetos.
 *
 * El centroide vale casi siempre y falla justo donde importa: un anillo en forma
 * de U o de L tiene el centroide FUERA. Cuando eso pasa se lanza un barrido
 * horizontal por la altura media y se coge el punto medio del primer tramo
 * interior, que en un polígono simple siempre existe.
 */
export function cadLoopInteriorPoint(
  loop: readonly CadPoint2[],
  avoid: readonly (readonly CadPoint2[])[] = [],
): CadPoint2 | null {
  if (loop.length < 3) return null;
  const usable = (point: CadPoint2) =>
    cadPointInBoundary(point, loop) && !avoid.some((other) => cadPointInBoundary(point, other));

  const centroid = loop.reduce(
    (sum, point) => ({ x: sum.x + point.x / loop.length, y: sum.y + point.y / loop.length }),
    { x: 0, y: 0 },
  );
  // El centroide vale casi siempre y falla en los dos casos que más aparecen: un
  // anillo en U o en L lo deja FUERA, y un cuadrado con una isla centrada lo deja
  // DENTRO DE LA ISLA — que es peor, porque entonces la región resuelta sería la
  // de la isla y el sombreado saldría al revés.
  if (usable(centroid)) return centroid;

  // Recorrido y no propagación: un contorno de 200.000 puntos convertiría cada
  // uno en un ARGUMENTO de llamada y desbordaría la pila. Ver `pointsBounds`.
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of loop) {
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  const span = maxY - minY;
  if (!(span > 0)) return null;

  // Barridos horizontales a varias alturas. Con uno solo, un anillo cuyo único
  // hueco esté justo a media altura no daría ningún punto válido.
  for (let step = 1; step <= 15; step += 1) {
    // Desplazado un pelo para no pasar exactamente por un vértice: un barrido
    // que cae sobre uno cuenta cruces de más.
    const y = minY + (span * step) / 16 + span * 1e-7;
    const crossings: number[] = [];
    for (let index = 0; index < loop.length; index += 1) {
      const current = loop[index];
      const next = loop[(index + 1) % loop.length];
      const low = Math.min(current.y, next.y);
      const high = Math.max(current.y, next.y);
      if (y < low || y >= high) continue;
      crossings.push(current.x + ((y - current.y) / (next.y - current.y)) * (next.x - current.x));
    }
    crossings.sort((left, right) => left - right);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const candidate = { x: (crossings[index] + crossings[index + 1]) / 2, y };
      if (usable(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Región definida por una SELECCIÓN de objetos.
 *
 * Se cosen sus caminos en anillos, se toma el de mayor área como exterior y se
 * resuelven las islas desde un punto interior suyo. Así «designa estos tres
 * círculos concéntricos» produce la misma corona que pinchar dentro, en vez de
 * tres contornos sueltos apilados.
 */
export function cadHatchRegionFromObjects(
  entityIds: readonly string[],
  context: CadCommandContext,
  islandStyle: CadIslandStyle,
  gapTolerance: number = cadHatchGapTolerance(context),
): CadHatchRegion | null {
  const built = stitchCadBoundaryPaths(cadCandidateBoundaryPaths(context, entityIds), gapTolerance);
  if (built.loops.length === 0) return null;
  const outer = built.loops.reduce((best, loop) =>
    Math.abs(cadBoundarySignedArea(loop)) > Math.abs(cadBoundarySignedArea(best)) ? loop : best,
  );
  // El punto semilla tiene que estar dentro del anillo mayor y FUERA de los
  // demás: el centroide de un cuadrado con una isla centrada cae dentro de la
  // isla, y resolver desde ahí daría la región de la isla en vez de la corona.
  const interior = cadLoopInteriorPoint(
    outer,
    built.loops.filter((loop) => loop !== outer),
  );
  if (!interior) return null;
  const resolved = resolveCadHatchRegionWithSources(built, interior, islandStyle);
  return resolved.boundaries.length > 0 ? resolved : null;
}

/**
 * Espaciado por defecto del patrón: el MISMO que deriva el renderizador.
 *
 * `hatch-entity-adapter` dibuja con `entity.scale ?? diagonal / 40`, pero la
 * lectura de propiedades informa `entity.scale ?? 1`. Un HATCH que no fije el
 * campo se dibuja con un espaciado y se describe con otro, y en cuanto alguien
 * toca cualquier propiedad se materializa el 1 y el sombreado se convierte en
 * una mancha negra. Emitirlo explícito cierra esa grieta desde el lado que
 * crea la entidad: lo guardado es lo dibujado.
 */
export function cadHatchSpacing(boundaries: readonly (readonly CadPoint2[])[]): number {
  // Misma regla que `pointsBounds`: recorrido, nunca propagación. Este cálculo
  // corre al CREAR el sombreado, sobre el contorno completo tal cual llega.
  const bounds = pointsBounds(boundaries.flat().map((point) => ({ x: point.x, y: point.y })));
  if (!Number.isFinite(bounds.minX)) return 1;
  const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  return Math.max(diagonal / 40, 1e-6);
}

/**
 * ¿Está el anillo `inner` DENTRO de `outer`? Por voto de los PUNTOS MEDIOS de
 * sus lados.
 *
 * No se pregunta por un punto interior de `inner` —el centroide, o el que
 * calcula `cadLoopInteriorPoint`— porque ése cae dentro de las islas del propio
 * anillo: el centro de un cuadrado de 1.000 con una isla de 200 centrada está
 * DENTRO de la isla, y la profundidad del exterior salía 1 en vez de 0, con lo
 * que el área total se volvía negativa.
 *
 * Y se votan los puntos MEDIOS de los lados y no los vértices porque una isla
 * que TOCA el contorno comparte vértices con él, y un punto justo encima de la
 * frontera no está ni dentro ni fuera para la regla par/impar. El punto medio de
 * un lado sólo cae sobre la frontera si el lado entero está apoyado en ella, y
 * la mayoría de los demás decide.
 *
 * Vale porque los anillos que se CRUZAN ya se han rechazado antes: sin cruces,
 * o está dentro o está fuera, y el voto sólo desempata los apoyos.
 */
function cadLoopInsideLoop(inner: readonly CadPoint2[], outer: readonly CadPoint2[]): boolean {
  if (inner.length < 3 || outer.length < 3) return false;
  let dentro = 0;
  for (let index = 0; index < inner.length; index += 1) {
    const current = inner[index];
    const next = inner[(index + 1) % inner.length];
    const medio = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };
    if (cadPointInBoundary(medio, outer)) dentro += 1;
  }
  return dentro * 2 > inner.length;
}

/** Lo ambiguo se rechaza con nombre propio, no con un número cualquiera. */
export class CadHatchRegionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CadHatchRegionError";
  }
}

/**
 * Área REALMENTE rellenada por la región, contada por PARIDAD de anidamiento.
 *
 * ## Por qué no vale «el exterior menos las islas»
 *
 * Ésa era la fórmula anterior, y sólo es correcta con UN nivel de islas. Con
 * las islas dentro de islas que trae cualquier plano de acabados —el patio
 * dentro del edificio, el aljibe dentro del patio— restaba también las que
 * vuelven a estar rellenas. Cuatro cuadrados concéntricos de 100, 80, 60 y 40
 * daban 10000−6400−3600−1600 = **−1600**: un área NEGATIVA, publicada como
 * medida. Y lo peor no es el signo, es que la misma región medía una cosa aquí
 * y se dibujaba de otra: `hatchRegionContainsPoint` y el renderizador deciden
 * por PARIDAD desde siempre, así que el anillo de tercer nivel se pintaba y
 * este cálculo lo restaba.
 *
 * La cuenta correcta es la del renderizador: cada anillo suma o resta según la
 * PROFUNDIDAD a la que está. Los mismos cuatro cuadrados dan 5600, que es lo
 * que se ve al mirar el plano.
 *
 * ## Y lo que sigue sin poder contestarse
 *
 * Dos islas que se CRUZAN entre sí no forman un modelo de anidamiento: el trozo
 * común queda relleno por paridad y ninguna suma de áreas completas lo recoge
 * —haría falta recortar los polígonos—. Antes salía un número plausible y
 * equivocado (1700 donde la verdad es 1900). Ahora se lanza `CadHatchRegionError`
 * con los dos anillos nombrados, porque una medida ambigua sin aviso acaba en
 * una tabla de acabados y de ahí en un pedido de material.
 */
export function cadHatchRegionArea(boundaries: readonly (readonly CadPoint2[])[]): number {
  if (boundaries.length === 0) return 0;
  for (let index = 0; index < boundaries.length; index += 1)
    for (let other = index + 1; other < boundaries.length; other += 1)
      if (cadBoundariesCross(boundaries[index], boundaries[other]))
        throw new CadHatchRegionError(
          `Los contornos ${index} y ${other} de la región se cruzan entre sí: el área rellenada ` +
            "no es una suma de áreas completas y no se puede medir sin recortar los polígonos.",
        );
  return boundaries.reduce((total, loop, index) => {
    const depth = boundaries.filter(
      (other, position) => position !== index && cadLoopInsideLoop(loop, other),
    ).length;
    return total + (depth % 2 === 0 ? 1 : -1) * Math.abs(cadBoundarySignedArea(loop));
  }, 0);
}
