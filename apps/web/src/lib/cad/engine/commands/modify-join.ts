/**
 * JOIN y EXPLODE: unir lo que está partido y partir lo que está unido.
 *
 * ## JOIN dice POR QUÉ cuando no puede
 *
 * Es la mitad del comando. Dos líneas casi colineales se ven iguales que dos
 * colineales, y un JOIN que se calla deja al dibujante mirando la pantalla sin
 * saber si funcionó. Aquí cada negativa nombra la causa: no son colineales, los
 * arcos no comparten centro, los extremos no se tocan.
 *
 * Tres familias, en este orden:
 *
 *   1. Sólo LINE y todas COLINEALES → una LINE que abarca de un extremo al
 *      otro. Los huecos se rellenan, como en AutoCAD: quien une dos trozos de
 *      un mismo eje espera el eje entero.
 *   2. Sólo ARC, CONCÉNTRICOS y del mismo radio → un ARC con el barrido unido,
 *      o un CIRCLE si entre todos dan la vuelta.
 *   3. Cualquier mezcla que se ENCADENE extremo con extremo → una POLYLINE.
 *
 * ## EXPLODE
 *
 * POLYLINE a sus tramos (los de `bulge` salen como ARC, no como cuerdas),
 * INSERT a las entidades de su bloque ya colocadas, y COTA y MLEADER a la
 * geometría que se dibuja de ellos más un MTEXT con su texto.
 *
 * El original se BORRA y las piezas se INSERTAN, que es lo que significa
 * explotar. Es la única operación de este conjunto que rompe a propósito lo que
 * apuntaba a la entidad: un sombreado asociado a una polilínea explotada ya no
 * tiene a qué asociarse, y fingir lo contrario sería peor.
 */
import type { CadEntity, CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { buildCadDimensionGeometry } from "../../associative-dimension";
import { buildCadMleaderGeometry } from "../../associative-mleader";
import { cadEntityCurves, curvePointAt, type CadCurve } from "../../curve-model";
import type { CadNativeEntity } from "../../entity-runtime";
import { resolveCadInsert } from "../../professional-blocks";
import { norm360 } from "../../primitives";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const EPS = 1e-7;

// ---------------------------------------------------------------------------
// JOIN
// ---------------------------------------------------------------------------

type CadLine = Extract<CadEntity, { type: "line" }>;
type CadArc = Extract<CadEntity, { type: "arc" }>;

/** Une líneas colineales en una sola, o explica por qué no lo son. */
function joinLines(lines: readonly CadLine[]): CadEntityCommand[] | string {
  const [first] = lines;
  const dx = first.end.x - first.start.x;
  const dy = first.end.y - first.start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > EPS)) return "la primera línea tiene longitud cero.";
  const ux = dx / length;
  const uy = dy / length;
  // Colineal = misma dirección Y sobre la misma recta. Sólo lo primero deja
  // pasar dos paralelas separadas, que al unirse darían una línea que no pasa
  // por ninguna de las dos.
  for (const line of lines.slice(1)) {
    const vx = line.end.x - line.start.x;
    const vy = line.end.y - line.start.y;
    if (Math.abs(ux * vy - uy * vx) > EPS * Math.max(1, Math.hypot(vx, vy)))
      return `${line.id} no es paralela a ${first.id}.`;
    const offset = (line.start.x - first.start.x) * -uy + (line.start.y - first.start.y) * ux;
    if (Math.abs(offset) > 1e-6)
      return `${line.id} es paralela a ${first.id} pero no está sobre la misma recta.`;
  }
  const projections = lines.flatMap((line) =>
    [line.start, line.end].map((point) => (point.x - first.start.x) * ux + (point.y - first.start.y) * uy),
  );
  const low = Math.min(...projections);
  const high = Math.max(...projections);
  return [
    {
      type: "properties",
      entityId: first.id,
      patch: {
        startX: first.start.x + ux * low,
        startY: first.start.y + uy * low,
        endX: first.start.x + ux * high,
        endY: first.start.y + uy * high,
      },
    },
    ...lines.slice(1).map((line): CadEntityCommand => ({ type: "delete", entityId: line.id })),
  ];
}

