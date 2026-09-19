/**
 * LA VIVIENDA DE LA DEMOSTRACIÓN — dos plantas, en sólidos de verdad.
 *
 * `/demo` abría hasta hoy un plano plano: la plantilla «casa habitación»
 * convertida a polilíneas, sin un solo sólido que sombrear ni orbitar. Este
 * módulo construye la vivienda como RECETAS del esquema 5 (`solid3d`) con lo
 * que el motor ya sabe hacer, y deriva las plantas 2D de la MISMA receta, de
 * modo que muro, vano y rótulo salen de un único juego de números.
 *
 * ## Por qué cada muro es UNA extrusión en plano vertical y no una booleana
 *
 * El gesto obvio —extruir la planta y restar cajas de vano— pasa por las
 * booleanas BSP del kernel, que devuelven caras TRIANGULADAS (la planta y el
 * PDF proyectarían un enjambre de diagonales) y que ante diez cajas contra un
 * anillo con agujeros pueden fallar en alguna configuración, sin degradación
 * parcial: el sólido entero se cae. Fundir caras coplanarias en el evaluador lo
 * arreglaría, pero arrastra `brep/coplanar-merge` (1 160 líneas) al chunk de
 * `/plantillas`, exactamente la fuga que `brep/index.ts` documenta y prohíbe.
 *
 * Un muro con vanos es, en cambio, una REGIÓN en su plano vertical: un
 * rectángulo con muescas en la base (puertas y pasos) y agujeros (ventanas),
 * extruido a lo largo de su grosor. Es una sola hoja `extrude` por muro —cero
 * booleanas—, sus caras son exactas y la planta que proyecta es la del muro con
 * sus jambas. Es, además, lo que un modelador haría a mano: EXTRUDE sobre la
 * región del alzado.
 *
 * ## Coordenadas
 *
 * Todo en milímetros. La vivienda se describe en coordenadas LOCALES
 * (0,0 en la esquina suroeste exterior) y se emite tres veces: planta baja y
 * planta alta como dibujo 2D, y el modelo 3D en su propia zona. Así el visor
 * 2D enseña dos plantas limpias y el modelo entero proyecta aparte, sin
 * superponer la planta alta sobre la baja.
 *
 * Determinista: sin fechas ni azar. Dos llamadas producen el mismo documento.
 */
import type { CadEntity, CadLayerDef, CadPoint2, CadPoint3 } from "../cad-document";
import type { CadSolid3dEntity, CadSolidNode, CadSolidProfile } from "../cad-entities-v5";
import { cadRoofGeometry, cadRoofVolume, type CadRoofGeometry } from "../engine/commands/architecture-roof";
import {
  cadStairDesign,
  cadStairLayout,
  cadStairFlightNode,
  cadStairLandingNode,
  cadStairPlan,
  type CadStairDesign,
  type CadStairLayout,
} from "../engine/commands/architecture-stair";
import { cadAnnotativeModelHeight } from "../layout/annotative-scale";
import { planeFrameAt } from "../solid3d-profiles";
import { CAD_MEXICAN_TEXT_MM, CAD_MEXICAN_TEXT_STYLES } from "../standards/mexican-annotation";

// ---------------------------------------------------------------------------
// Parámetros
// ---------------------------------------------------------------------------

/**
 * Versión de la receta que persiste el navegador del visitante. Un dibujo demo
 * guardado con una versión anterior (el plano plano) se descarta al abrir: si
 * no, un visitante recurrente vería el 3D vacío.
 */
export const DEMO_HOUSE_RECIPE_VERSION = 2;

/** Escala de la lámina: A1 a 1:50, la de la planta arquitectónica de norma. */
export const DEMO_HOUSE_SCALE = 50;

export const DEMO_HOUSE = {
  width: 10600,
  depth: 6600,
  exteriorWall: 250,
  interiorWall: 150,
  /** Altura libre de cada nivel. */
  storey: 2500,
  slab: 150,
  /** Alero y pendiente de la cubierta a cuatro aguas. */
  overhang: 600,
  slopePercent: 30,
  door: { width: 800, height: 2100 },
  mainDoor: { width: 900, height: 2100 },
  window: { width: 1200, sill: 900, height: 1200 },
  bathWindow: { width: 600, sill: 1500, height: 600 },
  stair: { width: 1000, maxRiser: 180 },
} as const;

