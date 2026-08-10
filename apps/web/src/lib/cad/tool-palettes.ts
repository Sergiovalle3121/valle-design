/**
 * Paletas de herramientas (TOOLPALETTES).
 *
 * Una paleta de herramientas es una fila de botones que el estudio se fabrica:
 * «inserta el pilar HEB-200», «arranca un LINE en la capa MUROS con este tipo
 * de línea». Su valor no está en ejecutar comandos —eso ya se hace tecleando—
 * sino en que la CONFIGURACIÓN viaja: el que entra nuevo hereda las
 * herramientas del despacho en vez de aprenderse sus convenciones a base de
 * corregirle los planos.
 *
 * ## Dónde se guardan
 *
 * En el mismo sitio y con la misma clave por inquilino que las preferencias del
 * espacio de trabajo (`cad-workspace.ts`): `almacén local` acotado a
 * `tenant:user`. No se añade endpoint ni se toca el contrato — la ola de
 * contratos pertenece a otra sesión, y una paleta que se pierde al recargar no
 * sirve de nada, así que se usa lo que ya hay.
 *
 * ## Qué puede haber en una herramienta
 *
 * Dos cosas, y las dos se ejecutan por la MISMA puerta que la línea de
 * comandos: una orden tecleable (`LINE`, `-LAYER S MUROS`) o la inserción de un
 * bloque. La segunda se expresa como la primera —`INSERT` con su nombre—, así
 * que no hay dos caminos de ejecución que puedan divergir.
 */

export type CadToolKind = "command" | "block";

export interface CadToolPaletteTool {
  id: string;
  label: string;
  kind: CadToolKind;
  /**
   * Lo que se teclea al pulsar. En `block` es el nombre del bloque; el
   * anfitrión lo convierte en `INSERT <nombre>` para que la ejecución sea la
   * misma que la de cualquier otra orden.
   */
  payload: string;
  /** Capa en la que dejar lo que la herramienta cree, si la fuerza. */
  layer?: string;
  description?: string;
}

export interface CadToolPalette {
  name: string;
  tools: readonly CadToolPaletteTool[];
}

export interface CadToolPaletteBook {
  palettes: readonly CadToolPalette[];
}

/** Lo que se teclea al pulsar una herramienta. Una sola puerta de ejecución. */
export function cadToolCommandLine(tool: CadToolPaletteTool): string {
  return tool.kind === "block" ? `INSERT ${tool.payload}` : tool.payload;
}

export function cadToolPaletteStorageKey(scope: {
  tenantId?: string | null;
  userId?: string | null;
}): string {
  return `valle_cad_toolpalettes:${scope.tenantId || "tenant"}:${scope.userId || "user"}`;
}

/**
 * Las paletas de fábrica.
 *
 * Existen porque una paleta vacía no enseña para qué sirve la paleta. Son las
 * órdenes que todo el mundo usa, agrupadas como las agrupa cualquier estudio.
 */
export const CAD_DEFAULT_TOOL_PALETTES: readonly CadToolPalette[] = [
  {
    name: "Dibujo",
    tools: [
      { id: "draw-line", label: "Línea", kind: "command", payload: "LINE" },
      { id: "draw-pline", label: "Polilínea", kind: "command", payload: "PLINE" },
      { id: "draw-circle", label: "Círculo", kind: "command", payload: "CIRCLE" },
      { id: "draw-rect", label: "Rectángulo", kind: "command", payload: "RECTANG" },
      { id: "draw-hatch", label: "Sombreado", kind: "command", payload: "HATCH" },
    ],
  },
  {
    name: "Modificación",
    tools: [
      { id: "mod-move", label: "Desplazar", kind: "command", payload: "MOVE" },
      { id: "mod-copy", label: "Copiar", kind: "command", payload: "COPY" },
      { id: "mod-trim", label: "Recortar", kind: "command", payload: "TRIM" },
      { id: "mod-fillet", label: "Empalme", kind: "command", payload: "FILLET" },
      { id: "mod-overkill", label: "Limpiar duplicados", kind: "command", payload: "OVERKILL" },
    ],
  },
  {
    name: "Consulta",
    tools: [
      { id: "inq-dist", label: "Distancia", kind: "command", payload: "DIST" },
      { id: "inq-area", label: "Área", kind: "command", payload: "AREA" },
      { id: "inq-list", label: "Listar", kind: "command", payload: "LIST" },
      { id: "inq-id", label: "Coordenada", kind: "command", payload: "ID" },
    ],
  },
];

