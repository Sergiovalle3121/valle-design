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
import type { CadPoint3 } from "./cad-document";
import { cloneContext } from "./entity-context";
import {
  boundsContained,
  boundsIntersect,
  pathHit,
  pointInPolygon,
  pointsBounds,
} from "./entity-hit-geometry";
import { cadTransformPoint3, cadTransformScaleFactor } from "./transform2d";
import {
  wallFillSegments,
  wallFootprint,
  wallLength,
  wallMidpoint,
} from "./wall-geometry";
import type {
  CadBounds,
  CadEntityAdapter,
  CadNativeEntity,
  CadPropertyValue,
  CadRenderPath,
} from "./entity-runtime";

type WallEntity = Extract<CadNativeEntity, { type: "wall" }>;

const finite = (value: CadPropertyValue | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Positivo o el valor anterior: un grosor 0 tecleado no degenera el muro. */
const positive = (value: CadPropertyValue | undefined, fallback: number): number => {
  const parsed = finite(value, fallback);
  return parsed > 0 ? parsed : fallback;
};

function wallPaths(entity: WallEntity): CadRenderPath[] {
  const footprint = wallFootprint(entity);
  // Receta degenerada (no debería cruzar la frontera, pero un documento en
  // memoria puede pasar por aquí antes de validarse): se enseña el eje pelado
  // en vez de nada, para que el muro roto se pueda ver y borrar.
  if (!footprint)
    return [{ points: [
      { x: entity.start.x, y: entity.start.y },
      { x: entity.end.x, y: entity.end.y },
    ], closed: false }];
  return [
    { points: footprint, closed: true },
    ...wallFillSegments(entity).map((segment) => ({
      points: [segment.a, segment.b],
      closed: false,
    })),
  ];
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
  renderer: { paths: (entity) => wallPaths(entity) },
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
      layer: entity.layer,
    }),
    /**
     * Grosor y altura se escriben y la geometría se REDERIVA sola: es la
     * recompensa de persistir la receta. `length` es derivada y no se
     * escribe — no hay una forma única de alargar un eje para que mida lo
     * pedido sin decidir qué extremo se queda quieto.
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
