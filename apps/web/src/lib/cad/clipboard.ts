/**
 * Portapapeles de GEOMETRÍA CANÓNICA (Ola D, 2026-09-02).
 *
 * ## Qué faltaba, medido
 *
 * El 2026-09-01 (distancia-autocad-completo-20260901.md, FRENTE 3) Ctrl+C
 * sobre una selección nativa DUPLICABA en el sitio —`copyNativeSelection`,
 * un `copy` con desplazamiento de una rejilla— mientras el botón prometía «copia
 * al portapapeles CAD (pega aquí o en otro layout)». El portapapeles que
 * existía (`CAD_CLIPBOARD` del editor) sólo llevaba activos heredados: una
 * LINE, un ARC, una COTA o un INSERT no viajaban a ningún sitio. No existían
 * COPYCLIP, CUTCLIP, COPYBASE, PASTECLIP ni PASTEORIG.
 *
 * ## Qué es
 *
 * Un almacén EN MEMORIA de entidades canónicas con su punto base, compartido
 * entre los editores abiertos en la misma pestaña: copiar en un dibujo y pegar
 * en otro es la razón de ser de un portapapeles, y por eso el almacén no vive
 * en la sesión del motor (que es por editor) sino aquí, a nivel de módulo, como
 * ya hacía el de activos. No toca el portapapeles del sistema: lo que se copia
 * es geometría, no texto, y fingir un formato de intercambio que ningún otro
 * programa lee sería prometer lo que no se cumple. Queda dicho en ESCALERA.
 *
 * ## Las reglas del pegado
 *
 *   - Cada entidad pegada es una COPIA con id nuevo, trasladada por
 *     (destino − punto base). Es `adapter.commands.transform`, el mismo camino
 *     que MOVE y COPY: no hay una segunda aritmética de traslación.
 *   - Lo asociativo se DESLIGA: una cota que medía la línea del dibujo de
 *     origen, o un sombreado colgado de ella, no pueden seguir a algo que no
 *     está en el destino. Se pegan como geometría y se dice.
 *   - Un INSERT viaja con la definición de su bloque, y el pegado la DEFINE si
 *     el destino no la tiene. Si la tiene, gana la del destino: redefinir un
 *     bloque por pegar una silla sería cambiar todas las sillas del plano.
 */
import type { CadBlockDefinition, CadDocument, CadEntity, CadPoint2 } from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";
import { CAD_ENTITY_REGISTRY, cadEntityBoundaryPaths, type CadNativeEntity } from "./entity-runtime";

/**
 * Lo que el cálculo de envolventes necesita del dibujo de origen: las tablas
 * de bloques y las entidades, que es lo que `resolveCadInsert` lee para medir
 * un INSERT (professional-blocks.ts). Es un `Pick` para que la vista de
 * documento que reciben los comandos (`CadCommandDocumentView`) entre sin
 * fabricar un documento entero.
 */
export type CadClipboardDocument = Pick<CadDocument, "blocks" | "entities">;

export interface CadClipboardContent {
  /** Copias de las entidades tal como estaban al copiarlas, con sus ids de origen. */
  readonly entities: readonly CadNativeEntity[];
  /** Definiciones de bloque que las INSERT del lote referencian. */
  readonly blocks: readonly CadBlockDefinition[];
  /** Tecleado en COPYBASE, o la esquina inferior izquierda de la envolvente. */
  readonly basePoint: CadPoint2;
  /** Cómo llegó: `cut` borró el original del dibujo de origen. */
  readonly origin: "copy" | "cut";
}

/** Lo que un comando puede LEER del portapapeles (PASTECLIP, PASTEORIG). */
export interface CadClipboardReader {
  read(): CadClipboardContent | null;
}

export interface CadClipboard extends CadClipboardReader {
  write(content: CadClipboardContent): void;
  clear(): void;
}

export function createCadClipboard(): CadClipboard {
  let content: CadClipboardContent | null = null;
  return {
    read: () => content,
    write: (next) => {
      content = next;
    },
    clear: () => {
      content = null;
    },
  };
}

/**
 * El portapapeles de la pestaña: compartido entre los editores abiertos, que
 * es lo que hace que copiar en un dibujo y pegar en otro funcione. Las specs
 * del anfitrión montan el suyo con `createCadClipboard()` para no pisarse.
 */
export const CAD_SHARED_CLIPBOARD: CadClipboard = createCadClipboard();

/**
 * Esquina inferior izquierda de la envolvente, como el punto base implícito de
 * COPYCLIP en AutoCAD. `null` si nada de lo designado tiene envolvente.
 */
export function cadClipboardBasePoint(
  entities: readonly CadEntity[],
  document?: CadClipboardDocument,
): CadPoint2 | null {
  let minX = Infinity;
  let minY = Infinity;
  for (const entity of entities) {
    if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
    // Los adaptadores de envolvente sólo leen `blocks` y `entities` del
    // documento (para resolver un INSERT); el tipo pide el documento entero
    // por comodidad de su firma, no porque lo use.
    const bounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity, document as CadDocument | undefined);
    if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) continue;
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
  }
  return Number.isFinite(minX) && Number.isFinite(minY) ? { x: minX, y: minY } : null;
}

