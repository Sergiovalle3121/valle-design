/**
 * Adaptadores de ARC y ELLIPSE.
 *
 * Salieron de `entity-runtime.ts` en la ola de sólidos, por el trinquete de
 * tamaño: aquel archivo sólo puede encoger y el esquema 5 le añade dos tipos.
 * La mudanza es mecánica —el código es el mismo, línea a línea— y la frontera es
 * la de siempre en este árbol: un módulo de adaptadores importa de
 * `entity-runtime` sólo TIPOS, que se borran al compilar, así que no cierra el
 * ciclo de carga que `tsc --noEmit` no sabe ver.
 *
 * Los dos comparten el problema que da carácter a este archivo: **bajo reflexión
 * hay que intercambiar los extremos**. Un arco DXF se recorre siempre en
 * antihorario y un arco elíptico también, así que reflejar sus ángulos sin
 * intercambiarlos produce el trozo COMPLEMENTARIO de la curva — el que el
 * usuario no dibujó — con el mismo centro y el mismo radio. En una esquina
 * redondeada eso se ve como un arco disparado al otro lado; en un arco casi
 * cerrado, no se ve en absoluto.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";
import { tessellateArc, tessellateEllipse } from "./curve-tessellate";
import { cloneContext } from "./entity-context";
import { commonHitTester, pointsBounds } from "./entity-hit-geometry";
import {
  cadTransformAngleBase,
  cadTransformIsReflecting,
  cadTransformPoint3,
  cadTransformScaleFactor,
  cadTransformVector3,
} from "./transform2d";
import type {
  CadBoundsProvider,
  CadEntityAdapter,
  CadEntityRenderer,
  CadEntityTransform,
  CadNativeEntity,
  CadPropertyValue,
  CadSnapPoint,
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

/** Sólo la parte lineal: para direcciones, como el eje mayor de una elipse. */
const transformVector = (point: CadPoint3, transform: CadEntityTransform): CadPoint3 =>
  cadTransformVector3(point, transform);

/** Grados en `[0, 360)`, que es el rango que DXF exige a un arco. */
function normalizeAngleDeg(value: number): number {
  return ((value % 360) + 360) % 360;
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

/**
 * Caja envolvente de la elipse, con la RESERVA que el arco ya tenía.
 *
 * `tessellateEllipse` devuelve vacío cuando el eje mayor mide cero o la razón
 * de ejes no es positiva —las dos cosas llegan de un DXF ajeno: un grupo 40 a
 * cero, un eje mayor `(0,0)` que quedó tras un escalado degenerado—. Y
 * `pointsBounds([])` contesta la caja del ORIGEN, que no es «no sé»: es una
 * posición, y falsa. El índice espacial archiva entonces la entidad en la celda
 * 0:0 y la ventana de selección sobre su sitio real no la encuentra.
 *
 * El CENTRO sí lo sabe la entidad siempre, así que ésa es la respuesta. Es la
 * misma regla que `arcBounds` cumple sin darse cuenta: con radio cero sus
 * puntos cardinales colapsan en el centro, y por eso el arco degenerado nunca
 * tuvo este problema.
 */
const ellipseBounds: CadBoundsProvider<
  Extract<CadNativeEntity, { type: "ellipse" }>
> = {
  bounds: (entity) => {
    const points = ellipseRenderer.paths(entity, 192)[0].points;
    if (points.length > 0) return pointsBounds(points);
    return pointsBounds([{ x: entity.center.x, y: entity.center.y }]);
  },
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

export { arcAdapter, ellipseAdapter };
