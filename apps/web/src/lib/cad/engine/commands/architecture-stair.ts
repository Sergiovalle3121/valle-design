/**
 * STAIR: la escalera paramétrica recta, en L y en U (Ola E, 2026-09-02;
 * tramos y descansos, 2026-09-04).
 *
 * Medido antes (`distancia-autocad-completo-20260901.md`, §4 1º
 * ARCHITECTURE): el producto tenía WALL, DOOR y WINDOW y ninguna escalera;
 * la fila `toolset-architecture.interiores` de la rúbrica decía «todavía
 * no». Una escalera se dibujaba a mano: N líneas, una flecha, un SUBE, y el
 * reparto de contrahuellas lo hacía el dibujante con la calculadora.
 *
 * ## Lo que la orden calcula, y de dónde salen los números
 *
 * Se teclea el arranque y un segundo punto que sólo fija la DIRECCIÓN de
 * subida; la longitud sale de la receta. Con la altura a salvar `H` y la
 * contrahuella máxima `cmax`:
 *
 *   - contrahuellas `N = ⌈H / cmax⌉` (al menos 2), contrahuella `c = H / N`;
 *   - huella `h = 630 − 2c` (Blondel, 2c + h = 630 mm) salvo que se teclee
 *     con `Huella`; desarrollo `(N − 1) · h`: hay una huella MENOS que
 *     contrahuellas, porque la última contrahuella es el canto del forjado.
 *
 * Los límites son los del reglamento que se aplica primero (Reglamento de
 * Construcciones de la Ciudad de México y sus NTC: contrahuella ≤ 180 mm,
 * huella ≥ 250 mm) y valen también en el CTE español (130–185 / ≥ 280 en
 * uso general, más exigente en la huella). La orden se NIEGA a fabricar una
 * escalera fuera de reglamento y lo dice con el número; Blondel es comodidad,
 * no reglamento: si el `2c + h` sale de 600–650 se dice, no se prohíbe.
 *
 * ## Forma: recta, en L y en U
 *
 * `Forma` reparte esas mismas N contrahuellas entre uno, dos o tres tramos:
 *
 *   - `Recto` — un tramo. Es lo de siempre y sigue siendo el default: sin
 *     tocar `Forma`, la orden emite exactamente las mismas entidades que
 *     antes de que existieran los descansos (lo fija la spec con la huella
 *     SHA-256 de cinco escaleras rectas).
 *   - `Ele` — dos tramos con un giro de 90° a la izquierda y un descanso.
 *   - `U` — tres tramos con dos giros de 90° a la izquierda y dos descansos;
 *     el tercero vuelve sobre el eje del primero en sentido CONTRARIO, con el
 *     ojo de escalera entre ambos. Es la U de dos cuartos de vuelta, no la de
 *     media vuelta.
 *
 * El reparto es lo más parejo que permite la división entera y los primeros
 * tramos se quedan la contrahuella de más: 14 → 7 + 7 en L, 5 + 5 + 4 en U.
 * Un tramo con menos de {@link CAD_STAIR_MIN_FLIGHT_RISERS} contrahuellas no
 * es un tramo, es un tropiezo: el reparto se NIEGA con el número, igual que
 * se niega una contrahuella de 200 mm. (Ese mínimo sólo rige el reparto: una
 * escalera RECTA de dos peldaños se sigue dibujando, porque ahí no hay nada
 * que repartir.)
 *
 * El descanso tiene por fondo el ancho de la escalera, que es lo que exige el
 * reglamento —«el ancho de los descansos será cuando menos igual al ancho de
 * la escalera»— y se puede agrandar con `Descanso`; un fondo menor que el
 * ancho se niega con las dos cifras. El desarrollo en planta pasa a ser la
 * suma de los tramos MÁS los descansos, que es lo que ocupa el hueco.
 *
 * ## Lo que emite
 *
 * En un solo lote (una frontera de deshacer): la PLANTA —el contorno cerrado
 * de cada tramo y el rectángulo de cada descanso en orden de subida, las
 * contrahuellas interiores de cada tramo como LINE (la primera y la última
 * son bordes del contorno), la línea de subida QUEBRADA por los descansos con
 * su punta de flecha en el último tramo y el TEXT «SUBE» girado con el
 * primero— y UN SOLID3D reeditable POR PIEZA: por tramo, un nodo `extrude`
 * cuyo perfil es el dentado en el plano vertical de subida, extruido a lo
 * ancho —el mismo marco «de canto» que la cuña de WEDGE—; por descanso, el
 * prisma de su rectángulo desde el suelo hasta su cota. Los volúmenes son
 * exactos: `ancho · h · c · (n − 1) · n / 2` por tramo de `n` contrahuellas y
 * `ancho · fondo · c · k` por descanso pisado tras `k` contrahuellas, y la
 * spec los contrasta contra esas fórmulas en papel.
 *
 * ## Lo que NO hace, dicho aquí
 *
 *   - Ni escaleras compensadas, ni de caracol, ni con peldaños en abanico en
 *     el giro: los giros son SIEMPRE por descanso, y siempre a la izquierda.
 *   - La U es de dos cuartos de vuelta (tres tramos, dos descansos). La de
 *     media vuelta —dos tramos y un descanso de doble fondo— no está.
 *   - El máximo de peraltes por tramo que fijan las NTC no se comprueba: el
 *     reparto se niega por defecto de tramo, nunca por exceso.
 *   - El punto de arranque es la esquina IZQUIERDA del primer peldaño mirando
 *     hacia arriba; no hay Justificación.
 *   - El sólido es macizo (peldaños sobre su plano de arranque), no una losa
 *     inclinada con su canto: no hay zanca. Los tramos por encima del primero
 *     apoyan en su plano de arranque y bajo ellos no se modela nada, que es
 *     lo que hay bajo un tramo real: el ojo de escalera.
 *   - No hay entidad `stair` persistida: la escalera se descompone en planta
 *     + sólidos. Añadir un tipo de entidad es tocar el formato persistido,
 *     que es decisión del titular; hasta entonces la receta viaja en el
 *     nombre de cada sólido.
 */
