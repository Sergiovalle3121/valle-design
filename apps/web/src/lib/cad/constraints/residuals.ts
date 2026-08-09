/**
 * Residuos y derivadas de cada tipo de restricción.
 *
 * Una restricción es una ecuación `r(v) = 0`. El solucionador sólo sabe de
 * vectores de residuos y de su jacobiano; TODO el conocimiento geométrico está
 * aquí.
 *
 * Dos decisiones que no son obvias y que se pagan caras si se toman al revés:
 *
 * **Los residuos van en unidades de LONGITUD.** Un residuo angular en radianes
 * y uno de distancia en milímetros no se pueden comparar con la misma
 * tolerancia: en un dibujo en milímetros, 1e-6 rad es una barbaridad y 1e-6 mm
 * es nada. Los angulares se multiplican por el tamaño característico de la
 * entidad, así que «converge a 1e-6» significa lo mismo para todos.
 *
 * **El CASO se congela al preparar el sistema, no se recalcula cada paso.** La
 * tangencia círculo-círculo tiene dos soluciones —externa `d = r1 + r2` e
 * interna `d = |r1 - r2|`— y la del valor absoluto no es derivable en `r1 = r2`.
 * Se elige una vez, mirando la configuración inicial, y se mantiene: un caso que
 * cambia entre iteraciones hace que el solucionador oscile para siempre entre
 * dos soluciones que ambas «convergen».
 */
import type { CadConstraint } from "./constraint-schema";
import {
  dAdd,
  dAngleDiffHalfPi,
  dAngleDiffPi,
  dCos,
  dCross,
  dHypot,
  dMul,
  dScale,
  dShift,
  dSin,
  dSub,
  dualConst,
  type Dual,
} from "./autodiff";
import type { DualGeometry, DualPoint } from "./variables";

export type ConstraintEvaluation =
  | { ok: true; rows: Dual[] }
  | { ok: false; code: string; message: string };

/**
 * Decisiones tomadas UNA vez al preparar el sistema y constantes durante toda
 * la iteración. `sign` es el lado de la tangencia recta-círculo; `mode` el caso
 * de la tangencia círculo-círculo.
 */
export interface ConstraintPlan {
  sign: number;
  mode: "external" | "internal" | null;
  /** Valor numérico ya resuelto (literal o evaluado desde un parámetro). */
  value: number | null;
  /** Tamaño característico del grupo, para pasar los ángulos a longitud. */
  scale: number;
}

const reject = (code: string, message: string): ConstraintEvaluation => ({ ok: false, code, message });

const anchorOf = (constraint: CadConstraint, index: number) =>
  constraint.anchors?.[index] ?? "auto";

/**
 * Punto característico. `auto` elige el que tiene sentido para cada forma: el
 * extremo de un segmento (para encadenar polilíneas de líneas sueltas, que es
 * el uso real de `coincident`) y el centro de todo lo redondo.
 */
function anchorPoint(geometry: DualGeometry, anchor: string, fallback: "start" | "end" | "center"): DualPoint | null {
  const resolved = anchor === "auto" ? fallback : anchor;
  if (resolved === "center") return geometry.center;
  if (resolved === "start") return geometry.start ?? geometry.center;
  if (resolved === "end") return geometry.end ?? geometry.center;
  return null;
}

const defaultAnchor = (geometry: DualGeometry, index: number): "start" | "end" | "center" => {
  if (geometry.form === "circle" || geometry.form === "ellipse") return "center";
  // Encadenar: el FIN del primero contra el INICIO del segundo. Es lo que hacía
  // el aplicador anterior y lo que espera quien une dos tramos.
  return index === 0 ? "end" : "start";
};

