/**
 * El diálogo de XREF, XATTACH, XBIND y XCLIP.
 *
 * Lo que se comprueba aquí es sobre todo cómo se NIEGAN. Una orden de gestión
 * que responde «no hay nada» cuando en realidad no puede mirar le echa la culpa
 * al dibujo de una carencia del editor, y el dibujante se pasa la tarde
 * buscando un problema que no está donde le han dicho.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import type { CadXrefAssetSnapshot } from "../../xref/xref-projection";
import { cadTenantLayoutUri } from "../../xref/xref-projection";
import type { CadXrefCatalogEntry } from "../../xref/xref-paths";
import type { CadAnyCommandDescriptor, CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_XREF_COMMANDS } from "./xrefs";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const byName = new Map(CAD_XREF_COMMANDS.map((entry) => [entry.name, entry]));
const command = (name: string): CadAnyCommandDescriptor => {
  const found = byName.get(name);
  assert.ok(found, `${name} debería estar en la familia`);
  return found;
};

function documentWithXref(options: { loaded?: boolean } = {}): CadDocument {
  const loaded = options.loaded !== false;
  const entities: CadEntity[] = [
    {
      id: "line-1",
      type: "line",
      start: { x: 0, y: 0, z: 0 },
      end: { x: 100, y: 0, z: 0 },
      layer: "0",
    },
  ];
  if (loaded)
    entities.push({
      id: "xref:planta:insert",
      type: "insert",
      block: "xref:planta:root",
      insertion: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: 0,
      layer: "xref:planta:layer",
    });
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "xref:planta:layer", name: "XREF|PLANTA", color: "#64748b", visible: true, locked: true },
    ],
    entities,
    blocks: [
      {
        id: "xref:planta:root",
        name: "XREF|PLANTA|rev-1",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          {
            id: "xref:planta:root:entity:0",
            type: "line",
            start: { x: 0, y: 500, z: 0 },
            end: { x: 1_000, y: 500, z: 0 },
            layer: "xref:planta:layer",
          },
        ],
      },
    ],
    externalReferences: [
      {
        id: "planta",
        name: "PLANTA",
        uri: cadTenantLayoutUri("asset-planta", "rev-1"),
        relativePath: "plantas/base",
        loaded,
        mode: "attachment",
        assetId: "asset-planta",
        blockId: "xref:planta:root",
        insertId: "xref:planta:insert",
        status: loaded ? "loaded" : "unloaded",
      },
    ],
  });
}

function contextFor(
  document: CadDocument,
  options: { catalog?: readonly CadXrefCatalogEntry[]; selection?: readonly string[]; withDocument?: boolean } = {},
): CadCommandContext {
  const byId = new Map(document.entities.map((entity) => [entity.id, entity]));
  let ids = 0;
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (id) => byId.get(id),
    blocks: () => document.blocks,
    ...(options.withDocument === false ? {} : { document: () => document }),
    ...(options.catalog ? { xrefCatalog: () => options.catalog! } : {}),
    selection: options.selection ?? [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `new-${++ids}`,
  };
}

function run(
  descriptor: CadAnyCommandDescriptor,
  inputs: readonly CadCommandInput[],
  context: CadCommandContext,
) {
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state as never, input, context);
  }
  return step;
}

const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });

// --- 1. XREF ? dice las rutas guardadas cuando no hay biblioteca -------------
{
  const result = run(command("XREF"), [keyword("?")], contextFor(documentWithXref())).result;
  assert.ok(result && result.kind === "message");
  assert.match(result.text, /PLANTA/);
  assert.match(result.text, /plantas\/base/, "enseña la ruta relativa guardada");
  assert.match(result.text, /tenant-layout/, "y la absoluta");
  checks += 4;
}

// --- 2. XREF ? DICE por cuál se resolvió cuando sí la hay --------------------
{
  const catalog: CadXrefCatalogEntry[] = [
    {
      assetId: "asset-planta",
      revision: "rev-1",
      name: "PLANTA",
      uri: cadTenantLayoutUri("asset-planta", "rev-1"),
      relativePath: "plantas/base",
    },
  ];
  const result = run(command("XREF"), [keyword("?")], contextFor(documentWithXref(), { catalog })).result;
  assert.ok(result && result.kind === "message");
  assert.match(result.text, /ruta relativa/, "y dice CUÁL se usó, que es lo que pedía la misión");
  checks += 2;

  // Con la relativa rota, el listado avisa de que NO SE ENCUENTRA y explica.
  const brokenDocument = documentWithXref();
  brokenDocument.externalReferences[0].relativePath = "plantas/movido";
  brokenDocument.externalReferences[0].uri = "tenant-layout://fantasma/rev-1";
  brokenDocument.externalReferences[0].name = "FANTASMA";
  const broken = run(command("XREF"), [keyword("?")], contextFor(brokenDocument, { catalog })).result;
  assert.ok(broken && broken.kind === "message" && /NO SE ENCUENTRA/.test(broken.text));
  assert.match(broken.text, /plantas\/movido/, "y nombra lo que se intentó");
  checks += 2;
}

// --- 3. XREF Descargar / Recargar, sin red -----------------------------------
{
  const unload = run(command("XREF"), [keyword("Descargar"), text("PLANTA")], contextFor(documentWithXref())).result;
  assert.ok(unload && unload.kind === "document");
  assert.deepEqual(
    unload.commands.map((entry) => entry.type),
    ["delete", "xref"],
    "descargar quita el INSERT y marca el registro",
  );
  checks += 2;

  const reload = run(
    command("XREF"),
    [keyword("Recargar"), text("PLANTA")],
    contextFor(documentWithXref({ loaded: false })),
  ).result;
  assert.ok(reload && reload.kind === "document");
  ok(
    reload.commands.some((entry) => entry.type === "insert"),
    "volver a cargar lo descargado recrea el INSERT sin ir a la red",
  );

  // Y recargar lo que ya está cargado se dice, no se duplica.
  const already = run(command("XREF"), [keyword("Recargar"), text("PLANTA")], contextFor(documentWithXref())).result;
  assert.ok(already && already.kind === "message" && /ya está cargada/.test(already.text));
  checks += 2;
}

// --- 4. XREF sin documento se niega -------------------------------------------
{
  const result = command("XREF").begin(contextFor(documentWithXref(), { withDocument: false })).result;
  assert.ok(result && result.kind === "message" && /no expone el documento/.test(result.text));
  checks += 1;
}

// --- 5. XATTACH: adjunta desde la biblioteca, y sin ella lo DICE ------------
{
  const snapshot: CadXrefAssetSnapshot = {
    tenantId: "tenant-1",
    assetId: "asset-estructura",
    name: "ESTRUCTURA",
    revision: "rev-2",
    version: 5,
    document: migrateCadDocument({
      meta: { version: 5, schema: 4, unit: "mm" },
      entities: [
        {
          id: "pilar",
          type: "line",
          start: { x: 0, y: 0, z: 0 },
          end: { x: 0, y: 3_000, z: 0 },
          layer: "0",
        },
      ],
    }),
    contentHash: "hash-estructura",
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
  const catalog: CadXrefCatalogEntry[] = [
    {
      assetId: "asset-estructura",
      revision: "rev-2",
      name: "ESTRUCTURA",
      uri: cadTenantLayoutUri("asset-estructura", "rev-2"),
      relativePath: "estructura/base",
      snapshot,
    },
    {
      assetId: "asset-sin-traer",
      revision: "rev-1",
      name: "SIN-TRAER",
      uri: cadTenantLayoutUri("asset-sin-traer", "rev-1"),
    },
  ];

  // Sin biblioteca: explica QUÉ le falta al editor, no que el dibujo no exista.
  const blind = command("XATTACH").begin(contextFor(documentWithXref())).result;
  assert.ok(blind && blind.kind === "message" && /biblioteca/.test(blind.text));
  ok(!/no existe/i.test(blind.text), "y no le echa la culpa al dibujo");
  checks += 1;

  // Con biblioteca: el diálogo entero, y sale un lote de adjuntado.
  const context = contextFor(documentWithXref(), { catalog });
  const attached = run(
    command("XATTACH"),
    [text("ESTRUCTURA"), keyword("Adjuntar"), point(1_000, 2_000), { kind: "enter" }, { kind: "enter" }],
    context,
  ).result;
  assert.ok(attached && attached.kind === "document");
  assert.deepEqual(
    [...new Set(attached.commands.map((entry) => entry.type))].sort(),
    ["block", "insert", "layer", "xref"],
    "capa, proyección, INSERT y registro en el MISMO lote",
  );
  const reference = attached.commands.find((entry) => entry.type === "xref");
  assert.ok(reference && reference.type === "xref" && reference.op === "upsert");
  assert.equal(reference.reference.mode, "attachment");
  assert.equal(reference.reference.relativePath, "estructura/base", "la ruta relativa del catálogo se GUARDA");
  checks += 4;

  // Superponer no es adjuntar, y el registro lo refleja.
  const overlaid = run(
    command("XATTACH"),
    [text("ESTRUCTURA"), keyword("Superponer"), point(0, 0), { kind: "enter" }, { kind: "enter" }],
    context,
  ).result;
  assert.ok(overlaid && overlaid.kind === "document");
  const overlayReference = overlaid.commands.find((entry) => entry.type === "xref");
  assert.ok(overlayReference && overlayReference.type === "xref" && overlayReference.op === "upsert");
  assert.equal(overlayReference.reference.mode, "overlay");
  checks += 2;

  // Conocerlo y no tener su contenido son dos problemas distintos.
  const notFetched = run(command("XATTACH"), [text("SIN-TRAER")], context).result;
  assert.ok(notFetched && notFetched.kind === "message" && /contenido no se ha traído/.test(notFetched.text));
  const unknown = run(command("XATTACH"), [text("FANTASMA")], context).result;
  assert.ok(unknown && unknown.kind === "message" && /biblioteca no tiene/.test(unknown.text));
  checks += 2;

  // Una escala no positiva se rechaza: `attachCadXref` la ignoraría, y aceptar
  // aquí lo que allí no se usa sería mentir sobre lo que va a pasar.
  const negative = run(
    command("XATTACH"),
    [text("ESTRUCTURA"), keyword("Adjuntar"), point(0, 0), distance(-2)],
    context,
  ).result;
  assert.ok(negative && negative.kind === "message" && /positiva/.test(negative.text));
  checks += 1;
}

// --- 6. XBIND pregunta enlazar o insertar, y no son lo mismo -----------------
{
  const descriptor = command("XBIND");
  const context = contextFor(documentWithXref());
  const asking = run(descriptor, [text("PLANTA")], context);
  ok(!asking.result, "primero pregunta");
  assert.deepEqual(
    asking.prompt.options.map((option) => option.keyword),
    ["Enlazar", "Insertar"],
    "las dos variantes, porque dan resultados distintos",
  );
  checks += 1;

  const bound = descriptor.step(asking.state as never, keyword("Enlazar"), context).result;
  assert.ok(bound && bound.kind === "document");
  ok(
    bound.commands.some((entry) => entry.type === "block" && entry.op === "redefine"),
    "Enlazar rebautiza el bloque y lo conserva",
  );
  const insertedStep = run(descriptor, [text("PLANTA"), keyword("Insertar")], context).result;
  assert.ok(insertedStep && insertedStep.kind === "document");
  ok(
    insertedStep.commands.some((entry) => entry.type === "insert"),
    "Insertar explota el contenido en el dibujo",
  );
  checks += 2;

  const missing = run(descriptor, [text("NO-EXISTE")], context).result;
  assert.ok(missing && missing.kind === "message" && /No hay ninguna referencia/.test(missing.text));
  checks += 1;
}

// --- 7. XCLIP rectangular sobre la selección previa --------------------------
{
  const document = documentWithXref();
  const context = contextFor(document, { selection: ["xref:planta:insert"] });
  const descriptor = command("XCLIP");
  const first = descriptor.begin(context);
  ok(!first.result, "con la inserción ya designada, pregunta directamente el contorno");
  assert.deepEqual(
    first.prompt.options.map((option) => option.keyword),
    ["Rectangular", "Poligonal", "Invertir"],
    "y ofrece las formas de contorno; sin recorte previo no hay nada que activar ni suprimir",
  );
  checks += 1;

  const result = run(
    descriptor,
    [keyword("Rectangular"), point(0, 0), point(500, 1_000)],
    context,
  ).result;
  assert.ok(result && result.kind === "document");
  const [entry] = result.commands;
  assert.ok(entry.type === "metadata" && typeof entry.patch["cad:xclip"] === "string");
  const stored = JSON.parse(entry.patch["cad:xclip"] as string) as { boundary: Array<{ x: number; y: number }> };
  // ANCLA ABSOLUTA: el rectángulo sale normalizado y antihorario.
  assert.deepEqual(stored.boundary, [
    { x: 0, y: 0 },
    { x: 500, y: 0 },
    { x: 500, y: 1_000 },
    { x: 0, y: 1_000 },
  ]);
  checks += 3;
}

// --- 8. XCLIP sobre algo que no es una inserción -----------------------------
{
  const result = run(
    command("XCLIP"),
    [{ kind: "entityPick", entityId: "line-1", point: { x: 0, y: 0 } }],
    contextFor(documentWithXref()),
  ).result;
  assert.ok(result && result.kind === "message" && /inserciones/.test(result.text));
  checks += 1;
}

// --- 9. XCLIP poligonal necesita tres vértices --------------------------------
{
  const context = contextFor(documentWithXref(), { selection: ["xref:planta:insert"] });
  const short = run(
    command("XCLIP"),
    [keyword("Poligonal"), point(0, 0), point(100, 0), { kind: "enter" }],
    context,
  ).result;
  assert.ok(short && short.kind === "message" && /tres vértices/.test(short.text));
  const closed = run(
    command("XCLIP"),
    [keyword("Poligonal"), point(0, 0), point(100, 0), point(100, 100), { kind: "enter" }],
    context,
  ).result;
  assert.ok(closed && closed.kind === "document", "con tres, se cierra al pulsar Intro");
  checks += 2;
}

console.log(`engine/commands/xrefs.spec: ${checks} comprobaciones OK`);
