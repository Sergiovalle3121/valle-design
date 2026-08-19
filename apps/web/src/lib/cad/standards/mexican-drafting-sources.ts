/**
 * DE DÓNDE SALE CADA CONVENCIÓN DE DIBUJO MEXICANA.
 *
 * ## Por qué existe este archivo antes que las tablas
 *
 * AutoCAD llega a México con capas en inglés, papeles ANSI y estilos de cota
 * pensados para Estados Unidos, y lo primero que hace un despacho es rehacerlo
 * todo — mal y distinto en cada oficina. Venir de fábrica con lo que allí se usa
 * es una ventaja que una empresa global no va a molestarse en igualar por un
 * mercado de 199 pesos al mes.
 *
 * Pero esa ventaja se pierde entera el día que un arquitecto abre la tabla de
 * capas y detecta una norma inventada. Lo detecta al instante: sabe qué está
 * normado y qué no, porque a él se lo revisa una ventanilla. Así que la regla
 * de este módulo es **decir cuál es cuál**:
 *
 * - `norma`: hay un documento escrito que lo dice, y se cita.
 * - `costumbre`: es lo que se hace, no lo dice ningún documento, y se dice así.
 *
 * No hay tercera categoría, y no se admite una `norma` sin documento ni una
 * `costumbre` sin descripción de la práctica. Una spec lo comprueba y falla si
 * una convención se queda sin su fuente.
 *
 * ## Por qué algunas fuentes llevan `verify`
 *
 * Porque «cité el documento correcto» y «cité el artículo correcto» no son la
 * misma afirmación. Donde el documento es seguro pero el número de artículo, la
 * edición vigente o el alcance geográfico no lo son, el campo `verify` dice
 * exactamente qué tiene que confirmar una persona antes de que esto llegue a un
 * cliente. Callarlo sería vender una precisión que no tenemos.
 *
 * ## Alcance geográfico, que aquí no es un detalle
 *
 * México no tiene un reglamento de construcción federal: cada estado y cada
 * municipio tiene el suyo. Lo que se cita del RCDF vale en la Ciudad de México
 * y es el que copian muchos otros, pero **no es nacional**, y decir «cumple la
 * norma» sin decir cuál sería falso. Cada fuente declara su `jurisdiccion`.
 */

/** Naturaleza de la fuente. Sin término medio, a propósito. */
export type CadStandardKind = "norma" | "costumbre";

/** Hasta dónde llega lo que la fuente dice. */
export type CadStandardJurisdiction =
  | "internacional"
  | "extranjera"
  | "nacional-mx"
  | "cdmx"
  | "sin-jurisdiccion";

interface CadStandardBase {
  /** Id estable. Lo citan las tablas de capas, cotas y láminas. */
  id: string;
  /** Qué se aplica en el producto por esta fuente. Una frase. */
  rule: string;
  jurisdiction: CadStandardJurisdiction;
  /** Qué tiene que confirmar una persona antes de que esto llegue a un cliente. */
  verify?: string;
}

export interface CadStandardNorm extends CadStandardBase {
  kind: "norma";
  /** Designación del documento: `ISO 129-1`, `NOM-001-SEDE`. */
  document: string;
  /** Título o parte concreta. Vacío no se admite. */
  clause: string;
  /** Qué dice el documento REALMENTE, separado de lo que nosotros hacemos. */
  says: string;
}

export interface CadStandardCustom extends CadStandardBase {
  kind: "costumbre";
  /** Qué hace un despacho mexicano. Vacío no se admite. */
  practice: string;
  /** En qué varía de una oficina a otra. Ocultarlo sería inventar unanimidad. */
  caveat: string;
  /**
   * Norma que SÍ existe y que la costumbre ignora, cuando la hay. Decirlo evita
   * que alguien crea que investigamos mal: sabemos que ISO 13567 existe.
   */
  ignoredStandard?: string;
}

export type CadStandardSource = CadStandardNorm | CadStandardCustom;

/**
 * Las normas citadas.
 *
 * Cada una lleva `says` —lo que el documento dice— separado de `rule` —lo que
 * nosotros hacemos con eso—. La separación importa: ISO 129-1 admite la
 * garrapata, no la impone, y confundir «lo admite» con «lo exige» es
 * exactamente el claim falso que hay que evitar.
 */