import type { CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadSolid3dEntity, CadSolidNode } from "../../cad-entities-v5";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import { planeFrameAt } from "../../solid3d-profiles";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandInput,
  type CadCommandStep,
  type CadPreviewPath,
} from "../command-types";
import { cadLiftPoint } from "../spatial-point";
import { cadAlong, cadDirection, cadFromMillimetres, cadMillimetresLabel, cadToMillimetres, type CadDirection } from "./architecture-support";
import { finishedSolid, formatMagnitude, makeSolidEntity, solidCancelled, solidMessage } from "./solids-support";

/** Contrahuella máxima del reglamento, en mm. */
export const CAD_STAIR_MAX_RISER_MM = 180;
/** Huella mínima del reglamento, en mm. */
export const CAD_STAIR_MIN_TREAD_MM = 250;
/** Blondel: 2c + h, en mm. */
export const CAD_STAIR_BLONDEL_MM = 630;
/** Fuera de esta horquilla de 2c + h la escalera se dice incómoda (no se prohíbe). */
export const CAD_STAIR_COMFORT_MM: readonly [number, number] = [600, 650];
/** Altura de planta por defecto (la misma que WALL), en mm. */
export const CAD_STAIR_DEFAULT_RISE_MM = 2400;
/** Ancho por defecto (vivienda), en mm. */
export const CAD_STAIR_DEFAULT_WIDTH_MM = 1000;
/** Contrahuellas mínimas de un tramo cuando hay reparto entre varios. */
export const CAD_STAIR_MIN_FLIGHT_RISERS = 3;

/** Forma en planta: un tramo, dos con un giro, o tres con dos giros. */
export type CadStairForm = "recto" | "ele" | "u";

/** Tramos de cada forma. Los descansos son uno menos. */
export const CAD_STAIR_FLIGHTS: Readonly<Record<CadStairForm, number>> = { recto: 1, ele: 2, u: 3 };

const FORM_LABEL: Readonly<Record<CadStairForm, string>> = { recto: "recta", ele: "en L", u: "en U" };

const WIDTH = { keyword: "aNcho", shortcut: "N" } as const;
const RISE = { keyword: "Altura", shortcut: "A" } as const;
const TREAD = { keyword: "Huella", shortcut: "H" } as const;
const RISER = { keyword: "Contrahuella", shortcut: "C" } as const;
const FORM = { keyword: "Forma", shortcut: "F" } as const;
// El atajo del descanso es la D y no la C de «desCanso»: la C ya es la de
// Contrahuella, y dos opciones con el mismo atajo no se resuelven —
// `matchCadKeyword` devuelve null ante el empate y la tecla deja de servir
// para las DOS. Un atajo ambiguo es peor que un atajo distinto.
const LANDING = { keyword: "Descanso", shortcut: "D" } as const;
const STRAIGHT = { keyword: "Recto", shortcut: "R" } as const;
const ELL = { keyword: "Ele", shortcut: "E" } as const;
const UTURN = { keyword: "U", shortcut: "U" } as const;

