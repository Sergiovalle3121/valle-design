/**
 * AETAG y AETAGLIST TECLEADOS: sesenta luminarias etiquetadas en un solo paso.
 *
 * Que el reparto de números sea correcto ya lo mide `device-tags.spec.ts`. Aquí
 * se comprueba lo que convierte una biblioteca en una capacidad: que las
 * órdenes están en el registro, que `AETAG Todos` escribe los ATRIBUTOS de
 * todos los componentes pelados en UN lote —un paso de deshacer, no sesenta—,
 * que la familia se deduce del símbolo y no se pregunta lo obvio, y que lo que
 * no se puede deducir se deja SIN TOCAR y se dice.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { CAD_IE_TAG } from "../../electrical/device-tags";
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

const componente = (id: string, block: string, tag?: string): CadEntity =>
  ({
    id,
    type: "insert",
    block,
    insertion: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    layer: "IE-ALU",
    ...(tag ? { attributes: { [CAD_IE_TAG]: tag } } : {}),
  }) as unknown as CadEntity;

function documento(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 8, unit: "mm" },
    layers: [{ id: "0", name: "0", visible: true, locked: false, color: "#ffffff" }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

type Token = string | { designa: string };
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
      selection: [],
      activeLayer: "0",
      unit: current.meta.unit,
      drawingExtents: () => ({ minX: 0, minY: 0, maxX: 10_000, maxY: 10_000 }),
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => "nuevo",
    };
    const reduction =
      typeof token !== "string"
        ? cadCommandEngineReduce(
            state,
            {
              kind: "input",
              input: { kind: "entityPick", entityId: token.designa, point: { x: 0, y: 0 } },
            },
            context,
            registry,
          )
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

const tagDe = (document: CadDocument, id: string) => {
  const entity = document.entities.find((busca) => busca.id === id);
  return entity?.type === "insert" ? entity.attributes?.[CAD_IE_TAG] : undefined;
};

// --- 1 · en el registro, con sus alias ------------------------------------
{
  for (const [nombre, alias] of [
    ["AETAG", ["ETIQUETA", "AECOMPONENT"]],
    ["AETAGLIST", ["LISTAETIQUETAS"]],
  ] as const) {
    ok(registry.get(nombre), `${nombre} no está en el registro`);
    for (const a of alias)
      eq(registry.get(a)?.name, nombre, `el alias ${a} no lleva a ${nombre}`);
  }
}

// --- 2 · designar un símbolo NO pregunta la familia: la dice el bloque -----
{
  const dibujo = documento([componente("l1", "MEP-LUMINARIA")]);
  const sesion = run(dibujo, ["AETAG", { designa: "l1" }]);
  eq(tagDe(sesion.document, "l1"), "-LT1", "la luminaria se etiqueta -LT1 sin preguntar nada");
  ok(
    dichos(sesion.effects).some((t) => /AETAG: -LT1 en MEP-LUMINARIA/.test(t)),
    `y lo dice: ${dichos(sesion.effects).join(" / ")}`,
  );
}

// --- 3 · TODOS de una vez, en UN paso de deshacer -------------------------
{
  // Tres luminarias, dos contactos y un apagador sin etiquetar, más una
  // luminaria que YA tiene la -LT7: el reparto tiene que continuar desde ella.
  const dibujo = documento([
    componente("a", "MEP-LUMINARIA"),
    componente("b", "MEP-LUMINARIA"),
    componente("c", "MEP-LUMINARIA"),
    componente("d", "MEP-CONTACTO"),
    componente("e", "MEP-CONTACTO"),
    componente("f", "MEP-APAGADOR"),
    componente("vieja", "MEP-LUMINARIA", "-LT7"),
  ]);
  const antes = pasos;
  const sesion = run(dibujo, ["AETAG", "T"]);
  eq(pasos - antes, 1, "los seis se etiquetan en UN solo paso de deshacer");

  eq(tagDe(sesion.document, "a"), "-LT8", "la primera luminaria continúa desde la -LT7 que ya había");
  eq(tagDe(sesion.document, "b"), "-LT9", "y la cuenta sigue dentro del mismo lote");
  eq(tagDe(sesion.document, "c"), "-LT10", "sin repetir ninguna");
  eq(tagDe(sesion.document, "d"), "-CT1", "los contactos llevan su propia familia");
  eq(tagDe(sesion.document, "e"), "-CT2", "y su propia cuenta");
  eq(tagDe(sesion.document, "f"), "-SW1", "y el apagador la suya");
  eq(tagDe(sesion.document, "vieja"), "-LT7", "la que ya tenía etiqueta NO se toca");

  ok(
    dichos(sesion.effects).some((t) => /AETAG Todos: 6 componente\(s\) etiquetado\(s\)/.test(t)),
    `y se cuenta lo hecho: ${dichos(sesion.effects).join(" / ")}`,
  );
}

// --- 4 · lo que no dice su familia se deja SIN TOCAR, y se dice ------------
{
  const dibujo = documento([
    componente("l", "MEP-LUMINARIA"),
    // Un símbolo eléctrico que el catálogo no conoce: etiquetarlo como lo que
    // no es se queda mal para siempre; el sin etiquetar al menos se ve.
    componente("raro", "SIMBOLO-DEL-DESPACHO"),
  ]);
  const sesion = run(dibujo, ["AETAG", "T"]);
  eq(tagDe(sesion.document, "l"), "-LT1", "la luminaria sí se etiqueta");
  eq(tagDe(sesion.document, "raro"), undefined, "y el desconocido se queda sin tocar");
  ok(
    dichos(sesion.effects).some((t) => /1 sin familia reconocible, sin tocar: raro/.test(t)),
    `y se dice cuál: ${dichos(sesion.effects).join(" / ")}`,
  );
}

// --- 5 · AETAGLIST caza la repetida y la que falta, sin escribir ----------
{
  const dibujo = documento([
    componente("a", "MEP-LUMINARIA", "-LT1"),
    componente("b", "MEP-LUMINARIA", "-LT1"),
    componente("c", "MEP-CONTACTO"),
  ]);
  const antes = dibujo.entities.length;
  const sesion = run(dibujo, ["AETAGLIST"]);
  eq(sesion.document.entities.length, antes, "AETAGLIST no escribe nada");
  const texto = dichos(sesion.effects).join(" ");
  ok(/REPETIDAS: -LT1 en a y b/.test(texto), `la etiqueta repetida sale: ${texto}`);
  ok(/1 componente\(s\) sin etiqueta: c/.test(texto), `y la que falta también: ${texto}`);

  // Y cuando todo está bien, lo dice en vez de callarse.
  const limpio = documento([componente("a", "MEP-LUMINARIA", "-LT1")]);
  ok(
    dichos(run(limpio, ["AETAGLIST"]).effects).some((t) =>
      /todos los componentes eléctricos llevan etiqueta y ninguna se repite/.test(t),
    ),
    "un dibujo sano recibe una respuesta clara",
  );
}

// --- 6 · las negativas, con motivo ----------------------------------------
{
  const sinPelados = documento([componente("a", "MEP-LUMINARIA", "-LT1")]);
  ok(
    dichos(run(sinPelados, ["AETAG", "T"]).effects).some((t) =>
      /ya llevan etiqueta/.test(t),
    ),
    "sin nada que etiquetar se dice, en vez de escribir un lote vacío",
  );

  const noEsSimbolo = documento([
    { id: "raya", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 }, layer: "0" } as CadEntity,
  ]);
  ok(
    dichos(run(noEsSimbolo, ["AETAG", { designa: "raya" }]).effects).some((t) =>
      /etiqueta la inserción de un símbolo/.test(t),
    ),
    "designar una raya se rechaza con motivo",
  );
}

console.log(
  `AETAG/AETAGLIST tecleados: ${verdes} comprobaciones verdes — seis componentes etiquetados en un paso, la familia deducida del símbolo, y lo desconocido sin tocar`,
);
