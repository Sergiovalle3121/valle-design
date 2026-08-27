/**
 * Lo que el arquitecto lee cuando un guardado no sale, dicho en español.
 *
 * ## El defecto que este módulo cierra
 *
 * Al provocar de verdad un corte de red mientras se guardaba, el aviso que
 * salía en pantalla era:
 *
 *     Sin conexión
 *     Failed to fetch
 *
 * El título estaba bien y el cuerpo era el `TypeError` del navegador, en
 * inglés, tal cual. El editor tomaba `saveError.message` y lo enseñaba: para
 * un fallo de red eso es la frase de la librería; para un 401, «Design API
 * respondió 401»; para un 500, lo que dijera el servidor. Tres formas de
 * enseñarle a una persona el registro de depuración del programa.
 *
 * ## Qué tiene que decir un aviso de guardado, y en qué orden
 *
 * Tres cosas, siempre las tres:
 *
 *   1. QUÉ PASÓ, sin jerga.
 *   2. QUÉ PASA CON SU TRABAJO. Es la pregunta que de verdad tiene en la
 *      cabeza, y la respuesta casi siempre es tranquilizadora: los cambios
 *      están en el equipo, en el diario local, y no se han perdido. Callarlo
 *      es dejar que suponga lo peor.
 *   3. QUÉ PUEDE HACER. Un aviso sin salida es una pared.
 *
 * ## Por qué un módulo puro y no un `switch` en el editor
 *
 * Porque el monolito sólo puede encoger, porque estas frases son lo que un
 * despacho va a leer en su peor momento y merecen una prueba propia, y porque
 * los dos sitios que informan de un guardado fallido —el canónico y el
 * heredado— tienen que decir exactamente lo mismo.
 *
 * No importa el SDK a propósito: identifica el error por su FORMA (`status`,
 * `code`), que es lo que viaja, y así se puede probar en Node sin levantar
 * media aplicación.
 */

export type CadSaveFailureKind =
  | "offline"
  | "session"
  | "read-only"
  | "permission"
  | "too-large"
  | "rate-limit"
  | "server";

export interface CadSaveFailureNotice {
  kind: CadSaveFailureKind;
  /** Encabezado: nombra lo que pasó, nunca el subsistema que lo detectó. */
  title: string;
  /** Qué pasó · qué pasa con su trabajo · qué puede hacer. */
  message: string;
}

interface ErrorLikeWithStatus {
  status?: unknown;
  code?: unknown;
  body?: { details?: { reason?: unknown } | null } | null;
}

/** El estado HTTP, si el error lo trae. Los fallos de red no traen ninguno. */
function statusOf(error: unknown): number | null {
  const candidate = error as ErrorLikeWithStatus | null;
  const status = candidate?.status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

function reasonOf(error: unknown): string | null {
  const reason = (error as ErrorLikeWithStatus | null)?.body?.details?.reason;
  return typeof reason === "string" ? reason : null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

/**
 * Las marcas de un fallo de RED en los navegadores que existen. Ninguna se
 * enseña: sólo sirven para clasificar.
 */
const RED = /failed to fetch|networkerror|network request failed|load failed|err_(internet|network|connection)|\bred\b/iu;

/**
 * El aviso, a partir del error y de si el navegador se cree conectado.
 *
 * `online` es INYECTABLE para que la prueba recorra los dos mundos sin tocar
 * globales; cuando el editor lo omite se lee `navigator`, que es la respuesta
 * correcta en el único sitio donde esto corre de verdad.
 */
export function describeCadSaveFailure(
  error: unknown,
  options: { online?: boolean } = {},
): CadSaveFailureNotice {
  const online =
    options.online ?? (typeof navigator === "undefined" || navigator.onLine);
  const status = statusOf(error);

  // SIN RED. Un error sin estado HTTP que además huele a red, o el navegador
  // diciendo directamente que no hay conexión. Va primero porque es el caso
  // frecuente y el único en el que no hace falta que el usuario haga nada.
  if (
    status === null &&
    (!online || error instanceof TypeError || RED.test(messageOf(error)))
  )
    return {
      kind: "offline",
      title: "Sin conexión",
      message:
        "Se cortó la conexión y el guardado no llegó al servidor. Tus cambios NO se han " +
        "perdido: quedan en este equipo y se subirán solos en cuanto vuelva la red. " +
        "Puedes seguir dibujando mientras tanto.",
    };

  if (status === 401)
    return {
      kind: "session",
      title: "Tu sesión expiró",
      message:
        "La sesión caducó, así que el servidor no aceptó el guardado. Tus cambios siguen " +
        "en este equipo: vuelve a iniciar sesión y pulsa Guardar otra vez. No cierres " +
        "esta pestaña antes de hacerlo.",
    };

  // 403 con la razón de la expiración es la REGLA DE ORO de la campaña dicha en
  // el momento exacto en que le toca al usuario: el trabajo nunca es rehén.
  if (status === 403 && reasonOf(error) === "read_only_after_lapse")
    return {
      kind: "read-only",
      title: "Tu periodo gratuito terminó",
      message:
        "Ya no se pueden guardar cambios, pero tus planos siguen siendo tuyos: puedes " +
        "abrirlos y exportarlos a DXF y a PDF cuando quieras. Para volver a editar, " +
        "renueva desde tu cuenta.",
    };

  if (status === 403)
    return {
      kind: "permission",
      title: "Sin permiso para editar",
      message:
        "Tu cuenta ya no puede editar este plano. Tus cambios siguen en este equipo y " +
        "puedes exportarlos a DXF antes de salir; el plano se sigue abriendo. Para volver " +
        "a editarlo, pídele acceso a quien administra el despacho.",
    };

  if (status === 413)
    return {
      kind: "too-large",
      title: "El plano pesa demasiado",
      message:
        "El servidor rechazó el envío por tamaño. Divide el dibujo en varias láminas o " +
        "quita las imágenes insertadas más pesadas, y vuelve a guardar. Mientras tanto " +
        "tus cambios siguen en este equipo.",
    };

  if (status === 429)
    return {
      kind: "rate-limit",
      title: "Demasiados guardados seguidos",
      message:
        "El servidor pidió una pausa. Espera unos segundos y vuelve a pulsar Guardar; " +
        "tus cambios siguen en este equipo y no se pierden.",
    };

  return {
    kind: "server",
    title: "No se pudo guardar",
    message:
      "El servidor no aceptó el guardado. Tus cambios siguen en este equipo: espera un " +
      "momento y vuelve a pulsar Guardar. Si sigue fallando, exporta a DXF para tener " +
      "una copia antes de cerrar.",
  };
}
