/**
 * El sitio único donde una longitud se vuelve texto, comprobado como sitio
 * único: el MISMO número, cruzado por los cinco `LUNITS` y por las cinco
 * unidades de dibujo, y siempre con el rótulo que ese dibujo debe llevar.
 *
 * Lo que esta spec vigila de verdad no son las cadenas: es que el rótulo dependa
 * del DOCUMENTO. Un formateador que ignora la unidad del dibujo da un número
 * correcto de otra pregunta —266'-8 3/8" para un muro de 3.2 m— y eso es lo que
 * pasaba antes de este módulo, porque `unit-format.ts` interpreta su argumento
 * en pulgadas siempre y `dimension-format.ts` no sabe qué es una pulgada.
 *
 * Correr:  npx tsx src/lib/cad/units-label.spec.ts
 */
import assert from "node:assert/strict";
import { createCadVariableAccess } from "./system-variables";
import { formatLength, type UnitSystem } from "./unit-format";
import { parseImperialLength, type CadDrawingUnit } from "./units-imperial";
import {
  cadLengthLabel,
  cadLengthLabelFromVariables,
  cadLengthLabelOptions,
  cadLengthSystemFromLunits,
  cadLengthSystemIsImperial,
} from "./units-label";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

/* ── LUNITS → sistema ─────────────────────────────────────────────────────── */

eq(cadLengthSystemFromLunits(1), "scientific" as UnitSystem, "LUNITS 1 es científico");
eq(cadLengthSystemFromLunits(2), "decimal" as UnitSystem, "LUNITS 2 es decimal");
eq(cadLengthSystemFromLunits(3), "engineering" as UnitSystem, "LUNITS 3 es ingeniería");
eq(cadLengthSystemFromLunits(4), "architectural" as UnitSystem, "LUNITS 4 es arquitectónico");
eq(cadLengthSystemFromLunits(5), "fractional" as UnitSystem, "LUNITS 5 es fraccionario");
eq(cadLengthSystemFromLunits(99), "decimal" as UnitSystem, "y fuera de rango cae en decimal");
ok(cadLengthSystemIsImperial("architectural"), "arquitectónico lleva la unidad dentro del texto");
ok(cadLengthSystemIsImperial("engineering"), "ingeniería también");
ok(!cadLengthSystemIsImperial("fractional"), "fraccionario NO: es sólo una forma de escribir un número");

/* ── EL MURO DE 10'-6", CRUZADO POR LAS CINCO UNIDADES DE DIBUJO ──────────── */

/**
 * 126 pulgadas, guardadas en cada unidad posible. El rótulo arquitectónico tiene
 * que salir el mismo en las cinco: si el documento declara su unidad, el
 * dibujante no debería notar en qué la guardó.
 */
const MURO: readonly (readonly [CadDrawingUnit, number])[] = [
  ["mm", 3200.4],
  ["cm", 320.04],
  ["m", 3.2004],
  ["in", 126],
  ["ft", 10.5],
];

for (const [unit, value] of MURO) {
  eq(
    cadLengthLabel(value, { drawingUnit: unit, lunits: 4, luprec: 4 }),
    `10'-6"`,
    `${value} ${unit} con LUNITS 4 se rotulan «10'-6"»`,
  );
  eq(
    cadLengthLabel(value, { drawingUnit: unit, lunits: 3, luprec: 2 }),
    `10'-6.00"`,
    `${value} ${unit} con LUNITS 3 se rotulan «10'-6.00"»`,
  );
}

/**
 * LA DESVIACIÓN DELIBERADA, de frente. AutoCAD asume una unidad de dibujo = una
 * pulgada; nosotros leemos la unidad del documento. Ésta es la comprobación que
 * lo dice: lo que `unit-format.ts` escribiría sin saber del documento y lo que
 * este módulo escribe sabiéndolo.
 */
{
  const comoAutocad = formatLength(3200.4, { system: "architectural", denominator: 16 });
  eq(comoAutocad, `266'-8 3/8"`, "sin saber la unidad del dibujo, 3200.4 se leen como pulgadas");
  eq(
    cadLengthLabel(3200.4, { drawingUnit: "mm", lunits: 4, luprec: 4 }),
    `10'-6"`,
    "sabiendo que son milímetros, el mismo muro se rotula 10'-6\"",
  );
}

/* ── EL FRACCIONARIO NO SE CONVIERTE ──────────────────────────────────────── */

eq(
  cadLengthLabel(6.5, { drawingUnit: "in", lunits: 5, luprec: 4 }),
  "6 1/2",
  "el fraccionario escribe la unidad de dibujo tal cual",
);
eq(
  cadLengthLabel(3200.5, { drawingUnit: "mm", lunits: 5, luprec: 1 }),
  "3200 1/2",
  "y en un dibujo en milímetros escribe milímetros fraccionarios, no pulgadas",
);

/* ── EL RÓTULO MÉTRICO DE SIEMPRE ─────────────────────────────────────────── */

