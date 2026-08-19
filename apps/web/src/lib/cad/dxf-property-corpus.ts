/**
 * Corpus de PROPIEDADES: los ficheros con los que se mide qué se pierde de un
 * DXF ajeno cuando lo que viaja no es la geometría, sino cómo se dibuja.
 *
 * ## Por qué hace falta otro corpus
 *
 * El corpus de dialectos ajenos mide TIPOS DE ENTIDAD: cuántos ARC entraron,
 * cuántos HATCH sobrevivieron. Esa pregunta ya está contestada. La que no lo
 * estaba es la otra mitad de un plano: un LINE que entra como LINE, en su sitio
 * y con su capa, y que aun así llega MAL porque era el eje a trazos del pórtico
 * y aterriza continuo, o porque era el muro de carga a 0,50 mm y se imprime del
 * mismo grosor que una directriz auxiliar. La entidad está; el plano, no.
 *
 * Contar entidades no descubre eso: los recuentos salen perfectos. Por eso este
 * corpus no declara tipos sino SONDAS —una propiedad, un objetivo concreto y el
 * valor que el fichero DICE que tiene—, y la matriz compara sonda a sonda.
 *
 * ## La misma limitación, dicha otra vez
 *
 * SINTÉTICO. Estos ficheros están escritos aquí imitando lo que emiten otras
 * herramientas; no son capturas de despachos reales. Imitar un dialecto no es
 * haberlo recibido, y el artefacto que sale de aquí lleva la limitación dentro
 * para que nadie lea «compatibilidad» donde sólo hay «lo que supimos imaginar».
 *
 * ## Qué cubre y por qué esos tres huecos
 *
 * 1. LTYPE — la tabla de patrones, el tipo de línea de la capa y el de la
 *    entidad, con BYLAYER explícito e implícito.
 * 2. LTSCALE — la escala global del dibujo y la escala por entidad (código 48),
 *    que se MULTIPLICAN. Una sola de las dos no basta para dibujar el guion.
 * 3. Lineweight — la enumeración fija de AutoCAD en centésimas de milímetro,
 *    con sus tres valores negativos (BYLAYER, BYBLOCK, DEFAULT).
 * 4. BYBLOCK — el caso que sólo se ve dentro de un bloque: la entidad hereda
 *    del INSERT, no de su capa.
 * 5. Cotas ajenas — DIMENSION de otro CAD con su bloque `*D` ya generado y sin
 *    XDATA nuestra: si entra como líneas sueltas deja de recalcularse.
 *
 * Módulo puro: sólo devuelve cadenas y descripciones.
 */

/** Ámbito de una sonda. Dice DÓNDE hay que ir a buscar el valor medido. */
export type CadDxfPropertyKind =
  /** Variable de cabecera del dibujo entero ($LTSCALE). */
  | "documento.ltscale"
  /** Patrón de un LTYPE de la tabla, serializado «12.7,-6.35». */
  | "tabla.ltype.patron"
  /** Tipo de línea declarado por una capa (código 6 del LAYER). */
  | "capa.linetype"
  /**
   * Grosor declarado por una capa, en MILÍMETROS: es la unidad de
   * `CadLayerDef.lineweight` desde que existe la paleta de capas, y −1 es su
   * «por defecto». El fichero lo trae en centésimas y la frontera se cruza al
   * importar. Las sondas `efectivo.*` sí van en centésimas, que es la unidad
   * del formato y la del resto del documento.
   */
  | "capa.lineweight"
  /** Valor del tipo de línea de una entidad (código 6). */
  | "entidad.linetype.valor"
  /** Origen del tipo de línea: `byLayer`, `byBlock` o `explicit`. */
  | "entidad.linetype.origen"
  /** Escala de tipo de línea propia de la entidad (código 48). */
  | "entidad.linetype.escala"
  /** Grosor de la entidad en centésimas de mm (código 370). */
  | "entidad.lineweight.valor"
  /** Origen del grosor. */
  | "entidad.lineweight.origen"
  /** Lo que RESULTA de resolver BYLAYER/BYBLOCK/DEFAULT: el tipo de línea. */
  | "efectivo.linetype"
  /** Ídem para el grosor, ya resuelto a centésimas de mm. */
  | "efectivo.lineweight"
  /** Ídem para la escala del guion: LTSCALE global × escala de entidad. */
  | "efectivo.escala"
  /** Medio grosor en píxeles que el visor mete en el lote instanciado. */
  | "visor.medioGrosorPx"
  /** Ranura de patrón que el visor manda al shader. 0 es continua. */
  | "visor.linetypeIndex"
  /** ¿Hay una entidad de cota en el documento? 1 sí, 0 no. */
  | "cota.presente"
  /** Punto medido A de la cota, serializado «x,y». */
  | "cota.a"
  /** Punto medido B de la cota. */
  | "cota.b"
  /** Medida que declara la cota (código 42). */
  | "cota.medida"
  /** Familia de la cota resuelta desde el código 70. */
  | "cota.tipo"
  /** Nombre del estilo de acotación (código 3). */
  | "cota.estilo";

