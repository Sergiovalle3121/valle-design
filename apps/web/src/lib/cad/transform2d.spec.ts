/**
 * Afín 2×3 canónica (Ola 0 del plan de paridad).
 *
 * La prueba que de verdad importa es la de compatibilidad: `cadAffineFromTransform`
 * tiene que reproducir EXACTAMENTE lo que hoy hace `transformPoint` dentro de
 * `entity-runtime.ts` para el vocabulario actual `{translation, rotationDeg,
 * scale, origin}`. Mientras eso se cumpla, los once adaptadores pueden migrar a
 * afines de uno en uno sin mover ni un píxel de la geometría existente.
 */
import { strict as assert } from "node:assert";
import type { CadPoint2 } from "./cad-document";
import {
  cadAffineAngle,
  cadAffineApply,
  cadAffineApplyVector,
  cadAffineCompose,
  cadAffineDet,
  cadAffineEquals,
  cadAffineFromTransform,
  cadAffineIdentity,
  cadAffineInvert,
  cadAffineIsConformal,
  cadAffineIsReflecting,
  cadAffineReflection,
  cadAffineRotation,
  cadAffineScaleXY,
  cadAffineScaling,
  cadAffineTranslation,
  type CadAffine2,
  type CadAffineTransformInput,
} from "./transform2d";

function near(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol;
}
function pointNear(a: CadPoint2, b: CadPoint2, tol = 1e-9): boolean {
  return near(a.x, b.x, tol) && near(a.y, b.y, tol);
}

/**
 * Copia literal de `transformPoint` (entity-runtime.ts:244) reducida a 2D. Es la
 * referencia contra la que se mide la conversión; si alguien cambia el original
 * sin cambiar la afín, esta spec lo caza.
 */
