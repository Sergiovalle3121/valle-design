/**
 * PURGE: quitar del documento lo que ya no usa nadie.
 *
 * ## La única propiedad que importa
 *
 * **PURGE no puede borrar lo que sí se usa.** Un purgado demasiado agresivo no
 * da un error: da un dibujo que se abre, con bloques que faltan y textos sin
 * estilo, y el daño se descubre semanas después. Por eso el análisis de uso de
 * este módulo mira SIETE sitios que el análisis ingenuo se salta:
 *
 *   1. Los INSERT sueltos del espacio de modelo.
 *   2. Los INSERT anidados DENTRO de otras definiciones de bloque.
 *   3. Las entidades que viven dentro de un bloque, que también tienen capa.
 *   4. Los bloques y capas que sostienen una referencia externa.
 *   5. Los estilos de texto a los que apunta un estilo de cota, de directriz o
 *      de tabla — un estilo puede usar a otro.
 *   6. Los atributos de una definición de bloque y los atributos posicionados
 *      de una inserción, que llevan su propio estilo de texto.
 *   7. Las celdas de una TABLE, que llevan estilo por celda.
 *
 * ## Qué NO purga, y por qué
 *
 * - La capa `0` y la capa ACTIVA: AutoCAD tampoco, y quedarse sin capa activa
 *   deja el editor sin sitio donde dibujar.
 * - Los bloques de sistema (`*BASE`, y en general los que empiezan por `*`).
 * - Los estilos de PLOT: nada en el esquema los referencia por nombre, así que
 *   no hay forma de distinguir uno huérfano de uno en uso. Purgarlos «porque no
 *   se encuentran referencias» sería borrarlos todos siempre.
 *
 * Devuelve primero una PREVISUALIZACIÓN —qué se iría y por qué— y sólo después
 * las órdenes. Nadie debería teclear PURGE y descubrir qué perdió al deshacer.
 *
 * ## El purgado CASCADEA, y hay que repetirlo
 *
 * Al irse un bloque huérfano, el estilo de texto que sólo usaba su atributo se
 * queda huérfano a su vez. Como en AutoCAD, una pasada no lo pilla: la segunda
 * lo propone. Se prefiere eso a un análisis de punto fijo, porque cada pasada
 * es UNA transacción y un paso de deshacer, y encadenarlas en silencio haría
 * imposible revertir sólo la mitad.
 */
import type {
  CadBlockDefinition,
  CadDocument,
  CadEntity,
  CadStyleTable,
} from "../cad-document";
import type { CadEntityCommand, CadStyleFamilyName } from "../entity-commands";

/**
 * La familia de estilo la define la orden `style` del ejecutor, que ya existía:
 * PURGE emite ESA y no una propia, para no abrir una segunda vía a lo mismo.
 */
type CadStyleFamily = CadStyleFamilyName;

export interface CadPurgeCandidate {
  kind: "block" | "layer" | "style";
  /** Identificador con el que se emite la orden. */
  id: string;
  /** Nombre legible, el que ve el usuario en la previsualización. */
  label: string;
  /** Sólo para estilos. */
  family?: CadStyleFamily;
  detail: string;
}

/** Familias de estilo que PURGE sabe decidir. `plot` queda fuera a conciencia. */
const PURGEABLE_STYLE_FAMILIES: readonly CadStyleFamily[] = ["text", "dimension", "mleader", "table"];

const allEntities = (document: Pick<CadDocument, "entities" | "blocks">): CadEntity[] => [
  ...document.entities,
  ...document.blocks.flatMap((block) => block.entities),
];

/** Claves —id y nombre— de los bloques que alguien inserta, transitivamente. */
function usedBlockKeys(document: Pick<CadDocument, "entities" | "blocks" | "externalReferences">): Set<string> {
  const byKey = new Map<string, CadBlockDefinition>();
  for (const block of document.blocks) {
    byKey.set(block.id, block);
    if (!byKey.has(block.name)) byKey.set(block.name, block);
  }
  const used = new Set<string>();
  const visit = (key: string) => {
    const block = byKey.get(key);
    if (!block || used.has(block.id)) return;
    used.add(block.id);
    used.add(block.name);
    for (const child of block.entities) if (child.type === "insert") visit(child.block);
  };
  for (const entity of document.entities) if (entity.type === "insert") visit(entity.block);
  // Un xref proyecta su contenido en bloques que ninguna entidad inserta
  // mientras está DESCARGADO. Purgarlos dejaría la referencia sin nada que
  // recargar.
  for (const reference of document.externalReferences) if (reference.blockId) visit(reference.blockId);
  return used;
}

