/**
 * El intérprete del FLUJO DE CONTENIDO: dónde están los trazos y los rótulos.
 *
 * ## Qué es un flujo de contenido
 *
 * Una máquina de pila en notación postfija. Los números se apilan, el operador
 * los consume: `100 200 m 300 400 l S` mueve, traza y pinta. `pdf-measure.ts`
 * ya recorre uno para medir el papel que emitimos nosotros; esto es lo mismo
 * llevado hasta donde hace falta para importar el papel AJENO, que trae tres
 * cosas que aquel no necesitaba:
 *
 *  - **`cm` de verdad**. La matriz de transformación acumulada. `pdf-measure`
 *    la DECLARA sin aplicarla porque medir lo nuestro no la necesita; un PDF de
 *    CAD ajeno pone la escala del plano entero en un `cm` y no aplicarla
 *    produce un dibujo perfecto a la escala equivocada. Es el error más caro
 *    posible en un plano: se ve bien y mide mal.
 *  - **Curvas de Bézier**. `c`, `v` e `y`. Un plano con curvas es la mitad de
 *    los planos.
 *  - **XObjects de formulario**. Un bloque del CAD de origen sale como un
 *    XObject reutilizado con su propia matriz. Sin seguirlos, un plano lleno de
 *    ventanas y puertas entra VACÍO.
 *
 * ## Coordenadas
 *
 * Todo sale en el espacio de USUARIO de la página, en puntos, con la matriz ya
 * aplicada y con el origen donde lo pone el PDF (esquina inferior izquierda del
 * `MediaBox`, sin restar todavía su desplazamiento). Restar el origen, aplicar
 * `/Rotate` y pasar a unidades de dibujo es trabajo del importador, que es
 * quien sabe a qué escala quiere el plano: mezclar las dos cosas aquí obligaría
 * a reinterpretar el flujo cada vez que cambia la escala.
 *
 * ## Lo que se DECLARA en vez de fingirse
 *
 * Sombreados degradados (`sh`), patrones, imágenes en línea, transparencias y
 * capas apagadas no producen geometría. Cada uno deja una nota con su nombre en
 * `unsupported`, y el informe de pérdidas la convierte en una frase que el
 * arquitecto entiende. Un flujo que no se sabe interpretar NO se salta en
 * silencio.
 */
import {
  CadPdfLexer,
  CadPdfObjects,
  type CadPdfValue,
} from "./pdf-objects";
import { decodeCadPdfString, readCadPdfFonts, type CadPdfFont } from "./pdf-fonts";
import type { CadPdfOptionalGroup, CadPdfPage } from "./pdf-pages";

export interface CadPdfPoint {
  x: number;
  y: number;
}

/** `[a b c d e f]`: `x' = a·x + c·y + e`, `y' = b·x + d·y + f`. */
export type CadPdfMatrix = readonly [number, number, number, number, number, number];

export const CAD_PDF_IDENTITY: CadPdfMatrix = [1, 0, 0, 1, 0, 0];

export function cadPdfMultiply(left: CadPdfMatrix, right: CadPdfMatrix): CadPdfMatrix {
  return [
    left[0] * right[0] + left[1] * right[2],
    left[0] * right[1] + left[1] * right[3],
    left[2] * right[0] + left[3] * right[2],
    left[2] * right[1] + left[3] * right[3],
    left[4] * right[0] + left[5] * right[2] + right[4],
    left[4] * right[1] + left[5] * right[3] + right[5],
  ];
}

export const cadPdfApply = (matrix: CadPdfMatrix, x: number, y: number): CadPdfPoint => ({
  x: matrix[0] * x + matrix[2] * y + matrix[4],
  y: matrix[1] * x + matrix[3] * y + matrix[5],
});

/**
 * Escala media de una matriz: la raíz del valor absoluto de su determinante.
 *
 * Es lo que convierte un grosor de línea del espacio del PDF al del dibujo. Con
 * escala anisótropa —distinta en X y en Y— no existe UN grosor, y la media
 * geométrica es la aproximación que usa cualquier visor. Se elige eso y se dice,
 * en vez de coger la escala en X y equivocarse el doble en el otro eje.
 */
