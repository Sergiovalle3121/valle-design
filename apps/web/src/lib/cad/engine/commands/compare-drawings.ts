/**
 * COMPARE: comparar el dibujo abierto con OTRO dibujo, y marcar lo que cambió.
 *
 * ## Qué no existía
 *
 * La fila «Compare» del producto comparaba dos INSTANTÁNEAS del mismo dibujo
 * por su hash (`snapshots.ts`) y contestaba «cambió: sí». Lo que un despacho
 * hace todas las semanas es otra cosa: le llega la revisión B del compañero y
 * necesita saber qué le hizo a la A. Eso es comparar dos ARCHIVOS, entidad por
 * entidad, y no había nada.
 *
 * El motor del diff vive en `lib/cad/compare-documents.ts` y las nubes en
 * `lib/cad/compare-revision-clouds.ts`. Aquí sólo está la orden: pedir el
 * dibujo, resolverlo, contar y escribir.
 *
 * ## El segundo dibujo entra por su IDENTIFICADOR DE ACTIVO, igual que XATTACH
 *
 * Y por la misma razón exacta: traer el contenido de un activo del inquilino es
 * I/O, y este motor es síncrono y puro. El anfitrión publica la biblioteca ya
 * cargada en `context.xrefCatalog()`, y una entrada con `snapshot` trae el
 * `CadDocument` entero. Con eso, COMPARE compara sin salir del motor y se
 * prueba en Node.
 *
 * Lo que se teclea es `activo` o `activo@revisión`, con la misma resolución por
 * nombre, id o ruta relativa que XATTACH: quien ya sabe referenciar un dibujo
 * no tiene que aprender otra sintaxis para compararlo.
 *
 * ## Cuál es «el nuevo» y cuál «la base», y por qué importa el orden
 *
 * El dibujo ABIERTO es el nuevo y el tecleado es la base. Así, «añadido»
 * significa «esto lo tiene mi dibujo y el suyo no», que es lo que un dibujante
 * quiere leer mirando su pantalla, y es también lo que hace que el verde de la
 * nube coincida con el verde de DWG Compare de AutoCAD, que marca en verde lo
 * que sólo está en el dibujo actual.
 *
 * ## Lo que en esta versión todavía no está
 *
 * Sin biblioteca —o con el activo listado pero sin contenido cargado— la orden
 * lo DICE y no compara. XATTACH resuelve ese caso con una petición de anfitrión
 * (`{kind:"xref-attach"}`), y COMPARE necesitaría la suya
 * (`{kind:"compare-fetch"}`), que vive en `engine/host-requests.ts`, fuera de
 * este frente: se pidió por escrito (P-express-04). Declarar el límite es la
 * salida que la regla 2 de cimientos admite; callar no lo es.
 */
import type { CadDocument } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  cadCompareDocuments,
  cadCompareEntryLine,
  cadCompareHeadline,
  type CadCompareResult,
} from "../../compare-documents";
import {
  cadCompareRevisionClouds,
  type CadCompareCloudPlan,
} from "../../compare-revision-clouds";
import type { CadXrefCatalogEntry } from "../../xref/xref-paths";
import {
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandDocumentView,
  type CadCommandStep,
} from "../command-types";

const NO_PROMPT = { message: "", options: [] } as const;
const LIST_KEYWORD = { keyword: "?", shortcut: "?" } as const;
const CLOUD_KEYWORD = { keyword: "Nubes", shortcut: "N" } as const;
const REPORT_KEYWORD = { keyword: "Informe", shortcut: "I" } as const;

/** Cuántas diferencias se detallan en el aviso antes de resumir el resto. */
const DETAIL_LIMIT = 12;

function say<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "message", text } };
}

function nothing<S>(state: S): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "none" } };
}

/**
 * El documento que los adaptadores de envolvente reciben.
 *
 * `CadCommandDocumentView` es un `Pick` del documento y les falta lo que ningún
 * adaptador de envolvente lee —historia, presentaciones, restricciones,
 * manifiesto y publicaciones—, así que se rellena vacío para satisfacer el
 * tipo. NO se escribe nunca: la escritura va por el lote, como siempre. Sin
 * esto, un INSERT no podría resolver su bloque y una nube alrededor de un
 * bloque saldría del tamaño equivocado.
 */
function asDocument(view: CadCommandDocumentView): CadDocument {
  return {
    ...view,
    history: [],
    paperSpaces: [],
    constraints: [],
    lossManifest: [],
    publications: [],
  };
}

