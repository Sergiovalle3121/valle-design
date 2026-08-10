/**
 * Códigos de control de MTEXT.
 *
 * ## Por qué hacen falta
 *
 * `mtext-layout.ts` sabía UNA cosa del formato interno de un MTEXT: que `\P`
 * es un salto de párrafo. Todo lo demás —subrayado, fuente, color, altura y,
 * sobre todo, el APILADO— se dibujaba literalmente, así que escribir una
 * tolerancia daba en pantalla los caracteres `\S+0,05^-0,02;` en vez de las dos
 * cifras apiladas. Y la tolerancia es la mitad del texto de un plano mecánico:
 * sin apilado no se puede acotar una pieza, sólo describirla.
 *
 * Este módulo traduce la cadena de MTEXT a **runs** —tramos de texto con sus
 * atributos ya resueltos— y ofrece el camino inverso para construirla. Es puro:
 * ni DOM, ni THREE, ni documento. Lo consume `mtext-layout.ts` y con él el
 * render, las medidas y los límites.
 *
 * ## Los códigos que se reconocen
 *
 * | Código                | Significado                                        |
 * |-----------------------|----------------------------------------------------|
 * | `\P`                  | salto de párrafo                                    |
 * | `\L` … `\l`           | abre y cierra subrayado                             |
 * | `\O` … `\o`           | abre y cierra sobrerrayado                          |
 * | `\S<sup>^<sub>;`      | apilado de tolerancia (uno encima de otro, sin raya)|
 * | `\S<num>/<den>;`      | fracción con raya horizontal                        |
 * | `\S<num>#<den>;`      | fracción diagonal                                   |
 * | `\f<familia>…;`       | fuente (se lee la familia; el resto se ignora)      |
 * | `\C<índice>;`         | color ACI                                           |
 * | `\H<valor>;`          | altura absoluta; `\H<valor>x;` altura relativa      |
 * | `{` … `}`             | grupo: los atributos vuelven a su valor al cerrar   |
 * | `\\`, `\{`, `\}`      | barra y llaves LITERALES                            |
 *
 * Un código no reconocido se conserva TAL CUAL, barra incluida. Es deliberado:
 * un dibujo importado puede traer códigos que este módulo todavía no entiende y
 * comérselos borraría contenido del plano en silencio. Mejor que se vea.
 *
 * ## Camino rápido
 *
 * Un texto sin `\` ni llaves no puede llevar formato, así que se devuelve tal
 * cual sin analizar nada. Eso mantiene byte a byte el comportamiento anterior
 * para la inmensa mayoría de los textos —y hace que analizar no cueste nada en
 * el caso normal, que es el que se recorre en cada relayout.
 */

/** Cómo se apilan las dos mitades de un `\S`. */
export type CadMTextStackStyle = "tolerance" | "fraction" | "diagonal";

export interface CadMTextStack {
  upper: string;
  lower: string;
  style: CadMTextStackStyle;
}

export interface CadMTextRun {
  text: string;
  underline: boolean;
  overline: boolean;
  /** Multiplicador sobre la altura del MTEXT. 1 = la del propio MTEXT. */
  heightScale: number;
  fontFamily?: string;
  /** Color del tramo, si el texto lo fija. Índice ACI tal cual se escribió. */
  color?: string;
  /**
   * Presente cuando el tramo es un apilado. `text` lleva entonces la versión de
   * una sola línea (`superior/inferior`), que es lo que miden y dibujan los
   * consumidores que todavía no saben apilar.
   */
  stack?: CadMTextStack;
}

/** Un párrafo es la lista de tramos entre dos `\P`. */
export type CadMTextParagraph = readonly CadMTextRun[];

interface Attributes {
  underline: boolean;
  overline: boolean;
  heightScale: number;
  fontFamily?: string;
  color?: string;
}

const INITIAL: Attributes = { underline: false, overline: false, heightScale: 1 };

/** `true` si la cadena PUEDE llevar formato. Sin esto no hay nada que analizar. */
export function cadMTextHasCodes(source: string): boolean {
  return source.includes("\\") || source.includes("{") || source.includes("}");
}

/** Separador de una sola línea para un apilado. Ver `CadMTextRun.text`. */
function flattenStack(stack: CadMTextStack): string {
  return `${stack.upper}/${stack.lower}`;
}

