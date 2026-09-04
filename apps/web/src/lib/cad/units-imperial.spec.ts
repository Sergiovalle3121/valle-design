/**
 * La tabla de análisis de pies y pulgadas, forma por forma.
 *
 * La regla de esta spec es que la tabla se lee como una tabla: cada renglón
 * lleva el texto tal y como se teclea, las pulgadas que tiene que dar y si la
 * medida trae marca. **Quince de los dieciocho renglones están MEDIDOS como
 * fallo hoy** —vuelto a medir el 2026-09-04 sobre `parseCoordinate` de
 * `precision-input.ts`, que analiza con `Number(s)`—: sólo `6.5`, `.5` y `18.5`
 * pasan, porque son los tres que no llevan ni marca ni fracción. Seis de esos
 * quince son los que la bitácora del frente nombró en C1 (cinco escalares más
 * la coordenada `@1'-0",0`), y van marcados aparte para que el recuento delate
 * a quien borre un renglón incómodo.
 *
 * Y comprueba la negativa RAZONADA: `1'2'` no se lee, y el motivo se dice.
 * Un analizador que ante lo ambiguo devuelve un número es peor que uno que no
 * lee nada, porque el número equivocado llega al plano.
 *
 * Correr:  npx tsx src/lib/cad/units-imperial.spec.ts
 */
import assert from "node:assert/strict";
import { parseCoordinate } from "./precision-input";
import { formatLength, type UnitSystem } from "./unit-format";
import {
  CAD_DRAWING_UNIT_TO_MM,
  CAD_INCH_MM,
  cadDrawingUnitFromInsunits,
  cadTextLooksImperial,
  convertCadLength,
  drawingUnitsToInches,
  inchesToDrawingUnits,
  parseCadLengthInDrawingUnits,
  parseImperialLength,
  type CadDrawingUnit,
} from "./units-imperial";

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

/* ── LAS DIECIOCHO FORMAS ─────────────────────────────────────────────────── */

interface Row {
  texto: string;
  pulgadas: number;
  /** Si el texto trae marca de pie o de pulgada. */
  marca: boolean;
  /** Si hoy `parseCoordinate` lo rechaza (medido el 2026-09-04). */
  roto?: true;
  /** Si además lo nombra la bitácora del frente en C1. */
  bitacora?: true;
  porque: string;
}

const TABLA: readonly Row[] = [
  { texto: `1'-6 1/2"`, pulgadas: 18.5, marca: true, roto: true, bitacora: true, porque: "la forma canónica del plano arquitectónico" },
  { texto: `1'6`, pulgadas: 18, marca: true, roto: true, bitacora: true, porque: "sin guion y sin cerrar: como se teclea con prisa" },
  { texto: `1'6"`, pulgadas: 18, marca: true, roto: true, porque: "sin guion, cerrada" },
  { texto: `1'-6"`, pulgadas: 18, marca: true, roto: true, porque: "con guion, sin fracción" },
  { texto: `1'-6 1/2`, pulgadas: 18.5, marca: true, roto: true, porque: "con fracción, sin cerrar" },
  { texto: `12'`, pulgadas: 144, marca: true, roto: true, bitacora: true, porque: "pies redondos" },
  { texto: `1'`, pulgadas: 12, marca: true, roto: true, porque: "un pie" },
  { texto: `1.5'`, pulgadas: 18, marca: true, roto: true, porque: "pies decimales: legales en ingeniería" },
  { texto: `6"`, pulgadas: 6, marca: true, roto: true, bitacora: true, porque: "pulgadas sueltas" },
  { texto: `6 1/2"`, pulgadas: 6.5, marca: true, roto: true, porque: "pulgadas con fracción, cerradas" },
  { texto: `6 1/2`, pulgadas: 6.5, marca: false, roto: true, bitacora: true, porque: "entero y fracción, sin marca" },
  { texto: `1/2"`, pulgadas: 0.5, marca: true, roto: true, porque: "sólo fracción, cerrada" },
  { texto: `1/2`, pulgadas: 0.5, marca: false, roto: true, porque: "sólo fracción, sin marca" },
  { texto: `1'-6.5"`, pulgadas: 18.5, marca: true, roto: true, porque: "el decimal dentro de la pulgada (ingeniería)" },
  { texto: `6.5`, pulgadas: 6.5, marca: false, porque: "el decimal de siempre" },
  { texto: `.5`, pulgadas: 0.5, marca: false, porque: "el decimal sin cero delante" },
  { texto: `-1'-6"`, pulgadas: -18, marca: true, roto: true, porque: "negativo: el signo va delante, el guion de dentro es separador" },
  { texto: `18.5`, pulgadas: 18.5, marca: false, porque: "el decimal de siempre, con parte fraccionaria" },
];

