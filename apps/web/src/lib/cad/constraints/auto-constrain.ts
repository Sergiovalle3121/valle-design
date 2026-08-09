/**
 * AUTOCONSTRAIN: deducir las restricciones de la geometría que ya está dibujada.
 *
 * Es como se usa esto de verdad. Nadie dibuja restringiendo desde el primer
 * trazo: se dibuja el perfil a ojo con los enganches, y DESPUÉS se le pide al
 * programa que reconozca lo que uno ya quería decir —«esto era horizontal»,
 * «estos dos vértices eran el mismo punto», «esta recta era tangente al
 * redondeo»— y lo convierta en relaciones que sobrevivan al siguiente cambio.
 *
 * ## Cómo se evita el atracón de restricciones
 *
 * El peligro de inferir es pasarse: si un rectángulo dibujado a escuadra recibe
 * «horizontal» arriba, «horizontal» abajo, «paralelo» entre ambos, «igual» de
 * longitud y «perpendicular» con los lados, el dibujo queda irresoluble por
 * exceso y el usuario tiene que ir borrando a ciegas.
 *
 * Aquí cada candidata se acepta sólo si **sube el rango del sistema**, es decir,
 * si aporta una ecuación que no se deducía ya de las anteriores. El paralelismo
 * entre dos rectas que ya son horizontales no sube el rango, así que no entra.
 * Es el mismo análisis que da los grados de libertad, usado como filtro: no hay
 * una tabla de prioridades que mantener a mano ni casos especiales que se
 * olviden.
 */
import type { CadEntity } from "../cad-document";
import type { CadConstraint, CadConstraintKind } from "./constraint-schema";
import { sampleConstraintJacobian } from "./solver";
import { parametrizeCadEntity, type CadEntityParametrization } from "./variables";

export interface CadAutoConstrainOptions {
  /** Tolerancia de distancia, en unidades de dibujo. */
  tolerance?: number;
  /** Tolerancia angular, en grados. */
  angleToleranceDeg?: number;
  /** Qué tipos inferir. Por defecto, todos los que sabe deducir. */
  kinds?: readonly CadConstraintKind[];
  /** Prefijo de los ids generados. */
  idPrefix?: string;
}

export interface CadAutoConstrainResult {
  /** Las restricciones que hay que añadir al documento. */
  added: CadConstraint[];
  /** Candidatas descartadas por no aportar nada, con el motivo. */
  skipped: { kind: CadConstraintKind; entityIds: string[]; reason: string }[];
}

/**
 * Tipos que este módulo sabe deducir, en orden de preferencia.
 *
 * El orden importa poco —el filtro de rango se encarga— salvo cuando dos tipos
 * dicen LO MISMO con distinto nombre. Dos círculos con el mismo centro cumplen
 * a la vez «concéntricos» y «centros coincidentes»: gana el primero porque es
 * como lo llama un dibujante, y el segundo se descarta por redundante.
 */
export const CAD_AUTO_CONSTRAIN_KINDS: readonly CadConstraintKind[] = [
  "horizontal", "vertical", "concentric", "coincident", "tangent",
  "collinear", "parallel", "perpendicular", "equalRadius", "equalLength",
];

const DEG = Math.PI / 180;

interface Probe {
  id: string;
  parametrization: CadEntityParametrization;
}

/**
 * Deduce restricciones sobre `entityIds` y devuelve sólo las que aportan algo
 * nuevo respecto de `existing`. No toca la geometría: quien las aplique tiene
 * que resolver después, porque una tolerancia distinta de cero significa que la
 * geometría todavía NO cumple exactamente lo que se acaba de afirmar.
 */
