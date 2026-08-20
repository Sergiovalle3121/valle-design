/**
 * NORMA DE CAPAS DE DESPACHO MEXICANO.
 *
 * ## Qué se está afirmando aquí, y qué no
 *
 * **No existe una norma mexicana de nomenclatura de capas CAD.** Existe ISO
 * 13567, que define un esquema de campos para organizar capas, y prácticamente
 * nadie en México la aplica. Lo que hay es una costumbre bastante uniforme
 * —nombres cortos en español, en mayúsculas, con guion como separador— y sobre
 * ella cada oficina improvisa colores y grosores.
 *
 * Así que esta tabla es **costumbre declarada como costumbre** en el nombre, y
 * **norma citada como norma** en lo que sí está normado: los grosores salen de
 * la serie de ISO 128-20 y los tipos de línea de sus convenios. Cada capa cita
 * sus fuentes por id contra `mexican-drafting-sources.ts`, y una spec falla si
 * alguna se queda sin ellas. Un arquitecto detecta una norma inventada al
 * instante, y ese día perdemos la única ventaja que tenemos sobre AutoCAD.
 *
 * ## Por qué el grosor va en la capa y no en una tabla de plumas
 *
 * La costumbre mexicana real es que el COLOR mande el grosor a través del `.ctb`
 * del despacho. Funciona hasta que el archivo sale de la oficina: sin su `.ctb`,
 * el plano se imprime con todos los grosores mal. Aquí el grosor se declara en
 * la capa —viaja dentro del documento— y el color queda para distinguir en
 * pantalla. Es una decisión de producto que se aparta de la costumbre A
 * PROPÓSITO, y por eso está escrita.
 *
 * ## Las colisiones de color están dichas, no escondidas
 *
 * La costumbre mexicana se contradice a sí misma: los ejes van en rojo y la obra
 * nueva también. Una tabla que fingiera una paleta perfecta estaría inventando.
 * Lo que se hace es garantizar la propiedad que importa —que dos capas de la
 * MISMA lámina nunca salgan idénticas en el papel— y decir en `note` dónde el
 * color se repite y qué las separa.
 *
 * ## Cuidado: una capa mal declarada hace INGUARDABLE un plano
 *
 * La API rechaza con 400 un documento cuya geometría nombre una capa que el
 * documento no declara. Por eso `cadMexicanLayerDefs` no inventa ids: resuelve
 * contra el registro y lanza un error tipado si alguien pide una capa que no
 * existe. Fallar al construir la plantilla es infinitamente mejor que producir
 * un documento que el arquitecto no puede guardar.
 */
import type { CadLayerDef } from "../cad-document";
import { cadStandardSource } from "./mexican-drafting-sources";

/** Familia de la capa. Es el orden en que se leen en la paleta. */
export type CadMexicanLayerGroup =
  | "referencia"
  | "arquitectura"
  | "demolicion"
  | "estructura"
  | "instalaciones"
  | "sitio"
  | "anotacion";

export interface CadMexicanLayer {
  /** Nombre de capa tal cual va al documento y al DXF. Mayúsculas, español. */
  id: string;
  /** Rótulo legible en la paleta. */
  name: string;
  group: CadMexicanLayerGroup;
  /** Color en hexadecimal, que es como lo guarda el esquema. */
  color: string;
  /** Nombre del tipo de línea: `CONTINUOUS`, `DASHED`, `CENTER`, `HIDDEN`. */
  linetype: string;
  /** Grosor de pluma en mm, de la serie de ISO 128-20. */
  lineweight: number;
  /** `false` para las capas de apoyo que no deben salir en el papel. */
  plot: boolean;
  /** Para qué es. Lo lee el arquitecto, no el código. */
  purpose: string;
  /** Ids de `mexican-drafting-sources.ts`. Nunca vacío. */
  sources: readonly string[];
  /** Colisión conocida o matiz que hay que decir en voz alta. */
  note?: string;
}

/**
 * Grosores admitidos: la serie de ISO 128-20.
 *
 * Se declaran para poder comprobarlo. Un 0,30 mm colado en una tabla que dice
 * seguir la serie es exactamente el tipo de mentira pequeña que invalida el
 * resto.
 */