eq(TABLA.length, 18, "la tabla tiene dieciocho formas");
eq(
  TABLA.filter((row) => row.roto).length,
  15,
  "quince de las dieciocho fallan hoy en el analizador de entrada",
);
eq(
  TABLA.filter((row) => row.bitacora).length,
  5,
  "y cinco de ellas son las escalares que la bitácora nombró (la sexta es la coordenada @1'-0\",0)",
);

/**
 * La cifra no es de memoria: se vuelve a medir aquí, contra el analizador de
 * hoy. Si alguien aplica la petición del analizador de entrada sin actualizar
 * esta spec, este renglón lo dice — que es exactamente lo que se quiere.
 */
{
  const fallanHoy = TABLA.filter(
    (row) => !parseCoordinate(row.texto, { last: { x: 0, y: 0 }, lockedAngleDeg: 0 }).ok,
  );
  eq(
    fallanHoy.map((row) => row.texto).sort(),
    TABLA.filter((row) => row.roto).map((row) => row.texto).sort(),
    "y la columna «roto» coincide renglón a renglón con lo que `parseCoordinate` rechaza ahora mismo",
  );
}

for (const row of TABLA) {
  const parsed = parseImperialLength(row.texto);
  ok(parsed.ok, `«${row.texto}» se lee (${row.porque})`);
  if (!parsed.ok) continue;
  ok(
    near(parsed.inches, row.pulgadas, 1e-9),
    `«${row.texto}» son ${row.pulgadas}" (obtenido ${parsed.inches})`,
  );
  eq(
    parsed.explicit,
    row.marca,
    `«${row.texto}» ${row.marca ? "trae" : "no trae"} marca de pie o pulgada`,
  );
}

// Los negativos, en las dos formas en que se escriben.
eq(parseImperialLength(`-6 1/2`), { ok: true, inches: -6.5, explicit: false }, "«-6 1/2» son -6.5");
eq(parseImperialLength(`-6"`), { ok: true, inches: -6, explicit: true }, "«-6\"» son -6");
eq(parseImperialLength(`+5`), { ok: true, inches: 5, explicit: false }, "el signo + también se lee");

// El decimal de siempre entra intacto: esta función SUSTITUYE a `Number(s)` en
// el analizador de entrada, así que tiene que ser un superconjunto suyo. Si
// `1e3` dejara de valer, el cambio no sería una mejora sino una regresión
// disfrazada.
for (const [texto, valor] of [["1e3", 1000], ["1e-3", 0.001], ["0", 0], ["0.25", 0.25]] as const) {
  const parsed = parseImperialLength(texto);
  ok(parsed.ok && near(parsed.inches, valor, 1e-12), `«${texto}» sigue valiendo ${valor}`);
}

// Comillas tipográficas: lo que un Mac o un iPad escriben sin avisar.
eq(parseImperialLength(`1’-6 1/2”`), { ok: true, inches: 18.5, explicit: true }, "las comillas curvas se leen igual");
eq(parseImperialLength(`6″`), { ok: true, inches: 6, explicit: true }, "y la doble prima también");

