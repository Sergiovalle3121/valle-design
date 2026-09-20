import { strict as assert } from "node:assert";
import { CAD_DOCUMENT_SCHEMA } from "./cad-document-shared";
import {
  cadDimensionStyleBake,
  resolveCadDimensionStyle,
} from "./dimension-style";
import { readFileSync } from "node:fs";
import { migrateCadDocument, type CadDocument, type CadEntity } from "./cad-document";
import { buildCadDimensionGeometry, type CadDimensionEntity } from "./associative-dimension";
import { CAD_COMMAND_REGISTRY_V2 } from "./engine";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "./engine/command-types";
import "./engine/all-commands";

/*
 * DIMSTYLE GOBIERNA EL DIBUJO, NO SÓLO LA TABLA.
 *
 * El núcleo de ~30 DIMVARs existía entero: se definían, se editaban, se
 * persistían y viajaban por DXF como tabla DIMSTYLE. Pero la ENTIDAD de cota no
 * llevaba encima la altura de texto, ni los colores, ni la posición del rótulo,
 * así que el render no tenía de dónde leerlos y el plano salía IGUAL con
 * cualquier norma de acotación. Para un despacho eso significa que puede fijar
 * su norma y el plano no le hace caso — que es no poder fijarla.
 *
 * Esta spec fija el camino completo: la definición se HORNEA en la entidad, la
 * entidad llega al render, y el DXF la lleva y la trae.
 */

/* ── 1. El horneado emite los siete campos del esquema 10 ─────────────────── */

const norma = resolveCadDimensionStyle(
  {
    text: {},
    dimension: {
      Standard: {},
      "NORMA-DESPACHO": {
        textHeight: 250,
        textStyle: "ROTULO",
        textColor: "#ff0000",
        dimLineColor: "#00ff00",
        extensionLineColor: "#0000ff",
        textVertical: "above",
        textJustification: "first",
        overallScale: 2,
      },
    },
    mleader: {},
    table: {},
  } as never,
  "NORMA-DESPACHO",
);

const baked = cadDimensionStyleBake(norma);

// La ALTURA escala con DIMSCALE, como los demás tamaños: 250 × 2.
assert.equal(baked.textHeight, 500, "DIMTXT se hornea y escala con DIMSCALE");
// Los colores y las posiciones NO son medidas: DIMSCALE no los toca.
assert.equal(baked.textStyle, "ROTULO", "DIMTXSTY se hornea");
assert.equal(baked.textColor, "#ff0000", "DIMCLRT se hornea");
assert.equal(baked.dimLineColor, "#00ff00", "DIMCLRD se hornea");
assert.equal(baked.extensionLineColor, "#0000ff", "DIMCLRE se hornea");
assert.equal(baked.textVertical, "above", "DIMTAD se hornea");
assert.equal(baked.textJustification, "first", "DIMJUST se hornea");

// Un estilo que no declara nada no hornea nada: ausente sigue ausente, y una
// cota que no trae override se sigue dibujando como se dibujaba.
const vacio = cadDimensionStyleBake({});
assert.equal(vacio.textColor, undefined);
assert.equal(vacio.textVertical, undefined);

/* ── 2. El render los CONSUME ─────────────────────────────────────────────── */

const three = readFileSync("src/lib/cad/entity-three.ts", "utf8");
assert.ok(
  three.includes("entity.textHeight ?? (entity.arrowSize ?? 180) * 0.55"),
  "la altura del rótulo sale de DIMTXT, con la fórmula vieja como respaldo",
);
assert.ok(
  !three.includes("height: Math.max(1, (entity.arrowSize ?? 180) * 0.55)"),
  "y ya no se DERIVA del tamaño de flecha, que era el defecto",
);
assert.ok(
  three.includes("cadDimensionTextContext(entity)"),
  "y el color del rótulo (DIMCLRT) llega por el contexto de presentación",
);

/* ── 3. El DXF lo lleva y lo trae ─────────────────────────────────────────── */

const write = readFileSync("src/lib/cad/dxf-write-dimensions.ts", "utf8");
const read = readFileSync("src/lib/cad/dxf-read-annotations.ts", "utf8");
for (const key of [
  "textHeight",
  "textStyle",
  "textColor",
  "dimLineColor",
  "extensionLineColor",
  "textVertical",
  "textJustification",
]) {
  assert.ok(write.includes(`${key}=`), `el DXF ESCRIBE ${key}`);
  assert.ok(read.includes(`"${key}"`), `y el DXF LEE ${key}`);
}

/*
 * La altura vuelve ESCALADA por la proyección, porque es una medida; los
 * colores y las posiciones vuelven tal cual, porque no lo son. Confundirlos
 * haría que importar un DXF en pulgadas cambiara el color del rótulo.
 */
const toEntities = readFileSync("src/lib/cad/dxf-cad-document.ts", "utf8");
assert.ok(
  toEntities.includes("cadSchema10ScaledFields(dimension, scaleFactor)"),
  "la altura importada pasa por el escalado del esquema 10",
);
/*
 * Y la REGLA de qué escala vive en `cad-entities-v10.ts`, no en el importador:
 * es una regla del esquema, no del formato. Quien añada un campo al v10 tiene
 * que decidirlo allí, y allí está la única multiplicación.
 */
const v10 = readFileSync("src/lib/cad/cad-entities-v10.ts", "utf8");
assert.ok(
  v10.includes("textHeight: source.textHeight * scaleFactor"),
  "la altura escala con la proyección",
);
for (const noEsMedida of [
  "textColor",
  "dimLineColor",
  "extensionLineColor",
  "textVertical",
  "textJustification",
  "textStyle",
]) {
  assert.ok(
    !v10.includes(`${noEsMedida} * scaleFactor`),
    `${noEsMedida} no es una medida y no puede multiplicarse por nada`,
  );
}

