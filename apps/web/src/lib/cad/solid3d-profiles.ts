/**
 * De la geometría 2D del dibujo al perfil que come el kernel.
 *
 * Es el puente que hace utilizables EXTRUDE, REVOLVE, SWEEP y LOFT: el usuario
 * no teclea coordenadas de perfil, designa lo que ya ha dibujado. Un círculo, una
 * polilínea cerrada, una elipse, una spline cerrada o una REGION valen como
 * sección; todo lo demás se rechaza DICIÉNDOLO, en vez de extruir una silueta
 * inventada.
 *
 * ## Una decisión que conviene ver escrita: de dónde salen los puntos
 *
 * Del renderizador del propio adaptador, con `segments` explícito. Reimplementar
 * aquí la teselación de un arco de polilínea (el `bulge`) o de un tramo de
 * spline habría creado una SEGUNDA versión de la misma curva: extruir un perfil
 * y dibujarlo darían siluetas distintas, y la diferencia sólo se vería al
 * superponerlas. Con el renderizador, la sección del sólido es exactamente el
 * trazo que el usuario ve.
 *
 * ## El eje de una revolución en un dibujo 2D
 *
 * `revolveProfile` quiere el perfil en el plano (radial, axial). En un dibujo
 * plano el eje es una recta de la propia hoja, así que «radial» es la distancia
 * perpendicular al eje MEDIDA EN EL PLANO y «axial» el avance a lo largo de él;
 * la revolución sale entonces del papel, que es lo que uno espera al revolucionar
 * un alzado. Si el perfil cruza el eje se rechaza: un radio negativo no describe
 * ningún sólido de revolución, describe dos que se atraviesan.
 *
 * ## El perfil que sale de aquí es SIEMPRE horizontal, y hay que decirlo
 *
 * `profileFromEntity` toma la cota de UN vértice y los puntos del renderizador,
 * que son 2D. Un perfil dibujado inclinado —vértices a cotas distintas— sale de
 * aquí aplanado sobre la cota de esa esquina, más pequeño por el coseno y con
 * aspecto de correcto. Ese aplanado es una mentira si nadie lo declara, y la
 * auditoría del 2026-09-05 (T-10 b) lo encontró en EXTRUDE. El arreglo bueno
 * —extruir por la normal del perfil— es un trabajo aparte; el arreglo honesto
 * es medir cuánto se separa el perfil de la horizontal
 * (`profileElevationDeviation`) y que el comando lo RECHACE con ese número en
 * vez de consumir el perfil aplanado (`horizontalProfileFromEntity`).
 */
import { BREP_TOLERANCE } from "../brep";
import type { CadEntity, CadPoint2, CadPoint3 } from "./cad-document";
import type { CadSolidFrame, CadSolidProfile } from "./cad-entities-v5";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";

/** Perfil ya extraído, con la altura del plano en que vivía. */
export interface CadExtractedProfile {
  profile: CadSolidProfile;
  /** Cota del plano del perfil. El marco resultante nace ahí. */
  elevation: number;
  /** Entidad de la que salió, para poder borrarla al consumirla. */
  sourceId: string;
}

const CURVE_SEGMENTS = 64;