export const cadPdfScaleOf = (matrix: CadPdfMatrix): number =>
  Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])) || 1;

export type CadPdfSegment =
  | { type: "line"; to: CadPdfPoint }
  | { type: "curve"; c1: CadPdfPoint; c2: CadPdfPoint; to: CadPdfPoint };

export interface CadPdfSubpath {
  start: CadPdfPoint;
  segments: CadPdfSegment[];
  closed: boolean;
}

export interface CadPdfPathItem {
  subpaths: CadPdfSubpath[];
  stroke: boolean;
  fill: boolean;
  /** Grosor en unidades de USUARIO, con la escala de la matriz ya aplicada. */
  lineWidthPt: number;
  /** Color del trazo (o del relleno si sólo se rellena), en `#rrggbb`. */
  color: string;
  /** Nombre de la capa opcional activa, o `null` si el trazo no está en ninguna. */
  layerName: string | null;
}

export interface CadPdfTextItem {
  text: string;
  /** Origen de la línea base, ya transformado. */
  origin: CadPdfPoint;
  /** Alto nominal en puntos, con la escala de la matriz aplicada. */
  heightPt: number;
  /** Giro de la línea base, en radianes. */
  rotation: number;
  fontRef: string;
  baseFont: string;
  /** `true` si los bytes eran índices de glifo y NO se pudieron traducir. */
  glyphIndices: boolean;
  /** Modo 3 = invisible: es la capa de texto que deja un OCR sobre un escaneo. */
  renderMode: number;
  layerName: string | null;
  /** Cómo se supo traducir la fuente. Alimenta el informe de pérdidas. */
  fontSource: CadPdfFont["source"];
}

export interface CadPdfImageItem {
  name: string;
  widthPx: number;
  heightPx: number;
  /** Matriz que lleva el cuadrado unidad al sitio de la imagen en la página. */
  placement: CadPdfMatrix;
  layerName: string | null;
  /** `true` si es una imagen EN LÍNEA (`BI … ID … EI`), sin objeto propio. */
  inline: boolean;
}

export interface CadPdfContentScan {
  paths: CadPdfPathItem[];
  texts: CadPdfTextItem[];
  images: CadPdfImageItem[];
  /** Lo que el intérprete encontró y NO supo convertir, sin repetir. */
  unsupported: string[];
  /** Capas opcionales que se saltaron por venir apagadas. */
  skippedLayers: string[];
  /** Cuántos operadores se ejecutaron. Sirve para distinguir vacío de ilegible. */
  operators: number;
}

interface GraphicsState {
  ctm: CadPdfMatrix;
  lineWidth: number;
  strokeColor: string;
  fillColor: string;
  font: CadPdfFont | null;
  fontRef: string;
  fontSize: number;
  charSpacing: number;
  wordSpacing: number;
  horizontalScale: number;
  leading: number;
  rise: number;
  renderMode: number;
}

const initialState = (ctm: CadPdfMatrix): GraphicsState => ({
  ctm,
  lineWidth: 1,
  strokeColor: "#000000",
  fillColor: "#000000",
  font: null,
  fontRef: "",
  fontSize: 0,
  charSpacing: 0,
  wordSpacing: 0,
  horizontalScale: 1,
  leading: 0,
  rise: 0,
  renderMode: 0,
});

const channel = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value * 255)))
    .toString(16)
    .padStart(2, "0");

const rgb = (r: number, g: number, b: number) => `#${channel(r)}${channel(g)}${channel(b)}`;

/** CMYK → RGB. La conversión ingenua, que es la que hace cualquier visor. */
const cmyk = (c: number, m: number, y: number, k: number) =>
  rgb((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k));

/** Tope de trazos por página. Un PDF puede traer millones y el navegador no. */
const MAX_PATHS = 200_000;

interface Interpreter {
  objects: CadPdfObjects;
  scan: CadPdfContentScan;
  groupsByRef: Map<number, CadPdfOptionalGroup>;
  /** `true` importa también lo que el remitente dejó apagado. */
  includeHiddenLayers: boolean;
  unsupported: Set<string>;
  skipped: Set<string>;
  depth: number;
}

