/** El rayo de escena convertido a dibujo: el origen se centra, la dirección no. */
import { strict as assert } from "node:assert";
import { cadSceneRayToDrawing } from "./scene-ray";

const marco = { s: 0.003, W: 10_000, H: 6_000 };

// --- 1 · un rayo que baja por el centro de la escena baja por el centro -----
{
  const r = cadSceneRayToDrawing(
    { origin: { x: 0, y: 50, z: 0 }, direction: { x: 0, y: -1, z: 0 } },
    marco,
  );
  assert.ok(Math.abs(r.origin.x - marco.W / 2) < 1e-9, "el centro de la escena es el centro de la huella en X");
  assert.ok(Math.abs(r.origin.y - marco.H / 2) < 1e-9, "y en Y");
  assert.ok(r.direction.z < 0, "y sigue bajando");
  assert.ok(Math.abs(r.direction.x) < 1e-12 && Math.abs(r.direction.y) < 1e-12, "sin componente horizontal");
}

// --- 2 · la DIRECCIÓN no lleva la traslación del centrado -------------------
//
// Es el error clásico de esta conversión: meterle el +W/2 a la dirección hace
// que un rayo oblicuo apunte a cualquier parte en cuanto la huella es grande.
{
  const r = cadSceneRayToDrawing(
    { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
    marco,
  );
  assert.ok(r.direction.x > 0, "la dirección apunta a +X");
  assert.ok(
    Math.abs(r.direction.x - 1 / marco.s) < 1e-6,
    `la dirección sólo se escala: esperaba ${1 / marco.s}, dio ${r.direction.x}`,
  );
  assert.ok(Math.abs(r.direction.y) < 1e-12, "y no gana una componente que no tenía");
}

// --- 3 · el eje vertical de la escena es la COTA del dibujo -----------------
{
  const r = cadSceneRayToDrawing(
    { origin: { x: 0, y: 30, z: 0 }, direction: { x: 0, y: -1, z: 0 } },
    marco,
  );
  assert.ok(Math.abs(r.origin.z - 30 / marco.s) < 1e-6, "la altura de escena es la Z del dibujo, escalada");
}

// --- 4 · una escala cero no revienta: se trata como 1 ----------------------
{
  const r = cadSceneRayToDrawing(
    { origin: { x: 1, y: 2, z: 3 }, direction: { x: 0, y: -1, z: 0 } },
    { s: 0, W: 0, H: 0 },
  );
  assert.ok(Number.isFinite(r.origin.x) && Number.isFinite(r.origin.z), "sin infinitos ni NaN");
}

console.log("✔ rayo de escena a dibujo: 9 aserciones verdes");
