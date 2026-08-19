/**
 * Corpus normal: español de despacho mexicano.
 *
 * CÓMO SE ESCRIBIÓ. Estas frases salen del vocabulario de obra —recámara,
 * cochera, clóset, sardinel, castillo, dala, trabe, losa, pretil, tablaroca,
 * patio de servicio— y de cómo se dictan las cotas de verdad: «muro de quince»
 * son 15 cm, «puerta de noventa» son 90 cm, «un claro de tres sesenta» son
 * 3,60 m. En México se mezclan metros y centímetros en la misma frase sin
 * avisar, y el producto tiene que resolverlo o equivocarse en un orden de
 * magnitud.
 *
 * LO QUE ESPERA CADA CASO es lo que un copiloto competente DEBERÍA producir,
 * expresado en el vocabulario de comandos del propio producto
 * (`commands/types.ts`). No se escribió leyendo el parser ni ajustando las
 * frases a lo que el parser ya sabe: eso convertiría el banco en un espejo y la
 * nota en autobombo. Por eso hay casos que el producto falla, y por eso siguen
 * aquí.
 *
 * LA REGLA QUE GOBIERNA ESTE ARCHIVO: ningún caso se borra ni se reescribe
 * porque falle. Si el producto no lo acierta, la nota baja y se publica.
 *
 * SIN ACENTOS A PROPÓSITO (familia `d-9x`). Nadie teclea acentos en la barra de
 * comandos con las manos llenas de plano. Son instrucciones LEGÍTIMAS mal
 * tecleadas, así que van en el corpus normal: acertarlas es entenderlas, no
 * rechazarlas. Las instrucciones que además son ambiguas o imposibles viven en
 * el corpus adversarial.
 */
import type { CadCommandId } from "../commands/types";
import type { NlCadCase } from "./types";

const c = (
  id: string,
  text: string,
  trait: string,
  commandId: CadCommandId,
  args?: Record<string, unknown>,
): NlCadCase => ({
  id,
  lane: "despacho",
  text,
  trait,
  expect: { kind: "command", commandId, args },
});

/** Trazo de muros y cuartos, con las cotas dictadas como en obra. */
const TRAZO: NlCadCase[] = [
  c("d-001", "muro de 0,0 a 6000,0", "trazo por coordenadas", "draw_wall_segment", {
    from: { x: 0, y: 0 },
    to: { x: 6000, y: 0 },
  }),
  c(
    "d-002",
    "muro de 0,0 a 0,8000 con espesor de 15 cm",
    "muro de quince dictado en centímetros",
    "draw_wall_segment",
    { thickness: 150 },
  ),
  c(
    "d-003",
    "muro de 200,200 a 200,5400 grosor 150",
    "espesor en milímetros, sin unidad",
    "draw_wall_segment",
    { thickness: 150 },
  ),
  c("d-004", "linea de 200,200 a 3200,200", "sinónimo de trazo", "draw_wall_segment"),
  c("d-005", "muro 3400,5400 @6400,0 grosor 150", "coordenada relativa @", "draw_wall_segment", {
    thickness: 150,
  }),
  c(
    "d-006",
    "muro de tablaroca de 4800,10600 a 4800,14800 espesor de 10 cm",
    "muro divisorio de tablaroca",
    "draw_wall_segment",
    { thickness: 100 },
  ),
  c(
    "d-007",
    "muro de 0,0 a 10000,0 con espesor de 0.15 m",
    "espesor en metros con decimal",
    "draw_wall_segment",
    { thickness: 150 },
  ),
  c(
    "d-008",
    "cuarto de 200,10600 a 4800,14800 etiqueta Recámara principal",
    "alta de cuarto con rótulo",
    "draw_rect_zone",
    { kind: "room", label: "Recámara principal" },
  ),
  c(
    "d-009",
    "zona de 5000,15000 a 9800,19600 etiqueta Patio trasero",
    "alta de zona con rótulo",
    "draw_rect_zone",
    { kind: "zone" },
  ),
  c("d-010", "rectangulo de 200,200 a 3200,5400", "cochera por rectángulo", "draw_rect_zone"),
];

