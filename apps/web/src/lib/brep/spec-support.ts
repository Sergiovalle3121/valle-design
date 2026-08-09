/**
 * Arnés mínimo compartido por los specs de `lib/brep/`.
 *
 * No es un framework: es un contador de aserciones con nombre y un `report()`
 * final que IMPRIME. Lo segundo importa tanto como lo primero — el runner
 * (`scripts/run-specs.mjs`) trata un spec silencioso como FALLIDO, porque un
 * spec colgado en una promesa que nunca resuelve también sale con código 0 y sin
 * salida. Este `report()` es la señal de "llegué al final del archivo".
 *
 * La otra razón de existir es el aviso 5 del encargo: una propiedad de ida y
 * vuelta se cumple DE FORMA VACÍA si el código nunca toca el campo. Por eso
 * `check()` cuenta las aserciones y `report()` exige un mínimo: un spec que
 * ejecuta cero comprobaciones es un fallo, no un éxito silencioso.
 */
import { strict as assert } from "node:assert";

let passed = 0;
const failures: string[] = [];

/** Aserción booleana con etiqueta. Nunca lanza: acumula para ver TODOS los fallos. */
export function check(label: string, condition: boolean, detail?: string): boolean {
  if (condition) {
    passed += 1;
    return true;
  }
  failures.push(detail ? `${label} — ${detail}` : label);
  return false;
}

/** Igualdad numérica con tolerancia, con el desvío en el mensaje de fallo. */
export function checkClose(label: string, actual: number, expected: number, tol = 1e-9): boolean {
  const delta = Math.abs(actual - expected);
  return check(
    label,
    delta <= tol,
    `esperado ${expected}, obtenido ${actual} (Δ=${delta.toExponential(3)} > ${tol.toExponential(3)})`,
  );
}

/** Igualdad de puntos 3D con tolerancia. */
export function checkPointClose(
  label: string,
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number },
  tol = 1e-9,
): boolean {
  const delta = Math.hypot(actual.x - expected.x, actual.y - expected.y, actual.z - expected.z);
  return check(
    label,
    delta <= tol,
    `esperado (${expected.x}, ${expected.y}, ${expected.z}), obtenido (${actual.x}, ${actual.y}, ${actual.z}) — Δ=${delta.toExponential(3)}`,
  );
}

/** La llamada debe lanzar. Un rechazo explícito es una funcionalidad, y se prueba. */
export function checkThrows(label: string, fn: () => unknown): boolean {
  try {
    fn();
  } catch {
    passed += 1;
    return true;
  }
  failures.push(`${label} — se esperaba una excepción y no la hubo`);
  return false;
}

/**
 * Cierra el spec. Imprime el resumen (obligatorio para el runner) y lanza si
 * hubo fallos o si el spec no llegó a `minChecks` aserciones.
 */
export function report(name: string, minChecks = 1): void {
  if (failures.length > 0) {
    console.error(`❌ ${name}: ${failures.length} fallo(s) de ${passed + failures.length}`);
    for (const failure of failures) console.error(`   · ${failure}`);
    assert.fail(`${name}: ${failures.length} aserciones fallaron`);
  }
  assert.ok(
    passed >= minChecks,
    `${name}: sólo ${passed} aserciones ejecutadas, se esperaban al menos ${minChecks}. Una propiedad que no se ejecuta no prueba nada.`,
  );
  console.log(`✔ ${name}: ${passed} aserciones verdes`);
  passed = 0;
  failures.length = 0;
}

/**
 * Generador congruente lineal de 32 bits. Corpus pseudoaleatorio REPRODUCIBLE:
 * el mismo `seed` da la misma secuencia en cualquier máquina, así que un fallo
 * se puede volver a provocar. `Math.random()` en un spec geométrico convierte un
 * fallo real en "a veces pasa".
 */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Número aleatorio reproducible en `[min, max)`. */
export function randomIn(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}