export interface CadDxfPropertyProbe {
  /** Clave estable. Es la fila de la matriz y no debe cambiar de nombre. */
  id: string;
  kind: CadDxfPropertyKind;
  /**
   * A quién se le pregunta. Para las sondas de capa y de entidad es el NOMBRE
   * DE CAPA: cada entidad sonda vive en su propia capa justamente para que
   * localizarla no dependa de un índice frágil. Vacío cuando la sonda es del
   * documento entero.
   */
  target: string;
  /** Lo que el FICHERO dice. Es la verdad contra la que se mide, no un deseo. */
  expected: string | number;
  /** Qué pierde el arquitecto si no llega. Una frase, en español llano. */
  matters: string;
}

export interface CadDxfPropertyCase {
  id: string;
  dialect: string;
  purpose: string;
  content: string;
  probes: readonly CadDxfPropertyProbe[];
}

export const CAD_DXF_PROPERTY_LIMITATION =
  "Corpus SINTÉTICO: los ficheros imitan lo que emiten otras herramientas, no son capturas de " +
  "despachos reales. Mide lo que supimos imaginar, no cobertura del mundo.";

type Pair = readonly [number | string, string | number];

/**
 * Serializa pares al DXF de texto. Con relleno de tres en el código y finales
 * de línea de Windows en un fichero del corpus, porque así llegan de fuera y un
 * lector que compare la línea cruda con `===` se los come.
 */
function serialize(pairs: readonly Pair[], eol: "\n" | "\r\n" = "\n", pad = false): string {
  const lines: string[] = [];
  for (const [code, value] of pairs) {
    lines.push(pad ? String(code).padStart(6, " ") : String(code));
    lines.push(String(value));
  }
  return lines.join(eol) + eol;
}

const section = (name: string, body: readonly Pair[]): Pair[] => [
  [0, "SECTION"],
  [2, name],
  ...body,
  [0, "ENDSEC"],
];

const EOF: Pair[] = [[0, "EOF"]];

const line = (layer: string, x1: number, y1: number, x2: number, y2: number, extra: readonly Pair[] = []): Pair[] => [
  [0, "LINE"],
  [8, layer],
  ...extra,
  [10, x1], [20, y1], [30, 0],
  [11, x2], [21, y2], [31, 0],
];

/** Cabecera con las variables que se quieran declarar. */
const header = (acadver: string, vars: readonly Pair[] = []): Pair[] =>
  section("HEADER", [
    [9, "$ACADVER"], [1, acadver],
    [9, "$INSUNITS"], [70, 4],
    ...vars,
  ]);

/**
 * Tabla LTYPE con los dos patrones que trae cualquier plano de arquitectura.
 * Los `49` son las longitudes con signo; `73` cuántas hay y `40` la longitud
 * total del patrón, que es lo que AutoCAD usa para repetirlo.
 */
