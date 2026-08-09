import {
  type CadDocument,
  type CadEntity,
  type CadEntityContext,
  type CadPoint2,
  type CadPoint3,
} from "./cad-document";
import {
  tessellateArc,
  tessellateEllipse,
  tessellateSpline,
} from "./curve-tessellate";
import { hatchPolygon } from "./hatch";
import { layoutCadMText } from "./mtext-layout";
import {
  cadAffineAngle,
  cadAffineDet,
  cadAffineFromTransform,
  cadAffineIsConformal,
  cadAffineIsReflecting,
  cadTransformAngleBase,
  cadTransformIsReflecting,
  cadTransformPoint3,
  cadTransformScaleFactor,
  cadTransformVector3,
  type CadAffine2,
} from "./transform2d";
import { circleAdapter, isLegacyCircle, isLegacyDimension, lineAdapter } from "./basic-native-adapters";
import { dimensionAdapter } from "./dimension-entity-adapter";
import {
  boundsContained,
  boundsIntersect,
  pathHit,
  pointInPolygon,
  pointsBounds,
} from "./entity-hit-geometry";
import { hatchAdapter } from "./hatch-entity-adapter";
import { mleaderAdapter } from "./mleader-entity-adapter";
import { resolveCadInsert } from "./professional-blocks";
import { hatchRegionContainsPoint, type CadBoundaryPath } from "./hatch-associativity";

export type CadNativeEntity = Extract<
  CadEntity,
  { type: "line" | "polyline" | "circle" | "arc" | "ellipse" | "spline" | "hatch" | "mtext" | "dimension" | "mleader" | "insert" }
>;
export type CadNativeEntityType = CadNativeEntity["type"];

export interface CadBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CadRenderPath {
  points: CadPoint2[];
  closed: boolean;
}

export type CadGripKind =
  | "center"
  | "endpoint"
  | "quadrant"
  | "axis"
  | "control";

export interface CadGrip {
  id: string;
  kind: CadGripKind;
  point: CadPoint2;
  label: string;
}

export type CadSnapKind =
  | "center"
  | "endpoint"
  | "quadrant"
  | "tangent"
  | "control";

export interface CadSnapPoint {
  kind: CadSnapKind;
  point: CadPoint2;
  label: string;
}

export type CadPropertyValue = string | number | boolean;
export type CadPropertyBag = Record<string, CadPropertyValue>;

export interface CadEntityRenderer<E extends CadNativeEntity = CadNativeEntity> {
  paths(entity: E, segments?: number, document?: CadDocument): CadRenderPath[];
}

export interface CadHitTester<E extends CadNativeEntity = CadNativeEntity> {
  hitTest(entity: E, point: CadPoint2, tolerance: number, document?: CadDocument): boolean;
  intersectsWindow(entity: E, window: CadBounds, crossing: boolean, document?: CadDocument): boolean;
}

export interface CadGripProvider<E extends CadNativeEntity = CadNativeEntity> {
  grips(entity: E): CadGrip[];
  moveGrip(entity: E, gripId: string, point: CadPoint2): E;
}

export interface CadSnapProvider<E extends CadNativeEntity = CadNativeEntity> {
  snaps(entity: E, cursor?: CadPoint2): CadSnapPoint[];
}

export interface CadPropertyAdapter<E extends CadNativeEntity = CadNativeEntity> {
  read(entity: E): CadPropertyBag;
  write(entity: E, patch: Partial<CadPropertyBag>): E;
}

export interface CadBoundsProvider<E extends CadNativeEntity = CadNativeEntity> {
  bounds(entity: E, document?: CadDocument): CadBounds;
}

/**
 * Transformada aplicable a una entidad.
 *
 * Los cuatro primeros campos son el vocabulario histórico y su comportamiento
 * está congelado bit a bit (ver `cadTransformPoint3`). Los tres últimos son
 * nuevos y amplían lo expresable a **cualquier afín 2×3**, que es lo que hacía
 * falta para MIRROR: una reflexión tiene determinante negativo y no se puede
 * escribir como giro más escala uniforme, por mucho que se intente.
 */
export interface CadEntityTransform {
  translation?: CadPoint2;
  rotationDeg?: number;
  scale?: number;
  origin?: CadPoint2;
  /** Escala no uniforme. Gana sobre `scale` cuando ambas están presentes. */
  scaleXY?: CadPoint2;
  /** Eje de reflexión: un punto y una dirección (no hace falta normalizarla). */
  mirror?: { point: CadPoint2; direction: CadPoint2 };
  /** Escotilla de escape: si viene, gana sobre todo lo demás. */
  affine?: CadAffine2;
}

export {
  cadTransformAngleBase,
  cadTransformIsReflecting,
  cadTransformScaleFactor,
} from "./transform2d";

export interface CadCommandAdapter<E extends CadNativeEntity = CadNativeEntity> {
  transform(entity: E, transform: CadEntityTransform): E;
}

export interface CadEntityAdapter<E extends CadNativeEntity = CadNativeEntity> {
  type: E["type"];
  renderer: CadEntityRenderer<E>;
  hitTester: CadHitTester<E>;
  grips: CadGripProvider<E>;
  snaps: CadSnapProvider<E>;
  properties: CadPropertyAdapter<E>;
  bounds: CadBoundsProvider<E>;
  commands: CadCommandAdapter<E>;
}

function point3(point: CadPoint2, z = 0): CadPoint3 {
  return { x: point.x, y: point.y, z };
}

/**
 * Copia profunda del contexto de una entidad (color/tipo de línea/grosor
 * explícitos, procedencia, vínculo de negocio). Se exporta porque el ejecutor
 * de comandos la necesita al copiar una entidad: sin ella, el original y la
 * copia compartirían el mismo objeto `presentation` y cambiar el color de una
 * cambiaría el de la otra.
 */
