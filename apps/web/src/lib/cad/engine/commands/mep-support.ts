/**
 * Piezas compartidas por las órdenes MEP: los SERVICIOS, sus capas y la doble
 * línea a inglete (Ola F, 2026-09-02).
 *
 * ## Un toolset es contenido sobre el mismo motor
 *
 * Aquí no hay entidad `pipe` ni `duct`: una tubería es una POLYLINE en la
 * capa de su servicio, cuyo tipo de línea lleva el texto que la distingue
 * (`linetype-complex.ts`: AF, AC, SAN, PLU, GAS, CI), y un ducto o una
 * charola son el contorno a doble línea más su eje. Lo que la orden sabe de
 * más —qué servicio y qué diámetro o ancho— viaja en `context.metadata`, que
 * el formato ya tiene, para que el cuadro de instalaciones lo lea sin
 * adivinar. Añadir un tipo de entidad sería tocar el formato persistido:
 * decisión del titular, no tomada.
 *
 * ## Las capas, con la convención mexicana
 *
 * IH (hidráulica), IS (sanitaria), IG (gas), PCI (contra incendio), AA (aire
 * acondicionado), IE (eléctrica). La orden da de alta la capa si no existe
 * —con su color y su tipo de línea— y NO la toca si ya existe: un despacho
 * que tenga su IH-AF con otro color la conserva.
 */
