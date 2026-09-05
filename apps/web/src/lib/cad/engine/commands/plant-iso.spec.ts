/**
 * PIDISO TECLEADO: el isométrico, su lista y su hoja, en UN paso.
 *
 * La proyección la mide `plant/isometric.spec.ts` y la lista
 * `plant/pipe-mto.ts` a través de `plant-route.spec.ts`. Aquí se mide lo que
 * sólo se puede medir tecleando la orden: que las tres cosas que hacen falta
 * para montar una tubería —dibujo, lista y HOJA— salgan juntas y en un solo
 * paso de deshacer, que la hoja encuadre las dos, que el modelo no se toque, y
 * que pedir el isométrico de algo que sólo existe en el P&ID se conteste con el
 * motivo en vez de con un dibujo inventado a partir de un esquema sin escala.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { CAD_PL_LINE, CAD_PL_SERVICE, CAD_PL_SPEC } from "../../plant/line-numbers";
import { CAD_PL_ROUTE, CAD_PL_ROUTE_LAYER, CAD_PL_ROUTE_MARK } from "../../plant/pipe-route";
import { CAD_ISO_PIPE_LAYER, CAD_ISO_TEXT_LAYER } from "../../plant/isometric";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
} from "../command-engine";
import type { CadCommandContext } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

const registry = CAD_COMMAND_REGISTRY_V2;
let ids = 0;
let pasos = 0;

function conRuta(...rutas: { line: string; puntos: [number, number, number][] }[]): CadDocument {
  const entities = rutas.map((ruta, indice) => {
    const partido = /^([^-]+)-([A-Z]{1,3})-(\d+)-(.+)$/u.exec(ruta.line)!;
    return {
      id: `ruta-${indice + 1}`,
      type: "polyline",
      vertices: ruta.puntos.map(([x, y, z]) => ({ x, y, z })),
      closed: false,
      layer: CAD_PL_ROUTE_LAYER,
      context: {
        metadata: {
          [CAD_PL_LINE]: ruta.line,
          [CAD_PL_SERVICE]: partido[2],
          [CAD_PL_SPEC]: partido[4],
          [CAD_PL_ROUTE]: CAD_PL_ROUTE_MARK,
        },
      },
    };
  });
  return migrateCadDocument({
    meta: { version: 1, schema: 8, unit: "mm" },
    layers: [
      { id: "0", name: "0", visible: true, locked: false, color: "#ffffff" },
      {
        id: CAD_PL_ROUTE_LAYER,
        name: CAD_PL_ROUTE_LAYER,
        visible: true,
        locked: false,
        color: "#38bdf8",
      },
    ],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  } as never);
}

function run(document: CadDocument, tokens: readonly string[]) {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  let current = document;
  for (const token of tokens) {
    const context: CadCommandContext = {
      entityIds: current.entities.map((entity) => entity.id),
      entity: (id) => current.entities.find((entity) => entity.id === id),
      layers: () => current.layers,
      blocks: () => current.blocks ?? [],
      paperSpaces: () => current.paperSpaces ?? [],
      selection: [],
      activeLayer: "0",
      unit: current.meta.unit,
      drawingExtents: () => ({ minX: 0, minY: 0, maxX: 20_000, maxY: 20_000 }),
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `is-${(ids += 1)}`,
    };
    const reduction =
      token === "\r"
        ? cadCommandEngineReduce(state, { kind: "input", input: { kind: "enter" } }, context, registry)
        : cadCommandEngineReduce(state, { kind: "token", value: token }, context, registry);
    state = reduction.state;
    effects.push(...reduction.effects);
    for (const effect of reduction.effects)
      if (effect.kind === "execute") {
        pasos += 1;
        current = executeCadEntityCommandBatch(current, effect.commands, effect.label).document;
      }
  }
  return { effects, document: current };
}

const dichos = (effects: readonly CadCommandEffect[]) =>
  effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : []));

const LINEA = '6"-P-1001-CS150';
const RUTA: [number, number, number][] = [
  [0, 0, 0],
  [12_000, 0, 0],
  [12_000, 0, 3_000],
  [12_000, 9_000, 3_000],
];

// --- 1 · en el registro, con sus alias ------------------------------------
{
  ok(registry.get("PIDISO"), "PIDISO no está en el registro");
  for (const alias of ["ISOMETRICO", "ISOGEN"])
    eq(registry.get(alias)?.name, "PIDISO", `el alias ${alias} no lleva a PIDISO`);
}

// --- 2 · dibujo, lista y HOJA salen juntos, en un paso --------------------
{
  const base = conRuta({ line: LINEA, puntos: RUTA });
  const antes = pasos;
  // Con una sola línea con ruta 3D, el Intro la acepta: nadie teclea un número
  // de línea que el programa ya sabe.
  const sesion = run(base, ["PIDISO", "\r"]);
  eq(pasos - antes, 1, "un solo paso de deshacer: no quedan hojas huérfanas al deshacer");

  const nuevas = sesion.document.entities.filter(
    (entidad) => !base.entities.some((vieja) => vieja.id === entidad.id),
  );
  ok(nuevas.length > 5, `el isométrico trae geometría de verdad: ${nuevas.length} entidades`);
  ok(
    nuevas.some((entidad) => entidad.layer === CAD_ISO_PIPE_LAYER && entidad.type === "polyline"),
    "con el trazo de la tubería en su capa",
  );
  ok(
    nuevas.some((entidad) => entidad.type === "table" && entidad.layer === CAD_ISO_TEXT_LAYER),
    "y la LISTA DE MATERIALES como tabla del documento",
  );
  const tabla = nuevas.find((entidad) => entidad.type === "table") as Extract<
    CadDocument["entities"][number],
    { type: "table" }
  >;
  const titulo = tabla.cells.find((celda) => celda.row === 0)?.text ?? "";
  ok(new RegExp(LINEA.replace(/"/gu, '"')).test(titulo), `el cuadro dice de qué línea es: ${titulo}`);
  ok(
    /Sin espesor, diámetro exterior, peso, clave de compra ni precio/.test(titulo),
    `y su límite va EN el cuadro, que es lo que se imprime: ${titulo}`,
  );

  const hoja = (sesion.document.paperSpaces ?? []).find((espacio) =>
    espacio.name.startsWith("ISO-"),
  );
  assert.ok(hoja, "la hoja del isométrico no se creó");
  verdes += 1;
  eq(hoja!.name, `ISO-${LINEA}`, "y se llama como la línea, para poder archivarla");
  ok((hoja!.viewports ?? []).length === 1, "con su ventana: una hoja sin ventana es papel");

  // La ventana encuadra el isométrico Y el cuadro: una que cortase la lista
  // entregaría media requisición.
  const ventana = hoja!.viewports![0];
  const derecha = Math.max(
    ...nuevas.flatMap((entidad) =>
      entidad.type === "polyline"
        ? entidad.vertices.map((v) => v.x)
        : entidad.type === "table"
          ? [entidad.insertion.x + entidad.columnWidths.reduce((a, b) => a + b, 0)]
          : entidad.type === "mtext"
            ? [entidad.insertion.x]
            : [],
    ),
  );
  ok(
    ventana.modelBounds.x + ventana.modelBounds.width >= derecha,
    `la ventana llega hasta el borde derecho del cuadro (${ventana.modelBounds.x + ventana.modelBounds.width} ≥ ${derecha})`,
  );

  ok(
    dichos(sesion.effects).some((t) => /PIDISO: isométrico de .* m de tubo, 2 codo\(s\)/.test(t)),
    `y la orden resume lo que hizo: ${dichos(sesion.effects).join(" / ")}`,
  );

  // El MODELO no se toca: las rutas siguen exactamente como estaban.
  assert.deepEqual(
    sesion.document.entities.find((entidad) => entidad.id === "ruta-1"),
    base.entities.find((entidad) => entidad.id === "ruta-1"),
    "el isométrico no modifica la tubería de la que sale",
  );
  verdes += 1;
}

// --- 3 · con varias líneas se pregunta cuál, y se teclea ------------------
{
  const dos = conRuta(
    { line: LINEA, puntos: RUTA },
    {
      line: '4"-V-1001-CS150',
      puntos: [
        [0, 15_000, 1_000],
        [8_000, 15_000, 1_000],
      ],
    },
  );
  const intro = run(dos, ["PIDISO", "\r"]);
  ok(
    dichos(intro.effects).some((t) => /Hay 2 líneas con ruta 3D/.test(t)),
    `con dos líneas el Intro no adivina: ${dichos(intro.effects).join(" / ")}`,
  );
  eq((intro.document.paperSpaces ?? []).length, 0, "y no se crea ninguna hoja");

  const tecleada = run(dos, ["PIDISO", '4"-V-1001-CS150']);
  const hoja = (tecleada.document.paperSpaces ?? [])[0];
  assert.ok(hoja, "tecleando el número sí se crea");
  verdes += 1;
  eq(hoja.name, 'ISO-4"-V-1001-CS150', "la hoja de la línea que se pidió, no la otra");
}

// --- 4 · las negativas, con motivo ---------------------------------------
{
  const vacio = run(
    migrateCadDocument({
      meta: { version: 1, schema: 8, unit: "mm" },
      layers: [{ id: "0", name: "0", visible: true, locked: false, color: "#ffffff" }],
      entities: [],
      modelSpace: { entityIds: [] },
    }),
    ["PIDISO"],
  );
  ok(
    dichos(vacio.effects).some((t) => /Un isométrico sale de una ruta con cota/.test(t)),
    `sin rutas se explica de dónde sale un isométrico: ${dichos(vacio.effects).join(" / ")}`,
  );

  // Una línea que SÓLO está en el P&ID: el esquema no está a escala, así que
  // un isométrico sacado de ahí sería un dibujo con medidas inventadas.
  const soloEsquema = conRuta({ line: LINEA, puntos: RUTA });
  const conPid = executeCadEntityCommandBatch(
    soloEsquema,
    [
      {
        type: "insert",
        entity: {
          id: "pid-1",
          type: "polyline",
          vertices: [
            { x: 0, y: 30_000, z: 0 },
            { x: 5_000, y: 30_000, z: 0 },
          ],
          closed: false,
          layer: "TU-PROC",
          context: { metadata: { [CAD_PL_LINE]: '8"-A-1001-CS150' } },
        } as never,
      },
    ],
    "PIDLINE",
  ).document;
  const sesion = run(conPid, ["PIDISO", '8"-A-1001-CS150']);
  ok(
    dichos(sesion.effects).some((t) => /sólo tiene el esquema del P&ID, que no está a escala/.test(t)),
    `y se dice por qué no se puede: ${dichos(sesion.effects).join(" / ")}`,
  );
  eq((sesion.document.paperSpaces ?? []).length, 0, "sin inventar una hoja");
}

console.log(
  `PIDISO tecleado: ${verdes} comprobaciones verdes — dibujo, lista de materiales y hoja en UN paso, la ventana encuadra el cuadro, el modelo no se toca y un esquema sin escala no da isométrico`,
);
