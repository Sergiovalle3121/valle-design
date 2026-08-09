/**
 * Adaptadores de MTEXT e INSERT.
 *
 * Salieron de `entity-runtime.ts` en la ola de sólidos: aquel archivo está en el
 * trinquete de tamaño y sólo puede encoger. Van juntos porque INSERT necesita
 * dibujar el contenido de su bloque y ese contenido incluye MTEXT, así que
 * separarlos habría dejado un import cruzado entre dos módulos hermanos sin
 * ganar nada.
 *
 * Lo que comparten de verdad es la regla de reflexión: ninguno de los dos es
 * geometría que se pueda reflejar punto a punto. Un INSERT es
 * `{insertion, rotation, scale}` y un MTEXT lleva una rotación de texto; en
 * ambos casos reflejar significa **volver a descomponer** el producto de
 * matrices en esos campos, y de ahí sale la regla de que el ángulo se RESTA en
 * vez de sumarse.
 */
import type { CadDocument, CadEntity, CadPoint2, CadPoint3 } from "./cad-document";
import { circleAdapter, isLegacyCircle, lineAdapter } from "./basic-native-adapters";
import { arcAdapter, ellipseAdapter } from "./curve-entity-adapters";
import { dimensionAdapter } from "./dimension-entity-adapter";
import { cloneContext } from "./entity-context";
import {
  boundsContained,
  boundsIntersect,
  pathHit,
  pointInPolygon,
  pointsBounds,
} from "./entity-hit-geometry";
import { hatchAdapter } from "./hatch-entity-adapter";
import { mleaderAdapter } from "./mleader-entity-adapter";
import { layoutCadMText } from "./mtext-layout";
import { polylineAdapter } from "./polyline-entity-adapter";
import { resolveCadInsert } from "./professional-blocks";
import { splineAdapter } from "./spline-entity-adapter";
import {
  cadTransformAngleBase,
  cadTransformIsReflecting,
  cadTransformPoint3,
  cadTransformScaleFactor,
} from "./transform2d";
import type {
  CadBoundsProvider,
  CadEntityAdapter,
  CadEntityRenderer,
  CadEntityTransform,
  CadNativeEntity,
  CadPropertyValue,
  CadRenderPath,
} from "./entity-runtime";

const point3 = (point: CadPoint2, z = 0): CadPoint3 => ({ x: point.x, y: point.y, z });