// El golden de la cota (`verification/units-and-scale.spec.ts`): un muro de
// 3500 mm acotado en metros dice «3.50 m». La petición de la cota delega en
// esta llamada, así que tiene que dar exactamente eso.
eq(
  cadLengthLabel(3500, { drawingUnit: "mm", labelUnit: "m", lunits: 2, luprec: 2, showUnitSuffix: true }),
  "3.50 m",
  "3500 mm acotados en metros dicen «3.50 m»",
);
eq(
  cadLengthLabel(3500, { drawingUnit: "mm", lunits: 2, luprec: 2 }),
  "3500.00",
  "y sin unidad de lectura ni sufijo, el decimal desnudo",
);
eq(
  cadLengthLabel(3500, { drawingUnit: "mm", labelUnit: "cm", lunits: 2, luprec: 1, showUnitSuffix: true }),
  "350.0 cm",
  "la unidad de lectura convierte, no reinterpreta",
);
eq(
  cadLengthLabel(3500, { drawingUnit: "mm", lunits: 1, luprec: 2 }),
  "3.50E+3",
  "científico con LUNITS 1",
);
eq(
  cadLengthLabel(3500, { drawingUnit: "mm", labelUnit: "m", lunits: 2, luprec: 2, suffix: " metros" }),
  "3.50 metros",
  "y un sufijo literal gana sobre el nombre de la unidad",
);

/* ── LOS DOS DEFECTOS QUE ESTE MÓDULO CERRÓ PRIMERO ───────────────────────── */

/**
 * El acarreo de ingeniería. `unit-format.ts` partía en pies antes de redondear
 * y emitía `1'-12"`; aquí siempre se redondeó primero. P-express-07 llevó el
 * acarreo también al otro módulo (ventana de integración, 2026-09-04), así que
 * los dos números se miden hoy uno al lado del otro para comprobar que
 * COINCIDEN: la comparación se queda porque es la que detecta la regresión si
 * alguno de los dos vuelve a partir antes de redondear.
 */
eq(formatLength(23.6, { system: "engineering", precision: 0 }), `2'-0"`, "unit-format: 23.6\" → «2'-0\"»");
eq(
  cadLengthLabel(23.6, { drawingUnit: "in", lunits: 3, luprec: 0 }),
  `2'-0"`,
  "units-label: 23.6\" → «2'-0\"», que es lo que un plano lleva",
);
eq(
  cadLengthLabel(143.7, { drawingUnit: "in", lunits: 3, luprec: 0 }),
  `12'-0"`,
  "y 143.7\" → «12'-0\"» en vez de «11'-12\"»",
);

/**
 * El menos cero. Una medida que redondea a cero no lleva signo: `-0'-0"` es un
 * artefacto de decidir el signo antes de redondear, y además rompe la ida y
 * vuelta. También cerrado en `unit-format.ts` por P-express-07.
 */
eq(formatLength(-0.4, { system: "architectural", denominator: 1 }), `0'-0"`, "unit-format: -0.4\" → «0'-0\"»");
eq(
  cadLengthLabel(-0.4, { drawingUnit: "in", lunits: 4, luprec: 0 }),
  `0'-0"`,
  "units-label: -0.4\" → «0'-0\"»",
);
eq(cadLengthLabel(-0.4, { drawingUnit: "in", lunits: 3, luprec: 0 }), `0'-0"`, "ídem en ingeniería");
eq(cadLengthLabel(-0.004, { drawingUnit: "mm", lunits: 2, luprec: 2 }), "0.00", "ídem en decimal: nunca «-0.00»");
// Y el signo que SÍ significa algo se conserva: medio redondea a uno.
eq(cadLengthLabel(-0.5, { drawingUnit: "in", lunits: 4, luprec: 0 }), `-0'-1"`, "-0.5\" sí conserva el signo");

/* ── IDA Y VUELTA CERRADA, SIN NINGUNA INESTABILIDAD ──────────────────────── */

/**
 * La misma ida y vuelta que `units-imperial.spec.ts` corre contra
 * `unit-format.ts` —donde deja siete inestabilidades medidas— aquí tiene que
 * dar CERO: éste es el sitio por el que el producto rotula, y lo que sale de
 * aquí se relee y se vuelve a escribir igual.
 */
const VALORES = [0, 0.5, 6.5, 11.99, 12, 18.5, 23.6, 100.375, 126, 143.7, -18.5, -0.4];
let vueltas = 0;
let inestables = 0;
for (const lunits of [3, 4, 5]) {
  for (let luprec = 0; luprec <= 8; luprec += 1) {
    const options = { drawingUnit: "in" as CadDrawingUnit, lunits, luprec };
    const tolerance = (lunits === 3 ? 0.5 * 10 ** -luprec : 0.5 / 2 ** luprec) + 1e-9;
    for (const value of VALORES) {
      const texto = cadLengthLabel(value, options);
      const vuelta = parseImperialLength(texto);
      ok(vuelta.ok, `«${texto}» (LUNITS ${lunits}, LUPREC ${luprec}) se relee`);
      if (!vuelta.ok) continue;
      ok(
        near(vuelta.inches, value, tolerance),
        `${value}" → «${texto}» → ${vuelta.inches}" (LUNITS ${lunits}, LUPREC ${luprec})`,
      );
      const otraVez = cadLengthLabel(vuelta.inches, options);
      if (otraVez !== texto) inestables += 1;
      eq(otraVez, texto, `y volver a escribirlo da la misma cadena («${texto}»)`);
      vueltas += 1;
    }
  }
}
eq(inestables, 0, "ninguna de las idas y vueltas del rótulo del producto es inestable");
eq(vueltas, 3 * 9 * VALORES.length, "y se corrieron todas");

