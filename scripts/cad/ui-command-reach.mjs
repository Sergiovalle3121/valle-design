#!/usr/bin/env node
/**
 * LA CIFRA QUE MIDE EL FRENTE DE LA INTERFAZ.
 *
 * Cuántos de los ~192 comandos del registro real (`CAD_COMMAND_DESCRIPTORS`,
 * `apps/web/src/lib/cad/engine/index.ts`) se pueden alcanzar CON EL RATÓN,
 * sin teclear, antes y después de montar la cinta.
 *
 * "Antes" es un número histórico, no una medición en vivo: la paleta vertical
 * de 17 acciones (`apps/web/src/lib/cad/toolbar.ts`, `CAD_TOOLBAR_ACTIONS`,
 * medida el 2026-08-31 antes de esta campaña) no tenía relación mecánica con
 * el registro — sus 17 ids eran una lista aparte, escrita a mano. Se deja
 * escrito aquí en vez de recalculado porque ya no existe ese estado del
 * código para volver a contarlo: es evidencia de dónde se partía, con su
 * fecha, no una afirmación que este script pueda re-verificar cada vez.
 *
 * "Después" SÍ se recalcula cada vez que corre `--check`: es
 * `CAD_RIBBON_DATA` (`apps/web/src/lib/cad/ribbon.ts`), generado del mismo
 * registro, y el número baja solo si algún comando deja de tener botón de
 * cinta — que es exactamente lo que `check:ribbon-coverage` ya vigila por
 * separado. Este archivo no repite ese gate; RECOGE su resultado como cifra
 * para la rúbrica.
 *
 * Uso: `node scripts/cad/ui-command-reach.mjs --write` regenera el JSON;
 * `--check` (por defecto) falla si el JSON committeado no coincide con lo
 * que el registro real dice hoy.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const web = path.join(root, "apps/web");
const outPath = path.join(root, "docs/cad/evidence/ui-command-reach.json");

const ANTES = {
  alcanzablesConRaton: 17,
  fecha: "2026-08-31",
  fuente:
    "apps/web/src/lib/cad/toolbar.ts (CAD_TOOLBAR_ACTIONS), antes de la campaña de la cinta: " +
    "una paleta vertical fija de 17 botones en inglés, escrita a mano y desconectada del " +
    "registro de comandos. Dos de los 17 (\"Corridor\", \"Area\") eran vocabulario del " +
    "planificador industrial del que nació el producto (ver IDENTITY.md).",
};

function runProbe() {
  const require = createRequire(import.meta.url);
  const tsx = require.resolve("tsx/cli");
  const probePath = path.join(web, ".ui-command-reach-probe.mts");
  writeFileSync(
    probePath,
    `
import { cadRibbonExposedNames, CAD_RIBBON_UNEXPOSED, cadRibbonCoverageGaps } from "./src/lib/cad/ribbon";
import { CAD_COMMAND_DESCRIPTORS } from "./src/lib/cad/engine";
// Nombres únicos: los espejos de Inicio son botones repetidos, no comandos nuevos.
const alcanzables = cadRibbonExposedNames().size;
process.stdout.write(JSON.stringify({
  registryTotal: CAD_COMMAND_DESCRIPTORS.length,
  alcanzablesConRaton: alcanzables,
  noExpuestos: Object.keys(CAD_RIBBON_UNEXPOSED).length,
  huecos: cadRibbonCoverageGaps(),
}));
`,
    "utf8",
  );
  try {
    const stdout = execFileSync(process.execPath, [tsx, probePath], {
      cwd: web,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    });
    return JSON.parse(stdout);
  } finally {
    rmSync(probePath, { force: true });
  }
}

const despues = runProbe();
if (despues.huecos.length > 0) {
  console.error(
    `ui-command-reach: ${despues.huecos.length} comando(s) sin cobertura de cinta (${despues.huecos.join(", ")}). ` +
      "Corre `node scripts/cad/check-ribbon-coverage.mjs` para el detalle.",
  );
  process.exit(1);
}

const doc = {
  $schema: "urn:valle-design:schema:ui-command-reach:v1",
  schemaVersion: 1,
  generatedBy: "scripts/cad/ui-command-reach.mjs --write",
  registryTotal: despues.registryTotal,
  antes: {
    alcanzablesConRaton: ANTES.alcanzablesConRaton,
    porcentaje: round1((ANTES.alcanzablesConRaton / despues.registryTotal) * 100),
    fecha: ANTES.fecha,
    fuente: ANTES.fuente,
  },
  despues: {
    alcanzablesConRaton: despues.alcanzablesConRaton,
    porcentaje: round1((despues.alcanzablesConRaton / despues.registryTotal) * 100),
    noExpuestosConRazon: despues.noExpuestos,
    fuente:
      "apps/web/src/lib/cad/ribbon.ts (CAD_RIBBON_DATA), generado de CAD_COMMAND_DESCRIPTORS: " +
      "cada comando del registro real tiene un botón de cinta (components/cad/ribbon/CadRibbon.tsx) " +
      "que lo despacha por el mismo camino que teclearlo — commandEngineRef.current.invoke(nombre). " +
      "Verificado por scripts/cad/check-ribbon-coverage.mjs y apps/web/src/lib/cad/ribbon.spec.ts.",
  },
};

function round1(value) {
  return Math.round(value * 10) / 10;
}

const rendered = `${JSON.stringify(doc, null, 2)}\n`;

if (process.argv.includes("--write")) {
  writeFileSync(outPath, rendered, "utf8");
  console.log(`ui-command-reach: escrito ${path.relative(root, outPath)}`);
} else {
  if (!existsSync(outPath)) {
    console.error(`ui-command-reach: falta ${path.relative(root, outPath)}. Corre con --write.`);
    process.exit(1);
  }
  const current = readFileSync(outPath, "utf8");
  if (current !== rendered) {
    console.error(
      `ui-command-reach: ${path.relative(root, outPath)} está desactualizado respecto al registro real. ` +
        "Corre `node scripts/cad/ui-command-reach.mjs --write` y commitea el resultado.",
    );
    process.exit(1);
  }
  console.log(
    `ui-command-reach OK — ${doc.antes.alcanzablesConRaton} → ${doc.despues.alcanzablesConRaton} de ${doc.registryTotal} comandos alcanzables con el ratón.`,
  );
}