const NORMS: readonly CadStandardNorm[] = [
  {
    id: "iso-216",
    kind: "norma",
    document: "ISO 216",
    clause: "Serie A de formatos de papel",
    jurisdiction: "internacional",
    says:
      "Fija la serie A: A0 = 841 × 1189 mm, y cada formato siguiente es la mitad del anterior " +
      "cortado por el lado largo, conservando la razón √2.",
    rule:
      "Las láminas se ofrecen en A0–A4 y NO en la serie ANSI (Letter, Tabloid, ARCH). " +
      "En México se dibuja y se imprime en serie A.",
  },
  {
    id: "iso-5457-margenes",
    kind: "norma",
    document: "ISO 5457",
    clause: "Documentación técnica de producto — Formatos y disposición de los planos",
    jurisdiction: "internacional",
    says:
      "El recuadro del dibujo deja un margen de archivado de 20 mm en el borde de encuadernación " +
      "y 10 mm en los otros tres.",
    rule:
      "Toda plantilla de lámina nace con márgenes 20/10/10/10 mm y el margen ancho a la izquierda. " +
      "Un plano perforado sobre 10 mm se agujerea encima del dibujo.",
    verify:
      "Confirmar contra la edición vigente si A0 y A1 llevan margen ancho en más de un borde: " +
      "hay ediciones y guías nacionales que difieren.",
  },
  {
    id: "iso-5457-doblado",
    kind: "norma",
    document: "ISO 5457",
    clause: "Plegado de planos para archivo",
    jurisdiction: "internacional",
    says:
      "Los formatos mayores se archivan plegados al tamaño A4, con el cajetín visible en la cara frontal.",
    rule:
      "Cada papel declara en cuántos paneles A4 se pliega y se comprueba que el cajetín queda en el " +
      "panel frontal. Un cajetín que cae al dorso obliga a desplegar el plano para saber qué plano es.",
    verify:
      "El PATRÓN concreto de pliegues (qué dobleces y en qué orden) lo detalla DIN 824, no ISO 5457. " +
      "Confirmar con la reprografía del despacho cuál sigue, y confirmar contra el texto de la " +
      "edición vigente de ISO 5457 con qué alcance trata el plegado: lo que el producto comprueba es " +
      "el RESULTADO —cuántos paneles A4 salen y que el cajetín quede en el visible—, no la secuencia.",
  },
  {
    id: "iso-3098-alturas",
    kind: "norma",
    document: "ISO 3098-1",
    clause: "Escritura — Alturas nominales de carácter",
    jurisdiction: "internacional",
    says:
      "Las alturas nominales van en progresión √2: 1,8 · 2,5 · 3,5 · 5 · 7 · 10 · 14 · 20 mm sobre el papel.",
    rule:
      "Los estilos de texto sólo usan alturas de esa serie: 2,5 mm para rótulo y cota, 3,5 para " +
      "subtítulo, 5 para título. Una altura fuera de la serie sale distinta al reducir la lámina.",
  },
  {
    id: "iso-128-grosores",
    kind: "norma",
    document: "ISO 128-20",
    clause: "Principios generales de representación — Convenios de línea",
    jurisdiction: "internacional",
    says:
      "Los grosores de línea salen de la serie 0,13 · 0,18 · 0,25 · 0,35 · 0,5 · 0,7 · 1 · 1,4 · 2 mm, " +
      "en razón √2, y la línea gruesa de un dibujo debe ser al menos el doble de ancha que la fina " +
      "para que se distingan al reproducirlo.",
    rule:
      "Toda capa declara su grosor tomado de esa serie. El grosor va EN LA CAPA y no se deja a una " +
      "tabla de plumas por color, que es lo que se pierde al mandar el archivo a otro despacho.",
  },
  {
    id: "iso-128-ocultas",
    kind: "norma",
    document: "ISO 128-20",
    clause: "Tipos de línea y su significado",
    jurisdiction: "internacional",
    says:
      "La línea de trazos representa aristas ocultas; la línea de trazo y punto larga, ejes y trazas " +
      "de plano.",
    rule:
      "La cimentación y el plafón —que están ocultos bajo el piso y sobre la cabeza— van a trazos; " +
      "los ejes van a trazo y punto (`CENTER`).",
  },
  {
    id: "iso-129-1-terminacion",
    kind: "norma",
    document: "ISO 129-1",
    clause: "Presentación de cotas y tolerancias — Terminaciones de la línea de cota",
    jurisdiction: "internacional",
    says:
      "Admite varias terminaciones para la línea de cota: la flecha cerrada rellena, la flecha " +
      "abierta, el TRAZO OBLICUO y el punto.",
    rule:
      "La garrapata del dibujo arquitectónico —el trazo oblicuo a 45°— es una terminación NORMADA, " +
      "no una licencia. Lo que no dice ninguna norma es que arquitectura tenga que usarla; eso es " +
      "costumbre y se declara aparte.",
  },
  {
    id: "iso-5455-escalas",
    kind: "norma",
    document: "ISO 5455",
    clause: "Escalas recomendadas",
    jurisdiction: "internacional",
    says:
      "Las escalas de reducción recomendadas son 1:2, 1:5, 1:10, 1:20, 1:50, 1:100, 1:200, 1:500, " +
      "1:1000… Ni 1:25 ni 1:75 figuran en ella.",
    rule:
      "Cada escala que ofrece el producto declara si está en ISO 5455 o no. 1:75 se ofrece porque " +
      "en México se usa muchísimo, pero se marca como costumbre y no como escala normalizada.",
  },
  {
    id: "iso-7200-campos",
    kind: "norma",
    document: "ISO 7200",
    clause: "Campos de datos en cajetines y encabezados de documento",
    jurisdiction: "internacional",
    says:
      "Enumera los campos de datos del cajetín: propietario legal, número de identificación, fecha " +
      "de emisión, índice de revisión, título, hoja/de y responsable del documento.",
    rule:
      "El cajetín cubre esos campos y AÑADE los que una lámina mexicana lleva y la norma no nombra: " +
      "ubicación de la obra, propietario y la responsiva del Director Responsable de Obra.",
    verify:
      "Los 180 mm de ancho del cajetín vienen de la edición de 1984 de ISO 7200, que la edición " +
      "vigente ya no impone: hoy es costumbre consolidada, no requisito. Confirmar si se quiere " +
      "conservar la cifra o dejarla libre.",
  },
  {
    id: "rcdf-dro",
    kind: "norma",
    document: "Reglamento de Construcciones para el Distrito Federal (RCDF)",
    clause: "Título Segundo — Director Responsable de Obra y Corresponsables",
    jurisdiction: "cdmx",
    says:
      "La obra que requiere manifestación o licencia de construcción necesita la responsiva de un " +
      "Director Responsable de Obra registrado, que firma el proyecto y los planos.",
    rule:
      "El cajetín mexicano reserva una banda para nombre, número de registro y FIRMA del Director " +
      "Responsable de Obra. Sin ese espacio la lámina no se puede presentar en ventanilla y hay que " +
      "rehacer el cajetín.",
    verify:
      "Confirmar con un DRO en activo el número de artículo vigente y el texto exacto de la leyenda " +
      "de responsiva. Fuera de la Ciudad de México cada estado tiene su propio reglamento y su " +
      "propia figura equivalente: el espacio sirve, la leyenda puede no servir.",
  },
  {
    id: "rcdf-corresponsables",
    kind: "norma",
    document: "Reglamento de Construcciones para el Distrito Federal (RCDF)",
    clause: "Título Segundo — Corresponsables",
    jurisdiction: "cdmx",
    says:
      "Existen tres corresponsabilidades — seguridad estructural, diseño urbano y arquitectónico, e " +
      "instalaciones — exigibles según el tipo y tamaño de la obra.",
    rule:
      "El cajetín mexicano ofrece una fila de corresponsable rotulable, para que el plano estructural " +
      "o el de instalaciones lleve la firma que le corresponde en lugar de una casilla genérica.",
    verify:
      "Confirmar en qué supuestos es exigible cada corresponsable antes de sugerir al usuario que la " +
      "necesita: el producto ofrece el espacio, no dictamina la obligación.",
  },
  {
    id: "nom-001-sede",
    kind: "norma",
    document: "NOM-001-SEDE",
    clause: "Instalaciones eléctricas (utilización)",
    jurisdiction: "nacional-mx",
    says:
      "Regula el diseño y la ejecución de la instalación eléctrica de utilización y exige la " +
      "documentación del proyecto eléctrico.",
    rule:
      "La instalación eléctrica vive en su propia capa y su propia lámina, separada de la " +
      "arquitectura: es un proyecto que se revisa por su cuenta. La norma regula la INSTALACIÓN, no " +
      "el dibujo — el nombre y el color de la capa son costumbre y se declaran aparte.",
    verify: "Confirmar la edición vigente (2012 / 2018 y posteriores) antes de citarla por año.",
  },
  {
    id: "nom-gas-lp",
    kind: "norma",
    document: "NOM-004-SEDG-2004",
    clause: "Instalaciones de aprovechamiento de Gas L.P. — Diseño y construcción",
    jurisdiction: "nacional-mx",
    says: "Regula el diseño y la construcción de las instalaciones de aprovechamiento de gas L.P.",
    rule:
      "El gas L.P. tiene capa propia y no se mezcla con la hidráulica: son dos revisiones distintas y " +
      "dos responsables distintos. Igual que en la eléctrica, la norma regula la instalación y no el " +
      "dibujo.",
    verify:
      "Confirmar vigencia y designación exacta: la normatividad de gas ha cambiado de dependencia y " +
      "de clave con los años, y para gas natural aplica otra serie (NOM-SECRE).",
  },
];

