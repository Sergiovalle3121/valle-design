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
 * ## Los modos, y lo que sigue fuera
 *
 * CYLINDER y CONE toman la base por centro + radio/diámetro, por 2Puntos (los
 * dos extremos del diámetro), por 3Puntos (la circunferencia que pasa por
 * tres) o Elíptico (dos ejes). PYRAMID toma la base por su centro o por una
 * Arista —los dos extremos de un lado—, y POLYSOLID admite tramos de Arco. La
 * aritmética de los cinco modos vive en `solids-primitive-modes.ts`, con su
 * corrección de faceta medida y escrita; aquí sólo se pregunta.
 *
 * Lo que estas órdenes siguen sin hacer, dicho aquí:
 *
 *   - CYLINDER y CONE: **Ttr** (tangente-tangente-radio). No es aritmética de
 *     puntos designados: pide resolver tangencias contra DOS entidades del
 *     dibujo, y el diálogo de estas órdenes no designa objetos. El prompt no lo
 *     anuncia.
 *   - POLYSOLID Arco: el arco sale TANGENTE al tramo anterior, que es el modo
 *     por defecto de PLINE. Sus submodos (Dirección, Radio, Ángulo, Segundo
 *     punto) no se ofrecen, y el PRIMER tramo no puede ser un arco porque no
 *     hay dirección de entrada a la que ser tangente: la opción no aparece
 *     hasta que la hay.
 *   - TORUS: el radio del tubo tiene que ser MENOR que el del toro. El toro
 *     que se corta a sí mismo («manzana», «limón») cruza el eje y el kernel
 *     lo rechaza; se dice antes de intentarlo.
 *
 * ## `spatial: "elevation"`
 *
 * Las ocho toman la cota del primer punto designado, así que dibujan sobre
 * la planta elevada (+3000) a +3000. Su forma vive en el plano horizontal —
 * la base de la caja es paralela al suelo— y sobre un SCU INCLINADO el motor
 * las rechaza con su motivo. Alinear la primitiva con el SCU inclinado pide
 * un marco en cada nodo (`box` no lo tiene); es el siguiente peldaño.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadSolidNode } from "../../cad-entities-v5";
import type { CadEntityCommand } from "../../entity-commands";
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
import {
  cadBasePicks,
  cadBasePrompt,
  cadEdgeBase,
  cadResolveBase,
  pathEndTangent,
  polysolidFootprint,
  tangentBulge,
  tessellatePath,
  type CadBaseMode,
  type CadPathVertex,
} from "./solids-primitive-modes";
import {
  CAD_PRIMITIVE_SEGMENTS,
  boxBounds,
  boxNode,
  coneEllipticNode,
  coneNode,
  cylinderEllipticNode,
  cylinderNode,
  pyramidNode,
  sphereNode,
  torusNode,
  wedgeNode,
  type CadCornerBase,
} from "./solids-primitive-shapes";
import { finishedSolid, makeSolidEntity, solidCancelled, solidMessage } from "./solids-support";

// `CAD_PRIMITIVE_SEGMENTS` vive con las recetas y se reexporta desde aquí:
// quien mide una primitiva llega por su comando, no por su geometría.
export { CAD_PRIMITIVE_SEGMENTS } from "./solids-primitive-shapes";

const DIAMETER = { keyword: "Diámetro", shortcut: "D" } as const;
const TWO_POINTS = { keyword: "2Puntos", shortcut: "2P" } as const;
const THREE_POINTS = { keyword: "3Puntos", shortcut: "3P" } as const;
const ELLIPTIC = { keyword: "Elíptico", shortcut: "E" } as const;
const EDGE = { keyword: "Arista", shortcut: "A" } as const;
const ARC = { keyword: "Arco", shortcut: "A" } as const;
const LINE = { keyword: "Línea", shortcut: "L" } as const;
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

/** El estado del diálogo de BOX/WEDGE ES la caja (`CadCornerBase`) más lo que falta por preguntar. */
interface CornerState extends HeightAsk, CadCornerBase {
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
  /** Cómo se designa la base (CYLINDER y CONE). */
  mode: CadBaseMode;
  /** Puntos ya designados del modo, mientras la base no está resuelta. */
  picks: CadPoint2[];
  /** Semiejes de la base elíptica ya resuelta; `null` si la base es circular. */
  ellipse: { a: number; b: number; angle: number } | null;
}