const FORM_KEYWORD: Readonly<Record<CadStairForm, string>> = { recto: STRAIGHT.keyword, ele: ELL.keyword, u: UTURN.keyword };

export interface CadStairRequest {
  /** Altura a salvar, en unidades del documento. */
  rise: number;
  width: number;
  /** Huella tecleada, o `null` para Blondel. */
  tread: number | null;
  /** Contrahuella máxima admitida. */
  maxRiser: number;
  /** Forma en planta; `recto` es el default histórico. */
  form?: CadStairForm;
  /** Fondo del descanso tecleado, o `null` para el mínimo de reglamento (= ancho). */
  landing?: number | null;
  unit: string | undefined;
}

export interface CadStairDesign {
  form: CadStairForm;
  risers: number;
  riser: number;
  tread: number;
  /** Contrahuellas de cada tramo, en orden de subida; suman `risers`. */
  flights: number[];
  /** Fondo del descanso, o 0 si la escalera es de un solo tramo. */
  landing: number;
  /** Desarrollo en planta: `Σ (nᵢ − 1) · h` + los descansos. */
  run: number;
  width: number;
  rise: number;
  /** `2c + h`, en mm, para decirlo. */
  blondelMm: number;
  comfortable: boolean;
}

/**
 * Reparte `risers` contrahuellas entre `count` tramos.
 *
 * Lo más parejo que permite la división entera, y los PRIMEROS tramos se
 * quedan la de más: subir el escalón sobrante al principio es la costumbre de
 * obra (el descanso queda por encima de la mitad, no por debajo).
 */
export function cadStairFlights(risers: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => Math.floor((risers + count - 1 - index) / count));
}

/** La receta, o el motivo por el que el reglamento la impide. */
export function cadStairDesign(request: CadStairRequest): CadStairDesign | { refused: string } {
  const mm = (value: number) => cadToMillimetres(value, request.unit);
  if (!(request.rise > 1e-9)) return { refused: "STAIR necesita una altura a salvar mayor que cero." };
  if (!(request.width > 1e-9)) return { refused: "STAIR necesita un ancho mayor que cero." };
  if (mm(request.maxRiser) > CAD_STAIR_MAX_RISER_MM + 1e-6)
    return { refused: `Contrahuella ${formatMagnitude(mm(request.maxRiser))} mm: el reglamento admite ${CAD_STAIR_MAX_RISER_MM} mm como máximo.` };
  if (!(request.maxRiser > 1e-9)) return { refused: "STAIR necesita una contrahuella mayor que cero." };
  if (request.tread !== null && mm(request.tread) < CAD_STAIR_MIN_TREAD_MM - 1e-6)
    return { refused: `Huella ${formatMagnitude(mm(request.tread))} mm: el reglamento pide ${CAD_STAIR_MIN_TREAD_MM} mm como mínimo.` };
  const risers = Math.max(2, Math.ceil(request.rise / request.maxRiser - 1e-9));
  const riser = request.rise / risers;
  const tread = request.tread ?? cadFromMillimetres(CAD_STAIR_BLONDEL_MM, request.unit) - 2 * riser;
  const blondelMm = 2 * mm(riser) + mm(tread);
  const form = request.form ?? "recto";
  const count = CAD_STAIR_FLIGHTS[form];
  const flights = cadStairFlights(risers, count);
  // El mínimo por tramo rige el REPARTO, no la escalera recta: sin descanso
  // no hay nada que repartir y una escalerilla de dos peldaños es legítima.
  if (count > 1 && flights[flights.length - 1] < CAD_STAIR_MIN_FLIGHT_RISERS)
    return {
      refused:
        `${risers} contrahuellas no se reparten en ${count} tramos (${flights.join(" + ")}): ` +
        `un tramo con menos de ${CAD_STAIR_MIN_FLIGHT_RISERS} contrahuellas no es un tramo. ` +
        `Suba la altura a salvar o baje la contrahuella máxima.`,
    };
  const landing = count > 1 ? (request.landing ?? request.width) : 0;
  if (count > 1 && mm(landing) < mm(request.width) - 1e-6)
    return {
      refused:
        `Descanso de ${formatMagnitude(mm(landing))} mm de fondo: el reglamento pide cuando menos el ancho de la escalera, ` +
        `${formatMagnitude(mm(request.width))} mm.`,
    };
  return {
    form,
    risers,
    riser,
    tread,
    flights,
    landing,
    run: flights.reduce((sum, count_) => sum + (count_ - 1) * tread, 0) + (count - 1) * landing,
    width: request.width,
    rise: request.rise,
    blondelMm,
    comfortable: blondelMm >= CAD_STAIR_COMFORT_MM[0] - 1e-6 && blondelMm <= CAD_STAIR_COMFORT_MM[1] + 1e-6,
  };
}

