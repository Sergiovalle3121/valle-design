/**
 * LA RUTA DE TUBERÍA EN 3D, Y LOS ACCESORIOS QUE LA GEOMETRÍA IMPLICA.
 *
 * ## Qué falta va, medido
 *
 * `docs/competitive/rubric.json`, criterio `toolset-plant3d.tuberia`, tras la
 * primera mitad de la Ola 6: *«La tubería está en 2D con su número, servicio y
 * especificación, y su metrado sale del plano; el ruteo 3D por especificación y
 * la generación de isométricos no existen.»* Éste es el módulo que lo cierra
 * por abajo: sin ruta con COTA no hay isométrico del que hablar.
 *
 * ## Una ruta es una polilínea con z. No hay entidad nueva
 *
 * El documento ya guarda `z` en cada vértice de una polilínea —lo hace PLINE
 * desde la Ola C— y ya viaja al DXF como `POLYLINE` 3D. Así que una ruta de
 * tubería es una polilínea con la cota puesta y su marca en `context.metadata`:
 * el mismo `pl:linea` del P&ID, para que el esquema y la ruta hablen del mismo
 * objeto, más `pl:ruta` que dice que ESTA lleva cota de punta a punta.
 *
 * Sin esa marca no se podría distinguir una ruta de un trazo del P&ID que
 * casualmente está a cota cero, y el isométrico saldría de un esquema que no
 * está a escala — que es exactamente el error que esta ola existe para no
 * cometer.
 *
 * ## Los accesorios se DERIVAN, no se colocan
 *
 * AutoCAD Plant 3D coloca un codo como objeto cuando ruteas. Aquí el codo se
 * DEDUCE de la geometría: si la ruta gira 90° en un vértice, ahí hay un codo de
 * 90°, y si mañana mueves el vértice el codo cambia con él. Colocarlo como
 * entidad obligaría a mantener dos verdades sincronizadas —la geometría y el
 * objeto— y la lista de materiales de un plano modificado es justo donde esa
 * desincronización se paga.
 *
 * Lo que se deduce y lo que no está dicho: **tubo, codo, te y reducción**. Una
 * brida, una válvula o un soporte no los implica la geometría —son decisiones
 * de proyecto— y por eso NO se inventan. Las válvulas se cuentan por sus
 * símbolos, que es de donde salen.
 *
 * ## La especificación es la del proyecto, y no se transcribe ninguna
 *
 * `pl:especificacion` viaja con la ruta y aparece en cada renglón de la lista
 * de materiales, pero aquí no hay tabla de espesores, de diámetros exteriores
 * ni de claves de compra: ésas están en normas y catálogos con dueño, y
 * transcribirlas sería traer material ajeno. Lo que este módulo comprueba es lo
 * universal —que una línea no cambie de especificación a mitad de recorrido,
 * que un cambio de diámetro lleve su reducción, que un giro sea de un ángulo
 * que se compra— y para eso no hace falta el catálogo de nadie.
 */
import type { CadDocument, CadEntity, CadPoint3 } from "../cad-document";
import { CAD_PL_LINE, CAD_PL_SERVICE, CAD_PL_SPEC, cadParsePlantLine } from "./line-numbers";

/** Marca de ruta 3D en los metadatos. Su valor es `"3D"`, y se lee, no se supone. */
export const CAD_PL_ROUTE = "pl:ruta";
/** El valor de la marca. Una constante para que nadie escriba `"3d"` a mano. */
export const CAD_PL_ROUTE_MARK = "3D";
/** Capa de las rutas de tubería. Separada de `TU-PROC`: una es esquema, otra modelo. */
export const CAD_PL_ROUTE_LAYER = "TU-RUTA";

/**
 * Cuánto pueden separarse dos puntos y seguir siendo el mismo, en unidades de
 * dibujo. Un milímetro: por debajo de eso nadie coloca dos tuberías distintas,
 * y por encima un empalme «a ojo» dejaría de detectarse, que es peor.
 */
export const CAD_PL_JOIN_TOLERANCE = 1;

/** Un giro por debajo de esto es una recta con ruido de tecleo, no un codo. */
const TURN_EPSILON_DEG = 0.5;

