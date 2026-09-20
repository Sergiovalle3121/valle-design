/**
 * Contrato de `computeCadPlanGridTiers` / `cadPlanGridMinorVisible`, sin
 * navegador: geometría pura, `THREE.Vector3` incluido (mismo patrón que
 * `camera-policy.spec.ts`).
 */
import { strict as assert } from "node:assert";
import {
  cadPlanGridMinorVisible,
  computeCadPlanGridTiers,
} from "./plan-grid-tiers";

let verdes = 0;
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};

// ── Degenerados: nunca tronar, siempre devolver vacío ──────────────────────
{
  const vacio = computeCadPlanGridTiers({ halfWidth: 0, halfHeight: 10, spacing: 1 });
  eq(vacio.minor.length, 0, "halfWidth 0 → sin líneas menores");
  eq(vacio.major.length, 0, "halfWidth 0 → sin líneas mayores");
}
{
  const vacio = computeCadPlanGridTiers({ halfWidth: 10, halfHeight: 10, spacing: 0 });
  eq(vacio.minor.length, 0, "spacing 0 → sin líneas");
}
{
  const vacio = computeCadPlanGridTiers({ halfWidth: 10, halfHeight: 10, spacing: -1 });
  eq(vacio.minor.length, 0, "spacing negativo → sin líneas");
}

// ── majorEvery = 1: TODAS las líneas son mayores, ninguna menor ────────────
{
  const t = computeCadPlanGridTiers({
    halfWidth: 10,
    halfHeight: 10,
    spacing: 1,
    majorEvery: 1,
  });
  eq(t.minor.length, 0, "majorEvery=1 deja el cubo menor vacío");
  ok(t.major.length > 0, "majorEvery=1 deja todo en el cubo mayor");
}

// ── majorEvery mayor que el número de líneas: sólo la línea 0 de cada eje es mayor ──
{
  const t = computeCadPlanGridTiers({
    halfWidth: 10,
    halfHeight: 10,
    spacing: 1, // nx = nz = 20
    majorEvery: 1000,
  });
  // Una sola línea mayor por eje (i=0), cada línea son 2 puntos: 2 ejes × 2 puntos.
  eq(t.major.length, 4, "sólo la línea i=0 cae en el cubo mayor por eje");
}

// ── Conservación: el total de puntos no depende de cómo se repartan ────────
{
  const halfWidth = 12,
    halfHeight = 8,
    spacing = 2;
  const nx = Math.round((halfWidth * 2) / spacing);
  const nz = Math.round((halfHeight * 2) / spacing);
  const esperado = (nx + 1) * 2 + (nz + 1) * 2; // puntos, no líneas
  const t = computeCadPlanGridTiers({ halfWidth, halfHeight, spacing, majorEvery: 5 });
  eq(
    t.minor.length + t.major.length,
    esperado,
    "repartir en menor/mayor no pierde ni duplica puntos",
  );
}

// ── Tope de rendimiento: un spacing minúsculo no dispara miles de líneas ───
{
  const t = computeCadPlanGridTiers({
    halfWidth: 100,
    halfHeight: 100,
    spacing: 0.001,
    maxLinesPerAxis: 60,
  });
  // (60+1) líneas por eje × 2 ejes × 2 puntos = 244 puntos como techo.
  ok(
    t.minor.length + t.major.length <= (60 + 1) * 2 * 2,
    "el techo de líneas por eje se respeta aunque el spacing sea minúsculo",
  );
}

// ── Las líneas menores y mayores están en el rectángulo declarado ──────────
{
  const halfWidth = 5,
    halfHeight = 5;
  const t = computeCadPlanGridTiers({ halfWidth, halfHeight, spacing: 1 });
  for (const punto of [...t.minor, ...t.major]) {
    ok(
      punto.x >= -halfWidth - 1e-9 && punto.x <= halfWidth + 1e-9,
      "ninguna línea sale del ancho declarado",
    );
    ok(
      punto.z >= -halfHeight - 1e-9 && punto.z <= halfHeight + 1e-9,
      "ninguna línea sale del alto declarado",
    );
  }
}

// ── `cadPlanGridMinorVisible`: el umbral de densidad ────────────────────────
{
  eq(cadPlanGridMinorVisible(10, 1), true, "10 px/unidad × 1 unidad ⇒ 10px, visible");
  eq(cadPlanGridMinorVisible(3, 1), false, "3 px/unidad × 1 unidad ⇒ 3px, se apaga");
  eq(cadPlanGridMinorVisible(0, 1), false, "sin zoom conocido, se apaga por seguridad");
  eq(cadPlanGridMinorVisible(10, 0), false, "spacing 0, se apaga por seguridad");
  eq(cadPlanGridMinorVisible(-5, 1), false, "pixelsPerUnit negativo, se apaga");
}

console.log(`plan-grid-tiers.spec: ${verdes} aserciones verdes`);