import type { CadLayerDef, CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { cadPipeTurnAngle } from "../../plant/pipe-route";
import { cadPointZ } from "../spatial-point";
import type { CadCommandContext, CadKeyword } from "../command-types";

export type CadMepKind = "pipe" | "duct" | "tray";

/** Un giro por debajo de esto es una recta con ruido de tecleo, no un codo. */
const CAD_MEP_TURN_EPSILON_DEG = 0.5;

export interface CadMepService {
  id: string;
  /** Palabra clave con la que se elige; la charola no tiene alternativa. */
  keyword?: CadKeyword;
  label: string;
  layer: string;
  color: string;
  /** Tipo de línea de la capa: el texto que distingue el servicio en planta. */
  linetype?: string;
  kind: CadMepKind;
  /** Diámetro nominal (tubería, mm) o ancho (ducto y charola, mm) por defecto. */
  defaultSize: number;
}

export const CAD_MEP_SERVICES: readonly CadMepService[] = [
  { id: "AF", keyword: { keyword: "agua Fría", shortcut: "F" }, label: "Agua fría", layer: "IH-AF", color: "#3b82f6", linetype: "AGUA_FRIA", kind: "pipe", defaultSize: 19 },
  { id: "AC", keyword: { keyword: "agua Caliente", shortcut: "C" }, label: "Agua caliente", layer: "IH-AC", color: "#ef4444", linetype: "AGUA_CALIENTE", kind: "pipe", defaultSize: 19 },
  { id: "SAN", keyword: { keyword: "Sanitario", shortcut: "S" }, label: "Drenaje sanitario", layer: "IS-SAN", color: "#a16207", linetype: "SANITARIO", kind: "pipe", defaultSize: 100 },
  { id: "PLU", keyword: { keyword: "Pluvial", shortcut: "P" }, label: "Drenaje pluvial", layer: "IS-PLU", color: "#0ea5e9", linetype: "PLUVIAL", kind: "pipe", defaultSize: 100 },
  { id: "GAS", keyword: { keyword: "Gas", shortcut: "G" }, label: "Gas", layer: "IG-GAS", color: "#f59e0b", linetype: "GAS_LINE", kind: "pipe", defaultSize: 13 },
  { id: "CI", keyword: { keyword: "contra Incendio", shortcut: "I" }, label: "Contra incendio", layer: "PCI-RED", color: "#dc2626", linetype: "CONTRA_INCENDIO", kind: "pipe", defaultSize: 64 },
  { id: "INY", keyword: { keyword: "Inyección", shortcut: "I" }, label: "Inyección de aire", layer: "AA-INY", color: "#2563eb", kind: "duct", defaultSize: 300 },
  { id: "RET", keyword: { keyword: "Retorno", shortcut: "R" }, label: "Retorno de aire", layer: "AA-RET", color: "#7c3aed", kind: "duct", defaultSize: 300 },
  { id: "EXT", keyword: { keyword: "Extracción", shortcut: "E" }, label: "Extracción de aire", layer: "AA-EXT", color: "#6b7280", kind: "duct", defaultSize: 250 },
  { id: "CHAROLA", label: "Charola de cables", layer: "IE-CHAROLA", color: "#eab308", kind: "tray", defaultSize: 300 },
];

/** Los servicios de una clase de orden, en el orden en que se ofrecen. */
export function cadMepServicesOf(kind: CadMepKind): CadMepService[] {
  return CAD_MEP_SERVICES.filter((service) => service.kind === kind);
}

/** El servicio de ese id o de esa capa (sin distinguir mayúsculas), si lo hay. */
export function cadMepServiceFor(idOrLayer: string | undefined): CadMepService | undefined {
  if (!idOrLayer) return undefined;
  const wanted = idOrLayer.trim().toUpperCase();
  return CAD_MEP_SERVICES.find((service) => service.id === wanted || service.layer.toUpperCase() === wanted);
}

/** La capa del servicio como se daría de alta. */
export function cadMepLayerDefinition(service: CadMepService): CadLayerDef {
  return {
    id: service.layer,
    name: service.layer,
    color: service.color,
    visible: true,
    locked: false,
    ...(service.linetype ? { linetype: service.linetype } : {}),
  };
}

/**
 * El alta de la capa del servicio, SÓLO si el documento no la tiene ya. Sin
 * tabla de capas en el contexto (un guion, una prueba) no se da de alta: la
 * entidad nombra la capa igual y el editor la muestra con lo de fábrica.
 */
export function cadMepLayerCommands(service: CadMepService, context: CadCommandContext): CadEntityCommand[] {
  const layers = context.layers?.();
  if (!layers) return [];
  const exists = layers.some((layer) => layer.name.toUpperCase() === service.layer.toUpperCase() || layer.id.toUpperCase() === service.layer.toUpperCase());
  return exists ? [] : [{ type: "layer", op: "upsert", layer: cadMepLayerDefinition(service) }];
}

/** Un punto de camino: la cota es opcional y ausente significa suelo. */
type CadMepPathPoint = CadPoint2 | CadPoint3;

/** La cota de un punto de camino; cero si no la trae. */
const cota = (point: CadMepPathPoint): number => cadPointZ(point) ?? 0;

/**
 * Longitud de un camino de tramos rectos, medida EN TRES DIMENSIONES.
 *
 * Hasta la Ola G medía sólo en planta, y ahí estaba el defecto que más caro
 * salía: un MONTANTE —el tramo vertical que sube o baja la corrida en el
 * mismo sitio— tiene desplazamiento nulo en planta, así que contaba CERO
 * metros. Un plano de instalaciones con ocho bajadas de 2 m perdía 16 m de
 * tubo en el cuadro y nadie lo veía, porque el número que faltaba no dejaba
 * hueco: salía redondo.
 *
 * Un punto sin `z` cuenta como cota cero, así que un trazo en planta mide
 * exactamente lo que medía antes. Esa igualdad es lo que deja intacto el
 * golden `81-cad-instalaciones`, y la spec la fija.
 */
export function cadPathLength(points: readonly CadMepPathPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1)
    total += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
      cota(points[index]) - cota(points[index - 1]),
    );
  return total;
}

/**
 * Los MONTANTES de un camino: los tramos que suben o bajan EN EL SITIO.
 *
 * Un tramo vertical es el que no se mueve en planta y cambia de cota; un tramo
 * inclinado —una bajante con pendiente sanitaria, por ejemplo— tiene
 * componente vertical y NO es un montante, porque en obra no es la misma
 * pieza ni el mismo soporte. Por eso se miran las dos cosas por separado y no
 * se suma «lo que sube» a secas.
 */
export function cadMepRisers(points: readonly CadMepPathPoint[]): { count: number; rise: number } {
  let count = 0;
  let rise = 0;
  for (let index = 1; index < points.length; index += 1) {
    const plano = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    const salto = Math.abs(cota(points[index]) - cota(points[index - 1]));
    if (plano > 1e-9 || salto <= 1e-9) continue;
    count += 1;
    rise += salto;
  }
  return { count, rise };
}

