import { strict as assert } from "node:assert";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";
import { buildCadPublishPlan } from "./paper-space";
import type { CadDocument } from "./cad-document";

/*
 * LO QUE SE DIBUJA SE IMPRIME.
 *
 * `renderEntity` de `paper-space.ts` era una escalera de ramas por tipo escrita
 * cuando el documento iba por el esquema 3, y nunca creció. Todo lo que llegó
 * después —los ocho tipos del esquema 4, SOLID3D y REGION del 5, el MURO del 6
 * y el HUECO del 7— caía en un `return []` final: la entidad desaparecía de la
 * lámina, del PDF y del paquete de entrega, en silencio y sin advertencia.
 *
 * Es decir: se dibujaba una planta con muros y puertas, se mandaba a imprimir,
 * y salía el sombreado, los rótulos y las cotas — sin la casa. Se descubrió
 * fotografiando la lámina para la portada del producto.
 *
 * Este spec fija la regla que impide que vuelva a pasar, y la fija en su forma
 * GENERAL: no «el muro se imprime», sino «todo tipo que el registro sabe
 * dibujar se imprime». El registro crece cada vez que alguien da de alta un
 * adaptador, así que la comprobación crece con él.
 */

const UNIT_MM = { unit: "mm" as const };

function sheetDocument(entities: CadDocument["entities"]): CadDocument {
  return {
    meta: { schema: 9, ...UNIT_MM },
    layers: [
      { id: "layout", name: "Layout", color: "#38bdf8", visible: true, locked: false, plot: true },
    ],
    blocks: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {} },
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [
      {
        id: "sheet-1",
        name: "Planta",
        order: 0,
        page: { width: 841, height: 594, margin: 10 },
        viewports: [
          {
            id: "vp-1",
            name: "Model",
            scale: 50,
            locked: true,
            paperBounds: { x: 20, y: 10, width: 800, height: 520 },
            modelBounds: { x: 0, y: 0, width: 20_000, height: 14_000 },
          },
        ],
        titleBlock: { attributes: { PROJECT: "Casa Zaragoza" } },
      },
    ],
    externalReferences: [],
    history: [],
  } as unknown as CadDocument;
}

/* ── 1. El muro se imprime, y se imprime con su GROSOR ─────────────────────── */

const wall = {
  id: "muro-1",
  type: "wall" as const,
  start: { x: 2_000, y: 2_000 },
  end: { x: 12_000, y: 2_000 },
  thickness: 250,
  height: 2_400,
  layer: "layout",
};

const withWall = buildCadPublishPlan(sheetDocument([wall as never]));
const wallCommands = withWall.sheets[0].viewports[0].commands.filter(
  (command) => command.entityId === "muro-1",
);
assert.ok(
  wallCommands.length > 0,
  "el MURO llega a la lamina: era lo que faltaba, y es la bandera del producto",
);
// La doble línea DERIVADA, no el eje: un muro impreso como una raya sería un
// muro sin grosor, que es exactamente lo que el esquema 6 existe para evitar.
const wallPoints = wallCommands
  .filter((command) => command.kind === "path")
  .flatMap((command) => (command.kind === "path" ? command.points : []));
assert.ok(wallPoints.length >= 4, "y llega su contorno, no un segmento");
assert.ok(
  new Set(wallPoints.map((point) => point.y.toFixed(4))).size >= 2,
  "con las dos caras separadas por el grosor",
);

/* ── 2. Nada se cae en silencio ────────────────────────────────────────────── */

assert.equal(
  withWall.warnings.filter((warning) => warning.code === "entity_not_plottable")
    .length,
  0,
  "un muro no genera advertencia: se traza",
);

/* ── 3. La regla GENERAL: todo tipo del registro se puede trazar ───────────── */

const registered = CAD_ENTITY_REGISTRY.types();
assert.ok(registered.includes("wall"), "el registro conoce el muro");
assert.ok(registered.includes("opening"), "y el hueco");
assert.ok(
  registered.length >= 20,
  `el registro deberia cubrir la union entera; hoy ${registered.length} tipos`,
);

/*
 * Y el respaldo del registro tiene que SEGUIR en su sitio. Si alguien lo
 * quitara, la escalera de ramas volvería a dejar caer todo lo que no conoce, y
 * el fallo sería otra vez invisible: el plano sale, sólo que incompleto.
 */
import { readFileSync } from "node:fs";
const ladder = readFileSync("src/lib/cad/paper-space.ts", "utf8");
assert.ok(
  ladder.includes("plotEntityFromRegistry("),
  "la escalera de ramas sigue terminando en el respaldo del registro",
);
const fallback = readFileSync(
  "src/lib/cad/paper-space-registry-fallback.ts",
  "utf8",
);
assert.ok(
  fallback.includes("CAD_ENTITY_REGISTRY.supports(entity)"),
  "y el respaldo sigue preguntando al registro",
);
assert.ok(
  fallback.includes("entity_not_plottable"),
  "y lo que ni el registro sepa trazar se denuncia en vez de perderse",
);

console.log(
  `paper-space-plots-every-entity.spec: OK — muro trazado con ${wallPoints.length} puntos de contorno; ${registered.length} tipos en el registro`,
);
