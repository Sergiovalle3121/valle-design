/**
 * 3DORBIT, 3DFORBIT, 3DPAN, 3DZOOM y VPOINT — mirar el modelo, tecleando.
 *
 * ## Qué faltaba exactamente
 *
 * `view/view-controller.ts` sabía orbitar desde hace una ola: tiene las dos
 * cámaras y la aritmética de la esfera. Lo que no había era ninguna ORDEN. El
 * único modo de girar la vista era arrastrar con el ratón, así que un guion no
 * podía encuadrar una pieza, la paleta `Ctrl+K` no ofrecía ni una vista, y
 * pedir «planta» era imposible salvo apuntando con la mano. Un modelador de
 * sólidos sin forma tecleable de mirarlo no es medio producto: es un producto
 * al que le falta el gesto que más se repite.
 *
 * Estos cinco descriptores son ese gesto. **No reimplementan nada**: la
 * aritmética vive en `view/view-3d.ts` y `view/visual-styles.ts`, la cámara la
 * mueve el controlador, y aquí sólo se decide qué se pregunta y en qué orden.
 *
 * ## Por qué la forma tecleada pide NÚMEROS
 *
 * 3DORBIT en AutoCAD entra en un modo de arrastre. Un modo de arrastre no se
 * puede escribir, y por tanto no se puede guionizar ni repetir ni probar. La
 * forma tecleada pide los ángulos, igual que `ZOOM` tecleado pide un factor en
 * vez de esperar a la rueda; pulsar Enter sin dar números dice explícitamente
 * que ese gesto es del ratón, que es lo que hacen ya `ZOOM` y `PAN` con su
 * «tiempo real».
 *
 * ## Y por qué 3DPAN pide dos PUNTOS
 *
 * Porque un dibujante indica dos puntos del dibujo, no un número de píxeles.
 * Mover el objetivo tantas unidades al este significa lo mismo mire la cámara
 * donde mire; arrastrar por el plano de la pantalla depende del encuadre y no
 * es reproducible en un guion. El camino en píxeles existe —lo usa el
 * puntero—, pero no es el que se escribe.
 */
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import type { CadPoint2 } from "../../cad-document";
import type { CadViewRequest } from "../../view/view-navigation";
import {
  CAD_STANDARD_VIEWS,
  resolveCadStandardView,
  validateCadView3dRequest,
  type CadOrbitMode,
  type CadStandardViewId,
  type CadView3dRequest,
} from "../../view/view-3d";

/**
 * Envuelve una petición 3D ya validada.
 *
 * La validación pasa SIEMPRE por `validateCadView3dRequest`, también cuando el
 * comando cree que el valor es bueno: así la misma regla vale para lo tecleado,
 * para los guiones y para AutoLISP, que no pasan por este prompt. Una petición
 * rechazada sale como mensaje, no como una vista movida a medias.
 */
function view3dResult(request: CadView3dRequest): CadCommandStep<never> {
  const outcome = validateCadView3dRequest(request);
  const result = outcome.request
    ? ({ kind: "view", request: { kind: "view3d", request: outcome.request } as CadViewRequest, label: outcome.message } as const)
    : ({ kind: "message", text: outcome.message } as const);
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result,
  };
}

function say(text: string): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
}