/** Lo que la orden dice al terminar: los números de la receta. */
export function cadStairSummary(design: CadStairDesign, unit: string | undefined): string {
  const mm = (value: number) => cadMillimetresLabel(value, unit);
  const comfort = design.comfortable ? "" : ` — fuera de la horquilla de comodidad ${CAD_STAIR_COMFORT_MM[0]}–${CAD_STAIR_COMFORT_MM[1]}`;
  // Hay una huella menos que contrahuellas POR TRAMO: la última de cada tramo
  // la pisa el descanso, o el forjado en el último.
  const treads = design.risers - design.flights.length;
  const landings = design.flights.length - 1;
  const shape =
    landings === 0
      ? ""
      : ` Escalera ${FORM_LABEL[design.form]}: ${design.flights.join(" + ")} contrahuellas por tramo, ` +
        `${landings} descanso${landings === 1 ? "" : "s"} de ${mm(design.landing)} mm de fondo.`;
  return (
    `${design.risers} contrahuellas de ${mm(design.riser)} mm y ${treads} huellas de ${mm(design.tread)} mm; ` +
    `desarrollo ${mm(design.run)} mm, ancho ${mm(design.width)} mm; ` +
    `2c + h = ${formatMagnitude(Math.round(design.blondelMm * 10) / 10)} mm${comfort}.${shape}`
  );
}

/** El dentado de un tramo de `risers` contrahuellas en el plano vertical (x = avance, y = altura), antihorario. */
export function cadStairProfile(design: CadStairDesign, risers: number = design.risers): CadPoint2[] {
  const outer: CadPoint2[] = [{ x: 0, y: 0 }];
  for (let index = 1; index < risers; index += 1) {
    outer.push({ x: (index - 1) * design.tread, y: index * design.riser });
    outer.push({ x: index * design.tread, y: index * design.riser });
  }
  outer.push({ x: (risers - 1) * design.tread, y: 0 });
  // (0,0) → sube → avanza → … → baja → vuelve por el suelo: es horario; el
  // kernel espera el perfil antihorario, como el de WEDGE.
  return outer.reverse();
}

// ---------------------------------------------------------------------------
// El reparto en planta: dónde cae cada tramo y cada descanso
// ---------------------------------------------------------------------------

export interface CadStairFlightLayout {
  /** Contrahuellas del tramo. */
  risers: number;
  /** Desarrollo del tramo en planta: `(risers − 1) · huella`. */
  run: number;
  /** Esquina derecha del arranque del tramo, mirando hacia arriba. */
  origin: CadPoint2;
  direction: CadDirection;
  /** Contrahuellas ya subidas al pisar su arranque: su plano está a `below · c`. */
  below: number;
}

export interface CadStairLandingLayout {
  /** Esquina derecha de su borde de entrada. */
  origin: CadPoint2;
  /** La del tramo por el que se llega. */
  direction: CadDirection;
  depth: number;
  /** Contrahuellas subidas al pisarlo: su cara está a `below · c`. */
  below: number;
  /** Rectángulo `fondo × ancho`, antihorario. */
  outline: CadPoint2[];
}

export interface CadStairLayout {
  flights: CadStairFlightLayout[];
  landings: CadStairLandingLayout[];
}

/** Gira la dirección 90° a la IZQUIERDA, que es hacia donde giran los descansos. */
export function cadStairTurn(direction: CadDirection): CadDirection {
  const along = direction.left;
  return {
    along,
    left: { x: -along.y, y: along.x },
    degrees: (Math.atan2(along.y, along.x) * 180) / Math.PI,
  };
}

/**
 * Dónde cae cada tramo y cada descanso a partir del arranque y la dirección.
 *
 * El tramo siguiente sale del borde IZQUIERDO del descanso —la esquina
 * `(fondo, ancho)` del rectángulo— porque el giro es a la izquierda: así el
 * tramo de vuelta queda a ras del descanso y no en el aire. Con el fondo
 * mínimo (= ancho) el descanso es el cuadrado de la esquina y los dos tramos
 * lo comparten entero, que es la escalera en L de libro.
 */