export function cloneContext(context: CadEntityContext | undefined): CadEntityContext | undefined {
  if (!context) return undefined;
  return {
    ...context,
    ...(context.normal ? { normal: { ...context.normal } } : {}),
    ...(context.presentation
      ? {
          presentation: {
            ...context.presentation,
            ...(context.presentation.color
              ? { color: { ...context.presentation.color } }
              : {}),
            ...(context.presentation.linetype
              ? { linetype: { ...context.presentation.linetype } }
              : {}),
            ...(context.presentation.lineweight
              ? { lineweight: { ...context.presentation.lineweight } }
              : {}),
          },
        }
      : {}),
    ...(context.metadata ? { metadata: { ...context.metadata } } : {}),
    ...(context.provenance ? { provenance: { ...context.provenance } } : {}),
    ...(context.businessLink ? { businessLink: { ...context.businessLink } } : {}),
  };
}

function transformPoint(point: CadPoint3, transform: CadEntityTransform): CadPoint3 {
  return cadTransformPoint3(point, transform);
}

/** Grados en `[0, 360)`, que es el rango que DXF exige a un arco. */
function normalizeAngleDeg(value: number): number {
  return ((value % 360) + 360) % 360;
}

/** Sólo la parte lineal: para direcciones, como el eje mayor de una elipse. */
function transformVector(point: CadPoint3, transform: CadEntityTransform): CadPoint3 {
  return cadTransformVector3(point, transform);
}

function finite(value: CadPropertyValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positive(value: CadPropertyValue | undefined, fallback: number): number {
  const next = finite(value, fallback);
  return next > 0 ? next : fallback;
}

function anglePoint(center: CadPoint3, radius: number, angleDeg: number): CadPoint2 {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  };
}

function normalizedSweep(startAngle: number, endAngle: number): number {
  let sweep = endAngle - startAngle;
  while (sweep <= 0) sweep += 360;
  return sweep;
}

function angleOnArc(angle: number, startAngle: number, endAngle: number): boolean {
  const sweep = normalizedSweep(startAngle, endAngle);
  let offset = angle - startAngle;
  while (offset < 0) offset += 360;
  return offset <= sweep + 1e-7;
}

function commonHitTester<E extends CadNativeEntity>(
  renderer: CadEntityRenderer<E>,
  boundsProvider: CadBoundsProvider<E>,
): CadHitTester<E> {
  return {
    hitTest: (entity, point, tolerance) =>
      boundsIntersect(boundsProvider.bounds(entity), {
        minX: point.x - tolerance,
        minY: point.y - tolerance,
        maxX: point.x + tolerance,
        maxY: point.y + tolerance,
      }) && pathHit(renderer.paths(entity, 96), point, tolerance),
    intersectsWindow: (entity, window, crossing) => {
      const entityBounds = boundsProvider.bounds(entity);
      return crossing
        ? boundsIntersect(entityBounds, window)
        : boundsContained(entityBounds, window);
    },
  };
}

const arcRenderer: CadEntityRenderer<Extract<CadNativeEntity, { type: "arc" }>> = {
  paths: (entity, segments = 72) => [
    {
      points: tessellateArc(
        entity.center,
        entity.radius,
        entity.startAngle,
        entity.endAngle,
        segments,
      ),
      closed: false,
    },
  ],
};

const arcBounds: CadBoundsProvider<Extract<CadNativeEntity, { type: "arc" }>> = {
  bounds: (entity) =>
    pointsBounds(
      [entity.startAngle, entity.endAngle, 0, 90, 180, 270]
        .filter(
          (angle, index) =>
            index < 2 ||
            angleOnArc(angle, entity.startAngle, entity.endAngle),
        )
        .map((angle) => anglePoint(entity.center, entity.radius, angle)),
    ),
};

const arcAdapter: CadEntityAdapter<
  Extract<CadNativeEntity, { type: "arc" }>