function cloneEntity<E extends CadNativeEntity>(entity: E): E {
  return structuredClone(entity);
}

/**
 * Arma el contenido a partir de lo designado. Devuelve un texto —la negativa—
 * cuando no hay nada canónico que copiar, para que la orden lo diga.
 *
 * `document` es el de ORIGEN: con él la envolvente de un INSERT es la de su
 * bloque colocado (medido: 5.800 para una silla de radio 200 en 6.000); sin
 * él el adaptador sólo ve el punto de inserción y el punto base implícito
 * saldría de un cuadro de relleno.
 */
export function cadClipboardContent(
  entities: readonly CadEntity[],
  blocks: readonly CadBlockDefinition[],
  basePoint: CadPoint2 | null,
  origin: "copy" | "cut",
  document?: CadClipboardDocument,
): CadClipboardContent | string {
  const canonical = entities.filter((entity): entity is CadNativeEntity => CAD_ENTITY_REGISTRY.supports(entity));
  if (canonical.length === 0) return "no hay ninguna entidad canónica que copiar.";
  const base = basePoint ?? cadClipboardBasePoint(canonical, document);
  if (!base) return "lo designado no tiene envolvente de la que tomar el punto base.";
  const blockIds = new Set(canonical.flatMap((entity) => (entity.type === "insert" ? [entity.block] : [])));
  return {
    entities: canonical.map(cloneEntity),
    blocks: blocks.filter((block) => blockIds.has(block.id)).map((block) => structuredClone(block)),
    basePoint: { x: base.x, y: base.y },
    origin,
  };
}

/**
 * Lo asociativo se desliga al pegar. Una cota, un sombreado o una directriz que
 * apuntaban a entidades del dibujo de origen no tienen a qué apuntar en el
 * destino; las referencias se quitan y la entidad queda como geometría suelta,
 * que es lo que AutoCAD hace también al pegar en otro dibujo.
 */
export function cadDetachForPaste(entity: CadNativeEntity): CadNativeEntity {
  if (entity.type === "hatch" || entity.type === "dimension" || entity.type === "mleader") {
    const { associative, associationStatus, ...rest } = entity as typeof entity & {
      associative?: boolean;
      associationStatus?: string;
    };
    void associative;
    void associationStatus;
    if ("boundaryRefs" in rest) {
      const { boundaryRefs, ...bare } = rest as typeof rest & { boundaryRefs?: string[] };
      void boundaryRefs;
      return bare as CadNativeEntity;
    }
    return rest as CadNativeEntity;
  }
  return entity;
}

/**
 * Los comandos que pegan `content` con su punto base en `target`.
 *
 * `existingBlockIds` son los bloques que YA tiene el destino: los suyos ganan,
 * y sólo se definen los que faltan. `newEntityId` da los ids de las copias.
 */
export function cadPasteCommands(
  content: CadClipboardContent,
  target: CadPoint2,
  newEntityId: () => string,
  existingBlockIds: ReadonlySet<string> = new Set(),
): CadEntityCommand[] {
  const translation = { x: target.x - content.basePoint.x, y: target.y - content.basePoint.y };
  const commands: CadEntityCommand[] = [];
  for (const block of content.blocks)
    if (!existingBlockIds.has(block.id))
      commands.push({ type: "block", op: "define", definition: structuredClone(block) });
  for (const source of content.entities) {
    const detached = cadDetachForPaste(cloneEntity(source));
    const renamed = { ...detached, id: newEntityId() } as CadNativeEntity;
    const moved =
      translation.x === 0 && translation.y === 0
        ? renamed
        : CAD_ENTITY_REGISTRY.adapter(renamed).commands.transform(renamed, { translation });
    commands.push({ type: "insert", entity: moved });
  }
  return commands;
}

/** Cuántas del lote se desligan al pegar, para que la orden lo diga. */
export function cadPasteDetachedCount(content: CadClipboardContent): number {
  return content.entities.filter((entity) => {
    if (entity.type !== "hatch" && entity.type !== "dimension" && entity.type !== "mleader") return false;
    return (entity as { associative?: boolean }).associative === true;
  }).length;
}

/**
 * La silueta de lo que se va a pegar, con el punto base en `at`: los contornos
 * de cada entidad trasladados. Es lo que el lienzo enseña bajo el cursor
 * mientras PASTECLIP pide el punto de inserción.
 */
export function cadPastePreview(content: CadClipboardContent, at: CadPoint2): { points: CadPoint2[]; closed?: boolean }[] {
  const dx = at.x - content.basePoint.x;
  const dy = at.y - content.basePoint.y;
  const paths: { points: CadPoint2[]; closed?: boolean }[] = [];
  for (const entity of content.entities)
    for (const path of cadEntityBoundaryPaths(entity))
      paths.push({
        points: path.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
        ...(path.closed ? { closed: true } : {}),
      });
  return paths;
}
