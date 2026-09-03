/**
 * PIDLINE y PIDLIST TECLEADOS: la línea de proceso deja de ser una raya.
 *
 * Que el número de línea se lea y se valide bien ya lo mide
 * `plant/line-numbers.spec.ts`. Aquí se comprueba lo que convierte una
 * biblioteca en una capacidad: que las dos órdenes están en el registro, que lo
 * que emiten lo escribe el ejecutor por lotes, que el correlativo lo pone el
 * DIBUJO, y que `PIDLIST` da el metrado con la longitud del plano —que es lo
 * que un P&ID de AutoCAD no puede dar, porque no está a escala— y los errores
 * que no piden el catálogo de nadie.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { CAD_PL_LINE, CAD_PL_LINE_LAYER, CAD_PL_SPEC } from "../../plant/line-numbers";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
} from "../command-engine";
import type { CadCommandContext } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";

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

function documento(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 8, unit: "mm" },
    layers: [{ id: "0", name: "0", visible: true, locked: false, color: "#ffffff" }],
    entities: [],
    modelSpace: { entityIds: [] },
  });
}

type Token = string | { punto: [number, number] };
let ids = 0;

function run(document: CadDocument, tokens: readonly Token[]) {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  let current = document;
  for (const token of tokens) {
    const context: CadCommandContext = {
      entityIds: current.entities.map((entity) => entity.id),
      entity: (id) => current.entities.find((entity) => entity.id === id),
      layers: () => current.layers,
      selection: [],
      activeLayer: "0",
      unit: current.meta.unit,
      drawingExtents: () => ({ minX: 0, minY: 0, maxX: 60_000, maxY: 60_000 }),
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `pl-${(ids += 1)}`,
    };
    const reduction =
      typeof token !== "string"
        ? cadCommandEngineReduce(
            state,
            {
              kind: "input",
              input: {
                kind: "point",
                point: { x: token.punto[0], y: token.punto[1] },
                source: "typed",
              },
            },
            context,
            registry,
          )
        : token === "\r"
          ? cadCommandEngineReduce(state, { kind: "input", input: { kind: "enter" } }, context, registry)
          : cadCommandEngineReduce(state, { kind: "token", value: token }, context, registry);
    state = reduction.state;
    effects.push(...reduction.effects);
    for (const effect of reduction.effects)
      if (effect.kind === "execute")
        current = executeCadEntityCommandBatch(current, effect.commands, effect.label).document;
  }
  return { effects, document: current };
}

const dichos = (effects: readonly CadCommandEffect[]) =>
  effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : []));

// --- 1 · en el registro, con sus alias ------------------------------------
{
  for (const [nombre, alias] of [
    ["PIDLINE", ["LINEAPROCESO", "LINENUMBER"]],
    ["PIDLIST", ["LISTALINEAS", "PLANTDATAMANAGER"]],
  ] as const) {
    ok(registry.get(nombre), `${nombre} no está en el registro`);
    for (const a of alias)
      eq(registry.get(a)?.name, nombre, `el alias ${a} no lleva a ${nombre}`);
  }
}

// --- 2 · una línea tecleada llega al documento con su número --------------
let dibujo = documento();
{
  const sesion = run(dibujo, [
    "PIDLINE", '6"', "P", "CS150",
    { punto: [0, 0] }, { punto: [12_000, 0] }, "\r",
  ]);
  dibujo = sesion.document;
  const lineas = dibujo.entities.filter((entity) => entity.context?.metadata?.[CAD_PL_LINE]);
  eq(lineas.length, 1, "la línea tecleada llegó al documento");
  eq(lineas[0].type, "polyline", "y es una polilínea: ningún tipo de entidad nuevo");
  eq(lineas[0].layer, CAD_PL_LINE_LAYER, "en la capa de proceso");
  eq(
    lineas[0].context!.metadata![CAD_PL_LINE],
    '6"-P-1001-CS150',
    "con el número compuesto y el correlativo arrancando en 1001",
  );
  eq(lineas[0].context!.metadata![CAD_PL_SPEC], "CS150", "y su especificación");
  ok(
    dibujo.layers.some((capa) => capa.name === CAD_PL_LINE_LAYER),
    "la capa se dio de alta sola",
  );
  ok(
    dichos(sesion.effects).some((t) => /PIDLINE: 6"-P-1001-CS150/.test(t)),
    `y la orden dice el número que puso: ${dichos(sesion.effects).join(" / ")}`,
  );
}

// --- 3 · la siguiente del mismo servicio continúa la cuenta ---------------
{
  const sesion = run(dibujo, [
    "PIDLINE", '4"', "P", "CS150",
    { punto: [0, 5_000] }, { punto: [8_000, 5_000] }, "\r",
  ]);
  dibujo = sesion.document;
  const numeros = dibujo.entities
    .map((entity) => entity.context?.metadata?.[CAD_PL_LINE])
    .filter((valor): valor is string => typeof valor === "string")
    .sort();
  assert.deepEqual(
    numeros,
    ['4"-P-1002-CS150', '6"-P-1001-CS150'],
    "la segunda es la 1002, no otra 1001",
  );
  verdes += 1;
}

// --- 4 · PIDLIST da el METRADO con la longitud del plano -----------------
{
  const antes = dibujo.entities.length;
  const sesion = run(dibujo, ["PIDLIST"]);
  eq(sesion.document.entities.length, antes, "PIDLIST no escribe nada");
  const texto = dichos(sesion.effects).join(" ");
  ok(/2 línea\(s\)/.test(texto), `cuenta las dos: ${texto}`);
  // 12.000 y 8.000 unidades de un dibujo en milímetros son 12 y 8 metros. Un
  // P&ID de AutoCAD no está a escala y no puede dar esto.
  ok(/6"-P-1001-CS150 \(12\.0 m\)/.test(texto), `con el metrado de la primera: ${texto}`);
  ok(/4"-P-1002-CS150 \(8\.0 m\)/.test(texto), `y de la segunda: ${texto}`);
  ok(/sin hallazgos/.test(texto), `y sin inventar errores: ${texto}`);
  ok(
    /NO se comprueba contra el catálogo del proyecto/.test(texto),
    `el límite va en el renglón: ${texto}`,
  );
}

// --- 5 · el servicio con DOS especificaciones se caza al listar -----------
{
  const conError = run(dibujo, [
    "PIDLINE", '2"', "P", "SS300",
    { punto: [0, 9_000] }, { punto: [3_000, 9_000] }, "\r",
  ]).document;
  const texto = dichos(run(conError, ["PIDLIST"]).effects).join(" ");
  ok(
    /DOS ESPECIFICACIONES: el servicio P usa CS150 y SS300/.test(texto),
    `un servicio con dos especificaciones es un error de proyecto: ${texto}`,
  );
}

// --- 6 · un diámetro que no se compra, cazado antes de la requisición ----
{
  const raro = run(documento(), [
    "PIDLINE", '5"', "P", "CS150",
    { punto: [0, 0] }, { punto: [2_000, 0] }, "\r",
  ]).document;
  const texto = dichos(run(raro, ["PIDLIST"]).effects).join(" ");
  ok(/DIÁMETRO NO COMERCIAL/.test(texto), `un 5" no se compra: ${texto}`);
}

// --- 7 · las negativas, con motivo ---------------------------------------
{
  const sinDiametro = run(documento(), ["PIDLINE", "\r"]);
  ok(
    dichos(sinDiametro.effects).some((t) => /necesita el diámetro nominal/.test(t)),
    `sin diámetro se dice: ${dichos(sinDiametro.effects).join(" / ")}`,
  );

  const unPunto = run(documento(), [
    "PIDLINE", '6"', "P", "CS150", { punto: [0, 0] }, "\r",
  ]);
  ok(
    dichos(unPunto.effects).some((t) => /al menos dos puntos/.test(t)),
    "un solo punto no es una línea",
  );
  eq(unPunto.document.entities.length, 0, "y no se escribe nada");

  // Un diámetro sin comilla no compone un número válido: la orden lo dice ANTES
  // de dibujar, en vez de dejar una línea con un nombre que la lista no lee.
  const sinComilla = run(documento(), [
    "PIDLINE", "6", "P", "CS150", { punto: [0, 0] }, { punto: [1_000, 0] }, "\r",
  ]);
  ok(
    dichos(sinComilla.effects).some((t) => /no es un número de línea válido/.test(t)),
    `un diámetro sin comilla se rechaza con motivo: ${dichos(sinComilla.effects).join(" / ")}`,
  );
  eq(sinComilla.document.entities.length, 0, "y tampoco se escribe nada");

  const vacio = run(documento(), ["PIDLIST"]);
  ok(
    dichos(vacio.effects).some((t) => /No hay ninguna línea de proceso/.test(t)),
    "sin líneas hay que decirlo",
  );
}

console.log(
  `PIDLINE/PIDLIST tecleados: ${verdes} comprobaciones verdes — el correlativo lo pone el dibujo, el metrado sale del plano y los errores se cazan sin el catálogo de nadie`,
);
