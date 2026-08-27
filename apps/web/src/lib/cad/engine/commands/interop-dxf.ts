/**
 * DXFIN y DXFOUT: el archivo del cliente ENTRA y SALE por la línea de comandos.
 *
 * ## Por qué esta orden existe y por qué es la primera
 *
 * Un despacho no cambia de CAD por el precio. Cambia cuando el coste de cambiar
 * es casi cero, y el coste lo pone el intercambio de planos: el estructurista
 * manda su DXF, el instalador devuelve el suyo, el municipio pide el conjunto.
 * Un dibujante que teclea `DXFIN` —lo mismo que teclea desde hace treinta años—
 * y no obtiene NADA cierra la pestaña. Hasta hoy eso era literal: los alias
 * `DXFIN` y `DXFOUT` estaban declarados en la tabla y no había ningún
 * descriptor detrás, así que aparecían en el inventario de alias pendientes.
 *
 * ## Lo que este archivo NO hace
 *
 * No lee ni escribe DXF. El lector (`dxf-import.ts`), el escritor
 * (`dxf-export.ts`), el puente con el documento canónico
 * (`dxf-cad-document.ts`) y el manifiesto de pérdidas
 * (`dxf-export-loss-manifest.ts`) ya existían, probados sobre texto DXF real.
 * Aquí sólo se CABLEAN a la línea de comandos. Reimplementar cualquiera de los
 * cuatro habría creado un segundo dialecto con sus propias diferencias.
 *
 * ## Por dónde entra el archivo y por dónde sale
 *
 * Los dos usan canales distintos, y no por capricho:
 *
 * · `DXFIN` pide el archivo por el canal de INTERFAZ (`dxf-file`). Leer un
 *   fichero es del navegador, y volver a meter su contenido por el motor es del
 *   anfitrión: el comando está dentro del motor y no puede reentrar en él sin
 *   reentrar en sí mismo. Es exactamente el reparto de `SCRIPT`. Pegar el texto
 *   también funciona, y es lo que hace probable la orden en Node.
 * · `DXFOUT` sale por el canal del ANFITRIÓN (`dxf-export`). El fichero se
 *   fabrica ENTERO aquí dentro —escribir DXF es aritmética sobre cadenas— y lo
 *   único que queda fuera es la descarga. Mismo reparto que `PLOT`.
 *
 * ## Fallo cerrado
 *
 * Un DXF que no se puede leer, una selección vacía o un dibujo sin nada que
 * exportar terminan en un mensaje que dice qué pasó. Nunca en un lote vacío
 * aplicado con éxito ni en un archivo de cero entidades que parece un plano.
 */
import type { CadEntityCommand } from "../../entity-commands";
import type { CadEntity, CadLayerDef, CadLossManifestEntry } from "../../cad-document";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  cadDxfBlocksToCadDocumentParts,
  cadDxfHatchesToNativeEntities,
  cadDxfMleadersToNativeEntities,
  cadDxfMTextsToNativeEntities,
  cadDxfPrimitivesToCanonicalEntities,
  cadDxfSemanticDimensionsToNativeEntities,
} from "../../dxf-cad-document";
import {
  exportCadDocumentDxf,
  type CadDxfDocumentExportSource,
} from "../../dxf-document-export";
import { importDxfPrimitives } from "../../dxf-import";
import {
  buildCadDxfImportReport,
  type CadDxfImportReport,
  type CadDxfImportReportRow,
} from "../../dxf-import-report";
import { scopeDxfImportToModelSpace } from "../../dxf-model-space-scope";
import {
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

// ---------------------------------------------------------------------------
// Utilidades compartidas
// ---------------------------------------------------------------------------

/** Paso terminal que sólo dice algo. Se usa para todos los fallos cerrados. */
function say<S>(state: S, text: string): CadCommandStep<S> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
}

/** Paso terminal que no hace nada: Esc sobre un comando que no llegó a mutar. */
function quiet<S>(state: S): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

const IMPORT_PROVIDER = "native-dxf";

// ---------------------------------------------------------------------------
// DXFIN — el plan de importación, puro y probable
// ---------------------------------------------------------------------------

export type CadDxfImportPlan =
  | { ok: true; commands: readonly CadEntityCommand[]; report: CadDxfImportReport }
  | { ok: false; reason: string };

/**
 * Tipos de entidad canónica que el lote de comandos SABE insertar.
 *
 * `CadNativeEntity` los declara, pero declararlos en un tipo no permite
 * filtrar en tiempo de ejecución, y aquí llega lo que traiga un fichero ajeno.
 * La lista se deriva de los adaptadores registrados: una entidad fuera de ella
 * reventaría al dibujarse, así que se convierte o se declara — nunca se cuela.
 */
