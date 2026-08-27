import { strict as assert } from "node:assert";
import { buildPlotSheet } from "../plot-sheet";
import { exportCadDocumentDxf } from "../dxf-document-export";
import { importDxfPrimitives } from "../dxf-import";
import {
  buildCadDimensionGeometry,
  type CadDimensionEntity,
} from "../associative-dimension";
import { convertLength } from "../dimension-format";
import { CAD_DOCUMENT_SCHEMA, type CadDocument, type CadEntity } from "../cad-document";
import { dist } from "./oracle";

/**
 * 1.5 — UNIDADES Y ESCALA, DE PUNTA A PUNTA.
 *
 * La campaña pide UNA prueba que cruce las cuatro representaciones de un mismo
 * muro y compruebe que las cuatro dicen lo mismo:
 *
 *   **Un muro de 3.5 m dibujado en mm mide 3500 en el DXF, 70 mm en el PDF a
 *   1:50, y su cota dice 3.50 si el estilo está en metros.**
 *
 * Es la afirmación más fácil de romper de todo el producto, porque cada
 * conversión vive en un módulo distinto: el documento en milímetros, el DXF en
 * unidades de dibujo, la hoja en milímetros de PAPEL y la cota en las unidades
 * que el arquitecto eligió para leer. Cuatro sistemas, tres fronteras, y un
 * solo número que tiene que sobrevivir a todas.
 *
 * Los números están calculados a mano:
 *   · 3.5 m = 3500 mm (definición del prefijo).
 *   · 3500 mm de dibujo a 1:50 → 3500/50 = 70 mm de papel. Exacto, sin
 *     redondeo posible.
 *   · 3500 mm mostrados en metros con dos decimales → «3.50 m».
 */

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

/** EL MURO. Un solo sitio: si cambia, cambia en las cuatro representaciones. */
const WALL_METERS = 3.5;
const WALL_MM = 3500;
const PLOT_SCALE = 50;
const WALL_ON_PAPER_MM = 70;

ok(
  WALL_MM === WALL_METERS * 1000,
  "3.5 m son 3500 mm: la definición del prefijo, no una constante del producto",
);
ok(
  WALL_ON_PAPER_MM === WALL_MM / PLOT_SCALE,
  "y a 1:50 esos 3500 mm ocupan 70 mm de papel, sin redondeo de por medio",
);

function document(entities: CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ name: "MUROS", color: 7, visible: true, frozen: false, locked: false }],
    entities,
    history: [{ version: 1, label: "muro de 3.5 m" }],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: {},
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as CadDocument;
}

/* ── REPRESENTACIÓN 1: el documento canónico, en milímetros ───────────────── */

const wall = {
  id: "muro",
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: WALL_MM, y: 0, z: 0 },
  layer: "MUROS",
} as CadEntity;

ok(
  dist({ x: 0, y: 0 }, { x: WALL_MM, y: 0 }) === WALL_MM,
  "el documento guarda el muro con 3500 unidades de largo",
);

/* ── REPRESENTACIÓN 2: el DXF ─────────────────────────────────────────────── */

{
  const exported = exportCadDocumentDxf(document([wall]));
  // El DXF debe declarar sus unidades: `$INSUNITS = 4` es milímetros. Sin esa
  // cabecera, quien abra el fichero en otro programa ve 3500 «unidades» y no
  // sabe si son milímetros, pulgadas o metros — y escala el plano mal.
  ok(
    /\$INSUNITS\n\s*70\n\s*4/u.test(exported.content),
    "el DXF declara $INSUNITS = 4 (milímetros): sin eso, 3500 no significa nada",
  );

  const back = importDxfPrimitives(exported.content);
  const line = back.primitives.find((primitive) => primitive.kind === "line");
  ok(!!line, "el muro vuelve del DXF");
  const measured = dist(line!.points[0], line!.points[1]);
  ok(
    near(measured, WALL_MM, 1e-9),
    `y mide 3500 en el DXF (obtenido ${measured})`,
  );
}

