/**
 * LA SUPERFICIE INDEXABLE, VERIFICADA.
 *
 * Un fallo de SEO técnico no rompe ninguna pantalla: la página se ve perfecta
 * mientras el buscador la ignora, la indexa dos veces o —lo peor— se lleva al
 * índice una ruta que exige sesión. Nadie lo nota hasta que alguien pregunta
 * por qué no aparecemos, y para entonces lleva meses roto. Es exactamente el
 * tipo de defecto que sólo puede atrapar un test.
 *
 * Este spec comprueba cinco cosas que se rompen solas con el tiempo:
 *
 *   1. El sitemap dice la verdad: están todas las rutas públicas y ninguna
 *      privada.
 *   2. `robots` deja rastrear y señala el sitemap.
 *   3. Cada página pública declara título, descripción y canonical propios.
 *   4. Los datos estructurados son JSON válido, con el `@type` correcto, y la
 *      oferta NO lleva precio inventado.
 *   5. Los enlaces internos de la landing van a rutas que existen —con una
 *      única excepción declarada, `/precios`, que construye otro frente.
 *
 * Se importan los módulos de verdad en vez de leer los archivos con expresiones
 * regulares: un sitemap que compila pero devuelve una lista vacía pasaría
 * cualquier comprobación de texto.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import {
  DOC_GUIDES,
  PRICING_PATH,
  PRIVATE_ROUTE_PREFIXES,
  PUBLIC_ROUTES,
  SITE_URL,
  absoluteUrl,
  docGuidePath,
  isPrivateRoute,
} from "@/config/site-routes";
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  productJsonLd,
  softwareApplicationJsonLd,
  techArticleJsonLd,
  type JsonLdNode,
} from "@/lib/seo/structured-data";

/**
 * Límites de longitud. No son caprichos: por debajo del mínimo la etiqueta no
 * describe nada y por encima del máximo el buscador la corta a media frase, que
 * es peor que una corta porque parece descuidado.
 */
const TITLE_MIN = 10;
const TITLE_MAX = 70;
const DESCRIPTION_MIN = 70;
const DESCRIPTION_MAX = 170;

/** Rutas públicas con página en ESTA rama. `/precios` llega desde otro frente. */
const routesWithPageHere = PUBLIC_ROUTES.map((route) => route.path).filter(
  (path) => path !== PRICING_PATH,
);