const INSERTABLE_TYPES: ReadonlySet<string> = new Set([
  "line", "polyline", "circle", "arc", "ellipse", "spline", "hatch", "text", "mtext",
  "dimension", "mleader", "insert", "point", "xline", "ray", "solid", "wipeout",
  "image", "attdef", "table", "solid3d", "region", "wall",
]);

/** La lista de arriba y `CadNativeEntity` se editan JUNTAS: son la misma. */
function isInsertable(entity: CadEntity): entity is CadNativeEntity {
  return INSERTABLE_TYPES.has(entity.type);
}

/**
 * Prepara todo lo que `DXFIN` va a aplicar, sin aplicar nada.
 *
 * Separado del descriptor a propósito: así el plan se prueba con texto DXF real
 * sin montar una máquina de estados, y el descriptor queda reducido a los tres
 * pasos de conversación que de verdad le tocan.
 *
 * `existingLayers` son las capas que YA tiene el dibujo. Sólo se crean las que
 * faltan: un `upsert` sobre una capa existente reescribiría su color y su
 * visibilidad, y una importación que te repinta las capas del proyecto es una
 * importación que nadie repite.
 */
export function planCadDxfImport(
  source: string,
  options: {
    newEntityId: () => string;
    existingLayers?: readonly string[];
  },
): CadDxfImportPlan {
  const text = source.trim();
  if (!text) return { ok: false, reason: "DXFIN no recibió ningún contenido de archivo." };

  const result = importDxfPrimitives(text);
  // Fallo cerrado número uno: si el tokenizador no reconoció el fichero, no hay
  // nada que negociar. Un DWG renombrado a `.dxf` llega aquí, y decirlo con su
  // nombre ahorra la media hora que el dibujante pasaría buscando el error en
  // su dibujo.
  if (result.warnings.some((warning) => warning.code === "parse_failed"))
    return {
      ok: false,
      reason:
        "DXFIN: el archivo no se pudo leer como DXF de texto. Comprueba que no sea un DWG renombrado " +
        "y que la descarga no se cortase a medias.",
    };

  const importOptions = { idPrefix: options.newEntityId(), provider: IMPORT_PROVIDER };
  // Las primitivas que vienen de expandir un INSERT NO se insertan sueltas: el
  // bloque viaja entero por `cadDxfBlocksToCadDocumentParts` y meter además su
  // geometría explotada dejaría cada mueble dibujado dos veces. Las de espacio
  // papel tampoco: ver `dxf-model-space-scope.ts` — DXFIN mete un archivo
  // ajeno DENTRO de este dibujo, y su hoja de plano no es parte del dibujo.
  const scoped = scopeDxfImportToModelSpace(result);
  const canonical = cadDxfPrimitivesToCanonicalEntities(scoped.primitives, importOptions);
  const blockParts = cadDxfBlocksToCadDocumentParts(result.blocks, scoped.inserts, importOptions);

  const entities: CadNativeEntity[] = [];
  for (const entity of canonical) {
    if (isInsertable(entity)) entities.push(entity);
  }
  entities.push(
    ...cadDxfHatchesToNativeEntities(scoped.hatches, importOptions),
    ...cadDxfMTextsToNativeEntities(scoped.mtexts, importOptions),
    ...cadDxfSemanticDimensionsToNativeEntities(scoped.semanticDimensions, importOptions),
    ...cadDxfMleadersToNativeEntities(scoped.mleaders, importOptions),
    ...blockParts.inserts,
  );

  // Fallo cerrado número dos: un fichero legible del que no sale ni una
  // entidad. Aplicar un lote vacío se vería como un éxito silencioso, que es la
  // peor forma de fallar en un producto de intercambio.
  if (entities.length === 0 && blockParts.blocks.length === 0)
    return {
      ok: false,
      reason:
        "DXFIN: el archivo se leyó, pero no trae ninguna entidad que este dibujo sepa representar. " +
        "Nada ha cambiado.",
    };

  const known = new Set(options.existingLayers ?? []);
  const commands: CadEntityCommand[] = [];
  for (const name of result.layers) {
    if (known.has(name)) continue;
    commands.push({ type: "layer", op: "upsert", layer: newLayer(name) });
  }
  for (const block of blockParts.blocks) commands.push({ type: "block", op: "define", definition: block });
  for (const entity of entities) commands.push({ type: "insert", entity });

  const extraRows: CadDxfImportReportRow[] = [];

  return {
    ok: true,
    commands,
    report: buildCadDxfImportReport(
      result,
      { entityCount: entities.length, blockCount: blockParts.blocks.length },
      extraRows,
    ),
  };
}

