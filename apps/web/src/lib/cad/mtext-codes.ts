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
 * | `\W<factor>;`         | factor de anchura: 0,8 aprieta, 1,2 ensancha        |
 * | `\Q<grados>;`         | oblicuidad: la cursiva de las fuentes de trazo      |
 * | `\A<0\|1\|2>;`        | alineación vertical del tramo: abajo, centro, arriba|
 * | `\pxi<primera>,l<izq>;`| sangría de párrafo: primera línea e izquierda (ver abajo)|
 * | `\~`                  | espacio DURO: no parte la línea                     |
 * | `{` … `}`             | grupo: los atributos vuelven a su valor al cerrar   |
 * | `\\`, `\{`, `\}`      | barra y llaves LITERALES                            |
 *
 * Un código no reconocido se conserva TAL CUAL, barra incluida. Es deliberado:
 * un dibujo importado puede traer códigos que este módulo todavía no entiende y
 * comérselos borraría contenido del plano en silencio. Mejor que se vea.
 *
 * ## `\p`: sólo la sangría, no la justificación ni los tabuladores
 *
 * `\pxi<primera>,l<izquierda>,r…,q…,t…;` es la sintaxis real de AutoCAD para
 * el párrafo entero: sangría de primera línea, sangría izquierda, derecha,
 * justificación y tabuladores. Aquí sólo se LEEN `i` y `l` —lo que hace falta
 * para una sangría francesa, que es lo que necesita una viñeta o un número de
 * lista (`cadMTextBulletCode`/`cadMTextNumberedCode`)— y se guardan en
 * `CadMTextRun.paragraphIndent`, en las MISMAS unidades de dibujo del código,
 * no relativas a la altura del texto. `r`, `q` y `t` se RECONOCEN como
 * sintaxis —no dejan el código crudo a la vista— pero no producen ningún
 * efecto: justificar párrafo y tabuladores necesitan que la maqueta sepa de
 * columnas de tabulación, que no las tiene, y ampliarlo es trabajo aparte.
 *
 * ## Lo que NO se reconoce en absoluto, y por qué se dice
 *
 * `\T<factor>;` —espaciado entre caracteres— se conserva literal: necesita que
 * la medida sepa de kerning, que hoy es una suma de anchuras por carácter. Se
 * declara aquí y se comprueba en `mtext-rich-format.spec.ts` para que un plano
 * importado enseñe el código en pantalla —feo pero visible— en vez de perder
 * silenciosamente un espaciado que alguien puso a propósito.
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

/**
 * Dónde se apoya el tramo respecto de la línea. Es lo que fija `\A`, y lo que
 * permite que un exponente vaya arriba sin ser un apilado.
 */
export type CadMTextVerticalAlign = "bottom" | "center" | "top";

export interface CadMTextRun {
  text: string;
  underline: boolean;
  overline: boolean;
  /** Multiplicador sobre la altura del MTEXT. 1 = la del propio MTEXT. */
  heightScale: number;
  /**
   * Factor de ANCHURA (`\W`). 1 es la anchura natural de la fuente.
   *
   * No es un capricho tipográfico: apretar a 0,8 es lo que hace un delineante
   * para que un rótulo quepa en una casilla del cajetín sin bajar la altura del
   * texto, que está fijada por la norma.
   */
  widthFactor: number;
  /**
   * OBLICUIDAD en grados (`\Q`). 0 es recto; 15 es la inclinación de ISOCPEUR.
   *
   * Las fuentes de trazo no tienen cursiva: se inclinan. Un dibujo que llega
   * con `\Q15;` y se dibuja recto no está «casi igual», está en otra fuente.
   */
  oblique: number;
  fontFamily?: string;
  /** Color del tramo, si el texto lo fija. Índice ACI tal cual se escribió. */
  color?: string;
  /** Alineación vertical del tramo (`\A`), si el texto la fija. */
  verticalAlign?: CadMTextVerticalAlign;
  /**
   * Presente cuando el tramo es un apilado. `text` lleva entonces la versión de
   * una sola línea (`superior/inferior`), que es lo que miden y dibujan los
   * consumidores que todavía no saben apilar.
   */
  stack?: CadMTextStack;
  /**
   * Sangría del PÁRRAFO (`\pxi<primera>,l<izquierda>;`), si el párrafo la fija.
   * Ver `CadMTextParagraphIndent` para qué significa cada número. Vive en el
   * tramo —no en el párrafo, que es sólo un array— porque así lo consulta
   * `mtext-layout.ts`: el primer tramo del párrafo lo lleva, y basta con
   * mirarlo para saber cómo sangrar toda la línea.
   */
  paragraphIndent?: CadMTextParagraphIndent;
}

