/**
 * El cálculo puro de CHSPACE: el factor de escala y la afín completa, medidos
 * en números — no «se aplicó una transformación», sino CUÁL.
 */
import { strict as assert } from "node:assert";
import { cadAffineApply } from "./transform2d";
import {
  cadChspaceAffine,
  cadChspaceCurrentlyInPaper,
  cadChspaceDirectionFor,
  cadChspaceMembership,
  cadChspaceScaleFactor,
} from "./cad-chspace";
import type { CadPaperSpace, CadPaperViewport } from "./cad-document";

const viewport: CadPaperViewport = {
  id: "vp1",
  name: "Planta",
  paperBounds: { x: 10, y: 20, width: 200, height: 120 },
  modelBounds: { x: 1_000, y: 2_000, width: 10_000, height: 6_000 },
  scale: 50, // 1:50
  locked: true,
};

// --- el factor: unidades del modelo -> mm de papel, y su inverso exacto -----
{
  // mm, 1:50 -> factor = unitToMm(mm)=1 / 50 = 0.02
  const toPaper = cadChspaceScaleFactor(viewport, "mm", "toPaper");
  assert.ok(Math.abs(toPaper - 0.02) < 1e-9, `factor a papel: ${toPaper}`);
  const toModel = cadChspaceScaleFactor(viewport, "mm", "toModel");
  assert.ok(Math.abs(toModel - 50) < 1e-9, `factor a modelo: ${toModel}`);
  assert.ok(Math.abs(toPaper * toModel - 1) < 1e-9, "los dos factores son inversos exactos");

  // Un muro de 8 m (8000 mm) visto a 1:50 mide 160 mm en papel.
  const wallLengthMm = 8_000 * toPaper;
  assert.ok(Math.abs(wallLengthMm - 160) < 1e-9, `8 m a 1:50 = 160 mm de papel (dio ${wallLengthMm})`);

  // Unidad "m": la misma ventana, un modelo en METROS.
  const toPaperM = cadChspaceScaleFactor(viewport, "m", "toPaper");
  assert.ok(Math.abs(toPaperM - 1000 / 50) < 1e-9, `factor a papel en metros: ${toPaperM}`);
}

// --- la afín: escala Y traslada, sin voltear el eje Y ------------------------
{
  const toPaper = cadChspaceAffine(viewport, "mm", "toPaper");
  // La esquina de modelBounds cae EXACTAMENTE en la esquina de paperBounds.
  const corner = cadAffineApply(toPaper, { x: viewport.modelBounds.x, y: viewport.modelBounds.y });
  assert.ok(Math.abs(corner.x - viewport.paperBounds.x) < 1e-9, `esquina X: ${corner.x}`);
  assert.ok(Math.abs(corner.y - viewport.paperBounds.y) < 1e-9, `esquina Y: ${corner.y}`);
  // Sin volteo: subir en Y en el modelo sube en Y en el papel.
  const up = cadAffineApply(toPaper, {
    x: viewport.modelBounds.x,
    y: viewport.modelBounds.y + 100,
  });
  assert.ok(up.y > corner.y, "el eje Y no se invierte: subir en modelo sube en papel");

  // Y la vuelta exacta: aplicar toModel deshace toPaper, punto a punto.
  const toModel = cadChspaceAffine(viewport, "mm", "toModel");
  const probe = { x: viewport.modelBounds.x + 3_000, y: viewport.modelBounds.y + 1_500 };
  const roundTrip = cadAffineApply(toModel, cadAffineApply(toPaper, probe));
  assert.ok(Math.abs(roundTrip.x - probe.x) < 1e-6, `ida y vuelta X: ${roundTrip.x} vs ${probe.x}`);
  assert.ok(Math.abs(roundTrip.y - probe.y) < 1e-6, `ida y vuelta Y: ${roundTrip.y} vs ${probe.y}`);
}

// --- dirección y pertenencia: el objeto viaja al espacio contrario de donde está --
{
  const space: CadPaperSpace = {
    id: "sheet",
    name: "Hoja",
    order: 0,
    entityIds: ["sello"],
    page: { width: 420, height: 297, unit: "mm", orientation: "landscape" },
    viewports: [viewport],
  };
  assert.equal(cadChspaceCurrentlyInPaper(space, "sello"), true);
  assert.equal(cadChspaceCurrentlyInPaper(space, "muro"), false);
  assert.equal(cadChspaceDirectionFor(space, "sello"), "toModel");
  assert.equal(cadChspaceDirectionFor(space, "muro"), "toPaper");

  const moved = cadChspaceMembership(space, "muro", "toPaper");
  assert.deepEqual(moved.entityIds, ["sello", "muro"], "toPaper AÑADE a entityIds");
  const backAgain = cadChspaceMembership(moved, "muro", "toModel");
  assert.deepEqual(backAgain.entityIds, ["sello"], "toModel RETIRA de entityIds, ida y vuelta exacta");

  // Aplicar la misma dirección dos veces es idempotente (no duplica ni falla).
  const twice = cadChspaceMembership(moved, "muro", "toPaper");
  assert.deepEqual(twice.entityIds, ["sello", "muro"], "toPaper repetido no duplica");
}

console.log(
  "cad-chspace: el factor a papel (mm/escala) y a modelo (escala/mm) son inversos exactos, " +
    "la afín hace coincidir las esquinas SIN voltear el eje Y y deshace su propio viaje, " +
    "y la pertenencia a `entityIds` viaja al espacio contrario de donde está el objeto.",
);
