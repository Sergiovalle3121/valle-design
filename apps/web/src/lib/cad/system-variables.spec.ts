/**
 * Variables de sistema, formato de longitud y formato de ángulo.
 *
 * ## Por qué esta spec es una TABLA DE ANCLAS y no una ida y vuelta
 *
 * Una propiedad de ida y vuelta —«formatear y volver a leer da lo mismo»— se
 * cumple de forma vacía si el código nunca toca el campo: un formateador que
 * devolviera la cadena vacía siempre y un lector que devolviera cero siempre
 * pasarían. Y en unidades ese fallo no es teórico: el error caro es escribir
 * `3.5` donde el usuario espera `3'-6"`, y las dos cadenas se leen igual de
 * bien de vuelta.
 *
 * Así que aquí no hay ida y vuelta. Hay una tabla con el valor de entrada, la
 * configuración y la CADENA EXACTA que tiene que salir, comprobada contra lo
 * que escribe AutoCAD. Si alguien cambia el redondeo, esta spec lo dice con el
 * número delante.
 */
import { strict as assert } from "node:assert";
import {
  CAD_SYSTEM_VARIABLES,
  CadSystemVariableStore,
  cadActiveUcs,
  cadAngleFormat,
  cadLengthFormat,
  cadSystemVariableDef,
  coerceCadSystemVariable,
  denominatorFromLuprec,
} from "./system-variables";
import { formatLength } from "./unit-format";
import { formatAngle, toUserAngle } from "./unit-angle";

let checks = 0;
function equal(actual: unknown, expected: unknown, what: string) {
  checks += 1;
  assert.equal(actual, expected, `${what}: se esperaba ${String(expected)}, salió ${String(actual)}`);
}
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

// ---------------------------------------------------------------------------
// La tabla de anclas de LONGITUD. Un renglón por sistema de unidades.
// ---------------------------------------------------------------------------

interface LengthAnchor {
  value: number;
  lunits: number;
  luprec: number;
  expected: string;
  why: string;
}

const LENGTH_ANCHORS: readonly LengthAnchor[] = [
  // El caso del enunciado: 3,5 unidades en arquitectónico son tres pies y seis
  // pulgadas. Es la razón entera por la que existe este módulo.
  { value: 3.5, lunits: 4, luprec: 4, expected: `0'-3 1/2"`, why: "3,5 PULGADAS en arquitectónico" },
  { value: 42, lunits: 4, luprec: 4, expected: `3'-6"`, why: "42 pulgadas son 3'-6\"" },
  { value: 42.5, lunits: 4, luprec: 4, expected: `3'-6 1/2"`, why: "media pulgada como fracción" },
  { value: 42.53125, lunits: 4, luprec: 5, expected: `3'-6 17/32"`, why: "LUPREC 5 da treintaidosavos" },
  { value: 42, lunits: 3, luprec: 2, expected: `3'-6.00"`, why: "ingeniería lleva decimales, no fracción" },
  { value: 42.5, lunits: 2, luprec: 2, expected: "42.50", why: "decimal con dos decimales" },
  { value: 42.5, lunits: 2, luprec: 0, expected: "43", why: "decimal sin decimales redondea" },
  { value: 6.5, lunits: 5, luprec: 4, expected: "6 1/2", why: "fraccionario, sin pies" },
  { value: 0.375, lunits: 5, luprec: 4, expected: "3/8", why: "fraccionario menor que la unidad" },
  { value: 12300, lunits: 1, luprec: 4, expected: "1.2300E+4", why: "científico" },
  { value: -42.5, lunits: 4, luprec: 4, expected: `-3'-6 1/2"`, why: "el signo va delante de todo" },
];

for (const anchor of LENGTH_ANCHORS) {
  const store = new CadSystemVariableStore({ LUNITS: anchor.lunits, LUPREC: anchor.luprec });
  equal(
    formatLength(anchor.value, cadLengthFormat(store)),
    anchor.expected,
    `${anchor.why} (LUNITS ${anchor.lunits}, LUPREC ${anchor.luprec})`,
  );
}

// La precisión fraccionaria es una POTENCIA DE DOS, no un contador de decimales.
equal(denominatorFromLuprec(0), 1, "LUPREC 0 → denominador 1");
equal(denominatorFromLuprec(4), 16, "LUPREC 4 → dieciseisavos");
equal(denominatorFromLuprec(6), 64, "LUPREC 6 → sesentaicuatroavos");

// ---------------------------------------------------------------------------
// La tabla de anclas de ÁNGULO.
// ---------------------------------------------------------------------------

interface AngleAnchor {
  degrees: number;
  aunits: number;
  auprec: number;
  expected: string;
  why: string;
}

const ANGLE_ANCHORS: readonly AngleAnchor[] = [
  { degrees: 45, aunits: 0, auprec: 2, expected: "45.00", why: "grados decimales" },
  { degrees: 45.5, aunits: 1, auprec: 0, expected: `45d30'0"`, why: "medio grado son treinta minutos" },
  { degrees: 45.50416666666667, aunits: 1, auprec: 0, expected: `45d30'15"`, why: "grados, minutos y segundos" },
  { degrees: 90, aunits: 2, auprec: 2, expected: "100.00g", why: "la vuelta tiene 400 gradianes" },
  { degrees: 45, aunits: 3, auprec: 4, expected: "0.7854r", why: "radianes" },
  { degrees: 45, aunits: 4, auprec: 0, expected: `N 45d0'0" E`, why: "rumbo topográfico" },
  { degrees: 135, aunits: 4, auprec: 0, expected: `N 45d0'0" W`, why: "segundo cuadrante" },
  { degrees: 225, aunits: 4, auprec: 0, expected: `S 45d0'0" W`, why: "tercer cuadrante" },
  { degrees: 90, aunits: 4, auprec: 0, expected: "N", why: "el norte se escribe N, no N 0d0'0\" E" },
  { degrees: 0, aunits: 4, auprec: 0, expected: "E", why: "el este, igual" },
];