/** Une arcos concéntricos del mismo radio, o explica por qué no encajan. */
function joinArcs(arcs: readonly CadArc[]): CadEntityCommand[] | string {
  const [first] = arcs;
  for (const arc of arcs.slice(1)) {
    if (
      Math.hypot(arc.center.x - first.center.x, arc.center.y - first.center.y) >
      Math.max(1e-6, first.radius * 1e-9)
    )
      return `${arc.id} no comparte centro con ${first.id}.`;
    if (Math.abs(arc.radius - first.radius) > Math.max(1e-6, first.radius * 1e-9))
      return `${arc.id} no tiene el mismo radio que ${first.id}.`;
  }
  // Cada arco como intervalo de AVANCE sobre el barrido del primero. Así la
  // unión se calcula en una recta y no hay que razonar sobre el cruce del
  // origen de ángulos, que es donde estos cálculos se rompen.
  const intervals = arcs
    .map((arc) => {
      const from = norm360(arc.startAngle - first.startAngle);
      const sweep = norm360(arc.endAngle - arc.startAngle) || 360;
      return { from, to: from + sweep };
    })
    .sort((left, right) => left.from - right.from);

  const merged: { from: number; to: number }[] = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.from <= last.to + 1e-6) last.to = Math.max(last.to, interval.to);
    else merged.push({ ...interval });
  }
  // El último tramo puede DAR LA VUELTA y enlazar con el primero. Sin este
  // caso, unir un arco de 200°→360° con otro de 0°→90° —que se tocan en el
  // origen de ángulos— se rechazaba por «hueco», y el resultado dependía de
  // cuál se hubiera designado primero.
  if (merged.length > 1) {
    const last = merged[merged.length - 1];
    if (last.to >= 360 - 1e-6 && merged[0].from <= last.to - 360 + 1e-6) {
      merged[0] = { from: last.from, to: merged[0].to + 360 };
      merged.pop();
    }
  }
  if (merged.length > 1)
    return `hay un hueco entre los arcos: ninguno cubre desde ${norm360(first.startAngle + merged[0].to).toFixed(3)}°.`;
  const { from, to } = merged[0];
  if (to - from >= 360 - 1e-6) return joinArcsIntoCircle(first, arcs);
  return [
    {
      type: "properties",
      entityId: first.id,
      patch: {
        startAngle: norm360(first.startAngle + from),
        endAngle: norm360(first.startAngle + to),
      },
    },
    ...arcs.slice(1).map((arc): CadEntityCommand => ({ type: "delete", entityId: arc.id })),
  ];
}

/** Arcos que entre todos dan la vuelta: el resultado es un CÍRCULO. */
function joinArcsIntoCircle(first: CadArc, arcs: readonly CadArc[]): CadEntityCommand[] {
  return [
    {
      type: "replace",
      entityId: first.id,
      entity: {
        id: first.id,
        type: "circle",
        center: { ...first.center },
        radius: first.radius,
        layer: first.layer,
        ...(first.context ? { context: first.context } : {}),
      },
    },
    ...arcs.slice(1).map((arc): CadEntityCommand => ({ type: "delete", entityId: arc.id })),
  ];
}

function curveEnds(curves: readonly CadCurve[]): { start: CadPoint2; end: CadPoint2 } {
  return { start: curvePointAt(curves[0], 0), end: curvePointAt(curves[curves.length - 1], 1) };
}

function samePoint(a: CadPoint2, b: CadPoint2): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= 1e-6;
}

function reverseCurve(curve: CadCurve): CadCurve {
  if (curve.kind === "segment") return { kind: "segment", a: curve.b, b: curve.a };
  if (curve.kind === "arc")
    return { ...curve, startAngle: curve.startAngle + curve.sweep, sweep: -curve.sweep };
  return { ...curve, startParam: curve.startParam + curve.sweep, sweep: -curve.sweep };
}

const bulgeOf = (curve: CadCurve) =>
  curve.kind === "arc" ? Math.tan(((curve.sweep * Math.PI) / 180) / 4) : 0;

