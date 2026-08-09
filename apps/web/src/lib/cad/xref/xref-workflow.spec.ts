/**
 * Referencias externas: rutas, ciclos, anidamiento y enlazado.
 *
 * Tres casos que la misión pide por su nombre, y que son los tres que deciden
 * si un proyecto se puede abrir en otra máquina:
 *
 *   1. Un xref con ruta RELATIVA que se resuelve —y el resultado dice por cuál
 *      de las tres se encontró.
 *   2. Uno con la ruta ROTA que falla DICIÉNDOLO: qué se intentó y con qué.
 *   3. Uno CÍCLICO que se rechaza sin colgarse.
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../cad-document";
import { executeCadEntityCommandBatch } from "../entity-commands";
import { analyzeCadXrefGraph } from "./xref-graph";
import { cadResolveXrefPath, cadXrefPathFields, type CadXrefCatalogEntry } from "./xref-paths";
import { cadTenantLayoutUri, type CadXrefAssetSnapshot } from "./xref-projection";
import {
  cadXrefAttachCommands,
  cadXrefBindCommands,
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

// --- 2. Las tres rutas, y por cuál se resolvió -------------------------------
{
  const catalog: CadXrefCatalogEntry[] = [
    {
      assetId: "asset-planta",
      revision: "rev-1",
      name: "PLANTA",
      uri: cadTenantLayoutUri("asset-planta", "rev-1"),
      relativePath: "plantas/base",
    },
    {
      assetId: "asset-otro",
      revision: "rev-9",
      name: "ESTRUCTURA",
      uri: cadTenantLayoutUri("asset-otro", "rev-9"),
      relativePath: "estructura/base",
    },
  ];
  const reference = attached.externalReferences[0];

  // (a) Se resuelve por la RELATIVA, que es la primera que se intenta.
  const relative = cadResolveXrefPath(reference, catalog);
  assert.ok(relative.found && relative.via === "relative", "gana la ruta relativa");
  assert.match(relative.detail, /ruta relativa/, "y el mensaje lo DICE");
  checks += 2;

  // (b) Sin la relativa, cae a la ABSOLUTA.
  const absolute = cadResolveXrefPath({ ...reference, relativePath: "" }, catalog);
  assert.ok(absolute.found && absolute.via === "absolute", "sin relativa, la absoluta");
  checks += 1;

  // (c) Sin ninguna de las dos, BUSCA por nombre.
  const searched = cadResolveXrefPath(
    { ...reference, relativePath: "", uri: "tenant-layout://movido/rev-1" },
    catalog,
  );
  assert.ok(searched.found && searched.via === "search", "y si no, la búsqueda por nombre");
  checks += 1;

  // (d) ROTA: falla diciendo qué se intentó con cada una.
  const broken = cadResolveXrefPath(
    { relativePath: "plantas/no-existe", uri: "tenant-layout://fantasma/rev-1", name: "FANTASMA" },
    catalog,
  );
  assert.equal(broken.found, false, "una ruta rota no se resuelve");
  assert.match(broken.detail, /plantas\/no-existe/, "el error nombra la ruta relativa que se probó");
  assert.match(broken.detail, /fantasma/i, "y la absoluta");
  assert.match(broken.detail, /FANTASMA/, "y la búsqueda por nombre");
  assert.deepEqual(
    broken.attempts.map((attempt) => [attempt.strategy, attempt.outcome]),
    [
      ["relative", "miss"],
      ["absolute", "miss"],
      ["search", "miss"],
    ],
    "y las tres tentativas quedan registradas, en orden",
  );
  checks += 5;

  // (e) AMBIGUA: dos activos con el mismo nombre no se resuelven a la callada.
  const ambiguous = cadResolveXrefPath(
    { relativePath: "", uri: "", name: "COPIA" },
    [
      { assetId: "a", revision: "1", name: "COPIA", uri: cadTenantLayoutUri("a", "1") },
      { assetId: "b", revision: "1", name: "COPIA", uri: cadTenantLayoutUri("b", "1") },
    ],
  );
  assert.equal(ambiguous.found, false);
  assert.match(ambiguous.detail, /varios activos/, "una ambigüedad se dice, no se resuelve al azar");
  checks += 2;

  // (f) Al adjuntar se guardan las TRES, no sólo la que se usó.
  const fields = cadXrefPathFields(catalog[0]);
  assert.deepEqual(fields, {
    uri: cadTenantLayoutUri("asset-planta", "rev-1"),
    relativePath: "plantas/base",
    name: "PLANTA",
  });
  checks += 1;
}

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

// --- 6. XBIND: enlazar NO es insertar ----------------------------------------
{
  const bound = executeCadEntityCommandBatch(
    attached,
    cadXrefBindCommands(attached, "xref-planta", "bind"),
    "XBIND bind",
  ).document;
  assert.equal(bound.externalReferences.length, 0, "deja de ser una referencia externa");
  const local = bound.blocks.find((block) => block.id === "xref:xref-planta:root")!;
  assert.equal(local.name, "PLANTA$0$PLANTA|rev-1", "el bloque se rebautiza con el prefijo $0$");
  ok(
    bound.entities.some((entity) => entity.id === "xref:xref-planta:insert"),
    "y el INSERT sobrevive: lo enlazado sigue siendo una unidad que se mueve de una pieza",
  );
  checks += 2;

  const inserted = executeCadEntityCommandBatch(
    attached,
    cadXrefBindCommands(attached, "xref-planta", "insert"),
    "XBIND insert",
  ).document;
  assert.equal(inserted.externalReferences.length, 0);
  ok(
    !inserted.entities.some((entity) => entity.id === "xref:xref-planta:insert"),
    "insertar EXPLOTA: el INSERT desaparece",
  );
  ok(
    inserted.entities.some((entity) => entity.type === "line" && entity.id.startsWith("xref:xref-planta:insert:")),
    "y la geometría queda suelta en el dibujo",
  );
  ok(
    !inserted.blocks.some((block) => block.id.startsWith("xref:xref-planta:")),
    "sin dejar la proyección detrás",
  );
  checks += 1;
}

console.log(`xref-workflow.spec: ${checks} comprobaciones OK`);