/** Número tecleado, venga como distancia o como texto libre. */
function typedNumber(input: { kind: string; value?: unknown }): number | null {
  if (input.kind === "distance" && typeof input.value === "number") return input.value;
  if (input.kind === "text" && typeof input.value === "string") {
    const parsed = Number(input.value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3DORBIT / 3DFORBIT
// ---------------------------------------------------------------------------

const ORBIT_OPTIONS = [
  { keyword: "LIbre", shortcut: "LI" },
  { keyword: "REstringida", shortcut: "RE" },
] as const;

interface OrbitState {
  mode: CadOrbitMode;
  azimuthDeg: number | null;
}

function orbitStep3d(state: OrbitState): CadCommandStep<OrbitState> {
  if (state.azimuthDeg === null)
    return {
      state,
      prompt: {
        message:
          state.mode === "free"
            ? "Órbita LIBRE: indique el giro alrededor del eje vertical de la cámara, en grados"
            : "Indique el giro en azimut, en grados",
        options: ORBIT_OPTIONS,
        defaultOption: "arrastre interactivo",
      },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_KEYWORD | CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: { message: "Indique el giro en elevación, en grados", options: [] },
    accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
  };
}

function orbitCommand(name: string, aliases: readonly string[], mode: CadOrbitMode) {
  const descriptor: CadCommandDescriptor<OrbitState> = {
    name,
    aliases: [...aliases],
    kind: "view",
    // Transparente como ZOOM y PAN: girar la vista a mitad de un LINE devuelve
    // el control al LINE en el punto exacto donde estaba. Es la razón de ser del
    // mecanismo, y una orden de vista que no lo aprovecha estorba.
    transparent: true,
    selection: "none",
    repeatable: true,
    mutates: false,
    cursor: "none",
    begin: () => orbitStep3d({ mode, azimuthDeg: null }),
    step: (state, input) => {
      if (input.kind === "cancel") return say(`${name} cancelado.`);
      if (input.kind === "keyword") {
        const next: CadOrbitMode = input.keyword === "LIbre" ? "free" : "constrained";
        return orbitStep3d({ ...state, mode: next });
      }
      if (input.kind === "enter") {
        if (state.azimuthDeg === null)
          return say(
            `${name} interactivo: arrastra sobre el visor. Para guionizarlo, indica azimut y elevación en grados.`,
          );
        // Enter tras el azimut vale por «sin elevación», que es un giro
        // horizontal puro: el caso más común de todos.
        return view3dResult({
          kind: "orbit",
          mode: state.mode,
          azimuthDeg: state.azimuthDeg,
          elevationDeg: 0,
        });
      }
      const value = typedNumber(input);
      if (value === null) return orbitStep3d(state);
      if (state.azimuthDeg === null) return orbitStep3d({ ...state, azimuthDeg: value });
      return view3dResult({
        kind: "orbit",
        mode: state.mode,
        azimuthDeg: state.azimuthDeg,
        elevationDeg: value,
      });
    },
  };
  return descriptor;
}

// ---------------------------------------------------------------------------
// 3DPAN
// ---------------------------------------------------------------------------

interface Pan3dState {
  base: CadPoint2 | null;
}

function pan3dStep(state: Pan3dState): CadCommandStep<Pan3dState> {
  return {
    state,
    prompt: {
      message: state.base
        ? "Precise el segundo punto del desplazamiento"
        : "Precise el punto base del desplazamiento",
      options: [],
      ...(state.base ? {} : { defaultOption: "arrastre interactivo" }),
    },
    accepts: CAD_ACCEPT_POINT,
    ...(state.base ? { preview: [{ points: [state.base] }] } : {}),
  };
}

const pan3dCommand: CadCommandDescriptor<Pan3dState> = {
  name: "3DPAN",
  aliases: ["3DP"],
  kind: "view",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "crosshair",
  begin: () => pan3dStep({ base: null }),
  step: (state, input) => {
    if (input.kind === "cancel") return say("3DPAN cancelado.");
    if (input.kind === "enter" && !state.base)
      return say("3DPAN interactivo: arrastra con el botón central sobre el visor.");
    if (input.kind !== "point") return pan3dStep(state);
    if (!state.base) return pan3dStep({ base: input.point });
    // Mismo signo que PAN: el desplazamiento de la VISTA es el opuesto al del
    // punto, porque arrastrar el dibujo a la derecha mueve la cámara a la
    // izquierda. Que las dos órdenes coincidan importa más que cuál sea el
    // signo: un usuario no cambia de convención al pasar a 3D.
    return view3dResult({
      kind: "pan-drawing",
      dx: state.base.x - input.point.x,
      dy: state.base.y - input.point.y,
    });
  },
};

// ---------------------------------------------------------------------------
// 3DZOOM
// ---------------------------------------------------------------------------

const zoom3dCommand: CadCommandDescriptor<never> = {
  name: "3DZOOM",
  aliases: ["3DZ"],
  kind: "view",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: undefined as never,
    prompt: {
      message: "Indique el factor de acercamiento (mayor que 1 acerca)",
      options: [],
      defaultOption: "rueda del ratón",
    },
    accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
  }),
  step: (_state, input) => {
    if (input.kind === "cancel") return say("3DZOOM cancelado.");
    if (input.kind === "enter")
      return say("3DZOOM interactivo: usa la rueda. Para guionizarlo, indica un factor.");
    const factor = typedNumber(input);
    if (factor === null) return say("3DZOOM necesita un factor numérico.");
    return view3dResult({ kind: "zoom", factor });
  },
};

// ---------------------------------------------------------------------------
// VPOINT — las diez vistas predefinidas, en una sola línea
// ---------------------------------------------------------------------------

/**
 * Atajos de las diez vistas.
 *
 * Se declaran aquí y no en la tabla de `view-3d.ts` porque son vocabulario de la
 * LÍNEA DE COMANDOS, no geometría: cambiarlos es una decisión de interfaz y no
 * debería obligar a tocar el módulo que sabe dónde va la cámara.
 */
const VIEW_SHORTCUTS: Record<CadStandardViewId, string> = {
  top: "SU",
  bottom: "IN",
  front: "FR",
  back: "PO",
  left: "IZ",
  right: "DE",
  "sw-iso": "SO",
  "se-iso": "SE",
  "ne-iso": "NE",
  "nw-iso": "NO",
};

export const CAD_STANDARD_VIEW_KEYWORDS = CAD_STANDARD_VIEWS.map((view) => ({
  keyword: view.label,
  shortcut: VIEW_SHORTCUTS[view.id],
  label: view.label,
}));

const ROTATE = { keyword: "Rotar", shortcut: "R" } as const;

interface VpointState {
  azimuthDeg: number | null;
  rotating: boolean;
}

function vpointStep(state: VpointState): CadCommandStep<VpointState> {
  if (!state.rotating)
    return {
      state,
      prompt: {
        message: "Indique la vista",
        options: [...CAD_STANDARD_VIEW_KEYWORDS, ROTATE],
      },
      accepts: CAD_ACCEPT_KEYWORD | CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: {
      message:
        state.azimuthDeg === null
          ? "Indique el ángulo en el plano XY respecto del eje X, en grados"
          : "Indique el ángulo desde el plano XY, en grados",
      options: [],
    },
    accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
  };
}

const vpointCommand: CadCommandDescriptor<VpointState> = {
  name: "VPOINT",
  aliases: ["VP"],
  kind: "view",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: () => vpointStep({ azimuthDeg: null, rotating: false }),
  step: (state, input) => {
    if (input.kind === "cancel") return say("VPOINT cancelado.");
    if (input.kind === "keyword") {
      if (input.keyword === ROTATE.keyword)
        return vpointStep({ azimuthDeg: null, rotating: true });
      const view = resolveCadStandardView(input.keyword);
      if (!view) return vpointStep(state);
      return view3dResult({ kind: "standard-view", view: view.id });
    }
    if (state.rotating) {
      const value = typedNumber(input);
      if (value === null) return vpointStep(state);
      if (state.azimuthDeg === null) return vpointStep({ azimuthDeg: value, rotating: true });
      return view3dResult({
        kind: "orbit-to",
        // VPOINT mide el ángulo del plano XY desde el eje X y en sentido
        // antihorario; este motor mide el azimut desde el NORTE del dibujo,
        // porque su cero es la cámara en +Z de escena. `90 − ángulo` es la
        // conversión, y vive aquí y no en la aritmética: es vocabulario de la
        // orden, no geometría. Comprobación: 0° (este) → azimut 90 (este);
        // 90° (norte) → azimut 0 (norte).
        azimuthDeg: 90 - state.azimuthDeg,
        elevationDeg: value,
      });
    }
    if (input.kind === "text") {
      const view = resolveCadStandardView(input.value);
      if (!view)
        return {
          state,
          prompt: {
            message: `«${input.value}» no es una vista. Vistas: ${CAD_STANDARD_VIEWS.map((candidate) => candidate.label).join(", ")}.`,
            options: [...CAD_STANDARD_VIEW_KEYWORDS, ROTATE],
          },
          accepts: CAD_ACCEPT_KEYWORD | CAD_ACCEPT_TEXT,
        };
      return view3dResult({ kind: "standard-view", view: view.id });
    }
    if (input.kind === "enter") return say("VPOINT: no se indicó ninguna vista.");
    return vpointStep(state);
  },
};

export const CAD_VIEW_NAVIGATION_3D_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(orbitCommand("3DORBIT", ["3DO", "ORBIT"], "constrained")),
  asCadCommand(orbitCommand("3DFORBIT", ["3DF", "FORBIT"], "free")),
  asCadCommand(pan3dCommand),
  asCadCommand(zoom3dCommand),
  asCadCommand(vpointCommand),
];