const EMPTY_ROUND: RoundState = {
  center: null,
  radius: null,
  second: null,
  askingSecond: false,
  diameter: false,
  twoPoints: null,
  mode: "centro",
  picks: [],
  ellipse: null,
};

type RoundKind = "CYLINDER" | "CONE" | "SPHERE" | "TORUS";

/** Los modos de base son de CYLINDER y CONE; la esfera y el toro no tienen base. */
const BASE_MODES: readonly Option[] = [THREE_POINTS, TWO_POINTS, ELLIPTIC];

function roundStep(kind: RoundKind, state: RoundState, context: CadCommandContext): CadCommandStep<RoundState> {
  if (!state.center) {
    if (state.mode !== "centro") return ask(state, cadBasePrompt(state.mode, state.picks.length), [], CAD_ACCEPT_POINT);
    if (kind === "TORUS" || kind === "SPHERE") return ask(state, "Precise el centro", [], CAD_ACCEPT_POINT);
    return ask(state, "Precise el centro de la base", BASE_MODES, CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD);
  }
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
        if (input.kind === "keyword") {
          const mode: CadBaseMode | null =
            input.keyword === THREE_POINTS.keyword
              ? "3p"
              : input.keyword === TWO_POINTS.keyword
                ? "2p"
                : input.keyword === ELLIPTIC.keyword
                  ? "eliptico"
                  : null;
          return roundStep(kind, mode ? { ...state, mode, picks: [] } : state, context);
        }
        if (input.kind === "enter")
          return solidMessage(state, state.mode === "centro" ? `${kind} necesita un centro.` : `${kind} necesita los puntos que definen la base.`);
        if (input.kind !== "point") return roundStep(kind, state, context);
        if (state.mode === "centro") return roundStep(kind, { ...state, center: input.point }, context);
        const picks = [...state.picks, input.point];
        if (picks.length < cadBasePicks(state.mode)) return roundStep(kind, { ...state, picks }, context);
        const base = cadResolveBase(state.mode, picks);
        if (base.kind === "error") return solidMessage(state, `${kind}: ${base.text}`);
        // Resuelta la base, el radio se da por preguntado y la cota sale del
        // PRIMER punto designado, que es el que fija el plano de la pieza.
        const resolved = cadLiftPoint(base.center, picks[0]);
        if (base.kind === "circulo") return roundStep(kind, { ...state, center: resolved, radius: base.radius }, context);
        return roundStep(kind, { ...state, center: resolved, radius: base.a, ellipse: { a: base.a, b: base.b, angle: base.angle } }, context);
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
      if (kind === "CONE")
        return done(
          state,
          state.ellipse
            ? coneEllipticNode(center, state.ellipse, state.second ?? 0, read.height)
            : coneNode(center, state.radius, state.second ?? 0, read.height),
          kind,
          context,
        );
      return done(state, state.ellipse ? cylinderEllipticNode(center, state.ellipse, read.height) : cylinderNode(center, state.radius, read.height), kind, context);
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
  pending: "none" | "sides" | "top" | "edge";
  /** Modo Arista: primer extremo ya designado. */
  edge: CadPoint2 | null;
  /** Giro de la base, que el modo Arista fija para que el lado caiga donde se pidió. */
  rotation: number;
}

const EMPTY_PYRAMID: PyramidState = {
  center: null,
  sides: 4,
  inscribed: false,
  radius: null,
  topRadius: null,
  pending: "none",
  diameter: false,
  twoPoints: null,
  edge: null,
  rotation: 0,
};

/** Radio hasta los VÉRTICES: el que se teclea si es inscrito; el apotema entre cos(π/n) si es circunscrito. */
function vertexRadius(radius: number, sides: number, inscribed: boolean): number {
  return inscribed ? radius : radius / Math.cos(Math.PI / sides);
}

