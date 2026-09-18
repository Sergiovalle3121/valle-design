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
  CAD_ACCEPT_TEXT,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_POINT,
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

// ---------------------------------------------------------------------------
// RENDERENVIRONMENT — fondo e iluminación ambiental
// ---------------------------------------------------------------------------

const BACKGROUNDS = [
  { keyword: "Solido", shortcut: "S" },
  { keyword: "Imagen", shortcut: "I" },
  { keyword: "Gradiente", shortcut: "G" },
  { keyword: "Ninguno", shortcut: "N" },
] as const;

const cmdrenderenvironment: CadCommandDescriptor<{ bg: string }> = {
  name: "RENDERENVIRONMENT",
  aliases: ["RENV", "ENTORNERENDER"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: { bg: "Solido" },
    prompt: {
      message: "Tipo de fondo [Solido/Imagen/Gradiente/Ninguno]",
      options: BACKGROUNDS,
      defaultOption: "Solido",
    },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (state, input) => {
    if (input.kind === "cancel") return say("RENDERENVIRONMENT cancelado.");
    const bg = input.kind === "keyword" ? input.keyword : (state.bg ?? "Solido");
    return host(
      { kind: "render-environment", background: bg },
      `RENDERENVIRONMENT → ${bg}`,
    );
  },
};

// ---------------------------------------------------------------------------
// MATERIALS — explorador de materiales
// ---------------------------------------------------------------------------

const cmdmaterials: CadCommandDescriptor<null> = {
  name: "MATERIALS",
  aliases: ["MAT", "MATERIALES", "MATBROWSER"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: null,
    prompt: {
      message: "Explorador de materiales — pulse Intro para abrir",
      options: [],
    },
    accepts: 0,
  }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("MATERIALS cancelado.");
    return host({ kind: "material-browser" }, "MATERIALS");
  },
};

// ---------------------------------------------------------------------------
// MATERIALATTACH — adjuntar material a la selección
// ---------------------------------------------------------------------------

const cmdmaterialattach: CadCommandDescriptor<{ selection: readonly string[]; asked: boolean }> = {
  name: "MATERIALATTACH",
  aliases: ["MATTACH", "ADJUNTARMATERIAL"],
  kind: "manage",
  transparent: false,
  selection: "required",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (_ctx) => ({
    state: { selection: [], asked: false },
    prompt: {
      message: "Designe las entidades para adjuntar material",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input) => {
    if (input.kind === "cancel") return say("MATERIALATTACH cancelado.");
    if (input.kind === "selection" || input.kind === "entityPick") {
      const ids = input.kind === "selection"
        ? input.entityIds
        : [...(state.selection ?? []), input.entityId];
      return {
        state: { selection: ids, asked: false },
        prompt: {
          message: `${ids.length} entidad(es). Escriba el nombre del material`,
          options: [],
        },
        accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_ENTITY_PICK,
      };
    }
    if (input.kind === "text" && input.value.trim()) {
      return host(
        { kind: "material-attach", materialName: input.value.trim(), entityIds: state.selection ?? [] },
        `MATERIALATTACH «${input.value.trim()}»`,
      );
    }
    if (input.kind === "enter") {
      return say("MATERIALATTACH: escriba el nombre del material.");
    }
    return say("MATERIALATTACH: seleccione entidades y escriba el nombre del material.");
  },
};

// ---------------------------------------------------------------------------
// POINTLIGHT — luz puntual
// ---------------------------------------------------------------------------

const cmdpointlight: CadCommandDescriptor<null> = {
  name: "POINTLIGHT",
  aliases: ["PLIGHT", "LUZPUNTUAL"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: null,
    prompt: {
      message: "Cree una luz puntual — pulse Intro para crear en el origen",
      options: [],
    },
    accepts: 0,
  }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("POINTLIGHT cancelado.");
    return host(
      { kind: "light-create", subtype: "point", intensity: 1 },
      "POINTLIGHT",
    );
  },
};

// ---------------------------------------------------------------------------
// SPOTLIGHT — luz de foco
// ---------------------------------------------------------------------------

const cmdspotlight: CadCommandDescriptor<null> = {
  name: "SPOTLIGHT",
  aliases: ["SLIGHT", "LUZFOCO"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: null,
    prompt: {
      message: "Cree un foco — pulse Intro para crear en el origen",
      options: [],
    },
    accepts: 0,
  }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("SPOTLIGHT cancelado.");
    return host(
      { kind: "light-create", subtype: "spot", intensity: 1 },
      "SPOTLIGHT",
    );
  },
};

// ---------------------------------------------------------------------------
// DISTANTLIGHT — luz direccional
// ---------------------------------------------------------------------------

const cmddistantlight: CadCommandDescriptor<null> = {
  name: "DISTANTLIGHT",
  aliases: ["DLIGHT", "LUZDIRECCIONAL"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: null,
    prompt: {
      message: "Cree una luz direccional — pulse Intro para crear",
      options: [],
    },
    accepts: 0,
  }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("DISTANTLIGHT cancelado.");
    return host(
      { kind: "light-create", subtype: "distant", intensity: 1 },
      "DISTANTLIGHT",
    );
  },
};

// ---------------------------------------------------------------------------
// SUNPROPERTIES — propiedades del sol
// ---------------------------------------------------------------------------

