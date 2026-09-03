/**
 * SOLVIEW y SOLDRAW TECLEADOS, y aplicados.
 *
 * Que los módulos de `layout/solview*.ts` produzcan la geometría correcta ya lo
 * mide el golden. Lo que se comprueba aquí es lo otro, que es lo que separa una
 * capacidad de una biblioteca: que las dos órdenes existen en el registro, que
 * se escriben con las manos, que lo que emiten lo escribe el ejecutor por lotes
 * y que un usuario que se equivoca recibe una negativa con motivo en vez de una
 * lámina inventada.
 *
 * La regla de la casa detrás de este archivo: un módulo que nadie importa no
 * cuenta como implementado. Aquí es donde SOLVIEW deja de ser un módulo.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
} from "../command-engine";
import type { CadCommandContext } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { cadStaleSolviews } from "../../layout/solview-associativity";

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

interface Session {
  effects: CadCommandEffect[];
  document: CadDocument;
}

/** Teclea una secuencia y APLICA lo que salga, igual que hace el anfitrión. */
function run(
  document: CadDocument,
  tokens: readonly string[],
  overrides: Partial<CadCommandContext> = {},
): Session {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  let current = document;
  let ids = 0;
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
      ...overrides,
    };
    const reduction =
      token === "\r"
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

const messages = (effects: readonly CadCommandEffect[]) =>
  effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : []));

// --- 1. las dos órdenes están en el registro, con sus alias -------------------
{
  for (const [nombre, alias] of [
    ["SOLVIEW", ["SOLV", "VISTASOL"]],
    ["SOLDRAW", ["SOLD", "DIBUJOSOL"]],
  ] as const) {
    assert.ok(registry.get(nombre), `${nombre} no está en el registro`);
    for (const a of alias)
      assert.equal(registry.get(a)?.name, nombre, `el alias ${a} no lleva a ${nombre}`);
  }
}

// --- 2. SOLVIEW ALzado crea la ventana y sus cuatro capas --------------------
{
  let document = run(documento(), ["LAYOUT", "N", "Planta baja"]).document;
  const antes = document.layers.length;
  const sesion = run(document, ["SOLVIEW", "AL", "F", "Alzado sur"]);
  document = sesion.document;

  const space = document.paperSpaces[0];
  const derivadas = (space.viewports ?? []).filter((viewport) => viewport.derivation);
  assert.equal(derivadas.length, 1, "SOLVIEW no creó la ventana");
  assert.equal(derivadas[0].view?.kind, "elevation", "la ventana no se declara alzado");
  assert.deepEqual(
    derivadas[0].view?.direction,
    { x: 0, y: 1, z: 0 },
    "el alzado frontal mira hacia +Y",
  );
  assert.equal(derivadas[0].derivation?.layerBase, "ALZADO-SUR");
  assert.equal(derivadas[0].derivation?.status, "never-drawn");
  assert.equal(
    document.layers.length - antes,
    5,
    // -ROT entra con el defecto (d): el rótulo de la vista con su escala, la
    // marca de corte y el globo de detalle. Va en su propia capa para poder
    // apagarla — un juego de trabajo se imprime sin rótulos.
    "SOLVIEW debe crear exactamente cinco capas: -VIS, -HID, -HAT, -DIM y -ROT",
  );
  for (const sufijo of ["VIS", "HID", "HAT", "DIM", "ROT"])
    assert.ok(
      document.layers.some((layer) => layer.name === `ALZADO-SUR-${sufijo}`),
      `falta la capa ALZADO-SUR-${sufijo}`,
    );

  // Todo en UN paso de historia: la ventana y sus capas son una sola orden.
  const pasos = sesion.effects.filter((effect) => effect.kind === "execute").length;
  assert.equal(pasos, 1, "SOLVIEW dejó más de un paso de deshacer");
}

