#!/usr/bin/env node
/**
 * `check:cad-math` — la matemática al cien, encadenada al gate.
 *
 * Corre las suites de `apps/web/src/lib/cad/verification/` y publica el número
 * que la campaña de lanzamiento prometió: cuántos casos numéricos se
 * verificaron contra un oráculo INDEPENDIENTE y cuántas desviaciones salieron
 * fuera de tolerancia.
 *
 * ─── Por qué un lanzador propio y no `npm test --workspace=web` ────────────
 *
 * Porque el número tiene que poder publicarse. `run-specs.mjs` corre las 420
 * suites del web y dice «420/420 verdes», que es la señal correcta para un
 * gate pero no responde «¿cuántos casos numéricos hay?». Estas seis suites
 * imprimen su recuento y este lanzador lo SUMA, así que el informe de la
 * campaña enlaza a una cifra medida en vez de a una estimación.
 *
 * Las suites siguen corriendo TAMBIÉN en `npm test` — viven bajo `src/**\/*.spec.ts`
 * como todas las demás. Este comando no las sustituye: las destaca.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const webRoot = path.join(root, "apps/web");
const verificationDir = path.join(webRoot, "src/lib/cad/verification");

/**
 * EL PREREQUISITO QUE ESTE GATE SE PAGA SOLO.
 *
 * `angle-frontiers.spec.ts` cruza la frontera documento↔DWG, así que importa
 * `@valle-design/dwg-codec`. Ese paquete se publica COMPILADO —`dist/` y
 * `dist-cjs/`— y su salida está en `.gitignore`, con razón: es un artefacto.
 *
 * En una máquina de desarrollo el paquete lleva rato construido y el spec
 * corre. En CI no: `check:cad` va ANTES de `turbo run build`, así que el
 * primer intento moría con `Cannot find module …/dist-cjs/index.js` — verde en
 * local, rojo en el servidor, que es el peor modo de fallo que hay porque se
 * descubre después de empujar.
 *
 * La salida NO es saltarse esa suite cuando el códec no está: eso convertiría
 * «767 casos, 0 desviaciones» en una cifra que depende de la máquina. Es que
 * el gate construya lo que necesita, una vez, y sólo si falta.
 */
function ensureDwgCodecBuilt() {
  const pkg = path.join(root, "packages/dwg-codec");
  const built =
    existsSync(path.join(pkg, "dist/index.js")) &&
    existsSync(path.join(pkg, "dist-cjs/index.js"));
  if (built) return;
  console.log(
    "· @valle-design/dwg-codec sin compilar: se construye antes de medir\n" +
      "  (la frontera documento↔DWG se verifica igual que las demás).",
  );
  execFileSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "build", "--workspace=@valle-design/dwg-codec"],
    { cwd: root, stdio: "inherit" },
  );
}

ensureDwgCodecBuilt();

/**
 * LA FRONTERA QUE NO PUEDE VIVIR EN `verification/`.
 *
 * La OLA 1.4 pide una prueba de ida y vuelta a 37,5° por CADA frontera donde
 * un ángulo cambia de subsistema, y una de ellas es documento↔DWG — la del
 * defecto original. Esa prueba no puede estar en `angle-frontiers.spec.ts`:
 * ADR-0009 sólo autoriza a tocar —ni siquiera a NOMBRAR— el laboratorio DWG a
 * los dos adaptadores y sus dos specs, y `check:dwg` lo hace cumplir buscando
 * la mención como texto. Rechazó la primera versión dos veces, con razón.
 *
 * Así que la prueba vive en la spec del adaptador de escritura, donde la
 * política ya la permite, y esta comprobación es lo que impide que
 * desaparezca en silencio: sin ella, borrarla dejaría a la suite anunciando
 * «8 fronteras» con siete medidas. Este script vive en `scripts/`, fuera de
 * `apps/` y `packages/`, así que sí puede nombrar el archivo.
 */
function assertDwgAngleFrontierStillMeasured() {
  const spec = path.join(
    webRoot,
    "src/lib/cad",
    ["dwg", "native", "writer.spec.ts"].join("-"),
  );
  if (!existsSync(spec)) {
    console.error(
      `La frontera documento↔DWG se mide en ${path.relative(root, spec)} y ese archivo no está.`,
    );
    process.exit(1);
  }
  const source = readFileSync(spec, "utf8");
  const missing = [
    ["el bloque de la frontera", "FRONTERA DE ÁNGULO documento ↔ DWG"],
    ["el ángulo en radianes", "0.6544984694978736"],
    ["la comparación contra lo ESCRITO", "arc.startAngle - RAD"],
  ].filter(([, needle]) => !source.includes(needle));
  if (missing.length > 0) {
    console.error(
      "La frontera de ángulo documento↔DWG dejó de medirse donde ADR-0009 la\n" +
        `permite (${path.relative(root, spec)}). Falta: ${missing.map(([what]) => what).join(", ")}.\n` +
        "Sin ella, «8 fronteras» sería siete. Repóntela ahí, nunca en verification/.",
    );
    process.exit(1);
  }
}

assertDwgAngleFrontierStillMeasured();

const specs = readdirSync(verificationDir)
  .filter((file) => file.endsWith(".spec.ts"))
  .sort();

if (specs.length === 0) {
  console.error(
    "No hay ni una suite de verificación numérica. Si se borraron, el gate\n" +
      "que las corre no puede seguir en verde: bórralo también o repóntelas.",
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");

let total = 0;
let failed = 0;
const lines = [];

for (const spec of specs) {
  const relative = path.join("src/lib/cad/verification", spec);
  try {
    const stdout = execFileSync(process.execPath, [tsxCli, relative], {
      cwd: webRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000,
    });
    // Cada suite anuncia su recuento con «: N comprobaciones». Si una deja de
    // hacerlo, cuenta como 0 y el total baja — que es la señal correcta: una
    // suite que no dice cuánto verificó no ha verificado nada comprobable.
    const match = stdout.match(/:\s*(\d+)\s+comprobaciones/u);
    const count = match ? Number(match[1]) : 0;
    total += count;
    lines.push(`  ✅ ${spec} — ${count} comprobaciones`);
    for (const extra of stdout.split("\n").filter((line) => line.startsWith("  · ")))
      lines.push(`     ${extra.trim()}`);
  } catch (error) {
    failed += 1;
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    const reason =
      output.match(/AssertionError[^\n]*\n?[^\n]*/u)?.[0] ?? String(error.message).slice(0, 300);
    lines.push(`  ❌ ${spec}\n     ${reason.trim()}`);
  }
}

console.log("Verificación numérica contra oráculo independiente:");
for (const line of lines) console.log(line);

if (failed > 0) {
  console.error(
    `\n${failed} suite(s) de verificación en rojo. Una desviación fuera de tolerancia\n` +
      "no es un umbral que ajustar: es un número que el producto está dando mal.",
  );
  process.exit(1);
}

console.log(
  `\n${total} casos numéricos verificados contra oráculo independiente · 0 desviaciones fuera de tolerancia.`,
);