/** Lo tecleado: `activo` o `activo@revisión`. Sin revisión, la vigente. */
function splitAsset(typed: string): { assetId: string; revision: string } {
  const at = typed.lastIndexOf("@");
  if (at <= 0) return { assetId: typed, revision: "UNIVERSAL" };
  return { assetId: typed.slice(0, at), revision: typed.slice(at + 1) || "UNIVERSAL" };
}

function catalogList(catalog: readonly CadXrefCatalogEntry[]): string {
  return catalog
    .map((entry) => `${entry.name}${entry.snapshot ? "" : " (sin contenido cargado)"}`)
    .join(", ");
}

function findEntry(
  catalog: readonly CadXrefCatalogEntry[],
  typed: string,
): CadXrefCatalogEntry | undefined {
  const { assetId, revision } = splitAsset(typed.trim());
  const needle = assetId.trim().toLocaleLowerCase();
  const matches = catalog.filter(
    (candidate) =>
      candidate.name.toLocaleLowerCase() === needle ||
      candidate.assetId.toLocaleLowerCase() === needle ||
      (candidate.relativePath ?? "").toLocaleLowerCase() === needle,
  );
  if (matches.length === 0) return undefined;
  // Con revisión explícita, sólo esa. Sin ella, la vigente si está y si no la
  // primera: pedir «plantas/base» y recibir una revisión al azar sería peor que
  // no encontrarla, así que la vigente gana siempre que exista.
  if (revision !== "UNIVERSAL")
    return matches.find((candidate) => candidate.revision.toLocaleLowerCase() === revision.toLocaleLowerCase());
  return matches.find((candidate) => candidate.revision === "UNIVERSAL") ?? matches[0];
}

const NO_CATALOG =
  "COMPARE: el estudio no publica todavía la biblioteca de dibujos del inquilino, así que no hay " +
  "con qué comparar. El segundo dibujo entra por su identificador de activo, igual que en XATTACH.";

const NO_DOCUMENT = "COMPARE: el anfitrión no expone el documento, así que no hay nada que comparar.";

const noContent = (entry: CadXrefCatalogEntry) =>
  `COMPARE: «${entry.name}» está en la biblioteca pero su contenido no está cargado, y comparar ` +
  "exige leerlo entero. Ábralo una vez o adjúntelo con XATTACH y vuelva a comparar.";

// ---------------------------------------------------------------------------

interface CompareState {
  /** El dibujo elegido, ya con su contenido. */
  entry: CadXrefCatalogEntry | null;
  comparison: CadCompareResult | null;
}

const EMPTY: CompareState = { entry: null, comparison: null };

function askDrawing(state: CompareState, catalog: readonly CadXrefCatalogEntry[]): CadCommandStep<CompareState> {
  return {
    state,
    prompt: {
      message: catalog.length
        ? `Indique el dibujo con el que comparar (${catalogList(catalog)})`
        : "Indique el dibujo con el que comparar (activo o activo@revisión)",
      options: catalog.length ? [LIST_KEYWORD] : [],
    },
    accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
  };
}

