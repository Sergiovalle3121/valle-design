/**
 * MEDIDOR DE FORTALEZA — honesto, y por eso incómodo.
 *
 * ── LO QUE CASI TODOS HACEN MAL ─────────────────────────────────────────────
 * El medidor típico cuenta clases de caracteres: una mayúscula, un número, un
 * símbolo, y pinta la barra en verde. Con esa regla `Password1!` es «fuerte» y
 * `caballo grapa batería correcto` es «débil». Las dos valoraciones son falsas y
 * en el sentido peor: la primera empuja a la gente hacia la contraseña que un
 * atacante prueba primero, y la segunda la aleja de la que de verdad aguanta.
 *
 * Este medidor estima ENTROPÍA en bits y castiga los patrones que un atacante
 * explota de verdad:
 *
 *   · repeticiones (`aaaa`, `abcabcabc`) — el diccionario las genera solas;
 *   · secuencias (`1234`, `abcd`, `qwerty`) — están en cualquier lista;
 *   · sustituciones obvias (`p@ssw0rd`) — las reglas de crackeo las deshacen
 *     antes de empezar, así que cuentan como la palabra sin disfraz;
 *   · una lista corta de las contraseñas más usadas del mundo, que no valen
 *     nada por larga que sea la variedad de caracteres.
 *
 * ── LO QUE NO PRETENDE SER ──────────────────────────────────────────────────
 * No es zxcvbn ni intenta serlo: no lleva diccionarios de decenas de miles de
 * palabras ni modelos de teclado por idioma. Es un heurístico DECLARADO, y la
 * interfaz lo dice con esas palabras en vez de fingir una precisión que no
 * tiene. Lo que de verdad protege la cuenta está en el servidor y también está
 * escrito en la pantalla: Argon2id, límite de intentos y verificación de correo.
 *
 * ── POR QUÉ EN BITS Y NO EN «1 a 5» ─────────────────────────────────────────
 * Porque los bits se pueden comprobar contra la realidad —2^n intentos— y una
 * puntuación de 1 a 5 no significa nada fuera de quien la inventó. La barra
 * traduce a lenguaje humano al final, pero el número que la mueve es medible.
 */

export type PasswordVerdict = "muy-debil" | "debil" | "aceptable" | "fuerte";

export interface PasswordAssessment {
  /** Entropía estimada en bits, con las penalizaciones ya aplicadas. */
  bits: number;
  verdict: PasswordVerdict;
  /** Etiqueta corta para la barra. */
  label: string;
  /** Qué habría que cambiar. Vacío cuando no hay nada que decir. */
  advice: string | null;
  /** 0-1, para pintar la barra sin que el componente haga aritmética. */
  ratio: number;
}

/**
 * Las que salen siempre en las filtraciones publicadas. La lista es CORTA a
 * propósito: su trabajo no es cubrir el diccionario de un atacante —imposible
 * en el navegador— sino no felicitar a quien escribe la más obvia de todas.
 */
const COMUNES = new Set([
  "password",
  "contrasena",
  "contraseña",
  "123456",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty",
  "qwertyuiop",
  "abc123",
  "iloveyou",
  "admin",
  "welcome",
  "monkey",
  "dragon",
  "letmein",
  "football",
  "princess",
  "sunshine",
  "master",
  "hola",
  "mexico",
  "america",
  "chivas",
  "cruzazul",
]);

/** Deshace las sustituciones que las reglas de crackeo deshacen igual. */
function desofuscar(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[@4]/gu, "a")
    .replace(/[3]/gu, "e")
    .replace(/[1!|]/gu, "i")
    .replace(/[0]/gu, "o")
    .replace(/[5$]/gu, "s")
    .replace(/[7]/gu, "t");
}

/** Tamaño del alfabeto que el atacante tendría que recorrer. */
function alfabeto(password: string): number {
  let size = 0;
  if (/[a-z]/u.test(password)) size += 26;
  if (/[A-Z]/u.test(password)) size += 26;
  if (/[0-9]/u.test(password)) size += 10;
  if (/[^A-Za-z0-9]/u.test(password)) size += 33;
  return size || 1;
}

/**
 * Longitud efectiva: la real menos lo que es repetición o secuencia.
 *
 * Un carácter que continúa una secuencia obvia no añade una elección, añade
 * cero: el atacante que probó `abc` prueba `abcd` sin coste. Se descuenta a la
 * mitad y no del todo porque el heurístico no es perfecto y castigar de más
 * empuja a la gente hacia contraseñas más cortas, que es peor.
 */
function longitudEfectiva(password: string): number {
  let efectiva = 1;
  for (let i = 1; i < password.length; i += 1) {
    const previo = password.charCodeAt(i - 1);
    const actual = password.charCodeAt(i);
    const continua = actual === previo || Math.abs(actual - previo) === 1;
    efectiva += continua ? 0.5 : 1;
  }
  return efectiva;
}

const UMBRAL: ReadonlyArray<readonly [number, PasswordVerdict, string]> = [
  [0, "muy-debil", "Muy débil"],
  [40, "debil", "Débil"],
  [60, "aceptable", "Aceptable"],
  [80, "fuerte", "Fuerte"],
];

/** Los bits a partir de los cuales la barra se llena del todo. */
const BITS_LLENA = 100;

export function assessPassword(password: string): PasswordAssessment {
  if (!password) {
    return {
      bits: 0,
      verdict: "muy-debil",
      label: "Muy débil",
      advice: null,
      ratio: 0,
    };
  }

  const plano = desofuscar(password);
  let bits = longitudEfectiva(password) * Math.log2(alfabeto(password));
  let advice: string | null = null;

  // Una contraseña conocida no vale sus bits: vale lo que tarda un diccionario.
  const esComun =
    COMUNES.has(plano) ||
    [...COMUNES].some((comun) => comun.length >= 5 && plano.includes(comun));
  if (esComun) {
    bits = Math.min(bits, 18);
    advice =
      "Contiene una de las contraseñas más usadas del mundo: un atacante la prueba en los primeros segundos.";
  }

  // Un solo carácter repetido, por larga que sea.
  if (/^(.)\1+$/u.test(password)) {
    bits = Math.min(bits, 8);
    advice = "Es un solo carácter repetido.";
  }

  if (password.length < 12) {
    advice = advice ?? "El mínimo son 12 caracteres.";
  } else if (!advice && bits < 60) {
    advice =
      "Alárgala. Cuatro palabras sin relación entre ellas aguantan más que una palabra con símbolos.";
  }

  const escalon = [...UMBRAL].reverse().find(([minimo]) => bits >= minimo);
  const [, verdict, label] = escalon ?? UMBRAL[0];

  return {
    bits: Math.round(bits),
    verdict,
    label,
    advice,
    ratio: Math.min(1, bits / BITS_LLENA),
  };
}