/**
 * Sangría de párrafo real de AutoCAD (`\pxi<primera>,l<izquierda>;`), en las
 * MISMAS unidades de dibujo que `width` de la entidad — no relativas a la
 * altura del texto, para que el número que se lee en un `.dxf` importado
 * signifique lo mismo aquí que allí.
 *
 * `first` es el desplazamiento de la PRIMERA línea del párrafo RESPECTO de
 * `left`; con `first` negativo y `left` positivo del mismo valor absoluto la
 * primera línea vuelve a la columna 0 y las siguientes quedan sangradas — la
 * sangría FRANCESA que hace una viñeta o un número de lista, y que construyen
 * `cadMTextBulletCode`/`cadMTextNumberedCode`.
 */
export interface CadMTextParagraphIndent {
  first: number;
  left: number;
}

/** Un párrafo es la lista de tramos entre dos `\P`. */
export type CadMTextParagraph = readonly CadMTextRun[];

interface Attributes {
  underline: boolean;
  overline: boolean;
  heightScale: number;
  widthFactor: number;
  oblique: number;
  fontFamily?: string;
  color?: string;
  verticalAlign?: CadMTextVerticalAlign;
  paragraphIndent?: CadMTextParagraphIndent;
}

const INITIAL: Attributes = {
  underline: false,
  overline: false,
  heightScale: 1,
  widthFactor: 1,
  oblique: 0,
};

/**
 * Espacio DURO. `~` en el `.dxf`, U+00A0 en el modelo.
 *
 * Se traduce a un carácter real —y no a un marcador— porque así lo miden y lo
 * dibujan todos los consumidores sin saber nada de códigos. Lo único que sabe
 * que es DURO es el ajuste de línea de `mtext-layout.ts`, que no parte por él:
 * es lo que impide que «Ø 25» quede con el diámetro al final de una línea y el
 * número al principio de la siguiente.
 */
export const CAD_MTEXT_HARD_SPACE = String.fromCharCode(0xa0);

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
    a.widthFactor === b.widthFactor &&
    a.oblique === b.oblique &&
    a.fontFamily === b.fontFamily &&
    a.color === b.color &&
    a.verticalAlign === b.verticalAlign &&
    // Comparación por REFERENCIA, no por valor: el objeto viaja por `{...attributes,
    // paragraphIndent: {...}}` cada vez que `\p` lo fija, así que dos tramos del
    // MISMO párrafo comparten literalmente el mismo objeto y sólo dejan de
    // fusionarse cuando de verdad cambia.
    a.paragraphIndent === b.paragraphIndent
  );
}

