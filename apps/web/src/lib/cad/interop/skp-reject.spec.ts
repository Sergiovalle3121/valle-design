import assert from "node:assert/strict";
import { looksLikeSkp, rejectSkp } from "./skp-reject";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

ok(looksLikeSkp(new TextEncoder().encode("cualquier cosa"), "modelo.skp"), "la extensión .skp basta, sin mirar el contenido");
ok(
  looksLikeSkp(new TextEncoder().encode("SketchUp Model resto del archivo"), "modelo.stl"),
  "un .skp renombrado se atrapa por contenido",
);
ok(!looksLikeSkp(new TextEncoder().encode("solid cubo"), "modelo.stl"), "un STL de verdad no se confunde con .skp");

assert.throws(() => rejectSkp("casa.skp"), /SketchUp/, "rejectSkp siempre lanza");
checks += 1;
try {
  rejectSkp("casa.skp");
} catch (error) {
  const message = (error as Error).message;
  ok(message.includes("casa.skp"), "el mensaje nombra el archivo");
  ok(/COLLADA|glTF/.test(message), "el mensaje ofrece una salida real (exportar a COLLADA/glTF)");
  ok(!/nunca/i.test(message), "el rechazo declara 'todavía no', no cierra la puerta para siempre");
}

console.log(`✔ skp-reject: ${checks} aserciones verdes`);
