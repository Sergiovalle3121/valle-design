/**
 * La tolerancia de fabricación y los ajustes ISO 286 (Ola I).
 * npx tsx src/lib/cad/dimension-tolerance.spec.ts
 *
 *   - Los metadatos van y vuelven; una clave rota no inventa tolerancia.
 *   - El rótulo: «40.00 ±0.05», «40.00 +0.025/0», «40.025 / 40.000», en la
 *     unidad con que rotula la cota, y la angular en grados.
 *   - Catorce ajustes contra la tabla de la norma (25H7 = +0.021/0, 40k6 =
 *     +0.018/+0.002, 60p6 = +0.051/+0.032…) y los rechazos con su motivo.
 *   - La cota entera: `formatCadDimensionMeasurement` rotula con tolerancia y
 *     el modelo de export DXF la sube y la baja por la XDATA.
 */
import { strict as assert } from "node:assert";
import { buildCadDimensionGeometry, formatCadDimensionMeasurement, type CadDimensionEntity } from "./associative-dimension";
import {
  CAD_ISO_FIT_LETTERS,
  cadDecimalsOf,
  cadDimensionMetadataWithoutTolerance,
  cadDimensionToleranceExport,
  cadDimensionToleranceFromFit,
  cadDimensionToleranceMetadata,
  cadDimensionToleranceOf,
  cadDimensionToleranceText,
  cadIsoFit,
  type CadDimensionTolerance,
} from "./dimension-tolerance";
import { cadDocumentNativeDxfSemanticDimensions, cadDxfSemanticDimensionsToNativeEntities } from "./dxf-cad-document";
import { exportCadDxf } from "./dxf-export";
import { parseRawDxfSemanticDimensions } from "./dxf-read-annotations";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

/* ── Decimales ──────────────────────────────────────────────────────────── */
eq(cadDecimalsOf(0.025), 3, "0,025 tiene tres decimales");
eq(cadDecimalsOf(5), 0, "un entero, cero");
eq(cadDecimalsOf(0.1, 0.005), 3, "el máximo de los dos");
eq(cadDecimalsOf(1e-7), 6, "tope seis");
eq(cadDecimalsOf(Number.NaN), 0, "NaN no cuenta");

/* ── Metadatos ──────────────────────────────────────────────────────────── */
const deviation: CadDimensionTolerance = { mode: "deviation", upper: 0.025, lower: 0, decimals: 3, fit: "H7" };
eq(cadDimensionToleranceMetadata(deviation), { tolerance: "deviation", toleranceUpper: 0.025, toleranceLower: 0, toleranceDecimals: 3, toleranceFit: "H7" }, "las cinco claves planas");
eq(cadDimensionToleranceOf({ context: { metadata: cadDimensionToleranceMetadata(deviation) } }), deviation, "van y vuelven");
eq(cadDimensionToleranceOf({ context: { metadata: { ...cadDimensionToleranceMetadata({ mode: "symmetric", upper: 0.05, lower: -0.05, decimals: 2 }) } } }), { mode: "symmetric", upper: 0.05, lower: -0.05, decimals: 2 }, "sin ajuste, sin clave de ajuste");
eq(cadDimensionToleranceOf({ context: { metadata: { tolerance: "rara", toleranceUpper: 1, toleranceLower: 0 } } }), null, "un modo desconocido no es tolerancia");
eq(cadDimensionToleranceOf({ context: { metadata: { tolerance: "deviation", toleranceUpper: 0, toleranceLower: 0.1 } } }), null, "inferior mayor que superior: no es tolerancia");
eq(cadDimensionToleranceOf({ context: { metadata: { tolerance: "deviation", toleranceUpper: "x", toleranceLower: 0 } } }), null, "una desviación que no es número: no");
eq(cadDimensionToleranceOf({ context: { metadata: { tolerance: "deviation", toleranceUpper: 0.02, toleranceLower: 0 } } })?.decimals, 3, "sin decimales declarados, tres");
eq(cadDimensionToleranceOf({}), null, "sin contexto, nada");
eq(cadDimensionMetadataWithoutTolerance({ sourceType: "DIMENSION", ...cadDimensionToleranceMetadata(deviation) }), { sourceType: "DIMENSION" }, "Quitar conserva las demás claves");
eq(cadDimensionMetadataWithoutTolerance(cadDimensionToleranceMetadata(deviation)), undefined, "…y devuelve undefined cuando no queda nada");
eq(cadDimensionToleranceExport({ context: { metadata: cadDimensionToleranceMetadata(deviation) } }), { tolerance: deviation }, "el modelo de export la sube");
eq(cadDimensionToleranceExport({ context: { metadata: { sourceType: "X" } } }), {}, "…y no inventa una clave cuando no hay");