/** Estilos de texto que otro estilo referencia. Un estilo puede usar a otro. */
function stylesReferencedByStyles(styles: CadStyleTable): Set<string> {
  const referenced = new Set<string>();
  for (const entry of Object.values(styles.dimension ?? {})) if (entry.textStyle) referenced.add(entry.textStyle);
  for (const entry of Object.values(styles.mleader ?? {})) if (entry.textStyle) referenced.add(entry.textStyle);
  for (const entry of Object.values(styles.table ?? {})) if (entry.textStyle) referenced.add(entry.textStyle);
  return referenced;
}

/** Nombres de estilo usados por familia, contando TODO lo que los referencia. */
export function cadStyleUsageByFamily(
  document: Pick<CadDocument, "entities" | "blocks" | "styles">,
): Record<CadStyleFamily, Set<string>> {
  const usage: Record<CadStyleFamily, Set<string>> = {
    text: new Set(stylesReferencedByStyles(document.styles)),
    dimension: new Set(),
    mleader: new Set(),
    table: new Set(),
    plot: new Set(),
  };
  const add = (family: CadStyleFamily, name: string | undefined) => {
    if (name) usage[family].add(name);
  };
  for (const entity of allEntities(document)) {
    if (entity.type === "text" || entity.type === "mtext" || entity.type === "attdef")
      add("text", entity.style);
    else if (entity.type === "dimension") add("dimension", entity.style);
    else if (entity.type === "mleader") add("mleader", entity.style);
    else if (entity.type === "table") {
      add("table", entity.style);
      for (const cell of entity.cells) add("text", cell.textStyle);
    } else if (entity.type === "insert")
      for (const attribute of entity.positionedAttributes ?? []) add("text", attribute.style);
  }
  // Los atributos de una DEFINICIÓN llevan su estilo de texto aunque el bloque
  // no esté insertado en ningún sitio todavía.
  for (const block of document.blocks)
    for (const attribute of Object.values(block.attributes ?? {})) add("text", attribute.style);
  return usage;
}

export interface CadPurgeOptions {
  /** La capa activa nunca se purga: dejaría el editor sin dónde dibujar. */
  activeLayer?: string;
}

export function cadPurgePreview(
  document: Pick<CadDocument, "entities" | "blocks" | "layers" | "styles" | "externalReferences">,
  options: CadPurgeOptions = {},
): CadPurgeCandidate[] {
  const candidates: CadPurgeCandidate[] = [];

  const usedBlocks = usedBlockKeys(document);
  for (const block of document.blocks) {
    if (block.name.startsWith("*")) continue;
    if (usedBlocks.has(block.id)) continue;
    candidates.push({
      kind: "block",
      id: block.id,
      label: block.name,
      detail: `Definición de bloque sin ninguna inserción (${block.entities.length} objetos).`,
    });
  }

  // Cuenta las entidades de DENTRO de los bloques, que también tienen capa —
  // incluidas las que proyecta un xref sobre su propia capa bloqueada.
  const occupied = new Set(allEntities(document).map((entity) => entity.layer));
  for (const layer of document.layers) {
    if (layer.id === "0" || layer.id === options.activeLayer) continue;
    if (occupied.has(layer.id)) continue;
    candidates.push({
      kind: "layer",
      id: layer.id,
      label: layer.name,
      detail: "Capa sin ninguna entidad.",
    });
  }

  const usage = cadStyleUsageByFamily(document);
  for (const family of PURGEABLE_STYLE_FAMILIES)
    for (const name of Object.keys(document.styles[family] ?? {})) {
      if (usage[family].has(name)) continue;
      candidates.push({
        kind: "style",
        id: `${family}:${name}`,
        label: name,
        family,
        detail: `Estilo de ${family} al que no apunta nada.`,
      });
    }

  return candidates.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

/**
 * Las órdenes de un purgado: estilos, capas y por último los bloques.
 *
 * El orden ENTRE bloques da igual: la tabla no cuenta como «en uso» lo que el
 * mismo lote va a borrar, así que un árbol entero de bloques huérfanos se va de
 * una pieza sin que quien llama tenga que ordenarlo de contenedor a contenido.
 */
export function cadPurgeCommands(candidates: readonly CadPurgeCandidate[]): CadEntityCommand[] {
  const styles = candidates.filter((candidate) => candidate.kind === "style");
  const layers = candidates.filter((candidate) => candidate.kind === "layer");
  const blockCandidates = candidates.filter((candidate) => candidate.kind === "block");
  return [
    ...styles.map((candidate): CadEntityCommand => ({
      type: "style",
      op: "delete",
      family: candidate.family!,
      name: candidate.label,
    })),
    ...layers.map((candidate): CadEntityCommand => ({
      type: "layer",
      op: "delete",
      layerId: candidate.id,
    })),
    ...blockCandidates.map((candidate): CadEntityCommand => ({
      type: "block",
      op: "delete",
      blockId: candidate.id,
    })),
  ];
}
