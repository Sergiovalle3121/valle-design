/**
 * Predicados, y la geometría de puntos que toda rutina de dibujo usa.
 *
 * ## `null` y `not` no son la misma función, aunque lo parezcan
 *
 * Ambas devuelven `T` para `nil`. La diferencia está en el uso: `null` pregunta
 * «¿esta lista está vacía?» y `not` pregunta «¿esto es falso?». Se implementan
 * igual porque en AutoLISP el vacío ES el falso, pero se declaran las dos
 * porque las rutinas usan la que corresponde a su intención y quien lee el
 * código cuenta con esa distinción.
 *
 * ## `angle`, `distance`, `polar`, `inters`
 *
 * Son las cuatro con las que se dibuja de verdad: dame el ángulo entre dos
 * puntos, la distancia, un punto a tanta distancia en tal dirección, y dónde se
 * cortan dos rectas. Un cajetín parametrizado no es más que `polar` cincuenta
 * veces. Los ángulos van en RADIANES, como en el original.
 */
import { badArgumentType } from "../errors";
import { printLisp } from "../printer";
import {
  NIL,
  bool,
  eq,
  equal,
  isNumber,
  pointOf,
  pointValue,
  real,
  truthy,
  type LispPoint,
  type LispValue,
} from "../values";
import { defsubr, wantNumber, type BuiltinTable } from "./define";

function wantPoint(name: string, value: LispValue): LispPoint {
  const point = pointOf(value);
  if (!point) throw badArgumentType(`${name}: point`, printLisp(value));
  return point;
}

export function installPredicates(table: BuiltinTable): void {
  defsubr(table, "null", 1, 1, (args) => bool(args[0].t === "nil"));
  defsubr(table, "not", 1, 1, (args) => bool(!truthy(args[0])));
  defsubr(table, "atom", 1, 1, (args) => bool(args[0].t !== "cons"));
  defsubr(table, "listp", 1, 1, (args) => bool(args[0].t === "cons" || args[0].t === "nil"));
  defsubr(table, "numberp", 1, 1, (args) => bool(isNumber(args[0])));
  defsubr(table, "stringp", 1, 1, (args) => bool(args[0].t === "str"));
  defsubr(table, "boundp", 1, 1, (args, ctx) =>
    bool(args[0].t === "sym" && truthy(ctx.lookup(args[0].name))));
  defsubr(table, "minusp", 1, 1, (args) => bool(isNumber(args[0]) && args[0].v < 0));
  defsubr(table, "vl-symbolp", 1, 1, (args) => bool(args[0].t === "sym"));
  defsubr(table, "vl-consp", 1, 1, (args) => bool(args[0].t === "cons"));

  defsubr(table, "eq", 2, 2, (args) => bool(eq(args[0], args[1])));
  defsubr(table, "equal", 2, 3, (args) => {
    const fuzz = args.length > 2 ? wantNumber(args[2]).v : 0;
    return bool(equal(args[0], args[1], fuzz));
  });

  // --- geometría de puntos ---------------------------------------------------

  defsubr(table, "distance", 2, 2, (args) => {
    const a = wantPoint("distance", args[0]);
    const b = wantPoint("distance", args[1]);
    return real(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  });

  /**
   * `angle` devuelve SIEMPRE un valor en [0, 2π). AutoCAD normaliza, y hay
   * rutinas de numeración de ejes que comparan el resultado con `pi` para
   * decidir a qué lado escriben la etiqueta: un valor negativo las manda al
   * lado contrario.
   */
  defsubr(table, "angle", 2, 2, (args) => {
    const a = wantPoint("angle", args[0]);
    const b = wantPoint("angle", args[1]);
    const raw = Math.atan2(b.y - a.y, b.x - a.x);
    return real(raw < 0 ? raw + Math.PI * 2 : raw);
  });

  defsubr(table, "polar", 3, 3, (args) => {
    const base = wantPoint("polar", args[0]);
    const angle = wantNumber(args[1]).v;
    const distance = wantNumber(args[2]).v;
    return pointValue({
      x: base.x + Math.cos(angle) * distance,
      y: base.y + Math.sin(angle) * distance,
      z: base.z,
    });
  });

  /**
   * `(inters p1 p2 p3 p4 [segmentos])`: intersección de dos rectas. Con el
   * quinto argumento a nil las rectas son INFINITAS; sin él, se exige que el
   * corte caiga dentro de ambos segmentos.
   *
   * Devuelve `nil` para rectas paralelas en vez de un punto en el infinito. Un
   * punto no finito viajaría hasta el documento y lo rechazaría la validación
   * al guardar, muy lejos de aquí.
   */
  defsubr(table, "inters", 4, 5, (args) => {
    const p1 = wantPoint("inters", args[0]);
    const p2 = wantPoint("inters", args[1]);
    const p3 = wantPoint("inters", args[2]);
    const p4 = wantPoint("inters", args[3]);
    const bounded = args.length < 5 || truthy(args[4]);

    const d1x = p2.x - p1.x;
    const d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x;
    const d2y = p4.y - p3.y;
    const denominator = d1x * d2y - d1y * d2x;
    if (Math.abs(denominator) < 1e-12) return NIL;

    const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denominator;
    const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denominator;
    if (bounded && (t < 0 || t > 1 || u < 0 || u > 1)) return NIL;
    return pointValue({ x: p1.x + d1x * t, y: p1.y + d1y * t, z: 0 });
  });

  defsubr(table, "trans", 2, 4, (args) => {
    // Sin sistemas de coordenadas de usuario en el documento canónico, `trans`
    // sólo puede ser la identidad. Se declara —muchas rutinas la llaman por
    // costumbre entre WCS y WCS— y se RECHAZA explícitamente cuando los
    // sistemas difieren, en vez de devolver el punto tal cual y mentir.
    const point = wantPoint("trans", args[0]);
    const from = args[1];
    const to = args[2] ?? args[1];
    const same =
      (isNumber(from) && isNumber(to) && from.v === to.v) ||
      (from.t === "nil" && to.t === "nil");
    if (!same)
      throw badArgumentType(
        "trans",
        "sólo se admite la identidad: el documento canónico no modela UCS ni DCS todavía",
      );
    return pointValue(point);
  });
}
