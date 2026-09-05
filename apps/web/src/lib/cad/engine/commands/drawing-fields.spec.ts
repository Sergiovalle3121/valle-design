/**
 * FIELD y UPDATEFIELD TECLEADOS.
 *
 * La resolución la mide `fields/drawing-fields.spec.ts`. Aquí se mide lo que
 * sólo se ve tecleando: que la palabra clave con ACENTO se reconozca —«Área» no
 * empieza por «a» para una tabla indexada por su inicial, y el prompt volvía a
 * preguntar sin decir por qué—, que el objeto ya designado no se vuelva a
 * pedir, que el campo nazca CON su valor puesto, y que actualizar sólo escriba
 * lo que cambió.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { CAD_FIELD_METADATA } from "../../fields/drawing-fields";
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

function documento(lado = 5_000): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 8, unit: "mm" },
    layers: [{ id: "0", name: "0", visible: true, locked: false, color: "#ffffff" }],
    entities: [
      {
        id: "sala",
        type: "polyline",
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: lado, y: 0, z: 0 },
          { x: lado, y: lado, z: 0 },
          { x: 0, y: lado, z: 0 },
        ],
        closed: true,
        layer: "0",
      },
    ],
    modelSpace: { entityIds: ["sala"] },
  } as never);
}

type Token = string | { punto: [number, number] };

function run(document: CadDocument, tokens: readonly Token[], seleccion: readonly string[] = []) {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  let current = document;
  for (const token of tokens) {
    const context: CadCommandContext = {
      entityIds: current.entities.map((entity) => entity.id),
      entity: (id) => current.entities.find((entity) => entity.id === id),
      layers: () => current.layers,
      selection: seleccion,
      activeLayer: "0",
      unit: current.meta.unit,
      drawingExtents: () => ({ minX: 0, minY: 0, maxX: 20_000, maxY: 20_000 }),
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `f-${(ids += 1)}`,
    };
    const reduction =
      typeof token === "object"
        ? cadCommandEngineReduce(
            state,
            {
              kind: "input",
              input: { kind: "point", point: { x: token.punto[0], y: token.punto[1] }, source: "typed" },
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
    ["FIELD", ["CAMPO"]],
    ["UPDATEFIELD", ["ACTUALIZARCAMPO"]],
  ] as const) {
    ok(registry.get(nombre), `${nombre} no está en el registro`);
    for (const a of alias) eq(registry.get(a)?.name, nombre, `el alias ${a} no lleva a ${nombre}`);
  }
}

// --- 2 · la palabra clave CON ACENTO se reconoce -------------------------
{
  // «Área» no empieza por «a» para una tabla indexada por la inicial: es el
  // defecto que este caso fija, y se descubrió tecleando la orden de verdad.
  const sesion = run(documento(), ["FIELD", "Área", { punto: [2_500, 2_500] }], ["sala"]);
  ok(
    dichos(sesion.effects).some((t) => /FIELD: Area = 25\.00 m²/.test(t)),
    `el campo nace con su valor: ${dichos(sesion.effects).join(" / ")}`,
  );
  const campo = sesion.document.entities.find((entidad) => entidad.type === "mtext");
  assert.ok(campo, "y el texto llegó al documento");
  verdes += 1;
  eq(campo!.context?.metadata?.[CAD_FIELD_METADATA], "%<Area:sala>%", "con su expresión en metadatos");
  eq((campo as { text: string }).text, "25.00 m²", "y el valor resuelto en el texto");

  // Y sin acento también, que es como se teclea rápido.
  const rapido = run(documento(), ["FIELD", "A", { punto: [1, 1] }], ["sala"]);
  ok(
    dichos(rapido.effects).some((t) => /FIELD: Area = 25\.00 m²/.test(t)),
    "la inicial sola vale igual",
  );
}

// --- 3 · el objeto designado no se vuelve a pedir ------------------------
{
  // Sin selección, la orden PIDE designar en vez de adivinar.
  const sinSeleccion = run(documento(), ["FIELD", "A"]);
  const prompts = sinSeleccion.effects.flatMap((effect) =>
    effect.kind === "prompt" ? [effect.prompt.message] : [],
  );
  ok(
    prompts.some((mensaje) => /Designe el objeto/.test(mensaje)),
    `sin designar, se pide: ${prompts.join(" / ")}`,
  );
}

// --- 4 · la fecha no pide objeto -----------------------------------------
{
  const sesion = run(documento(), ["FIELD", "Fecha", { punto: [0, 0] }]);
  ok(
    dichos(sesion.effects).some((t) => /FIELD: Fecha = \d{4}-\d{2}-\d{2}/.test(t)),
    `la fecha se coloca sin preguntar por ningún objeto: ${dichos(sesion.effects).join(" / ")}`,
  );
}

// --- 5 · UPDATEFIELD sólo escribe lo que cambió --------------------------
{
  const conCampo = run(documento(), ["FIELD", "A", { punto: [2_500, 2_500] }], ["sala"]).document;

  const alDia = run(conCampo, ["UPDATEFIELD"]);
  ok(
    dichos(alDia.effects).some((t) => /0 campo\(s\) actualizado\(s\).*1 ya al día/.test(t)),
    `nada que hacer se dice: ${dichos(alDia.effects).join(" / ")}`,
  );
  eq(
    JSON.stringify(alDia.document.entities),
    JSON.stringify(conCampo.entities),
    "y no se toca el documento: un paso de deshacer vacío rompe la confianza en Ctrl+Z",
  );

  // Alguien agranda la sala a 6 × 6.
  const agrandada = executeCadEntityCommandBatch(
    conCampo,
    [
      {
        type: "replace",
        entityId: "sala",
        entity: {
          ...(conCampo.entities.find((entidad) => entidad.id === "sala") as unknown as Record<
            string,
            unknown
          >),
          vertices: [
            { x: 0, y: 0, z: 0 },
            { x: 6_000, y: 0, z: 0 },
            { x: 6_000, y: 6_000, z: 0 },
            { x: 0, y: 6_000, z: 0 },
          ],
        } as never,
      },
    ],
    "STRETCH",
  ).document;
  const sesion = run(agrandada, ["UPDATEFIELD"]);
  ok(
    dichos(sesion.effects).some((t) => /1 campo\(s\) actualizado\(s\)/.test(t)),
    `el campo se entera: ${dichos(sesion.effects).join(" / ")}`,
  );
  const campo = sesion.document.entities.find((entidad) => entidad.type === "mtext");
  eq((campo as { text: string }).text, "36.00 m²", "y el texto dice el área nueva");
}

// --- 6 · el campo huérfano conserva su valor y se cuenta ------------------
{
  const conCampo = run(documento(), ["FIELD", "A", { punto: [2_500, 2_500] }], ["sala"]).document;
  const sinSala = executeCadEntityCommandBatch(conCampo, [{ type: "delete", entityId: "sala" }], "ERASE")
    .document;
  const sesion = run(sinSala, ["UPDATEFIELD"]);
  ok(
    dichos(sesion.effects).some((t) => /1 sin resolver \(conservan su último valor\)/.test(t)),
    `se cuenta y se dice: ${dichos(sesion.effects).join(" / ")}`,
  );
  const campo = sesion.document.entities.find((entidad) => entidad.type === "mtext");
  eq(
    (campo as { text: string }).text,
    "25.00 m²",
    "y sigue enseñando su último valor: un cero silencioso en una tabla de superficies se imprime",
  );
}

// --- 7 · sin campos, se dice; y con selección ajena, se dice OTRA cosa ----
{
  const vacio = run(documento(), ["UPDATEFIELD"]);
  ok(
    dichos(vacio.effects).some((t) => /No hay ningún campo en el dibujo/.test(t)),
    "sin campos se explica qué hacer, en vez de callarse",
  );

  // El defecto que este caso fija: con el local todavía designado —lo deja la
  // orden anterior— el mensaje «no hay ningún campo» era FALSO y mandaba a
  // colocar uno que ya existe.
  const conCampo = run(documento(), ["FIELD", "A", { punto: [2_500, 2_500] }], ["sala"]).document;
  const conSeleccionAjena = run(conCampo, ["UPDATEFIELD"], ["sala"]);
  ok(
    dichos(conSeleccionAjena.effects).some((t) =>
      /Ninguno de los 1 objeto\(s\) designados es un campo, y el dibujo tiene 1/.test(t),
    ),
    `se distingue de «no hay campos»: ${dichos(conSeleccionAjena.effects).join(" / ")}`,
  );
}

console.log(
  `FIELD/UPDATEFIELD tecleados: ${verdes} comprobaciones verdes — la palabra con acento se reconoce, el campo nace con su valor, sólo se reescribe lo que cambió y lo huérfano conserva el suyo`,
);
