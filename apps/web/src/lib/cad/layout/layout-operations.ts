/**
 * Presentaciones: crear, copiar, renombrar, borrar y partir de plantilla.
 *
 * ## Qué es una presentación aquí
 *
 * Una `CadPaperSpace` del esquema: una hoja con su papel, sus márgenes, su
 * cajetín y sus ventanas gráficas. `paper-space.ts` ya sabe fabricar una y
 * `cad-layout-manager.ts` ya sabe manipular sus ventanas. Lo que faltaba —y es
 * lo que hay aquí— son las operaciones de PESTAÑA: las cinco cosas que se
 * hacen con el botón derecho sobre la barra de presentaciones, y que hasta
 * ahora no tenían ni comando ni función.
 *
 * ## Todo son funciones puras que devuelven ÓRDENES
 *
 * Ninguna toca el documento. Devuelven `CadEntityCommand[]` de tipo
 * `paper-space`, que es la única vía por la que se escribe la sección. Así
 * crear una pestaña con dos ventanas y su escala fijada es UN lote y UN paso
 * de deshacer, igual que dibujar una polilínea de treinta vértices.
 *
 * ## Las plantillas
 *
 * Una plantilla no es un archivo: es un tamaño de papel, una orientación, unos
 * márgenes y un cajetín. Se declaran aquí, con nombres que un delineante
 * reconoce (`A1 apaisado`, `A3 vertical`), porque la alternativa —pedir el
 * papel, la orientación y los cuatro márgenes cada vez que se crea una
 * pestaña— es la clase de fricción por la que la gente acaba copiando la hoja
 * anterior y arrastrando sus errores.
 */
import type { CadDocument, CadPaperSpace, CadPaperViewport } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import {
  createCadPaperSpace,
  type CadModelBounds,
  type CadSheetMetadata,
  type CadSheetPaper,
} from "../paper-space";

export interface CadLayoutTemplate {
  id: string;
  label: string;
  paper: CadSheetPaper;
  orientation: "portrait" | "landscape";
  margins: { top: number; right: number; bottom: number; left: number };
  colorMode: "color" | "monochrome";
  lineweightScale: number;
}

const ISO_MARGINS = { top: 10, right: 10, bottom: 10, left: 20 } as const;

/**
 * Márgenes ISO 5457: 20 mm a la izquierda para el archivado, 10 en el resto.
 * No es un detalle decorativo — un plano perforado sobre el margen de 10 mm se
 * agujerea encima del dibujo.
 */
export const CAD_LAYOUT_TEMPLATES: readonly CadLayoutTemplate[] = (
  [
    { id: "a4-portrait", label: "A4 vertical", paper: "A4", orientation: "portrait" },
    { id: "a4-landscape", label: "A4 apaisado", paper: "A4", orientation: "landscape" },
    { id: "a3-landscape", label: "A3 apaisado", paper: "A3", orientation: "landscape" },
    { id: "a2-landscape", label: "A2 apaisado", paper: "A2", orientation: "landscape" },
    { id: "a1-landscape", label: "A1 apaisado", paper: "A1", orientation: "landscape" },
    { id: "a0-landscape", label: "A0 apaisado", paper: "A0", orientation: "landscape" },
  ] as const
).map((base) => ({
  ...base,
  margins: { ...ISO_MARGINS },
  colorMode: "monochrome" as const,
  lineweightScale: 1,
}));

export function cadLayoutTemplate(id: string): CadLayoutTemplate | undefined {
  return CAD_LAYOUT_TEMPLATES.find((template) => template.id === id);
}

/** Nombres de pestaña existentes, en minúsculas, para comparar sin distinguir. */
function takenNames(spaces: readonly CadPaperSpace[], except?: string): Set<string> {
  return new Set(
    spaces
      .filter((space) => space.id !== except)
      .map((space) => space.name.trim().toLowerCase()),
  );
}

/**
 * Nombre libre a partir de uno propuesto: `Plano`, `Plano (2)`, `Plano (3)`…
 *
 * AutoCAD no deja dos presentaciones con el mismo nombre, y con razón: el
 * nombre de la pestaña es lo que aparece en el conjunto de planos y en el
 * campo `LAYOUTNAME` del cajetín, así que dos iguales dan dos planos
 * indistinguibles en la carpeta del cliente.
 */
