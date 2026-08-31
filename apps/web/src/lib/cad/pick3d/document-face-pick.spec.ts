/**
 * Designar una cara EN EL DOCUMENTO: el impacto más cercano gana, y un sólido
 * roto no puede tumbar la designación de sus vecinos.
 */
import { strict as assert } from "node:assert";
import { cadDocumentFaceUnderRay } from "./document-face-pick";
import { clearSolidCache } from "../solid3d-build";
import type { CadDocument } from "../cad-document";
import type { CadSolid3dEntity } from "../cad-entities-v5";

function caja(id: string, x: number, lado = 10): CadSolid3dEntity {
  return {
    id,
    type: "solid3d",
    layer: "0",
    root: "b",
    nodes: [
      { id: "b", op: "box", min: { x, y: 0, z: 0 }, max: { x: x + lado, y: lado, z: lado } },
    ],
  };
}

function documento(entities: CadSolid3dEntity[]): CadDocument {
  return { meta: { version: 1, schema: 5, unit: "mm" }, layers: [], entities,
    modelSpace: { entityIds: entities.map((e) => e.id) } } as unknown as CadDocument;
}

clearSolidCache();

// --- 1 · el rayo toca la cara de arriba de la caja --------------------------
{
  const pick = cadDocumentFaceUnderRay(documento([caja("a", 0)]), {
    origin: { x: 5, y: 5, z: 100 },
    direction: { x: 0, y: 0, z: -1 },
  });
  assert.ok(pick, "el rayo desde arriba toca la caja");
  assert.equal(pick.entityId, "a", "y sabe de qué sólido es la cara");
  assert.ok(pick.normal.z > 0.9, "la normal de la tapa apunta hacia arriba");
  assert.ok(Math.abs(pick.point.z - 10) < 1e-6, "y el impacto está en la cota de la tapa");
  assert.ok(pick.face.plane.nz > 0.9, "la huella lleva el mismo plano");
}

// --- 2 · con dos sólidos en la trayectoria, gana el más cercano -------------
{
  clearSolidCache();
  // Una caja alta delante de otra: el rayo horizontal entra por la primera.
  const cerca = caja("cerca", 0);
  const lejos = caja("lejos", 50);
  const pick = cadDocumentFaceUnderRay(documento([lejos, cerca]), {
    origin: { x: -100, y: 5, z: 5 },
    direction: { x: 1, y: 0, z: 0 },
  });
  assert.ok(pick, "toca algo");
  assert.equal(pick.entityId, "cerca", "y es el sólido de delante, aunque estuviera después en la lista");
}

// --- 3 · un sólido roto se salta, no tumba la designación ------------------
{
  clearSolidCache();
  const roto: CadSolid3dEntity = {
    id: "roto", type: "solid3d", layer: "0", root: "x",
    // `x` referencia un operando que no existe: el árbol no evalúa.
    nodes: [{ id: "x", op: "push", operand: "no-existe",
      face: { index: 0, plane: { nx: 0, ny: 0, nz: 1, d: 0 },
        centroid: { x: 0, y: 0, z: 0 }, loopSize: 4, innerLoops: 0, area: 1 },
      distance: 1 }],
  };
  const pick = cadDocumentFaceUnderRay(documento([roto, caja("sano", 0)]), {
    origin: { x: 5, y: 5, z: 100 },
    direction: { x: 0, y: 0, z: -1 },
  });
  assert.ok(pick, "el sólido roto no impide designar el sano");
  assert.equal(pick.entityId, "sano", "y se designa el que sí evalúa");
}

// --- 4 · un rayo que no toca nada devuelve null, no una cara cualquiera -----
{
  clearSolidCache();
  const pick = cadDocumentFaceUnderRay(documento([caja("a", 0)]), {
    origin: { x: 1000, y: 1000, z: 1000 },
    direction: { x: 0, y: 0, z: -1 },
  });
  assert.equal(pick, null, "apuntar al vacío no designa nada");
}

console.log("✔ designación de cara en el documento: 10 aserciones verdes");