const LTYPE_TABLE: Pair[] = [
  [0, "TABLE"], [2, "LTYPE"], [70, 3],
  [0, "LTYPE"], [2, "CONTINUOUS"], [70, 0], [3, "Solida"], [72, 65], [73, 0], [40, 0],
  [0, "LTYPE"], [2, "CENTER"], [70, 0], [3, "Eje ____ _ ____"], [72, 65], [73, 4], [40, 50.8],
  [49, 31.75], [49, -6.35], [49, 6.35], [49, -6.35],
  [0, "LTYPE"], [2, "DASHED"], [70, 0], [3, "Trazos __ __ __"], [72, 65], [73, 2], [40, 19.05],
  [49, 12.7], [49, -6.35],
  [0, "ENDTAB"],
];

/** 1 — LTYPE: la tabla, el tipo de la capa y el de la entidad. */
function linetypeTableAndEntities(): CadDxfPropertyCase {
  return {
    id: "prop-ltype-capa-entidad",
    dialect: "AC1015, tabla LTYPE + código 6 en capa y en entidad",
    purpose:
      "El eje del pórtico es CENTER por su capa; el muro punteado lleva DASHED puesto a mano sobre la " +
      "entidad; la línea auxiliar dice BYLAYER de forma explícita. Los tres se dibujan distinto y los " +
      "tres son un LINE: contar entidades no distingue ninguno.",
    content: serialize([
      ...header("AC1015"),
      ...section("TABLES", [
        ...LTYPE_TABLE,
        [0, "TABLE"], [2, "LAYER"], [70, 3],
        [0, "LAYER"], [2, "EJES"], [70, 0], [62, 1], [6, "CENTER"], [370, 9],
        [0, "LAYER"], [2, "MUROS-CARGA"], [70, 0], [62, 7], [6, "CONTINUOUS"], [370, 50],
        [0, "LAYER"], [2, "AUXILIAR"], [70, 0], [62, 8], [6, "DASHED"], [370, 13],
        [0, "ENDTAB"],
      ]),
      ...section("ENTITIES", [
        // Sin código 6: BYLAYER implícito, que es el caso mayoritario real.
        ...line("EJES", 3000, -500, 3000, 3500),
        ...line("MUROS-CARGA", 0, 0, 6000, 0, [[6, "DASHED"]]),
        // BYLAYER escrito a mano: el mismo resultado por otro camino.
        ...line("AUXILIAR", 0, 2000, 6000, 2000, [[6, "BYLAYER"]]),
      ]),
      ...EOF,
    ]),
    probes: [
      { id: "ltype-patron-center", kind: "tabla.ltype.patron", target: "CENTER", expected: "31.75,-6.35,6.35,-6.35",
        matters: "Sin el patrón, el eje se dibuja continuo y deja de leerse como eje." },
      { id: "ltype-patron-dashed", kind: "tabla.ltype.patron", target: "DASHED", expected: "12.7,-6.35",
        matters: "Sin el patrón, el trazo discontinuo del despacho remitente desaparece." },
      { id: "ltype-capa-ejes", kind: "capa.linetype", target: "EJES", expected: "CENTER",
        matters: "La capa es donde un despacho pone la convención: perderla la pierde para todo el plano." },
      { id: "ltype-capa-muros", kind: "capa.linetype", target: "MUROS-CARGA", expected: "CONTINUOUS",
        matters: "Una capa continua que se importa como otra cosa ensucia el plano entero." },
      { id: "ltype-capa-auxiliar", kind: "capa.linetype", target: "AUXILIAR", expected: "DASHED",
        matters: "El auxiliar a trazos es lo que distingue una referencia de una línea de obra." },
      { id: "ltype-entidad-origen-ejes", kind: "entidad.linetype.origen", target: "EJES", expected: "byLayer",
        matters: "Si el origen no se guarda, cambiar la capa deja de repintar la entidad." },
      { id: "ltype-entidad-valor-muros", kind: "entidad.linetype.valor", target: "MUROS-CARGA", expected: "DASHED",
        matters: "El tipo puesto a mano sobre la entidad es una decisión del dibujante, no un default." },
      { id: "ltype-entidad-origen-muros", kind: "entidad.linetype.origen", target: "MUROS-CARGA", expected: "explicit",
        matters: "Sin el origen explícito, el valor se confunde con heredado y se pierde al reasignar capa." },
      { id: "ltype-entidad-origen-auxiliar", kind: "entidad.linetype.origen", target: "AUXILIAR", expected: "byLayer",
        matters: "BYLAYER escrito a mano tiene que llegar como herencia, no como el literal «BYLAYER»." },
      { id: "ltype-efectivo-ejes", kind: "efectivo.linetype", target: "EJES", expected: "CENTER",
        matters: "Es lo que hay que dibujar: la herencia ya resuelta." },
      { id: "ltype-efectivo-muros", kind: "efectivo.linetype", target: "MUROS-CARGA", expected: "DASHED",
        matters: "Lo explícito gana a la capa; al revés el muro sale continuo." },
      { id: "ltype-efectivo-auxiliar", kind: "efectivo.linetype", target: "AUXILIAR", expected: "DASHED",
        matters: "BYLAYER explícito resuelve a lo que diga la capa." },
      { id: "ltype-visor-ejes", kind: "visor.linetypeIndex", target: "EJES", expected: 1,
        matters: "Si el visor manda la ranura 0, el eje se ve continuo por mucho que el documento lo sepa." },
    ],
  };
}

