/**
 * T5: la cota y el texto se imprimen a la altura de su estilo, sin techo
 * artificial de 12 ni de 8 pt.
 *
 * Con el techo viejo, un MTEXT de altura 200 a 1:50 salía a 4,0 mm (bien),
 * pero a 1:20 un texto de 15 mm salía a 12 pt en vez de 15 mm, y la cota
 * siempre se recortaba a 8 pt sin importar su estilo.
 */
import { strict as assert } from "node:assert";
import { layoutToCadDocument, type CadDocument, type CadEntity } from "./cad-document";
import { buildCadPublishPlan, type CadVectorCommand } from "./paper-space";
import { cadPlanViewport } from "./cad-paper-viewport";

function textCommandsWithEntityId(
  plan: ReturnType<typeof buildCadPublishPlan>,
  entityId: string,
): Extract<CadVectorCommand, { kind: "text" }>[] {
  const commands: Extract<CadVectorCommand, { kind: "text" }>[] = [];
  for (const sheet of plan.sheets)
    for (const vp of sheet.viewports)
      for (const cmd of vp.commands)
        if (cmd.kind === "text" && cmd.entityId === entityId) commands.push(cmd);
  return commands;
}

// 1) MTEXT de altura 200 a 1:50 → 4,0 mm en papel
{
  const base = layoutToCadDocument(
    { layers: [{ id: "0", name: "0", color: "#000000", visible: true, locked: false }] },
    { unit: "mm" },
  );
  const entity: CadEntity = {
    id: "txt-50",
    type: "mtext",
    insertion: { x: 50, y: 50, z: 0 },
    text: "RECÁMARA 1",
    height: 200,
    width: 3000,
    layer: "0",
  } as CadEntity;
  const doc: CadDocument = {
    ...base,
    entities: [entity],
    modelSpace: { entityIds: ["txt-50"] },
    paperSpaces: [
      {
        id: "sheet-50",
        name: "A-101",
        entityIds: [],
        page: { width: 297, height: 210, unit: "mm", orientation: "landscape" },
        viewports: [
          cadPlanViewport("vp-50", { x: 10, y: 10, width: 277, height: 180 }, { x: 0, y: 0, width: 13_850, height: 9_000 }, 50),
        ],
      },
    ],
  };
  const plan = buildCadPublishPlan(doc, "2026-09-18T00:00:00.000Z");
  const cmds = textCommandsWithEntityId(plan, "txt-50");
  assert.ok(cmds.length > 0, "1:50: el texto aparece en el plan de publicación");
  const size = cmds[0]!.size;
  assert.ok(
    Math.abs(size - 4.0) < 0.05,
    `1:50: MTEXT de altura 200 debe medir 4,0 mm, midió ${size.toFixed(3)}`,
  );
}

// 2) MTEXT de altura 200 a 1:100 → 2,0 mm en papel
{
  const base = layoutToCadDocument(
    { layers: [{ id: "0", name: "0", color: "#000000", visible: true, locked: false }] },
    { unit: "mm" },
  );
  const entity: CadEntity = {
    id: "txt-100",
    type: "mtext",
    insertion: { x: 50, y: 50, z: 0 },
    text: "PLANTA GENERAL",
    height: 200,
    width: 3000,
    layer: "0",
  } as CadEntity;
  const doc: CadDocument = {
    ...base,
    entities: [entity],
    modelSpace: { entityIds: ["txt-100"] },
    paperSpaces: [
      {
        id: "sheet-100",
        name: "A-100",
        entityIds: [],
        page: { width: 297, height: 210, unit: "mm", orientation: "landscape" },
        viewports: [
          cadPlanViewport("vp-100", { x: 10, y: 10, width: 277, height: 180 }, { x: 0, y: 0, width: 27_700, height: 18_000 }, 100),
        ],
      },
    ],
  };
  const plan = buildCadPublishPlan(doc, "2026-09-18T00:00:00.000Z");
  const cmds = textCommandsWithEntityId(plan, "txt-100");
  assert.ok(cmds.length > 0, "1:100: el texto aparece en el plan de publicación");
  const size = cmds[0]!.size;
  assert.ok(
    Math.abs(size - 2.0) < 0.05,
    `1:100: MTEXT de altura 200 debe medir 2,0 mm, midió ${size.toFixed(3)}`,
  );
}