/**
 * La ida y vuelta que cierra el círculo del entregable: el dibujo está en
 * milímetros, se teclea en pies y pulgadas, y lo que se lee es lo que se
 * tecleó. Ninguna de las dos mitades sabe de la otra.
 */
const TECLEADO: readonly (readonly [string, string, number])[] = [
  // texto tecleado          rótulo canónico   pulgadas
  [`10'-6"`, `10'-6"`, 126],
  [`1'-6 1/2"`, `1'-6 1/2"`, 18.5],
  [`1'6`, `1'-6"`, 18],
  // El rótulo SIEMPRE lleva los pies y cierra la pulgada, aunque se teclearan a
  // medias: es la forma que AutoCAD escribe y la que un plano lleva. La entrada
  // es tolerante; la salida, canónica.
  [`12'`, `12'-0"`, 144],
  [`6"`, `0'-6"`, 6],
  [`0'-0 1/16"`, `0'-0 1/16"`, 0.0625],
];

for (const [texto, canonico, pulgadas] of TECLEADO) {
  const entrada = parseImperialLength(texto);
  ok(entrada.ok, `«${texto}» entra`);
  if (!entrada.ok) continue;
  ok(near(entrada.inches, pulgadas, 1e-9), `«${texto}» son ${pulgadas}"`);
  const enDibujo = entrada.inches * 25.4;
  eq(
    cadLengthLabel(enDibujo, { drawingUnit: "mm", lunits: 4, luprec: 4 }),
    canonico,
    `«${texto}» tecleado, guardado como ${enDibujo} mm, se rotula «${canonico}»`,
  );
}

/* ── LAS VARIABLES VIVAS ──────────────────────────────────────────────────── */

{
  // Un dibujo en pulgadas, arquitectónico a 1/16: el ajuste de un despacho
  // estadounidense, tal y como llega en las variables del documento.
  const variables = createCadVariableAccess({ INSUNITS: 1, LUNITS: 4, LUPREC: 4 });
  eq(
    cadLengthLabelFromVariables(126, variables),
    `10'-6"`,
    "con INSUNITS 1 / LUNITS 4 / LUPREC 4, 126 unidades son «10'-6\"»",
  );
  const options = cadLengthLabelOptions(variables);
  eq(options.drawingUnit, "in" as CadDrawingUnit, "la unidad sale de INSUNITS");
  eq(options.lunits, 4, "el sistema, de LUNITS");
  eq(options.luprec, 4, "y la precisión, de LUPREC");
}

{
  // El mismo muro, el mismo ajuste, pero el dibujo está en milímetros.
  const variables = createCadVariableAccess({ INSUNITS: 4, LUNITS: 4, LUPREC: 4 });
  eq(cadLengthLabelFromVariables(3200.4, variables), `10'-6"`, "con INSUNITS 4, 3200.4 son «10'-6\"»");
  // Cambiar UNITS cambia el rótulo sin que nadie más se entere: es la propiedad
  // que hace que este módulo sea EL sitio y no UN sitio.
  variables.set("LUNITS", 2);
  variables.set("LUPREC", 1);
  eq(cadLengthLabelFromVariables(3200.4, variables), "3200.4", "y con LUNITS 2 / LUPREC 1, «3200.4»");
  variables.set("LUNITS", 5);
  eq(cadLengthLabelFromVariables(3200.5, variables), "3200 1/2", "y con LUNITS 5, «3200 1/2»");
}

{
  // Los valores por defecto de la tabla de variables, sin tocar nada: decimal
  // con cuatro decimales sobre milímetros.
  const variables = createCadVariableAccess({});
  eq(cadLengthLabelFromVariables(3500, variables), "3500.0000", "el dibujo de fábrica rotula decimal a 4");
  // Y lo que el que llama declara gana sobre INSUNITS, porque `meta.unit` del
  // documento es más autoridad que la variable.
  eq(
    cadLengthLabelFromVariables(3.5, variables, { drawingUnit: "m", labelUnit: "m", showUnitSuffix: true }),
    "3.5000 m",
    "y `drawingUnit` declarado gana sobre INSUNITS",
  );
}

console.log(
  `units-label.spec: ${checks} comprobaciones — 1 número por 5 unidades y 5 LUNITS, ` +
    `${vueltas} idas y vueltas sin una sola inestabilidad`,
);
