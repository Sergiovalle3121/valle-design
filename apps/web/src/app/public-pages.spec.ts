import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";

const landing = readFileSync("src/app/page.tsx", "utf8");
const commercial = readFileSync("src/config/commercial.ts", "utf8");

const publicRoutes = [
  "docs",
  "support",
  "status",
  "contact",
  "privacy",
  "terms",
  "licenses",
] as const;

for (const route of publicRoutes) {
  assert.ok(
    existsSync(`src/app/${route}/page.tsx`),
    `falta la página pública /${route}`,
  );
  assert.ok(
    commercial.includes(`"/${route}"`),
    `falta el fallback local /${route}`,
  );
}

for (const route of ["login", "register"] as const) {
  assert.ok(existsSync(`src/app/${route}/page.tsx`), `falta /${route}`);
  assert.ok(
    landing.includes(`href="/${route}"`),
    `landing no enlaza /${route}`,
  );
}

assert.doesNotMatch(
  landing,
  /\bIA\b|inteligencia artificial|certificaci[oó]n|reviews|historial de versiones/i,
  "la landing no debe anunciar capacidades no demostradas",
);
assert.doesNotMatch(
  landing,
  /[$€]\s*\d|\d+(?:[.,]\d+)?\s*(?:USD|MXN|EUR)|approvedPrice/i,
  "la landing no debe publicar precios sin aprobación",
);
assert.doesNotMatch(
  commercial,
  /COMMERCIAL_PLANS|approvedPrice|salesOnly/,
  "la configuración pública no debe simular planes comerciales",
);

const licenses = readFileSync("src/app/licenses/page.tsx", "utf8");
assert.match(licenses, /Sergiovalle3121\/valle-design\/blob\/main/);
assert.ok(licenses.includes("LICENSE"));
assert.ok(licenses.includes("THIRD_PARTY_NOTICES.md"));

const status = readFileSync("src/app/status/page.tsx", "utf8");
assert.match(status, /No se declara ningún estado operativo/);

console.log("public-pages: rutas, enlaces y claims públicos verificados");
