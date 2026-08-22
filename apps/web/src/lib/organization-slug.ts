/**
 * EL IDENTIFICADOR SE DERIVA DEL NOMBRE. Nadie debería teclearlo.
 *
 * Lo que había: un campo obligatorio llamado «Identificador» con
 * `pattern="[a-z0-9]+(?:-[a-z0-9]+)*"` y un `placeholder` de ejemplo. Es decir:
 * a un arquitecto que acaba de crear su cuenta se le pedía teclear un slug
 * conforme a una expresión regular, y si escribía «Estudio Valle» —lo mismo que
 * acababa de poner arriba— el formulario lo rechazaba sin explicar por qué.
 *
 * Un identificador es un detalle de implementación del multi-inquilino. Se
 * deriva, se enseña, y sólo se edita si alguien lo pide.
 *
 * LA DERIVACIÓN, paso a paso y con su porqué:
 *
 *   · `NFD` + quitar los diacríticos: «Diseño Zúñiga» → «diseno-zuniga». Sin
 *     esto, la ñ y las tildes caerían al filtro de caracteres y el despacho
 *     «Peña» acabaría con el identificador «pe-a».
 *   · La `ñ` se translitera ANTES de descomponer, porque `NFD` la parte en
 *     `n` + tilde y el resultado sería el mismo `n`; se hace explícito para que
 *     quien lea el código no crea que es un accidente.
 *   · Todo lo que no sea `[a-z0-9]` se vuelve un guion, y los guiones se
 *     colapsan y se recortan en los extremos.
 *   · 80 caracteres es el máximo que acepta la API.
 */

/** Longitudes que exige la API de organizaciones. */
export const ORGANIZATION_SLUG_LIMITS = { min: 2, max: 80 } as const;

/** El patrón que la API valida. Se comparte para no escribirlo dos veces. */
export const ORGANIZATION_SLUG_PATTERN = "[a-z0-9]+(?:-[a-z0-9]+)*";

export function organizationSlugFromName(name: string): string {
  return name
    .normalize("NFC")
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N")
    .normalize("NFD")
    // Bloque «Combining Diacritical Marks»: lo que `NFD` separó de cada letra.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ORGANIZATION_SLUG_LIMITS.max)
    // El recorte puede dejar un guion colgando en el corte.
    .replace(/-+$/, "");
}

/** `true` si el identificador cumple lo que la API va a exigir. */
export function isValidOrganizationSlug(slug: string): boolean {
  return (
    slug.length >= ORGANIZATION_SLUG_LIMITS.min &&
    slug.length <= ORGANIZATION_SLUG_LIMITS.max &&
    new RegExp(`^${ORGANIZATION_SLUG_PATTERN}$`).test(slug)
  );
}

/**
 * NOMBRE POR DEFECTO DE LA ORGANIZACIÓN PERSONAL.
 *
 * «Trabajo por mi cuenta» no puede abrir OTRO formulario: sería el mismo paso
 * con otra ropa. Se deriva del correo, que es el único dato que el usuario ya
 * ha dado, y queda editable después desde los ajustes de la organización.
 *
 * Se usa la parte local del correo con los separadores convertidos en espacios
 * y capitalizada: `sergio.valle@…` → «Sergio Valle». Si no hay correo —no
 * debería pasar, pero un `undefined` no puede tumbar el alta— cae a un nombre
 * genérico en vez de a una cadena vacía que la API rechazaría.
 */
export function personalOrganizationName(email: string | undefined): string {
  const local = (email ?? "").split("@")[0]?.trim() ?? "";
  if (!local) return "Mi despacho";
  const words = local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  const name = words.join(" ").slice(0, 160).trim();
  return name.length >= 2 ? name : "Mi despacho";
}