/** Área con signo de un anillo. */
function signedArea(points: readonly CadPoint2[]): number {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

/** Quita el vértice de cierre repetido, que el kernel no quiere. */
function openRing(points: readonly CadPoint2[]): CadPoint2[] {
  const ring = points.map((point) => ({ x: point.x, y: point.y }));
  while (
    ring.length > 1 &&
    Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 1e-9
  )
    ring.pop();
  return ring;
}

/** Anillo en sentido antihorario, que es lo que el kernel espera del exterior. */
function counterClockwise(points: readonly CadPoint2[]): CadPoint2[] {
  const ring = openRing(points);
  return signedArea(ring) < 0 ? ring.reverse() : ring;
}

/** Anillo horario: el sentido de un agujero. */
function clockwise(points: readonly CadPoint2[]): CadPoint2[] {
  const ring = openRing(points);
  return signedArea(ring) > 0 ? ring.reverse() : ring;
}

/**
 * Perfil de una entidad designada, o `null` si esa entidad no encierra un área.
 *
 * Es deliberadamente estricto con las polilíneas: una polilínea ABIERTA no es
 * una sección aunque sus extremos casi se toquen. «Casi cerrada» es la fuente
 * clásica de sólidos con una rendija que nadie ve hasta que la booleana falla.
 */
export function profileFromEntity(entity: CadEntity, segments = CURVE_SEGMENTS): CadExtractedProfile | null {
  if (entity.type === "region") {
    return {
      sourceId: entity.id,
      elevation: entity.outer[0]?.z ?? 0,
      profile: {
        outer: counterClockwise(entity.outer),
        ...(entity.inners && entity.inners.length > 0
          ? { inners: entity.inners.map(clockwise) }
          : {}),
      },
    };
  }
  if (entity.type === "circle") {
    return {
      sourceId: entity.id,
      elevation: entity.center.z,
      profile: { outer: counterClockwise(pathPoints(entity, segments)) },
    };
  }
  if (entity.type === "polyline") {
    if (!entity.closed) return null;
    return {
      sourceId: entity.id,
      elevation: entity.vertices[0]?.z ?? 0,
      profile: { outer: counterClockwise(pathPoints(entity, segments)) },
    };
  }
  if (entity.type === "ellipse") {
    const sweep = Math.abs(entity.endParameter - entity.startParameter);
    if (sweep < 360 - 1e-6) return null;
    return {
      sourceId: entity.id,
      elevation: entity.center.z,
      profile: { outer: counterClockwise(pathPoints(entity, segments)) },
    };
  }
  if (entity.type === "spline") {
    if (!entity.closed) return null;
    return {
      sourceId: entity.id,
      elevation: entity.controlPoints[0]?.z ?? 0,
      profile: { outer: counterClockwise(pathPoints(entity, segments)) },
    };
  }
  return null;
}

/** Puntos del primer camino cerrado del renderizador de la entidad. */
function pathPoints(entity: CadEntity, segments: number): CadPoint2[] {
  if (!CAD_ENTITY_REGISTRY.supports(entity)) return [];
  const paths = CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(entity, segments);
  return paths[0]?.points ?? [];
}

/** Marco horizontal a la cota dada: el plano del dibujo. */
export function planeFrameAt(elevation: number): CadSolidFrame {
  return {
    origin: { x: 0, y: 0, z: elevation },
    zAxis: { x: 0, y: 0, z: 1 },
    xAxis: { x: 1, y: 0, z: 0 },
  };
}

/**
 * Tolerancia de horizontalidad de un perfil: la lineal del kernel B-rep. Dos
 * cotas que difieren menos que esto son LA MISMA cota para el kernel, así que
 * no hay ningún aplanado que declarar. No es una cifra propia: si el kernel
 * cambia la suya, ésta la sigue.
 */
export const CAD_PROFILE_HORIZONTAL_TOLERANCE = BREP_TOLERANCE.linear;

/** Cota de un punto que puede venir sin `z` (dibujos anteriores al esquema 3D). */
function elevationOf(point: CadPoint2 & { z?: number }): number {
  return point.z ?? 0;
}

/**
 * Cotas de los vértices que DEFINEN la entidad, no de los que dibuja el
 * renderizador: éste trabaja en 2D y ya ha perdido la inclinación. Vacío para
 * las entidades que no encierran un área.
 *
 * De la elipse sólo se conocen con certeza los dos extremos del eje mayor
 * (`center ± majorAxis`); el eje menor no lleva cota propia. Del círculo, sólo
 * el centro: un círculo cuya `context.normal` estuviera inclinada no se mide
 * aquí, y ése es un límite declarado, no un descuido.
 */
function profileElevations(entity: CadEntity): number[] {
  if (entity.type === "region")
    return [...entity.outer, ...(entity.inners ?? []).flat()].map(elevationOf);
  if (entity.type === "circle") return [elevationOf(entity.center)];
  if (entity.type === "polyline") return entity.vertices.map(elevationOf);
  if (entity.type === "ellipse") {
    const centre = elevationOf(entity.center);
    const rise = elevationOf(entity.majorAxis);
    return [centre + rise, centre - rise];
  }
  if (entity.type === "spline") return entity.controlPoints.map(elevationOf);
  return [];
}

/**
 * Cuánto se separa el perfil de un plano horizontal: la diferencia entre la
 * cota más alta y la más baja de sus vértices, en unidades del dibujo. Cero
 * para un perfil horizontal y para las entidades que no definen ninguno.
 *
 * Es la medida barata y honesta que pide la ficha T-10 (b): un perfil inclinado
 * 30° y de 1000 de largo se separa 500; uno alabeado (una esquina fuera del
 * plano de las otras tres) también se detecta, porque no distingue «inclinado»
 * de «no plano» —ninguno de los dos es horizontal, y eso es lo que el extrusor
 * de esta versión exige.
 */
export function profileElevationDeviation(entity: CadEntity): number {
  const elevations = profileElevations(entity);
  if (elevations.length === 0) return 0;
  let lowest = elevations[0];
  let highest = elevations[0];
  for (const elevation of elevations) {
    if (elevation < lowest) lowest = elevation;
    if (elevation > highest) highest = elevation;
  }
  return highest - lowest;
}

/**
 * Lo que una entidad da al pedirle un perfil HORIZONTAL, que es el único que el
 * extrusor de esta versión sabe llevar a sólido:
 *
 *   - `profile`: el perfil, con la cota del plano en que vive.
 *   - `none`: la entidad no encierra un área (polilínea abierta, línea, texto).
 *   - `inclined`: encierra un área pero sus vértices no comparten cota;
 *     `deviation` es cuánto se separan. NO trae perfil a propósito: el aplanado
 *     que `profileFromEntity` devolvería es justo lo que no se puede consumir
 *     sin decirlo.
 */
export type CadHorizontalProfile =
  | { kind: "profile"; extracted: CadExtractedProfile }
  | { kind: "none" }
  | { kind: "inclined"; deviation: number };

/**
 * Perfil horizontal de una entidad, o el motivo por el que no lo hay.
 *
 * Es la puerta que EXTRUDE (y PRESSPULL, que comparte su máquina) usa en vez de
 * `profileFromEntity` a secas. `profileFromEntity` sigue existiendo tal cual
 * porque REVOLVE, LOFT y las losas lo consumen; medir su planaridad en cada
 * uno de ellos es trabajo pendiente, no algo que este helper finja resuelto.
 */
export function horizontalProfileFromEntity(
  entity: CadEntity,
  segments = CURVE_SEGMENTS,
): CadHorizontalProfile {
  const extracted = profileFromEntity(entity, segments);
  if (!extracted) return { kind: "none" };
  const deviation = profileElevationDeviation(entity);
  if (deviation > CAD_PROFILE_HORIZONTAL_TOLERANCE) return { kind: "inclined", deviation };
  return { kind: "profile", extracted };
}

/** Contornos cerrados de una entidad, para construir una REGION. */
export function closedLoopsOfEntity(entity: CadEntity, segments = CURVE_SEGMENTS): CadPoint3[][] {
  const extracted = profileFromEntity(entity, segments);
  if (!extracted) return [];
  const lift = (ring: CadPoint2[]): CadPoint3[] =>
    ring.map((point) => ({ x: point.x, y: point.y, z: extracted.elevation }));
  return [lift(extracted.profile.outer), ...(extracted.profile.inners ?? []).map(lift)];
}

export interface CadRevolveSetup {
  profile: CadSolidProfile;
  frame: CadSolidFrame;
}

/**
 * Reexpresa un perfil del plano del dibujo en coordenadas (radial, axial)
 * respecto de un eje de la propia hoja.
 *
 * Devuelve `null` si el perfil CRUZA el eje. No es una restricción arbitraria:
 * un punto con radio negativo, al girar, pasa por el otro lado del eje y el
 * cuerpo se atraviesa a sí mismo. El kernel lo rechazaría igual, pero con un
 * mensaje sobre un punto en coordenadas que el usuario nunca ha visto.
 */
export function revolveSetupFromProfile(
  extracted: CadExtractedProfile,
  axisStart: CadPoint2,
  axisEnd: CadPoint2,
): CadRevolveSetup | null {
  const dx = axisEnd.x - axisStart.x;
  const dy = axisEnd.y - axisStart.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-9)) return null;
  const axis = { x: dx / length, y: dy / length };
  // Perpendicular en el plano. El signo se elige después, según de qué lado del
  // eje esté el perfil, para que el radio salga positivo.
  const normal = { x: -axis.y, y: axis.x };

  const radialOf = (point: CadPoint2): number =>
    (point.x - axisStart.x) * normal.x + (point.y - axisStart.y) * normal.y;
  const axialOf = (point: CadPoint2): number =>
    (point.x - axisStart.x) * axis.x + (point.y - axisStart.y) * axis.y;

  const all = [extracted.profile.outer, ...(extracted.profile.inners ?? [])].flat();
  if (all.length === 0) return null;
  const radii = all.map(radialOf);
  const positive = radii.every((radius) => radius >= -1e-9);
  const negative = radii.every((radius) => radius <= 1e-9);
  if (!positive && !negative) return null;
  const sign = positive ? 1 : -1;

  const map = (ring: CadPoint2[]): CadPoint2[] =>
    ring.map((point) => ({ x: sign * radialOf(point), y: axialOf(point) }));
  // Al reflejar el perfil (sign = −1) el sentido de recorrido se invierte, así
  // que hay que devolverlo a antihorario o el sólido saldría del revés.
  const orient = (ring: CadPoint2[]): CadPoint2[] => (sign < 0 ? ring.reverse() : ring);

  return {
    profile: {
      outer: orient(map(extracted.profile.outer)),
      ...(extracted.profile.inners && extracted.profile.inners.length > 0
        ? { inners: extracted.profile.inners.map((ring) => orient(map(ring))) }
        : {}),
    },
    frame: {
      origin: { x: axisStart.x, y: axisStart.y, z: extracted.elevation },
      zAxis: { x: axis.x, y: axis.y, z: 0 },
      xAxis: { x: sign * normal.x, y: sign * normal.y, z: 0 },
    },
  };
}

