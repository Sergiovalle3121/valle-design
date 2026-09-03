/**
 * PIDROUTE y PIDMTO: la tubería en 3D y la lista de materiales que sale de ella.
 *
 * ## Qué faltaba, medido
 *
 * `docs/competitive/rubric.json`, criterio `toolset-plant3d.tuberia`: *«La
 * tubería está en 2D con su número, servicio y especificación… el ruteo 3D por
 * especificación y la generación de isométricos no existen.»* Con la primera
 * mitad de la Ola 6, `toolset-plant3d` quedó en 2/4 justo por esto.
 *
 * ## La cota se TECLEA, y por eso la ruta es 3D de verdad
 *
 * Una tubería no vive en el suelo: arranca a +3.000 y baja a +500 para pasar
 * bajo una viga. La orden pregunta la elevación de arranque y ofrece
 * `Elevación` en cada punto: cambiarla mete un TRAMO VERTICAL —el montante— en
 * el sitio, que es exactamente lo que se construye. Sin eso, «3D» sería una
 * polilínea plana con una etiqueta que dice 3D, y este producto tiene una regla
 * contra justo eso.
 *
 * El comando se declara `spatial: true` porque conserva la cota de punta a
 * punta: cada vértice que escribe lleva su z, y el montante la cambia a
 * propósito.
 *
 * ## Por especificación, sin transcribir la de nadie
 *
 * La ruta arrastra `pl:especificacion` y la lista de materiales la repite en
 * cada renglón. Lo que se comprueba es lo universal —que una línea no cambie de
 * especificación a mitad, que un codo sea de un ángulo que se compra, que no
 * haya tramos de longitud cero, que una ruta que quedó toda a la misma cota lo
 * diga—; contra el catálogo del proyecto no se comprueba, y se dice.
 */
import type { CadPoint3 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  cadFormatPlantLine,
  cadNextPlantLineNumber,
  cadParsePlantLine,
  cadPlantLineMetadata,
} from "../../plant/line-numbers";
import {
  CAD_PL_ROUTE,
  CAD_PL_ROUTE_LAYER,
  CAD_PL_ROUTE_MARK,
  cadPipeRouteFindings,
  cadPipeRoutesOf,
} from "../../plant/pipe-route";
import { CAD_PL_MTO_LIMITS, cadPipeMto } from "../../plant/pipe-mto";
import { cadPointZ } from "../spatial-point";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const say = (text: string): CadCommandStep<never> => ({
  state: undefined as never,
  prompt: { message: "", options: [] },
  accepts: 0,
  result: { kind: "message", text },
});

function entitiesOf(context: CadCommandContext) {
  if (!context.entity) return null;
  return context.entityIds
    .map((id) => context.entity!(id))
    .filter((entity): entity is NonNullable<ReturnType<NonNullable<CadCommandContext["entity"]>>> => !!entity);
}

const ELEVATION = { keyword: "Elevación", shortcut: "E" } as const;

interface RouteState {
  size: string | null;
  service: string | null;
  spec: string | null;
  /** La cota actual, en unidades de dibujo. Se fija al arrancar y cambia con `Elevación`. */
  elevation: number | null;
  points: CadPoint3[];
  /** `true` mientras se espera la nueva cota tras pedir `Elevación`. */
  askingElevation: boolean;
}

