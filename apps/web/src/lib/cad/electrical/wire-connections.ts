/**
 * EL REPORTE DE/A: de qué componente a qué componente va cada conductor, y
 * cuál se quedó suelto.
 *
 * ## Qué pregunta contesta, y por qué nadie la contestaba
 *
 * `wire-numbering.ts` sabe QUÉ conductores hay y cómo se llaman;
 * `device-tags.ts` sabe QUÉ componentes hay y cómo se llaman. Lo que faltaba
 * es lo único que un electricista pregunta con el plano en la mano: **este
 * conductor, ¿de dónde sale y a dónde llega?** Sin esa respuesta la lista de
 * conductores es un inventario de rayas numeradas, y la regleta de bornes se
 * arma mirando la pantalla y contando a ojo.
 *
 * Y contestarla trae de regalo el defecto que más caro sale y que la pantalla
 * ESCONDE: el conductor que parece llegar al motor y en el dibujo termina a dos
 * centímetros. A escala de plano eléctrico esos dos centímetros son dos
 * décimas de milímetro en el papel — invisibles al ojo, invisibles al zoom
 * normal, y perfectamente visibles para quien mide. Aquí se miden.
 *
 * ## LA TOLERANCIA: declarada y DERIVADA, no un número mágico
 *
 * Un número redondo elegido a gusto («50 unidades») convertiría este reporte en
 * una opinión. El criterio es físico:
 *
 *  · La plumilla más fina de la ISO 128 traza **0,13 mm** sobre el papel. Dos
 *    puntos que al plotear caen dentro de ese trazo son el mismo punto para el
 *    ojo, y exigirle al dibujante un hueco menor que ése es exigirle que
 *    corrija lo que no puede ver.
 *  · Un plano eléctrico mexicano se plotea entre **1:50** (fuerza y alumbrado)
 *    y **1:100** (planta de conjunto). Esos 0,13 mm de papel valen 6,5 mm de
 *    dibujo a 1:50 y 13 mm a 1:100.
 *  · La tolerancia es el centro de ese intervalo: **10 mm de dibujo**. Por
 *    debajo, el hueco no se ve ni ploteando; por encima, el hueco existe de
 *    verdad y este reporte lo tiene que decir.
 *
 * Se declara en MILÍMETROS y no en unidades de dibujo porque un documento en
 * metros y otro en pulgadas tienen que aceptar el mismo hueco FÍSICO:
 * `cadWireLinkTolerance` la baja a la unidad del documento —10 unidades en un
 * dibujo en mm, 0,01 en uno en m, 0,3937 en uno en pulgadas—. Un `50` escrito
 * a pelo habría significado cinco centímetros en un dibujo y cincuenta metros
 * en otro.
 *
 * ## Se mide en PLANTA, y eso también es una decisión
 *
 * La distancia es en (x, y). En un plano eléctrico el símbolo y el conductor se
 * dibujan en planta aunque el aparato esté a 1,20 m de altura; medir en tres
 * dimensiones declararía «suelto» todo contacto al que alguien le puso cota z,
 * que es exactamente el falso positivo que haría que nadie leyera el reporte.
 *
 * ## Deducido no es declarado, y el renglón lo tiene que decir
 *
 * Esto NO es una conexión declarada: el dibujo no guarda «el conductor C-1-1
 * remata en el borne 3 de -M1». Es una conexión DEDUCIDA por cercanía, y el
 * criterio y su tolerancia viajan en el propio renglón (`cadWireLinkCriterion`)
 * para que nadie la lea como si fuera un dato del proyecto. El día que exista
 * un borne declarado, este módulo será el que sobre — y hasta entonces dice de
 * qué está hecho.
 */
import type { CadDocument, CadEntity, CadPoint2 } from "../cad-document";
import {
  cadFromMillimetres,
  cadMillimetresLabel,
  cadToMillimetres,
} from "../engine/commands/architecture-support";
import { formatMagnitude } from "../engine/commands/solids-support";
import { cadDeviceTagsOf, cadFormatDeviceTag } from "./device-tags";
import { cadWiresOf } from "./wire-numbering";

type View = Pick<CadDocument, "entities">;

/**
 * La tolerancia, en MILÍMETROS DE DIBUJO. El porqué de la cifra está arriba:
 * 0,13 mm de plumilla ISO 128 ploteados entre 1:50 y 1:100 son entre 6,5 y 13
 * mm de dibujo, y ésta es la mitad de ese intervalo.
 */
export const CAD_IE_LINK_TOLERANCE_MM = 10;

/** La misma tolerancia, expresada en la unidad del documento. */
export const cadWireLinkTolerance = (unit: string | undefined): number =>
  cadFromMillimetres(CAD_IE_LINK_TOLERANCE_MM, unit);

