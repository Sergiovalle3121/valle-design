/**
 * Mapeo de capas DXF → capas CAD por nombre (CAD-NEXT-063b).
 *
 * Al importar un DXF, cada entidad trae el NOMBRE de su capa de origen
 * (MUROS, A-WALL, ELEC, EJES…). El editor tiene un conjunto CERRADO de capas
 * CAD (`CadLayerId`), así que no se puede crear una capa nueva por cada nombre
 * DXF; pero sí se puede clasificar el nombre a la capa CAD semánticamente
 * correcta para que el dibujo importado aterrice en capas alternables/bloqueables
 * en vez de amontonarse en "layout". Puro y determinista: sólo mira el nombre.
 *
 * Convención de nombres de capa DXF de la industria (AIA/ISO y variantes en
 * español): prefijos y palabras clave estándar de arquitectura/MEP/civil.
 */

import type { CadLayerId } from "./layers";

/**
 * Reglas de clasificación; el orden define la prioridad (la primera que
 * coincide gana). `keywords` matchea como SUBCADENA en cualquier parte del
 * nombre; `prefixes` matchea sólo al INICIO — los códigos de prefijo AIA de
 * una letra ("S-", "E-"…) no deben coincidir en medio de otra palabra (p.ej.
 * "salidaS-Emergencia" no es estructura).
 */
const LAYER_RULES: Array<{ layer: CadLayerId; keywords: string[]; prefixes?: string[] }> = [
  // Seguridad primero: "salida de emergencia" pesa como seguridad aunque el
  // nombre traiga otras palabras.
  { layer: "safety", keywords: ["safety", "segur", "fire", "fuego", "incend", "egress", "evac", "emerg", "salida", "extint", "hidrant", "protec"] },
  // Estructura antes que arquitectura: "COLUMNA"/"MURO-ESTRUCTURAL" → estructura.
  { layer: "structure", keywords: ["struct", "estruct", "colum", "column", "beam", "viga", "trabe", "ciment", "footing", "slab", "losa"], prefixes: ["s-"] },
  // Sin prefijo "a-": los layers AIA "A-ANNO"/"A-DIMS" son anotación, no muro;
  // "A-WALL" cae aquí igual por la palabra "wall".
  { layer: "architecture", keywords: ["wall", "muro", "arch", "arq", "door", "puerta", "window", "ventana", "tabique"] },
  { layer: "utilities", keywords: ["elec", "power", "energ", "plumb", "hidra", "hidro", "agua", "water", "gas", "hvac", "mech", "mecan", "duct", "pipe", "tuber", "drain", "mep", "data", "voz", "network"], prefixes: ["p-", "m-", "e-"] },
  { layer: "measurements", keywords: ["dim", "cota", "axis", "eje", "grid", "reja", "annot", "anot", "text", "leyend", "north", "norte"] },
  { layer: "aisles", keywords: ["aisle", "pasillo", "circul", "corridor", "path", "ruta", "vialidad", "road", "via"] },
  { layer: "flow", keywords: ["flow", "flujo", "conveyor", "transport", "material"] },
  { layer: "equipment", keywords: ["equip", "furn", "mobil", "mueble", "machine", "maquin", "asset", "rack", "estante"] },
];

/**
 * Clasifica un nombre de capa DXF a la capa CAD semánticamente más cercana.
 * `fallback` es la capa a usar cuando el nombre no coincide con ninguna regla
 * (típicamente la capa por defecto según el tipo de primitiva). El nombre "0"
 * (la capa por defecto del DXF, sin semántica) siempre usa el fallback.
 */
export function mapDxfLayerToCadLayer(
  dxfLayer: string | undefined,
  fallback: CadLayerId = "layout",
): CadLayerId {
  const name = (dxfLayer ?? "").trim().toLowerCase();
  if (!name || name === "0") return fallback;
  for (const rule of LAYER_RULES) {
    if (rule.keywords.some((kw) => name.includes(kw))) return rule.layer;
    if (rule.prefixes?.some((p) => name.startsWith(p))) return rule.layer;
  }
  return fallback;
}