> = {
  type: "arc",
  renderer: arcRenderer,
  bounds: arcBounds,
  hitTester: commonHitTester(arcRenderer, arcBounds),
  grips: {
    grips: (entity) => [
      {
        id: "center",
        kind: "center",
        point: entity.center,
        label: "Centro",
      },
      {
        id: "start",
        kind: "endpoint",
        point: anglePoint(entity.center, entity.radius, entity.startAngle),
        label: "Inicio",
      },
      {
        id: "end",
        kind: "endpoint",
        point: anglePoint(entity.center, entity.radius, entity.endAngle),
        label: "Fin",
      },
      ...[0, 90, 180, 270]
        .filter((angle) =>
          angleOnArc(angle, entity.startAngle, entity.endAngle),
        )
        .map((angle) => ({
          id: `quadrant:${angle}`,
          kind: "quadrant" as const,
          point: anglePoint(entity.center, entity.radius, angle),
          label: `Cuadrante ${angle}°`,
        })),
    ],
    moveGrip: (entity, gripId, point) => {
      if (gripId === "center") {
        return { ...entity, center: point3(point, entity.center.z) };
      }
      const dx = point.x - entity.center.x;
      const dy = point.y - entity.center.y;
      const radius = Math.hypot(dx, dy);
      if (!(radius > 0)) return entity;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (gripId === "start") return { ...entity, radius, startAngle: angle };
      if (gripId === "end") return { ...entity, radius, endAngle: angle };
      if (gripId.startsWith("quadrant:")) return { ...entity, radius };
      return entity;
    },
  },
  snaps: {
    snaps: (entity, cursor) => {
      const points: CadSnapPoint[] = [
        { kind: "center", point: entity.center, label: "Centro" },
        {
          kind: "endpoint",
          point: anglePoint(entity.center, entity.radius, entity.startAngle),
          label: "Extremo inicial",
        },
        {
          kind: "endpoint",
          point: anglePoint(entity.center, entity.radius, entity.endAngle),
          label: "Extremo final",
        },
        ...[0, 90, 180, 270]
          .filter((angle) =>
            angleOnArc(angle, entity.startAngle, entity.endAngle),
          )
          .map((angle) => ({
            kind: "quadrant" as const,
            point: anglePoint(entity.center, entity.radius, angle),
            label: `Cuadrante ${angle}°`,
          })),
      ];
      if (cursor) {
        const dx = cursor.x - entity.center.x;
        const dy = cursor.y - entity.center.y;
        const distance = Math.hypot(dx, dy);
        if (distance > entity.radius) {
          const base = (Math.atan2(dy, dx) * 180) / Math.PI;
          const offset = (Math.acos(entity.radius / distance) * 180) / Math.PI;
          for (const angle of [base - offset, base + offset]) {
            if (angleOnArc(angle, entity.startAngle, entity.endAngle)) {
              points.push({
                kind: "tangent",
                point: anglePoint(entity.center, entity.radius, angle),
                label: "Tangente",
              });
            }
          }
        }
      }
      return points;
    },
  },
  properties: {
    read: (entity) => ({
      centerX: entity.center.x,
      centerY: entity.center.y,
      radius: entity.radius,
      startAngle: entity.startAngle,
      endAngle: entity.endAngle,
      layer: entity.layer,
    }),
    write: (entity, patch) => ({
      ...entity,
      center: {
        ...entity.center,
        x: finite(patch.centerX, entity.center.x),
        y: finite(patch.centerY, entity.center.y),
      },
      radius: positive(patch.radius, entity.radius),
      startAngle: finite(patch.startAngle, entity.startAngle),
      endAngle: finite(patch.endAngle, entity.endAngle),
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    /**
     * Un arco DXF se recorre SIEMPRE en antihorario de `startAngle` a
     * `endAngle`. Una reflexión invierte el sentido del plano, así que el arco
     * reflejado no es «el mismo con los ángulos reflejados»: es el que va del
     * FINAL reflejado al INICIO reflejado. Los extremos se intercambian además
     * de reflejarse.
     *
     * Reflejarlos sin intercambiarlos produce el arco COMPLEMENTARIO —el trozo
     * de circunferencia que el usuario no dibujó—, con el mismo centro y el
     * mismo radio. En una esquina redondeada eso se ve como un arco que sale
     * disparado al otro lado; en un arco casi cerrado, no se ve en absoluto.
     */
    transform: (entity, transform) => {
      const reflecting = cadTransformIsReflecting(transform);
      const base = cadTransformAngleBase(transform);
      return {
        ...entity,
        center: transformPoint(entity.center, transform),
        radius: entity.radius * cadTransformScaleFactor(transform),
        // Se normaliza a [0, 360), que es lo que exige DXF. Antes se sumaba
        // `rotationDeg` en crudo, y como podía ser negativo los ángulos se
        // cancelaban solos al ir y volver. `cadTransformAngleBase` devuelve
        // siempre un ángulo positivo, así que sin normalizar aquí un giro y su
        // contrario acumulaban 360° — una vuelta entera de deriva por cada
        // pareja de operaciones.
        startAngle: normalizeAngleDeg(reflecting ? base - entity.endAngle : entity.startAngle + base),
        endAngle: normalizeAngleDeg(reflecting ? base - entity.startAngle : entity.endAngle + base),
        context: cloneContext(entity.context),
      };
    },
  },
};

const ellipseRenderer: CadEntityRenderer<
  Extract<CadNativeEntity, { type: "ellipse" }>
> = {
  paths: (entity, segments = 96) => [
    {
      points: tessellateEllipse(
        entity.center,
        entity.majorAxis,
        entity.ratio,
        entity.startParameter,
        entity.endParameter,
        segments,
      ),
      closed:
        normalizedSweep(entity.startParameter, entity.endParameter) >=
        360 - 1e-7,
    },
  ],
};

const ellipseBounds: CadBoundsProvider<
  Extract<CadNativeEntity, { type: "ellipse" }>
> = {
  bounds: (entity) =>
    pointsBounds(ellipseRenderer.paths(entity, 192)[0].points),
};

function ellipsePoint(
  entity: Extract<CadNativeEntity, { type: "ellipse" }>,
  parameterDeg: number,
): CadPoint2 {
  return tessellateEllipse(
    entity.center,
    entity.majorAxis,
    entity.ratio,
    parameterDeg,
    parameterDeg + 1e-8,
    1,
  )[0];
}

const ellipseAdapter: CadEntityAdapter<
  Extract<CadNativeEntity, { type: "ellipse" }>
> = {
  type: "ellipse",
  renderer: ellipseRenderer,
  bounds: ellipseBounds,
  hitTester: commonHitTester(ellipseRenderer, ellipseBounds),
  grips: {
    grips: (entity) => [
      { id: "center", kind: "center", point: entity.center, label: "Centro" },
      {
        id: "major:positive",
        kind: "axis",
        point: {
          x: entity.center.x + entity.majorAxis.x,
          y: entity.center.y + entity.majorAxis.y,
        },
        label: "Eje mayor",
      },
      {
        id: "major:negative",
        kind: "axis",
        point: {
          x: entity.center.x - entity.majorAxis.x,
          y: entity.center.y - entity.majorAxis.y,
        },
        label: "Eje mayor",
      },
      {
        id: "minor:positive",
        kind: "axis",
        point: {
          x: entity.center.x - entity.majorAxis.y * entity.ratio,
          y: entity.center.y + entity.majorAxis.x * entity.ratio,
        },
        label: "Eje menor",
      },
      {
        id: "minor:negative",
        kind: "axis",
        point: {
          x: entity.center.x + entity.majorAxis.y * entity.ratio,
          y: entity.center.y - entity.majorAxis.x * entity.ratio,
        },
        label: "Eje menor",
      },
      {
        id: "start",
        kind: "endpoint",
        point: ellipsePoint(entity, entity.startParameter),
        label: "Inicio",
      },
      {
        id: "end",
        kind: "endpoint",
        point: ellipsePoint(entity, entity.endParameter),
        label: "Fin",
      },
    ],
    moveGrip: (entity, gripId, point) => {
      if (gripId === "center")
        return { ...entity, center: point3(point, entity.center.z) };
      const vector = {
        x: point.x - entity.center.x,
        y: point.y - entity.center.y,
        z: entity.majorAxis.z,
      };
      if (gripId.startsWith("major:")) {
        const sign = gripId.endsWith("negative") ? -1 : 1;
        return {
          ...entity,
          majorAxis: {
            x: vector.x * sign,
            y: vector.y * sign,
            z: vector.z,
          },
        };
      }
      if (gripId.startsWith("minor:")) {
        const majorLength = Math.hypot(entity.majorAxis.x, entity.majorAxis.y);
        if (!(majorLength > 0)) return entity;
        return {
          ...entity,
          ratio: Math.max(
            1e-6,
            Math.min(1, Math.hypot(vector.x, vector.y) / majorLength),
          ),
        };
      }
      const majorLength = Math.hypot(entity.majorAxis.x, entity.majorAxis.y);
      if (!(majorLength > 0)) return entity;
      const rotation = Math.atan2(entity.majorAxis.y, entity.majorAxis.x);
      const cos = Math.cos(-rotation);
      const sin = Math.sin(-rotation);
      const localX = vector.x * cos - vector.y * sin;
      const localY = vector.x * sin + vector.y * cos;
      const parameter =
        (Math.atan2(localY / entity.ratio, localX) * 180) / Math.PI;
      if (gripId === "start") return { ...entity, startParameter: parameter };
      if (gripId === "end") return { ...entity, endParameter: parameter };
      return entity;
    },
  },
  snaps: {
    snaps: (entity) => [
      { kind: "center", point: entity.center, label: "Centro" },
      ...[0, 90, 180, 270].map((parameter) => ({
        kind: "quadrant" as const,
        point: ellipsePoint(entity, parameter),
        label: `Cuadrante ${parameter}°`,
      })),
      {
        kind: "endpoint",
        point: ellipsePoint(entity, entity.startParameter),
        label: "Extremo inicial",
      },
      {
        kind: "endpoint",
        point: ellipsePoint(entity, entity.endParameter),
        label: "Extremo final",
      },
    ],
  },
  properties: {
    read: (entity) => ({
      centerX: entity.center.x,
      centerY: entity.center.y,
      majorAxisX: entity.majorAxis.x,
      majorAxisY: entity.majorAxis.y,
      ratio: entity.ratio,
      startParameter: entity.startParameter,
      endParameter: entity.endParameter,
      layer: entity.layer,
    }),
    write: (entity, patch) => ({
      ...entity,
      center: {
        ...entity.center,
        x: finite(patch.centerX, entity.center.x),
        y: finite(patch.centerY, entity.center.y),
      },
      majorAxis: {
        ...entity.majorAxis,
        x: finite(patch.majorAxisX, entity.majorAxis.x),
        y: finite(patch.majorAxisY, entity.majorAxis.y),
      },
      ratio: Math.max(1e-6, Math.min(1, positive(patch.ratio, entity.ratio))),
      startParameter: finite(
        patch.startParameter,
        entity.startParameter,
      ),
      endParameter: finite(patch.endParameter, entity.endParameter),
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    /**
     * El eje mayor es un VECTOR desde el centro, no un punto: va por la parte
     * lineal, sin traslación. Pasarlo por `transformPoint` lo mandaría a la
     * otra punta del plano y alargaría la elipse en proporción a lo lejos que
     * estuviera del origen.
     *
     * Bajo reflexión hay además una segunda cosa: la elipse se recorre en
     * sentido contrario. Para una elipse COMPLETA eso no se nota, pero para un
     * arco elíptico los parámetros deben reflejarse e intercambiarse igual que
     * los ángulos de un arco. Se hace aquí para que un arco elíptico importado
     * de DXF no se convierta en su complementario al espejarlo.
     *
     * ## Los parámetros están en GRADOS
     *
     * Esta regla nació escrita en RADIANES —`2π − parámetro`, con la elipse
     * completa detectada como `end − start ≈ 2π`— y ninguna de las dos cosas
     * casa con el resto del producto: `tessellateEllipse` recibe grados, el
     * renderizador cierra la curva cuando el barrido llega a 360, `paper-space`
     * compara contra 359,999 y la importación DXF escribe `0…360`. Con la
     * convención equivocada, espejar un arco elíptico de 0° a 90° producía
     * −83,7°…6,28°: un trozo de elipse que el usuario no dibujó, en el sitio
     * equivocado.
     *
     * La spec de ida y vuelta no lo cazó porque su ejemplar iba de 0 a `2π`, y
     * bajo la comparación en radianes eso se clasificaba como elipse completa:
     * la rama de reflexión NUNCA se ejecutaba. La propiedad se cumplía de forma
     * vacía. Ahora hay un ancla absoluta que fija el valor concreto.
     *
     * Nota aparte: `engine/commands/draw-curves.ts` emite `endParameter:
     * Math.PI * 2` al crear una elipse, que en grados son 6,28° — un gajo. Ese
     * archivo queda fuera de este cambio; el defecto está anotado en el PR.
     */
    transform: (entity, transform) => {
      const reflecting = cadTransformIsReflecting(transform);
      const full = Math.abs(entity.endParameter - entity.startParameter) >= 360 - 1e-9;
      return {
        ...entity,
        center: transformPoint(entity.center, transform),
        majorAxis: transformVector(entity.majorAxis, transform),
        ...(reflecting && !full
          ? {
              startParameter: 360 - entity.endParameter,
              endParameter: 360 - entity.startParameter,
            }
          : {}),
        context: cloneContext(entity.context),
      };
    },
  },
};

const splineRenderer: CadEntityRenderer<
  Extract<CadNativeEntity, { type: "spline" }>
> = {
  paths: (entity, segments = 96) => [
    {
      points: tessellateSpline(
        entity.controlPoints,
        entity.degree,
        entity.knots,
        segments,
      ),
      closed: entity.closed === true,
    },
  ],
};

const splineBounds: CadBoundsProvider<
  Extract<CadNativeEntity, { type: "spline" }>
> = {
  bounds: (entity) =>
    pointsBounds(splineRenderer.paths(entity, 160)[0].points),
};

const splineAdapter: CadEntityAdapter<
  Extract<CadNativeEntity, { type: "spline" }>
> = {
  type: "spline",
  renderer: splineRenderer,
  bounds: splineBounds,
  hitTester: commonHitTester(splineRenderer, splineBounds),
  grips: {
    grips: (entity) =>
      entity.controlPoints.map((point, index) => ({
        id: `control:${index}`,
        kind: "control",
        point,
        label: `Control ${index + 1}`,
      })),
    moveGrip: (entity, gripId, point) => {
      const index = Number(gripId.split(":")[1]);
      if (!Number.isInteger(index) || !entity.controlPoints[index]) return entity;
      return {
        ...entity,
        controlPoints: entity.controlPoints.map((control, current) =>
          current === index ? point3(point, control.z) : { ...control },
        ),
      };
    },
  },
  snaps: {
    snaps: (entity) =>
      entity.controlPoints.map((point, index) => ({
        kind:
          index === 0 || index === entity.controlPoints.length - 1
            ? ("endpoint" as const)
            : ("control" as const),
        point,
        label:
          index === 0
            ? "Extremo inicial"
            : index === entity.controlPoints.length - 1
              ? "Extremo final"
              : `Control ${index + 1}`,
      })),
  },
  properties: {
    read: (entity) => ({
      degree: entity.degree,
      controlPointCount: entity.controlPoints.length,
      closed: entity.closed === true,
      layer: entity.layer,
    }),
    write: (entity, patch) => ({
      ...entity,
      degree: Math.max(
        1,
        Math.min(
          entity.controlPoints.length - 1,
          Math.floor(finite(patch.degree, entity.degree)),
        ),
      ),
      closed:
        typeof patch.closed === "boolean" ? patch.closed : entity.closed,
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    transform: (entity, transform) => ({
      ...entity,
      controlPoints: entity.controlPoints.map((point) =>
        transformPoint(point, transform),
      ),
      knots: [...entity.knots],
      ...(entity.weights ? { weights: [...entity.weights] } : {}),
      context: cloneContext(entity.context),
    }),
  },
};

type CadPolylineEntity = Extract<CadNativeEntity, { type: "polyline" }>;
type CadPolylineVertex = CadPolylineEntity["vertices"][number];

interface CadPolylineArc {
  center: CadPoint2;
  radius: number;
  startAngle: number;
  sweep: number;
}

/**
 * Arco de un segmento con `bulge`, en la convención DXF: `bulge = tan(θ/4)`,
 * positivo = sentido antihorario. Devuelve `null` cuando el segmento es recto
 * o degenerado para que el llamador use la recta.
 *
 * El centro se sitúa a `R·cos(θ/2)` de la mitad de la cuerda, sobre la
 * perpendicular girada +90°; con esa elección barrer `+θ` desde el vértice
 * inicial aterriza exactamente en el final.
 */
function polylineArc(
  start: CadPolylineVertex,
  end: CadPoint3,
): CadPolylineArc | null {
  const bulge =
    typeof start.bulge === "number" && Number.isFinite(start.bulge)
      ? start.bulge
      : 0;
  if (Math.abs(bulge) < 1e-12) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-12) return null;
  const theta = 4 * Math.atan(bulge);
  const halfSin = Math.sin(theta / 2);
  if (Math.abs(halfSin) < 1e-12) return null;
  const radius = chord / (2 * halfSin);
  const offset = radius * Math.cos(theta / 2);
  const center = {
    x: (start.x + end.x) / 2 + (-dy / chord) * offset,
    y: (start.y + end.y) / 2 + (dx / chord) * offset,
  };
  return {
    center,
    radius: Math.abs(radius),
    startAngle: Math.atan2(start.y - center.y, start.x - center.x),
    sweep: theta,
  };
}

/** Segmentos (inicio, fin) recorridos por la polilínea, cerrando si procede. */
function polylineSegments(
  entity: CadPolylineEntity,
): { start: CadPolylineVertex; end: CadPolylineVertex }[] {
  const vertices = entity.vertices;
  if (vertices.length < 2) return [];
  const count = entity.closed ? vertices.length : vertices.length - 1;
  return Array.from({ length: count }, (_, index) => ({
    start: vertices[index],
    end: vertices[(index + 1) % vertices.length],
  }));
}

function polylinePoints(
  entity: CadPolylineEntity,
  segments = 96,
): CadPoint2[] {
  const vertices = entity.vertices;
  if (vertices.length === 0) return [];
  if (vertices.length === 1) return [{ x: vertices[0].x, y: vertices[0].y }];
  const perArc = Math.max(
    2,
    Math.ceil(segments / Math.max(1, vertices.length)),
  );
  const points: CadPoint2[] = [];
  for (const { start, end } of polylineSegments(entity)) {
    points.push({ x: start.x, y: start.y });
    const arc = polylineArc(start, end);
    if (!arc) continue;
    for (let step = 1; step < perArc; step += 1) {
      const angle = arc.startAngle + (arc.sweep * step) / perArc;
      points.push({
        x: arc.center.x + Math.cos(angle) * arc.radius,
        y: arc.center.y + Math.sin(angle) * arc.radius,
      });
    }
  }
  if (!entity.closed) {
    const tail = vertices[vertices.length - 1];
    points.push({ x: tail.x, y: tail.y });
  }
  return points;
}

const polylineRenderer: CadEntityRenderer<CadPolylineEntity> = {
  paths: (entity, segments = 96) => {
    const points = polylinePoints(entity, segments);
    if (points.length === 0) return [];
    return [{ points, closed: entity.closed }];
  },
};

/**
 * Bounds EXACTOS: los vértices no bastan cuando un segmento tiene `bulge`,
 * porque el arco puede sobresalir de la cuerda. Se añaden los puntos
 * cardinales del arco que caen dentro del barrido.
 */
const polylineBounds: CadBoundsProvider<CadPolylineEntity> = {
  bounds: (entity) => {
    const vertices = entity.vertices;
    if (vertices.length === 0)
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const include = (x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const vertex of vertices) include(vertex.x, vertex.y);
    const twoPi = Math.PI * 2;
    for (const { start, end } of polylineSegments(entity)) {
      const arc = polylineArc(start, end);
      if (!arc) continue;
      for (let quadrant = 0; quadrant < 4; quadrant += 1) {
        const cardinal = (quadrant * Math.PI) / 2;
        const raw = cardinal - arc.startAngle;
        const delta = ((raw % twoPi) + twoPi) % twoPi;
        const inSweep =
          arc.sweep >= 0
            ? delta <= arc.sweep + 1e-9
            : delta - twoPi >= arc.sweep - 1e-9;
        if (!inSweep) continue;
        include(
          arc.center.x + Math.cos(cardinal) * arc.radius,
          arc.center.y + Math.sin(cardinal) * arc.radius,
        );
      }
    }
    if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
  },
};

const polylineAdapter: CadEntityAdapter<CadPolylineEntity> = {
  type: "polyline",
  renderer: polylineRenderer,
  bounds: polylineBounds,
  hitTester: commonHitTester(polylineRenderer, polylineBounds),
  grips: {
    grips: (entity) =>
      entity.vertices.map((vertex, index) => ({
        id: `vertex:${index}`,
        kind: "endpoint" as const,
        point: { x: vertex.x, y: vertex.y },
        label: `Vértice ${index + 1}`,
      })),
    moveGrip: (entity, gripId, point) => {
      const index = Number(gripId.split(":")[1]);
      if (!Number.isInteger(index) || !entity.vertices[index]) return entity;
      return {
        ...entity,
        vertices: entity.vertices.map((vertex, current) =>
          current === index
            ? { ...vertex, x: point.x, y: point.y }
            : { ...vertex },
        ),
      };
    },
  },
  snaps: {
    snaps: (entity) => {
      const points: CadSnapPoint[] = entity.vertices.map((vertex, index) => ({
        kind: "endpoint" as const,
        point: { x: vertex.x, y: vertex.y },
        label: `Vértice ${index + 1}`,
      }));
      polylineSegments(entity).forEach(({ start, end }, index) => {
        const arc = polylineArc(start, end);
        if (arc) {
          points.push({
            kind: "center",
            point: arc.center,
            label: `Centro del arco ${index + 1}`,
          });
          const mid = arc.startAngle + arc.sweep / 2;
          points.push({
            kind: "control",
            point: {
              x: arc.center.x + Math.cos(mid) * arc.radius,
              y: arc.center.y + Math.sin(mid) * arc.radius,
            },
            label: `Punto medio del arco ${index + 1}`,
          });
          return;
        }
        points.push({
          kind: "control",
          point: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
          label: `Punto medio ${index + 1}`,
        });
      });
      return points;
    },
  },
  properties: {
    read: (entity) => ({
      vertexCount: entity.vertices.length,
      segmentCount: polylineSegments(entity).length,
      arcSegments: polylineSegments(entity).filter(
        ({ start, end }) => polylineArc(start, end) !== null,
      ).length,
      closed: entity.closed,
      layer: entity.layer,
    }),
    write: (entity, patch) => ({
      ...entity,
      closed: typeof patch.closed === "boolean" ? patch.closed : entity.closed,
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    // `bulge` es invariante bajo traslación, giro y escala uniforme: vale
    // tan(θ/4) y θ no cambia. Bajo REFLEXIÓN se niega, porque su signo es lo
    // único que codifica hacia qué lado de la cuerda se comba el arco.
    //
    // El índice del vértice, el orden y el cierre NO se tocan. Reflejar
    // invirtiendo la lista de vértices daría la misma silueta y rompería todo
    // lo que apunta a un vértice por su posición: grips, cotas asociativas y
    // el propio `bulge`, que vive en el vértice de ARRANQUE de cada tramo.
    transform: (entity, transform) => {
      const reflecting = cadTransformIsReflecting(transform);
      return {
        ...entity,
        vertices: entity.vertices.map((vertex) => ({
          ...transformPoint(vertex, transform),
          ...(vertex.bulge !== undefined
            ? { bulge: reflecting ? -vertex.bulge : vertex.bulge }
            : {}),
        })),
        context: cloneContext(entity.context),
      };
    },
  },
};

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

export class CadEntityRegistry {
  private readonly adapters = new Map<
    CadNativeEntityType,
    CadEntityAdapter<CadNativeEntity>
  >();

  register<E extends CadNativeEntity>(adapter: CadEntityAdapter<E>): this {
    this.adapters.set(
      adapter.type,
      adapter as CadEntityAdapter<CadNativeEntity>,
    );
    return this;
  }

  supports(entity: CadEntity): entity is CadNativeEntity {
    // Lo que posee el sistema heredado NO lo reclama el registro nativo: el
    // nativo no sabe guardarlo, porque la reproyección lo rehace desde la
    // proyección del editor. Vale para el círculo heredado y para la cota sin
    // `dimensionKind`.
    if (isLegacyCircle(entity) || isLegacyDimension(entity)) return false;
    return this.adapters.has(entity.type as CadNativeEntityType);
  }

  adapter<E extends CadNativeEntity>(entity: E): CadEntityAdapter<E> {
    const adapter = this.adapters.get(entity.type);
    if (!adapter) throw new Error(`No CAD entity adapter registered for ${entity.type}.`);
    return adapter as CadEntityAdapter<E>;
  }
}

export const CAD_ENTITY_REGISTRY = new CadEntityRegistry()
  .register(lineAdapter)
  .register(polylineAdapter)
  .register(circleAdapter)
  .register(arcAdapter)
  .register(ellipseAdapter)
  .register(splineAdapter)
  .register(mtextAdapter)
  .register(hatchAdapter)
  .register(dimensionAdapter)
  .register(mleaderAdapter)
  .register(insertAdapter);

function rectangularBoundary(entity: Extract<CadEntity, { type: "box" | "station" }>): CadPoint2[] {
  const center = { x: entity.x + entity.w / 2, y: entity.y + entity.h / 2 };
  if (entity.type === "box" && entity.shape === "circle") {
    return Array.from({ length: 64 }, (_, index) => {
      const angle = (index / 64) * Math.PI * 2;
      return { x: center.x + Math.cos(angle) * entity.w / 2, y: center.y + Math.sin(angle) * entity.h / 2 };
    });
  }
  const radians = (entity.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    { x: -entity.w / 2, y: -entity.h / 2 },
    { x: entity.w / 2, y: -entity.h / 2 },
    { x: entity.w / 2, y: entity.h / 2 },
    { x: -entity.w / 2, y: entity.h / 2 },
  ].map((point) => ({
    x: center.x + point.x * cos - point.y * sin,
    y: center.y + point.x * sin + point.y * cos,
  }));
}

export function cadEntityBoundaryPaths(
  entity: CadEntity,
  registry = CAD_ENTITY_REGISTRY,
): CadBoundaryPath[] {
  if (entity.type === "box" || entity.type === "station")
    return [{ sourceId: entity.id, points: rectangularBoundary(entity), closed: true }];
  if (!registry.supports(entity)) return [];
  if (entity.type === "hatch")
    return entity.boundaries.map((points) => ({ sourceId: entity.id, points, closed: true }));
  if (entity.type === "mtext") return [];
  if (entity.type === "dimension") return [];
  if (entity.type === "mleader") return [];
  return registry.adapter(entity).renderer.paths(entity, 192)
    .map((path) => ({ sourceId: entity.id, points: path.points, closed: path.closed }));
}


interface SpatialEntry {
  bounds: CadBounds;
  cells: string[];
  overflow: boolean;
}

/**
 * Incremental uniform-grid index for native CAD entities. It avoids scanning
 * the whole document on pointermove and window selection. Very large entities
 * live in a bounded overflow set instead of exploding the number of buckets.
 */
export class CadSpatialIndex {
  private readonly buckets = new Map<string, Set<string>>();
  private readonly entries = new Map<string, SpatialEntry>();
  private readonly overflow = new Set<string>();

  constructor(
    private readonly cellSize = 2_000,
    private readonly maxCellsPerEntity = 4_096,
  ) {
    if (!(cellSize > 0)) throw new Error("cellSize must be positive.");
  }

  private cellKeys(bounds: CadBounds): string[] {
    const minX = Math.floor(bounds.minX / this.cellSize);
    const maxX = Math.floor(bounds.maxX / this.cellSize);
    const minY = Math.floor(bounds.minY / this.cellSize);
    const maxY = Math.floor(bounds.maxY / this.cellSize);
    const count = (maxX - minX + 1) * (maxY - minY + 1);
    if (count > this.maxCellsPerEntity) return [];
    const cells: string[] = [];
    for (let x = minX; x <= maxX; x += 1)
      for (let y = minY; y <= maxY; y += 1) cells.push(`${x}:${y}`);
    return cells;
  }

  upsert(id: string, bounds: CadBounds): void {
    this.remove(id);
    const cells = this.cellKeys(bounds);
    const overflow = cells.length === 0;
    this.entries.set(id, { bounds: { ...bounds }, cells, overflow });
    if (overflow) this.overflow.add(id);
    for (const cell of cells) {
      const bucket = this.buckets.get(cell) ?? new Set<string>();
      bucket.add(id);
      this.buckets.set(cell, bucket);
    }
  }

  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const cell of entry.cells) {
      const bucket = this.buckets.get(cell);
      bucket?.delete(id);
      if (bucket?.size === 0) this.buckets.delete(cell);
    }
    this.overflow.delete(id);
    this.entries.delete(id);
  }

  search(bounds: CadBounds): string[] {
    const cells = this.cellKeys(bounds);
    // A viewport or crossing window can legitimately span more cells than the
    // per-entity overflow guard. In that case an empty cell list means
    // "bounded full scan", not "no matches".
    const result = cells.length
      ? new Set<string>(this.overflow)
      : new Set<string>(this.entries.keys());
    for (const cell of cells)
      for (const id of this.buckets.get(cell) ?? []) result.add(id);
    return [...result]
      .filter((id) => {
        const entry = this.entries.get(id);
        return !!entry && boundsIntersect(entry.bounds, bounds);
      })
      .sort();
  }

  bounds(id: string): CadBounds | null {
    const bounds = this.entries.get(id)?.bounds;
    return bounds ? { ...bounds } : null;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.buckets.clear();
    this.entries.clear();
    this.overflow.clear();
  }
}

export interface CadSceneSink<P> {
  create(entity: CadNativeEntity): P;
  update(entity: CadNativeEntity, projection: P): P;
  remove(entityId: string, projection: P): void;
}

export interface CadSceneSyncStats {
  created: number;
  updated: number;
  removed: number;
  unchanged: number;
  total: number;
}

export interface CadProgressiveSceneSyncStats extends CadSceneSyncStats {
  processed: number;
  batches: number;
  cancelled: boolean;
}

export interface CadProgressiveSceneSyncOptions {
  batchSize?: number;
  schedule?: () => Promise<void>;
  onBatch?: (stats: CadProgressiveSceneSyncStats) => void;
}

export interface CadScenePatch {
  upsert: CadNativeEntity[];
  remove: string[];
}

/**
 * Incremental CadDocument → scene projection. The canonical document remains
 * authoritative; projections and their per-entity hashes are disposable.
 */
export class CadSceneSynchronizer<P> {
  readonly spatialIndex: CadSpatialIndex;
  private readonly versions = new Map<string, string>();
  private readonly projections = new Map<string, P>();
  private syncGeneration = 0;
  private currentDocument?: CadDocument;

  constructor(
    private readonly registry = CAD_ENTITY_REGISTRY,
    spatialIndex = new CadSpatialIndex(),
  ) {
    this.spatialIndex = spatialIndex;
  }

  sync(document: CadDocument, sink: CadSceneSink<P>): CadSceneSyncStats {
    this.syncGeneration += 1;
    this.currentDocument = document;
    const current = new Map(
      document.entities
        .filter((entity): entity is CadNativeEntity => this.registry.supports(entity))
        .map((entity) => [entity.id, entity]),
    );
    let created = 0;
    let updated = 0;
    let removed = 0;
    let unchanged = 0;

    for (const [id, projection] of [...this.projections]) {
      if (current.has(id)) continue;
      sink.remove(id, projection);
      this.projections.delete(id);
      this.versions.delete(id);
      this.spatialIndex.remove(id);
      removed += 1;
    }

    for (const entity of current.values()) {
      const version = JSON.stringify(entity);
      const previous = this.projections.get(entity.id);
      if (!previous) {
        this.projections.set(entity.id, sink.create(entity));
        this.spatialIndex.upsert(
          entity.id,
          this.registry.adapter(entity).bounds.bounds(entity, document),
        );
        created += 1;
      } else if (this.versions.get(entity.id) !== version) {
        this.projections.set(entity.id, sink.update(entity, previous));
        this.spatialIndex.upsert(
          entity.id,
          this.registry.adapter(entity).bounds.bounds(entity, document),
        );
        updated += 1;
      } else {
        unchanged += 1;
      }
      this.versions.set(entity.id, version);
    }

    return {
      created,
      updated,
      removed,
      unchanged,
      total: current.size,
    };
  }

  /**
   * Reconciles a scene without blocking the UI on thousands of Three.js object
   * creations. Existing projections that remain in the target are preserved;
   * removals happen immediately and new/changed entities are applied in
   * cancellable batches.
   */
  async syncProgressive(
    document: CadDocument,
    sink: CadSceneSink<P>,
    options: CadProgressiveSceneSyncOptions = {},
  ): Promise<CadProgressiveSceneSyncStats> {
    const generation = ++this.syncGeneration;
    this.currentDocument = document;
    const entities = document.entities.filter(
      (entity): entity is CadNativeEntity => this.registry.supports(entity),
    );
    const currentIds = new Set(entities.map((entity) => entity.id));
    const stats: CadProgressiveSceneSyncStats = {
      created: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      processed: 0,
      batches: 0,
      total: entities.length,
      cancelled: false,
    };

    for (const [id, projection] of [...this.projections]) {
      if (currentIds.has(id)) continue;
      sink.remove(id, projection);
      this.projections.delete(id);
      this.versions.delete(id);
      this.spatialIndex.remove(id);
      stats.removed += 1;
    }

    const batchSize = Math.max(1, Math.floor(options.batchSize ?? 200));
    const schedule = options.schedule ?? (() => new Promise<void>((resolve) => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => resolve(), { timeout: 50 });
      } else {
        setTimeout(resolve, 0);
      }
    }));

    for (let start = 0; start < entities.length; start += batchSize) {
      if (start > 0) await schedule();
      if (generation !== this.syncGeneration) {
        stats.cancelled = true;
        return stats;
      }
      const batch = entities.slice(start, start + batchSize);
      for (const entity of batch) {
        const version = JSON.stringify(entity);
        const previous = this.projections.get(entity.id);
        if (!previous) {
          this.projections.set(entity.id, sink.create(entity));
          stats.created += 1;
        } else if (this.versions.get(entity.id) !== version) {
          this.projections.set(entity.id, sink.update(entity, previous));
          stats.updated += 1;
        } else {
          stats.unchanged += 1;
        }
        if (!previous || this.versions.get(entity.id) !== version) {
          this.spatialIndex.upsert(
            entity.id,
            this.registry.adapter(entity).bounds.bounds(entity, document),
          );
        }
        this.versions.set(entity.id, version);
      }
      stats.processed += batch.length;
      stats.batches += 1;
      options.onBatch?.({ ...stats });
    }
    return stats;
  }

  /**
   * Applies a known document delta without scanning or hashing the complete
   * drawing. Command handlers can use this for pointermove and small edits,
   * while `sync` remains the safe reconciliation path after load/undo/redo.
   */
  applyPatch(patch: CadScenePatch, sink: CadSceneSink<P>): CadSceneSyncStats {
    this.syncGeneration += 1;
    let created = 0;
    let updated = 0;
    let removed = 0;
    let unchanged = 0;

    for (const id of new Set(patch.remove)) {
      const projection = this.projections.get(id);
      if (!projection) continue;
      sink.remove(id, projection);
      this.projections.delete(id);
      this.versions.delete(id);
      this.spatialIndex.remove(id);
      removed += 1;
    }

    for (const entity of patch.upsert) {
      const version = JSON.stringify(entity);
      const previous = this.projections.get(entity.id);
      if (!previous) {
        this.projections.set(entity.id, sink.create(entity));
        created += 1;
      } else if (this.versions.get(entity.id) !== version) {
        this.projections.set(entity.id, sink.update(entity, previous));
        updated += 1;
      } else {
        unchanged += 1;
      }
      if (!previous || this.versions.get(entity.id) !== version) {
        this.spatialIndex.upsert(
          entity.id,
          this.registry.adapter(entity).bounds.bounds(entity, this.currentDocument),
        );
      }
      this.versions.set(entity.id, version);
    }

    return {
      created,
      updated,
      removed,
      unchanged,
      total: this.projections.size,
    };
  }

  projection(entityId: string): P | undefined {
    return this.projections.get(entityId);
  }

  entries(): [string, P][] {
    return [...this.projections.entries()];
  }

  clear(sink: Pick<CadSceneSink<P>, "remove">): void {
    this.syncGeneration += 1;
    this.currentDocument = undefined;
    for (const [id, projection] of this.projections)
      sink.remove(id, projection);
    this.projections.clear();
    this.versions.clear();
    this.spatialIndex.clear();
  }
}
