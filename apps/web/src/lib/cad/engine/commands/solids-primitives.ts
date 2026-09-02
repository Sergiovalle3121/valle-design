/**
 * Las ocho primitivas de sólido: BOX, WEDGE, CYLINDER, CONE, SPHERE, TORUS,
 * PYRAMID y POLYSOLID (Ola C, 2026-09-02).
 *
 * Medido antes (`distancia-autocad-completo-20260901.md`): el nodo `box`
 * existía en el esquema 5 y ningún comando lo creaba; las otras siete no
 * tenían ni nodo ni orden. Un modelador con EXTRUDE y sin BOX obliga a
 * dibujar un rectángulo para levantar una caja: es la primera cosa que un
 * dibujante de AutoCAD echa en falta al abrir la pestaña de sólidos.
 *
 * ## Recetas, no mallas
 *
 * Cada primitiva se escribe como UN nodo del árbol del esquema 5, así que
 * sigue siendo reeditable (cambiar el radio en el panel rehace la pieza) y
 * viaja al servidor como receta y no como miles de vértices:
 *
 *   - `box` para la caja;
 *   - `extrude` para el cilindro (perfil circular), la cuña (un triángulo
 *     extruido de canto) y el polisólido (la huella del muro);
 *   - `revolve` para el cono, la esfera y el toro;
 *   - `brep` para la pirámide, que no es receta de nada: base y vértice.
 *
 * Las superficies curvas salen FACETADAS (`CAD_PRIMITIVE_SEGMENTS` caras):
 * está dicho aquí y en el kernel, y cambia lo que se puede esperar del
 * volumen — el cilindro es exacto porque `circleProfile` iguala el área, el
 * cono y la esfera se quedan por debajo en la cantidad conocida
 * (`revolveVolume`). Un B-rep con superficies analíticas es «todavía no» de
 * etapa (rúbrica `brep`), no de esta ola.
 *
 * ## Lo que cada orden NO hace, dicho aquí
 *
 *   - CYLINDER y CONE: sólo centro + radio/diámetro. Los modos 3P, 2P, Ttr y
 *     Elíptico no se ofrecen (el prompt no los anuncia).
 *   - TORUS: el radio del tubo tiene que ser MENOR que el del toro. El toro
 *     que se corta a sí mismo («manzana», «limón») cruza el eje y el kernel
 *     lo rechaza; se dice antes de intentarlo.
 *   - PYRAMID: Lados, Inscrito/Circunscrito y Radio superior; la opción
 *     Arista no se ofrece.
 *   - POLYSOLID: tramos RECTOS; Arco no se ofrece, y una polilínea con arcos
 *     designada con Objeto se rechaza diciéndolo.
 *
 * ## `spatial: "elevation"`
 *
 * Las ocho toman la cota del primer punto designado, así que dibujan sobre
 * la planta elevada (+3000) a +3000. Su forma vive en el plano horizontal —
 * la base de la caja es paralela al suelo— y sobre un SCU INCLINADO el motor
 * las rechaza con su motivo. Alinear la primitiva con el SCU inclinado pide
 * un marco en cada nodo (`box` no lo tiene); es el siguiente peldaño.
 */
import type { CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadSolidNode, CadSolidProfile } from "../../cad-entities-v5";
import type { CadEntityCommand } from "../../entity-commands";
import { circleProfile } from "../../../brep";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
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
import { cadLiftPoint, cadPointZ } from "../spatial-point";
import { finishedSolid, makeSolidEntity, solidCancelled, solidMessage } from "./solids-support";

/** Caras de una vuelta completa en cilindro, cono, esfera y toro. */
export const CAD_PRIMITIVE_SEGMENTS = 48;

const DIAMETER = { keyword: "Diámetro", shortcut: "D" } as const;
const TWO_POINTS = { keyword: "2Puntos", shortcut: "2P" } as const;
const CENTER = { keyword: "Centro", shortcut: "C" } as const;
const CUBE = { keyword: "Cubo", shortcut: "C" } as const;
const LENGTH = { keyword: "Longitud", shortcut: "L" } as const;
const TOP_RADIUS = { keyword: "radio Superior", shortcut: "S" } as const;
const SIDES = { keyword: "Lados", shortcut: "L" } as const;
const INSCRIBED = { keyword: "Inscrito", shortcut: "I" } as const;
const CIRCUMSCRIBED = { keyword: "Circunscrito", shortcut: "C" } as const;
const OBJECT = { keyword: "Objeto", shortcut: "O" } as const;
const HEIGHT = { keyword: "Altura", shortcut: "A" } as const;
const WIDTH = { keyword: "Ancho", shortcut: "N" } as const;
const JUSTIFY = { keyword: "Justificación", shortcut: "J" } as const;
const CLOSE = { keyword: "Cerrar", shortcut: "C" } as const;
const UNDO = { keyword: "desHacer", shortcut: "H" } as const;
const LEFT = { keyword: "Izquierda", shortcut: "I" } as const;
const MIDDLE = { keyword: "Centro", shortcut: "C" } as const;
const RIGHT = { keyword: "Derecha", shortcut: "D" } as const;

