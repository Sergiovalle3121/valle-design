/**
 * EL AGENTE DE USUARIO, EN CASTELLANO.
 *
 * ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
 * `GET /v1/auth/sessions` devuelve la cadena cruda que envió el navegador:
 *
 *     Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
 *     (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
 *
 * Enseñarle eso a alguien que está intentando decidir «¿esta sesión soy yo o es
 * otro?» no le ayuda: no la va a leer. Y no enseñar nada es peor, porque
 * entonces la lista son cuatro fechas idénticas. «Chrome en Mac» responde la
 * pregunta en un vistazo, que es todo lo que esta función tiene que hacer.
 *
 * ── POR QUÉ ES DELIBERADAMENTE TOSCA ────────────────────────────────────────
 * Detectar navegadores por su agente de usuario es un pozo sin fondo: la cadena
 * es mentira por diseño —todo dice «Mozilla/5.0», Edge dice que es Chrome y
 * Chrome dice que es Safari— y hay bibliotecas de miles de reglas que se
 * quedan viejas igual. Aquí el orden de las comprobaciones ES el algoritmo:
 * se busca primero lo más específico (Edge antes que Chrome, Chrome antes que
 * Safari) y se para en la primera coincidencia.
 *
 * Cuando no reconoce nada devuelve «Navegador desconocido», no una cadena
 * recortada: media línea de agente de usuario es ruido que además parece un
 * error de la aplicación.
 *
 * ── LO QUE NUNCA HACE ───────────────────────────────────────────────────────
 * No devuelve versiones ni huellas. Una sesión no se identifica por su versión
 * de Chrome, y afinar más sólo daría al usuario la impresión de una precisión
 * que la cadena no tiene.
 */

const NAVEGADORES: ReadonlyArray<readonly [RegExp, string]> = [
  // El orden importa: Edge y Opera se hacen pasar por Chrome, y Chrome por
  // Safari. Lo específico va primero o nunca se alcanza.
  [/\bEdgA?\//iu, "Edge"],
  [/\bOPR\/|\bOpera\//iu, "Opera"],
  [/\bBrave\//iu, "Brave"],
  [/\bFirefox\/|\bFxiOS\//iu, "Firefox"],
  [/\bCriOS\//iu, "Chrome"],
  [/\bChrome\/|\bChromium\//iu, "Chrome"],
  [/\bSafari\//iu, "Safari"],
];

const SISTEMAS: ReadonlyArray<readonly [RegExp, string]> = [
  // iPad y iPhone antes que Mac: Safari de iPadOS se anuncia como Macintosh.
  [/\biPad\b/iu, "iPad"],
  [/\biPhone\b/iu, "iPhone"],
  [/\bAndroid\b/iu, "Android"],
  [/\bWindows\b/iu, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/iu, "Mac"],
  [/\bCrOS\b/iu, "ChromeOS"],
  [/\bLinux\b/iu, "Linux"],
];

function primeraCoincidencia(
  texto: string,
  tabla: ReadonlyArray<readonly [RegExp, string]>,
): string | null {
  for (const [patron, nombre] of tabla) {
    if (patron.test(texto)) return nombre;
  }
  return null;
}

/** «Chrome en Mac», «Safari en iPhone», «Navegador desconocido». */
export function describeUserAgent(
  userAgent: string | null | undefined,
): string {
  if (!userAgent || !userAgent.trim()) return "Dispositivo sin identificar";
  const navegador = primeraCoincidencia(userAgent, NAVEGADORES);
  const sistema = primeraCoincidencia(userAgent, SISTEMAS);
  if (navegador && sistema) return `${navegador} en ${sistema}`;
  if (navegador) return navegador;
  if (sistema) return sistema;
  return "Navegador desconocido";
}