for (const anchor of ANGLE_ANCHORS) {
  const store = new CadSystemVariableStore({ AUNITS: anchor.aunits, AUPREC: anchor.auprec });
  equal(
    formatAngle(anchor.degrees, cadAngleFormat(store)),
    anchor.expected,
    `${anchor.why} (AUNITS ${anchor.aunits})`,
  );
}

// El acarreo de los segundos: 44.99999 grados no puede imprimir 60 segundos.
{
  const store = new CadSystemVariableStore({ AUNITS: 1, AUPREC: 0 });
  const written = formatAngle(44.99999, cadAngleFormat(store));
  assert.ok(!written.includes(`60"`), `un ángulo no imprime 60 segundos: salió ${written}`);
  equal(written, `45d0'0"`, "44,99999 grados redondean a 45 grados exactos");
  checks += 1;
}

// ANGBASE y ANGDIR reorientan la medida, no sólo su etiqueta.
{
  const store = new CadSystemVariableStore({ ANGBASE: 90, AUNITS: 0, AUPREC: 0 });
  equal(formatAngle(90, cadAngleFormat(store)), "0", "con ANGBASE 90, el norte es el cero");
  equal(formatAngle(0, cadAngleFormat(store)), "270", "y el este pasa a 270");
}
{
  const store = new CadSystemVariableStore({ ANGDIR: 1, AUNITS: 0, AUPREC: 0 });
  equal(formatAngle(90, cadAngleFormat(store)), "270", "con ANGDIR horario, 90 se lee como 270");
}
near(toUserAngle(-45, { system: "decimal" }), 315, 1e-9, "los ángulos salen normalizados a [0, 360)");

// ---------------------------------------------------------------------------
// La tabla: tipos, rangos y rechazos
// ---------------------------------------------------------------------------

equal(cadSystemVariableDef("lunits")?.name, "LUNITS", "el nombre no distingue mayúsculas");
equal(cadSystemVariableDef("NO_EXISTE"), undefined, "una variable inventada no existe");

{
  const store = new CadSystemVariableStore();
  equal(store.get("LTSCALE"), 1, "LTSCALE arranca en 1");
  equal(store.set("LTSCALE", "2.5").ok, true, "una escala válida entra");
  equal(store.get("LTSCALE"), 2.5, "y queda guardada");

  const bad = store.set("LTSCALE", "no soy un número");
  equal(bad.ok, false, "una escala que no es número se rechaza");
  assert.ok(
    !bad.ok && bad.reason.includes("LTSCALE"),
    `el rechazo nombra la variable: ${!bad.ok ? bad.reason : ""}`,
  );
  checks += 1;
  equal(store.get("LTSCALE"), 2.5, "y el valor anterior sobrevive al rechazo");

  const enumerated = store.set("LUNITS", 9);
  equal(enumerated.ok, false, "LUNITS 9 no existe");
  assert.ok(
    !enumerated.ok && enumerated.reason.includes("1, 2, 3, 4, 5"),
    "el rechazo enumera los valores válidos",
  );
  checks += 1;

  const range = store.set("LUPREC", 12);
  equal(range.ok, false, "LUPREC 12 se sale del rango");

  const readOnly = store.set("AREA", 100);
  equal(readOnly.ok, false, "AREA es de sólo lectura para el usuario");
  equal(store.publish("AREA", 100).ok, true, "pero el sistema sí la publica");
  equal(store.get("AREA"), 100, "y queda escrita");
}

// Un `int` recibe enteros, no reales disfrazados.
{
  const def = cadSystemVariableDef("OSMODE");
  assert.ok(def, "OSMODE está en la tabla");
  checks += 1;
  const outcome = coerceCadSystemVariable(def, "35.7");
  equal(outcome.ok, false, "35,7 no es un OSMODE entero");
}

// La suscripción avisa una sola vez por cambio REAL.
{
  const store = new CadSystemVariableStore();
  let notices = 0;
  const off = store.subscribe(() => {
    notices += 1;
  });
  store.set("LTSCALE", 3);
  store.set("LTSCALE", 3);
  off();
  store.set("LTSCALE", 4);
  equal(notices, 1, "escribir el mismo valor no avisa, y tras darse de baja tampoco");
}

// El SCU activo sale de la tabla, no de un segundo sitio.
{
  const store = new CadSystemVariableStore({ UCSNAME: "PLANTA", UCSORGX: 10, UCSORGY: 20, UCSANGLE: 30 });
  const ucs = cadActiveUcs(store);
  equal(ucs.name, "PLANTA", "UCSNAME");
  equal(ucs.origin.x, 10, "UCSORGX");
  equal(ucs.rotationDeg, 30, "UCSANGLE");
}

// Toda variable de la tabla tiene descripción: `SETVAR ?` la imprime.
for (const def of CAD_SYSTEM_VARIABLES) {
  checks += 1;
  assert.ok(def.description.length > 10, `${def.name} necesita una descripción útil`);
}

console.log(
  `system-variables.spec: ${checks} comprobaciones verdes ` +
    `(${LENGTH_ANCHORS.length} anclas de longitud, ${ANGLE_ANCHORS.length} de ángulo, ` +
    `${CAD_SYSTEM_VARIABLES.length} variables en la tabla).`,
);
