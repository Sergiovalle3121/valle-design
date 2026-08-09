/**
 * PURGE y GROUP.
 *
 * La aserción que importa de todo este archivo es la NEGATIVA: **PURGE no
 * propone lo que sí se usa.** Un purgado agresivo no da un error, da un dibujo
 * que se abre con bloques que faltan; y el análisis ingenuo —«¿lo inserta
 * alguna entidad del espacio de modelo?»— se salta los bloques anidados, la
 * geometría que vive dentro de una definición, el estilo de texto al que
 * apunta un estilo de cota y los atributos de un bloque todavía sin insertar.
 * Cada uno de esos siete sitios tiene aquí su caso.
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../cad-document";
import { executeCadEntityCommandBatch } from "../entity-commands";
import {
  cadCreateGroupCommands,
  cadDocumentGroups,
  cadExpandSelectionByGroup,
  cadGroupsOf,
  cadUngroupCommands,
} from "./cad-groups";
import { cadPurgeCommands, cadPurgePreview, cadStyleUsageByFamily } from "./cad-purge";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const line = (id: string, layer = "0"): CadEntity => ({
  id,
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 100, y: 0, z: 0 },
  layer,
});

const labels = (candidates: ReturnType<typeof cadPurgePreview>, kind: string) =>
  candidates.filter((candidate) => candidate.kind === kind).map((candidate) => candidate.label).sort();

// --- 1. Lo que se usa NO se propone ------------------------------------------
{
  const document: CadDocument = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "USADA", name: "USADA", color: "#ff0000", visible: true, locked: false },
      { id: "VACIA", name: "VACIA", color: "#00ff00", visible: true, locked: false },
      { id: "SOLO-EN-BLOQUE", name: "SOLO-EN-BLOQUE", color: "#0000ff", visible: true, locked: false },
      { id: "ACTIVA", name: "ACTIVA", color: "#ffff00", visible: true, locked: false },
    ],
    entities: [
      line("suelta", "USADA"),
      {
        id: "insert-exterior",
        type: "insert",
        block: "block:contenedor",
        insertion: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "USADA",
      },
      {
        id: "cota",
        type: "dimension",
        dimensionKind: "linear",
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        style: "PRINCIPAL",
        layer: "USADA",
      },
      {
        id: "rotulo",
        type: "mtext",
        insertion: { x: 0, y: 0, z: 0 },
        text: "hola",
        style: "TITULO",
        layer: "USADA",
      },
    ],
    blocks: [
      {
        id: "block:contenedor",
        name: "CONTENEDOR",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          line("block:contenedor:entity:0", "SOLO-EN-BLOQUE"),
          {
            id: "block:contenedor:entity:1",
            type: "insert",
            block: "block:anidado",
            insertion: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            rotation: 0,
            layer: "0",
          },
        ],
      },
      {
        id: "block:anidado",
        name: "ANIDADO",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [line("block:anidado:entity:0")],
      },
      {
        id: "block:huerfano",
        name: "HUERFANO",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [line("block:huerfano:entity:0")],
      },
      {
        id: "block:catalogo",
        name: "CATALOGO",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [line("block:catalogo:entity:0")],
        attributes: { REF: { defaultValue: "", style: "ETIQUETA" } },
      },
    ],
    styles: {
      text: { TITULO: { height: 200 }, ETIQUETA: { height: 80 }, COTAS: { height: 25 }, NADIE: { height: 10 } },
      dimension: { PRINCIPAL: { textStyle: "COTAS" }, SINUSO: { arrowSize: 2 } },
      table: {},
      plot: { "Blanco y negro": { colorMode: "monochrome" } },
    },
  });

  const candidates = cadPurgePreview(document, { activeLayer: "ACTIVA" });

  // Bloques: sólo el huérfano. CONTENEDOR está insertado, ANIDADO vive dentro
  // de CONTENEDOR y CATALOGO… sí está huérfano, así que también entra.
  assert.deepEqual(labels(candidates, "block"), ["CATALOGO", "HUERFANO"], "sólo los bloques sin insertar");
  ok(!labels(candidates, "block").includes("ANIDADO"), "un bloque ANIDADO en uno usado NO se purga");
  ok(!labels(candidates, "block").includes("CONTENEDOR"), "ni el que está insertado");

  // Capas: sólo la vacía. La que sólo ocupa geometría DE DENTRO de un bloque no.
  assert.deepEqual(labels(candidates, "layer"), ["VACIA"], "sólo la capa sin nada");
  ok(!labels(candidates, "layer").includes("SOLO-EN-BLOQUE"), "una capa usada dentro de un bloque NO se purga");
  ok(!labels(candidates, "layer").includes("0"), "la capa 0 nunca se purga");
  ok(!labels(candidates, "layer").includes("ACTIVA"), "ni la capa activa");

  // Estilos: NADIE está huérfano; COTAS lo usa un estilo de cota, ETIQUETA un
  // atributo de un bloque todavía sin insertar, TITULO un MTEXT.
  assert.deepEqual(labels(candidates, "style"), ["NADIE", "SINUSO"], "sólo los estilos a los que no apunta nada");
  ok(!labels(candidates, "style").includes("COTAS"), "un estilo de texto usado por un estilo de COTA no se purga");
  ok(
    !labels(candidates, "style").includes("ETIQUETA"),
    "ni el que usa el atributo de un bloque que aún no se ha insertado",
  );
  ok(
    !labels(candidates, "style").includes("Blanco y negro"),
    "los estilos de PLOT quedan fuera: nada los referencia por nombre y no se puede decidir",
  );
  checks += 3;

  // Y el purgado se APLICA sin romper nada.
  const purged = executeCadEntityCommandBatch(
    document,
    cadPurgeCommands(candidates),
    "PURGE",
  ).document;
  assert.deepEqual(
    purged.blocks.map((block) => block.name).sort(),
    ["ANIDADO", "CONTENEDOR"],
    "quedan los bloques en uso",
  );
  assert.deepEqual(
    purged.layers.map((layer) => layer.id).sort(),
    ["0", "ACTIVA", "SOLO-EN-BLOQUE", "USADA"],
    "y las capas en uso",
  );
  assert.deepEqual(Object.keys(purged.styles.text).sort(), ["COTAS", "ETIQUETA", "TITULO"]);
  assert.deepEqual(Object.keys(purged.styles.dimension).sort(), ["PRINCIPAL"]);
  assert.equal(purged.meta.version, document.meta.version + 1, "un purgado, un paso de deshacer");
  checks += 5;
  // El purgado CASCADEA, y se dice: al irse CATALOGO, el estilo que sólo usaba
  // su atributo se queda huérfano. AutoCAD se comporta igual —hay que repetir
  // PURGE—, y esto lo deja escrito en vez de dejarlo como sorpresa.
  assert.deepEqual(
    labels(cadPurgePreview(purged, { activeLayer: "ACTIVA" }), "style"),
    ["ETIQUETA"],
    "una segunda pasada encuentra lo que la primera dejó huérfano",
  );
  const twice = executeCadEntityCommandBatch(
    purged,
    cadPurgeCommands(cadPurgePreview(purged, { activeLayer: "ACTIVA" })),
    "PURGE",
  ).document;
  assert.deepEqual(cadPurgePreview(twice, { activeLayer: "ACTIVA" }), [], "y la tercera ya no encuentra nada");
  checks += 2;
}

// --- 2. Bloque huérfano que CONTIENE a otro huérfano: orden correcto ---------
{
  const document: CadDocument = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [],
    blocks: [
      {
        id: "block:aaa-padre",
        name: "PADRE",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          {
            id: "block:aaa-padre:entity:0",
            type: "insert",
            block: "block:zzz-hijo",
            insertion: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            rotation: 0,
            layer: "0",
          },
        ],
      },
      {
        id: "block:zzz-hijo",
        name: "HIJO",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [line("block:zzz-hijo:entity:0")],
      },
    ],
  });
  const candidates = cadPurgePreview(document);
  assert.deepEqual(labels(candidates, "block"), ["HIJO", "PADRE"], "los dos están huérfanos");
  const commands = cadPurgeCommands(candidates);
  const purged = executeCadEntityCommandBatch(document, commands, "PURGE").document;
  assert.equal(
    purged.blocks.length,
    0,
    "el árbol entero se va de una pieza: la tabla no cuenta como «en uso» lo que el mismo lote borra",
  );
  // Y al revés también, para que la propiedad no dependa del orden por azar.
  const reversed = executeCadEntityCommandBatch(document, [...commands].reverse(), "PURGE").document;
  assert.equal(reversed.blocks.length, 0, "en cualquier orden");
  checks += 3;
}

// --- 3. Grupos ----------------------------------------------------------------
{
  const document: CadDocument = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [line("pata-1"), line("pata-2"), line("tablero"), line("ajena")],
  });
  const members = document.entities.filter((entity) => entity.id !== "ajena");
  const grouped = executeCadEntityCommandBatch(
    document,
    cadCreateGroupCommands("MESA", members),
    "GROUP",
  ).document;
  assert.deepEqual(
    cadDocumentGroups(grouped.entities),
    [{ name: "MESA", entityIds: ["pata-1", "pata-2", "tablero"] }],
    "el grupo existe con sus tres miembros",
  );
  checks += 1;

  // Designar UNA pata designa la mesa entera. Es la mitad del valor del grupo.
  assert.deepEqual(
    cadExpandSelectionByGroup(["pata-1"], grouped.entities),
    ["pata-1", "pata-2", "tablero"],
    "la selección se expande al grupo",
  );
  assert.deepEqual(
    cadExpandSelectionByGroup(["ajena"], grouped.entities),
    ["ajena"],
    "y lo que no está en ningún grupo se queda solo",
  );
  checks += 2;

  // Una entidad puede estar en DOS grupos: entrar en el segundo no la saca del
  // primero, que es el fallo silencioso de guardar un solo nombre.
  const both = executeCadEntityCommandBatch(
    grouped,
    cadCreateGroupCommands("PATAS", grouped.entities.filter((entity) => entity.id.startsWith("pata"))),
    "GROUP",
  ).document;
  const pata = both.entities.find((entity) => entity.id === "pata-1")!;
  assert.deepEqual(cadGroupsOf(pata), ["MESA", "PATAS"], "la pata está en los dos grupos");
  checks += 1;

  // UNGROUP deshace UNO y deja el otro.
  const ungrouped = executeCadEntityCommandBatch(
    both,
    cadUngroupCommands("PATAS", both.entities),
    "UNGROUP",
  ).document;
  assert.deepEqual(
    cadGroupsOf(ungrouped.entities.find((entity) => entity.id === "pata-1")!),
    ["MESA"],
    "deshacer PATAS no saca la pata de MESA",
  );
  checks += 1;

  // Y al deshacer el último grupo, la clave DESAPARECE de los metadatos: dejar
  // un `cad:groups: ""` cambiaría el serializado de todas las entidades.
  const clean = executeCadEntityCommandBatch(
    ungrouped,
    cadUngroupCommands("MESA", ungrouped.entities),
    "UNGROUP",
  ).document;
  const tablero = clean.entities.find((entity) => entity.id === "tablero")!;
  ok(
    tablero.context?.metadata === undefined,
    "sin grupos, la entidad vuelve a no tener metadatos",
  );
  assert.deepEqual(cadDocumentGroups(clean.entities), [], "y el dibujo se queda sin grupos");
  checks += 1;

  assert.throws(() => cadUngroupCommands("NO-EXISTE", clean.entities), /No hay ningún grupo/);
  assert.throws(() => cadCreateGroupCommands("con,coma", members), /comas/);
  assert.throws(() => cadCreateGroupCommands("MESA", []), /al menos un objeto/);
  checks += 3;
}

// --- 4. El uso de estilos, medido por familia --------------------------------
{
  const usage = cadStyleUsageByFamily({
    entities: [
      { id: "t", type: "mtext", insertion: { x: 0, y: 0, z: 0 }, text: "x", style: "A", layer: "0" },
      {
        id: "tabla",
        type: "table",
        insertion: { x: 0, y: 0, z: 0 },
        rows: 1,
        columns: 1,
        rowHeights: [10],
        columnWidths: [10],
        cells: [{ row: 0, column: 0, text: "x", textStyle: "B" }],
        style: "TABLA",
        layer: "0",
      },
    ],
    blocks: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
  });
  assert.deepEqual([...usage.text].sort(), ["A", "B"], "el estilo de una CELDA también cuenta");
  assert.deepEqual([...usage.table], ["TABLA"]);
  checks += 2;
}

console.log(`cad-purge.spec: ${checks} comprobaciones OK`);