/** Capa nueva con los valores de fábrica. El nombre viene del fichero. */
function newLayer(name: string): CadLayerDef {
  return { id: name, name, color: "#ffffff", visible: true, locked: false };
}

// ---------------------------------------------------------------------------
// DXFIN — el descriptor
// ---------------------------------------------------------------------------

const FILE_KEYWORD = { keyword: "Archivo", shortcut: "A" } as const;
const YES_KEYWORD = { keyword: "Sí", shortcut: "S" } as const;
const NO_KEYWORD = { keyword: "No", shortcut: "N" } as const;

const DXFIN_UNAVAILABLE =
  "Este espacio de trabajo no sabe abrir un archivo. Pega el contenido del DXF en la línea de " +
  "comandos: hace exactamente lo mismo.";

interface DxfInState {
  /** El plan ya calculado, a la espera de que el usuario confirme. */
  pending: CadDxfImportPlan | null;
}

const dxfInAsk: CadCommandStep<DxfInState> = {
  state: { pending: null },
  prompt: {
    message: "Pega el contenido del DXF que importar",
    options: [FILE_KEYWORD],
    defaultOption: FILE_KEYWORD.keyword,
  },
  accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
};

/**
 * El paso que hace honesto al producto: qué se conservó y qué no, ANTES de
 * tocar el dibujo.
 *
 * AutoCAD no te dice qué perdió al importar. Aquí se dice, en español y con
 * números, y el usuario decide. Que sea un paso del comando y no un cuadro
 * aparte es lo que garantiza que no se pueda saltar.
 */
function confirmStep(plan: Extract<CadDxfImportPlan, { ok: true }>): CadCommandStep<DxfInState> {
  const lines = plan.report.rows
    .filter((row) => row.fidelity !== "kept")
    .map((row) => `  · ${row.detail}`);
  return {
    state: { pending: plan },
    prompt: {
      message: [plan.report.headline, ...lines, "¿Insertar en el dibujo?"].join("\n"),
      options: [YES_KEYWORD, NO_KEYWORD],
      defaultOption: YES_KEYWORD.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

const dxfInCommand: CadCommandDescriptor<DxfInState> = {
  name: "DXFIN",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: () => dxfInAsk,
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return say(state, "DXFIN cancelado. El dibujo no ha cambiado.");

    // --- segunda fase: el plan está calculado y falta confirmar --------------
    const pending = state.pending;
    if (pending && pending.ok) {
      const plan = pending;
      if (input.kind === "keyword" && input.keyword === NO_KEYWORD.keyword)
        return say(state, "DXFIN cancelado. El dibujo no ha cambiado.");
      if (input.kind !== "keyword" && input.kind !== "enter") return confirmStep(plan);
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: {
          kind: "document",
          commands: plan.commands,
          label: `DXFIN (${plan.report.entityCount} entidades)`,
        },
      };
    }

    // --- primera fase: conseguir el texto ------------------------------------
    if (input.kind === "keyword" || input.kind === "enter")
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: {
          kind: "ui",
          request: {
            target: "dxf-file",
            params: { mode: "import" },
            unavailable: DXFIN_UNAVAILABLE,
          },
          text: "Elige el archivo .dxf que importar.",
        },
      };
    if (input.kind !== "text") return dxfInAsk;

    const plan = planCadDxfImport(input.value, {
      newEntityId: context.newEntityId,
      existingLayers: (context.layers?.() ?? []).map((layer) => layer.name),
    });
    return plan.ok ? confirmStep(plan) : say(state, plan.reason);
  },
};

// ---------------------------------------------------------------------------
// DXFOUT — el plan de exportación, puro y probable
// ---------------------------------------------------------------------------

export interface CadDxfExportPlan {
  content: string;
  entityCount: number;
  layers: readonly string[];
  losses: readonly CadLossManifestEntry[];
}

/**
 * Fabrica el DXF completo y su manifiesto de pérdidas.
 *
 * El ensamblaje entero vive en `dxf-document-export.ts` y no aquí: el mismo
 * archivo lo produce esta orden y lo produce el generador de la matriz del
 * corpus, y dos ensamblajes paralelos acabarían escribiendo dos ficheros
 * distintos para el mismo dibujo — con la matriz certificando el que nadie usa.
 */
export function planCadDxfExport(
  document: CadDxfDocumentExportSource,
  scope?: (entityId: string) => boolean,
): CadDxfExportPlan {
  return exportCadDocumentDxf(
    document,
    scope ? (entity: CadEntity) => scope(entity.id) : undefined,
  );
}