type Option = { readonly keyword: string; readonly shortcut: string };

/** Distancia en 3D entre dos puntos de entrada (la cota cuenta si la traen). */
function dist3(a: CadPoint2, b: CadPoint2): number {
  return Math.hypot(b.x - a.x, b.y - a.y, (cadPointZ(b) ?? 0) - (cadPointZ(a) ?? 0));
}

function ask<S>(
  state: S,
  message: string,
  options: readonly Option[],
  accepts: number,
  extra: { defaultValue?: string; preview?: CadPreviewPath[] } = {},
): CadCommandStep<S> {
  return {
    state,
    prompt: { message, options: [...options], ...(extra.defaultValue ? { defaultValue: extra.defaultValue } : {}) },
    accepts,
    ...(extra.preview ? { preview: extra.preview } : {}),
  };
}

/** Cierra la orden con el sólido de UN nodo, ya validado por `finishedSolid`. */
function done<S>(
  state: S,
  node: CadSolidNode,
  label: string,
  context: CadCommandContext,
  before?: CadEntityCommand[],
): CadCommandStep<S> {
  const solid = makeSolidEntity(context.newEntityId(), [node], node.id, context.activeLayer);
  return finishedSolid(solid, { state, label, ...(before ? { before } : {}) });
}

/** Marco horizontal con origen en `at`: la base de la primitiva. */
function frameAt(at: CadPoint3) {
  return { origin: at, zAxis: { x: 0, y: 0, z: 1 }, xAxis: { x: 1, y: 0, z: 0 } };
}

// ---------------------------------------------------------------------------
// Las dos preguntas que comparten todas: un RADIO y una ALTURA
// ---------------------------------------------------------------------------

interface RadiusAsk {
  /** Se ha tecleado Diámetro y se espera el número. */
  diameter: boolean;
}

function radiusPrompt<S extends RadiusAsk>(state: S, what: string, options: readonly Option[] = []): CadCommandStep<S> {
  if (state.diameter)
    return ask(state, `Precise el diámetro ${what}`, [], CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT);
  return ask(state, `Precise el radio ${what}`, [DIAMETER, ...options], CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD);
}

/** Lee un radio: número, punto (distancia al centro) o el diámetro tecleado. */
function readRadius(input: CadCommandInput, center: CadPoint2, diameter: boolean): number | null {
  const value =
    input.kind === "distance" ? Math.abs(input.value) : input.kind === "point" ? dist3(center, input.point) : null;
  if (value === null) return null;
  return diameter ? value / 2 : value;
}

interface HeightAsk {
  /** Puntos ya designados de la opción 2Puntos; `null` si no se ha pedido. */
  twoPoints: CadPoint2[] | null;
}

function heightPrompt<S extends HeightAsk>(state: S, options: readonly Option[] = [], defaultValue?: string): CadCommandStep<S> {
  if (state.twoPoints)
    return ask(
      state,
      state.twoPoints.length === 0 ? "Precise el primer punto de la altura" : "Precise el segundo punto de la altura",
      [],
      CAD_ACCEPT_POINT,
    );
  return ask(state, "Precise la altura", [TWO_POINTS, ...options], CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD, {
    defaultValue,
  });
}

/**
 * Lee una altura. Devuelve el número, un estado intermedio (2Puntos a
 * medias) o `null` si la entrada no era para ella.
 */
function readHeight<S extends HeightAsk>(
  state: S,
  input: CadCommandInput,
  reference: CadPoint2,
): { height: number } | { state: S } | null {
  if (state.twoPoints) {
    if (input.kind !== "point") return null;
    if (state.twoPoints.length === 0) return { state: { ...state, twoPoints: [input.point] } };
    return { height: dist3(state.twoPoints[0], input.point) };
  }
  if (input.kind === "keyword" && input.keyword === TWO_POINTS.keyword) return { state: { ...state, twoPoints: [] } };
  if (input.kind === "distance") return { height: input.value };
  // Un punto marca la altura por su distancia al punto de referencia — la
  // convención de arrastre del viewport 2D, la misma que EXTRUDE.
  if (input.kind === "point") return { height: dist3(reference, input.point) };
  return null;
}

const NO_HEIGHT = "necesita una altura distinta de cero.";
const NO_RADIUS = "necesita un radio mayor que cero.";

// ---------------------------------------------------------------------------
// BOX y WEDGE: esquina, esquina opuesta, altura
// ---------------------------------------------------------------------------

interface CornerState extends HeightAsk {
  first: CadPoint2 | null;
  opposite: CadPoint2 | null;
  /** El primer punto es el CENTRO (opción Centro). */
  centered: boolean;
  /** Longitud/anchura tecleadas con Longitud (y Cubo, que las iguala). */
  pending: "none" | "cube" | "length" | "width";
  length: number | null;
}

