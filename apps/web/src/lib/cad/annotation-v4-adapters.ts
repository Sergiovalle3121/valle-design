/**
 * Adaptadores de ATTDEF y TABLE — las dos entidades de ANOTACIÓN del esquema 4.
 *
 * ## ATTDEF se comporta como un MTEXT, y eso no es una analogía
 *
 * Tiene punto de inserción, altura y ROTACIÓN de texto, así que hereda la
 * regla que ya cumplen MTEXT e INSERT: bajo una transformada reflectante el
 * ángulo se **resta** de la base (`φ − α`), no se suma. Sumarlo es invisible en
 * todo texto colocado a 0° —que son casi todos— y deja el rótulo inclinado
 * hacia el lado contrario al de la geometría que acompaña en cuanto alguien lo
 * gira. Por eso el trazado se calcula con `layoutCadMText` sobre un MTEXT
 * sintético: una sola implementación de la caja de texto, no dos que divergen.
 *
 * ## TABLE crece HACIA ABAJO
 *
 * `insertion` es la esquina SUPERIOR IZQUIERDA y las filas avanzan en −Y, que
 * es la convención de AutoCAD. Es la que hace que una tabla anclada al borde
 * superior de un cajetín no se salga por arriba al añadirle filas.
 *
 * Bajo reflexión la tabla se re-orienta como el texto: se refleja su posición y
 * su rotación, pero NO se invierte el orden de filas ni de columnas. Una tabla
 * espejada cuya primera columna pasara a la derecha sería un dato distinto, no
 * el mismo dato visto en un espejo.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";
import {
  boundsContained,
  boundsIntersect,
  pathHit,
  pointInPolygon,
  pointsBounds,
} from "./entity-hit-geometry";
import { layoutCadMText, type CadMTextEntity } from "./mtext-layout";
import {
  cadTransformAngleBase,
  cadTransformIsReflecting,
  cadTransformPoint3,
  cadTransformScaleFactor,
} from "./transform2d";
import type {
  CadEntityAdapter,
  CadNativeEntity,
  CadPropertyValue,
  CadRenderPath,
  CadSnapPoint,
} from "./entity-runtime";

type CadAttdefEntity = Extract<CadNativeEntity, { type: "attdef" }>;
type CadTableEntity = Extract<CadNativeEntity, { type: "table" }>;

const DEFAULT_TEXT_HEIGHT = 120;

const finite = (value: CadPropertyValue | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const positive = (value: CadPropertyValue | undefined, fallback: number): number => {
  const next = finite(value, fallback);
  return next > 0 ? next : fallback;
};

const point3 = (point: CadPoint2, z = 0): CadPoint3 => ({ x: point.x, y: point.y, z });

/** Grados en `[0, 360)`. */
const normalizeAngleDeg = (value: number): number => ((value % 360) + 360) % 360;

// ---------------------------------------------------------------------------
// ATTDEF
// ---------------------------------------------------------------------------

/**
 * El texto que se DIBUJA: el valor por defecto si existe, y si no la etiqueta.
 * Es lo que hace AutoCAD y lo que permite ver un cajetín antes de rellenarlo.
 */
function attdefDisplayText(entity: CadAttdefEntity): string {
  return entity.defaultValue && entity.defaultValue.length > 0 ? entity.defaultValue : entity.tag;
}

/** MTEXT sintético equivalente: una sola implementación de caja de texto. */
function attdefAsMText(entity: CadAttdefEntity): CadMTextEntity {
  return {
    id: `${entity.id}:attdef`,
    type: "mtext",
    insertion: entity.insertion,
    text: attdefDisplayText(entity),
    height: entity.height ?? DEFAULT_TEXT_HEIGHT,
    rotation: entity.rotation ?? 0,
    alignment: entity.alignment ?? "bottom-left",
    style: entity.style,
    layer: entity.layer,
    context: entity.context,
  };
}

