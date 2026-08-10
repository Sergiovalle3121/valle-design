/**
 * UNITS, LTSCALE, LWEIGHT, COLOR, SETVAR y GETVAR.
 *
 * Los seis escriben en la MISMA tabla (`lib/cad/system-variables.ts`). No es
 * una casualidad de implementación: en AutoCAD `UNITS` es literalmente un
 * cuadro que escribe `LUNITS` y `LUPREC`, y `SETVAR LUNITS 4` hace lo mismo sin
 * abrirlo. Modelarlo así tiene una consecuencia que se nota: un `.scr` puede
 * dejar el dibujo configurado entero, y lo que configure lo ve el cuadro.
 *
 * Los seis van por la línea de comandos, sin diálogo. Es deliberado: son
 * exactamente los comandos que un script necesita poder ejecutar sin que nadie
 * pulse nada, y un cuadro los dejaría colgados esperando un clic. Por eso las
 * variantes con guion (`-UNITS`) resuelven aquí mismo: ya no hay diálogo del
 * que escapar.
 */
import {
  CAD_SYSTEM_VARIABLES,
  cadSystemVariableDef,
  coerceCadSystemVariable,
  createCadVariableAccess,
  UNIT_SYSTEM_BY_LUNITS,
  type CadSystemVariableValue,
} from "../../system-variables";
import { formatLength } from "../../unit-format";
import { formatAngle } from "../../unit-angle";
import { cadLengthFormat, cadAngleFormat } from "../../system-variables";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

function variables(context: CadCommandContext) {
  return context.variables ?? createCadVariableAccess();
}

function write<S>(
  state: S,
  patch: Record<string, CadSystemVariableValue>,
  text: string,
): CadCommandStep<S> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "variables", patch, text },
  };
}

function message<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function cancelled<S>(state: S): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

// ---------------------------------------------------------------------------
// UNITS
// ---------------------------------------------------------------------------

const LENGTH_MODES = [
  { keyword: "Científico", shortcut: "C", value: 1 },
  { keyword: "Decimal", shortcut: "D", value: 2 },
  { keyword: "Ingeniería", shortcut: "I", value: 3 },
  { keyword: "Arquitectónico", shortcut: "A", value: 4 },
  { keyword: "Fraccionario", shortcut: "F", value: 5 },
] as const;

const ANGLE_MODES = [
  { keyword: "Grados", shortcut: "G", value: 0 },
  { keyword: "gradosMinutos", shortcut: "M", value: 1 },
  { keyword: "graDianes", shortcut: "D", value: 2 },
  { keyword: "Radianes", shortcut: "R", value: 3 },
  { keyword: "Topográfico", shortcut: "T", value: 4 },
] as const;

type UnitsStage = "length" | "length-precision" | "angle" | "angle-precision" | "angle-base";

interface UnitsState {
  stage: UnitsStage;
  patch: Record<string, number>;
}

/** Muestra a qué se parece la configuración elegida. Vale más que el número. */
function unitsSample(patch: Record<string, number>): string {
  const access = createCadVariableAccess(patch);
  return (
    `Ejemplo: ${formatLength(42.5, cadLengthFormat(access))} · ` +
    `${formatAngle(45, cadAngleFormat(access))}`
  );
}