/** Carpintería, herrería, muebles y equipo: lo que se coloca en el plano. */
const COLOCAR: NlCadCase[] = [
  c(
    "d-011",
    "pon una puerta de noventa en la recámara principal",
    "puerta de noventa = 90 cm",
    "place_symbol",
    { query: "puerta", into: "recámara principal" },
  ),
  c("d-012", "coloca el wc en el medio baño", "mueble de baño por nombre", "place_symbol", {
    query: "wc",
    into: "medio baño",
  }),
  c("d-013", "pon la regadera en el baño completo", "regadera, no ducha", "place_symbol", {
    query: "regadera",
  }),
  c("d-014", "coloca una ventana en la cocina", "ventanería", "place_symbol", {
    query: "ventana",
    into: "cocina",
  }),
  c("d-015", "pon la estufa en la cocina", "equipo de cocina", "place_symbol", {
    query: "estufa",
    into: "cocina",
  }),
  c(
    "d-016",
    "coloca 6 sillas junto a la mesa del comedor",
    "cantidad más ancla relacional",
    "place_symbol",
    { query: "silla", count: 6, anchor: "mesa" },
  ),
  c("d-017", "pon un closet en cada recámara", "una pieza por cuarto", "place_symbol", {
    query: "closet",
    perRoom: true,
  }),
  c("d-018", "coloca una jardinera en cada esquina", "esquinas del lote", "place_symbol", {
    query: "jardinera",
    corners: true,
  }),
  c("d-019", "pon la escalera en el patio de servicio", "escalera recta", "place_symbol", {
    query: "escalera",
  }),
  c("d-020", "coloca la cisterna en el patio trasero", "equipo hidráulico", "place_symbol", {
    query: "cisterna",
  }),
  c(
    "d-021",
    "pon una puerta girada 90 grados en la cocina",
    "colocación con rotación",
    "place_symbol",
    { query: "puerta", rotation: 90 },
  ),
  c("d-022", "coloca la cama matrimonial en la recámara 2", "mobiliario de recámara", "place_symbol", {
    query: "cama",
  }),
  c("d-023", "pon un lavabo a la izquierda del wc", "ancla con lado", "place_symbol", {
    query: "lavabo",
    anchorSide: "left",
  }),
  c("d-024", "coloca 3 columnas en la sala-comedor", "estructura repetida", "place_symbol", {
    query: "columna",
    count: 3,
  }),
];

/** Mover, centrar, recargar contra muro: las instrucciones más relacionales. */
const MOVER: NlCadCase[] = [
  c("d-025", "centra la mesa del comedor", "centrado en el footprint", "move_selection", {
    center: true,
    target: "mesa",
  }),
  c("d-026", "pega el ropero a la pared del fondo", "recargar contra muro", "move_selection", {
    target: "ropero",
    wall: "bottom",
  }),
  c("d-027", "mueve el tinaco 500 a la derecha", "desplazamiento relativo en mm", "move_selection", {
    target: "tinaco",
    dx: 500,
  }),
  c("d-028", "recorre el portón 2 metros a la derecha", "desplazamiento en metros", "move_selection", {
    target: "portón",
    dx: 2000,
  }),
  c("d-029", "mete la cama en la recámara principal", "destino por contenedor", "move_selection", {
    into: "recámara principal",
  }),
  c("d-030", "aleja el bóiler del tinaco 800", "alejamiento con distancia", "move_selection", {
    awayFrom: "tinaco",
    awayDist: 800,
  }),
  c("d-031", "mueve el lavadero a 1500,9200", "destino absoluto", "move_selection", {
    x: 1500,
    y: 9200,
  }),
  c("d-032", "acomoda las sillas en 2 filas", "matriz por filas", "move_selection", { rows: 2 }),
  c("d-033", "mueve la cisterna junto al patio de servicio", "destino relacional", "move_selection", {
    anchor: "patio de servicio",
  }),
];

