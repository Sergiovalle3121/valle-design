/**
 * Adaptador de WALL para `CAD_ENTITY_REGISTRY`.
 *
 * Con esto el muro es una entidad del dibujo como cualquier otra: se dibuja,
 * se pincha, se designa con una ventana, tiene grips y snaps, sale en el panel
 * de propiedades y responde a MOVE, ROTATE, SCALE, MIRROR y COPY sin que
 * ninguno de esos comandos sepa que es BIM.
 *
 * ## Qué se dibuja de un muro en planta
 *
 * La doble línea con el GROSOR REAL —el contorno cerrado que deriva
 * `wall-geometry.ts`— más un rayado ligero a 45° que dice «cortado por el
 * plano». El eje NO se dibuja: es la receta, no el trazo, igual que el árbol
 * de un SOLID3D no se enseña como diagrama encima de la pieza.
 *
 * ## El grip que edita la receta
 *
 * Los extremos del eje son grips de verdad: moverlos REEDITA el muro (la
 * doble línea se rederiva), no lo deforma. Es la diferencia entre un muro y
 * cuatro segmentos que se le parecen.
 */
import type { CadDocument, CadPoint3 } from "./cad-document";
import { cloneContext } from "./entity-context";
import {
  boundsContained,
  boundsIntersect,
  pathHit,
  pointInPolygon,
  pointsBounds,
} from "./entity-hit-geometry";
import { cadTransformPoint3, cadTransformScaleFactor } from "./transform2d";
import { isCadWallMaterialId } from "./wall-materials";
import {
  wallFillSegments,
  wallFootprint,
  wallLength,
  wallMidpoint,
} from "./wall-geometry";
import {
  CAD_WALL_JOIN_POINT_TOLERANCE,
  wallJoinBoundaryPaths,
  wallJoinDependents,
  wallJoinFillWindow,
  wallJoinedFootprint,
  wallJoins,
  type CadWallJoins,
} from "./wall-joins";
import {
  splitFaceByIntervals,
  wallAxisFrame,
  wallFaces,
  wallOpeningIntervals,
  type CadOpeningSpan,
} from "./wall-openings";
import type {
  CadBounds,
  CadEntityAdapter,
  CadEntityNeighborQuery,
  CadNativeEntity,
  CadPropertyValue,
  CadRenderPath,
} from "./entity-runtime";

type WallEntity = Extract<CadNativeEntity, { type: "wall" }>;
type OpeningEntity = Extract<CadNativeEntity, { type: "opening" }>;