/** 2 — LTSCALE: la escala global y la de la entidad, que se multiplican. */
function linetypeScales(): CadDxfPropertyCase {
  return {
    id: "prop-ltscale-global-y-entidad",
    dialect: "AC1021, $LTSCALE + código 48, finales de línea de Windows",
    purpose:
      "Un plano a escala 1:50 lleva $LTSCALE 25 para que el guion se vea; una entidad concreta lo " +
      "corrige a la mitad con el código 48. Las dos escalas se MULTIPLICAN, y quedarse con una sola " +
      "produce guiones del tamaño equivocado, que es indistinguible de un patrón mal leído.",
    content: serialize(
      [
        ...header("AC1021", [
          [9, "$LTSCALE"], [40, 25],
          [9, "$LWDISPLAY"], [290, 1],
        ]),
        ...section("TABLES", [
          ...LTYPE_TABLE,
          [0, "TABLE"], [2, "LAYER"], [70, 2],
          [0, "LAYER"], [2, "GLOBAL"], [70, 0], [62, 7], [6, "DASHED"], [370, -3],
          [0, "LAYER"], [2, "ESCALADA"], [70, 0], [62, 7], [6, "DASHED"], [370, -3],
          [0, "ENDTAB"],
        ]),
        ...section("ENTITIES", [
          ...line("GLOBAL", 0, 0, 4000, 0),
          ...line("ESCALADA", 0, 1000, 4000, 1000, [[48, 0.5]]),
        ]),
        ...EOF,
      ],
      "\r\n",
      true,
    ),
    probes: [
      { id: "ltscale-documento", kind: "documento.ltscale", target: "", expected: 25,
        matters: "Es la escala del dibujo entero: sin ella todos los guiones salen 25 veces más cortos." },
      { id: "ltscale-entidad", kind: "entidad.linetype.escala", target: "ESCALADA", expected: 0.5,
        matters: "La corrección por entidad es lo que un dibujante usa para que un detalle se lea." },
      { id: "ltscale-efectiva-global", kind: "efectivo.escala", target: "GLOBAL", expected: 25,
        matters: "Sin escala efectiva no hay forma de dibujar el guion a su tamaño." },
      { id: "ltscale-efectiva-entidad", kind: "efectivo.escala", target: "ESCALADA", expected: 12.5,
        matters: "25 × 0,5. Quedarse con cualquiera de los dos factores da un guion equivocado." },
    ],
  };
}