/** Cotas de los niveles: la losa de entrepiso va entre los dos. */
export const DEMO_HOUSE_LEVELS = {
  ground: 0,
  slabBottom: DEMO_HOUSE.storey,
  upper: DEMO_HOUSE.storey + DEMO_HOUSE.slab,
  roof: DEMO_HOUSE.storey * 2 + DEMO_HOUSE.slab,
} as const;

/** Dónde cae cada figura en el espacio modelo. */
export const DEMO_HOUSE_ZONES = {
  plantaBaja: { x: 700, y: 700 },
  plantaAlta: { x: 12700, y: 700 },
  modelo: { x: 25300, y: 700 },
} as const;

export const DEMO_HOUSE_FOOTPRINT = { width: 37200, height: 8600 } as const;

/** Capas del modelo 3D: se ven, no se imprimen (`plot:false` → el PDF sale limpio). */
export const DEMO_HOUSE_3D_LAYERS: readonly CadLayerDef[] = [
  { id: "3D-MUROS-N1", name: "3D · Muros nivel 1", color: "#e2e8f0", visible: true, locked: false, plot: false },
  { id: "3D-MUROS-N2", name: "3D · Muros nivel 2", color: "#cbd5e1", visible: true, locked: false, plot: false },
  { id: "3D-LOSAS", name: "3D · Losas", color: "#94a3b8", visible: true, locked: false, plot: false },
  { id: "3D-ESCALERA", name: "3D · Escalera", color: "#fbbf24", visible: true, locked: false, plot: false },
  { id: "3D-CUBIERTA", name: "3D · Cubierta", color: "#f87171", visible: true, locked: false, plot: false },
];

// ---------------------------------------------------------------------------
// La receta: muros, vanos y locales de cada nivel
// ---------------------------------------------------------------------------

type OpeningKind = "puerta" | "ventana" | "paso";

export interface DemoOpening {
  kind: OpeningKind;
  /** Arranque del vano medido desde `from`, a lo largo del muro. */
  at: number;
  width: number;
  sill: number;
  height: number;
}

export interface DemoWall {
  id: string;
  name: string;
  from: CadPoint2;
  to: CadPoint2;
  thickness: number;
  openings: DemoOpening[];
}

interface Room {
  name: string;
  min: CadPoint2;
  max: CadPoint2;
}

interface Level {
  id: "n1" | "n2";
  title: string;
  walls: DemoWall[];
  rooms: Room[];
}

const W = DEMO_HOUSE.width;
const D = DEMO_HOUSE.depth;
const TE = DEMO_HOUSE.exteriorWall;
const TI = DEMO_HOUSE.interiorWall;
const H = DEMO_HOUSE.storey;

const door = (at: number, main = false): DemoOpening => ({
  kind: "puerta",
  at,
  width: main ? DEMO_HOUSE.mainDoor.width : DEMO_HOUSE.door.width,
  sill: 0,
  height: DEMO_HOUSE.door.height,
});
const paso = (at: number, width: number): DemoOpening => ({ kind: "paso", at, width, sill: 0, height: DEMO_HOUSE.door.height });
const ventana = (at: number): DemoOpening => ({ kind: "ventana", at, ...DEMO_HOUSE.window });
const bathWindow = (at: number): DemoOpening => ({ kind: "ventana", at, ...DEMO_HOUSE.bathWindow });

/**
 * Los cuatro muros exteriores. El muro queda a la IZQUIERDA de `from → to`, así
 * que el anillo va antihorario y todos miran hacia dentro. Los muros largos
 * (sur y norte) van de esquina a esquina; los cortos (este y oeste) se ajustan
 * entre ellos: juntas a tope sin solapar, sin dos tapas coplanarias que
 * parpadeen al orbitar.
 */
