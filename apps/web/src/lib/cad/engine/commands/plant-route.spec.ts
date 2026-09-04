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
  CAD_PL_SOLID_LAYER,
  CAD_PL_SOLID_OF,
  cadPipeSolidsStale,
} from "../../plant/pipe-solid";
import { solid3dMassProperties } from "../../solid3d-build";
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

// --- 6 · al cerrar la ruta se dice contra qué se acaba de chocar ----------
{
  // Un muro de 10 m con una puerta centrada, lejos de las rutas anteriores.
  const conMuro = migrateCadDocument({
    meta: { version: 1, schema: 8, unit: "mm" },
    layers: [{ id: "0", name: "0", visible: true, locked: false, color: "#ffffff" }],
    entities: [
      {
        id: "w1",
        type: "wall",
        start: { x: 0, y: 20_000, z: 0 },
        end: { x: 10_000, y: 20_000, z: 0 },
        thickness: 200,
        height: 3_000,
        layer: "0",
      },
      {
        id: "v1",
        type: "opening",
        kind: "door",
        hostId: "w1",
        position: 5_000,
        width: 900,
        height: 2_100,
        sill: 0,
        swing: "left",
        hinge: "start",
        layer: "0",
      },
    ],
    modelSpace: { entityIds: ["w1", "v1"] },
  } as never);

  const choca = run(conMuro, [
    "PIDROUTE", '6"', "P", "CS150",
    "2500",                                        // por encima del dintel
    { punto: [2_000, 19_000] }, { punto: [2_000, 21_000] }, "\r",
  ]);
  const dichoChoque = dichos(choca.effects).join(" / ");
  ok(
    /CHOQUE contra w1/.test(dichoChoque),
    `al cerrar la ruta se dice contra qué se chocó: ${dichoChoque}`,
  );
  ok(/de calado/.test(dichoChoque), `y cuánto se meten una en otra: ${dichoChoque}`);
  ok(
    /diámetro NOMINAL/.test(dichoChoque),
    `con el límite al lado, que es de dónde sale el número: ${dichoChoque}`,
  );

  // La MISMA maniobra a la cota del vano de la puerta: no choca, se informa.
  const pasa = run(conMuro, [
    "PIDROUTE", '6"', "P", "CS150",
    "1000",
    { punto: [5_000, 19_000] }, { punto: [5_000, 21_000] }, "\r",
  ]);
  const dichoPaso = dichos(pasa.effects).join(" / ");
  ok(
    /PASO POR HUECO contra v1/.test(dichoPaso),
    `cruzar por el vano se informa, no se acusa: ${dichoPaso}`,
  );
  ok(!/CHOQUE contra/.test(dichoPaso), `y no se llama choque: ${dichoPaso}`);

  // Y PIDMTO lista el choque junto a los hallazgos que ya daba.
  const listado = run(choca.document, ["PIDMTO"]);
  const dichoMto = dichos(listado.effects).join(" / ");
  ok(/CHOQUE:/.test(dichoMto), `PIDMTO lista los choques: ${dichoMto}`);
  ok(/atraviesa el muro w1/.test(dichoMto), `con su renglón legible: ${dichoMto}`);
  ok(/sin hallazgos/.test(dichoMto), `sin perder el renglón de hallazgos de siempre: ${dichoMto}`);
  ok(/2\.00 m de tubo/.test(dichoMto), `ni el metrado, que es a lo que se venía: ${dichoMto}`);

  // Sin estructura no se finge un «todo bien»: se dice que no hay contra qué.
  const sinMuros = run(dibujo, ["PIDMTO"]);
  ok(
    !/CHOQUE/.test(dichos(sinMuros.effects).join(" ")),
    "un dibujo sin muros ni sólidos no inventa choques",
  );
}

