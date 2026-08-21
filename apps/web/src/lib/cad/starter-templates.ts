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
 * ## Por qué las capas y los estilos NO se escriben aquí
 *
 * Porque una plantilla no es el sitio donde se decide una norma de dibujo. Las
 * capas salen de `standards/mexican-layers.ts` y los estilos de
 * `standards/mexican-annotation.ts`, que son los módulos que además CITAN la
 * fuente de cada convención. Una plantilla que escribiera sus propios colores
 * acabaría contradiciendo a la norma sin que nadie se enterase, y la norma
 * dejaría de ser norma para ser una sugerencia con documentación.
 *
 * Aquí sólo se dice QUÉ capas lleva cada lámina. El cómo se ve cada una vive en
 * un sitio y sólo en uno.
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
 * ## Milímetros
 *
 * `unit: "mm"`, como los bloques sembrados y como el editor. Una plantilla en
 * metros haría que la primera puerta insertada midiera 900 metros. Que el
 * DIBUJO esté en milímetros y las COTAS se rotulen en metros no es una
 * contradicción: es exactamente lo que hace un plano mexicano.
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
import { type CadSheetPaper } from "./paper-space";
import {
  CAD_MEXICAN_TITLE_BLOCK_HEIGHT_MM,
  CAD_TITLE_BLOCK_VARIANT_ATTRIBUTE,
} from "./plot/title-block";
import { cadMexicanLayerDefs } from "./standards/mexican-layers";
import {
  CAD_MEXICAN_TEXT_MM,
  CAD_MEXICAN_TEXT_STYLES,
  CAD_MEXICAN_TICK_MM,
  cadMexicanDimensionStyleName,
  cadMexicanDimensionStyles,
  cadMexicanScale,
  cadMexicanTextStyles,
} from "./standards/mexican-annotation";
import {
  CAD_ISO_SHEET_MARGINS_MM,
  CAD_MEXICAN_PAPERS,
  CadMexicanPaperError,
  cadSheetSize,
} from "./standards/mexican-sheets";

export type CadStarterTemplateId =
  | "planta-arquitectonica"
  | "planta-de-conjunto"
  | "alzados-y-cortes"
  | "planta-de-demolicion"
  | "plano-estructural"
  | "plano-de-instalaciones";

/** Las seis, en el orden en que se ofrecen: el orden del juego de planos. */
export const CAD_STARTER_TEMPLATE_IDS: readonly CadStarterTemplateId[] = [
  "planta-arquitectonica",
  "planta-de-conjunto",
  "alzados-y-cortes",
  "planta-de-demolicion",
  "plano-estructural",
  "plano-de-instalaciones",
];

/** Altura de rótulo sobre el PAPEL, de la serie de ISO 3098-1. */
export const CAD_STARTER_TEXT_MM = CAD_MEXICAN_TEXT_MM.rotulo;
/** Título de plano o nombre de local: el doble, para que destaque. */
export const CAD_STARTER_TITLE_MM = CAD_MEXICAN_TEXT_MM.titulo;
/** Garrapata de cota sobre el papel: a la misma medida que el rótulo. */
export const CAD_STARTER_ARROW_MM = CAD_MEXICAN_TICK_MM;

/** Márgenes ISO 5457: 20 mm a la izquierda para el archivado. */
const ISO_MARGINS = CAD_ISO_SHEET_MARGINS_MM;

export interface CadStarterTemplate {
  id: CadStarterTemplateId;
  label: string;
  description: string;
  /** Disciplina que se imprime en el cajetín. */
  discipline: string;
  /** Denominador de la escala: 50 es 1:50. */
  scale: number;
  /** Papel por defecto. El usuario puede pedir otro de la serie A. */
  paper: CadSheetPaper;
  orientation: "portrait" | "landscape";
  /** Nombre de la pestaña de presentación. */
  sheetName: string;
  /** Clave de lámina, con la letra de disciplina mexicana usual. */
  sheetNumber: string;
  /** Capa activa sugerida: en la que se empieza a dibujar. */
  startLayer: string;
  /** Ids de la norma de capas mexicana. El aspecto de cada una vive allí. */
  layerIds: readonly string[];
}

/**
 * Capas que llevan las seis.
 *
 * La acotación y el texto no son de una disciplina: son de todos los planos, y
 * separarlas es lo que permite entregar un plano sin cotas al constructor de
 * obra negra y con ellas al residente. El eje y la auxiliar están por la misma
 * razón: se apagan, no se borran.
 */
const COMMON_LAYERS = ["COTA", "TEXTO", "EJE", "AUXILIAR"] as const;