const EMPTY_CORNERS: CornerState = { first: null, opposite: null, centered: false, pending: "none", length: null, twoPoints: null };

function cornerStep(state: CornerState, context: CadCommandContext): CadCommandStep<CornerState> {
  if (!state.first)
    return ask(state, state.centered ? "Precise el centro" : "Precise la primera esquina", state.centered ? [] : [CENTER], CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD);
  if (state.pending === "cube") return ask(state, "Precise la longitud", [], CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT);
  if (state.pending === "length") return ask(state, "Precise la longitud", [], CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT);
  if (state.pending === "width") return ask(state, "Precise la anchura", [], CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT);
  if (!state.opposite) {
    const cursor = context.cursor;
    const preview: CadPreviewPath[] = cursor
      ? [{ points: [state.first, { x: cursor.x, y: state.first.y }, cursor, { x: state.first.x, y: cursor.y }], closed: true }]
      : [];
    return ask(state, "Precise la otra esquina", [CUBE, LENGTH], CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD, { preview });
  }
  return heightPrompt(state);
}

/** Caja alineada a ejes entre las dos esquinas y a la altura dada, o centrada. */
function boxBounds(state: CornerState, height: number): { min: CadPoint3; max: CadPoint3 } {
  const first = cadLiftPoint(state.first!);
  const opposite = cadLiftPoint(state.opposite!, state.first!);
  if (state.centered) {
    const dx = Math.abs(opposite.x - first.x);
    const dy = Math.abs(opposite.y - first.y);
    const dz = Math.abs(height) / 2;
    return { min: { x: first.x - dx, y: first.y - dy, z: first.z - dz }, max: { x: first.x + dx, y: first.y + dy, z: first.z + dz } };
  }
  return {
    min: { x: Math.min(first.x, opposite.x), y: Math.min(first.y, opposite.y), z: Math.min(first.z, first.z + height) },
    max: { x: Math.max(first.x, opposite.x), y: Math.max(first.y, opposite.y), z: Math.max(first.z, first.z + height) },
  };
}

function boxNode(state: CornerState, height: number): CadSolidNode {
  const { min, max } = boxBounds(state, height);
  return { id: "caja", op: "box", min, max };
}

/**
 * La cuña: un triángulo extruido DE CANTO. La cara inclinada baja a lo largo
 * de X desde la altura completa en la primera esquina hasta cero en la
 * opuesta, como en AutoCAD. Marco: X del mundo (con el signo del recorrido
 * primera→opuesta), Z del marco hacia −Y·signo para que la Y del perfil sea
 * la Z del mundo (Y = Z × X), y la extrusión recorre la anchura.
 */
function wedgeNode(state: CornerState, height: number): CadSolidNode {
  const first = cadLiftPoint(state.first!);
  const opposite = cadLiftPoint(state.opposite!, state.first!);
  const length = opposite.x - first.x;
  const width = opposite.y - first.y;
  const sx = length < 0 ? -1 : 1;
  const profile: CadSolidProfile = { outer: [{ x: 0, y: 0 }, { x: Math.abs(length), y: 0 }, { x: 0, y: height }] };
  return {
    id: "cuna",
    op: "extrude",
    profile,
    frame: { origin: first, xAxis: { x: sx, y: 0, z: 0 }, zAxis: { x: 0, y: -sx, z: 0 } },
    // Desplazamiento = altura·zAxis = (0, −sx·h, 0); para llegar a `width` en Y: h = −width·sx.
    height: -width * sx,
  };
}