/** Evalúa una restricción sobre las geometrías duales de sus entidades. */
export function evaluateConstraint(
  constraint: CadConstraint,
  geometries: readonly DualGeometry[],
  plan: ConstraintPlan,
  size: number,
): ConstraintEvaluation {
  const kind = constraint.kind;
  const [first, second, third] = geometries;
  if (!first) return reject("constraint_missing_entity", `${kind}: no hay ninguna entidad resoluble.`);
  const scale = plan.scale;

  if (kind === "fix") return { ok: true, rows: [] };

  if (kind === "horizontal" || kind === "vertical") {
    if (!first.angle)
      return reject("constraint_unsupported", `${kind} necesita una entidad con dirección; ${first.entityType} no la tiene.`);
    const target = kind === "horizontal" ? 0 : Math.PI / 2;
    return { ok: true, rows: [dScale(dAngleDiffHalfPi(first.angle, dualConst(target, size)), scale)] };
  }

  if (kind === "parallel" || kind === "perpendicular" || kind === "collinear") {
    if (!second) return reject("constraint_missing_entity", `${kind} necesita dos entidades.`);
    if (!first.angle || !second.angle)
      return reject("constraint_unsupported", `${kind} necesita dos entidades con dirección (${first.entityType}/${second.entityType}).`);
    // El residuo es `wrap(θ_segunda - θ_primera - offset)`, y ese ORDEN importa
    // en el empate exacto: partiendo de perpendicular, las dos soluciones están
    // a la misma distancia y el desempate de `wrapToHalfPi` gira la SEGUNDA en
    // sentido antihorario. Escrito al revés, girar un muro perpendicular a otro
    // lo dejaba a -90° en vez de a +90°: la misma recta, pero con los extremos
    // intercambiados y una rotación que el usuario no pidió.
    const offset = kind === "perpendicular" ? Math.PI / 2 : 0;
    const rows = [
      dScale(dAngleDiffHalfPi(second.angle, dShift(first.angle, offset)), scale),
    ];
    if (kind === "collinear") {
      // Además de paralelas, la MISMA recta soporte: el centro de la segunda
      // cae sobre la recta de la primera. `cos`/`sin` son DUALES, no constantes:
      // la dirección de la primera es una variable del sistema y congelarla en
      // el jacobiano dejaría a Newton sin saber que girándola también se
      // cumple la restricción.
      const cos = dCos(first.angle);
      const sin = dSin(first.angle);
      rows.push(
        dSub(
          dMul(cos, dSub(second.center.y, first.center.y)),
          dMul(sin, dSub(second.center.x, first.center.x)),
        ),
      );
    }
    return { ok: true, rows };
  }

  if (kind === "coincident") {
    if (!second) return reject("constraint_missing_entity", "coincident necesita dos entidades.");
    const a = anchorPoint(first, anchorOf(constraint, 0), defaultAnchor(first, 0));
    const b = anchorPoint(second, anchorOf(constraint, 1), defaultAnchor(second, 1));
    if (!a || !b) return reject("constraint_unsupported", "coincident no encuentra los puntos indicados.");
    return { ok: true, rows: [dSub(a.x, b.x), dSub(a.y, b.y)] };
  }

  if (kind === "equalLength") {
    if (!second) return reject("constraint_missing_entity", "equalLength necesita dos entidades.");
    if (!first.length || !second.length)
      return reject("constraint_unsupported", `equalLength necesita dos segmentos (${first.entityType}/${second.entityType}).`);
    return { ok: true, rows: [dSub(first.length, second.length)] };
  }

  if (kind === "equalRadius") {
    if (!second) return reject("constraint_missing_entity", "equalRadius necesita dos entidades.");
    if (!first.radius || !second.radius)
      return reject("constraint_unsupported", `equalRadius necesita dos entidades con radio (${first.entityType}/${second.entityType}).`);
    return { ok: true, rows: [dSub(first.radius, second.radius)] };
  }

  if (kind === "concentric") {
    if (!second) return reject("constraint_missing_entity", "concentric necesita dos entidades.");
    if (!first.radius || !second.radius)
      return reject("constraint_unsupported", `concentric necesita dos entidades con centro propio (${first.entityType}/${second.entityType}).`);
    return { ok: true, rows: [dSub(first.center.x, second.center.x), dSub(first.center.y, second.center.y)] };
  }

  if (kind === "radius" || kind === "diameter") {
    if (plan.value === null) return reject("constraint_invalid", `${kind} necesita un valor.`);
    if (!first.radius)
      return reject("constraint_unsupported", `${kind} necesita una entidad con radio; ${first.entityType} no lo tiene.`);
    const factor = kind === "diameter" ? 2 : 1;
    return { ok: true, rows: [dShift(dScale(first.radius, factor), -plan.value)] };
  }

  if (kind === "distance") return distanceRows(constraint, first, second, plan);
  if (kind === "angle") return angleRows(first, second, plan, size, scale);
  if (kind === "tangent") return tangentRows(first, second, plan);
  if (kind === "symmetric") return symmetricRows(constraint, first, second, third);
  if (kind === "smooth") return smoothRows(first, second, plan);

  return reject("constraint_unknown", `Tipo de restricción desconocido: ${kind}.`);
}

