/**
 * QUE LA LÁMINA SE PUEDA LEER: rótulo con escala, marca de corte y globo.
 *
 * ## El defecto, medido antes de tocar nada
 *
 * `docs/competitive/distancia-autocad-completo-20260901.md`, defecto (d) del
 * área «de 3D a documentación»:
 *
 *     no hay marca de corte, ni rótulo de vista con escala, ni corte
 *     quebrado, ni globo de detalle (el detalle es un ×2 fijo)
 *
 * Lo comprobé tecleando SOLVIEW y SOLDRAW sobre una planta de cuatro muros: la
 * lámina salía con sus ventanas dibujadas y CERO entidades de texto. Cuatro
 * dibujos sin nombre, sin escala, y un corte del que no había forma de saber
 * por dónde pasa — que es la única información que un corte no puede llevar
 * dentro de sí mismo.
 *
 * ## Cómo se mide aquí
 *
 * Tecleando, y afirmando sobre el DOCUMENTO que queda. Nada mira una captura ni
 * el estado interno de un módulo: o el rótulo es una entidad del dibujo, con su
 * texto y su capa, o no está.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../cad-document";
import { executeCadEntityCommandBatch } from "../entity-commands";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
} from "../engine/command-engine";
import type { CadCommandContext } from "../engine/command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../engine/index";
import { cadSolviewScaleText, cadSolviewViewTitle } from "./solview-annotations";

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

const muro = (id: string, ax: number, ay: number, bx: number, by: number): CadEntity => ({
  id,
  type: "wall",
  start: { x: ax, y: ay, z: 0 },
  end: { x: bx, y: by, z: 0 },
  thickness: 250,
  height: 2_800,
  layer: "MUROS",
});

function documento(): CadDocument {
  const entities = [
    muro("w-sur", 0, 0, 6_000, 0),
    muro("w-norte", 0, 4_000, 6_000, 4_000),
    muro("w-oeste", 0, 0, 0, 4_000),
    muro("w-este", 6_000, 0, 6_000, 4_000),
  ];
  return migrateCadDocument({
    meta: { version: 1, schema: 8, unit: "mm" },
    layers: [
      { id: "0", name: "0", visible: true, locked: false, color: "#ffffff" },
      { id: "MUROS", name: "MUROS", visible: true, locked: false, color: "#c0c0c0" },
    ],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

/**
 * Contador de identificadores COMPARTIDO por todas las tecleadas.
 *
 * No es un detalle del arnés: el anfitrión de verdad genera identificadores
 * únicos en todo el documento, y reiniciar el contador en cada orden fabricaría
 * dos ventanas con el mismo id — un estado que el estudio no puede producir y
 * que aquí daría un falso rojo.
 */
let ids = 0;

