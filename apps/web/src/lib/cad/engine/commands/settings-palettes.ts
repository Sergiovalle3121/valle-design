/**
 * Las puertas TECLEABLES a lo que la ola 1 dejó en paletas, más las variantes
 * con guion que un script necesita.
 *
 * ## Por qué esto vale tanto y cuesta tan poco
 *
 * La paleta de propiedades, el gestor de capas, DSETTINGS y el gestor de
 * estilos ya existen y funcionan. Lo único que les faltaba es que teclear su
 * nombre las abriera — que es como se abren en AutoCAD y como las abre todo el
 * que lleva años usándolo. Sin esto, la funcionalidad está construida pero no
 * entregada: hay que saber en qué menú vive cada una.
 *
 * ## Con diálogo y sin diálogo, y por qué hacen falta las dos
 *
 * `LAYER` abre el gestor. `-LAYER` hace lo mismo por la línea: crear una capa,
 * ponerla actual, cambiarle el color, apagarla. La segunda no es una comodidad
 * para nostálgicos: es la ÚNICA que puede ejecutar un `.scr`, porque un cuadro
 * de diálogo deja el script colgado esperando un clic que nadie va a dar.
 *
 * ## Qué pasa cuando la paleta no está montada
 *
 * El comando devuelve una petición de interfaz con el texto de lo que el
 * usuario se pierde, y el anfitrión lo enseña. Nunca se traga la orden en
 * silencio.
 */
import { CAD_OSNAP_BITS, describeCadOsmode } from "../../osnap-bits";
import { CAD_SETTINGS_LAYER_COMMANDS } from "./settings-layers";
import { cadToolCommandLine } from "../../tool-palettes";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
  type CadUiRequest,
} from "../command-types";
import { createCadVariableAccess } from "../../system-variables";

function message<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function cancelled<S>(state: S): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

/**
 * Un comando que sólo abre algo. Cuatro líneas por comando en vez de cuarenta,
 * y todos con el mismo trato cuando la paleta no existe todavía.
 */
function paletteCommand(
  name: string,
  aliases: readonly string[],
  request: CadUiRequest,
  text: string,
): CadCommandDescriptor<Record<string, never>> {
  return {
    name,
    aliases,
    kind: "manage",
    transparent: true,
    selection: "optional",
    repeatable: false,
    mutates: false,
    cursor: "none",
    begin: () => ({
      state: {},
      prompt: { message: "", options: [] },
      accepts: 0,
      result: { kind: "ui", request, text },
    }),
    step: (state) => cancelled(state),
  };
}

// ---------------------------------------------------------------------------
// -OSNAP
// ---------------------------------------------------------------------------

interface OsnapState {
  asked: boolean;
}