function distanceRows(
  constraint: CadConstraint,
  first: DualGeometry,
  second: DualGeometry | undefined,
  plan: ConstraintPlan,
): ConstraintEvaluation {
  if (plan.value === null) return reject("constraint_invalid", "distance necesita un valor.");
  if (!second) {
    if (!first.length)
      return reject("constraint_unsupported", `distance sobre una sola entidad necesita un segmento; ${first.entityType} no lo es.`);
    if (!(plan.value > 0)) return reject("constraint_invalid", "La distancia debe ser mayor que cero.");
    return { ok: true, rows: [dShift(first.length, -plan.value)] };
  }
  const a = anchorPoint(first, anchorOf(constraint, 0), first.form === "segment" ? "start" : "center");
  const b = anchorPoint(second, anchorOf(constraint, 1), second.form === "segment" ? "start" : "center");
  if (!a || !b) return reject("constraint_unsupported", "distance no encuentra los puntos indicados.");
  return { ok: true, rows: [dShift(dHypot(dSub(a.x, b.x), dSub(a.y, b.y)), -plan.value)] };
}

function angleRows(
  first: DualGeometry,
  second: DualGeometry | undefined,
  plan: ConstraintPlan,
  size: number,
  scale: number,
): ConstraintEvaluation {
  if (plan.value === null || !Number.isFinite(plan.value))
    return reject("constraint_invalid", "El ángulo debe ser finito.");
  const radians = (plan.value * Math.PI) / 180;
  if (!first.angle)
    return reject("constraint_unsupported", `angle necesita una entidad con dirección; ${first.entityType} no la tiene.`);
  if (!second) {
    // Ángulo ABSOLUTO: sí distingue 0° de 180°, porque el usuario que escribe
    // «esta línea a 30°» está diciendo también hacia dónde apunta.
    return { ok: true, rows: [dScale(dAngleDiffPi(first.angle, dualConst(radians, size)), scale)] };
  }
  if (!second.angle)
    return reject("constraint_unsupported", `angle entre dos entidades necesita dirección en ambas (${second.entityType}).`);
  // Ángulo ENTRE dos rectas: módulo π, porque una recta no tiene sentido.
  return {
    ok: true,
    rows: [dScale(dAngleDiffHalfPi(dSub(second.angle, first.angle), dualConst(radians, size)), scale)],
  };
}

