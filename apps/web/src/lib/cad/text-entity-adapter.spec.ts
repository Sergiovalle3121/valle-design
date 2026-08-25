/**
 * Adaptador nativo de TEXT.
 *
 * TEXT era el único tipo de la unión `CadEntity` sin adaptador registrado:
 * vivía en el documento, sobrevivía guardar/abrir (`cad-schema7-entity-census
 * .spec.ts`), pero no se podía seleccionar, arrastrar ni editar en el lienzo
 * de Studio. Este spec fija el contrato del adaptador que lo cierra —no la
 * fidelidad de importación DXF/DWG, que tienen sus propios specs.
 */
import { strict as assert } from "node:assert";
import type { CadEntityTransform, CadNativeEntity } from "./entity-runtime";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";
import { asMText, textAdapter } from "./text-entity-adapter";
import { layoutCadMText } from "./mtext-layout";

type NativeText = Extract<CadNativeEntity, { type: "text" }>;

const minimal: NativeText = {
  id: "t-minimal",
  type: "text",
  x: 1_000,
  y: 500,
  text: "SALA",
  layer: "TEXTOS",
};

const full: NativeText = {
  id: "t-full",
  type: "text",
  x: 0,
  y: 0,
  text: "COCINA",
  layer: "TEXTOS",
  color: "#f97316",
  style: "ROMANS",
  height: 180,
  rotation: 30,
};

// --- registro -----------------------------------------------------------
assert.ok(CAD_ENTITY_REGISTRY.types().includes("text"), "text está en el registro");
assert.ok(CAD_ENTITY_REGISTRY.supports(minimal), "el registro reclama las entidades text");
assert.equal(CAD_ENTITY_REGISTRY.adapter(minimal).type, "text");

// --- anclaje: top-left, igual que la conversión DXF y el TEXT anidado ---
// en un INSERT cuando el origen no trae alineación explícita. Se afirma con
// la ESQUINA, no con el ancho medido (heurístico y no es lo que se protege).
{
  const bounds = textAdapter.bounds.bounds(minimal);
  assert.equal(bounds.minX, minimal.x, "el borde izquierdo es la inserción");
  assert.equal(bounds.maxY, minimal.y, "el borde superior es la inserción: el texto cuelga hacia abajo");
  assert.ok(bounds.maxX > bounds.minX, "tiene ancho");
  assert.ok(bounds.minY < bounds.maxY, "tiene alto");
}

// --- impacto --------------------------------------------------------------
{
  const bounds = textAdapter.bounds.bounds(minimal);
  const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  assert.equal(textAdapter.hitTester.hitTest(minimal, center, 1), true, "el centro de la caja impacta");
  assert.equal(
    textAdapter.hitTester.hitTest(minimal, { x: bounds.maxX + 1_000, y: bounds.minY - 1_000 }, 1),
    false,
    "un punto lejos de la caja no impacta",
  );
  assert.equal(
    textAdapter.hitTester.intersectsWindow(minimal, bounds, false),
    true,
    "la propia caja lo contiene",
  );
  assert.equal(
    textAdapter.hitTester.intersectsWindow(
      minimal,
      { minX: bounds.maxX + 500, minY: bounds.maxY + 500, maxX: bounds.maxX + 600, maxY: bounds.maxY + 600 },
      true,
    ),
    false,
    "una ventana lejana no lo cruza",
  );
}

// --- una sola línea, SIEMPRE: el ancho sintético se mide, no se adivina ---
// Un ancho por defecto o heurístico corto habría partido esto en dos líneas,
// que es justo el defecto que un TEXT (a diferencia de un MTEXT) no puede
// tener — no tiene `width` en el esquema, así que no hay wrap que declarar.
{
  const long: NativeText = { ...minimal, text: "Área de servicio y mantenimiento general del edificio" };
  assert.equal(layoutCadMText(asMText(long)).lines.length, 1, "TEXT nunca se envuelve");
}

