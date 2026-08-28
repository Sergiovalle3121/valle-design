import { strict as assert } from "node:assert";

/**
 * EL ORÁCULO DE LAS PRUEBAS DE QR — compartido por las dos suites.
 *
 * ── POR QUÉ ES UN ARCHIVO APARTE ────────────────────────────────────────────
 * Por tamaño y por higiene. La suite única llegó a 845 líneas y el gate del
 * monolito corta en 800, así que se partió en `qr-encode.spec.ts` (campo,
 * tablas, vectores y máscaras) y `qr-roundtrip.spec.ts` (estructura, recorrido,
 * ida y vuelta y barridos). Y porque esto NO es una prueba: es el INSTRUMENTO
 * con el que se miden las pruebas. Mezclado con ellas, invita a que alguien lo
 * «arregle» para que una aserción pase, que es como se pierde un oráculo.
 *
 * ── QUÉ ES UN ORÁCULO AQUÍ ──────────────────────────────────────────────────
 * Un codificador de QR falla de una forma especialmente cruel: produce una
 * matriz de aspecto impecable que ningún teléfono lee. No hay excepción, no hay
 * salida corrupta, no hay nada que mirar. Por eso ninguna prueba de este módulo
 * afirma «devuelve algo»: cada pieza se contrasta contra algo que NO es el
 * codificador.
 *
 * La aritmética de abajo es uno de esos algos. Reimplementa GF(256) con OTRO
 * algoritmo —campesino ruso: desplazar y reducir— en vez de las tablas de
 * logaritmos del codificador. Si los dos compartieran algoritmo, comprobar uno
 * con el otro no diría nada; con algoritmos distintos, coincidir en las 65 536
 * parejas del campo es una afirmación fuerte.
 */

// ═══════════════════════════════════════════════════════════════════════════
// ORÁCULO 2 — GF(256) reimplementado con otro algoritmo
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Producto en GF(256) por el método del campesino ruso: desplazar y reducir
 * con 0x11D en cuanto se desborda el octavo bit. Deliberadamente NO usa tablas
 * de logaritmos, que es como lo hace el codificador: si ambos compartieran
 * algoritmo, comprobar uno con el otro no diría nada.
 */
export function gfMulLibre(a: number, b: number): number {
  let result = 0;
  let x = a;
  let y = b;
  while (y > 0) {
    if (y & 1) result ^= x;
    y >>= 1;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  return result;
}

/** α^exponent con α = 2, por multiplicación repetida. */
export function alfa(exponent: number): number {
  let result = 1;
  for (let i = 0; i < exponent; i += 1) result = gfMulLibre(result, 2);
  return result;
}

/** Evalúa un polinomio de coeficientes de mayor a menor grado, por Horner. */
export function evalPoly(coefficients: readonly number[], x: number): number {
  let value = 0;
  for (const coefficient of coefficients)
    value = gfMulLibre(value, x) ^ coefficient;
  return value;
}

/**
 * Contador de comprobaciones. Cada suite crea el suyo: el runner del repositorio
 * marca como 🔇 «silent» cualquier spec que salga con código 0 sin imprimir
 * nada, así que las dos terminan con su propio resumen y su propia cifra.
 */
export function contador() {
  let comprobaciones = 0;
  return {
    total: () => comprobaciones,
    eq<T>(actual: T, expected: T, message: string): void {
      assert.deepEqual(actual, expected, message);
      comprobaciones += 1;
    },
    ok(condition: boolean, message: string): void {
      assert.ok(condition, message);
      comprobaciones += 1;
    },
    lanza(fn: () => unknown, pattern: RegExp, message: string): void {
      assert.throws(fn, pattern, message);
      comprobaciones += 1;
    },
  };
}