function cornerDescriptor(
  name: string,
  aliases: readonly string[],
  build: (state: CornerState, height: number) => CadSolidNode,
): CadCommandDescriptor<CornerState> {
  return {
    name,
    aliases,
    kind: "draw",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: true,
    spatial: "elevation",
    cursor: "crosshair",
    begin: (context) => cornerStep(EMPTY_CORNERS, context),
    step: (state, input, context) => {
      if (input.kind === "cancel") return solidCancelled(state);
      if (!state.first) {
        if (input.kind === "keyword" && input.keyword === CENTER.keyword) return cornerStep({ ...state, centered: true }, context);
        if (input.kind === "point") return cornerStep({ ...state, first: input.point }, context);
        if (input.kind === "enter") return solidMessage(state, `${name} necesita una esquina.`);
        return cornerStep(state, context);
      }
      if (state.pending !== "none") {
        const value =
          input.kind === "distance" ? Math.abs(input.value) : input.kind === "point" ? dist3(state.first, input.point) : null;
        if (value === null) return input.kind === "enter" ? cornerStep({ ...state, pending: "none" }, context) : cornerStep(state, context);
        if (!(value > 1e-9)) return solidMessage(state, `${name} necesita una longitud mayor que cero.`);
        const first = state.first;
        if (state.pending === "cube")
          return done(state, build({ ...state, opposite: { x: first.x + value, y: first.y + value }, pending: "none" }, value), name, context);
        if (state.pending === "length") return cornerStep({ ...state, length: value, pending: "width" }, context);
        return cornerStep({ ...state, opposite: { x: first.x + state.length!, y: first.y + value }, pending: "none" }, context);
      }
      if (!state.opposite) {
        if (input.kind === "keyword" && input.keyword === CUBE.keyword) return cornerStep({ ...state, pending: "cube" }, context);
        if (input.kind === "keyword" && input.keyword === LENGTH.keyword) return cornerStep({ ...state, pending: "length" }, context);
        if (input.kind !== "point") return cornerStep(state, context);
        if (Math.abs(input.point.x - state.first.x) < 1e-9 || Math.abs(input.point.y - state.first.y) < 1e-9)
          return solidMessage(state, `${name}: las dos esquinas quedaron alineadas y la base no tiene ancho o largo.`);
        return cornerStep({ ...state, opposite: input.point }, context);
      }
      const read = readHeight(state, input, state.opposite);
      if (!read) return cornerStep(state, context);
      if ("state" in read) return cornerStep(read.state, context);
      if (!(Math.abs(read.height) > 1e-9)) return solidMessage(state, `${name} ${NO_HEIGHT}`);
      return done(state, build(state, read.height), name, context);
    },
  };
}

// ---------------------------------------------------------------------------
// CYLINDER, CONE, SPHERE y TORUS: centro, radio(s) y altura
// ---------------------------------------------------------------------------

interface RoundState extends RadiusAsk, HeightAsk {
  center: CadPoint2 | null;
  radius: number | null;
  /** CONE: radio superior (frustum); TORUS: radio del tubo. */
  second: number | null;
  askingSecond: boolean;
}

const EMPTY_ROUND: RoundState = { center: null, radius: null, second: null, askingSecond: false, diameter: false, twoPoints: null };

function circleAt(center: CadPoint2, radius: number): CadSolidProfile {
  return { outer: circleProfile(radius, CAD_PRIMITIVE_SEGMENTS).map((point) => ({ x: point.x + center.x, y: point.y + center.y })) };
}

function cylinderNode(center: CadPoint3, radius: number, height: number): CadSolidNode {
  return { id: "cilindro", op: "extrude", profile: circleAt({ x: 0, y: 0 }, radius), frame: frameAt(center), height };
}

/** Cono o tronco de cono: el perfil (radial, axial) es el trapecio/triángulo de su media sección. */
function coneNode(center: CadPoint3, radius: number, topRadius: number, height: number): CadSolidNode {
  const outer: CadPoint2[] = [{ x: 0, y: 0 }, { x: radius, y: 0 }];
  if (topRadius > 1e-9) outer.push({ x: topRadius, y: height });
  outer.push({ x: 0, y: height });
  return { id: "cono", op: "revolve", profile: { outer }, frame: frameAt(center), segments: CAD_PRIMITIVE_SEGMENTS };
}

/** Esfera: media circunferencia (x ≥ 0) cerrada por el eje, revolucionada. */
function sphereNode(center: CadPoint3, radius: number): CadSolidNode {
  const steps = CAD_PRIMITIVE_SEGMENTS / 2;
  const outer: CadPoint2[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const phi = -Math.PI / 2 + (Math.PI * index) / steps;
    outer.push({ x: index === 0 || index === steps ? 0 : radius * Math.cos(phi), y: radius * Math.sin(phi) });
  }
  return { id: "esfera", op: "revolve", profile: { outer }, frame: frameAt(center), segments: CAD_PRIMITIVE_SEGMENTS };
}

/** Toro: la sección del tubo, desplazada al radio del toro, revolucionada. */
function torusNode(center: CadPoint3, radius: number, tube: number): CadSolidNode {
  return {
    id: "toro",
    op: "revolve",
    profile: circleAt({ x: radius, y: 0 }, tube),
    frame: frameAt(center),
    segments: CAD_PRIMITIVE_SEGMENTS,
  };
}

type RoundKind = "CYLINDER" | "CONE" | "SPHERE" | "TORUS";

function roundStep(kind: RoundKind, state: RoundState, context: CadCommandContext): CadCommandStep<RoundState> {
  if (!state.center) return ask(state, kind === "TORUS" || kind === "SPHERE" ? "Precise el centro" : "Precise el centro de la base", [], CAD_ACCEPT_POINT);
  if (state.radius === null) {
    const cursor = context.cursor;
    return {
      ...radiusPrompt(state, kind === "TORUS" ? "del toro" : kind === "SPHERE" ? "de la esfera" : "de la base"),
      preview: cursor ? [{ points: [state.center, cursor] }] : [],
    };
  }
  if (kind === "SPHERE") return solidMessage(state, "inalcanzable");
  if (kind === "TORUS") return radiusPrompt(state, "del tubo");
  if (kind === "CONE" && state.askingSecond) return radiusPrompt(state, "superior");
  return heightPrompt(state, kind === "CONE" ? [TOP_RADIUS] : []);
}