function tangentRows(
  first: DualGeometry,
  second: DualGeometry | undefined,
  plan: ConstraintPlan,
): ConstraintEvaluation {
  if (!second) return reject("constraint_missing_entity", "tangent necesita dos entidades.");
  const line = first.angle && first.length ? first : second.angle && second.length ? second : null;
  const round = first.radius && first.form !== "ellipse" ? first : second.radius && second.form !== "ellipse" ? second : null;

  if (line && round) {
    // Recta-círculo: dist(centro, recta) - r = 0, con la distancia CON SIGNO
    // para que sea derivable. El signo dice de qué lado queda el círculo y se
    // congela al preparar: cambiarlo a mitad de la iteración haría que el
    // círculo saltase de un lado a otro de la recta en cada paso.
    const cos = dCos(line.angle!);
    const sin = dSin(line.angle!);
    const dx = dSub(round.center.x, line.center.x);
    const dy = dSub(round.center.y, line.center.y);
    const signed = dSub(dMul(cos, dy), dMul(sin, dx));
    return { ok: true, rows: [dSub(signed, dScale(round.radius!, plan.sign))] };
  }

  const a = first.radius && first.form !== "ellipse" ? first : null;
  const b = second.radius && second.form !== "ellipse" ? second : null;
  if (a && b) {
    const distance = dHypot(dSub(a.center.x, b.center.x), dSub(a.center.y, b.center.y));
    if (plan.mode === "internal")
      // Interna: `d - |r1 - r2| = 0`. El valor absoluto se sustituye por el
      // signo congelado, que además de derivable dice CUÁL contiene a cuál.
      return { ok: true, rows: [dSub(distance, dScale(dSub(a.radius!, b.radius!), plan.sign))] };
    return { ok: true, rows: [dSub(distance, dAdd(a.radius!, b.radius!))] };
  }

  return reject(
    "constraint_unsupported",
    `tangent admite recta-círculo, recta-arco y círculo-círculo; recibió ${first.entityType}/${second.entityType}.`,
  );
}

function symmetricRows(
  constraint: CadConstraint,
  first: DualGeometry,
  second: DualGeometry | undefined,
  axis: DualGeometry | undefined,
): ConstraintEvaluation {
  if (!second || !axis)
    return reject("constraint_missing_entity", "symmetric necesita dos entidades y un eje: [a, b, eje].");
  if (!axis.angle)
    return reject("constraint_unsupported", `El eje de symmetric tiene que ser un segmento; ${axis.entityType} no lo es.`);
  if (first.form !== second.form)
    return reject("constraint_unsupported", `symmetric necesita dos entidades de la misma forma (${first.entityType}/${second.entityType}).`);

  const cos = dCos(axis.angle);
  const sin = dSin(axis.angle);
  /** Reflexión respecto de la recta que pasa por el centro del eje. */
  const mirror = (point: DualPoint): DualPoint => {
    const dx = dSub(point.x, axis.center.x);
    const dy = dSub(point.y, axis.center.y);
    const along = dAdd(dMul(dx, cos), dMul(dy, sin));
    const across = dSub(dMul(dy, cos), dMul(dx, sin));
    return {
      x: dAdd(axis.center.x, dSub(dMul(along, cos), dMul(dScale(across, -1), sin))),
      y: dAdd(axis.center.y, dAdd(dMul(along, sin), dMul(dScale(across, -1), cos))),
    };
  };

  const rows: Dual[] = [];
  const pairs: Array<[DualPoint, DualPoint]> =
    first.form === "segment" && first.start && first.end && second.start && second.end
      ? anchorOf(constraint, 0) === "auto"
        ? [
            [first.start, second.start],
            [first.end, second.end],
          ]
        : [[first.center, second.center]]
      : [[first.center, second.center]];
  for (const [a, b] of pairs) {
    const reflected = mirror(a);
    rows.push(dSub(reflected.x, b.x), dSub(reflected.y, b.y));
  }
  // Dos círculos simétricos son además IGUALES: sin esto, «simétrico» dejaría
  // pasar dos circunferencias enfrentadas de radios distintos.
  if (first.radius && second.radius) rows.push(dSub(first.radius, second.radius));
  return { ok: true, rows };
}

/**
 * Continuidad G2 entre dos splines que se encuentran.
 *
 * **Supuesto declarado**: los extremos se tratan como los de una Bézier sujeta
 * (clamped), que es lo que produce el editor y lo que importan los DXF de este
 * repositorio. Para un NURBS con nudos arbitrarios la curvatura de extremo lleva
 * además un factor que depende del vector de nudos; NO se aplica aquí, así que
 * sobre esa geometría la restricción impone una continuidad aproximada. Se dice
 * en voz alta en vez de fingir un caso general que no está implementado.
 */
