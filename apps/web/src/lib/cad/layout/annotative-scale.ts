/**
 * Escala anotativa: un texto de 2,5 mm mide 2,5 mm en el papel, sea cual sea la
 * escala de la ventana.
 *
 * ## El problema, en un número
 *
 * Una ventana a 1:50 sobre un dibujo en milímetros dibuja cada unidad del
 * modelo a 1/50 mm de papel. Un rótulo que tiene que salir a 2,5 mm sobre el
 * papel debe medir, por tanto, **125 unidades** en el modelo. La misma hoja
 * con una ventana de detalle a 1:5 lo necesita a **12,5**. Sin automatismo, un
 * cambio de escala obliga a reescribir a mano la altura de todos los textos,
 * todas las cotas y todos los símbolos — y como nadie lo hace del todo, el
 * plano sale con dos tamaños de letra.
 *
 * ## Cómo se modela sin tocar el esquema
 *
 * Una entidad es anotativa cuando lleva en su bolsillo de metadatos la altura
 * que debe tener SOBRE EL PAPEL:
 *
 * ```text
 * context.metadata.annotativeHeightMm = 2.5
 * ```
 *
 * Ese bolsillo ya existe y ya se usa para asociatividades sin campo propio
 * (una copia de ARRAY recuerda ahí de qué matriz viene). La altura real de la
 * entidad sigue siendo la del esquema —lo que se dibuja y lo que exporta el
 * DXF— y este módulo la RECALCULA cuando cambia la escala de la ventana.
 *
 * Es exactamente lo que hace AutoCAD por dentro con `ANNOTATIVE` y
 * `CANNOSCALE`, y tiene la propiedad que importa: el documento sigue siendo
 * legible por cualquier consumidor que no sepa nada de anotatividad.
 */
import type { CadDocument, CadEntity, CadPaperSpace, CadPaperViewport } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";

/** Clave de metadatos con la altura sobre el papel, en milímetros. */
export const CAD_ANNOTATIVE_HEIGHT_METADATA = "annotativeHeightMm";

/** Milímetros que mide una unidad de dibujo, según la unidad del documento. */
export function cadUnitToMillimetres(unit: string): number {
  if (unit === "m") return 1000;
  if (unit === "cm") return 10;
  if (unit === "in") return 25.4;
  return 1;
}

/**
 * Altura que la entidad debe tener EN EL MODELO para medir `paperHeightMm`
 * sobre el papel dentro de una ventana a 1:`scale`.
 *
 * ```text
 * alturaModelo = alturaPapel · escala / mmPorUnidad
 * ```
 */
export function cadAnnotativeModelHeight(
  paperHeightMm: number,
  scale: number,
  unit = "mm",
): number {
  const mmPerUnit = cadUnitToMillimetres(unit);
  if (!(paperHeightMm > 0) || !(scale > 0) || !(mmPerUnit > 0)) return 0;
  return (paperHeightMm * scale) / mmPerUnit;
}

/** La inversa: qué mide sobre el papel una entidad de altura `modelHeight`. */
export function cadAnnotativePaperHeight(
  modelHeight: number,
  scale: number,
  unit = "mm",
): number {
  const mmPerUnit = cadUnitToMillimetres(unit);
  if (!(modelHeight > 0) || !(scale > 0)) return 0;
  return (modelHeight * mmPerUnit) / scale;
}

/** Altura sobre papel declarada por una entidad, o `null` si no es anotativa. */
export function cadAnnotativeHeightMm(entity: CadEntity): number | null {
  const raw = entity.context?.metadata?.[CAD_ANNOTATIVE_HEIGHT_METADATA];
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Marca una entidad como anotativa con una altura de papel dada. */
export function markCadAnnotativeCommand(
  entityId: string,
  paperHeightMm: number,
): CadEntityCommand {
  return {
    type: "metadata",
    entityId,
    patch: { [CAD_ANNOTATIVE_HEIGHT_METADATA]: paperHeightMm },
  };
}

/** Le quita la marca. `null` borra la clave, que es como se desanota. */
export function clearCadAnnotativeCommand(entityId: string): CadEntityCommand {
  return {
    type: "metadata",
    entityId,
    patch: { [CAD_ANNOTATIVE_HEIGHT_METADATA]: null },
  };
}

/**
 * Tipos cuya altura conoce el adaptador de propiedades bajo la clave `height`.
 *
 * Se enumeran en vez de intentarlo con todos: un `properties.write` con una
 * clave que el adaptador ignora no falla, simplemente no hace nada, y un
 * comando que dice haber reescalado veinte rótulos sin haber tocado ninguno es
 * peor que uno que reescala los cinco que puede y lo dice.
 */
const HEIGHT_BEARING_TYPES = new Set(["mtext", "text", "attdef"]);

export function cadEntitySupportsAnnotativeHeight(entity: CadEntity): boolean {
  return HEIGHT_BEARING_TYPES.has(entity.type);
}

export interface CadAnnotativeRescaleResult {
  commands: CadEntityCommand[];
  /** Entidades anotativas que se reescalaron. */
  rescaledEntityIds: string[];
  /** Anotativas cuyo tipo no lleva altura: se dicen, no se ocultan. */
  skippedEntityIds: string[];
}

/**
 * Recalcula las alturas anotativas de una presentación para la escala vigente
 * de cada ventana.
 *
 * Se recorre POR VENTANA porque una hoja puede tener una ventana general a
 * 1:100 y un detalle a 1:5, y el mismo rótulo no puede servir para las dos. La
 * regla es la de AutoCAD: manda la escala de anotación de la ventana en la que
 * la entidad se ve; con varias, la de la primera que la muestra en el orden de
 * la hoja. No es arbitrario — es determinista, y un empate resuelto al azar
 * daría documentos distintos en dos ejecuciones iguales.
 */
export function cadAnnotativeRescaleCommands(
  document: CadDocument,
  space: CadPaperSpace,
  isVisible: (viewport: CadPaperViewport, entity: CadEntity) => boolean = defaultVisibility,
): CadAnnotativeRescaleResult {
  const unit = document.meta.unit;
  const byId = new Map(document.entities.map((entity) => [entity.id, entity]));
  const commands: CadEntityCommand[] = [];
  const rescaledEntityIds: string[] = [];
  const skippedEntityIds: string[] = [];
  const decided = new Set<string>();

  for (const viewport of space.viewports ?? []) {
    const scale = viewport.annotationScale ?? viewport.scale;
    if (!(scale > 0)) continue;
    for (const entity of byId.values()) {
      if (decided.has(entity.id)) continue;
      const paperHeight = cadAnnotativeHeightMm(entity);
      if (paperHeight === null) continue;
      if (!isVisible(viewport, entity)) continue;
      decided.add(entity.id);
      if (!cadEntitySupportsAnnotativeHeight(entity)) {
        skippedEntityIds.push(entity.id);
        continue;
      }
      const height = cadAnnotativeModelHeight(paperHeight, scale, unit);
      const current = readHeight(entity);
      // Sin cambio, sin orden: un lote que reescribe la misma altura sube la
      // versión del documento y gasta un paso de deshacer para nada.
      if (current !== null && Math.abs(current - height) < 1e-9) continue;
      commands.push({ type: "properties", entityId: entity.id, patch: { height } });
      rescaledEntityIds.push(entity.id);
    }
  }

  return { commands, rescaledEntityIds, skippedEntityIds };
}

function readHeight(entity: CadEntity): number | null {
  const value = (entity as { height?: unknown }).height;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function defaultVisibility(viewport: CadPaperViewport, entity: CadEntity): boolean {
  return viewport.layerVisibility?.[entity.layer] !== false;
}
