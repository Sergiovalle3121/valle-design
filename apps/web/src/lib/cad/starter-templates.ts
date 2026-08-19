/**
 * PLANTILLAS DE ARRANQUE: el documento que ya está configurado al abrirse.
 *
 * ## El minuto cero decide la venta
 *
 * Un arquitecto que paga 2.179 MXN al mes por AutoCAD no cambia por precio.
 * Cambia cuando el coste de cambiar es casi cero, y ese coste se paga entero en
 * los primeros cinco minutos. Un lienzo en blanco los gasta todos: antes de
 * trazar el primer muro hay que crear las capas, decidir sus grosores, definir
 * un estilo de cota, fijar la escala de la lámina y dibujar un cajetín. Nadie
 * hace eso para probar un producto — cierra la pestaña.
 *
 * Aquí una plantilla NO es una lista de recomendaciones: es un `CadDocument`
 * entero y válido, con sus capas, sus estilos, su presentación a escala y su
 * cajetín relleno. Se elige en el diálogo de «Nuevo documento» y lo que se abre
 * ya se puede acotar y trazar.
 *
 * ## Por qué devuelve el documento completo y no un parche
 *
 * Porque el guardado es el que valida. La API rechaza con 400 un documento cuya
 * geometría —incluida la que vive DENTRO de un bloque— nombre una capa que el
 * documento no declara. Un parche que añadiera capas «encima» de un documento
 * ya creado dejaría una ventana en la que el dibujo existe a medias; devolver el
 * documento entero hace que el primer guardado sea o completo o ninguno.
 *
 * ## Por qué las capas del editor siguen estando aunque no se vean bonitas
 *
 * Los 30 bloques arquitectónicos sembrados dibujan su geometría en `architecture`
 * y `equipment`, que son ids de `DEFAULT_CAD_LAYERS`. Una plantilla que sólo
 * declarara capas en español convertiría «colocar una puerta» en «el documento
 * ya no se puede guardar»: la validación de la API mira las capas de las
 * entidades del bloque contra las declaradas. Así que el sustrato del editor se
 * conserva ENTERO y las capas de oficio se añaden encima. Es fealdad a cambio de
 * que la puerta entre.
 *
 * ## Por qué las alturas de texto no son números escritos a mano
 *
 * Un rótulo de plano se mide en el PAPEL: 2,5 mm, siempre. Lo que cambia con la
 * escala es cuánto mide en el modelo — 125 unidades a 1:50 y 500 a 1:200. Esa
 * conversión ya vive en `layout/annotative-scale.ts` y se usa desde aquí en vez
 * de copiar las cifras: si la plantilla dijera «125» a secas, la de conjunto a
 * 1:200 saldría con una letra cuatro veces más pequeña de lo legible y nadie lo
 * vería hasta imprimir.
 *
 * ## Milímetros
 *
 * `unit: "mm"`, como los bloques sembrados y como el editor. Una plantilla en
 * metros haría que la primera puerta insertada midiera 900 metros.
 */
import {
  CAD_DOCUMENT_SCHEMA,
  type CadDocument,
  type CadLayerDef,
  type CadPaperSpace,
  type CadStyleTable,
} from "./cad-document";
import { DEFAULT_CAD_LAYERS } from "./layers";
import { createCadLayout } from "./layout/layout-operations";
import { cadAnnotativeModelHeight } from "./layout/annotative-scale";
import { CAD_SHEET_PAPERS, type CadSheetPaper } from "./paper-space";
import { CAD_TITLE_BLOCK_HEIGHT_MM } from "./plot/title-block";

export type CadStarterTemplateId =
  | "planta-arquitectonica"
  | "planta-de-conjunto"
  | "alzados-y-cortes"
  | "plano-de-instalaciones";

/** Las cuatro, en el orden en que se ofrecen. */
export const CAD_STARTER_TEMPLATE_IDS: readonly CadStarterTemplateId[] = [
  "planta-arquitectonica",
  "planta-de-conjunto",
  "alzados-y-cortes",
  "plano-de-instalaciones",
];

