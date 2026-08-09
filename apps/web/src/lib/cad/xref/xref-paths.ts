/**
 * Cómo se encuentra el dibujo al que apunta una referencia externa.
 *
 * ## Por qué esto decide si un proyecto abre en otra máquina
 *
 * Un xref guardado con una sola ruta se rompe en cuanto el proyecto cambia de
 * sitio: si es absoluta, falla al mover la carpeta; si es relativa, falla al
 * abrir el dibujo desde otro directorio. AutoCAD guarda las dos y además busca
 * por nombre en las rutas de soporte. Aquí se guardan las TRES y se resuelven
 * en ese orden:
 *
 *   1. **Relativa** (`reference.relativePath`): lo que hace que el proyecto
 *      entero sea movible. Se intenta primero a propósito.
 *   2. **Absoluta** (`reference.uri`, el URI de activo del inquilino): exacta,
 *      pero atada a dónde estaba el activo cuando se adjuntó.
 *   3. **Búsqueda por nombre** (`reference.name`): la red de seguridad. Si dos
 *      activos comparten nombre es AMBIGUA, y una ambigüedad no se resuelve en
 *      silencio: se dice.
 *
 * ## Y se DICE cuál se usó
 *
 * `via` viaja en el resultado para que la interfaz lo enseñe. No es un detalle
 * de depuración: cuando un xref aparece en el sitio equivocado, saber que se
 * resolvió «por búsqueda» en vez de «por ruta relativa» es la diferencia entre
 * arreglarlo en un minuto y no entender nada. Y cuando FALLA, `attempts` dice
 * qué se intentó y con qué, que es la otra mitad de la misma pregunta.
 */
import type { CadExternalReference } from "../cad-document";

/** Un activo del inquilino que se puede referenciar. */
export interface CadXrefCatalogEntry {
  assetId: string;
  revision: string;
  name: string;
  /** URI canónico `tenant-layout://<assetId>/<revision>`. */
  uri: string;
  /** Ruta relativa dentro del proyecto, si la tiene. */
  relativePath?: string;
}

export type CadXrefPathStrategy = "relative" | "absolute" | "search";

export interface CadXrefPathAttempt {
  strategy: CadXrefPathStrategy;
  /** Lo que se buscó. Vacío si la referencia no guarda esa ruta. */
  query: string;
  outcome: "hit" | "miss" | "ambiguous" | "absent";
}

export type CadXrefPathResolution =
  | { found: true; via: CadXrefPathStrategy; entry: CadXrefCatalogEntry; attempts: CadXrefPathAttempt[]; detail: string }
  | { found: false; attempts: CadXrefPathAttempt[]; detail: string };

const fold = (value: string) => value.trim().toLocaleLowerCase();

/** Las tres rutas que se guardan de una referencia, en el orden en que se prueban. */
export function cadXrefStoredPaths(
  reference: Pick<CadExternalReference, "relativePath" | "uri" | "name">,
): Record<CadXrefPathStrategy, string> {
  return {
    relative: reference.relativePath?.trim() ?? "",
    absolute: reference.uri?.trim() ?? "",
    search: reference.name?.trim() ?? "",
  };
}

const LABEL: Record<CadXrefPathStrategy, string> = {
  relative: "ruta relativa",
  absolute: "ruta absoluta",
  search: "búsqueda por nombre",
};

/** Etiqueta legible de una estrategia, para la interfaz. */
export const cadXrefStrategyLabel = (strategy: CadXrefPathStrategy) => LABEL[strategy];

export function cadResolveXrefPath(
  reference: Pick<CadExternalReference, "relativePath" | "uri" | "name">,
  catalog: readonly CadXrefCatalogEntry[],
): CadXrefPathResolution {
  const paths = cadXrefStoredPaths(reference);
  const attempts: CadXrefPathAttempt[] = [];

  const tryStrategy = (
    strategy: CadXrefPathStrategy,
    matches: (entry: CadXrefCatalogEntry) => boolean,
  ): CadXrefCatalogEntry | null => {
    const query = paths[strategy];
    if (!query) {
      attempts.push({ strategy, query: "", outcome: "absent" });
      return null;
    }
    const hits = catalog.filter(matches);
    if (hits.length === 1) {
      attempts.push({ strategy, query, outcome: "hit" });
      return hits[0];
    }
    attempts.push({ strategy, query, outcome: hits.length > 1 ? "ambiguous" : "miss" });
    return null;
  };

  const relative = tryStrategy("relative", (entry) => fold(entry.relativePath ?? "") === fold(paths.relative));
  if (relative)
    return { found: true, via: "relative", entry: relative, attempts, detail: describe("relative", relative, paths.relative) };

  const absolute = tryStrategy("absolute", (entry) => fold(entry.uri) === fold(paths.absolute));
  if (absolute)
    return { found: true, via: "absolute", entry: absolute, attempts, detail: describe("absolute", absolute, paths.absolute) };

  const search = tryStrategy("search", (entry) => fold(entry.name) === fold(paths.search));
  if (search)
    return { found: true, via: "search", entry: search, attempts, detail: describe("search", search, paths.search) };

  return { found: false, attempts, detail: describeFailure(reference.name ?? "", attempts) };
}

function describe(strategy: CadXrefPathStrategy, entry: CadXrefCatalogEntry, query: string): string {
  return `${entry.name} resuelto por ${LABEL[strategy]} (${query}) → ${entry.assetId}@${entry.revision}.`;
}

/**
 * El mensaje del fallo dice QUÉ se intentó y con qué. «No se encuentra» a secas
 * deja al dibujante sin nada que arreglar.
 */
function describeFailure(name: string, attempts: readonly CadXrefPathAttempt[]): string {
  const explained = attempts
    .map((attempt) => {
      if (attempt.outcome === "absent") return `${LABEL[attempt.strategy]}: no guardada`;
      if (attempt.outcome === "ambiguous")
        return `${LABEL[attempt.strategy]}: "${attempt.query}" apunta a varios activos`;
      return `${LABEL[attempt.strategy]}: "${attempt.query}" no existe`;
    })
    .join("; ");
  return `No se encuentra la referencia ${name || "externa"}. ${explained}.`;
}

/**
 * Las tres rutas que hay que GUARDAR al adjuntar. Guardar sólo la que se usó
 * es lo que rompe el proyecto en la siguiente máquina.
 */
export function cadXrefPathFields(entry: CadXrefCatalogEntry): Pick<CadExternalReference, "uri" | "relativePath" | "name"> {
  return {
    uri: entry.uri,
    relativePath: entry.relativePath?.trim() || `${entry.assetId}@${entry.revision}`,
    name: entry.name,
  };
}
