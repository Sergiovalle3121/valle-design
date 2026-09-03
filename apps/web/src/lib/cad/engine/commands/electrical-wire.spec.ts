/**
 * AEWIRE y AEWIRELIST TECLEADOS, y aplicados.
 *
 * Que `wire-numbering.ts` numere bien ya lo mide su propia spec. Lo que se
 * comprueba aquí es lo otro, que es lo que separa una capacidad de una
 * biblioteca: que las dos órdenes están en el registro, que se escriben con las
 * manos, que lo que emiten lo escribe el ejecutor por lotes y que el número
 * asignado LLEGA AL DOCUMENTO y se dice en el renglón.
 *
 * La regla de la casa detrás de este archivo: un módulo que nadie importa no
 * cuenta como implementado. Aquí es donde el conductor deja de ser un módulo.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import {
  CAD_IE_CIRCUIT,
  CAD_IE_GAUGE,
  CAD_IE_NUMBER,
  CAD_IE_WIRE_LAYER,
} from "../../electrical/wire-numbering";
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

/** Teclea una secuencia y APLICA lo que salga, igual que hace el anfitrión. */
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
      drawingExtents: () => ({ minX: 0, minY: 0, maxX: 10_000, maxY: 10_000 }),
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `ie-${(ids += 1)}`,
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
          ? cadCommandEngineReduce(
              state,
              { kind: "input", input: { kind: "enter" } },
              context,
              registry,
            )
          : cadCommandEngineReduce(state, { kind: "token", value: token }, context, registry);
    state = reduction.state;
    effects.push(...reduction.effects);
    for (const effect of reduction.effects)
      if (effect.kind === "execute")
        current = executeCadEntityCommandBatch(current, effect.commands, effect.label).document;
  }
  return { effects, document: current };
}

// El `notice` de un resultado `document` llega como efecto de MENSAJE, que es
// justo lo que la ola anterior arregló en FLATSHOT: sin él, una orden que
// escribe es muda.
const dichos = (effects: readonly CadCommandEffect[]) =>
  effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : []));

// --- 1 · las dos órdenes están en el registro, con sus alias ---------------
{
  for (const [nombre, alias] of [
    ["AEWIRE", ["CONDUCTOR", "WIRENUMBER"]],
    ["AEWIRELIST", ["LISTACONDUCTORES"]],
  ] as const) {
    ok(registry.get(nombre), `${nombre} no está en el registro`);
    for (const a of alias)
      eq(registry.get(a)?.name, nombre, `el alias ${a} no lleva a ${nombre}`);
  }
}

// --- 2 · un conductor tecleado llega al documento con su número ------------
let dibujo = documento();
{
  const sesion = run(dibujo, [
    "AEWIRE",
    "C-1",
    "12",
    { punto: [0, 0] },
    { punto: [2_000, 0] },
    { punto: [2_000, 1_500] },
    "\r",
  ]);
  dibujo = sesion.document;

  const conductores = dibujo.entities.filter(
    (entity) => entity.context?.metadata?.[CAD_IE_CIRCUIT],
  );
  eq(conductores.length, 1, "el conductor tecleado llegó al documento");
  const uno = conductores[0];
  eq(uno.type, "polyline", "y es una polilínea: nada de entidad nueva");
  eq(uno.layer, CAD_IE_WIRE_LAYER, "en la capa del circuito");
  eq(uno.context!.metadata![CAD_IE_CIRCUIT], "C-1", "con su circuito");
  eq(uno.context!.metadata![CAD_IE_NUMBER], "1", "y el primer número del circuito");
  eq(uno.context!.metadata![CAD_IE_GAUGE], "12", "y su calibre");
  ok(
    dibujo.layers.some((layer) => layer.name === CAD_IE_WIRE_LAYER),
    "la capa del circuito se dio de alta sola",
  );

  // La orden DICE el número que puso: sin eso, lo único que aporta es invisible.
  ok(
    dichos(sesion.effects).some((texto) => /AEWIRE: conductor C-1-1.*calibre 12/.test(texto)),
    `el renglón tiene que decir el número asignado: ${dichos(sesion.effects).join(" / ")}`,
  );
}

