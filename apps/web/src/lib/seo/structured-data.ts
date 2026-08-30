import { BRAND } from "@/config/brand";
import { PRICING_PATH, absoluteUrl } from "@/config/site-routes";

/**
 * DATOS ESTRUCTURADOS (JSON-LD) — objetos puros, sin JSX.
 *
 * Se construyen aquí, separados del componente que los imprime, por una razón
 * práctica: un spec puede importarlos, serializarlos y validar el `@type` y la
 * forma sin montar React. Un JSON-LD roto no rompe la página —el navegador
 * ignora el script— así que el único sitio donde puede saltar el error es un
 * test que lo lea de verdad.
 *
 * REGLA QUE MANDA SOBRE TODO LO DEMÁS: aquí no se declara nada que el producto
 * no haga. El marcado que exagera capacidades es la forma más cara de mentir,
 * porque queda escrito, fechado y servido a un buscador.
 */

/** Forma mínima de un nodo JSON-LD: siempre lleva `@type`. */
export type JsonLdNode = Record<string, unknown> & { "@type": string };

/** La organización que publica. Sale del manifiesto de marca, no de un literal. */
function publisherNode(): JsonLdNode {
  return {
    "@type": "Organization",
    name: BRAND.brandName,
    url: absoluteUrl("/"),
  };
}

/**
 * La ficha del producto.
 *
 * `applicationCategory: DesignApplication` y `operatingSystem: navegador web`
 * son las dos afirmaciones centrales y ambas son ciertas: el editor corre en el
 * navegador, sin instalación.
 *
 * SOBRE EL PRECIO: la oferta se emite SIN `price` ni `priceCurrency` a
 * propósito. Esta rama no tiene ninguna fuente de precios aprobada —el
 * catálogo comercial vive en otro frente— y `AGENTS.md` prohíbe publicar un
 * precio sin el comportamiento que lo respalde. Un JSON-LD con un precio
 * inventado no es un adorno: es una afirmación comercial servida a un buscador,
 * y Google la muestra como si el producto la hubiera firmado. La oferta queda
 * como puntero a `/precios`, que es donde el precio real tendrá su fuente y su
 * propio marcado.
 */
export function softwareApplicationJsonLd({
  description,
  featureList,
}: {
  description: string;
  featureList: readonly string[];
}): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND.productNames.design,
    description,
    url: absoluteUrl("/"),
    applicationCategory: "DesignApplication",
    applicationSubCategory: "CAD",
    operatingSystem: "Navegador web (Chrome, Edge, Firefox, Safari)",
    inLanguage: "es-MX",
    featureList: [...featureList],
    publisher: publisherNode(),
    offers: {
      "@type": "Offer",
      url: absoluteUrl(PRICING_PATH),
      category: "SaaS",
    },
  };
}

/**
 * La ficha de producto vendible. Separada de `SoftwareApplication` porque
 * describen cosas distintas: una es el software, otra es lo que se contrata.
 * Misma regla con el precio y por el mismo motivo.
 */
export function productJsonLd({
  description,
}: {
  description: string;
}): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: BRAND.productNames.design,
    description,
    brand: { "@type": "Brand", name: BRAND.brandName },
    category: "Software CAD 2D en línea",
    // Sin `aggregateRating` ni `review`: no hay ni una sola reseña real en el
    // repositorio, y fabricar estrellas para una tarjeta de resultados es la
    // definición de dato inventado.
    offers: {
      "@type": "Offer",
      url: absoluteUrl(PRICING_PATH),
      availability: "https://schema.org/InStock",
    },
  };
}

/** Las preguntas frecuentes de la landing, tal como se muestran. */
export function faqPageJsonLd(
  entries: readonly (readonly [string, string])[],
): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "es-MX",
    mainEntity: entries.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

/**
 * Artículo técnico de una guía. Sin `datePublished`: el repositorio no guarda
 * fecha de publicación por guía y ponerle la del build daría un artículo que
 * "se publica de nuevo" en cada despliegue.
 */
export function techArticleJsonLd({
  path,
  title,
  description,
}: {
  path: string;
  title: string;
  description: string;
}): JsonLdNode {
  const url = absoluteUrl(path);
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description,
    url,
    inLanguage: "es-MX",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    publisher: publisherNode(),
    isPartOf: {
      "@type": "WebSite",
      name: BRAND.productNames.design,
      url: absoluteUrl("/"),
    },
  };
}

/** Migas de pan: ayudan al buscador a entender que las guías cuelgan de `/docs`. */
export function breadcrumbJsonLd(
  trail: readonly (readonly [string, string])[],
): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: absoluteUrl(path),
    })),
  };
}

/**
 * El directorio de plantillas como lista: le dice al buscador que /plantillas
 * es un catálogo navegable y no una página suelta. Cada elemento apunta a su
 * ficha; el buscador decide cuáles enseñar como sitelinks.
 */
export function itemListJsonLd(
  items: readonly (readonly [name: string, path: string])[],
): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map(([name, path], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      url: absoluteUrl(path),
    })),
  };
}

/**
 * La ficha de UNA plantilla. `CreativeWork` y no `Product`: una plantilla de
 * plano es una obra que se usa gratis dentro del producto, no un artículo con
 * oferta — marcarla Product invitaría a un rich result de compra que aquí
 * sería mentira. `isPartOf` la cuelga del software, que sí tiene su ficha.
 */
export function templateCreativeWorkJsonLd({
  name,
  description,
  path,
  imagePath,
}: {
  name: string;
  description: string;
  path: string;
  imagePath: string;
}): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name,
    description,
    url: absoluteUrl(path),
    image: absoluteUrl(imagePath),
    inLanguage: "es-MX",
    isAccessibleForFree: true,
    publisher: publisherNode(),
    isPartOf: {
      "@type": "SoftwareApplication",
      name: BRAND.productNames.design,
      url: absoluteUrl("/"),
    },
  };
}