// --- grips: inserción, altura, rotación — SIN ancho, porque el campo no existe
{
  const grips = textAdapter.grips.grips(minimal);
  assert.deepEqual(grips.map((grip) => grip.id), ["insertion", "height", "rotation"]);

  const moved = textAdapter.grips.moveGrip(minimal, "insertion", { x: 2_000, y: -300 });
  assert.equal(moved.x, 2_000);
  assert.equal(moved.y, -300);

  // El texto cuelga hacia abajo (top-left): arrastrar el grip de altura MÁS
  // ABAJO que la inserción agranda la letra.
  const grown = textAdapter.grips.moveGrip(minimal, "height", { x: minimal.x, y: minimal.y - 400 });
  assert.equal(grown.height, 400);

  const rotated = textAdapter.grips.moveGrip(minimal, "rotation", { x: minimal.x, y: minimal.y + 100 });
  assert.equal(rotated.rotation, 90);
}

// --- snaps: inserción + 4 esquinas, igual que MTEXT ------------------------
{
  const snaps = textAdapter.snaps.snaps(minimal);
  assert.equal(snaps.length, 5);
  assert.ok(snaps.some((snap) => snap.kind === "endpoint" && snap.point.x === minimal.x && snap.point.y === minimal.y));
}

// --- propiedades: ida y vuelta, incluido el color explícito ----------------
{
  const read = textAdapter.properties.read(full);
  assert.equal(read.text, "COCINA");
  assert.equal(read.insertionX, 0);
  assert.equal(read.insertionY, 0);
  assert.equal(read.height, 180);
  assert.equal(read.rotation, 30);
  assert.equal(read.style, "ROMANS");
  assert.equal(read.color, "#f97316");
  assert.equal(read.layer, "TEXTOS");

  const written = textAdapter.properties.write(full, {
    text: "COCINA 2",
    insertionX: 10,
    insertionY: 20,
    height: 200,
    rotation: 45,
    layer: "ANOTACIONES",
  });
  assert.equal(written.text, "COCINA 2");
  assert.equal(written.x, 10);
  assert.equal(written.y, 20);
  assert.equal(written.height, 200);
  assert.equal(written.rotation, 45);
  assert.equal(written.layer, "ANOTACIONES");
  // Sin patch, el color y el estilo sobreviven: no se materializan solos.
  assert.equal(written.color, "#f97316");
  assert.equal(written.style, "ROMANS");

  // Vaciar el color lo vuelve a `undefined`, no a `""` guardado — igual que
  // `textOverride` en `dimension-entity-adapter.ts`.
  const cleared = textAdapter.properties.write(full, { color: "" });
  assert.equal(cleared.color, undefined);
}

// --- ausencia de altura: se conserva ausente bajo cualquier transformada ---
// Mismo defecto que ya cazó `entity-transform-roundtrip.spec` en MTEXT:
// materializar `height` con su valor por defecto bajo una traslación pura
// fija el tamaño de un texto que nunca lo tuvo explícito.
{
  const noHeight: NativeText = { id: "t-noheight", type: "text", x: 0, y: 0, text: "X", layer: "0" };
  const moved = textAdapter.commands.transform(noHeight, { translation: { x: 10, y: 10 } });
  assert.equal(moved.height, undefined);
}

// --- transformar: traslación, escala y la regla de reflexión --------------
{
  const translated = textAdapter.commands.transform(full, { translation: { x: 100, y: -50 } });
  assert.equal(translated.x, 100);
  assert.equal(translated.y, -50);
  assert.equal(translated.rotation, full.rotation);
  assert.equal(translated.height, full.height);

  const scaled = textAdapter.commands.transform(full, { scale: 2, origin: { x: 0, y: 0 } });
  assert.equal(scaled.height, 360, "la altura escala con la entidad");

  // Reflejo respecto del eje Y (recta x=0): la base angular de esa reflexión
  // es 180° (mismo valor que fija `schema4-adapters.spec.ts` para ATTDEF), y
  // bajo reflexión el ángulo se RESTA de esa base, no se suma — la misma
  // regla que INSERT y MTEXT, y por la misma razón: sumar deja el rótulo
  // espejado hacia el lado contrario al de la geometría que lo acompaña.
  const mirrorY: CadEntityTransform = { mirror: { point: { x: 0, y: 0 }, direction: { x: 0, y: 1 } } };
  const atOrigin: NativeText = { ...full, x: 100, y: 0 };
  const mirrored = textAdapter.commands.transform(atOrigin, mirrorY);
  assert.equal(mirrored.x, -100, "la inserción se refleja");
  assert.equal(mirrored.rotation, 150, "180 − 30 = 150; sumar daría 210");
  assert.equal(mirrored.height, full.height, "un espejo no cambia el tamaño del texto");
}

console.log("text entity adapter specs passed");
