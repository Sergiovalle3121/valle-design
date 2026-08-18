/**
 * Corpus de DXF en dialectos AJENOS.
 *
 * ## La limitación, dicha antes que nada
 *
 * Estos ficheros son SINTÉTICOS. Están escritos aquí para imitar lo que emiten
 * otras herramientas, no capturados de despachos reales — esos todavía no han
 * llegado. Imitar un dialecto no es lo mismo que haberlo recibido, y este
 * módulo no permite confundir las dos cosas: la matriz que se genera con él
 * lleva la limitación escrita dentro, en un campo propio, para que nadie pueda
 * leer «cobertura» donde sólo hay «cobertura de lo que supimos imaginar».
 *
 * ## Qué se imita y por qué
 *
 * Un lector de DXF no falla por las entidades: falla por la FORMA. Los ficheros
 * que llegan de fuera traen finales de línea de Windows, códigos de grupo con
 * espacios delante, coordenadas en notación científica, secciones en otro
 * orden, handles que no crecen y capas con acentos. Cada uno de esos es una
 * suposición que un lector escrito contra sus propios ficheros nunca puso a
 * prueba, porque los suyos siempre salieron bien formados.
 *
 * Y encima de la forma va el contenido de un plano de arquitectura de verdad:
 * polilínea con bulge, spline, cotas, sombreado con islas, texto con formato,
 * bloques anidados, capas con tipo de línea y grosor, y referencias externas.
 *
 * ## Regla del módulo
 *
 * Cada fichero DECLARA qué tipos de entidad contiene. La matriz no adivina: se
 * mide lo que llega contra lo declarado, y un tipo declarado que no aparece en
 * el resultado es un hueco, aunque nadie haya emitido un aviso. Precisamente
 * los huecos SIN aviso son los que este corpus existe para encontrar.
 *
 * Módulo puro: sólo devuelve cadenas.
 */

export interface CadDxfCorpusFile {
  /** Identificador estable. Es la clave de la matriz y no debe cambiar. */
  id: string;
  /** Qué dialecto o rareza de forma imita. */
  dialect: string;
  /** Qué se pretende descubrir con él. */
  purpose: string;
  /** Tipos DXF que el fichero contiene, en mayúsculas y con su recuento. */
  declares: Readonly<Record<string, number>>;
  content: string;
}

/** Par código/valor. El DXF de texto entero es esto repetido. */
type Pair = readonly [number | string, string | number];

/**
 * Serializa pares con el estilo de escritura que se pida.
 *
 * `pad` mete el código de grupo en un campo de tres con espacios delante, que
 * es EXACTAMENTE lo que hacen AutoCAD y media docena de exportadores. Un lector
 * que compare la línea con `===` contra `"10"` se lo come; uno que la recorte
 * primero, no. La diferencia no se ve leyendo el fichero en un editor.
 */
