/**
 * MODO DE LANZAMIENTO — la superficie que ve un visitante el día que el
 * producto sale a internet.
 *
 * Valle Design sale con una oferta simple: tres meses gratis, sin tarjeta. No
 * es un descuento ni una campaña de marketing pegada por encima: es el modo en
 * que el producto opera durante el lanzamiento, y la superficie tiene que
 * decirlo con una sola voz. Sin este módulo, "sin tarjeta" acaba escrito en
 * cuatro plantillas y desmentido en la quinta.
 *
 * ─── Lo que este módulo NO hace ────────────────────────────────────────────
 *
 * NO borra ni desactiva el cobro. El adaptador de Stripe, el checkout, las
 * intenciones de mejora, el CFDI y el portal de facturación siguen exactamente
 * donde estaban y siguen probados: apagar código que funciona para poder
 * volver a escribirlo en tres meses es la forma más cara de posponer una
 * decisión. Lo único que hace este flag es decidir qué se ENSEÑA.
 *
 * NO inventa cifras. La duración de la prueba la publica el backend
 * (`trialDays` del catálogo público, que sale de `TRIAL_DAYS`) y el precio
 * futuro sale del catálogo comercial real. Aquí sólo se decide qué mostrar,
 * jamás cuánto vale ni cuántos días dura.
 *
 * ─── El valor por defecto ──────────────────────────────────────────────────
 *
 * `free`, a propósito. El despliegue que sale ahora es el gratuito, y un
 * defecto que hay que acordarse de activar es un defecto que un día no se
 * activa. Un operador que sí quiera cobrar pone
 * `NEXT_PUBLIC_LAUNCH_MODE=commercial` — y como es una variable
 * `NEXT_PUBLIC_*`, se incrusta AL COMPILAR: cambiarla exige reconstruir la
 * web, no reiniciar el proceso. Está anotado en `DESPLIEGUE-RAILWAY.md`.
 */
export type LaunchMode = "free" | "commercial";

export const LAUNCH_MODE: LaunchMode =
  process.env.NEXT_PUBLIC_LAUNCH_MODE === "commercial" ? "commercial" : "free";

/** ¿La superficie puede ofrecer un cobro en línea ahora mismo? */
export function checkoutIsVisible(mode: LaunchMode = LAUNCH_MODE): boolean {
  return mode === "commercial";
}

/**
 * Días → la frase con la que una persona reconoce la oferta.
 *
 * 90 días son «3 meses» para cualquiera que lea un anuncio, y «90 días» para
 * nadie. Pero la traducción sólo se permite cuando es EXACTA: 90 = 3×30, 60 =
 * 2×30, 30 = 1×30. Con 45 días la función dice «45 días» en vez de redondear a
 * «mes y medio», porque el número que el usuario va a poder comprobar contra
 * su fecha de vencimiento es el de días.
 *
 * Pura y sin estado: es la única traducción de la cifra en toda la superficie.
 */
export function freePeriodLabel(days: number): string {
  if (!Number.isInteger(days) || days <= 0) return "";
  if (days % 30 === 0) {
    const months = days / 30;
    return months === 1 ? "1 mes" : `${months} meses`;
  }
  return days === 1 ? "1 día" : `${days} días`;
}

/**
 * El titular de la oferta, construido con el número REAL del backend.
 *
 * `freeOfferHeadline(90)` → «3 meses gratis». Si mañana el operador arranca
 * con `TRIAL_DAYS=30`, la portada dice «1 mes gratis» sin que nadie edite un
 * `.tsx`. Ésa es toda la gracia.
 */
export function freeOfferHeadline(days: number): string {
  const label = freePeriodLabel(days);
  return label ? `${label} gratis` : "";
}

/**
 * LA PROMESA COMPLETA, y la parte que casi todo el mundo omite.
 *
 * «Gratis» sin decir qué pasa después es la razón por la que la gente
 * desconfía de las pruebas gratuitas: teme que el día 91 le cobren o le
 * secuestren el trabajo. Las dos mitades de esta frase responden a eso, y las
 * dos son verdad verificada por una prueba:
 *
 * - «sin tarjeta» → el alta no pide ni menciona un medio de pago
 *   (`e2e/public/free-launch-funnel.spec.ts`).
 * - «tus planos siguen siendo tuyos» → al vencer, la sesión conserva
 *   `cad:view`: abre, ve y exporta. Es la regla de oro del guard, probada en
 *   `apps/api/src/modules/auth/guards/entitlement-read-only.pg.spec.ts`.
 */
export const FREE_LAUNCH_PROMISE =
  "Sin tarjeta. Al terminar no se te cobra nada y tus planos siguen siendo tuyos: podrás abrirlos y exportarlos siempre.";

/** Días antes del vencimiento en que el aviso empieza a aparecer. */
export const EXPIRY_NOTICE_DAYS = 14;

/**
 * La versión que viaja en un reporte de «algo salió mal».
 *
 * Sin ella, «no me funciona» no se puede reproducir: hay que saber contra qué
 * despliegue pasó. Se inyecta en el build (`NEXT_PUBLIC_*` se hornea, no se lee
 * en caliente) y en desarrollo dice «desarrollo», que es la verdad.
 */
export const APP_VERSION: string =
  process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "desarrollo";