const finite = (value: CadPropertyValue | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const positive = (value: CadPropertyValue | undefined, fallback: number): number => {
  const next = finite(value, fallback);
  return next > 0 ? next : fallback;
};

const transformPoint = (point: CadPoint3, transform: CadEntityTransform): CadPoint3 =>
  cadTransformPoint3(point, transform);

/** Grados en `[0, 360)`. */
function normalizeAngleDeg(value: number): number {
  return ((value % 360) + 360) % 360;
}

type CadMTextEntity = Extract<CadNativeEntity, { type: "mtext" }>;

const mtextRenderer: CadEntityRenderer<CadMTextEntity> = {
  paths: (entity) => [{ points: layoutCadMText(entity).corners, closed: true }],
};

const mtextBounds: CadBoundsProvider<CadMTextEntity> = {
  bounds: (entity) => layoutCadMText(entity).bounds,
};

function mtextLocalPoint(entity: CadMTextEntity, point: CadPoint2): CadPoint2 {
  const radians = -((entity.rotation ?? 0) * Math.PI) / 180;
  const dx = point.x - entity.insertion.x;
  const dy = point.y - entity.insertion.y;
  return {
    x: dx * Math.cos(radians) - dy * Math.sin(radians),
    y: dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

const mtextAdapter: CadEntityAdapter<CadMTextEntity> = {
  type: "mtext",
  renderer: mtextRenderer,
  bounds: mtextBounds,
  hitTester: {
    hitTest: (entity, point, tolerance) => {
      const layout = layoutCadMText(entity);
      return pointInPolygon(point, layout.corners) || pathHit(mtextRenderer.paths(entity), point, tolerance);
    },
    intersectsWindow: (entity, window, crossing) => {
      const bounds = mtextBounds.bounds(entity);
      return crossing ? boundsIntersect(bounds, window) : boundsContained(bounds, window);
    },
  },
  grips: {
    grips: (entity) => {
      const layout = layoutCadMText(entity);
      const right = {
        x: (layout.corners[1].x + layout.corners[2].x) / 2,
        y: (layout.corners[1].y + layout.corners[2].y) / 2,
      };
      const bottom = {
        x: (layout.corners[2].x + layout.corners[3].x) / 2,
        y: (layout.corners[2].y + layout.corners[3].y) / 2,
      };
      const rotationRadians = ((entity.rotation ?? 0) * Math.PI) / 180;
      return [
        { id: "insertion", kind: "endpoint" as const, point: entity.insertion, label: "Inserción" },
        { id: "width", kind: "control" as const, point: right, label: "Ancho de columna" },
        { id: "height", kind: "control" as const, point: bottom, label: "Altura de texto" },
        {
          id: "rotation",
          kind: "control" as const,
          point: {
            x: entity.insertion.x + Math.cos(rotationRadians) * Math.max(layout.width, layout.fontSize * 2),
            y: entity.insertion.y + Math.sin(rotationRadians) * Math.max(layout.width, layout.fontSize * 2),
          },
          label: "Rotación",
        },
      ];
    },
    moveGrip: (entity, gripId, point) => {
      if (gripId === "insertion") return { ...entity, insertion: point3(point, entity.insertion.z) };
      const local = mtextLocalPoint(entity, point);
      if (gripId === "width") {
        const alignment = entity.alignment ?? "top-left";
        const multiplier = alignment.endsWith("center") ? 2 : 1;
        return { ...entity, width: Math.max(entity.height ?? 1, Math.abs(local.x) * multiplier) };
      }
      if (gripId === "height")
        return { ...entity, height: Math.max(1e-6, Math.abs(local.y) / Math.max(1, entity.text.split(/\r?\n/).length)) };
      if (gripId === "rotation")
        return { ...entity, rotation: (Math.atan2(point.y - entity.insertion.y, point.x - entity.insertion.x) * 180) / Math.PI };
      return entity;
    },
  },
  snaps: {
    snaps: (entity) => [
      { kind: "endpoint" as const, point: entity.insertion, label: "Inserción MTEXT" },
      ...layoutCadMText(entity).corners.map((point, index) => ({
        kind: "control" as const,
        point,
        label: `Esquina MTEXT ${index + 1}`,
      })),
    ],
  },
  properties: {
    read: (entity) => ({
      text: entity.text,
      insertionX: entity.insertion.x,
      insertionY: entity.insertion.y,
      width: entity.width ?? (entity.height ?? 120) * 20,
      height: entity.height ?? 120,
      rotation: entity.rotation ?? 0,
      alignment: entity.alignment ?? "top-left",
      paragraphAlignment: entity.paragraphAlignment ?? "left",
      style: entity.style ?? "Standard",
      fontFamily: entity.fontFamily ?? "Arial",
      lineSpacing: entity.lineSpacing ?? 1.2,
      bold: entity.bold ?? false,
      italic: entity.italic ?? false,
      underline: entity.underline ?? false,
      backgroundMask: entity.backgroundMask ?? false,
      backgroundColor: entity.backgroundColor ?? "#111827",
      backgroundPadding: entity.backgroundPadding ?? 0.15,
      columns: entity.columns ?? 1,
      layer: entity.layer,
    }),
    write: (entity, patch) => ({
      ...entity,
      text: typeof patch.text === "string" ? patch.text.slice(0, 16_384) : entity.text,
      insertion: {
        x: finite(patch.insertionX, entity.insertion.x),
        y: finite(patch.insertionY, entity.insertion.y),
        z: entity.insertion.z,
      },
      width: positive(patch.width, entity.width ?? (entity.height ?? 120) * 20),
      height: positive(patch.height, entity.height ?? 120),
      rotation: finite(patch.rotation, entity.rotation ?? 0),
      alignment: typeof patch.alignment === "string" && /^(top|middle|bottom)-(left|center|right)$/.test(patch.alignment)
        ? patch.alignment as CadMTextEntity["alignment"]
        : entity.alignment ?? "top-left",
      paragraphAlignment: patch.paragraphAlignment === "center" || patch.paragraphAlignment === "right" || patch.paragraphAlignment === "justify" || patch.paragraphAlignment === "left"
        ? patch.paragraphAlignment
        : entity.paragraphAlignment ?? "left",
      style: typeof patch.style === "string" ? patch.style.slice(0, 128) : entity.style,
      fontFamily: typeof patch.fontFamily === "string" ? patch.fontFamily.slice(0, 128) : entity.fontFamily,
      lineSpacing: Math.max(0.5, Math.min(4, positive(patch.lineSpacing, entity.lineSpacing ?? 1.2))),
      bold: typeof patch.bold === "boolean" ? patch.bold : entity.bold,
      italic: typeof patch.italic === "boolean" ? patch.italic : entity.italic,
      underline: typeof patch.underline === "boolean" ? patch.underline : entity.underline,
      backgroundMask: typeof patch.backgroundMask === "boolean" ? patch.backgroundMask : entity.backgroundMask,
      backgroundColor: typeof patch.backgroundColor === "string" ? patch.backgroundColor : entity.backgroundColor,
      backgroundPadding: Math.max(0, Math.min(2, finite(patch.backgroundPadding, entity.backgroundPadding ?? 0.15))),
      columns: Math.max(1, Math.min(8, Math.floor(positive(patch.columns, entity.columns ?? 1)))),
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    transform: (entity, transform) => {
      const reflecting = cadTransformIsReflecting(transform);
      const angleBase = cadTransformAngleBase(transform);
      return {
      ...entity,
      insertion: transformPoint(entity.insertion, transform),
      // `width` y `height` AUSENTES se conservan ausentes. Antes se
      // materializaban con su valor por defecto —`width` pasaba a valer
      // `height × 20`— en CUALQUIER transformada, incluida una traslación
      // pura: mover un MTEXT de ancho automático le fijaba el ancho de columna
      // y el texto empezaba a partirse donde antes iba seguido. Conservar la
      // ausencia además es MÁS correcto al escalar, porque el ancho efectivo
      // se deriva de la altura. Lo encontró `entity-transform-roundtrip.spec`.
      ...(entity.width === undefined
        ? {}
        : { width: entity.width * cadTransformScaleFactor(transform) }),
      ...(entity.height === undefined
        ? {}
        : { height: entity.height * cadTransformScaleFactor(transform) }),
      // Igual que el INSERT: bajo reflexión el texto se re-orienta restando.
      // Sumar el giro dejaría el rótulo inclinado hacia el lado contrario al
      // de la geometría que acompaña.
      rotation: normalizeAngleDeg(
        reflecting ? angleBase - (entity.rotation ?? 0) : (entity.rotation ?? 0) + angleBase,
      ),
      context: cloneContext(entity.context),
      };
    },
  },
};

type CadInsertEntity = Extract<CadNativeEntity, { type: "insert" }>;

function blockChildPaths(entity: CadEntity, segments = 96): CadRenderPath[] {
  if (entity.type === "line" && !isLegacyCircle(entity)) return lineAdapter.renderer.paths(entity, segments);
  if (entity.type === "circle" && !isLegacyCircle(entity)) return circleAdapter.renderer.paths(entity, segments);
  if (entity.type === "arc") return arcAdapter.renderer.paths(entity, segments);
  if (entity.type === "ellipse") return ellipseAdapter.renderer.paths(entity, segments);
  if (entity.type === "spline") return splineAdapter.renderer.paths(entity, segments);
  // Antes esto ignoraba `bulge`: los arcos de una polilínea dentro de un
  // bloque se dibujaban como cuerdas rectas. El adaptador los teselan bien.
  if (entity.type === "polyline") return polylineAdapter.renderer.paths(entity, segments);
  if (entity.type === "hatch") return hatchAdapter.renderer.paths(entity, segments);
  if (entity.type === "mtext") return mtextAdapter.renderer.paths(entity, segments);
  if (entity.type === "dimension") return dimensionAdapter.renderer.paths(entity, segments);
  if (entity.type === "mleader") return mleaderAdapter.renderer.paths(entity, segments);
  return [];
}

function insertRenderPaths(entity: CadInsertEntity, segments = 96, document?: CadDocument): CadRenderPath[] {
  if (!document) {
    const radius = 50;
    return [
      { points: [{ x: entity.insertion.x - radius, y: entity.insertion.y }, { x: entity.insertion.x + radius, y: entity.insertion.y }], closed: false },
      { points: [{ x: entity.insertion.x, y: entity.insertion.y - radius }, { x: entity.insertion.x, y: entity.insertion.y + radius }], closed: false },
    ];
  }
  return resolveCadInsert(document, entity, 16).entities.flatMap((child) => blockChildPaths(child, segments));
}

const insertAdapter: CadEntityAdapter<CadInsertEntity> = {
  type: "insert",
  renderer: { paths: insertRenderPaths },
  bounds: {
    bounds: (entity, document) => {
      const points = insertRenderPaths(entity, 96, document).flatMap((path) => path.points);
      return points.length ? pointsBounds(points) : { minX: entity.insertion.x - 50, minY: entity.insertion.y - 50, maxX: entity.insertion.x + 50, maxY: entity.insertion.y + 50 };
    },
  },
  hitTester: {
    hitTest: (entity, point, tolerance, document) => pathHit(insertRenderPaths(entity, 96, document), point, tolerance),
    intersectsWindow: (entity, window, crossing, document) => {
      const bounds = insertAdapter.bounds.bounds(entity, document);
      return crossing ? boundsIntersect(bounds, window) : boundsContained(bounds, window);
    },
  },
  grips: {
    grips: (entity) => {
      const radians = entity.rotation * Math.PI / 180;
      const reach = Math.max(200, Math.abs(entity.scale.x) * 400, Math.abs(entity.scale.y) * 400);
      return [
        { id: "insertion", kind: "endpoint", point: entity.insertion, label: "Inserción BLOCK" },
        { id: "rotation", kind: "control", point: { x: entity.insertion.x + Math.cos(radians) * reach, y: entity.insertion.y + Math.sin(radians) * reach }, label: "Rotación INSERT" },
        { id: "scale", kind: "control", point: { x: entity.insertion.x + Math.cos(radians + Math.PI / 4) * reach, y: entity.insertion.y + Math.sin(radians + Math.PI / 4) * reach }, label: "Escala INSERT" },
      ];
    },
    moveGrip: (entity, gripId, point) => {
      if (gripId === "insertion") return { ...entity, insertion: point3(point, entity.insertion.z) };
      const distance = Math.hypot(point.x - entity.insertion.x, point.y - entity.insertion.y);
      if (gripId === "rotation") return { ...entity, rotation: Math.atan2(point.y - entity.insertion.y, point.x - entity.insertion.x) * 180 / Math.PI };
      if (gripId === "scale") {
        const factor = Math.max(1e-9, distance / 400);
        return { ...entity, scale: { x: Math.sign(entity.scale.x || 1) * factor, y: Math.sign(entity.scale.y || 1) * factor, z: entity.scale.z } };
      }
      return entity;
    },
  },
  snaps: { snaps: (entity) => [{ kind: "endpoint", point: entity.insertion, label: "Inserción BLOCK" }] },
  properties: {
    read: (entity) => ({
      block: entity.block, insertionX: entity.insertion.x, insertionY: entity.insertion.y,
      scaleX: entity.scale.x, scaleY: entity.scale.y, rotation: entity.rotation, layer: entity.layer,
      attributeCount: Object.keys(entity.attributes ?? {}).length,
      ...Object.fromEntries(Object.entries(entity.attributes ?? {}).map(([key, value]) => [`attribute:${key}`, value])),
    }),
    write: (entity, patch) => ({
      ...entity,
      block: typeof patch.block === "string" ? patch.block : entity.block,
      insertion: { x: finite(patch.insertionX, entity.insertion.x), y: finite(patch.insertionY, entity.insertion.y), z: entity.insertion.z },
      scale: { x: finite(patch.scaleX, entity.scale.x), y: finite(patch.scaleY, entity.scale.y), z: entity.scale.z },
      rotation: finite(patch.rotation, entity.rotation),
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
      attributes: Object.fromEntries(Object.entries(entity.attributes ?? {}).map(([key, value]) => [key, typeof patch[`attribute:${key}`] === "string" ? patch[`attribute:${key}`] as string : value])),
    }),
  },
  commands: {
    /**
     * Un INSERT no es geometría: es `{insertion, rotation, scale}`, que
     * `insertMatrix` recompone como `T(ins)·R(rot)·S(scale)·T(−base)`. Así que
     * reflejarlo NO es reflejar puntos — es **volver a descomponer** el
     * producto en esos tres campos. Explotarlo sería la otra salida, y está
     * descartada: rompería la referencia al bloque.
     *
     * De `Ref(φ)·Rot(θ) = Rot(φ−θ)·diag(1,−1)` sale la regla entera:
     *
     *     rotación' = φ − rotación        (se RESTA, no se suma)
     *     escala'   = (k·sx, −k·sy)       (exactamente UN eje negado)
     *
     * Dos trampas, y las dos dan un dibujo plausible:
     *
     * 1. Sumar en vez de restar se equivoca en `2·rotación`, y es INVISIBLE en
     *    todo bloque colocado a 0° — que son casi todos. Una puerta a 30° en un
     *    muro inclinado aparece reflejada respecto de un eje 60° girado: acaba
     *    fuera del muro al que pertenece, con las bisagras en la jamba
     *    equivocada, y parece corrupción de datos y no un error de fórmula.
     * 2. `Math.abs` sobre la escala compuesta se come el espejo. El signo se
     *    MULTIPLICA, no se asigna: reflejar dos veces tiene que devolver la
     *    escala positiva de partida.
     *
     * `scale.z` no se toca: una reflexión en el plano no tiene componente z.
     */
    transform: (entity, transform) => {
      const reflecting = cadTransformIsReflecting(transform);
      const factor = cadTransformScaleFactor(transform);
      const base = cadTransformAngleBase(transform);
      return {
        ...entity,
        insertion: transformPoint(entity.insertion, transform),
        scale: {
          x: entity.scale.x * factor,
          y: entity.scale.y * factor * (reflecting ? -1 : 1),
          z: entity.scale.z,
        },
        rotation: normalizeAngleDeg(reflecting ? base - entity.rotation : entity.rotation + base),
        context: cloneContext(entity.context),
      };
    },
  },
};

export { insertAdapter, mtextAdapter };