function roundDescriptor(kind: RoundKind, aliases: readonly string[]): CadCommandDescriptor<RoundState> {
  return {
    name: kind,
    aliases,
    kind: "draw",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: true,
    spatial: "elevation",
    cursor: "crosshair",
    begin: (context) => roundStep(kind, EMPTY_ROUND, context),
    step: (state, input, context) => {
      if (input.kind === "cancel") return solidCancelled(state);
      if (!state.center) {
        if (input.kind === "point") return roundStep(kind, { ...state, center: input.point }, context);
        if (input.kind === "enter") return solidMessage(state, `${kind} necesita un centro.`);
        return roundStep(kind, state, context);
      }
      const center = cadLiftPoint(state.center);
      if (state.radius === null || (kind === "TORUS" && state.second === null) || (kind === "CONE" && state.askingSecond)) {
        if (input.kind === "keyword" && input.keyword === DIAMETER.keyword) return roundStep(kind, { ...state, diameter: true }, context);
        if (input.kind === "enter" && kind === "CONE" && state.askingSecond)
          return roundStep(kind, { ...state, askingSecond: false, second: state.second ?? 0 }, context);
        const value = readRadius(input, state.center, state.diameter);
        if (value === null) return roundStep(kind, state, context);
        if (state.radius === null) {
          if (!(value > 1e-9)) return solidMessage(state, `${kind} ${NO_RADIUS}`);
          const next = { ...state, radius: value, diameter: false };
          if (kind === "SPHERE") return done(next, sphereNode(center, value), kind, context);
          return roundStep(kind, next, context);
        }
        if (kind === "TORUS") {
          if (!(value > 1e-9)) return solidMessage(state, `${kind} necesita un radio del tubo mayor que cero.`);
          if (value >= state.radius)
            return solidMessage(
              state,
              `El radio del tubo (${value}) debe ser menor que el radio del toro (${state.radius}): si no, el sólido se atravesaría a sí mismo. El toro que se corta a sí mismo todavía no está disponible.`,
            );
          return done(state, torusNode(center, state.radius, value), kind, context);
        }
        // CONE · radio superior: cero es la punta; mayor que el de la base, un cono invertido válido.
        return roundStep(kind, { ...state, second: value, askingSecond: false, diameter: false }, context);
      }
      if (kind === "CONE" && input.kind === "keyword" && input.keyword === TOP_RADIUS.keyword)
        return roundStep(kind, { ...state, askingSecond: true }, context);
      const read = readHeight(state, input, state.center);
      if (!read) return roundStep(kind, state, context);
      if ("state" in read) return roundStep(kind, read.state, context);
      if (!(Math.abs(read.height) > 1e-9)) return solidMessage(state, `${kind} ${NO_HEIGHT}`);
      if (kind === "CONE") return done(state, coneNode(center, state.radius, state.second ?? 0, read.height), kind, context);
      return done(state, cylinderNode(center, state.radius, read.height), kind, context);
    },
  };
}

// ---------------------------------------------------------------------------
// PYRAMID: centro, radio (inscrito o circunscrito), altura o radio superior
// ---------------------------------------------------------------------------

interface PyramidState extends RadiusAsk, HeightAsk {
  center: CadPoint2 | null;
  sides: number;
  /** Inscrito: los vértices sobre la circunferencia; circunscrito: los lados tangentes. */
  inscribed: boolean;
  radius: number | null;
  topRadius: number | null;
  pending: "none" | "sides" | "top";
}

const EMPTY_PYRAMID: PyramidState = { center: null, sides: 4, inscribed: false, radius: null, topRadius: null, pending: "none", diameter: false, twoPoints: null };

/** Radio hasta los VÉRTICES: el que se teclea si es inscrito; el apotema entre cos(π/n) si es circunscrito. */
function vertexRadius(radius: number, sides: number, inscribed: boolean): number {
  return inscribed ? radius : radius / Math.cos(Math.PI / sides);
}

function ring(center: CadPoint3, radius: number, sides: number, z: number): CadPoint3[] {
  const points: CadPoint3[] = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = (2 * Math.PI * index) / sides;
    points.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle), z });
  }
  return points;
}

/**
 * Pirámide o tronco: geometría explícita. La base, vista desde arriba, va en
 * sentido antihorario; la cara de abajo lleva el anillo INVERTIDO (normal −Z)
 * y los laterales `[b_i, b_j, t_j, t_i]`, el mismo cosido que `makeBox`. Con
 * altura negativa el sólido es la imagen especular y se invierten TODAS las
 * caras, en vez de razonar sobre cada una.
 */
