/**
 * Grips MULTIFUNCIONALES: el menú por pinzamiento y el ciclo con Espacio.
 *
 * ## Qué falta hoy y qué añade esto
 *
 * Los once adaptadores ya exponen `grips` y `moveGrip`, así que un grip se ve y
 * se arrastra. Pero un grip que sólo estira es un tirador: lo que lo convierte
 * en herramienta es que ofrezca lo que tiene sentido para ESE punto de ESE
 * objeto —añadir un vértice, quitarlo, convertir el tramo en arco o devolverlo
 * a recto— y que se pueda pasar de una opción a otra con la barra espaciadora
 * sin soltar el ratón.
 *
 * ## Tres decisiones que sostienen el diseño
 *
 * **La primera opción es SIEMPRE la de hoy.** `Estirar` (o `Mover`) es el
 * índice 0 de todo grip, y emite el mismo `{ type: "grip" }` de siempre. Quien
 * no pulse Espacio no nota ningún cambio; el comportamiento actual no se toca,
 * se le añade un menú detrás.
 *
 * **Esto no sabe de snaps, igual que el motor de comandos.** El anfitrión
 * resuelve el punto con `snap-engine.ts` y pasa el resultado ya resuelto. Si
 * este módulo consultara los snaps, añadir un modo obligaría a tocarlo.
 *
 * **Un arrastre es UN paso de deshacer.** Cien posiciones intermedias no son
 * cien entradas de historia: `cadGripDragGroupKey` da la clave de agrupación
 * que `CanonicalHistory` usa dentro de su ventana de 400 ms. Los commits del
 * motor de comandos la tienen desactivada a propósito —sus fronteras son
 * semánticas, no temporales—, pero un arrastre sí es exactamente el caso para
 * el que esa ventana existe.
 *
 * ## Lo que este cambio NO hace
 *
 * No cablea nada en la interfaz. El lienzo, la captura del ratón y la tecla
 * Espacio viven en `Layout3DEditor.tsx`, que está fuera del alcance de este
 * cambio por acuerdo entre sesiones. Aquí está la máquina completa, probada en
 * Node; conectarla es un cambio de una sesión que pueda tocar ese archivo.
 */
import type { CadPoint2 } from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";
import type { CadNativeEntity } from "./entity-runtime";

export type CadGripActionKind =
  | "stretch"
  | "move"
  | "add-vertex"
  | "remove-vertex"
  | "to-arc"
  | "to-line"
  | "radius";

export interface CadGripAction {
  kind: CadGripActionKind;
  /** Texto que ve el usuario. Localizable; el `kind` es el invariante. */
  label: string;
  /**
   * `true` si necesita un punto del usuario (un arrastre), `false` si se
   * resuelve en cuanto se elige. Quitar un vértice no necesita destino.
   */
  needsPoint: boolean;
}

const STRETCH: CadGripAction = { kind: "stretch", label: "Estirar", needsPoint: true };
const MOVE: CadGripAction = { kind: "move", label: "Mover", needsPoint: true };
const ADD_VERTEX: CadGripAction = { kind: "add-vertex", label: "Añadir vértice", needsPoint: true };
const REMOVE_VERTEX: CadGripAction = {
  kind: "remove-vertex",
  label: "Eliminar vértice",
  needsPoint: false,
};
const TO_ARC: CadGripAction = { kind: "to-arc", label: "Convertir en arco", needsPoint: true };
const TO_LINE: CadGripAction = { kind: "to-line", label: "Convertir en línea", needsPoint: false };
const RADIUS: CadGripAction = { kind: "radius", label: "Radio", needsPoint: true };

function vertexIndexOf(gripId: string, prefix: string): number | null {
  if (!gripId.startsWith(`${prefix}:`)) return null;
  const index = Number(gripId.slice(prefix.length + 1));
  return Number.isInteger(index) ? index : null;
}

/** El tramo que ARRANCA en este vértice, teniendo en cuenta el cierre. */
function segmentCount(entity: Extract<CadNativeEntity, { type: "polyline" }>): number {
  return entity.closed ? entity.vertices.length : entity.vertices.length - 1;
}

