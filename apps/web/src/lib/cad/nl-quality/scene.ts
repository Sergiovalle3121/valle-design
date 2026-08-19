/**
 * El plano sobre el que se mide el banco NL→CAD.
 *
 * POR QUÉ ESTE PLANO Y NO UNO SINTÉTICO. Casi todas las instrucciones de un
 * despacho son RELACIONALES: «centra la mesa del comedor», «pega el ropero al
 * muro del fondo», «mide de castillo a castillo». Sobre un lienzo vacío esas
 * instrucciones no se pueden juzgar —el producto no tendría a qué apuntar— y el
 * banco mediría el parser en el aire en vez de medir el producto. Así que la
 * escena es una casa de interés medio mexicana de dos recámaras sobre un lote
 * de 10 × 20 m, con lo que ese plano lleva siempre: cochera, patio de servicio,
 * medio baño, castillos en las esquinas y una trabe sobre el claro de la sala.
 *
 * LAS MEDIDAS SON DE OBRA, NO REDONDAS. El lote de 10 × 20, el muro de 15 cm,
 * la puerta de 90, el claro de 3,60: son las cifras con las que se cotiza en
 * México. Un plano de números redondos escondería justo los errores de
 * conversión que este banco existe para cazar.
 *
 * TODO EN MILÍMETROS, que es la unidad interna del documento. Que el usuario
 * hable en metros y en centímetros —y que el producto tenga que traducirlo— es
 * precisamente lo que se está midiendo.
 */
import type { CadBox, CadCommandContext } from "../commands/types";

/** Lote tipo de interés medio: 10 m de frente por 20 m de fondo. */
export const NL_CAD_SCENE_FOOTPRINT_W = 10_000;
export const NL_CAD_SCENE_FOOTPRINT_H = 20_000;

const room = (
  id: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
): CadBox => ({ id, type: "asset", label, x, y, w, h, kind: "room" });

const asset = (
  id: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: string,
): CadBox => ({ id, type: "asset", label, x, y, w, h, kind });

/**
 * Los cuartos de la planta baja, con los nombres que se rotulan en el plano.
 *
 * «Recámara principal» y no «dormitorio 1»: el banco mide el vocabulario que se
 * usa aquí, y un corpus rotulado en español peninsular mediría otra cosa.
 */
const CUARTOS: CadBox[] = [
  room("r-cochera", "Cochera", 200, 200, 3000, 5200),
  room("r-sala", "Sala-comedor", 3400, 200, 6400, 5200),
  room("r-cocina", "Cocina", 3400, 5600, 3200, 3000),
  room("r-medio-bano", "Medio baño", 200, 5600, 1600, 2000),
  room("r-lavado", "Patio de servicio", 200, 7800, 3000, 2400),
  room("r-rec-principal", "Recámara principal", 200, 10_600, 4600, 4200),
  room("r-rec-2", "Recámara 2", 5000, 10_600, 4800, 4200),
  room("r-bano", "Baño completo", 200, 15_000, 2600, 2400),
  room("r-closet", "Clóset", 3000, 15_000, 1800, 2400),
  room("r-patio", "Patio trasero", 5000, 15_000, 4800, 4600),
];

/**
 * Estructura: castillos, dalas, trabe y sardinel.
 *
 * Van como objetos y no como decoración porque el corpus los nombra: en obra se
 * mide de castillo a castillo y se acota la trabe, no «el elemento vertical».
 */
const ESTRUCTURA: CadBox[] = [
  asset("c-1", "Castillo K1", 0, 0, 150, 150, "column"),
  asset("c-2", "Castillo K2", 9850, 0, 150, 150, "column"),
  asset("c-3", "Castillo K3", 0, 19_850, 150, 150, "column"),
  asset("c-4", "Castillo K4", 9850, 19_850, 150, 150, "column"),
  asset("tr-1", "Trabe TR-1", 3400, 5400, 6400, 200, "beam"),
  asset("dala-1", "Dala de cerramiento", 200, 5400, 3000, 150, "beam"),
  asset("sardinel-1", "Sardinel de la cochera", 200, 5300, 3000, 100, "wall"),
];