function isTool(value: unknown): value is CadToolPaletteTool {
  if (!value || typeof value !== "object") return false;
  const tool = value as Partial<CadToolPaletteTool>;
  return (
    typeof tool.id === "string" &&
    typeof tool.label === "string" &&
    (tool.kind === "command" || tool.kind === "block") &&
    typeof tool.payload === "string"
  );
}

/**
 * Normaliza lo leído del almacén. Cualquier cosa ilegible cae en las paletas de
 * fábrica: unas herramientas corruptas no pueden impedir abrir un dibujo, que
 * es la misma regla que sigue `loadCadWorkspacePreferences`.
 */
export function normalizeCadToolPalettes(value: unknown): readonly CadToolPalette[] {
  if (!Array.isArray(value)) return CAD_DEFAULT_TOOL_PALETTES;
  const palettes = value
    .filter((entry): entry is { name: unknown; tools: unknown } =>
      Boolean(entry) && typeof entry === "object",
    )
    .map((entry) => ({
      name: typeof entry.name === "string" ? entry.name : "",
      tools: Array.isArray(entry.tools) ? entry.tools.filter(isTool) : [],
    }))
    .filter((palette) => palette.name.trim().length > 0);
  return palettes.length > 0 ? palettes : CAD_DEFAULT_TOOL_PALETTES;
}

export interface CadToolPaletteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadCadToolPalettes(
  storage: CadToolPaletteStorage,
  scope: { tenantId?: string | null; userId?: string | null },
): readonly CadToolPalette[] {
  try {
    const raw = storage.getItem(cadToolPaletteStorageKey(scope));
    if (raw === null) return CAD_DEFAULT_TOOL_PALETTES;
    return normalizeCadToolPalettes(JSON.parse(raw));
  } catch {
    return CAD_DEFAULT_TOOL_PALETTES;
  }
}

export function saveCadToolPalettes(
  storage: CadToolPaletteStorage,
  scope: { tenantId?: string | null; userId?: string | null },
  palettes: readonly CadToolPalette[],
): boolean {
  try {
    storage.setItem(cadToolPaletteStorageKey(scope), JSON.stringify(palettes));
    return true;
  } catch {
    // Almacén lleno o bloqueado por el navegador. Se informa con `false` en vez
    // de lanzar: perder la paleta es molesto, tirar el editor es peor.
    return false;
  }
}

/**
 * Catálogo con persistencia opcional. Sin `persist` es exactamente el catálogo
 * en memoria que usan las specs; con él, el mismo objeto guarda al escribir.
 */
export class CadToolPaletteCatalog {
  private items: CadToolPalette[];

  constructor(
    initial: readonly CadToolPalette[] = CAD_DEFAULT_TOOL_PALETTES,
    private readonly persist?: (palettes: readonly CadToolPalette[]) => void,
  ) {
    this.items = [...initial];
  }

  list = (): readonly CadToolPalette[] => this.items;

  get = (name: string): CadToolPalette | undefined =>
    this.items.find((item) => item.name.toUpperCase() === name.trim().toUpperCase());

  save = (item: CadToolPalette): void => {
    const key = item.name.trim().toUpperCase();
    const index = this.items.findIndex((entry) => entry.name.toUpperCase() === key);
    if (index >= 0) this.items = this.items.map((entry, at) => (at === index ? item : entry));
    else this.items = [...this.items, item];
    this.persist?.(this.items);
  };

  remove = (name: string): boolean => {
    const key = name.trim().toUpperCase();
    const next = this.items.filter((entry) => entry.name.toUpperCase() !== key);
    if (next.length === this.items.length) return false;
    this.items = next;
    this.persist?.(this.items);
    return true;
  };
}