/**
 * Las opciones del grip, en orden de ciclo. La primera es la de siempre.
 *
 * Devuelve lista vacía para un grip que no existe: quien llame no debe abrir un
 * menú de cero opciones, y así lo distingue de «sólo estirar».
 */
export function cadGripActions(entity: CadNativeEntity, gripId: string): CadGripAction[] {
  if (entity.type === "polyline") {
    const index = vertexIndexOf(gripId, "vertex");
    if (index === null || !entity.vertices[index]) return [];
    const actions: CadGripAction[] = [STRETCH, ADD_VERTEX];
    // Quitar el vértice sólo se ofrece si queda una polilínea: dos vértices son
    // el mínimo, y ofrecer una opción que se va a negar es peor que no
    // ofrecerla.
    if (entity.vertices.length > 2) actions.push(REMOVE_VERTEX);
    // El tramo que arranca aquí puede convertirse en arco, o volver a recto si
    // ya lo es. Ofrecer las dos a la vez confundiría: sólo aparece la que
    // cambia algo.
    if (index < segmentCount(entity))
      actions.push((entity.vertices[index].bulge ?? 0) === 0 ? TO_ARC : TO_LINE);
    return actions;
  }

  if (entity.type === "spline") {
    const index = vertexIndexOf(gripId, "control");
    if (index === null || !entity.controlPoints[index]) return [];
    const actions: CadGripAction[] = [STRETCH, ADD_VERTEX];
    // Un grado 3 necesita cuatro puntos de control; por debajo la curva deja de
    // existir.
    if (entity.controlPoints.length > entity.degree + 1) actions.push(REMOVE_VERTEX);
    return actions;
  }

  if (entity.type === "line")
    return gripId === "start" || gripId === "end"
      ? [STRETCH]
      : gripId === "midpoint"
        ? [MOVE]
        : [];

  if (entity.type === "circle")
    return gripId === "center" ? [MOVE] : gripId.startsWith("quadrant:") ? [RADIUS] : [];

  if (entity.type === "arc") {
    if (gripId === "center") return [MOVE];
    if (gripId === "start" || gripId === "end") return [STRETCH, RADIUS, TO_LINE];
    return gripId.startsWith("quadrant:") || gripId === "midpoint" ? [RADIUS] : [];
  }

  if (entity.type === "ellipse")
    return gripId === "center"
      ? [MOVE]
      : // El adaptador expone los cuatro extremos de los ejes: el mayor cambia
        // el tamaño y la orientación, el menor cambia la proporción. Los dos
        // estiran, así que el menú es el mismo; enumerarlos aquí es lo que
        // evita que un nombre nuevo de grip se quede mudo.
        gripId.startsWith("major") ||
          gripId.startsWith("minor") ||
          gripId === "start" ||
          gripId === "end"
        ? [STRETCH]
        : [];

  // Lo demás —texto, bloque, cota, directriz, sombreado— sólo mueve su grip.
  return [STRETCH];
}

/**
 * `bulge` de un arco que pasa por `through`, en el tramo `from → to`.
 *
 * El ángulo inscrito en `through` vale `π − θ/2`, así que el barrido es
 * `θ = 2·(π − α)` y el bulge, `tan(θ/4) = tan((π − α)/2)`. El signo lo decide
 * de qué lado de la cuerda cae el punto, con el convenio DXF: un bulge positivo
 * es antihorario, y viajando hacia +x eso pasa POR DEBAJO de la cuerda.
 */
export function cadBulgeThroughPoint(
  from: CadPoint2,
  to: CadPoint2,
  through: CadPoint2,
): number {
  const ax = from.x - through.x;
  const ay = from.y - through.y;
  const bx = to.x - through.x;
  const by = to.y - through.y;
  const lengthA = Math.hypot(ax, ay);
  const lengthB = Math.hypot(bx, by);
  if (lengthA < 1e-12 || lengthB < 1e-12) return 0;
  const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (lengthA * lengthB)));
  const alpha = Math.acos(cosine);
  const magnitude = Math.tan((Math.PI - alpha) / 2);
  if (!Number.isFinite(magnitude)) return 0;
  const side = (to.x - from.x) * (through.y - from.y) - (to.y - from.y) * (through.x - from.x);
  return side < 0 ? magnitude : -magnitude;
}