function stackStyleOf(separator: string): CadMTextStackStyle {
  if (separator === "^") return "tolerance";
  if (separator === "#") return "diagonal";
  return "fraction";
}

/**
 * Lee un `\S…;`. Devuelve el apilado y dónde continúa el análisis.
 *
 * El terminador `;` es obligatorio en AutoCAD; sin él la orden se traga el
 * resto del párrafo. Aquí se hace lo mismo pero acotado al párrafo: un `\S` sin
 * cerrar apila hasta el final del texto en vez de comerse los saltos, porque un
 * texto mal formado no debe fundir cuatro párrafos en uno.
 */
function readStack(source: string, from: number): { stack: CadMTextStack; next: number } | null {
  let index = from;
  let body = "";
  while (index < source.length && source[index] !== ";") {
    // Un `\P` dentro de un apilado sin cerrar corta: ver arriba.
    if (source[index] === "\\" && source[index + 1] === "P") break;
    if (source[index] === "\\" && index + 1 < source.length) {
      body += source[index + 1];
      index += 2;
      continue;
    }
    body += source[index];
    index += 1;
  }
  const next = source[index] === ";" ? index + 1 : index;
  const separatorIndex = body.search(/[\^#/]/);
  if (separatorIndex < 0) return null;
  const separator = body[separatorIndex];
  return {
    stack: {
      upper: body.slice(0, separatorIndex),
      lower: body.slice(separatorIndex + 1),
      style: stackStyleOf(separator),
    },
    next,
  };
}

/** Lee un valor terminado en `;` (`\f`, `\C`, `\H`). */
function readValue(source: string, from: number): { value: string; next: number } {
  const end = source.indexOf(";", from);
  if (end < 0) return { value: source.slice(from), next: source.length };
  return { value: source.slice(from, end), next: end + 1 };
}

function sameAttributes(a: Attributes, b: Attributes): boolean {
  return (
    a.underline === b.underline &&
    a.overline === b.overline &&
    a.heightScale === b.heightScale &&
    a.fontFamily === b.fontFamily &&
    a.color === b.color
  );
}

/**
 * Descompone un MTEXT en párrafos de tramos.
 *
 * Los `\r\n` y `\n` sueltos cuentan como salto de párrafo igual que `\P`: el
 * editor en sitio escribe saltos de verdad y el importador de DXF escribe `\P`,
 * y ambos deben significar lo mismo.
 */
export function parseCadMText(source: string): CadMTextParagraph[] {
  const normalized = source.replace(/\r\n?/g, "\n");
  if (!cadMTextHasCodes(normalized))
    return normalized
      .split("\n")
      .map((text) => [{ text, underline: false, overline: false, heightScale: 1 }]);

  const paragraphs: CadMTextRun[][] = [];
  let runs: CadMTextRun[] = [];
  let pending = "";
  let attributes: Attributes = INITIAL;
  const stack: Attributes[] = [];

  const flush = () => {
    if (!pending) return;
    const last = runs[runs.length - 1];
    // Dos tramos consecutivos con los mismos atributos son UN tramo: si no se
    // fusionaran, `{}` vacíos o un `\L\l` seguido partirían las palabras y el
    // ajuste de línea mediría distinto que el mismo texto sin códigos.
    if (last && !last.stack && sameAttributes(last, attributes)) last.text += pending;
    else runs.push({ ...attributes, text: pending });
    pending = "";
  };
  const breakParagraph = () => {
    flush();
    paragraphs.push(runs);
    runs = [];
  };

  let index = 0;
  while (index < normalized.length) {
    const character = normalized[index];

    if (character === "\n") {
      breakParagraph();
      index += 1;
      continue;
    }

    if (character === "{") {
      flush();
      stack.push(attributes);
      index += 1;
      continue;
    }

    if (character === "}") {
      flush();
      attributes = stack.pop() ?? INITIAL;
      index += 1;
      continue;
    }

    if (character !== "\\") {
      pending += character;
      index += 1;
      continue;
    }

    const code = normalized[index + 1];
    if (code === undefined) {
      pending += "\\";
      index += 1;
      continue;
    }

    if (code === "\\" || code === "{" || code === "}") {
      pending += code;
      index += 2;
      continue;
    }

    if (code === "P") {
      breakParagraph();
      index += 2;
      continue;
    }

    if (code === "L" || code === "l" || code === "O" || code === "o") {
      flush();
      attributes =
        code === "L"
          ? { ...attributes, underline: true }
          : code === "l"
            ? { ...attributes, underline: false }
            : code === "O"
              ? { ...attributes, overline: true }
              : { ...attributes, overline: false };
      index += 2;
      continue;
    }

    if (code === "S") {
      const read = readStack(normalized, index + 2);
      if (!read) {
        // Un `\S` sin separador no apila nada. Se conserva literal en vez de
        // desaparecer, que es la regla de los códigos no reconocidos.
        pending += "\\S";
        index += 2;
        continue;
      }
      flush();
      runs.push({ ...attributes, text: flattenStack(read.stack), stack: read.stack });
      index = read.next;
      continue;
    }

    if (code === "f" || code === "F") {
      const read = readValue(normalized, index + 2);
      flush();
      // `\fArial|b1|i0|c0|p34;` — sólo la familia es geometría; la negrita y la
      // cursiva del código son de la fuente, no del MTEXT, y el modelo canónico
      // ya las lleva como campos propios de la entidad.
      const family = read.value.split("|")[0]?.trim();
      attributes = { ...attributes, fontFamily: family || undefined };
      index = read.next;
      continue;
    }

    if (code === "C" || code === "c") {
      const read = readValue(normalized, index + 2);
      flush();
      attributes = { ...attributes, color: read.value.trim() || undefined };
      index = read.next;
      continue;
    }

    if (code === "H") {
      const read = readValue(normalized, index + 2);
      const relative = /x$/i.test(read.value.trim());
      const numeric = Number.parseFloat(read.value);
      flush();
      // `\H2x;` multiplica; `\H240;` fija una altura absoluta que sólo se puede
      // expresar como multiplicador cuando se conoce la del MTEXT, así que el
      // valor absoluto se resuelve en `cadMTextRunHeight`.
      attributes = {
        ...attributes,
        heightScale: Number.isFinite(numeric) && numeric > 0
          ? relative
            ? numeric
            : -numeric
          : attributes.heightScale,
      };
      index = read.next;
      continue;
    }

    // Código desconocido: literal, barra incluida.
    pending += "\\";
    index += 1;
  }

  flush();
  paragraphs.push(runs);
  return paragraphs;
}

/**
 * Altura real de un tramo dada la del MTEXT.
 *
 * `heightScale` guarda el multiplicador en positivo y la altura ABSOLUTA en
 * negativo: es la única forma de distinguir `\H2x;` de `\H2;` sin arrastrar un
 * segundo campo por todos los tramos, y ambos casos se resuelven aquí, en el
 * único sitio donde se conoce la altura de la entidad.
 */
export function cadMTextRunHeight(run: CadMTextRun, entityHeight: number): number {
  return run.heightScale < 0 ? -run.heightScale : entityHeight * run.heightScale;
}

/**
 * Texto plano: los códigos fuera, `\P` convertido en salto real.
 *
 * Es la vista de una sola línea por párrafo que necesitan el ajuste de línea,
 * la medida y cualquier consumidor que aún no sepa apilar. Un apilado se
 * aplana a `superior/inferior`, que ocupa aproximadamente lo mismo y no miente
 * sobre el contenido.
 */
export function cadMTextPlainText(source: string): string {
  const normalized = source.replace(/\r\n?/g, "\n");
  if (!cadMTextHasCodes(normalized)) return normalized;
  return parseCadMText(normalized)
    .map((paragraph) => paragraph.map((run) => run.text).join(""))
    .join("\n");
}

/** Escapa un literal para que viaje intacto dentro de un MTEXT. */
export function escapeCadMText(literal: string): string {
  return literal.replace(/([\\{}])/g, "\\$1");
}

/**
 * Construye un apilado. `TOLERANCE` y el editor en sitio lo usan para no tener
 * que recordar la sintaxis exacta ni escapar a mano.
 */
export function cadMTextStackCode(
  upper: string,
  lower: string,
  style: CadMTextStackStyle = "tolerance",
): string {
  const separator = style === "tolerance" ? "^" : style === "diagonal" ? "#" : "/";
  return `\\S${escapeCadMText(upper)}${separator}${escapeCadMText(lower)};`;
}
