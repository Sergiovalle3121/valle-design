/**
 * La fuga de espacio papel (campaña Paridad, OLA 0.1/1.5): "Todo" mezclaba
 * entidades de espacio PAPEL —cajetín, marco, hojas— en el mismo espacio
 * MODELO que el dibujo, indistinguibles. Un recuento de entidades, un
 * despiece o un metrado calculado sobre `modelSpace.entityIds` contaba de
 * más sin que nada lo delatara: la clase exacta de mentira que persigue esta
 * campaña.
 *
 * Cuatro pasos, los cuatro con su prueba negativa:
 *
 *   1. EXPORTACIÓN: `exportCadDocumentDxf` excluye lo declarado en
 *      `paperSpaces` y lo cuenta en el manifiesto. Sin declarar
 *      `paperSpaces`, la MISMA entidad SÍ viaja — la exclusión no se
 *      inventa sola.
 *   2. IMPORTACIÓN (archivo completo): `importDocumentText` excluye una
 *      entidad con código de grupo 67 = 1 de `modelSpace.entityIds`, del
 *      documento y la declara en `lossManifest` y en `dxfReport`. Sin el
 *      código 67, la MISMA entidad SÍ entra.
 *   3. El informe en español no la cuenta como "conservada": el recuento
 *      `kept_line` excluye la línea de papel.
 *   4. IMPORTACIÓN (DXFIN, insertar en un dibujo vivo): `planCadDxfImport`
 *      tiene la misma fuga cerrada por el mismo módulo compartido.
 *
 * Correr:  npx tsx src/lib/cad/dxf-paper-space-scope.spec.ts
 */
import { strict as assert } from "node:assert";
import type { CadEntity, CadLayerDef } from "./cad-document";
import { importDocumentText } from "./document-import";
import { exportCadDocumentDxf } from "./dxf-document-export";
import { planCadDxfImport } from "./engine/commands/interop-dxf";

// --- 1. exportación: excluida y declarada CUANDO se declara `paperSpaces` --
{
  const entities: CadEntity[] = [
    { id: "muro", type: "line", layer: "MUROS", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 } },
    { id: "cajetin", type: "line", layer: "CAJETIN", start: { x: 9_999, y: 9_999, z: 0 }, end: { x: 9_999, y: 9_998, z: 0 } },
  ];
  const layers: CadLayerDef[] = [
    { id: "MUROS", name: "MUROS", color: "#ff0000", visible: true, locked: false },
    { id: "CAJETIN", name: "CAJETIN", color: "#0000ff", visible: true, locked: false },
  ];

  const scoped = exportCadDocumentDxf({
    entities,
    blocks: [],
    layers,
    paperSpaces: [{ entityIds: ["cajetin"] }],
  });
  assert.equal(scoped.entityCount, 1, "solo el muro de espacio modelo se escribe");
  assert.ok(!scoped.content.includes("9999"), "la coordenada del cajetín NO viaja al DXF");
  const loss = scoped.losses.find((entry) => entry.code === "dxf_export_paper_space_excluded");
  assert.ok(loss, "la exclusión se declara en el manifiesto de pérdidas de la exportación");
  assert.ok(loss!.detail.includes("1 entidad"), loss!.detail);

  // Prueba negativa: SIN declarar `paperSpaces`, la misma entidad SÍ viaja.
  const unscoped = exportCadDocumentDxf({ entities, blocks: [], layers });
  assert.equal(unscoped.entityCount, 2, "sin `paperSpaces`, las dos entidades cuentan");
  assert.ok(unscoped.content.includes("9999"), "sin declarar espacio papel, la coordenada SÍ viaja");
  assert.ok(
    !unscoped.losses.some((entry) => entry.code === "dxf_export_paper_space_excluded"),
    "sin `paperSpaces`, no se inventa una pérdida que no existe",
  );
}

