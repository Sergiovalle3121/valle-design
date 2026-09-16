import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";

const landing = readFileSync("src/app/page.tsx", "utf8");
const commercial = readFileSync("src/config/commercial.ts", "utf8");
/**
 * La barra pública se EXTRAJO de la portada (ola 3 de la campaña de diseño):
 * dejó de ser texto plano sin fondo para ser una barra pegajosa con menú real
 * en móvil, y ahora la comparten portada, precios y guías. Los enlaces del
 * embudo viven ahí, así que la comprobación los sigue hasta donde están: lo que
 * esta regla defiende es que un visitante PUEDA llegar a `/login` y `/register`
 * desde la portada, no en qué archivo está escrito el `href`.
 */
const landingNav = readFileSync("src/components/PublicNav.tsx", "utf8");
const landingSurface = `${landing}
${landingNav}`;

assert.match(
  landing,
  /<PublicNav\s*\/>/,
  "la portada debe montar la barra pública que trae los enlaces del embudo",
);

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
    landingSurface.includes(`href="/${route}"`),
    `landing no enlaza /${route}`,
  );
}

/**
 * LA REGLA DE HONESTIDAD, y por qué desde la campaña de firma cubre más de un
 * archivo.
 *
 * El centro de preguntas se llevó el texto del FAQ a `lib/marketing/faq.ts`
 * para que la página, el buscador y el JSON-LD digan literalmente lo mismo. Ese
 * módulo es superficie pública: se PINTA en la portada. Si la comprobación se
 * quedara mirando sólo `page.tsx`, la regla habría seguido en verde mientras la
 * treintena de respuestas nuevas podía prometer lo que quisiera — que es
 * exactamente cómo un gate deja de proteger sin que nadie lo desactive.
 *
 * La sección «Capacidades» tuvo el mismo movimiento en la campaña del
 * explorador por pestañas: su copy salió de `page.tsx` hacia
 * `CapabilityExplorer.tsx`. Mismo riesgo, misma corrección: ese componente
 * entra a la lista o el gate deja de ver exactamente el texto que antes veía.
 */
const publicCopy = `${landing}
${readFileSync("src/lib/marketing/faq.ts", "utf8")}
${readFileSync("src/components/marketing/CapabilityExplorer.tsx", "utf8")}`;

assert.doesNotMatch(
  publicCopy,
  /\bIA\b|inteligencia artificial|certificaci[oó]n|reviews|historial de versiones/i,
  "la superficie pública no debe anunciar capacidades no demostradas",
);
assert.doesNotMatch(
  publicCopy,
  /[$€]\s*\d|\d+(?:[.,]\d+)?\s*(?:USD|MXN|EUR)|approvedPrice/i,
  "la superficie pública no debe publicar precios sin aprobación",
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

// ── La superficie pública no habla como instalación operada por tercero ────
// "despliegue" y "el operador" son vocabulario de auto-hospedaje que no
// corresponde a un SaaS. Se comprueba SÓLO texto visible (nodos JSX y props
// title/intro/description), nunca comentarios de desarrollador.
const DEPLOYMENT_COPY = /\bdespliegue\b/iu;
const OPERATOR_COPY = /\bel operador\b/iu;

function extractVisibleText(source: string): string {
  const lines = source.split("\n");
  const textParts: string[] = [];
  let inComment = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("import ")) continue;
    if (trimmed.startsWith("//")) continue;
    if (trimmed.startsWith("/*")) { inComment = true; continue; }
    if (inComment) { if (trimmed.includes("*/")) inComment = false; continue; }
    // Props title/intro/description
    for (const m of line.matchAll(/(?:title|intro|description)[^"]*"([^"]+)"/g)) {
      textParts.push(m[1]);
    }
    // Nodos de texto JSX (entre > y <)
    for (const m of line.matchAll(/>([^<{]+)</g)) {
      textParts.push(m[1]);
    }
  }
  return textParts.join(" ");
}

for (const route of ["contact", "privacy", "status", "support", "terms"]) {
  const source = readFileSync(`src/app/${route}/page.tsx`, "utf8");
  const visible = extractVisibleText(source);
  assert.doesNotMatch(
    visible,
    DEPLOYMENT_COPY,
    `/${route}: el texto visible no debe decir "despliegue"`,
  );
  assert.doesNotMatch(
    visible,
    OPERATOR_COPY,
    `/${route}: el texto visible no debe decir "el operador"`,
  );
}
// PricingCatalog.tsx vive en /precios
{
  const source = readFileSync("src/app/precios/PricingCatalog.tsx", "utf8");
  const visible = extractVisibleText(source);
  assert.doesNotMatch(
    visible,
    DEPLOYMENT_COPY,
    "/precios: el texto visible no debe decir \"despliegue\"",
  );
  assert.doesNotMatch(
    visible,
    OPERATOR_COPY,
    "/precios: el texto visible no debe decir \"el operador\"",
  );
}

console.log(
  "public-pages: rutas, enlaces y claims públicos verificados (portada + centro de preguntas)",
);
