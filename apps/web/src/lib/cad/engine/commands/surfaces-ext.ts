/**
 * Extensiones de la familia Superficies: SURFPATCH, SURFNETWORK, SURFBLEND,
 * SURFEXTEND y SURFFILLET.
 *
 * SURFBLEND y SURFFILLET fingían: la auditoría del 19-sep midió que las dos
 * devolvían el RECTÁNGULO ENVOLVENTE de las dos superficies designadas,
 * extruido 0,001 mm — una mezcla o un filete de verdad exige resolver la
 * curva de intersección entre las dos superficies y ajustar una franja con
 * continuidad tangente (G1) a lo largo de ella, y eso no está en
 * `lib/brep/` (que sólo sabe redondear ARISTAS de un mismo sólido,
 * `FILLETEDGE`). En vez de fingir el envolvente, las dos SE NIEGAN diciendo
 * qué falta: ningún sólido se escribe.
 *
 * SURFNETWORK y SURFEXTEND fingían igual —la misma caja envolvente— hasta la
 * ola 7 (2026-09-20): ahora construyen geometría REAL (`surfaces-mesh.ts`),
 * con el límite exacto de lo que esa geometría sabe hacer dicho en su propia
 * cabecera en vez de disfrazado de caja.
 *
 * Extraído de `surfaces.ts` para respetar el presupuesto de monolito (800 líneas).
 */
import type { CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadSolidProfile } from "../../cad-entities-v5";
import { bodyToFaceSpecs } from "../../../brep/body-builder";
import { makeFrame, worldToFrame } from "../../../brep/surfaces";
import { newellNormal } from "../../../brep/topology";
import { v3Length } from "../../../brep/vec3";
import { solid3dBody } from "../../solid3d-build";
import { offsetPlanarPolygonOutward, resampleOpenPolylineByArcLength, ruledShellMesh } from "./surfaces-mesh";
import {
  asCadCommand,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
} from "../command-types";
import {
  finishedSolid,
  formatMagnitude,
  makeSolidEntity,
  selectedEntities,
  solidMessage,
} from "./solids-support";

const SURFACE_THICKNESS = 0.001;

type SurfaceExtState = { selection: readonly string[] };

