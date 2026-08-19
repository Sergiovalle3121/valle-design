/**
 * Adaptador de OPENING para `CAD_ENTITY_REGISTRY`.
 *
 * Con esto el hueco es una entidad del dibujo: se pincha, se designa con una
 * ventana, sale en el panel de propiedades y se borra. Lo que NO hace —y es la
 * decisión central del esquema 7— es tener coordenadas propias: cada trazo se
 * deriva del EJE de su muro anfitrión, leído del documento.
 *
 * ## Qué dibuja el hueco y qué dibuja el muro
 *
 * El reparto no es arbitrario, es lo que hace que borrar la puerta cierre el
 * vano sin código que lo cierre:
 *
 *  - El MURO parte sus dos caras largas por el intervalo del hueco
 *    (`wall-entity-adapter.ts`). Si el hueco desaparece, no hay intervalo que
 *    partir y la cara vuelve a salir entera. No hay estado que revertir.
 *  - El HUECO dibuja las dos JAMBAS —los cantos de obra del vano— y el
 *    símbolo: la hoja con su barrido en una puerta, el vidrio y la carpintería
 *    en una ventana. Al borrarlo se van con él.
 *
 * ## Sin anfitrión no se dibuja nada, y es lo correcto
 *
 * Un hueco cuyo `hostId` no resuelve no tiene dónde estar. No se inventa una
 * posición ni se pinta un marcador en el origen: se devuelven cero trazos. Ese
 * estado no lo puede producir el editor —el GC transaccional de
 * `entity-commands.ts` retira los huecos cuyo anfitrión se borra, en el mismo
 * lote— y la frontera del servidor lo rechaza al guardar nombrando el hueco.
 * Dibujar «algo» aquí sería inventarse una puerta que el modelo no tiene.
 *
 * ## Por qué NO tiene grips ni puntos de referencia
 *
 * `CadGripProvider` y `CadSnapProvider` reciben la entidad y NADA más — sin
 * documento. Los tres proveedores que sí lo reciben (render, caja y hit-test)
 * son justo los que necesitaban derivar de los vecinos. Un hueco sin documento
 * no se puede situar, así que devolver grips sería devolver puntos inventados.
 * Ampliar esas dos firmas toca `Layout3DEditor.tsx`, que es de otra sesión;
 * queda pedido. Mientras tanto el hueco se edita por PROPIEDADES —`position`
 * lo desliza por el eje, `width` lo ensancha— que es una superficie de edición
 * completa, y no una a medias que parezca la de arrastrar.
 *
 * ## MOVE no mueve un hueco, y tampoco es un olvido
 *
 * `transform` deja `position` intacta ante una traslación o un giro: el hueco
 * se mueve porque se mueve su muro, y aplicarle además la traslación lo movería
 * DOS veces cuando el usuario designa el muro y la puerta juntos —que es lo que
 * hace cualquiera con una ventana de selección—. Lo único que una transformada
 * cambia es la ESCALA (un plano escalado al doble tiene puertas del doble) y la
 * mano de la hoja cuando la transformada refleja.
 */
import type { CadDocument, CadEntity, CadPoint2 } from "./cad-document";
import { blockChildPaths } from "./block-text-adapters";
import type { CadOpeningEntity } from "./cad-entities-v7";
import { cloneContext } from "./entity-context";
import {
  boundsContained,
  boundsIntersect,
  pathHit,
  pointsBounds,
} from "./entity-hit-geometry";
import { resolveCadInsert } from "./professional-blocks";
import { cadTransformIsReflecting, cadTransformScaleFactor } from "./transform2d";
import { wallFootprint } from "./wall-geometry";
import { wallJoinedFootprint, wallJoins } from "./wall-joins";
import {
  wallAxisFrame,
  wallFaces,
  wallOpeningFit,
  wallOpeningJambs,
  wallOpeningSpan,
  wallOpeningSymbolFrame,
  wallOpeningSymbolPaths,
} from "./wall-openings";
import type {
  CadBounds,
  CadEntityAdapter,
  CadEntityNeighborQuery,
  CadNativeEntity,
  CadPropertyValue,
  CadRenderPath,
} from "./entity-runtime";

type OpeningEntity = CadOpeningEntity;
type WallEntity = Extract<CadNativeEntity, { type: "wall" }>;

