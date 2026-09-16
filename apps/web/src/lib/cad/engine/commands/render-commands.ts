/**
 * Familia de comandos de RENDER (13 comandos).
 *
 * RENDER, RENDERCROP, RENDERWIN, RENDERPRESETS, RENDEREXPOSURE,
 * RENDERENVIRONMENT, MATERIALS/MATBROWSER, MATERIALMAP, MATERIALATTACH,
 * POINTLIGHT, SPOTLIGHT, DISTANTLIGHT, SUNPROPERTIES, GEOGRAPHICLOCATION.
 *
 * Los comandos de render producen resultados para el anfitrión (WebGL),
 * no mutan el documento directamente.
 */
import {
  asCadCommand,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_ENTITY_PICK,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

function say(text: string): CadCommandStep<never> {
  return { state: undefined as never, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

// ---------------------------------------------------------------------------
// RENDER / RENDERCROP / RENDERWIN
// ---------------------------------------------------------------------------

const cmdrender: CadCommandDescriptor<null> = {
  name: "RENDER",
  aliases: ["RDR", "RENDERIZAR"],
  kind: "view", transparent: false, selection: "none", repeatable: true, mutates: false, cursor: "none",
  begin: () => ({ state: null, prompt: { message: "Pulse Intro para renderizar la vista actual", options: [] }, accepts: 0 }),
  step: () => say("RENDER: renderizado — requiere anfitrión con WebGL y sombras."),
};

const cmdrendercrop: CadCommandDescriptor<null> = {
  name: "RENDERCROP",
  aliases: ["RCROP", "RENDERCORTE"],
  kind: "view", transparent: false, selection: "none", repeatable: true, mutates: false, cursor: "crosshair",
  begin: () => ({ state: null, prompt: { message: "Primer punto del área de renderizado", options: [] }, accepts: CAD_ACCEPT_POINT }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("RENDERCROP cancelado.");
    if (input.kind === "point")
      return { state: null, prompt: { message: "Segundo punto del área", options: [] }, accepts: CAD_ACCEPT_POINT };
    return say("RENDERCROP: indique el primer punto.");
  },
};

const cmdrenderwin: CadCommandDescriptor<null> = {
  name: "RENDERWIN",
  aliases: ["RWIN", "VENTANARENDER"],
  kind: "view", transparent: false, selection: "none", repeatable: true, mutates: false, cursor: "none",
  begin: () => ({ state: null, prompt: { message: "Abre la ventana de resultado del renderizado", options: [] }, accepts: 0 }),
  step: () => say("RENDERWIN: ventana de render — requiere anfitrión con visor de imágenes."),
};

// ---------------------------------------------------------------------------
// RENDERPRESETS / RENDEREXPOSURE / RENDERENVIRONMENT
// ---------------------------------------------------------------------------

const PRESET_OPTIONS = [
  { keyword: "Bajo", shortcut: "B" },
  { keyword: "Medio", shortcut: "M" },
  { keyword: "Alto", shortcut: "A" },
  { keyword: "Presentación", shortcut: "P" },
] as const;

const cmdrenderpresets: CadCommandDescriptor<null> = {
  name: "RENDERPRESETS",
  aliases: ["RPRES", "PREDETRENDER"],
  kind: "view", transparent: false, selection: "none", repeatable: true, mutates: false, cursor: "none",
  begin: () => ({ state: null, prompt: { message: "Elija el preset de renderizado", options: PRESET_OPTIONS, defaultOption: "Medio" }, accepts: CAD_ACCEPT_KEYWORD }),
  step: (_s, input) => {
    const preset = input.kind === "keyword" ? input.keyword : "Medio";
    return say(`RENDERPRESETS: preset «${preset}» seleccionado.`);
  },
};

const cmdrenderexposure: CadCommandDescriptor<null> = {
  name: "RENDEREXPOSURE",
  aliases: ["REXP", "EXPOSICIONRENDER"],
  kind: "view", transparent: false, selection: "none", repeatable: true, mutates: false, cursor: "none",
  begin: () => ({ state: null, prompt: { message: "Valor de exposición (–3 a +3; 0 = neutro)", options: [], defaultValue: "0" }, accepts: CAD_ACCEPT_DISTANCE }),
  step: (_s, input) => {
    const val = input.kind === "distance" ? input.value : 0;
    return say(`RENDEREXPOSURE: exposición a ${val}.`);
  },
};

const cmdrenderenvironment: CadCommandDescriptor<null> = {
  name: "RENDERENVIRONMENT",
  aliases: ["RENV", "ENTORNORENDER"],
  kind: "view", transparent: false, selection: "none", repeatable: true, mutates: false, cursor: "none",
  begin: () => ({
    state: null,
    prompt: { message: "Configuración del entorno de renderizado", options: [{ keyword: "Fondo", shortcut: "F" }, { keyword: "Niebla", shortcut: "N" }, { keyword: "Imagen", shortcut: "I" }] },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (_s, input) => {
    const opt = input.kind === "keyword" ? input.keyword : "Fondo";
    return say(`RENDERENVIRONMENT: ${opt} — configuración pendiente de WebGL.`);
  },
};

// ---------------------------------------------------------------------------
// MATERIALS / MATERIALMAP / MATERIALATTACH
// ---------------------------------------------------------------------------

const MATERIAL_OPTIONS = [
  { keyword: "Madera", shortcut: "M" },
  { keyword: "Metal", shortcut: "E" },
  { keyword: "Hormigón", shortcut: "H" },
  { keyword: "Vidrio", shortcut: "V" },
  { keyword: "Piedra", shortcut: "P" },
  { keyword: "Personalizado", shortcut: "Z" },
] as const;

const cmdmaterials: CadCommandDescriptor<null> = {
  name: "MATERIALS",
  aliases: ["MAT", "MATERIALES"],
  kind: "view", transparent: false, selection: "none", repeatable: true, mutates: false, cursor: "none",
  begin: () => ({ state: null, prompt: { message: "Explorador de materiales", options: MATERIAL_OPTIONS }, accepts: CAD_ACCEPT_KEYWORD }),
  step: (_s, input) => {
    const mat = input.kind === "keyword" ? input.keyword : "Ninguno";
    return say(`MATERIALS: material «${mat}» — biblioteca pendiente de WebGL.`);
  },
};

const cmdmaterialmap: CadCommandDescriptor<null> = {
  name: "MATERIALMAP",
  aliases: ["MMAP", "MAPEOMATERIAL"],
  kind: "draw", transparent: false, selection: "none", repeatable: true, mutates: true, cursor: "pick",
  begin: () => ({ state: null, prompt: { message: "Designe la entidad para aplicar el material", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("MATERIALMAP cancelado.");
    if (input.kind === "entityPick") return say("MATERIALMAP: mapeo de material — operación pendiente de WebGL.");
    return say("MATERIALMAP: designe la entidad.");
  },
};

const cmdmaterialattach: CadCommandDescriptor<null> = {
  name: "MATERIALATTACH",
  aliases: ["MATT", "ADJUNTARMATERIAL"],
  kind: "draw", transparent: false, selection: "none", repeatable: true, mutates: true, cursor: "pick",
  begin: () => ({ state: null, prompt: { message: "Designe la entidad para adjuntar material", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("MATERIALATTACH cancelado.");
    if (input.kind === "entityPick") return say("MATERIALATTACH: adición de material — operación pendiente de WebGL.");
    return say("MATERIALATTACH: designe la entidad.");
  },
};

// ---------------------------------------------------------------------------
// POINTLIGHT / SPOTLIGHT / DISTANTLIGHT / SUNPROPERTIES
// ---------------------------------------------------------------------------

function lightCommand(name: string, aliases: string[], description: string): CadCommandDescriptor<{ pos?: { x: number; y: number } }> {
  return {
    name,
    aliases,
    kind: "draw", transparent: false, selection: "none", repeatable: true, mutates: true, cursor: "crosshair",
    begin: () => ({ state: {}, prompt: { message: `Posición de ${description}`, options: [] }, accepts: CAD_ACCEPT_POINT }),
    step: (state, input) => {
      if (input.kind === "cancel") return say(`${name} cancelado.`);
      if (input.kind === "point" && !state.pos)
        return { state: { pos: input.point }, prompt: { message: `Intensidad de ${description} (0-1; 0.5)`, options: [], defaultValue: "0.5" }, accepts: CAD_ACCEPT_DISTANCE };
      const intensity = input.kind === "distance" ? input.value : 0.5;
      return say(`${name}: ${description} creada con intensidad ${intensity} — requiere WebGL.`);
    },
  };
}

const cmdsunproperties: CadCommandDescriptor<null> = {
  name: "SUNPROPERTIES",
  aliases: ["SUN", "PROPIEDADESSOL"],
  kind: "view", transparent: false, selection: "none", repeatable: true, mutates: false, cursor: "none",
  begin: () => ({
    state: null,
    prompt: {
      message: "Propiedades del sol",
      options: [
        { keyword: "Activar", shortcut: "A" },
        { keyword: "Desactivar", shortcut: "D" },
        { keyword: "Angulo", shortcut: "G" },
      ],
    },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (_s, input) => {
    const opt = input.kind === "keyword" ? input.keyword : "Activar";
    return say(`SUNPROPERTIES: ${opt} — configuración pendiente de WebGL.`);
  },
};

// ---------------------------------------------------------------------------
// GEOGRAPHICLOCATION
// ---------------------------------------------------------------------------

const cmdgeolocation: CadCommandDescriptor<null> = {
  name: "GEOGRAPHICLOCATION",
  aliases: ["GEO", "UBICACIONGEO"],
  kind: "manage", transparent: false, selection: "none", repeatable: true, mutates: true, cursor: "none",
  begin: () => ({
    state: null,
    prompt: {
      message: "Ubicación geográfica para análisis solar",
      options: [{ keyword: "Coordenadas", shortcut: "C" }, { keyword: "Ciudad", shortcut: "I" }],
    },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("GEOGRAPHICLOCATION cancelado.");
    return say("GEOGRAPHICLOCATION: ubicación pendiente de integración con servicio de mapas.");
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const CAD_RENDER_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(cmdrender),
  asCadCommand(cmdrendercrop),
  asCadCommand(cmdrenderwin),
  asCadCommand(cmdrenderpresets),
  asCadCommand(cmdrenderexposure),
  asCadCommand(cmdrenderenvironment),
  asCadCommand(cmdmaterials),
  asCadCommand(cmdmaterialmap),
  asCadCommand(cmdmaterialattach),
  asCadCommand(lightCommand("POINTLIGHT", ["PLIGHT", "LUZPUNTUAL"], "la luz puntual")),
  asCadCommand(lightCommand("SPOTLIGHT", ["SLIGHT", "LUZFOCO"], "el foco")),
  asCadCommand(lightCommand("DISTANTLIGHT", ["DLIGHT", "LUZDISTANTE"], "la luz distante")),
  asCadCommand(cmdsunproperties),
];