function pyramidStep(state: PyramidState, context: CadCommandContext): CadCommandStep<PyramidState> {
  if (state.pending === "sides") return ask(state, "Precise el número de lados", [], CAD_ACCEPT_DISTANCE, { defaultValue: String(state.sides) });
  if (state.pending === "edge")
    return ask(state, state.edge ? "Precise el segundo extremo de la arista de la base" : "Precise el primer extremo de la arista de la base", [], CAD_ACCEPT_POINT);
  if (!state.center)
    return ask(state, `${state.sides} lados ${state.inscribed ? "Inscrito" : "Circunscrito"}. Precise el centro de la base`, [SIDES, EDGE], CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD);
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
    if (state.pending === "edge") {
      if (input.kind === "enter") return pyramidStep({ ...state, pending: "none", edge: null }, context);
      if (input.kind !== "point") return pyramidStep(state, context);
      if (!state.edge) return pyramidStep({ ...state, edge: input.point }, context);
      const base = cadEdgeBase(state.edge, input.point, state.sides);
      if (!base) return solidMessage(state, "PYRAMID: los dos extremos de la arista coinciden y el lado no mide nada.");
      // El radio a los VÉRTICES entra tal cual por `vertexRadius`, que es la
      // conversión que ya existía: la arista es un radio inscrito, no otro modo.
      return pyramidStep(
        { ...state, center: cadLiftPoint(base.center, state.edge), radius: base.radius, inscribed: true, rotation: base.rotation, pending: "none", edge: null },
        context,
      );
    }
    if (!state.center) {
      if (input.kind === "keyword" && input.keyword === SIDES.keyword) return pyramidStep({ ...state, pending: "sides" }, context);
      if (input.kind === "keyword" && input.keyword === EDGE.keyword) return pyramidStep({ ...state, pending: "edge" }, context);
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
    return done(state, pyramidNode(center, base, top, state.sides, read.height, state.rotation), "PYRAMID", context);
  },
};

// ---------------------------------------------------------------------------
// POLYSOLID: el muro dibujado al vuelo (o desde una línea/polilínea)
// ---------------------------------------------------------------------------

type Justification = "left" | "center" | "right";

interface PolysolidState {
  /**
   * El recorrido es una POLILÍNEA, no una lista de puntos: cada vértice lleva
   * el `bulge` del tramo que arranca en él. Guardar el arco así —y no ya
   * teselado— es lo que deja que desHacer quite el arco entero, que Objeto
   * acepte los vértices de la polilínea designada tal cual, y que la teselación
   * ocurra UNA vez, al montar la huella.
   */
  points: CadPathVertex[];
  height: number;
  width: number;
  justify: Justification;
  pending: "none" | "height" | "width" | "justify" | "object";
  /** El tramo siguiente es un arco tangente al anterior. */
  arc: boolean;
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
    arc: false,
  };
}

/** El recorrido con sus arcos ya vueltos segmentos, listo para engrosar. */
function polysolidPath(state: PolysolidState, closed: boolean): CadPoint2[] {
  return tessellatePath(state.points, closed, CAD_PRIMITIVE_SEGMENTS);
}

function polysolidNode(state: PolysolidState, closed: boolean): CadSolidNode | null {
  const profile = polysolidFootprint(polysolidPath(state, closed), state.width, state.justify, closed);
  if (!profile) return null;
  const z = cadPointZ(state.points[0]) ?? 0;
  return { id: "muro", op: "extrude", profile, frame: { origin: { x: 0, y: 0, z }, zAxis: { x: 0, y: 0, z: 1 }, xAxis: { x: 1, y: 0, z: 0 } }, height: state.height };
}

