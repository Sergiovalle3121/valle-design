/**
 * AECIRCUIT y AECHECK: los datos del circuito, y la revisión contra la NOM.
 *
 * ## Qué hacen estas dos que AutoCAD Electrical no hace
 *
 * `AECIRCUIT` declara la protección, la tensión y las fases de un circuito, y
 * las estampa en TODOS sus conductores de una sola orden — un solo paso de
 * deshacer, porque cambiar el interruptor de un circuito es un acto, no
 * catorce.
 *
 * `AECHECK` revisa. Y ahí está la diferencia: AutoCAD Electrical numera y
 * lista, pero no comprueba si el calibre aguanta la protección ni cuánto cae la
 * tensión, porque sus conductores son esquemáticos y el dibujo no sabe cuánto
 * miden. Aquí son polilíneas a escala, así que **la longitud sale del plano** y
 * la revisión también.
 *
 * ## Por qué AECHECK no escribe nada
 *
 * Una revisión que modifica el dibujo no se puede correr antes de entregar sin
 * pensárselo. Ésta se puede correr las veces que haga falta: lee, informa y se
 * va. Cambiar el calibre es una decisión del proyectista, no de la orden.
 *
 * ## El límite va SIEMPRE en el renglón
 *
 * Aprobado o no. Una revisión que no dice lo que NO mira se lee como un
 * certificado, y esto no lo es: no aplica corrección por temperatura ni
 * agrupamiento, no considera el 125 % de carga continua, no revisa tierra ni
 * llenado de tubo, y la caída es resistiva. Quien firma sigue firmando.
 */