const osnapCliCommand: CadCommandDescriptor<OsnapState> = {
  name: "-OSNAP",
  aliases: ["-OS"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => {
    const access = context.variables ?? createCadVariableAccess();
    return {
      state: { asked: true },
      prompt: {
        message:
          `Modos de referencia actuales: ${describeCadOsmode(Number(access.get("OSMODE") ?? 0))}. ` +
          `Indique los nuevos separados por comas (${CAD_OSNAP_BITS.map((bit) => bit.keyword).join(", ")}), ` +
          "NINGUNO para apagarlos todos",
        options: [],
      },
      accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_DISTANCE,
    };
  },
  step: (state, input) => {
    if (input.kind === "distance")
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: {
          kind: "variables",
          patch: { OSMODE: Math.max(0, Math.trunc(input.value)) },
          text: `OSMODE = ${Math.trunc(input.value)} (${describeCadOsmode(Math.trunc(input.value))})`,
        },
      };
    if (input.kind !== "text") return cancelled(state);
    const words = input.value
      .split(/[,\s]+/)
      .map((word) => word.trim().toUpperCase())
      .filter(Boolean);
    if (words.length === 0) return cancelled(state);
    if (words.length === 1 && (words[0] === "NINGUNO" || words[0] === "NONE"))
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: { kind: "variables", patch: { OSMODE: 0 }, text: "Referencias a objetos: ninguna." },
      };
    let mask = 0;
    const unknown: string[] = [];
    for (const word of words) {
      const bit = CAD_OSNAP_BITS.find(
        (candidate) =>
          candidate.keyword.toUpperCase() === word || candidate.shortcut.toUpperCase() === word,
      );
      if (!bit) unknown.push(word);
      else mask |= bit.bit;
    }
    if (unknown.length > 0)
      return message(state, `No reconozco estos modos de referencia: ${unknown.join(", ")}.`);
    return {
      state,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: {
        kind: "variables",
        patch: { OSMODE: mask },
        text: `OSMODE = ${mask} (${describeCadOsmode(mask)})`,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// UCSMAN / -UCSMAN
// ---------------------------------------------------------------------------

const UCS_SAVE = { keyword: "Guardar", shortcut: "G" } as const;
const UCS_RESTORE = { keyword: "Restituir", shortcut: "R" } as const;
const UCS_WORLD = { keyword: "Universal", shortcut: "U" } as const;
const UCS_LIST = { keyword: "?", shortcut: "?" } as const;

interface UcsState {
  action: "save" | "restore" | null;
}

const ucsCliCommand: CadCommandDescriptor<UcsState> = {
  name: "-UCSMAN",
  aliases: ["-UC", "UCSNAMED"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => ({
    state: { action: null },
    prompt: {
      message: `SCU actual: ${String(
        (context.variables ?? createCadVariableAccess()).get("UCSNAME") || "universal",
      )}`,
      options: [UCS_LIST, UCS_SAVE, UCS_RESTORE, UCS_WORLD],
      defaultOption: UCS_LIST.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    const catalog = context.catalogs?.coordinateSystems;
    if (!catalog)
      return message(
        state,
        "UCSMAN necesita el catálogo de SCU de la sesión y este espacio de trabajo no lo aporta.",
      );
    const access = context.variables ?? createCadVariableAccess();

    if (state.action === null) {
      const keyword = input.kind === "keyword" ? input.keyword : UCS_LIST.keyword;
      if (keyword === UCS_WORLD.keyword)
        return {
          state,
          prompt: { message: "", options: [] },
          accepts: 0,
          result: {
            kind: "variables",
            patch: { UCSNAME: "", UCSORGX: 0, UCSORGY: 0, UCSANGLE: 0 },
            text: "SCU universal restituido: las consultas informan en coordenadas del mundo.",
          },
        };
      if (keyword === UCS_LIST.keyword) {
        const saved = catalog.list();
        return message(
          state,
          saved.length === 0
            ? "No hay ningún SCU guardado."
            : saved
                .map(
                  (entry) =>
                    `${entry.name}: origen (${entry.origin.x}, ${entry.origin.y}), giro ${entry.rotationDeg}°`,
                )
                .join("\n"),
        );
      }
      return {
        state: { action: keyword === UCS_SAVE.keyword ? "save" : "restore" },
        prompt: { message: "Nombre del SCU", options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    if (input.kind !== "text") return cancelled(state);
    const name = input.value.trim();
    if (!name) return cancelled(state);

    if (state.action === "save") {
      catalog.save({
        name,
        origin: { x: Number(access.get("UCSORGX") ?? 0), y: Number(access.get("UCSORGY") ?? 0) },
        rotationDeg: Number(access.get("UCSANGLE") ?? 0),
      });
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: {
          kind: "variables",
          patch: { UCSNAME: name },
          text: `SCU "${name}" guardado.`,
        },
      };
    }

    const found = catalog.get(name);
    if (!found) return message(state, `No hay ningún SCU llamado "${name}".`);
    return {
      state,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: {
        kind: "variables",
        patch: {
          UCSNAME: found.name,
          UCSORGX: found.origin.x,
          UCSORGY: found.origin.y,
          UCSANGLE: found.rotationDeg,
        },
        text: `SCU "${found.name}" restituido. ID, DIST, AREA y LIST informan ya en él.`,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// -TOOLPALETTES
// ---------------------------------------------------------------------------

interface ToolPaletteState {
  palette: string | null;
}

const toolPaletteCliCommand: CadCommandDescriptor<ToolPaletteState> = {
  name: "-TOOLPALETTES",
  aliases: ["-TP"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => {
    const catalog = context.catalogs?.toolPalettes;
    const names = catalog?.list().map((palette) => palette.name) ?? [];
    return {
      state: { palette: null },
      prompt: {
        message: names.length > 0 ? `Paleta (${names.join(", ")})` : "No hay ninguna paleta definida",
        options: [],
      },
      accepts: CAD_ACCEPT_TEXT,
    };
  },
  step: (state, input, context) => {
    if (input.kind !== "text") return cancelled(state);
    const catalog = context.catalogs?.toolPalettes;
    if (!catalog)
      return message(
        state,
        "TOOLPALETTES necesita el catálogo de paletas de la sesión y este espacio de trabajo no lo aporta.",
      );
    const palette = catalog.get(input.value.trim());
    if (!palette) return message(state, `No hay ninguna paleta llamada "${input.value.trim()}".`);
    return message(
      state,
      [
        `Paleta "${palette.name}":`,
        ...palette.tools.map((tool) => `  ${tool.label.padEnd(22)} → ${cadToolCommandLine(tool)}`),
      ].join("\n"),
    );
  },
};

// ---------------------------------------------------------------------------
// -LINETYPE
// ---------------------------------------------------------------------------

const LT_LIST = { keyword: "?", shortcut: "?" } as const;
const LT_SET = { keyword: "definir", shortcut: "D" } as const;
const LT_LOAD = { keyword: "Cargar", shortcut: "C" } as const;

interface LinetypeState {
  action: "set" | null;
}

const linetypeCliCommand: CadCommandDescriptor<LinetypeState> = {
  name: "-LINETYPE",
  aliases: ["-LT"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => ({
    state: { action: null },
    prompt: {
      message: `Tipo de línea actual: ${String(
        (context.variables ?? createCadVariableAccess()).get("CELTYPE") ?? "ByLayer",
      )}`,
      options: [LT_LIST, LT_SET, LT_LOAD],
      defaultOption: LT_SET.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    const catalog = context.catalogs?.linetypes;

    if (state.action === null) {
      const keyword = input.kind === "keyword" ? input.keyword : LT_SET.keyword;
      if (keyword === LT_LOAD.keyword)
        return {
          state,
          prompt: { message: "", options: [] },
          accepts: 0,
          result: {
            kind: "ui",
            request: {
              target: "linetype-file",
              unavailable:
                "No hay de dónde cargar un .lin en este espacio de trabajo; los tipos de fábrica " +
                "siguen disponibles con la opción ?.",
            },
            text: "Elija el archivo .lin que cargar.",
          },
        };
      if (keyword === LT_LIST.keyword) {
        const known = catalog?.list() ?? [];
        return message(
          state,
          known.length === 0
            ? "No hay ningún tipo de línea cargado."
            : known.map((entry) => `${entry.name.padEnd(16)} ${entry.description}`).join("\n"),
        );
      }
      return {
        state: { action: "set" },
        prompt: {
          message: `Tipo de línea (${(catalog?.list() ?? []).map((entry) => entry.name).join(", ") || "ByLayer"})`,
          options: [],
          defaultValue: "ByLayer",
        },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    if (input.kind !== "text") return cancelled(state);
    const typed = input.value.trim();
    if (!typed) return cancelled(state);
    const upper = typed.toUpperCase();
    if (upper !== "BYLAYER" && upper !== "BYBLOCK" && catalog && !catalog.get(typed))
      return message(
        state,
        `El tipo de línea "${typed}" no está cargado. Use la opción Cargar para traerlo de un .lin.`,
      );
    return {
      state,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: { kind: "variables", patch: { CELTYPE: typed }, text: `Tipo de línea actual: ${typed}` },
    };
  },
};

export const CAD_SETTINGS_PALETTE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(paletteCommand(
    "LAYER",
    ["LA", "DDLMODES"],
    {
      target: "layer-manager",
      unavailable:
        "El gestor de capas no está montado en este espacio de trabajo. Use -LAYER para crear, " +
        "definir, colorear, activar o bloquear capas desde la línea de comandos.",
    },
    "Abriendo el gestor de capas.",
  )),
  asCadCommand(paletteCommand(
    "PROPERTIES",
    ["CH", "MO", "PR", "DDMODIFY"],
    {
      target: "properties",
      unavailable:
        "La paleta de propiedades no está montada en este espacio de trabajo. Use LIST para ver " +
        "las propiedades de lo designado.",
    },
    "Abriendo la paleta de propiedades.",
  )),
  asCadCommand(paletteCommand(
    "DSETTINGS",
    ["DS", "SE", "RM", "DDRMODES"],
    {
      target: "draft-settings",
      unavailable:
        "El cuadro de ayudas al dibujo no está montado en este espacio de trabajo. Use -OSNAP " +
        "o SETVAR (OSMODE, SNAPMODE, GRIDMODE, ORTHOMODE) desde la línea de comandos.",
    },
    "Abriendo las ayudas al dibujo.",
  )),
  asCadCommand(paletteCommand(
    "OSNAP",
    ["OS", "DDOSNAP"],
    {
      target: "osnap",
      unavailable:
        "El cuadro de referencia a objetos no está montado en este espacio de trabajo. Use -OSNAP.",
    },
    "Abriendo las referencias a objetos.",
  )),
  asCadCommand(paletteCommand(
    "OPTIONS",
    ["OP", "PREFERENCES", "PR-OPTIONS"],
    {
      target: "options",
      unavailable:
        "El cuadro de opciones no está montado en este espacio de trabajo. Casi todo lo que " +
        "contiene son variables de sistema: use SETVAR.",
    },
    "Abriendo las opciones.",
  )),
  asCadCommand(paletteCommand(
    "TOOLPALETTES",
    ["TP"],
    {
      target: "tool-palettes",
      unavailable:
        "La paleta de herramientas no está montada en este espacio de trabajo. Use -TOOLPALETTES " +
        "para ver qué contiene cada una.",
    },
    "Abriendo las paletas de herramientas.",
  )),
  asCadCommand(paletteCommand(
    "UCSMAN",
    ["UC", "DDUCS"],
    {
      target: "ucs-manager",
      unavailable:
        "El gestor de SCU no está montado en este espacio de trabajo. Use -UCSMAN para guardar, " +
        "restituir o volver al sistema universal.",
    },
    "Abriendo el gestor de sistemas de coordenadas.",
  )),
  asCadCommand(paletteCommand(
    "LINETYPE",
    ["LT", "DDLTYPE"],
    {
      target: "linetype-file",
      unavailable:
        "No hay de dónde cargar tipos de línea en este espacio de trabajo. Use -LINETYPE para " +
        "listarlos y elegir el actual.",
    },
    "Elija el archivo .lin que cargar.",
  )),
  ...CAD_SETTINGS_LAYER_COMMANDS,
  asCadCommand(osnapCliCommand),
  asCadCommand(ucsCliCommand),
  asCadCommand(toolPaletteCliCommand),
  asCadCommand(linetypeCliCommand),
];
