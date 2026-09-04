/**
 * PIDROUTE Y PIDMTO TECLEADOS: la tubería sube, y la lista sale del modelo.
 *
 * Que la geometría se lea bien ya lo mide `plant/pipe-route.spec.ts`. Aquí se
 * mide lo que convierte una biblioteca en una capacidad: que las órdenes estén
 * en el registro, que la ruta que llega al documento lleve COTA en cada
 * vértice —y que cambiar de elevación meta el montante sin que nadie lo dibuje—
 * y que la lista de materiales cuente metros de tubo y piezas de accesorio con
 * su límite escrito al lado.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { CAD_PL_LINE } from "../../plant/line-numbers";
import { CAD_PL_ROUTE, CAD_PL_ROUTE_LAYER, CAD_PL_ROUTE_MARK } from "../../plant/pipe-route";
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
      blocks: () => current.blocks ?? [],
      paperSpaces: () => current.paperSpaces ?? [],
      selection: [],
      activeLayer: "0",
      unit: current.meta.unit,
      drawingExtents: () => ({ minX: 0, minY: 0, maxX: 30_000, maxY: 30_000 }),
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `ru-${(ids += 1)}`,
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

const rutas = (document: CadDocument) =>
  document.entities.filter(
    (entidad) => entidad.context?.metadata?.[CAD_PL_ROUTE] === CAD_PL_ROUTE_MARK,
  );

// --- 1 · en el registro, con sus alias ------------------------------------
{
  for (const [nombre, alias] of [
    ["PIDROUTE", ["RUTATUBERIA", "ROUTEPIPE"]],
    ["PIDMTO", ["LISTAMATERIAL", "PIPEBOM"]],
  ] as const) {
    ok(registry.get(nombre), `${nombre} no está en el registro`);
    for (const a of alias) eq(registry.get(a)?.name, nombre, `el alias ${a} no lleva a ${nombre}`);
  }
  ok(registry.get("PIDROUTE")?.spatial === true, "PIDROUTE se declara espacial: conserva la cota");
}

// --- 2 · una ruta tecleada llega con su cota ------------------------------
let dibujo = documento();
{
  const antes = pasos;
  const sesion = run(dibujo, [
    "PIDROUTE", '6"', "P", "CS150",
    "2000",                       // elevación de arranque
    { punto: [0, 0] }, { punto: [12_000, 0] }, "\r",
  ]);
  dibujo = sesion.document;
  eq(pasos - antes, 1, "un solo paso de deshacer: la capa y la ruta van juntas");

  const trazadas = rutas(dibujo);
  eq(trazadas.length, 1, "la ruta tecleada llegó al documento");
  eq(trazadas[0].type, "polyline", "y es una polilínea: ningún tipo de entidad nuevo");
  eq(trazadas[0].layer, CAD_PL_ROUTE_LAYER, "en la capa de rutas, separada del esquema");
  const vertices = (trazadas[0] as Extract<CadDocument["entities"][number], { type: "polyline" }>)
    .vertices;
  ok(
    vertices.every((vertice) => vertice.z === 2_000),
    `la cota tecleada está en TODOS los vértices: ${JSON.stringify(vertices)}`,
  );
  ok(
    dichos(sesion.effects).some((t) => /PIDROUTE: 6"-P-1001-CS150.*cota 2000/.test(t)),
    `y la orden dice el número y la cota: ${dichos(sesion.effects).join(" / ")}`,
  );
}

// --- 3 · cambiar de elevación mete el MONTANTE, sin dibujarlo -------------
{
  const sesion = run(dibujo, [
    "PIDROUTE", '4"', "P", "CS150",
    "2000",
    { punto: [0, 5_000] },
    { punto: [6_000, 5_000] },
    "E", "5000",                  // sube a +5.000: el montante sale solo
    { punto: [6_000, 11_000] },
    "\r",
  ]);
  const nueva = rutas(sesion.document).find(
    (entidad) => entidad.context?.metadata?.[CAD_PL_LINE] === '4"-P-1002-CS150',
  );
  assert.ok(nueva, "la segunda ruta llegó");
  verdes += 1;
  const vertices = (nueva as Extract<CadDocument["entities"][number], { type: "polyline" }>).vertices;
  eq(vertices.length, 4, "tres puntos tecleados y un vértice más: el del montante");
  assert.deepEqual(
    vertices.map((v) => [v.x, v.y, v.z]),
    [
      [0, 5_000, 2_000],
      [6_000, 5_000, 2_000],
      [6_000, 5_000, 5_000],
      [6_000, 11_000, 5_000],
    ],
    "el montante sube EN EL SITIO y el tramo siguiente continúa a la cota nueva",
  );
  verdes += 1;
  ok(
    dichos(sesion.effects).some((t) => /cotas de 2000 a 5000/.test(t)),
    `y se dice el desnivel: ${dichos(sesion.effects).join(" / ")}`,
  );
  dibujo = sesion.document;
}

// --- 4 · PIDMTO cuenta metros y piezas, y no escribe ----------------------
{
  const antes = dibujo.entities.length;
  const sesion = run(dibujo, ["PIDMTO"]);
  eq(sesion.document.entities.length, antes, "PIDMTO no escribe nada");
  const texto = dichos(sesion.effects).join(" ");
  // 12 + (6 + 3 + 6) = 27 m de tubo entre las dos rutas.
  ok(/27\.00 m de tubo/.test(texto), `los metros salen del modelo 3D: ${texto}`);
  ok(/Tubo 6" CS150: 12\.00 m/.test(texto), `y por diámetro: ${texto}`);
  ok(/Codo 90° 4" CS150: 2 pz/.test(texto), `los codos del montante se cuentan: ${texto}`);
  ok(
    /Sin espesor, diámetro exterior, peso, clave de compra ni precio/.test(texto),
    `el límite va en el renglón: ${texto}`,
  );
}

// --- 5 · las negativas, con motivo ---------------------------------------
{
  const unPunto = run(documento(), [
    "PIDROUTE", '6"', "P", "CS150", "\r", { punto: [0, 0] }, "\r",
  ]);
  ok(
    dichos(unPunto.effects).some((t) => /al menos dos puntos/.test(t)),
    `un punto no es una ruta: ${dichos(unPunto.effects).join(" / ")}`,
  );
  eq(unPunto.document.entities.length, 0, "y no se escribe nada");

  const sinDiametro = run(documento(), ["PIDROUTE", "\r"]);
  ok(
    dichos(sinDiametro.effects).some((t) => /necesita el diámetro nominal/.test(t)),
    "sin diámetro se dice",
  );

  const vacio = run(documento(), ["PIDMTO"]);
  ok(
    dichos(vacio.effects).some((t) => /No hay ninguna ruta de tubería 3D/.test(t)),
    "sin rutas hay que decirlo, no callarse",
  );
}

console.log(
  `PIDROUTE/PIDMTO tecleados: ${verdes} comprobaciones verdes — la cota llega a cada vértice, el montante sale solo al cambiar de elevación y la lista de materiales cuenta metros y piezas con su límite`,
);