// --- 3. SOLDRAW dibuja, y deja la vista al día -------------------------------
{
  let document = run(documento(), ["LAYOUT", "N", "Planta baja"]).document;
  document = run(document, ["SOLVIEW", "CO", "-1000,1500", "7000,1500", "Corte A-A"]).document;
  assert.equal(cadStaleSolviews(document).length, 1, "el corte debería nacer sin dibujar");

  const antes = document.entities.length;
  document = run(document, ["SOLDRAW", "\r"]).document;
  const creadas = document.entities.length - antes;
  assert.ok(creadas > 0, "SOLDRAW no escribió ni un trazo");
  assert.ok(
    document.entities.some(
      (entity) => entity.type === "hatch" && entity.layer === "CORTE-A-A-HAT",
    ),
    "el corte se dibujó sin sombreado: es lo que lo hace acotable",
  );
  assert.equal(
    cadStaleSolviews(document).length,
    0,
    "después de SOLDRAW no puede quedar ninguna vista obsoleta",
  );

  // Y la asociatividad, tecleada de punta a punta: se mueve un muro y el
  // producto lo dice sin que nadie le avise.
  document = executeCadEntityCommandBatch(
    document,
    [{ type: "transform", entityId: "w-oeste", transform: { translation: { x: 800, y: 0 } } }],
    "MOVE",
  ).document;
  const sucias = cadStaleSolviews(document);
  assert.equal(sucias.length, 1, "mover un muro que sale en el corte debe ensuciarlo");
  const estado = run(document, ["SOLDRAW", "E"]);
  assert.ok(
    messages(estado.effects).some((text) => text.includes("sin actualizar")),
    `SOLDRAW Estado no avisa de la vista obsoleta: ${messages(estado.effects).join(" / ")}`,
  );
  // `Estado` no escribe: preguntar no puede modificar el dibujo.
  assert.equal(estado.document.meta.version, document.meta.version);
}

// --- 4. las negativas son explícitas, no láminas inventadas -------------------
{
  // Sin presentación abierta no hay dónde poner la ventana.
  const sinLamina = run(documento(), ["SOLVIEW", "PL", "\r", "Planta"]);
  assert.ok(
    messages(sinLamina.effects).some((text) => text.includes("LAYOUT")),
    `SOLVIEW sin presentación debería decirlo: ${messages(sinLamina.effects).join(" / ")}`,
  );
  assert.equal(sinLamina.document.paperSpaces.length, 0);

  // Sin modelo no hay nada de lo que derivar.
  const vacio = migrateCadDocument({
    meta: { version: 1, schema: 8, unit: "mm" },
    layers: [{ id: "0", name: "0", visible: true, locked: false, color: "#fff" }],
    entities: [],
  });
  const sinModelo = run(run(vacio, ["LAYOUT", "N", "Hoja"]).document, [
    "SOLVIEW",
    "PL",
    "\r",
    "Planta",
  ]);
  assert.ok(
    messages(sinModelo.effects).some((text) => text.includes("muros ni sólidos")),
    `SOLVIEW sin modelo debería decirlo: ${messages(sinModelo.effects).join(" / ")}`,
  );

  // Dos vistas con el mismo nombre colisionarían en sus capas.
  let document = run(documento(), ["LAYOUT", "N", "Hoja"]).document;
  document = run(document, ["SOLVIEW", "PL", "\r", "Planta"]).document;
  const repetida = run(document, ["SOLVIEW", "PL", "\r", "Planta"]);
  assert.ok(
    messages(repetida.effects).some((text) => text.includes("colisionarían")),
    `SOLVIEW con nombre repetido debería negarse: ${messages(repetida.effects).join(" / ")}`,
  );
  assert.equal(
    (repetida.document.paperSpaces[0].viewports ?? []).filter((v) => v.derivation).length,
    1,
    "la vista repetida se creó igual",
  );

  // Un detalle de una vista que no existe.
  const detalle = run(document, ["SOLVIEW", "DE", "Alzado inexistente", "Detalle 1"]);
  assert.ok(
    messages(detalle.effects).some((text) => text.includes("no es una vista creada con SOLVIEW")),
    `SOLVIEW DEtalle con padre inexistente debería decirlo: ${messages(detalle.effects).join(" / ")}`,
  );
}