export type CadGripOutcome = { commands: CadEntityCommand[] } | { error: string };

/**
 * Los comandos de la acción elegida.
 *
 * `stretch` y `move` emiten el `{ type: "grip" }` de siempre, que va al
 * `moveGrip` del adaptador: la ruta que ya existe y que cada tipo sabe aplicar
 * a su geometría. Las demás reconstruyen la entidad y salen por `replace`,
 * CONSERVANDO el id — borrar y crear rompería las cotas asociativas, los
 * sombreados y el orden de dibujo que apuntan a esta entidad.
 */
export function cadGripActionCommands(
  entity: CadNativeEntity,
  gripId: string,
  action: CadGripActionKind,
  point?: CadPoint2,
): CadGripOutcome {
  const available = cadGripActions(entity, gripId);
  const chosen = available.find((candidate) => candidate.kind === action);
  if (!chosen)
    return { error: `El grip ${gripId} de ${entity.type.toUpperCase()} no ofrece «${action}».` };
  if (chosen.needsPoint && !point)
    return { error: `«${chosen.label}» necesita un punto de destino.` };

  if (action === "stretch" || action === "move")
    return { commands: [{ type: "grip", entityId: entity.id, gripId, point: point! }] };

  if (action === "radius") {
    if (entity.type !== "circle" && entity.type !== "arc")
      return { error: "sólo un círculo o un arco tienen radio." };
    const radius = Math.hypot(point!.x - entity.center.x, point!.y - entity.center.y);
    if (!(radius > 1e-9)) return { error: "un radio nulo colapsaría la curva." };
    return { commands: [{ type: "properties", entityId: entity.id, patch: { radius } }] };
  }

  if (entity.type === "polyline") {
    const index = vertexIndexOf(gripId, "vertex")!;
    const vertices = entity.vertices.map((vertex) => ({ ...vertex }));

    if (action === "remove-vertex") {
      vertices.splice(index, 1);
      return {
        commands: [
          { type: "replace", entityId: entity.id, entity: { ...entity, vertices } },
        ],
      };
    }
    if (action === "add-vertex") {
      // El vértice nuevo entra DETRÁS del pinchado, partiendo su tramo. El
      // `bulge` del tramo partido se descarta: mantenerlo daría dos arcos del
      // mismo radio que ya no pasan por donde pasaba el original.
      vertices[index] = { ...vertices[index], bulge: undefined };
      vertices.splice(index + 1, 0, { x: point!.x, y: point!.y, z: vertices[index].z ?? 0 });
      return {
        commands: [
          { type: "replace", entityId: entity.id, entity: { ...entity, vertices } },
        ],
      };
    }
    if (action === "to-line") {
      vertices[index] = { ...vertices[index], bulge: undefined };
      return {
        commands: [
          { type: "replace", entityId: entity.id, entity: { ...entity, vertices } },
        ],
      };
    }
    // to-arc: el punto arrastrado es POR DONDE pasa el arco.
    const next = vertices[(index + 1) % vertices.length];
    const bulge = cadBulgeThroughPoint(vertices[index], next, point!);
    if (Math.abs(bulge) < 1e-9)
      return { error: "el punto cae sobre la cuerda: el tramo seguiría siendo recto." };
    vertices[index] = { ...vertices[index], bulge };
    return {
      commands: [{ type: "replace", entityId: entity.id, entity: { ...entity, vertices } }],
    };
  }

  if (entity.type === "spline") {
    const index = vertexIndexOf(gripId, "control")!;
    const controlPoints = entity.controlPoints.map((control) => ({ ...control }));
    if (action === "remove-vertex") controlPoints.splice(index, 1);
    else if (action === "add-vertex")
      controlPoints.splice(index + 1, 0, {
        x: point!.x,
        y: point!.y,
        z: controlPoints[index].z ?? 0,
      });
    else return { error: `«${action}» no se aplica a una SPLINE.` };
    // Los nudos se resintetizan: un vector del tamaño viejo con una lista de
    // control nueva describe otra curva, y De Boor la evaluaría fuera de rango.
    const degree = Math.max(1, Math.min(entity.degree, controlPoints.length - 1));
    return {
      commands: [
        {
          type: "replace",
          entityId: entity.id,
          entity: {
            ...entity,
            degree,
            controlPoints,
            knots: clampedKnots(controlPoints.length, degree),
            ...(entity.weights ? { weights: resizeWeights(entity.weights, controlPoints.length) } : {}),
          },
        },
      ],
    };
  }

  if (action === "to-line" && entity.type === "arc")
    return {
      commands: [
        {
          type: "replace",
          entityId: entity.id,
          entity: {
            id: entity.id,
            type: "line",
            start: arcEnd(entity, entity.startAngle),
            end: arcEnd(entity, entity.endAngle),
            layer: entity.layer,
            ...(entity.context ? { context: entity.context } : {}),
          },
        },
      ],
    };

  return { error: `«${action}» no se aplica a ${entity.type.toUpperCase()}.` };
}