function exteriorWalls(level: "n1" | "n2", south: DemoOpening[], north: DemoOpening[], west: DemoOpening[], east: DemoOpening[]): DemoWall[] {
  return [
    { id: `${level}-sur`, name: "Muro sur", from: { x: 0, y: 0 }, to: { x: W, y: 0 }, thickness: TE, openings: south },
    { id: `${level}-este`, name: "Muro este", from: { x: W, y: TE }, to: { x: W, y: D - TE }, thickness: TE, openings: east },
    { id: `${level}-norte`, name: "Muro norte", from: { x: W, y: D }, to: { x: 0, y: D }, thickness: TE, openings: north },
    { id: `${level}-oeste`, name: "Muro oeste", from: { x: 0, y: D - TE }, to: { x: 0, y: TE }, thickness: TE, openings: west },
  ];
}

/** Muro interior horizontal (a la izquierda = +Y) entre dos caras de muro. */
const wallX = (id: string, name: string, y: number, x0: number, x1: number, openings: DemoOpening[]): DemoWall => ({
  id,
  name,
  from: { x: x0, y },
  to: { x: x1, y },
  thickness: TI,
  openings,
});
/** Muro interior vertical (a la izquierda = −X), de `y0` a `y1`, con su cara derecha en `x`. */
const wallY = (id: string, name: string, x: number, y0: number, y1: number, openings: DemoOpening[]): DemoWall => ({
  id,
  name,
  from: { x, y: y0 },
  to: { x, y: y1 },
  thickness: TI,
  openings,
});

const MID = D / 2 - TI / 2; // 3225: cara sur del muro divisorio central

const GROUND: Level = {
  id: "n1",
  title: "PLANTA BAJA",
  walls: [
    ...exteriorWalls(
      "n1",
      [ventana(1300), door(3100, true), ventana(5200), ventana(8300)],
      // A lo largo del muro norte `u` corre de este a oeste: u = W − x.
      [ventana(W - 7200), bathWindow(W - 4900), ventana(W - 2500)],
      // Oeste: u = (D − TE) − y.
      [ventana(D - TE - 5500), ventana(D - TE - 2400)],
      // Este: u = y − TE.
      [ventana(1200 - TE)],
    ),
    wallX("n1-divisorio", "Muro divisorio", MID, TE, W - TE, [door(1500 - TE), door(4300 - TE), paso(5900 - TE, 1200)]),
    wallY("n1-sala-comedor", "Muro sala–comedor", 4350, TE, MID, [paso(1150 - TE, 1200)]),
    wallY("n1-comedor-cocina", "Muro comedor–cocina", 7450, TE, MID, [door(1100)]),
    wallY("n1-recamara-bano", "Muro recámara–baño", 3750, MID + TI, D - TE, []),
    wallY("n1-bano-vestibulo", "Muro baño–vestíbulo", 5650, MID + TI, D - TE, []),
  ],
  rooms: [
    { name: "SALA", min: { x: TE, y: TE }, max: { x: 4200, y: MID } },
    { name: "COMEDOR", min: { x: 4350, y: TE }, max: { x: 7300, y: MID } },
    { name: "COCINA", min: { x: 7450, y: TE }, max: { x: W - TE, y: MID } },
    { name: "RECÁMARA PRINCIPAL", min: { x: TE, y: MID + TI }, max: { x: 3600, y: D - TE } },
    { name: "BAÑO", min: { x: 3750, y: MID + TI }, max: { x: 5500, y: D - TE } },
    { name: "VESTÍBULO", min: { x: 5650, y: MID + TI }, max: { x: 7400, y: D - TE } },
  ],
};