/* ── El rótulo ──────────────────────────────────────────────────────────── */
eq(cadDimensionToleranceText(40, 2, { mode: "symmetric", upper: 0.05, lower: -0.05, decimals: 2 }), "40.00 ±0.05", "simétrica");
eq(cadDimensionToleranceText(40, 2, { mode: "deviation", upper: 0.025, lower: 0, decimals: 3 }), "40.00 +0.025/0", "desviación con cero desnudo");
eq(cadDimensionToleranceText(40, 2, { mode: "deviation", upper: 0.05, lower: -0.01, decimals: 3 }), "40.00 +0.050/−0.010", "desviación con signo menos tipográfico");
eq(cadDimensionToleranceText(40, 2, { mode: "deviation", upper: 0.05, lower: 0.025, decimals: 3 }), "40.00 +0.050/+0.025", "las dos positivas");
eq(cadDimensionToleranceText(40, 2, { mode: "deviation", upper: 0.05, lower: -0.05, decimals: 2 }), "40.00 ±0.05", "una desviación simétrica se rotula con ±");
eq(cadDimensionToleranceText(40, 2, { mode: "limits", upper: 0.025, lower: 0, decimals: 3 }), "40.025 / 40.000", "límites: máximo y mínimo");
eq(cadDimensionToleranceText(40, 3, { mode: "limits", upper: 0.02, lower: -0.02, decimals: 2 }), "40.020 / 39.980", "límites con la precisión de la cota si es mayor");
eq(cadDimensionToleranceText(1.5748, 2, { mode: "symmetric", upper: 0.05, lower: -0.05, decimals: 3 }, 1 / 25.4), "1.57 ±0.002", "en pulgadas, la tolerancia se convierte");

/* ── ISO 286 ────────────────────────────────────────────────────────────── */
const fits: Array<[number, string, number, number]> = [
  [25, "H7", 0.021, 0],
  [25, "g6", -0.007, -0.02],
  [40, "k6", 0.018, 0.002],
  [60, "p6", 0.051, 0.032],
  [20, "f7", -0.02, -0.041],
  [100, "H8", 0.054, 0],
  [12, "h9", 0, -0.043],
  [50, "js7", 0.0125, -0.0125],
  [30, "n6", 0.028, 0.015],
  [10, "m6", 0.015, 0.006],
  [45, "e8", -0.05, -0.089],
  [80, "d9", -0.1, -0.174],
  [6, "G7", 0.016, 0.004],
  [160, "F8", 0.106, 0.043],
  [3, "H7", 0.01, 0],
  [500, "h11", 0, -0.4],
];
for (const [nominal, code, upper, lower] of fits) {
  const fit = cadIsoFit(nominal, code);
  assert.ok(typeof fit !== "string", `${nominal} ${code}: ${String(fit)}`);
  ok(near(fit.upper, upper, 1e-9) && near(fit.lower, lower, 1e-9), `${nominal} ${code} = ${upper >= 0 ? "+" : ""}${upper}/${lower >= 0 ? "+" : ""}${lower} (dio ${fit.upper}/${fit.lower})`);
}
eq(cadIsoFit(25, "H7"), { fit: "H7", hole: true, grade: 7, upper: 0.021, lower: 0, it: 0.021 }, "el ajuste entero");
eq(cadIsoFit(25, "h7"), { fit: "h7", hole: false, grade: 7, upper: 0, lower: -0.021, it: 0.021 }, "el eje h: cero arriba");
eq(cadIsoFit(40, "k8"), { fit: "k8", hole: false, grade: 8, upper: 0.039, lower: 0, it: 0.039 }, "k fuera de IT4–IT7 arranca en cero");
eq(cadIsoFit(25, "JS6"), { fit: "JS6", hole: true, grade: 6, upper: 0.0065, lower: -0.0065, it: 0.013 }, "JS es simétrico");
ok(String(cadIsoFit(25, "K7")).includes("corrección Δ"), "los agujeros K/M/N/P se rechazan por la corrección Δ");
ok(String(cadIsoFit(25, "H12")).includes("IT5 a IT11"), "un grado fuera de tabla se rechaza");
ok(String(cadIsoFit(25, "q6")).includes("letra") && String(cadIsoFit(25, "q6")).includes(CAD_ISO_FIT_LETTERS), "una letra fuera de tabla se rechaza enumerando las válidas");
ok(String(cadIsoFit(600, "H7")).includes("0 a 500 mm"), "más de 500 mm se rechaza");
ok(String(cadIsoFit(0, "H7")).includes("0 a 500 mm"), "cero se rechaza");
ok(String(cadIsoFit(25, "7H")).includes("no es un ajuste"), "«7H» no es un ajuste");
eq(cadDimensionToleranceFromFit(cadIsoFit(40, "H7") as Exclude<ReturnType<typeof cadIsoFit>, string>), { mode: "deviation", upper: 0.025, lower: 0, decimals: 3, fit: "H7" }, "el ajuste se vuelve tolerancia por desviaciones con tres decimales");

