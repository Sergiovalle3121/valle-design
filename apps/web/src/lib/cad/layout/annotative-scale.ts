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
import type { CadEntity, CadPaperSpace, CadPaperViewport } from "../cad-document";
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
  return HEIGHT_BEARING_TYPES.has(entity.type) || entity.type === "dimension";
}

/**
 * Tamaños de una COTA anotativa para la escala dada. En una cota lo anotativo
 * no es una altura: es el juego completo de tamaños (flecha, huecos, exceso,
 * separación) que debe medir lo mismo sobre el papel en 1:100 que en 1:5. La
 * marca `annotativeHeightMm` guarda el tamaño de FLECHA sobre papel (2,5 mm en
 * la norma mexicana) y el resto escala EN PROPORCIÓN a la propia cota — una
 * cota con garrapata corta no gana garrapata de flecha larga al reescalarse.
 */
export function cadAnnotativeDimensionSizes(
  entity: CadEntity,
  paperArrowMm: number,
  scale: number,
  unit: string,
): { arrowSize: number; extensionGap: number; extensionOvershoot: number; textGap: number } {
  const arrowSize = cadAnnotativeModelHeight(paperArrowMm, scale, unit);
  const current = entity as {
    arrowSize?: number;
    extensionGap?: number;
    extensionOvershoot?: number;
    textGap?: number;
  };
  // Proporciones del kernel (DEFAULT_DIMENSION_STYLE): gap 40/180, exceso
  // 120/180, texto 90/180 — sólo cuando la cota no declara las suyas.
  const base = current.arrowSize && current.arrowSize > 0 ? current.arrowSize : 180;
  const ratio = (value: number | undefined, fallback: number) =>
    ((value && value > 0 ? value : base * fallback) / base) * arrowSize;
  return {
    arrowSize,
    extensionGap: ratio(current.extensionGap, 40 / 180),
    extensionOvershoot: ratio(current.extensionOvershoot, 120 / 180),
    textGap: ratio(current.textGap, 90 / 180),
  };
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
 * Recibe las ENTIDADES y la unidad, no el documento: así lo puede llamar un
 * comando del motor, que ve el dibujo por la rendija de `context.entity` y
 * nunca tiene el documento entero en la mano.
 *
 * Se recorre POR VENTANA porque una hoja puede tener una ventana general a
 * 1:100 y un detalle a 1:5, y el mismo rótulo no puede servir para las dos. La
 * regla es la de AutoCAD: manda la escala de anotación de la ventana en la que
 * la entidad se ve; con varias, la de la primera que la muestra en el orden de
 * la hoja. No es arbitrario — es determinista, y un empate resuelto al azar
 * daría documentos distintos en dos ejecuciones iguales.
 */
export function cadAnnotativeRescaleCommands(
  input: {
    entities: readonly CadEntity[];
    /** Unidad del dibujo. Decide los milímetros por unidad. */
    unit?: string;
  },
  space: CadPaperSpace,
  isVisible: (viewport: CadPaperViewport, entity: CadEntity) => boolean = defaultVisibility,
): CadAnnotativeRescaleResult {
  const unit = input.unit ?? "mm";
  const byId = new Map(input.entities.map((entity) => [entity.id, entity]));
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
      // Una COTA anotativa reescala su juego de tamaños completo; el resto de
      // tipos, su altura. Ambos con la misma marca y la misma regla de ventana.
      if (entity.type === "dimension") {
        const sizes = cadAnnotativeDimensionSizes(entity, paperHeight, scale, unit);
        const currentArrow = (entity as { arrowSize?: number }).arrowSize;
        if (
          typeof currentArrow === "number" &&
          Math.abs(currentArrow - sizes.arrowSize) < 1e-9
        )
          continue;
        commands.push({
          type: "replace",
          entityId: entity.id,
          // El lote de replace transporta la entidad nativa completa; una cota
          // del documento siempre lo es.
          entity: { ...entity, ...sizes } as never,
        });
        rescaledEntityIds.push(entity.id);
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

/**
 * CANNOSCALE: la escala de anotación del ESPACIO MODELO.
 *
 * ## Por qué hace falta, aparte de la de cada ventana
 *
 * `cadAnnotativeRescaleCommands` resuelve la lámina: cada ventana tiene su
 * escala y los rótulos que se ven en ella se ajustan. Lo que no resolvía es el
 * sitio donde el dibujante pasa el día — el espacio modelo—, donde no hay
 * ventana ninguna y por tanto no había escala de la que sacar la altura. El
 * resultado medido: un rótulo anotativo de 2,5 mm se dibujaba con la altura que
 * tuviera puesta, que no significa nada hasta que alguien lo publica.
 *
 * En AutoCAD eso lo gobierna `CANNOSCALE`, y el sitio donde se elige es el
 * selector de la barra de estado. Esta función es lo que ese selector ejecuta:
 * para la escala elegida, deja cada entidad anotativa con la altura de modelo
 * que la hará medir sus milímetros de papel.
 *
 * ## Lo que declara y no esconde
 *
 * Una entidad anotativa cuyo tipo no lleva altura (`cadEntitySupportsAnnotative
 * Height`) sale en `skippedEntityIds` en vez de desaparecer del recuento. Y la
 * escala vive en la SESIÓN, no en el documento: `CadDocumentMeta` no tiene
 * campo para ella y añadirlo es tocar el formato persistido, que es decisión
 * del titular — queda propuesto en el informe de la ola.
 */
export function cadAnnotativeModelRescaleCommands(
  input: { entities: readonly CadEntity[]; unit?: string } | null,
  denominator: number,
): CadAnnotativeRescaleResult {
  const commands: CadEntityCommand[] = [];
  const rescaledEntityIds: string[] = [];
  const skippedEntityIds: string[] = [];
  if (!input || !(denominator > 0)) return { commands, rescaledEntityIds, skippedEntityIds };
  const unit = input.unit ?? "mm";
  for (const entity of input.entities) {
    const paperHeight = cadAnnotativeHeightMm(entity);
    if (paperHeight === null) continue;
    if (!cadEntitySupportsAnnotativeHeight(entity)) {
      skippedEntityIds.push(entity.id);
      continue;
    }
    if (entity.type === "dimension") {
      const sizes = cadAnnotativeDimensionSizes(entity, paperHeight, denominator, unit);
      const current = (entity as { arrowSize?: number }).arrowSize;
      if (typeof current === "number" && Math.abs(current - sizes.arrowSize) < 1e-9) continue;
      commands.push({
        type: "properties",
        entityId: entity.id,
        patch: { ...sizes },
      });
      rescaledEntityIds.push(entity.id);
      continue;
    }
    const height = cadAnnotativeModelHeight(paperHeight, denominator, unit);
    const current = (entity as { height?: number }).height;
    if (!(height > 0) || (typeof current === "number" && Math.abs(current - height) < 1e-9))
      continue;
    commands.push({ type: "properties", entityId: entity.id, patch: { height } });
    rescaledEntityIds.push(entity.id);
  }
  return { commands, rescaledEntityIds, skippedEntityIds };
}

/**
 * El selector de la barra de estado, de principio a fin: calcula y aplica.
 *
 * Existe para que el editor no tenga que escribir tres líneas de pegamento —el
 * monolito sólo puede encoger— y para que «elegir una escala» sea UNA cosa
 * probable en Node en vez de una lambda dentro de un JSX de 18.000 líneas.
 * Devuelve cuántas anotativas se movieron, que es lo que un renglón honesto
 * puede decir.
 */
export function cadApplyAnnotationScale(
  document: { entities: readonly CadEntity[]; meta?: { unit?: string } } | null,
  denominator: number,
  commit: (commands: CadEntityCommand[]) => unknown,
): number {
  const result = cadAnnotativeModelRescaleCommands(
    document ? { entities: document.entities, unit: document.meta?.unit } : null,
    denominator,
  );
  if (result.commands.length > 0) commit(result.commands);
  return result.rescaledEntityIds.length;
}
