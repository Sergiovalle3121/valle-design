/**
 * LA LISTA DE CLASE — pegar treinta correos y que salgan treinta invitaciones.
 *
 * ── DE DÓNDE SALE ESTO ──────────────────────────────────────────────────────
 * Un profesor no escribe la lista de su grupo: la tiene. Sale del sistema de la
 * escuela, de una hoja de cálculo o de un correo, y llega en cualquiera de las
 * formas que el mundo real produce:
 *
 *     ana@alumnos.unam.mx, luis@alumnos.unam.mx
 *     Ana Ruiz <ana@alumnos.unam.mx>
 *     ana@alumnos.unam.mx;luis@alumnos.unam.mx
 *     una por línea, con la columna del nombre pegada al lado con un tabulador
 *
 * Un formulario que exige un correo por vez convierte eso en treinta gestos
 * idénticos, y treinta gestos idénticos es exactamente donde alguien abandona.
 *
 * ── LO QUE ESTE MÓDULO NO HACE ──────────────────────────────────────────────
 * No manda nada ni sabe qué es una invitación: convierte texto pegado en una
 * lista limpia y en una lista de descartes CON su motivo. Separarlo así es lo
 * que permite probar el caso feo —la línea rota, el duplicado con otra
 * mayúscula, el nombre con acentos— sin levantar un navegador.
 *
 * ── POR QUÉ LOS DESCARTES SE DEVUELVEN Y NO SE TIRAN ────────────────────────
 * Porque tirarlos en silencio es la peor opción posible: el profesor pega
 * treinta líneas, ve veintiocho invitaciones y no sabe cuáles dos faltan. Los
 * dos alumnos que se quedan fuera se enteran el día de la entrega.
 */

/** El tope declarado. Ver `RosterParse.truncated`. */
export const ROSTER_MAX = 100;

/**
 * Forma mínima de un correo, la misma que usa el backend para la lista de
 * operadores: algo, una arroba, algo con un punto. No pretende validar
 * direcciones —ninguna expresión regular lo hace bien— sino descartar la
 * basura de una lista mal pegada.
 */
const FORMA_DE_CORREO = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/u;

export interface RosterRejection {
  /** La línea tal y como se pegó, para que se pueda encontrar y corregir. */
  raw: string;
  reason: "sin-correo" | "duplicado";
}

export interface RosterParse {
  emails: string[];
  rejected: RosterRejection[];
  /** Cuántos correos válidos se dejaron fuera por el tope. Nunca en silencio. */
  truncated: number;
}

/**
 * Extrae el correo de un fragmento. Acepta las tres formas que llegan de
 * verdad: el correo suelto, el correo entre ángulos con el nombre delante, y
 * la fila de hoja de cálculo con el nombre en otra columna.
 */
function extraerCorreo(fragmento: string): string | null {
  const entreAngulos = /<([^<>]+)>/u.exec(fragmento);
  const candidato = entreAngulos
    ? entreAngulos[1].trim()
    : // Sin ángulos: la última pieza separada por espacio o tabulador que
      // contenga una arroba. «Ana Ruiz\tana@x.mx» y «ana@x.mx» caen las dos
      // aquí, y una fila con dos columnas de texto no produce nada.
      (fragmento
        .split(/[\s\t]+/u)
        .filter((pieza) => pieza.includes("@"))
        .pop() ?? "");
  const limpio = candidato.trim().replace(/^[<"']+|[>"'.,;]+$/gu, "");
  return FORMA_DE_CORREO.test(limpio) ? limpio.toLowerCase() : null;
}

/**
 * Convierte texto pegado en la lista de invitaciones a mandar.
 *
 * El orden se conserva: quien pega su lista de clase espera verla en el mismo
 * orden en que la trajo, y un orden distinto le obliga a releerla entera para
 * comprobar que no falta nadie.
 */
export function parseRoster(input: string, max: number = ROSTER_MAX): RosterParse {
  const emails: string[] = [];
  const rejected: RosterRejection[] = [];
  const vistos = new Set<string>();
  let truncated = 0;

  // Se corta por líneas, comas y puntos y coma. El espacio NO separa: «Ana
  // Ruiz <ana@x.mx>» es UNA entrada, no tres.
  const fragmentos = input
    .split(/[\n\r,;]+/u)
    .map((fragmento) => fragmento.trim())
    .filter(Boolean);

  for (const fragmento of fragmentos) {
    const email = extraerCorreo(fragmento);
    if (!email) {
      rejected.push({ raw: fragmento, reason: "sin-correo" });
      continue;
    }
    if (vistos.has(email)) {
      rejected.push({ raw: fragmento, reason: "duplicado" });
      continue;
    }
    vistos.add(email);
    if (emails.length >= max) {
      truncated += 1;
      continue;
    }
    emails.push(email);
  }

  return { emails, rejected, truncated };
}

/** El motivo del descarte, dicho para quien pegó la lista. */
export function rosterRejectionText(reason: RosterRejection["reason"]): string {
  return reason === "duplicado"
    ? "repetido en la lista"
    : "no se encontró un correo";
}