/** Un componente etiquetado con su punto de inserción: el destino posible. */
export interface CadTaggedDevice {
  entityId: string;
  /** Normalizada, como se dibuja en el esquema: `-M1`. */
  tag: string;
  /** El punto de inserción del símbolo, en planta. */
  at: CadPoint2;
}

/**
 * Los componentes etiquetados que pueden ser extremo de un conductor.
 *
 * Se ordenan por etiqueta, y ese orden no es cosmético: es lo que resuelve el
 * empate cuando dos componentes caen a la MISMA distancia de un extremo. Sin
 * un orden estable, el mismo dibujo daría dos reportes distintos según cómo se
 * hubiera guardado, y un reporte que cambia solo no se puede cotejar.
 */
export function cadTaggedDevices(view: View): CadTaggedDevice[] {
  const porId = new Map(view.entities.map((entity) => [entity.id, entity]));
  const devices: CadTaggedDevice[] = [];
  for (const tag of cadDeviceTagsOf(view)) {
    const entity = porId.get(tag.entityId);
    if (!entity || entity.type !== "insert") continue;
    devices.push({
      entityId: tag.entityId,
      tag: cadFormatDeviceTag(tag.prefix, tag.number),
      at: { x: entity.insertion.x, y: entity.insertion.y },
    });
  }
  return devices.sort((a, b) => a.tag.localeCompare(b.tag));
}

/** Uno de los dos extremos de un conductor, ya resuelto contra el dibujo. */
export interface CadWireEnd {
  /** `de` es el primer vértice del recorrido; `a`, el último. */
  which: "de" | "a";
  point: CadPoint2;
  /** Etiqueta del componente al que llega, o `null` si quedó SUELTO. */
  tag: string | null;
  entityId: string | null;
  /** Distancia al componente al que llega, en unidades de dibujo. */
  distance: number | null;
  /**
   * El componente más cercano AUNQUE quede fuera de tolerancia, con su
   * distancia. Es lo que convierte un «suelto» en algo accionable: no es lo
   * mismo «le faltan 2 cm a -M1» que «no hay nada cerca».
   */
  nearestTag: string | null;
  nearestDistance: number | null;
}

/** Un conductor con sus dos extremos resueltos. */
export interface CadWireConnection {
  entityId: string;
  circuit: string;
  number: number;
  /** Como se lee en el plano: `C-1-1`. */
  label: string;
  from: CadWireEnd;
  to: CadWireEnd;
  /** Cuántos de sus dos extremos quedaron sueltos: 0, 1 o 2. */
  loose: number;
}

/** Los dos extremos del recorrido, o `null` si la entidad no tiene ninguno. */
function endsOf(entity: CadEntity): [CadPoint2, CadPoint2] | null {
  if (entity.type === "polyline") {
    const vertices = entity.vertices;
    if (vertices.length < 2) return null;
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    return [
      { x: first.x, y: first.y },
      { x: last.x, y: last.y },
    ];
  }
  if (entity.type === "line")
    return [
      { x: entity.start.x, y: entity.start.y },
      { x: entity.end.x, y: entity.end.y },
    ];
  return null;
}

/**
 * A qué componente toca un extremo.
 *
 * Se queda con el MÁS CERCANO —comparación estrictamente menor, así que un
 * empate lo gana el primero de la lista, que viene ordenada por etiqueta— y
 * sólo lo da por conectado si cae dentro de la tolerancia. Fuera de ella se
 * devuelve `tag: null` (suelto) pero se conserva el más cercano y su
 * distancia: decir «suelto» sin decir cuánto falta obliga a medir a mano lo
 * que el reporte ya midió.
 */
function resolveEnd(
  which: "de" | "a",
  point: CadPoint2,
  devices: readonly CadTaggedDevice[],
  tolerance: number,
): CadWireEnd {
  let best: CadTaggedDevice | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const device of devices) {
    const distance = Math.hypot(device.at.x - point.x, device.at.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = device;
    }
  }
  if (!best)
    return {
      which,
      point,
      tag: null,
      entityId: null,
      distance: null,
      nearestTag: null,
      nearestDistance: null,
    };
  const dentro = bestDistance <= tolerance;
  return {
    which,
    point,
    tag: dentro ? best.tag : null,
    entityId: dentro ? best.entityId : null,
    distance: dentro ? bestDistance : null,
    nearestTag: best.tag,
    nearestDistance: bestDistance,
  };
}

export interface CadWireConnectionOptions {
  /** Unidad del documento; de ella sale la tolerancia. */
  unit?: string;
  /**
   * Tolerancia EXPLÍCITA en unidades de dibujo, para quien tenga un motivo.
   * Sin ella se usa la declarada, que es lo normal y lo que se dice al leer.
   */
  toleranceUnits?: number;
}

/**
 * De/a de cada conductor con recorrido, ordenado por circuito y número.
 *
 * Los conductores marcados que NO tienen recorrido que medir —una inserción a
 * la que alguien le puso la marca eléctrica, una polilínea de un solo
 * vértice— no salen aquí a medias: `cadWireConnectionReport` los cuenta
 * aparte, por la misma razón que `cadWireDefects` cuenta las marcas ilegibles.
 */
