import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { visibleCopyViolations } from "./visible-copy-gate.mjs";

const root = resolve(import.meta.dirname, "../..");
assert.ok(visibleCopyViolations("const x = <span>Tool: select</span>;", "probe.tsx").length > 0,
  "el gate debe fallar ante jerga pintada");
assert.deepEqual(visibleCopyViolations("const x = <CadDiagnosticsReadout><span>Tool: select</span></CadDiagnosticsReadout>;", "probe.tsx"), [],
  "el diagnóstico oculto conserva sus indicadores para soporte");
assert.deepEqual(visibleCopyViolations("// Geometría canónica\nconst x = <span>Plano listo</span>;", "probe.tsx"), [],
  "una explicación en comentario no es texto pintado");
const realHeading = "apps/web/src/components/cad/palettes/CadNativeSelectionHeading.tsx";
const headingSource = readFileSync(resolve(root, realHeading), "utf8");
const headingWithJargon = headingSource.replace(
  '<div className="mb-1 flex items-center gap-2">',
  '<div>Geometría canónica · grips y snaps.</div><div className="mb-1 flex items-center gap-2">',
);
assert.notEqual(headingWithJargon, headingSource, "la prueba inyecta jerga en una superficie real");
assert.ok(visibleCopyViolations(headingWithJargon, realHeading).some((failure) => failure.includes("geometría canónica")),
  "el gate debe rechazar la jerga inyectada en la cabecera real");
assert.ok(visibleCopyViolations('const x = <span>{`${count} curvas nativas`}</span>;', "probe.tsx").length > 0,
  "también se inspeccionan las plantillas de texto interpolado");

function cadComponents(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return cadComponents(absolute);
    return entry.isFile() && entry.name.endsWith(".tsx") && !entry.name.endsWith(".spec.tsx")
      ? [relative(root, absolute).replaceAll("\\", "/")]
      : [];
  });
}
// Única excepción: esta pieza sólo se monta dentro de CadDiagnosticsReadout
// en CadStatusBar; allí ya se inspecciona como subárbol oculto salvo ?cadDiag=1.
const diagnosticsOnly = "apps/web/src/components/cad/viewport/Cad3DSolidDiagnostics.tsx";
const statusBar = readFileSync(resolve(root, "apps/web/src/components/cad/studio/CadStatusBar.tsx"), "utf8");
assert.match(statusBar, /<CadDiagnosticsReadout[\s\S]*<Cad3DSolidDiagnostics[\s\S]*<\/CadDiagnosticsReadout>/,
  "los contadores de mallas sólo pueden vivir en el modo diagnóstico");
const files = cadComponents(resolve(root, "apps/web/src/components/cad"))
  .filter((file) => file !== diagnosticsOnly);
const violations = files.flatMap((file) => visibleCopyViolations(readFileSync(resolve(root, file), "utf8"), file));
assert.deepEqual(violations, [], `Jerga de desarrollador visible:\n${violations.join("\n")}`);
console.log(`Texto visible CAD: ${files.length} superficies sin los patrones vigilados`);
