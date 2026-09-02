/**
 * Subestilos de cota por familia (Ola I). npx tsx src/lib/cad/dimension-family.spec.ts
 *
 *   - Cada tipo de cota lee su familia (`$0` lineal y alineada, `$2` angular,
 *     `$3` diámetro, `$4` radio, `$6` coordenada); la longitud de arco no
 *     tiene y hereda sólo el padre.
 *   - El subestilo es un NOMBRE (`ISO-25$4`) en la misma tabla: se resuelve
 *     encima del padre con y sin defaults, y `Standard$2` alcanza a Standard.
 */
import { strict as assert } from "node:assert";
import type { CadStyleTable } from "./cad-document";
import {
  CAD_DIMENSION_FAMILIES,
  cadDimensionFamilyByKeyword,
  cadDimensionFamilyFor,
  cadDimensionFamilyStyle,
  cadDimensionStyleParentName,
  cadDimensionSubStyleFamily,
  cadDimensionSubStyleName,
  cadDimensionSubStyles,
} from "./dimension-family";
import { CAD_DIMENSION_STYLE_DEFAULTS, resolveCadDimensionStyle } from "./dimension-style";

let checks = 0;
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

/* ── Las familias ───────────────────────────────────────────────────────── */
eq(CAD_DIMENSION_FAMILIES.map((family) => family.code), [0, 2, 3, 4, 6, 7], "los seis códigos de AutoCAD, en su orden");
eq(cadDimensionFamilyFor("linear")?.code, 0, "lineal → $0");
eq(cadDimensionFamilyFor("aligned")?.code, 0, "alineada → $0 (misma familia que la lineal)");
eq(cadDimensionFamilyFor("angular")?.code, 2, "angular → $2");
eq(cadDimensionFamilyFor("diameter")?.code, 3, "diámetro → $3");
eq(cadDimensionFamilyFor("radius")?.code, 4, "radio → $4");
eq(cadDimensionFamilyFor("ordinate")?.code, 6, "coordenada → $6");
eq(cadDimensionFamilyFor("arc-length"), undefined, "la longitud de arco no tiene familia: hereda el padre");
eq(cadDimensionFamilyFor(undefined), undefined, "sin tipo, sin familia");
eq(cadDimensionFamilyByKeyword("Radio")?.code, 4, "por palabra clave");
eq(cadDimensionFamilyByKeyword("radio")?.code, 4, "sin distinguir mayúsculas");
eq(cadDimensionFamilyByKeyword("4")?.code, 4, "por código");
eq(cadDimensionFamilyByKeyword("dIrectriz")?.code, 7, "la directriz existe como familia aunque ninguna cota la lea");
eq(cadDimensionFamilyByKeyword("x"), undefined, "una palabra ajena no es familia");

/* ── El nombre ──────────────────────────────────────────────────────────── */
const radial = cadDimensionFamilyFor("radius")!;
eq(cadDimensionSubStyleName("ISO-25", radial), "ISO-25$4", "el subestilo radial de ISO-25 se llama como en AutoCAD");
eq(cadDimensionStyleParentName("ISO-25$4"), "ISO-25", "el padre se lee del nombre");
eq(cadDimensionStyleParentName("ISO-25"), "ISO-25", "un estilo sin sufijo es su propio padre");
eq(cadDimensionStyleParentName("COTA$9"), "COTA$9", "un $9 no es familia: el nombre se respeta entero");
eq(cadDimensionSubStyleFamily("ISO-25$4")?.code, 4, "la familia del nombre");
eq(cadDimensionSubStyleFamily("ISO-25"), undefined, "un estilo llano no declara familia");
eq(cadDimensionSubStyleFamily("ISO-25$1"), undefined, "$1 no es una familia de AutoCAD");

/* ── La resolución ──────────────────────────────────────────────────────── */
const styles: CadStyleTable = {
  text: {},
  dimension: {
    Standard: { precision: 3 },
    Standard$2: { precision: 1 },
    "ISO-25": { arrowhead: "closed-filled", arrowSize: 250, textHeight: 35 },
    "ISO-25$4": { arrowhead: "dot" },
    "ISO-25$0": { arrowhead: "architectural-tick", precision: 0 },
  },
  mleader: {},
  table: {},
  plot: {},
} as unknown as CadStyleTable;

eq(cadDimensionFamilyStyle(styles, "ISO-25", "radius"), { arrowhead: "dot", arrowSize: 250, textHeight: 35 }, "la radial lee el padre y encima $4, sin defaults");
eq(cadDimensionFamilyStyle(styles, "ISO-25", "diameter"), { arrowhead: "closed-filled", arrowSize: 250, textHeight: 35 }, "el diámetro no tiene $3: sólo el padre");
eq(cadDimensionFamilyStyle(styles, "ISO-25", "aligned"), { arrowhead: "architectural-tick", arrowSize: 250, textHeight: 35, precision: 0 }, "la alineada lee $0 como la lineal");
eq(cadDimensionFamilyStyle(styles, "ISO-25", "arc-length"), { arrowhead: "closed-filled", arrowSize: 250, textHeight: 35 }, "la longitud de arco hereda sólo el padre");
eq(cadDimensionFamilyStyle(styles, undefined, "radius"), {}, "sin nombre no hay estilo que declare nada");
eq(cadDimensionFamilyStyle(styles, "NADIE", "radius"), {}, "un estilo que no existe no declara nada");

eq(resolveCadDimensionStyle(styles, "ISO-25", "radius").arrowhead, "dot", "resuelto con familia: la flecha del subestilo");
eq(resolveCadDimensionStyle(styles, "ISO-25", "radius").precision, 3, "…y lo que ni el padre ni el subestilo fijan viene de Standard");
eq(resolveCadDimensionStyle(styles, "ISO-25").arrowhead, "closed-filled", "sin familia, el padre manda (lo de antes de la Ola I no cambia)");
eq(resolveCadDimensionStyle(styles, "ISO-25", "linear").precision, 0, "la lineal lee ISO-25$0 encima de Standard");
eq(resolveCadDimensionStyle(styles, "Standard", "angular").precision, 1, "Standard$2 alcanza a las angulares del estilo Standard");
eq(resolveCadDimensionStyle(styles, undefined, "angular").precision, 1, "…también cuando la cota no nombra estilo (resuelve a Standard)");
eq(resolveCadDimensionStyle(styles, "ISO-25", "angular").precision, 3, "Standard$2 NO alcanza a las angulares de ISO-25: un subestilo es de su padre, como en AutoCAD");
eq(resolveCadDimensionStyle(undefined, "ISO-25", "radius"), { ...CAD_DIMENSION_STYLE_DEFAULTS }, "sin tabla, los defaults de fábrica");

eq(cadDimensionSubStyles(styles, "ISO-25").map((family) => family.code), [0, 4], "los subestilos definidos bajo ISO-25, en el orden de la tabla");
eq(cadDimensionSubStyles(styles, "Standard").map((family) => family.code), [2], "Standard tiene su $2");
eq(cadDimensionSubStyles(styles, "NADIE"), [], "un padre sin subestilos");

console.log(`✅ dimension-family.spec: ${checks} comprobaciones`);