export function cadStairLayout(design: CadStairDesign, start: CadPoint2, direction: CadDirection): CadStairLayout {
  const flights: CadStairFlightLayout[] = [];
  const landings: CadStairLandingLayout[] = [];
  let origin = start;
  let heading = direction;
  let below = 0;
  for (let index = 0; index < design.flights.length; index += 1) {
    const risers = design.flights[index];
    const run = (risers - 1) * design.tread;
    flights.push({ risers, run, origin, direction: heading, below });
    below += risers;
    if (index === design.flights.length - 1) break;
    const landingOrigin = cadAlong(origin, heading, run, 0);
    landings.push({
      origin: landingOrigin,
      direction: heading,
      depth: design.landing,
      below,
      outline: [
        landingOrigin,
        cadAlong(landingOrigin, heading, design.landing, 0),
        cadAlong(landingOrigin, heading, design.landing, design.width),
        cadAlong(landingOrigin, heading, 0, design.width),
      ],
    });
    origin = cadAlong(landingOrigin, heading, design.landing, design.width);
    heading = cadStairTurn(heading);
  }
  return { flights, landings };
}

/** Nodo `extrude` de canto de un tramo: X del marco = avance, Y = Z del mundo, extrusión a lo ancho. */
export function cadStairFlightNode(design: CadStairDesign, flight: CadStairFlightLayout, baseZ: number, id = "escalera"): CadSolidNode {
  return {
    id,
    op: "extrude",
    profile: { outer: cadStairProfile(design, flight.risers) },
    // Y = Z × X: con Z = −izquierda y X = avance, Y sale (0, 0, 1). Desplazamiento
    // = altura · Z = −ancho · (−izquierda) = ancho hacia la izquierda.
    frame: {
      origin: { x: flight.origin.x, y: flight.origin.y, z: baseZ + flight.below * design.riser },
      xAxis: { x: flight.direction.along.x, y: flight.direction.along.y, z: 0 },
      zAxis: { x: -flight.direction.left.x, y: -flight.direction.left.y, z: 0 },
    },
    height: -design.width,
  };
}

/** Nodo `extrude` de un descanso: su rectángulo en planta, desde el suelo hasta su cota. */
export function cadStairLandingNode(design: CadStairDesign, landing: CadStairLandingLayout, baseZ: number, id = "descanso"): CadSolidNode {
  return {
    id,
    op: "extrude",
    profile: { outer: landing.outline },
    height: landing.below * design.riser,
    frame: planeFrameAt(baseZ),
  };
}

export interface CadStairPlan {
  /** Un contorno cerrado por tramo, en orden de subida. */
  flights: CadPoint2[][];
  /** El rectángulo de cada descanso; `landings[i]` va tras `flights[i]`. */
  landings: CadPoint2[][];
  /** Las contrahuellas INTERIORES de todos los tramos, de borde a borde. */
  risers: [CadPoint2, CadPoint2][];
  /** La línea de subida, quebrada por los centros de los descansos. */
  travel: CadPoint2[];
  arrow: [CadPoint2, CadPoint2, CadPoint2];
  label: { at: CadPoint2; height: number; degrees: number };
}

/** La planta: contornos, contrahuellas interiores, línea de subida, flecha y SUBE. */
export function cadStairPlan(design: CadStairDesign, layout: CadStairLayout): CadStairPlan {
  const w = design.width;
  const risers: [CadPoint2, CadPoint2][] = [];
  const flights: CadPoint2[][] = [];
  const travel: CadPoint2[] = [];
  for (let index = 0; index < layout.flights.length; index += 1) {
    const flight = layout.flights[index];
    const at = (u: number, v: number) => cadAlong(flight.origin, flight.direction, u, v);
    flights.push([at(0, 0), at(flight.run, 0), at(flight.run, w), at(0, w)]);
    // La primera y la última contrahuella del tramo son bordes del contorno.
    for (let step = 1; step < flight.risers - 1; step += 1)
      risers.push([at(step * design.tread, 0), at(step * design.tread, w)]);
    if (index === 0) travel.push(at(0, w / 2));
    const landing = layout.landings[index];
    // El centro del descanso cae SOBRE el eje del tramo por el que se llega,
    // así que quebrar ahí —y no en el borde— evita un vértice redundante: la
    // línea de recorrido dobla una vez por descanso y ni una más.
    if (landing) travel.push(cadAlong(landing.origin, landing.direction, landing.depth / 2, w / 2));
    else travel.push(at(flight.run, w / 2));
  }
  const last = layout.flights[layout.flights.length - 1];
  const tip = (u: number, v: number) => cadAlong(last.origin, last.direction, u, v);
  const barb = w / 5;
  const first = layout.flights[0];
  return {
    flights,
    landings: layout.landings.map((landing) => landing.outline),
    risers,
    travel,
    arrow: [tip(last.run - barb, w / 2 + barb / 2), tip(last.run, w / 2), tip(last.run - barb, w / 2 - barb / 2)],
    label: {
      at: cadAlong(first.origin, first.direction, design.tread * 0.25, w / 2 + w * 0.06),
      height: w * 0.12,
      degrees: first.direction.degrees,
    },
  };
}

