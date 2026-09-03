/**
 * Que el rótulo de una `.shx` llegue al papel DIBUJADO.
 *
 * Lo que se afirma es lo que cambia en el plan: qué comandos deja de haber, qué
 * comandos aparecen, con qué pluma, y que la familia que NO es una `.shx` con
 * trazos sigue siendo texto — porque convertirla sería empeorar el PDF.
 */
import { strict as assert } from "node:assert";
import type { CadPublishSheet, CadVectorCommand } from "../paper-space";
import {
  cadStrokeSheetText,
  cadStrokeTextCommands,
  cadStrokeTextPenWidth,
  cadStrokeTextWrap,
} from "./plot-stroke-text";
import { cadStrokeFamilyFor } from "../paper-space-stroke-text";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

const texto = (id: string, extra: Partial<Extract<CadVectorCommand, { kind: "text" }>> = {}): CadVectorCommand => ({
  kind: "text",
  entityId: id,
  viewportId: "vp",
  point: { x: 40, y: 60 },
  text: "PLANTA BAJA",
  size: 3,
  rotation: 0,
  color: "#101010",
  ...extra,
});

const hoja = (commands: CadVectorCommand[]): CadPublishSheet => ({
  id: "s1",
  name: "Hoja",
  width: 297,
  height: 210,
  orientation: "landscape",
  colorMode: "color",
  lineweightScale: 1,
  titleBlock: {},
  viewports: [{ id: "vp", name: "Ventana", clip: { x: 0, y: 0, width: 297, height: 210 }, scale: 100, locked: false, commands }],
});

// --- 1 · una .shx conocida deja de ser texto y pasa a ser trazos ------------
{
  const fuentes = new Map([["t1", "ISOCP.shx"]]);
  const convertido = cadStrokeTextCommands(texto("t1"), fuentes);
  ok(convertido && convertido.length > 0, "ISOCP.shx se convierte en trazos");
  ok(convertido!.every((command) => command.kind === "path"), "y todo lo devuelto son caminos");
  ok(
    convertido!.every((command) => command.kind === "path" && command.entityId === "t1" && command.viewportId === "vp"),
    "cada trazo conserva de quién es y en qué ventana va",
  );
  ok(
    convertido!.every((command) => command.kind === "path" && command.style.stroke === "#101010"),
    "y el color del rótulo, que es el que resolvió la tabla de plumas",
  );
  ok(
    convertido!.every((command) => command.kind === "path" && !command.closed),
    "un trazo de pluma nunca se cierra",
  );
}

// --- 2 · lo que no es una .shx con trazos SIGUE siendo texto ---------------
for (const familia of ["Arial", "Times New Roman", "gdt.shx"])
  eq(cadStrokeTextCommands(texto("t1"), new Map([["t1", familia]])), null, `${familia} se queda como texto`);
eq(cadStrokeTextCommands(texto("t1"), new Map()), null, "un rótulo sin familia declarada se queda como texto");
eq(
  cadStrokeTextCommands({ kind: "path", entityId: "p", viewportId: "vp", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: false, style: { stroke: "#000", lineWidth: 0.25 } }, new Map()),
  null,
  "un camino no se toca",
);

// --- 3 · el atributo de un bloque hereda la familia de su bloque -----------
{
  const fuentes = new Map([["b1", "romans.shx"]]);
  ok(cadStrokeTextCommands(texto("b1:attribute:NOMBRE"), fuentes), "el rótulo derivado usa la familia de su entidad");
}

// --- 4 · la pluma es la misma proporción que en pantalla -------------------
eq(cadStrokeTextPenWidth(14), 1, "altura entre catorce");
eq(cadStrokeTextPenWidth(8, true), 1, "y entre ocho si es negrita");
eq(cadStrokeTextPenWidth(0.1), 0.05, "nunca por debajo del suelo de la tabla de plumas");

// --- 5 · el ajuste de línea se hace con las anchuras REALES ----------------
{
  const familia = cadStrokeFamilyFor("txt")!;
  const largo = "MURO DE TABIQUE ROJO RECOCIDO DE QUINCE CENTIMETROS";
  eq(cadStrokeTextWrap(familia, largo, 3, undefined), largo, "sin anchura máxima no se parte nada");
  const partido = cadStrokeTextWrap(familia, largo, 3, 40);
  ok(partido.includes("\n"), "con anchura máxima se reparte en renglones");
  eq(partido.replace(/\n/g, " "), largo, "y no se pierde ni se repite una palabra");
  ok(
    partido.split("\n").every((linea) => linea.split(" ").length === 1 || linea.length < largo.length),
    "ningún renglón se queda con el párrafo entero",
  );
  eq(cadStrokeTextWrap(familia, "UNO\nDOS", 3, 500), "UNO\nDOS", "los saltos que ya traía se respetan");
}

// --- 6 · sobre la hoja entera: se convierte y se DICE qué se convirtió -----
{
  const resultado = cadStrokeSheetText(
    [hoja([texto("t1"), texto("t2", { entityId: "t2" }), { kind: "path", entityId: "p", viewportId: "vp", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], closed: false, style: { stroke: "#000", lineWidth: 0.25 } }])],
    new Map([
      ["t1", "isocp"],
      ["t2", "Arial"],
    ]),
  );
  const comandos = resultado.sheets[0].viewports[0].commands;
  eq(comandos.filter((command) => command.kind === "text").length, 1, "sólo sobrevive como texto el rótulo en Arial");
  eq(
    (comandos.find((command) => command.kind === "text") as Extract<CadVectorCommand, { kind: "text" }>).entityId,
    "t2",
    "y es el que se dibuja con una fuente de contorno",
  );
  ok(comandos.filter((command) => command.kind === "path" && command.entityId === "t1").length > 10, "el rótulo de ISOCP dejó muchos trazos");
  ok(comandos.some((command) => command.kind === "path" && command.entityId === "p"), "la geometría del dibujo sigue intacta");
  eq(resultado.strokedFamilies.join(","), "isocp", "y se declara QUÉ familia se trazó, para el informe de fuentes");
}

// --- 7 · una hoja sin ninguna .shx no cambia nada --------------------------
{
  const original = [hoja([texto("t1")])];
  const resultado = cadStrokeSheetText(original, new Map([["t1", "Arial"]]));
  eq(resultado.strokedFamilies.length, 0, "no se declara ninguna familia trazada");
  eq(resultado.sheets[0].viewports[0].commands.length, 1, "y el plan sigue teniendo el mismo comando");
}

console.log(`plot-stroke-text: ${verdes} comprobaciones verdes`);