// --- 2 y 3. importación de archivo completo ---------------------------------
{
  const rawWithPaperSpace = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LINE", "8", "MUROS", "10", "0", "20", "0", "11", "100", "21", "0",
    "0", "LINE", "8", "CAJETIN", "67", "1", "10", "9999", "20", "9999", "11", "9999", "21", "9998",
    "0", "ENDSEC", "0", "EOF",
  ].join("\n");

  const imported = importDocumentText("plano.dxf", rawWithPaperSpace);
  assert.equal(imported.importedEntityCount, 1, "solo la línea de modelo entra al documento");
  assert.equal(
    imported.document.modelSpace.entityIds.length,
    imported.document.entities.length,
    "modelSpace no referencia más entidades de las que el documento realmente trae",
  );
  const paperLine = imported.document.entities.find(
    (entity) => entity.type === "line" && "start" in entity && (entity as { start: { x: number } }).start.x === 9_999,
  );
  assert.equal(paperLine, undefined, "la línea de espacio papel NO está en el documento");

  const docLoss = imported.document.lossManifest.find((entry) => entry.code === "dxf_paper_space_excluded");
  assert.ok(docLoss, "la exclusión se declara en el manifiesto de pérdidas del documento");

  const reportRow = imported.dxfReport?.rows.find((row) => row.code === "dxf_paper_space_excluded");
  assert.ok(reportRow, "el informe en español también la declara");
  assert.equal(reportRow!.count, 1);
  assert.equal(reportRow!.fidelity, "lost");

  // El recuento de "conservado" cuenta la línea de MUROS (1), NO las dos: si
  // contara 2, el informe diría "2 líneas con su geometría exacta" mintiendo
  // sobre cuántas entraron de verdad.
  const keptLine = imported.dxfReport?.rows.find((row) => row.code === "kept_line");
  assert.equal(keptLine?.count, 1, "el recuento de líneas conservadas NO incluye la de papel");

  // Prueba negativa: SIN el código 67 (o en 0), las dos líneas entran.
  const rawAllModel = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LINE", "8", "MUROS", "10", "0", "20", "0", "11", "100", "21", "0",
    "0", "LINE", "8", "MUROS", "67", "0", "10", "200", "20", "0", "11", "300", "21", "0",
    "0", "ENDSEC", "0", "EOF",
  ].join("\n");
  const importedAllModel = importDocumentText("plano2.dxf", rawAllModel);
  assert.equal(importedAllModel.importedEntityCount, 2, "sin código 67, las dos líneas entran");
  assert.ok(
    !importedAllModel.document.lossManifest.some((entry) => entry.code === "dxf_paper_space_excluded"),
    "sin espacio papel en el archivo, no se declara una exclusión que no ocurrió",
  );
}

// --- 4. DXFIN: la misma fuga, cerrada por el mismo módulo compartido -------
{
  const rawWithPaperSpace = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LINE", "8", "MUROS", "10", "0", "20", "0", "11", "100", "21", "0",
    "0", "LINE", "8", "CAJETIN", "67", "1", "10", "9999", "20", "9999", "11", "9999", "21", "9998",
    "0", "ENDSEC", "0", "EOF",
  ].join("\n");
  let ids = 0;
  const plan = planCadDxfImport(rawWithPaperSpace, { newEntityId: () => `p${++ids}` });
  assert.ok(plan.ok, "el plan sale del DXF con línea de papel");
  if (!plan.ok) throw new Error("tipo");
  const insertCommands = plan.commands.filter((command) => command.type === "insert");
  assert.equal(insertCommands.length, 1, "DXFIN solo inserta la línea de espacio modelo");
  assert.equal(plan.report.entityCount, 1);
  assert.ok(
    plan.report.rows.some((row) => row.code === "dxf_paper_space_excluded"),
    "el informe de DXFIN también declara la exclusión",
  );
}

console.log(
  "dxf-paper-space-scope: exportación e importación (archivo completo y DXFIN) excluyen y declaran " +
    "el espacio papel, y ninguna de las dos lo hace cuando el archivo no lo trae",
);
