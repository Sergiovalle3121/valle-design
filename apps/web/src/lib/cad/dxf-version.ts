/**
 * `$ACADVER` que declara la cabecera de un DXF exportado.
 *
 * Separado de `dxf-export.ts` porque ese archivo vive en su presupuesto de
 * monolito (`scripts/cad/monolith-budget.json`) y SÓLO puede encoger: un tipo
 * y dos tablas sin lógica de escritura no tienen por qué vivir ahí. Lo usan
 * `dxf-export.ts` (que lo re-exporta, para no romper a quien ya lo importaba
 * de ahí) e `interop-dxf.ts` (SAVEAS/EXPORT, que dejan elegir la versión).
 *
 * El escritor sólo emite entidades válidas desde AC1015 (AutoCAD 2000) — ver
 * el comentario de `pushHeader` en `dxf-export.ts` — así que las tres
 * opciones son AC1015 y dos versiones POSTERIORES: declarar una versión más
 * nueva es honesto (un DXF de AC1015 lo abre cualquier lector más nuevo,
 * igual que un .xlsx viejo abre en un Excel nuevo); lo que este escritor NO
 * ofrece es una versión ANTERIOR (R12/AC1009), porque ahí sí faltarían
 * entidades que ya usa, como ELLIPSE.
 */
export type CadDxfVersion = "AC1015" | "AC1021" | "AC1032";
export const CAD_DXF_VERSIONS: readonly CadDxfVersion[] = ["AC1015", "AC1021", "AC1032"];
/** Rótulo AutoCAD de cada versión, para un cuadro o un prompt que no debe decir sólo el código. */
export const CAD_DXF_VERSION_NAMES: Readonly<Record<CadDxfVersion, string>> = {
  AC1015: "2000",
  AC1021: "2007",
  AC1032: "2018",
};