export function autoConstrainCadEntities(
  entities: readonly CadEntity[],
  entityIds: readonly string[],
  existing: readonly CadConstraint[] = [],
  options: CadAutoConstrainOptions = {},
): CadAutoConstrainResult {
  // Los valores por defecto siguen a AutoCAD: distancia muy fina (la geometría
  // que sale de los enganches coincide de verdad) y un grado de holgura
  // angular, que es lo que separa «lo dibujé horizontal» de «se parece».
  const tolerance = Math.max(0, options.tolerance ?? 1e-6);
  const angleTolerance = Math.max(0, options.angleToleranceDeg ?? 1) * DEG;
  const wanted = new Set(options.kinds ?? CAD_AUTO_CONSTRAIN_KINDS);
  const prefix = options.idPrefix ?? "auto";

  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const probes: Probe[] = [];
  for (const id of [...new Set(entityIds)].sort()) {
    const entity = byId.get(id);
    if (!entity) continue;
    const parametrization = parametrizeCadEntity(entity);
    if (parametrization) probes.push({ id, parametrization });
  }

  const candidates: CadConstraint[] = [];
  const skipped: CadAutoConstrainResult["skipped"] = [];
  const emit = (kind: CadConstraintKind, ids: string[], extra: Partial<CadConstraint> = {}) => {
    if (!wanted.has(kind)) return;
    candidates.push({
      id: `${prefix}:${kind}:${ids.join("+")}`,
      kind,
      entityIds: ids,
      enabled: true,
      ...extra,
    });
  };

  // --- una entidad -----------------------------------------------------------
  for (const probe of probes) {
    const geometry = read(probe.parametrization);
    if (geometry.angle === null) continue;
    const fromX = Math.abs(wrapHalfPi(geometry.angle));
    const fromY = Math.abs(wrapHalfPi(geometry.angle - Math.PI / 2));
    if (fromX <= angleTolerance && fromX <= fromY) emit("horizontal", [probe.id]);
    else if (fromY <= angleTolerance) emit("vertical", [probe.id]);
  }

  // --- pares -----------------------------------------------------------------
  for (let i = 0; i < probes.length; i += 1) {
    for (let j = i + 1; j < probes.length; j += 1) {
      const a = read(probes[i].parametrization);
      const b = read(probes[j].parametrization);
      const ids = [probes[i].id, probes[j].id];

      // Coincidencia: qué extremos se tocan. Se prueba fin→inicio (encadenar,
      // que es el caso normal) y también las otras tres combinaciones.
      const anchors = coincidentAnchors(a, b, tolerance);
      if (anchors) emit("coincident", ids, { anchors });

      if (a.radius !== null && b.radius !== null) {
        if (Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) <= tolerance)
          emit("concentric", ids);
        if (Math.abs(a.radius - b.radius) <= tolerance) emit("equalRadius", ids);
        const distance = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
        if (Math.abs(distance - (a.radius + b.radius)) <= tolerance)
          emit("tangent", ids, { tangency: "external" });
        else if (Math.abs(distance - Math.abs(a.radius - b.radius)) <= tolerance)
          emit("tangent", ids, { tangency: "internal" });
      }

      // Tangencia recta-círculo/arco.
      const straight = a.angle !== null && a.radius === null ? a : b.angle !== null && b.radius === null ? b : null;
      const round = a.radius !== null && a.form !== "ellipse" ? a : b.radius !== null && b.form !== "ellipse" ? b : null;
      if (straight && round && straight !== round) {
        const signed =
          Math.cos(straight.angle!) * (round.center.y - straight.center.y) -
          Math.sin(straight.angle!) * (round.center.x - straight.center.x);
        if (Math.abs(Math.abs(signed) - round.radius!) <= tolerance) emit("tangent", ids);
      }

      if (a.angle !== null && b.angle !== null) {
        const between = wrapHalfPi(b.angle - a.angle);
        const parallel = Math.abs(between) <= angleTolerance;
        const perpendicular = Math.abs(wrapHalfPi(between - Math.PI / 2)) <= angleTolerance;
        // Colineal manda sobre paralelo: dice lo mismo y además dónde. Emitir
        // las dos dejaría una redundancia que el filtro de rango no puede
        // deshacer, porque `collinear` aporta una ecuación que `parallel` no.
        const offset = Math.abs(
          Math.cos(a.angle) * (b.center.y - a.center.y) - Math.sin(a.angle) * (b.center.x - a.center.x),
        );
        if (parallel && offset <= tolerance) emit("collinear", ids);
        else if (parallel) emit("parallel", ids);
        else if (perpendicular) emit("perpendicular", ids);
      }

      if (a.length !== null && b.length !== null && Math.abs(a.length - b.length) <= tolerance)
        emit("equalLength", ids);
    }
  }

  // --- filtro por rango ------------------------------------------------------
  //
  // Las candidatas ya existentes se descartan primero; las demás se ordenan por
  // preferencia y se aceptan sólo si su ecuación es INDEPENDIENTE de todo lo
  // aceptado hasta ese momento. La independencia se mide ortogonalizando la fila
  // contra una base acumulada: es el mismo criterio de rango que da los grados
  // de libertad, pero incremental — preguntárselo al solucionador una vez por
  // candidata convertía cuarenta objetos en varios minutos de espera.
  const ordered = candidates.sort(byKindPriority).filter((candidate) => {
    if (!existing.some((constraint) => sameConstraint(constraint, candidate))) return true;
    skipped.push({ kind: candidate.kind, entityIds: candidate.entityIds, reason: "ya existía" });
    return false;
  });
  const relevant = entities.filter(
    (entity) => probes.some((probe) => probe.id === entity.id) || existingTouches(existing, entity.id),
  );
  // Las existentes van PRIMERO en la muestra: son la base de partida, y una
  // candidata que sólo repita lo que ya había tiene que caer.
  const sample = sampleConstraintJacobian(relevant, [...existing, ...ordered]);
  if (!sample) {
    // Sin jacobiano no hay filtro honesto posible. Antes que devolver un
    // conjunto redundante en silencio, se devuelve nada y se dice por qué.
    for (const candidate of ordered)
      skipped.push({
        kind: candidate.kind,
        entityIds: candidate.entityIds,
        reason: "la geometría designada no se pudo parametrizar",
      });
    return { added: [], skipped };
  }

  const rowsById = new Map<string, Float64Array[]>();
  for (const row of sample.rows) {
    const list = rowsById.get(row.constraintId) ?? [];
    list.push(row.gradient);
    rowsById.set(row.constraintId, list);
  }
  const basis: Float64Array[] = [];
  const contributes = (constraintId: string): boolean => {
    let any = false;
    for (const row of rowsById.get(constraintId) ?? []) if (orthogonalize(basis, row)) any = true;
    return any;
  };
  for (const constraint of existing) contributes(constraint.id);

  const added: CadConstraint[] = [];
  for (const candidate of ordered) {
    if (!contributes(candidate.id)) {
      skipped.push({
        kind: candidate.kind,
        entityIds: candidate.entityIds,
        reason: "no aporta ninguna ecuación nueva",
      });
      continue;
    }
    added.push(candidate);
  }
  return { added, skipped };
}

