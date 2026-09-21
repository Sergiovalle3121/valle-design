/**
 * T5 — «Release Sin validar» no se muestra al cliente sin un reporte previo.
 *
 * El botón de release en la barra de estado sólo aparece cuando hay un
 * reporte de validación. Sin reporte, un cliente no ve diagnóstico interno.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const fuente = readFileSync(path.join(__dirname, "CadStatusBar.tsx"), "utf8");

ok(
  fuente.includes("validation.report && (") || fuente.includes("validation.report &&\n"),
  "el botón Release sólo se renderiza cuando hay un reporte de validación",
);
ok(
  !fuente.includes("Release {validation.releaseState}\n        </button>") ||
    fuente.includes("validation.report &&"),
  "Release Sin validar no aparece sin reporte",
);

console.log(`CadReleaseDiagnostico: ${checks}/${checks} comprobaciones verdes`);