/* ── La cota entera ─────────────────────────────────────────────────────── */
const base: CadDimensionEntity = {
  id: "d1",
  type: "dimension",
  dimensionKind: "linear",
  a: { x: 0, y: 0 },
  b: { x: 40, y: 0 },
  axis: "x",
  offset: 10,
  layer: "COTAS",
  sourceUnit: "mm",
  precision: 2,
};
eq(formatCadDimensionMeasurement(base, 40), "40.00 mm", "sin tolerancia, lo de siempre");
const toleranced: CadDimensionEntity = { ...base, context: { metadata: cadDimensionToleranceMetadata({ mode: "deviation", upper: 0.025, lower: 0, decimals: 3, fit: "H7" }) } };
eq(formatCadDimensionMeasurement(toleranced, 40), "40.00 +0.025/0 mm", "con tolerancia, entre la medida y la unidad");
eq(buildCadDimensionGeometry(toleranced)?.label, "40.00 +0.025/0 mm", "…y es lo que la geometría rotula (visor, lámina, DXF)");
eq(formatCadDimensionMeasurement({ ...toleranced, prefix: "Ø", suffix: " H7" }, 40), "Ø40.00 +0.025/0 mm H7", "prefijo y sufijo alrededor");
eq(formatCadDimensionMeasurement({ ...toleranced, text: "VER DETALLE" }, 40), "VER DETALLE", "el texto sobrescrito manda");
eq(formatCadDimensionMeasurement({ ...toleranced, units: "cm" }, 40), "4.00 +0.003/0 cm", "en centímetros la tolerancia se convierte");
eq(formatCadDimensionMeasurement({ ...base, dimensionKind: "angular", context: { metadata: cadDimensionToleranceMetadata({ mode: "symmetric", upper: 0.5, lower: -0.5, decimals: 1 }) } }, 90), "90.00 ±0.5°", "la angular en grados");

/* ── DXF: sube al modelo de export, sale por la XDATA y vuelve al bolsillo ── */
{
  const document = { entities: [toleranced], layers: [], blocks: [] } as unknown as Parameters<typeof cadDocumentNativeDxfSemanticDimensions>[0];
  const exported = cadDocumentNativeDxfSemanticDimensions(document);
  eq(exported.length, 1, "una cota semántica");
  eq(exported[0].tolerance, { mode: "deviation", upper: 0.025, lower: 0, decimals: 3, fit: "H7" }, "el modelo de export lleva la tolerancia");
  ok(!("context" in exported[0]), "…y no el contexto");
  const dxf = exportCadDxf({ layers: [{ name: "COTAS" }], semanticDimensions: exported } as unknown as Parameters<typeof exportCadDxf>[0]).content;
  ok(dxf.includes("tolerance=deviation") && dxf.includes("toleranceUpper=0.025") && dxf.includes("toleranceLower=0") && dxf.includes("toleranceFit=H7"), "las claves en la XDATA");
  ok(dxf.includes("40.00 +0.025/0 mm"), "el rótulo con tolerancia en el grupo 1 y en el bloque *D, para un lector ajeno");
  const read = parseRawDxfSemanticDimensions(dxf);
  eq(read.length, 1, "vuelve una cota");
  eq(read[0].tolerance, { mode: "deviation", upper: 0.025, lower: 0, decimals: 3, fit: "H7" }, "la XDATA se lee entera");
  const [entity] = cadDxfSemanticDimensionsToNativeEntities(read);
  assert.ok(entity.type === "dimension");
  eq(cadDimensionToleranceOf(entity), { mode: "deviation", upper: 0.025, lower: 0, decimals: 3, fit: "H7" }, "…y vuelve a `context.metadata`");
  ok(!("tolerance" in entity), "sin campo nuevo en la entidad");
  eq(buildCadDimensionGeometry(entity)?.label, "40.00 +0.025/0 mm", "la cota reimportada rotula igual");

  const plain = exportCadDxf({ layers: [{ name: "COTAS" }], semanticDimensions: cadDocumentNativeDxfSemanticDimensions({ entities: [base], layers: [], blocks: [] } as unknown as Parameters<typeof cadDocumentNativeDxfSemanticDimensions>[0]) } as unknown as Parameters<typeof exportCadDxf>[0]).content;
  ok(plain.includes("tolerance=\n") && !plain.includes("toleranceFit=H"), "sin tolerancia, la clave sale vacía: «esta cota no lleva»");
  eq(parseRawDxfSemanticDimensions(plain)[0].tolerance, undefined, "…y al leer no se inventa");
}

console.log(`✅ dimension-tolerance.spec: ${checks} comprobaciones`);
