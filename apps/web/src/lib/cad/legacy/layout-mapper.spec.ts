/**
 * `layoutFromDocument` expone `entityLayers` — la capa real de CUALQUIER
 * entidad, no sólo de los activos. Antes de este campo, `Layout3DEditor.tsx`
 * sólo mezclaba `snapshot.layers` dentro de cada `asset`: una anotación
 * `type:"text"` (que no tiene campo `layer` propio en `Ann`) se quedaba sin
 * ninguna forma de recuperar la suya, y `layoutToCadDocument` caía a su
 * defecto `"Text"` en cuanto el documento se abría — la capa real del
 * DWG/DXF importado (p. ej. `TEXTOS`) se perdía SIN GUARDAR NADA, sólo por
 * abrir. Este spec fija que el mapa llega completo.
 */
import { strict as assert } from "node:assert";
import { layoutFromDocument, type OpenedDocument } from "./layout-mapper";
import type { CadDocument } from "../cad-document";

const row = (cadDocument: unknown): OpenedDocument => ({
  id: "doc-1",
  projectId: "proj-1",
  name: "Plano",
  model: "m",
  revision: "r",
  cadDocumentVersion: 1,
  cadDocument: cadDocument as Record<string, unknown>,
});

// --- una anotación text en una capa real sobrevive a `layoutFromDocument` --
{
  const document: Partial<CadDocument> & { meta: CadDocument["meta"] } = {
    meta: { version: 1, schema: 10, unit: "mm" },
    layers: [
      { id: "TEXTOS", name: "TEXTOS", color: "#ff00ff", visible: true, locked: false },
    ],
    entities: [
      { id: "t1", type: "text", x: 20, y: 45, text: "SALA", layer: "TEXTOS" },
    ],
  };
  const result = layoutFromDocument("modelo", "r1", row(document), null);
  assert.equal(
    result.entityLayers.t1,
    "TEXTOS",
    "la anotación text lleva su capa real en entityLayers, no sólo en snapshot.layers",
  );
  assert.equal(
    result.annotations.find((a) => a.id === "t1")?.text,
    "SALA",
    "el contenido sigue llegando por annotations, como antes",
  );
}

// --- una anotación en la capa literal "Text" no aparece en el mapa --------
// (es el defecto, no una omisión: reconstruirla sin entrada cae a él sola.)
{
  const document: Partial<CadDocument> & { meta: CadDocument["meta"] } = {
    meta: { version: 1, schema: 10, unit: "mm" },
    entities: [
      { id: "t2", type: "text", x: 0, y: 0, text: "nota", layer: "Text" },
    ],
  };
  const result = layoutFromDocument("modelo", "r1", row(document), null);
  assert.equal(
    result.entityLayers.t2,
    undefined,
    "la capa por defecto no se materializa en el mapa: no hace falta reconstruirla",
  );
}

// --- un activo (box) sigue apareciendo, igual que antes de este campo -----
{
  const document: Partial<CadDocument> & { meta: CadDocument["meta"] } = {
    meta: { version: 1, schema: 10, unit: "mm" },
    layers: [
      { id: "MOBILIARIO", name: "MOBILIARIO", color: "#00ff00", visible: true, locked: false },
    ],
    entities: [
      { id: "a1", type: "box", kind: "generic", x: 0, y: 0, w: 10, h: 10, rotation: 0, layer: "MOBILIARIO", shape: "rect" },
    ],
  };
  const result = layoutFromDocument("modelo", "r1", row(document), null);
  assert.equal(result.entityLayers.a1, "MOBILIARIO");
  assert.equal(
    result.assets.find((a) => a.id === "a1")?.layer,
    "MOBILIARIO",
    "el activo sigue llevando su capa embebida, como ya hacía antes de este campo",
  );
}

// --- sin documento canónico, el mapa existe vacío (no undefined) ----------
{
  const result = layoutFromDocument("modelo", "r1", row(null), null);
  assert.deepEqual(result.entityLayers, {});
}

console.log("layout-mapper specs passed");
