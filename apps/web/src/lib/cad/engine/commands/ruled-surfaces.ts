/**
 * Mallas y superficies con geometría real: RULESURF, TABSURF, REVSURF y EDGESURF.
 *
 * La auditoría del 19-sep midió que las cuatro fingían: RULESURF, TABSURF y
 * EDGESURF tiraban la Z de sus curvas y extruían un contorno PLANO en XY;
 * REVSURF giraba el perfil en el plano alrededor de un PUNTO (no de un eje 3D),
 * lo que da un disco aplastado de 1 µm en vez de un sólido de revolución.
 *
 * Las tres primeras ahora tejen su rejilla en 3D de verdad (`ruled-fabric.ts`):
 * cada celda entre las curvas reales se tesela en triángulos —siempre
 * planos, sin aplanar la geometría— y el mismo tejido se desfasa un espesor
 * mínimo para cerrar el sólido que exige el esquema 5. REVSURF gira el perfil
 * alrededor de un EJE 3D de verdad (dos puntos, no uno) usando `op: "revolve"`
 * del propio kernel, con ángulo inicial y barrido.
 *
 * Un perfil que no es plano respecto a su eje, o dos curvas cuyo contorno sale
 * degenerado, NO se aplanan en silencio: la orden se niega y dice qué faltó.
 */
import type { CadPoint3 } from "../../cad-document";
import type { CadSolidFrame, CadSolidNode, CadSolidProfile } from "../../cad-entities-v5";
import {
  v3Add,
  v3Cross,
  v3Dot,
  v3Length,
  v3RotateAroundAxis,
  v3Scale,
  v3Sub,
  vec3,
  type Vec3,
} from "../../../brep";
import {
  asCadCommand,
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
} from "../command-types";
import {
  finishedSolid,
  formatMagnitude,
  makeSolidEntity,
  solidMessage,
} from "./solids-support";
import {
  distance3D,
  needsReverse3D,
  resample3D,
  sampleCurve3D,
  segmentLength3D,
  SURFACE_THICKNESS,
  thinGridSolid,
} from "./ruled-fabric";

interface RuledState {
  first: string | null;
  second: string | null;
}

// --- RULESURF: superficie reglada entre dos curvas, en 3D ----------------------

