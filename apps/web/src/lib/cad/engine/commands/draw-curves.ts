/**
 * ARC, ELLIPSE y POLYGON — la segunda tanda de comandos de dibujo (ola 4).
 *
 * Las tres entidades ya existían en el modelo canónico y ya se renderizaban,
 * se seleccionaban, se acotaban y se exportaban a DXF. Lo que faltaba era el
 * camino para CREARLAS: `A`, `EL` y `POL` no resolvían a nada, y desde la
 * interfaz sólo se llegaba a un arco como resultado de FILLET. Es la forma más
 * cara de no tener una función — tenerla entera menos la puerta.
 *
 * ## Los ángulos, que es donde esto se rompe
 *
 * Un arco DXF es **siempre antihorario** de `startAngle` a `endAngle`, en
 * grados. Toda la aritmética de aquí normaliza a ese contrato antes de emitir,
 * y por eso ARC de tres puntos calcula la orientación del terceto en vez de
 * confiar en el orden de designación: designar los mismos tres puntos en
 * sentido horario debe dar el MISMO arco, no su complementario.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
  type CadPreviewPath,
} from "../command-types";

function flat(point: CadPoint2) {
  return { x: point.x, y: point.y, z: 0 };
}

function distance(a: CadPoint2, b: CadPoint2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function rubberBand(from: CadPoint2, cursor?: CadPoint2): CadPreviewPath[] {
  return cursor ? [{ points: [from, cursor] }] : [];
}

/** Grados en `[0, 360)`. El contrato DXF no admite negativos ni vueltas. */
function normalizeDeg(value: number): number {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function angleDeg(center: CadPoint2, point: CadPoint2): number {
  return normalizeDeg(
    Math.atan2(point.y - center.y, point.x - center.x) * (180 / Math.PI),
  );
}

/** Producto cruzado de `ab × ac`: signo positivo = terceto antihorario. */
function cross(a: CadPoint2, b: CadPoint2, c: CadPoint2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function circleThroughThree(
  a: CadPoint2,
  b: CadPoint2,
  c: CadPoint2,
): { center: CadPoint2; radius: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const center = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
  return { center, radius: distance(center, a) };
}

function arcEntity(
  id: string,
  center: CadPoint2,
  radius: number,
  startAngle: number,
  endAngle: number,
  layer: string,
): CadNativeEntity {
  return {
    id,
    type: "arc",
    center: flat(center),
    radius,
    startAngle: normalizeDeg(startAngle),
    endAngle: normalizeDeg(endAngle),
    layer,
  };
}

// ---------------------------------------------------------------------------
// ARC
// ---------------------------------------------------------------------------

const ARC_CENTER = { keyword: "Centro", shortcut: "C" } as const;
const ARC_ANGLE = { keyword: "Ángulo", shortcut: "A" } as const;
const ARC_RADIUS = { keyword: "Radio", shortcut: "R" } as const;

/**
 * Las tres formas de ARC que cubren el uso real.
 *
 * AutoCAD ofrece once combinaciones; casi todas son permutaciones del mismo
 * terceto de datos. Se implementan las tres que un dibujante teclea de verdad
 * y se dice cuáles faltan, en vez de anunciar once y tener nueve a medias:
 *
 *   - `three-point`  — el modo por defecto: inicio, un punto del arco, final.
 *   - `start-center` — inicio y centro, y luego final, ángulo o cuerda.
 *   - `center-start` — centro primero (`C`), que es como se traza un abanico.
 *
 * Faltan las variantes por dirección tangente y por longitud de cuerda.
 */
type ArcMode = "three-point" | "start-center" | "center-start";

interface ArcState {
  mode: ArcMode;
  points: CadPoint2[];
  /** El tercer dato llegará como ángulo incluido, no como punto. */
  byAngle: boolean;
}

function arcFinish(commands: CadEntityCommand[]): CadCommandStep<ArcState> {
  return {
    state: { mode: "three-point", points: [], byAngle: false },
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      commands.length > 0 ? { kind: "document", commands, label: "ARC" } : { kind: "none" },
  };
}

/**
 * Arco por tres puntos.
 *
 * El punto intermedio decide el sentido: si el terceto gira en horario, el arco
 * antihorario equivalente va del FINAL al INICIO. Sin esta corrección, designar
 * los tres puntos en el sentido natural del reloj dibuja el arco complementario
 * —el trozo que no se ha señalado—, que es el fallo clásico de esta orden.
 */
function arcFromThreePoints(
  start: CadPoint2,
  through: CadPoint2,
  end: CadPoint2,
  context: CadCommandContext,
): CadEntityCommand[] {
  const circle = circleThroughThree(start, through, end);
  if (!circle) return [];
  const counterClockwise = cross(start, through, end) > 0;
  const from = angleDeg(circle.center, counterClockwise ? start : end);
  const to = angleDeg(circle.center, counterClockwise ? end : start);
  return [
    {
      type: "insert",
      entity: arcEntity(
        context.newEntityId(),
        circle.center,
        circle.radius,
        from,
        to,
        context.activeLayer,
      ),
    },
  ];
}

function arcFromCenter(
  center: CadPoint2,
  start: CadPoint2,
  endOrAngle: CadPoint2 | number,
  context: CadCommandContext,
): CadEntityCommand[] {
  const radius = distance(center, start);
  if (!(radius > 1e-9)) return [];
  const from = angleDeg(center, start);
  // Un ángulo incluido negativo dibuja en horario, que en el contrato DXF es
  // el mismo arco recorrido al revés: se intercambian los extremos.
  const to =
    typeof endOrAngle === "number"
      ? endOrAngle < 0
        ? from
        : from + endOrAngle
      : angleDeg(center, endOrAngle);
  const realFrom = typeof endOrAngle === "number" && endOrAngle < 0 ? from + endOrAngle : from;
  return [
    {
      type: "insert",
      entity: arcEntity(
        context.newEntityId(),
        center,
        radius,
        realFrom,
        to,
        context.activeLayer,
      ),
    },
  ];
}

function arcStep(state: ArcState, context: CadCommandContext): CadCommandStep<ArcState> {
  const count = state.points.length;
  if (state.mode === "three-point") {
    if (count === 0)
      return {
        state,
        prompt: { message: "Precise el punto inicial del arco", options: [ARC_CENTER] },
        accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
      };
    if (count === 1)
      return {
        state,
        prompt: { message: "Precise el segundo punto del arco", options: [ARC_CENTER] },
        accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
        preview: rubberBand(state.points[0], context.cursor),
      };
    return {
      state,
      prompt: { message: "Precise el punto final del arco", options: [] },
      accepts: CAD_ACCEPT_POINT,
      preview: rubberBand(state.points[1], context.cursor),
    };
  }

  // Las dos variantes con centro piden los mismos dos primeros datos en orden
  // distinto, así que comparten el tercer paso.
  const centerFirst = state.mode === "center-start";
  if (count === 0)
    return {
      state,
      prompt: {
        message: centerFirst ? "Precise el centro del arco" : "Precise el punto inicial del arco",
        options: [],
      },
      accepts: CAD_ACCEPT_POINT,
    };
  if (count === 1)
    return {
      state,
      prompt: {
        message: centerFirst ? "Precise el punto inicial" : "Precise el centro del arco",
        options: [],
      },
      accepts: CAD_ACCEPT_POINT,
      preview: rubberBand(state.points[0], context.cursor),
    };
  return {
    state,
    prompt: {
      message: state.byAngle ? "Precise el ángulo incluido" : "Precise el punto final",
      options: state.byAngle ? [] : [ARC_ANGLE, ARC_RADIUS],
    },
    accepts: state.byAngle
      ? CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE
      : CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
  };
}

/** Centro y punto inicial en el orden canónico, sea cual sea el modo. */
function arcCenterAndStart(state: ArcState): { center: CadPoint2; start: CadPoint2 } {
  return state.mode === "center-start"
    ? { center: state.points[0], start: state.points[1] }
    : { center: state.points[1], start: state.points[0] };
}

const arcCommand: CadCommandDescriptor<ArcState> = {
  name: "ARC",
  aliases: ["A"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => arcStep({ mode: "three-point", points: [], byAngle: false }, context),
  step: (state, input, context) => {
    if (input.kind === "cancel" || input.kind === "enter") return arcFinish([]);

    if (input.kind === "keyword") {
      if (input.keyword === ARC_CENTER.keyword && state.points.length === 0)
        return arcStep({ mode: "center-start", points: [], byAngle: false }, context);
      if (input.keyword === ARC_CENTER.keyword && state.points.length === 1)
        return arcStep({ mode: "start-center", points: state.points, byAngle: false }, context);
      if (input.keyword === ARC_ANGLE.keyword)
        return arcStep({ ...state, byAngle: true }, context);
      return arcStep(state, context);
    }

    if (input.kind === "angle" || input.kind === "distance") {
      if (!state.byAngle || state.points.length < 2) return arcStep(state, context);
      const { center, start } = arcCenterAndStart(state);
      // `<45` llega como ángulo y `45` como distancia; en este paso ambos
      // significan grados incluidos, así que se leen del campo que trae cada uno.
      const degrees = input.kind === "angle" ? input.degrees : input.value;
      return arcFinish(arcFromCenter(center, start, degrees, context));
    }

    if (input.kind !== "point") return arcStep(state, context);
    const points = [...state.points, input.point];
    if (points.length < 3) return arcStep({ ...state, points }, context);
    if (state.mode === "three-point")
      return arcFinish(arcFromThreePoints(points[0], points[1], points[2], context));
    const { center, start } = arcCenterAndStart({ ...state, points });
    return arcFinish(arcFromCenter(center, start, points[2], context));
  },
};

// ---------------------------------------------------------------------------
// ELLIPSE
// ---------------------------------------------------------------------------

const ELLIPSE_CENTER = { keyword: "Centro", shortcut: "C" } as const;

/**
 * La elipse canónica guarda `majorAxis` como VECTOR desde el centro hasta el
 * extremo del eje mayor, y `ratio` como la razón menor/mayor — el mismo par que
 * los grupos 11/21/31 y 40 de DXF. Se emite así directamente en vez de guardar
 * dos semiejes y un ángulo, que obligaría a convertir en cada exportación.
 */
interface EllipseState {
  /** `axis`: primer extremo del eje mayor. `center`: el centro. */
  mode: "axis" | "center";
  points: CadPoint2[];
}

function ellipseFinish(
  center: CadPoint2,
  majorEnd: CadPoint2,
  minorDistance: number,
  context: CadCommandContext,
): CadCommandStep<EllipseState> {
  const given = { x: majorEnd.x - center.x, y: majorEnd.y - center.y };
  const givenLength = Math.hypot(given.x, given.y);
  // Una elipse de eje nulo o de semieje nulo es un segmento, no una elipse. Se
  // rechaza en vez de escribir una entidad degenerada que reventaría el
  // teselado y la exportación.
  if (!(givenLength > 1e-9) || !(minorDistance > 1e-9))
    return {
      state: { mode: "axis", points: [] },
      prompt: { message: "", options: [] },
      accepts: 0,
      result: { kind: "none" },
    };

  // DXF define `ratio` como menor/mayor y **no admite > 1**: el eje mayor es,
  // por definición, el más largo. Si el segundo semieje resulta ser el largo,
  // la elipse correcta no es la recortada — es la misma girada 90°, con el eje
  // mayor sobre la perpendicular. Recortar la razón a 1 dibujaría un círculo
  // donde el usuario pidió una elipse.
  const swap = minorDistance > givenLength;
  const major = swap
    ? {
        x: (-given.y / givenLength) * minorDistance,
        y: (given.x / givenLength) * minorDistance,
      }
    : given;
  const ratio = swap ? givenLength / minorDistance : minorDistance / givenLength;

  return {
    state: { mode: "axis", points: [] },
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: [
        {
          type: "insert",
          entity: {
            id: context.newEntityId(),
            type: "ellipse",
            center: flat(center),
            majorAxis: flat(major),
            ratio,
            startParameter: 0,
            endParameter: Math.PI * 2,
            layer: context.activeLayer,
          },
        },
      ],
      label: "ELLIPSE",
    },
  };
}

function ellipseStep(state: EllipseState, context: CadCommandContext): CadCommandStep<EllipseState> {
  const count = state.points.length;
  if (state.mode === "axis") {
    if (count === 0)
      return {
        state,
        prompt: { message: "Precise el extremo del eje de la elipse", options: [ELLIPSE_CENTER] },
        accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
      };
    if (count === 1)
      return {
        state,
        prompt: { message: "Precise el otro extremo del eje", options: [] },
        accepts: CAD_ACCEPT_POINT,
        preview: rubberBand(state.points[0], context.cursor),
      };
  } else {
    if (count === 0)
      return {
        state,
        prompt: { message: "Precise el centro de la elipse", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    if (count === 1)
      return {
        state,
        prompt: { message: "Precise el extremo del eje", options: [] },
        accepts: CAD_ACCEPT_POINT,
        preview: rubberBand(state.points[0], context.cursor),
      };
  }
  return {
    state,
    prompt: { message: "Precise la longitud del otro semieje", options: [] },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_DISTANCE,
  };
}

/** Centro y extremo del eje mayor, sea cual sea el modo de designación. */
function ellipseAxis(state: EllipseState): { center: CadPoint2; majorEnd: CadPoint2 } {
  if (state.mode === "center") return { center: state.points[0], majorEnd: state.points[1] };
  const [a, b] = state.points;
  return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, majorEnd: b };
}

const ellipseCommand: CadCommandDescriptor<EllipseState> = {
  name: "ELLIPSE",
  aliases: ["EL"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ellipseStep({ mode: "axis", points: [] }, context),
  step: (state, input, context) => {
    if (input.kind === "cancel" || input.kind === "enter")
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: { kind: "none" },
      };

    if (input.kind === "keyword")
      return input.keyword === ELLIPSE_CENTER.keyword && state.points.length === 0
        ? ellipseStep({ mode: "center", points: [] }, context)
        : ellipseStep(state, context);

    if (input.kind === "distance") {
      if (state.points.length < 2) return ellipseStep(state, context);
      const { center, majorEnd } = ellipseAxis(state);
      return ellipseFinish(center, majorEnd, Math.abs(input.value), context);
    }

    if (input.kind !== "point") return ellipseStep(state, context);
    const points = [...state.points, input.point];
    if (points.length < 3) return ellipseStep({ ...state, points }, context);
    const { center, majorEnd } = ellipseAxis({ ...state, points });
    // El tercer punto da el semieje menor por su DISTANCIA al centro, no por su
    // proyección: es lo que hace AutoCAD y lo que permite designarlo a ojo.
    return ellipseFinish(center, majorEnd, distance(center, points[2]), context);
  },
};

// ---------------------------------------------------------------------------
// POLYGON
// ---------------------------------------------------------------------------

const POLYGON_INSCRIBED = { keyword: "Inscrito", shortcut: "I" } as const;
const POLYGON_CIRCUMSCRIBED = { keyword: "Circunscrito", shortcut: "C" } as const;
const POLYGON_EDGE = { keyword: "Lado", shortcut: "L" } as const;

interface PolygonState {
  sides: number | null;
  mode: "inscribed" | "circumscribed" | "edge";
  points: CadPoint2[];
}

/** Mínimo y máximo de AutoCAD. Fuera de ahí no es un polígono útil. */
const POLYGON_MIN_SIDES = 3;
const POLYGON_MAX_SIDES = 1024;

function polygonVertices(
  center: CadPoint2,
  reference: CadPoint2,
  sides: number,
  circumscribed: boolean,
): CadPoint2[] {
  const radius = distance(center, reference);
  // Circunscrito: el radio dado es la APOTEMA, así que el radio del círculo que
  // pasa por los vértices es mayor. Confundirlos dibuja un polígono más pequeño
  // de lo pedido, que es el error silencioso clásico de esta orden.
  const circumradius = circumscribed ? radius / Math.cos(Math.PI / sides) : radius;
  const base = Math.atan2(reference.y - center.y, reference.x - center.x);
  return Array.from({ length: sides }, (_, index) => {
    const angle = base + (index * 2 * Math.PI) / sides;
    return {
      x: center.x + circumradius * Math.cos(angle),
      y: center.y + circumradius * Math.sin(angle),
    };
  });
}

/** Polígono definido por UN lado: se gira el segmento alrededor de sí mismo. */
function polygonFromEdge(a: CadPoint2, b: CadPoint2, sides: number): CadPoint2[] {
  const exterior = (2 * Math.PI) / sides;
  const vertices = [a, b];
  for (let index = 2; index < sides; index += 1) {
    const previous = vertices[index - 2];
    const current = vertices[index - 1];
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const cos = Math.cos(exterior);
    const sin = Math.sin(exterior);
    vertices.push({
      x: current.x + dx * cos - dy * sin,
      y: current.y + dx * sin + dy * cos,
    });
  }
  return vertices;
}

function polygonFinish(
  vertices: readonly CadPoint2[],
  context: CadCommandContext,
): CadCommandStep<PolygonState> {
  return {
    state: { sides: null, mode: "inscribed", points: [] },
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      vertices.length >= POLYGON_MIN_SIDES
        ? {
            kind: "document",
            commands: [
              {
                type: "insert",
                entity: {
                  id: context.newEntityId(),
                  type: "polyline",
                  vertices: vertices.map(flat),
                  closed: true,
                  layer: context.activeLayer,
                },
              },
            ],
            label: "POLYGON",
          }
        : { kind: "none" },
  };
}

function polygonStep(state: PolygonState, context: CadCommandContext): CadCommandStep<PolygonState> {
  if (state.sides === null)
    return {
      state,
      prompt: { message: "Precise el número de lados", options: [], defaultValue: "4" },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.points.length === 0)
    return {
      state,
      prompt: {
        message: state.mode === "edge" ? "Precise el primer extremo del lado" : "Precise el centro",
        options: state.mode === "edge" ? [] : [POLYGON_EDGE],
      },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: {
      message:
        state.mode === "edge"
          ? "Precise el segundo extremo del lado"
          : state.mode === "circumscribed"
            ? "Precise el radio del círculo inscrito"
            : "Precise el radio del círculo circunscrito",
      options: state.mode === "edge" ? [] : [POLYGON_INSCRIBED, POLYGON_CIRCUMSCRIBED],
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    preview: rubberBand(state.points[0], context.cursor),
  };
}

const polygonCommand: CadCommandDescriptor<PolygonState> = {
  name: "POLYGON",
  aliases: ["POL"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => polygonStep({ sides: null, mode: "inscribed", points: [] }, context),
  step: (state, input, context) => {
    if (input.kind === "cancel" || (input.kind === "enter" && state.sides !== null))
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: { kind: "none" },
      };
    // Enter sobre el primer paso acepta el valor por defecto, como en AutoCAD.
    if (input.kind === "enter") return polygonStep({ ...state, sides: 4 }, context);

    if (input.kind === "distance" && state.sides === null) {
      const sides = Math.round(input.value);
      if (sides < POLYGON_MIN_SIDES || sides > POLYGON_MAX_SIDES)
        return {
          state,
          prompt: { message: "", options: [] },
          accepts: 0,
          result: {
            kind: "message",
            text: `Un polígono tiene entre ${POLYGON_MIN_SIDES} y ${POLYGON_MAX_SIDES} lados; se pidieron ${sides}.`,
          },
        };
      return polygonStep({ ...state, sides }, context);
    }

    if (input.kind === "keyword") {
      if (input.keyword === POLYGON_EDGE.keyword)
        return polygonStep({ ...state, mode: "edge" }, context);
      if (input.keyword === POLYGON_INSCRIBED.keyword)
        return polygonStep({ ...state, mode: "inscribed" }, context);
      if (input.keyword === POLYGON_CIRCUMSCRIBED.keyword)
        return polygonStep({ ...state, mode: "circumscribed" }, context);
      return polygonStep(state, context);
    }

    if (input.kind !== "point" || state.sides === null) return polygonStep(state, context);
    const points = [...state.points, input.point];
    if (points.length < 2) return polygonStep({ ...state, points }, context);
    if (distance(points[0], points[1]) < 1e-9) return polygonFinish([], context);
    return polygonFinish(
      state.mode === "edge"
        ? polygonFromEdge(points[0], points[1], state.sides)
        : polygonVertices(points[0], points[1], state.sides, state.mode === "circumscribed"),
      context,
    );
  },
};

export const CAD_DRAW_CURVE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(arcCommand),
  asCadCommand(ellipseCommand),
  asCadCommand(polygonCommand),
];
