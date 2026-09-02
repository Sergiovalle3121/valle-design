/**
 * Adaptador nativo de TEXT (una sola línea, sin caja propia).
 *
 * TEXT y MTEXT comparten layout: ambos son un rótulo anclado en un punto, con
 * altura, rotación y familia de letra. La diferencia real es que TEXT no
 * declara `width` — una sola línea no se envuelve — así que este adaptador
 * SINTETIZA un MTEXT de una línea (`asMText`) y reutiliza `layoutCadMText`
 * para maqueta, caja y esquinas, en vez de repetir esa trigonometría.
 *
 * El ancho sintético se MIDE (`measureCadMText`), no se adivina: uno por
 * defecto o heurístico se queda corto con según qué mezcla de caracteres y
 * `layoutCadMText` envuelve la línea en dos donde AutoCAD la deja seguida —
 * exactamente el defecto que un TEXT no puede tener.
 *
 * El anclaje es `top-left`, igual que las dos conversiones DXF ya existentes
 * cuando el origen no trae uno explícito: `cadDxfMTextsToNativeEntities`
 * (`dxf-cad-document.ts`) y el TEXT anidado en un INSERT (`entity-three.ts`,
 * `buildCadMTextSprite`). Anclar distinto aquí habría dibujado el mismo TEXT
 * de dos formas según si vive suelto en el documento o dentro de un bloque.
 *
 * Depende de `mtext-layout.ts` y `entity-hit-geometry.ts` directamente, NO de
 * `block-text-adapters.ts`: ese módulo importará `textAdapter` de aquí para
 * `blockChildPaths`, y la dirección contraria cerraría el mismo ciclo que ya
 * evita `dimension-entity-adapter.ts` con `transform2d`.
 */
import type { CadPoint2 } from "./cad-document";
import { cloneContext } from "./entity-context";
import {
  boundsContained,
  boundsIntersect,
  pathHit,
  pointInPolygon,
} from "./entity-hit-geometry";
import { layoutCadMText, measureCadMText, type CadMTextEntity } from "./mtext-layout";
import {
  cadTransformAngleBase,
  cadTransformIsReflecting,
  cadTransformPoint3,
  cadTransformScaleFactor,
} from "./transform2d";
import type {
  CadEntityAdapter,
  CadEntityTransform,
  CadNativeEntity,
  CadPropertyValue,
  CadRenderPath,
} from "./entity-runtime";

type NativeText = Extract<CadNativeEntity, { type: "text" }>;

const DEFAULT_HEIGHT = 120;

