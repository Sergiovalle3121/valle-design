#!/usr/bin/env node
/**
 * Gate de dirección de dependencias: `lib/` no importa de `components/` ni de
 * `app/`.
 *
 * Es la regla que mantiene la lógica de dominio probable en Node y fuera de
 * React. Un solo import invertido convierte un módulo puro en uno que
 * arrastra el árbol de componentes entero — y deja de poder probarse sin
 * montar el editor.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const libRoot = path.join(root, "apps/web/src/lib");
const failures = [];

const FORBIDDEN = [
  /from\s+["']@\/components\//,
  /from\s+["']@\/app\//,
  /import\s*\(\s*["']@\/components\//,
  /import\s*\(\s*["']@\/app\//,
  // Rutas relativas que salen de lib/ hacia components o app.
  /from\s+["']\.\.\/(\.\.\/)*components\//,
  /from\s+["']\.\.\/(\.\.\/)*app\//,
];

/**
 * Exenciones DECLARADAS, con deuda escrita. Añadir una exige razón; retirarla
 * es progreso. Las specs (.spec.ts) quedan fuera por regla: una spec de
 * integración puede probar el anfitrión de components/ sin invertir la
 * dependencia del código de PRODUCTO.
 */
const EXEMPT = new Map([
  [
    "apps/web/src/lib/seo/social-card.tsx",
    "genera las tarjetas OG con ImageResponse (React por naturaleza) y consume la geometría del logo de components/brand; el gate del sistema de diseño lo referencia por ruta. Deuda: mover logo-geometry a un módulo neutro y este archivo junto a sus rutas OG.",
  ],
]);

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(target);
    else if (/\.(ts|tsx|mts)$/.test(entry.name) && !/\.spec\.tsx?$/.test(entry.name))
      yield target;
  }
}

let scanned = 0;
for (const file of walk(libRoot)) {
  scanned += 1;
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");
  const violates = FORBIDDEN.some((pattern) => pattern.test(text));
  if (violates && !EXEMPT.has(relative)) {
    failures.push(
      `${relative}: importa de components/ o app/ — la dependencia va al revés`,
    );
  }
  if (!violates && EXEMPT.has(relative)) {
    failures.push(
      `${relative}: está exento pero ya no viola la regla — retire la exención (deuda saldada)`,
    );
  }
}

if (failures.length > 0) {
  console.error("Gate de dirección de imports: FALLÓ");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Dirección de imports OK: ${scanned} archivos de lib/ sin dependencias hacia components/ ni app/.`);