function serialize(
  pairs: readonly Pair[],
  options: { eol?: "\n" | "\r\n"; pad?: boolean; trailingSpace?: boolean } = {},
): string {
  const eol = options.eol ?? "\n";
  const lines: string[] = [];
  for (const [code, value] of pairs) {
    lines.push(options.pad ? String(code).padStart(6, " ") : String(code));
    lines.push(options.trailingSpace ? `${value} ` : String(value));
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

/** Cabecera con la versión que se quiera declarar. */
const header = (acadver: string): Pair[] =>
  section("HEADER", [
    [9, "$ACADVER"],
    [1, acadver],
    [9, "$INSUNITS"],
    [70, 4],
  ]);

const line = (layer: string, x1: number, y1: number, x2: number, y2: number): Pair[] => [
  [0, "LINE"],
  [8, layer],
  [10, x1],
  [20, y1],
  [11, x2],
  [21, y2],
];

// ---------------------------------------------------------------------------
// Dialectos de FORMA
// ---------------------------------------------------------------------------

/** R12 puro con finales de línea de Windows: el caso más común de todos. */
function r12Crlf(): CadDxfCorpusFile {
  return {
    id: "ac1009-r12-crlf",
    dialect: "AC1009 (R12), CRLF",
    purpose:
      "Un R12 con finales de línea de Windows. Es lo que exporta cualquier herramienta que quiera " +
      "compatibilidad máxima, y el \\r pegado al valor rompe cualquier comparación literal.",
    declares: { LINE: 2, CIRCLE: 1, ARC: 1 },
    content: serialize(
      [
        ...header("AC1009"),
        ...section("ENTITIES", [
          ...line("MUROS", 0, 0, 4000, 0),
          ...line("MUROS", 4000, 0, 4000, 3000),
          [0, "CIRCLE"], [8, "COLUMNAS"], [10, 500], [20, 500], [40, 150],
          [0, "ARC"], [8, "DETALLE"], [10, 2000], [20, 1500], [40, 300], [50, 30], [51, 150],
        ]),
        ...EOF,
      ],
      { eol: "\r\n" },
    ),
  };
}

/** Coordenadas en notación científica y exponentes con signo explícito. */
function scientific(): CadDxfCorpusFile {
  return {
    id: "ac1015-scientific-notation",
    dialect: "AC1015 (2000), notación científica",
    purpose:
      "Coordenadas escritas como 4.0E+3 y 2.5e-1. Es lo que emite un exportador que usa printf con " +
      "%g, y un lector que analice con una expresión regular de dígitos y punto las lee mal o las descarta.",
    declares: { LINE: 1, LWPOLYLINE: 1, CIRCLE: 1 },
    content: serialize([
      ...header("AC1015"),
      ...section("ENTITIES", [
        [0, "LINE"], [8, "EJES"], [10, "0.0E+0"], [20, "0.0E+0"], [11, "4.0E+3"], [21, "1.5E+3"],
        [0, "LWPOLYLINE"], [8, "MUROS"], [90, 3], [70, 0],
        [10, "0.0E+0"], [20, "0.0E+0"],
        [10, "1.0E+3"], [20, "2.5e-1"],
        [10, "2.0E+3"], [20, "0.0E+0"],
        [0, "CIRCLE"], [8, "COLUMNAS"], [10, "1.25E+3"], [20, "1.25E+3"], [40, "7.5E+1"],
      ]),
      ...EOF,
    ]),
  };
}

/** Códigos de grupo alineados a la derecha y valores con espacio final. */
function paddedCodes(): CadDxfCorpusFile {
  return {
    id: "ac1027-padded-group-codes",
    dialect: "AC1027 (2013), códigos con relleno",
    purpose:
      "Códigos de grupo alineados en un campo de seis y valores con un espacio al final. Es el " +
      "formato canónico del propio AutoCAD y el que rompe a los lectores escritos contra su propia salida.",
    declares: { LINE: 1, TEXT: 1, POINT: 1 },
    content: serialize(
      [
        ...header("AC1027"),
        ...section("ENTITIES", [
          ...line("MUROS", 0, 0, 1000, 0),
          [0, "TEXT"], [8, "TEXTOS"], [10, 100], [20, 200], [40, 25], [1, "NPT +0.00"],
          [0, "POINT"], [8, "REFERENCIA"], [10, 50], [20, 50],
        ]),
        ...EOF,
      ],
      { pad: true, trailingSpace: true },
    ),
  };
}

/** Capas con acentos y caracteres fuera de ASCII. */
function unicodeLayers(): CadDxfCorpusFile {
  return {
    id: "ac1021-unicode-layers",
    dialect: "AC1021 (2007), capas en UTF-8",
    purpose:
      "Nombres de capa con acentos y eñes, que es como los escribe un despacho mexicano: «MUROS_ÁTICO», " +
      "«DISEÑO», «CIMENTACIÓN». Un lector que normalice o recorte a ASCII funde capas distintas en una.",
    declares: { LINE: 3 },
    content: serialize([
      ...header("AC1021"),
      ...section("TABLES", [
        [0, "TABLE"], [2, "LAYER"], [70, 3],
        [0, "LAYER"], [2, "MUROS_ÁTICO"], [70, 0], [62, 1], [6, "CONTINUOUS"],
        [0, "LAYER"], [2, "DISEÑO"], [70, 0], [62, 3], [6, "CONTINUOUS"],
        [0, "LAYER"], [2, "CIMENTACIÓN"], [70, 0], [62, 5], [6, "CONTINUOUS"],
        [0, "ENDTAB"],
      ]),
      ...section("ENTITIES", [
        ...line("MUROS_ÁTICO", 0, 0, 1000, 0),
        ...line("DISEÑO", 0, 500, 1000, 500),
        ...line("CIMENTACIÓN", 0, 1000, 1000, 1000),
      ]),
      ...EOF,
    ]),
  };
}

/** ENTITIES antes que TABLES y BLOCKS, con handles que no crecen. */
function reorderedSections(): CadDxfCorpusFile {
  return {
    id: "ac1032-reordered-sections",
    dialect: "AC1032 (2018), secciones en otro orden",
    purpose:
      "ENTITIES antes que TABLES y BLOCKS, y handles no monotónicos (2F, 1A, FF). El orden de las " +
      "secciones no lo fija la norma; un lector que dependa de haber visto BLOCKS antes no resuelve los INSERT.",
    declares: { LINE: 1, INSERT: 1 },
    content: serialize([
      ...header("AC1032"),
      ...section("ENTITIES", [
        [0, "LINE"], [5, "2F"], [8, "MUROS"], [10, 0], [20, 0], [11, 900], [21, 0],
        [0, "INSERT"], [5, "1A"], [8, "MOBILIARIO"], [2, "PUERTA"], [10, 900], [20, 0], [41, 1], [42, 1], [50, 0],
      ]),
      ...section("TABLES", [
        [0, "TABLE"], [2, "LAYER"], [70, 2],
        [0, "LAYER"], [5, "FF"], [2, "MUROS"], [70, 0], [62, 7], [6, "CONTINUOUS"],
        [0, "LAYER"], [5, "0F"], [2, "MOBILIARIO"], [70, 0], [62, 4], [6, "CONTINUOUS"],
        [0, "ENDTAB"],
      ]),
      ...section("BLOCKS", [
        [0, "BLOCK"], [5, "9C"], [2, "PUERTA"], [70, 0], [10, 0], [20, 0], [3, "PUERTA"],
        [0, "LINE"], [8, "MOBILIARIO"], [10, 0], [20, 0], [11, 0], [21, 800],
        [0, "ARC"], [8, "MOBILIARIO"], [10, 0], [20, 0], [40, 800], [50, 0], [51, 90],
        [0, "ENDBLK"], [5, "9D"],
      ]),
      ...EOF,
    ]),
  };
}

// ---------------------------------------------------------------------------
// Contenido de un plano de ARQUITECTURA
// ---------------------------------------------------------------------------

/** Polilínea con bulge: el muro curvo y el arco de puerta de cualquier planta. */
function polylineBulge(): CadDxfCorpusFile {
  return {
    id: "arch-lwpolyline-bulge",
    dialect: "AC1015, LWPOLYLINE con bulge",
    purpose:
      "Un contorno cerrado con tramos curvos (código 42). Es la forma en que un plano guarda un muro " +
      "curvo, y un lector que ignore el bulge devuelve el mismo contorno en recto sin decir nada.",
    declares: { LWPOLYLINE: 2 },
    content: serialize([
      ...header("AC1015"),
      ...section("ENTITIES", [
        [0, "LWPOLYLINE"], [8, "MUROS"], [90, 4], [70, 1],
        [10, 0], [20, 0], [42, 0.5],
        [10, 2000], [20, 0],
        [10, 2000], [20, 1500], [42, -0.25],
        [10, 0], [20, 1500],
        [0, "LWPOLYLINE"], [8, "ZONAS"], [90, 3], [70, 0],
        [10, 3000], [20, 0],
        [10, 4000], [20, 800], [42, 1],
        [10, 5000], [20, 0],
      ]),
      ...EOF,
    ]),
  };
}

/** SPLINE cúbica con nudos: la curva de un jardín o una rampa. */
function spline(): CadDxfCorpusFile {
  return {
    id: "arch-spline-cubic",
    dialect: "AC1021, SPLINE grado 3",
    purpose:
      "Spline cúbica con su vector de nudos y seis puntos de control. Un lector que la aproxime a " +
      "polilínea cambia la geometría; uno que la descarte pierde el trazado del jardín entero.",
    declares: { SPLINE: 1 },
    content: serialize([
      ...header("AC1021"),
      ...section("ENTITIES", [
        [0, "SPLINE"], [8, "JARDIN"], [70, 8], [71, 3], [72, 10], [73, 6], [74, 0],
        [40, 0], [40, 0], [40, 0], [40, 0], [40, 0.33], [40, 0.66], [40, 1], [40, 1], [40, 1], [40, 1],
        [10, 0], [20, 0],
        [10, 500], [20, 900],
        [10, 1500], [20, 1200],
        [10, 2500], [20, 700],
        [10, 3200], [20, 100],
        [10, 4000], [20, 400],
      ]),
      ...EOF,
    ]),
  };
}

/** HATCH con contorno exterior e ISLA: el relleno de un muro con hueco. */
function hatchIslands(): CadDxfCorpusFile {
  return {
    id: "arch-hatch-islands",
    dialect: "AC1015, HATCH con isla",
    purpose:
      "Sombreado sólido con un contorno exterior y una isla interior. Es como se rellena un muro con " +
      "un hueco de instalación; perder la isla rellena el hueco y el plano miente sobre el edificio.",
    declares: { HATCH: 1 },
    content: serialize([
      ...header("AC1015"),
      ...section("ENTITIES", [
        [0, "HATCH"], [8, "RELLENOS"], [2, "SOLID"], [70, 1], [71, 0], [91, 2],
        // Contorno exterior: polilínea cerrada de 4 vértices.
        [92, 3], [72, 0], [73, 1], [93, 4],
        [10, 0], [20, 0], [10, 2000], [20, 0], [10, 2000], [20, 1000], [10, 0], [20, 1000],
        [97, 0],
        // Isla: otra polilínea cerrada, dentro.
        [92, 3], [72, 0], [73, 1], [93, 4],
        [10, 500], [20, 300], [10, 900], [20, 300], [10, 900], [20, 700], [10, 500], [20, 700],
        [97, 0],
        [75, 0], [76, 1], [98, 0],
      ]),
      ...EOF,
    ]),
  };
}

/** MTEXT con formato incrustado: la nota general de cualquier plano. */
function mtextFormatted(): CadDxfCorpusFile {
  return {
    id: "arch-mtext-formatted",
    dialect: "AC1021, MTEXT con formato",
    purpose:
      "Nota general con negrita, cambio de fuente y salto de párrafo dentro del propio texto " +
      "(\\fArial|b1;, \\P). Un lector que guarde la cadena cruda enseña los códigos al usuario.",
    declares: { MTEXT: 2 },
    content: serialize([
      ...header("AC1021"),
      ...section("ENTITIES", [
        [0, "MTEXT"], [8, "NOTAS"], [10, 0], [20, 5000], [40, 250], [41, 4000], [71, 1], [72, 1],
        [1, "{\\fArial|b1|i0;NOTAS GENERALES}\\PTodas las cotas en milímetros."],
        [7, "STANDARD"],
        [0, "MTEXT"], [8, "NOTAS"], [10, 0], [20, 4000], [40, 200], [41, 3000], [71, 1], [72, 5],
        [1, "Nivel de piso terminado \\U+00B1 0.00"],
        [7, "STANDARD"],
      ]),
      ...EOF,
    ]),
  };
}

/** DIMENSION con su bloque de geometría: la cota asociativa ajena. */
function associativeDimension(): CadDxfCorpusFile {
  return {
    id: "arch-dimension-associative",
    dialect: "AC1015, DIMENSION con bloque *D",
    purpose:
      "Cota lineal con su bloque anónimo de geometría, que es como la guarda AutoCAD. Es la entidad " +
      "cuya degradación más cuesta en un plano: si entra como líneas sueltas, deja de medir al mover el muro.",
    declares: { DIMENSION: 1 },
    content: serialize([
      ...header("AC1015"),
      ...section("BLOCKS", [
        [0, "BLOCK"], [2, "*D1"], [70, 1], [10, 0], [20, 0], [3, "*D1"],
        [0, "LINE"], [8, "COTAS"], [10, 0], [20, 900], [11, 4000], [21, 900],
        [0, "LINE"], [8, "COTAS"], [10, 0], [20, 0], [11, 0], [21, 1000],
        [0, "LINE"], [8, "COTAS"], [10, 4000], [20, 0], [11, 4000], [21, 1000],
        [0, "TEXT"], [8, "COTAS"], [10, 2000], [20, 950], [40, 180], [1, "4000"],
        [0, "ENDBLK"],
      ]),
      ...section("ENTITIES", [
        [0, "DIMENSION"], [8, "COTAS"], [2, "*D1"], [70, 0],
        [10, 2000], [20, 900],
        [13, 0], [23, 0],
        [14, 4000], [24, 0],
        [42, 4000],
      ]),
      ...EOF,
    ]),
  };
}

/** INSERT anidado: el bloque de baño que contiene el bloque de lavabo. */
function nestedInserts(): CadDxfCorpusFile {
  return {
    id: "arch-nested-inserts",
    dialect: "AC1018, INSERT dentro de BLOCK",
    purpose:
      "Un bloque BAÑO que a su vez inserta LAVABO, insertado dos veces con escalas distintas. Es la " +
      "estructura real de una biblioteca de despacho, y aplanarla pierde la capacidad de editar la pieza.",
    declares: { INSERT: 2 },
    content: serialize([
      ...header("AC1018"),
      ...section("BLOCKS", [
        [0, "BLOCK"], [2, "LAVABO"], [70, 0], [10, 0], [20, 0], [3, "LAVABO"],
        [0, "CIRCLE"], [8, "MOBILIARIO"], [10, 0], [20, 0], [40, 200],
        [0, "ENDBLK"],
        [0, "BLOCK"], [2, "BANO"], [70, 0], [10, 0], [20, 0], [3, "BANO"],
        [0, "LWPOLYLINE"], [8, "MOBILIARIO"], [90, 4], [70, 1],
        [10, 0], [20, 0], [10, 1500], [20, 0], [10, 1500], [20, 1800], [10, 0], [20, 1800],
        [0, "INSERT"], [8, "MOBILIARIO"], [2, "LAVABO"], [10, 400], [20, 1400], [41, 1], [42, 1], [50, 0],
        [0, "ENDBLK"],
      ]),
      ...section("ENTITIES", [
        [0, "INSERT"], [8, "MOBILIARIO"], [2, "BANO"], [10, 0], [20, 0], [41, 1], [42, 1], [50, 0],
        [0, "INSERT"], [8, "MOBILIARIO"], [2, "BANO"], [10, 5000], [20, 0], [41, 1], [42, 1], [50, 90],
      ]),
      ...EOF,
    ]),
  };
}

/** Capas con tipo de línea y grosor: los ejes a trazos del plano. */
function layerLinetypeLineweight(): CadDxfCorpusFile {
  return {
    id: "arch-layer-linetype-lineweight",
    dialect: "AC1015, LTYPE + grosor de capa",
    purpose:
      "Tabla de capas con tipo de línea (CENTER, DASHED) y grosor en centésimas de milímetro (código " +
      "370). El grosor es lo que distingue un muro de carga de una línea auxiliar al imprimir.",
    declares: { LINE: 2 },
    content: serialize([
      ...header("AC1015"),
      ...section("TABLES", [
        [0, "TABLE"], [2, "LTYPE"], [70, 2],
        [0, "LTYPE"], [2, "CENTER"], [70, 0], [3, "Eje ____ _ ____"], [72, 65], [73, 4], [40, 50],
        [49, 31.75], [49, -6.35], [49, 6.35], [49, -6.35],
        [0, "LTYPE"], [2, "DASHED"], [70, 0], [3, "Trazos __ __ __"], [72, 65], [73, 2], [40, 19.05],
        [49, 12.7], [49, -6.35],
        [0, "ENDTAB"],
        [0, "TABLE"], [2, "LAYER"], [70, 2],
        [0, "LAYER"], [2, "MUROS-CARGA"], [70, 0], [62, 7], [6, "CONTINUOUS"], [370, 50],
        [0, "LAYER"], [2, "EJES"], [70, 0], [62, 1], [6, "CENTER"], [370, 9],
        [0, "ENDTAB"],
      ]),
      ...section("ENTITIES", [
        ...line("MUROS-CARGA", 0, 0, 6000, 0),
        ...line("EJES", 3000, -500, 3000, 3500),
      ]),
      ...EOF,
    ]),
  };
}

/** Referencia externa: el bloque que apunta a otro archivo. */
function externalReference(): CadDxfCorpusFile {
  return {
    id: "arch-xref-attach",
    dialect: "AC1015, BLOCK con bandera de xref",
    purpose:
      "Un BLOCK con la bandera 4 (referencia externa) y su ruta en el código 1, insertado una vez. Es " +
      "como un despacho enlaza la planta del arquitecto desde el plano de estructuras.",
    declares: { INSERT: 1 },
    content: serialize([
      ...header("AC1015"),
      ...section("BLOCKS", [
        [0, "BLOCK"], [2, "ARQ-PLANTA"], [70, 4], [10, 0], [20, 0], [3, "ARQ-PLANTA"],
        [1, "..\\arquitectura\\planta-baja.dwg"],
        [0, "ENDBLK"],
      ]),
      ...section("ENTITIES", [
        [0, "INSERT"], [8, "XREF"], [2, "ARQ-PLANTA"], [10, 0], [20, 0], [41, 1], [42, 1], [50, 0],
      ]),
      ...EOF,
    ]),
  };
}

/** Entidades que ninguna herramienta pequeña representa. */
function unsupportedZoo(): CadDxfCorpusFile {
  return {
    id: "foreign-unsupported-zoo",
    dialect: "AC1024, entidades de otras disciplinas",
    purpose:
      "3DFACE, MESH, LEADER, 3DSOLID y REGION en el mismo archivo. Ninguna es de un plano 2D de " +
      "arquitectura, pero todas llegan en planos reales, y lo que importa es si su ausencia SE DECLARA.",
    declares: { "3DFACE": 1, MESH: 1, LEADER: 1, "3DSOLID": 1, REGION: 1, LINE: 1 },
    content: serialize([
      ...header("AC1024"),
      ...section("ENTITIES", [
        ...line("MUROS", 0, 0, 1000, 0),
        [0, "3DFACE"], [8, "TECHOS"], [10, 0], [20, 0], [30, 0], [11, 100], [21, 0], [31, 0],
        [12, 100], [22, 100], [32, 0], [13, 0], [23, 100], [33, 0],
        [0, "MESH"], [8, "TERRENO"], [71, 2], [72, 0], [91, 0], [92, 4],
        [10, 0], [20, 0], [30, 0], [10, 100], [20, 0], [30, 0],
        [0, "LEADER"], [8, "NOTAS"], [3, "STANDARD"], [71, 1], [72, 0], [73, 3], [76, 2],
        [10, 0], [20, 0], [10, 500], [20, 500],
        [0, "3DSOLID"], [8, "ESTRUCTURA"], [1, "ACIS binario no incluido"],
        [0, "REGION"], [8, "ESTRUCTURA"], [1, "ACIS binario no incluido"],
      ]),
      ...EOF,
    ]),
  };
}

/** Fichero roto a media escritura: la descarga que se cortó. */
function truncated(): CadDxfCorpusFile {
  return {
    id: "foreign-truncated",
    dialect: "AC1015, archivo cortado",
    purpose:
      "Un DXF sin ENDSEC ni EOF, como el que deja una descarga interrumpida o un disco lleno. Lo que " +
      "se comprueba no es que entre, sino que el fallo sea explícito y no un dibujo vacío que parece bueno.",
    declares: { LINE: 1 },
    content: serialize([
      ...header("AC1015"),
      [0, "SECTION"], [2, "ENTITIES"],
      ...line("MUROS", 0, 0, 1000, 0),
      [0, "LINE"], [8, "MUROS"], [10, 1000],
    ]),
  };
}

/**
 * El corpus completo. El orden es estable: la matriz se compara byte a byte
 * contra el fichero comprometido y un orden que baila produciría diferencias
 * que no son diferencias.
 */
export const CAD_DXF_EXTERNAL_CORPUS: readonly CadDxfCorpusFile[] = [
  r12Crlf(),
  scientific(),
  paddedCodes(),
  unicodeLayers(),
  reorderedSections(),
  polylineBulge(),
  spline(),
  hatchIslands(),
  mtextFormatted(),
  associativeDimension(),
  nestedInserts(),
  layerLinetypeLineweight(),
  externalReference(),
  unsupportedZoo(),
  truncated(),
];

/**
 * La limitación, en el texto que se copia dentro del artefacto.
 *
 * Vive aquí y no en el script para que sea imposible generar la matriz sin
 * ella: quien quiera quitarla tiene que borrarla de un módulo que una spec lee.
 */
export const CAD_DXF_CORPUS_LIMITATION =
  "CORPUS SINTÉTICO. Ninguno de estos archivos procede de un despacho real: están generados por " +
  "`apps/web/src/lib/cad/dxf-external-corpus.ts` para imitar dialectos ajenos (versiones AC1009 a " +
  "AC1032, CRLF y LF, códigos de grupo con relleno, notación científica, secciones reordenadas, " +
  "handles no monotónicos, capas con acentos). Imitar un dialecto NO es haberlo recibido: esta matriz " +
  "no acredita cobertura del mundo real y no debe citarse como tal hasta que se incorporen archivos " +
  "de despachos y se regenere.";
