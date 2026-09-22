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
import { formatCadPrompt } from "./prompt";

/** Las dos redacciones del mismo paso. */
export type CadPromptWording = "pro" | "esencial";

export interface CadPlainPromptEntry {
  /**
   * El `message` del motor. Una cadena se compara exacta; una expresión
   * regular sirve para los mensajes dinámicos (el tipo de puerta al final, el
   * ordinal del punto). Las regulares van ancladas al inicio a propósito: un
   * mensaje con AVISO delante («Eso no es un muro… Designe el muro…») no
   * encaja y cae al texto del motor, que es el que trae la explicación.
   */
  readonly match: string | RegExp;
  /** La misma petición en lenguaje llano, sin corchetes ni «Precise». */
  readonly plain: string;
}

/**
 * Nombre canónico → redacciones llanas de sus pasos. Mismo orden que la barra
 * Esencial. Un paso sin entrada cae al `message` del motor sin corchetes: se
 * degrada a texto técnico, nunca a silencio.
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
      plain: "Primero dibuja un muro y luego haz clic sobre él para colocar la puerta",
    },
  ],
  WINDOW: [
    {
      match: /^Designe el muro donde alojar la ventana\b/,
      plain: "Primero dibuja un muro y luego haz clic sobre él para colocar la ventana",
    },
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

/**
 * La redacción llana del paso, o `null` si no la hay. El nombre se normaliza
 * como en el registro (mayúsculas, sin espacios) para que dé igual quién lo
 * pase; `null` de comando significa «sin comando activo».
 */
export function cadPlainPromptMessage(command: string | null, prompt: CadPrompt): string | null {
  if (!command) return null;
  const entries = CAD_PLAIN_PROMPTS[command.trim().toUpperCase()];
  if (!entries) return null;
  return entries.find((entry) => matches(entry, prompt.message))?.plain ?? null;
}

/**
 * El renglón del prompt en la redacción pedida.
 *
 * - "pro": `formatCadPrompt` tal cual, byte a byte; nada de lo que afirman
 *   los goldens de Pro pasa por aquí.
 * - "esencial": el llano (o el `message` del motor si no lo hay) más el valor
 *   por defecto entre ángulos y los dos puntos. Sin corchetes: las opciones
 *   siguen en `prompt.options` para los botones, el menú y el teclado.
 */
export function formatCadPromptFor(
  prompt: CadPrompt,
  wording: CadPromptWording,
  command: string | null,
): string {
  if (wording === "pro") return formatCadPrompt(prompt);
  const text = cadPlainPromptMessage(command, prompt) ?? prompt.message;
  const fallback = prompt.defaultOption ?? prompt.defaultValue;
  const suffix = fallback !== undefined && fallback !== "" ? ` <${fallback}>` : "";
  return `${text}${suffix}: `;
}
