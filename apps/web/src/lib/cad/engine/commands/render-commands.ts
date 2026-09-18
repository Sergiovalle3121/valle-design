/**
 * Familia de comandos de RENDER.
 *
 * RENDER, RENDERPRESETS, RENDEREXPOSURE: captura de viewport, presets de
 * calidad y exposición. Em peticiones al anfitrión — el motor no toca
 * WebGL directamente.
 */
import {
  asCadCommand,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_DISTANCE,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import type { CadHostRequest } from "../host-requests";

function say(text: string): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
}

function host(request: CadHostRequest, label: string): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "host", request, label },
  };
}

// ---------------------------------------------------------------------------
// RENDER — captura del viewport a imagen
// ---------------------------------------------------------------------------

const RENDER_FORMATS = [
  { keyword: "PNG", shortcut: "P" },
  { keyword: "JPEG", shortcut: "J" },
  { keyword: "BMP", shortcut: "B" },
] as const;

const cmdrender: CadCommandDescriptor<{ format: string }> = {
  name: "RENDER",
  aliases: ["RR", "RENDERIZAR"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: { format: "PNG" },
    prompt: {
      message: "Formato de imagen [PNG/JPEG/BMP]",
      options: RENDER_FORMATS,
      defaultOption: "PNG",
    },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (state, input) => {
    if (input.kind === "cancel") return say("RENDER cancelado.");
    const fmt =
      input.kind === "keyword"
        ? input.keyword.toUpperCase()
        : (state.format ?? "PNG");
    if (!["PNG", "JPEG", "BMP"].includes(fmt))
      return say(`RENDER: formato «${fmt}» no soportado. Use PNG, JPEG o BMP.`);
    return host(
      {
        kind: "render-capture",
        format: fmt.toLowerCase() as "png" | "jpeg" | "bmp",
      },
      `RENDER → ${fmt}`,
    );
  },
};

// ---------------------------------------------------------------------------
// RENDERPRESETS — ajustes de calidad del motor de render
// ---------------------------------------------------------------------------

const QUALITY_PRESETS = [
  { keyword: "Rapido", shortcut: "R" },
  { keyword: "Normal", shortcut: "N" },
  { keyword: "Alta", shortcut: "A" },
  { keyword: "Produccion", shortcut: "P" },
] as const;

const cmdrenderpresets: CadCommandDescriptor<null> = {
  name: "RENDERPRESETS",
  aliases: ["RPRES", "AJUSTESRENDER"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: null,
    prompt: {
      message: "Elija la calidad de render",
      options: QUALITY_PRESETS,
      defaultOption: "Normal",
    },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("RENDERPRESETS cancelado.");
    const preset =
      input.kind === "keyword" ? input.keyword : "Normal";
    return host(
      { kind: "render-setting", setting: "quality", value: preset },
      `RENDERPRESETS → ${preset}`,
    );
  },
};

// ---------------------------------------------------------------------------
// RENDEREXPOSURE — ajuste de exposición del render
// ---------------------------------------------------------------------------

const cmdrenderexposure: CadCommandDescriptor<{ value: number }> = {
  name: "RENDEREXPOSURE",
  aliases: ["REXPOSURE", "EXPOSICIONRENDER"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: { value: 0 },
    prompt: {
      message: "Exposición (-3.0 a +3.0)",
      options: [],
      defaultValue: "0.0",
    },
    accepts: CAD_ACCEPT_DISTANCE,
  }),
  step: (state, input) => {
    if (input.kind === "cancel") return say("RENDEREXPOSURE cancelado.");
    if (input.kind === "distance") {
      const v = Math.max(-3, Math.min(3, input.value));
      return host(
        { kind: "render-setting", setting: "exposure", value: v },
        `RENDEREXPOSURE → ${v.toFixed(1)}`,
      );
    }
    if (input.kind === "enter") {
      return say(`RENDEREXPOSURE: exposición actual ${(state.value ?? 0).toFixed(1)}.`);
    }
    return say("RENDEREXPOSURE: escriba un valor entre -3.0 y +3.0.");
  },
};

export const CAD_RENDER_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(cmdrender),
  asCadCommand(cmdrenderpresets),
  asCadCommand(cmdrenderexposure),
];