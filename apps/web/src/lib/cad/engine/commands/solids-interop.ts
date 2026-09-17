/**
 * IMPORT y EXPORT de sólidos: STEP AP203/AP214 e IGES 5.3.
 *
 * ## Por dónde entra y sale el archivo
 *
 * Un comando del motor es una máquina de estados PURA: no toca el DOM, así que
 * no puede abrir un selector de archivos ni disparar una descarga. Lo que sí
 * puede es leer TEXTO —`CAD_ACCEPT_TEXT`— y devolver un mensaje.
 *
 * · IMPORT recibe el contenido del archivo como texto. El anfitrión que ya sabe
 *   abrir un DXF puede pasárselo tal cual; pegarlo también funciona, y eso hace
 *   que la orden sea probable en Node sin montar medio navegador.
 * · EXPORT devuelve el TEXTO del archivo COMO MENSAJE. Es la única salida que el
 *   contrato del motor permite hoy, y se dice aquí en voz alta en vez de
 *   disimularlo: el botón de descarga es un cambio del anfitrión, no del motor,
 *   y va anotado en el PR junto al gancho del visor 3D.
 *
 *   Y lo dice también EN EL MENSAJE, que es donde lo lee el dibujante. Decía «2
 *   sólido(s) exportados a STEP» y no entregaba nada: ni descarga, ni petición
 *   al anfitrión, ni una línea escrita en el documento. Con la probeta de
 *   sólidos, el gate de integridad de comandos lo destapó como el único éxito
 *   falso REAL de los tres que salieron. La orden no finge: declara que no
 *   entrega archivo y entrega el texto. Ponerle una petición al anfitrión
 *   habría sido peor mientras nadie la atiende — un `delegado` sin anfitrión es
 *   otro verde falso, sólo que en otra capa.
 *
 * El formato de IMPORT se detecta por la cabecera; el de EXPORT se elige con una
 * palabra clave y el defecto es STEP AP214, que es lo que acepta cualquier
 * programa de mecánica.
 */
import { CAD_INTEROP_EPOCH, exportSolidEntity, importSolidEntity } from "../../solid3d-interop";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { selectedSolids, solidCancelled, solidMessage } from "./solids-support";

const FORMAT_STEP = { keyword: "STEP", shortcut: "S" } as const;
const FORMAT_IGES = { keyword: "IGES", shortcut: "I" } as const;

// ---------------------------------------------------------------------------
// IMPORT
// ---------------------------------------------------------------------------

interface ImportState {
  /** Nada que recordar entre pasos: el texto llega entero de una vez. */
  waiting: boolean;
}

const importPrompt: CadCommandStep<ImportState> = {
  state: { waiting: true },
  prompt: {
    message:
      "Pegue o cargue el contenido del archivo STEP o IGES (STEP: sólo sólidos de caras planas)",
    options: [],
  },
  accepts: CAD_ACCEPT_TEXT,
};

const importCommand: CadCommandDescriptor<ImportState> = {
  name: "IMPORT",
  aliases: ["IMP"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: () => importPrompt,
  step: (state, input, context) => {
    if (input.kind === "cancel" || input.kind === "enter") return solidCancelled(state);
    if (input.kind !== "text") return importPrompt;
    const text = input.value.trim();
    if (!text) return solidMessage(state, "IMPORT no recibió ningún contenido de archivo.");
    try {
      const imported = importSolidEntity(text, {
        id: context.newEntityId(),
        layer: context.activeLayer,
      });
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: {
          kind: "document",
          commands: [{ type: "insert", entity: imported.entity }],
          label: `IMPORT ${imported.format.toUpperCase()}`,
        },
      };
    } catch (error) {
      return solidMessage(state, `IMPORT: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

interface ExportState {
  selection: readonly string[];
}

function exportStep_(state: ExportState): CadCommandStep<ExportState> {
  if (state.selection.length === 0)
    return {
      state,
      prompt: { message: "Designe los sólidos que exportar", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  return {
    state,
    prompt: {
      message: "Elija el formato de salida",
      options: [FORMAT_STEP, FORMAT_IGES],
      defaultOption: FORMAT_STEP.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

const exportCommand: CadCommandDescriptor<ExportState> = {
  name: "EXPORT",
  aliases: ["EXP"],
  kind: "inquiry",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: false,
  cursor: "pick",
  begin: (context) => exportStep_({ selection: context.selection }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (input.kind === "selection") return exportStep_({ selection: input.entityIds });
    if (input.kind === "entityPick")
      return exportStep_({ selection: [...new Set([...state.selection, input.entityId])] });
    if (input.kind !== "keyword" && input.kind !== "enter") return exportStep_(state);

    const solids = selectedSolids(context, state.selection);
    if (solids.length === 0)
      return solidMessage(state, "EXPORT necesita SOLID3D designados.");
    const format = input.kind === "keyword" && input.keyword === FORMAT_IGES.keyword ? "iges" : "step";
    const parts: string[] = [];
    for (const solid of solids) {
      try {
        parts.push(
          exportSolidEntity(solid, {
            format,
            // Marca de tiempo fija: un archivo que cambia con el reloj no se
            // puede comparar byte a byte entre dos corridas.
            timestamp: format === "step" ? CAD_INTEROP_EPOCH : "19700101.000000",
          }),
        );
      } catch (error) {
        return solidMessage(state, `EXPORT: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // NO dice «exportados». Decía «2 sólido(s) exportados a STEP» y no entrega
    // ningún archivo: ni descarga, ni petición al anfitrión, ni una línea
    // escrita en el documento. El texto STEP es real y está aquí entero, pero
    // «exportado» es lo que el dibujante entiende por «ya lo tengo en disco», y
    // eso no ha pasado. La orden declara su límite y entrega el texto.
    return solidMessage(
      state,
      `EXPORT no entrega ningún archivo: el motor no puede descargarlo y el anfitrión que lo guarde ` +
        `todavía no está montado. Éste es el texto ${format.toUpperCase()} de ${solids.length} sólido(s), ` +
        `tal cual:\n${parts.join("\n")}`,
    );
  },
};

export const CAD_SOLID_INTEROP_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(importCommand),
  asCadCommand(exportCommand),
];
