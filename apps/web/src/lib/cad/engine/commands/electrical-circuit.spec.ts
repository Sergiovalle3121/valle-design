/**
 * AECIRCUIT y AECHECK TECLEADOS: la revisión de la NOM sale del PLANO.
 *
 * Que la aritmética esté bien ya lo mide `circuit-check.spec.ts` contra cuentas
 * hechas a mano. Aquí se comprueba la otra mitad, que es la que convierte una
 * biblioteca en una capacidad: que las dos órdenes se escriben con las manos,
 * que `AECIRCUIT` estampa los datos en TODOS los conductores del circuito en un
 * solo paso de deshacer, y que `AECHECK` dice el veredicto con sus números y
 * con su límite — aprobado o no.
 *
 * El caso que se teclea es el que un proyectista mexicano tiene todos los días:
 * un ramal de contactos de 30 m en 12 AWG. Con protección de 20 A cumple la
 * ampacidad pero se pasa de caída —6,1 %, calculado con los 20 A de la
 * protección, que es el máximo que el circuito puede llevar—; con 30 A no
 * cumple ni la ampacidad, por el tope del conductor pequeño del Art. 240-4(D).
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import {
  CAD_IE_BREAKER,
  CAD_IE_PHASES,
  CAD_IE_VOLTS,
} from "../../electrical/circuit-check";
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
      selection: [],
      activeLayer: "0",
      unit: current.meta.unit,
      drawingExtents: () => ({ minX: 0, minY: 0, maxX: 60_000, maxY: 60_000 }),
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `iec-${(ids += 1)}`,
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
      if (effect.kind === "execute") {
        pasos += 1;
        current = executeCadEntityCommandBatch(current, effect.commands, effect.label).document;
      }
  }
  return { effects, document: current };
}

const dichos = (effects: readonly CadCommandEffect[]) =>
  effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : []));

// --- 1 · las dos órdenes están en el registro, con sus alias ---------------
{
  for (const [nombre, alias] of [
    ["AECIRCUIT", ["CIRCUITO"]],
    ["AECHECK", ["REVISARNOM", "NOMCHECK"]],
  ] as const) {
    ok(registry.get(nombre), `${nombre} no está en el registro`);
    for (const a of alias)
      eq(registry.get(a)?.name, nombre, `el alias ${a} no lleva a ${nombre}`);
  }
}

// --- 2 · un ramal de 30 m tecleado, y sus datos en UN paso de deshacer -----
// 30 m de 12 AWG en dos tramos de 15, como se dibuja de verdad.
let dibujo = documento();
dibujo = run(dibujo, [
  "AEWIRE", "C-1", "12",
  { punto: [0, 0] }, { punto: [15_000, 0] }, "\r",
]).document;
dibujo = run(dibujo, [
  "AEWIRE", "C-1", "12",
  { punto: [15_000, 0] }, { punto: [15_000, 15_000] }, "\r",
]).document;

{
  const antes = pasos;
  const sesion = run(dibujo, ["AECIRCUIT", "C-1", "20", "127", "M"]);
  dibujo = sesion.document;
  eq(pasos - antes, 1, "los dos conductores se marcan en UN solo paso de deshacer");

  const marcados = dibujo.entities.filter(
    (entity) => entity.context?.metadata?.[CAD_IE_BREAKER] === "20",
  );
  eq(marcados.length, 2, "AECIRCUIT estampó los DOS conductores del circuito");
  eq(marcados[0].context!.metadata![CAD_IE_VOLTS], "127", "con su tensión");
  eq(marcados[0].context!.metadata![CAD_IE_PHASES], "1", "y sus fases");
  ok(
    dichos(sesion.effects).some((t) => /C-1 a 20 A, 127 V, monofásico — 2 conductor/.test(t)),
    `y lo dice: ${dichos(sesion.effects).join(" / ")}`,
  );
}

// --- 3 · AECHECK caza la caída de tensión con la longitud DEL PLANO --------
{
  const antes = dibujo.entities.length;
  const sesion = run(dibujo, ["AECHECK"]);
  eq(sesion.document.entities.length, antes, "AECHECK no escribe nada");
  const texto = dichos(sesion.effects).join(" ");
  ok(/C-1 AVISO/.test(texto), `20 A en 12 AWG cumple ampacidad: es AVISO, no rechazo: ${texto}`);
  ok(
    // 2 × 30 m × 20 A × 6,5 Ω/km / 1000 = 7,8 V, que sobre 127 V es 6,1 %.
    // La corriente de cálculo es la PROTECCIÓN, que es el máximo que el
    // circuito puede llevar: suponer la carga real sería aprobar de más.
    /caída es del 6\.1 % en 30\.0 m/.test(texto),
    `y la caída sale de los 30 m que mide el dibujo: ${texto}`,
  );
  ok(/con 8 AWG bajaría del tope/.test(texto), `y propone el calibre que lo resuelve: ${texto}`);
  // El límite va SIEMPRE: sin él, esto se leería como un certificado.
  ok(/No es memorial de cálculo/.test(texto), `el límite tiene que ir en el renglón: ${texto}`);
  ok(/reactancia/.test(texto), "y nombrar la reactancia entre lo que no mira");
}

// --- 4 · subir la protección lo convierte en NO CUMPLE ---------------------
{
  // El error que un tamiz tiene que cazar: alguien pone un interruptor de 30 A
  // en un circuito cableado con 12 AWG.
  const conTreinta = run(dibujo, ["AECIRCUIT", "C-1", "30", "127", "M"]).document;
  const texto = dichos(run(conTreinta, ["AECHECK"]).effects).join(" ");
  ok(/C-1 NO CUMPLE/.test(texto), `12 AWG con 30 A no cumple: ${texto}`);
  ok(
    /admite hasta 20 A y la protección es de 30 A/.test(texto),
    `con los dos números: ${texto}`,
  );
  ok(/240-4\(D\)/.test(texto), `y citando el artículo, para poder cotejarlo: ${texto}`);
}

// --- 5 · un circuito corto y bien calibrado CUMPLE -------------------------
{
  let corto = documento();
  corto = run(corto, [
    "AEWIRE", "C-2", "12",
    { punto: [0, 0] }, { punto: [8_000, 0] }, "\r",
  ]).document;
  corto = run(corto, ["AECIRCUIT", "C-2", "20", "127", "M"]).document;
  const texto = dichos(run(corto, ["AECHECK"]).effects).join(" ");
  ok(/C-2 cumple/.test(texto), `8 m de 12 AWG con 20 A cumple: ${texto}`);
  ok(/1 cumple\(n\), 0 no cumple/.test(texto), `y el resumen lo cuenta: ${texto}`);
  ok(/No es memorial de cálculo/.test(texto), "y el límite va también cuando se aprueba");
}

// --- 6 · las negativas, con motivo ----------------------------------------
{
  const sinConductores = run(documento(), ["AECIRCUIT", "C-9", "20", "127", "M"]);
  ok(
    dichos(sinConductores.effects).some((t) => /No hay ningún conductor del circuito «C-9»/.test(t)),
    `un circuito que no existe se dice: ${dichos(sinConductores.effects).join(" / ")}`,
  );
  eq(sinConductores.document.entities.length, 0, "y no se escribe nada");

  const proteccionRara = run(dibujo, ["AECIRCUIT", "C-1", "mucha"]);
  ok(
    dichos(proteccionRara.effects).some((t) => /no es una protección/.test(t)),
    `una protección ilegible no se redondea: ${dichos(proteccionRara.effects).join(" / ")}`,
  );

  const sinCircuitos = run(documento(), ["AECHECK"]);
  ok(
    dichos(sinCircuitos.effects).some((t) => /No hay ningún circuito que revisar/.test(t)),
    `sin circuitos hay que decirlo: ${dichos(sinCircuitos.effects).join(" / ")}`,
  );

  // Un conductor sin datos de circuito NO se aprueba en silencio.
  let soloCable = documento();
  soloCable = run(soloCable, [
    "AEWIRE", "C-3", "12",
    { punto: [0, 0] }, { punto: [5_000, 0] }, "\r",
  ]).document;
  const texto = dichos(run(soloCable, ["AECHECK"]).effects).join(" ");
  ok(/C-3 SIN DATOS/.test(texto), `sin protección no se aprueba: ${texto}`);
  ok(/use AECIRCUIT/.test(texto), `y se dice con qué orden se arregla: ${texto}`);
}

console.log(
  `AECIRCUIT/AECHECK tecleados: ${verdes} comprobaciones verdes — los datos del circuito en un paso, y la revisión de la NOM con la longitud que mide el plano`,
);
