import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { globSync } from "glob";

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
assert.match(status, /No se\s+declara ningún estado operativo/);

/**
 * VOZ PÚBLICA: la superficie comercial habla como VALLECAD al cliente,
 * no como una instalación operada por un tercero. "despliegue" y "el
 * operador" son vocabulario de auto-hospedaje que no debe llegar al
 * visitante de vallecad.com.
 *
 * La aserción mira SÓLO texto de cara al usuario — comentarios y
 * expresiones JSX eliminados — para no penalizar la documentación interna
 * donde "despliegue" es lenguaje técnico correcto.
 */
const voiceRoutes = [
  "src/app/contact/page.tsx",
  "src/app/privacy/page.tsx",
  "src/app/status/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/support/page.tsx",
  ...globSync("src/app/precios/**/*.tsx"),
].filter((file) => !file.endsWith(".spec.ts"));

/** Elimina comentarios, expresiones JSX {…} y atributos de etiquetas. */
const stripCode = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\w+="[^"]*"/g, "");

for (const file of voiceRoutes) {
  const visible = stripCode(readFileSync(file, "utf8"));
  assert.doesNotMatch(
    visible,
    /\bdespliegue\b/i,
    `${file}: la superficie pública no debe decir "despliegue"`,
  );
  assert.doesNotMatch(
    visible,
    /\bel operador\b/i,
    `${file}: la superficie pública no debe decir "el operador"`,
  );
}

/**
 * EL CANDADO DE MARCA, y por qué vive aquí y no en un script suelto.
 *
 * El nombre del producto sale del manifiesto (`PRODUCT_LABEL.design`, que
 * resuelve `NEXT_PUBLIC_BRAND_*`). Un rebranding es un cambio de
 * configuración, y lo fue de verdad el día que vallecad.com dejó de decir
 * «Valle Design»: ese literal estaba escrito a mano en treinta y tres
 * ficheros de la superficie pública y el manifiesto no alcanzaba a ninguno.
 *
 * La regla mira el TEXTO VISIBLE (sin comentarios: el equipo necesita poder
 * explicar por qué se retiró un nombre) de la misma superficie que barre
 * `check:surface`, y corre en `npm run test:specs`, que sí está en CI. Un
 * gate que nadie ejecuta no protege nada.
 */
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const brandSurface = [
  "src/app/page.tsx",
  "src/app/opengraph-image.tsx",
  "src/app/twitter-image.tsx",
  "src/app/register/page.tsx",
  "src/app/login/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/support/page.tsx",
  "src/app/novedades/page.tsx",
  "src/app/educacion/page.tsx",
  "src/components/PublicNav.tsx",
  "src/config/site-routes.ts",
  ...globSync("src/app/precios/**/*.tsx"),
  ...globSync("src/components/marketing/**/*.tsx"),
  ...globSync("src/lib/marketing/**/*.ts"),
  ...globSync("src/lib/seo/**/*.{ts,tsx}"),
].filter((file) => !file.endsWith(".spec.ts"));

for (const file of brandSurface) {
  assert.doesNotMatch(
    stripComments(readFileSync(file, "utf8")),
    /valle\s*design/i,
    `${file} escribe el nombre del producto a mano: léelo de PRODUCT_LABEL.design (@/config/brand)`,
  );
}

console.log(
  `public-pages: rutas, enlaces y claims públicos verificados (portada + centro de preguntas); ${brandSurface.length} ficheros sin la marca escrita a mano`,
);
