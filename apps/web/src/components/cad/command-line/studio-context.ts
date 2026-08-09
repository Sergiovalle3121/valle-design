/**
 * El contexto que el motor de comandos ve del estudio.
 *
 * El motor pregunta esto cada vez que despacha: qué entidades hay, cuáles están
 * designadas, en qué capa se dibuja, cuánto vale un píxel y dónde está el
 * cursor. El editor tiene todo eso repartido entre refs y estado, y traducirlo
 * en el sitio costaría veinte líneas dentro de una función que ya tiene 21.000.
 *
 * Vive aquí por eso, y porque así la traducción se puede probar sin montar el
 * editor: entra un documento, sale un contexto.
 */
import type { CadDocument, CadEntity } from "@/lib/cad/cad-document";
import type { CadCommandContext } from "@/lib/cad/engine/command-types";
import { cadDocumentExtents } from "@/lib/cad/view/document-extents";
import type { CadView } from "@/lib/cad/view/cad-view";

export interface CadStudioCommandInputs {
  /** Documento canónico vivo. `null` mientras no haya dibujo abierto. */
  document: CadDocument | null;
  selection: readonly string[];
  activeLayer: string;
  /** Vista actual. `null` antes de que exista la escena. */
  view: CadView | null;
  /**
   * Último punto conocido del puntero, en unidades de dibujo.
   *
   * Puede ser `null`: mientras el puntero no esté enrutado al motor, no hay
   * una posición que ofrecer. Se propaga como está en vez de inventar el
   * origen, porque la entrada directa de distancia calcula su dirección desde
   * aquí: con un cursor falso daría un punto plausible y equivocado, y con
   * ninguno el motor responde «mueve el cursor para fijar la dirección», que
   * es la verdad.
   */
  cursor: { x: number; y: number } | null;
  newEntityId: () => string;
  /**
   * Pestaña abierta. `null` en espacio modelo, que es donde arranca el editor.
   * LAYOUT y MVIEW la usan para saber sobre qué hoja operan sin preguntar.
   */
  activeLayout?: string | null;
}

/** Escala por defecto cuando todavía no hay escena: un píxel, una unidad. */
const FALLBACK_PIXELS_PER_UNIT = 1;

export function cadStudioCommandContext(
  inputs: CadStudioCommandInputs,
): CadCommandContext {
  const entities: readonly CadEntity[] = inputs.document?.entities ?? [];
  // Se indexa al construir el contexto y no en cada consulta: OFFSET y los
  // comandos de modificación preguntan una vez por objeto designado, y un
  // `find` lineal por consulta convierte una selección de 500 objetos en
  // 500 recorridos del documento entero.
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (entityId) => byId.get(entityId),
    // EXPLODE de un INSERT necesita saber qué hay DENTRO del bloque. Sin esta
    // línea el comando se negaría —dice que no las tiene— en vez de descomponer
    // la inserción, que es exactamente el caso que la gente prueba primero.
    blocks: () => inputs.document?.blocks ?? [],
    // PURGE, XREF y ADCENTER operan sobre las TABLAS del documento, no sobre
    // una selección: sin esta línea se negarían a analizar nada. Sólo se ofrece
    // cuando hay documento abierto, para que la negativa sea la verdad y no un
    // «no hay nada» calculado sobre un documento vacío.
    ...(inputs.document ? { document: () => inputs.document! } : {}),
    selection: inputs.selection,
    activeLayer: inputs.activeLayer,
    // Presentaciones, unidad y envolvente: lo que LAYOUT, MVIEW y PLOT
    // necesitan y ningún comando anterior pedía. Se exponen como funciones
    // para que un comando que no las use no pague ni una envolvente ni una
    // copia de la lista de hojas.
    paperSpaces: () => inputs.document?.paperSpaces ?? [],
    ...(inputs.activeLayout ? { activeLayout: inputs.activeLayout } : {}),
    // Encadenado opcional a propósito: un anfitrión puede montar un documento
    // parcial —lo hacen las pruebas de esta misma capa— y reventar aquí
    // convertiría «no sé la unidad» en «no hay contexto».
    ...(inputs.document?.meta?.unit ? { unit: inputs.document.meta.unit } : {}),
    drawingExtents: () =>
      inputs.document ? cadDocumentExtents(inputs.document) : null,
    view: {
      pixelsPerUnit: inputs.view?.pixelsPerUnit ?? FALLBACK_PIXELS_PER_UNIT,
      centerX: inputs.view?.centerX ?? 0,
      centerY: inputs.view?.centerY ?? 0,
    },
    ...(inputs.cursor ? { cursor: inputs.cursor } : {}),
    newEntityId: inputs.newEntityId,
  };
}