function pyramidNode(center: CadPoint3, radius: number, topRadius: number, sides: number, height: number): CadSolidNode {
  const base = ring(center, radius, sides, center.z);
  const points: CadPoint3[] = [...base];
  const faces: { outer: number[] }[] = [{ outer: base.map((_, index) => index).reverse() }];
  if (topRadius > 1e-9) {
    const top = ring(center, topRadius, sides, center.z + height);
    points.push(...top);
    faces.push({ outer: top.map((_, index) => sides + index) });
    for (let i = 0; i < sides; i += 1) {
      const j = (i + 1) % sides;
      faces.push({ outer: [i, j, sides + j, sides + i] });
    }
  } else {
    points.push({ x: center.x, y: center.y, z: center.z + height });
    for (let i = 0; i < sides; i += 1) faces.push({ outer: [i, (i + 1) % sides, sides] });
  }
  return {
    id: "piramide",
    op: "brep",
    points,
    faces: height < 0 ? faces.map((face) => ({ outer: [...face.outer].reverse() })) : faces,
  };
}

function pyramidStep(state: PyramidState, context: CadCommandContext): CadCommandStep<PyramidState> {
  if (state.pending === "sides") return ask(state, "Precise el número de lados", [], CAD_ACCEPT_DISTANCE, { defaultValue: String(state.sides) });
  if (!state.center)
    return ask(state, `${state.sides} lados ${state.inscribed ? "Inscrito" : "Circunscrito"}. Precise el centro de la base`, [SIDES], CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD);
  if (state.radius === null) {
    const cursor = context.cursor;
    return {
      ...radiusPrompt(state, "de la base", [state.inscribed ? CIRCUMSCRIBED : INSCRIBED]),
      preview: cursor ? [{ points: [state.center, cursor] }] : [],
    };
  }
  if (state.pending === "top") return radiusPrompt(state, "superior");
  return heightPrompt(state, [TOP_RADIUS]);
}

const pyramidCommand: CadCommandDescriptor<PyramidState> = {
  name: "PYRAMID",
  aliases: ["PYR"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  spatial: "elevation",
  cursor: "crosshair",
  begin: (context) => pyramidStep(EMPTY_PYRAMID, context),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (state.pending === "sides") {
      if (input.kind === "enter") return pyramidStep({ ...state, pending: "none" }, context);
      if (input.kind !== "distance") return pyramidStep(state, context);
      const sides = Math.round(input.value);
      if (sides < 3 || sides > 32) return solidMessage(state, "PYRAMID necesita entre 3 y 32 lados.");
      return pyramidStep({ ...state, sides, pending: "none" }, context);
    }
    if (!state.center) {
      if (input.kind === "keyword" && input.keyword === SIDES.keyword) return pyramidStep({ ...state, pending: "sides" }, context);
      if (input.kind === "point") return pyramidStep({ ...state, center: input.point }, context);
      if (input.kind === "enter") return solidMessage(state, "PYRAMID necesita un centro.");
      return pyramidStep(state, context);
    }
    const center = cadLiftPoint(state.center);
    if (state.radius === null || state.pending === "top") {
      if (input.kind === "keyword" && input.keyword === DIAMETER.keyword) return pyramidStep({ ...state, diameter: true }, context);
      if (input.kind === "keyword" && (input.keyword === INSCRIBED.keyword || input.keyword === CIRCUMSCRIBED.keyword))
        return pyramidStep({ ...state, inscribed: input.keyword === INSCRIBED.keyword }, context);
      if (input.kind === "enter" && state.pending === "top") return pyramidStep({ ...state, pending: "none", topRadius: 0 }, context);
      const value = readRadius(input, state.center, state.diameter);
      if (value === null) return pyramidStep(state, context);
      if (state.pending === "top") return pyramidStep({ ...state, topRadius: value, pending: "none", diameter: false }, context);
      if (!(value > 1e-9)) return solidMessage(state, `PYRAMID ${NO_RADIUS}`);
      return pyramidStep({ ...state, radius: value, diameter: false }, context);
    }
    if (input.kind === "keyword" && input.keyword === TOP_RADIUS.keyword) return pyramidStep({ ...state, pending: "top" }, context);
    const read = readHeight(state, input, state.center);
    if (!read) return pyramidStep(state, context);
    if ("state" in read) return pyramidStep(read.state, context);
    if (!(Math.abs(read.height) > 1e-9)) return solidMessage(state, `PYRAMID ${NO_HEIGHT}`);
    const base = vertexRadius(state.radius, state.sides, state.inscribed);
    const top = vertexRadius(state.topRadius ?? 0, state.sides, state.inscribed);
    return done(state, pyramidNode(center, base, top, state.sides, read.height), "PYRAMID", context);
  },
};

// ---------------------------------------------------------------------------
// POLYSOLID: el muro dibujado al vuelo (o desde una línea/polilínea)
// ---------------------------------------------------------------------------

type Justification = "left" | "center" | "right";

interface PolysolidState {
  points: CadPoint2[];
  height: number;
  width: number;
  justify: Justification;
  pending: "none" | "height" | "width" | "justify" | "object";
}