export interface CadPipeRoute {
  entityId: string;
  /** El número de línea completo: `6"-P-1001-CS150`. */
  line: string;
  size: string;
  service: string;
  /**
   * El correlativo. La IDENTIDAD de una línea es servicio + correlativo, no la
   * cadena entera: el diámetro cambia a lo largo de la línea —para eso existen
   * las reducciones— y `6"-P-1001` y `4"-P-1001` son la MISMA línea en dos
   * tramos. La especificación, en cambio, no debe cambiar, y por eso se
   * comprueba contra esta identidad y no contra el texto completo.
   */
  number: number;
  spec: string;
  points: CadPoint3[];
  /**
   * Diámetro nominal en milímetros YA RESUELTO, para las conducciones que no lo
   * rotulan en pulgadas.
   *
   * Una ruta de proceso lo lleva en `size` (`6"`) y lo resuelve
   * `cadPipeNominalMillimetres`. Una corrida MEP —agua fría de Ø19, un ducto de
   * 300 de ancho— lo lleva en milímetros o en unidades de dibujo, y ese lector
   * devolvería `null` para las dos: sin este campo, meterlas en el análisis de
   * choques habría exigido escribirles un tamaño en pulgadas que nadie tecleó.
   * Ausente en una ruta de proceso, que ya lo dice en `size`.
   */
  nominalMm?: number;
}

const z = (point: { z?: number }): number =>
  typeof point.z === "number" && Number.isFinite(point.z) ? point.z : 0;

const meta = (entity: CadEntity, key: string): string | undefined => {
  const value = entity.context?.metadata?.[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

/** Las rutas 3D del dibujo, con su número de línea ya partido. */
export function cadPipeRoutesOf(document: Pick<CadDocument, "entities">): CadPipeRoute[] {
  const routes: CadPipeRoute[] = [];
  for (const entity of document.entities) {
    if (entity.type !== "polyline") continue;
    if (meta(entity, CAD_PL_ROUTE) !== CAD_PL_ROUTE_MARK) continue;
    const line = meta(entity, CAD_PL_LINE);
    if (!line) continue;
    const partido = cadParsePlantLine(line);
    if (!partido) continue;
    routes.push({
      entityId: entity.id,
      line,
      size: partido.size,
      service: meta(entity, CAD_PL_SERVICE) ?? partido.service,
      number: partido.number,
      spec: meta(entity, CAD_PL_SPEC) ?? partido.spec,
      points: entity.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y, z: z(vertex) })),
    });
  }
  return routes;
}

/**
 * Diámetro NOMINAL en milímetros a partir del tamaño rotulado.
 *
 * `6"` → 152,4. `1-1/2"` → 38,1. `3/4"` → 19,05. `null` cuando el tamaño no
 * tiene la forma de una medida en pulgadas: sin diámetro no se puede medir una
 * holgura ni barrer un tubo, y suponerlo sería inventar el número que más
 * importa. Vive aquí —y no en quien lo consume— porque el diámetro es una
 * propiedad de la RUTA: lo usan por igual el informe de choques y el sólido.
 */
export function cadPipeNominalMillimetres(size: string): number | null {
  const limpio = size.trim().replace(/[″”“]/gu, '"').replace(/\s+/gu, "");
  const mixto = /^(\d+)-(\d+)\/(\d+)"$/u.exec(limpio);
  if (mixto) {
    const divisor = Number(mixto[3]);
    if (!(divisor > 0)) return null;
    return (Number(mixto[1]) + Number(mixto[2]) / divisor) * 25.4;
  }
  const fraccion = /^(\d+)\/(\d+)"$/u.exec(limpio);
  if (fraccion) {
    const divisor = Number(fraccion[2]);
    if (!(divisor > 0)) return null;
    return (Number(fraccion[1]) / divisor) * 25.4;
  }
  const entero = /^(\d+)"$/u.exec(limpio);
  if (entero) return Number(entero[1]) * 25.4;
  return null;
}