function unitsStep(state: UnitsState): CadCommandStep<UnitsState> {
  switch (state.stage) {
    case "length":
      return {
        state,
        prompt: {
          message: "Formato de las longitudes",
          options: LENGTH_MODES.map(({ keyword, shortcut }) => ({ keyword, shortcut })),
          defaultOption: LENGTH_MODES[1].keyword,
        },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    case "length-precision": {
      const fractional = state.patch.LUNITS === 4 || state.patch.LUNITS === 5;
      return {
        state,
        prompt: {
          message: fractional
            ? "Precisión: 0 = entero, 4 = 1/16, 6 = 1/64 (0-8)"
            : "Número de decimales (0-8)",
          options: [],
          defaultValue: fractional ? "4" : "2",
        },
        accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
      };
    }
    case "angle":
      return {
        state,
        prompt: {
          message: "Formato de los ángulos",
          options: ANGLE_MODES.map(({ keyword, shortcut }) => ({ keyword, shortcut })),
          defaultOption: ANGLE_MODES[0].keyword,
        },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    case "angle-precision":
      return {
        state,
        prompt: { message: "Precisión angular (0-8)", options: [], defaultValue: "0" },
        accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
      };
    case "angle-base":
      return {
        state,
        prompt: {
          message: "Dirección del ángulo cero, en grados desde el este",
          options: [],
          defaultValue: "0",
        },
        accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
      };
  }
}

function readNumber(input: { kind: string } & Record<string, unknown>, fallback: number): number {
  if (input.kind === "distance") return Number(input.value);
  if (input.kind === "text") {
    const parsed = Number.parseFloat(String(input.value));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

const unitsCommand: CadCommandDescriptor<UnitsState> = {
  name: "UNITS",
  aliases: ["UN", "DDUNITS"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => {
    const access = variables(context);
    return unitsStep({
      stage: "length",
      patch: {
        LUNITS: Number(access.get("LUNITS") ?? 2),
        LUPREC: Number(access.get("LUPREC") ?? 4),
        AUNITS: Number(access.get("AUNITS") ?? 0),
        AUPREC: Number(access.get("AUPREC") ?? 0),
        ANGBASE: Number(access.get("ANGBASE") ?? 0),
      },
    });
  },
  step: (state, input) => {
    if (input.kind === "cancel") return cancelled(state);

    if (state.stage === "length") {
      const chosen =
        input.kind === "keyword"
          ? LENGTH_MODES.find((mode) => mode.keyword === input.keyword)
          : undefined;
      return unitsStep({
        stage: "length-precision",
        patch: { ...state.patch, LUNITS: chosen?.value ?? state.patch.LUNITS },
      });
    }
    if (state.stage === "length-precision") {
      const value = Math.max(0, Math.min(8, Math.round(readNumber(input, state.patch.LUPREC))));
      return unitsStep({ stage: "angle", patch: { ...state.patch, LUPREC: value } });
    }
    if (state.stage === "angle") {
      const chosen =
        input.kind === "keyword"
          ? ANGLE_MODES.find((mode) => mode.keyword === input.keyword)
          : undefined;
      return unitsStep({
        stage: "angle-precision",
        patch: { ...state.patch, AUNITS: chosen?.value ?? state.patch.AUNITS },
      });
    }
    if (state.stage === "angle-precision") {
      const value = Math.max(0, Math.min(8, Math.round(readNumber(input, state.patch.AUPREC))));
      return unitsStep({ stage: "angle-base", patch: { ...state.patch, AUPREC: value } });
    }

    const patch: Record<string, number> = {
      ...state.patch,
      ANGBASE: readNumber(input, state.patch.ANGBASE),
    };
    const system = UNIT_SYSTEM_BY_LUNITS[patch.LUNITS] ?? "decimal";
    return write(
      { ...state, patch },
      patch,
      `Unidades: ${system}, precisión ${patch.LUPREC}. ${unitsSample(patch)}`,
    );
  },
};

// ---------------------------------------------------------------------------
// LTSCALE
// ---------------------------------------------------------------------------

interface ScalarState {
  name: string;
}

function scalarCommand(
  name: string,
  aliases: readonly string[],
  variable: string,
  prompt: string,
): CadCommandDescriptor<ScalarState> {
  return {
    name,
    aliases,
    kind: "manage",
    transparent: true,
    selection: "none",
    repeatable: false,
    mutates: false,
    cursor: "none",
    begin: (context) => ({
      state: { name },
      prompt: {
        message: prompt,
        options: [],
        defaultValue: String(variables(context).get(variable) ?? ""),
      },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
    }),
    step: (state, input, context) => {
      if (input.kind === "cancel" || input.kind === "enter") return cancelled(state);
      const current = Number(variables(context).get(variable) ?? 1);
      const value = readNumber(input as never, current);
      const def = cadSystemVariableDef(variable);
      const outcome = def ? coerceCadSystemVariable(def, value) : { ok: false as const, reason: "" };
      if (!outcome.ok) return message(state, outcome.reason);
      return write(state, { [variable]: outcome.value }, `${variable} = ${outcome.value}`);
    },
  };
}

// ---------------------------------------------------------------------------
// LWEIGHT
// ---------------------------------------------------------------------------

const LW_BYLAYER = { keyword: "porCapa", shortcut: "C" } as const;
const LW_BYBLOCK = { keyword: "porBloque", shortcut: "B" } as const;
const LW_DEFAULT = { keyword: "porDefecto", shortcut: "D" } as const;

const lweightCommand: CadCommandDescriptor<ScalarState> = {
  name: "LWEIGHT",
  aliases: ["LW"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => ({
    state: { name: "LWEIGHT" },
    prompt: {
      message: "Grosor de línea de los objetos nuevos, en milímetros",
      options: [LW_BYLAYER, LW_BYBLOCK, LW_DEFAULT],
      defaultValue: describeLineweight(Number(variables(context).get("CELWEIGHT") ?? -1)),
    },
    accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
  }),
  step: (state, input) => {
    if (input.kind === "cancel" || input.kind === "enter") return cancelled(state);
    if (input.kind === "keyword") {
      const value =
        input.keyword === LW_BYBLOCK.keyword ? -2 : input.keyword === LW_DEFAULT.keyword ? -3 : -1;
      return write(state, { CELWEIGHT: value }, `Grosor: ${describeLineweight(value)}`);
    }
    const millimetres = readNumber(input as never, -1);
    if (millimetres < 0)
      return message(state, "Un grosor en milímetros no puede ser negativo; use porCapa o porDefecto.");
    // La tabla guarda CENTÉSIMAS de milímetro, como DXF 370: 0,30 mm es 30.
    const hundredths = Math.round(millimetres * 100);
    if (hundredths > 211)
      return message(state, "El grosor máximo es 2,11 mm (211 centésimas), como en DXF.");
    return write(state, { CELWEIGHT: hundredths }, `Grosor: ${describeLineweight(hundredths)}`);
  },
};

export function describeLineweight(value: number): string {
  if (value === -1) return "PorCapa";
  if (value === -2) return "PorBloque";
  if (value === -3) return "Por defecto";
  return `${(value / 100).toFixed(2)} mm`;
}

// ---------------------------------------------------------------------------
// COLOR
// ---------------------------------------------------------------------------

const colorCommand: CadCommandDescriptor<ScalarState> = {
  name: "COLOR",
  aliases: ["COL", "COLOUR", "DDCOLOR"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => ({
    state: { name: "COLOR" },
    prompt: {
      message: "Color de los objetos nuevos: BYLAYER, BYBLOCK, un índice ACI 1-255 o #rrggbb",
      options: [],
      defaultValue: String(variables(context).get("CECOLOR") ?? "BYLAYER"),
    },
    accepts: CAD_ACCEPT_TEXT,
  }),
  step: (state, input) => {
    if (input.kind !== "text") return cancelled(state);
    const raw = input.value.trim();
    if (!raw) return cancelled(state);
    const normalized = normalizeCadColor(raw);
    if (!normalized)
      return message(
        state,
        `"${raw}" no es un color. Use BYLAYER, BYBLOCK, un índice de 1 a 255 o #rrggbb.`,
      );
    return write(state, { CECOLOR: normalized }, `Color: ${normalized}`);
  },
};

/** Normaliza un color tecleado, o `null` si no lo es. */
export function normalizeCadColor(raw: string): string | null {
  const value = raw.trim();
  const upper = value.toUpperCase();
  if (upper === "BYLAYER" || upper === "PORCAPA") return "BYLAYER";
  if (upper === "BYBLOCK" || upper === "PORBLOQUE") return "BYBLOCK";
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^\d+$/.test(value)) {
    const index = Number.parseInt(value, 10);
    // 0 y 256 son PorBloque y PorCapa en ACI, y aceptarlos como índices
    // produciría dos formas de decir lo mismo que luego no se comparan iguales.
    return index >= 1 && index <= 255 ? String(index) : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// SETVAR y GETVAR
// ---------------------------------------------------------------------------

interface SetVarState {
  variable: string | null;
}

const setvarCommand: CadCommandDescriptor<SetVarState> = {
  name: "SETVAR",
  aliases: ["SET"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: { variable: null },
    prompt: { message: "Nombre de la variable de sistema, o ? para listarlas", options: [] },
    accepts: CAD_ACCEPT_TEXT,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    const access = variables(context);

    if (state.variable === null) {
      if (input.kind !== "text") return cancelled(state);
      const typed = input.value.trim();
      if (typed === "?" || typed === "*")
        return message(
          state,
          CAD_SYSTEM_VARIABLES.map(
            (def) =>
              `${def.name.padEnd(12)} ${String(access.get(def.name)).padEnd(10)} ${def.description}`,
          ).join("\n"),
        );
      const def = cadSystemVariableDef(typed);
      if (!def) return message(state, `No existe la variable de sistema "${typed}".`);
      if (def.readOnly)
        return message(state, `${def.name} = ${access.get(def.name)} (sólo lectura)`);
      return {
        state: { variable: def.name },
        prompt: {
          message: `Nuevo valor de ${def.name} — ${def.description}`,
          options: [],
          defaultValue: String(access.get(def.name)),
        },
        accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_DISTANCE,
      };
    }

    const raw =
      input.kind === "text" ? input.value.trim() : input.kind === "distance" ? input.value : null;
    if (raw === null || raw === "") return cancelled(state);
    const def = cadSystemVariableDef(state.variable);
    if (!def) return cancelled(state);
    const outcome = coerceCadSystemVariable(def, raw);
    if (!outcome.ok) return message(state, outcome.reason);
    return write(state, { [def.name]: outcome.value }, `${def.name} = ${outcome.value}`);
  },
};

const getvarCommand: CadCommandDescriptor<SetVarState> = {
  name: "GETVAR",
  aliases: [],
  kind: "inquiry",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: { variable: null },
    prompt: { message: "Nombre de la variable de sistema, o ? para listarlas", options: [] },
    accepts: CAD_ACCEPT_TEXT,
  }),
  step: (state, input, context) => {
    if (input.kind !== "text") return cancelled(state);
    const access = variables(context);
    const typed = input.value.trim();
    if (typed === "?" || typed === "*")
      return message(
        state,
        CAD_SYSTEM_VARIABLES.map((def) => `${def.name} = ${access.get(def.name)}`).join("\n"),
      );
    const def = cadSystemVariableDef(typed);
    if (!def) return message(state, `No existe la variable de sistema "${typed}".`);
    return message(
      state,
      `${def.name} = ${access.get(def.name)}${def.readOnly ? " (sólo lectura)" : ""} — ${def.description}`,
    );
  },
};

export const CAD_SETTINGS_VARIABLE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(unitsCommand),
  asCadCommand(
    scalarCommand("LTSCALE", ["LTS"], "LTSCALE", "Nueva escala de tipo de línea"),
  ),
  asCadCommand(
    scalarCommand("CELTSCALE", [], "CELTSCALE", "Escala de tipo de línea de los objetos nuevos"),
  ),
  asCadCommand(lweightCommand),
  asCadCommand(colorCommand),
  asCadCommand(setvarCommand),
  asCadCommand(getvarCommand),
];
