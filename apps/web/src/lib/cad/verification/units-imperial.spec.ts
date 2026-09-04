import { strict as assert } from "node:assert";
import { buildPlotSheet } from "../plot-sheet";
import { exportCadDocumentDxf } from "../dxf-document-export";
import { importDxfPrimitives } from "../dxf-import";
import {
  buildCadDimensionGeometry,
  type CadDimensionEntity,
} from "../associative-dimension";
import { CAD_DOCUMENT_SCHEMA, type CadDocument, type CadEntity } from "../cad-document";
import { createCadVariableAccess } from "../system-variables";
import { parseCadLengthInDrawingUnits, parseImperialLength } from "../units-imperial";
import { cadLengthLabel, cadLengthLabelFromVariables } from "../units-label";
import { dist } from "./oracle";

/**
 * 1.5-bis — UNIDADES IMPERIALES, DE PUNTA A PUNTA.
 *
 * Gemelo imperial de `units-and-scale.spec.ts`. Aquélla cruza un muro de 3.5 m
 * por el documento, el DXF, el papel y la cota; ésta cruza el mismo tipo de
 * número por las cuatro representaciones que el frente F4 controla, empezando
 * una etapa antes: por el TECLADO, que es donde las unidades imperiales estaban
 * rotas de verdad.
 *
 *   **`10'-6"` tecleado son 3200.4 mm de dibujo, se rotulan `10'-6"` con
 *   LUNITS 4 y LUPREC 4, y ocupan 64.008 mm de papel a 1:50.**
 *
 * Los números están calculados a mano y ninguno sale de un módulo del producto:
 *   · 10'-6" son 10×12+6 = 126 pulgadas (definición del pie).
 *   · 126 pulgadas × 25.4 = 3200.4 mm (la pulgada internacional, exacta desde
 *     1959).
 *   · 3200.4 mm de dibujo a 1:50 → 3200.4/50 = 64.008 mm de papel. Exacto.
 *
 * La cadena es de ida Y de vuelta: lo que se teclea se guarda, y lo que se
 * guarda se vuelve a leer igual. Si cualquiera de las dos mitades se desvía, el
 * dibujante teclea `10'-6"` y lee otra cosa — que es peor que no poder teclearlo.
 *
 * Correr:  npx tsx src/lib/cad/verification/units-imperial.spec.ts
 */

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

/** EL MURO. Un solo sitio: si cambia, cambia en las cuatro representaciones. */
const TECLEADO = `10'-6"`;
const WALL_INCHES = 126;
const WALL_MM = 3200.4;
const PLOT_SCALE = 50;
const WALL_ON_PAPER_MM = 64.008;

ok(
  WALL_INCHES === 10 * 12 + 6,
  "10'-6\" son 126 pulgadas: la definición del pie, no una constante del producto",
);
ok(
  near(WALL_MM, WALL_INCHES * 25.4, 1e-9),
  "y 126 pulgadas son 3200.4 mm, con la pulgada internacional de 25.4 exactos",
);
ok(
  near(WALL_ON_PAPER_MM, WALL_MM / PLOT_SCALE, 1e-9),
  "y a 1:50 esos 3200.4 mm ocupan 64.008 mm de papel, sin redondeo de por medio",
);

function document(entities: CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ name: "MUROS", color: 7, visible: true, frozen: false, locked: false }],
    entities,
    history: [{ version: 1, label: "muro de 10'-6\"" }],
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

/* ── REPRESENTACIÓN 1: EL TECLADO ─────────────────────────────────────────── */

/**
 * La etapa que no existía. Medido el 2026-09-04: `parseCoordinate` de
 * `precision-input.ts` devuelve `{ok:false}` para las quince formas imperiales
 * de `units-imperial.spec.ts`, porque analiza con `Number(s)`.
 */
const entrada = parseCadLengthInDrawingUnits(TECLEADO, { drawingUnit: "mm" });
ok(entrada.ok, `«${TECLEADO}» se teclea y se lee`);
if (!entrada.ok) throw new Error(entrada.error);
ok(
  near(entrada.inches, WALL_INCHES, 1e-9),
  `«${TECLEADO}» son 126 pulgadas (obtenido ${entrada.inches})`,
);
ok(
  near(entrada.value, WALL_MM, 1e-9),
  `y en un dibujo en milímetros se guardan como 3200.4 (obtenido ${entrada.value})`,
);
ok(entrada.explicit, "la medida traía marca de pie y de pulgada: no hubo que adivinar nada");