// --- 8 · `Sólido`: el tubo con volumen, en el MISMO lote de deshacer ------
{
  // Sin la palabra clave no hay sólido: el comportamiento de siempre no cambia.
  const soloRuta = run(documento(), [
    "PIDROUTE", '6"', "P", "CS150",
    "0",
    { punto: [0, 0] }, { punto: [6_000, 0] }, "\r",
  ]);
  eq(
    soloRuta.document.entities.filter((entidad) => entidad.type === "solid3d").length,
    0,
    "sin teclear Sólido, PIDROUTE sigue escribiendo sólo la ruta",
  );

  const antes = pasos;
  const conSolido = run(documento(), [
    "PIDROUTE", '6"', "P", "CS150",
    "0",
    "S",                          // el interruptor, antes del primer punto
    { punto: [0, 0] }, { punto: [6_000, 0] },
    "E", "3000",                  // y con montante, que es donde se paga el barrido
    "\r",
  ]);
  eq(pasos - antes, 1, "la polilínea y el sólido salen en UN solo lote de deshacer");

  const solidos = conSolido.document.entities.filter((entidad) => entidad.type === "solid3d");
  eq(solidos.length, 1, "el cuerpo facetado llegó al documento");
  eq(solidos[0].layer, CAD_PL_SOLID_LAYER, "en TU-SOLIDO, aparte del eje");
  const rutaTendida = rutas(conSolido.document)[0];
  eq(
    solidos[0].context?.metadata?.[CAD_PL_SOLID_OF],
    rutaTendida.id,
    "y declara de qué ruta salió",
  );
  eq(
    conSolido.document.layers.some((capa) => capa.id === CAD_PL_SOLID_LAYER),
    true,
    "la capa se da de alta en el mismo lote, no se supone",
  );

  // El volumen: 6 000 en planta más 3 000 de montante de una 6", dentro del 1 %.
  const teorico = Math.PI * 76.2 * 76.2 * 9_000;
  const volumen = solid3dMassProperties(
    solidos[0] as Extract<CadDocument["entities"][number], { type: "solid3d" }>,
  ).volume;
  ok(
    Math.abs((volumen - teorico) / teorico) <= 0.01,
    `el tubo tecleado ocupa el volumen del tubo nominal — ${(((volumen - teorico) / teorico) * 100).toFixed(3)} %`,
  );

  const dicho = dichos(conSolido.effects).join(" / ");
  ok(/sólido facetado en TU-SOLIDO/.test(dicho), `y la orden lo dice: ${dicho}`);
  ok(/FACETADO/.test(dicho), `con la palabra que le corresponde: ${dicho}`);
  ok(/prisma de 16 lados/.test(dicho), `y con su límite al lado: ${dicho}`);

  // --- la deuda de persistirlo, cobrada por PIDMTO ------------------------
  eq(
    cadPipeSolidsStale(conSolido.document).length,
    0,
    "recién tendida, la huella cuadra y no hay nada que declarar",
  );
  const movido: CadDocument = {
    ...conSolido.document,
    entities: conSolido.document.entities.map((entidad) =>
      entidad.id === rutaTendida.id && entidad.type === "polyline"
        ? {
            ...entidad,
            vertices: entidad.vertices.map((vertice, indice) =>
              indice === entidad.vertices.length - 1 ? { ...vertice, z: 4_500 } : vertice,
            ),
          }
        : entidad,
    ),
  };
  const avisado = run(movido, ["PIDMTO"]);
  const dichoMto = dichos(avisado.effects).join(" / ");
  ok(
    /el sólido de 6"-P-1001-CS150 quedó viejo/.test(dichoMto),
    `mover un vértice y PIDMTO lo declara: ${dichoMto}`,
  );
  const quieto = dichos(run(conSolido.document, ["PIDMTO"]).effects).join(" / ");
  ok(
    !/quedó viejo/.test(quieto),
    `y sobre la ruta sin tocar PIDMTO no acusa a nadie: ${quieto}`,
  );
}

console.log(
  `PIDROUTE/PIDMTO tecleados: ${verdes} comprobaciones verdes — la cota llega a cada vértice, el montante sale solo al cambiar de elevación y la lista de materiales cuenta metros y piezas con su límite, y al cerrar la ruta se dice contra qué se acaba de chocar, y \`Sólido\` emite el tubo facetado en el mismo lote y PIDMTO declara el que quedó viejo`,
);
