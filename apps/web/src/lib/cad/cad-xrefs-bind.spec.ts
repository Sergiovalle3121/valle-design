/**
 * Resolución de rutas de xref y XBIND, con su ida y vuelta.
 *
 * Éste es el archivo de los dos casos que deciden si un proyecto abre en otra
 * máquina y si enlazar una referencia deja algo utilizable:
 *
 *   1. **Las tres rutas.** Relativa, absoluta y búsqueda por nombre, probadas
 *      en ese orden, con el resultado DICIENDO por cuál se encontró. Una ruta
 *      rota falla explicando qué se intentó con cada una; un nombre ambiguo no
 *      se resuelve al azar.
 *   2. **Enlazar no es insertar.** `bind` deja un BLOQUE local con los símbolos
 *      renombrados `$0$` y el INSERT sobrevive; `insert` explota el contenido.
 *      Confundirlos deja el plano lleno de líneas sueltas a quien quería un
 *      bloque que se mueve de una pieza.
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument, type CadEntity } from "./cad-document";
import { executeCadEntityCommandBatch } from "./entity-commands";
import { cadResolveXrefPath, cadXrefPathFields, type CadXrefCatalogEntry } from "./xref/xref-paths";
import { cadTenantLayoutUri, type CadXrefAssetSnapshot } from "./xref/xref-projection";
import { cadXrefAttachCommands, cadXrefBindCommands } from "./xref/xref-workflow";

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

function snapshot(assetId: string, name: string): CadXrefAssetSnapshot {
  return {
    tenantId: "tenant-1",
    assetId,
    name,
    revision: "rev-1",
    version: 3,
    document: migrateCadDocument({
      meta: { version: 3, schema: 4, unit: "mm" },
      entities: [line(`${assetId}-line`, 5_000)],
    }),
    contentHash: `hash-${assetId}`,
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Anfitrión con la referencia PLANTA ya adjuntada por la ruta canónica. */
const attached: CadDocument = executeCadEntityCommandBatch(
  migrateCadDocument({ meta: { version: 1, schema: 4, unit: "mm" }, entities: [line("host-line", 0)] }),
  cadXrefAttachCommands(
    migrateCadDocument({ meta: { version: 1, schema: 4, unit: "mm" }, entities: [line("host-line", 0)] }),
    {
      id: "xref-planta",
      snapshot: snapshot("asset-planta", "PLANTA"),
      relativePath: "plantas/base",
    },
  ),
  "XATTACH",
).document;

// --- 1. Las tres rutas, y por cuál se resolvió -------------------------------
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

// --- 2. XBIND: enlazar NO es insertar ----------------------------------------
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

console.log(`cad-xrefs-bind.spec: ${checks} comprobaciones OK`);