export const attdefAdapter: CadEntityAdapter<CadAttdefEntity> = {
  type: "attdef",
  renderer: {
    paths: (entity) => [{ points: layoutCadMText(attdefAsMText(entity)).corners, closed: true }],
    textOnly: true,
  },
  bounds: { bounds: (entity) => layoutCadMText(attdefAsMText(entity)).bounds },
  hitTester: {
    hitTest: (entity, point, tolerance) => {
      const corners = layoutCadMText(attdefAsMText(entity)).corners;
      return pointInPolygon(point, corners) || pathHit([{ points: corners, closed: true }], point, tolerance);
    },
    intersectsWindow: (entity, window, crossing) => {
      const bounds = layoutCadMText(attdefAsMText(entity)).bounds;
      return crossing ? boundsIntersect(bounds, window) : boundsContained(bounds, window);
    },
  },
  grips: {
    grips: (entity) => {
      const radians = ((entity.rotation ?? 0) * Math.PI) / 180;
      const reach = Math.max(entity.height ?? DEFAULT_TEXT_HEIGHT, 1) * 2;
      return [
        { id: "insertion", kind: "endpoint" as const, point: entity.insertion, label: "Inserción" },
        {
          id: "rotation",
          kind: "control" as const,
          point: {
            x: entity.insertion.x + Math.cos(radians) * reach,
            y: entity.insertion.y + Math.sin(radians) * reach,
          },
          label: "Rotación",
        },
      ];
    },
    moveGrip: (entity, gripId, point) => {
      if (gripId === "insertion") return { ...entity, insertion: point3(point, entity.insertion.z) };
      if (gripId === "rotation")
        return {
          ...entity,
          rotation: normalizeAngleDeg(
            (Math.atan2(point.y - entity.insertion.y, point.x - entity.insertion.x) * 180) / Math.PI,
          ),
        };
      return entity;
    },
  },
  snaps: {
    snaps: (entity) => {
      const snaps: CadSnapPoint[] = [
        { kind: "endpoint", point: entity.insertion, label: "Inserción ATTDEF" },
      ];
      layoutCadMText(attdefAsMText(entity)).corners.forEach((point, index) => {
        snaps.push({ kind: "control", point, label: `Esquina ATTDEF ${index + 1}` });
      });
      return snaps;
    },
  },
  properties: {
    read: (entity) => ({
      tag: entity.tag,
      prompt: entity.prompt ?? "",
      defaultValue: entity.defaultValue ?? "",
      insertionX: entity.insertion.x,
      insertionY: entity.insertion.y,
      height: entity.height ?? DEFAULT_TEXT_HEIGHT,
      rotation: entity.rotation ?? 0,
      style: entity.style ?? "Standard",
      invisible: entity.invisible ?? false,
      constant: entity.constant ?? false,
      verify: entity.verify ?? false,
      preset: entity.preset ?? false,
      lockPosition: entity.lockPosition ?? false,
      layer: entity.layer,
    }),
    write: (entity, patch) => ({
      ...entity,
      // La ETIQUETA es el identificador del atributo dentro del bloque y no
      // admite espacios: un ATTDEF con la etiqueta en blanco no lo resuelve
      // ningún INSERT, así que un valor vacío se rechaza en vez de aceptarse.
      tag: typeof patch.tag === "string" && patch.tag.trim()
        ? patch.tag.trim().replace(/\s+/g, "_").slice(0, 128)
        : entity.tag,
      prompt: typeof patch.prompt === "string" ? patch.prompt.slice(0, 512) : entity.prompt,
      defaultValue: typeof patch.defaultValue === "string"
        ? patch.defaultValue.slice(0, 2_048)
        : entity.defaultValue,
      insertion: {
        x: finite(patch.insertionX, entity.insertion.x),
        y: finite(patch.insertionY, entity.insertion.y),
        z: entity.insertion.z,
      },
      height: positive(patch.height, entity.height ?? DEFAULT_TEXT_HEIGHT),
      rotation: finite(patch.rotation, entity.rotation ?? 0),
      style: typeof patch.style === "string" ? patch.style.slice(0, 128) : entity.style,
      invisible: typeof patch.invisible === "boolean" ? patch.invisible : entity.invisible,
      constant: typeof patch.constant === "boolean" ? patch.constant : entity.constant,
      verify: typeof patch.verify === "boolean" ? patch.verify : entity.verify,
      preset: typeof patch.preset === "boolean" ? patch.preset : entity.preset,
      lockPosition: typeof patch.lockPosition === "boolean" ? patch.lockPosition : entity.lockPosition,
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    transform: (entity, transform) => {
      const reflecting = cadTransformIsReflecting(transform);
      const base = cadTransformAngleBase(transform);
      return {
        ...entity,
        insertion: cadTransformPoint3(entity.insertion, transform),
        // La AUSENCIA de altura se conserva ausente: materializarla en cada
        // traslación fijaría el tamaño del texto de todo el documento y
        // dispararía un guardado espurio, porque la versión de una entidad se
        // calcula con `JSON.stringify`.
        ...(entity.height === undefined
          ? {}
          : { height: entity.height * cadTransformScaleFactor(transform) }),
        // Igual que MTEXT y que INSERT: bajo reflexión se RESTA.
        rotation: normalizeAngleDeg(
          reflecting ? base - (entity.rotation ?? 0) : (entity.rotation ?? 0) + base,
        ),
        context: entity.context ? structuredClone(entity.context) : undefined,
      };
    },
  },
};

// ---------------------------------------------------------------------------
// TABLE
// ---------------------------------------------------------------------------

interface TableFrame {
  /** Ancho y alto totales, en unidades de dibujo. */
  width: number;
  height: number;
  /** Del sistema local de la tabla (x hacia la derecha, y hacia ABAJO) al plano. */
  toWorld: (localX: number, localY: number) => CadPoint2;
}

function tableFrame(entity: CadTableEntity): TableFrame {
  const radians = ((entity.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const width = entity.columnWidths.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
  const height = entity.rowHeights.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
  return {
    width,
    height,
    // `localY` crece hacia ABAJO, así que entra en el giro con signo negativo.
    toWorld: (localX, localY) => ({
      x: entity.insertion.x + localX * cos + localY * sin,
      y: entity.insertion.y + localX * sin - localY * cos,
    }),
  };
}

function tablePaths(entity: CadTableEntity): CadRenderPath[] {
  const frame = tableFrame(entity);
  const paths: CadRenderPath[] = [
    {
      points: [
        frame.toWorld(0, 0),
        frame.toWorld(frame.width, 0),
        frame.toWorld(frame.width, frame.height),
        frame.toWorld(0, frame.height),
      ],
      closed: true,
    },
  ];
  let y = 0;
  for (const rowHeight of entity.rowHeights.slice(0, -1)) {
    y += Number.isFinite(rowHeight) ? rowHeight : 0;
    paths.push({ points: [frame.toWorld(0, y), frame.toWorld(frame.width, y)], closed: false });
  }
  let x = 0;
  for (const columnWidth of entity.columnWidths.slice(0, -1)) {
    x += Number.isFinite(columnWidth) ? columnWidth : 0;
    paths.push({ points: [frame.toWorld(x, 0), frame.toWorld(x, frame.height)], closed: false });
  }
  return paths;
}

function tableCorners(entity: CadTableEntity): CadPoint2[] {
  const frame = tableFrame(entity);
  return [
    frame.toWorld(0, 0),
    frame.toWorld(frame.width, 0),
    frame.toWorld(frame.width, frame.height),
    frame.toWorld(0, frame.height),
  ];
}

export const tableAdapter: CadEntityAdapter<CadTableEntity> = {
  type: "table",
  renderer: { paths: tablePaths },
  bounds: { bounds: (entity) => pointsBounds(tableCorners(entity)) },
  hitTester: {
    hitTest: (entity, point, tolerance) => {
      const corners = tableCorners(entity);
      return pointInPolygon(point, corners) || pathHit(tablePaths(entity), point, tolerance);
    },
    intersectsWindow: (entity, window, crossing) => {
      const bounds = pointsBounds(tableCorners(entity));
      return crossing ? boundsIntersect(bounds, window) : boundsContained(bounds, window);
    },
  },
  grips: {
    grips: (entity) => {
      const corners = tableCorners(entity);
      return [
        { id: "insertion", kind: "endpoint" as const, point: corners[0], label: "Inserción" },
        { id: "width", kind: "control" as const, point: corners[1], label: "Ancho de tabla" },
        { id: "height", kind: "control" as const, point: corners[3], label: "Alto de tabla" },
      ];
    },
    moveGrip: (entity, gripId, point) => {
      if (gripId === "insertion") return { ...entity, insertion: point3(point, entity.insertion.z) };
      const frame = tableFrame(entity);
      const dx = point.x - entity.insertion.x;
      const dy = point.y - entity.insertion.y;
      const radians = ((entity.rotation ?? 0) * Math.PI) / 180;
      const localX = dx * Math.cos(radians) + dy * Math.sin(radians);
      const localY = dx * Math.sin(radians) - dy * Math.cos(radians);
      // Estirar reparte el cambio proporcionalmente entre columnas o filas, que
      // es lo que hace el tirador de una tabla: ninguna desaparece ni se lleva
      // ella sola todo el crecimiento.
      if (gripId === "width" && frame.width > 1e-9 && localX > 1e-9) {
        const factor = localX / frame.width;
        return { ...entity, columnWidths: entity.columnWidths.map((value) => value * factor) };
      }
      if (gripId === "height" && frame.height > 1e-9 && localY > 1e-9) {
        const factor = localY / frame.height;
        return { ...entity, rowHeights: entity.rowHeights.map((value) => value * factor) };
      }
      return entity;
    },
  },
  snaps: {
    snaps: (entity) =>
      tableCorners(entity).map((point, index) => ({
        kind: "endpoint" as const,
        point,
        label: `Esquina de tabla ${index + 1}`,
      })),
  },
  properties: {
    read: (entity) => {
      const frame = tableFrame(entity);
      return {
        rows: entity.rows,
        columns: entity.columns,
        width: frame.width,
        height: frame.height,
        cellCount: entity.cells.length,
        rotation: entity.rotation ?? 0,
        style: entity.style ?? "Standard",
        insertionX: entity.insertion.x,
        insertionY: entity.insertion.y,
        layer: entity.layer,
      };
    },
    write: (entity, patch) => ({
      ...entity,
      insertion: {
        x: finite(patch.insertionX, entity.insertion.x),
        y: finite(patch.insertionY, entity.insertion.y),
        z: entity.insertion.z,
      },
      rotation: finite(patch.rotation, entity.rotation ?? 0),
      style: typeof patch.style === "string" ? patch.style.slice(0, 128) : entity.style,
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    transform: (entity, transform) => {
      const reflecting = cadTransformIsReflecting(transform);
      const base = cadTransformAngleBase(transform);
      const factor = cadTransformScaleFactor(transform);
      return {
        ...entity,
        insertion: cadTransformPoint3(entity.insertion, transform),
        // Anchos y altos son LONGITUDES: escalan y no se reordenan. Invertir el
        // orden de columnas bajo reflexión daría una tabla con otros datos.
        rowHeights: entity.rowHeights.map((value) => value * factor),
        columnWidths: entity.columnWidths.map((value) => value * factor),
        cells: entity.cells.map((cell) => ({ ...cell })),
        rotation: normalizeAngleDeg(
          reflecting ? base - (entity.rotation ?? 0) : (entity.rotation ?? 0) + base,
        ),
        context: entity.context ? structuredClone(entity.context) : undefined,
      };
    },
  },
};

export const __testables = { attdefAsMText, tableFrame };

/** El mismo marco (x a la derecha, y hacia ABAJO) para quien rotula las celdas: `render/text-requests.ts`. */
export { tableFrame as cadTableFrame };