const UPPER: Level = {
  id: "n2",
  title: "PLANTA ALTA",
  walls: [
    ...exteriorWalls(
      "n2",
      [ventana(1300), ventana(4700), ventana(8300)],
      [ventana(W - 7200), ventana(W - 4200), bathWindow(W - 1300)],
      [ventana(D - TE - 5500), ventana(D - TE - 2400)],
      [ventana(1200 - TE)],
    ),
    wallX("n2-divisorio", "Muro divisorio", MID, TE, W - TE, [door(2200 - TE), door(4400 - TE), door(6550 - TE)]),
    wallY("n2-recamara-2-3", "Muro recámara 2–3", 3350, TE, MID, []),
    wallY("n2-recamara-estudio", "Muro recámara–estudio", 6450, TE, MID, []),
    wallY("n2-bano-estancia", "Muro baño–estancia", 2000, MID + TI, D - TE, [door(4600 - MID - TI)]),
    wallY("n2-estancia-vestibulo", "Muro estancia–vestíbulo", 5650, MID + TI, D - TE, [paso(4700 - MID - TI, 1500)]),
  ],
  rooms: [
    { name: "RECÁMARA 2", min: { x: TE, y: TE }, max: { x: 3200, y: MID } },
    { name: "RECÁMARA 3", min: { x: 3350, y: TE }, max: { x: 6300, y: MID } },
    { name: "ESTUDIO", min: { x: 6450, y: TE }, max: { x: W - TE, y: MID } },
    { name: "BAÑO", min: { x: TE, y: MID + TI }, max: { x: 1850, y: D - TE } },
    { name: "ESTANCIA", min: { x: 2000, y: MID + TI }, max: { x: 5500, y: D - TE } },
    { name: "VESTÍBULO", min: { x: 5650, y: MID + TI }, max: { x: 7400, y: D - TE } },
  ],
};

// ---------------------------------------------------------------------------
// Aritmética de muro
// ---------------------------------------------------------------------------

function wallFrame(wall: DemoWall): { length: number; along: CadPoint2; left: CadPoint2 } {
  const dx = wall.to.x - wall.from.x;
  const dy = wall.to.y - wall.from.y;
  const length = Math.hypot(dx, dy);
  const along = { x: dx / length, y: dy / length };
  return { length, along, left: { x: -along.y, y: along.x } };
}

/** Punto del muro a `u` desde `from` y `v` hacia su izquierda. */
function wallPoint(wall: DemoWall, u: number, v: number): CadPoint2 {
  const { along, left } = wallFrame(wall);
  return { x: wall.from.x + along.x * u + left.x * v, y: wall.from.y + along.y * u + left.y * v };
}

/**
 * El perfil del muro en su plano vertical (x = avance, y = altura): rectángulo
 * con muescas en la base para puertas y pasos, y agujeros para ventanas.
 */
export function demoWallProfile(wall: DemoWall, height: number): CadSolidProfile {
  const { length } = wallFrame(wall);
  const openings = [...wall.openings].sort((a, b) => a.at - b.at);
  const outer: CadPoint2[] = [{ x: 0, y: 0 }];
  const inners: CadPoint2[][] = [];
  for (const opening of openings) {
    const u0 = opening.at;
    const u1 = opening.at + opening.width;
    const top = opening.sill + opening.height;
    if (opening.sill === 0) {
      outer.push({ x: u0, y: 0 }, { x: u0, y: top }, { x: u1, y: top }, { x: u1, y: 0 });
    } else {
      inners.push([
        { x: u0, y: opening.sill },
        { x: u1, y: opening.sill },
        { x: u1, y: top },
        { x: u0, y: top },
      ]);
    }
  }
  outer.push({ x: length, y: 0 }, { x: length, y: height }, { x: 0, y: height });
  return inners.length > 0 ? { outer, inners } : { outer };
}

/**
 * El sólido de un muro: la región del alzado extruida a lo largo del grosor.
 *
 * Marco: X = avance, Z = −izquierda; el Y resultante (Z × X) es la vertical
 * del mundo. Altura NEGATIVA = extruir hacia +Z del marco invertido, es decir
 * hacia la izquierda: el muro ocupa la franja a la izquierda de `from → to`.
 */
function wallSolid(wall: DemoWall, origin: CadPoint2, baseZ: number, layer: string): CadSolid3dEntity {
  const { along, left } = wallFrame(wall);
  const node: CadSolidNode = {
    id: "muro",
    op: "extrude",
    profile: demoWallProfile(wall, H),
    frame: {
      origin: { x: origin.x + wall.from.x, y: origin.y + wall.from.y, z: baseZ },
      xAxis: { x: along.x, y: along.y, z: 0 },
      zAxis: { x: -left.x, y: -left.y, z: 0 },
    },
    height: -wall.thickness,
  };
  return { id: `demo-${wall.id}`, type: "solid3d", name: wall.name, nodes: [node], root: "muro", layer };
}

// ---------------------------------------------------------------------------
// Escalera y cubierta
// ---------------------------------------------------------------------------