/**
 * Altura de rótulo sobre el PAPEL. 2,5 mm es el mínimo de ISO 3098 que sigue
 * leyéndose en una copia heliográfica y en un PDF impreso al 100 %.
 */
export const CAD_STARTER_TEXT_MM = 2.5;
/** Título de plano o nombre de local: el doble, para que destaque. */
export const CAD_STARTER_TITLE_MM = 5;
/**
 * Flecha de cota sobre el papel. En arquitectura mexicana la cota no lleva
 * punta de flecha sino un trazo a 45°, y ese trazo se dibuja a la misma medida.
 */
export const CAD_STARTER_ARROW_MM = 2.5;

/**
 * Márgenes ISO 5457: 20 mm a la izquierda para el archivado.
 *
 * Se repiten aquí porque son la base del ÁREA ÚTIL con la que se calcula qué
 * trozo de modelo cabe en la lámina, y ese cálculo no puede depender de un valor
 * privado de otro módulo. `createCadLayout` los aplica sobre la presentación por
 * su lado, con la plantilla de papel.
 */
const ISO_MARGINS = { top: 10, right: 10, bottom: 10, left: 20 } as const;

export interface CadStarterLayer {
  id: string;
  name: string;
  color: string;
  /** Grosor de pluma en mm. Es lo que decide el peso de la línea impresa. */
  lineweight: number;
  linetype?: string;
  /** `false` para las capas de referencia que no deben salir en el papel. */
  plot?: boolean;
  /** Para qué es. Lo lee el arquitecto, no el código. */
  purpose: string;
}

export interface CadStarterTemplate {
  id: CadStarterTemplateId;
  label: string;
  description: string;
  /** Disciplina que se imprime en el cajetín. */
  discipline: string;
  /** Denominador de la escala: 50 es 1:50. */
  scale: number;
  paper: CadSheetPaper;
  orientation: "portrait" | "landscape";
  /** Id de la plantilla de papel de `CAD_LAYOUT_TEMPLATES`. */
  layoutTemplateId: string;
  /** Nombre de la pestaña de presentación. */
  sheetName: string;
  /** Número de lámina, con la letra de disciplina mexicana usual. */
  sheetNumber: string;
  /** Capa activa sugerida: en la que se empieza a dibujar. */
  startLayer: string;
  layers: readonly CadStarterLayer[];
}

const layer = (
  id: string,
  name: string,
  color: string,
  lineweight: number,
  purpose: string,
  extra: { linetype?: string; plot?: boolean } = {},
): CadStarterLayer => ({ id, name, color, lineweight, purpose, ...extra });

/**
 * Capas que llevan las cuatro. La acotación y el texto no son de una disciplina:
 * son de todos los planos, y separarlas es lo que permite entregar un plano sin
 * cotas al constructor de obra negra y con ellas al residente.
 */
const COMMON_LAYERS: readonly CadStarterLayer[] = [
  layer("COTA", "Acotación", "#ff00ff", 0.13, "Cotas y sus líneas de extensión."),
  layer("TEXTO", "Textos", "#00ffff", 0.18, "Nombres de local, notas y claves."),
  layer(
    "EJE",
    "Ejes",
    "#ff0000",
    0.13,
    "Ejes estructurales y de trazo.",
    { linetype: "CENTER" },
  ),
  layer(
    "AUXILIAR",
    "Auxiliar",
    "#808080",
    0.09,
    "Construcción auxiliar: se dibuja, no se imprime.",
    { plot: false },
  ),
];

