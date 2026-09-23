/**
 * La niebla en planta: la prueba que faltaba.
 *
 * Este archivo existe porque el defecto que cubre fue el más caro del producto
 * y NADA lo veía: el documento tenía la entidad, el contador subía, el
 * historial ofrecía deshacerla, y el lienzo no cambiaba un píxel. La causa era
 * aritmética —la cámara de planta está a 1000 unidades y la niebla acaba a
 * 102—, así que la prueba también lo es: si alguien vuelve a encender la niebla
 * en planta, o baja la cámara, o ensancha la niebla, esto se pone rojo.
 */
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { ORTHO_ELEVATION } from "@/lib/cad/view/view-controller";
import { applyCadSceneFog, setCadSceneFogColor } from "./plan-fog";

let verdes = 0;
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};

// La huella del estudio: 12 × 10 m en milímetros, con la escala de escena que
// usa el editor (`s = 30 / max(W, H)`).
const W = 12_000;
const H = 10_000;
const footprint = { W, H, s: 30 / Math.max(W, H) };

// ── 1. En planta no hay niebla ────────────────────────────────────────────────
{
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0f1e, 42, 102);
  applyCadSceneFog(scene, "2d", footprint);
  eq(scene.fog, null, "en 2D la niebla se apaga");
}

// ── 2. El porqué, en números: con niebla, la planta saldría del color del fondo ─
{
  const scene = new THREE.Scene();
  applyCadSceneFog(scene, "3d", footprint);
  const fog = scene.fog as THREE.Fog;
  ok(fog instanceof THREE.Fog, "en 3D la niebla existe");
  // La profundidad a la que la cámara ortográfica de planta ve el dibujo.
  const profundidadEnPlanta = ORTHO_ELEVATION;
  ok(
    profundidadEnPlanta > fog.far,
    `la cámara de planta (${profundidadEnPlanta}) está más allá del borde lejano de la niebla (${fog.far}): con niebla encendida, TODO material estándar se pinta del color del fondo`,
  );
  // El factor de niebla de THREE es smoothstep(near, far, depth): saturado.
  const factor = Math.min(
    1,
    Math.max(0, (profundidadEnPlanta - fog.near) / (fog.far - fog.near)),
  );
  eq(factor, 1, "el factor de niebla en planta satura a 1: color de niebla puro");
}

// ── 3. El color del tema sobrevive al viaje 2D → 3D ──────────────────────────
{
  const scene = new THREE.Scene();
  setCadSceneFogColor(scene, 0xeaf0f8); // tema claro
  applyCadSceneFog(scene, "2d", footprint);
  eq(scene.fog, null, "planta sigue sin niebla aunque se haya fijado color");
  applyCadSceneFog(scene, "3d", footprint);
  eq(
    (scene.fog as THREE.Fog).color.getHex(),
    0xeaf0f8,
    "al volver al 3D la niebla renace con el color del tema, no con el de fábrica",
  );
  setCadSceneFogColor(scene, 0x202329);
  eq(
    (scene.fog as THREE.Fog).color.getHex(),
    0x202329,
    "cambiar de tema con niebla encendida la repinta en el acto",
  );
}

// ── 4. Los bordes de la niebla se derivan de la huella ───────────────────────
{
  const scene = new THREE.Scene();
  applyCadSceneFog(scene, "3d", { W: 8_000, H: 6_000, s: 30 / 8_000 });
  const fog = scene.fog as THREE.Fog;
  eq(Math.round(fog.near), 42, "borde cercano = span · 1,4");
  eq(Math.round(fog.far), 102, "borde lejano = span · 3,4");
}

console.log(`✔ niebla en planta: ${verdes} aserciones verdes`);