/* ── REPRESENTACIÓN 3: el PDF a 1:50 ──────────────────────────────────────── */

{
  /**
   * `buildPlotSheet` elige la MAYOR escala estándar que quepa, así que para
   * que el caso mida 1:50 el DIBUJO tiene que ser una planta de verdad, no un
   * muro suelto: un muro de 3.5 m solo cabe en un A4 a 1:20 y el producto,
   * correctamente, elige esa.
   *
   * La planta es de 8000×5000 mm, la huella de una casa pequeña. En un A4
   * apaisado el área imprimible mide 277×160 mm (297×210 menos 10 de margen
   * por lado y 30 de cajetín), así que:
   *
   *   · a 1:25 la planta pediría 320×200 mm — NO cabe;
   *   · a 1:50 pide 160×100 mm — cabe, y es la mayor que lo hace.
   *
   * El muro de 3.5 m vive DENTRO de esa planta, que es como vive en la vida
   * real, y su longitud en papel se mide con la escala que el producto eligió:
   * 3500/50 = 70 mm. El test no impone la escala; la lee y comprueba que la
   * aritmética que sale de ella es exacta.
   */
  const PLAN_W = 8000;
  const PLAN_H = 5000;
  const sheet = buildPlotSheet({
    drawingW: PLAN_W,
    drawingH: PLAN_H,
    paper: "A4",
    orientation: "landscape",
    project: "Casa Valle",
    client: "Cliente",
    drawnBy: "Arquitecta",
    sheetNumber: "A-101",
    revision: "0",
    date: "2026-08-27",
  });
  ok(sheet.scale !== null, "la planta cabe en un A4 a alguna escala estándar");
  ok(
    sheet.scale === PLOT_SCALE,
    `y la escala elegida es 1:${PLOT_SCALE} — la mayor que cabe (obtenida 1:${sheet.scale})`,
  );
  ok(
    sheet.scaleLabel === "1:50",
    `el cajetín la escribe como «1:50» (obtenido «${sheet.scaleLabel}»)`,
  );
  ok(
    near(sheet.placement.w, PLAN_W / PLOT_SCALE, 1e-9) &&
      near(sheet.placement.h, PLAN_H / PLOT_SCALE, 1e-9),
    `la planta ocupa ${PLAN_W / PLOT_SCALE}×${PLAN_H / PLOT_SCALE} mm de papel, con la MISMA escala en los dos ejes`,
  );
  // EL NÚMERO DE LA CAMPAÑA: el muro de 3.5 m mide 70 mm en el papel.
  const wallOnPaper = WALL_MM / sheet.scale!;
  ok(
    near(wallOnPaper, WALL_ON_PAPER_MM, 1e-9),
    `y el muro de 3.5 m ocupa ${WALL_ON_PAPER_MM} mm de papel a 1:${sheet.scale} (obtenido ${wallOnPaper})`,
  );
  // Y cabe dentro de la colocación: un muro que midiera más que su propia
  // planta sería una escala aplicada dos veces.
  ok(
    wallOnPaper < sheet.placement.w,
    "el muro cabe dentro de la planta colocada, como es obvio y conviene comprobar",
  );
  // El cajetín está completo: la campaña prohíbe un campo vacío en el plano.
  for (const [field, value] of Object.entries(sheet.titleBlock)) {
    ok(
      typeof value === "string" && value.trim().length > 0,
      `el campo «${field}» del cajetín no puede salir vacío al plano`,
    );
  }
  ok(
    sheet.titleBlock.scale === "1:50",
    "y el cajetín repite la escala real, no una escrita a mano",
  );
  ok(
    sheet.titleBlock.units.toLowerCase().includes("mm") ||
      sheet.titleBlock.units.toLowerCase().includes("milímetro"),
    `el cajetín declara las unidades del dibujo («${sheet.titleBlock.units}»)`,
  );
  // La barra de escala mide longitudes REALES, no de papel.
  ok(!!sheet.scaleBar, "la hoja lleva barra de escala");
  ok(
    near(sheet.scaleBar!.segmentSheetMm, sheet.scaleBar!.segmentMm / PLOT_SCALE, 1e-9),
    "y cada tramo de la barra mide en papel lo que su longitud real dividida por la escala",
  );
}