/** Transformaciones sobre lo ya dibujado. */
const TRANSFORMAR: NlCadCase[] = [
  c("d-034", "gira el portón 90 grados", "rotación por nombre", "rotate_selection", {
    target: "portón",
    angle: 90,
  }),
  c("d-035", "rota la puerta de acceso 180", "rotación sin la palabra grados", "rotate_selection", {
    angle: 180,
  }),
  c("d-036", "escala la mesa del comedor al 150%", "escala en porcentaje", "scale_selection", {
    factor: 1.5,
  }),
  c("d-037", "duplica la ventana de la cocina", "duplicado por nombre", "duplicate_selection", {
    target: "ventana",
  }),
  c(
    "d-038",
    "haz espejo de la puerta de la recámara principal",
    "simetría de carpintería",
    "mirror_selection",
    { target: "puerta" },
  ),
  c("d-039", "espejea el muro de tablaroca", "simetría de muro", "mirror_selection", {
    target: "tablaroca",
  }),
  c("d-040", "borra el sardinel de la cochera", "sardinel: vocabulario de obra", "delete_selection", {
    target: "sardinel",
  }),
  c("d-041", "quita las ventanas", "borrado en plural", "delete_selection", { target: "ventana" }),
  c("d-042", "cambia el tamaño del clóset a 2000x900", "redimensionado explícito", "resize_object", {
    w: 2000,
    h: 900,
  }),
  c("d-043", "haz la trabe 500 más ancha", "ajuste relativo", "resize_object", { dw: 500 }),
  c("d-044", "haz el ropero del tamaño del clóset", "copiar medidas de otro", "resize_object", {
    like: "clóset",
  }),
  c(
    "d-045",
    "intercambia la recámara principal y la recámara 2",
    "permuta de dos cuartos",
    "swap_objects",
    { a: "recámara principal", b: "recámara 2" },
  ),
  c("d-046", "renombra la Cochera a Estacionamiento", "rótulo nuevo", "rename_object", {
    target: "Cochera",
    name: "Estacionamiento",
  }),
];

/** Arreglos: lo que en obra se repite (castillos, jardineras, columnas). */
const ARREGLOS: NlCadCase[] = [
  c(
    "d-047",
    "repite el castillo 6 veces cada 3 metros",
    "arreglo lineal con paso en metros",
    "array_rectangular",
    { cols: 6, gapX: 3000 },
  ),
  c("d-048", "haz un arreglo de 3 por 2 de los castillos", "arreglo rectangular", "array_rectangular", {
    cols: 3,
    rows: 2,
  }),
  c("d-049", "distribuye los castillos cada 3 metros", "reparto con paso fijo", "distribute_selection", {
    gap: 3000,
  }),
  c("d-050", "alinea los castillos a la izquierda", "alineación", "align_selection", {
    mode: "left",
  }),
  c("d-051", "alinea las ventanas arriba", "alineación vertical", "align_selection", {
    mode: "top",
  }),
  c("d-052", "acomoda las camas en linea", "acomodo en línea", "arrange_line"),
  c("d-053", "haz un arreglo polar de 8 piezas", "arreglo polar", "array_polar", { count: 8 }),
  c("d-054", "offset del muro de fachada a 150", "paralela a 15 cm", "offset_object", {
    distance: 150,
  }),
  c("d-055", "offset de 3 metros del muro de colindancia poniente", "paralela en metros", "offset_object", {
    distance: 3000,
  }),
];

/** Medir, contar, acotar y revisar: la mitad del día de un despacho. */
const MEDIR: NlCadCase[] = [
  c("d-056", "mide del Castillo K1 al Castillo K2", "medición de castillo a castillo", "measure_distance", {
    targetA: "Castillo K1",
    targetB: "Castillo K2",
  }),
  c("d-057", "área de la recámara principal", "superficie de un cuarto", "measure_area", {
    targetLabel: "recámara principal",
  }),
  c("d-058", "cuántas recámaras hay", "conteo por tipo", "count_objects", { query: "recámara" }),
  c("d-059", "¿cuántas puertas hay en cada cuarto?", "conteo desglosado por cuarto", "count_objects", {
    byRoom: true,
  }),
  c("d-060", "revisa si hay traslapes", "traslape: mexicanismo de colisión", "find_collisions"),
  c("d-061", "valida el plano", "validación general", "validate_layout"),
  c("d-062", "qué le falta al plano", "revisión de protección civil", "audit_plan"),
  c("d-063", "cuánto mide la trabe", "consulta de dimensiones", "object_info", { query: "trabe" }),
  c("d-064", "info del tinaco", "ficha de objeto", "object_info", { query: "tinaco" }),
  c("d-065", "acota las recámaras", "acotado por objetivo", "auto_dimension", { target: "recámara" }),
  c("d-066", "acota los claros entre los castillos", "acotado de claros", "auto_dimension", {
    mode: "gaps",
  }),
  c(
    "d-067",
    "haz un pasillo de 1.20 entre la cocina y la sala-comedor",
    "holgura dictada en metros con decimal",
    "create_clearance_aisle",
    { distance: 1200 },
  ),
  c(
    "d-068",
    "deja 90 centímetros libres entre la cama matrimonial y el ropero",
    "holgura dictada en centímetros",
    "create_clearance_aisle",
    { distance: 900 },
  ),
  c("d-069", "crea una zona alrededor con margen de 500", "envolvente con margen", "create_zone_around", {
    margin: 500,
  }),
];