const surfpatchCommand: CadCommandDescriptor<SurfaceExtState | null> = {
  name: "SURFPATCH",
  aliases: ["SPATCH", "PARCHE"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length > 0 ? { selection: context.selection } : null,
    prompt: {
      message:
        context.selection.length > 0
          ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro para parchear`
          : "Designe el contorno cerrado para crear el parche de superficie",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "SURFPATCH cancelado.");
    if (input.kind === "selection")
      return {
        state: { selection: input.entityIds },
        prompt: { message: `${input.entityIds.length} entidad(es). Pulse Intro para parchear`, options: [] },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    if (input.kind === "entityPick") {
      const prev = state?.selection ?? [];
      return {
        state: { selection: [...prev, input.entityId] },
        prompt: { message: `${prev.length + 1} entidad(es). Pulse Intro`, options: [] },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe entidades o pulse Intro", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };

    const ids = state?.selection ?? [];
    if (ids.length === 0) return solidMessage(state, "SURFPATCH necesita al menos una entidad de contorno.");
    const entities = selectedEntities(context, ids);
    if (entities.length === 0) return solidMessage(state, "SURFPATCH: no se encontraron las entidades designadas.");
    if (entities[0].type !== "polyline" || !("vertices" in entities[0]))
      return solidMessage(state, "SURFPATCH requiere una polilinea como contorno.");
    const verts = (entities[0] as { vertices: CadPoint3[] }).vertices;
    if (verts.length < 3) return solidMessage(state, "La polilinea tiene menos de 3 vertices.");

    // El plano del parche es el de la polilínea REAL, no el plano XY: dos
    // esquinas a distinta Z ya no se aplastan en silencio.
    const normalRaw = newellNormal(verts);
    if (!(v3Length(normalRaw) > 1e-9))
      return solidMessage(state, "SURFPATCH: el contorno es degenerado (sus vértices son colineales o coincidentes).");
    const frame = makeFrame(verts[0], normalRaw);
    const scale = Math.max(1, ...verts.flatMap((v) => [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)]));
    const tol = 1e-6 * scale;
    for (let i = 0; i < verts.length; i += 1) {
      const local = worldToFrame(frame, verts[i]);
      if (Math.abs(local.z) > tol) {
        return solidMessage(
          state,
          `SURFPATCH: el contorno no es plano — el vértice ${i} se aparta ${local.z.toExponential(2)} mm del ` +
            "plano de los demás. Un parche sólo puede rellenar un contorno plano; recorte o proyecte la polilínea primero.",
        );
      }
    }
    const profile: CadSolidProfile = { outer: verts.map((v) => worldToFrame(frame, v)).map(({ x, y }) => ({ x, y })) };
    const solid = makeSolidEntity(
      context.newEntityId(),
      [{
        id: "parche",
        op: "extrude",
        profile,
        height: SURFACE_THICKNESS,
        frame: { origin: frame.origin, zAxis: frame.zAxis, xAxis: frame.xAxis },
      }],
      "parche",
      context.activeLayer,
    );
    return finishedSolid(solid, {
      state: undefined as never,
      label: "SURFPATCH",
      notice: `Parche de superficie creado (${profile.outer.length} vertices, en su plano real).`,
    });
  },
};

const surfnetworkCommand: CadCommandDescriptor<SurfaceExtState | null> = {
  name: "SURFNETWORK",
  aliases: ["SNETWORK", "RED"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length > 0 ? { selection: context.selection } : null,
    prompt: {
      message:
        context.selection.length > 0
          ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro para crear la red`
          : "Designe las curvas de la red (minimo dos polilineas)",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "SURFNETWORK cancelado.");
    if (input.kind === "selection")
      return {
        state: { selection: input.entityIds },
        prompt: { message: `${input.entityIds.length} entidad(es). Pulse Intro`, options: [] },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    if (input.kind === "entityPick") {
      const picked = context.entity?.(input.entityId);
      if (picked && (picked.type !== "polyline" || !("vertices" in picked)))
        return solidMessage(state, "SURFNETWORK: solo se aceptan polilineas para la red.");
      const prev = state?.selection ?? [];
      return {
        state: { selection: [...prev, input.entityId] },
        prompt: { message: `${prev.length + 1} entidad(es). Pulse Intro`, options: [] },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe curvas o pulse Intro", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };

    const ids = state?.selection ?? [];
    if (ids.length < 2) return solidMessage(state, "SURFNETWORK necesita al menos dos curvas.");
    const entities = selectedEntities(context, ids);
    if (entities.length < 2) return solidMessage(state, "SURFNETWORK: no se encontraron suficientes curvas.");
    const rawRails: CadPoint3[][] = [];
    for (const e of entities) {
      if (e.type !== "polyline" || !("vertices" in e))
        return solidMessage(state, "SURFNETWORK: solo se aceptan polilineas para la red.");
      const verts = (e as { vertices: CadPoint3[] }).vertices;
      if (verts.length < 2) return solidMessage(state, "SURFNETWORK: una curva tiene menos de 2 vertices.");
      rawRails.push(verts);
    }
    // Se remuestrea TODA la red al mayor número de vértices de sus rieles: es
    // la correspondencia por longitud de arco (como `loftProfiles`), no por
    // índice, así que dos rieles con distinto número de tramos siguen
    // reglándose sin torcerse.
    const samples = Math.max(8, Math.min(48, ...rawRails.map((r) => r.length)));
    const rails = rawRails.map((r) => resampleOpenPolylineByArcLength(r, samples));
    const mesh = ruledShellMesh(rails, SURFACE_THICKNESS);
    if ("error" in mesh) return solidMessage(state, `SURFNETWORK: ${mesh.error}`);
    const solid = makeSolidEntity(
      context.newEntityId(),
      [{ id: "red", op: "brep", points: mesh.points, faces: mesh.faces }],
      "red",
      context.activeLayer,
    );
    return finishedSolid(solid, {
      state: undefined as never,
      label: "SURFNETWORK",
      notice:
        `Superficie reglada creada (${entities.length} curvas, ${samples} puntos por riel) — solevado LINEAL entre ` +
        "rieles consecutivos, no la red bidireccional de Gordon con curvas cruzadas.",
    });
  },
};

// --- SURFBLEND: transición entre dos superficies ---

type SurfblendState = { first: string | null; second: string | null };

const surfblendCommand: CadCommandDescriptor<SurfblendState> = {
  name: "SURFBLEND",
  aliases: ["SBLEND", "MEZCLARSUPERF"],
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
        ? "Dos superficies seleccionadas. Pulse Intro para mezclar"
        : "Designe la primera superficie",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "SURFBLEND cancelado.");
    if (input.kind === "entityPick" || input.kind === "selection") {
      const id = input.kind === "entityPick" ? input.entityId : input.entityIds[0];
      if (!state.first) return { state: { first: id, second: null }, prompt: { message: "Primera superficie seleccionada. Designe la segunda", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK };
      return { state: { first: state.first, second: id }, prompt: { message: "Dos superficies. Pulse Intro para mezclar", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe superficies o pulse Intro", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
    if (!state.first || !state.second) return solidMessage(state, "SURFBLEND necesita dos superficies.");
    const first = context.entity?.(state.first);
    const second = context.entity?.(state.second);
    if (!first || first.type !== "solid3d") return solidMessage(state, "SURFBLEND: la primera entidad no es un solido 3D.");
    if (!second || second.type !== "solid3d") return solidMessage(state, "SURFBLEND: la segunda entidad no es un solido 3D.");
    // No se escribe NADA: no hay con qué. Una mezcla de verdad necesita la
    // curva de intersección entre las dos caras y una franja tangente (G1) a
    // lo largo de ella; el kernel B-rep sólo redondea aristas de un mismo
    // sólido (FILLETEDGE), no la costura entre dos sólidos independientes. El
    // rectángulo envolvente que esta orden devolvía antes no era una mezcla:
    // se ha quitado en vez de disfrazarlo.
    return solidMessage(
      state,
      "SURFBLEND no mezcló nada: hace falta la curva de intersección entre las dos superficies y una franja con " +
        "continuidad tangente (G1) a lo largo de ella, y el núcleo B-rep todavía no la resuelve — sólo redondea " +
        "aristas de un mismo sólido (FILLETEDGE). Antes esta orden devolvía el rectángulo envolvente de las dos " +
        "superficies; eso no era una mezcla, así que se ha quitado.",
    );
  },
};

// --- SURFEXTEND: extensión de superficie ---

type SurfextendState = { selection: readonly string[]; distance: number | null };

const surfextendCommand: CadCommandDescriptor<SurfextendState | null> = {
  name: "SURFEXTEND",
  aliases: ["SEXTEND", "EXTENDERSUPERF"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length > 0 ? { selection: context.selection, distance: null } : null,
    prompt: {
      message: context.selection.length > 0
        ? `${context.selection.length} entidad(es). Escriba la distancia de extension`
        : "Designe la superficie a extender",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_DISTANCE,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "SURFEXTEND cancelado.");
    if (input.kind === "selection")
      return { state: { selection: input.entityIds, distance: null }, prompt: { message: `${input.entityIds.length} entidad(es). Escriba la distancia`, options: [] }, accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_ENTITY_PICK };
    if (input.kind === "entityPick") {
      const picked = context.entity?.(input.entityId);
      if (picked && picked.type !== "solid3d")
        return solidMessage(state, "SURFEXTEND: solo se aceptan solidos 3D.");
      const prev = state?.selection ?? [];
      return { state: { selection: [...prev, input.entityId], distance: null }, prompt: { message: `${prev.length + 1} entidad(es). Escriba la distancia`, options: [] }, accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_ENTITY_PICK };
    }
    if (input.kind === "distance") {
      return { state: { selection: state?.selection ?? [], distance: input.value }, prompt: { message: `Extension de ${formatMagnitude(input.value)}. Pulse Intro`, options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe entidades o escriba distancia", options: [] }, accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_ENTITY_PICK };
    const ids = state?.selection ?? [];
    if (ids.length === 0) return solidMessage(state, "SURFEXTEND necesita al menos una entidad.");
    const entities = selectedEntities(context, ids);
    if (entities.length === 0) return solidMessage(state, "SURFEXTEND: no se encontraron las entidades.");
    const entity = entities[0];
    if (entity.type !== "solid3d") return solidMessage(state, "SURFEXTEND: solo se aceptan solidos 3D.");
    const body = solid3dBody(entity as never);
    if (body.faces.length === 0) return solidMessage(state, "SURFEXTEND: el solido no tiene caras.");
    const dist = state?.distance ?? 10;
    if (!(dist > 0))
      return solidMessage(state, "SURFEXTEND necesita una distancia positiva; para encoger el contorno use TRIM/SURFTRIM.");
    // La "superficie" es normalmente un sólido delgado (convención SURFPATCH/
    // SURFNETWORK): su cara de MAYOR área es la que de verdad se prolonga.
    // Con caras empatadas en área (un cubo, por ejemplo) la elección es
    // arbitraria pero determinista — AutoCAD desambigua pidiendo la ARISTA a
    // extender; esta orden sólo recibe sólido + distancia, así que hasta que
    // acepte esa designación explícita, "la mayor" es la mejor respuesta que
    // puede dar sin preguntar.
    let best: { points: { x: number; y: number; z: number }[]; normal: { x: number; y: number; z: number }; area: number } | null = null;
    for (const spec of bodyToFaceSpecs(body)) {
      const loop = spec.outer.map((index) => body.vertices[index].point);
      const normal = newellNormal(loop);
      const area = v3Length(normal) / 2;
      if (!best || area > best.area) best = { points: loop, normal, area };
    }
    if (!best || best.area < 1e-9) return solidMessage(state, "SURFEXTEND: el sólido no tiene una cara con área.");
    const frame = makeFrame(best.points[0], best.normal);
    const local = best.points.map((p) => worldToFrame(frame, p)).map(({ x, y }) => ({ x, y }));
    const offsetProfile = offsetPlanarPolygonOutward(local, dist);
    if (!offsetProfile)
      return solidMessage(
        state,
        "SURFEXTEND: el contorno de la cara no es convexo (o esta distancia invierte una esquina); " +
          "el desplazamiento del contorno sólo está resuelto para contornos convexos.",
      );
    const profile: CadSolidProfile = { outer: offsetProfile };
    const solid = makeSolidEntity(
      context.newEntityId(),
      [{ id: "extendida", op: "extrude", profile, height: SURFACE_THICKNESS, frame: { origin: frame.origin, zAxis: frame.zAxis, xAxis: frame.xAxis } }],
      "extendida",
      context.activeLayer,
    );
    return finishedSolid(solid, {
      state: undefined as never,
      label: "SURFEXTEND",
      notice: `Superficie extendida ${formatMagnitude(dist)} mm en su propio plano, tangente por construcción.`,
    });
  },
};

// --- SURFFILLET: filete de transición entre dos superficies ---

type SurffilletState = { first: string | null; second: string | null; radius: number | null };

const surffilletCommand: CadCommandDescriptor<SurffilletState> = {
  name: "SURFFILLET",
  aliases: ["SFILLET", "FILETESUPERF"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length >= 2
      ? { first: context.selection[0], second: context.selection[1], radius: null }
      : context.selection.length === 1
        ? { first: context.selection[0], second: null, radius: null }
        : { first: null, second: null, radius: null },
    prompt: {
      message: context.selection.length >= 2
        ? "Dos superficies. Escriba el radio del filete"
        : "Designe la primera superficie",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_DISTANCE,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "SURFFILLET cancelado.");
    if (input.kind === "entityPick" || input.kind === "selection") {
      const id = input.kind === "entityPick" ? input.entityId : input.entityIds[0];
      if (!state.first) return { state: { first: id, second: null, radius: null }, prompt: { message: "Primera superficie seleccionada. Designe la segunda", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_DISTANCE };
      if (!state.second) return { state: { first: state.first, second: id, radius: null }, prompt: { message: "Dos superficies. Escriba el radio del filete", options: [] }, accepts: CAD_ACCEPT_DISTANCE };
      return { state, prompt: { message: `Radio ${formatMagnitude(state.radius ?? 5)}. Pulse Intro`, options: [] }, accepts: CAD_ACCEPT_DISTANCE };
    }
    if (input.kind === "distance") {
      return { state: { ...state, radius: input.value }, prompt: { message: `Radio ${formatMagnitude(input.value)}. Pulse Intro`, options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe superficies o escriba radio", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_DISTANCE };
    if (!state.first || !state.second) return solidMessage(state, "SURFFILLET necesita dos superficies.");
    const first = context.entity?.(state.first);
    const second = context.entity?.(state.second);
    if (!first || first.type !== "solid3d") return solidMessage(state, "SURFFILLET: la primera entidad no es un solido 3D.");
    if (!second || second.type !== "solid3d") return solidMessage(state, "SURFFILLET: la segunda entidad no es un solido 3D.");
    const radius = state.radius ?? 5;
    // Mismo límite que SURFBLEND, con el radio pedido pero sin usar: un filete
    // de verdad entre dos superficies independientes necesita su curva de
    // intersección para saber POR DÓNDE pasa la transición tangente, y esa
    // intersección superficie-superficie no está resuelta en el kernel. El
    // rectángulo envolvente de antes no era un filete — no dependía ni del
    // radio pedido, que es la señal de que no calculaba nada real.
    return solidMessage(
      state,
      `SURFFILLET no redondeó nada: un filete de radio ${formatMagnitude(radius)} entre dos superficies ` +
        "independientes necesita la curva de intersección entre ellas antes de poder trazar la transición " +
        "tangente, y esa intersección superficie-superficie no está resuelta en el núcleo B-rep (que sólo " +
        "redondea aristas YA EXISTENTES de un mismo sólido: use FILLETEDGE si las dos caras son del mismo cuerpo).",
    );
  },
};

export const CAD_SURFACE_EXT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(surfpatchCommand),
  asCadCommand(surfnetworkCommand),
  asCadCommand(surfblendCommand),
  asCadCommand(surfextendCommand),
  asCadCommand(surffilletCommand),
];
