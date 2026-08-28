/**
 * EL MODO UNIVERSITARIO — el mecanismo, con el interruptor apagado.
 *
 * ── EL ENCARGO, Y LO QUE HONESTAMENTE CABE HOY ──────────────────────────────
 * «Sembrar el terreno para un modo universitario gratuito.» Sembrar, no
 * anunciar. Un plan educativo abierto de verdad necesita dos decisiones que no
 * son técnicas y que no le tocan a una campaña de código: QUÉ dominios
 * institucionales se aceptan, y con qué capacidad de soporte se atiende el pico
 * de altas del principio de un semestre. Mientras esas dos no estén tomadas,
 * lo correcto es tener el mecanismo escrito, probado y APAGADO — no una página
 * que promete y un backend que no cumple.
 *
 * ── POR QUÉ FALLA CERRADO, Y POR QUÉ ESO NO ES PEREZA ───────────────────────
 * Sin `EDUCATION_MODE=true` no hay modo educativo. Sin `EDUCATION_EMAIL_DOMAINS`
 * no hay ningún correo elegible, ni siquiera con el modo encendido. Las dos
 * condiciones son necesarias y ninguna tiene un valor por defecto «razonable»:
 * una lista por defecto sería adivinar qué universidad le importa al dueño, y
 * un modo encendido por defecto regalaría el producto entero a quien registrara
 * un dominio con la palabra «edu» dentro.
 *
 * ── EL SUBDOMINIO, QUE ES DONDE ESTO SE ROMPE DE VERDAD ─────────────────────
 * Las universidades reparten el correo del alumnado en subdominios
 * (`@alumnos.unam.mx`, `@estudiantes.uni.es`) mientras el profesorado usa el
 * dominio raíz. Una comparación exacta deja fuera a los alumnos, que son
 * justamente a quienes va dirigido. Se acepta el dominio configurado Y sus
 * subdominios — pero por SEGMENTOS de etiqueta, nunca por sufijo de cadena: un
 * `endsWith('uni.mx')` acepta `malicioso-uni.mx`, que es un dominio que
 * cualquiera compra por doce dólares.
 */

/** Igual que identidad: sin espacios alrededor y en minúsculas. */
function normalizar(valor: string): string {
  return valor.trim().toLowerCase();
}

/**
 * Forma mínima de un dominio: al menos dos etiquetas separadas por punto, sin
 * espacios ni arrobas. No valida que exista; descarta la basura de una lista
 * mal escrita, que es lo que hace que una lista se pueda leer con confianza.
 */
const FORMA_DE_DOMINIO =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/u;

/** ¿Está encendido el modo? Cualquier valor que no sea `true` es «no». */
export function isEducationModeEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.EDUCATION_MODE === 'true';
}

/**
 * Dominios institucionales aceptados. Vacío mientras nadie los configure — y
 * vacío también si el modo está apagado, para que ninguna ruta pueda usar la
 * lista sin pasar por el interruptor.
 */
export function institutionalDomains(
  environment: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> {
  if (!isEducationModeEnabled(environment)) return new Set();
  const raw = environment.EDUCATION_EMAIL_DOMAINS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map(normalizar)
      .filter((dominio) => FORMA_DE_DOMINIO.test(dominio)),
  );
}

/** El dominio de un correo, o `null` si la cadena no tiene forma de correo. */
export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const partes = normalizar(email).split('@');
  if (partes.length !== 2) return null;
  const [local, dominio] = partes;
  if (!local || !FORMA_DE_DOMINIO.test(dominio)) return null;
  return dominio;
}

/**
 * ¿Pertenece este dominio al institucional, o a uno de sus subdominios?
 *
 * Por etiquetas y no por sufijo: `alumnos.uni.mx` sí, `uni.mx` sí,
 * `malicioso-uni.mx` NO. Ésa es toda la diferencia entre una regla y un
 * agujero.
 */
function perteneceA(dominio: string, institucional: string): boolean {
  return dominio === institucional || dominio.endsWith(`.${institucional}`);
}

/**
 * ¿Este correo da derecho al plan educativo?
 *
 * Con el modo apagado, o sin dominios configurados, la respuesta es NO para
 * todo el mundo. No hay atajo de administrador ni excepción por rol: encender
 * esto exige tocar el despliegue, que es el listón correcto para regalar el
 * producto completo.
 */
export function isInstitutionalEmail(
  email: string | null | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const dominios = institutionalDomains(environment);
  if (dominios.size === 0) return false;
  const dominio = emailDomain(email);
  if (!dominio) return false;
  for (const institucional of dominios) {
    if (perteneceA(dominio, institucional)) return true;
  }
  return false;
}

/**
 * Código del plan educativo.
 *
 * Se declara aquí, junto al interruptor, y NO se siembra en el catálogo: el
 * bootstrap sólo publica lo que se vende hoy, y publicar un plan gratuito
 * mientras el modo está apagado pondría en la página de precios una oferta que
 * ninguna alta puede conceder. El día que el dueño encienda el modo, una
 * migración revisada da de alta la fila con este código — igual que se dieron
 * de alta Individual y Despacho.
 */
export const EDUCATION_PLAN_CODE = 'educacion';

/** Lo que verá una página pública el día que esto se encienda. */
export const EDUCATION_PLAN_PRESENTATION = {
  kind: 'trial',
  public: true,
  name: 'Educativo',
  perSeat: false,
  seatsMinimum: 1,
  taxIncluded: true,
  pricePublished: false,
} as const;

/** Retrato del modo, para que una ruta de diagnóstico pueda contarlo sin mentir. */
export interface EducationModeStatus {
  enabled: boolean;
  domainCount: number;
  /** Qué falta para que un alta educativa pueda concederse hoy. */
  missing: readonly string[];
}

export function educationModeStatus(
  environment: NodeJS.ProcessEnv = process.env,
): EducationModeStatus {
  const enabled = isEducationModeEnabled(environment);
  const dominios = institutionalDomains(environment);
  const missing: string[] = [];
  if (!enabled) missing.push('EDUCATION_MODE');
  if (dominios.size === 0) missing.push('EDUCATION_EMAIL_DOMAINS');
  return { enabled, domainCount: dominios.size, missing };
}