/* ── LA NEGATIVA RAZONADA ─────────────────────────────────────────────────── */

const AMBIGUAS: readonly (readonly [string, string])[] = [
  [`1'2'`, "dos marcas de pie"],
  [`1"2"`, "dos marcas de pulgada"],
  [`6"2`, "algo después de cerrar la pulgada"],
  [`6"1'`, "la pulgada antes del pie"],
  [`1 2 3`, "tres números para una sola longitud"],
  [`1/0`, "denominador cero"],
  [`1 1/2'`, "pies en fracción"],
  [`'`, "una comilla sin número"],
  [`-`, "un signo sin número"],
  [``, "vacío"],
  [`muro`, "no es un número"],
  [`1'-6 1/2" y pico`, "cola de texto"],
];

for (const [texto, porque] of AMBIGUAS) {
  const parsed = parseImperialLength(texto);
  ok(!parsed.ok, `«${texto}» se niega (${porque})`);
  if (parsed.ok) continue;
  ok(parsed.error.trim().length > 0, `«${texto}» dice por qué se niega, no calla`);
}

// La negativa que más importa, con su mensaje entero: es el renglón que la
// campaña pide enseñar.
{
  const parsed = parseImperialLength(`1'2'`);
  ok(!parsed.ok && parsed.error.includes("dos marcas de pie"), `«1'2'»: ${!parsed.ok ? parsed.error : ""}`);
}

/**
 * El renglón que explica por qué la petición del analizador de entrada no es
 * cosmética. `parseCoordinate` colapsa TODOS los espacios (`replace(/\s+/g,"")`),
 * así que `1'-6 1/2"` le llega a la gramática como `1'-61/2"`. Y eso SE LEE:
 * `61/2` es una fracción impropia perfectamente válida, 30.5 pulgadas. El
 * resultado es 42.5" en vez de 18.5" — un número equivocado y silencioso, que
 * es el peor de los fallos posibles en un plano.
 */
{
  const conEspacio = parseImperialLength(`1'-6 1/2"`);
  const sinEspacio = parseImperialLength(`1'-61/2"`);
  ok(conEspacio.ok && near(conEspacio.inches, 18.5, 1e-9), "con espacio son 18.5\"");
  ok(sinEspacio.ok && near(sinEspacio.inches, 42.5, 1e-9), "sin espacio son 42.5\": el espacio NO es decorativo");
  ok(cadTextLooksImperial(`1'-6 1/2"`), "y el texto se reconoce como imperial antes de tocarle los espacios");
  ok(!cadTextLooksImperial(`3500`), "mientras que un número desnudo no lo es");
}

/* ── LA CONVERSIÓN A UNIDADES DE DIBUJO ───────────────────────────────────── */

eq(CAD_INCH_MM, 25.4, "la pulgada son 25.4 mm exactos");
eq(CAD_DRAWING_UNIT_TO_MM.ft, 304.8, "y el pie son doce de ésas: 304.8 exactos");
ok(
  CAD_DRAWING_UNIT_TO_MM.ft !== CAD_INCH_MM * 12,
  "escrito como literal y no como 25.4*12, que en binario da 304.79999999999995",
);
eq(cadDrawingUnitFromInsunits(4), "mm", "$INSUNITS 4 son milímetros");
eq(cadDrawingUnitFromInsunits(1), "in", "$INSUNITS 1 son pulgadas");
eq(cadDrawingUnitFromInsunits(6), "m", "$INSUNITS 6 son metros");
eq(cadDrawingUnitFromInsunits(3), null, "y una milla no se traduce en silencio a milímetros");

