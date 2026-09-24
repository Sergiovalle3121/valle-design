/**
 * Segunda redacción, en lenguaje llano, de los avisos del motor.
 *
 * El motor emite UN prompt por paso —«Precise la primera esquina» con sus
 * opciones— y `formatCadPrompt` lo compone con corchetes para quien ya sabe
 * leerlos. El modo Esencial necesita el MISMO paso dicho de otra manera: «Haz
 * clic en la primera esquina del rectángulo», sin corchetes ni jerga, para
 * quien abre el producto por primera vez.
 *
 * ## Por qué vive fuera del motor
 *
 * `CadPrompt` no tiene identificador de paso: el `message` ES el paso. Meter
 * una segunda prosa en 279 módulos de comandos habría sido el diff más grande
 * y el más fácil de dejar a medias. Aquí la tabla es una sola, keyed por
 * comando y por el `message` del motor (exacto, o por expresión regular para
 * los mensajes dinámicos), y `prompt-plain.spec.ts` la cierra contra el
 * registro real: cada comando de la barra Esencial arranca con redacción llana
 * o el CI lo dice con su nombre.
 *
 * ## Lo que NO cambia
 *
 * En "pro" `formatCadPromptFor` devuelve `formatCadPrompt` byte a byte. Las
 * opciones no se pierden en Esencial: se esconden del TEXTO, pero los botones
 * de palabra clave, el menú del cursor y lo tecleado siguen resolviéndose
 * contra `prompt.options` como siempre.
 */
import type { CadPrompt } from "./command-types";
import { CAD_COMMAND_LABELS } from "./command-labels";
import { formatCadPrompt } from "./prompt";

/** Las dos redacciones del mismo paso. */
export type CadPromptWording = "pro" | "esencial";

export interface CadPlainPromptEntry {
  /**
   * El `message` del motor. Una cadena se compara exacta; una expresión
   * regular sirve para los mensajes dinámicos (el tipo de puerta al final, el
   * ordinal del punto). Las regulares van ancladas al inicio a propósito: un
   * mensaje con AVISO delante («Eso no es un muro… Designe el muro…») se
   * separa antes de buscar el paso cuando es una puerta o ventana.
   */
  readonly match: string | RegExp;
  /** La misma petición en lenguaje llano, sin corchetes ni «Precise». */
  readonly plain: string;
}

/**
 * Nombre canónico → redacciones llanas de sus pasos. Mismo orden que la barra
 * Esencial. Para los cuatro comandos prioritarios y Ventana, un paso nuevo
 * sin entrada muestra una instrucción genérica segura, nunca prosa técnica.
 * Los demás comandos mantienen el contrato anterior hasta su propia tanda.
 */