interface StairState {
  start: CadPoint2 | null;
  width: number;
  rise: number;
  tread: number | null;
  maxRiser: number;
  form: CadStairForm;
  landing: number | null;
  pending: "none" | "width" | "rise" | "tread" | "riser" | "landing" | "form";
}

function request(state: StairState, context: CadCommandContext): CadStairRequest {
  return {
    rise: state.rise,
    width: state.width,
    tread: state.tread,
    maxRiser: state.maxRiser,
    form: state.form,
    landing: state.landing,
    unit: context.unit,
  };
}

function ask(state: StairState, message: string, options: readonly { keyword: string; shortcut: string }[], accepts: number, extra: { defaultValue?: string; defaultOption?: string; preview?: CadPreviewPath[] } = {}): CadCommandStep<StairState> {
  return {
    state,
    prompt: {
      message,
      options: [...options],
      ...(extra.defaultValue ? { defaultValue: extra.defaultValue } : {}),
      ...(extra.defaultOption ? { defaultOption: extra.defaultOption } : {}),
    },
    accepts,
    ...(extra.preview ? { preview: extra.preview } : {}),
  };
}

type StairDistancePending = "width" | "rise" | "tread" | "riser" | "landing";

const PENDING_PROMPTS: Record<StairDistancePending, string> = {
  width: "Precise el ancho de la escalera",
  rise: "Precise la altura a salvar",
  tread: "Precise la huella",
  riser: "Precise la contrahuella máxima",
  landing: "Precise el fondo del descanso",
};

function pendingValue(state: StairState): number {
  if (state.pending === "width") return state.width;
  if (state.pending === "rise") return state.rise;
  if (state.pending === "tread") return state.tread ?? 0;
  if (state.pending === "landing") return state.landing ?? state.width;
  return state.maxRiser;
}

/** La planta bajo el cursor, con la receta vigente. */
function stairPreview(state: StairState, context: CadCommandContext): CadPreviewPath[] {
  if (!state.start || !context.cursor) return [];
  const direction = cadDirection(state.start, context.cursor);
  const design = cadStairDesign(request(state, context));
  if (!direction || "refused" in design) return [];
  const plan = cadStairPlan(design, cadStairLayout(design, state.start, direction));
  return [
    ...plan.flights.map((outline) => ({ points: outline, closed: true })),
    ...plan.landings.map((outline) => ({ points: outline, closed: true })),
    ...plan.risers.map((riser) => ({ points: riser, closed: false })),
    { points: plan.travel, closed: false },
    { points: plan.arrow, closed: false },
  ];
}

/** Las palabras clave vigentes: `Descanso` sólo aparece cuando hay descanso. */
function stairOptions(state: StairState): readonly { keyword: string; shortcut: string }[] {
  const options = [WIDTH, RISE, TREAD, RISER, FORM];
  return state.form === "recto" ? options : [...options, LANDING];
}

function stairStep(state: StairState, context: CadCommandContext): CadCommandStep<StairState> {
  if (state.pending === "form")
    return ask(state, "Precise la forma de la escalera", [STRAIGHT, ELL, UTURN], CAD_ACCEPT_KEYWORD, { defaultOption: FORM_KEYWORD[state.form] });
  if (state.pending !== "none") {
    const current = pendingValue(state);
    return ask(state, PENDING_PROMPTS[state.pending], [], CAD_ACCEPT_DISTANCE, current > 0 ? { defaultValue: String(current) } : {});
  }
  const options = stairOptions(state);
  if (!state.start)
    return ask(state, "Precise el punto de arranque de la escalera", options, CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD);
  return ask(state, "Precise la dirección de subida", options, CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD, { preview: stairPreview(state, context) });
}