function smoothRows(
  first: DualGeometry,
  second: DualGeometry | undefined,
  plan: ConstraintPlan,
): ConstraintEvaluation {
  if (!second) return reject("constraint_missing_entity", "smooth necesita dos curvas.");
  if (first.form !== "points" || second.form !== "points")
    return reject("constraint_unsupported", `smooth es para splines; recibió ${first.entityType}/${second.entityType}.`);
  if (first.points.length < 3 || second.points.length < 3)
    return reject("constraint_unsupported", "smooth necesita al menos tres puntos de control por spline.");

  const p = first.points;
  const q = second.points;
  const end = p[p.length - 1];
  const before = p[p.length - 2];
  const beforeThat = p[p.length - 3];
  const d1x = dSub(end.x, before.x);
  const d1y = dSub(end.y, before.y);
  const e1x = dSub(before.x, beforeThat.x);
  const e1y = dSub(before.y, beforeThat.y);
  const d2x = dSub(q[1].x, q[0].x);
  const d2y = dSub(q[1].y, q[0].y);
  const e2x = dSub(q[2].x, q[1].x);
  const e2y = dSub(q[2].y, q[1].y);

  const scale = Math.max(plan.scale, 1e-9);
  const rows: Dual[] = [
    // G0: se tocan.
    dSub(end.x, q[0].x),
    dSub(end.y, q[0].y),
    // G1: misma tangente. Se divide por la escala para dejarlo en longitud.
    dScale(dCross(d1x, d1y, d2x, d2y), 1 / scale),
  ];
  // G2: misma curvatura con signo. κ = (p-1)/p · (d x e) / |d|³.
  const curvature = (
    dx: Dual,
    dy: Dual,
    ex: Dual,
    ey: Dual,
    degree: number,
  ): Dual => {
    const norm = Math.max(Math.hypot(dx.v, dy.v), 1e-9);
    const factor = ((degree - 1) / degree) / (norm * norm * norm);
    return dScale(dCross(dx, dy, ex, ey), factor);
  };
  rows.push(
    dScale(
      dSub(
        curvature(d1x, d1y, e1x, e1y, Math.max(p.length - 1, 2)),
        curvature(d2x, d2y, e2x, e2y, Math.max(q.length - 1, 2)),
      ),
      scale * scale,
    ),
  );
  return { ok: true, rows };
}

/**
 * Elige el caso y el signo de una restricción a partir de la configuración
 * INICIAL. Se llama una vez por sistema.
 */
export function planConstraint(
  constraint: CadConstraint,
  geometries: readonly { form: string; center: { x: number; y: number }; angle: number | null; radius: number | null }[],
  value: number | null,
  scale: number,
): ConstraintPlan {
  const plan: ConstraintPlan = { sign: 1, mode: null, value, scale };
  if (constraint.kind !== "tangent") return plan;
  const [a, b] = geometries;
  if (!a || !b) return plan;
  const line = a.angle !== null && a.radius === null ? a : b.angle !== null && b.radius === null ? b : null;
  const round = a.radius !== null ? a : b.radius !== null ? b : null;
  if (line && round && line !== round) {
    const signed =
      Math.cos(line.angle!) * (round.center.y - line.center.y) -
      Math.sin(line.angle!) * (round.center.x - line.center.x);
    plan.sign = signed < 0 ? -1 : 1;
    return plan;
  }
  if (a.radius !== null && b.radius !== null) {
    const distance = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
    const external = Math.abs(distance - (a.radius + b.radius));
    const internal = Math.abs(distance - Math.abs(a.radius - b.radius));
    const declared = constraint.tangency;
    plan.mode = declared ?? (internal < external ? "internal" : "external");
    plan.sign = a.radius - b.radius < 0 ? -1 : 1;
  }
  return plan;
}