/**
 * Gram-Schmidt modificado. Devuelve `true` y AMPLÍA la base si la fila aporta
 * una dirección nueva; si no, la base queda intacta.
 */
function orthogonalize(basis: Float64Array[], row: Float64Array): boolean {
  const residual = Float64Array.from(row);
  const original = norm(residual);
  if (!(original > 0)) return false;
  for (const vector of basis) {
    let projection = 0;
    for (let index = 0; index < residual.length; index += 1) projection += residual[index] * vector[index];
    if (projection === 0) continue;
    for (let index = 0; index < residual.length; index += 1) residual[index] -= projection * vector[index];
  }
  const remaining = norm(residual);
  if (!(remaining > 1e-7 * original)) return false;
  for (let index = 0; index < residual.length; index += 1) residual[index] /= remaining;
  basis.push(residual);
  return true;
}

function norm(vector: Float64Array): number {
  let sum = 0;
  for (let index = 0; index < vector.length; index += 1) sum += vector[index] * vector[index];
  return Math.sqrt(sum);
}

const KIND_PRIORITY = new Map(CAD_AUTO_CONSTRAIN_KINDS.map((kind, index) => [kind, index]));

function byKindPriority(a: CadConstraint, b: CadConstraint): number {
  const left = KIND_PRIORITY.get(a.kind) ?? 99;
  const right = KIND_PRIORITY.get(b.kind) ?? 99;
  if (left !== right) return left - right;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function sameConstraint(a: CadConstraint, b: CadConstraint): boolean {
  return (
    a.kind === b.kind &&
    a.entityIds.length === b.entityIds.length &&
    a.entityIds.every((id, index) => id === b.entityIds[index])
  );
}

const existingTouches = (constraints: readonly CadConstraint[], entityId: string) =>
  constraints.some((constraint) => constraint.entityIds.includes(entityId));

interface ScalarGeometry {
  form: string;
  center: { x: number; y: number };
  start: { x: number; y: number } | null;
  end: { x: number; y: number } | null;
  angle: number | null;
  length: number | null;
  radius: number | null;
}

/** Vista escalar de una parametrización, sin derivadas: aquí sólo se compara. */
function read(parametrization: CadEntityParametrization): ScalarGeometry {
  const values = parametrization.values;
  if (parametrization.form === "segment") {
    const [cx, cy, angle, length] = values;
    const hx = (Math.cos(angle) * length) / 2;
    const hy = (Math.sin(angle) * length) / 2;
    return {
      form: "segment",
      center: { x: cx, y: cy },
      start: { x: cx - hx, y: cy - hy },
      end: { x: cx + hx, y: cy + hy },
      angle,
      length,
      radius: null,
    };
  }
  if (parametrization.form === "circle")
    return {
      form: "circle",
      center: { x: values[0], y: values[1] },
      start: null, end: null, angle: null, length: null, radius: values[2],
    };
  if (parametrization.form === "arc") {
    const [cx, cy, radius, startAngle, endAngle] = values;
    return {
      form: "arc",
      center: { x: cx, y: cy },
      start: { x: cx + radius * Math.cos(startAngle), y: cy + radius * Math.sin(startAngle) },
      end: { x: cx + radius * Math.cos(endAngle), y: cy + radius * Math.sin(endAngle) },
      angle: null, length: null, radius,
    };
  }
  if (parametrization.form === "ellipse")
    return {
      form: "ellipse",
      center: { x: values[0], y: values[1] },
      start: null, end: null, angle: values[2], length: null, radius: values[3],
    };
  const count = values.length / 2;
  return {
    form: "points",
    center: { x: values[0], y: values[1] },
    start: { x: values[0], y: values[1] },
    end: { x: values[(count - 1) * 2], y: values[(count - 1) * 2 + 1] },
    angle: null, length: null, radius: null,
  };
}

/** Qué par de extremos se tocan, si es que alguno lo hace. */
function coincidentAnchors(
  a: ScalarGeometry,
  b: ScalarGeometry,
  tolerance: number,
): ["auto" | "start" | "end" | "center", "auto" | "start" | "end" | "center"] | null {
  const pointsOf = (geometry: ScalarGeometry) =>
    geometry.start && geometry.end
      ? ([["end", geometry.end], ["start", geometry.start]] as const)
      : ([["center", geometry.center]] as const);
  for (const [anchorA, pointA] of pointsOf(a))
    for (const [anchorB, pointB] of pointsOf(b))
      if (Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y) <= tolerance) return [anchorA, anchorB];
  return null;
}

/** Ángulo llevado a `[-π/2, π/2)`: las rectas no distinguen su sentido. */
function wrapHalfPi(angle: number): number {
  const pi = Math.PI;
  let wrapped = (angle + pi / 2) % pi;
  if (wrapped < 0) wrapped += pi;
  return wrapped - pi / 2;
}
