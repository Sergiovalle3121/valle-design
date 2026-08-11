/**
 * Referencias externas: adjuntar, anidar, descargar y desligar.
 *
 * La resolución de rutas y el enlazado viven en `cad-xrefs-bind.spec.ts`, que
 * es donde se prueban con su ida y vuelta completa. Aquí queda lo demás: que
 * adjuntar sea UN lote, que un ciclo se rechace antes de escribir nada, y que
 * `attachment` y `overlay` se comporten distinto al anidar — que es lo que
 * todo el mundo se equivoca.
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../cad-document";
import { executeCadEntityCommandBatch } from "../entity-commands";
import { analyzeCadXrefGraph } from "./xref-graph";
import { cadTenantLayoutUri, type CadXrefAssetSnapshot } from "./xref-projection";
import {
  cadXrefAttachCommands,
  cadXrefDetachCommands,
  cadXrefUnloadCommands,
} from "./xref-workflow";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const line = (id: string, x: number): CadEntity => ({
  id,
  type: "line",
  start: { x, y: 0, z: 0 },
  end: { x: x + 1_000, y: 0, z: 0 },
  layer: "0",
});

function host(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [line("host-line", 0)],
  });
}

function snapshot(options: {
  assetId: string;
  name: string;
  revision?: string;
  entities?: CadEntity[];
  externalReferences?: CadDocument["externalReferences"];
}): CadXrefAssetSnapshot {
  const entities = options.entities ?? [line(`${options.assetId}-line`, 5_000)];
  const document = migrateCadDocument({
    meta: { version: 3, schema: 4, unit: "mm" },
    entities,
    externalReferences: options.externalReferences ?? [],
  });
  return {
    tenantId: "tenant-1",
    assetId: options.assetId,
    name: options.name,
    revision: options.revision ?? "rev-1",
    version: 3,
    document,
    contentHash: `hash-${options.assetId}`,
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
}

// --- 1. Adjuntar es UN lote --------------------------------------------------
const attached = (() => {
  const document = host();
  const commands = cadXrefAttachCommands(document, {
    id: "xref-planta",
    snapshot: snapshot({ assetId: "asset-planta", name: "PLANTA" }),
    relativePath: "plantas/base",
  });
  assert.deepEqual(
    [...new Set(commands.map((command) => command.type))].sort(),
    ["block", "insert", "layer", "xref"],
    "capa, bloques proyectados, INSERT y registro — todo en el mismo lote",
  );
  const result = executeCadEntityCommandBatch(document, commands, "XATTACH");
  const next = result.document;
  assert.equal(next.meta.version, document.meta.version + 1, "UN paso de deshacer, no cuatro");
  assert.equal(next.externalReferences.length, 1);
  assert.equal(next.externalReferences[0].relativePath, "plantas/base", "la ruta relativa se GUARDA");
  assert.equal(
    next.externalReferences[0].uri,
    cadTenantLayoutUri("asset-planta", "rev-1"),
    "y la absoluta también",
  );
  assert.equal(next.externalReferences[0].name, "PLANTA", "y el nombre, que es la tercera vía");
  ok(
    next.layers.some((layer) => layer.id === "xref:xref-planta:layer" && !layer.locked),
    "la capa del xref nace DESBLOQUEADA: el candado no protegía el contenido —vive en un bloque— y sí impedía gestionar la referencia",
  );
  checks += 5;
  return next;
})();

// --- 3. Un ciclo se rechaza ANTES de resolver, y sin colgarse ----------------
{
  const document = host();
  // El dibujo referenciado referencia, a su vez, al anfitrión.
  const cyclic = snapshot({
    assetId: "asset-b",
    name: "B",
    externalReferences: [
      {
        id: "inner",
        name: "A",
        uri: cadTenantLayoutUri("asset-a", "rev-1"),
        loaded: true,
        mode: "attachment",
        assetId: "asset-a",
      },
    ],
  });
  assert.throws(
    () => cadXrefAttachCommands(document, { id: "xref-b", snapshot: cyclic, hostAssetId: "asset-a" }),
    /cycle/i,
    "A → B → A se rechaza",
  );
  checks += 1;

  // Y el analizador tampoco se cuelga con un ciclo que no pasa por el anfitrión.
  const graph = analyzeCadXrefGraph(
    {
      externalReferences: [
        {
          id: "x",
          name: "X",
          uri: "tenant-layout://x/1",
          loaded: true,
          assetId: "asset-x",
          dependencyEdges: [
            { from: "asset-x", to: "asset-y", mode: "attachment" },
            { from: "asset-y", to: "asset-x", mode: "attachment" },
          ],
        },
      ],
    },
    "host",
  );
  ok(
    graph.issues.some((issue) => issue.code === "cycle"),
    "un ciclo entre dos referenciados también se detecta",
  );
}

// --- 4. Attachment propaga; overlay no ---------------------------------------
{
  const nested = snapshot({
    assetId: "asset-c",
    name: "C",
    entities: [
      line("c-line", 0),
      {
        id: "c-xref-insert",
        type: "insert",
        block: "xref:inner:root",
        insertion: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "0",
      },
    ],
    externalReferences: [
      {
        id: "inner",
        name: "D",
        uri: cadTenantLayoutUri("asset-d", "rev-1"),
        loaded: true,
        mode: "attachment",
        assetId: "asset-d",
        insertId: "c-xref-insert",
      },
    ],
  });

  const asAttachment = executeCadEntityCommandBatch(
    host(),
    cadXrefAttachCommands(host(), { id: "xref-c", snapshot: nested, mode: "attachment" }),
    "XATTACH",
  ).document;
  const attachmentRoot = asAttachment.blocks.find((block) => block.id === "xref:xref-c:root")!;
  assert.equal(
    attachmentRoot.entities.length,
    2,
    "un attachment arrastra el xref anidado: quien abre A ve C",
  );
  assert.deepEqual(
    asAttachment.externalReferences[0].dependencyAssetIds,
    ["asset-d"],
    "y su dependencia queda anotada para el análisis de ciclos",
  );
  checks += 2;

  const asOverlay = executeCadEntityCommandBatch(
    host(),
    cadXrefAttachCommands(host(), { id: "xref-c", snapshot: nested, mode: "overlay" }),
    "XATTACH",
  ).document;
  const overlayRoot = asOverlay.blocks.find((block) => block.id === "xref:xref-c:root")!;
  assert.equal(
    overlayRoot.entities.length,
    1,
    "un overlay CORTA la propagación: sólo entra la geometría propia",
  );
  assert.deepEqual(
    asOverlay.externalReferences[0].dependencyAssetIds,
    [],
    "y no hereda dependencias, que es para lo que existe",
  );
  checks += 2;
}

// --- 5. Descargar conserva la proyección; desligar la retira -----------------
{
  const unloaded = executeCadEntityCommandBatch(
    attached,
    cadXrefUnloadCommands(attached, "xref-planta"),
    "XREF Descargar",
  ).document;
  ok(
    !unloaded.entities.some((entity) => entity.id === "xref:xref-planta:insert"),
    "descargar quita el INSERT",
  );
  ok(
    unloaded.blocks.some((block) => block.id === "xref:xref-planta:root"),
    "pero CONSERVA la proyección: por eso volver a cargar no necesita la red",
  );
  assert.equal(unloaded.externalReferences[0].status, "unloaded");
  checks += 1;

  const detached = executeCadEntityCommandBatch(
    attached,
    cadXrefDetachCommands(attached, "xref-planta"),
    "XREF Desligar",
  ).document;
  assert.equal(detached.externalReferences.length, 0, "desligar borra el registro");
  ok(
    !detached.blocks.some((block) => block.id.startsWith("xref:xref-planta:")),
    "y toda su proyección",
  );
  ok(
    !detached.layers.some((layer) => layer.id === "xref:xref-planta:layer"),
    "incluida la capa",
  );
}

console.log(`xref-workflow.spec: ${checks} comprobaciones OK`);