// Y lo ambiguo no entra: un número equivocado en un plano cuesta más que un
// rechazo, porque nadie lo ve hasta que el muro está levantado.
ok(!parseImperialLength(`1'2'`).ok, "«1'2'» se niega en vez de inventarse una medida");

/* ── REPRESENTACIÓN 2: EL DOCUMENTO, EN MILÍMETROS ────────────────────────── */

const wall = {
  id: "muro",
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: entrada.value, y: 0, z: 0 },
  layer: "MUROS",
} as CadEntity;

ok(
  near(dist({ x: 0, y: 0 }, { x: entrada.value, y: 0 }), WALL_MM, 1e-9),
  "el documento guarda el muro con 3200.4 unidades de largo",
);

/* ── REPRESENTACIÓN 3: EL RÓTULO ──────────────────────────────────────────── */

{
  // Las variables VIVAS del dibujo: milímetros ($INSUNITS 4), arquitectónico
  // (LUNITS 4) y 1/16 de pulgada (LUPREC 4), que es la precisión con la que se
  // dibuja en pies y pulgadas.
  const variables = createCadVariableAccess({ INSUNITS: 4, LUNITS: 4, LUPREC: 4 });
  const rotulo = cadLengthLabelFromVariables(entrada.value, variables);
  ok(
    rotulo === TECLEADO,
    `lo tecleado vuelve a leerse igual: «${rotulo}» (esperado «${TECLEADO}»)`,
  );

  // Y la vuelta completa: el rótulo se relee y da el mismo número, al bit.
  const releido = parseCadLengthInDrawingUnits(rotulo, { drawingUnit: "mm" });
  ok(
    releido.ok && near(releido.value, entrada.value, 1e-9),
    "y el rótulo se puede volver a teclear: la cadena se cierra",
  );

  // Cambiar UNITS cambia el rótulo y NO cambia el dibujo. Es la propiedad que
  // separa la medida de su escritura, y la que hace que el mismo fichero sirva
  // a un despacho en Houston y a otro en Monterrey.
  variables.set("LUNITS", 2);
  variables.set("LUPREC", 1);
  ok(
    cadLengthLabelFromVariables(entrada.value, variables) === "3200.4",
    "con LUNITS 2 el mismo muro dice «3200.4», y el muro no se ha movido",
  );
  variables.set("LUNITS", 3);
  variables.set("LUPREC", 2);
  ok(
    cadLengthLabelFromVariables(entrada.value, variables) === `10'-6.00"`,
    "y con LUNITS 3 (ingeniería) dice «10'-6.00\"»",
  );
}

/* ── REPRESENTACIÓN 4: EL PAPEL ───────────────────────────────────────────── */

let escalaElegida = 0;
{
  /**
   * Igual que en `units-and-scale.spec.ts`: `buildPlotSheet` elige la MAYOR
   * escala estándar que quepa, así que el muro tiene que vivir dentro de una
   * planta de verdad. La planta de 8000×5000 mm en un A4 apaisado cae en 1:50,
   * que es la escala del caso.
   */
  const sheet = buildPlotSheet({
    drawingW: 8000,
    drawingH: 5000,
    paper: "A4",
    orientation: "landscape",
    project: "Casa Valle",
    client: "Cliente",
    drawnBy: "Arquitecta",
    sheetNumber: "A-101",
    revision: "0",
    date: "2026-09-04",
  });
  ok(sheet.scale === PLOT_SCALE, `la escala elegida es 1:50 (obtenida 1:${sheet.scale})`);
  escalaElegida = sheet.scale!;
  const enPapel = entrada.value / sheet.scale!;
  ok(
    near(enPapel, WALL_ON_PAPER_MM, 1e-9),
    `EL NÚMERO: el muro de 10'-6" ocupa 64.008 mm de papel a 1:50 (obtenido ${enPapel})`,
  );
  ok(
    enPapel < sheet.placement.w,
    "y cabe dentro de la planta colocada, como es obvio y conviene comprobar",
  );
}

