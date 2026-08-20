/**
 * Custodia del token del REVIEW LINK en el navegador del invitado.
 *
 * ## Por qué el token va detrás de la almohadilla
 *
 * El enlace es `/revision#cadReview=…`. Un fragmento **no se envía al
 * servidor**: no entra en el log de acceso del web, no viaja en la cabecera
 * `Referer` si el cliente pincha un enlace externo desde esa página, y no se
 * queda en el historial de ningún proxy intermedio. Puesto en la RUTA o en la
 * query string, un enlace que da acceso a un plano quedaría escrito en tres
 * sitios que nadie audita.
 *
 * ## Y por qué además se borra de la barra
 *
 * El fragmento sigue estando en la pantalla del cliente y en su historial. Se
 * lee UNA vez, se saca de la URL con `replaceState` y se guarda en
 * `sessionStorage`, que muere al cerrar la pestaña. Así recargar la página no
 * pierde la revisión (que es lo que pasaría sin guardarlo) sin dejar la
 * credencial a la vista de quien mire por encima del hombro.
 *
 * `localStorage` sería lo contrario: el token sobreviviría en el equipo del
 * cliente indefinidamente, incluso después de que el arquitecto revocara la
 * revisión, y quien usara ese ordenador después lo encontraría.
 *
 * ## Por qué el entorno se inyecta
 *
 * Para poder PROBAR lo anterior. La propiedad que importa —«tras leerlo, el
 * token ya no está en la URL»— sólo se comprueba de verdad si se puede
 * observar la URL resultante, y en Node no hay `window`.
 */
export const REVIEW_TOKEN_SESSION_KEY = "cad.reviewToken";
/** Mismo nombre de parámetro que el canje del estudio: un enlace, dos puertas. */
export const REVIEW_TOKEN_PARAM = "cadReview";

export interface ReviewTokenEnvironment {
  href: string;
  /** `history.replaceState`: cambia la barra sin navegar ni recargar. */
  replaceUrl(next: string): void;
  readSession(key: string): string | null;
  writeSession(key: string, value: string): void;
  removeSession(key: string): void;
}

interface ParsedHref {
  /** El parámetro venía en la URL (aunque fuese vacío). */
  present: boolean;
  token: string;
  /** La misma URL sin el token, lista para `replaceState`. */
  clean: string;
}

/**
 * LEE el token sin tocar nada.
 *
 * La separación entre leer y limpiar no es estética. React renderiza el visor
 * de revisión con el token ya decidido —de él depende la primera pantalla— y
 * hacer `history.replaceState` en ese momento actualiza el Router de Next
 * DURANTE el render de otro componente: React lo avisa por consola y, en modo
 * concurrente, puede repetirse. Leer es puro; limpiar es un efecto, y cada
 * cosa se llama desde donde le toca.
 *
 * Acepta el `?cadReview=` heredado con un único fin: que `sweepReviewToken`
 * pueda BORRARLO de la barra. Los enlaces con el token en la query string
 * existieron y siguen circulando por correo; leerlo aquí no los bendice —el
 * canje contra el servidor decide si valen— pero al menos deja de estar a la
 * vista.
 */
export function peekReviewToken(env: ReviewTokenEnvironment): string | null {
  const parsed = parseHref(env.href);
  if (parsed?.token) return parsed.token;
  try {
    return env.readSession(REVIEW_TOKEN_SESSION_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * GUARDA el token en la sesión y lo SACA de la barra de direcciones. Idempotente:
 * la segunda llamada no encuentra nada que limpiar.
 */
export function sweepReviewToken(env: ReviewTokenEnvironment): void {
  const parsed = parseHref(env.href);
  if (!parsed?.present) return;
  env.replaceUrl(parsed.clean);
  if (!parsed.token) return;
  try {
    env.writeSession(REVIEW_TOKEN_SESSION_KEY, parsed.token);
  } catch {
    // Almacenamiento bloqueado (modo privado estricto): el token vive sólo
    // en esta navegación. Recargar pedirá el enlace otra vez, que es
    // molesto y correcto; guardarlo en otro sitio sería peor.
  }
}

/** Leer y limpiar de una vez, para quien no renderiza nada con el resultado. */
export function takeReviewToken(env: ReviewTokenEnvironment): string | null {
  const token = peekReviewToken(env);
  sweepReviewToken(env);
  return token;
}

function parseHref(href: string): ParsedHref | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const fromHash = hash.get(REVIEW_TOKEN_PARAM);
  const fromQuery = url.searchParams.get(REVIEW_TOKEN_PARAM);
  url.searchParams.delete(REVIEW_TOKEN_PARAM);
  hash.delete(REVIEW_TOKEN_PARAM);
  const rest = hash.toString();
  return {
    present: fromHash !== null || fromQuery !== null,
    token: (fromHash || fromQuery || "").trim(),
    clean: `${url.pathname}${url.search}${rest ? `#${rest}` : ""}`,
  };
}

/** Olvida el token: enlace caducado, revocado o desconocido. */
export function forgetReviewToken(env: ReviewTokenEnvironment): void {
  try {
    env.removeSession(REVIEW_TOKEN_SESSION_KEY);
  } catch {
    /* nada que olvidar si el almacenamiento no responde */
  }
}

/** El entorno real del navegador. */
export function browserReviewTokenEnvironment(): ReviewTokenEnvironment | null {
  if (typeof window === "undefined") return null;
  return {
    href: window.location.href,
    replaceUrl: (next) => window.history.replaceState(null, "", next),
    readSession: (key) => window.sessionStorage.getItem(key),
    writeSession: (key, value) => window.sessionStorage.setItem(key, value),
    removeSession: (key) => window.sessionStorage.removeItem(key),
  };
}