const finite = (value: CadPropertyValue | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Positivo o el valor anterior: un grosor 0 tecleado no degenera el muro. */
const positive = (value: CadPropertyValue | undefined, fallback: number): number => {
  const parsed = finite(value, fallback);
  return parsed > 0 ? parsed : fallback;
};

/**
 * Uniones del muro contra los demás muros del documento — o `null` si no hay
 * documento (consumidores que derivan el muro aislado: contornos BOUNDARY,
 * previsualizaciones) o si ningún extremo une. Con `null`, la geometría es
 * EXACTAMENTE la de siempre: el muro solitario no paga la existencia de las
 * uniones ni en forma ni en número de trazos.
 */
function wallDocumentJoins(entity: WallEntity, document?: CadDocument): CadWallJoins | null {
  if (!document) return null;
  const others = document.entities.filter(
    (candidate): candidate is WallEntity => candidate.type === "wall" && candidate.id !== entity.id,
  );
  if (others.length === 0) return null;
  const joins = wallJoins(entity, others);
  if (joins.start.kind === "free" && joins.end.kind === "free") return null;
  return joins;
}

/**
 * Rayado interior limitado a la ventana que los recortes de las uniones dejan
 * en el eje: un trazo que llegara al plano del extremo invadiría la masa del
 * muro vecino. Sin uniones, es `wallFillSegments` tal cual.
 *
 * Los HUECOS quitan además su intervalo: rayar dentro de una puerta diría que
 * ahí hay muro cortado por el plano, que es justo lo contrario de lo que un
 * hueco significa.
 */
function wallFillPaths(
  entity: WallEntity,
  joins: CadWallJoins | null,
  openings: readonly CadOpeningSpan[] = [],
): CadRenderPath[] {
  const segments = wallFillSegments(entity);
  if ((!joins && openings.length === 0) || segments.length === 0)
    return segments.map((segment) => ({ points: [segment.a, segment.b], closed: false }));
  const dx = entity.end.x - entity.start.x;
  const dy = entity.end.y - entity.start.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const fillWindow = joins ? wallJoinFillWindow(joins, length) : { min: 0, max: length };
  return segments
    .filter((segment) => {
      const ta = (segment.a.x - entity.start.x) * ux + (segment.a.y - entity.start.y) * uy;
      const tb = (segment.b.x - entity.start.x) * ux + (segment.b.y - entity.start.y) * uy;
      const low = Math.min(ta, tb);
      const high = Math.max(ta, tb);
      if (low < fillWindow.min - 1e-9 || high > fillWindow.max + 1e-9) return false;
      // Un trazo que ASOMA al hueco se tira entero, no se recorta: un rayado a
      // medias contra el canto del vano parece un defecto de dibujo y no un
      // hueco, que es la misma razón por la que `wallFillSegments` descarta los
      // que no caben entre las dos caras.
      return !openings.some((span) => high > span.from + 1e-9 && low < span.to - 1e-9);
    })
    .map((segment) => ({ points: [segment.a, segment.b], closed: false }));
}

/** Huecos ALOJADOS en este muro, en el orden en que estén en el documento. */
export function wallHostedOpenings(
  entity: Pick<WallEntity, "id">,
  document?: CadDocument,
): OpeningEntity[] {
  if (!document) return [];
  return document.entities.filter(
    (candidate): candidate is OpeningEntity =>
      candidate.type === "opening" && candidate.hostId === entity.id,
  );
}

function wallPaths(entity: WallEntity, document?: CadDocument): CadRenderPath[] {
  const footprint = wallFootprint(entity);
  // Receta degenerada (no debería cruzar la frontera, pero un documento en
  // memoria puede pasar por aquí antes de validarse): se enseña el eje pelado
  // en vez de nada, para que el muro roto se pueda ver y borrar.
  if (!footprint)
    return [{ points: [
      { x: entity.start.x, y: entity.start.y },
      { x: entity.end.x, y: entity.end.y },
    ], closed: false }];
  const joins = wallDocumentJoins(entity, document);
  const openings = wallOpeningIntervals(entity, wallHostedOpenings(entity, document));
  if (!joins && openings.length === 0)
    return [
      { points: footprint, closed: true },
      ...wallFillPaths(entity, null),
    ];
  // Con uniones, el contorno se ajusta (inglete/empalme) y los testeros
  // absorbidos no se trazan: la esquina limpia no enseña la diagonal.
  const joined = joins ? (wallJoinedFootprint(entity, joins) ?? footprint) : footprint;
  const startCap = joins ? joins.start.cap : true;
  const endCap = joins ? joins.end.cap : true;
  if (openings.length === 0)
    return [
      ...wallJoinBoundaryPaths(joined, startCap, endCap),
      ...wallFillPaths(entity, joins),
    ];

  // Con huecos, el contorno DEJA DE SER un anillo: las dos caras largas se
  // parten y el muro pasa a ser una colección de trazos abiertos. Se compone a
  // mano en vez de por `wallJoinBoundaryPaths` porque aquella función existe
  // para decidir qué TESTEROS se trazan, y aquí lo que cambia son las CARAS.
  // Las jambas del vano NO se dibujan aquí: son del hueco (véase
  // `opening-entity-adapter.ts`), de modo que borrar la puerta devuelve la cara
  // continua sin que el muro tenga que enterarse.
  const frame = wallAxisFrame(entity);
  if (!frame) return [{ points: joined, closed: true }];
  const faces = wallFaces(frame, joined);
  const [startLeft, startRight, endRight, endLeft] = joined;
  return [
    ...(startCap ? [{ points: [startLeft, startRight], closed: false }] : []),
    ...splitFaceByIntervals(faces.left.a, faces.left.b, faces.left.tA, faces.left.tB, openings),
    ...splitFaceByIntervals(faces.right.a, faces.right.b, faces.right.tA, faces.right.tB, openings),
    ...(endCap ? [{ points: [endLeft, endRight], closed: false }] : []),
    ...wallFillPaths(entity, joins, openings),
  ];
}

/**
 * Los vecinos a los que este muro les cambia la unión.
 *
 * La caja de consulta es la del contorno base con la tolerancia de unión de
 * margen, y eso alcanza a TODOS los candidatos posibles: los dos criterios de
 * unión —extremo compartido y extremo sobre el eje— exigen contacto, y un
 * punto de contacto está dentro de las dos cajas. Consultar por caja en vez de
 * recorrer los muros del documento es lo que mantiene acotado el coste de una
 * edición en un plano de miles de entidades.
 */
function wallDependents(entity: WallEntity, near: CadEntityNeighborQuery): string[] {
  const bounds = wallBounds(entity);
  const margin = CAD_WALL_JOIN_POINT_TOLERANCE;
  const candidates: WallEntity[] = [];
  // Los huecos ALOJADOS son dependientes por definición: su geometría entera
  // sale del eje de este muro, así que moverlo deja obsoleto lo que hubiera
  // cacheado de ellos. Sin esta línea, mover el muro dejaría la puerta pintada
  // en su sitio de antes — sin error, sin aviso, y visible sólo mirando el
  // plano, que es exactamente el fallo que `dependents` existe para impedir.
  const hosted: string[] = [];
  for (const candidate of near({
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  })) {
    if (candidate.type === "wall") candidates.push(candidate);
    else if (candidate.type === "opening" && candidate.hostId === entity.id)
      hosted.push(candidate.id);
  }
  return [...wallJoinDependents(entity, candidates), ...hosted];
}

function wallBounds(entity: WallEntity): CadBounds {
  const footprint = wallFootprint(entity);
  return pointsBounds(
    footprint ?? [
      { x: entity.start.x, y: entity.start.y },
      { x: entity.end.x, y: entity.end.y },
    ],
  );
}

const wallAdapter: CadEntityAdapter<WallEntity> = {
  type: "wall",
  // El tercer argumento es el DOCUMENTO — la misma vía por la que INSERT
  // resuelve su definición de bloque. Es lo que permite que las uniones sean
  // derivadas: el muro se dibuja mirando a sus vecinos sin persistir nada.
  //
  // Y por eso el muro DECLARA las dos consecuencias de mirar a los vecinos:
  // que no puede teselarse en un worker que no lleva documento (`needsDocument`
  // lo aparta de ese carril), y que al moverse deja obsoleto el contorno ya
  // cacheado de los muros con los que se unía (`dependents` los nombra).
  renderer: {
    paths: (entity, _segments, document) => wallPaths(entity, document),
    needsDocument: true,
    dependents: wallDependents,
  },
  bounds: { bounds: (entity) => wallBounds(entity) },
  hitTester: {
    // Un muro se pincha por su contorno O por dentro: es un cuerpo, no un
    // trazo — la misma regla que SOLID3D y REGION.
    hitTest: (entity, point, tolerance) => {
      const footprint = wallFootprint(entity);
      if (!footprint) return pathHit(wallPaths(entity), point, tolerance);
      if (pathHit([{ points: footprint, closed: true }], point, tolerance)) return true;
      return pointInPolygon(point, footprint);
    },
    intersectsWindow: (entity, window, crossing) => {
      const bounds = wallBounds(entity);
      return crossing ? boundsIntersect(bounds, window) : boundsContained(bounds, window);
    },
  },
  grips: {
    grips: (entity) => [
      { id: "start", kind: "endpoint", point: { x: entity.start.x, y: entity.start.y }, label: "Inicio del eje" },
      { id: "end", kind: "endpoint", point: { x: entity.end.x, y: entity.end.y }, label: "Fin del eje" },
      { id: "midpoint", kind: "center", point: wallMidpoint(entity), label: "Punto medio del eje" },
    ],
    moveGrip: (entity, gripId, point) => {
      if (gripId === "start")
        return { ...entity, start: { x: point.x, y: point.y, z: entity.start.z } };
      if (gripId === "end")
        return { ...entity, end: { x: point.x, y: point.y, z: entity.end.z } };
      if (gripId === "midpoint") {
        const middle = wallMidpoint(entity);
        return wallAdapter.commands.transform(entity, {
          translation: { x: point.x - middle.x, y: point.y - middle.y },
        });
      }
      return entity;
    },
  },
  snaps: {
    snaps: (entity) => [
      { kind: "endpoint", point: { x: entity.start.x, y: entity.start.y }, label: "Inicio del eje" },
      { kind: "endpoint", point: { x: entity.end.x, y: entity.end.y }, label: "Fin del eje" },
      { kind: "center", point: wallMidpoint(entity), label: "Punto medio del eje" },
      // Las esquinas del contorno son a lo que se engancha quien acota el
      // muro terminado: la cara, no el eje.
      ...(wallFootprint(entity) ?? []).map((corner) => ({
        kind: "endpoint" as const,
        point: corner,
        label: "Esquina del muro",
      })),
    ],
  },
  properties: {
    read: (entity) => ({
      startX: entity.start.x,
      startY: entity.start.y,
      endX: entity.end.x,
      endY: entity.end.y,
      thickness: entity.thickness,
      height: entity.height,
      length: wallLength(entity),
      // A diferencia de `symbolBlock` del hueco (que se omite si no está),
      // `material` SIEMPRE aparece en la bolsa, vacío si no hay uno: es la
      // única vía para DESCUBRIR y fijar el material de un muro por primera
      // vez desde el panel de propiedades genérico — `commonKeys` sólo
      // ofrece una fila para claves que YA están en la bolsa de los sujetos
      // designados, así que una clave omitida en un muro sin material nunca
      // llegaría a mostrarse para poder teclearla.
      material: entity.material ?? "",
      layer: entity.layer,
    }),
    /**
     * Grosor y altura se escriben y la geometría se REDERIVA sola: es la
     * recompensa de persistir la receta. `length` es derivada y no se
     * escribe — no hay una forma única de alargar un eje para que mida lo
     * pedido sin decidir qué extremo se queda quieto.
     *
     * `material` es de un conjunto FINITO (`wall-materials.ts`): lo que no
     * resuelve no se escribe, mismo criterio que `kind`/`swing`/`hinge` del
     * hueco. Cadena vacía BORRA el campo (vuelve al genérico) en vez de
     * contar como inválida — es la única forma de quitarle el material a un
     * muro desde un campo de texto libre, mientras no hay selector.
     */
    write: (entity, patch) => ({
      ...entity,
      start: {
        x: finite(patch.startX, entity.start.x),
        y: finite(patch.startY, entity.start.y),
        z: entity.start.z,
      },
      end: {
        x: finite(patch.endX, entity.end.x),
        y: finite(patch.endY, entity.end.y),
        z: entity.end.z,
      },
      thickness: positive(patch.thickness, entity.thickness),
      height: positive(patch.height, entity.height),
      material:
        patch.material === ""
          ? undefined
          : isCadWallMaterialId(patch.material)
            ? patch.material
            : entity.material,
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    /**
     * El eje se transforma punto a punto y el grosor va por
     * `cadTransformScaleFactor` (√|det|), como el radio de un círculo: bajo
     * `scaleXY`, `mirror` o `affine` no existe el campo `scale` y un factor
     * fijo de 1 dejaría el muro movido pero con su grosor de antes. La altura
     * NO se escala — por decisión del producto, escalar una planta al doble
     * no sube los muros al doble de altura (misma doctrina que la `z` en
     * `cadTransformPoint3`).
     */
    transform: (entity, transform) => ({
      ...entity,
      start: cadTransformPoint3(entity.start as CadPoint3, transform),
      end: cadTransformPoint3(entity.end as CadPoint3, transform),
      thickness: entity.thickness * cadTransformScaleFactor(transform),
      context: cloneContext(entity.context),
    }),
  },
};

export { wallAdapter };
export type { WallEntity };