const cmdsunproperties: CadCommandDescriptor<{ altitude: number; azimuth: number; enabled: boolean }> = {
  name: "SUNPROPERTIES",
  aliases: ["SUNPROP", "PROPIEDADESSOL"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: { altitude: 45, azimuth: 180, enabled: true },
    prompt: {
      message: "Altitud del sol en grados (0-90)",
      options: [],
      defaultValue: "45",
    },
    accepts: CAD_ACCEPT_DISTANCE,
  }),
  step: (state, input) => {
    if (input.kind === "cancel") return say("SUNPROPERTIES cancelado.");
    if (input.kind === "distance") {
      const alt = Math.max(0, Math.min(90, input.value));
      return host(
        { kind: "sun-properties", altitude: alt, azimuth: state.azimuth, enabled: state.enabled },
        `SUNPROPERTIES → altitud ${alt}°`,
      );
    }
    if (input.kind === "enter") {
      return host(
        { kind: "sun-properties", altitude: state.altitude, azimuth: state.azimuth, enabled: state.enabled },
        `SUNPROPERTIES → altitud ${state.altitude}°`,
      );
    }
    return say("SUNPROPERTIES: escriba la altitud en grados (0-90).");
  },
};

// ---------------------------------------------------------------------------
// RENDERCROP — captura de región recortada
// ---------------------------------------------------------------------------

const cmdrendercrop: CadCommandDescriptor<{ format: string }> = {
  name: "RENDERCROP",
  aliases: ["RCROP", "RECORTARRENDER"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "crosshair",
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
    if (input.kind === "cancel") return say("RENDERCROP cancelado.");
    const fmt =
      input.kind === "keyword"
        ? input.keyword.toUpperCase()
        : (state.format ?? "PNG");
    if (!["PNG", "JPEG", "BMP"].includes(fmt))
      return say(`RENDERCROP: formato «${fmt}» no soportado.`);
    return host(
      { kind: "render-crop", format: fmt.toLowerCase() as "png" | "jpeg" | "bmp" },
      `RENDERCROP → ${fmt}`,
    );
  },
};

// ---------------------------------------------------------------------------
// RENDERWIN — ventana de previsualización de render
// ---------------------------------------------------------------------------

const cmdrenderwin: CadCommandDescriptor<null> = {
  name: "RENDERWIN",
  aliases: ["RWIN", "VENTANARENDER"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: null,
    prompt: {
      message: "Abra la ventana de render — pulse Intro",
      options: [],
    },
    accepts: 0,
  }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("RENDERWIN cancelado.");
    return host({ kind: "render-window" }, "RENDERWIN");
  },
};

// ---------------------------------------------------------------------------
// MATERIALMAP — mapeo de material con método de proyección
// ---------------------------------------------------------------------------

const MAP_PROJECTIONS = [
  { keyword: "Plano", shortcut: "P" },
  { keyword: "Caja", shortcut: "C" },
  { keyword: "Cilindro", shortcut: "I" },
  { keyword: "Esfera", shortcut: "E" },
] as const;

const cmdmaterialmap: CadCommandDescriptor<{
  selection: readonly string[];
  material: string;
  projection: string;
}> = {
  name: "MATERIALMAP",
  aliases: ["MMAP", "MAPEARMATERIAL"],
  kind: "manage",
  transparent: false,
  selection: "required",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: { selection: [], material: "", projection: "Plano" },
    prompt: {
      message: "Designe las entidades para mapear material",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input) => {
    if (input.kind === "cancel") return say("MATERIALMAP cancelado.");
    if (input.kind === "selection" || input.kind === "entityPick") {
      const ids = input.kind === "selection"
        ? input.entityIds
        : [...(state.selection ?? []), input.entityId];
      return {
        state: { ...state, selection: ids },
        prompt: {
          message: `${ids.length} entidad(es). Escriba el nombre del material`,
          options: [],
        },
        accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_ENTITY_PICK,
      };
    }
    if (input.kind === "text" && input.value.trim()) {
      return {
        state: { ...state, material: input.value.trim() },
        prompt: {
          message: `Material «${input.value.trim()}». Método de proyección [Plano/Caja/Cilindro/Esfera]`,
          options: MAP_PROJECTIONS,
          defaultOption: "Plano",
        },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    }
    if (input.kind === "keyword" || (input.kind === "enter" && state.material)) {
      const proj = input.kind === "keyword" ? input.keyword : (state.projection ?? "Plano");
      const projMap: Record<string, "planar" | "box" | "cylindrical" | "spherical"> = {
        Plano: "planar", Caja: "box", Cilindro: "cylindrical", Esfera: "spherical",
      };
      return host(
        {
          kind: "material-map",
          materialName: state.material,
          projection: projMap[proj] ?? "planar",
          entityIds: state.selection,
        },
        `MATERIALMAP «${state.material}» → ${proj}`,
      );
    }
    return say("MATERIALMAP: seleccione entidades, escriba el material y elija la proyección.");
  },
};

export const CAD_RENDER_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(cmdrender),
  asCadCommand(cmdrenderpresets),
  asCadCommand(cmdrenderexposure),
  asCadCommand(cmdrenderenvironment),
  asCadCommand(cmdmaterials),
  asCadCommand(cmdmaterialattach),
  asCadCommand(cmdpointlight),
  asCadCommand(cmdspotlight),
  asCadCommand(cmddistantlight),
  asCadCommand(cmdsunproperties),
  asCadCommand(cmdrendercrop),
  asCadCommand(cmdrenderwin),
  asCadCommand(cmdmaterialmap),
];