/** Valores por defecto de AutoCAD (PSOLHEIGHT / PSOLWIDTH), si el anfitrión no los fija. */
const DEFAULT_POLYSOLID = { height: 80, width: 5 } as const;

function polysolidStart(context: CadCommandContext): PolysolidState {
  const read = (name: string, fallback: number) => {
    const value = Number(context.variables?.get(name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    points: [],
    height: read("PSOLHEIGHT", DEFAULT_POLYSOLID.height),
    width: read("PSOLWIDTH", DEFAULT_POLYSOLID.width),
    justify: "center",
    pending: "none",
  };
}

/**
 * Desplaza un recorrido de tramos rectos una distancia `offset` hacia su
 * izquierda (positiva) con juntas a inglete. En un cambio de sentido brusco
 * (los dos tramos casi opuestos) el inglete se dispara; se rechaza antes.
 */
function offsetPath(points: readonly CadPoint2[], offset: number, closed: boolean): CadPoint2[] | null {
  const count = points.length;
  const normal = (a: CadPoint2, b: CadPoint2) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  };
  const result: CadPoint2[] = [];
  for (let index = 0; index < count; index += 1) {
    const prev = closed || index > 0 ? points[(index - 1 + count) % count] : null;
    const next = closed || index < count - 1 ? points[(index + 1) % count] : null;
    const nPrev = prev ? normal(prev, points[index]) : null;
    const nNext = next ? normal(points[index], next) : null;
    let direction: CadPoint2;
    if (nPrev && nNext) {
      const dot = nPrev.x * nNext.x + nPrev.y * nNext.y;
      if (dot < -0.9) return null;
      direction = { x: (nPrev.x + nNext.x) / (1 + dot), y: (nPrev.y + nNext.y) / (1 + dot) };
    } else direction = (nPrev ?? nNext)!;
    result.push({ x: points[index].x + direction.x * offset, y: points[index].y + direction.y * offset });
  }
  return result;
}

/** La huella del muro: el recorrido engrosado según su justificación. */
export function polysolidFootprint(
  points: readonly CadPoint2[],
  width: number,
  justify: Justification,
  closed: boolean,
): CadSolidProfile | null {
  const cleaned = points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 1e-9);
  if (cleaned.length < 2) return null;
  const left = justify === "center" ? width / 2 : justify === "left" ? 0 : width;
  const right = left - width;
  const a = offsetPath(cleaned, left, closed);
  const b = offsetPath(cleaned, right, closed);
  if (!a || !b) return null;
  if (closed) {
    // Cuál de los dos anillos es el contorno depende del sentido del recorrido:
    // en uno antihorario la izquierda queda DENTRO. Decide el área, no el lado.
    const area = (ring: readonly CadPoint2[]) =>
      Math.abs(ring.reduce((sum, p, i) => sum + p.x * ring[(i + 1) % ring.length].y - ring[(i + 1) % ring.length].x * p.y, 0)) / 2;
    const [outer, inner] = area(a) >= area(b) ? [a, b] : [b, a];
    return { outer, inners: [[...inner].reverse()] };
  }
  return { outer: [...a, ...[...b].reverse()] };
}

function polysolidNode(state: PolysolidState, closed: boolean): CadSolidNode | null {
  const profile = polysolidFootprint(state.points, state.width, state.justify, closed);
  if (!profile) return null;
  const z = cadPointZ(state.points[0]) ?? 0;
  return { id: "muro", op: "extrude", profile, frame: { origin: { x: 0, y: 0, z }, zAxis: { x: 0, y: 0, z: 1 }, xAxis: { x: 1, y: 0, z: 0 } }, height: state.height };
}

function polysolidStep(state: PolysolidState, context: CadCommandContext): CadCommandStep<PolysolidState> {
  if (state.pending === "height") return ask(state, "Precise la altura", [], CAD_ACCEPT_DISTANCE, { defaultValue: String(state.height) });
  if (state.pending === "width") return ask(state, "Precise el ancho", [], CAD_ACCEPT_DISTANCE, { defaultValue: String(state.width) });
  if (state.pending === "justify")
    return ask(state, "Precise la justificación", [LEFT, MIDDLE, RIGHT], CAD_ACCEPT_KEYWORD, { defaultValue: MIDDLE.keyword });
  if (state.pending === "object") return ask(state, "Designe la línea o la polilínea de tramos rectos", [], CAD_ACCEPT_ENTITY_PICK);
  if (state.points.length === 0)
    return ask(
      state,
      `Altura = ${state.height}, ancho = ${state.width}, justificación = ${state.justify === "center" ? "Centro" : state.justify === "left" ? "Izquierda" : "Derecha"}. Precise el punto inicial`,
      [OBJECT, HEIGHT, WIDTH, JUSTIFY],
      CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    );
  const outline = context.cursor ? [...state.points, context.cursor] : state.points;
  return ask(
    state,
    "Precise el punto siguiente",
    state.points.length >= 2 ? [CLOSE, UNDO] : [UNDO],
    CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    { preview: [{ points: outline }] },
  );
}

