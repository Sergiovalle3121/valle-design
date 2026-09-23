/**
 * La banda elástica, y el origen flotante que casi la manda a kilómetros.
 *
 * El defecto era latente y ninguna prueba lo habría visto: la previsualización
 * recibía el viewport UNA vez, al construirse, y nadie llamaba jamás a
 * `setViewport`. El resto de la escena —lotes, inserts, imágenes, minimapa—
 * resta el ORIGEN FLOTANTE antes de escalar, y ese origen deja de ser cero en
 * cuanto el centroide del dibujo se aleja 50 m del origen del mundo
 * (`render/render-origin.ts`, rejilla de 100 m). En un plano georreferenciado
 * —coordenadas UTM, del orden de 10⁶— la geometría se dibuja cerca del cero y
 * la banda se habría ido a la distancia entera del origen: invisible, sin un
 * solo error en consola.
 *
 * Por eso el viewport se PIDE en cada trazo. Aquí se comprueban las dos cosas
 * que eso garantiza: que la banda resta el origen, y que lo lee otra vez en el
 * trazo siguiente si el origen cambió.
 *
 * Correr: npx tsx src/components/cad/viewport/engine-preview.spec.ts
 */
import { strict as assert } from "node:assert";
import * as THREE from "three";
import type { CadThreeViewport } from "@/lib/cad/entity-three";
import { CadEnginePreview } from "./engine-preview";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const casi = (actual: number, esperado: number, mensaje: string) => {
  assert.ok(
    Math.abs(actual - esperado) < 1e-6,
    `${mensaje} (esperaba ${esperado}, dio ${actual})`,
  );
  verdes += 1;
};

/** Los vértices que la previsualización subió a la geometría. */
function vertices(padre: THREE.Object3D): Float32Array {
  const objeto = padre.children.find((hijo) => hijo.name === "cad-engine:preview");
  const geometria = (objeto as THREE.LineSegments).geometry;
  const atributo = geometria.getAttribute("position") as THREE.BufferAttribute;
  return atributo.array as Float32Array;
}

const TRAZO = [{ points: [{ x: 1_000, y: 2_000 }, { x: 3_000, y: 2_000 }] }];

// ── Sin origen flotante: el cálculo de siempre ──────────────────────────────
{
  const padre = new THREE.Group();
  const preview = new CadEnginePreview(padre, { scale: 0.001, width: 12_000, height: 10_000 });
  preview.draw(TRAZO);
  const v = vertices(padre);
  casi(v[0], (1_000 - 6_000) * 0.001, "x del primer vértice: (mundo − ancho/2) · escala");
  casi(v[2], (2_000 - 5_000) * 0.001, "z del primer vértice: (mundo − alto/2) · escala");
  ok(preview.segmentCount === 1, "un trazo de dos puntos es un segmento");
}

// ── Con origen flotante: se resta ANTES de escalar ──────────────────────────
{
  const padre = new THREE.Group();
  const preview = new CadEnginePreview(padre, {
    scale: 0.001,
    width: 12_000,
    height: 10_000,
    origin: { x: 100_000, y: 200_000 },
  });
  preview.draw(TRAZO);
  const v = vertices(padre);
  casi(v[0], (1_000 - 100_000 - 6_000) * 0.001, "el origen flotante se resta en x");
  casi(v[2], (2_000 - 200_000 - 5_000) * 0.001, "y en y");
}

// ── El viewport se PIDE en cada trazo: si el origen cambia, la banda le sigue ─
{
  const padre = new THREE.Group();
  let origen = { x: 0, y: 0 };
  const preview = new CadEnginePreview(padre, (): CadThreeViewport => ({
    scale: 0.001,
    width: 12_000,
    height: 10_000,
    origin: origen,
  }));
  preview.draw(TRAZO);
  casi(vertices(padre)[0], (1_000 - 6_000) * 0.001, "primer trazo, sin origen");
  // El pipeline mueve el origen —el usuario se fue lejos del cero—.
  origen = { x: 100_000, y: 0 };
  preview.draw(TRAZO);
  casi(
    vertices(padre)[0],
    (1_000 - 100_000 - 6_000) * 0.001,
    "el trazo siguiente ya usa el origen nuevo: sin esto la banda se queda donde estaba y el dibujo se va",
  );
}

// ── Y sigue apagándose con una lista vacía ──────────────────────────────────
{
  const padre = new THREE.Group();
  const preview = new CadEnginePreview(padre, { scale: 1, width: 0, height: 0 });
  preview.draw(TRAZO);
  ok(preview.visible, "con trazos, se ve");
  preview.clear();
  ok(!preview.visible, "sin trazos se apaga, en vez de dejar el último colgando");
  ok(preview.segmentCount === 0, "y no declara segmentos que ya no dibuja");
}

console.log(`✔ banda elástica y origen flotante: ${verdes} aserciones verdes`);