void (async () => {
  /* ── 1. Sitemap ─────────────────────────────────────────────────────────── */
  const sitemap = (await import("@/app/sitemap")).default();

  assert.equal(
    sitemap.length,
    PUBLIC_ROUTES.length,
    "el sitemap debe tener exactamente una entrada por ruta pública declarada",
  );

  const sitemapUrls = sitemap.map((entry) => entry.url);
  assert.equal(
    new Set(sitemapUrls).size,
    sitemapUrls.length,
    "una URL duplicada en el sitemap es una señal contradictoria para el rastreador",
  );

  for (const route of PUBLIC_ROUTES) {
    assert.ok(
      sitemapUrls.includes(absoluteUrl(route.path)),
      `el sitemap no publica la ruta pública ${route.path}`,
    );
  }

  // `/precios` va en la lista aunque su página aún no exista en esta rama: es
  // el contrato con el frente que la construye.
  assert.ok(
    sitemapUrls.includes(absoluteUrl(PRICING_PATH)),
    "el sitemap debe incluir /precios: es la página comercial del embudo",
  );

  for (const guide of DOC_GUIDES) {
    assert.ok(
      sitemapUrls.includes(absoluteUrl(docGuidePath(guide.slug))),
      `la guía ${guide.slug} no está en el sitemap`,
    );
  }

  for (const url of sitemapUrls) {
    assert.ok(
      url.startsWith(`${SITE_URL}/`) || url === SITE_URL,
      `URL del sitemap fuera del origen configurado: ${url}`,
    );
    const path = url.slice(SITE_URL.length) || "/";
    assert.ok(
      !isPrivateRoute(path),
      `ruta privada filtrada al sitemap: ${path}. Un rastreador sólo vería un login`,
    );
  }

  // Las rutas privadas se comprueban por su nombre además de por el prefijo:
  // si alguien renombra un prefijo, esta lista lo delata.
  for (const privatePath of [
    "/studio",
    "/studio/abc",
    "/dashboard",
    "/dashboard/cad",
    "/logout",
    "/reset-password",
    "/verify-email",
    "/forgot-password",
  ]) {
    assert.ok(isPrivateRoute(privatePath), `${privatePath} debe ser privada`);
    assert.ok(
      !sitemapUrls.includes(absoluteUrl(privatePath)),
      `${privatePath} no puede estar en el sitemap`,
    );
  }

  for (const entry of sitemap) {
    assert.ok(
      typeof entry.priority === "number" &&
        entry.priority > 0 &&
        entry.priority <= 1,
      `prioridad fuera de rango en ${entry.url}`,
    );
    assert.ok(entry.lastModified instanceof Date, `falta lastModified en ${entry.url}`);
  }

  /* ── 2. Robots ──────────────────────────────────────────────────────────── */
  const robots = (await import("@/app/robots")).default();
  const rules = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;

  assert.ok(rules, "robots.txt sin reglas no dice nada");
  assert.equal(rules?.userAgent, "*", "la regla debe aplicar a todo rastreador");
  assert.equal(rules?.allow, "/", "el sitio público tiene que ser rastreable");

  const disallow = Array.isArray(rules?.disallow)
    ? rules.disallow
    : [rules?.disallow ?? ""];
  for (const prefix of PRIVATE_ROUTE_PREFIXES) {
    assert.ok(
      disallow.includes(`${prefix}/`),
      `robots no cierra la ruta privada ${prefix}`,
    );
  }
  assert.equal(
    robots.sitemap,
    absoluteUrl("/sitemap.xml"),
    "robots debe apuntar al sitemap con URL absoluta",
  );

  /* ── 3. Metadata de cada página pública ─────────────────────────────────── */
  for (const path of routesWithPageHere) {
    const modulePath = path === "/" ? "@/app/page" : `@/app${path}/page`;
    const page = (await import(modulePath)) as {
      metadata?: {
        title?: unknown;
        description?: unknown;
        alternates?: { canonical?: unknown };
        openGraph?: { url?: unknown; title?: unknown };
      };
    };

    const metadata = page.metadata;
    assert.ok(metadata, `la página ${path} no exporta metadata`);

    const title = metadata?.title;
    assert.equal(typeof title, "string", `${path}: el title debe ser una cadena`);
    const titleText = String(title);
    assert.ok(
      titleText.length >= TITLE_MIN && titleText.length <= TITLE_MAX,
      `${path}: title de ${titleText.length} caracteres, fuera de [${TITLE_MIN}, ${TITLE_MAX}]`,
    );
    // El layout raíz ya añade "· Valle Design": repetirlo aquí duplicaría marca.
    assert.doesNotMatch(
      titleText,
      /· Valle Design/,
      `${path}: el title no debe repetir el sufijo de marca que pone la plantilla`,
    );

    const description = String(metadata?.description ?? "");
    assert.ok(
      description.length >= DESCRIPTION_MIN &&
        description.length <= DESCRIPTION_MAX,
      `${path}: description de ${description.length} caracteres, fuera de [${DESCRIPTION_MIN}, ${DESCRIPTION_MAX}]`,
    );

    assert.equal(
      metadata?.alternates?.canonical,
      absoluteUrl(path),
      `${path}: canonical ausente o apuntando a otra URL`,
    );
    assert.equal(
      metadata?.openGraph?.url,
      absoluteUrl(path),
      `${path}: falta la URL de Open Graph`,
    );
  }

  /* ── 4. Datos estructurados ─────────────────────────────────────────────── */
  const parse = (node: JsonLdNode): Record<string, unknown> => {
    const serialized = JSON.stringify(node);
    assert.ok(serialized, "el nodo JSON-LD no se pudo serializar");
    return JSON.parse(serialized) as Record<string, unknown>;
  };

  const software = parse(
    softwareApplicationJsonLd({
      description: "descripción de prueba",
      featureList: ["una capacidad"],
    }),
  );
  assert.equal(software["@type"], "SoftwareApplication");
  assert.equal(software["@context"], "https://schema.org");
  assert.equal(software.applicationCategory, "DesignApplication");

  const product = parse(productJsonLd({ description: "descripción de prueba" }));
  assert.equal(product["@type"], "Product");
  assert.equal(product["@context"], "https://schema.org");

  // LA REGLA DE HONESTIDAD, CONVERTIDA EN ASERCIÓN: esta rama no tiene fuente
  // de precios aprobada, así que ninguna oferta puede llevar precio. El día que
  // /precios publique el suyo, este spec obligará a decidirlo a conciencia.
  for (const [label, node] of [
    ["SoftwareApplication", software],
    ["Product", product],
  ] as const) {
    const offer = node.offers as Record<string, unknown> | undefined;
    assert.ok(offer, `${label}: falta la oferta`);
    assert.equal(offer?.["@type"], "Offer");
    assert.equal(
      offer?.price,
      undefined,
      `${label}: la oferta no puede publicar un precio sin fuente real en esta rama`,
    );
    assert.equal(
      offer?.priceCurrency,
      undefined,
      `${label}: sin precio tampoco hay moneda`,
    );
    assert.equal(
      offer?.url,
      absoluteUrl(PRICING_PATH),
      `${label}: la oferta debe apuntar a la página de precios`,
    );
  }

  const faq = parse(
    faqPageJsonLd([["¿Pregunta de prueba?", "Respuesta de prueba."]]),
  );
  assert.equal(faq["@type"], "FAQPage");
  const questions = faq.mainEntity as Record<string, unknown>[];
  assert.equal(questions[0]["@type"], "Question");
  assert.equal(
    (questions[0].acceptedAnswer as Record<string, unknown>)["@type"],
    "Answer",
  );

  const article = parse(
    techArticleJsonLd({
      path: docGuidePath(DOC_GUIDES[0].slug),
      title: DOC_GUIDES[0].title,
      description: DOC_GUIDES[0].description,
    }),
  );
  assert.equal(article["@type"], "TechArticle");
  assert.equal(article.url, absoluteUrl(docGuidePath(DOC_GUIDES[0].slug)));

  const breadcrumb = parse(
    breadcrumbJsonLd([
      ["Inicio", "/"],
      ["Guías", "/docs"],
    ]),
  );
  assert.equal(breadcrumb["@type"], "BreadcrumbList");
  assert.equal(
    (breadcrumb.itemListElement as Record<string, unknown>[])[1].position,
    2,
    "las migas se numeran desde 1 y en orden",
  );

  /* ── 5. Enlaces internos de la landing y honestidad del copy ────────────── */
  const landing = readFileSync("src/app/page.tsx", "utf8");

  const linkedPaths = new Set(
    [...landing.matchAll(/href="(\/[^"#?]*)"/g)].map((match) => match[1]),
  );
  for (const path of linkedPaths) {
    const file =
      path === "/" ? "src/app/page.tsx" : `src/app${path}/page.tsx`;
    assert.ok(
      existsSync(file),
      `la landing enlaza ${path} y esa página no existe`,
    );
  }

  // Enlaces obligatorios del embudo. `/precios` se escribe por constante, así
  // que se comprueba por el símbolo y no por el literal.
  assert.ok(landing.includes('href="/register"'), "la landing debe enlazar /register");
  assert.ok(landing.includes('href="/login"'), "la landing debe enlazar /login");
  assert.ok(
    landing.includes("href={PRICING_PATH}"),
    "la landing debe enlazar la página de precios",
  );

  // DEPENDENCIA EXTERNA DECLARADA. Mientras el otro frente no aterrice,
  // `/precios` es la única ruta enlazada sin página en este árbol. Cuando
  // aterrice, la rama superior de este `if` la trata como una más.
  const pricingPage = `src/app${PRICING_PATH}/page.tsx`;
  if (!existsSync(pricingPage)) {
    assert.ok(
      PUBLIC_ROUTES.some((route) => route.path === PRICING_PATH),
      "aunque su página llegue de otra rama, /precios tiene que seguir en la lista pública",
    );
  }

  for (const guide of DOC_GUIDES) {
    assert.ok(
      existsSync(`src/app/docs/${guide.slug}/page.tsx`),
      `falta la página de la guía ${guide.slug}`,
    );
    assert.ok(
      landing.includes(guide.slug) || landing.includes("DOC_GUIDES"),
      "la landing debe enlazar las guías",
    );
  }
  assert.equal(DOC_GUIDES.length, 5, "el paquete de captación son cinco guías");

  /**
   * Cada guía tiene que tener CONTENIDO, no un esqueleto con buen título. El
   * recuento tira el código y se queda con la prosa; es conservador —descarta
   * las expresiones entre llaves— así que el mínimo real es todavía mayor. Un
   * artículo de captación por debajo de 600 palabras no responde la pregunta
   * que trajo al lector y el buscador lo trata como página de relleno.
   */
  const countWords = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^[ \t]*\/\/.*$/gm, " ")
      .replace(/^import[\s\S]*?;$/gm, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\{[^{}]*\}/g, " ")
      .replace(/[^\p{L}\p{N}'-]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 1).length;

  for (const guide of DOC_GUIDES) {
    const total = countWords(
      readFileSync(`src/app/docs/${guide.slug}/page.tsx`, "utf8"),
    );
    assert.ok(
      total >= 600 && total <= 1200,
      `la guía ${guide.slug} tiene ${total} palabras; el objetivo es entre 600 y 1200`,
    );
  }

  /**
   * Claims prohibidos, en la landing y en cada guía (ADR-0004 y ADR-0007).
   *
   * Se miran sólo las cadenas que ve el visitante: los comentarios del código
   * hablan PRECISAMENTE de estas prohibiciones —"aquí no hay testimonios
   * porque no existe ni uno real"— y harían saltar sus propias reglas.
   */
  const visibleCopy = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^[ \t]*\/\/.*$/gm, " ");

  const publicCopy = [
    landing,
    ...DOC_GUIDES.map((guide) =>
      readFileSync(`src/app/docs/${guide.slug}/page.tsx`, "utf8"),
    ),
    readFileSync("src/app/docs/page.tsx", "utf8"),
  ].map(visibleCopy);
  for (const source of publicCopy) {
    assert.doesNotMatch(
      source,
      /compatib\w*\s+con\s+DWG/i,
      "prohibido anunciar compatibilidad DWG",
    );
    assert.doesNotMatch(
      source,
      /(reemplaz|sustituy|substituy)\w*\s+(a\s+)?AutoCAD/i,
      "prohibido presentar el producto como sustituto de AutoCAD",
    );
    assert.doesNotMatch(
      source,
      /abre\s+(archivos\s+)?DWG|abrir\s+(archivos\s+)?DWG(?!\?)/i,
      "prohibido afirmar que se abren archivos DWG",
    );
    assert.doesNotMatch(
      source,
      /testimoni|caso de éxito|nuestros clientes dicen/i,
      "no hay testimonios reales en el repositorio: no puede haber sección de testimonios",
    );
  }

  /* La landing sigue sin publicar precios: su fuente es /precios. */
  assert.doesNotMatch(
    landing,
    /[$€]\s*\d|\d+(?:[.,]\d+)?\s*(?:USD|MXN|EUR)/i,
    "la landing no publica tarifas: la fuente de precios es su propia página",
  );

  /* El JSON-LD tiene que estar realmente inyectado, no sólo definido. */
  for (const tag of ["softwareApplicationJsonLd", "productJsonLd", "faqPageJsonLd"]) {
    assert.ok(landing.includes(tag), `la landing no inyecta ${tag}`);
  }

  /* Los archivos de convención de Next tienen que existir donde Next los busca. */
  assert.ok(existsSync("src/app/sitemap.ts"), "falta src/app/sitemap.ts");
  assert.ok(existsSync("src/app/robots.ts"), "falta src/app/robots.ts");

  console.log(
    `seo-surface: ${sitemap.length} rutas públicas en el sitemap, ${routesWithPageHere.length} páginas con metadata y canonical, 0 rutas privadas indexables`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
