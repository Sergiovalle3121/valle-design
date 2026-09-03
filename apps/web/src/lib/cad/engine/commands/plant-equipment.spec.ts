/**
 * PIDEQUIP TECLEADO: el equipo nace CON su etiqueta.
 *
 * Un P&ID con líneas y sin equipos no es un P&ID: es un mapa de tuberías que no
 * llegan a ninguna parte. Aquí se comprueba que el catálogo de equipos existe de
 * verdad —seis símbolos dibujados desde primitivas, no de la biblioteca de
 * nadie—, que colocar y etiquetar son UN acto y un paso de deshacer, que el
 * correlativo lo pone el DIBUJO arrancando en 101 como manda la convención de
 * planta, y que un equipo sin etiqueta se cuenta en vez de desaparecer del
 * proyecto.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import {
  CAD_PL_TAG,
  cadFormatEquipmentTag,
  cadParseEquipmentTag,
} from "../../plant/equipment-tags";
import { CAD_PID_SYMBOLS, CAD_PL_EQUIP_LAYER } from "../../plant/pid-symbols";
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
let pasos = 0;

function run(document: CadDocument, tokens: readonly Token[]) {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  let current = document;
  for (const token of tokens) {
    const context: CadCommandContext = {
      entityIds: current.entities.map((entity) => entity.id),
      entity: (id) => current.entities.find((entity) => entity.id === id),
      layers: () => current.layers,
      blocks: () => current.blocks ?? [],
      selection: [],
      activeLayer: "0",
      unit: current.meta.unit,
      drawingExtents: () => ({ minX: 0, minY: 0, maxX: 60_000, maxY: 60_000 }),
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `eq-${(ids += 1)}`,
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
      if (effect.kind === "execute") {
        pasos += 1;
        current = executeCadEntityCommandBatch(current, effect.commands, effect.label).document;
      }
  }
  return { effects, document: current };
}

const dichos = (effects: readonly CadCommandEffect[]) =>
  effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : []));

const etiquetas = (document: CadDocument) =>
  document.entities
    .flatMap((entity) => (entity.type === "insert" ? [entity.attributes?.[CAD_PL_TAG]] : []))
    .filter((valor): valor is string => typeof valor === "string")
    .sort();

// --- 1 · el catálogo existe, y se dice cuántos son ------------------------
{
  eq(CAD_PID_SYMBOLS.length, 6, "seis símbolos: se dice el número en vez de prometer «todos»");
  const prefijos = CAD_PID_SYMBOLS.map((simbolo) => simbolo.prefix);
  for (const esperado of ["V", "P", "E", "TK", "K", "TI"])
    ok(prefijos.includes(esperado), `el prefijo ${esperado} está en el catálogo`);
  ok(
    CAD_PID_SYMBOLS.every((simbolo) => simbolo.entities(simbolo.id).length > 0),
    "y cada símbolo tiene geometría de verdad, no un rectángulo con nombre",
  );
}

// --- 1b · la etiqueta se lee como la teclea un proyectista ----------------
{
  assert.deepEqual(cadParseEquipmentTag("P-101"), { prefix: "P", number: 101 }, "la forma canónica");
  assert.deepEqual(cadParseEquipmentTag("p101"), { prefix: "P", number: 101 }, "sin guion y en minúscula, que es como se teclea rápido");
  assert.deepEqual(cadParseEquipmentTag(" ti-1001 "), { prefix: "TI", number: 1_001 }, "un instrumento, con espacios");
  verdes += 3;
  eq(cadParseEquipmentTag("P-0"), null, "el cero no es un correlativo");
  eq(cadParseEquipmentTag("BOMBA-101"), null, "el prefijo son una a tres letras");
  eq(cadFormatEquipmentTag("p", 101), "P-101", "y se escribe con guion y en mayúscula, como se rotula");
}

// --- 2 · en el registro, con sus alias ------------------------------------
{
  for (const [nombre, alias] of [
    ["PIDEQUIP", ["EQUIPO", "EQUIPMENT"]],
    ["PIDEQUIPLIST", ["LISTAEQUIPOS"]],
  ] as const) {
    ok(registry.get(nombre), `${nombre} no está en el registro`);
    for (const a of alias)
      eq(registry.get(a)?.name, nombre, `el alias ${a} no lleva a ${nombre}`);
  }
}

// --- 3 · colocar y etiquetar son UN acto ---------------------------------
let dibujo = documento();
{
  const antes = pasos;
  const sesion = run(dibujo, ["PIDEQUIP", "B", "\r", { punto: [5_000, 5_000] }]);
  dibujo = sesion.document;
  eq(pasos - antes, 1, "un solo paso de deshacer: el equipo nace con nombre");

  assert.deepEqual(etiquetas(dibujo), ["P-101"], "la bomba sale P-101, no sin etiqueta");
  verdes += 1;
  const insercion = dibujo.entities.find((entity) => entity.type === "insert");
  eq(insercion!.layer, CAD_PL_EQUIP_LAYER, "en la capa de equipos");
  ok(
    (dibujo.blocks ?? []).some((bloque) => bloque.id === "PID-BOMBA"),
    "y el bloque quedó definido en el dibujo",
  );
  ok(
    dichos(sesion.effects).some((t) => /PIDEQUIP: Bomba centrífuga P-101/.test(t)),
    `y la orden lo dice: ${dichos(sesion.effects).join(" / ")}`,
  );
}

// --- 4 · el correlativo continúa, y cada prefijo lleva el suyo ------------
{
  dibujo = run(dibujo, ["PIDEQUIP", "B", "\r", { punto: [9_000, 5_000] }]).document;
  dibujo = run(dibujo, ["PIDEQUIP", "V", "\r", { punto: [5_000, 9_000] }]).document;
  assert.deepEqual(
    etiquetas(dibujo),
    ["P-101", "P-102", "V-101"],
    "la segunda bomba es la 102 y la vasija arranca su propia cuenta en 101",
  );
  verdes += 1;
}

// --- 5 · el prefijo lo decide el proyecto, no el programa ----------------
{
  // Una ingeniería que llama `BA` a sus bombas puede hacerlo.
  const suyo = run(dibujo, ["PIDEQUIP", "B", "BA", { punto: [12_000, 5_000] }]).document;
  ok(etiquetas(suyo).includes("BA-101"), `se admite el prefijo del proyecto: ${etiquetas(suyo).join(", ")}`);

  const raro = run(dibujo, ["PIDEQUIP", "B", "BOMBAS", { punto: [12_000, 9_000] }]);
  ok(
    dichos(raro.effects).some((t) => /no es un prefijo de etiqueta/.test(t)),
    `pero uno de seis letras se rechaza con motivo: ${dichos(raro.effects).join(" / ")}`,
  );
  eq(raro.document.entities.length, dibujo.entities.length, "y no se escribe nada");
}

// --- 6 · PIDEQUIPLIST cuenta, caza repetidas y no escribe ----------------
{
  const antes = dibujo.entities.length;
  const sesion = run(dibujo, ["PIDEQUIPLIST"]);
  eq(sesion.document.entities.length, antes, "PIDEQUIPLIST no escribe nada");
  const texto = dichos(sesion.effects).join(" ");
  ok(/3 equipo\(s\): P-101, P-102, V-101/.test(texto), `los lista: ${texto}`);
  ok(!/REPETIDAS/.test(texto), "y no inventa repetidas donde no las hay");

  // Se copia un equipo con el ejecutor real: la etiqueta viaja con él.
  const original = dibujo.entities.find(
    (entity) => entity.type === "insert" && entity.attributes?.[CAD_PL_TAG] === "P-101",
  );
  assert.ok(original, "hace falta el P-101 para copiarlo");
  const copiado = executeCadEntityCommandBatch(
    dibujo,
    [{ type: "insert", entity: { ...original, id: "copia" } as never }],
    "COPY",
  ).document;
  const conChoque = dichos(run(copiado, ["PIDEQUIPLIST"]).effects).join(" ");
  ok(/REPETIDAS: P-101/.test(conChoque), `la repetida se caza: ${conChoque}`);
}

// --- 7 · un equipo SIN etiqueta se cuenta, no desaparece -----------------
{
  const pelado = executeCadEntityCommandBatch(
    documento(),
    [
      {
        type: "insert",
        entity: {
          id: "sin-nombre",
          type: "insert",
          block: "PID-TANQUE",
          insertion: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          rotation: 0,
          layer: CAD_PL_EQUIP_LAYER,
        } as never,
      },
    ],
    "INSERT",
  ).document;
  const texto = dichos(run(pelado, ["PIDEQUIPLIST"]).effects).join(" ");
  ok(
    /1 sin etiqueta: sin-nombre/.test(texto),
    `un equipo sin etiqueta no sale en la requisición: por eso se cuenta — ${texto}`,
  );

  const vacio = dichos(run(documento(), ["PIDEQUIPLIST"]).effects).join(" ");
  ok(/No hay ningún equipo de proceso/.test(vacio), "y sin equipos se dice, en vez de callarse");
}

console.log(
  `PIDEQUIP/PIDEQUIPLIST tecleados: ${verdes} comprobaciones verdes — el equipo nace con su etiqueta en un paso, el correlativo arranca en 101 y lo que no lleva nombre se cuenta`,
);