/** Muros y vanos: comunes a planta arquitectónica, alzados e instalaciones. */
const BUILDING_LAYERS: readonly CadStarterLayer[] = [
  layer("MURO", "Muros", "#ffffff", 0.35, "Muros de carga y divisorios, cortados."),
  layer("VANO", "Puertas y ventanas", "#ffff00", 0.25, "Carpintería, cancelería y su barrido."),
  layer("MOBILIARIO", "Mobiliario", "#00ff00", 0.13, "Muebles fijos, baño y cocina."),
];

export const CAD_STARTER_TEMPLATES: readonly CadStarterTemplate[] = [
  {
    id: "planta-arquitectonica",
    label: "Planta arquitectónica",
    description:
      "Planta a 1:50 en A1 con muros, vanos, ejes, mobiliario y acotación separados, y el cajetín puesto.",
    discipline: "Arquitectura",
    scale: 50,
    paper: "A1",
    orientation: "landscape",
    layoutTemplateId: "a1-landscape",
    sheetName: "Planta arquitectónica",
    sheetNumber: "A-101",
    startLayer: "MURO",
    layers: [
      ...BUILDING_LAYERS,
      layer("NIVEL", "Niveles", "#00ffff", 0.13, "Símbolos de nivel de piso terminado."),
      layer("PLAFON", "Plafones", "#8000ff", 0.13, "Proyección de plafón y entrepiso.", {
        linetype: "DASHED",
      }),
      ...COMMON_LAYERS,
    ],
  },
  {
    id: "planta-de-conjunto",
    label: "Planta de conjunto",
    description:
      "Conjunto a 1:200 en A1 con lindero, vialidad, vegetación y la construcción en proyección.",
    discipline: "Arquitectura",
    scale: 200,
    paper: "A1",
    orientation: "landscape",
    layoutTemplateId: "a1-landscape",
    sheetName: "Planta de conjunto",
    sheetNumber: "A-001",
    startLayer: "LINDERO",
    layers: [
      layer("LINDERO", "Lindero", "#ffffff", 0.5, "Poligonal del predio, con rumbos y distancias."),
      layer("CONSTRUCCION", "Construcción", "#ffff00", 0.35, "Huella construida y su azotea."),
      layer("VIALIDAD", "Vialidad", "#808080", 0.25, "Calle, banqueta y guarnición."),
      layer("VEGETACION", "Vegetación", "#00ff00", 0.13, "Arbolado y áreas jardinadas."),
      layer("TERRENO", "Terreno", "#804000", 0.13, "Curvas de nivel del terreno natural.", {
        linetype: "CONTINUOUS",
      }),
      layer("NORTE", "Norte y escala", "#ff00ff", 0.25, "Rosa de los vientos y escala gráfica."),
      ...COMMON_LAYERS,
    ],
  },
  {
    id: "alzados-y-cortes",
    label: "Alzados y cortes",
    description:
      "Fachadas y secciones a 1:50 en A1, con el corte grueso separado de lo que se ve en proyección.",
    discipline: "Arquitectura",
    scale: 50,
    paper: "A1",
    orientation: "landscape",
    layoutTemplateId: "a1-landscape",
    sheetName: "Alzados y cortes",
    sheetNumber: "A-301",
    startLayer: "CORTE",
    layers: [
      layer("CORTE", "Elementos cortados", "#ffffff", 0.5, "Lo que la sección atraviesa: muros, losas."),
      layer("PROYECCION", "Proyección", "#00ffff", 0.18, "Lo que se ve detrás del plano de corte."),
      ...BUILDING_LAYERS.filter((item) => item.id !== "MURO"),
      layer("NIVEL", "Niveles", "#00ffff", 0.13, "Líneas y símbolos de nivel: NPT, NIVEL DE LOSA."),
      layer(
        "TERRENO-NAT",
        "Terreno natural",
        "#804000",
        0.25,
        "Perfil del terreno antes de excavar.",
        { linetype: "DASHED" },
      ),
      ...COMMON_LAYERS,
    ],
  },
  {
    id: "plano-de-instalaciones",
    label: "Plano de instalaciones",
    description:
      "Instalaciones a 1:50 en A1 con hidráulica, sanitaria, eléctrica y gas en capas propias sobre la arquitectura atenuada.",
    discipline: "Instalaciones",
    scale: 50,
    paper: "A1",
    orientation: "landscape",
    layoutTemplateId: "a1-landscape",
    sheetName: "Instalaciones",
    sheetNumber: "I-101",
    startLayer: "INST-HID",
    layers: [
      layer("INST-HID", "Hidráulica fría", "#0000ff", 0.25, "Agua fría: tuberías, válvulas y salidas."),
      layer("INST-HID-CAL", "Hidráulica caliente", "#ff0000", 0.25, "Agua caliente, desde el calentador.", {
        linetype: "DASHED",
      }),
      layer("INST-SAN", "Sanitaria", "#804000", 0.35, "Drenaje, ventilación y registros."),
      layer("INST-ELE", "Eléctrica", "#ffff00", 0.25, "Circuitos, salidas, apagadores y tablero."),
      layer("INST-GAS", "Gas", "#ff8000", 0.25, "Tubería de gas L.P. y su medidor."),
      layer("SIMBOLO", "Simbología", "#ff00ff", 0.18, "Símbolos de salida y cuadro de simbología."),
      layer(
        "ARQ-FONDO",
        "Arquitectura de fondo",
        "#808080",
        0.09,
        "Muros y muebles del arquitectónico, atenuados como referencia.",
      ),
      ...COMMON_LAYERS,
    ],
  },
];