const finite = (value: CadPropertyValue | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const positive = (value: CadPropertyValue | undefined, fallback: number): number => {
  const next = finite(value, fallback);
  return next > 0 ? next : fallback;
};

/** Grados en `[0, 360)`. Misma regla que `block-text-adapters.ts`. */
function normalizeAngleDeg(value: number): number {
  return ((value % 360) + 360) % 360;
}

/**
 * Expuesta para `entity-three.ts`: el sprite de un TEXT suelto y el de un
 * TEXT anidado en un INSERT tienen que medir el mismo ancho que este
 * adaptador usa para maqueta/impacto, o el recuadro de selección y el
 * rótulo dibujado divergen.
 */
export function asMText(entity: NativeText): CadMTextEntity {
  const height = positive(entity.height, DEFAULT_HEIGHT);
  const width = Math.max(
    1e-6,
    ...entity.text.split(/\r?\n/).map((line) => measureCadMText(line, height)),
  );
  return {
    id: entity.id,
    type: "mtext",
    insertion: { x: entity.x, y: entity.y, z: 0 },
    text: entity.text,
    width,
    height,
    rotation: entity.rotation ?? 0,
    alignment: "top-left",
    paragraphAlignment: "left",
    style: entity.style,
    layer: entity.layer,
    // El color explícito (ACI/true-color) vive en `context.presentation` y lo
    // lee directamente `buildCadMTextSprite` (`entity-three.ts`). Sin este
    // campo el rótulo sintético cae al gris por defecto aunque la entidad
    // real traiga su propio color — perdía exactamente lo que ya cuidaba el
    // guiño de INSERT antes de que este adaptador existiera.
    context: entity.context,
  };
}

function localPoint(entity: NativeText, point: CadPoint2): CadPoint2 {
  const radians = -((entity.rotation ?? 0) * Math.PI) / 180;
  const dx = point.x - entity.x;
  const dy = point.y - entity.y;
  return {
    x: dx * Math.cos(radians) - dy * Math.sin(radians),
    y: dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

function textPaths(entity: NativeText): CadRenderPath[] {
  return [{ points: layoutCadMText(asMText(entity)).corners, closed: true }];
}

function textBounds(entity: NativeText) {
  return layoutCadMText(asMText(entity)).bounds;
}

export const textAdapter: CadEntityAdapter<NativeText> = {
  type: "text",
  renderer: { paths: (entity) => textPaths(entity), textOnly: true },
  bounds: { bounds: (entity) => textBounds(entity) },
  hitTester: {
    hitTest: (entity, point, tolerance) => {
      const layout = layoutCadMText(asMText(entity));
      return pointInPolygon(point, layout.corners) || pathHit(textPaths(entity), point, tolerance);
    },
    intersectsWindow: (entity, window, crossing) => {
      const bounds = textBounds(entity);
      return crossing ? boundsIntersect(bounds, window) : boundsContained(bounds, window);
    },
  },
  grips: {
    grips: (entity) => {
      const layout = layoutCadMText(asMText(entity));
      const bottom = {
        x: (layout.corners[2].x + layout.corners[3].x) / 2,
        y: (layout.corners[2].y + layout.corners[3].y) / 2,
      };
      const rotationRadians = ((entity.rotation ?? 0) * Math.PI) / 180;
      return [
        { id: "insertion", kind: "endpoint" as const, point: { x: entity.x, y: entity.y }, label: "Inserción" },
        { id: "height", kind: "control" as const, point: bottom, label: "Altura de texto" },
        {
          id: "rotation",
          kind: "control" as const,
          point: {
            x: entity.x + Math.cos(rotationRadians) * Math.max(layout.width, layout.fontSize * 2),
            y: entity.y + Math.sin(rotationRadians) * Math.max(layout.width, layout.fontSize * 2),
          },
          label: "Rotación",
        },
      ];
    },
    moveGrip: (entity, gripId, point) => {
      if (gripId === "insertion") return { ...entity, x: point.x, y: point.y };
      if (gripId === "height") {
        const local = localPoint(entity, point);
        const lines = Math.max(1, entity.text.split(/\r?\n/).length);
        return { ...entity, height: Math.max(1e-6, Math.abs(local.y) / lines) };
      }
      if (gripId === "rotation")
        return { ...entity, rotation: (Math.atan2(point.y - entity.y, point.x - entity.x) * 180) / Math.PI };
      return entity;
    },
  },
  snaps: {
    snaps: (entity) => [
      { kind: "endpoint" as const, point: { x: entity.x, y: entity.y }, label: "Inserción TEXT" },
      ...layoutCadMText(asMText(entity)).corners.map((point, index) => ({
        kind: "control" as const,
        point,
        label: `Esquina TEXT ${index + 1}`,
      })),
    ],
  },
  properties: {
    read: (entity) => ({
      text: entity.text,
      insertionX: entity.x,
      insertionY: entity.y,
      height: entity.height ?? DEFAULT_HEIGHT,
      rotation: entity.rotation ?? 0,
      style: entity.style ?? "Standard",
      color: entity.color ?? "",
      layer: entity.layer,
    }),
    write: (entity, patch) => ({
      ...entity,
      text: typeof patch.text === "string" ? patch.text.slice(0, 16_384) : entity.text,
      x: finite(patch.insertionX, entity.x),
      y: finite(patch.insertionY, entity.y),
      height: positive(patch.height, entity.height ?? DEFAULT_HEIGHT),
      rotation: finite(patch.rotation, entity.rotation ?? 0),
      style: typeof patch.style === "string" ? patch.style.slice(0, 128) : entity.style,
      color: typeof patch.color === "string" ? patch.color.slice(0, 64) || undefined : entity.color,
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    transform: (entity, transform: CadEntityTransform) => {
      const reflecting = cadTransformIsReflecting(transform);
      const angleBase = cadTransformAngleBase(transform);
      const moved = cadTransformPoint3({ x: entity.x, y: entity.y, z: 0 }, transform);
      return {
        ...entity,
        x: moved.x,
        y: moved.y,
        // Igual que MTEXT: la ausencia de `height` se conserva ausente en vez
        // de materializarse con el valor por defecto bajo cualquier
        // transformada. Ver `block-text-adapters.ts`.
        ...(entity.height === undefined
          ? {}
          : { height: entity.height * cadTransformScaleFactor(transform) }),
        rotation: normalizeAngleDeg(
          reflecting ? angleBase - (entity.rotation ?? 0) : (entity.rotation ?? 0) + angleBase,
        ),
        context: cloneContext(entity.context),
      };
    },
  },
};
