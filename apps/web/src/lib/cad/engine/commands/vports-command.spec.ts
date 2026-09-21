/**
 * VPORTS, tecleado por el motor REAL: es un comando de VISTA —como MSPACE/
 * PSPACE (`layout-commands.spec.ts`)— así que lo que hay que medir no es el
 * documento (no lo toca) sino la PETICIÓN exacta que le hace al anfitrión, y
 * que el reparto que esa petición nombra es uno de los que
 * `model-viewports.spec.ts` mide en rectángulos.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { cadModelViewportTiles } from "../../model-viewports";
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

const registry = CAD_COMMAND_REGISTRY_V2;

function emptyDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 9, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as never as CadDocument;
}

function run(document: CadDocument, tokens: readonly string[]) {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  let current = document;
  for (const token of tokens) {
    const context: CadCommandContext = {
      entityIds: [],
      selection: [],
      activeLayer: "0",
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => "new-1",
    };
    const reduction =
      token === "\r"
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

const hostRequests = (effects: readonly CadCommandEffect[]) =>
  effects.flatMap((effect) => (effect.kind === "host" ? [effect.request] : []));

// --- VPORTS Cuatro pide el reparto "4", y NO muta el documento --------------
{
  const before = emptyDocument();
  const { effects, document } = run(before, ["VPORTS", "4"]);
  assert.deepEqual(hostRequests(effects), [{ kind: "viewport-split", layout: "4" }]);
  assert.equal(document.meta.version, before.meta.version, "VPORTS no ensucia el deshacer: es estado del visor");
  // Y ese reparto es el mismo que mide `model-viewports.spec.ts`: cuatro
  // rectángulos iguales que cubren el visor entero.
  assert.equal(cadModelViewportTiles("4").length, 4);
}

// --- las cuatro palabras clave, cada una con su reparto ----------------------
{
  const cases: Array<[string, string]> = [
    ["U", "1"],
    ["C", "2-cols"],
    ["F", "2-rows"],
    ["4", "4"],
  ];
  for (const [keyword, layout] of cases) {
    const { effects } = run(emptyDocument(), ["VPORTS", keyword]);
    assert.deepEqual(
      hostRequests(effects),
      [{ kind: "viewport-split", layout }],
      `VPORTS ${keyword} pide el reparto ${layout}`,
    );
  }
}

// --- Enter sin teclear nada toma Única, como dice el prompt por defecto -----
{
  const { effects } = run(emptyDocument(), ["VPORTS", "\r"]);
  assert.deepEqual(hostRequests(effects), [{ kind: "viewport-split", layout: "1" }]);
}

console.log(
  "vports-command: VPORTS pide al anfitrión el reparto exacto (Única/Columnas/Filas/Cuatro → 1/2-cols/2-rows/4), " +
    "Enter por defecto pide Única, y ninguna variante muta el documento: es estado del visor, no del dibujo.",
);