function routeStep(state: RouteState): CadCommandStep<RouteState> {
  if (!state.size)
    return {
      state,
      prompt: { message: 'Diámetro nominal, con su comilla (6", 1-1/2")', options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (!state.service)
    return {
      state,
      prompt: { message: "Servicio (P proceso, V vapor, A agua…), una a tres letras", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (!state.spec)
    return {
      state,
      prompt: { message: "Especificación de tubería del proyecto (CS150, SS300…)", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (state.elevation === null)
    return {
      state,
      prompt: { message: "Elevación de arranque, Intro para <0>", options: [] },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.askingElevation)
    return {
      state,
      prompt: {
        message: `Nueva elevación (ahora ${Math.round(state.elevation)}); el montante se traza solo`,
        options: [],
      },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  return {
    state,
    prompt: {
      message:
        state.points.length === 0
          ? `Precise el origen de la ruta, a la cota ${Math.round(state.elevation)}`
          : "Precise el siguiente punto, Elevación para subir o bajar, Intro para terminar",
      options: state.points.length === 0 ? [] : [ELEVATION],
    },
    accepts: CAD_ACCEPT_POINT | (state.points.length === 0 ? 0 : CAD_ACCEPT_KEYWORD),
    ...(state.points.length > 0
      ? { preview: [{ points: state.points.map((point) => ({ x: point.x, y: point.y })) }] }
      : {}),
  };
}

function finishRoute(state: RouteState, context: CadCommandContext): CadCommandStep<never> {
  const entities = entitiesOf(context);
  if (!entities)
    return say("PIDROUTE necesita leer el dibujo para numerar: este anfitrión no lo expone.");
  if (state.points.length < 2)
    return say("Una ruta necesita al menos dos puntos: no se tiende un punto de tubería.");

  const number = cadNextPlantLineNumber({ entities }, state.service!);
  const linea = cadFormatPlantLine(state.size!, state.service!, number, state.spec!);
  if (!cadParsePlantLine(linea))
    return say(
      `«${linea}» no es un número de línea válido: revise el diámetro (con su comilla) y el servicio (una a tres letras).`,
    );

  const commands: CadEntityCommand[] = [];
  const layers = context.layers?.();
  if (
    layers &&
    !layers.some(
      (layer) =>
        layer.name.toUpperCase() === CAD_PL_ROUTE_LAYER ||
        layer.id.toUpperCase() === CAD_PL_ROUTE_LAYER,
    )
  )
    commands.push({
      type: "layer",
      op: "upsert",
      layer: {
        id: CAD_PL_ROUTE_LAYER,
        name: CAD_PL_ROUTE_LAYER,
        color: "#38bdf8",
        visible: true,
        locked: false,
      },
    });

  commands.push({
    type: "insert",
    entity: {
      id: context.newEntityId(),
      type: "polyline",
      vertices: state.points.map((point) => ({ x: point.x, y: point.y, z: point.z })),
      closed: false,
      layer: CAD_PL_ROUTE_LAYER,
      context: {
        metadata: {
          ...cadPlantLineMetadata({
            size: state.size!,
            service: state.service!,
            number,
            spec: state.spec!,
          }),
          [CAD_PL_ROUTE]: CAD_PL_ROUTE_MARK,
        },
      },
    } as never,
  });

  const cotas = [...new Set(state.points.map((point) => Math.round(point.z)))].sort(
    (a, b) => a - b,
  );
  const dicho =
    `PIDROUTE: ${linea}, ${state.points.length} punto(s) en ${CAD_PL_ROUTE_LAYER}, ` +
    (cotas.length === 1
      ? `toda a la cota ${cotas[0]}`
      : `cotas de ${cotas[0]} a ${cotas[cotas.length - 1]}`);
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands, label: "PIDROUTE", notice: dicho },
  };
}

const routeCommand: CadCommandDescriptor<RouteState> = {
  name: "PIDROUTE",
  aliases: ["RUTATUBERIA", "ROUTEPIPE"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  // Conserva la cota de punta a punta: cada vértice lleva la suya y el
  // montante la cambia a propósito. Ninguna de sus salidas se aplana, y la
  // frontera del formato está medida aparte: `verification/z-frontiers.spec.ts`
  // apartado 4 hace ida y vuelta por DXF de una polilínea con tres cotas
  // distintas y la lee con un oráculo externo. Declarar `spatial` sin esa
  // vuelta sería prometer una cota que el fichero no guarda.
  spatial: true,
  cursor: "crosshair",
  begin: () =>
    routeStep({
      size: null,
      service: null,
      spec: null,
      elevation: null,
      points: [],
      askingElevation: false,
    }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("PIDROUTE cancelado.");
    if (!state.size) {
      if (input.kind !== "text" || input.value.trim() === "")
        return say('PIDROUTE necesita el diámetro nominal, con su comilla: 6", 1-1/2".');
      return routeStep({ ...state, size: input.value.trim() });
    }
    if (!state.service) {
      if (input.kind !== "text" || input.value.trim() === "")
        return say("PIDROUTE necesita el servicio: sin él, un número no identifica nada.");
      return routeStep({ ...state, service: input.value.trim() });
    }
    if (!state.spec) {
      if (input.kind !== "text" || input.value.trim() === "")
        return say(
          "PIDROUTE necesita la especificación del proyecto: es la que dice qué material se compra.",
        );
      return routeStep({ ...state, spec: input.value.trim() });
    }
    if (state.elevation === null) {
      if (input.kind === "enter") return routeStep({ ...state, elevation: 0 });
      if (input.kind !== "distance") return routeStep(state);
      return routeStep({ ...state, elevation: input.value });
    }
    if (state.askingElevation) {
      if (input.kind === "enter") return routeStep({ ...state, askingElevation: false });
      if (input.kind !== "distance") return routeStep(state);
      const ultimo = state.points[state.points.length - 1];
      if (!ultimo) return routeStep({ ...state, elevation: input.value, askingElevation: false });
      // El MONTANTE: mismo sitio en planta, cota nueva. Es el tramo vertical
      // que se construye, y sale solo porque nadie lo dibuja aparte.
      return routeStep({
        ...state,
        elevation: input.value,
        askingElevation: false,
        points: [...state.points, { x: ultimo.x, y: ultimo.y, z: input.value }],
      });
    }
    if (input.kind === "keyword") {
      if (input.keyword.trim().toLowerCase().startsWith("e"))
        return routeStep({ ...state, askingElevation: true });
      return routeStep(state);
    }
    if (input.kind === "point") {
      // La cota del punto manda si el anfitrión la trae —un plano de trabajo
      // elevado—; si no, la que se tecleó.
      const z = cadPointZ(input.point) ?? state.elevation;
      return routeStep({
        ...state,
        elevation: z,
        points: [...state.points, { x: input.point.x, y: input.point.y, z }],
      });
    }
    if (input.kind === "enter") return finishRoute(state, context);
    return routeStep(state);
  },
};

const FINDING_WORD: Record<string, string> = {
  "especificacion-partida": "ESPECIFICACIÓN PARTIDA",
  "codo-a-medida": "CODO A MEDIDA",
  "ruta-plana": "RUTA SIN DESNIVEL",
  "tramo-nulo": "TRAMO NULO",
};

const mtoCommand: CadCommandDescriptor<never> = {
  name: "PIDMTO",
  aliases: ["LISTAMATERIAL", "PIPEBOM"],
  kind: "inquiry",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: (context) => {
    const entities = entitiesOf(context);
    if (!entities) return say("PIDMTO necesita leer el dibujo: este anfitrión no lo expone.");
    const routes = cadPipeRoutesOf({ entities });
    if (routes.length === 0)
      return say("No hay ninguna ruta de tubería 3D en el dibujo. Tienda una con PIDROUTE.");

    const mto = cadPipeMto({ entities }, { unit: context.unit });
    const renglones = mto.rows.map(
      (fila) =>
        `${fila.description} ${fila.spec}: ${fila.unit === "m" ? fila.quantity.toFixed(2) : fila.quantity} ${fila.unit}`,
    );
    const findings = cadPipeRouteFindings(routes);
    const partes = [
      `${routes.length} ruta(s), ${mto.totalMetres.toFixed(2)} m de tubo`,
      renglones.join(" · "),
    ];
    if (findings.length > 0)
      partes.push(
        findings
          .map((hallazgo) => `${FINDING_WORD[hallazgo.kind] ?? hallazgo.kind}: ${hallazgo.detail}`)
          .join("; "),
      );
    else partes.push("sin hallazgos");
    partes.push(CAD_PL_MTO_LIMITS);
    return say(`PIDMTO — ${partes.join(". ")}.`);
  },
  step: (state) => ({
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "none" },
  }),
};

export const CAD_PLANT_ROUTE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(routeCommand),
  asCadCommand(mtoCommand),
];
