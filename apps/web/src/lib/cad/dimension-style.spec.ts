/** Tests del DIMSTYLE con nombre. npx tsx src/lib/cad/dimension-style.spec.ts */
import type { CadStyleTable } from "./cad-document";
import {
  CAD_DIMENSION_STYLE_DEFAULTS,
  cadCompareDimensionStyles,
  cadDimensionStyleBake,
  cadDimensionStyleFromEntries,
  cadDimensionStyleFromStandardPairs,
  cadDimensionStyleStandardPairs,
  cadDimensionStyleToEntries,
  resolveCadDimensionStyle,
  type CadDimensionStyleDefinition,
} from "./dimension-style";
import { cadDimensionStyleOverrides } from "./dimension-format";
import { pushLayerTable } from "./dxf-write-tables";
import { parseRawDxfProperties } from "./dxf-read-properties";

let passed = 0;
const fails: string[] = [];
const ok = (cond: boolean, m: string) => {
  if (cond) passed++;
  else fails.push(m);
};
const canon = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
const eq = (a: unknown, b: unknown, m: string) =>
  ok(canon(a) === canon(b), `${m} (got ${JSON.stringify(a)})`);

const styles: CadStyleTable = {
  text: {},
  dimension: {
    Standard: { precision: 3, arrowSize: 200 },
    "COTA 1:50": {
      arrowhead: "architectural-tick",
      overallScale: 50,
      arrowSize: 2.5,
      units: "m",
      textColor: "#336699",
      forceLineInside: true,
      zeroSuppression: "trailing",
      prefix: "≈",
    },
  },
  table: {},
  plot: {},
};

// ── Resolución: defaults ← Standard ← nombrado ──
{
  const resolved = resolveCadDimensionStyle(styles, "COTA 1:50");
  eq(resolved.precision, 3, "hereda precision del Standard del documento");
  eq(resolved.arrowSize, 2.5, "el nombrado gana sobre Standard");
  eq(resolved.textGap, CAD_DIMENSION_STYLE_DEFAULTS.textGap, "default cuando nadie declara");
  eq(resolved.arrowhead, "architectural-tick", "campo propio del nombrado");
  const fantasma = resolveCadDimensionStyle(styles, "NoExiste");
  eq(fantasma.arrowSize, 200, "un nombre desconocido resuelve a Standard, no revienta");
  const sinTabla = resolveCadDimensionStyle(undefined, "X");
  eq(sinTabla.arrowSize, CAD_DIMENSION_STYLE_DEFAULTS.arrowSize, "sin tabla: defaults");
}

// ── Horneado: DIMSCALE multiplica los tamaños del estilo ──
{
  const baked = cadDimensionStyleBake(resolveCadDimensionStyle(styles, "COTA 1:50"));
  eq(baked.arrowSize, 125, "arrowSize 2.5 × DIMSCALE 50");
  eq(baked.units, "m", "unidad horneada");
  eq(baked.prefix, "≈", "prefijo horneado");
  eq(
    baked.extensionGap,
    CAD_DIMENSION_STYLE_DEFAULTS.extensionGap * 50,
    "los defaults resueltos también escalan",
  );
}

// ── cadDimensionStyleOverrides: estilo declara → gana y escala; borrador rellena ──
{
  const overrides = cadDimensionStyleOverrides(
    { arrowSize: 2, overallScale: 10 },
    { arrowSize: 500, precision: 1 },
  );
  eq(overrides.arrowSize, 20, "el estilo declara arrowSize: gana y escala");
  eq(overrides.precision, 1, "el borrador rellena lo no declarado");
  const soloDraft = cadDimensionStyleOverrides({}, { textGap: 77 });
  eq(soloDraft.textGap, 77, "tamaño del borrador NO se escala (no es norma)");
}

// ── Comparar: diferencias efectivas en vocabulario de dibujante ──
{
  const diff = cadCompareDimensionStyles(styles, "Standard", "COTA 1:50");
  ok(diff.length >= 5, `Comparar enumera diferencias (${diff.length})`);
  ok(
    diff.some((line) => line.includes("DIMASZ")),
    "cada línea nombra su DIMVAR",
  );
  eq(cadCompareDimensionStyles(styles, "Standard", "Standard"), [], "idénticos = sin líneas");
}

// ── Códec clave=valor: TODOS los campos sobreviven exactos ──
{
  const full: CadDimensionStyleDefinition = {
    textStyle: "Titulos",
    textHeight: 3.5,
    textGap: 1,
    textVertical: "above",
    textJustification: "second",
    textInsideHorizontal: true,
    textOutsideHorizontal: false,
    textColor: "#336699",
    arrowhead: "dot",
    arrowheadFirst: "open",
    arrowheadSecond: "architectural-tick",
    separateArrowheads: true,
    arrowSize: 2.5,
    extensionOvershoot: 1.25,
    extensionGap: 0.625,
    baselineSpacing: 3.75,
    dimLineColor: "1",
    extensionLineColor: "3",
    dimLineWeight: 35,
    extensionLineWeight: 18,
    forceLineInside: true,
    forceTextInside: false,
    overallScale: 50,
    linearFactor: 0.001,
    precision: 2,
    zeroSuppression: "both",
    roundTo: 0.5,
    prefix: "≈",
    suffix: " m",
    units: "m",
  };
  const roundTripped = cadDimensionStyleFromEntries(cadDimensionStyleToEntries(full));
  eq(roundTripped, full, "clave=valor ida y vuelta sin pérdida (30 campos)");
  ok(cadDimensionStyleToEntries(full).length === 30, "el núcleo son 30 campos");
}

