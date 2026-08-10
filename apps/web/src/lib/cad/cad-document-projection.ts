/**
 * Reproyección del editor heredado sobre el documento canónico.
 *
 * Sale de `cad-document.ts` por el trinquete de tamaño. La frontera es la misma
 * que separa el modelo de su adaptador: aquel DEFINE el documento, esto
 * RECONCILIA una vista PARCIAL de él —la del editor histórico— sin destruir lo
 * que esa vista no sabe expresar.
 *
 * Importa valores sólo de `cad-document-shared.ts` y `cad-document-migrate.ts`,
 * que son hojas del grafo de carga; no puede cerrar el ciclo que `tsc --noEmit`
 * no ve. `cad-document.ts` lo reexporta y ningún consumidor cambia de import.
 */
import type { CadDocument, CadEntity } from "./cad-document";
import { migrateCadDocument } from "./cad-document-migrate";
import { byId, CAD_DOCUMENT_SCHEMA, CONNECTOR_LAYER, preserveDrawOrder } from "./cad-document-shared";

/**
 * Replace the legacy editor projection without dropping first-class entities,
 * constraints, blocks, xrefs or opaque provider payloads.
 */
export function replaceEditorProjection(
  base: CadDocument | null | undefined,
  projection: CadDocument,
): CadDocument {
  const projectionIds = new Set(projection.entities.map((entity) => entity.id));
  const preserved = base
    ? base.entities.filter((entity) =>
        !projectionIds.has(entity.id)
        && !["box", "station", "text", "connector"].includes(entity.type)
        && (entity.type !== "dimension" || !!entity.dimensionKind)
        && (entity.type !== "circle" || !entity.legacy),
      )
    : [];

  /**
   * La proyección del editor es una vista PARCIAL: no modela `context`, donde
   * viven el color/tipo de línea/grosor explícitos, la cota, el `handle` del
   * DXF de origen y la procedencia de lo importado. Como los tipos `box`,
   * `station`, `text` y `connector` se reemplazan en bloque desde ella, todo
   * eso se perdía en CADA guardado del estudio moderno: el muro al que alguien
   * puso un color dejaba de tenerlo, y lo importado perdía su trazabilidad.
   *
   * Lo que la proyección no sabe expresar no puede destruirlo. Si trae su
   * propio `context` manda ella; si no, se conserva el del documento base.
   */
  const baseById = new Map((base?.entities ?? []).map((entity) => [entity.id, entity]));
  const projected = projection.entities.map((entity) => {
    const previous = baseById.get(entity.id);
    if (!previous) return entity;
    let carried = entity;
    if (carried.context === undefined && previous.context !== undefined)
      carried = { ...carried, context: structuredClone(previous.context) } as CadEntity;
    /**
     * Y los otros dos huecos de la misma vista parcial:
     *
     *   · `text` declara `style`, `height` y `rotation`, que no son decorativos
     *     —la altura ES el tamaño del texto en el dibujo y la rotación la puso
     *     el usuario— y `CadEditorAnnotation` no los lleva.
     *   · `connector` declara `layer`, pero `layoutToCadDocument` escribe
     *     `"Flow"` LITERAL: la capa del conector no es que se perdiese al
     *     guardar, es que nunca se leía.
     *
     * Mismo criterio que arriba: si la proyección lo trae manda ella, y si no
     * se conserva lo del base. El acarreo es POR ENTIDAD, así que una entidad
     * nueva nunca hereda de otra.
     */
    if (carried.type === "text" && previous.type === "text") {
      const style = carried.style ?? previous.style;
      const height = carried.height ?? previous.height;
      const rotation = carried.rotation ?? previous.rotation;
      if (
        style !== carried.style ||
        height !== carried.height ||
        rotation !== carried.rotation
      )
        carried = {
          ...carried,
          ...(style === undefined ? {} : { style }),
          ...(height === undefined ? {} : { height }),
          ...(rotation === undefined ? {} : { rotation }),
        };
    } else if (
      carried.type === "connector" &&
      previous.type === "connector" &&
      carried.layer === CONNECTOR_LAYER &&
      previous.layer !== CONNECTOR_LAYER
    ) {
      // `CONNECTOR_LAYER` es el valor que el adaptador impone cuando no sabe
      // nada, así que verlo en la proyección significa "no lo sé", no "quiero
      // esta capa". Sólo entonces se conserva la del documento.
      carried = { ...carried, layer: previous.layer };
    }
    return carried;
  });
  const entities = [...projected, ...preserved].sort(byId);
  const current = base ? migrateCadDocument(base) : projection;
  return {
    ...current,
    /**
     * `meta` se reconstruye desde el documento BASE, así que todo lo que la
     * proyección quiera cambiar tiene que pasar por aquí explícitamente. Antes
     * sólo pasaba `unit`, y la huella del documento cargado se reimponía sobre
     * cualquier cambio de tamaño de planta o de rejilla — que es contenido que
     * el usuario compuso, no una preferencia de vista.
     *
     * Asimétrico a propósito: si la proyección NO trae huella, se conserva la
     * del documento. Lo que la proyección no sabe expresar no puede destruirlo.
     */
    meta: {
      ...current.meta,
      schema: CAD_DOCUMENT_SCHEMA,
      unit: projection.meta.unit,
      ...(projection.meta.footprintW === undefined
        ? {}
        : { footprintW: projection.meta.footprintW }),
      ...(projection.meta.footprintH === undefined
        ? {}
        : { footprintH: projection.meta.footprintH }),
      ...(projection.meta.gridSize === undefined
        ? {}
        : { gridSize: projection.meta.gridSize }),
    },
    layers: projection.layers.length ? projection.layers : current.layers,
    entities,
    // `entities` va ordenado por id para canonicalización; derivar el orden de
    // dibujo de ahí lo alfabetizaba en CADA reproyección (tras editar una
    // propiedad, transformar o mover un grip). Se conserva el z-order previo.
    modelSpace: {
      entityIds: preserveDrawOrder(
        base?.modelSpace?.entityIds ?? [],
        entities.map((entity) => entity.id),
      ),
    },
  };
}