export function cadStarterTemplate(
  id: string,
): CadStarterTemplate | undefined {
  return CAD_STARTER_TEMPLATES.find((template) => template.id === id);
}

/**
 * Área de modelo que cabe en la lámina a la escala de la plantilla.
 *
 * No es decorativo: es lo que decide si la casa entra en la hoja. Se calcula
 * desde el papel MENOS los márgenes de archivado y MENOS la banda del cajetín,
 * que es exactamente el hueco por el que se ve el dibujo. Un `modelBounds`
 * inventado daría una ventana que encuadra aire o que corta el plano, y el
 * arquitecto lo descubriría al imprimir.
 */
export function cadStarterModelBounds(template: CadStarterTemplate): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const base = CAD_SHEET_PAPERS[template.paper];
  const page =
    template.orientation === "portrait"
      ? { width: base.width, height: base.height }
      : { width: base.height, height: base.width };
  const usableWidth = page.width - ISO_MARGINS.left - ISO_MARGINS.right;
  const usableHeight =
    page.height - ISO_MARGINS.top - ISO_MARGINS.bottom - CAD_TITLE_BLOCK_HEIGHT_MM;
  return {
    x: 0,
    y: 0,
    // Los milímetros de papel por la escala son milímetros de modelo, porque el
    // documento está en milímetros. En otra unidad habría que dividir.
    width: usableWidth * template.scale,
    height: usableHeight * template.scale,
  };
}

/** Nombre del estilo de cota de la plantilla: `COTA 1:50`. */
export function cadStarterDimensionStyleName(template: CadStarterTemplate): string {
  return `COTA 1:${template.scale}`;
}

/** Nombres de los dos estilos de texto que trae toda plantilla. */
export const CAD_STARTER_TEXT_STYLE = "ROTULO";
export const CAD_STARTER_TITLE_STYLE = "TITULO";
export const CAD_STARTER_MLEADER_STYLE = "DIRECTRIZ";
export const CAD_STARTER_PLOT_STYLE = "MONOCROMO";

/**
 * La tabla de estilos de la plantilla, atada a su escala.
 *
 * Las alturas salen de `cadAnnotativeModelHeight`, no de una constante: es la
 * MISMA función que reescala los rótulos cuando el arquitecto cambia la escala
 * de la ventana, de modo que la plantilla nace ya coherente con lo que el
 * comando de anotatividad hará después. Dos fuentes distintas para el mismo
 * número es la vía garantizada a un plano con dos tamaños de letra.
 */
