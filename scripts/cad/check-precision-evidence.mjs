#!/usr/bin/env node
/**
 * Gate de PRECISIÓN con coordenadas grandes (orden UTM).
 *
 * Envoltorio delgado sobre `apps/web/scripts/large-coordinate-precision-probe.mts
 * --check`: recomputa la sonda (que desde 2026-08-27 atraviesa el teselador
 * REAL, `tessellateCadEntity`, en vez de fabricar su propia resta — ver el
 * comentario de esa sonda) y falla si el árbol produce un número distinto al
 * committeado en `docs/cad/evidence/large-coordinate-precision.json`. Mismo
 * patrón que `check:command-integrity`/`check:dwg-evidence`: sin este gate el
 * artefacto es sólo un archivo que alguien escribió una vez.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const web = path.join(root, "apps/web");
const probe = path.join(web, "scripts/large-coordinate-precision-probe.mts");

const require = createRequire(import.meta.url);
const tsx = require.resolve("tsx/cli");

try {
  const stdout = execFileSync(process.execPath, [tsx, probe, "--check"], {
    cwd: web,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    timeout: 60_000,
  });
  process.stdout.write(stdout);
} catch (error) {
  process.exit(typeof error.status === "number" ? error.status : 1);
}