function legacyTransformPoint(point: CadPoint2, transform: CadAffineTransformInput): CadPoint2 {
  const origin = transform.origin ?? { x: 0, y: 0 };
  const scale = transform.scale ?? 1;
  const rotation = ((transform.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const localX = (point.x - origin.x) * scale;
  const localY = (point.y - origin.y) * scale;
  return {
    x: origin.x + localX * cos - localY * sin + (transform.translation?.x ?? 0),
    y: origin.y + localX * sin + localY * cos + (transform.translation?.y ?? 0),
  };
}

/** LCG de 32 bits: corpus aleatorio pero reproducible en cualquier máquina. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// --- identidad y construcción ----------------------------------------------
assert.ok(pointNear(cadAffineApply(cadAffineIdentity(), { x: 3, y: -7 }), { x: 3, y: -7 }), "la identidad no mueve nada");
assert.equal(cadAffineDet(cadAffineIdentity()), 1, "det(identidad) = 1");

assert.ok(
  pointNear(cadAffineApply(cadAffineTranslation({ x: 5, y: -2 }), { x: 1, y: 1 }), { x: 6, y: -1 }),
  "traslación",
);
assert.ok(
  pointNear(cadAffineApply(cadAffineRotation(90), { x: 1, y: 0 }), { x: 0, y: 1 }),
  "giro de 90° lleva +X a +Y",
);
assert.ok(
  pointNear(cadAffineApply(cadAffineRotation(90, { x: 2, y: 2 }), { x: 3, y: 2 }), { x: 2, y: 3 }),
  "giro de 90° alrededor de un origen distinto del (0,0)",
);
assert.ok(
  pointNear(cadAffineApply(cadAffineScaling(2, 3), { x: 1, y: 1 }), { x: 2, y: 3 }),
  "escala no uniforme — inexpresable en el vocabulario actual",
);

// --- compatibilidad con el vocabulario vigente ------------------------------
// Este es el gate real de la ola 0.
{
  const random = lcg(20260808);
  const pick = () => (random() - 0.5) * 2000;
  let checked = 0;
  for (let i = 0; i < 500; i += 1) {
    const transform: CadAffineTransformInput = {
      translation: { x: pick(), y: pick() },
      rotationDeg: (random() - 0.5) * 1440,
      // Sin ceros: una escala nula aplasta la geometría y no es invertible, así
      // que la excluye también el ejecutor real.
      scale: (random() - 0.5) * 20 || 1,
      origin: { x: pick(), y: pick() },
    };
    const matrix = cadAffineFromTransform(transform);
    for (let j = 0; j < 4; j += 1) {
      const point = { x: pick(), y: pick() };
      const expected = legacyTransformPoint(point, transform);
      const actual = cadAffineApply(matrix, point);
      // Tolerancia relativa: con coordenadas de ±1000 y escalas de ±10 el error
      // de coma flotante acumulado es del orden de 1e-12 absoluto.
      const magnitude = Math.max(1, Math.abs(expected.x), Math.abs(expected.y));
      assert.ok(
        pointNear(actual, expected, 1e-9 * magnitude),
        `la afín debe coincidir con transformPoint (caso ${i}/${j})`,
      );
      checked += 1;
    }
  }
  assert.equal(checked, 2000, "corpus de compatibilidad completo");
}

// Los campos ausentes se comportan como el original: sin origen, sin escala…
assert.ok(
  pointNear(cadAffineApply(cadAffineFromTransform({}), { x: 4, y: 9 }), { x: 4, y: 9 }),
  "una transformada vacía es la identidad",
);
assert.ok(
  pointNear(
    cadAffineApply(cadAffineFromTransform({ translation: { x: 1, y: 2 } }), { x: 0, y: 0 }),
    { x: 1, y: 2 },
  ),
  "sólo traslación",
);

// --- espejo -----------------------------------------------------------------
{
  const overY = cadAffineReflection({ x: 0, y: 0 }, { x: 0, y: 1 });
  assert.ok(pointNear(cadAffineApply(overY, { x: 3, y: 5 }), { x: -3, y: 5 }), "espejo sobre el eje Y");
  assert.ok(cadAffineIsReflecting(overY), "un espejo invierte la orientación");
  assert.ok(near(cadAffineDet(overY), -1), "det(espejo) = -1");
  assert.ok(cadAffineIsConformal(overY), "un espejo puro conserva ángulos");

  const diagonal = cadAffineReflection({ x: 0, y: 0 }, { x: 1, y: 1 });
  assert.ok(pointNear(cadAffineApply(diagonal, { x: 2, y: 0 }), { x: 0, y: 2 }), "espejo sobre la diagonal y=x");

  const offset = cadAffineReflection({ x: 10, y: 0 }, { x: 0, y: 1 });
  assert.ok(pointNear(cadAffineApply(offset, { x: 12, y: 4 }), { x: 8, y: 4 }), "espejo sobre un eje desplazado");
  assert.ok(
    pointNear(cadAffineApply(offset, { x: 10, y: -3 }), { x: 10, y: -3 }),
    "los puntos del eje son fijos",
  );

  // Una dirección degenerada no define eje: identidad, nunca NaN.
  const degenerate = cadAffineReflection({ x: 1, y: 1 }, { x: 0, y: 0 });
  assert.ok(cadAffineEquals(degenerate, cadAffineIdentity()), "eje degenerado → identidad, no NaN");

  // El espejo también llega por la vía declarativa.
  const declared = cadAffineFromTransform({ mirror: { point: { x: 0, y: 0 }, direction: { x: 0, y: 1 } } });
  assert.ok(cadAffineEquals(declared, overY), "mirror declarativo == cadAffineReflection");
}

// --- composición -------------------------------------------------------------
{
  // cadAffineCompose(outer, inner) aplica PRIMERO inner.
  const move = cadAffineTranslation({ x: 10, y: 0 });
  const spin = cadAffineRotation(90);
  assert.ok(
    pointNear(cadAffineApply(cadAffineCompose(spin, move), { x: 0, y: 0 }), { x: 0, y: 10 }),
    "componer: trasladar y luego girar",
  );
  assert.ok(
    pointNear(cadAffineApply(cadAffineCompose(move, spin), { x: 0, y: 0 }), { x: 10, y: 0 }),
    "componer al revés da otro resultado — la composición no conmuta",
  );
}

// --- inversa: la propiedad que protegerá la migración de los 11 adaptadores ---
{
  const random = lcg(987654321);
  const pick = () => (random() - 0.5) * 200;
  for (let i = 0; i < 300; i += 1) {
    const matrix: CadAffine2 = {
      a: pick(), b: pick(), c: pick(), d: pick(), e: pick(), f: pick(),
    };
    const det = cadAffineDet(matrix);
    const inverse = cadAffineInvert(matrix);
    if (Math.abs(det) < 1e-6) continue; // casi singular: el error relativo explota
    assert.ok(inverse, "una matriz no singular tiene inversa");
    const roundTrip = cadAffineCompose(inverse as CadAffine2, matrix);
    assert.ok(
      cadAffineEquals(roundTrip, cadAffineIdentity(), 1e-6),
      `m⁻¹ ∘ m = identidad (caso ${i})`,
    );
  }
  assert.equal(cadAffineInvert(cadAffineScaling(0, 5)), null, "una escala nula no es invertible");
}

// --- lectura de la matriz -----------------------------------------------------
{
  assert.ok(near(cadAffineAngle(cadAffineRotation(30)), 30), "ángulo leído de la matriz");
  assert.ok(near(cadAffineAngle(cadAffineRotation(-30)), 330), "el ángulo se normaliza a [0,360)");

  const stretched = cadAffineScaling(2, 5);
  const factors = cadAffineScaleXY(stretched);
  assert.ok(near(factors.x, 2) && near(factors.y, 5), "factores de escala por eje");
  assert.ok(!cadAffineIsConformal(stretched), "una escala no uniforme NO conserva ángulos");
  assert.ok(cadAffineIsConformal(cadAffineScaling(3, 3)), "una escala uniforme sí");
  assert.ok(
    cadAffineIsConformal(cadAffineCompose(cadAffineRotation(37), cadAffineScaling(4, 4))),
    "girar y escalar de forma uniforme sigue siendo conforme: un círculo sigue siendo círculo",
  );
  assert.ok(
    !cadAffineIsConformal(cadAffineCompose(cadAffineRotation(37), cadAffineScaling(4, 9))),
    "girar una escala anisótropa no la vuelve conforme: el círculo pasa a ser elipse",
  );

  // Los vectores ignoran la traslación: los ejes de una elipse dependen de ello.
  const withShift = cadAffineCompose(cadAffineTranslation({ x: 100, y: 100 }), cadAffineRotation(90));
  assert.ok(
    pointNear(cadAffineApplyVector(withShift, { x: 1, y: 0 }), { x: 0, y: 1 }),
    "la parte lineal no traslada",
  );
}

console.log("cad transform2d specs passed");