export function cadWireConnections(
  view: View,
  options: CadWireConnectionOptions = {},
): CadWireConnection[] {
  const tolerance = options.toleranceUnits ?? cadWireLinkTolerance(options.unit);
  const devices = cadTaggedDevices(view);
  const porId = new Map(view.entities.map((entity) => [entity.id, entity]));
  const connections: CadWireConnection[] = [];
  for (const wire of cadWiresOf(view)) {
    const entity = porId.get(wire.entityId);
    const ends = entity ? endsOf(entity) : null;
    if (!ends) continue;
    const from = resolveEnd("de", ends[0], devices, tolerance);
    const to = resolveEnd("a", ends[1], devices, tolerance);
    connections.push({
      entityId: wire.entityId,
      circuit: wire.circuit,
      number: wire.number,
      label: `${wire.circuit}-${wire.number}`,
      from,
      to,
      loose: (from.tag === null ? 1 : 0) + (to.tag === null ? 1 : 0),
    });
  }
  return connections.sort(
    (a, b) => a.circuit.localeCompare(b.circuit) || a.number - b.number,
  );
}

export interface CadWireConnectionReport {
  connections: CadWireConnection[];
  /** Conductores con al menos un extremo suelto. */
  loose: CadWireConnection[];
  /** Cuántos componentes etiquetados había para conectar. */
  devices: number;
  /** Marcados como conductor y sin recorrido que medir, con su id. */
  withoutRun: string[];
  /** La tolerancia usada, en unidades de dibujo y en milímetros. */
  toleranceUnits: number;
  toleranceMm: number;
}

/** El reporte completo, con lo que se midió y lo que no se pudo medir. */
export function cadWireConnectionReport(
  view: View,
  options: CadWireConnectionOptions = {},
): CadWireConnectionReport {
  const toleranceUnits = options.toleranceUnits ?? cadWireLinkTolerance(options.unit);
  const connections = cadWireConnections(view, { ...options, toleranceUnits });
  const medidos = new Set(connections.map((connection) => connection.entityId));
  const withoutRun = cadWiresOf(view)
    .filter((wire) => !medidos.has(wire.entityId))
    .map((wire) => wire.entityId)
    .sort();
  return {
    connections,
    loose: connections.filter((connection) => connection.loose > 0),
    devices: cadTaggedDevices(view).length,
    withoutRun,
    toleranceUnits,
    // Se recalcula de las unidades y no se copia la constante: si alguien
    // impone una tolerancia propia, el renglón tiene que decir la que se usó y
    // no la declarada por omisión.
    toleranceMm: cadToMillimetres(toleranceUnits, options.unit),
  };
}

/** `C-1-1 de -TB1 a -M1`, y `(suelto)` donde no hay a quién llegar. */
export const cadFormatWireConnection = (connection: CadWireConnection): string =>
  `${connection.label} de ${connection.from.tag ?? "(suelto)"} a ${connection.to.tag ?? "(suelto)"}`;

/** Qué le falta a un extremo suelto, dicho en milímetros de dibujo. */
export function cadFormatLooseEnd(
  connection: CadWireConnection,
  end: CadWireEnd,
  unit: string | undefined,
): string {
  if (end.nearestTag === null || end.nearestDistance === null)
    return `${connection.label} extremo «${end.which}»: no hay ningún componente etiquetado cerca`;
  return `${connection.label} extremo «${end.which}» queda a ${cadMillimetresLabel(
    end.nearestDistance,
    unit,
  )} mm de ${end.nearestTag}`;
}

/**
 * El criterio y su tolerancia, para el renglón.
 *
 * Va SIEMPRE con el de/a. Una conexión deducida por proximidad no es una
 * conexión declarada, y un reporte que no dice de qué está hecho invita a
 * leerlo como si el dibujo lo afirmara.
 */
export function cadWireLinkCriterion(unit: string | undefined): string {
  const tolerancia = cadWireLinkTolerance(unit);
  // En un dibujo en mm la conversión es la identidad y repetirla («10 mm de
  // dibujo (10 mm)») sólo hace ruido; en cualquier otra unidad la cifra
  // convertida es justamente el dato que el dibujante necesita para medirla.
  const enUnidades =
    tolerancia === CAD_IE_LINK_TOLERANCE_MM
      ? ""
      : ` (${formatMagnitude(Math.round(tolerancia * 1e4) / 1e4)} ${unit})`;
  return (
    `criterio: DEDUCIDO por proximidad al punto de inserción del símbolo, medida en planta, ` +
    `con tolerancia declarada de ${CAD_IE_LINK_TOLERANCE_MM} mm de dibujo${enUnidades}; ` +
    `una conexión deducida no es una conexión declarada`
  );
}