/**
 * Los CODOS que la geometría implica: un vértice donde la corrida gira es un
 * codo, y si mañana se mueve el vértice el codo se mueve con él.
 *
 * Es el MISMO criterio de `plant/pipe-route.ts` —y su misma trigonometría, de
 * ahí importada— porque un codo de agua fría y uno de proceso son el mismo
 * accesorio visto por dos toolsets: una segunda copia del cálculo sería la que
 * se queda sin arreglar el día que aparezca un defecto.
 *
 * Aquí se cuentan, no se listan: el cuadro de instalaciones dice cuántos hay
 * por servicio y tamaño, y quién quiera el ángulo de cada uno tiene la ruta de
 * proceso, que sí los detalla.
 */
export function cadMepElbows(points: readonly CadMepPathPoint[]): number {
  const espacial = points.map((point) => ({ x: point.x, y: point.y, z: cota(point) }));
  let codos = 0;
  for (let index = 1; index < espacial.length - 1; index += 1)
    if (cadPipeTurnAngle(espacial[index - 1], espacial[index], espacial[index + 1]) >= CAD_MEP_TURN_EPSILON_DEG)
      codos += 1;
  return codos;
}

/**
 * El contorno a DOBLE LÍNEA de un eje: `width` repartido a ambos lados, con
 * las esquinas a INGLETE (la intersección de las dos paralelas) y los
 * extremos rectos. Antihorario, como todo anillo del producto.
 *
 * Es la unión de los rectángulos de cada tramo: en un codo de 90° el área
 * del contorno es exactamente ancho × (L₁ + L₂), y así lo fija la spec. Dos
 * tramos casi alineados no tienen inglete que calcular y llevan la paralela
 * tal cual; un tramo de longitud nula se salta.
 */
export function cadDoubleLineOutline(points: readonly CadPoint2[], width: number): CadPoint2[] | null {
  const axis = points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 1e-9);
  if (axis.length < 2 || !(width > 0)) return null;
  const half = width / 2;
  const side = (sign: 1 | -1): CadPoint2[] => {
    const result: CadPoint2[] = [];
    for (let index = 0; index < axis.length; index += 1) {
      const previous = index > 0 ? direction(axis[index - 1], axis[index]) : null;
      const next = index < axis.length - 1 ? direction(axis[index], axis[index + 1]) : null;
      const normalPrevious = previous ? { x: -previous.y * sign * half, y: previous.x * sign * half } : null;
      const normalNext = next ? { x: -next.y * sign * half, y: next.x * sign * half } : null;
      if (!previous && normalNext) {
        result.push({ x: axis[index].x + normalNext.x, y: axis[index].y + normalNext.y });
        continue;
      }
      if (!next && normalPrevious) {
        result.push({ x: axis[index].x + normalPrevious.x, y: axis[index].y + normalPrevious.y });
        continue;
      }
      if (!previous || !next || !normalPrevious || !normalNext) continue;
      const a = { x: axis[index].x + normalPrevious.x, y: axis[index].y + normalPrevious.y };
      const b = { x: axis[index].x + normalNext.x, y: axis[index].y + normalNext.y };
      const cross = previous.x * next.y - previous.y * next.x;
      if (Math.abs(cross) < 1e-9) {
        result.push(a);
        continue;
      }
      // Intersección de la paralela previa (por `a`, dirección `previous`) con
      // la siguiente (por `b`, dirección `next`).
      const t = ((b.x - a.x) * next.y - (b.y - a.y) * next.x) / cross;
      result.push({ x: a.x + previous.x * t, y: a.y + previous.y * t });
    }
    return result;
  };
  // Antihorario: la banda derecha en el sentido del eje y la izquierda de vuelta.
  const right = side(-1);
  const left = side(1).reverse();
  return [...right, ...left];
}

/** Área con signo de un anillo (positiva si es antihorario), para las specs y el cuadro. */
export function cadRingAreaOf(points: readonly CadPoint2[]): number {
  let twice = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return twice / 2;
}

function direction(a: CadPoint2, b: CadPoint2): CadPoint2 {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}