// --- 3 · el siguiente conductor del mismo circuito continúa la cuenta ------
{
  const sesion = run(dibujo, [
    "AEWIRE",
    "C-1",
    "\r",
    { punto: [0, 3_000] },
    { punto: [2_000, 3_000] },
    "\r",
  ]);
  dibujo = sesion.document;
  const numeros = dibujo.entities
    .filter((entity) => entity.context?.metadata?.[CAD_IE_CIRCUIT] === "C-1")
    .map((entity) => entity.context!.metadata![CAD_IE_NUMBER]);
  assert.deepEqual(numeros.sort(), ["1", "2"], "el segundo conductor es el 2, no otro 1");
  verdes += 1;

  // Intro en el calibre deja el conductor SIN calibre anotado, no con uno
  // supuesto: un calibre inventado es lo que hace que un plano se compre mal.
  const segundo = dibujo.entities.find(
    (entity) => entity.context?.metadata?.[CAD_IE_NUMBER] === "2",
  );
  eq(
    segundo!.context!.metadata![CAD_IE_GAUGE],
    undefined,
    "sin calibre tecleado, no se anota ninguno",
  );
}

// --- 4 · AEWIRELIST lista, caza repetidos y NO escribe ---------------------
{
  const antes = dibujo.entities.length;
  const sesion = run(dibujo, ["AEWIRELIST"]);
  eq(sesion.document.entities.length, antes, "AEWIRELIST no escribe nada en el dibujo");
  const texto = dichos(sesion.effects).join(" ");
  ok(/2 conductor\(es\)/.test(texto), `debería contar los dos: ${texto}`);
  ok(/C-1: 1, 2/.test(texto), `y listarlos por circuito: ${texto}`);
  ok(!/REPETIDOS/.test(texto), "y no inventar repetidos donde no los hay");
}

// --- 5 · un repetido que entró por copiar y pegar SE CAZA -----------------
{
  // El clásico: se copia el conductor con COPY y el número viaja con él.
  const original = dibujo.entities.find(
    (entity) => entity.context?.metadata?.[CAD_IE_NUMBER] === "1",
  );
  assert.ok(original, "hace falta el conductor 1 para copiarlo");
  const copiado = executeCadEntityCommandBatch(
    dibujo,
    [{ type: "insert", entity: { ...original, id: "copia" } as never }],
    "COPY",
  ).document;

  const sesion = run(copiado, ["AEWIRELIST"]);
  const texto = dichos(sesion.effects).join(" ");
  ok(/REPETIDOS: C-1-1/.test(texto), `el número repetido tiene que salir: ${texto}`);
  ok(/copia/.test(texto), `y con quién lo repite: ${texto}`);

  // Y AEWIRE avisa ANTES de escribir, que es cuando sirve.
  const siguiente = run(copiado, [
    "AEWIRE",
    "C-1",
    "\r",
    { punto: [0, 6_000] },
    { punto: [1_000, 6_000] },
    "\r",
  ]);
  ok(
    dichos(siguiente.effects).some((t) => /OJO: en C-1 ya se repite el número 1/.test(t)),
    `AEWIRE debería avisar del repetido: ${dichos(siguiente.effects).join(" / ")}`,
  );
}

// --- 6 · las negativas, con motivo ----------------------------------------
{
  const sinCircuito = run(documento(), ["AEWIRE", "\r"]);
  ok(
    dichos(sinCircuito.effects).some((t) => /necesita el circuito/.test(t)),
    `sin circuito hay que decirlo: ${dichos(sinCircuito.effects).join(" / ")}`,
  );

  const unPunto = run(documento(), ["AEWIRE", "C-1", "\r", { punto: [0, 0] }, "\r"]);
  ok(
    dichos(unPunto.effects).some((t) => /al menos dos puntos/.test(t)),
    `un solo punto no es un conductor: ${dichos(unPunto.effects).join(" / ")}`,
  );
  eq(
    unPunto.document.entities.length,
    0,
    "y no se escribe nada: un conductor a medias es peor que ninguno",
  );

  const vacio = run(documento(), ["AEWIRELIST"]);
  ok(
    dichos(vacio.effects).some((t) => /No hay ningún conductor numerado/.test(t)),
    `sin conductores hay que decirlo: ${dichos(vacio.effects).join(" / ")}`,
  );
}

console.log(
  `AEWIRE/AEWIRELIST tecleados: ${verdes} comprobaciones verdes — el número lo pone el dibujo, la capa se da de alta sola, el repetido se caza y las negativas llevan motivo`,
);
