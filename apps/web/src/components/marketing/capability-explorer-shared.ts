/**
 * Compartido de verdad entre servidor y cliente — SIN "use client".
 *
 * `CapabilityExplorer.tsx` lleva "use client"; page.tsx (Server Component)
 * necesita esta misma lista de ids para resolver `galleryTemplate` en el
 * servidor y bajar el resultado ya plano como prop (ver la nota en
 * CapabilityExplorer.tsx). Exportar la constante DESDE el archivo cliente
 * parecía inofensivo — son sólo tres strings — pero Next.js envuelve el
 * módulo entero de un archivo "use client" en una referencia de cliente al
 * importarlo desde un Server Component: en producción, `page.tsx` recibía
 * un valor que no era el array real, y `TOOLSET_TEMPLATE_IDS.flatMap` tiraba
 * `TypeError: ... .flatMap is not a function`, tumbando la portada entera
 * (visto en CI: E2E Playwright 2/4, error real de navegador, no de tipos —
 * `tsc`/`next build` no lo detectan porque el tipo de una referencia de
 * cliente sigue pareciendo el array original en TypeScript).
 *
 * La regla que esto deja escrita: una constante que cruza la frontera
 * servidor/cliente vive en un módulo SIN "use client" que ambos lados
 * importan, nunca en el propio archivo cliente.
 */
export const TOOLSET_TEMPLATE_IDS = [
  "civil-site-utilities",
  "structural-grid-core",
  "mep-plantroom",
] as const;