const rulesurfCommand: CadCommandDescriptor<RuledState> = {
  name: "RULESURF",
  aliases: ["RSURF", "SUPERFICIEREGLADA"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length >= 2
      ? { first: context.selection[0], second: context.selection[1] }
      : context.selection.length === 1
        ? { first: context.selection[0], second: null }
        : { first: null, second: null },
    prompt: {
      message: context.selection.length >= 2
        ? "Dos curvas seleccionadas. Pulse Intro para crear la superficie reglada"
        : "Designe la primera curva de contorno",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "RULESURF cancelado.");
    if (input.kind === "entityPick" || input.kind === "selection") {
      const id = input.kind === "entityPick" ? input.entityId : input.entityIds[0];
      if (!state.first)
        return {
          state: { first: id, second: null },
          prompt: { message: "Primera curva seleccionada. Designe la segunda", options: [] },
          accepts: CAD_ACCEPT_ENTITY_PICK,
        };
      return {
        state: { first: state.first, second: id },
        prompt: { message: "Dos curvas. Pulse Intro para crear la superficie reglada", options: [] },
        accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
      };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe curvas o pulse Intro", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };

    if (!state.first || !state.second)
      return solidMessage(state, "RULESURF necesita dos curvas.");
    const e1 = context.entity?.(state.first);
    const e2 = context.entity?.(state.second);
    if (!e1 || !e2) return solidMessage(state, "RULESURF: no se encontraron las curvas.");

    const c1 = sampleCurve3D(e1);
    if (typeof c1 === "string") return solidMessage(state, `RULESURF: primera curva — ${c1}`);
    const c2 = sampleCurve3D(e2);
    if (typeof c2 === "string") return solidMessage(state, `RULESURF: segunda curva — ${c2}`);

    const cols = Math.max(c1.length, c2.length);
    const rowA = resample3D(c1, cols);
    let rowB = resample3D(c2, cols);
    // Dos curvas dibujadas en sentidos opuestos reglarían una banda retorcida
    // (un lazo en forma de pajarita): se invierte la segunda para que ambas
    // corran en el mismo sentido, igual que hace EDGESURF con sus bordes.
    if (needsReverse3D(rowA, rowB)) rowB = rowB.slice().reverse();

    const grid = thinGridSolid([rowA, rowB], SURFACE_THICKNESS);
    if (!grid.ok) return solidMessage(state, `RULESURF: ${grid.reason}`);

    const node: CadSolidNode = { id: "reglada", op: "brep", points: grid.solid.points, faces: grid.solid.faces };
    const solid = makeSolidEntity(context.newEntityId(), [node], "reglada", context.activeLayer);

    const width = distance3D(rowA[0], rowB[0]);
    return finishedSolid(solid, {
      state: { first: null, second: null },
      label: "RULESURF",
      notice: `Superficie reglada creada (${cols} secciones, ancho inicial ${formatMagnitude(width)} mm).`,
    });
  },
};

// --- TABSURF: superficie tabulada — perfil trasladado según una trayectoria ----

const tabsurfCommand: CadCommandDescriptor<RuledState> = {
  name: "TABSURF",
  aliases: ["TSURF", "SUPERFICIETABULADA"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length >= 2
      ? { first: context.selection[0], second: context.selection[1] }
      : context.selection.length === 1
        ? { first: context.selection[0], second: null }
        : { first: null, second: null },
    prompt: {
      message: context.selection.length >= 2
        ? "Dos curvas seleccionadas. Pulse Intro para crear la superficie tabulada"
        : "Designe la curva de perfil",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "TABSURF cancelado.");
    if (input.kind === "entityPick" || input.kind === "selection") {
      const id = input.kind === "entityPick" ? input.entityId : input.entityIds[0];
      if (!state.first)
        return {
          state: { first: id, second: null },
          prompt: { message: "Perfil seleccionado. Designe la trayectoria", options: [] },
          accepts: CAD_ACCEPT_ENTITY_PICK,
        };
      return {
        state: { first: state.first, second: id },
        prompt: { message: "Dos curvas. Pulse Intro para crear la superficie tabulada", options: [] },
        accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
      };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe curvas o pulse Intro", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };

    if (!state.first || !state.second)
      return solidMessage(state, "TABSURF necesita una curva de perfil y una trayectoria.");
    const profileEntity = context.entity?.(state.first);
    const pathEntity = context.entity?.(state.second);
    if (!profileEntity || !pathEntity)
      return solidMessage(state, "TABSURF: no se encontraron las curvas.");

    const profilePts = sampleCurve3D(profileEntity);
    if (typeof profilePts === "string") return solidMessage(state, `TABSURF: perfil — ${profilePts}`);
    const pathPts = sampleCurve3D(pathEntity);
    if (typeof pathPts === "string") return solidMessage(state, `TABSURF: trayectoria — ${pathPts}`);

    // El vector director es EXTREMO A EXTREMO de la trayectoria, en 3D — no sólo
    // en planta: es lo que hace TABSURF cuando la trayectoria sube o baja.
    const path0 = pathPts[0];
    const path1 = pathPts[pathPts.length - 1];
    const dir = { x: path1.x - path0.x, y: path1.y - path0.y, z: path1.z - path0.z };
    if (Math.hypot(dir.x, dir.y, dir.z) <= 1e-9)
      return solidMessage(state, "TABSURF: la trayectoria tiene longitud cero, no define ninguna dirección.");

    const rowA = profilePts;
    const rowB = profilePts.map((p) => ({ x: p.x + dir.x, y: p.y + dir.y, z: p.z + dir.z }));

    const grid = thinGridSolid([rowA, rowB], SURFACE_THICKNESS);
    if (!grid.ok) return solidMessage(state, `TABSURF: ${grid.reason}`);

    const node: CadSolidNode = { id: "tabulada", op: "brep", points: grid.solid.points, faces: grid.solid.faces };
    const solid = makeSolidEntity(context.newEntityId(), [node], "tabulada", context.activeLayer);

    const pathLen = segmentLength3D(pathPts);
    return finishedSolid(solid, {
      state: { first: null, second: null },
      label: "TABSURF",
      notice: `Superficie tabulada creada (${profilePts.length} secciones, trayectoria ${formatMagnitude(pathLen)} mm).`,
    });
  },
};

// --- REVSURF: superficie de revolución alrededor de un EJE 3D -------------------

interface RevolveState {
  profile: string | null;
  axis: string | null;
  startDeg: number | null;
}

const REVSURF_SEGMENTS = 32;

interface AxisRevolveSetup {
  profile: CadSolidProfile;
  frame: CadSolidFrame;
}

/**
 * Reexpresa un perfil 3D en coordenadas (radial, axial) de un eje 3D
 * cualquiera (dos puntos, no necesariamente horizontal ni vertical).
 *
 * Se niega, con el motivo, en dos casos que no son «casi bien»:
 *   · el perfil no es plano respecto al eje (girarlo no sería una revolución
 *     simple: cada punto describiría una hélice, no un círculo);
 *   · el perfil cruza el eje (el sólido se atravesaría a sí mismo al girar).
 */
function revolveSetupFromAxis(
  profilePts: readonly CadPoint3[],
  axisStart: CadPoint3,
  axisEnd: CadPoint3,
): { ok: true; setup: AxisRevolveSetup } | { ok: false; reason: string } {
  const origin = vec3(axisStart.x, axisStart.y, axisStart.z);
  const axisVec = v3Sub(vec3(axisEnd.x, axisEnd.y, axisEnd.z), origin);
  const axisLen = v3Length(axisVec);
  if (!(axisLen > 1e-9)) return { ok: false, reason: "el eje necesita dos puntos distintos." };
  const zAxis = v3Scale(axisVec, 1 / axisLen);

  const radialOf = (p: CadPoint3): { t: number; r: Vec3; dist: number } => {
    const pv = vec3(p.x, p.y, p.z);
    const rel = v3Sub(pv, origin);
    const t = v3Dot(rel, zAxis);
    const foot = v3Add(origin, v3Scale(zAxis, t));
    const r = v3Sub(pv, foot);
    return { t, r, dist: v3Length(r) };
  };
  const radials = profilePts.map(radialOf);

  let farthest = radials[0];
  for (const rad of radials) if (rad.dist > farthest.dist) farthest = rad;
  const scale = Math.max(1, ...profilePts.flatMap((p) => [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)]));
  const tol = 1e-6 * scale;
  if (!(farthest.dist > tol))
    return { ok: false, reason: "el perfil coincide con el eje de revolución: no hay radio que girar." };
  const xAxis = v3Scale(farthest.r, 1 / farthest.dist);

  const outOfPlaneRaw = v3Cross(zAxis, xAxis);
  const outOfPlaneLen = v3Length(outOfPlaneRaw);
  const outOfPlaneAxis = outOfPlaneLen > 1e-12 ? v3Scale(outOfPlaneRaw, 1 / outOfPlaneLen) : vec3(0, 0, 1);
  for (let i = 0; i < profilePts.length; i += 1) {
    const deviation = v3Dot(radials[i].r, outOfPlaneAxis);
    if (Math.abs(deviation) > tol) {
      return {
        ok: false,
        reason:
          `el perfil no es plano respecto al eje: el punto ${i} se aparta ${deviation.toExponential(2)} mm ` +
          "del plano eje-radio. Revolucionar un perfil que no es plano no es una revolución simple.",
      };
    }
  }

  const outer = profilePts.map((_, i) => ({ x: v3Dot(radials[i].r, xAxis), y: radials[i].t }));
  const crossing = outer.find((point) => point.x < -tol);
  if (crossing)
    return {
      ok: false,
      reason: `el perfil cruza el eje de revolución (radio ${crossing.x.toFixed(4)} mm): el sólido se atravesaría a sí mismo.`,
    };

  return {
    ok: true,
    setup: {
      profile: { outer: outer.map((point) => ({ x: Math.max(0, point.x), y: point.y })) },
      frame: {
        origin: { x: origin.x, y: origin.y, z: origin.z },
        zAxis: { x: zAxis.x, y: zAxis.y, z: zAxis.z },
        xAxis: { x: xAxis.x, y: xAxis.y, z: xAxis.z },
      },
    },
  };
}

function revolveResult(
  state: RevolveState,
  startDeg: number,
  sweepDeg: number,
  context: CadCommandContext,
) {
  if (!state.profile || !state.axis) return solidMessage(state, "REVSURF necesita una curva de perfil y un eje.");
  const profileEntity = context.entity?.(state.profile);
  const axisEntity = context.entity?.(state.axis);
  if (!profileEntity || !axisEntity) return solidMessage(state, "REVSURF: no se encontraron las curvas.");

  const profilePts = sampleCurve3D(profileEntity);
  if (typeof profilePts === "string") return solidMessage(state, `REVSURF: perfil — ${profilePts}`);
  const axisPts = sampleCurve3D(axisEntity);
  if (typeof axisPts === "string") return solidMessage(state, `REVSURF: eje — ${axisPts}`);

  const setupResult = revolveSetupFromAxis(profilePts, axisPts[0], axisPts[axisPts.length - 1]);
  if (!setupResult.ok) return solidMessage(state, `REVSURF: ${setupResult.reason}`);
  if (!(sweepDeg !== 0))
    return solidMessage(state, "REVSURF: el ángulo de revolución no puede ser cero.");

  const { profile, frame } = setupResult.setup;
  // El ángulo inicial gira la referencia radial ANTES de barrer: es lo que
  // separa «empezar a girar desde el perfil» de «empezar 30° más allá».
  const zAxisVec = vec3(frame.zAxis.x, frame.zAxis.y, frame.zAxis.z);
  const xAxisVec = vec3(frame.xAxis!.x, frame.xAxis!.y, frame.xAxis!.z);
  const rotatedXAxis =
    startDeg === 0 ? xAxisVec : v3RotateAroundAxis(xAxisVec, zAxisVec, (startDeg * Math.PI) / 180);

  const node: CadSolidNode = {
    id: "revolucion",
    op: "revolve",
    profile,
    frame: { origin: frame.origin, zAxis: frame.zAxis, xAxis: { x: rotatedXAxis.x, y: rotatedXAxis.y, z: rotatedXAxis.z } },
    angleRad: (sweepDeg * Math.PI) / 180,
    segments: REVSURF_SEGMENTS,
  };
  const solid = makeSolidEntity(context.newEntityId(), [node], "revolucion", context.activeLayer);
  return finishedSolid(solid, {
    state: { profile: null, axis: null, startDeg: null },
    label: "REVSURF",
    notice: `Superficie de revolución creada (inicio ${formatMagnitude(startDeg)}°, barrido ${formatMagnitude(sweepDeg)}°, ${REVSURF_SEGMENTS} facetas).`,
  });
}

const revsurfCommand: CadCommandDescriptor<RevolveState> = {
  name: "REVSURF",
  aliases: ["RSURFACE", "SUPERFICIEREVOLUCION"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length >= 2
      ? { profile: context.selection[0], axis: context.selection[1], startDeg: null }
      : context.selection.length === 1
        ? { profile: context.selection[0], axis: null, startDeg: null }
        : { profile: null, axis: null, startDeg: null },
    prompt: {
      message: context.selection.length >= 2
        ? "Perfil y eje seleccionados. Precise el ángulo inicial"
        : "Designe la curva de perfil",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "REVSURF cancelado.");
    if (input.kind === "entityPick" || input.kind === "selection") {
      const id = input.kind === "entityPick" ? input.entityId : input.entityIds[0];
      if (!state.profile)
        return {
          state: { profile: id, axis: null, startDeg: null },
          prompt: { message: "Perfil seleccionado. Designe el eje de revolución (dos puntos)", options: [] },
          accepts: CAD_ACCEPT_ENTITY_PICK,
        };
      if (!state.axis)
        return {
          state: { profile: state.profile, axis: id, startDeg: null },
          prompt: { message: "Precise el ángulo inicial", options: [], defaultValue: "0" },
          accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE,
        };
      return { state, prompt: { message: "Precise el ángulo inicial", options: [], defaultValue: "0" }, accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE };
    }

    if (!state.profile || !state.axis) {
      if (input.kind === "enter" || input.kind === "text")
        return solidMessage(state, "REVSURF necesita una curva de perfil y un eje.");
      return { state, prompt: { message: "Designe curvas o pulse Intro", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
    }

    if (state.startDeg === null) {
      if (input.kind === "angle") return { state: { ...state, startDeg: input.degrees }, prompt: { message: "Precise el ángulo de revolución (barrido)", options: [], defaultValue: "360" }, accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE };
      if (input.kind === "distance") return { state: { ...state, startDeg: input.value }, prompt: { message: "Precise el ángulo de revolución (barrido)", options: [], defaultValue: "360" }, accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE };
      if (input.kind === "enter") return { state: { ...state, startDeg: 0 }, prompt: { message: "Precise el ángulo de revolución (barrido)", options: [], defaultValue: "360" }, accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE };
      return { state, prompt: { message: "Precise el ángulo inicial", options: [], defaultValue: "0" }, accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE };
    }

    if (input.kind === "angle") return revolveResult(state, state.startDeg, input.degrees, context);
    if (input.kind === "distance") return revolveResult(state, state.startDeg, input.value, context);
    if (input.kind === "enter") return revolveResult(state, state.startDeg, 360, context);
    return { state, prompt: { message: "Precise el ángulo de revolución (barrido)", options: [], defaultValue: "360" }, accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE };
  },
};

// --- EDGESURF: parche de Coons entre cuatro bordes que forman un lazo ----------

interface EdgeState {
  edges: string[];
}

/** Resolución fija de la rejilla bilineal, en cada dirección paramétrica. */
const EDGESURF_GRID = 9;
const EDGE_MATCH_TOLERANCE = 1e-4;

/**
 * Ordena cuatro curvas en un LAZO: cada una se orienta para que su final
 * empalme con el principio de la siguiente. No asume que se designaron en
 * orden — sólo que, TOMADAS COMO CONJUNTO, forman un contorno cerrado — y
 * se niega, diciendo la separación en mm, si dos no empalman.
 */
function orderEdgeLoop(
  curves: readonly CadPoint3[][],
): { ok: true; loop: CadPoint3[][] } | { ok: false; reason: string } {
  const remaining = curves.slice(1).map((points, index) => ({ points, index: index + 1 }));
  const loop: CadPoint3[][] = [curves[0]];
  let currentEnd = curves[0][curves[0].length - 1];
  while (remaining.length > 0) {
    let bestPos = -1;
    let bestFlip = false;
    let bestDist = Infinity;
    for (let k = 0; k < remaining.length; k += 1) {
      const candidate = remaining[k].points;
      const dStart = distance3D(currentEnd, candidate[0]);
      const dEnd = distance3D(currentEnd, candidate[candidate.length - 1]);
      if (dStart < bestDist) { bestDist = dStart; bestPos = k; bestFlip = false; }
      if (dEnd < bestDist) { bestDist = dEnd; bestPos = k; bestFlip = true; }
    }
    if (bestDist > EDGE_MATCH_TOLERANCE) {
      return { ok: false, reason: `un borde no empalma con el anterior (separados ${bestDist.toFixed(4)} mm)` };
    }
    const picked = remaining[bestPos].points;
    const oriented = bestFlip ? picked.slice().reverse() : picked;
    loop.push(oriented);
    currentEnd = oriented[oriented.length - 1];
    remaining.splice(bestPos, 1);
  }
  const closingGap = distance3D(currentEnd, loop[0][0]);
  if (closingGap > EDGE_MATCH_TOLERANCE) {
    return { ok: false, reason: `los cuatro bordes no cierran el lazo (separados ${closingGap.toFixed(4)} mm)` };
  }
  return { ok: true, loop };
}

function lerpPoint(a: CadPoint3, b: CadPoint3, t: number): CadPoint3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * Parche de Coons bilineal: cada punto de la rejilla es la suma de las dos
 * reglas (entre bordes opuestos) menos la interpolación bilineal de las
 * cuatro esquinas, que es la corrección clásica para que el parche pase
 * EXACTAMENTE por los cuatro bordes y no sólo por sus esquinas.
 */
function coonsGrid(bottom: CadPoint3[], top: CadPoint3[], left: CadPoint3[], right: CadPoint3[]): CadPoint3[][] {
  const nu = bottom.length;
  const nv = left.length;
  const p00 = bottom[0];
  const p10 = bottom[nu - 1];
  const p01 = top[0];
  const p11 = top[nu - 1];
  const grid: CadPoint3[][] = [];
  for (let i = 0; i < nv; i += 1) {
    const v = i / (nv - 1);
    const row: CadPoint3[] = [];
    for (let j = 0; j < nu; j += 1) {
      const u = j / (nu - 1);
      const ruled = lerpPoint(bottom[j], top[j], v);
      const ruled2 = lerpPoint(left[i], right[i], u);
      const corner = lerpPoint(lerpPoint(p00, p10, u), lerpPoint(p01, p11, u), v);
      row.push({
        x: ruled.x + ruled2.x - corner.x,
        y: ruled.y + ruled2.y - corner.y,
        z: ruled.z + ruled2.z - corner.z,
      });
    }
    grid.push(row);
  }
  return grid;
}

const edgesurfCommand: CadCommandDescriptor<EdgeState> = {
  name: "EDGESURF",
  aliases: ["ESURF", "SUPERFICIEBORDE"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: { edges: [...context.selection] },
    prompt: {
      message: context.selection.length >= 4
        ? "Cuatro bordes seleccionados. Pulse Intro para crear la superficie"
        : `Designe el borde ${context.selection.length + 1} de 4`,
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "EDGESURF cancelado.");
    if (input.kind === "entityPick" || input.kind === "selection") {
      const id = input.kind === "entityPick" ? input.entityId : input.entityIds[0];
      const edges = [...state.edges, id];
      if (edges.length < 4) {
        return {
          state: { edges },
          prompt: { message: `Designe el borde ${edges.length + 1} de 4`, options: [] },
          accepts: CAD_ACCEPT_ENTITY_PICK,
        };
      }
      return {
        state: { edges },
        prompt: { message: "Cuatro bordes. Pulse Intro para crear la superficie", options: [] },
        accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
      };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: `Designe el borde ${state.edges.length + 1} de 4`, options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };

    if (state.edges.length < 4)
      return solidMessage(state, "EDGESURF necesita cuatro curvas de borde.");

    const curves: CadPoint3[][] = [];
    for (const eid of state.edges.slice(0, 4)) {
      const e = context.entity?.(eid);
      if (!e) return solidMessage(state, `EDGESURF: no se encontró la curva ${eid}.`);
      const pts = sampleCurve3D(e);
      if (typeof pts === "string") return solidMessage(state, `EDGESURF: borde — ${pts}`);
      curves.push(pts);
    }

    const ordered = orderEdgeLoop(curves);
    if (!ordered.ok)
      return solidMessage(state, `EDGESURF: ${ordered.reason}; los cuatro bordes tienen que formar un contorno cerrado.`);
    const [bottomRaw, rightRaw, topReversedRaw, leftReversedRaw] = ordered.loop;
    const bottom = resample3D(bottomRaw, EDGESURF_GRID);
    const top = resample3D(topReversedRaw.slice().reverse(), EDGESURF_GRID);
    const right = resample3D(rightRaw, EDGESURF_GRID);
    const left = resample3D(leftReversedRaw.slice().reverse(), EDGESURF_GRID);

    const grid = coonsGrid(bottom, top, left, right);
    const solidGrid = thinGridSolid(grid, SURFACE_THICKNESS);
    if (!solidGrid.ok) return solidMessage(state, `EDGESURF: ${solidGrid.reason}`);

    const node: CadSolidNode = { id: "borde", op: "brep", points: solidGrid.solid.points, faces: solidGrid.solid.faces };
    const solid = makeSolidEntity(context.newEntityId(), [node], "borde", context.activeLayer);

    return finishedSolid(solid, {
      state: { edges: [] },
      label: "EDGESURF",
      notice: `Superficie de borde creada (parche de Coons, rejilla ${EDGESURF_GRID}×${EDGESURF_GRID}).`,
    });
  },
};

export const CAD_RULED_SURFACE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(rulesurfCommand),
  asCadCommand(tabsurfCommand),
  asCadCommand(revsurfCommand),
  asCadCommand(edgesurfCommand),
];
