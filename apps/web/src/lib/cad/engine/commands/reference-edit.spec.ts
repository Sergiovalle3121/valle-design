/**
 * REFEDIT, REFSET y REFCLOSE TECLEADOS: el bloque se edita en el dibujo.
 *
 * Lo que aquí se mide es lo que hace útil un editor en sitio: que la geometría
 * salga ENCIMA de la referencia designada —no en el origen del mundo—, que se
 * edite con las órdenes de siempre, que lo dibujado nuevo entre sólo si se dice
 * (REFSET), que guardar devuelva la geometría a coordenadas del BLOQUE y
 * regenere sus referencias, que descartar no toque la definición, y que dos
 * sesiones a la vez se nieguen en vez de mezclar dos bloques.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { CAD_REFEDIT_BLOCK } from "../../blocks/reference-edit";
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

/** Un dibujo con la definición del bloque «marca» y dos referencias suyas. */
function documento(rotacion = 0): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 8, unit: "mm" },
    layers: [{ id: "0", name: "0", visible: true, locked: false, color: "#ffffff" }],
    blocks: [
      {
        id: "marca",
        name: "Marca de nivel",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          {
            id: "m-1",
            type: "line",
            start: { x: 0, y: 0, z: 0 },
            end: { x: 100, y: 0, z: 0 },
            layer: "0",
          },
          {
            id: "m-2",
            type: "circle",
            center: { x: 50, y: 0, z: 0 },
            radius: 20,
            layer: "0",
          },
        ],
        attributes: { NIVEL: { defaultValue: "+0.00", prompt: "Nivel" } },
        version: 1,
      },
    ],
    entities: [
      {
        id: "ref-a",
        type: "insert",
        block: "marca",
        insertion: { x: 5_000, y: 2_000, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: rotacion,
        layer: "0",
        attributes: { NIVEL: "+3.20" },
      },
      {
        id: "ref-b",
        type: "insert",
        block: "marca",
        insertion: { x: 9_000, y: 2_000, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "0",
        attributes: { NIVEL: "+6.40" },
      },
    ],
    modelSpace: { entityIds: ["ref-a", "ref-b"] },
  } as never);
}

type Token = string | { designa: string };

