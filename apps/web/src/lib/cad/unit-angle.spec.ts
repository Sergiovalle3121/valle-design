/**
 * `unit-angle.ts`: que ESCRIBIR y LEER un ángulo sean la misma conversión al
 * revés, en los cinco sistemas de `AUNITS` y bajo cualquier `ANGBASE`/`ANGDIR`.
 *
 * Antes de esta ficha (T-25) sólo existía la mitad de escritura
 * (`formatAngle`, usada por SETVAR y por los listados de INQUIRY): un ángulo
 * tecleado por el usuario —`<45`, o el ángulo de una coordenada polar
 * `30<45`— se leía siempre en grados decimales puros, ignorando `ANGBASE`,
 * `ANGDIR` y `AUNITS`. La prueba central es el ROUND-TRIP:
 * `parseUserAngle(formatAngle(θ, opts), opts) ≈ θ` (módulo 360, porque
 * `formatAngle` normaliza) para los cinco sistemas y para una base y una
 * dirección que NO sean la identidad — si el redondeo de ida y vuelta sólo se
 * probara con `ANGBASE: 0, ANGDIR: 0`, un error de signo en la inversa no se
 * notaría nunca.
 */
import { strict as assert } from "node:assert";
import {
  angleSystemFromAunits,
  formatAngle,
  fromUserAngle,
  normalizeDegrees,
  parseUserAngle,
  toUserAngle,
  type AngleFormatOptions,
  type AngleSystem,
} from "./unit-angle";