export interface DemoStair {
  design: CadStairDesign;
  layout: CadStairLayout;
  /** Contorno en L del hueco de la losa: la huella exacta de tramos y descanso. */
  well: CadPoint2[];
}

/** La escalera en L del vestíbulo, en coordenadas locales de la vivienda. */
export function demoStair(): DemoStair {
  const design = cadStairDesign({
    rise: DEMO_HOUSE_LEVELS.upper,
    width: DEMO_HOUSE.stair.width,
    tread: null,
    maxRiser: DEMO_HOUSE.stair.maxRiser,
    form: "ele",
    landing: null,
    unit: "mm",
  });
  if ("refused" in design) throw new Error(`La escalera de la demostración no cumple: ${design.refused}`);
  // El primer tramo sube hacia el este pegado al muro divisorio; el descanso
  // queda contra el muro este y el segundo tramo gira al norte.
  const run1 = (design.flights[0] - 1) * design.tread;
  const run2 = (design.flights[1] - 1) * design.tread;
  const start = { x: W - TE - run1 - design.landing, y: MID + TI + 75 };
  const layout = cadStairLayout(design, start, { along: { x: 1, y: 0 }, left: { x: 0, y: 1 }, degrees: 0 });
  const w = design.width;
  const well: CadPoint2[] = [
    start,
    { x: start.x + run1 + design.landing, y: start.y },
    { x: start.x + run1 + design.landing, y: start.y + w + run2 },
    { x: start.x + run1, y: start.y + w + run2 },
    { x: start.x + run1, y: start.y + w },
    { x: start.x, y: start.y + w },
  ];
  return { design, layout, well };
}

function shift(point: CadPoint2, origin: CadPoint2): CadPoint2 {
  return { x: point.x + origin.x, y: point.y + origin.y };
}

function stairSolids(stair: DemoStair, origin: CadPoint2): CadSolid3dEntity[] {
  const moved = cadStairLayout(stair.design, shift(stair.layout.flights[0].origin, origin), stair.layout.flights[0].direction);
  const solids: CadSolid3dEntity[] = moved.flights.map((flight, index) => ({
    id: `demo-escalera-tramo-${index + 1}`,
    type: "solid3d",
    name: `Escalera tramo ${index + 1}`,
    nodes: [cadStairFlightNode(stair.design, flight, DEMO_HOUSE_LEVELS.ground, "tramo")],
    root: "tramo",
    layer: "3D-ESCALERA",
  }));
  moved.landings.forEach((landing, index) => {
    solids.push({
      id: `demo-escalera-descanso-${index + 1}`,
      type: "solid3d",
      name: "Escalera descanso",
      nodes: [cadStairLandingNode(stair.design, landing, DEMO_HOUSE_LEVELS.ground, "descanso")],
      root: "descanso",
      layer: "3D-ESCALERA",
    });
  });
  return solids;
}

/** La cubierta a cuatro aguas sobre el rectángulo exterior, con su alero. */
export function demoRoof(origin: CadPoint2): CadRoofGeometry {
  return cadRoofGeometry(
    {
      center: { x: origin.x + W / 2, y: origin.y + D / 2 },
      along: { x: 1, y: 0 },
      left: { x: 0, y: 1 },
      halfLength: W / 2,
      halfWidth: D / 2,
      elevation: DEMO_HOUSE_LEVELS.roof,
      sourceId: "demo-cubierta",
    },
    { form: "cuatro", slopePercent: DEMO_HOUSE.slopePercent, overhang: DEMO_HOUSE.overhang },
  );
}

/** Volumen de la cubierta según la fórmula del motor, para que la spec lo contraste. */
export function demoRoofVolume(): number {
  return cadRoofVolume(demoRoof({ x: 0, y: 0 }), "cuatro");
}

function slabSolid(id: string, name: string, origin: CadPoint2, z: number, inners?: CadPoint2[][]): CadSolid3dEntity {
  const ring = [
    { x: origin.x, y: origin.y },
    { x: origin.x + W, y: origin.y },
    { x: origin.x + W, y: origin.y + D },
    { x: origin.x, y: origin.y + D },
  ];
  const profile: CadSolidProfile = inners && inners.length > 0 ? { outer: ring, inners } : { outer: ring };
  return {
    id,
    type: "solid3d",
    name,
    nodes: [{ id: "losa", op: "extrude", profile, height: DEMO_HOUSE.slab, frame: planeFrameAt(z) }],
    root: "losa",
    layer: "3D-LOSAS",
  };
}

