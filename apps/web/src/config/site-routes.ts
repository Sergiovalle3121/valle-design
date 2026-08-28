/**
 * RUTAS PÚBLICAS — UNA sola lista, tres consumidores.
 *
 * El sitemap, `robots.txt` y los enlaces de la landing se desincronizan solos
 * en cuanto cada uno mantiene su propia copia: alguien añade una página, la
 * enlaza, y el buscador nunca se entera; o al revés, se retira una ruta y el
 * sitemap sigue prometiéndola con un 404 detrás. Aquí la lista se declara una
 * vez y los tres la leen, de modo que el error posible sea "olvidé añadirla a
 * la lista" —visible en el spec— y no "tres ficheros dicen cosas distintas".
 *
 * La cara privada se declara TAMBIÉN aquí, y no como ausencia: `robots.ts`
 * necesita prohibirla explícitamente y el spec necesita poder afirmar que
 * ninguna ruta con sesión detrás se coló en el sitemap. Una ruta que exige
 * sesión no tiene nada que hacer en un índice público: el rastreador sólo vería
 * la pantalla de login, y ese contenido duplicado compite con las páginas que
 * sí queremos posicionar.
 */
import { BRAND } from "@/config/brand";

/**
 * Origen público del despliegue. Se lee de la configuración —nunca de un
 * dominio escrito a mano— y cae al manifiesto de marca, cuyo valor por defecto
 * es `https://example.invalid`. Ese fallback es deliberado: un despliegue sin
 * configurar emite URLs obviamente no resolubles en vez de reclamar un dominio
 * que no le pertenece.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  BRAND.websiteUrl ||
  "https://example.invalid"
).replace(/\/+$/, "");

/** URL absoluta de una ruta interna. El canonical y el sitemap la exigen. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path === "/" ? "" : path}`;
}

/**
 * Prioridad y frecuencia son PISTAS para el rastreador, no promesas: se ordenan
 * por cuánto trabajo comercial hace cada página, no por gusto.
 */
export type PublicRoute = {
  readonly path: string;
  readonly changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  readonly priority: number;
};

/**
 * GUÍAS DE CAPTACIÓN bajo `/docs`. Viven aquí —y no sueltas en cada página—
 * porque el título y la descripción los consumen tres sitios a la vez: el
 * `metadata` de la propia guía, el índice `/docs` que la enlaza y el sitemap.
 * Duplicarlos garantizaría que el índice acabe anunciando un título que la
 * página ya no tiene.
 */
export type DocGuide = {
  readonly slug: string;
  /** Título de la página y del enlace. Sin el sufijo de marca: lo pone el layout. */
  readonly title: string;
  /** Meta description. Longitud de escaparate: entre 80 y 160 caracteres. */
  readonly description: string;
  /** Frase de apoyo del índice, más humana que la meta description. */
  readonly summary: string;
};

export const DOC_GUIDES = [
  {
    slug: "dibujar-planta-arquitectonica",
    title: "Cómo dibujar una planta arquitectónica paso a paso",
    description:
      "Guía paso a paso para levantar una planta arquitectónica en el navegador: unidades, capas, muros, cotas asociativas y lámina lista para imprimir.",
    summary:
      "De la unidad de dibujo a la lámina impresa, con la secuencia de trabajo que evita rehacer el plano.",
  },
  {
    slug: "dxf-vs-dwg",
    title: "DXF y DWG: qué significa cada formato para tu despacho",
    description:
      "En qué se diferencian DXF y DWG, qué formato pedir a tus colaboradores y qué hace exactamente Valle Design con cada uno de los dos.",
    summary:
      "La diferencia real entre los dos formatos y el límite exacto de lo que Valle Design abre y entrega.",
  },
  {
    slug: "automatizar-con-autolisp",
    title: "Automatizar tareas repetitivas con AutoLISP en el navegador",
    description:
      "Cómo escribir rutinas AutoLISP que dibujan y modifican entidades desde el navegador, y qué subconjunto del lenguaje está disponible hoy.",
    summary:
      "Rutinas que hacen el trabajo repetitivo por ti, con el alcance del intérprete declarado sin adornos.",
  },
  {
    slug: "acotacion-asociativa",
    title: "Acotación asociativa: por qué tus cotas deben moverse con el dibujo",
    description:
      "Qué es una cota asociativa, por qué una medida escrita a mano acaba mintiendo en obra y cómo acotar en Valle Design para que no pase.",
    summary:
      "La diferencia entre una cota que mide y un número escrito encima de una línea.",
  },
  {
    slug: "imprimir-planos-pdf-escala",
    title: "Imprimir y exportar planos a PDF a escala",
    description:
      "Cómo llevar un plano del modelo a una lámina PDF a escala real: papel, ventanas, escalas normalizadas y comprobación antes de entregar.",
    summary:
      "Del modelo a la lámina: escala normalizada, papel correcto y una comprobación final que evita reimprimir.",
  },
] as const satisfies readonly DocGuide[];