/**
 * Encadena las entidades extremo con extremo en una sola polilínea.
 *
 * Se admite recorrerlas al revés —un tramo dibujado en sentido contrario sigue
 * conectando— pero no se admite un salto: dos trozos que no se tocan no forman
 * una polilínea, forman dos.
 */
function joinChain(entities: readonly CadEntity[]): CadEntityCommand[] | string {
  const pieces: { id: string; curves: CadCurve[] }[] = [];
  for (const entity of entities) {
    const curves = cadEntityCurves(entity);
    if (!curves || curves.length === 0)
      return `${entity.type.toUpperCase()} no se puede encadenar.`;
    if (curves.length === 1 && curves[0].kind !== "segment" && curves[0].kind !== "arc")
      return `una ELIPSE no cabe en una polilínea; JOIN no la puede encadenar.`;
    pieces.push({ id: entity.id, curves });
  }

  const chain = [...pieces[0].curves];
  const used = new Set([pieces[0].id]);
  let progress = true;
  while (used.size < pieces.length && progress) {
    progress = false;
    for (const piece of pieces) {
      if (used.has(piece.id)) continue;
      const ends = curveEnds(chain);
      const own = curveEnds(piece.curves);
      if (samePoint(ends.end, own.start)) chain.push(...piece.curves);
      else if (samePoint(ends.end, own.end)) chain.push(...[...piece.curves].reverse().map(reverseCurve));
      else if (samePoint(ends.start, own.end)) chain.unshift(...piece.curves);
      else if (samePoint(ends.start, own.start))
        chain.unshift(...[...piece.curves].reverse().map(reverseCurve));
      else continue;
      used.add(piece.id);
      progress = true;
    }
  }
  if (used.size < pieces.length) {
    const loose = pieces.filter((piece) => !used.has(piece.id)).map((piece) => piece.id);
    return `${loose.join(", ")} no toca ningún extremo de los demás: JOIN no rellena huecos entre objetos distintos.`;
  }

  const first = entities.find((entity) => entity.id === pieces[0].id)!;
  const ends = curveEnds(chain);
  const closed = chain.length > 2 && samePoint(ends.start, ends.end);
  const vertices: (CadPoint3 & { bulge?: number })[] = chain.map((curve) => {
    const point = curvePointAt(curve, 0);
    const bulge = bulgeOf(curve);
    return bulge === 0 ? { x: point.x, y: point.y, z: 0 } : { x: point.x, y: point.y, z: 0, bulge };
  });
  if (!closed) vertices.push({ x: ends.end.x, y: ends.end.y, z: 0 });

  return [
    {
      type: "replace",
      entityId: first.id,
      entity: {
        id: first.id,
        type: "polyline",
        vertices,
        closed,
        layer: first.layer,
        ...(first.context ? { context: first.context } : {}),
      },
    },
    ...entities
      .filter((entity) => entity.id !== first.id)
      .map((entity): CadEntityCommand => ({ type: "delete", entityId: entity.id })),
  ];
}

/**
 * La unión, o el motivo por el que no la hay.
 *
 * El orden importa: primero se intenta la unión ESPECIALIZADA —líneas
 * colineales, arcos concéntricos—, que rellena huecos y conserva el tipo, y
 * sólo si no encaja se intenta encadenar en polilínea. Al revés, dos trozos
 * colineales separados se convertirían en una polilínea de dos vértices en vez
 * de en la línea entera que el dibujante esperaba.
 *
 * Cuando fallan las dos se cuentan LAS DOS razones. «No son colineales» a
 * secas dejaría pensando que basta con alinearlas, cuando además hay un hueco.
 */
export function cadJoinCommands(entities: readonly CadEntity[]): CadEntityCommand[] | string {
  if (entities.length < 2) return "JOIN necesita al menos dos objetos.";
  let specific: string | null = null;
  if (entities.every((entity): entity is CadLine => entity.type === "line")) {
    const merged = joinLines(entities as CadLine[]);
    if (typeof merged !== "string") return merged;
    specific = merged;
  } else if (entities.every((entity): entity is CadArc => entity.type === "arc")) {
    const merged = joinArcs(entities as CadArc[]);
    if (typeof merged !== "string") return merged;
    specific = merged;
  }
  const chained = joinChain(entities);
  if (typeof chained !== "string") return chained;
  return specific ? `${specific} Y tampoco se encadenan: ${chained}` : chained;
}

