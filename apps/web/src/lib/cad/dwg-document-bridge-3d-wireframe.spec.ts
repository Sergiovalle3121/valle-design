/**
 * El puente DWG y el perfil 3D heredado PROPUESTO (`AC1015_3D_WIREFRAME_V1`,
 * ADR-0009 §9): 3DFACE, POLYLINE 3D, POLYLINE MESH, POLYLINE PFACE.
 *
 * Igual que `dwg-document-bridge.spec.ts` prueba el puente entero con la
 * puerta cerrada, esta spec prueba dos cosas que importan por separado:
 *
 * 1. `DWG_3D_WIREFRAME_BETA_AUTHORIZATION.ownerSigned` sigue `false` — nadie
 *    ha firmado este perfil todavía, así que la conjunción de tres
 *    condiciones (`dwg3dWireframeBetaImportIsEnabled`) tiene que devolver
 *    `false` PASE LO QUE PASE con los otros dos términos.
 * 2. El mapeo en sí —lo que SÍ se puede construir y probar sin firma, con
 *    bases hechas a mano— conserva la geometría REAL (Z verdadera) en
 *    `unsupportedEntities`, la declara en el manifiesto de pérdidas, y un
 *    archivo que sólo trae estos cuatro tipos no cae en el fallo cerrado de
 *    "nada importable" que sí aplica cuando de verdad no se pudo conservar
 *    nada.
 */
import { strict as assert } from "node:assert";
import {
  DWG_3D_WIREFRAME_BETA_AUTHORIZATION,
  dwg3dWireframeBetaImportIsEnabled,
} from "./dwg-interop-flag";
import { dwgNeutralDatabaseToCadDocument } from "./dwg-document-bridge";
import type {
  DwgNeutralDatabase,
  DwgNeutralEntityRecord,
  DwgNeutralPoint3,
} from "./dwg-neutral-model";

// ─── 1. SIN FIRMA: la conjunción de tres nunca da `true`, ni con las dos
//        banderas encendidas ────────────────────────────────────────────────

assert.equal(
  DWG_3D_WIREFRAME_BETA_AUTHORIZATION.ownerSigned,
  false,
  "nadie ha firmado el perfil 3D heredado todavía: esto tiene que seguir en false hasta que " +
    "una firma real (como §6-bis/§7) lo cambie — nunca por comodidad de un PR",
);
for (const wireframeFlagOn of [true, false]) {
  for (const baseBetaFlagOn of [true, false]) {
    assert.equal(
      dwg3dWireframeBetaImportIsEnabled(wireframeFlagOn, baseBetaFlagOn),
      false,
      `dwg3dWireframeBetaImportIsEnabled(${wireframeFlagOn}, ${baseBetaFlagOn}) debe ser false: ` +
        "sin ownerSigned no hay conjunción que valga",
    );
  }
}

// ─── 2. El mapeo puro: geometría real, conservada, declarada ──────────────

const p3 = (x: number, y: number, z: number): DwgNeutralPoint3 => ({ x, y, z });

const record = (
  handle: number,
  entity: DwgNeutralEntityRecord["entity"],
  vertices?: DwgNeutralEntityRecord[],
): DwgNeutralEntityRecord => ({
  handle,
  entity,
  layerHandle: undefined,
  insertedBlockName: undefined,
  attributes: undefined,
  vertices,
});

const FACE3D_RECORD = record(0x50, {
  kind: "face3d",
  corners: [p3(0, 0, 0), p3(40, 0, 0), p3(40, 25, 18), p3(0, 25, 18)],
  invisibilityFlags: 0,
});

const POLYLINE_3D_RECORD = record(
  0x60,
  { kind: "polyline3d", splineFlags: 0, closedFlags: 0 },
  [
    record(0x61, { kind: "vertex3d", flags: 32, position: p3(0, 0, 0) }),
    record(0x62, { kind: "vertex3d", flags: 32, position: p3(10, 0, 3) }),
    record(0x63, { kind: "vertex3d", flags: 32, position: p3(10, 10, 6) }),
  ],
);

const vacia3d: DwgNeutralDatabase = {
  layers: [],
  blocks: [],
  modelSpaceEntities: [FACE3D_RECORD, POLYLINE_3D_RECORD],
  insunits: 4,
  unsupported: [],
  diagnostics: [],
};

const informe = dwgNeutralDatabaseToCadDocument(vacia3d);

assert.equal(
  informe.document.unsupportedEntities.length,
  2,
  "las dos entidades del perfil 3D heredado llegan a unsupportedEntities, no se pierden",
);
assert.equal(
  informe.document.entities.length,
  0,
  "no se dibujan como entidades nativas todavía: eso es lo que declara el §9 propuesto",
);

const face3dOpaque = informe.document.unsupportedEntities.find(
  (entity) => entity.sourceType === "3DFACE",
);
assert.ok(face3dOpaque, "el 3DFACE se conserva con su sourceType legible");
assert.equal(face3dOpaque!.editable, false, "conservado, no editable: es el contrato de CadOpaqueEntity");
assert.equal(face3dOpaque!.provider, "dwg-neutral-bridge");
const face3dPayload = JSON.parse(face3dOpaque!.raw) as {
  kind: string;
  corners: DwgNeutralPoint3[];
};
assert.deepEqual(
  face3dPayload.corners.map((c) => c.z),
  [0, 0, 18, 18],
  "el JSON conservado trae la Z real de cada esquina — el round-trip no aplana nada",
);

const polyline3dOpaque = informe.document.unsupportedEntities.find(
  (entity) => entity.sourceType === "POLYLINE_3D",
);
assert.ok(polyline3dOpaque, "la POLYLINE 3D se conserva");
const polyline3dPayload = JSON.parse(polyline3dOpaque!.raw) as {
  vertices: DwgNeutralPoint3[];
};
assert.deepEqual(
  polyline3dPayload.vertices.map((v) => v.z),
  [0, 3, 6],
  "cada vértice conserva su propia Z: la escalera del fixture 26 de la ola 3 del corpus hermano",
);

assert.ok(
  informe.document.lossManifest.some(
    (entry) => entry.code === "dwg_3d_wireframe_preserved_opaque" && entry.sourceType === "3DFACE",
  ),
  "el manifiesto de pérdidas declara el 3DFACE conservado — nunca en silencio",
);
assert.ok(
  informe.document.lossManifest.some(
    (entry) =>
      entry.code === "dwg_3d_wireframe_preserved_opaque" && entry.sourceType === "POLYLINE_3D",
  ),
  "y la POLYLINE 3D también",
);

// ─── 3. Un archivo que SÓLO trae perfil 3D heredado no cae en "nada
//        importable": sí conservó algo, sólo que no lo dibuja todavía ──────

assert.doesNotThrow(
  () => dwgNeutralDatabaseToCadDocument(vacia3d),
  "un documento con únicamente 3DFACE/POLYLINE 3D no lanza el fallo cerrado de 'nada importable': " +
    "el objeto preservado cuenta como algo importado, aunque no se dibuje",
);

console.log(
  "dwg-document-bridge (perfil 3D heredado §9): sin firma la conjunción de tres nunca abre, " +
    "el mapeo puro conserva Z real en unsupportedEntities con su pérdida declarada, y un " +
    "documento sólo-3D no cae en el fallo cerrado de 'nada importable'.",
);