/** 3 — Lineweight: la enumeración fija y sus tres negativos. */
function lineweightEnumeration(): CadDxfPropertyCase {
  return {
    id: "prop-lineweight-enumeracion",
    dialect: "AC1018, código 370 en capa y entidad con BYLAYER y DEFAULT",
    purpose:
      "El grosor en DXF no es un número libre: es una enumeración en centésimas de milímetro con tres " +
      "negativos con significado (-1 BYLAYER, -2 BYBLOCK, -3 DEFAULT). Es lo que distingue al imprimir " +
      "un muro de carga de una línea de referencia, y es exactamente lo que un municipio mira.",
    content: serialize([
      ...header("AC1018", [[9, "$LWDISPLAY"], [290, 1]]),
      ...section("TABLES", [
        ...LTYPE_TABLE,
        [0, "TABLE"], [2, "LAYER"], [70, 4],
        [0, "LAYER"], [2, "MUROS"], [70, 0], [62, 7], [6, "CONTINUOUS"], [370, 50],
        [0, "LAYER"], [2, "EJES"], [70, 0], [62, 1], [6, "CENTER"], [370, 13],
        [0, "LAYER"], [2, "REMARCADO"], [70, 0], [62, 2], [6, "CONTINUOUS"], [370, -3],
        [0, "LAYER"], [2, "CAJETIN"], [70, 0], [62, 7], [6, "CONTINUOUS"], [370, -3],
        [0, "ENDTAB"],
      ]),
      ...section("ENTITIES", [
        // Sin 370: hereda de la capa (50 = 0,50 mm).
        ...line("MUROS", 0, 0, 6000, 0),
        // -1 = BYLAYER escrito a mano: mismo resultado por otro camino.
        ...line("EJES", 3000, -500, 3000, 3500, [[370, -1]]),
        // 211 = 2,11 mm: el máximo de la enumeración.
        ...line("REMARCADO", 0, 500, 6000, 500, [[370, 211]]),
        // -3 heredado: DEFAULT, que NO es cero ni un grosor concreto.
        ...line("CAJETIN", 0, -1000, 6000, -1000),
      ]),
      ...EOF,
    ]),
    probes: [
      { id: "lw-capa-muros", kind: "capa.lineweight", target: "MUROS", expected: 0.5,
        matters: "0,50 mm es el grosor con el que se imprime un muro de carga." },
      { id: "lw-capa-ejes", kind: "capa.lineweight", target: "EJES", expected: 0.13,
        matters: "0,13 mm es el trazo fino: si sube, el eje compite con el muro." },
      { id: "lw-capa-cajetin", kind: "capa.lineweight", target: "CAJETIN", expected: -1,
        matters: "DEFAULT no es 0: es «lo que diga el trazador», y la paleta lo llama −1." },
      { id: "lw-entidad-origen-muros", kind: "entidad.lineweight.origen", target: "MUROS", expected: "byLayer",
        matters: "Sin el origen, mover la entidad de capa deja de cambiarle el grosor." },
      { id: "lw-entidad-origen-ejes", kind: "entidad.lineweight.origen", target: "EJES", expected: "byLayer",
        matters: "El -1 explícito tiene que llegar como herencia, no como el número -1." },
      { id: "lw-entidad-valor-remarcado", kind: "entidad.lineweight.valor", target: "REMARCADO", expected: 211,
        matters: "2,11 mm es el remarcado de sección: es el trazo más grueso que existe en el formato." },
      { id: "lw-entidad-origen-remarcado", kind: "entidad.lineweight.origen", target: "REMARCADO", expected: "explicit",
        matters: "Un grosor puesto a mano no puede confundirse con uno heredado." },
      { id: "lw-efectivo-muros", kind: "efectivo.lineweight", target: "MUROS", expected: 50,
        matters: "Es el número con el que se traza." },
      { id: "lw-efectivo-ejes", kind: "efectivo.lineweight", target: "EJES", expected: 13,
        matters: "BYLAYER resuelto contra su capa." },
      { id: "lw-efectivo-cajetin", kind: "efectivo.lineweight", target: "CAJETIN", expected: -3,
        matters: "DEFAULT se propaga como DEFAULT: inventarle un número es mentir sobre el plano." },
      { id: "lw-visor-remarcado", kind: "visor.medioGrosorPx", target: "REMARCADO", expected: 4.22,
        matters: "Si el visor dibuja 0,5 px, el remarcado se ve igual que una línea auxiliar en pantalla." },
      { id: "lw-visor-muros", kind: "visor.medioGrosorPx", target: "MUROS", expected: 1,
        matters: "0,50 mm son 1 px de medio grosor con la convención del lote instanciado." },
    ],
  };
}