interface JoinState {
  targets: string[];
}

const joinCommand: CadCommandDescriptor<JoinState> = {
  name: "JOIN",
  aliases: ["J"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => ({
    state: { targets: [...context.selection] },
    prompt: { message: "Designe los objetos a unir", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  }),
  step: (state, input, context) => {
    const asking = (next: JoinState): CadCommandStep<JoinState> => ({
      state: next,
      prompt: { message: "Designe los objetos a unir", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    });
    const done = (result: CadCommandStep<JoinState>["result"]): CadCommandStep<JoinState> => ({
      state: { targets: [] },
      prompt: { message: "", options: [] },
      accepts: 0,
      result,
    });
    if (input.kind === "cancel") return done({ kind: "none" });
    if (input.kind === "entityPick")
      return asking({ targets: [...new Set([...state.targets, input.entityId])] });
    if (input.kind === "selection")
      return asking({ targets: [...new Set([...state.targets, ...input.entityIds])] });
    if (input.kind !== "enter") return asking(state);

    const entities = state.targets
      .map((id) => context.entity?.(id))
      .filter((entity): entity is CadEntity => !!entity);
    if (entities.length !== state.targets.length)
      return done({ kind: "message", text: "JOIN: alguno de los objetos designados ya no existe." });
    const outcome = cadJoinCommands(entities);
    if (typeof outcome === "string") return done({ kind: "message", text: `JOIN: ${outcome}` });
    return done({ kind: "document", commands: outcome, label: "JOIN" });
  },
};

// ---------------------------------------------------------------------------
// EXPLODE
// ---------------------------------------------------------------------------

function pathEntity(points: readonly CadPoint2[], closed: boolean, source: CadEntity, id: string): CadNativeEntity {
  return {
    id,
    type: "polyline",
    vertices: points.map((point) => ({ x: point.x, y: point.y, z: 0 })),
    closed,
    layer: source.layer,
  };
}

/** Las piezas de una entidad explotada, o el motivo por el que no se explota. */
export function cadExplodeCommands(
  entity: CadEntity,
  context: CadCommandContext,
): CadEntityCommand[] | string {
  const pieces: CadNativeEntity[] = [];

  if (entity.type === "polyline") {
    const curves = cadEntityCurves(entity);
    if (!curves || curves.length === 0) return "la polilínea no tiene tramos.";
    for (const curve of curves) {
      const id = context.newEntityId();
      if (curve.kind === "segment")
        pieces.push({
          id,
          type: "line",
          start: { x: curve.a.x, y: curve.a.y, z: 0 },
          end: { x: curve.b.x, y: curve.b.y, z: 0 },
          layer: entity.layer,
        });
      else if (curve.kind === "arc") {
        // Un tramo con `bulge` es un ARCO. Sacarlo como su cuerda cambiaría el
        // dibujo en silencio, que es lo que EXPLODE nunca debe hacer.
        const ccw = curve.sweep >= 0;
        pieces.push({
          id,
          type: "arc",
          center: { x: curve.center.x, y: curve.center.y, z: 0 },
          radius: curve.radius,
          startAngle: norm360(ccw ? curve.startAngle : curve.startAngle + curve.sweep),
          endAngle: norm360(ccw ? curve.startAngle + curve.sweep : curve.startAngle),
          layer: entity.layer,
        });
      } else return "un tramo elíptico no cabe en LINE ni en ARC.";
    }
  } else if (entity.type === "insert") {
    const blocks = context.blocks?.();
    if (!blocks)
      return "el anfitrión no ha expuesto las definiciones de bloque; sin ellas no se sabe qué contiene el INSERT.";
    const resolved = resolveCadInsert(
      { blocks: [...blocks], entities: [entity] },
      entity,
    );
    if (resolved.entities.length === 0)
      return `el bloque ${entity.block} no se pudo resolver (${resolved.diagnostics.map((diagnostic) => diagnostic.detail).join("; ") || "está vacío"}).`;
    // Los ids que devuelve la resolución son derivados del bloque y se repiten
    // entre inserciones: hay que darles identidad propia antes de darlos de
    // alta o el segundo EXPLODE del mismo bloque chocaría con el primero.
    for (const child of resolved.entities)
      pieces.push({ ...structuredClone(child), id: context.newEntityId() } as CadNativeEntity);
  } else if (entity.type === "dimension") {
    const geometry = buildCadDimensionGeometry(entity);
    if (!geometry) return "la cota no tiene geometría que dibujar.";
    for (const path of geometry.paths)
      pieces.push(pathEntity(path.points, path.closed === true, entity, context.newEntityId()));
    pieces.push({
      id: context.newEntityId(),
      type: "mtext",
      insertion: { x: geometry.textAnchor.x, y: geometry.textAnchor.y, z: 0 },
      text: geometry.label,
      rotation: geometry.textAngle,
      layer: entity.layer,
    });
  } else if (entity.type === "mleader") {
    const geometry = buildCadMleaderGeometry(entity);
    if (!geometry) return "la directriz no tiene geometría que dibujar.";
    for (const path of geometry.paths)
      pieces.push(pathEntity(path.points, path.closed === true, entity, context.newEntityId()));
    pieces.push({
      id: context.newEntityId(),
      type: "mtext",
      insertion: { x: geometry.textAnchor.x, y: geometry.textAnchor.y, z: 0 },
      text: entity.text,
      layer: entity.layer,
    });
  } else {
    return `${entity.type.toUpperCase()} no se puede explotar; sólo POLYLINE, INSERT, DIMENSION y MLEADER.`;
  }

  if (pieces.length === 0) return "no salió ninguna pieza.";
  return [
    ...pieces.map((piece): CadEntityCommand => ({ type: "insert", entity: piece })),
    { type: "delete", entityId: entity.id },
  ];
}

interface ExplodeState {
  targets: string[];
}

const explodeCommand: CadCommandDescriptor<ExplodeState> = {
  name: "EXPLODE",
  aliases: ["X"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => ({
    state: { targets: [...context.selection] },
    prompt: { message: "Designe los objetos a descomponer", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  }),
  step: (state, input, context) => {
    const asking = (next: ExplodeState): CadCommandStep<ExplodeState> => ({
      state: next,
      prompt: { message: "Designe los objetos a descomponer", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    });
    const done = (result: CadCommandStep<ExplodeState>["result"]): CadCommandStep<ExplodeState> => ({
      state: { targets: [] },
      prompt: { message: "", options: [] },
      accepts: 0,
      result,
    });
    if (input.kind === "cancel") return done({ kind: "none" });
    if (input.kind === "entityPick")
      return asking({ targets: [...new Set([...state.targets, input.entityId])] });
    if (input.kind === "selection")
      return asking({ targets: [...new Set([...state.targets, ...input.entityIds])] });
    if (input.kind !== "enter") return asking(state);

    const commands: CadEntityCommand[] = [];
    const refusals: string[] = [];
    for (const id of state.targets) {
      const entity = context.entity?.(id);
      if (!entity) {
        refusals.push(`${id} ya no existe.`);
        continue;
      }
      const outcome = cadExplodeCommands(entity, context);
      if (typeof outcome === "string") refusals.push(`${id}: ${outcome}`);
      else commands.push(...outcome);
    }
    // Lo que no se pudo explotar se CUENTA aunque otras cosas sí se explotaran:
    // un EXPLODE que trata tres de cinco y calla deja creyendo que trató cinco.
    if (commands.length === 0)
      return done(
        refusals.length > 0
          ? { kind: "message", text: `EXPLODE: ${refusals.join(" ")}` }
          : { kind: "none" },
      );
    return done({ kind: "document", commands, label: "EXPLODE" });
  },
};

export const CAD_MODIFY_JOIN_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(joinCommand),
  asCadCommand(explodeCommand),
];