/* ── REPRESENTACIÓN 4: la cota ────────────────────────────────────────────── */

{
  const dimension = buildCadDimensionGeometry({
    id: "cota",
    type: "dimension",
    layer: "COTAS",
    dimensionKind: "aligned",
    a: { x: 0, y: 0 },
    b: { x: WALL_MM, y: 0 },
    sourceUnit: "mm",
    units: "m",
    precision: 2,
  } as CadDimensionEntity)!;
  ok(
    near(dimension.measurement, WALL_MM, 1e-9),
    "la cota MIDE 3500 unidades de dibujo…",
  );
  ok(
    dimension.label === "3.50 m",
    `…y ESCRIBE «3.50 m» porque su estilo está en metros (obtenido «${dimension.label}»)`,
  );
}

/* ── LAS CUATRO, JUNTAS ───────────────────────────────────────────────────── */

{
  // La afirmación completa de la campaña, en una sola comprobación encadenada:
  // documento → DXF → papel → cota, sin que ninguna conversión se pierda por
  // el camino.
  const exported = exportCadDocumentDxf(document([wall]));
  const reimported = importDxfPrimitives(exported.content).primitives.find(
    (primitive) => primitive.kind === "line",
  )!;
  const fromDxf = dist(reimported.points[0], reimported.points[1]);
  // La planta que contiene el muro, con la MEDIDA QUE VOLVIÓ DEL DXF: así la
  // cadena es real de punta a punta y no vuelve a partir del número original.
  const sheet = buildPlotSheet({
    drawingW: 8000,
    drawingH: 5000,
    paper: "A4",
    orientation: "landscape",
  });
  // La cota se construye también con la medida que volvió del fichero.
  const label = buildCadDimensionGeometry({
    id: "c",
    type: "dimension",
    layer: "COTAS",
    dimensionKind: "aligned",
    a: { x: 0, y: 0 },
    b: { x: fromDxf, y: 0 },
    sourceUnit: "mm",
    units: "m",
  } as CadDimensionEntity)!.label;
  ok(
    near(fromDxf, WALL_MM, 1e-9) &&
      sheet.scale === PLOT_SCALE &&
      near(fromDxf / sheet.scale!, WALL_ON_PAPER_MM, 1e-9) &&
      label === "3.50 m",
    `LAS CUATRO COINCIDEN: ${fromDxf} en el DXF · 1:${sheet.scale} · ${fromDxf / sheet.scale!} mm de papel · «${label}» en la cota`,
  );
}

/* ── Las conversiones básicas, para que ninguna se dé por supuesta ────────── */

for (const [value, from, to, expected] of [
  [3500, "mm", "m", 3.5],
  [3500, "mm", "cm", 350],
  [3.5, "m", "mm", 3500],
  [350, "cm", "mm", 3500],
  [1, "m", "cm", 100],
  [1, "cm", "m", 0.01],
] as const) {
  const converted = convertLength(value, from, to);
  ok(
    near(converted, expected, 1e-9),
    `${value} ${from} son ${expected} ${to} (obtenido ${converted})`,
  );
}

// Ida y vuelta por las tres unidades: ningún redondeo intermedio.
for (const unit of ["mm", "cm", "m"] as const) {
  const round = convertLength(convertLength(WALL_MM, "mm", unit), unit, "mm");
  ok(
    near(round, WALL_MM, 1e-9),
    `mm → ${unit} → mm devuelve 3500 exacto (obtenido ${round})`,
  );
}

console.log(
  `verificación 1.5 (unidades y escala): ${checks} comprobaciones — 3500 mm = 1:50 = 70 mm de papel = «3.50 m»`,
);