function askAction(state: CompareState, headline: string): CadCommandStep<CompareState> {
  return {
    state,
    prompt: {
      message: `${headline} ¿Marcar con nubes de revisión o sólo el informe?`,
      options: [CLOUD_KEYWORD, REPORT_KEYWORD],
      defaultOption: CLOUD_KEYWORD.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

/** El informe: el renglón de las cuatro clases y el detalle, acotado. */
function reportText(comparison: CadCompareResult, name: string): string {
  const changed = comparison.entries.filter((entry) => entry.kind !== "equal");
  const lines = changed.slice(0, DETAIL_LIMIT).map(cadCompareEntryLine);
  const rest = changed.length - lines.length;
  return [
    `COMPARE contra «${name}»: ${cadCompareHeadline(comparison.summary)}`,
    ...lines,
    ...(rest > 0 ? [`… y ${rest} diferencia(s) más.`] : []),
  ].join("\n");
}

function cloudNotice(comparison: CadCompareResult, name: string, plan: CadCompareCloudPlan): string {
  const byClass = (kind: string) => plan.clouds.filter((cloud) => cloud.cloudClass === kind).length;
  return [
    `COMPARE contra «${name}»: ${cadCompareHeadline(comparison.summary)}`,
    `${plan.clouds.length} nube(s) de revisión: ${byClass("nuevo")} en VD-COMPARE-NUEVO, ` +
      `${byClass("borrado")} en VD-COMPARE-BORRADO y ${byClass("cambiado")} en VD-COMPARE-CAMBIADO.`,
    ...(plan.withoutBounds > 0
      ? [
          `${plan.withoutBounds} diferencia(s) se quedaron sin nube: su tipo no tiene envolvente ` +
            "calculable en este dibujo.",
        ]
      : []),
  ].join("\n");
}

const SAME =
  "COMPARE: los dos dibujos son iguales entidad por entidad. No se ha escrito nada — un dibujo sin " +
  "diferencias no se ensucia con capas ni nubes vacías.";

/**
 * COMPARE. Dos pasos: qué dibujo, y qué hacer con lo que se encuentre.
 *
 * Comparar un dibujo consigo mismo termina en un MENSAJE y con el documento
 * intacto. Es la salida correcta y es deliberada: emitir un lote vacío daría un
 * paso de deshacer que no deshace nada, y crear las tres capas «por si acaso»
 * dejaría tres capas vacías en un dibujo que no cambió.
 */
const compareCommand: CadCommandDescriptor<CompareState> = {
  name: "COMPARE",
  aliases: ["DWGCOMPARE", "COMPARAR"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: (context) => askDrawing(EMPTY, context.xrefCatalog?.() ?? []),
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);
    const catalog = context.xrefCatalog?.() ?? [];
    const view = context.document?.();
    if (!view) return say(state, NO_DOCUMENT);

    if (!state.entry || !state.comparison) {
      if (input.kind === "keyword" && input.keyword === LIST_KEYWORD.keyword)
        return say(state, catalog.length ? `Dibujos disponibles: ${catalogList(catalog)}.` : NO_CATALOG);
      if (input.kind !== "text") return askDrawing(state, catalog);
      const typed = input.value.trim();
      if (!typed) return askDrawing(state, catalog);
      if (typed === "?")
        return say(state, catalog.length ? `Dibujos disponibles: ${catalogList(catalog)}.` : NO_CATALOG);
      if (catalog.length === 0) return say(state, NO_CATALOG);

      const entry = findEntry(catalog, typed);
      if (!entry)
        return say(
          state,
          `COMPARE: no hay ningún dibujo «${typed}» en la biblioteca. Disponibles: ${catalogList(catalog)}.`,
        );
      if (!entry.snapshot) return say(state, noContent(entry));

      // El ajeno es la BASE y el abierto el nuevo: así «añadido» es «esto lo
      // tiene mi dibujo», que es lo que se lee mirando la pantalla.
      const comparison = cadCompareDocuments(entry.snapshot.document, view);
      if (comparison.summary.added + comparison.summary.deleted + comparison.summary.modified === 0)
        return say(state, `${SAME} (${comparison.summary.equal} entidad(es) en «${entry.name}»).`);
      return askAction(
        { entry, comparison },
        `COMPARE contra «${entry.name}»: ${cadCompareHeadline(comparison.summary)}`,
      );
    }

    const { entry, comparison } = state;
    const wantsReport =
      input.kind === "keyword" && input.keyword === REPORT_KEYWORD.keyword;
    if (input.kind !== "enter" && input.kind !== "keyword")
      return askAction(state, `COMPARE contra «${entry.name}»: ${cadCompareHeadline(comparison.summary)}`);
    if (wantsReport) return say(state, reportText(comparison, entry.name));

    const plan = cadCompareRevisionClouds(comparison, {
      before: entry.snapshot?.document,
      after: asDocument(view),
      existingLayers: view.layers.map((layer) => layer.name),
    });
    if (plan.commands.length === 0)
      return say(
        state,
        `COMPARE: hay ${comparison.summary.added + comparison.summary.deleted + comparison.summary.modified} ` +
          "diferencia(s), pero ninguna tiene envolvente calculable, así que no hay dónde poner la nube. " +
          `Use ${REPORT_KEYWORD.keyword} para verlas listadas.`,
      );
    return {
      state,
      prompt: NO_PROMPT,
      accepts: 0,
      result: {
        kind: "document",
        commands: plan.commands as readonly CadEntityCommand[],
        label: "COMPARE",
        notice: cloudNotice(comparison, entry.name, plan),
      },
    };
  },
};

export const CAD_COMPARE_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(compareCommand)];