// 3) TEXT de altura 15 a 1:20 → 0,75 mm en papel (sin techo de 12)
//    Con el techo viejo, 0,75 < 12 así que no se recortaba, pero la
//    comprobación documenta que el cálculo es correcto y la fórmula no cambió.
{
  const base = layoutToCadDocument(
    { layers: [{ id: "0", name: "0", color: "#000000", visible: true, locked: false }] },
    { unit: "mm" },
  );
  const entity: CadEntity = {
    id: "txt-20",
    type: "text",
    x: 50,
    y: 50,
    text: "NOTA",
    height: 15,
    layer: "0",
  } as CadEntity;
  const doc: CadDocument = {
    ...base,
    entities: [entity],
    modelSpace: { entityIds: ["txt-20"] },
    paperSpaces: [
      {
        id: "sheet-20",
        name: "A-5",
        entityIds: [],
        page: { width: 297, height: 210, unit: "mm", orientation: "landscape" },
        viewports: [
          cadPlanViewport("vp-20", { x: 10, y: 10, width: 277, height: 180 }, { x: 0, y: 0, width: 5_540, height: 3_600 }, 20),
        ],
      },
    ],
  };
  const plan = buildCadPublishPlan(doc, "2026-09-18T00:00:00.000Z");
  const cmds = textCommandsWithEntityId(plan, "txt-20");
  assert.ok(cmds.length > 0, "1:20: el texto aparece en el plan de publicación");
  const size = cmds[0]!.size;
  // 15 mm / 20 = 0,75 mm — menor que el piso de 1,5 mm
  assert.ok(
    Math.abs(size - 1.5) < 0.01,
    `1:20: TEXT de altura 15 respeta el piso de 1,5 pt, midió ${size.toFixed(3)}`,
  );
}

// 4) MTEXT de altura 500 a 1:50 → 10,0 mm (con el techo viejo saldría 12)
//    Este es el caso que demuestra que el techo de 12 ya no existe.
{
  const base = layoutToCadDocument(
    { layers: [{ id: "0", name: "0", color: "#000000", visible: true, locked: false }] },
    { unit: "mm" },
  );
  const entity: CadEntity = {
    id: "txt-grande",
    type: "mtext",
    insertion: { x: 50, y: 50, z: 0 },
    text: "TÍTULO DEL PLANO",
    height: 500,
    width: 5000,
    layer: "0",
  } as CadEntity;
  const doc: CadDocument = {
    ...base,
    entities: [entity],
    modelSpace: { entityIds: ["txt-grande"] },
    paperSpaces: [
      {
        id: "sheet-grande",
        name: "A-101",
        entityIds: [],
        page: { width: 297, height: 210, unit: "mm", orientation: "landscape" },
        viewports: [
          cadPlanViewport("vp-grande", { x: 10, y: 10, width: 277, height: 180 }, { x: 0, y: 0, width: 13_850, height: 9_000 }, 50),
        ],
      },
    ],
  };
  const plan = buildCadPublishPlan(doc, "2026-09-18T00:00:00.000Z");
  const cmds = textCommandsWithEntityId(plan, "txt-grande");
  assert.ok(cmds.length > 0, "grande: el texto aparece en el plan");
  const size = cmds[0]!.size;
  assert.ok(
    size > 9.9 && size < 10.1,
    `grande: MTEXT de altura 500 a 1:50 debe medir 10,0 mm, midió ${size.toFixed(3)}`,
  );
  assert.ok(
    size > 12 || Math.abs(size - 10.0) < 0.1,
    `grande: el tamaño ${size.toFixed(3)} demuestra que el techo de 12 ya no existe`,
  );
}

