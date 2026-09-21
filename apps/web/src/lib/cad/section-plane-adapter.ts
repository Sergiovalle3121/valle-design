/**
 * Adaptador de SECTIONPLANE para `CAD_ENTITY_REGISTRY`.
 *
 * Es el rectángulo alámbrico que representa el plano de corte: sin esto, la
 * entidad existiría en el documento pero `adapter()` reventaría la primera vez
 * que algo intentara dibujarla, pincharla o moverla — ver la nota de
 * `entity-runtime.ts` sobre por qué las dos listas se editan juntas. No dibuja
 * la SECCIÓN —eso son entidades `region`, aparte— sino el objeto que la define.
 *
 * Se pincha por CERCANÍA a sus cuatro lados, igual que una LINE o el contorno
 * de un HATCH sin relleno: un plano es una lámina, no un área que se pincha
 * por dentro. Y por eso reflejar NO necesita invertir el sentido de las
 * esquinas como sí hace `regionAdapter`: el sentido de recorrido allí decide
 * qué es agujero, y aquí sólo fija el signo de la normal que deriva
 * `planeOfSectionPlane` — un signo que a `sectionLoopsOfSolid` no le importa,
 * porque clasifica los DOS lados del plano por igual.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";
import { cloneContext } from "./entity-context";
import { boundsContained, boundsIntersect, pathHit, pointsBounds } from "./entity-hit-geometry";
import { cadTransformPoint3 } from "./transform2d";
import type {
  CadBounds,
  CadEntityAdapter,
  CadGrip,
  CadNativeEntity,
  CadRenderPath,
  CadSnapPoint,
} from "./entity-runtime";

type SectionPlaneEntity = Extract<CadNativeEntity, { type: "sectionplane" }>;

const flat = (points: readonly CadPoint3[]): CadPoint2[] => points.map((point) => ({ x: point.x, y: point.y }));

const CORNER_LABELS = ["Esquina 1", "Esquina 2", "Esquina 3", "Esquina 4"] as const;

/**
 * `corners.map(f)` sale tipado `CadPoint3[]` —de longitud cualquiera para el
 * compilador, aunque en tiempo de ejecución siga midiendo cuatro—, y volver a
 * la 4-tupla con un `as` de un solo paso es precisamente el cast que TypeScript
 * rechaza por no solaparse lo bastante. Reconstruir el literal de cuatro
 * posiciones se lo dice sin escotillas.
 */
function mapCorners(
  corners: SectionPlaneEntity["corners"],
  f: (corner: CadPoint3, index: number) => CadPoint3,
): SectionPlaneEntity["corners"] {
  return [f(corners[0], 0), f(corners[1], 1), f(corners[2], 2), f(corners[3], 3)];
}

export const sectionPlaneAdapter: CadEntityAdapter<SectionPlaneEntity> = {
  type: "sectionplane",
  renderer: { paths: (entity): CadRenderPath[] => [{ points: flat(entity.corners), closed: true }] },
  bounds: { bounds: (entity): CadBounds => pointsBounds(flat(entity.corners)) },
  hitTester: {
    // Wireframe: cerca de un LADO, no dentro del rectángulo — un plano de
    // corte no tiene relleno que pinchar. `pathHit` ya prueba el contorno
    // CERRADO —los cuatro lados, incluido el que cierra la última esquina con
    // la primera—, así que no hace falta un segundo bucle que repita lo mismo.
    hitTest: (entity, point, tolerance) =>
      pathHit([{ points: flat(entity.corners), closed: true }], point, tolerance),
    intersectsWindow: (entity, window, crossing) => {
      const bounds = pointsBounds(flat(entity.corners));
      return crossing ? boundsIntersect(bounds, window) : boundsContained(bounds, window);
    },
  },
  grips: {
    grips: (entity): CadGrip[] =>
      entity.corners.map((corner, index) => ({
        id: `corner:${index}`,
        kind: "endpoint" as const,
        point: { x: corner.x, y: corner.y },
        label: CORNER_LABELS[index],
      })),
    moveGrip: (entity, gripId, point) => {
      const match = /^corner:(\d)$/.exec(gripId);
      if (!match) return entity;
      const index = Number(match[1]);
      if (index < 0 || index > 3) return entity;
      const corners = mapCorners(entity.corners, (corner, at) =>
        at === index ? { x: point.x, y: point.y, z: corner.z } : corner,
      );
      return { ...entity, corners };
    },
  },
  snaps: {
    snaps: (entity): CadSnapPoint[] =>
      entity.corners.map((corner, index) => ({
        kind: "endpoint" as const,
        point: { x: corner.x, y: corner.y },
        label: CORNER_LABELS[index],
      })),
  },
  properties: {
    read: (entity) => ({
      name: entity.name ?? "",
      layer: entity.layer,
      elevation: entity.corners[0]?.z ?? 0,
    }),
    // Sólo capa y nombre: las esquinas —lo que fija dónde corta— se mueven con
    // los grips o con MOVE/ROTATE, no tecleando un número en la paleta.
    write: (entity, patch) => ({
      ...entity,
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
      ...(typeof patch.name === "string" ? { name: patch.name } : {}),
    }),
  },
  commands: {
    transform: (entity, transform) => ({
      ...entity,
      corners: mapCorners(entity.corners, (corner) => cadTransformPoint3(corner, transform)),
      context: cloneContext(entity.context),
    }),
  },
};