function planEntities(plan: CadStairPlan, z: number, context: CadCommandContext): CadEntityCommand[] {
  const layer = context.activeLayer;
  const lift = (point: CadPoint2): CadPoint3 => ({ x: point.x, y: point.y, z });
  const closed = (points: readonly CadPoint2[]): CadNativeEntity => ({
    id: context.newEntityId(),
    type: "polyline",
    vertices: points.map(lift),
    closed: true,
    layer,
  });
  const entities: CadNativeEntity[] = [];
  // En orden de subida: tramo, su descanso, tramo…
  for (let index = 0; index < plan.flights.length; index += 1) {
    entities.push(closed(plan.flights[index]));
    const landing = plan.landings[index];
    if (landing) entities.push(closed(landing));
  }
  for (const [a, b] of plan.risers)
    entities.push({ id: context.newEntityId(), type: "line", start: lift(a), end: lift(b), layer });
  entities.push(
    { id: context.newEntityId(), type: "polyline", vertices: plan.travel.map(lift), closed: false, layer },
    { id: context.newEntityId(), type: "polyline", vertices: plan.arrow.map(lift), closed: false, layer },
    {
      id: context.newEntityId(),
      type: "text",
      x: plan.label.at.x,
      y: plan.label.at.y,
      text: "SUBE",
      height: plan.label.height,
      ...(Math.abs(plan.label.degrees) > 1e-9 ? { rotation: plan.label.degrees } : {}),
      layer,
    },
  );
  return entities.map((entity) => ({ type: "insert", entity }));
}

/**
 * Nombre de cada pieza: la receta viaja ahí porque no hay entidad `stair`.
 *
 * En la escalera recta es exactamente el nombre de siempre — un tramo de N
 * contrahuellas no necesita decir «tramo 1 de 1».
 */
function pieceName(design: CadStairDesign, index: number, context: CadCommandContext): string {
  const mm = (value: number) => cadMillimetresLabel(value, context.unit);
  const measures = `${design.flights[index]} × ${mm(design.riser)} / ${mm(design.tread)} mm`;
  if (design.flights.length === 1) return `Escalera ${design.risers} × ${mm(design.riser)} / ${mm(design.tread)} mm`;
  return `Escalera ${FORM_LABEL[design.form]} tramo ${index + 1} de ${design.flights.length}: ${measures}`;
}

function landingName(design: CadStairDesign, landing: CadStairLandingLayout, index: number, context: CadCommandContext): string {
  const mm = (value: number) => cadMillimetresLabel(value, context.unit);
  return `Descanso ${index + 1} de ${design.flights.length - 1}: fondo ${mm(landing.depth)} mm a +${mm(landing.below * design.riser)} mm`;
}

/**
 * Cierra la orden con TODAS sus piezas validadas.
 *
 * Con una sola pieza devuelve tal cual lo que da `finishedSolid`, que es lo
 * que la escalera recta emitía antes de que existieran los tramos: mismo
 * lote, mismos ids, mismo orden. Con varias, cada sólido pasa por el mismo
 * validador antes de entrar al lote y el primero que no sea un sólido válido
 * aborta la orden entera — el ejecutor es atómico y media escalera es peor
 * que ninguna.
 */
function finishPieces(state: StairState, solids: CadSolid3dEntity[], plan: CadEntityCommand[], notice: string): CadCommandStep<StairState> {
  const first = finishedSolid(solids[0], { state, label: "STAIR", before: plan, notice });
  if (first.result?.kind !== "document" || solids.length === 1) return first;
  const commands: CadEntityCommand[] = [...first.result.commands];
  for (const solid of solids.slice(1)) {
    const finished = finishedSolid(solid, { state, label: "STAIR" });
    if (finished.result?.kind !== "document") return finished;
    commands.push(...finished.result.commands);
  }
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands, label: "STAIR", notice },
  };
}

function finishStair(state: StairState, to: CadPoint2, context: CadCommandContext): CadCommandStep<StairState> {
  const start = state.start!;
  const direction = cadDirection(start, to);
  if (!direction) return solidMessage(state, "STAIR: el segundo punto coincide con el arranque y no da dirección de subida.");
  const design = cadStairDesign(request(state, context));
  if ("refused" in design) return solidMessage(state, design.refused);
  const origin = cadLiftPoint(start);
  const layout = cadStairLayout(design, start, direction);
  const plan = cadStairPlan(design, layout);
  const summary = cadStairSummary(design, context.unit);
  // Los ids se piden en orden de subida —tramo, descanso, tramo…— y ANTES de
  // los de la planta, que es el orden que tenía la escalera recta.
  const solids: CadSolid3dEntity[] = [];
  for (let index = 0; index < layout.flights.length; index += 1) {
    solids.push(
      makeSolidEntity(
        context.newEntityId(),
        [cadStairFlightNode(design, layout.flights[index], origin.z)],
        "escalera",
        context.activeLayer,
        pieceName(design, index, context),
      ),
    );
    const landing = layout.landings[index];
    if (landing)
      solids.push(
        makeSolidEntity(
          context.newEntityId(),
          [cadStairLandingNode(design, landing, origin.z)],
          "descanso",
          context.activeLayer,
          landingName(design, landing, index, context),
        ),
      );
  }
  return finishPieces(state, solids, planEntities(plan, origin.z, context), `STAIR: ${summary}`);
}