/**
 * Las costumbres.
 *
 * Ninguna de éstas está escrita en ningún sitio. Se declaran como lo que son —lo
 * que hace la gente— con su variación entre oficinas, porque una costumbre
 * presentada como norma es exactamente lo que un arquitecto huele a la primera.
 */
const CUSTOMS: readonly CadStandardCustom[] = [
  {
    id: "capas-nombre-espanol",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "Los despachos mexicanos nombran las capas en español, en mayúsculas, con nombres cortos y un " +
      "guion como separador de jerarquía: MURO, MURO-DEM, INST-HID, INST-HID-CAL.",
    caveat:
      "No hay dos oficinas que coincidan: unas escriben A-MURO al estilo estadounidense, otras " +
      "MUROS en plural, otras numeran las capas. Lo que sí es constante es el español y la " +
      "mayúscula.",
    ignoredStandard:
      "ISO 13567 (organización y denominación de capas CAD) existe y define un esquema de campos, " +
      "pero prácticamente nadie en México la aplica: pedirla sería vender una norma que el usuario " +
      "no reconoce y no usa.",
    rule:
      "La norma de capas del producto usa nombres en español, en mayúsculas, con guion como " +
      "separador, y se declara COSTUMBRE, no norma.",
  },
  {
    id: "capas-color-pluma",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "El color de la capa se usa como código de grosor de pluma a través de la tabla de trazado " +
      "(.ctb): el color no se ve en el plano impreso, sólo decide con qué grosor sale la línea.",
    caveat:
      "El mapa color→grosor lo define cada despacho en su .ctb y no coincide entre oficinas; un " +
      "archivo que viaja sin su .ctb sale impreso con todos los grosores mal.",
    rule:
      "Cada capa declara su grosor EXPLÍCITO además de su color. El color queda para distinguir en " +
      "pantalla y el grosor viaja dentro del documento, que es lo que evita que el plano cambie de " +
      "aspecto al abrirlo en otra oficina.",
  },
  {
    id: "demolicion-amarillo-rojo",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "En el plano de demolición y obra nueva se distingue por color: amarillo lo que se demuele, " +
      "rojo lo que es nuevo, y en gris o negro lo existente que se conserva.",
    caveat:
      "Hay oficinas que invierten los colores y hay municipios que piden su propio código en la " +
      "solicitud de licencia. Es la convención más extendida, no una regla obligatoria.",
    rule:
      "MURO-DEM va en amarillo y a trazos, MURO-NUE en rojo y continuo, MURO-EXI en gris. Y se " +
      "advierte al usuario de que su ventanilla puede pedir otro código.",
  },
  {
    id: "cota-metros-dos-decimales",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "En planta arquitectónica se acota en METROS con dos decimales y sin escribir la unidad: un " +
      "muro de tres metros cuarenta y cinco se rotula «3.45». En plano de detalle se acota en " +
      "CENTÍMETROS y sin decimales: «12».",
    caveat:
      "Algunos despachos acotan el arquitectónico en centímetros enteros, sobre todo en vivienda " +
      "económica. Ninguna norma mexicana fija la unidad de acotación arquitectónica.",
    rule:
      "El estilo de cota arquitectónico nace en metros con dos decimales y el de detalle en " +
      "centímetros con cero decimales, y ambos se declaran costumbre.",
  },
  {
    id: "garrapata-arquitectonica",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "La cota arquitectónica se remata con la garrapata —el trazo oblicuo a 45°— y no con la flecha " +
      "rellena, que se deja para el dibujo mecánico. Es lo que hace que un plano se lea como plano " +
      "de arquitectura de un vistazo.",
    caveat:
      "La flecha sigue apareciendo en cotas de radio y diámetro, donde la garrapata no señala nada.",
    rule:
      "Los estilos de cota arquitectónico y de detalle nacen con `architectural-tick`. La " +
      "terminación en sí está admitida por ISO 129-1; ELEGIRLA para arquitectura es la costumbre.",
  },
  {
    id: "escala-1-75",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "1:75 es escala corriente en vivienda mexicana: es la que se usa cuando la casa no cabe a 1:50 " +
      "y a 1:100 se pierde el detalle. También 1:25 en cortes por fachada.",
    caveat: "No figura en ISO 5455 y un revisor formalista puede objetarla.",
    rule:
      "1:75 y 1:25 se ofrecen con estilo de cota propio, marcadas como escalas de costumbre y no " +
      "como escalas normalizadas.",
  },
  {
    id: "clave-lamina",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "La clave de lámina lleva una letra de disciplina y un número correlativo: A-101 " +
      "arquitectónico, E-101 estructural, I-101 instalaciones, T-101 topográfico.",
    caveat:
      "Cada despacho tiene su letra y su numeración; algunos usan IE / IH / IS para separar las tres " +
      "instalaciones, y otros numeran de corrido sin letra.",
    rule:
      "Cada plantilla nace con su clave de lámina en esa forma, editable. Es un punto de partida " +
      "reconocible, no una imposición.",
  },
  {
    id: "cajetin-banda-derecha",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "Muchos despachos mexicanos no ponen el cajetín como caja en la esquina inferior derecha sino " +
      "como BANDA VERTICAL en todo el borde derecho de la lámina, con el logotipo arriba, los datos " +
      "en medio y las firmas abajo.",
    caveat:
      "Conviven las dos disposiciones. La banda vertical es más común en despachos grandes y en " +
      "obra pública; la caja inferior derecha, en despachos pequeños y en lo que sale de plantillas " +
      "importadas.",
    rule:
      "El cajetín se ofrece en las dos disposiciones y la lámina recuerda cuál usa, para que veinte " +
      "láminas del mismo juego no salgan cada una a su manera.",
  },
  {
    id: "nivel-npt",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "Los niveles se rotulan «N.P.T.» (nivel de piso terminado) seguidos de la cota en metros con " +
      "signo: N.P.T. +0.00, N.P.T. −0.15.",
    caveat: "También se ven N.P.A. (piso acabado) y N.L. (nivel de losa) para el nivel estructural.",
    rule: "La capa NIVEL existe separada y su texto arranca del estilo de rótulo, no del de título.",
  },
  {
    id: "ejes-letra-numero",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "Los ejes se marcan con números en un sentido y letras en el otro, dentro de un círculo en los " +
      "extremos, y la línea va a trazo y punto.",
    caveat:
      "El sentido que lleva números y el que lleva letras cambia de oficina en oficina; no hay regla.",
    rule: "La capa EJE nace con tipo de línea `CENTER` y grosor fino, separada de la estructura.",
  },
  {
    id: "terreno-natural-proyecto",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "En corte y en plataforma se dibujan dos perfiles: el terreno natural, a trazos, y el terreno " +
      "de proyecto, continuo y más grueso. Entre los dos se lee el corte y el relleno.",
    caveat: "En terracerías de obra civil se usan además colores para corte y relleno.",
    rule: "TERRENO-NAT va a trazos y TERRENO-PRO continuo y más grueso, ambos en el mismo marrón.",
  },
  {
    id: "canceleria-separada",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "La cancelería —aluminio y vidrio— se dibuja y se cuantifica aparte de la carpintería de " +
      "madera, porque son dos proveedores, dos cotizaciones y dos calendarios de obra.",
    caveat:
      "En vivienda pequeña muchos despachos meten todo en una sola capa de «puertas y ventanas».",
    rule:
      "Existe la capa CANCEL además de VANO, para que el cuadro de cancelería salga del dibujo y no " +
      "de contar a mano.",
  },
  {
    id: "acotacion-en-su-capa",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "Cotas y textos viven en capas propias, nunca en la del elemento que describen: así se entrega " +
      "el mismo dibujo sin cotas al de obra negra y con cotas al residente.",
    caveat: "Ninguno, en la práctica: es de lo poco en que coinciden todas las oficinas.",
    rule: "COTA y TEXTO son capas comunes a todas las plantillas.",
  },
  {
    id: "auxiliar-no-imprime",
    kind: "costumbre",
    jurisdiction: "sin-jurisdiccion",
    practice:
      "Hay una capa de construcción auxiliar donde se trazan las líneas de apoyo, y esa capa se " +
      "excluye del trazado en lugar de borrarse.",
    caveat: "Su nombre cambia: AUXILIAR, AUX, TRAZO, CONSTRUCCION.",
    rule: "La capa AUXILIAR nace con `plot: false`.",
  },
];