/** Longitud recorrida EN TRES DIMENSIONES, en unidades de dibujo. */
export function cadPipeRouteLength(points: readonly CadPoint3[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return total;
}

const sub = (a: CadPoint3, b: CadPoint3): CadPoint3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const norm = (v: CadPoint3): number => Math.hypot(v.x, v.y, v.z);
const near = (a: CadPoint3, b: CadPoint3, tolerance = CAD_PL_JOIN_TOLERANCE): boolean =>
  norm(sub(a, b)) <= tolerance;

/** El ángulo que gira la ruta en un vértice, en grados. 0 = sigue recta. */
export function cadPipeTurnAngle(previous: CadPoint3, vertex: CadPoint3, next: CadPoint3): number {
  const entrada = sub(vertex, previous);
  const salida = sub(next, vertex);
  const largoEntrada = norm(entrada);
  const largoSalida = norm(salida);
  if (largoEntrada === 0 || largoSalida === 0) return 0;
  const coseno =
    (entrada.x * salida.x + entrada.y * salida.y + entrada.z * salida.z) /
    (largoEntrada * largoSalida);
  // El coseno puede salir de [-1, 1] por redondeo y `Math.acos` devolvería NaN
  // justo en el caso más común: dos tramos exactamente alineados.
  return (Math.acos(Math.min(1, Math.max(-1, coseno))) * 180) / Math.PI;
}

export type CadPipeFittingKind = "codo" | "te" | "reduccion";

export interface CadPipeFitting {
  kind: CadPipeFittingKind;
  at: CadPoint3;
  /** Diámetro nominal del accesorio: el del tramo, o el mayor en una reducción. */
  size: string;
  /** El otro diámetro, sólo en una reducción. */
  toSize?: string;
  /** Grados del giro, sólo en un codo. */
  angle?: number;
  line: string;
  spec: string;
  /** Las rutas que lo producen: una en un codo, dos en una te o una reducción. */
  entityIds: string[];
}

/** ¿Cae `point` DENTRO de un tramo (no en sus puntas) y a menos de la tolerancia? */
function onSegment(point: CadPoint3, a: CadPoint3, b: CadPoint3): boolean {
  const ab = sub(b, a);
  const largo = norm(ab);
  if (largo === 0) return false;
  const ap = sub(point, a);
  const t = (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / (largo * largo);
  // Fuera del tramo, o pegado a una punta: una punta con punta es un empalme
  // recto o una reducción, no una te, y se resuelve en su propia pasada.
  if (t * largo <= CAD_PL_JOIN_TOLERANCE || (1 - t) * largo <= CAD_PL_JOIN_TOLERANCE) return false;
  const proyectado: CadPoint3 = { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t };
  return norm(sub(point, proyectado)) <= CAD_PL_JOIN_TOLERANCE;
}

/**
 * Los accesorios que la geometría implica.
 *
 * Codos en cada vértice que gira, tes donde la punta de una ruta muere sobre el
 * cuerpo de otra, y reducciones donde dos rutas se tocan punta con punta con
 * diámetros distintos. Nada más: lo que no se deduce, no se inventa.
 */
export function cadPipeFittings(routes: readonly CadPipeRoute[]): CadPipeFitting[] {
  const fittings: CadPipeFitting[] = [];

  for (const route of routes)
    for (let index = 1; index < route.points.length - 1; index += 1) {
      const angle = cadPipeTurnAngle(route.points[index - 1], route.points[index], route.points[index + 1]);
      if (angle < TURN_EPSILON_DEG) continue;
      fittings.push({
        kind: "codo",
        at: route.points[index],
        size: route.size,
        angle: Math.round(angle * 10) / 10,
        line: route.line,
        spec: route.spec,
        entityIds: [route.entityId],
      });
    }

  for (const branch of routes) {
    const puntas = [branch.points[0], branch.points[branch.points.length - 1]].filter(
      (punto): punto is CadPoint3 => !!punto,
    );
    for (const punta of puntas)
      for (const header of routes) {
        if (header.entityId === branch.entityId) continue;
        for (let index = 1; index < header.points.length; index += 1)
          if (onSegment(punta, header.points[index - 1], header.points[index])) {
            fittings.push({
              kind: "te",
              at: punta,
              // El diámetro de la te lo manda el cabezal, no el ramal: es la
              // pieza que se corta sobre la línea principal.
              size: header.size,
              line: header.line,
              spec: header.spec,
              entityIds: [header.entityId, branch.entityId],
            });
          }
      }
  }

  // Punta con punta y diámetros distintos: una reducción. Se recorre cada par
  // una sola vez para no contar la misma pieza dos veces.
  for (let i = 0; i < routes.length; i += 1)
    for (let j = i + 1; j < routes.length; j += 1) {
      const a = routes[i];
      const b = routes[j];
      if (a.size === b.size) continue;
      const puntasA = [a.points[0], a.points[a.points.length - 1]];
      const puntasB = [b.points[0], b.points[b.points.length - 1]];
      for (const puntaA of puntasA)
        for (const puntaB of puntasB)
          if (puntaA && puntaB && near(puntaA, puntaB)) {
            fittings.push({
              kind: "reduccion",
              at: puntaA,
              size: a.size,
              toSize: b.size,
              line: a.line,
              spec: a.spec,
              entityIds: [a.entityId, b.entityId],
            });
          }
    }

  return fittings;
}

/** Cómo se nombra un accesorio en la lista y en el isométrico. */
export function cadPipeFittingLabel(fitting: CadPipeFitting): string {
  if (fitting.kind === "codo") {
    const grados = fitting.angle ?? 0;
    const redondo = Math.round(grados);
    return `Codo ${Math.abs(grados - redondo) < 0.05 ? redondo : grados.toFixed(1)}° ${fitting.size}`;
  }
  if (fitting.kind === "te") return `Te ${fitting.size}`;
  return `Reducción ${fitting.size} × ${fitting.toSize ?? "?"}`;
}

export type CadPipeRouteFindingKind =
  | "especificacion-partida"
  | "codo-a-medida"
  | "ruta-plana"
  | "tramo-nulo";

export interface CadPipeRouteFinding {
  kind: CadPipeRouteFindingKind;
  detail: string;
  entityIds: string[];
}

/**
 * Ángulos de codo que se compran hechos. Cualquier otro se fabrica cortando y
 * soldando, cuesta más y se decide a propósito: por eso se avisa, no se
 * prohíbe.
 */
const CODOS_DE_CATALOGO = [45, 90];

/**
 * Lo que se puede comprobar sin el catálogo de nadie.
 *
 * Una línea que cambia de especificación a mitad de recorrido, un codo de un
 * ángulo que no se compra hecho, una ruta entera a la misma cota —que casi
 * siempre es un olvido de elevación, no un diseño— y un tramo de longitud
 * cero, que en el isométrico sale como un punto y en la requisición como nada.
 */
export function cadPipeRouteFindings(
  routes: readonly CadPipeRoute[],
): CadPipeRouteFinding[] {
  const findings: CadPipeRouteFinding[] = [];

  // Por IDENTIDAD de línea —servicio y correlativo—, no por el texto entero:
  // un tramo de 6" y otro de 4" de la MISMA línea son lo normal, y comparados
  // como cadenas parecerían dos líneas distintas y el defecto pasaría.
  const porLinea = new Map<string, CadPipeRoute[]>();
  for (const route of routes) {
    const clave = `${route.service}-${route.number}`;
    porLinea.set(clave, [...(porLinea.get(clave) ?? []), route]);
  }
  for (const [identidad, tramos] of porLinea) {
    const specs = [...new Set(tramos.map((route) => route.spec))].sort();
    if (specs.length > 1)
      findings.push({
        kind: "especificacion-partida",
        detail: `la línea ${identidad} usa ${specs.join(" y ")}: una línea es una especificación`,
        entityIds: tramos.map((route) => route.entityId).sort(),
      });
  }

  for (const route of routes) {
    for (let index = 1; index < route.points.length - 1; index += 1) {
      const angle = cadPipeTurnAngle(route.points[index - 1], route.points[index], route.points[index + 1]);
      if (angle < TURN_EPSILON_DEG) continue;
      if (!CODOS_DE_CATALOGO.some((catalogo) => Math.abs(angle - catalogo) <= 0.5))
        findings.push({
          kind: "codo-a-medida",
          detail: `${route.line} gira ${angle.toFixed(1)}° en el vértice ${index + 1}: no es un codo de catálogo (45° o 90°)`,
          entityIds: [route.entityId],
        });
    }

    for (let index = 1; index < route.points.length; index += 1)
      if (norm(sub(route.points[index], route.points[index - 1])) <= CAD_PL_JOIN_TOLERANCE)
        findings.push({
          kind: "tramo-nulo",
          detail: `${route.line} tiene un tramo de longitud cero en el vértice ${index + 1}`,
          entityIds: [route.entityId],
        });

    const cotas = new Set(route.points.map((point) => Math.round(point.z)));
    if (cotas.size === 1 && route.points.length > 2)
      findings.push({
        kind: "ruta-plana",
        detail: `${route.line} está toda a la cota ${[...cotas][0]}: si es correcto, no hay nada que hacer; si no, falta la elevación`,
        entityIds: [route.entityId],
      });
  }

  return findings;
}