/**
 * Perfil recentrado en su centroide, que es como entra en un barrido.
 *
 * `sweepProfile` coloca la sección en el marco de cada punto del camino, con el
 * origen del marco SOBRE el camino. Un perfil dibujado a mil unidades del origen
 * del dibujo, pasado tal cual, describiría una sección a mil unidades de la
 * guía: el barrido saldría hueco y desplazado. Recentrar es lo que hace que
 * «designa el perfil, designa el camino» produzca lo que se espera.
 */
export function centeredProfile(profile: CadSolidProfile): CadSolidProfile {
  const points = [profile.outer, ...(profile.inners ?? [])].flat();
  if (points.length === 0) return profile;
  const centre = points.reduce(
    (total, point) => ({ x: total.x + point.x / points.length, y: total.y + point.y / points.length }),
    { x: 0, y: 0 },
  );
  const shift = (ring: CadPoint2[]): CadPoint2[] =>
    ring.map((point) => ({ x: point.x - centre.x, y: point.y - centre.y }));
  return {
    outer: shift(profile.outer),
    ...(profile.inners ? { inners: profile.inners.map(shift) } : {}),
  };
}

/**
 * Polilínea del camino de un barrido: los puntos de una línea, polilínea, arco o
 * spline designada. Devuelve `[]` si la entidad no describe un recorrido.
 */
export function pathOfEntity(entity: CadEntity, segments = CURVE_SEGMENTS): CadPoint3[] {
  if (entity.type === "line") return [entity.start, entity.end];
  if (entity.type === "polyline" || entity.type === "arc" || entity.type === "spline") {
    const elevation =
      entity.type === "polyline"
        ? entity.vertices[0]?.z ?? 0
        : entity.type === "arc"
          ? entity.center.z
          : entity.controlPoints[0]?.z ?? 0;
    return pathPoints(entity, segments).map((point) => ({ x: point.x, y: point.y, z: elevation }));
  }
  return [];
}