for (const [inches, unit, expected] of [
  [126, "mm", 3200.4],
  [126, "cm", 320.04],
  [126, "m", 3.2004],
  [126, "in", 126],
  [126, "ft", 10.5],
] as const) {
  const converted = inchesToDrawingUnits(inches, unit);
  ok(near(converted, expected, 1e-9), `126" son ${expected} ${unit} (obtenido ${converted})`);
  ok(near(drawingUnitsToInches(converted, unit), inches, 1e-9), `y vuelven a ser 126" desde ${unit}`);
}

// Las métricas de siempre siguen dando lo de siempre.
for (const [value, from, to, expected] of [
  [3500, "mm", "m", 3.5],
  [3500, "mm", "cm", 350],
  [1, "m", "cm", 100],
] as const) {
  ok(near(convertCadLength(value, from, to), expected, 1e-9), `${value} ${from} son ${expected} ${to}`);
}

/**
 * LA MARCA MANDA. Es la decisión de diseño del módulo y se comprueba de frente:
 * el mismo `6` significa cosas distintas según lleve marca, y NUNCA se adivina
 * por el tamaño del número.
 */
{
  const conMarca = parseCadLengthInDrawingUnits(`6"`, { drawingUnit: "mm" });
  const sinMarca = parseCadLengthInDrawingUnits(`6`, { drawingUnit: "mm" });
  ok(conMarca.ok && near(conMarca.value, 152.4, 1e-9), "«6\"» en un dibujo en mm son 152.4 de dibujo");
  ok(sinMarca.ok && near(sinMarca.value, 6, 1e-9), "«6» a secas son 6 de dibujo, no 152.4");
  // …salvo que el DIBUJO diga que se teclea en pulgadas, que es lo que hace
  // AutoCAD con LUNITS arquitectónico o de ingeniería.
  const asumido = parseCadLengthInDrawingUnits(`6`, { drawingUnit: "mm", assumeInches: true });
  ok(asumido.ok && near(asumido.value, 152.4, 1e-9), "con LUNITS arquitectónico, «6» sí son seis pulgadas");
}

// El número de la campaña: lo que se teclea es lo que se guarda.
{
  const entrada = parseCadLengthInDrawingUnits(`10'-6"`, { drawingUnit: "mm" });
  ok(entrada.ok && near(entrada.value, 3200.4, 1e-9), `«10'-6"» son 3200.4 mm de dibujo`);
  ok(entrada.ok && near(entrada.inches, 126, 1e-9), "y 126 pulgadas");
}
eq(parseCadLengthInDrawingUnits(`1'2'`).ok, false, "y lo ambiguo se niega también en unidades de dibujo");

/* ── IDA Y VUELTA CERRADA ─────────────────────────────────────────────────── */

/**
 * `formatLength` de `unit-format.ts` seguido de `parseImperialLength` tiene que
 * devolver el mismo valor dentro de medio del denominador, para `LUPREC` 0..8 y
 * para los tres sistemas imperiales. Es la prueba de que las dos mitades —la
 * que ya existía y la que este entregable añade— hablan el mismo idioma.
 *
 * Y volver a formatear tiene que dar la MISMA cadena. Ahí aparece el único
 * defecto que esta ida y vuelta destapa, medido y no supuesto: en ingeniería,
 * `unit-format.ts` parte en pies ANTES de redondear, así que 23.6" con
 * `LUPREC 0` sale `1'-12"`, que se relee como 24 y se reescribe `2'-0"`. Va en
 * la petición P-express-07 con el parche exacto; `units-label.ts` ya lo hace
 * bien por su cuenta (lo comprueba `units-label.spec.ts`).
 */
const VALORES_PULGADA = [0, 0.5, 6.5, 11.99, 12, 18.5, 23.6, 100.375, 126, 143.7, -18.5, -0.4];
const SISTEMAS: readonly UnitSystem[] = ["architectural", "engineering", "fractional"];