// ---------------------------------------------------------------------------
// Planta 2D derivada de la receta
// ---------------------------------------------------------------------------

const lift = (point: CadPoint2): CadPoint3 => ({ x: point.x, y: point.y, z: 0 });

class PlanWriter {
  readonly entities: CadEntity[] = [];
  private serial = 0;
  constructor(private readonly prefix: string) {}

  private id(): string {
    this.serial += 1;
    return `demo-${this.prefix}-${this.serial}`;
  }

  line(a: CadPoint2, b: CadPoint2, layer: string): void {
    this.entities.push({ id: this.id(), type: "line", start: lift(a), end: lift(b), layer });
  }

  polyline(points: readonly CadPoint2[], closed: boolean, layer: string): void {
    this.entities.push({ id: this.id(), type: "polyline", vertices: points.map(lift), closed, layer });
  }

  text(at: CadPoint2, text: string, height: number, style: string, rotation?: number): void {
    this.entities.push({
      id: this.id(),
      type: "text",
      x: at.x,
      y: at.y,
      text,
      layer: "TEXTO",
      style,
      height,
      ...(rotation ? { rotation } : {}),
    });
  }
}

/**
 * Un muro en planta: sus dos caras partidas en cada vano, las tapas de los
 * extremos y las jambas; ventana con sus dos líneas de cancel, puerta con hoja
 * abierta a 90° y arco de abatimiento hacia el lado izquierdo del muro.
 */
function wallPlan(writer: PlanWriter, wall: DemoWall, origin: CadPoint2): void {
  const { length, along } = wallFrame(wall);
  const t = wall.thickness;
  const at = (u: number, v: number) => shift(wallPoint(wall, u, v), origin);
  const openings = [...wall.openings].sort((a, b) => a.at - b.at);
  let cursor = 0;
  for (const opening of openings) {
    const u0 = opening.at;
    const u1 = opening.at + opening.width;
    for (const v of [0, t]) writer.line(at(cursor, v), at(u0, v), "MURO");
    writer.line(at(u0, 0), at(u0, t), "MURO");
    writer.line(at(u1, 0), at(u1, t), "MURO");
    if (opening.kind === "ventana") {
      for (const v of [t / 3, (2 * t) / 3]) writer.line(at(u0, v), at(u1, v), "CANCEL");
    } else if (opening.kind === "puerta") {
      const hinge = at(u0, t);
      writer.line(hinge, at(u0, t + opening.width), "VANO");
      const startAngle = (Math.atan2(along.y, along.x) * 180) / Math.PI;
      writer.entities.push({
        id: `demo-${wall.id}-abatimiento-${u0}`,
        type: "arc",
        center: lift(hinge),
        radius: opening.width,
        startAngle,
        endAngle: startAngle + 90,
        layer: "VANO",
      });
    }
    cursor = u1;
  }
  for (const v of [0, t]) writer.line(at(cursor, v), at(length, v), "MURO");
  writer.line(at(0, 0), at(0, t), "MURO");
  writer.line(at(length, 0), at(length, t), "MURO");
}