/** Todas las fuentes, normas primero. El orden es el del artefacto de evidencia. */
export const CAD_MEXICAN_DRAFTING_SOURCES: readonly CadStandardSource[] = [
  ...NORMS,
  ...CUSTOMS,
];

const BY_ID = new Map(CAD_MEXICAN_DRAFTING_SOURCES.map((source) => [source.id, source]));

/** Ids válidos. El tipo no puede estrecharse a una unión sin duplicar la lista. */
export type CadStandardSourceId = string;

/**
 * Error tipado: citar una fuente que no existe no puede fallar en silencio.
 *
 * Fallar cerrado aquí es lo que impide el peor desenlace posible de este módulo
 * — una tabla de capas que dice citar una norma y en realidad no cita nada.
 */
export class CadStandardSourceError extends Error {
  readonly code = "cad_standard_source_unknown";
  constructor(readonly sourceId: string) {
    super(
      `La convención cita la fuente «${sourceId}», que no está en el registro de fuentes ` +
        `de dibujo mexicano. Toda convención tiene que citar una norma o declararse costumbre.`,
    );
    this.name = "CadStandardSourceError";
  }
}

export function cadStandardSource(id: string): CadStandardSource {
  const source = BY_ID.get(id);
  if (!source) throw new CadStandardSourceError(id);
  return source;
}

export function cadStandardSourceOrNull(id: string): CadStandardSource | null {
  return BY_ID.get(id) ?? null;
}

/** ¿La convención está respaldada por un documento escrito? */
export function cadStandardIsNormative(id: string): boolean {
  return cadStandardSource(id).kind === "norma";
}

/**
 * Cómo se cita una fuente en una nota al usuario.
 *
 * Una `norma` se cita con su designación; una `costumbre` se cita DICIENDO que
 * es costumbre. Este es el único formateador, para que no haya un segundo sitio
 * donde una costumbre pueda acabar rotulada como norma.
 */
export function cadStandardCitation(id: string): string {
  const source = cadStandardSource(id);
  if (source.kind === "norma") return `${source.document} — ${source.clause}`;
  return "Uso común de despacho mexicano; sin norma escrita";
}

/** Lo que una persona tiene que confirmar antes de que esto llegue a un cliente. */
export function cadStandardsPendingVerification(): readonly CadStandardSource[] {
  return CAD_MEXICAN_DRAFTING_SOURCES.filter((source) => !!source.verify);
}
