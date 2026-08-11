/**
 * ADCENTER: copiar definiciones de otro dibujo sin romper el propio.
 *
 * Dos cosas se pueden hacer mal aquí y las dos estropean el dibujo del
 * anfitrión en silencio:
 *
 *   1. **Pisar un nombre.** Copiar un `PUERTA` sobre el `PUERTA` que ya había
 *      cambiaría todas las inserciones existentes por otra geometría.
 *   2. **Copiar sólo la mitad.** Un bloque que inserta otro, copiado sin su
 *      contenido, queda apuntando al bloque del xref; el día que se desligue la
 *      referencia, la copia se rompe.
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../cad-document";
import { executeCadEntityCommandBatch } from "../entity-commands";
import { cadTenantLayoutUri } from "../xref/xref-projection";
import { cadXrefDetachCommands } from "../xref/xref-workflow";
import {
  cadDesignCenterCopyCommands,
  cadDesignCenterInventory,
  cadDesignCenterSources,
} from "./design-center";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const line = (id: string, x: number): CadEntity => ({
  id,
  type: "line",
  start: { x, y: 0, z: 0 },
  end: { x: x + 100, y: 0, z: 0 },
  layer: "0",
});

/** Anfitrión con un `PUERTA` propio y un xref que trae otro `PUERTA` distinto. */
function documentWithSource(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "xref:planta:layer", name: "XREF|PLANTA", color: "#64748b", visible: true, locked: true },
    ],
    entities: [
      {
        id: "insert-local",
        type: "insert",
        block: "block:puerta",
        insertion: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "0",
      },
    ],
    blocks: [
      {
        id: "block:puerta",
        name: "PUERTA",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [line("block:puerta:entity:0", 0)],
      },
      {
        id: "xref:planta:block:0:mueble",
        name: "PLANTA|MUEBLE",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [line("xref:planta:block:0:mueble:entity:0", 900)],
      },
      {
        id: "xref:planta:block:1:puerta",
        name: "PLANTA|PUERTA",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          line("xref:planta:block:1:puerta:entity:0", 500),
          {
            id: "xref:planta:block:1:puerta:entity:1",
            type: "insert",
            block: "xref:planta:block:0:mueble",
            insertion: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            rotation: 0,
            layer: "xref:planta:layer",
          },
        ],
      },
      {
        id: "xref:planta:root",
        name: "XREF|PLANTA|rev-1",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [line("xref:planta:root:entity:0", 0)],
      },
    ],
    externalReferences: [
      {
        id: "planta",
        name: "PLANTA",
        uri: cadTenantLayoutUri("asset-planta", "rev-1"),
        loaded: true,
        mode: "attachment",
        assetId: "asset-planta",
        blockId: "xref:planta:root",
        insertId: "xref:planta:insert",
      },
    ],
  });
}

// --- 1. Navegar --------------------------------------------------------------
{
  const document = documentWithSource();
  assert.deepEqual(
    cadDesignCenterSources(document).map((source) => [source.name, source.blockCount, source.layerCount]),
    [["PLANTA", 2, 1]],
    "el origen es la referencia adjuntada, y su bloque RAÍZ no se ofrece: es el envoltorio, no contenido",
  );
  assert.deepEqual(
    cadDesignCenterInventory(document, "PLANTA").map((item) => [item.kind, item.name]),
    [
      ["block", "MUEBLE"],
      ["block", "PUERTA"],
      ["layer", "XREF|PLANTA"],
    ],
    "y los nombres se enseñan sin el prefijo del proyector",
  );
  assert.throws(() => cadDesignCenterInventory(document, "NO-EXISTE"), /ningún origen/);
  checks += 3;
}

// --- 2. Copiar NO pisa el nombre del anfitrión -------------------------------
const copied = (() => {
  const document = documentWithSource();
  const copy = cadDesignCenterCopyCommands(document, "PLANTA", ["PUERTA"]);
  assert.deepEqual(
    copy.copied,
    [{ from: "PUERTA", to: "PUERTA(2)", renamed: true }],
    "el nombre chocaba, así que se desambigua y se DICE",
  );
  const next = executeCadEntityCommandBatch(document, copy.commands, "ADCENTER").document;
  const local = next.blocks.find((block) => block.name === "PUERTA")!;
  assert.deepEqual(
    local.entities.map((entity) => entity.id),
    ["block:puerta:entity:0"],
    "el PUERTA del anfitrión sigue siendo el suyo: sus inserciones no cambian de geometría",
  );
  ok(!!next.blocks.find((block) => block.name === "PUERTA(2)"), "y la copia entra con nombre nuevo");
  checks += 2;
  return next;
})();

// --- 3. Se copia el ÁRBOL: la copia sobrevive a desligar la referencia -------
{
  const puerta = copied.blocks.find((block) => block.name === "PUERTA(2)")!;
  const nested = puerta.entities.find((entity) => entity.type === "insert");
  assert.ok(nested && nested.type === "insert");
  ok(
    !nested.block.startsWith("xref:"),
    "el INSERT anidado apunta a la COPIA, no al bloque de la referencia",
  );
  const mueble = copied.blocks.find((block) => block.id === nested.block);
  assert.equal(mueble?.name, "MUEBLE", "que también se copió, aunque no se pidiera por su nombre");
  checks += 2;

  // La prueba de fuego: desligar la referencia y comprobar que la copia sigue
  // entera. Copiar sólo la mitad se descubre aquí, no antes.
  const detached = executeCadEntityCommandBatch(
    copied,
    cadXrefDetachCommands(copied, "planta"),
    "XREF Desligar",
  ).document;
  ok(
    !detached.blocks.some((block) => block.id.startsWith("xref:planta:")),
    "la proyección se fue",
  );
  const survivor = detached.blocks.find((block) => block.name === "PUERTA(2)")!;
  const survivorInsert = survivor.entities.find((entity) => entity.type === "insert")!;
  assert.ok(survivorInsert.type === "insert");
  ok(
    detached.blocks.some((block) => block.id === survivorInsert.block),
    "y la copia sigue resolviendo: su bloque anidado sigue en la tabla",
  );
  checks += 1;
}

// --- 4. Copiar TODO, y la capa entra desbloqueada ----------------------------
{
  const document = documentWithSource();
  const copy = cadDesignCenterCopyCommands(document, "PLANTA", ["*"]);
  const next = executeCadEntityCommandBatch(document, copy.commands, "ADCENTER").document;
  assert.deepEqual(
    copy.copied.map((entry) => entry.to).sort(),
    ["MUEBLE", "PLANTA", "PUERTA(2)"],
    "los dos bloques y la capa, que pierde el prefijo del proyector al copiarse",
  );
  const layer = next.layers.find((candidate) => candidate.name === "PLANTA")!;
  ok(!layer.locked, "la copia de la capa entra DESBLOQUEADA: su contenido sí es editable");
  ok(
    next.layers.some((candidate) => candidate.id === "xref:planta:layer"),
    "y la de la referencia sigue en su sitio, sin que copiarla la mueva",
  );
  checks += 1;
}

// --- 5. Errores dichos, no adivinados ----------------------------------------
{
  const document = documentWithSource();
  assert.throws(() => cadDesignCenterCopyCommands(document, "PLANTA", ["FANTASMA"]), /ningún elemento/);
  assert.throws(() => cadDesignCenterCopyCommands(document, "PLANTA", []), /nada que copiar/);
  checks += 2;
}

console.log(`design-center.spec: ${checks} comprobaciones OK`);