// ── Códigos estándar: la cara para lectores ajenos, ida y vuelta tolerante ──
{
  const definition: CadDimensionStyleDefinition = {
    overallScale: 50,
    arrowSize: 2.5,
    extensionGap: 0.6,
    extensionOvershoot: 1.2,
    baselineSpacing: 3.8,
    textHeight: 3.5,
    textGap: 0.9,
    precision: 2,
    roundTo: 0.5,
    linearFactor: 0.001,
    textVertical: "above",
    textJustification: "first",
    textInsideHorizontal: true,
    textOutsideHorizontal: true,
    forceLineInside: true,
    forceTextInside: false,
    separateArrowheads: true,
    zeroSuppression: "leading",
    prefix: "≈",
    suffix: " m",
    dimLineColor: "1",
    extensionLineColor: "3",
    textColor: "5",
    dimLineWeight: 35,
    extensionLineWeight: 18,
  };
  const pairs = cadDimensionStyleStandardPairs(definition).map(
    ([code, value]) => [code, String(value)] as [number, string],
  );
  const restored = cadDimensionStyleFromStandardPairs(pairs);
  eq(restored, definition, "DIMVARs estándar ida y vuelta");
  // Un fichero ajeno mínimo (ISO-25-ish): sólo lo que declara entra.
  const foreign = cadDimensionStyleFromStandardPairs([
    [271, "2"],
    [140, "2.5"],
    [41, "2.5"],
    [77, "1"],
  ]);
  eq(
    foreign,
    { precision: 2, textHeight: 2.5, arrowSize: 2.5, textVertical: "above" },
    "lectura tolerante de un DIMSTYLE ajeno",
  );
  // DIMPOST con separador: prefijo y sufijo se parten donde el SAT del DXF manda.
  eq(
    cadDimensionStyleFromStandardPairs([[3, "≈<> m"]]),
    { prefix: "≈", suffix: " m" },
    "DIMPOST se descompone en prefijo y sufijo",
  );
}

// ── El color CSS no viaja por código estándar, sólo por la XDATA exacta ──
{
  const pairs = cadDimensionStyleStandardPairs({ textColor: "#336699" });
  eq(pairs.length, 0, "un CSS no produce código ACI falso");
  const entries = cadDimensionStyleToEntries({ textColor: "#336699" });
  eq(entries, [["textColor", "#336699"]], "…pero la XDATA lo conserva exacto");
}

if (fails.length) {
  console.error(`❌ dimension-style: ${fails.length} fallo(s)`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✅ dimension-style.spec: ${passed} comprobaciones`);

/* ── Round-trip INTEGRAL por el fichero: escritor real → lector real ─────── */
{
  const norma: CadDimensionStyleDefinition = {
    textStyle: "Titulos",
    textHeight: 3.5,
    arrowhead: "architectural-tick",
    arrowSize: 2.5,
    extensionGap: 0.625,
    extensionOvershoot: 1.25,
    overallScale: 50,
    precision: 2,
    units: "m",
    zeroSuppression: "trailing",
    textColor: "#336699",
    forceLineInside: true,
    prefix: "≈",
  };
  const lines: string[] = [];
  pushLayerTable(lines, { dimensionStyles: { "COTA 1:50": norma, Standard: { precision: 3 } } }, ["0"]);
  const text = lines.join("\n");
  ok(text.includes("DIMSTYLE"), "la tabla DIMSTYLE está en el fichero");
  ok(/\n41\n2\.5\b/.test(text) || text.includes("\n41\n2.5"), "DIMASZ viaja con código estándar 41");
  const properties = parseRawDxfProperties(text);
  // El «:» se sanea a «_» en el fichero (misma regla que el código 3 por
  // entidad, que ya viajaba así): dentro del DXF, tabla y entidades quedan
  // consistentes entre sí bajo el nombre saneado.
  eq(
    properties.dimensionStyles["COTA 1_50"],
    norma,
    "la norma vuelve EXACTA del fichero (XDATA clave=valor)",
  );
  eq(properties.dimensionStyles.Standard, { precision: 3 }, "Standard también vuelve");
}

if (fails.length) {
  console.error(`❌ dimension-style (dxf): ${fails.length} fallo(s)`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✅ dimension-style.spec (dxf): ${passed} comprobaciones`);