/** Muros: colindancia, fachada y el de tablaroca que divide las recámaras. */
const MUROS: CadBox[] = [
  asset("m-fachada", "Muro de fachada", 0, 0, 10_000, 150, "wall"),
  asset(
    "m-colindancia-izq",
    "Muro de colindancia poniente",
    0,
    0,
    150,
    20_000,
    "wall",
  ),
  asset(
    "m-colindancia-der",
    "Muro de colindancia oriente",
    9850,
    0,
    150,
    20_000,
    "wall",
  ),
  asset("m-tablaroca", "Muro de tablaroca", 4800, 10_600, 100, 4200, "wall"),
  asset("m-pretil", "Pretil de azotea", 0, 19_900, 10_000, 100, "wall"),
];

/** Carpintería, herrería y muebles que el corpus mueve, gira y duplica. */
const PIEZAS: CadBox[] = [
  asset("p-porton", "Portón de la cochera", 200, 100, 3000, 150, "door"),
  asset("p-puerta-acceso", "Puerta de acceso", 3600, 100, 900, 150, "door"),
  asset(
    "p-puerta-rec",
    "Puerta de la recámara principal",
    1200,
    10_500,
    900,
    150,
    "door",
  ),
  asset("v-sala", "Ventana de la sala", 5200, 100, 1800, 150, "window"),
  asset("v-cocina", "Ventana de la cocina", 3600, 8500, 1200, 150, "window"),
  asset("mesa-comedor", "Mesa del comedor", 6000, 2200, 1600, 900, "furniture"),
  // Las sillas y los muebles de baño están porque el corpus los nombra. Un
  // plano de comedor sin sillas haría fallar «acomoda las sillas en 2 filas»
  // por un descuido de la escena y no por el producto: eso sería el banco
  // mintiendo en la dirección contraria, y miente igual de mal.
  asset("silla-1", "Silla del comedor 1", 5700, 2200, 450, 450, "furniture"),
  asset("silla-2", "Silla del comedor 2", 5700, 2750, 450, 450, "furniture"),
  asset("silla-3", "Silla del comedor 3", 7700, 2200, 450, 450, "furniture"),
  asset("silla-4", "Silla del comedor 4", 7700, 2750, 450, 450, "furniture"),
  asset("wc-medio-bano", "WC del medio baño", 400, 5800, 400, 700, "fixture"),
  asset(
    "lavabo-bano",
    "Lavabo del baño completo",
    400,
    15_200,
    600,
    450,
    "fixture",
  ),
  asset("ropero", "Ropero de la recámara", 400, 10_800, 1800, 600, "furniture"),
  asset("cama-1", "Cama matrimonial", 2400, 11_400, 1600, 2000, "furniture"),
  asset("boiler", "Bóiler de paso", 400, 8000, 400, 400, "equipment"),
  asset("tinaco", "Tinaco de 1100 litros", 2200, 8000, 1200, 1200, "equipment"),
  asset("cisterna", "Cisterna", 6200, 16_000, 2000, 2000, "equipment"),
  asset("lavadero", "Lavadero", 1000, 9000, 800, 600, "equipment"),
];

/**
 * El contexto que recibe cada comando del banco.
 *
 * Se devuelve una COPIA en cada llamada: los comandos reciben el contexto por
 * referencia y un caso que mutara la escena contaminaría a los siguientes, que
 * es la forma más silenciosa que tiene un banco de mentir.
 */
export function buildNlCadScene(selectedIds: string[] = []): CadCommandContext {
  return {
    unit: "mm",
    footprintW: NL_CAD_SCENE_FOOTPRINT_W,
    footprintH: NL_CAD_SCENE_FOOTPRINT_H,
    objects: [...CUARTOS, ...ESTRUCTURA, ...MUROS, ...PIEZAS].map((box) => ({
      ...box,
    })),
    selectedIds: [...selectedIds],
  };
}

/**
 * Selección por defecto del banco: los dos castillos del frente.
 *
 * Muchos comandos («alinea», «distribuye», «borra») operan sobre la selección
 * cuando la instrucción no nombra objetivo. Ejecutarlos con el plano sin
 * seleccionar mediría el mensaje «selecciona algo primero», no la calidad de la
 * comprensión. Dos objetos es el mínimo que hace válidos alinear y distribuir.
 */
export const NL_CAD_DEFAULT_SELECTION = ["c-1", "c-2"];