/**
 * Interpreta un flujo de contenido con sus recursos.
 *
 * Se llama recursivamente para los XObject de formulario, con `depth` como
 * único freno: un formulario que se dibuja a sí mismo existe en archivos
 * generados por herramientas rotas y colgaría el importador.
 */
function run(
  interpreter: Interpreter,
  content: Uint8Array,
  resources: CadPdfValue,
  baseCtm: CadPdfMatrix,
): void {
  if (interpreter.depth > 12) {
    interpreter.unsupported.add("un XObject anidado más allá del límite no se expandió");
    return;
  }
  const { objects, scan } = interpreter;
  const fonts = readCadPdfFonts(objects, resources);
  const lexer = new CadPdfLexer(content, 0);

  let state = initialState(baseCtm);
  const stack: GraphicsState[] = [];
  const operands: CadPdfValue[] = [];

  let subpaths: CadPdfSubpath[] = [];
  let current: CadPdfSubpath | null = null;
  let cursor: CadPdfPoint = { x: 0, y: 0 };
  let subpathStart: CadPdfPoint = { x: 0, y: 0 };
  /** Modelo de espacio de color activo, para saber cuántos operandos consume `sc`. */
  let strokeComponents = 1;
  let fillComponents = 1;

  // Capas opcionales: una pila, porque `BDC` anida. `null` significa «ninguna».
  const markedStack: Array<string | null> = [];
  const activeLayer = (): string | null => {
    for (let index = markedStack.length - 1; index >= 0; index -= 1)
      if (markedStack[index] !== null) return markedStack[index];
    return null;
  };
  /** Cuántos `BDC` abiertos pertenecen a una capa APAGADA. */
  let hiddenDepth = 0;

  let textMatrix: CadPdfMatrix = CAD_PDF_IDENTITY;
  let lineMatrix: CadPdfMatrix = CAD_PDF_IDENTITY;

  const number = (index: number, fallback = 0): number => {
    const value = operands[operands.length - index];
    return value?.kind === "number" ? value.value : fallback;
  };

  const transformed = (x: number, y: number) => cadPdfApply(state.ctm, x, y);

  /**
   * Guarda el subcamino en curso y lo suelta.
   *
   * Está aquí, y no repetido en cada operador, porque «terminar un subcamino»
   * es una sola operación con tres disparadores —`h`, `re` y cualquier operador
   * de pintado— y escribirla tres veces garantizaba que una de las tres se
   * quedase sin el `current = null` y arrastrase vértices al camino siguiente.
   */
  const flushCurrent = () => {
    if (current && current.segments.length) subpaths.push(current);
    current = null;
  };

  /** Marca como cerrado el subcamino en curso (`h`, `s`, `b`). */
  const closeCurrent = () => {
    if (current && current.segments.length) current.closed = true;
  };

  const beginSubpath = (x: number, y: number) => {
    if (current && current.segments.length) subpaths.push(current);
    cursor = { x, y };
    subpathStart = cursor;
    current = { start: transformed(x, y), segments: [], closed: false };
  };

  const lineTo = (x: number, y: number) => {
    if (!current) beginSubpath(cursor.x, cursor.y);
    current!.segments.push({ type: "line", to: transformed(x, y) });
    cursor = { x, y };
  };

  const curveTo = (
    c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number,
  ) => {
    if (!current) beginSubpath(cursor.x, cursor.y);
    current!.segments.push({
      type: "curve",
      c1: transformed(c1x, c1y),
      c2: transformed(c2x, c2y),
      to: transformed(x, y),
    });
    cursor = { x, y };
  };

  const paint = (stroke: boolean, fill: boolean) => {
    flushCurrent();
    if (subpaths.length && (stroke || fill) && hiddenDepth === 0) {
      if (scan.paths.length < MAX_PATHS)
        scan.paths.push({
          subpaths,
          stroke,
          fill,
          lineWidthPt: state.lineWidth * cadPdfScaleOf(state.ctm),
          color: stroke ? state.strokeColor : state.fillColor,
          layerName: activeLayer(),
        });
      else interpreter.unsupported.add("el PDF supera el límite de trazos y se recortó");
    }
    subpaths = [];
  };

  /** Nombre de la capa de un `/OC /MC0 BDC`, y si está encendida. */
  const markedLayer = (tag: string, property: CadPdfValue | undefined): { name: string | null; visible: boolean } => {
    if (tag !== "OC" || !property) return { name: null, visible: true };
    let group: CadPdfOptionalGroup | undefined;
    if (property.kind === "name") {
      const properties = objects.entry(resources, "Properties");
      const entry = properties.kind === "dict" ? properties.entries.get(property.name) : undefined;
      if (entry?.kind === "ref") group = interpreter.groupsByRef.get(entry.num);
    } else if (property.kind === "ref") group = interpreter.groupsByRef.get(property.num);
    if (!group) return { name: null, visible: true };
    return { name: group.name, visible: group.visible };
  };

  const drawXObject = (name: string) => {
    const xobjects = objects.entry(resources, "XObject");
    if (xobjects.kind !== "dict") return;
    const xobject = objects.resolve(xobjects.entries.get(name));
    if (xobject.kind !== "stream") return;
    const subtype = objects.name(xobject, "Subtype");

    if (subtype === "Image") {
      if (hiddenDepth === 0)
        scan.images.push({
          name,
          widthPx: objects.number(xobject, "Width", 0),
          heightPx: objects.number(xobject, "Height", 0),
          placement: state.ctm,
          layerName: activeLayer(),
          inline: false,
        });
      return;
    }
    if (subtype !== "Form") {
      interpreter.unsupported.add(`un XObject de tipo ${subtype || "desconocido"} no se dibujó`);
      return;
    }
    const { data, unreadable } = objects.streamData(xobject);
    if (unreadable) {
      interpreter.unsupported.add(`un bloque reutilizado no se pudo leer: ${unreadable}`);
      return;
    }
    // La `/Matrix` del formulario se compone ANTES de la actual: es la
    // transformada propia del bloque, igual que la de un INSERT.
    const own = objects.entry(xobject, "Matrix");
    const matrix: CadPdfMatrix =
      own.kind === "array" && own.items.length >= 6
        ? (own.items.slice(0, 6).map((item) => {
            const value = objects.resolve(item);
            return value.kind === "number" ? value.value : 0;
          }) as unknown as CadPdfMatrix)
        : CAD_PDF_IDENTITY;
    const nested = objects.entry(xobject, "Resources");
    run(
      { ...interpreter, depth: interpreter.depth + 1 },
      data,
      nested.kind === "dict" ? nested : resources,
      cadPdfMultiply(matrix, state.ctm),
    );
  };

  const showText = (bytes: Uint8Array) => {
    const decoded = decodeCadPdfString(bytes, state.font);
    const full = cadPdfMultiply(textMatrix, state.ctm);
    const origin = cadPdfApply(full, 0, state.rise);
    // El avance del cursor de texto necesitaría las anchuras de cada glifo, que
    // viven en `/Widths`. Se aproxima con medio cuerpo por carácter: sirve para
    // COLOCAR el siguiente rótulo, no para medirlo, y no se usa para nada que
    // acabe siendo geometría.
    const advance =
      (decoded.codes.length * state.fontSize * 0.5 +
        decoded.codes.length * state.charSpacing) *
      state.horizontalScale;
    textMatrix = cadPdfMultiply([1, 0, 0, 1, advance, 0], textMatrix);

    if (hiddenDepth !== 0) return;
    const text = decoded.text.trim();
    if (!text && !decoded.glyphIndices) return;
    if (decoded.codes.length === 0) return;
    scan.texts.push({
      text,
      origin,
      heightPt: Math.abs(state.fontSize) * cadPdfScaleOf(full),
      rotation: Math.atan2(full[1], full[0]),
      fontRef: state.fontRef,
      baseFont: state.font?.baseFont ?? "",
      glyphIndices: decoded.glyphIndices,
      renderMode: state.renderMode,
      layerName: activeLayer(),
      fontSource: state.font?.source ?? "unknown",
    });
  };

  /** `BI … ID <binario> EI`. Se SALTA con cuidado: el binario no son operadores. */
  const skipInlineImage = () => {
    const entries = new Map<string, CadPdfValue>();
    for (;;) {
      if (lexer.position >= content.length) return;
      const before = lexer.position;
      if (lexer.atValue()) {
        const key = lexer.parseValue();
        const value = lexer.parseValue();
        if (key?.kind === "name" && value) entries.set(key.name, value);
        if (lexer.position === before) lexer.position += 1;
        continue;
      }
      const word = lexer.readOperator();
      if (word === "ID" || word === "") break;
      if (word === "EI") return;
      if (lexer.position === before) lexer.position += 1;
    }
    lexer.position += 1; // el separador tras `ID`
    // Se busca `EI` precedido de espacio y seguido de espacio o fin. El binario
    // puede contener los bytes `E` `I` por casualidad, y cortar ahí dejaría el
    // resto de la página leyéndose como operadores basura.
    while (lexer.position + 1 < content.length) {
      if (
        content[lexer.position] === 0x45 &&
        content[lexer.position + 1] === 0x49 &&
        (lexer.position === 0 || content[lexer.position - 1] <= 0x20) &&
        (lexer.position + 2 >= content.length || content[lexer.position + 2] <= 0x20)
      ) {
        lexer.position += 2;
        break;
      }
      lexer.position += 1;
    }
    const width = entries.get("W") ?? entries.get("Width");
    const height = entries.get("H") ?? entries.get("Height");
    if (hiddenDepth === 0)
      scan.images.push({
        name: "(imagen en línea)",
        widthPx: width?.kind === "number" ? width.value : 0,
        heightPx: height?.kind === "number" ? height.value : 0,
        placement: state.ctm,
        layerName: activeLayer(),
        inline: true,
      });
  };

  while (lexer.position < content.length) {
    const before = lexer.position;
    if (lexer.atValue()) {
      const value = lexer.parseValue();
      if (value) operands.push(value);
      if (operands.length > 64) operands.splice(0, operands.length - 64);
      if (lexer.position === before) lexer.position += 1;
      continue;
    }
    const operator = lexer.readOperator();
    if (operator === "") break;
    scan.operators += 1;

    switch (operator) {
      case "q":
        stack.push({ ...state });
        break;
      case "Q":
        state = stack.pop() ?? state;
        break;
      case "cm":
        state.ctm = cadPdfMultiply(
          [number(6), number(5), number(4), number(3), number(2), number(1)],
          state.ctm,
        );
        break;
      case "w":
        state.lineWidth = number(1, state.lineWidth);
        break;

      case "m":
        beginSubpath(number(2), number(1));
        break;
      case "l":
        lineTo(number(2), number(1));
        break;
      case "c":
        curveTo(number(6), number(5), number(4), number(3), number(2), number(1));
        break;
      case "v":
        // El primer punto de control ES el punto actual.
        curveTo(cursor.x, cursor.y, number(4), number(3), number(2), number(1));
        break;
      case "y":
        // El segundo punto de control es el punto FINAL.
        curveTo(number(4), number(3), number(2), number(1), number(2), number(1));
        break;
      case "h":
        closeCurrent();
        flushCurrent();
        cursor = subpathStart;
        break;
      case "re": {
        const x = number(4);
        const y = number(3);
        const width = number(2);
        const height = number(1);
        flushCurrent();
        subpaths.push({
          start: transformed(x, y),
          segments: [
            { type: "line", to: transformed(x + width, y) },
            { type: "line", to: transformed(x + width, y + height) },
            { type: "line", to: transformed(x, y + height) },
          ],
          closed: true,
        });
        cursor = { x, y };
        subpathStart = cursor;
        break;
      }

      case "S": paint(true, false); break;
      case "s":
        closeCurrent();
        paint(true, false);
        break;
      case "f": case "F": case "f*": paint(false, true); break;
      case "B": case "B*": paint(true, true); break;
      case "b": case "b*":
        closeCurrent();
        paint(true, true);
        break;
      case "n": paint(false, false); break;
      case "W": case "W*":
        // El recorte se DECLARA y no se aplica: recortar de verdad exigiría
        // intersectar cada trazo con el contorno, y un recorte mal aplicado
        // borraría geometría que sí está en el papel. Sobra dibujo, no falta.
        interpreter.unsupported.add(
          "hay un recorte (`W`) que no se aplica: puede entrar geometría que en el PDF quedaba fuera del recorte",
        );
        break;

      case "g": state.fillColor = rgb(number(1), number(1), number(1)); fillComponents = 1; break;
      case "G": state.strokeColor = rgb(number(1), number(1), number(1)); strokeComponents = 1; break;
      case "rg": state.fillColor = rgb(number(3), number(2), number(1)); fillComponents = 3; break;
      case "RG": state.strokeColor = rgb(number(3), number(2), number(1)); strokeComponents = 3; break;
      case "k": state.fillColor = cmyk(number(4), number(3), number(2), number(1)); fillComponents = 4; break;
      case "K": state.strokeColor = cmyk(number(4), number(3), number(2), number(1)); strokeComponents = 4; break;
      case "cs": case "CS": {
        const name = operands[operands.length - 1];
        const space = name?.kind === "name" ? name.name : "";
        const components = space === "DeviceCMYK" ? 4 : space === "DeviceGray" ? 1 : 3;
        if (operator === "cs") fillComponents = components;
        else strokeComponents = components;
        break;
      }
      case "sc": case "scn": case "SC": case "SCN": {
        const components = operator.startsWith("s") ? fillComponents : strokeComponents;
        const color =
          components === 4
            ? cmyk(number(4), number(3), number(2), number(1))
            : components === 1
              ? rgb(number(1), number(1), number(1))
              : rgb(number(3), number(2), number(1));
        // Un `scn` con nombre es un PATRÓN: no hay color que sacar y usar el
        // último número apilado pintaría de negro algo que era un tramado.
        if (operands[operands.length - 1]?.kind === "name")
          interpreter.unsupported.add("hay relleno de patrón, que entra como contorno sin trama");
        else if (operator.startsWith("s")) state.fillColor = color;
        else state.strokeColor = color;
        break;
      }

      case "BT":
        textMatrix = CAD_PDF_IDENTITY;
        lineMatrix = CAD_PDF_IDENTITY;
        break;
      case "ET":
        break;
      case "Tf": {
        const name = operands[operands.length - 2];
        state.fontRef = name?.kind === "name" ? name.name : state.fontRef;
        state.font = fonts.get(state.fontRef) ?? null;
        state.fontSize = number(1, state.fontSize);
        break;
      }
      case "Td":
        lineMatrix = cadPdfMultiply([1, 0, 0, 1, number(2), number(1)], lineMatrix);
        textMatrix = lineMatrix;
        break;
      case "TD":
        state.leading = -number(1);
        lineMatrix = cadPdfMultiply([1, 0, 0, 1, number(2), number(1)], lineMatrix);
        textMatrix = lineMatrix;
        break;
      case "Tm":
        lineMatrix = [number(6), number(5), number(4), number(3), number(2), number(1)];
        textMatrix = lineMatrix;
        break;
      case "T*":
        lineMatrix = cadPdfMultiply([1, 0, 0, 1, 0, -state.leading], lineMatrix);
        textMatrix = lineMatrix;
        break;
      case "TL": state.leading = number(1); break;
      case "Tc": state.charSpacing = number(1); break;
      case "Tw": state.wordSpacing = number(1); break;
      case "Tz": state.horizontalScale = number(1, 100) / 100; break;
      case "Ts": state.rise = number(1); break;
      case "Tr": state.renderMode = Math.round(number(1)); break;
      case "Tj": case "'": case '"': {
        if (operator !== "Tj") {
          lineMatrix = cadPdfMultiply([1, 0, 0, 1, 0, -state.leading], lineMatrix);
          textMatrix = lineMatrix;
        }
        const value = operands[operands.length - 1];
        if (value?.kind === "string") showText(value.bytes);
        break;
      }
      case "TJ": {
        const array = operands[operands.length - 1];
        if (array?.kind !== "array") break;
        for (const item of array.items) {
          if (item.kind === "string") showText(item.bytes);
          else if (item.kind === "number")
            // Los números del `TJ` son ajustes en milésimas de cuerpo, con signo
            // invertido. Sin aplicarlos, un rótulo con kerning se apelotona.
            textMatrix = cadPdfMultiply(
              [1, 0, 0, 1, (-item.value / 1000) * state.fontSize * state.horizontalScale, 0],
              textMatrix,
            );
        }
        break;
      }

      case "Do": {
        const name = operands[operands.length - 1];
        if (name?.kind === "name") drawXObject(name.name);
        break;
      }
      case "BI":
        skipInlineImage();
        break;
      case "sh":
        interpreter.unsupported.add("hay un degradado (`sh`), que no tiene equivalente en el dibujo");
        break;
      case "BDC": case "BMC": {
        const tagValue = operands[operands.length - 2];
        const tag = tagValue?.kind === "name" ? tagValue.name : "";
        const { name, visible } = markedLayer(tag, operands[operands.length - 1]);
        markedStack.push(name);
        if (name && !visible) {
          if (interpreter.includeHiddenLayers) interpreter.skipped.add(`${name} (importada aun estando apagada)`);
          else {
            hiddenDepth += 1;
            interpreter.skipped.add(name);
          }
        } else if (hiddenDepth > 0) hiddenDepth += 1;
        break;
      }
      case "EMC":
        markedStack.pop();
        if (hiddenDepth > 0) hiddenDepth -= 1;
        break;
      case "gs": {
        // El estado gráfico extendido trae transparencia y máscaras suaves. La
        // geometría no cambia; lo que se pierde es el aspecto, y se declara.
        const name = operands[operands.length - 1];
        const graphics = objects.entry(resources, "ExtGState");
        const entry = name?.kind === "name" && graphics.kind === "dict"
          ? objects.resolve(graphics.entries.get(name.name))
          : null;
        if (entry && entry.kind === "dict") {
          const alpha = objects.number(entry, "ca", 1);
          if (alpha < 1)
            interpreter.unsupported.add("hay relleno con transparencia, que entra opaco");
          if (objects.entry(entry, "SMask").kind === "dict")
            interpreter.unsupported.add("hay una máscara suave, que no se reproduce");
        }
        break;
      }
      default:
        break;
    }
    if (!["BI"].includes(operator)) operands.length = 0;
    if (lexer.position === before) lexer.position += 1;
  }

  // Un flujo que termina con un camino sin pintar no dibuja nada, pero tampoco
  // puede quedarse a medias en el estado: se descarta explícitamente.
  flushCurrent();
  void lineMatrix;
}

export interface CadPdfContentOptions {
  /** Importar también la geometría de las capas apagadas en el PDF. */
  includeHiddenLayers?: boolean;
}

/** Interpreta el contenido de UNA página. */
export function scanCadPdfContent(
  objects: CadPdfObjects,
  page: CadPdfPage,
  optionalGroups: readonly CadPdfOptionalGroup[],
  options: CadPdfContentOptions = {},
): CadPdfContentScan {
  const scan: CadPdfContentScan = {
    paths: [],
    texts: [],
    images: [],
    unsupported: [],
    skippedLayers: [],
    operators: 0,
  };
  const interpreter: Interpreter = {
    objects,
    scan,
    groupsByRef: new Map(optionalGroups.map((group) => [group.ref, group])),
    includeHiddenLayers: options.includeHiddenLayers === true,
    unsupported: new Set(page.unreadable),
    skipped: new Set(),
    depth: 0,
  };
  run(interpreter, page.content, page.resources, CAD_PDF_IDENTITY);
  scan.unsupported = [...interpreter.unsupported];
  scan.skippedLayers = [...interpreter.skipped];
  return scan;
}