export const CAD_ISO_LINEWEIGHTS_MM: readonly number[] = [
  0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2,
];

const layer = (
  id: string,
  name: string,
  group: CadMexicanLayerGroup,
  color: string,
  linetype: string,
  lineweight: number,
  purpose: string,
  sources: readonly string[],
  extra: { plot?: boolean; note?: string } = {},
): CadMexicanLayer => ({
  id,
  name,
  group,
  color,
  linetype,
  lineweight,
  plot: extra.plot ?? true,
  purpose,
  sources,
  ...(extra.note ? { note: extra.note } : {}),
});

/** Fuentes que sostienen el nombre y el grosor de CUALQUIER capa de la tabla. */
const BASE_SOURCES = ["capas-nombre-espanol", "capas-color-pluma", "iso-128-grosores"] as const;

/**
 * La tabla.
 *
 * El orden es el de lectura de una lámina: primero lo que sirve de referencia,
 * después lo que se construye, después lo que se quita y se pone, la estructura,
 * las instalaciones, el sitio y por último lo que se escribe encima.
 */
export const CAD_MEXICAN_LAYERS: readonly CadMexicanLayer[] = [
  // --- REFERENCIA ----------------------------------------------------------
  layer(
    "EJE",
    "Ejes",
    "referencia",
    "#ff0000",
    "CENTER",
    0.13,
    "Ejes estructurales y de trazo, con su marca de letra o número en los extremos.",
    [...BASE_SOURCES, "ejes-letra-numero", "iso-128-ocultas"],
    {
      note:
        "Comparte el rojo con MURO-NUE. Es una colisión REAL de la costumbre mexicana, no un " +
        "descuido: se separan por tipo de línea (trazo y punto frente a continuo) y por grosor.",
    },
  ),
  layer(
    "AUXILIAR",
    "Auxiliar",
    "referencia",
    "#808080",
    "CONTINUOUS",
    0.13,
    "Construcción auxiliar: se dibuja para apoyarse, no se imprime.",
    [...BASE_SOURCES, "auxiliar-no-imprime"],
    { plot: false },
  ),
  layer(
    "ARQ-FONDO",
    "Arquitectura de fondo",
    "referencia",
    "#c0c0c0",
    "CONTINUOUS",
    0.13,
    "Muros y muebles del arquitectónico, atenuados como referencia bajo otra disciplina.",
    [...BASE_SOURCES],
    {
      note:
        "Gris claro y el grosor más fino de la serie. Antes iba a 0,09 mm, que NO está en la serie de " +
        "ISO 128-20: un grosor fuera de la serie sale distinto en cada trazador.",
    },
  ),

  // --- ARQUITECTURA --------------------------------------------------------
  layer(
    "MURO",
    "Muros",
    "arquitectura",
    "#ffffff",
    "CONTINUOUS",
    0.35,
    "Muros de carga y divisorios, cortados por el plano de planta.",
    [...BASE_SOURCES],
  ),
  layer(
    "VANO",
    "Puertas y ventanas",
    "arquitectura",
    "#ffff00",
    "CONTINUOUS",
    0.25,
    "Huecos de puerta y ventana, hoja y barrido.",
    [...BASE_SOURCES],
    {
      note:
        "Comparte el amarillo con MURO-DEM, que va a trazos. En una planta de demolición conviven " +
        "las dos y sólo el tipo de línea las separa.",
    },
  ),
  layer(
    "CANCEL",
    "Cancelería",
    "arquitectura",
    "#00ffff",
    "CONTINUOUS",
    0.25,
    "Cancelería de aluminio y vidrio, separada de la carpintería de madera.",
    [...BASE_SOURCES, "canceleria-separada"],
  ),
  layer(
    "MOBILIARIO",
    "Mobiliario",
    "arquitectura",
    "#00ff00",
    "CONTINUOUS",
    0.13,
    "Muebles fijos, muebles de baño y cocina.",
    [...BASE_SOURCES],
  ),
  layer(
    "NIVEL",
    "Niveles",
    "arquitectura",
    "#00ffff",
    "CONTINUOUS",
    0.13,
    "Símbolos y rótulos de nivel de piso terminado (N.P.T.).",
    [...BASE_SOURCES, "nivel-npt"],
  ),
  layer(
    "PLAFON",
    "Plafones",
    "arquitectura",
    "#8000ff",
    "DASHED",
    0.13,
    "Proyección de plafón y de entrepiso: está sobre la cabeza, por eso va a trazos.",
    [...BASE_SOURCES, "iso-128-ocultas"],
  ),
  layer(
    "CORTE",
    "Elementos cortados",
    "arquitectura",
    "#ffffff",
    "CONTINUOUS",
    0.5,
    "Lo que la sección atraviesa: muros, losas, terreno.",
    [...BASE_SOURCES],
  ),
  layer(
    "PROYECCION",
    "Proyección",
    "arquitectura",
    "#808080",
    "CONTINUOUS",
    0.18,
    "Lo que se ve detrás del plano de corte, más fino y atenuado.",
    [...BASE_SOURCES],
    {
      note:
        "Antes iba en cian y coincidía EXACTAMENTE con TEXTO —mismo color, mismo tipo, mismo " +
        "grosor—: dos capas indistinguibles en la misma lámina. Se pasó a gris, que además es lo " +
        "que un ojo lee como «detrás».",
    },
  ),

  // --- DEMOLICIÓN Y OBRA NUEVA --------------------------------------------
  layer(
    "MURO-EXI",
    "Muros existentes",
    "demolicion",
    "#808080",
    "CONTINUOUS",
    0.25,
    "Lo construido que se conserva tal cual.",
    [...BASE_SOURCES, "demolicion-amarillo-rojo"],
  ),
  layer(
    "MURO-DEM",
    "Muros por demoler",
    "demolicion",
    "#ffff00",
    "DASHED",
    0.25,
    "Lo que se quita. Amarillo y a trazos.",
    [...BASE_SOURCES, "demolicion-amarillo-rojo", "iso-128-ocultas"],
    {
      note:
        "El código amarillo/rojo es la convención más extendida, no una regla: hay oficinas que lo " +
        "invierten y ventanillas que piden el suyo. Confírmese antes de entregar.",
    },
  ),
  layer(
    "MURO-NUE",
    "Muros nuevos",
    "demolicion",
    "#ff0000",
    "CONTINUOUS",
    0.35,
    "Obra nueva. Rojo y continuo, con el mismo grosor que el muro consolidado.",
    [...BASE_SOURCES, "demolicion-amarillo-rojo"],
  ),

  // --- ESTRUCTURA ----------------------------------------------------------
  layer(
    "EST",
    "Estructura",
    "estructura",
    "#0000ff",
    "CONTINUOUS",
    0.35,
    "Columnas, castillos, trabes y dalas vistos en planta.",
    [...BASE_SOURCES],
  ),
  layer(
    "EST-CIM",
    "Cimentación",
    "estructura",
    "#0000ff",
    "HIDDEN",
    0.35,
    "Zapatas, contratrabes y dados: están bajo el piso, así que van a trazos.",
    [...BASE_SOURCES, "iso-128-ocultas"],
  ),

  // --- INSTALACIONES -------------------------------------------------------
  layer(
    "INST-HID",
    "Hidráulica fría",
    "instalaciones",
    "#0000ff",
    "CONTINUOUS",
    0.25,
    "Agua fría: tuberías, válvulas y salidas.",
    [...BASE_SOURCES],
  ),
  layer(
    "INST-HID-CAL",
    "Hidráulica caliente",
    "instalaciones",
    "#ff0000",
    "DASHED",
    0.25,
    "Agua caliente, desde el calentador.",
    [...BASE_SOURCES],
  ),
  layer(
    "INST-SAN",
    "Sanitaria",
    "instalaciones",
    "#804000",
    "CONTINUOUS",
    0.35,
    "Drenaje, ventilación y registros.",
    [...BASE_SOURCES],
  ),
  layer(
    "INST-ELE",
    "Eléctrica",
    "instalaciones",
    "#ffff00",
    "CONTINUOUS",
    0.25,
    "Circuitos, salidas, apagadores y tablero.",
    [...BASE_SOURCES, "nom-001-sede"],
    {
      note:
        "NOM-001-SEDE regula la INSTALACIÓN y obliga a documentar el proyecto eléctrico; que la capa " +
        "se llame INST-ELE y salga en amarillo no lo dice ninguna norma.",
    },
  ),
  layer(
    "INST-GAS",
    "Gas L.P.",
    "instalaciones",
    "#ff8000",
    "CONTINUOUS",
    0.25,
    "Tubería de gas L.P., regulador y medidor.",
    [...BASE_SOURCES, "nom-gas-lp"],
    {
      note:
        "Igual que la eléctrica: la norma regula la instalación, no el dibujo. El nombre y el naranja " +
        "son costumbre.",
    },
  ),
  layer(
    "SIMBOLO",
    "Simbología",
    "instalaciones",
    "#ff00ff",
    "CONTINUOUS",
    0.18,
    "Símbolos de salida y cuadro de simbología.",
    [...BASE_SOURCES],
  ),

  // --- SITIO ---------------------------------------------------------------
  layer(
    "LINDERO",
    "Lindero",
    "sitio",
    "#ffffff",
    "CONTINUOUS",
    0.5,
    "Poligonal del predio, con sus rumbos y distancias.",
    [...BASE_SOURCES],
  ),
  layer(
    "CONSTRUCCION",
    "Construcción",
    "sitio",
    "#ffff00",
    "CONTINUOUS",
    0.35,
    "Huella construida y su azotea, vista desde arriba.",
    [...BASE_SOURCES],
  ),
  layer(
    "VIALIDAD",
    "Vialidad",
    "sitio",
    "#808080",
    "CONTINUOUS",
    0.25,
    "Calle, banqueta y guarnición.",
    [...BASE_SOURCES],
  ),
  layer(
    "VEGETACION",
    "Vegetación",
    "sitio",
    "#00ff00",
    "CONTINUOUS",
    0.13,
    "Arbolado existente y áreas jardinadas.",
    [...BASE_SOURCES],
  ),
  layer(
    "TERRENO",
    "Curvas de nivel",
    "sitio",
    "#804000",
    "CONTINUOUS",
    0.13,
    "Curvas de nivel del levantamiento.",
    [...BASE_SOURCES],
  ),
  layer(
    "TERRENO-NAT",
    "Terreno natural",
    "sitio",
    "#804000",
    "DASHED",
    0.25,
    "Perfil del terreno antes de excavar.",
    [...BASE_SOURCES, "terreno-natural-proyecto", "iso-128-ocultas"],
  ),
  layer(
    "TERRENO-PRO",
    "Terreno de proyecto",
    "sitio",
    "#804000",
    "CONTINUOUS",
    0.35,
    "Rasante del proyecto: cómo queda el terreno tras cortes y rellenos.",
    [...BASE_SOURCES, "terreno-natural-proyecto"],
  ),
  layer(
    "NORTE",
    "Norte y escala gráfica",
    "sitio",
    "#ff00ff",
    "CONTINUOUS",
    0.25,
    "Rosa de los vientos y escala gráfica de la lámina.",
    [...BASE_SOURCES],
  ),

  // --- ANOTACIÓN -----------------------------------------------------------
  layer(
    "COTA",
    "Acotación",
    "anotacion",
    "#ff00ff",
    "CONTINUOUS",
    0.13,
    "Cotas, líneas de extensión y sus garrapatas.",
    [...BASE_SOURCES, "acotacion-en-su-capa"],
  ),
  layer(
    "TEXTO",
    "Textos",
    "anotacion",
    "#00ffff",
    "CONTINUOUS",
    0.18,
    "Nombres de local, notas, claves y cuadros.",
    [...BASE_SOURCES, "acotacion-en-su-capa"],
  ),
];

