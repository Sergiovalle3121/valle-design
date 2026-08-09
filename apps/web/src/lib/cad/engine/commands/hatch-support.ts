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
 * Lo mismo vale para la tolerancia de COSIDO —cuándo dos extremos de curva son
 * «el mismo punto»—: `stitchCadBoundaryPaths` la trae por defecto y aquí no se
 * cambia, porque el regenerador usa la suya y un contorno que cierra al crearse
 * y no cierra al regenerarse marca el sombreado como roto.
 *
 * Que la resolución dependa del DIBUJO (del radio del arco, no del zoom) es la
 * mejora pendiente, y hay que hacerla en `cadEntityBoundaryPaths` para que los
 * dos lados se muevan a la vez. Queda dicho aquí y en el PR.
 */
import type { CadPoint2 } from "../../cad-document";
import {
  cadBoundarySignedArea,
  cadPointInBoundary,
  resolveCadHatchRegionWithSources,
  stitchCadBoundaryPaths,
  type CadBoundaryPath,
} from "../../hatch-associativity";
import { CAD_ENTITY_REGISTRY, cadEntityBoundaryPaths } from "../../entity-runtime";
import type { CadCommandContext } from "../command-types";

export type CadIslandStyle = "normal" | "outer" | "ignore";

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

/** Región que contiene un punto interior. `null` si el punto no está encerrado. */
export function cadHatchRegionAtPoint(
  point: CadPoint2,
  context: CadCommandContext,
  islandStyle: CadIslandStyle,
): CadHatchRegion | null {
  const built = stitchCadBoundaryPaths(cadCandidateBoundaryPaths(context));
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

  const ys = loop.map((point) => point.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
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
): CadHatchRegion | null {
  const built = stitchCadBoundaryPaths(cadCandidateBoundaryPaths(context, entityIds));
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
  const points = boundaries.flat();
  if (points.length === 0) return 1;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return Math.max(diagonal / 40, 1e-6);
}

/** Área del anillo exterior menos la de las islas. Sirve para afirmar de verdad. */
export function cadHatchRegionArea(boundaries: readonly (readonly CadPoint2[])[]): number {
  if (boundaries.length === 0) return 0;
  const [outer, ...islands] = boundaries;
  return islands.reduce(
    (area, island) => area - Math.abs(cadBoundarySignedArea(island)),
    Math.abs(cadBoundarySignedArea(outer)),
  );
}
