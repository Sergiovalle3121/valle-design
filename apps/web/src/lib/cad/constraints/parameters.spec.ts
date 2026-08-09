/**
 * Parámetros con nombre y expresiones.
 *
 * Con anclas absolutas: no basta con «se evalúa», hay que decir qué número sale.
 */
import { strict as assert } from "node:assert";
import type { CadParameter } from "./constraint-schema";
import { deleteCadParameter, evaluateCadParameters, setCadParameter } from "./parameters";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const close = (actual: number | undefined, expected: number, tolerance: number, message: string) =>
  ok(actual !== undefined && Math.abs(actual - expected) <= tolerance, `${message} (${actual} vs ${expected})`);

const parameter = (name: string, expression: string, comment?: string): CadParameter => ({
  name, expression, value: 0, ...(comment === undefined ? {} : { comment }),
});

// ---------------------------------------------------------------------------
// Evaluación en orden topológico
// ---------------------------------------------------------------------------

{
  const table = evaluateCadParameters([
    parameter("huecos", "ceil(largo / 600)"),
    parameter("alto", "ancho * 0.618"),
    parameter("ancho", "1200"),
    parameter("largo", "ancho * 2 + 100"),
  ]);
  assert.deepEqual(table.issues, [], "una tabla correcta no tiene incidencias");
  checks += 1;
  close(table.values.get("ancho"), 1200, 0, "ancho = 1200");
  close(table.values.get("alto"), 741.6, 1e-9, "alto = ancho * 0.618");
  close(table.values.get("largo"), 2500, 0, "largo = ancho * 2 + 100");
  close(table.values.get("huecos"), 5, 0, "huecos = ceil(2500 / 600) = 5");
  // El orden de EVALUACIÓN es topológico aunque la tabla venga desordenada.
  ok(table.order.indexOf("ancho") < table.order.indexOf("alto"), "ancho se evalúa antes que alto");
  ok(table.order.indexOf("largo") < table.order.indexOf("huecos"), "largo antes que huecos");
  // La tabla devuelta lleva el valor puesto al día, conservando el orden de entrada.
  assert.deepEqual(table.parameters.map((entry) => entry.name), ["huecos", "alto", "ancho", "largo"]);
  checks += 1;
  close(table.parameters[1].value, 741.6, 1e-9, "el `value` persistido se actualiza");
}

// ---------------------------------------------------------------------------
// Funciones, constantes y unidades
// ---------------------------------------------------------------------------

{
  const table = evaluateCadParameters([
    parameter("a", "sin(30)"),
    parameter("b", "cos(60)"),
    parameter("c", "sqrt(16) + abs(-3)"),
    parameter("d", "round(2.6) + floor(2.9) + ceil(2.1)"),
    parameter("e", "atan(1)"),
    parameter("f", "pi"),
    parameter("g", "2 ^ 10"),
    parameter("h", "-3 + 10 % 4"),
    parameter("i", "max(3, 7) * min(2, 5)"),
    parameter("j", "(1 + 2) * 3"),
  ]);
  assert.deepEqual(table.issues, [], "el catálogo de funciones evalúa sin incidencias");
  checks += 1;
  close(table.values.get("a"), 0.5, 1e-12, "sin(30) = 0,5: los ángulos van en GRADOS");
  close(table.values.get("b"), 0.5, 1e-12, "cos(60) = 0,5");
  close(table.values.get("c"), 7, 0, "sqrt(16) + abs(-3) = 7");
  close(table.values.get("d"), 8, 0, "round/floor/ceil");
  close(table.values.get("e"), 45, 1e-12, "atan(1) = 45 grados");
  close(table.values.get("f"), Math.PI, 1e-15, "pi");
  close(table.values.get("g"), 1024, 0, "2^10");
  close(table.values.get("h"), -1, 0, "precedencia de % sobre +");
  close(table.values.get("i"), 14, 0, "max/min");
  close(table.values.get("j"), 9, 0, "los paréntesis mandan");
}

{
  // Unidades: el sufijo se convierte a la unidad del documento.
  const inMillimetres = evaluateCadParameters([parameter("largo", "1.5m + 20cm")], { unit: "mm" });
  close(inMillimetres.values.get("largo"), 1700, 1e-9, "1,5 m + 20 cm son 1700 mm");
  const inMetres = evaluateCadParameters([parameter("largo", "1.5m + 20cm")], { unit: "m" });
  close(inMetres.values.get("largo"), 1.7, 1e-12, "el mismo dibujo en metros da 1,7");
  const inches = evaluateCadParameters([parameter("ancho", "12in")], { unit: "mm" });
  close(inches.values.get("ancho"), 304.8, 1e-9, "12 pulgadas son 304,8 mm");
  const unknown = evaluateCadParameters([parameter("x", "5furlong")]);
  ok(
    unknown.issues.some((issue) => issue.code === "parameter_invalid_expression" && issue.message.includes("furlong")),
    "una unidad desconocida se rechaza por su nombre",
  );
}

// ---------------------------------------------------------------------------
// Ciclos: se rechazan diciendo CUÁL es el ciclo
// ---------------------------------------------------------------------------