// ---------------------------------------------------------------------------
// DXFOUT — el descriptor
// ---------------------------------------------------------------------------

const ALL_KEYWORD = { keyword: "Todo", shortcut: "T" } as const;
const SELECTION_KEYWORD = { keyword: "Selección", shortcut: "S" } as const;

interface DxfOutState {
  /** `null` mientras no se ha elegido el ámbito. */
  scope: "all" | "selection" | null;
}

const dxfOutScope: CadCommandStep<DxfOutState> = {
  state: { scope: null },
  prompt: {
    message: "Qué exportar a DXF",
    options: [ALL_KEYWORD, SELECTION_KEYWORD],
    defaultOption: ALL_KEYWORD.keyword,
  },
  accepts: CAD_ACCEPT_KEYWORD,
};

function dxfOutName(scope: "all" | "selection", suggested: string): CadCommandStep<DxfOutState> {
  return {
    state: { scope },
    prompt: {
      message: "Nombre del archivo DXF",
      options: [],
      defaultValue: suggested,
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

/**
 * Nombre por defecto.
 *
 * El documento canónico NO guarda un título —`CadDocumentMeta` lleva versión,
 * esquema y unidad, y nada más—, así que deducirlo del contenido sería
 * adivinar. Se propone un nombre neutro, visible entre ángulos en el prompt, y
 * el usuario escribe el suyo: es lo que hace de todas formas antes de mandar el
 * archivo al estructurista.
 */
const DEFAULT_DXF_FILE_NAME = "dibujo.dxf";

const dxfOutCommand: CadCommandDescriptor<DxfOutState> = {
  name: "DXFOUT",
  aliases: [],
  kind: "inquiry",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: (context) =>
    // Sin lectura del documento no hay nada que escribir, y decirlo es más útil
    // que producir un DXF vacío que parece un plano en blanco.
    context.document
      ? dxfOutScope
      : say({ scope: null }, "DXFOUT no puede leer el dibujo en este espacio de trabajo."),
  step: (state, input, context) => {
    if (input.kind === "cancel") return quiet(state);
    const view = context.document?.();
    if (!view) return say(state, "DXFOUT no puede leer el dibujo en este espacio de trabajo.");

    // --- primera fase: ámbito -------------------------------------------------
    if (state.scope === null) {
      if (input.kind !== "keyword" && input.kind !== "enter") return dxfOutScope;
      const scope =
        input.kind === "keyword" && input.keyword === SELECTION_KEYWORD.keyword
          ? "selection"
          : "all";
      // Fallo cerrado: «exporta lo designado» sin nada designado no puede
      // resolverse como «exporta todo». Son dos ficheros muy distintos y el
      // usuario no vería la diferencia hasta que el cliente la viese.
      if (scope === "selection" && context.selection.length === 0)
        return say(state, "DXFOUT: no hay nada designado que exportar.");
      return dxfOutName(scope, DEFAULT_DXF_FILE_NAME);
    }

    // --- segunda fase: nombre y entrega --------------------------------------
    if (input.kind !== "text" && input.kind !== "enter") return dxfOutName(state.scope, DEFAULT_DXF_FILE_NAME);
    const typed = input.kind === "text" ? input.value.trim() : "";
    const fileName = /\.dxf$/i.test(typed) ? typed : typed ? `${typed}.dxf` : DEFAULT_DXF_FILE_NAME;

    const selected = new Set(context.selection);
    const plan = planCadDxfExport(
      { ...view, layers: view.layers },
      state.scope === "selection" ? (id) => selected.has(id) : undefined,
    );
    // Fallo cerrado: un DXF sin una sola entidad se abre en cualquier visor y
    // parece un plano vacío. Es indistinguible de haber perdido el trabajo.
    if (plan.entityCount === 0)
      return say(
        state,
        state.scope === "selection"
          ? "DXFOUT: lo designado no produce ninguna entidad exportable. No se ha escrito ningún archivo."
          : "DXFOUT: el dibujo no tiene ninguna entidad exportable. No se ha escrito ningún archivo.",
      );

    return {
      state,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: {
        kind: "host",
        request: {
          kind: "dxf-export",
          fileName,
          content: plan.content,
          entityCount: plan.entityCount,
          layers: plan.layers,
          losses: plan.losses,
        },
        label: `DXFOUT ${fileName}`,
      },
    };
  },
};

export const CAD_DXF_INTEROP_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(dxfInCommand),
  asCadCommand(dxfOutCommand),
];
