/**
 * DIMDISASSOCIATE, DIMREASSOCIATE y «borrar la geometría huérfana a una cota»
 * (Ola 7, 2026-09-20) — todo por el MOTOR REAL: `executeCadEntityCommandBatch`
 * para el efecto sobre el documento y `buildCadDimensionGeometry` para medir
 * la geometría construida, no el campo crudo.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "./cad-document";
import { buildCadDimensionGeometry, type CadDimensionEntity } from "./associative-dimension";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "./entity-commands";
import { CAD_COMMAND_REGISTRY_V2 } from "./engine";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "./engine/command-types";
import "./engine/all-commands";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function doc(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((e) => e.id) },
  } as never);
}

function context(document: CadDocument, selection: readonly string[] = []): CadCommandContext {
  return {
    entityIds: document.entities.map((e) => e.id),
    entity: (id) => document.entities.find((e) => e.id === id),
    selection,
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "nuevo",
    document: () => document,
  };
}

function drive(name: string, inputs: readonly CadCommandInput[], ctx: CadCommandContext): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} en el registro`);
  let step = descriptor.begin(ctx);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, ctx);
  }
  return step.result;
}

const enter: CadCommandInput = { kind: "enter" };
const entityPick = (entityId: string, x: number, y: number): CadCommandInput => ({
  kind: "entityPick",
  entityId,
  point: { x, y },
});

const line: CadEntity = { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 4000, y: 0, z: 0 }, layer: "0" };
const associatedDim: CadDimensionEntity = {
  id: "d1",
  type: "dimension",
  dimensionKind: "aligned",
  a: { x: 0, y: 0 },
  b: { x: 4000, y: 0 },
  offset: 500,
  layer: "0",
  precision: 0,
  sourceUnit: "mm",
  units: "mm",
  associative: true,
  references: [
    { entityId: "l1", anchor: "start" },
    { entityId: "l1", anchor: "end" },
  ],
  associationStatus: "associated",
};

/* ── DIMDISASSOCIATE: quita la asociatividad, por el motor real ──────────── */
{
  const d0 = doc([line, associatedDim]);
  const result = drive("DIMDISASSOCIATE", [enter], context(d0, ["d1"]));
  ok(result?.kind === "document", "DIMDISASSOCIATE escribe con la cota ya seleccionada");
  if (result?.kind === "document") {
    const after = executeCadEntityCommandBatch(d0, [...result.commands], "DIMDISASSOCIATE").document;
    const dim = after.entities.find((e) => e.id === "d1") as CadDimensionEntity | undefined;
    ok(dim?.associative === false, "la cota deja de ser asociativa");
    ok(dim?.associationStatus === "detached", "…y se declara «detached», no «associated» a medias");
    // El PUNTO se queda donde estaba: desasociar no mueve nada.
    ok(dim?.a.x === 0 && dim?.b.x === 4000, "los puntos de definición no se tocan al desasociar");
  }
}

/* ── DIMDISASSOCIATE se niega si nada de lo designado es asociativo ───────── */
{
  const detached: CadDimensionEntity = { ...associatedDim, associative: false, associationStatus: "detached", references: undefined };
  const d0 = doc([line, detached]);
  const result = drive("DIMDISASSOCIATE", [enter], context(d0, ["d1"]));
  ok(result?.kind === "message" && result.text.includes("no hay nada que desasociar"), "negativa honesta, sin escribir nada");
}

