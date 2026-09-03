/**
 * DATAEXTRACTION como comando: inserta la tabla en el punto pedido y, en su
 * variante CSV, pide al anfitrión que entregue el texto exacto.
 */
import { strict as assert } from "node:assert";
import type { CadCommandContext } from "../command-types";
import type { CadWallEntity } from "../../cad-entities-v6";
import { CAD_DATA_EXTRACTION_COMMANDS } from "./data-extraction-commands";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const command = CAD_DATA_EXTRACTION_COMMANDS[0];
ok(command.name === "DATAEXTRACTION", "el descriptor se llama DATAEXTRACTION");

function wall(): CadWallEntity {
  return {
    id: "w1",
    type: "wall",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 4000, y: 0, z: 0 },
    thickness: 200,
    height: 2600,
    layer: "MUROS",
  };
}

function context(hasDocument: boolean, propio?: unknown): CadCommandContext {
  return {
    entityIds: ["w1"],
    entity: () => wall(),
    selection: [],
    activeLayer: "MUROS",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "tabla1",
    ...(hasDocument
      ? {
          document: () => (propio ?? {
            meta: { version: 1, schema: 4, unit: "mm" },
            entities: [wall()],
            blocks: [],
            layers: [],
            styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
            externalReferences: [],
            modelSpace: { entityIds: ["w1"] },
            unsupportedEntities: [],
          }) as never,
        }
      : {}),
  };
}

// --- Tabla: un punto, y sale una entidad TABLE con los números del modelo --
{
  const begin = command.begin(context(true));
  ok(begin.prompt.options.some((option) => option.keyword === "Tabla"), "ofrece Tabla por defecto");
  const chosen = command.step(begin.state, { kind: "enter" }, context(true));
  ok(chosen.accepts !== 0 && chosen.result === undefined, "sigue pidiendo el punto de inserción");
  const inserted = command.step(chosen.state, { kind: "point", point: { x: 500, y: -500 }, source: "typed" }, context(true));
  ok(inserted.result?.kind === "document", "termina escribiendo UN lote");
  if (inserted.result?.kind === "document") {
    const entity = inserted.result.commands[0];
    ok(entity.type === "insert", "inserta una entidad nueva");
    if (entity.type === "insert") {
      ok(entity.entity.type === "table", "la entidad es una TABLE nativa");
      ok(entity.entity.id === "tabla1", "usa el generador de ids del contexto");
      if (entity.entity.type === "table") {
        ok(entity.entity.insertion.x === 500 && entity.entity.insertion.y === -500, "en el punto pedido");
        ok(
          entity.entity.cells.some((cell) => cell.text === "4.000"),
          `la longitud del muro de 4 m tiene que aparecer en la tabla: ${JSON.stringify(entity.entity.cells)}`,
        );
      }
    }
  }
}

// --- CSV: pide al anfitrión que entregue el texto ---------------------------
{
  const begin = command.begin(context(true));
  const csv = command.step(begin.state, { kind: "keyword", keyword: "CSV" }, context(true));
  ok(csv.result?.kind === "host", "la variante CSV termina en una petición al anfitrión");
  if (csv.result?.kind === "host") {
    ok(csv.result.request.kind === "data-extraction-csv", "la petición es la del CSV");
    if (csv.result.request.kind === "data-extraction-csv") {
      ok(csv.result.request.content.includes("MUROS"), "el CSV lleva la sección de muros");
      ok(csv.result.request.content.includes("4.000"), "y la longitud real del muro");
    }
  }
}

// --- sin documento: se niega, no inventa una tabla vacía --------------------
{
  const begin = command.begin(context(false));
  const chosen = command.step(begin.state, { kind: "enter" }, context(false));
  const refused = command.step(chosen.state, { kind: "point", point: { x: 0, y: 0 }, source: "typed" }, context(false));
  ok(refused.result?.kind === "message", "sin documento, se niega con un mensaje");
  ok(
    refused.result?.kind === "message" && /no expone el documento/.test(refused.result.text),
    `declara su límite: ${JSON.stringify(refused.result)}`,
  );
}

