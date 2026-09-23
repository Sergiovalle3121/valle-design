/**
 * Regresión de idioma: la barra de estado habla español, sin vocabulario
 * inglés en el texto visible ni enums sin mapear.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (c: boolean, m: string) => {
  assert.ok(c, m);
  checks += 1;
};

const src = readFileSync(new URL("./CadStatusBar.tsx", import.meta.url), "utf8");

// ── Negativas: las etiquetas inglesas ya NO aparecen como texto visible ──
// Se buscan como literales de JSX (entre comillas o como texto JSX) que
// produzcan texto visible al usuario. Los `data-testid`, comentarios y tipos
// no cuentan.

for (const forbidden of [
  "Layer {",           // etiqueta de capa (JSX text)
  "Clearance ",        // holguras
  "Safety ",           // seguridad
  "Highlights ",       // resaltados
  "Recovery ",         // recuperación
  "Release ",          // revisión (D30)
  '"API offline"',     // conexión
  "'API offline'",
  '"API online"',      // era la forma inglesa
  "'API online'",
]) {
  ok(!src.includes(forbidden), `el texto visible no contiene "${forbidden.trim()}"`);
}

// ── Positivas: las etiquetas españolas están presentes ──

for (const required of [
  "Capa{",                 // etiqueta de capa (JSX: Capa{" "}…)
  "Holguras ",             // holguras
  "Seguridad ",            // seguridad
  "Resaltados ",           // resaltados
  "Revisión ",             // revisión (D30, era "Release")
  "Recuperación local activa",
  "Recuperación local en riesgo",
  "Conectado",
  "Sin conexión",
]) {
  ok(src.includes(required), `el texto visible contiene "${required}"`);
}

// ── Enums sin mapear: 'warn', 'critical', 'ok' no aparecen como texto ──
// El componente mapea los enums a español antes de renderizar.

ok(!src.includes('"Validación {validation.report.score}"'), "el score de validación se mapea a español");
ok(!src.includes('"CAD {validation.cadValidationReport.severity}"'), "la severidad CAD se mapea a español");
ok(
  src.includes('"correcta"') || src.includes("'correcta'") || src.includes(">correcta<"),
  "el valor 'correcta' está mapeado",
);
ok(
  src.includes('"con avisos"') || src.includes("'con avisos'") || src.includes(">con avisos<"),
  "el valor 'con avisos' está mapeado",
);
ok(
  src.includes('"con errores"') || src.includes("'con errores'") || src.includes(">con errores<"),
  "el valor 'con errores' está mapeado",
);
ok(
  src.includes('"CAD crítico"') || src.includes("'CAD crítico'") || src.includes(">CAD crítico<"),
  "CAD crítico está mapeado",
);
ok(
  src.includes('"CAD con avisos"') || src.includes("'CAD con avisos'") || src.includes(">CAD con avisos<"),
  "CAD con avisos está mapeado",
);
ok(
  src.includes('"CAD correcto"') || src.includes("'CAD correcto'") || src.includes(">CAD correcto<"),
  "CAD correcto está mapeado",
);

console.log(`ok cad-status-bar-locale: ${checks} comprobaciones`);