// --- 5. el DEtalle hereda la cámara de su padre y se acerca ------------------
{
  let document = run(documento(), ["LAYOUT", "N", "Hoja"]).document;
  document = run(document, ["SOLVIEW", "PL", "\r", "Planta"]).document;
  // La AMPLIACIÓN se pregunta: era un ×2 fijo y sin forma de cambiarlo, que es
  // la mitad del defecto (d). Un detalle constructivo a 1:5 sobre una planta a
  // 1:100 es ×20, y con ×2 el «detalle» era la misma planta un poco más grande.
  document = run(document, ["SOLVIEW", "DE", "Planta", "10", "Detalle esquina"]).document;
  const derivadas = (document.paperSpaces[0].viewports ?? []).filter((v) => v.derivation);
  assert.equal(derivadas.length, 2);
  const padre = derivadas[0];
  const hijo = derivadas[1];
  assert.equal(hijo.view?.kind, "detail");
  assert.deepEqual(
    hijo.view?.direction,
    padre.view?.direction,
    "un detalle no es otra proyección: es la misma cámara más cerca",
  );
  assert.equal(hijo.derivation?.parentViewportId, padre.id);
  const razon = padre.derivation!.window!.width / hijo.derivation!.window!.width;
  assert.ok(
    Math.abs(razon - 10) < 1e-6,
    `el detalle se acercó ×${razon}, no ×10: la ampliación tecleada no se usó`,
  );

  // Intro acepta el valor por defecto, como cualquier orden con un valor entre
  // paréntesis angulares.
  const porDefecto = run(document, ["SOLVIEW", "DE", "Planta", "\r", "Detalle por defecto"]).document;
  const conDefecto = (porDefecto.paperSpaces[0].viewports ?? []).filter((v) => v.derivation)[2];
  assert.ok(
    Math.abs(padre.derivation!.window!.width / conDefecto.derivation!.window!.width - 2) < 1e-6,
    "sin escribir nada, el detalle se amplía ×2",
  );

  // Y una ampliación que no es un número no se redondea a ninguna parte.
  const disparate = run(document, ["SOLVIEW", "DE", "Planta", "grande", "X"]);
  assert.ok(
    messages(disparate.effects).some((text) => text.includes("no es una ampliación")),
    `una ampliación ilegible debería decirse: ${messages(disparate.effects).join(" / ")}`,
  );
}

// --- 6. la PLANTA se puede pedir CORTADA, tecleando su altura ---------------
{
  // Defecto (e): la sección sólo podía ser un plano vertical de dos puntos, así
  // que el corte horizontal —el que más se dibuja en una obra— no se podía
  // pedir. Ahora SOLVIEW Planta pregunta a qué altura corta.
  let document = run(documento(), ["LAYOUT", "N", "Hoja"]).document;
  document = run(document, ["SOLVIEW", "PL", "1200", "Baja"]).document;
  const planta = (document.paperSpaces[0].viewports ?? []).find(
    (v) => v.derivation?.layerBase === "BAJA",
  );
  assert.ok(planta, "la planta cortada se creó");
  assert.equal(planta!.view?.kind, "plan", "y se sigue llamando planta");
  assert.ok(
    planta!.view?.sectionPlane,
    "pero lleva plano de corte: es un corte horizontal, no una vista cenital",
  );
  assert.equal(
    planta!.view!.sectionPlane!.origin.z,
    1_200,
    "a la altura que se tecleó",
  );
  assert.equal(
    planta!.view!.sectionPlane!.normal.z,
    1,
    "con la normal hacia arriba: lo que queda por encima del corte se retira",
  );

  // Intro deja la planta SIN cortar, que es lo que había: una lámina antigua se
  // rehace igual.
  const sinCortar = run(document, ["SOLVIEW", "PL", "\r", "Cubierta"]).document;
  const cubierta = (sinCortar.paperSpaces[0].viewports ?? []).find(
    (v) => v.derivation?.layerBase === "CUBIERTA",
  );
  assert.ok(cubierta, "la planta sin cortar también se crea");
  assert.equal(
    cubierta!.view?.sectionPlane,
    undefined,
    "y no lleva plano de corte",
  );

  // Y una altura ilegible no se redondea a ninguna parte.
  const disparate = run(document, ["SOLVIEW", "PL", "alto", "X"]);
  assert.ok(
    messages(disparate.effects).some((t) => t.includes("no es una altura de corte")),
    `una altura ilegible debería decirse: ${messages(disparate.effects).join(" / ")}`,
  );
}

console.log(
  "OK SOLVIEW/SOLDRAW tecleados: alias, CINCO capas por vista (-VIS/-HID/-HAT/-DIM/-ROT), " +
    "corte con sombreado, aviso de obsolescencia, detalle con la ampliación que se teclea " +
    "—×2 por defecto, ilegible rechazada—, PLANTA CORTADA a la altura que se teclea " +
    "y seis negativas con motivo",
);
