/**
 * Escala anotativa: 2,5 mm son 2,5 mm.
 *
 * La propiedad de ida y vuelta —convertir a modelo y volver a papel devuelve el
 * mismo número— se cumpliría de forma VACÍA con dos funciones identidad. Por eso
 * está anclada a los milímetros concretos que salen a 1:50, a 1:100 y a 1:5, y a
 * la orden de escritura que produce el reescalado sobre un documento real.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity, CadPaperSpace } from "../cad-document";
import {
  CAD_ANNOTATIVE_HEIGHT_METADATA,
  cadAnnotativeHeightMm,
  cadAnnotativeModelHeight,
  cadAnnotativePaperHeight,
  cadAnnotativeRescaleCommands,
  cadEntitySupportsAnnotativeHeight,
  cadUnitToMillimetres,
  clearCadAnnotativeCommand,
  markCadAnnotativeCommand,
} from "./annotative-scale";

// --- ANCLAS ABSOLUTAS --------------------------------------------------------
{
  assert.equal(cadUnitToMillimetres("mm"), 1);
  assert.equal(cadUnitToMillimetres("cm"), 10);
  assert.equal(cadUnitToMillimetres("m"), 1000);
  assert.equal(cadUnitToMillimetres("in"), 25.4);

  // Un rótulo de 2,5 mm en un dibujo en MILÍMETROS:
  assert.equal(cadAnnotativeModelHeight(2.5, 50, "mm"), 125);
  assert.equal(cadAnnotativeModelHeight(2.5, 100, "mm"), 250);
  assert.equal(cadAnnotativeModelHeight(2.5, 5, "mm"), 12.5);
  // …y en METROS, donde una unidad son 1000 mm:
  assert.equal(cadAnnotativeModelHeight(2.5, 50, "m"), 0.125);

  // La vuelta, sobre los mismos números.
  assert.equal(cadAnnotativePaperHeight(125, 50, "mm"), 2.5);
  assert.equal(cadAnnotativePaperHeight(0.125, 50, "m"), 2.5);

  // Ida y vuelta sobre escalas dispares, con la comprobación de que la ida
  // MOVIÓ el número (si no, la propiedad sería vacía).
  for (const scale of [1, 5, 20, 50, 100, 500]) {
    const model = cadAnnotativeModelHeight(3.5, scale, "mm");
    assert.equal(model, 3.5 * scale);
    assert.ok(Math.abs(cadAnnotativePaperHeight(model, scale, "mm") - 3.5) < 1e-12);
    if (scale !== 1) assert.notEqual(model, 3.5);
  }

  assert.equal(cadAnnotativeModelHeight(0, 50), 0);
  assert.equal(cadAnnotativeModelHeight(2.5, 0), 0);
}

// --- la marca ----------------------------------------------------------------
{
  const plain = { id: "t1", type: "mtext", layer: "0" } as never as CadEntity;
  assert.equal(cadAnnotativeHeightMm(plain), null);
  const marked = {
    ...plain,
    context: { metadata: { [CAD_ANNOTATIVE_HEIGHT_METADATA]: 2.5 } },
  } as CadEntity;
  assert.equal(cadAnnotativeHeightMm(marked), 2.5);
  assert.equal(
    cadAnnotativeHeightMm({
      ...plain,
      context: { metadata: { [CAD_ANNOTATIVE_HEIGHT_METADATA]: -1 } },
    } as CadEntity),
    null,
  );

  assert.deepEqual(markCadAnnotativeCommand("t1", 2.5), {
    type: "metadata",
    entityId: "t1",
    patch: { annotativeHeightMm: 2.5 },
  });
  assert.deepEqual(clearCadAnnotativeCommand("t1"), {
    type: "metadata",
    entityId: "t1",
    patch: { annotativeHeightMm: null },
  });

  assert.equal(cadEntitySupportsAnnotativeHeight(plain), true);
  assert.equal(
    cadEntitySupportsAnnotativeHeight({ ...plain, type: "circle" } as never as CadEntity),
    false,
  );
}

// --- reescalado sobre una hoja con DOS ventanas a escalas distintas -----------
{
  const text = (id: string, layer: string, height: number): CadEntity =>
    ({
      id,
      type: "mtext",
      layer,
      text: "COTA",
      insertion: { x: 0, y: 0, z: 0 },
      height,
      context: { metadata: { [CAD_ANNOTATIVE_HEIGHT_METADATA]: 2.5 } },
    }) as never as CadEntity;

  const document = {
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "GEN", name: "GEN", color: "#fff", visible: true, locked: false },
      { id: "DET", name: "DET", color: "#fff", visible: true, locked: false },
    ],
    entities: [
      text("rotulo-general", "GEN", 10),
      text("rotulo-detalle", "DET", 10),
      // Un círculo anotativo: no tiene altura, y eso se DICE.
      {
        id: "simbolo",
        type: "circle",
        layer: "GEN",
        center: { x: 0, y: 0, z: 0 },
        radius: 5,
        context: { metadata: { [CAD_ANNOTATIVE_HEIGHT_METADATA]: 2.5 } },
      } as never as CadEntity,
      // Y uno sin marcar, que no debe tocarse.
      {
        id: "rotulo-suelto",
        type: "mtext",
        layer: "GEN",
        text: "X",
        insertion: { x: 0, y: 0, z: 0 },
        height: 10,
      } as never as CadEntity,
    ],
  } as never as CadDocument;

  const space = {
    id: "layout:planta",
    name: "Planta",
    entityIds: [],
    page: { width: 420, height: 297, unit: "mm", orientation: "landscape" },
    viewports: [
      {
        id: "vp:general",
        paperBounds: { x: 10, y: 10, width: 200, height: 200 },
        modelBounds: { x: 0, y: 0, width: 1, height: 1 },
        scale: 50,
        annotationScale: 50,
        locked: true,
        // El detalle no se ve en la ventana general.
        layerVisibility: { DET: false },
      },
      {
        id: "vp:detalle",
        paperBounds: { x: 220, y: 10, width: 180, height: 200 },
        modelBounds: { x: 0, y: 0, width: 1, height: 1 },
        scale: 5,
        annotationScale: 5,
        locked: true,
        layerVisibility: { GEN: false },
      },
    ],
  } as never as CadPaperSpace;

  const result = cadAnnotativeRescaleCommands(
    { entities: document.entities, unit: document.meta.unit },
    space,
  );

  const heights = new Map(
    result.commands.map((command) => [
      "entityId" in command ? command.entityId : "",
      (command as unknown as { patch: { height: number } }).patch.height,
    ]),
  );
  // El rótulo de la ventana a 1:50 pasa a 125; el de la de 1:5, a 12,5.
  assert.equal(heights.get("rotulo-general"), 125);
  assert.equal(heights.get("rotulo-detalle"), 12.5);
  assert.equal(heights.has("rotulo-suelto"), false, "lo no anotativo no se toca");
  assert.deepEqual(result.rescaledEntityIds.sort(), ["rotulo-detalle", "rotulo-general"]);
  assert.deepEqual(result.skippedEntityIds, ["simbolo"], "el círculo se dice, no se oculta");

  // Y el número que importa: a esas alturas, lo que sale sobre el papel es
  // 2,5 mm en las DOS ventanas, aunque una esté a 1:50 y la otra a 1:5.
  assert.equal(cadAnnotativePaperHeight(125, 50, "mm"), 2.5);
  assert.equal(cadAnnotativePaperHeight(12.5, 5, "mm"), 2.5);

  // Volver a pedirlo sobre el documento ya reescalado no emite nada: un lote
  // que reescribe la misma altura gastaría un paso de deshacer para nada.
  const settled = {
    ...document,
    entities: document.entities.map((entity) =>
      heights.has(entity.id) ? { ...entity, height: heights.get(entity.id) } : entity,
    ),
  } as CadDocument;
  const again = cadAnnotativeRescaleCommands(
    { entities: settled.entities, unit: settled.meta.unit },
    space,
  );
  assert.deepEqual(again.commands, []);
  assert.deepEqual(again.rescaledEntityIds, []);
}

console.log("cad annotative scale specs passed");

/* ── Cotas anotativas: el juego de tamaños completo, por ventana ─────────── */
{
  const dimension = (id: string, layer: string, sizes: Record<string, number> = {}) =>
    ({
      id,
      type: "dimension",
      layer,
      a: { x: 0, y: 0, z: 0 },
      b: { x: 1000, y: 0, z: 0 },
      dimensionKind: "aligned",
      ...sizes,
      context: { metadata: { annotativeHeightMm: 2.5 } },
    }) as never as CadEntity;

  const space = {
    id: "layout:cotas",
    name: "Cotas",
    entityIds: [],
    page: { width: 420, height: 297, unit: "mm", orientation: "landscape" },
    viewports: [
      {
        id: "vp:general",
        paperBounds: { x: 10, y: 10, width: 200, height: 200 },
        modelBounds: { x: 0, y: 0, width: 1, height: 1 },
        scale: 50,
        annotationScale: 50,
        locked: true,
        layerVisibility: { DET: false },
      },
      {
        id: "vp:detalle",
        paperBounds: { x: 220, y: 10, width: 180, height: 200 },
        modelBounds: { x: 0, y: 0, width: 1, height: 1 },
        scale: 5,
        annotationScale: 5,
        locked: true,
        layerVisibility: { GEN: false },
      },
    ],
  } as never as CadPaperSpace;

  const general = dimension("cota-general", "GEN", {
    arrowSize: 180,
    extensionGap: 40,
    extensionOvershoot: 120,
    textGap: 90,
  });
  const detalle = dimension("cota-detalle", "DET");

  const result = cadAnnotativeRescaleCommands(
    { entities: [general, detalle], unit: "mm" },
    space,
  );
  assert.equal(result.commands.length, 2, "las dos cotas se reescalan");
  const replaced = new Map(
    result.commands.map((command) => [
      (command as { entityId: string }).entityId,
      (command as { entity: Record<string, number> }).entity,
    ]),
  );
  // 2,5 mm de flecha sobre papel: 125 unidades a 1:50, 12,5 a 1:5.
  assert.equal(replaced.get("cota-general")!.arrowSize, 125);
  assert.equal(replaced.get("cota-detalle")!.arrowSize, 12.5);
  // Las proporciones de la cota se conservan (40/180 del hueco, etc.).
  assert.ok(Math.abs(replaced.get("cota-general")!.extensionGap - 125 * (40 / 180)) < 1e-9);
  assert.ok(Math.abs(replaced.get("cota-general")!.textGap - 125 * (90 / 180)) < 1e-9);
  // Y sobre el PAPEL ambas flechas miden lo mismo.
  assert.equal(cadAnnotativePaperHeight(125, 50, "mm"), 2.5);
  assert.equal(cadAnnotativePaperHeight(12.5, 5, "mm"), 2.5);

  // Reescalar lo ya reescalado no emite nada.
  const settledEntities = [
    { ...general, ...replaced.get("cota-general") } as never as CadEntity,
    { ...detalle, ...replaced.get("cota-detalle") } as never as CadEntity,
  ];
  const again = cadAnnotativeRescaleCommands({ entities: settledEntities, unit: "mm" }, space);
  assert.deepEqual(again.commands, [], "sin cambio, sin orden");
}

console.log("cad annotative dimension specs passed");