export function cadStarterStyleTable(template: CadStarterTemplate): CadStyleTable {
  const textHeight = cadAnnotativeModelHeight(CAD_STARTER_TEXT_MM, template.scale, "mm");
  const titleHeight = cadAnnotativeModelHeight(CAD_STARTER_TITLE_MM, template.scale, "mm");
  const arrowSize = cadAnnotativeModelHeight(CAD_STARTER_ARROW_MM, template.scale, "mm");
  return {
    text: {
      [CAD_STARTER_TEXT_STYLE]: { fontFamily: "Helvetica", height: textHeight },
      [CAD_STARTER_TITLE_STYLE]: { fontFamily: "Helvetica", height: titleHeight },
    },
    dimension: {
      [cadStarterDimensionStyleName(template)]: {
        textStyle: CAD_STARTER_TEXT_STYLE,
        arrowSize,
        // Cero decimales porque el dibujo está en MILÍMETROS: un muro de 3.450
        // mm se lee «3450». Dos decimales sobre milímetros imprimirían
        // «3450.00», que es ruido y además sugiere una precisión de centésima
        // de milímetro que ninguna obra tiene.
        precision: 0,
      },
    },
    mleader: {
      [CAD_STARTER_MLEADER_STYLE]: {
        textStyle: CAD_STARTER_TEXT_STYLE,
        arrowSize,
        doglegLength: arrowSize * 2,
        landing: true,
      },
    },
    table: {
      CUADRO: { textStyle: CAD_STARTER_TEXT_STYLE, rowHeight: textHeight * 2 },
    },
    plot: {
      [CAD_STARTER_PLOT_STYLE]: { colorMode: "monochrome", lineweightScale: 1 },
    },
  };
}

/**
 * Capas de la plantilla, en la forma que persiste el documento.
 *
 * El sustrato del editor va PRIMERO y las de oficio después: quien lea la lista
 * ve arriba lo que el producto necesita y abajo lo que él va a usar. El orden
 * también es el de la paleta de capas, y una capa de oficio enterrada bajo
 * nueve del sistema sería una capa que nadie encuentra… pero al revés, un
 * `architecture` perdido al final es una capa que nadie sabe que existe cuando
 * la puerta insertada aparece «en ninguna parte». Se elige que el sustrato sea
 * visible.
 */
export function cadStarterLayers(template: CadStarterTemplate): CadLayerDef[] {
  const base: CadLayerDef[] = DEFAULT_CAD_LAYERS.map((item) => ({
    id: item.id,
    name: item.label,
    color: item.color,
    visible: true,
    locked: false,
    plot: true,
  }));
  const declared = new Set(base.map((item) => item.id));
  for (const item of template.layers) {
    if (declared.has(item.id)) continue;
    declared.add(item.id);
    base.push({
      id: item.id,
      name: item.name,
      color: item.color,
      visible: true,
      locked: false,
      lineweight: item.lineweight,
      ...(item.linetype ? { linetype: item.linetype } : {}),
      plot: item.plot ?? true,
    });
  }
  return base;
}

export interface CadStarterDocumentInput {
  templateId: CadStarterTemplateId | string;
  /** Nombre del proyecto para el cajetín. */
  project?: string;
  client?: string;
  /** Título de la lámina. Sin él, el de la plantilla. */
  title?: string;
  drawingNumber?: string;
  revision?: string;
  drawnBy?: string;
  checkedBy?: string;
  /** Fecha ya formateada. Se INYECTA: un `new Date()` aquí haría el documento
   *  irreproducible y la spec no podría afirmar nada sobre el cajetín. */
  date?: string;
  /** Paso de rejilla en mm. 100 mm es el que usa el editor por defecto. */
  gridSize?: number;
}

