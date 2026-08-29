/**
 * El resumen de latencia: percentiles que no mienten con pocas muestras.
 *
 * Lo que se fija aquí es la aritmética, que es donde una medida de rendimiento
 * se corrompe sin que nadie lo note: un p95 mal calculado sobre veinte muestras
 * devuelve siempre el máximo y convierte el indicador en «el peor clic de la
 * sesión», que ya se publica aparte.
 *
 * Correr:  npx tsx src/lib/cad/telemetry/interaction-latency.spec.ts
 */
import { strict as assert } from "node:assert";
import {
  percentil,
  resumirLatencia,
  type CadInteraction,
} from "./interaction-latency";

/* ── Percentil ────────────────────────────────────────────────────────────── */
assert.equal(percentil([], 0.5), 0, "sin muestras no hay percentil, hay cero");
assert.equal(percentil([42], 0.95), 42, "una muestra es todos los percentiles");
assert.equal(percentil([10, 20, 30, 40], 0.5), 25, "la mediana interpola entre 20 y 30");
assert.equal(percentil([10, 20, 30, 40], 0), 10);
assert.equal(percentil([10, 20, 30, 40], 1), 40);
// La razón de ser de la interpolación: con 20 muestras, el p95 NO puede ser el
// máximo, porque entonces sería el mismo número que `peor` y no informaría.
{
  const veinte = Array.from({ length: 20 }, (_, i) => (i + 1) * 10); // 10..200
  const p95 = percentil(veinte, 0.95);
  assert.ok(p95 < 200, `el p95 de 20 muestras no debe ser el máximo, fue ${p95}`);
  assert.ok(p95 > 180, `pero sí debe estar cerca, fue ${p95}`);
}

/* ── Resumen ──────────────────────────────────────────────────────────────── */
{
  const vacio = resumirLatencia([]);
  assert.deepEqual(
    { ...vacio, peores: vacio.peores.length },
    { muestras: 0, p50: 0, p75: 0, p95: 0, peor: 0, peores: 0 },
  );
}
{
  // El caso que motiva publicar percentiles y no la media: cien clics buenos y
  // cinco atascos. La media diría 71 ms; el usuario vio el editor colgarse.
  const muestras: CadInteraction[] = [
    ...Array.from({ length: 100 }, (_, i) => ({
      nombre: "pointerdown",
      duracion: 30,
      inicio: i,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      nombre: "keydown",
      duracion: 900,
      inicio: 200 + i,
    })),
  ];
  const r = resumirLatencia(muestras);
  const media = muestras.reduce((a, m) => a + m.duracion, 0) / muestras.length;
  assert.ok(media > 65 && media < 75, `la media esconde el problema: ${media.toFixed(0)} ms`);
  assert.equal(r.p50, 30, "la mitad de los clics siguen siendo rápidos");

  // Y AQUÍ ESTÁ LA LECCIÓN, que esta aserción existe para dejar escrita: con 5
  // atascos de 105 muestras (4,8 %), el p95 TAMPOCO los ve — vale 30 ms, igual
  // que el p50. No es un fallo del cálculo: es la definición de percentil. Por
  // eso el informe publica `peor` al lado, y por eso `peores` trae los cinco
  // con su tipo de evento. Un panel que enseñe sólo percentiles deja invisible
  // exactamente el caso por el que alguien escribe a soporte.
  assert.equal(r.p95, 30, "5 de 105 caen fuera del p95: el percentil no los ve");
  assert.equal(r.peor, 900, "por eso el peor se publica aparte");
  assert.equal(r.peores.length, 5);
  assert.equal(r.peores[0].nombre, "keydown", "el peor viene con su tipo de evento");

  // Con 10 atascos de 110 (9,1 %) el p95 sí los alcanza. La frontera importa:
  // es la diferencia entre «un usuario tuvo mala suerte» y «esto le pasa a todo
  // el mundo una vez cada diez clics».
  const conMas = [
    ...muestras,
    ...Array.from({ length: 5 }, (_, i) => ({
      nombre: "keydown",
      duracion: 900,
      inicio: 300 + i,
    })),
  ];
  assert.ok(
    resumirLatencia(conMas).p95 > 30,
    "con el 9 % de atascos, el p95 tiene que verlos",
  );
}

console.log("latencia de interacción: 14/14");