/** Las tres alineaciones de `\A`, con los números que usa AutoCAD. */
const VERTICAL_ALIGN: readonly CadMTextVerticalAlign[] = ["bottom", "center", "top"];

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
    return normalized.split("\n").map((text) => [{ ...INITIAL, text }]);

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

    // `\~`: espacio duro. Es un CARÁCTER, no un atributo, así que entra en el
    // texto pendiente sin cortar el tramo — partirlo aquí separaría la palabra
    // en dos tramos y el ajuste de línea volvería a poder romperla justo ahí,
    // que es lo contrario de lo que el código pide.
    if (code === "~") {
      pending += CAD_MTEXT_HARD_SPACE;
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

    if (code === "W" || code === "w") {
      const read = readValue(normalized, index + 2);
      const numeric = Number.parseFloat(read.value);
      flush();
      // Un factor de cero o negativo no aprieta el texto: lo hace desaparecer o
      // lo dibuja del revés. Se ignora y se conserva el anterior, que es la
      // regla de todo este módulo: ante lo imposible, no cambiar nada.
      attributes = {
        ...attributes,
        widthFactor: Number.isFinite(numeric) && numeric > 0 ? numeric : attributes.widthFactor,
      };
      index = read.next;
      continue;
    }

    if (code === "Q" || code === "q") {
      const read = readValue(normalized, index + 2);
      const numeric = Number.parseFloat(read.value);
      flush();
      // La oblicuidad SÍ puede ser negativa —se inclina hacia el otro lado— y
      // por eso aquí sólo se exige que sea un número.
      attributes = {
        ...attributes,
        oblique: Number.isFinite(numeric) ? numeric : attributes.oblique,
      };
      index = read.next;
      continue;
    }

    if (code === "A") {
      const read = readValue(normalized, index + 2);
      const chosen = VERTICAL_ALIGN[Number.parseInt(read.value, 10)];
      flush();
      attributes = { ...attributes, verticalAlign: chosen ?? attributes.verticalAlign };
      index = read.next;
      continue;
    }

    if (code === "p") {
      const read = readValue(normalized, index + 2);
      flush();
      // `\pxi<primera>,l<izquierda>[,r…][,q…][,t…];` — sólo `i` (primera línea)
      // y `l` (izquierda) se interpretan; el resto (justificación de párrafo,
      // tabuladores) se ACEPTA sin efecto, igual que `\T` y el resto de `\p`
      // se declaran arriba: reconocer la sintaxis sin dibujar nada evita que un
      // dibujo importado enseñe el código crudo, sin fingir soporte que no hay.
      const body = read.value.replace(/^[xX]/, "");
      let first: number | undefined;
      let left: number | undefined;
      for (const token of body.split(",")) {
        const match = /^\s*([ilqrt])\s*(-?[0-9]*\.?[0-9]+)?/i.exec(token);
        if (!match) continue;
        const value = match[2] === undefined ? undefined : Number.parseFloat(match[2]);
        if (value === undefined || !Number.isFinite(value)) continue;
        const letter = match[1].toLowerCase();
        if (letter === "i") first = value;
        else if (letter === "l") left = value;
      }
      if (first !== undefined || left !== undefined)
        attributes = {
          ...attributes,
          paragraphIndent: {
            first: first ?? attributes.paragraphIndent?.first ?? 0,
            left: left ?? attributes.paragraphIndent?.left ?? 0,
          },
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

/** El número tal como lo escribe AutoCAD en un `\p`: sin ceros de cola. */
function paragraphNumber(value: number): string {
  return String(Math.round(value * 1e4) / 1e4);
}

/**
 * El código de sangría de un párrafo, sólo.
 *
 * Exportado aparte de `cadMTextBulletCode`/`cadMTextNumberedCode` porque
 * cualquier párrafo puede querer una sangría francesa sin ser una lista —una
 * nota que empieza con un rótulo corto y sigue en la línea de abajo alineada
 * con el texto, no con el rótulo.
 */
export function cadMTextParagraphIndentCode(first: number, left: number): string {
  return `\\pxi${paragraphNumber(first)},l${paragraphNumber(left)};`;
}

/**
 * Un párrafo de lista con VIÑETA: sangría francesa (la marca en la columna 0,
 * el texto que se ajusta a la izquierda de `indent`) y un espacio DURO (`\~`)
 * entre la viñeta y el texto para que no se separen al partir línea.
 *
 * No usa `\t` (tabulador) porque `mtext-layout.ts` no lo mide — es la misma
 * frontera que ya declara este módulo para `\p`. El espacio duro consigue lo
 * que aquí hace falta —viñeta y primera palabra pegadas— sin fingir que hay
 * columnas de tabulación.
 */
export function cadMTextBulletCode(text: string, indent = 6, bullet = "•"): string {
  return `${cadMTextParagraphIndentCode(-indent, indent)}${bullet}\\~${escapeCadMText(text)}`;
}

/** Un párrafo de lista NUMERADA: `<n>.` en vez de una viñeta, mismo mecanismo. */
export function cadMTextNumberedCode(number: number, text: string, indent = 8): string {
  return `${cadMTextParagraphIndentCode(-indent, indent)}${number}.\\~${escapeCadMText(text)}`;
}