// --- Ola E (2026-09-02): Superficies y carPintería ---------------------------
{
  const begin = command.begin(context(true));
  ok(begin.prompt.options.some((option) => option.keyword === "Superficies" && option.shortcut === "S"), "ofrece Superficies");
  ok(begin.prompt.options.some((option) => option.keyword === "carPintería" && option.shortcut === "P"), "y carPintería");
  // Un solo muro no cierra ningún local ni aloja huecos: las dos negativas se dicen.
  const rooms = command.step(begin.state, { kind: "keyword", keyword: "Superficies" }, context(true));
  ok(rooms.prompt.message.includes("cuadro de superficies"), "pide el punto del cuadro de superficies");
  const noRooms = command.step(rooms.state, { kind: "point", point: { x: 0, y: 0 }, source: "typed" }, context(true));
  ok(noRooms.result?.kind === "message" && noRooms.result.text.includes("no cierran ningún local"), `sin local cerrado lo dice: ${JSON.stringify(noRooms.result)}`);
  const openings = command.step(begin.state, { kind: "keyword", keyword: "carPintería" }, context(true));
  const noOpenings = command.step(openings.state, { kind: "point", point: { x: 0, y: 0 }, source: "typed" }, context(true));
  ok(noOpenings.result?.kind === "message" && noOpenings.result.text.includes("puertas ni ventanas"), "sin huecos lo dice");
}

// --- El cuadro de CARGAS: el entregable de un proyecto eléctrico mexicano ---
{
  // Un ramal de 30 m de 12 AWG con protección de 20 A: cumple la ampacidad y se
  // pasa de caída. El cuadro tiene que decirlo EN la tabla, no sólo en un
  // renglón que desaparece.
  const conductor = (id: string, x0: number, x1: number, extra: Record<string, string> = {}) => ({
    id,
    type: "polyline" as const,
    vertices: [
      { x: x0, y: 0, z: 0 },
      { x: x1, y: 0, z: 0 },
    ],
    closed: false,
    layer: "IE-CIR",
    context: {
      metadata: {
        "ie:circuito": "C-1",
        "ie:numero": id === "a" ? "1" : "2",
        "ie:calibre": "12",
        ...extra,
      },
    },
  });
  const conCircuitos = {
    meta: { version: 1, schema: 4, unit: "mm" },
    blocks: [],
    layers: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    externalReferences: [],
    unsupportedEntities: [],
    modelSpace: { entityIds: ["a", "b"] },
    entities: [
      conductor("a", 0, 15_000, {
        "ie:proteccion": "20",
        "ie:tension": "127",
        "ie:fases": "1",
      }),
      conductor("b", 15_000, 30_000),
    ],
  } as never;

  const begin = command.begin(context(true, conCircuitos));
  const elegido = command.step(begin.state, { kind: "keyword", keyword: "circUitos" }, context(true, conCircuitos));
  const salida = command.step(
    elegido.state,
    { kind: "point", point: { x: 0, y: 0 }, source: "typed" },
    context(true, conCircuitos),
  );
  ok(salida.result?.kind === "document", "el cuadro de cargas se inserta como documento");
  const tabla = (salida.result as unknown as {
    commands: { entity: { type: string } }[];
  }).commands[0].entity;
  ok(tabla.type === "table", "y es una TABLE del dibujo, no un texto suelto");
  const texto = JSON.stringify(tabla);
  ok(/Cuadro de cargas/.test(texto), "con su título");
  ok(/AVISO/.test(texto), "con el veredicto DENTRO de la tabla");
  ok(/30\.0/.test(texto), "con la longitud que mide el dibujo");
  ok(
    /No sustituye el memorial de cálculo/.test(texto),
    "y con su límite en el título: un cuadro con veredictos y sin límite se lee como un memorial",
  );

  // Sin conductores numerados, se niega con motivo y no inserta nada.
  const vacio = command.step(
    command.step(command.begin(context(true)).state, { kind: "keyword", keyword: "circUitos" }, context(true)).state,
    { kind: "point", point: { x: 0, y: 0 }, source: "typed" },
    context(true),
  );
  ok(
    vacio.result?.kind === "message" && /no tiene conductores numerados/.test(vacio.result.text),
    "sin conductores se niega con motivo",
  );
}

console.log(`data-extraction-commands.spec: ${checks} comprobaciones OK`);