const BY_ID = new Map(CAD_MEXICAN_LAYERS.map((item) => [item.id, item]));

/**
 * Error tipado: pedir una capa que no está en la norma no puede pasar callando.
 *
 * Es la barrera que impide el desenlace peor de este módulo — una plantilla que
 * declara una capa con un id mal escrito y produce un documento que la API
 * rechaza cuando el arquitecto pulsa guardar, media hora después de empezar.
 */
export class CadMexicanLayerError extends Error {
  readonly code = "cad_mexican_layer_unknown";
  constructor(readonly layerId: string) {
    super(
      `La capa «${layerId}» no está en la norma de capas mexicana. ` +
        `Las declaradas son: ${CAD_MEXICAN_LAYERS.map((item) => item.id).join(", ")}.`,
    );
    this.name = "CadMexicanLayerError";
  }
}

export function cadMexicanLayer(id: string): CadMexicanLayer {
  const found = BY_ID.get(id);
  if (!found) throw new CadMexicanLayerError(id);
  return found;
}

export function cadMexicanLayersByGroup(group: CadMexicanLayerGroup): readonly CadMexicanLayer[] {
  return CAD_MEXICAN_LAYERS.filter((item) => item.group === group);
}

/**
 * Cómo se ve una capa SOBRE EL PAPEL.
 *
 * Dos capas con la misma clave son indistinguibles una vez impreso el plano, y
 * eso convierte la separación por capas en decoración: se puede apagar una y no
 * saber cuál se apagó. Las capas que no se trazan quedan fuera del cálculo
 * porque nunca llegan al papel.
 */