function polysolidFinish(state: PolysolidState, closed: boolean, context: CadCommandContext, before?: CadEntityCommand[]): CadCommandStep<PolysolidState> {
  if (state.points.length < 2) return solidCancelled(state);
  if (closed && state.points.length < 3) return solidMessage(state, "POLYSOLID necesita al menos tres puntos para cerrar.");
  const node = polysolidNode(state, closed);
  if (!node)
    return solidMessage(state, "POLYSOLID no puede engrosar este recorrido: dos tramos consecutivos se pliegan sobre sí mismos y el inglete se dispara.");
  return done(state, node, "POLYSOLID", context, before);
}

const polysolidCommand: CadCommandDescriptor<PolysolidState> = {
  name: "POLYSOLID",
  aliases: ["PSOLID"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  spatial: "elevation",
  cursor: "crosshair",
  begin: (context) => polysolidStep(polysolidStart(context), context),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (state.pending === "height" || state.pending === "width") {
      if (input.kind === "enter") return polysolidStep({ ...state, pending: "none" }, context);
      if (input.kind !== "distance") return polysolidStep(state, context);
      if (!(input.value > 1e-9)) return solidMessage(state, `POLYSOLID necesita ${state.pending === "height" ? "una altura" : "un ancho"} mayor que cero.`);
      return polysolidStep({ ...state, [state.pending]: input.value, pending: "none" }, context);
    }
    if (state.pending === "justify") {
      if (input.kind === "keyword")
        return polysolidStep(
          { ...state, justify: input.keyword === LEFT.keyword ? "left" : input.keyword === RIGHT.keyword ? "right" : "center", pending: "none" },
          context,
        );
      return polysolidStep({ ...state, pending: "none" }, context);
    }
    if (state.pending === "object") {
      if (input.kind !== "entityPick") return input.kind === "enter" ? polysolidStep({ ...state, pending: "none" }, context) : polysolidStep(state, context);
      const entity = context.entity?.(input.entityId);
      if (!entity) return solidMessage(state, "POLYSOLID no encuentra la entidad designada.");
      if (entity.type === "line")
        return polysolidFinish({ ...state, points: [entity.start, entity.end], pending: "none" }, false, context, [{ type: "delete", entityId: entity.id }]);
      if (entity.type === "polyline") {
        if (entity.vertices.some((vertex) => typeof vertex.bulge === "number" && vertex.bulge !== 0))
          return solidMessage(state, "POLYSOLID todavía no engrosa tramos curvos: la polilínea designada tiene arcos.");
        return polysolidFinish({ ...state, points: entity.vertices, pending: "none" }, entity.closed === true, context, [{ type: "delete", entityId: entity.id }]);
      }
      return solidMessage(state, `POLYSOLID sólo engrosa líneas y polilíneas; lo designado es ${entity.type}.`);
    }
    if (input.kind === "keyword") {
      if (input.keyword === OBJECT.keyword) return polysolidStep({ ...state, pending: "object" }, context);
      if (input.keyword === HEIGHT.keyword) return polysolidStep({ ...state, pending: "height" }, context);
      if (input.keyword === WIDTH.keyword) return polysolidStep({ ...state, pending: "width" }, context);
      if (input.keyword === JUSTIFY.keyword) return polysolidStep({ ...state, pending: "justify" }, context);
      if (input.keyword === CLOSE.keyword) return polysolidFinish(state, true, context);
      if (input.keyword === UNDO.keyword) return polysolidStep({ ...state, points: state.points.slice(0, -1) }, context);
      return polysolidStep(state, context);
    }
    if (input.kind === "enter") return state.points.length === 0 ? polysolidStep({ ...state, pending: "object" }, context) : polysolidFinish(state, false, context);
    if (input.kind !== "point") return polysolidStep(state, context);
    const last = state.points[state.points.length - 1];
    if (last && Math.hypot(input.point.x - last.x, input.point.y - last.y) < 1e-9) return polysolidStep(state, context);
    return polysolidStep({ ...state, points: [...state.points, input.point] }, context);
  },
};

export const CAD_SOLID_PRIMITIVE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(cornerDescriptor("BOX", [], boxNode)),
  asCadCommand(cornerDescriptor("WEDGE", ["WE"], wedgeNode)),
  asCadCommand(roundDescriptor("CYLINDER", ["CYL"])),
  asCadCommand(roundDescriptor("CONE", [])),
  asCadCommand(roundDescriptor("SPHERE", [])),
  asCadCommand(roundDescriptor("TORUS", ["TOR"])),
  asCadCommand(pyramidCommand),
  asCadCommand(polysolidCommand),
];

export const __testables = { boxBounds, wedgeNode, coneNode, sphereNode, torusNode, pyramidNode, vertexRadius, offsetPath };