/** Error tipado: elegir una plantilla que no existe no puede fallar en silencio. */
export class CadStarterTemplateError extends Error {
  readonly code = "cad_starter_template_unknown";
  constructor(readonly templateId: string) {
    super(
      `No existe la plantilla de arranque «${templateId}». Las disponibles son: ${CAD_STARTER_TEMPLATE_IDS.join(", ")}.`,
    );
    this.name = "CadStarterTemplateError";
  }
}

/**
 * El cajetín de la lámina.
 *
 * `createCadPaperSpace` rellena diez atributos y deja fuera tres que el
 * arquitecto SÍ mira: cliente, fecha y unidades. Se añaden aquí con las claves
 * en español que `resolveCadTitleBlockFields` ya sabe leer (`CLIENTE`, `FECHA`),
 * de modo que el trazador los encuentra sin adaptador. La escala NO se escribe:
 * la calcula el cajetín desde la ventana gráfica, y una copia escrita a mano es
 * la que acaba diciendo 1:50 en una lámina que se trazó a 1:100.
 */
function starterTitleBlock(
  space: CadPaperSpace,
  template: CadStarterTemplate,
  input: CadStarterDocumentInput,
): CadPaperSpace["titleBlock"] {
  return {
    ...space.titleBlock,
    attributes: {
      ...space.titleBlock?.attributes,
      CLIENTE: input.client?.trim() || "-",
      FECHA: input.date?.trim() || "-",
      UNIDADES: "mm",
    },
  };
}

/**
 * Construye el documento de arranque.
 *
 * Puro y determinista: sin `Date.now()`, sin identificadores aleatorios. Dos
 * llamadas con la misma entrada producen el mismo JSON, que es lo que permite
 * que una spec afirme sobre el cajetín y que un golden compare documentos.
 */
export function createCadStarterDocument(
  input: CadStarterDocumentInput,
): CadDocument {
  const template = cadStarterTemplate(input.templateId);
  if (!template) throw new CadStarterTemplateError(String(input.templateId));

  const bounds = cadStarterModelBounds(template);
  const title = input.title?.trim() || template.sheetName;
  const space = createCadLayout([], {
    id: `layout:${template.id}`,
    name: template.sheetName,
    templateId: template.layoutTemplateId,
    modelBounds: bounds,
    unit: "mm",
    scale: template.scale,
    metadata: {
      project: input.project?.trim() || "Proyecto sin nombre",
      drawingNumber: input.drawingNumber?.trim() || template.sheetNumber,
      title,
      sheetNumber: template.sheetNumber,
      revision: input.revision?.trim() || "A",
      discipline: template.discipline,
      preparedBy: input.drawnBy?.trim() || "-",
      checkedBy: input.checkedBy?.trim() || "-",
    },
  });

  const paperSpace: CadPaperSpace = {
    ...space,
    viewports: (space.viewports ?? []).map((viewport) => ({
      ...viewport,
      scale: template.scale,
      // La escala de anotación arranca IGUAL que la de la ventana. Que puedan
      // divergir es una capacidad (un detalle a 1:5 dentro de una lámina a
      // 1:50); que diverjan al nacer sería un defecto.
      annotationScale: template.scale,
      // Bloqueada: el primer zoom dentro de la ventana desharía la escala, y una
      // lámina que dice 1:50 y está a 1:53,4 es una lámina que no se puede usar
      // para medir en obra.
      locked: true,
    })),
    titleBlock: starterTitleBlock(space, template, input),
  };

  return {
    meta: {
      version: 1,
      schema: CAD_DOCUMENT_SCHEMA,
      unit: "mm",
      footprintW: bounds.width,
      footprintH: bounds.height,
      gridSize: input.gridSize ?? 100,
    },
    layers: cadStarterLayers(template),
    entities: [],
    history: [{ version: 1, label: `Plantilla de arranque: ${template.label}` }],
    modelSpace: { entityIds: [] },
    paperSpaces: [paperSpace],
    styles: cadStarterStyleTable(template),
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}