const finite = (value: CadPropertyValue | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Positivo o el valor anterior: un ancho 0 tecleado no degenera el hueco. */
const positive = (value: CadPropertyValue | undefined, fallback: number): number => {
  const parsed = finite(value, fallback);
  return parsed > 0 ? parsed : fallback;
};

/** No negativo: un antepecho puede ser 0 (una puerta) pero nunca negativo. */
const nonNegative = (value: CadPropertyValue | undefined, fallback: number): number => {
  const parsed = finite(value, fallback);
  return parsed >= 0 ? parsed : fallback;
};

export function openingHost(entity: OpeningEntity, document?: CadDocument): WallEntity | undefined {
  if (!document) return undefined;
  return document.entities.find(
    (candidate): candidate is WallEntity =>
      candidate.type === "wall" && candidate.id === entity.hostId,
  );
}

/**
 * Contorno del anfitrión CON sus uniones ya resueltas.
 *
 * Las jambas del hueco tienen que llegar a la cara REAL del muro, y en una
 * esquina en inglete esa cara no es la del contorno base. Se recalculan las
 * uniones aquí en vez de guardarlas porque son derivadas —igual que en el
 * adaptador del muro—: un contorno de jamba cacheado quedaría desfasado en
 * cuanto alguien moviese el muro vecino.
 */
function hostFootprint(host: WallEntity, document?: CadDocument): CadPoint2[] | null {
  const base = wallFootprint(host);
  if (!base || !document) return base;
  const others = document.entities.filter(
    (candidate): candidate is WallEntity =>
      candidate.type === "wall" && candidate.id !== host.id,
  );
  if (others.length === 0) return base;
  const joins = wallJoins(host, others);
  if (joins.start.kind === "free" && joins.end.kind === "free") return base;
  return wallJoinedFootprint(host, joins) ?? base;
}

/**
 * El símbolo del BLOQUE del estudio, escalado al hueco y girado con el muro.
 *
 * El bloque se escala por su anchura NATURAL —la de su propia caja— para que
 * una puerta de 900 dibujada con el bloque de un despacho ocupe 900 y no lo que
 * midiera el bloque. Se mide con el bloque resuelto a escala 1: es la única
 * forma de saber cuánto mide un bloque cualquiera sin exigirle una convención
 * que la biblioteca de otro no tiene por qué cumplir.
 *
 * Devuelve `null` —y quien llama cae al símbolo de fábrica— cuando el bloque no
 * existe o es degenerado. La referencia rota se rechaza en la frontera del
 * servidor; aquí se dibuja algo reconocible en vez de dejar el hueco mudo.
 */
function symbolBlockPaths(
  entity: OpeningEntity,
  host: WallEntity,
  document: CadDocument,
  segments: number,
): CadRenderPath[] | null {
  const blockName = entity.symbolBlock;
  if (!blockName) return null;
  const frame = wallAxisFrame(host);
  if (!frame) return null;

  const measured = resolveCadInsert(document, {
    id: `${entity.id}:probe`,
    type: "insert",
    block: blockName,
    insertion: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    layer: entity.layer,
  });
  if (measured.entities.length === 0) return null;
  const naturalBounds = blockBounds(measured.entities, segments);
  if (!naturalBounds) return null;
  const placement = wallOpeningSymbolFrame(frame, entity, naturalBounds.maxX - naturalBounds.minX);
  if (!placement) return null;

  const placed = resolveCadInsert(document, {
    id: `${entity.id}:symbol`,
    type: "insert",
    block: blockName,
    insertion: { x: placement.insertion.x, y: placement.insertion.y, z: 0 },
    scale: { x: placement.scale, y: placement.scale, z: placement.scale },
    rotation: placement.rotationDeg,
    layer: entity.layer,
  });
  const paths = blockPaths(placed.entities, segments);
  return paths.length ? paths : null;
}

/**
 * Trazos de las entidades resueltas de un bloque.
 *
 * Se pasa por el MISMO teselador que usa INSERT (`blockChildPaths`) en vez de
 * por una tabla propia: dos teselados del mismo bloque son dos dibujos
 * distintos de la misma puerta, y el que se pincha dejaría de ser el que se ve.
 */
function blockPaths(entities: readonly CadEntity[], segments: number): CadRenderPath[] {
  return entities.flatMap((child) => blockChildPaths(child, segments));
}

function blockBounds(entities: readonly CadEntity[], segments: number): CadBounds | null {
  const points = blockPaths(entities, segments).flatMap((path) => path.points);
  if (points.length === 0) return null;
  const bounds = pointsBounds(points);
  return bounds.maxX - bounds.minX > 1e-9 ? bounds : null;
}

export function openingPaths(
  entity: OpeningEntity,
  segments = 96,
  document?: CadDocument,
): CadRenderPath[] {
  const host = openingHost(entity, document);
  if (!host || !document) return [];
  const frame = wallAxisFrame(host);
  const footprint = hostFootprint(host, document);
  if (!frame || !footprint) return [];
  if (!wallOpeningFit(host, entity).ok) return [];

  const faces = wallFaces(frame, footprint);
  const jambs = wallOpeningJambs(faces, wallOpeningSpan(entity));
  const symbol =
    symbolBlockPaths(entity, host, document, segments) ?? wallOpeningSymbolPaths(frame, entity);
  return [...jambs, ...symbol];
}

function openingBounds(entity: OpeningEntity, document?: CadDocument): CadBounds {
  const points = openingPaths(entity, 96, document).flatMap((path) => path.points);
  // Sin anfitrión no hay caja posible. Se devuelve la degenerada del origen
  // porque el contrato de `bounds` no admite ausencia; el estado sólo existe
  // en un documento que la frontera ya rechazó.
  return pointsBounds(points);
}

/**
 * El ANFITRIÓN es dependiente del hueco: cambiar el hueco cambia por dónde se
 * parten las caras del muro. Es la relación simétrica de la que declara el
 * muro, y hace falta igual — sin ella, ensanchar una puerta dejaría el muro
 * dibujado con el vano de antes.
 */
function openingDependents(entity: OpeningEntity, near: CadEntityNeighborQuery): string[] {
  const bounds = openingBounds(entity);
  for (const candidate of near(bounds))
    if (candidate.type === "wall" && candidate.id === entity.hostId) return [candidate.id];
  // La caja del hueco puede salir degenerada cuando se pregunta sin documento;
  // el anfitrión se nombra igual, porque su id lo lleva la propia entidad.
  return [entity.hostId];
}

const openingAdapter: CadEntityAdapter<OpeningEntity> = {
  type: "opening",
  renderer: {
    paths: (entity, segments, document) => openingPaths(entity, segments ?? 96, document),
    // Sin documento no hay anfitrión y no hay geometría: la marca es lo que
    // mantiene al hueco fuera del worker de teselado, que viaja sin documento.
    needsDocument: true,
    dependents: openingDependents,
  },
  bounds: { bounds: (entity, document) => openingBounds(entity, document) },
  hitTester: {
    hitTest: (entity, point, tolerance, document) =>
      pathHit(openingPaths(entity, 96, document), point, tolerance),
    intersectsWindow: (entity, window, crossing, document) => {
      const paths = openingPaths(entity, 96, document);
      if (paths.length === 0) return false;
      const bounds = pointsBounds(paths.flatMap((path) => path.points));
      return crossing ? boundsIntersect(bounds, window) : boundsContained(bounds, window);
    },
  },
  // Véase la cabecera: sin documento no hay puntos que ofrecer, y ofrecer
  // puntos inventados es peor que no ofrecer ninguno.
  grips: { grips: () => [], moveGrip: (entity) => entity },
  snaps: { snaps: () => [] },
  properties: {
    read: (entity) => ({
      kind: entity.kind,
      hostId: entity.hostId,
      position: entity.position,
      width: entity.width,
      height: entity.height,
      sill: entity.sill,
      swing: entity.swing,
      hinge: entity.hinge,
      ...(entity.symbolBlock ? { symbolBlock: entity.symbolBlock } : {}),
      layer: entity.layer,
    }),
    /**
     * `hostId` NO se escribe desde propiedades. Mudar una puerta de muro cambia
     * el sistema de coordenadas en el que vive: la misma `position` significa
     * otro sitio, y puede no caber. Es una operación de comando —con el muro
     * designado y la comprobación de que cabe—, no un campo que se teclea.
     */
    write: (entity, patch) => ({
      ...entity,
      kind: patch.kind === "door" || patch.kind === "window" ? patch.kind : entity.kind,
      position: finite(patch.position, entity.position),
      width: positive(patch.width, entity.width),
      height: positive(patch.height, entity.height),
      sill: nonNegative(patch.sill, entity.sill),
      swing: patch.swing === "left" || patch.swing === "right" ? patch.swing : entity.swing,
      hinge: patch.hinge === "start" || patch.hinge === "end" ? patch.hinge : entity.hinge,
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    transform: (entity, transform) => {
      const factor = cadTransformScaleFactor(transform);
      return {
        ...entity,
        // La traslación y el giro dan factor 1 y no tocan nada: el hueco viaja
        // dentro del marco de su muro. Véase la cabecera.
        position: entity.position * factor,
        width: entity.width * factor,
        // La altura y el antepecho escalan con el resto por coherencia con el
        // grosor del muro; que la ALTURA del muro no escale es una decisión de
        // producto sobre la extrusión, no sobre el hueco, que es geometría de
        // alzado y se cotiza en la tabla de cantidades.
        height: entity.height * factor,
        sill: entity.sill * factor,
        // Una reflexión cambia la mano: la imagen especular del lado izquierdo
        // del eje ES el lado derecho del eje reflejado. La bisagra no cambia
        // porque se nombra por el extremo del eje, y los extremos se reflejan
        // a sí mismos.
        swing: cadTransformIsReflecting(transform)
          ? entity.swing === "left"
            ? "right"
            : "left"
          : entity.swing,
        context: cloneContext(entity.context),
      };
    },
  },
};

export { openingAdapter };
export type { OpeningEntity };