/* ── LAS CUATRO, JUNTAS ───────────────────────────────────────────────────── */

{
  // Teclado → documento → DXF → papel → rótulo, sin volver a partir del número
  // original en ningún tramo.
  const tecleado = parseCadLengthInDrawingUnits(TECLEADO, { drawingUnit: "mm" });
  ok(tecleado.ok, "se teclea");
  if (!tecleado.ok) throw new Error(tecleado.error);
  const exported = exportCadDocumentDxf(
    document([{ ...wall, end: { x: tecleado.value, y: 0, z: 0 } } as CadEntity]),
  );
  ok(
    /\$INSUNITS\n\s*70\n\s*4/u.test(exported.content),
    "el DXF declara $INSUNITS = 4 (milímetros): sin eso, 3200.4 no significa nada",
  );
  const back = importDxfPrimitives(exported.content).primitives.find(
    (primitive) => primitive.kind === "line",
  );
  ok(!!back, "el muro vuelve del DXF");
  const delDxf = dist(back!.points[0], back!.points[1]);
  const enPapel = delDxf / escalaElegida;
  const rotulo = cadLengthLabel(delDxf, { drawingUnit: "mm", lunits: 4, luprec: 4 });
  ok(
    near(delDxf, WALL_MM, 1e-9) &&
      near(enPapel, WALL_ON_PAPER_MM, 1e-9) &&
      rotulo === TECLEADO,
    `LAS CUATRO COINCIDEN: «${TECLEADO}» tecleado · ${delDxf} en el DXF · ${enPapel} mm de papel a 1:${escalaElegida} · «${rotulo}» rotulado`,
  );
}

/* ── LA FRONTERA, MEDIDA Y DICHA ──────────────────────────────────────────── */

/**
 * Lo que ESTA verificación NO puede cerrar todavía, porque vive fuera del
 * territorio del frente. Se mide y se imprime; no se asevera ni en un sentido
 * ni en el otro, para que la spec siga siendo cierta cuando las peticiones se
 * apliquen.
 *
 *  · El DXF no escribe `$LUNITS` ni `$LUPREC` (P-express-09): el ajuste
 *    arquitectónico del dibujo no viaja con el fichero. Si algún día los
 *    escribe, tienen que decir 4 y 4 — y eso sí se comprueba.
 *  · La cota rotula en decimal aunque su unidad sea la pulgada (P-express-08):
 *    dice «126.0000 in» donde el plano lleva «10'-6"».
 */
const exportado = exportCadDocumentDxf(document([wall]));
const lunitsViaja = /\$LUNITS/u.test(exportado.content);
if (lunitsViaja) {
  ok(
    /\$LUNITS\n\s*70\n\s*4/u.test(exportado.content),
    "si el DXF escribe $LUNITS, tiene que decir 4 (arquitectónico)",
  );
}

const cota = buildCadDimensionGeometry({
  id: "cota",
  type: "dimension",
  layer: "COTAS",
  dimensionKind: "aligned",
  a: { x: 0, y: 0 },
  b: { x: WALL_MM, y: 0 },
  sourceUnit: "mm",
  units: "in",
  precision: 4,
} as CadDimensionEntity)!;
ok(
  near(cota.measurement, WALL_MM, 1e-9),
  "la cota MIDE 3200.4 unidades de dibujo, que es lo que siempre ha hecho bien",
);
const cotaQueTocaria = cadLengthLabel(cota.measurement, {
  drawingUnit: "mm",
  lunits: 4,
  luprec: 4,
});
ok(
  cotaQueTocaria === TECLEADO,
  `y el rótulo que le tocaría llevar ya existe: «${cotaQueTocaria}»`,
);

console.log(
  `verificación 1.5-bis (unidades imperiales): ${checks} comprobaciones — ` +
    `«${TECLEADO}» tecleado = ${WALL_MM} mm de dibujo = «${TECLEADO}» rotulado = ` +
    `${WALL_ON_PAPER_MM} mm de papel a 1:${PLOT_SCALE}\n` +
    `  todavía no: $LUNITS en el DXF ${lunitsViaja ? "SÍ viaja" : "NO viaja"} (P-express-09) · ` +
    `la cota dice «${cota.label}» donde el plano lleva «${cotaQueTocaria}» (P-express-08)`,
);
