/**
 * LOS BLOQUES DINÁMICOS, TECLEADOS: la puerta que no existía.
 *
 * `dynamic-blocks.ts` estaba escrito y probado desde antes de esta campaña —683
 * líneas, dos familias, su spec verde— y NADIE lo usaba: ni un comando ni un
 * panel lo importaban. Lo que aquí se mide es exactamente eso: que ahora se
 * alcanza tecleando, que una puerta colocada lleva sus parámetros encima —así
 * que sigue siendo paramétrica después de guardar—, que cambiar un parámetro NO
 * la mueve ni la vuelve a insertar, y que un valor que se ajusta al comercial se
 * DICE en vez de redondearse en silencio.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import {
  CAD_DYNAMIC_BLOCK_PREFIX,
  CAD_DYNAMIC_FAMILY_METADATA,
} from "../../dynamic-blocks";
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
let ids = 0;
let pasos = 0;

function documento(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 8, unit: "mm" },
    layers: [
      { id: "0", name: "0", visible: true, locked: false, color: "#ffffff" },
      { id: "architecture", name: "architecture", visible: true, locked: false, color: "#cbd5f5" },
    ],
    entities: [],
    modelSpace: { entityIds: [] },
  });
}

type Token = string | { punto: [number, number] };

function run(
  document: CadDocument,
  tokens: readonly Token[],
  seleccion: readonly string[] = [],
) {
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
      activeLayer: "architecture",
      unit: current.meta.unit,
      drawingExtents: () => ({ minX: 0, minY: 0, maxX: 20_000, maxY: 20_000 }),
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `din-${(ids += 1)}`,
    };
    const reduction =
      typeof token === "object"
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

// --- 1 · en el registro: la capacidad ya se alcanza -----------------------
{
  for (const [nombre, alias] of [
    ["BLOQUEDIN", ["BLOQUEDINAMICO", "DYNBLOCK"]],
    ["BLOQUEDINSET", ["PARAMETROBLOQUE", "DYNSET"]],
    ["BLOQUEDINLIST", ["LISTABLOQUESDIN"]],
  ] as const) {
    ok(registry.get(nombre), `${nombre} no está en el registro`);
    for (const a of alias) eq(registry.get(a)?.name, nombre, `el alias ${a} no lleva a ${nombre}`);
  }
}

// --- 2 · una puerta paramétrica colocada tecleando ------------------------
let dibujo = documento();
{
  const antes = pasos;
  // Familia «puerta-abatible» (atajo P), claro 900, apertura 90, muro por
  // defecto, sin espejo, y el punto en el quicial.
  const sesion = run(dibujo, [
    "BLOQUEDIN", "puerta-abatible",
    "900", "90", "\r", "0",
    { punto: [3_000, 2_000] },
  ]);
  dibujo = sesion.document;
  eq(pasos - antes, 1, "UN paso de deshacer: definición, inserción y parámetros van juntos");

  const insercion = dibujo.entities.find((entidad) => entidad.type === "insert");
  assert.ok(insercion, "la puerta llegó al documento");
  verdes += 1;
  eq(
    insercion!.context?.metadata?.[CAD_DYNAMIC_FAMILY_METADATA],
    "puerta-abatible",
    "con su familia en los metadatos: sigue siendo paramétrica después de guardar",
  );
  eq(insercion!.context?.metadata?.["din:claro"], 900, "y el claro que se tecleó");
  ok(
    (insercion as { block: string }).block.startsWith(CAD_DYNAMIC_BLOCK_PREFIX),
    `apunta al bloque materializado: ${(insercion as { block: string }).block}`,
  );
  const definicion = (dibujo.blocks ?? []).find(
    (bloque) => bloque.id === (insercion as { block: string }).block,
  );
  assert.ok(definicion, "y la definición está en el documento, no supuesta");
  verdes += 1;
  ok(definicion!.entities.length >= 4, "con geometría de verdad: hoja, barrido y jambas");
  ok(
    dichos(sesion.effects).some((t) => /BLOQUEDIN: Puerta abatible paramétrica — Claro 900/.test(t)),
    `y la orden dice qué colocó: ${dichos(sesion.effects).join(" / ")}`,
  );
}

// --- 3 · el ajuste a medida comercial se DICE ------------------------------
{
  const sesion = run(documento(), [
    "BLOQUEDIN", "puerta-abatible",
    "873", "90", "\r", "0",
    { punto: [0, 0] },
  ]);
  ok(
    dichos(sesion.effects).some((t) => /AJUSTES: Claro: 873/.test(t)),
    `un claro de 0,873 se ajusta al comercial y se DICE: ${dichos(sesion.effects).join(" / ")}`,
  );
  const insercion = sesion.document.entities.find((entidad) => entidad.type === "insert");
  eq(insercion!.context?.metadata?.["din:claro"], 900, "y el valor guardado es el ajustado");
}

// --- 4 · cambiar un parámetro NO mueve el bloque --------------------------
{
  const original = dibujo.entities.find((entidad) => entidad.type === "insert")!;
  const antesBloque = (original as { block: string }).block;
  const antesInsercion = JSON.stringify((original as { insertion: unknown }).insertion);

  const sesion = run(dibujo, ["BLOQUEDINSET", "claro", "1000"], [original.id]);
  const despues = sesion.document.entities.find((entidad) => entidad.id === original.id)!;
  eq(despues.context?.metadata?.["din:claro"], 1_000, "el parámetro cambió");
  ok(
    (despues as { block: string }).block !== antesBloque,
    "y apunta a otra definición materializada",
  );
  eq(
    JSON.stringify((despues as { insertion: unknown }).insertion),
    antesInsercion,
    "pero NO se movió: es el mismo bloque, no uno nuevo",
  );
  eq(despues.id, original.id, "y conserva su identidad: no se borró y se insertó otro");
  ok(
    dichos(sesion.effects).some((t) => /no se movió ni se volvió a insertar/.test(t)),
    `y se dice: ${dichos(sesion.effects).join(" / ")}`,
  );
  dibujo = sesion.document;
}

// --- 5 · las negativas, con motivo ---------------------------------------
{
  const suelto = executeCadEntityCommandBatch(
    documento(),
    [
      {
        type: "insert",
        entity: {
          id: "linea-cualquiera",
          type: "line",
          start: { x: 0, y: 0, z: 0 },
          end: { x: 100, y: 0, z: 0 },
          layer: "0",
        } as never,
      },
    ],
    "LINE",
  ).document;
  const sesion = run(suelto, ["BLOQUEDINSET"], ["linea-cualquiera"]);
  ok(
    dichos(sesion.effects).some((t) => /Nada de lo seleccionado \(1\) es un bloque dinámico/.test(t)),
    `seleccionar cualquier cosa se contesta con motivo: ${dichos(sesion.effects).join(" / ")}`,
  );

  const sinSeleccion = run(suelto, ["BLOQUEDINSET"]);
  ok(
    dichos(sinSeleccion.effects).some((t) => /elija primero un bloque dinámico|Seleccione|selección/i.test(t)),
    `y sin selección también: ${dichos(sinSeleccion.effects).join(" / ")}`,
  );

  // Una familia inventada la rechaza EL MOTOR, antes de llegar al comando: las
  // opciones del prompt son las familias que hay. Lo que importa es que la
  // negativa exista y que no se escriba nada, no quién la firma.
  const inventada = run(documento(), ["BLOQUEDIN", "escalera-helicoidal"]);
  ok(
    dichos(inventada.effects).some((t) => /Entrada no válida/.test(t)),
    `una familia que no existe se rechaza: ${dichos(inventada.effects).join(" / ")}`,
  );
  eq(inventada.document.entities.length, 0, "y no se escribe nada");

  const vacio = run(documento(), ["BLOQUEDINLIST"]);
  ok(
    dichos(vacio.effects).some((t) => /No hay ningún bloque dinámico colocado/.test(t)),
    "sin bloques dinámicos se dice cuántas familias hay, en vez de callarse",
  );
}

// --- 6 · BLOQUEDINLIST cuenta lo colocado y no escribe --------------------
{
  const antes = dibujo.entities.length;
  const sesion = run(dibujo, ["BLOQUEDINLIST"]);
  eq(sesion.document.entities.length, antes, "BLOQUEDINLIST no escribe nada");
  const texto = dichos(sesion.effects).join(" ");
  ok(/1 bloque\(s\) dinámico\(s\): 1 de puerta-abatible/.test(texto), `los cuenta: ${texto}`);
  ok(/claro=1000/.test(texto), `y dice sus valores actuales: ${texto}`);
}

console.log(
  `Bloques dinámicos tecleados: ${verdes} comprobaciones verdes — el motor que nadie alcanzaba ya se alcanza, la puerta lleva sus parámetros encima, cambiar uno no la mueve y el ajuste comercial se dice`,
);