/**
 * El slug es un tipo, no una cadena cualquiera: así una guía cuyo directorio se
 * renombre deja de compilar en vez de servir un 404 silencioso desde el índice.
 */
export type DocGuideSlug = (typeof DOC_GUIDES)[number]["slug"];

/** Ruta de una guía dentro de `/docs`. */
export function docGuidePath(slug: DocGuideSlug): string {
  return `/docs/${slug}`;
}

/** Ficha de una guía. Lanza si el slug no está declarado: fallo cerrado. */
export function docGuide(slug: DocGuideSlug): DocGuide {
  const guide = DOC_GUIDES.find((candidate) => candidate.slug === slug);
  if (!guide) throw new Error(`Guía no declarada en DOC_GUIDES: ${slug}`);
  return guide;
}

/**
 * `/precios` se lista aunque su página se construya en otro frente: la lista es
 * el contrato entre ambos y el enlace de la landing ya apunta ahí. Sacarla
 * "hasta que exista" garantizaría que nadie se acuerde de volver a meterla.
 */
export const PRICING_PATH = "/precios";

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: PRICING_PATH, changeFrequency: "weekly", priority: 0.9 },
  { path: "/docs", changeFrequency: "weekly", priority: 0.8 },
  // La consola de la API es la puerta del integrador: quien evalúa si puede
  // automatizar el producto llega buscando "API CAD en línea", no una guía de
  // dibujo. Va en el sitemap con prioridad alta porque decide compras grandes.
  { path: "/docs/api", changeFrequency: "weekly", priority: 0.8 },
  ...DOC_GUIDES.map(
    (guide): PublicRoute => ({
      path: docGuidePath(guide.slug),
      changeFrequency: "monthly",
      priority: 0.7,
    }),
  ),
  // Las dos páginas que la campaña de firma propia añadió a la superficie
  // pública. `/novedades` demuestra que el producto está vivo, que en una beta
  // es un argumento de venta; `/educacion` recoge el interés de las escuelas
  // mientras el plan educativo sigue tras flag.
  { path: "/novedades", changeFrequency: "weekly", priority: 0.6 },
  { path: "/educacion", changeFrequency: "monthly", priority: 0.6 },
  { path: "/register", changeFrequency: "monthly", priority: 0.6 },
  { path: "/login", changeFrequency: "monthly", priority: 0.4 },
  { path: "/support", changeFrequency: "monthly", priority: 0.4 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.4 },
  { path: "/status", changeFrequency: "weekly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/licenses", changeFrequency: "yearly", priority: 0.2 },
];

/**
 * Prefijos que exigen sesión, entitlement o un token de un solo uso. Rastrearlos
 * no aporta nada —el rastreador sólo vería un login— y las rutas con token en la
 * URL (`reset-password`, `verify-email`) no deben acabar indexadas jamás.
 */
export const PRIVATE_ROUTE_PREFIXES: readonly string[] = [
  "/dashboard",
  "/studio",
  "/legacy",
  "/logout",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/resend-verification",
  "/api",
];

/** Una ruta es privada si cae bajo cualquiera de los prefijos declarados. */
export function isPrivateRoute(path: string): boolean {
  return PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
