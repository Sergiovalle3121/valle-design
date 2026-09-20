/**
 * VPORTS en espacio modelo: el reparto de rectángulos y el arranque de cámara,
 * medidos — no «se dividió la pantalla», sino en qué rectángulo EXACTO cae
 * cada ventana y con qué cámara arranca cada una.
 */
import { strict as assert } from "node:assert";
import {
  CAD_MODEL_VIEWPORT_LAYOUTS,
  cadModelViewportTiles,
  createCadModelViewportSplit,
  setCadModelViewportActive,
  setCadModelViewportCamera,
} from "./model-viewports";
import type { CadViewportCameraSnapshot } from "./viewport-bookmarks";

// --- los cuatro repartos cubren el visor ENTERO, sin huecos ni solapes ------
for (const layout of CAD_MODEL_VIEWPORT_LAYOUTS) {
  const tiles = cadModelViewportTiles(layout);
  assert.ok(tiles.length >= 1, `${layout} tiene al menos una ventana`);
  // Área total = 1 (el visor entero), sumando cada rectángulo fraccionario.
  const area = tiles.reduce((sum, tile) => sum + tile.rect.w * tile.rect.h, 0);
  assert.ok(Math.abs(area - 1) < 1e-9, `${layout}: el área cubierta es el visor entero (dio ${area})`);
  for (const tile of tiles) {
    assert.ok(tile.rect.x >= 0 && tile.rect.x + tile.rect.w <= 1 + 1e-9, `${layout}/${tile.id}: X dentro del visor`);
    assert.ok(tile.rect.y >= 0 && tile.rect.y + tile.rect.h <= 1 + 1e-9, `${layout}/${tile.id}: Y dentro del visor`);
  }
}
assert.equal(cadModelViewportTiles("4").length, 4, "Cuatro son cuatro ventanas");
assert.equal(cadModelViewportTiles("2-cols")[0].rect.w, 0.5, "2 columnas: cada una mitad del ancho");
assert.equal(cadModelViewportTiles("2-rows")[0].rect.h, 0.5, "2 filas: cada una mitad del alto");

// --- crear el reparto: TODAS arrancan con la MISMA cámara que había ---------
{
  const camera: CadViewportCameraSnapshot = {
    mode: "3d",
    position: { x: 10, y: 20, z: 30 },
    target: { x: 1, y: 2, z: 3 },
  };
  const split = createCadModelViewportSplit("4", camera);
  assert.equal(split.length, 4);
  for (const viewport of split) {
    assert.deepEqual(viewport.camera, camera, `${viewport.id} arranca mirando lo mismo que el visor único`);
  }
  assert.equal(split.filter((v) => v.active).length, 1, "sólo UNA ventana tiene el foco");
  assert.equal(split[0].active, true, "la primera es la activa al crear el reparto");

  // Mutar la cámara de UNA copia no debe tocar la del resto (aislamiento real,
  // no el mismo objeto compartido cuatro veces).
  split[0].camera.position.x = 999;
  assert.equal(split[1].camera.position.x, 10, "las cámaras son copias independientes");
}

// --- cambiar la cámara de una ventana no toca las otras ----------------------
{
  const camera: CadViewportCameraSnapshot = { mode: "2d", position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } };
  const split = createCadModelViewportSplit("2-cols", camera);
  const newCamera: CadViewportCameraSnapshot = { mode: "2d", position: { x: 5, y: 5, z: 0 }, target: { x: 5, y: 5, z: 0 } };
  const changed = setCadModelViewportCamera(split, split[1].id, newCamera);
  assert.deepEqual(changed[1].camera, newCamera, "la ventana designada cambia de cámara");
  assert.deepEqual(changed[0].camera, camera, "la otra sigue mirando lo mismo");
}

// --- el foco es EXCLUSIVO: activar una desactiva las demás -------------------
{
  const camera: CadViewportCameraSnapshot = { mode: "2d", position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } };
  const split = createCadModelViewportSplit("4", camera);
  const focused = setCadModelViewportActive(split, split[2].id);
  assert.equal(focused.filter((v) => v.active).length, 1, "sigue habiendo SÓLO una activa");
  assert.equal(focused.find((v) => v.id === split[2].id)?.active, true);
  assert.equal(focused.find((v) => v.id === split[0].id)?.active, false, "la que tenía el foco lo pierde");

  const untouched = setCadModelViewportActive(split, "no-existe");
  assert.deepEqual(untouched, split, "una ventana que no existe no cambia nada");
}

console.log(
  "model-viewports: los cuatro repartos cubren el visor entero sin huecos ni solapes, " +
    "el reparto nuevo arranca con la MISMA cámara para cada ventana (copias independientes), " +
    "cambiar una cámara no toca las demás, y el foco es exclusivo de una sola ventana.",
);