export function cadMexicanLayerAppearance(item: CadMexicanLayer): string {
  return `${item.color}|${item.linetype}|${item.lineweight}`;
}

/**
 * Capas de la misma lámina que saldrían idénticas impresas.
 *
 * Devuelve los pares, no un booleano: un fallo que dice «hay una colisión» sin
 * decir cuál obliga a comparar treinta capas a mano.
 */
export function cadMexicanLayerCollisions(
  ids: readonly string[],
): Array<[string, string]> {
  const seen = new Map<string, string>();
  const collisions: Array<[string, string]> = [];
  for (const id of ids) {
    const item = cadMexicanLayer(id);
    if (!item.plot) continue;
    const key = cadMexicanLayerAppearance(item);
    const previous = seen.get(key);
    if (previous) collisions.push([previous, id]);
    else seen.set(key, id);
  }
  return collisions;
}

/**
 * Las capas de la norma en la forma que persiste el documento.
 *
 * Resuelve contra el registro: un id inventado lanza `CadMexicanLayerError` en
 * vez de producir una capa fantasma. Los duplicados se colapsan conservando el
 * primer orden, que es el que decide cómo se lee la paleta.
 */
export function cadMexicanLayerDefs(ids: readonly string[]): CadLayerDef[] {
  const emitted = new Set<string>();
  const defs: CadLayerDef[] = [];
  for (const id of ids) {
    if (emitted.has(id)) continue;
    const item = cadMexicanLayer(id);
    emitted.add(id);
    defs.push({
      id: item.id,
      name: item.name,
      color: item.color,
      visible: true,
      locked: false,
      lineweight: item.lineweight,
      ...(item.linetype !== "CONTINUOUS" ? { linetype: item.linetype } : {}),
      plot: item.plot,
    });
  }
  return defs;
}

/**
 * Comprobación de integridad de las citas.
 *
 * Devuelve las capas que citan una fuente inexistente o que no citan ninguna.
 * Se expone como función —y no sólo como aserción de spec— para que el guion de
 * evidencia pueda publicar el resultado en lugar de afirmarlo de palabra.
 */
export function cadMexicanLayerSourceProblems(): string[] {
  const problems: string[] = [];
  for (const item of CAD_MEXICAN_LAYERS) {
    if (item.sources.length === 0) {
      problems.push(`${item.id}: no cita ninguna fuente.`);
      continue;
    }
    for (const sourceId of item.sources) {
      try {
        cadStandardSource(sourceId);
      } catch {
        problems.push(`${item.id}: cita la fuente inexistente «${sourceId}».`);
      }
    }
  }
  return problems;
}