/* ── 4. La subida de esquema es ADITIVA y está declarada ──────────────────── */

assert.equal(CAD_DOCUMENT_SCHEMA, 10, "los DIMVARs de dibujo estrenan el v10");
const shared = readFileSync("src/lib/cad/cad-document-shared.ts", "utf8");
assert.ok(
  shared.includes("v10 estrena los DIMVARs"),
  "y la subida está explicada donde viven las demás",
);
assert.ok(
  shared.includes("Todo aditivo, en las siete subidas"),
  "declarada como aditiva, igual que las seis anteriores",
);

/* ── 5. Ola 7: nace con el estilo, y una norma alcanza a TODAS sus cotas ──── */

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });

function drive(
  name: string,
  inputs: readonly CadCommandInput[],
  context: CadCommandContext,
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} en registro`);
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

/** La flecha del extremo `a` de una cota lineal/alineada, proyectada sobre el
 * eje de la cota: es exactamente `arrowSize`, sea cual sea el terminador. */
function arrowReach(entity: CadDimensionEntity): number {
  const geometry = buildCadDimensionGeometry(entity);
  assert.ok(geometry, "la cota construye geometría");
  const arrow = geometry!.paths.find((path) => path.role === "arrow");
  assert.ok(arrow, "la cota tiene flecha");
  const dx = entity.b.x - entity.a.x;
  const dy = entity.b.y - entity.a.y;
  const length = Math.hypot(dx, dy);
  const unit = { x: dx / length, y: dy / length };
  const other = arrow!.points.find((point) => point.x !== arrow!.points[0].x || point.y !== arrow!.points[0].y)!;
  const from = arrow!.points[0];
  return Math.abs((other.x - from.x) * unit.x + (other.y - from.y) * unit.y);
}

{
  let doc: CadDocument = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#fff", visible: true, locked: false }],
    entities: [],
    modelSpace: { entityIds: [] },
  } as never);
  doc.styles.dimension.NORMA = { arrowSize: 50 };

  const contextFor = (): CadCommandContext => ({
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (id) => doc.entities.find((entity) => entity.id === id),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `d${doc.entities.length + 1}`,
    document: () => doc,
    variables: {
      get: (name) => (name === "DIMSTYLE" ? "NORMA" : undefined),
      set: () => ({ ok: true as const, value: "" }),
      publish: () => ({ ok: true as const, value: "" }),
    },
  });

  // Dos cotas DISTINTAS, las dos con el estilo NORMA (arrowSize 50) vigente.
  const r1 = drive("DIMLINEAR", [point(0, 0), point(1000, 0), point(500, 300)], contextFor());
  const r2 = drive("DIMLINEAR", [point(0, 500), point(2000, 500), point(1000, 900)], contextFor());
  assert.ok(r1?.kind === "document" && r2?.kind === "document", "las dos cotas se crean");
  const d1 = (r1 as Extract<CadCommandResult, { kind: "document" }>).commands[0];
  const d2 = (r2 as Extract<CadCommandResult, { kind: "document" }>).commands[0];
  assert.ok(d1.type === "insert" && d2.type === "insert");
  doc = { ...doc, entities: [...doc.entities, d1.entity as CadEntity, d2.entity as CadEntity] } as CadDocument;

  // NACE con el estilo: sin correr Aplicar, las dos YA dibujan a 50, no al
  // default de fábrica (180) — la norma llegó al nacer, no al modificar.
  const dim1 = doc.entities.find((e) => e.id === (d1 as { entity: { id: string } }).entity.id) as CadDimensionEntity;
  const dim2 = doc.entities.find((e) => e.id === (d2 as { entity: { id: string } }).entity.id) as CadDimensionEntity;
  assert.ok(Math.abs(arrowReach(dim1) - 50) < 1e-6, `d1 nace con DIMASZ del estilo (dio ${arrowReach(dim1)})`);
  assert.ok(Math.abs(arrowReach(dim2) - 50) < 1e-6, `d2 nace con DIMASZ del estilo (dio ${arrowReach(dim2)})`);

  // Cambia la NORMA (arrowSize 50 → 500) y corre DIMSTYLE → Aplicar: la
  // geometría CONSTRUIDA de las DOS cotas cambia, no sólo la primera.
  doc = { ...doc, styles: { ...doc.styles, dimension: { NORMA: { arrowSize: 500 } } } };
  const applied = drive("DIMSTYLE", [{ kind: "keyword", keyword: "Aplicar" }, { kind: "text", value: "NORMA" }], contextFor());
  assert.ok(applied?.kind === "document", "Aplicar escribe");
  const replaces = (applied as Extract<CadCommandResult, { kind: "document" }>).commands;
  assert.equal(replaces.length, 2, "Aplicar re-hornea LAS DOS cotas del estilo, no sólo una");
  for (const command of replaces) {
    assert.ok(command.type === "replace");
    const next = (command as { entity: CadDimensionEntity }).entity;
    assert.ok(Math.abs(arrowReach(next) - 500) < 1e-6, `${next.id}: la geometría construida sigue a la norma (dio ${arrowReach(next)})`);
  }
}

console.log(
  "dimension-style-governs-drawing.spec: OK — DIMTXT, DIMTXSTY, DIMCLRT/D/E, DIMTAD y DIMJUST horneados, renderizados y con ida y vuelta por DXF; " +
    "Ola 7: la cota nace con el estilo vigente y DIMSTYLE alcanza a TODAS las cotas que lo usan, medido en la geometría construida",
);
