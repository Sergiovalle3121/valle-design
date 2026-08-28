/**
 * LA GEOMETRÍA DEL ISOTIPO DE VALLE DESIGN — una sola fuente.
 *
 * EL DIBUJO. Tres elementos, ninguno decorativo:
 *
 *   1. Una LÍNEA DE COTA horizontal con sus dos marcas a 45°. No son adornos:
 *      así se remata una cota en dibujo arquitectónico —en México y en casi toda
 *      Europa se usa la marca oblicua, no la flecha—, de modo que un arquitecto
 *      reconoce el gesto antes de leer el nombre. Esa misma horizontal es el
 *      riel superior de un cajetín.
 *   2. Una V de dos trazos que es a la vez la inicial de Valle, el perfil de un
 *      valle y el ángulo de una escuadra.
 *   3. Un NODO cuadrado macizo en el vértice: el marcador de punto final que
 *      todo CAD pinta cuando la referencia a objetos engancha. Es el punto de
 *      precisión, y es lo que ancla la marca al oficio en vez de a la moda.
 *
 * POR QUÉ ESTÁ EN CÓDIGO Y NO EN UN ARCHIVO. Los `.svg` de `public/brand/` se
 * GENERAN desde aquí (`scripts/brand/build-brand-assets.mjs`), igual que el
 * kernel wasm y la consola de API se generan desde su fuente. Un logotipo que
 * vive en seis archivos sueltos diverge a la tercera exportación: alguien
 * ajusta el trazo del claro y se olvida del oscuro. Aquí no puede pasar — hay
 * un gate `--check` que falla si un archivo no coincide con esta geometría.
 *
 * REJILLA. 32×32, con el dibujo dentro de 3,8…28,2 en X y 4…27 en Y. El margen
 * no es estético: es lo que impide que el trazo toque el borde cuando la marca
 * se pinta a 16 px en una pestaña.
 */

export const LOGO_VIEWBOX = "0 0 32 32";

/** Línea de cota superior. */
export const DIMENSION_LINE = "M6 7.5 H26";

/** Marcas oblicuas de la cota, a 45° exactos. */
export const DIMENSION_TICKS = ["M4.8 10 L9.2 5.4", "M22.8 10 L27.2 5.4"] as const;

/** La V: dos trazos rectos que convergen en el nodo. */
export const VALLEY = "M9.5 12.5 L16 23.5 L22.5 12.5";

/** Nodo de precisión: cuadrado macizo centrado en el vértice de la V. */
export const NODE = { x: 12.75, y: 20.25, size: 6.5 } as const;

/** Grosores. El de la V es mayor: es la letra, y la letra manda. */
export const STROKE = { dimension: 2, valley: 3.4 } as const;

/**
 * TINTAS DE MARCA — la única excepción autorizada a "ningún hex fuera de
 * globals.css", y está documentada en `docs/design/BRAND.md`.
 *
 * Un `.svg` servido como imagen no ve las variables CSS de la página: `<img
 * src="logo.svg">` se pinta en su propio documento aislado. Por eso los
 * archivos estáticos llevan el color resuelto, y por eso hay uno por tema. El
 * componente `<Logo/>`, que sí vive dentro de la página, usa `currentColor` y
 * no repite un solo valor.
 *
 * Los valores son los tokens del sistema ya convertidos:
 *   inkLight = hsl(222 40% 15%)  (--foreground claro)
 *   inkDark  = hsl(210 20% 96%)  (--foreground oscuro)
 *   accent   = --brand-primary-strong
 */
export const BRAND_INK = {
  // Los tokens v2 ya convertidos, no una paleta paralela: `--foreground` en
  // claro y en oscuro, y `--valle-accent`. Se quedaron en los valores v1 —azul
  // frío e índigo— una campaña entera después de que el producto se moviera a
  // grafito cálido y violeta, así que el favicon, la tarjeta social y los siete
  // SVG seguían vistiendo la identidad anterior. Son las superficies de marca
  // MÁS vistas: la pestaña del navegador y la miniatura que sale al compartir
  // el enlace. Si estos tres valores cambian, hay que regenerar los archivos
  // (`node scripts/brand/build-brand-assets.mjs`) o el gate `--check` lo dice.
  light: "#251f18",
  dark: "#f7f5f3",
  accent: "#6b4def",
} as const;

export const WORDMARK = "Valle Design";