let idasYVueltas = 0;
let inestables = 0;
const familias = { acarreo: 0, menosCero: 0 };
for (const system of SISTEMAS) {
  for (let luprec = 0; luprec <= 8; luprec += 1) {
    const denominator = 2 ** luprec;
    const options = { system, precision: luprec, denominator } as const;
    // Medio del denominador para arquitectónico y fraccionario; media unidad
    // del último decimal para ingeniería, que redondea en vez de fraccionar.
    const tolerance = (system === "engineering" ? 0.5 * 10 ** -luprec : 0.5 / denominator) + 1e-9;
    for (const value of VALORES_PULGADA) {
      const texto = formatLength(value, options);
      const vuelta = parseImperialLength(texto);
      ok(vuelta.ok, `«${texto}» (${system}, LUPREC ${luprec}) se relee`);
      if (!vuelta.ok) continue;
      ok(
        near(vuelta.inches, value, tolerance),
        `${value}" → «${texto}» → ${vuelta.inches}" (${system}, LUPREC ${luprec}, tolerancia ${tolerance})`,
      );
      const otraVez = formatLength(vuelta.inches, options);
      if (otraVez !== texto) {
        inestables += 1;
        // Dos familias, las dos medidas y ninguna inventada:
        //  · el ACARREO de ingeniería: «1'-12"» se relee 24 y se reescribe «2'-0"»;
        //  · el MENOS CERO: «-0'-0"» se relee -0 y se reescribe «0'-0"».
        const acarreo = system === "engineering" && /-1[2-9]|-[2-9]\d/u.test(texto);
        const menosCero = texto.startsWith("-") && vuelta.inches === 0;
        if (acarreo) familias.acarreo += 1;
        else if (menosCero) familias.menosCero += 1;
        ok(
          acarreo || menosCero,
          `la inestabilidad «${texto}» → «${otraVez}» (${system}, LUPREC ${luprec}) es de una de las dos familias conocidas`,
        );
      }
      idasYVueltas += 1;
    }
  }
}

ok(idasYVueltas === SISTEMAS.length * 9 * VALORES_PULGADA.length, `las ${idasYVueltas} idas y vueltas se corrieron todas`);

/**
 * El defecto, con su cifra exacta. Cuando P-express-07 se aplique a
 * `unit-format.ts`, esta comprobación pasa a `2'-0"` y el `inestables` de arriba
 * baja a cero — está escrito así a propósito, para que el arreglo no pueda
 * entrar en silencio.
 */
eq(
  formatLength(23.6, { system: "engineering", precision: 0 }),
  `1'-12"`,
  'hoy ingeniería no acarrea: 23.6" con LUPREC 0 sale «1\'-12"»',
);
eq(
  formatLength(-0.4, { system: "architectural", denominator: 1 }),
  `-0'-0"`,
  'y el signo se decide antes de redondear: -0.4" con LUPREC 0 sale «-0\'-0"»',
);
ok(familias.acarreo > 0, `el acarreo de ingeniería aparece ${familias.acarreo} veces`);
ok(familias.menosCero > 0, `y el menos cero, ${familias.menosCero}`);
eq(
  familias.acarreo + familias.menosCero,
  inestables,
  `las ${inestables} inestabilidades se reparten entre esas dos familias y ninguna más`,
);

/* ── Las unidades del dibujo, cruzadas ────────────────────────────────────── */

const UNIDADES: readonly CadDrawingUnit[] = ["mm", "cm", "m", "in", "ft"];
for (const unit of UNIDADES) {
  const round = drawingUnitsToInches(inchesToDrawingUnits(126, unit), unit);
  ok(near(round, 126, 1e-9), `126" → ${unit} → 126" sin pérdida (obtenido ${round})`);
}

console.log(
  `units-imperial.spec: ${checks} comprobaciones — 18 formas (15 rotas hoy en la entrada), ` +
    `${AMBIGUAS.length} negativas razonadas, ${idasYVueltas} idas y vueltas ` +
    `(${inestables} inestables: ${familias.acarreo} de acarreo, ${familias.menosCero} de menos cero)`,
);