import type { CadEntity } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_NOM_CHECK_LIMITS,
  cadCheckCircuits,
  cadCircuitMetadata,
} from "../../electrical/circuit-check";
import { cadWiresOf } from "../../electrical/wire-numbering";
import {
  CAD_ACCEPT_KEYWORD,
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

/** Las entidades del dibujo que el anfitrión expone. `null` si no expone. */
function entitiesOf(context: CadCommandContext): CadEntity[] | null {
  if (!context.entity) return null;
  return context.entityIds
    .map((id) => context.entity!(id))
    .filter((entity): entity is CadEntity => !!entity);
}

// ---------------------------------------------------------------------------
// AECIRCUIT
// ---------------------------------------------------------------------------

interface CircuitState {
  circuit: string | null;
  breakerAmps: number | null;
  volts: number | null;
}

const PHASE_OPTIONS = [
  { keyword: "Monofásico", shortcut: "M" },
  { keyword: "Trifásico", shortcut: "T" },
] as const;

function circuitStep(state: CircuitState): CadCommandStep<CircuitState> {
  if (!state.circuit)
    return {
      state,
      prompt: { message: "Circuito al que se le ponen los datos", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (state.breakerAmps === null)
    return {
      state,
      prompt: { message: "Protección del circuito, en amperes", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (state.volts === null)
    return {
      state,
      prompt: { message: "Tensión del circuito, en volts <127>", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: { message: "Fases", options: PHASE_OPTIONS, defaultOption: "Monofásico" },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

/** Tensión por defecto en México para un ramal de alumbrado y contactos. */
const DEFAULT_VOLTS = 127;

function finishCircuit(
  state: CircuitState,
  phases: 1 | 3,
  context: CadCommandContext,
): CadCommandStep<never> {
  const entities = entitiesOf(context);
  if (!entities)
    return say("AECIRCUIT necesita leer el dibujo: este anfitrión no lo expone.");
  const clave = state.circuit!.trim().toUpperCase();
  const wires = cadWiresOf({ entities }).filter(
    (wire) => wire.circuit.toUpperCase() === clave,
  );
  if (wires.length === 0)
    return say(
      `No hay ningún conductor del circuito «${state.circuit}» en el dibujo: tráce uno con AEWIRE antes de darle datos.`,
    );

  const patch = cadCircuitMetadata({
    breakerAmps: state.breakerAmps!,
    volts: state.volts!,
    phases,
  });
  const commands: CadEntityCommand[] = wires.map((wire) => ({
    type: "metadata",
    entityId: wire.entityId,
    patch,
  }));
  const dicho = `AECIRCUIT: ${state.circuit} a ${state.breakerAmps} A, ${state.volts} V, ${
    phases === 3 ? "trifásico" : "monofásico"
  } — ${wires.length} conductor(es) marcado(s)`;
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    // Un solo lote y un solo paso de deshacer: cambiar el interruptor de un
    // circuito es un acto, no catorce.
    result: { kind: "document", commands, label: "AECIRCUIT", notice: dicho },
  };
}

const positive = (raw: string): number | null => {
  const value = Number(raw.trim().replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
};

const circuitCommand: CadCommandDescriptor<CircuitState> = {
  name: "AECIRCUIT",
  aliases: ["CIRCUITO"],
  kind: "modify",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: () => circuitStep({ circuit: null, breakerAmps: null, volts: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("AECIRCUIT cancelado.");
    if (!state.circuit) {
      if (input.kind !== "text" || input.value.trim() === "")
        return say("AECIRCUIT necesita saber de qué circuito son los datos.");
      return circuitStep({ ...state, circuit: input.value.trim() });
    }
    if (state.breakerAmps === null) {
      if (input.kind !== "text")
        return circuitStep(state);
      const amps = positive(input.value);
      // Fallo cerrado: una protección ilegible no se redondea. Un circuito con
      // la protección equivocada es lo que hace que la revisión mienta.
      if (amps === null)
        return say(`«${input.value}» no es una protección: escriba los amperes.`);
      return circuitStep({ ...state, breakerAmps: amps });
    }
    if (state.volts === null) {
      if (input.kind === "enter") return circuitStep({ ...state, volts: DEFAULT_VOLTS });
      if (input.kind !== "text") return circuitStep(state);
      if (input.value.trim() === "")
        return circuitStep({ ...state, volts: DEFAULT_VOLTS });
      const volts = positive(input.value);
      if (volts === null)
        return say(`«${input.value}» no es una tensión: escriba los volts.`);
      return circuitStep({ ...state, volts });
    }
    if (input.kind === "enter") return finishCircuit(state, 1, context);
    if (input.kind !== "keyword") return circuitStep(state);
    return finishCircuit(state, input.keyword === "Trifásico" ? 3 : 1, context);
  },
};

// ---------------------------------------------------------------------------
// AECHECK
// ---------------------------------------------------------------------------

const VERDICT_WORD = {
  ok: "cumple",
  aviso: "AVISO",
  "no-cumple": "NO CUMPLE",
  "sin-datos": "SIN DATOS",
} as const;

const checkCommand: CadCommandDescriptor<never> = {
  name: "AECHECK",
  aliases: ["REVISARNOM", "NOMCHECK"],
  kind: "inquiry",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: (context) => {
    const entities = entitiesOf(context);
    if (!entities)
      return say("AECHECK necesita leer el dibujo: este anfitrión no lo expone.");
    const filas = cadCheckCircuits({
      entities,
      meta: { unit: context.unit } as never,
    });
    if (filas.length === 0)
      return say(
        "No hay ningún circuito que revisar. Trace conductores con AEWIRE y deles datos con AECIRCUIT.",
      );

    const renglones = filas.map(
      (fila) => `${fila.circuit} ${VERDICT_WORD[fila.verdict]}: ${fila.findings.join("; ")}`,
    );
    const malos = filas.filter((fila) => fila.verdict === "no-cumple").length;
    const avisos = filas.filter((fila) => fila.verdict === "aviso").length;
    const faltas = filas.filter((fila) => fila.verdict === "sin-datos").length;
    const resumen = `${filas.length} circuito(s): ${
      filas.length - malos - avisos - faltas
    } cumple(n), ${malos} no cumple(n), ${avisos} con aviso, ${faltas} sin datos`;
    // El límite va SIEMPRE, aprobado o no: una revisión que no dice lo que no
    // mira se lee como un certificado.
    return say(`AECHECK — ${resumen}. ${renglones.join(" · ")}. ${CAD_NOM_CHECK_LIMITS}`);
  },
  step: (state) => ({
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "none" },
  }),
};

export const CAD_ELECTRICAL_CIRCUIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(circuitCommand),
  asCadCommand(checkCommand),
];