export const CAD_PLAIN_PROMPTS: Readonly<Record<string, readonly CadPlainPromptEntry[]>> = {
  LINE: [
    { match: "Precise el primer punto", plain: "Haz clic donde empieza la línea" },
    { match: "Precise el punto siguiente", plain: "Haz clic en el siguiente punto · Enter termina" },
  ],
  PLINE: [
    { match: "Precise el punto inicial", plain: "Haz clic donde empieza la polilínea" },
    { match: "Precise el punto siguiente", plain: "Haz clic en el siguiente punto · Enter termina" },
    { match: "Precise el extremo del arco", plain: "Haz clic donde termina el arco · Enter termina" },
  ],
  RECTANG: [
    { match: "Precise la primera esquina", plain: "Haz clic en la primera esquina del rectángulo" },
    { match: "Precise la esquina opuesta", plain: "Haz clic en la esquina contraria" },
    { match: "Precise la esquina opuesta para elegir el cuadrante", plain: "Haz clic en la esquina que indica hacia dónde va el rectángulo" },
    { match: "Precise la primera distancia de chaflán", plain: "Escribe la primera distancia para cortar la esquina" },
    { match: "Precise la segunda distancia de chaflán", plain: "Escribe la segunda distancia para cortar la esquina" },
    { match: "Precise el radio de empalme", plain: "Escribe cuánto quieres redondear las esquinas" },
    { match: "Precise la elevación", plain: "Escribe a qué altura va el rectángulo" },
    { match: "Precise el grosor", plain: "Escribe el grosor del rectángulo" },
    { match: "Precise el ancho de línea", plain: "Escribe el ancho de la línea" },
    { match: "Precise el ángulo de rotación", plain: "Escribe el ángulo de giro" },
    { match: "Precise el área del rectángulo", plain: "Escribe el área del rectángulo" },
    { match: "Calcule las dimensiones a partir de", plain: "Elige si conoces el largo o el ancho" },
    { match: "Precise la longitud del rectángulo", plain: "Escribe el largo del rectángulo" },
    { match: "Precise la anchura del rectángulo", plain: "Escribe el ancho del rectángulo" },
  ],
  CIRCLE: [
    { match: "Precise el centro", plain: "Haz clic en el centro del círculo" },
    { match: "Precise el radio", plain: "Escribe el radio o haz clic para fijarlo" },
    { match: "Precise el diámetro", plain: "Escribe el diámetro o haz clic para fijarlo" },
    {
      match: /^Precise el (primer|segundo|tercer) punto de la circunferencia$/,
      plain: "Haz clic en un punto por donde pasa el círculo (tres en total)",
    },
    {
      match: /^Precise el (primer|segundo) extremo del diámetro$/,
      plain: "Haz clic en un extremo del diámetro",
    },
  ],
  WALL: [
    { match: "Precise el punto inicial del muro", plain: "Haz clic donde empieza el muro" },
    { match: "Precise el punto siguiente", plain: "Haz clic donde sigue el muro · Enter termina" },
    { match: "Precise el grosor del muro", plain: "Escribe el grosor del muro" },
    { match: "Precise la altura del muro", plain: "Escribe la altura del muro" },
  ],
  DOOR: [
    {
      match: /^Designe el muro donde alojar la puerta\b/,
      plain: "Haz clic sobre el muro donde va la puerta; si no hay un muro, dibuja uno primero",
    },
    { match: "Precise el tipo de la puerta", plain: "Elige el tipo de puerta" },
    { match: "Precise la anchura del hueco", plain: "Escribe el ancho de la puerta" },
    { match: "Precise la altura del hueco", plain: "Escribe el alto de la puerta" },
    { match: "Precise el antepecho del hueco", plain: "Escribe la altura de la base de la puerta sobre el piso" },
  ],
  WINDOW: [
    {
      match: /^Designe el muro donde alojar la ventana\b/,
      plain: "Haz clic sobre el muro donde va la ventana; si no hay un muro, dibuja uno primero",
    },
    { match: "Precise el tipo de la ventana", plain: "Elige el tipo de ventana" },
    { match: "Precise la anchura del hueco", plain: "Escribe el ancho de la ventana" },
    { match: "Precise la altura del hueco", plain: "Escribe el alto de la ventana" },
    { match: "Precise el antepecho del hueco", plain: "Escribe la altura de la base de la ventana sobre el piso" },
  ],
  TEXT: [
    { match: "Precise el punto inicial del texto", plain: "Haz clic donde va el texto" },
    { match: "Escriba el texto", plain: "Escribe el texto y pulsa Enter" },
    { match: "Precise la altura del texto", plain: "Escribe la altura del texto" },
  ],
  DIMLINEAR: [
    {
      match: "Precise el origen de la primera línea de referencia",
      plain: "Haz clic en el primer extremo a medir",
    },
    {
      match: "Precise el origen de la segunda línea de referencia",
      plain: "Haz clic en el segundo extremo a medir",
    },
    { match: "Precise la ubicación de la línea de cota", plain: "Haz clic donde quieres la cota" },
  ],
  ERASE: [{ match: "Designe objetos", plain: "Haz clic en lo que quieres borrar y pulsa Enter" }],
};

function matches(entry: CadPlainPromptEntry, message: string): boolean {
  return typeof entry.match === "string" ? entry.match === message : entry.match.test(message);
}

const GUARDED_COMMANDS = new Set(["LINE", "WALL", "RECTANG", "DOOR", "WINDOW"]);
const PLAIN_KEYWORD_LABELS: Readonly<Record<string, string>> = {
  Chaflán: "Cortar esquina",
  Empalme: "Redondear esquina",
};

/** El nombre canónico sigue siendo la identidad interna; Esencial anuncia el nombre de la herramienta. */
export function cadPlainCommandName(command: string): string {
  const name = command.trim().toUpperCase();
  return name === "RECTANG" ? "Rectángulo" : CAD_COMMAND_LABELS[name] ?? "Herramienta";
}