/** 4 — BYBLOCK: la herencia que sólo existe dentro de un bloque. */
function byBlockInheritance(): CadDxfPropertyCase {
  return {
    id: "prop-byblock-en-bloque",
    dialect: "AC1024, BYBLOCK dentro de BLOCK con INSERT que impone tipo y grosor",
    purpose:
      "La geometría del bloque dice BYBLOCK (6=BYBLOCK, 370=-2): no hereda de su capa sino de LA " +
      "INSERCIÓN. Es como se hace un símbolo reutilizable que se dibuja distinto en cada plano, y " +
      "resolverlo contra la capa da el resultado equivocado sin que nada falle.",
    content: serialize([
      ...header("AC1024"),
      ...section("TABLES", [
        ...LTYPE_TABLE,
        [0, "TABLE"], [2, "LAYER"], [70, 1],
        [0, "LAYER"], [2, "SIMBOLOS"], [70, 0], [62, 7], [6, "CONTINUOUS"], [370, 25],
        [0, "ENDTAB"],
      ]),
      ...section("BLOCKS", [
        [0, "BLOCK"], [8, "SIMBOLOS"], [2, "MARCA-NIVEL"], [70, 0], [10, 0], [20, 0], [30, 0], [3, "MARCA-NIVEL"],
        ...line("SIMBOLOS", 0, 0, 500, 0, [[6, "BYBLOCK"], [370, -2]]),
        [0, "ENDBLK"],
      ]),
      ...section("ENTITIES", [
        [0, "INSERT"], [8, "SIMBOLOS"], [6, "DASHED"], [370, 50], [2, "MARCA-NIVEL"],
        [10, 1000], [20, 1000], [30, 0], [41, 1], [42, 1], [43, 1], [50, 0],
      ]),
      ...EOF,
    ]),
    probes: [
      { id: "byblock-origen-linetype", kind: "entidad.linetype.origen", target: "@bloque:MARCA-NIVEL", expected: "byBlock",
        matters: "Sin BYBLOCK, el símbolo se dibuja igual en todos los planos y deja de ser reutilizable." },
      { id: "byblock-origen-lineweight", kind: "entidad.lineweight.origen", target: "@bloque:MARCA-NIVEL", expected: "byBlock",
        matters: "-2 no es un grosor: es «pregúntale a la inserción»." },
      { id: "byblock-insercion-linetype", kind: "entidad.linetype.valor", target: "SIMBOLOS", expected: "DASHED",
        matters: "El INSERT es quien manda; si su código 6 se pierde, la herencia no tiene de dónde tirar." },
      { id: "byblock-insercion-lineweight", kind: "entidad.lineweight.valor", target: "SIMBOLOS", expected: 50,
        matters: "Ídem para el grosor de la inserción." },
      { id: "byblock-efectivo-linetype", kind: "efectivo.linetype", target: "@bloque:MARCA-NIVEL", expected: "DASHED",
        matters: "La resolución correcta: del INSERT, no de la capa SIMBOLOS (que es CONTINUOUS)." },
      { id: "byblock-efectivo-lineweight", kind: "efectivo.lineweight", target: "@bloque:MARCA-NIVEL", expected: 50,
        matters: "La capa dice 25 y la respuesta correcta es 50: resolver mal no falla, dibuja mal." },
    ],
  };
}