let checks = 0;
function near(actual: number, expected: number, what: string, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${what}: ${actual}, se esperaba ${expected} (±${epsilon})`);
  checks += 1;
}
function eq<T>(actual: T, expected: T, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const SYSTEMS: AngleSystem[] = ["decimal", "dms", "grads", "radians", "surveyor"];

// --- toUserAngle / fromUserAngle son inversas exactas -------------------------
{
  const configs: AngleFormatOptions[] = [
    { system: "decimal", base: 0, direction: 0 },
    { system: "decimal", base: 30, direction: 0 },
    { system: "decimal", base: 0, direction: 1 },
    { system: "decimal", base: 47, direction: 1 },
    { system: "decimal", base: -15, direction: 0 },
  ];
  for (const options of configs) {
    for (const world of [0, 10, 90, 123.456, 200, 359.9, -30, 400]) {
      const user = toUserAngle(world, options);
      const back = fromUserAngle(user, options);
      near(
        normalizeDegrees(back),
        normalizeDegrees(world),
        `fromUserAngle(toUserAngle(${world}, base=${options.base}, dir=${options.direction})) vuelve al mundo`,
      );
    }
  }
}

// --- round-trip texto→mundo→texto, en los cinco sistemas, base/dirección NO triviales ---
{
  // ANGBASE 30° (el cero apunta al noreste) y ANGDIR 1 (horario): si la
  // inversa tuviera el signo equivocado en cualquiera de los dos, este bloque
  // lo delata — con la identidad (0, antihorario) un error de signo en el
  // horario se cancelaría con uno en la base y el round-trip pasaría igual.
  const options: AngleFormatOptions = { system: "decimal", base: 30, direction: 1, precision: 6 };
  const ANGLES = [5, 40, 63.25, 120, 200.5, 310];
  for (const system of SYSTEMS) {
    const opts = { ...options, system };
    for (const world of ANGLES) {
      const text = formatAngle(world, opts);
      const parsed = parseUserAngle(text, opts);
      assert.ok(parsed !== null, `${system} @ ${world}°: "${text}" debía poderse releer`);
      near(
        normalizeDegrees(parsed!),
        normalizeDegrees(world),
        `${system}, ANGBASE 30 ANGDIR 1: parseUserAngle(formatAngle(${world})) = ${text}`,
        1e-4,
      );
    }
  }
}

// --- round-trip con la identidad (ANGBASE 0, ANGDIR antihorario) -------------
{
  const options: AngleFormatOptions = { system: "decimal", base: 0, direction: 0, precision: 6 };
  for (const system of SYSTEMS) {
    const opts = { ...options, system };
    for (const world of [0, 30, 90, 145, 200, 270, 359]) {
      const text = formatAngle(world, opts);
      near(parseUserAngle(text, opts)!, world, `${system} identidad: "${text}" → ${world}`, 1e-4);
    }
  }
}

// --- cada sistema, leído a mano --------------------------------------------
{
  const decimal: AngleFormatOptions = { system: "decimal", base: 0, direction: 0 };
  near(parseUserAngle("45", decimal)!, 45, "decimal llano");
  near(parseUserAngle("-30.5", decimal)!, -30.5, "decimal negativo");
  eq(parseUserAngle("", decimal), null, "vacío no es un ángulo");
  eq(parseUserAngle("abc", decimal), null, "basura no es un ángulo");

  const dms: AngleFormatOptions = { system: "dms", base: 0, direction: 0 };
  near(parseUserAngle('45d30\'15"', dms)!, 45 + 30 / 60 + 15 / 3600, "dms completo");
  near(parseUserAngle("10d", dms)!, 10, "dms sólo grados");
  near(parseUserAngle("-10d0'0\"", dms)!, -10, "dms negativo");

  const grads: AngleFormatOptions = { system: "grads", base: 0, direction: 0 };
  near(parseUserAngle("100g", grads)!, 90, "100 gradianes son 90°: un cuarto de vuelta");
  near(parseUserAngle("400g", grads)!, 360, "400 gradianes, la vuelta completa");
  eq(parseUserAngle("100", grads), null, "sin la «g», no es un gradián válido");

  const radians: AngleFormatOptions = { system: "radians", base: 0, direction: 0 };
  near(parseUserAngle("3.14159265r", radians)!, 180, "π radianes son 180°", 1e-4);
  eq(parseUserAngle("1.5", radians), null, "sin la «r», no es un radián válido");

  const surveyor: AngleFormatOptions = { system: "surveyor", base: 0, direction: 0 };
  near(parseUserAngle("E", surveyor)!, 0, "E llano es el este");
  near(parseUserAngle("N", surveyor)!, 90, "N llano es el norte");
  near(parseUserAngle("W", surveyor)!, 180, "W llano es el oeste");
  near(parseUserAngle("S", surveyor)!, 270, "S llano es el sur");
  near(parseUserAngle('N 30d0\'0" E', surveyor)!, 60, "N30°E: 30° del norte hacia el este, 60° desde el este");
  near(parseUserAngle('N 30d0\'0" W', surveyor)!, 120, "N30°W");
  near(parseUserAngle('S 30d0\'0" W', surveyor)!, 240, "S30°W");
  near(parseUserAngle('S 30d0\'0" E', surveyor)!, 300, "S30°E");
  eq(parseUserAngle('N 91d0\'0" E', surveyor), null, "más de 90° desde un eje no es un rumbo válido");
  eq(parseUserAngle("X 30d0'0\" E", surveyor), null, "un eje que no es N/S se rechaza");
}

// --- ANGDIR horario: el signo se invierte, no el módulo -----------------------
{
  const cw: AngleFormatOptions = { system: "decimal", base: 0, direction: 1 };
  // Con ANGDIR horario, un ángulo del mundo de 30° (antihorario desde el
  // este, la convención interna) se LEE como -30 en el sistema del usuario;
  // `toUserAngle` lo normaliza a 330.
  near(toUserAngle(30, cw), 330, "30° del mundo, en horario, se leen como 330° de usuario");
  near(fromUserAngle(330, cw), -330, "y la inversa deshace exactamente eso");
  near(normalizeDegrees(fromUserAngle(330, cw)), 30, "que normalizado vuelve a ser 30");
}

// --- angleSystemFromAunits: la tabla de AUNITS --------------------------------
{
  eq(angleSystemFromAunits(0), "decimal", "AUNITS 0");
  eq(angleSystemFromAunits(1), "dms", "AUNITS 1");
  eq(angleSystemFromAunits(2), "grads", "AUNITS 2");
  eq(angleSystemFromAunits(3), "radians", "AUNITS 3");
  eq(angleSystemFromAunits(4), "surveyor", "AUNITS 4");
  eq(angleSystemFromAunits(99), "decimal", "un AUNITS fuera de rango cae en decimal, no truena");
}

console.log(
  `unit-angle: ${checks} aserciones verdes. parseUserAngle es la inversa exacta de formatAngle en los ` +
    `cinco sistemas de AUNITS, con ANGBASE y ANGDIR no triviales — un ángulo tecleado por el usuario ` +
    `ya no se lee siempre en grados decimales puros (T-25).`,
);