function levelPlan(level: Level, stair: DemoStair, origin: CadPoint2): CadEntity[] {
  const writer = new PlanWriter(level.id);
  const label = cadAnnotativeModelHeight(CAD_MEXICAN_TEXT_MM.rotulo, DEMO_HOUSE_SCALE, "mm");
  const title = cadAnnotativeModelHeight(CAD_MEXICAN_TEXT_MM.titulo, DEMO_HOUSE_SCALE, "mm");
  for (const wall of level.walls) wallPlan(writer, wall, origin);
  for (const room of level.rooms) {
    writer.text(
      shift({ x: (room.min.x + room.max.x) / 2, y: (room.min.y + room.max.y) / 2 }, origin),
      room.name,
      label,
      CAD_MEXICAN_TEXT_STYLES.rotulo,
    );
  }
  if (level.id === "n1") {
    const plan = cadStairPlan(stair.design, stair.layout);
    for (const outline of [...plan.flights, ...plan.landings]) writer.polyline(outline.map((p) => shift(p, origin)), true, "MURO");
    for (const [a, b] of plan.risers) writer.line(shift(a, origin), shift(b, origin), "MURO");
    writer.polyline(plan.travel.map((p) => shift(p, origin)), false, "VANO");
    writer.polyline(plan.arrow.map((p) => shift(p, origin)), false, "VANO");
    writer.text(shift(plan.label.at, origin), "SUBE", plan.label.height, CAD_MEXICAN_TEXT_STYLES.rotulo, plan.label.degrees);
  } else {
    writer.polyline(stair.well.map((p) => shift(p, origin)), true, "MURO");
    const first = stair.well[0];
    writer.text(shift({ x: first.x + 200, y: first.y + 400 }, origin), "BAJA", label, CAD_MEXICAN_TEXT_STYLES.rotulo);
  }
  writer.text(shift({ x: 0, y: D + 600 }, origin), level.title, title, CAD_MEXICAN_TEXT_STYLES.titulo);
  return writer.entities;
}

// ---------------------------------------------------------------------------
// El conjunto
// ---------------------------------------------------------------------------

export interface DemoHouse {
  layers: CadLayerDef[];
  entities: CadEntity[];
  solids: CadSolid3dEntity[];
  stair: DemoStair;
  roof: CadRoofGeometry;
  footprint: { width: number; height: number };
}

/** Cuántos sólidos lleva la vivienda: lo que el diagnóstico de escena debe contar. */
export function demoHouseSolidCount(): number {
  return GROUND.walls.length + UPPER.walls.length + 2 + 3 + 1;
}

/** Área neta de la región de un muro (para contrastar volúmenes en la spec). */
export function demoWallRegionArea(wall: { openings: DemoOpening[]; from: CadPoint2; to: CadPoint2 }): number {
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  return length * H - wall.openings.reduce((sum, opening) => sum + opening.width * opening.height, 0);
}

/** Los muros de cada nivel, en coordenadas locales — la spec contrasta con ellos. */
export function demoHouseWalls(): { n1: readonly DemoWall[]; n2: readonly DemoWall[] } {
  return { n1: GROUND.walls, n2: UPPER.walls };
}

export function buildDemoHouse(): DemoHouse {
  const stair = demoStair();
  const model = DEMO_HOUSE_ZONES.modelo;
  const solids: CadSolid3dEntity[] = [
    ...GROUND.walls.map((wall) => wallSolid(wall, model, DEMO_HOUSE_LEVELS.ground, "3D-MUROS-N1")),
    ...UPPER.walls.map((wall) => wallSolid(wall, model, DEMO_HOUSE_LEVELS.upper, "3D-MUROS-N2")),
    slabSolid("demo-losa-piso", "Losa de piso", model, -DEMO_HOUSE.slab),
    slabSolid("demo-losa-entrepiso", "Losa de entrepiso", model, DEMO_HOUSE_LEVELS.slabBottom, [
      stair.well.map((p) => shift(p, model)),
    ]),
    ...stairSolids(stair, model),
    { id: "demo-cubierta", type: "solid3d", name: "Cubierta", nodes: [demoRoof(model).node], root: "cubierta", layer: "3D-CUBIERTA" },
  ];
  const title = cadAnnotativeModelHeight(CAD_MEXICAN_TEXT_MM.titulo, DEMO_HOUSE_SCALE, "mm");
  const entities: CadEntity[] = [
    ...levelPlan(GROUND, stair, DEMO_HOUSE_ZONES.plantaBaja),
    ...levelPlan(UPPER, stair, DEMO_HOUSE_ZONES.plantaAlta),
    ...solids,
    {
      id: "demo-titulo-modelo",
      type: "text",
      x: model.x,
      y: model.y + D + 600,
      text: "MODELO 3D",
      layer: "TEXTO",
      style: CAD_MEXICAN_TEXT_STYLES.titulo,
      height: title,
    },
  ];
  return {
    layers: [...DEMO_HOUSE_3D_LAYERS],
    entities,
    solids,
    stair,
    roof: demoRoof(model),
    footprint: { ...DEMO_HOUSE_FOOTPRINT },
  };
}