function run(document: CadDocument, tokens: readonly Token[], seleccion: readonly string[] = []) {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  let current = document;
  for (const token of tokens) {
    const context: CadCommandContext = {
      entityIds: current.entities.map((entity) => entity.id),
      entity: (id) => current.entities.find((entity) => entity.id === id),
      layers: () => current.layers,
      blocks: () => current.blocks ?? [],
      selection: seleccion,
      activeLayer: "0",
      unit: current.meta.unit,
      drawingExtents: () => ({ minX: 0, minY: 0, maxX: 20_000, maxY: 20_000 }),
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `re-${(ids += 1)}`,
    };
    const reduction =
      typeof token === "object"
        ? cadCommandEngineReduce(
            state,
            { kind: "input", input: { kind: "entityPick", entityId: token.designa, point: { x: 0, y: 0 } } },
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

const copia = (document: CadDocument) =>
  document.entities.filter((entidad) => entidad.context?.metadata?.[CAD_REFEDIT_BLOCK] === "marca");

// --- 1 · en el registro, con los nombres de AutoCAD ----------------------
{
  for (const [nombre, alias] of [
    ["REFEDIT", ["EDITARREF"]],
    ["REFSET", ["CONJUNTOREF"]],
    ["REFCLOSE", ["CERRARREF"]],
  ] as const) {
    ok(registry.get(nombre), `${nombre} no está en el registro`);
    for (const a of alias) eq(registry.get(a)?.name, nombre, `el alias ${a} no lleva a ${nombre}`);
  }
}

// --- 2 · la geometría sale ENCIMA de la referencia designada -------------
let dibujo = documento();
{
  const antes = pasos;
  const sesion = run(dibujo, ["REFEDIT", { designa: "ref-a" }]);
  dibujo = sesion.document;
  eq(pasos - antes, 1, "un paso de deshacer");
  const trabajo = copia(dibujo);
  eq(trabajo.length, 2, "las dos entidades del bloque salieron al dibujo");
  const recta = trabajo.find((entidad) => entidad.type === "line") as Extract<
    CadDocument["entities"][number],
    { type: "line" }
  >;
  eq(recta.start.x, 5_000, "trasladada al punto de inserción de la referencia, no al origen");
  eq(recta.end.x, 5_100, "y con su longitud intacta");
  ok(
    dichos(sesion.effects).some((t) => /REFEDIT: «Marca de nivel» abierto en sitio con 2 objeto/.test(t)),
    `y se dice qué se abrió: ${dichos(sesion.effects).join(" / ")}`,
  );

  const otra = run(dibujo, ["REFEDIT", { designa: "ref-b" }]);
  ok(
    dichos(otra.effects).some((t) => /ya hay una edición abierta de «marca»/.test(t)),
    "abrir una segunda edición del mismo bloque se niega con motivo",
  );
}

// --- 3 · se edita con las órdenes de siempre, y REFSET añade lo nuevo -----
{
  // Se mueve la línea con el ejecutor real, como haría MOVE.
  const recta = copia(dibujo).find((entidad) => entidad.type === "line")!;
  dibujo = executeCadEntityCommandBatch(
    dibujo,
    [{ type: "transform", entityId: recta.id, transform: { translation: { x: 0, y: 300 } } }],
    "MOVE",
  ).document;

  // Y se dibuja algo NUEVO, que todavía no es del bloque.
  dibujo = executeCadEntityCommandBatch(
    dibujo,
    [
      {
        type: "insert",
        entity: {
          id: "nueva",
          type: "line",
          start: { x: 5_000, y: 600, z: 0 },
          end: { x: 5_100, y: 600, z: 0 },
          layer: "0",
        } as never,
      },
    ],
    "LINE",
  ).document;
  eq(copia(dibujo).length, 2, "lo dibujado nuevo NO entra solo en la edición");

  const añadida = run(dibujo, ["REFSET", "\r"], ["nueva"]);
  dibujo = añadida.document;
  eq(copia(dibujo).length, 3, "REFSET Añadir lo mete");
  ok(
    dichos(añadida.effects).some((t) => /REFSET: 1 objeto\(s\) añadidos/.test(t)),
    `y lo dice: ${dichos(añadida.effects).join(" / ")}`,
  );

  const quitada = run(dibujo, ["REFSET", "Quitar"], ["nueva"]);
  eq(copia(quitada.document).length, 2, "REFSET Quitar la saca sin borrarla del dibujo");
  ok(
    quitada.document.entities.some((entidad) => entidad.id === "nueva"),
    "la entidad sigue en el dibujo: quitarla de la edición no es borrarla",
  );
}

// --- 4 · guardar devuelve a coordenadas del BLOQUE y limpia --------------
{
  const antes = pasos;
  const sesion = run(dibujo, ["REFCLOSE", "Guardar"]);
  eq(pasos - antes, 1, "redefinir y limpiar son UN paso de deshacer");
  const guardado = sesion.document;
  eq(copia(guardado).length, 0, "la copia de trabajo se borró del dibujo");

  const definicion = (guardado.blocks ?? []).find((bloque) => bloque.id === "marca")!;
  eq(definicion.entities.length, 3, "el bloque quedó con las tres: dos suyas y la añadida");
  const recta = definicion.entities.find(
    (entidad) => entidad.type === "line" && entidad.id === "m-1",
  ) as Extract<CadDocument["entities"][number], { type: "line" }>;
  eq(recta.start.x, 0, "devuelta a coordenadas del BLOQUE: el punto base vuelve a estar en 0");
  eq(recta.start.y, 300, "conservando la edición: la línea subió 300");
  ok(
    definicion.entities.every((entidad) => !entidad.context?.metadata?.[CAD_REFEDIT_BLOCK]),
    "y sin las marcas de la sesión dentro de la definición",
  );
  eq(
    definicion.attributes?.NIVEL?.defaultValue,
    "+0.00",
    "los ATRIBUTOS de la definición se conservan: eso es lo que explotar perdía",
  );
  const referencia = guardado.entities.find((entidad) => entidad.id === "ref-b");
  eq(
    (referencia as { attributes?: Record<string, string> }).attributes?.NIVEL,
    "+6.40",
    "y el valor que cada referencia tenía escrito sigue ahí",
  );
  ok(
    dichos(sesion.effects).some((t) => /REFCLOSE: «marca» redefinido con 3 objeto/.test(t)),
    `y se dice: ${dichos(sesion.effects).join(" / ")}`,
  );
  dibujo = guardado;
}

// --- 5 · descartar no toca la definición ---------------------------------
{
  const abierta = run(dibujo, ["REFEDIT", { designa: "ref-a" }]).document;
  const antes = JSON.stringify((abierta.blocks ?? []).find((bloque) => bloque.id === "marca"));
  const sesion = run(abierta, ["REFCLOSE", "Descartar"]);
  eq(copia(sesion.document).length, 0, "la copia de trabajo se fue");
  eq(
    JSON.stringify((sesion.document.blocks ?? []).find((bloque) => bloque.id === "marca")),
    antes,
    "y la definición quedó EXACTAMENTE como estaba",
  );
  ok(
    dichos(sesion.effects).some((t) => /descartada\. La definición no se tocó/.test(t)),
    "y se dice",
  );
}

// --- 6 · las negativas, con motivo ---------------------------------------
{
  const girada = run(documento(45), ["REFEDIT", { designa: "ref-a" }]);
  ok(
    dichos(girada.effects).some((t) => /está girada 45°/.test(t) && /Todavía no/.test(t)),
    `una referencia girada se niega POR SU NOMBRE: ${dichos(girada.effects).join(" / ")}`,
  );
  eq(copia(girada.document).length, 0, "y no se escribe nada");

  const sinSesion = run(documento(), ["REFCLOSE"]);
  ok(
    dichos(sinSesion.effects).some((t) => /no hay ninguna edición de referencia abierta/.test(t)),
    "cerrar sin abrir se dice",
  );

  const noEsBloque = executeCadEntityCommandBatch(
    documento(),
    [
      {
        type: "insert",
        entity: {
          id: "suelta",
          type: "line",
          start: { x: 0, y: 0, z: 0 },
          end: { x: 10, y: 0, z: 0 },
          layer: "0",
        } as never,
      },
    ],
    "LINE",
  ).document;
  const designadaSuelta = run(noEsBloque, ["REFEDIT", { designa: "suelta" }]);
  ok(
    dichos(designadaSuelta.effects).some((t) => /LINE no es una referencia de bloque/.test(t)),
    "designar una línea se niega con motivo",
  );
}

console.log(
  `REFEDIT/REFSET/REFCLOSE tecleados: ${verdes} comprobaciones verdes — la geometría sale encima de la referencia, lo nuevo entra sólo si se dice, guardar devuelve a coordenadas del bloque conservando los atributos y descartar no toca la definición`,
);