/** Los atajos mixtos (alTura, TIpo, desHacer) siguen funcionando sin dictar la ortografía visible. */
export function cadPlainKeywordLabel(keyword: { keyword: string; label?: string }): string {
  const label = keyword.label ?? keyword.keyword;
  if (PLAIN_KEYWORD_LABELS[label]) return PLAIN_KEYWORD_LABELS[label];
  return /[a-záéíóúñ][A-Z]|^[A-Z]{2}[a-záéíóúñ]/.test(label)
    ? label.charAt(0).toLocaleUpperCase("es-MX") + label.slice(1).toLocaleLowerCase("es-MX")
    : label;
}

/** Las causas de rechazo se dicen en llano; nunca se copia un diagnóstico nuevo a Esencial. */
function plainOpeningNotice(raw: string, name: "DOOR" | "WINDOW"): string {
  const noun = name === "DOOR" ? "La puerta" : "La ventana";
  if (/receta degenerada/i.test(raw)) return "Ese muro no permite colocar el hueco.";
  if (/^Eso no es un muro/i.test(raw)) return "Eso no es un muro.";
  if (/^Barrido: (derecha|izquierda)\.$/i.test(raw))
    return raw.replace(/^Barrido: (derecha|izquierda)\.$/i, "La puerta abrirá hacia la $1.");
  if (/^Bisagra: (final|inicio) del eje\.$/i.test(raw)) return "La bisagra cambió de lado.";
  if (/^El hueco empieza en/i.test(raw)) return `${noun} queda demasiado cerca del inicio del muro. Haz clic más hacia el centro.`;
  if (/^El hueco acaba en/i.test(raw)) return `${noun} queda demasiado cerca del final del muro. Haz clic más hacia el centro.`;
  if (/^Un hueco necesita una anchura positiva/i.test(raw))
    return `El ancho de ${name === "DOOR" ? "la puerta" : "la ventana"} debe ser mayor que cero.`;
  if (/^(No hay tipo de |No se dijo qué tipo de |Tipo |Una medida de )/.test(raw)) return raw;
  return `${noun} no se pudo colocar.`;
}

/** El aviso antecede al paso DOOR/WINDOW; se separa para no repetir «Designe». */
function openingNotice(message: string, name: "DOOR" | "WINDOW"): { notice: string; step: string } {
  const offset = message.search(/(?:Designe el muro donde alojar|Precise el tipo de)/);
  if (offset <= 0) return { notice: "", step: message };
  const raw = message.slice(0, offset).trim();
  return { notice: plainOpeningNotice(raw, name), step: message.slice(offset) };
}

/**
 * La redacción llana del paso, o `null` si no la hay. El nombre se normaliza
 * como en el registro (mayúsculas, sin espacios) para que dé igual quién lo
 * pase; `null` de comando significa «sin comando activo».
 */
export function cadPlainPromptMessage(command: string | null, prompt: CadPrompt): string | null {
  if (!command) return null;
  const name = command.trim().toUpperCase();
  const entries = CAD_PLAIN_PROMPTS[name];
  if (!entries) return null;
  const { notice, step } = name === "DOOR" || name === "WINDOW"
    ? openingNotice(prompt.message, name)
    : { notice: "", step: prompt.message };
  const plain = entries.find((entry) => matches(entry, step))?.plain;
  return plain ? `${notice ? `${notice} ` : ""}${plain}` : null;
}

/**
 * El renglón del prompt en la redacción pedida.
 *
 * - "pro": `formatCadPrompt` tal cual, byte a byte; nada de lo que afirman
 *   los goldens de Pro pasa por aquí.
 * - "esencial": el llano (o un resguardo para los comandos protegidos) más el valor
 *   por defecto entre ángulos y los dos puntos. Sin corchetes: las opciones
 *   siguen en `prompt.options` para los botones, el menú y el teclado.
 */
export function formatCadPromptFor(
  prompt: CadPrompt,
  wording: CadPromptWording,
  command: string | null,
): string {
  if (wording === "pro") return formatCadPrompt(prompt);
  const name = command?.trim().toUpperCase() ?? "";
  const text = cadPlainPromptMessage(command, prompt)
    ?? (GUARDED_COMMANDS.has(name)
      ? "Elige una opción o presiona Esc para cancelar"
      : prompt.message);
  const fallback = prompt.defaultOption ?? prompt.defaultValue;
  const suffix = fallback !== undefined && fallback !== "" ? ` <${fallback}>` : "";
  return `${text}${suffix}: `;
}