export const CAD_STARTER_TEMPLATES: readonly CadStarterTemplate[] = [
  {
    id: "planta-arquitectonica",
    label: "Planta arquitectónica",
    description:
      "Planta a 1:50 en A1 con muros, vanos, cancelería, mobiliario y acotación separados, y el cajetín con responsiva puesto.",
    discipline: "Arquitectura",
    scale: 50,
    paper: "A1",
    orientation: "landscape",
    sheetName: "Planta arquitectónica",
    sheetNumber: "A-101",
    startLayer: "MURO",
    layerIds: ["MURO", "VANO", "CANCEL", "MOBILIARIO", "NIVEL", "PLAFON", ...COMMON_LAYERS],
  },
  {
    id: "planta-de-conjunto",
    label: "Planta de conjunto",
    description:
      "Conjunto a 1:200 en A1 con lindero, vialidad, vegetación, terreno natural y de proyecto, y la construcción en proyección.",
    discipline: "Arquitectura",
    scale: 200,
    paper: "A1",
    orientation: "landscape",
    sheetName: "Planta de conjunto",
    sheetNumber: "A-001",
    startLayer: "LINDERO",
    layerIds: [
      "LINDERO",
      "CONSTRUCCION",
      "VIALIDAD",
      "VEGETACION",
      "TERRENO",
      "TERRENO-NAT",
      "TERRENO-PRO",
      "NORTE",
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
    sheetName: "Alzados y cortes",
    sheetNumber: "A-301",
    startLayer: "CORTE",
    layerIds: [
      "CORTE",
      "PROYECCION",
      "VANO",
      "CANCEL",
      "MOBILIARIO",
      "NIVEL",
      "TERRENO-NAT",
      ...COMMON_LAYERS,
    ],
  },
  {
    id: "planta-de-demolicion",
    label: "Demolición y obra nueva",
    description:
      "Remodelación a 1:50 en A1 con lo existente en gris, lo que se demuele en amarillo a trazos y la obra nueva en rojo.",
    discipline: "Arquitectura",
    scale: 50,
    paper: "A1",
    orientation: "landscape",
    sheetName: "Demolición y obra nueva",
    sheetNumber: "A-201",
    startLayer: "MURO-DEM",
    layerIds: ["MURO-EXI", "MURO-DEM", "MURO-NUE", "VANO", "CANCEL", "NIVEL", ...COMMON_LAYERS],
  },
  {
    id: "plano-estructural",
    label: "Cimentación y estructura",
    description:
      "Cimentación y estructura a 1:50 en A1, con lo enterrado a trazos y la arquitectura atenuada de fondo.",
    discipline: "Estructura",
    scale: 50,
    paper: "A1",
    orientation: "landscape",
    sheetName: "Cimentación y estructura",
    sheetNumber: "E-101",
    startLayer: "EST",
    layerIds: ["EST", "EST-CIM", "NIVEL", "ARQ-FONDO", ...COMMON_LAYERS],
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
    sheetName: "Instalaciones",
    sheetNumber: "I-101",
    startLayer: "INST-HID",
    layerIds: [
      "INST-HID",
      "INST-HID-CAL",
      "INST-SAN",
      "INST-ELE",
      "INST-GAS",
      "SIMBOLO",
      "ARQ-FONDO",
      ...COMMON_LAYERS,
    ],
  },
];

export function cadStarterTemplate(id: string): CadStarterTemplate | undefined {
  return CAD_STARTER_TEMPLATES.find((template) => template.id === id);
}

/** Papel efectivo: el pedido, si es de la serie A; si no, el de la plantilla. */
function resolvePaper(template: CadStarterTemplate, paper?: string): CadSheetPaper {
  if (!paper) return template.paper;
  if (!(CAD_MEXICAN_PAPERS as readonly string[]).includes(paper))
    throw new CadMexicanPaperError(paper);
  return paper as CadSheetPaper;
}

/** Id de la plantilla de papel de `CAD_LAYOUT_TEMPLATES` para papel+orientación. */
function layoutTemplateId(paper: CadSheetPaper, orientation: string): string {
  return `${paper.toLowerCase()}-${orientation}`;
}

/**
 * Área de modelo que cabe en la lámina a la escala de la plantilla.
 *
 * No es decorativo: es lo que decide si la casa entra en la hoja. Se calcula
 * desde el papel MENOS los márgenes de archivado y MENOS la banda del cajetín
 * mexicano —50 mm, no 30—, que es exactamente el hueco por el que se ve el
 * dibujo. Un `modelBounds` inventado daría una ventana que encuadra aire o que
 * corta el plano, y el arquitecto lo descubriría al imprimir.
 */
export function cadStarterModelBounds(
  template: CadStarterTemplate,
  paper?: string,
): { x: number; y: number; width: number; height: number } {
  const page = cadSheetSize(resolvePaper(template, paper), template.orientation);
  const usableWidth = page.width - ISO_MARGINS.left - ISO_MARGINS.right;
  const usableHeight =
    page.height - ISO_MARGINS.top - ISO_MARGINS.bottom - CAD_MEXICAN_TITLE_BLOCK_HEIGHT_MM;
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
  return cadMexicanDimensionStyleName(cadMexicanScale(template.scale));
}

/** Nombres de los estilos que trae toda plantilla. */
export const CAD_STARTER_TEXT_STYLE = CAD_MEXICAN_TEXT_STYLES.rotulo;
export const CAD_STARTER_TITLE_STYLE = CAD_MEXICAN_TEXT_STYLES.titulo;
export const CAD_STARTER_MLEADER_STYLE = "DIRECTRIZ";
export const CAD_STARTER_PLOT_STYLE = "MONOCROMO";

/**
 * La tabla de estilos de la plantilla.
 *
 * Los de texto van a la escala de LA LÁMINA; los de cota vienen TODOS, uno por
 * cada escala de dibujo mexicana. Ocho estilos de cota parecen muchos hasta que
 * se cuenta lo que cuesta el que falta: pasar una planta de 1:50 a 1:75 sin
 * estilo preparado es reacotar el plano entero o imprimirlo con la letra a 1,7
 * milímetros.
 */
export function cadStarterStyleTable(template: CadStarterTemplate): CadStyleTable {
  const textHeight = cadAnnotativeModelHeight(CAD_STARTER_TEXT_MM, template.scale, "mm");
  const arrowSize = cadAnnotativeModelHeight(CAD_STARTER_ARROW_MM, template.scale, "mm");
  return {
    text: cadMexicanTextStyles(template.scale, "mm"),
    dimension: cadMexicanDimensionStyles("mm"),
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
  for (const def of cadMexicanLayerDefs(template.layerIds)) {
    if (declared.has(def.id)) continue;
    declared.add(def.id);
    base.push(def);
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
  /** Papel de la serie A. Sin él, el de la plantilla. */
  paper?: string;
  /** Ubicación de la obra: lo primero que mira una ventanilla. */
  location?: string;
  /** Propietario del predio. */
  owner?: string;
  /** Director Responsable de Obra y su número de registro. */
  dro?: string;
  droRegistration?: string;
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
 * `createCadPaperSpace` rellena diez atributos y deja fuera los que un plano
 * mexicano SÍ necesita: cliente, fecha, unidades, ubicación de la obra,
 * propietario y la responsiva del Director Responsable de Obra. Se añaden aquí
 * con las claves en español que `resolveCadTitleBlockFields` ya sabe leer, de
 * modo que el trazador los encuentra sin adaptador.
 *
 * `TITLE_BLOCK_VARIANT` es el que hace que las veinte láminas del juego salgan
 * con la MISMA disposición: la elección viaja con la presentación, no con quien
 * pulsa trazar. La escala NO se escribe: la calcula el cajetín desde la ventana
 * gráfica, y una copia escrita a mano es la que acaba diciendo 1:50 en una
 * lámina trazada a 1:100.
 *
 * El D.R.O. se deja en blanco si nadie lo dio, y el cajetín lo declarará como
 * ausente. Es correcto: inventar un nombre de responsable en un plano que se
 * presenta ante una autoridad sería mucho peor que dejar el hueco.
 */
function starterTitleBlock(
  space: CadPaperSpace,
  input: CadStarterDocumentInput,
): CadPaperSpace["titleBlock"] {
  const attributes: Record<string, string> = {
    ...space.titleBlock?.attributes,
    [CAD_TITLE_BLOCK_VARIANT_ATTRIBUTE]: "mexicano",
    CLIENTE: input.client?.trim() || "-",
    FECHA: input.date?.trim() || "-",
    UNIDADES: "mm",
    UBICACION: input.location?.trim() || "-",
    PROPIETARIO: input.owner?.trim() || "-",
    DRO: input.dro?.trim() || "-",
    DRO_REGISTRO: input.droRegistration?.trim() || "-",
  };
  return { ...space.titleBlock, attributes };
}

/**
 * Construye el documento de arranque.
 *
 * Puro y determinista: sin `Date.now()`, sin identificadores aleatorios. Dos
 * llamadas con la misma entrada producen el mismo JSON, que es lo que permite
 * que una spec afirme sobre el cajetín y que un golden compare documentos.
 */
export function createCadStarterDocument(input: CadStarterDocumentInput): CadDocument {
  const template = cadStarterTemplate(input.templateId);
  if (!template) throw new CadStarterTemplateError(String(input.templateId));

  const paper = resolvePaper(template, input.paper);
  const page = cadSheetSize(paper, template.orientation);
  const bounds = cadStarterModelBounds(template, paper);
  const title = input.title?.trim() || template.sheetName;
  const space = createCadLayout([], {
    id: `layout:${template.id}`,
    name: template.sheetName,
    templateId: layoutTemplateId(paper, template.orientation),
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

  // La ventana se recalcula ENTERA en vez de heredar la que trae la
  // presentación. La heredada ya respeta los márgenes ISO, pero reserva los
  // 30 mm del cajetín genérico y el mexicano mide 50: heredarla dejaría veinte
  // milímetros de dibujo encima del cajetín, y eso no se ve en pantalla.
  const paperBounds = {
    x: ISO_MARGINS.left,
    y: ISO_MARGINS.top,
    width: page.width - ISO_MARGINS.left - ISO_MARGINS.right,
    height:
      page.height - ISO_MARGINS.top - ISO_MARGINS.bottom - CAD_MEXICAN_TITLE_BLOCK_HEIGHT_MM,
  };

  const paperSpace: CadPaperSpace = {
    ...space,
    viewports: (space.viewports ?? []).map((viewport) => ({
      ...viewport,
      paperBounds,
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
    titleBlock: starterTitleBlock(space, input),
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
