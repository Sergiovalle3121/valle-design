/**
 * Adaptador de SPLINE.
 *
 * Sale de `entity-runtime.ts` por el mismo camino que los de cota, sombreado,
 * directriz y polilínea: el registro de capacidades es una cosa y la geometría
 * de cada entidad es otra.
 *
 * ## Por qué no hay regla de reflexión aquí
 *
 * Una NURBS se define por sus puntos de CONTROL, sus nudos y sus pesos. Los
 * puntos son posiciones y se transforman como tales; los nudos son la
 * parametrización y los pesos son escalares, y ninguno de los dos cambia bajo
 * una afín. Es la razón por la que este adaptador no necesita preguntarse por
 * `cadTransformIsReflecting`: no hay ningún campo cuyo SIGNO codifique una
 * orientación, al contrario que el `bulge` de una polilínea o los ángulos de un
 * arco. Que la respuesta sea «nada» es una respuesta, y conviene que esté
 * escrita — su ausencia es indistinguible de un olvido.
 *
 * Copiar los nudos y los pesos en vez de compartir el array SÍ importa: sin eso
 * una copia y su original compartirían la misma parametrización y editar una
 * cambiaría la otra.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";
import { tessellateSpline } from "./curve-tessellate";
// De `entity-hit-geometry` y NO de `entity-runtime`: aquél importa este módulo,
// así que pedirle un VALOR de vuelta cierra un ciclo que revienta al cargar.
import { commonHitTester, pointsBounds } from "./entity-hit-geometry";
import { cadTransformPoint3 } from "./transform2d";
import type {
  CadBoundsProvider,
  CadEntityAdapter,
  CadEntityRenderer,
  CadNativeEntity,
  CadPropertyValue,
} from "./entity-runtime";

type CadSplineEntity = Extract<CadNativeEntity, { type: "spline" }>;

const point3 = (point: CadPoint2, z = 0): CadPoint3 => ({ x: point.x, y: point.y, z });
const finite = (value: CadPropertyValue | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const splineRenderer: CadEntityRenderer<CadSplineEntity> = {
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

/**
 * Caja envolvente. La RESERVA importa tanto como el caso normal.
 *
 * `tessellateSpline` devuelve vacío cuando la spline no da curva —menos de dos
 * puntos de control, que es lo que llega de un DXF donde alguien borró la mitad
 * de la definición—. Y `pointsBounds([])` contesta la caja del ORIGEN, que no
 * es «no sé»: es una posición, y falsa. Con ella, el índice espacial archiva la
 * entidad en la celda 0:0, la ventana de selección sobre su sitio real NO la
 * encuentra y una ventana sobre el origen selecciona algo que no está ahí.
 *
 * Los puntos de control son la única posición que la entidad sigue afirmando,
 * así que la caja se ancla en ellos. Una spline sin curva sigue estando DONDE
 * está, y eso es lo que hay que contestar.
 */
const splineBounds: CadBoundsProvider<CadSplineEntity> = {
  bounds: (entity) => {
    const points = splineRenderer.paths(entity, 160)[0].points;
    if (points.length > 0) return pointsBounds(points);
    return pointsBounds(entity.controlPoints.map((point) => ({ x: point.x, y: point.y })));
  },
};

export const splineAdapter: CadEntityAdapter<CadSplineEntity> = {
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
        cadTransformPoint3(point, transform),
      ),
      knots: [...entity.knots],
      ...(entity.weights ? { weights: [...entity.weights] } : {}),
      context: entity.context ? structuredClone(entity.context) : undefined,
    }),
  },
};
