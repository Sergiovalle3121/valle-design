/**
 * MAPIMPORT: el conjunto GIS dentro del plano (Ola G, 2026-09-02).
 *
 * Medido antes (`distancia-autocad-completo-20260901.md`, §4 3º MAP 3D): un
 * `.shp` sólo entraba como DOCUMENTO NUEVO por el cuadro «Importar», sin
 * atributos y sin relación con el dibujo abierto. AutoCAD Map 3D lo mete en
 * el dibujo actual, en su sitio y con su tabla; esto hace lo mismo con lo que
 * el formato ya tiene (`geo-import-plan.ts` decide y lo dice).
 *
 * Mismo reparto que DXFIN, por la misma razón: leer un archivo es del
 * navegador y volver a meter su contenido por el motor es del anfitrión. El
 * comando pide los archivos por el canal de interfaz (`geo-file`), el
 * anfitrión los empaqueta (`geo-import-bundle.ts`) y los entrega por
 * `feedFile`; el comando desempaqueta, planifica, ENSEÑA el plan y sólo
 * escribe cuando se confirma. Un GeoJSON también se puede pegar tal cual.
 */
import { looksLikeGeoJson } from "../../../geo/geojson";
import { decodeCadGeoBundle, type CadGeoBundleFile } from "../../geo-import-bundle";
import { planCadGeoImport, type CadGeoImportPlan } from "../../geo-import-plan";
import {
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const FILE_KEYWORD = { keyword: "Archivo", shortcut: "A" } as const;
const YES_KEYWORD = { keyword: "Sí", shortcut: "S" } as const;
const NO_KEYWORD = { keyword: "No", shortcut: "N" } as const;

const MAPIMPORT_UNAVAILABLE =
  "Este espacio de trabajo no sabe abrir un archivo. Pega el contenido del GeoJSON en la línea de " +
  "comandos: entra con su geometría y sus atributos igual.";

type ReadyPlan = Extract<CadGeoImportPlan, { ok: true }>;

interface MapImportState {
  pending: ReadyPlan | null;
}

function say(state: MapImportState, text: string): CadCommandStep<MapImportState> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

const mapImportAsk: CadCommandStep<MapImportState> = {
  state: { pending: null },
  prompt: {
    message: "Elige los archivos del conjunto (.shp con .shx, .dbf y .prj, o .geojson) o pega un GeoJSON",
    options: [FILE_KEYWORD],
    defaultOption: FILE_KEYWORD.keyword,
  },
  accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
};

/** El plan a la vista ANTES de tocar el dibujo: dónde cae, en qué sistema, con qué atributos. */
function confirmStep(plan: ReadyPlan): CadCommandStep<MapImportState> {
  return {
    state: { pending: plan },
    prompt: {
      message: `${plan.lines.join("\n")}\n¿Importar?`,
      options: [YES_KEYWORD, NO_KEYWORD],
      defaultOption: YES_KEYWORD.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

/** Lo pegado o lo entregado, como lista de archivos. `null` si no es ni sobre ni GeoJSON. */
function filesOf(text: string): CadGeoBundleFile[] | null {
  const bundled = decodeCadGeoBundle(text);
  if (bundled) return bundled;
  if (!looksLikeGeoJson(text)) return null;
  return [{ name: "pegado.geojson", bytes: new TextEncoder().encode(text) }];
}

const mapImportCommand: CadCommandDescriptor<MapImportState> = {
  name: "MAPIMPORT",
  aliases: ["IMPORTARGIS"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: () => mapImportAsk,
  step: (state, input, context) => {
    if (input.kind === "cancel") return say(state, "MAPIMPORT cancelado. El dibujo no ha cambiado.");

    // --- segunda fase: el plan está a la vista y falta confirmar ------------
    const pending = state.pending;
    if (pending) {
      if (input.kind === "keyword" && input.keyword === NO_KEYWORD.keyword) return say(state, "MAPIMPORT cancelado. El dibujo no ha cambiado.");
      if (input.kind !== "keyword" && input.kind !== "enter") return confirmStep(pending);
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: { kind: "document", commands: pending.commands, label: `MAPIMPORT (${pending.entityCount} entidades)`, notice: pending.notice },
      };
    }

    // --- primera fase: conseguir los archivos ---------------------------------
    if (input.kind === "keyword" || input.kind === "enter")
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: {
          kind: "ui",
          request: { target: "geo-file", params: { mode: "import" }, unavailable: MAPIMPORT_UNAVAILABLE },
          text: "Elige el .shp con sus acompañantes, o el .geojson, que importar.",
        },
      };
    if (input.kind !== "text") return mapImportAsk;

    let files: CadGeoBundleFile[] | null;
    try {
      files = filesOf(input.value);
    } catch (error) {
      return say(state, `MAPIMPORT: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!files) return say(state, "MAPIMPORT: lo pegado no es un GeoJSON (no empieza por un objeto con \"type\"). Elige los archivos con Archivo o pega un GeoJSON.");
    const plan = planCadGeoImport({ files, unit: context.unit, newEntityId: context.newEntityId, document: context.document?.() });
    return plan.ok ? confirmStep(plan) : say(state, plan.reason);
  },
};

export const CAD_MAP_IMPORT_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(mapImportCommand)];