function readPending(state: StairState, input: CadCommandInput, context: CadCommandContext): CadCommandStep<StairState> {
  if (input.kind === "enter") return stairStep({ ...state, pending: "none" }, context);
  if (input.kind !== "distance") return stairStep(state, context);
  const value = Math.abs(input.value);
  if (!(value > 1e-9)) return solidMessage(state, `STAIR: ${PENDING_PROMPTS[state.pending as StairDistancePending].toLowerCase().replace("precise ", "")} tiene que ser mayor que cero.`);
  const next: StairState = { ...state, pending: "none" };
  if (state.pending === "width") next.width = value;
  else if (state.pending === "rise") next.rise = value;
  else if (state.pending === "tread") next.tread = value;
  else if (state.pending === "landing") next.landing = value;
  else next.maxRiser = value;
  // Un límite fuera de reglamento se rechaza al teclearlo, no al final, para
  // que el dibujante no coloque dos puntos y descubra entonces que no hay
  // escalera.
  const checked = cadStairDesign(request(next, context));
  if ("refused" in checked) return solidMessage(state, checked.refused);
  return stairStep(next, context);
}

/** La forma tecleada se comprueba en el acto: un reparto imposible se dice ya. */
function readForm(state: StairState, form: CadStairForm, context: CadCommandContext): CadCommandStep<StairState> {
  const next: StairState = { ...state, form, pending: "none" };
  const checked = cadStairDesign(request(next, context));
  if ("refused" in checked) return solidMessage(state, checked.refused);
  return stairStep(next, context);
}

const stairCommand: CadCommandDescriptor<StairState> = {
  name: "STAIR",
  aliases: ["STAIRADD", "ESCALERA"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  // La planta y el sólido toman la cota del arranque: sobre la planta elevada
  // a +3000 la escalera arranca a +3000. Su plano es el horizontal.
  spatial: "elevation",
  cursor: "crosshair",
  begin: (context) =>
    stairStep(
      {
        start: null,
        width: cadFromMillimetres(CAD_STAIR_DEFAULT_WIDTH_MM, context.unit),
        rise: cadFromMillimetres(CAD_STAIR_DEFAULT_RISE_MM, context.unit),
        tread: null,
        maxRiser: cadFromMillimetres(CAD_STAIR_MAX_RISER_MM, context.unit),
        form: "recto",
        landing: null,
        pending: "none",
      },
      context,
    ),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (state.pending === "form") {
      if (input.kind === "enter") return stairStep({ ...state, pending: "none" }, context);
      if (input.kind !== "keyword") return stairStep(state, context);
      if (input.keyword === STRAIGHT.keyword) return readForm(state, "recto", context);
      if (input.keyword === ELL.keyword) return readForm(state, "ele", context);
      if (input.keyword === UTURN.keyword) return readForm(state, "u", context);
      return stairStep(state, context);
    }
    if (state.pending !== "none") return readPending(state, input, context);
    if (input.kind === "keyword") {
      if (input.keyword === WIDTH.keyword) return stairStep({ ...state, pending: "width" }, context);
      if (input.keyword === RISE.keyword) return stairStep({ ...state, pending: "rise" }, context);
      if (input.keyword === TREAD.keyword) return stairStep({ ...state, pending: "tread" }, context);
      if (input.keyword === RISER.keyword) return stairStep({ ...state, pending: "riser" }, context);
      if (input.keyword === FORM.keyword) return stairStep({ ...state, pending: "form" }, context);
      if (input.keyword === LANDING.keyword && state.form !== "recto") return stairStep({ ...state, pending: "landing" }, context);
      return stairStep(state, context);
    }
    if (input.kind === "enter") return solidMessage(state, state.start ? "STAIR necesita la dirección de subida." : "STAIR necesita un punto de arranque.");
    if (input.kind !== "point") return stairStep(state, context);
    if (!state.start) return stairStep({ ...state, start: input.point }, context);
    return finishStair(state, input.point, context);
  },
};

export const CAD_ARCHITECTURE_STAIR_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(stairCommand)];