function arcEnd(entity: Extract<CadNativeEntity, { type: "arc" }>, angleDeg: number) {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: entity.center.x + Math.cos(radians) * entity.radius,
    y: entity.center.y + Math.sin(radians) * entity.radius,
    z: entity.center.z,
  };
}

function clampedKnots(count: number, degree: number): number[] {
  const knots: number[] = [];
  const spans = count - degree;
  for (let index = 0; index < count + degree + 1; index += 1) {
    if (index <= degree) knots.push(0);
    else if (index >= count) knots.push(spans);
    else knots.push(index - degree);
  }
  return knots;
}

/** Pesos ajustados al número de puntos: los que faltan valen 1, los que sobran se caen. */
function resizeWeights(weights: readonly number[], count: number): number[] {
  return Array.from({ length: count }, (_unused, index) => weights[index] ?? 1);
}

// ---------------------------------------------------------------------------
// Sesión: ciclar con Espacio
// ---------------------------------------------------------------------------

export interface CadGripSession {
  entityId: string;
  gripId: string;
  actions: readonly CadGripAction[];
  /** Índice de la opción activa dentro de `actions`. */
  index: number;
}

/** Arranca la sesión en la opción de siempre, o `null` si el grip no existe. */
export function beginCadGripSession(
  entity: CadNativeEntity,
  gripId: string,
): CadGripSession | null {
  const actions = cadGripActions(entity, gripId);
  if (actions.length === 0) return null;
  return { entityId: entity.id, gripId, actions, index: 0 };
}

/**
 * Espacio pasa a la siguiente opción, y de la última vuelve a la primera.
 *
 * Que CICLE y no se pare al final es lo que permite pulsar Espacio sin mirar:
 * si se quedara en la última, pasarse de largo obligaría a soltar y empezar.
 */
export function cycleCadGripSession(session: CadGripSession): CadGripSession {
  return { ...session, index: (session.index + 1) % session.actions.length };
}

export function activeCadGripAction(session: CadGripSession): CadGripAction {
  return session.actions[session.index];
}

/**
 * Clave de agrupación del arrastre.
 *
 * Mientras no cambie —o sea, mientras se arrastre el MISMO grip del MISMO
 * objeto—, `CanonicalHistory` funde las escrituras dentro de su ventana de
 * 400 ms en una sola entrada. Sin ella, arrastrar un vértice de una esquina a
 * la otra dejaría un paso de deshacer por fotograma y Ctrl+Z devolvería el
 * grip un píxel.
 */
export function cadGripDragGroupKey(session: CadGripSession): string {
  return `grip:${session.entityId}:${session.gripId}:${activeCadGripAction(session).kind}`;
}

/** Aplica la opción activa de la sesión. Atajo de lo de arriba, ya compuesto. */
export function applyCadGripSession(
  session: CadGripSession,
  entity: CadNativeEntity,
  point?: CadPoint2,
): CadGripOutcome {
  return cadGripActionCommands(entity, session.gripId, activeCadGripAction(session).kind, point);
}