/** Teclea una secuencia y APLICA lo que salga, igual que hace el anfitrión. */
function run(document: CadDocument, tokens: readonly (string | { punto: [number, number] })[]) {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  let current = document;
  for (const token of tokens) {
    const context: CadCommandContext = {
      entityIds: current.entities.map((entity) => entity.id),
      entity: (id) => current.entities.find((entity) => entity.id === id),
      selection: [],
      activeLayer: "0",
      unit: current.meta.unit,
      paperSpaces: () => current.paperSpaces,
      drawingExtents: () => ({ minX: 0, minY: 0, maxX: 6_000, maxY: 4_000 }),
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `id-${(ids += 1)}`,
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

const messages = (effects: readonly CadCommandEffect[]) =>
  effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : []));

// --- 1 · la escala se escribe como se escribe en un plano -------------------
{
  eq(cadSolviewScaleText(50), "ESC. 1:50", "una reducción se escribe 1:N");
  eq(cadSolviewScaleText(0.5), "ESC. 2:1", "una ampliación se escribe N:1");
  eq(cadSolviewScaleText(1), "ESC. 1:1", "el tamaño natural también se dice");
  eq(cadSolviewScaleText(0), "ESC. INDETERMINADA", "una escala imposible no se inventa");
  eq(cadSolviewViewTitle("section", "A"), "CORTE A-A", "un corte se rotula con su letra repetida");
  eq(
    cadSolviewViewTitle("section", "Por la escalera"),
    "CORTE POR LA ESCALERA",
    "y un nombre largo NO se duplica: sería absurdo",
  );
  eq(cadSolviewViewTitle("plan", "Baja"), "PLANTA BAJA", "la planta lleva su nombre");
  eq(cadSolviewViewTitle("detail", "1"), "DETALLE 1", "y el detalle el suyo");
}

// --- 2 · una lámina tecleada sale con sus rótulos ---------------------------
let lamina = run(documento(), ["LAYOUT", "N", "Hoja"]).document;
lamina = run(lamina, ["SOLVIEW", "PL", "\r", "Baja"]).document;
lamina = run(lamina, ["SOLVIEW", "AL", "F", "Sur"]).document;
lamina = run(lamina, [
  "SOLVIEW", "CO", { punto: [0, 2_000] }, { punto: [6_000, 2_000] }, "A",
]).document;
const dibujada = run(lamina, ["SOLDRAW", "\r"]);
lamina = dibujada.document;

const rotulos = lamina.entities.filter(
  (entity): entity is Extract<CadEntity, { type: "mtext" }> => entity.type === "mtext",
);
ok(rotulos.length > 0, "la lámina dibujada tiene rótulos: antes no tenía NI UNO");

for (const [base, titulo] of [
  ["BAJA", "PLANTA BAJA"],
  ["SUR", "ALZADO SUR"],
  ["A", "CORTE A-A"],
] as const) {
  const suyo = rotulos.filter((rotulo) => rotulo.layer === `${base}-ROT`);
  ok(
    suyo.some((rotulo) => rotulo.text === titulo),
    `falta el rótulo «${titulo}» en la capa ${base}-ROT: ${suyo.map((r) => r.text).join(" / ")}`,
  );
  ok(
    suyo.some((rotulo) => /^ESC\. \d+:\d+$/.test(rotulo.text)),
    `la vista ${base} no dice a qué escala está: ${suyo.map((r) => r.text).join(" / ")}`,
  );
}

// --- 3 · la marca del corte va sobre la PLANTA, que es donde dice algo ------
{
  const planta = (lamina.paperSpaces[0].viewports ?? []).find(
    (viewport) => viewport.derivation?.layerBase === "BAJA",
  );
  const corte = (lamina.paperSpaces[0].viewports ?? []).find(
    (viewport) => viewport.derivation?.layerBase === "A",
  );
  ok(
    planta && corte,
    `la lámina tiene su planta y su corte; hay: ${(lamina.paperSpaces[0].viewports ?? []).map((v) => `${v.name}/${v.derivation?.layerBase ?? "-"}`).join(", ")}`,
  );
  eq(
    corte!.derivation?.parentViewportId,
    planta!.id,
    "el corte se ató a la planta: sin padre no hay dónde poner la marca",
  );

  // La marca la GENERA el corte —lleva su marca de metadatos, así que se rehace
  // cuando el corte se redibuja— y vive en la capa de la PLANTA, porque cada
  // ventana congela las capas de las demás y en la del corte sería invisible.
  const dela = lamina.entities.filter(
    (entity) => entity.context?.metadata?.solviewFor === corte!.id,
  );
  const enLaPlanta = dela.filter((entity) => entity.layer === "BAJA-ROT");
  ok(enLaPlanta.length > 0, "el corte no dejó ninguna marca sobre la planta");
  const letras = enLaPlanta.filter((entity) => entity.type === "mtext");
  eq(letras.length, 2, "una marca de corte lleva su letra en los DOS extremos");
  ok(
    letras.every((entity) => entity.type === "mtext" && entity.text === "A"),
    "y las dos son la letra del corte",
  );
  // Línea de corte + por extremo: rabillo, dos alas de la flecha. 1 + 2×3 = 7.
  const lineas = enLaPlanta.filter((entity) => entity.type === "line");
  eq(lineas.length, 7, "la marca es línea de corte, dos rabillos y dos flechas de dos alas");
}

// --- 4 · el globo del detalle encierra lo que el detalle enseña -------------
{
  const conDetalle = run(lamina, ["SOLVIEW", "DE", "Baja", "5", "D1"]).document;
  const dibujado = run(conDetalle, ["SOLDRAW", "\r"]).document;
  const detalle = (dibujado.paperSpaces[0].viewports ?? []).find(
    (viewport) => viewport.derivation?.layerBase === "D1",
  );
  ok(detalle, "el detalle se creó");
  const globo = dibujado.entities.find(
    (entity) =>
      entity.type === "circle" && entity.context?.metadata?.solviewFor === detalle!.id,
  );
  ok(globo, "el detalle no dejó globo sobre su vista padre");
  eq(globo!.layer, "BAJA-ROT", "y el globo va en la capa de la PLANTA, que es donde se mira");

  // El radio es el de lo AMPLIADO, no un valor fijo: un globo que no coincide
  // con lo que el detalle enseña manda a buscar una esquina que no está.
  const ventana = detalle!.derivation!.window!;
  const esperado = Math.max(ventana.width, ventana.height) / 2;
  ok(
    globo!.type === "circle" && Math.abs(globo!.radius - esperado) < 1e-6,
    `el globo debería medir ${esperado} y mide ${globo!.type === "circle" ? globo!.radius : "?"}`,
  );
}

// --- 5 · sin una única planta, el corte se crea Y LO DICE -------------------
{
  let dos = run(documento(), ["LAYOUT", "N", "Hoja"]).document;
  dos = run(dos, ["SOLVIEW", "PL", "\r", "Baja"]).document;
  dos = run(dos, ["SOLVIEW", "PL", "\r", "Alta"]).document;
  const corte = run(dos, ["SOLVIEW", "CO", { punto: [0, 2_000] }, { punto: [6_000, 2_000] }, "B"]);
  ok(
    messages(corte.effects).some((texto) => texto.includes("sin marca de corte")),
    // Con dos plantas no se elige la primera: poner la marca en la que no es
    // manda a leer el corte por donde no pasa.
    `con dos plantas el corte tiene que avisar: ${messages(corte.effects).join(" / ")}`,
  );
  eq(
    (corte.document.paperSpaces[0].viewports ?? []).filter((v) => v.derivation).length,
    3,
    "y el corte se crea igual: incompleto es mejor que inexistente",
  );
}

console.log(`solview-annotations: ${verdes} comprobaciones verdes — rótulo con escala, marca de corte y globo de detalle`);