/* ── Borrar la geometría de una cota asociativa la declara HUÉRFANA, por el
   motor real (DELETE vía executeCadEntityCommandBatch, no la función pura) ── */
{
  const d0 = doc([line, associatedDim]);
  const afterDelete = executeCadEntityCommandBatch(d0, [{ type: "delete", entityId: "l1" }], "ERASE").document;
  const orphan = afterDelete.entities.find((e) => e.id === "d1") as CadDimensionEntity | undefined;
  ok(orphan !== undefined, "la cota SOBREVIVE al borrado de su geometría (no desaparece con ella)");
  ok(orphan?.associationStatus === "broken", "…pero se declara huérfana, en vez de seguir diciendo «associated»");
  // Y NO MIENTE: la geometría construida sigue existiendo con el ÚLTIMO punto
  // conocido — no revienta, pero tampoco persigue una línea que ya no está.
  const geometry = buildCadDimensionGeometry(orphan!);
  ok(geometry !== null, "la geometría se sigue construyendo con el último punto conocido");
  ok(Math.abs((geometry?.measurement ?? 0) - 4000) < 1e-6, "…con la medida de antes de perder la referencia");

  /* ── DIMREASSOCIATE: sin designar nada, recoge la huérfana sola ──────────── */
  const newLine: CadEntity = { id: "l2", type: "line", start: { x: 100, y: 900, z: 0 }, end: { x: 3100, y: 900, z: 0 }, layer: "0" };
  const withNewLine: CadDocument = { ...afterDelete, entities: [...afterDelete.entities, newLine] };
  const reassocResult = drive(
    "DIMREASSOCIATE",
    [
      enter, // sin designar: recoge todas las «no associated» (aquí, d1)
      entityPick("l2", 100, 900), // punto 1/2: extremo start de la línea nueva
      entityPick("l2", 3100, 900), // punto 2/2: extremo end
    ],
    context(withNewLine),
  );
  ok(reassocResult?.kind === "document", "DIMREASSOCIATE escribe (sin designar, encontró la huérfana sola)");
  if (reassocResult?.kind === "document") {
    ok(reassocResult.commands.length === 1, "una cota reasociada");
    const replaced = executeCadEntityCommandBatch(withNewLine, [...reassocResult.commands], "DIMREASSOCIATE").document;
    const reassoc = replaced.entities.find((e) => e.id === "d1") as CadDimensionEntity | undefined;
    ok(reassoc?.associationStatus === "associated", "la cota vuelve a «associated»");
    ok(reassoc?.a.x === 100 && reassoc?.b.x === 3100, "sus puntos de definición son los NUEVOS anclajes");
    const geom = buildCadDimensionGeometry(reassoc!);
    ok(Math.abs((geom?.measurement ?? 0) - 3000) < 1e-6, `mide la línea NUEVA (3000), no la vieja (dio ${geom?.measurement})`);

    // Y la asociatividad vuelve a funcionar de VERDAD, no sólo de nombre:
    // estirar `l2` en el MISMO lote mueve la cota reasociada, como cualquier
    // otra cota asociativa (T17, `dimension-move-association.spec.ts`).
    const grown: CadEntity = { ...newLine, end: { x: 3600, y: 900, z: 0 } };
    const afterStretch = executeCadEntityCommandBatch(
      replaced,
      [{ type: "replace", entityId: "l2", entity: grown }],
      "STRETCH",
    ).document;
    const stretchedDim = afterStretch.entities.find((e) => e.id === "d1") as CadDimensionEntity | undefined;
    ok(stretchedDim?.associationStatus === "associated", "sigue asociada tras estirar la línea reasociada");
    ok(stretchedDim?.b.x === 3600, "el punto de definición SIGUE al extremo nuevo");
    const stretchedGeom = buildCadDimensionGeometry(stretchedDim!);
    ok(Math.abs((stretchedGeom?.measurement ?? 0) - 3500) < 1e-6, `mide 3500 tras estirar (dio ${stretchedGeom?.measurement})`);
  }
}

/* ── DIMREASSOCIATE: Intro conserva el punto actual (no arregla lo que no se
   te pide arreglar) ─────────────────────────────────────────────────────── */
{
  const brokenAtBothEnds: CadDimensionEntity = { ...associatedDim, associationStatus: "broken", references: [{ entityId: "gone", anchor: "start" }, { entityId: "gone", anchor: "end" }] };
  const d0 = doc([brokenAtBothEnds]);
  const result = drive(
    "DIMREASSOCIATE",
    [
      enter, // recoge la huérfana sola
      entityPick("l1", 0, 0), // (no existe l1 aquí: cae al punto tecleado) — punto 1: nuevo
      enter, // punto 2: Intro, CONSERVA el actual (que sigue roto)
    ],
    context(d0, ["d1"]),
  );
  ok(result?.kind === "document", "DIMREASSOCIATE escribe aunque un punto se dejara sin resolver");
  if (result?.kind === "document") {
    const command = result.commands[0] as Extract<CadEntityCommand, { type: "replace" }>;
    const next = command.entity as CadDimensionEntity;
    ok(next.associationStatus === "broken", "un punto sin reasociar deja la cota HUÉRFANA — no se inventa un arreglo a medias");
  }
}

console.log(`dimension-reassociate: ${checks} comprobaciones OK`);