function polysolidStep(state: PolysolidState, context: CadCommandContext): CadCommandStep<PolysolidState> {
  if (state.pending === "height") return ask(state, "Precise la altura", [], CAD_ACCEPT_DISTANCE, { defaultValue: String(state.height) });
  if (state.pending === "width") return ask(state, "Precise el ancho", [], CAD_ACCEPT_DISTANCE, { defaultValue: String(state.width) });
  if (state.pending === "justify")
    return ask(state, "Precise la justificación", [LEFT, MIDDLE, RIGHT], CAD_ACCEPT_KEYWORD, { defaultValue: MIDDLE.keyword });
  if (state.pending === "object") return ask(state, "Designe la línea o la polilínea", [], CAD_ACCEPT_ENTITY_PICK);
  if (state.points.length === 0)
    return ask(
      state,
      `Altura = ${state.height}, ancho = ${state.width}, justificación = ${state.justify === "center" ? "Centro" : state.justify === "left" ? "Izquierda" : "Derecha"}. Precise el punto inicial`,
      [OBJECT, HEIGHT, WIDTH, JUSTIFY],
      CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    );
  // La previa muestra el recorrido TESELADO: si el último tramo fue un arco, lo
  // que se ve arrastrando el ratón es el arco, no su cuerda.
  const drawn = polysolidPath(state, false);
  const outline = context.cursor ? [...drawn, context.cursor] : drawn;
  // Arco sólo cuando hay un tramo del que salir tangente; Línea sólo dentro del
  // modo arco. Ofrecer una palabra que no se puede contestar es fabricar una
  // opción que no hace nada.
  const options: Option[] = state.arc ? [LINE] : state.points.length >= 2 ? [ARC] : [];
  return ask(
    state,
    state.arc ? "Precise el punto final del arco" : "Precise el punto siguiente",
    state.points.length >= 2 ? [...options, CLOSE, UNDO] : [...options, UNDO],
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
      if (entity.type === "polyline")
        // Los arcos de la polilínea viajan en el `bulge` de sus vértices y se
        // teselan al montar la huella, igual que los que se trazan al vuelo.
        return polysolidFinish({ ...state, points: entity.vertices, pending: "none" }, entity.closed === true, context, [{ type: "delete", entityId: entity.id }]);
      return solidMessage(state, `POLYSOLID sólo engrosa líneas y polilíneas; lo designado es ${entity.type}.`);
    }
    if (input.kind === "keyword") {
      if (input.keyword === OBJECT.keyword) return polysolidStep({ ...state, pending: "object" }, context);
      if (input.keyword === HEIGHT.keyword) return polysolidStep({ ...state, pending: "height" }, context);
      if (input.keyword === WIDTH.keyword) return polysolidStep({ ...state, pending: "width" }, context);
      if (input.keyword === JUSTIFY.keyword) return polysolidStep({ ...state, pending: "justify" }, context);
      if (input.keyword === ARC.keyword && state.points.length >= 2) return polysolidStep({ ...state, arc: true }, context);
      if (input.keyword === LINE.keyword) return polysolidStep({ ...state, arc: false }, context);
      if (input.keyword === CLOSE.keyword) return polysolidFinish(state, true, context);
      // desHacer quita el último vértice Y el arco que llegaba a él: el `bulge`
      // vive en el vértice anterior, y dejarlo puesto curvaría el tramo
      // siguiente, que es lo contrario de deshacer.
      if (input.keyword === UNDO.keyword) {
        const kept = state.points.slice(0, -1);
        const tail = kept[kept.length - 1];
        if (tail) kept[kept.length - 1] = { ...tail, bulge: 0 };
        return polysolidStep({ ...state, points: kept }, context);
      }
      return polysolidStep(state, context);
    }
    if (input.kind === "enter") return state.points.length === 0 ? polysolidStep({ ...state, pending: "object" }, context) : polysolidFinish(state, false, context);
    if (input.kind !== "point") return polysolidStep(state, context);
    const last = state.points[state.points.length - 1];
    if (last && Math.hypot(input.point.x - last.x, input.point.y - last.y) < 1e-9) return polysolidStep(state, context);
    if (!state.arc || !last) return polysolidStep({ ...state, points: [...state.points, input.point] }, context);
    const tangent = pathEndTangent(state.points);
    const bulge = tangent ? tangentBulge(last, input.point, tangent) : null;
    if (bulge === null)
      return solidMessage(state, "POLYSOLID no puede trazar ese arco: el punto final queda justo detrás del tramo anterior y el arco daría una vuelta entera sobre sí mismo.");
    return polysolidStep({ ...state, points: [...state.points.slice(0, -1), { ...last, bulge }, input.point] }, context);
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

export const __testables = { boxBounds, wedgeNode, coneNode, sphereNode, torusNode, pyramidNode, vertexRadius };
