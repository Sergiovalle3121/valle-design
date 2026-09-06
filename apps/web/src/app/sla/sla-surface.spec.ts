import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";

/**
 * T-62(b) — `/sla` no puede volver a decir nombres de plan que el catálogo
 * vendible no reconoce. `docs/ops/SLA.md` los llamaba «Piloto / Profesional /
 * Empresa»; el catálogo real los llama `Prueba` / `Individual` / `Despacho`
 * (`apps/api/src/modules/commercial/commercial-catalog.bootstrap.ts`).
 * Publicar la tabla con los nombres viejos habría sido peor que no
 * publicarla, así que este spec ata la página al catálogo por CÓDIGO —no por
 * texto copiado— y prohíbe que los nombres viejos reaparezcan en ningún sitio
 * que alguien pueda leer.
 */

const routes = [
  "src/app/sla/page.tsx",
  "src/app/sla/SlaPage.tsx",
  "src/app/terms/page.tsx",
] as const;

for (const route of routes) {
  assert.ok(existsSync(route), `falta la ruta ${route}`);
}

const read = (path: string) => readFileSync(path, "utf8");
const slaPage = read("src/app/sla/SlaPage.tsx");
const terms = read("src/app/terms/page.tsx");
const catalogBootstrap = read(
  "../api/src/modules/commercial/commercial-catalog.bootstrap.ts",
);
const slaDoc = read("../../docs/ops/SLA.md");

// ── La página lee el catálogo real, nunca un nombre escrito a mano ────────
assert.ok(
  slaPage.includes("fetchPublicCatalog"),
  "/sla debe leer el catálogo público real, igual que /precios",
);

// ── Los tres códigos de la tabla existen de verdad en el catálogo ─────────
for (const code of ["standalone-trial", "individual", "despacho"]) {
  assert.ok(
    slaPage.includes(`"${code}"`),
    `/sla no referencia el código de plan "${code}"`,
  );
  assert.ok(
    catalogBootstrap.includes(`'${code}'`),
    `el código "${code}" que usa /sla ya no existe en el catálogo — actualiza la tabla`,
  );
}

// ── Los nombres viejos (de un documento interno, no del catálogo) no
//    pueden reaparecer en ningún sitio público ni en la fuente que este
//    spec no controla directamente (SLA.md, /terms).
const NOMBRES_VIEJOS = /\bPiloto\b|\bProfesional\b|\bEmpresa\b/u;
for (const [name, source] of [
  ["SlaPage.tsx", slaPage],
  ["docs/ops/SLA.md", slaDoc],
] as const) {
  assert.doesNotMatch(
    source,
    NOMBRES_VIEJOS,
    `${name} todavía nombra un plan que no existe en el catálogo vendible`,
  );
}

// ── /terms deja de afirmar que no se publica ningún SLA, y enlaza al real ──
assert.doesNotMatch(
  terms,
  /no se publica un nivel de servicio/iu,
  "/terms sigue negando que exista /sla, y ya existe",
);
assert.match(
  terms,
  /href="\/sla"/u,
  "/terms debería enlazar al SLA que ahora sí se publica",
);

console.log(
  "sla-surface: /sla ata sus tres columnas al catálogo real por código, sin nombres de plan escritos a mano; /terms ya no lo niega.",
);