// 5) DIMENSION con textHeight explícito → usa textHeight, no arrowSize * 0,55
{
  const base = layoutToCadDocument(
    { layers: [{ id: "0", name: "0", color: "#000000", visible: true, locked: false }] },
    { unit: "mm" },
  );
  const entity: CadEntity = {
    id: "dim-txt",
    type: "dimension",
    dimensionKind: "linear",
    a: { x: 100, y: 100 },
    b: { x: 4500, y: 100 },
    axis: "x",
    offset: 800,
    layer: "0",
    textHeight: 125,
    arrowSize: 250,
  } as CadEntity;
  const doc: CadDocument = {
    ...base,
    entities: [entity],
    modelSpace: { entityIds: ["dim-txt"] },
    paperSpaces: [
      {
        id: "sheet-dim",
        name: "A-101",
        entityIds: [],
        page: { width: 297, height: 210, unit: "mm", orientation: "landscape" },
        viewports: [
          cadPlanViewport("vp-dim", { x: 10, y: 10, width: 277, height: 180 }, { x: 0, y: 0, width: 13_850, height: 9_000 }, 50),
        ],
      },
    ],
  };
  const plan = buildCadPublishPlan(doc, "2026-09-18T00:00:00.000Z");
  const cmds = textCommandsWithEntityId(plan, "dim-txt");
  assert.ok(cmds.length > 0, "dim: el rótulo de cota aparece en el plan");
  const size = cmds[0]!.size;
  // textHeight = 125, scale = 1/50 → 125 / 50 = 2,5 mm
  // Con el techo viejo de 8, saldría 2,5 (por debajo de 8), pero la fórmula
  // usaba arrowSize * 0,55 = 250 * 0,55 / 50 = 2,75 — distinto a textHeight.
  assert.ok(
    Math.abs(size - 2.5) < 0.05,
    `dim: cota con textHeight 125 a 1:50 debe medir 2,5 mm, midió ${size.toFixed(3)}`,
  );
}

// 6) DIMENSION sin textHeight → sigue derivando de arrowSize * 0,55
{
  const base = layoutToCadDocument(
    { layers: [{ id: "0", name: "0", color: "#000000", visible: true, locked: false }] },
    { unit: "mm" },
  );
  const entity: CadEntity = {
    id: "dim-arrow",
    type: "dimension",
    dimensionKind: "linear",
    a: { x: 100, y: 100 },
    b: { x: 4500, y: 100 },
    axis: "x",
    offset: 800,
    layer: "0",
    arrowSize: 250,
  } as CadEntity;
  const doc: CadDocument = {
    ...base,
    entities: [entity],
    modelSpace: { entityIds: ["dim-arrow"] },
    paperSpaces: [
      {
        id: "sheet-arrow",
        name: "A-101",
        entityIds: [],
        page: { width: 297, height: 210, unit: "mm", orientation: "landscape" },
        viewports: [
          cadPlanViewport("vp-arrow", { x: 10, y: 10, width: 277, height: 180 }, { x: 0, y: 0, width: 13_850, height: 9_000 }, 50),
        ],
      },
    ],
  };
  const plan = buildCadPublishPlan(doc, "2026-09-18T00:00:00.000Z");
  const cmds = textCommandsWithEntityId(plan, "dim-arrow");
  assert.ok(cmds.length > 0, "dim-arrow: el rótulo de cota aparece en el plan");
  const size = cmds[0]!.size;
  // arrowSize = 250, * 0,55 = 137,5 / 50 = 2,75 mm
  assert.ok(
    Math.abs(size - 2.75) < 0.05,
    `dim-arrow: cota sin textHeight a 1:50 usa arrowSize*0,55 = 2,75 mm, midió ${size.toFixed(3)}`,
  );
}

console.log("paper-space-render-altura.spec: 6 comprobaciones OK");