{
  const table = evaluateCadParameters([parameter("a", "b + 1"), parameter("b", "a * 2")]);
  const cycle = table.issues.find((issue) => issue.code === "parameter_cycle");
  ok(cycle !== undefined, "el ciclo se detecta");
  ok(cycle?.message.includes("a → b → a") === true, `el mensaje dibuja el ciclo: ${cycle?.message}`);
  assert.deepEqual(cycle?.parameterNames, ["a", "b"], "y nombra a los dos implicados");
  checks += 1;
  ok(!table.values.has("a") && !table.values.has("b"), "ninguno de los dos recibe valor");
}

{
  // Ciclo largo y autorreferencia.
  const longCycle = evaluateCadParameters([
    parameter("x", "y"), parameter("y", "z"), parameter("z", "x"), parameter("libre", "7"),
  ]);
  ok(
    longCycle.issues.some((issue) => issue.code === "parameter_cycle" && issue.message.includes("x → y → z → x")),
    "un ciclo de tres también se dibuja entero",
  );
  close(longCycle.values.get("libre"), 7, 0, "y lo que no está en el ciclo se sigue evaluando");
  const self = evaluateCadParameters([parameter("s", "s + 1")]);
  ok(self.issues.some((issue) => issue.code === "parameter_cycle"), "la autorreferencia es un ciclo");
}

// ---------------------------------------------------------------------------
// Errores con nombre
// ---------------------------------------------------------------------------

{
  const bad = evaluateCadParameters([
    parameter("2mal", "1"),
    parameter("falta", "noExiste * 2"),
    parameter("rota", "3 +"),
    parameter("cero", "1 / 0"),
  ]);
  const codes = bad.issues.map((issue) => issue.code).sort();
  ok(codes.includes("parameter_invalid_name"), "nombre inválido");
  ok(codes.includes("parameter_unknown_reference"), "referencia desconocida");
  ok(codes.includes("parameter_invalid_expression"), "expresión que no compila");
  ok(
    bad.issues.some((issue) => issue.message.includes("División por cero")),
    "la división por cero se explica, no se devuelve como Infinity",
  );
  ok(!bad.values.has("cero"), "y el parámetro roto se queda sin valor");
}

// ---------------------------------------------------------------------------
// Escritura: alta, modificación y baja
// ---------------------------------------------------------------------------

{
  let table: CadParameter[] = [];
  const first = setCadParameter(table, { name: "ancho", expression: "1200", comment: "hueco libre" });
  ok(first.ok, "alta de un parámetro");
  table = first.parameters;
  close(table[0].value, 1200, 0, "el alta ya deja el valor evaluado");
  ok(table[0].comment === "hueco libre", "y conserva el comentario");

  const second = setCadParameter(table, { name: "alto", expression: "ancho * 0.618" });
  ok(second.ok, "alta de un parámetro derivado");
  table = second.parameters;
  close(table[1].value, 741.6, 1e-9, "alto = 741,6");

  // Cambiar `ancho` reevalúa `alto` en el mismo paso.
  const changed = setCadParameter(table, { name: "ancho", expression: "2000" });
  ok(changed.ok, "modificar un parámetro");
  table = changed.parameters;
  close(table.find((entry) => entry.name === "ancho")?.value, 2000, 0, "ancho = 2000");
  close(table.find((entry) => entry.name === "alto")?.value, 1236, 1e-9, "y alto se recalcula solo");
  ok(table.find((entry) => entry.name === "ancho")?.comment === "hueco libre", "el comentario sobrevive a la edición");

  // Un cambio que introduce un ciclo se rechaza ENTERO.
  const cyclic = setCadParameter(table, { name: "ancho", expression: "alto + 1" });
  ok(!cyclic.ok, "un cambio que crea un ciclo se rechaza");
  assert.deepEqual(cyclic.parameters, table, "y la tabla vuelve exactamente como estaba");
  checks += 1;
  ok(cyclic.issues.some((issue) => issue.code === "parameter_cycle"), "diciendo que es un ciclo");

  // Borrar algo en uso se rechaza nombrando a quien lo usa.
  const blocked = deleteCadParameter(table, "ancho");
  ok(!blocked.ok, "no se borra un parámetro en uso");
  ok(blocked.issues[0]?.message.includes("alto"), "y se dice quién lo usa");
  assert.deepEqual(blocked.parameters, table, "la tabla no se toca");
  checks += 1;

  const removed = deleteCadParameter(table, "alto");
  ok(removed.ok, "borrar una hoja del grafo sí se puede");
  assert.deepEqual(removed.parameters.map((entry) => entry.name), ["ancho"], "y desaparece de la tabla");
  checks += 1;

  ok(!deleteCadParameter(table, "inexistente").ok, "borrar lo que no existe se rechaza");
  ok(!setCadParameter(table, { name: "con espacio", expression: "1" }).ok, "un nombre inválido se rechaza");
  ok(!setCadParameter(table, { name: "malo", expression: "sqrt(" }).ok, "una expresión rota se rechaza");
}

console.log(`cad parameters spec: ${checks} comprobaciones verdes`);