/** Edición de muros y limpieza de geometría heredada. */
const MUROS: NlCadCase[] = [
  c("d-070", "extiende el muro de tablaroca hasta la trabe", "extensión hasta frontera", "extend_wall", {
    target: "tablaroca",
    boundary: "trabe",
  }),
  c("d-071", "recorta el muro de fachada", "recorte de muro", "trim_wall", { target: "fachada" }),
  c(
    "d-072",
    "chaflán de 100 entre el muro de fachada y el muro de colindancia poniente",
    "chaflán entre muros",
    "chamfer_walls",
    { distance: 100 },
  ),
  c(
    "d-073",
    "limpia la geometría duplicada con tolerancia de 5",
    "depuración de importado",
    "cleanup_geometry",
    { tolerance: 5 },
  ),
  c("d-074", "depura los muros con tolerancia de 2 mm", "depuración con unidad explícita", "cleanup_geometry", {
    tolerance: 2,
  }),
];

/** Documento, vista y anotación: el cierre de la jornada. */
const DOCUMENTO: NlCadCase[] = [
  c("d-075", "exporta el dxf", "entrega a otro despacho", "studio_export", { format: "dxf" }),
  c("d-076", "imprime en A3", "papel de obra", "studio_export", { format: "pdf", paper: "a3" }),
  c("d-077", "guarda el plano", "guardado", "studio_save"),
  c("d-078", "vista 3d", "cambio de vista", "studio_view", { mode: "3d" }),
  c("d-079", "vista 2d", "regreso a planta", "studio_view", { mode: "2d" }),
  c("d-080", "deshaz", "historial", "history_step", { action: "undo" }),
  c("d-081", "rehaz", "historial", "history_step", { action: "redo" }),
  c("d-082", "borra las cotas", "limpieza de acotado", "clear_annotations", { kind: "dims" }),
  c("d-083", "quita las notas", "limpieza de notas", "clear_annotations", { kind: "notes" }),
  c("d-084", "escribe Patio de servicio en 2000,9000", "rótulo con posición", "add_label", {
    text: "Patio de servicio",
  }),
  c("d-085", "selecciona todos los muros", "selección por tipo", "select_objects", { query: "muro" }),
  c("d-086", "selecciona todo menos los castillos", "selección con exclusión", "select_objects", {
    exclude: "castillo",
  }),
  c("d-087", "enfoca la cochera", "encuadre por nombre", "fit_to_view", { target: "cochera" }),
  c("d-088", "ayuda", "descubrimiento de comandos", "help_commands"),
  c("d-089", "exporta png", "imagen para el cliente", "studio_export", { format: "png" }),
  c("d-090", "exporta el 3d", "entrega de modelo", "studio_export", { format: "glb" }),
];

/**
 * Instrucciones legítimas tecleadas SIN ACENTOS.
 *
 * No son casos adversariales: son las mismas órdenes de arriba escritas como se
 * escriben de verdad. Si el producto sólo entiende «recámara» y no «recamara»,
 * el 100 % del banco sería ficción de laboratorio.
 */
const SIN_ACENTOS: NlCadCase[] = [
  c("d-091", "acota las recamaras", "sin acentos: recámara", "auto_dimension", {
    target: "recamara",
  }),
  c("d-092", "enfoca la recamara principal", "sin acentos: encuadre", "fit_to_view", {
    target: "recamara principal",
  }),
  c("d-093", "cuantas ventanas hay", "sin acentos: conteo", "count_objects", { query: "ventana" }),
  c("d-094", "mueve el boiler 300 a la derecha", "sin acentos: bóiler", "move_selection", {
    target: "boiler",
    dx: 300,
  }),
  c("d-095", "pon un closet en la recamara 2", "sin acentos: clóset", "place_symbol", {
    query: "closet",
  }),
  c("d-096", "borra el porton de la cochera", "sin acentos: portón", "delete_selection", {
    target: "porton",
  }),
  c("d-097", "area del patio trasero", "sin acentos: área", "measure_area", {
    targetLabel: "patio trasero",
  }),
  c("d-098", "coloca el wc en el medio bano", "sin acentos y con la eñe tecleada como n", "place_symbol", {
    query: "wc",
    into: "medio bano",
  }),
];

export const NL_CAD_CORPUS_DESPACHO: NlCadCase[] = [
  ...TRAZO,
  ...COLOCAR,
  ...MOVER,
  ...TRANSFORMAR,
  ...ARREGLOS,
  ...MEDIR,
  ...MUROS,
  ...DOCUMENTO,
  ...SIN_ACENTOS,
];