/** 5 — La cota ajena: DIMENSION de otro CAD con su bloque `*D` ya generado. */
function foreignAssociativeDimension(): CadDxfPropertyCase {
  const dimBlock: Pair[] = [
    [0, "BLOCK"], [8, "A-ANNO-DIMS"], [2, "*D1"], [70, 1], [10, 0], [20, 0], [30, 0], [3, "*D1"],
    ...line("A-ANNO-DIMS", 0, 0, 0, 900),
    ...line("A-ANNO-DIMS", 3200, 0, 3200, 900),
    ...line("A-ANNO-DIMS", 0, 800, 3200, 800),
    [0, "TEXT"], [8, "A-ANNO-DIMS"], [10, 1600], [20, 850], [30, 0], [40, 180], [1, "3200"],
    [0, "ENDBLK"],
  ];
  return {
    id: "prop-cota-asociativa-ajena",
    dialect: "AC1027, DIMENSION de otro CAD con bloque *D y sin XDATA nuestra",
    purpose:
      "Una cota que llega del estructurista: entidad DIMENSION con su estilo, su medida, sus DOS puntos " +
      "medidos (13/23 y 14/24) y el bloque anónimo *D1 con la geometría ya dibujada. Si entra como " +
      "líneas sueltas, el plano se ve idéntico y deja de medir: mover el muro ya no cambia el número.",
    content: serialize([
      ...header("AC1027"),
      ...section("TABLES", [
        ...LTYPE_TABLE,
        [0, "TABLE"], [2, "LAYER"], [70, 1],
        [0, "LAYER"], [2, "A-ANNO-DIMS"], [70, 0], [62, 3], [6, "CONTINUOUS"], [370, 13],
        [0, "ENDTAB"],
        [0, "TABLE"], [2, "DIMSTYLE"], [70, 1],
        [0, "DIMSTYLE"], [2, "ISO-25"], [70, 0], [271, 2],
        [0, "ENDTAB"],
      ]),
      ...section("BLOCKS", dimBlock),
      ...section("ENTITIES", [
        [0, "DIMENSION"], [8, "A-ANNO-DIMS"], [2, "*D1"],
        [10, 3200], [20, 800], [30, 0],
        [11, 1600], [21, 850], [31, 0],
        // 70 = 1 (alineada) + 32 (la geometría vive en el bloque referenciado).
        [70, 33],
        [1, ""], [3, "ISO-25"], [42, 3200],
        [13, 0], [23, 0], [33, 0],
        [14, 3200], [24, 0], [34, 0],
      ]),
      ...EOF,
    ]),
    probes: [
      { id: "cota-ajena-presente", kind: "cota.presente", target: "", expected: 1,
        matters: "Una cota que entra como seis líneas y un texto ya no es una cota: es un dibujo de una cota." },
      { id: "cota-ajena-a", kind: "cota.a", target: "", expected: "0,0",
        matters: "El primer punto medido. Sin él no hay nada que recalcular al mover el muro." },
      { id: "cota-ajena-b", kind: "cota.b", target: "", expected: "3200,0",
        matters: "El segundo punto medido." },
      { id: "cota-ajena-medida", kind: "cota.medida", target: "", expected: 3200,
        matters: "La medida que el remitente declaró: es la que el municipio compara." },
      { id: "cota-ajena-tipo", kind: "cota.tipo", target: "", expected: "aligned",
        matters: "El código 70 dice qué familia es; adivinarla cambia la geometría al regenerar." },
      { id: "cota-ajena-estilo", kind: "cota.estilo", target: "", expected: "ISO-25",
        matters: "El estilo es la convención del despacho remitente; perderlo cambia flechas y decimales." },
      { id: "cota-ajena-capa-lineweight", kind: "capa.lineweight", target: "A-ANNO-DIMS", expected: 0.13,
        matters: "La capa de cotas se imprime fina; con el grosor perdido tapa el dibujo." },
    ],
  };
}

export const CAD_DXF_PROPERTY_CORPUS: readonly CadDxfPropertyCase[] = [
  linetypeTableAndEntities(),
  linetypeScales(),
  lineweightEnumeration(),
  byBlockInheritance(),
  foreignAssociativeDimension(),
];