export function uniqueCadLayoutName(
  spaces: readonly CadPaperSpace[],
  proposed: string,
  except?: string,
): string {
  const taken = takenNames(spaces, except);
  const base = proposed.trim() || "Presentación";
  if (!taken.has(base.toLowerCase())) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} (${index})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})`;
}

export interface CadLayoutCreateInput {
  id: string;
  name: string;
  templateId?: string;
  modelBounds: CadModelBounds;
  unit?: string;
  metadata: CadSheetMetadata;
  /** Escala inicial de la ventana. Sin ella, se ajusta al papel. */
  scale?: number;
}

/**
 * Crea una presentación con una ventana que encuadra el modelo.
 *
 * Una hoja sin ventana no sirve para nada —es papel con cajetín— y obligar a
 * ejecutar MVIEW justo después es un paso que nadie quiere dar. Se crea con
 * una, como hace AutoCAD.
 */
export function createCadLayout(
  spaces: readonly CadPaperSpace[],
  input: CadLayoutCreateInput,
): CadPaperSpace {
  const template = input.templateId ? cadLayoutTemplate(input.templateId) : undefined;
  const space = createCadPaperSpace({
    id: input.id,
    name: uniqueCadLayoutName(spaces, input.name),
    order: spaces.length,
    paper: template?.paper,
    orientation: template?.orientation,
    modelBounds: input.modelBounds,
    unit: input.unit,
    metadata: input.metadata,
    ...(input.scale !== undefined ? { scale: input.scale } : {}),
  });
  if (!template) return space;
  return {
    ...space,
    pageSetup: {
      ...(space.pageSetup ?? {
        paper: template.paper,
        margins: template.margins,
        colorMode: template.colorMode,
        lineweightScale: template.lineweightScale,
      }),
      paper: template.paper,
      margins: { ...template.margins },
      colorMode: template.colorMode,
      lineweightScale: template.lineweightScale,
    },
  };
}

/**
 * Copia una presentación entera con identidades nuevas.
 *
 * Los ids de las ventanas SE RENUEVAN. Reutilizarlos haría que congelar una
 * capa en la ventana de la copia la congelase también en el original en
 * cualquier interfaz que indexe por id de ventana, que es el fallo clásico de
 * un `structuredClone` a secas.
 */
export function copyCadLayout(
  spaces: readonly CadPaperSpace[],
  sourceId: string,
  newId: string,
  name?: string,
): CadPaperSpace | null {
  const source = spaces.find((space) => space.id === sourceId);
  if (!source) return null;
  const copy = structuredClone(source) as CadPaperSpace;
  const viewports = (copy.viewports ?? []).map(
    (viewport, index): CadPaperViewport => ({
      ...viewport,
      id: `${newId}:viewport:${index + 1}`,
    }),
  );
  return {
    ...copy,
    id: newId,
    name: uniqueCadLayoutName(spaces, name ?? `${source.name} (copia)`),
    order: spaces.length,
    // Las entidades del espacio papel NO se duplican: son entidades del
    // documento con id propio, y meterlas en dos hojas las haría aparecer dos
    // veces. Copiar su geometría es trabajo de un COPY explícito.
    entityIds: [],
    viewports,
  };
}

export function renameCadLayout(
  spaces: readonly CadPaperSpace[],
  spaceId: string,
  name: string,
): CadPaperSpace | null {
  const source = spaces.find((space) => space.id === spaceId);
  if (!source) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return { ...source, name: uniqueCadLayoutName(spaces, trimmed, spaceId) };
}

export interface CadLayoutIssue {
  code: "layout_not_found" | "last_layout" | "duplicate_name" | "empty_name";
  detail: string;
}

/**
 * Comprueba si una presentación se puede borrar.
 *
 * La última no: un documento sin ninguna presentación no se puede trazar, y
 * AutoCAD tampoco lo permite. Devolver el motivo en vez de un booleano es lo
 * que hace que el comando pueda decirlo en la línea.
 */
export function canDeleteCadLayout(
  spaces: readonly CadPaperSpace[],
  spaceId: string,
): CadLayoutIssue | null {
  if (!spaces.some((space) => space.id === spaceId))
    return { code: "layout_not_found", detail: `No existe la presentación ${spaceId}.` };
  if (spaces.length <= 1)
    return {
      code: "last_layout",
      detail: "No se puede borrar la única presentación del dibujo.",
    };
  return null;
}

/** Resuelve un nombre o un id de pestaña al espacio papel correspondiente. */
export function findCadLayout(
  spaces: readonly CadPaperSpace[],
  nameOrId: string,
): CadPaperSpace | undefined {
  const needle = nameOrId.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    spaces.find((space) => space.id.toLowerCase() === needle) ??
    spaces.find((space) => space.name.trim().toLowerCase() === needle)
  );
}

/** Presentaciones en el orden en que se pintan las pestañas. */
export function orderedCadLayouts(document: CadDocument): CadPaperSpace[] {
  return [...document.paperSpaces].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
  );
}

// ---------------------------------------------------------------------------
// Órdenes
// ---------------------------------------------------------------------------

export function upsertCadLayoutCommand(space: CadPaperSpace): CadEntityCommand {
  return { type: "paper-space", op: "upsert", space };
}

export function deleteCadLayoutCommand(spaceId: string): CadEntityCommand {
  return { type: "paper-space", op: "delete", spaceId };
}

export function reorderCadLayoutCommand(spaceIds: readonly string[]): CadEntityCommand {
  return { type: "paper-space", op: "reorder", spaceIds: [...spaceIds] };
}

/**
 * Identificador de presentación derivado del nombre.
 *
 * Determinista a propósito: una prueba que crea la presentación «Planta baja»
 * puede afirmar sobre `layout:planta-baja` sin tener que leer un UUID del
 * documento, y dos ejecuciones del mismo guion producen el mismo documento.
 * La colisión se resuelve con un sufijo, no con azar.
 */
export function cadLayoutId(spaces: readonly CadPaperSpace[], name: string): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "hoja";
  const base = `layout:${slug}`;
  if (!spaces.some((space) => space.id === base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!spaces.some((space) => space.id === candidate)) return candidate;
  }
  return `${base}-${spaces.length + 1}`;
}
