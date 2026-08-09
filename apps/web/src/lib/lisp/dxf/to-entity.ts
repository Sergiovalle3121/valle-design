/**
 * Lista de códigos DXF → `CadEntity`. La mitad de escritura del traductor.
 *
 * Dos operaciones distintas, y la diferencia es la que hace segura a la
 * segunda:
 *
 *  - `entmake` CONSTRUYE una entidad desde cero. Sólo puede hacerlo para los
 *    tipos que sabe construir ENTEROS. Un HATCH asociativo o una cota con sus
 *    referencias tienen estado que la lista DXF de este puente no transporta;
 *    fabricar uno a medias produciría una entidad que se dibuja y que al
 *    regenerar los asociativos se rompe. Se RECHAZA con el nombre del tipo.
 *
 *  - `entmod` MODIFICA una que ya existe. Parte de la entidad actual y aplica
 *    encima los códigos que reconoce. Es lo correcto además de lo seguro: la
 *    rutina típica hace `(entmod (subst (cons 8 "MUROS") (assoc 8 ed) ed))` —
 *    cambia UN par y devuelve la lista entera— y todo lo que no tocó tiene que
 *    sobrevivir intacto, incluido lo que este puente no sabe leer.
 *
 * ## Por qué el tipo no se puede cambiar
 *
 * `(entmod (subst '(0 . "CIRCLE") '(0 . "LINE") ed))` es un error en AutoCAD y
 * lo es aquí. Una entidad tiene identidad: hay cotas asociativas y sombreados
 * que la referencian por id, y convertirla en otra cosa dejaría esas
 * referencias apuntando a una geometría que no tiene los mismos puntos.
 */
import type { CadPoint3 } from "../../cad/cad-document";
import type { CadNativeEntity } from "../../cad/entity-runtime";
import { LispError } from "../errors";
import type { LispValue } from "../values";
import {
  dxfEntries,
  dxfNumber,
  dxfNumbers,
  dxfPointAt,
  dxfText,
  type DxfEntry,
} from "./codes";
import { trueColorToRgb } from "./from-entity";

/** Tipos que `entmake` sabe construir enteros. El resto se rechaza diciéndolo. */
export const ENTMAKE_SUPPORTED = [
  "LINE",
  "CIRCLE",
  "ARC",
  "LWPOLYLINE",
  "POLYLINE",
  "ELLIPSE",
  "SPLINE",
  "MTEXT",
  "INSERT",
] as const;

function point3(value: { x: number; y: number; z: number } | null, fallback?: CadPoint3): CadPoint3 {
  if (value) return { x: value.x, y: value.y, z: value.z };
  if (fallback) return { ...fallback };
  throw new LispError("bad argument type: entmake: falta un punto obligatorio");
}

/** Vértices en ORDEN, con su bulge asociado por posición y no por `assoc`. */
function readVertices(entries: readonly DxfEntry[]): (CadPoint3 & { bulge?: number })[] {
  const vertices: (CadPoint3 & { bulge?: number })[] = [];
  for (const entry of entries) {
    if (entry.code === 10) {
      const point = dxfPointAt([entry], 10);
      if (point) vertices.push({ x: point.x, y: point.y, z: point.z });
      continue;
    }
    // Un 42 pertenece al último vértice leído. Ésta es la razón de recorrer en
    // orden: `assoc` sólo encuentra el primero, y el bulge del tercer vértice
    // se perdería en silencio.
    if (entry.code === 42 && vertices.length > 0) {
      const value = entry.value;
      if (value.t === "int" || value.t === "real") vertices[vertices.length - 1].bulge = value.v;
    }
  }
  return vertices;
}

export interface DxfBuildContext {
  newEntityId(): string;
  activeLayer(): string;
}

/**
 * Construye una entidad nativa desde una lista DXF. Lanza `LispError` con el
 * mensaje de AutoLISP para todo lo que no puede construir — que es el
 * comportamiento útil: una rutina que reciba `nil` de `entmake` sabe que no se
 * creó nada.
 */
export function dxfToNewEntity(value: LispValue, context: DxfBuildContext): CadNativeEntity {
  const entries = dxfEntries(value);
  const type = dxfText(entries, 0);
  if (!type) throw new LispError("bad argument type: entmake: falta el código 0 con el tipo");
  const upper = type.toUpperCase();
  const layer = dxfText(entries, 8) ?? context.activeLayer();
  const id = context.newEntityId();
  const base = { id, layer };

  switch (upper) {
    case "LINE":
      return {
        ...base,
        type: "line",
        start: point3(dxfPointAt(entries, 10)),
        end: point3(dxfPointAt(entries, 11)),
        ...presentationOf(entries),
      };

    case "CIRCLE": {
      const radius = dxfNumber(entries, 40);
      if (radius === null || radius <= 0)
        throw new LispError("bad argument type: entmake: CIRCLE necesita un radio positivo en el código 40");
      return {
        ...base,
        type: "circle",
        center: point3(dxfPointAt(entries, 10)),
        radius,
        ...presentationOf(entries),
      };
    }

    case "ARC": {
      const radius = dxfNumber(entries, 40);
      if (radius === null || radius <= 0)
        throw new LispError("bad argument type: entmake: ARC necesita un radio positivo en el código 40");
      return {
        ...base,
        type: "arc",
        center: point3(dxfPointAt(entries, 10)),
        radius,
        // 50 y 51 son GRADOS en DXF, y el modelo canónico también los guarda
        // en grados. No hay conversión, y no debe haberla.
        startAngle: dxfNumber(entries, 50) ?? 0,
        endAngle: dxfNumber(entries, 51) ?? 360,
        ...presentationOf(entries),
      };
    }

    case "LWPOLYLINE":
    case "POLYLINE": {
      const vertices = readVertices(entries);
      if (vertices.length < 2)
        throw new LispError("bad argument type: entmake: una polilínea necesita al menos dos vértices");
      const flags = dxfNumber(entries, 70) ?? 0;
      return {
        ...base,
        type: "polyline",
        vertices,
        closed: (Math.trunc(flags) & 1) === 1,
        ...presentationOf(entries),
      };
    }

    case "ELLIPSE": {
      const ratio = dxfNumber(entries, 40);
      if (ratio === null || ratio <= 0 || ratio > 1)
        throw new LispError("bad argument type: entmake: la relación de ejes (40) de una ELLIPSE va en (0, 1]");
      return {
        ...base,
        type: "ellipse",
        center: point3(dxfPointAt(entries, 10)),
        majorAxis: point3(dxfPointAt(entries, 11)),
        ratio,
        startParameter: dxfNumber(entries, 41) ?? 0,
        endParameter: dxfNumber(entries, 42) ?? Math.PI * 2,
        ...presentationOf(entries),
      };
    }

    case "SPLINE": {
      const degree = Math.trunc(dxfNumber(entries, 71) ?? 3);
      const controlPoints: CadPoint3[] = [];
      let index = 0;
      for (;;) {
        const point = dxfPointAt(entries, 10, index);
        if (!point) break;
        controlPoints.push({ x: point.x, y: point.y, z: point.z });
        index += 1;
      }
      if (controlPoints.length < degree + 1)
        throw new LispError(
          `bad argument type: entmake: una SPLINE de grado ${degree} necesita al menos ${degree + 1} puntos de control`,
        );
      const knots = dxfNumbers(entries, 40);
      const weights = dxfNumbers(entries, 41);
      const flags = Math.trunc(dxfNumber(entries, 70) ?? 0);
      return {
        ...base,
        type: "spline",
        degree,
        controlPoints,
        knots: knots.length > 0 ? knots : clampedKnots(controlPoints.length, degree),
        ...(weights.length === controlPoints.length ? { weights } : {}),
        closed: (flags & 1) === 1,
        ...presentationOf(entries),
      };
    }

    case "MTEXT": {
      const text = dxfText(entries, 1);
      if (text === null)
        throw new LispError("bad argument type: entmake: MTEXT necesita su texto en el código 1");
      const height = dxfNumber(entries, 40);
      const width = dxfNumber(entries, 41);
      const rotation = dxfNumber(entries, 50);
      const style = dxfText(entries, 7);
      return {
        ...base,
        type: "mtext",
        insertion: point3(dxfPointAt(entries, 10)),
        text,
        ...(height === null ? {} : { height }),
        ...(width === null ? {} : { width }),
        ...(rotation === null ? {} : { rotation }),
        ...(style === null ? {} : { style }),
        ...presentationOf(entries),
      };
    }

    case "INSERT": {
      const block = dxfText(entries, 2);
      if (block === null)
        throw new LispError("bad argument type: entmake: INSERT necesita el nombre de bloque en el código 2");
      return {
        ...base,
        type: "insert",
        block,
        insertion: point3(dxfPointAt(entries, 10)),
        scale: {
          x: dxfNumber(entries, 41) ?? 1,
          y: dxfNumber(entries, 42) ?? 1,
          z: dxfNumber(entries, 43) ?? 1,
        },
        rotation: dxfNumber(entries, 50) ?? 0,
        ...presentationOf(entries),
      };
    }

    default:
      /**
       * Rechazo EXPLÍCITO. Es preferible a un silencio que parece que funcionó:
       * un HATCH asociativo o una DIMENSION con referencias tienen estado que
       * esta lista no transporta, y crearlos a medias produce una entidad que
       * se dibuja bien y se rompe al regenerar los asociativos.
       */
      throw new LispError(
        `entmake no sabe construir ${upper}. Tipos admitidos: ${ENTMAKE_SUPPORTED.join(", ")}. ` +
          `HATCH, DIMENSION y MULTILEADER llevan asociatividad que esta lista DXF no transporta; ` +
          `créelos con (command "HATCH" ...) o su comando correspondiente.`,
      );
  }
}

/** Nudos clamped uniformes: la misma regla que usa el exportador DXF del CAD. */
function clampedKnots(count: number, degree: number): number[] {
  const knots: number[] = [];
  const spans = count - degree;
  for (let index = 0; index < degree + 1; index += 1) knots.push(0);
  for (let index = 1; index < spans; index += 1) knots.push(index / spans);
  for (let index = 0; index < degree + 1; index += 1) knots.push(1);
  return knots;
}

/** Presentación explícita leída de 6/48/62/420/370. Ausente si no hay ninguna. */
function presentationOf(entries: readonly DxfEntry[]): { context?: CadNativeEntity["context"] } {
  const linetype = dxfText(entries, 6);
  const linetypeScale = dxfNumber(entries, 48);
  const trueColor = dxfNumber(entries, 420);
  const lineweight = dxfNumber(entries, 370);
  const handle = dxfText(entries, 5);
  if (
    linetype === null && linetypeScale === null && trueColor === null &&
    lineweight === null && handle === null
  )
    return {};
  return {
    context: {
      ...(handle === null ? {} : { handle }),
      presentation: {
        ...(trueColor === null ? {} : { color: { source: "explicit" as const, value: trueColorToRgb(trueColor) } }),
        ...(linetype === null && linetypeScale === null
          ? {}
          : {
              linetype: {
                source: linetype === null ? ("byLayer" as const) : ("explicit" as const),
                ...(linetype === null ? {} : { value: linetype }),
                ...(linetypeScale === null ? {} : { scale: linetypeScale }),
              },
            }),
        ...(lineweight === null ? {} : { lineweight: { source: "explicit" as const, value: lineweight } }),
      },
    },
  };
}

/**
 * Aplica una lista DXF sobre una entidad existente. Devuelve una entidad nueva;
 * no muta la de entrada.
 */
export function dxfPatchEntity(entity: CadNativeEntity, value: LispValue): CadNativeEntity {
  const entries = dxfEntries(value);
  const type = dxfText(entries, 0);
  if (type && type.toUpperCase() !== expectedDxfType(entity))
    throw new LispError(
      `entmod no puede cambiar el tipo de una entidad (${expectedDxfType(entity)} → ${type.toUpperCase()}). ` +
        `Bórrela con entdel y créela con entmake.`,
    );

  const layer = dxfText(entries, 8);
  let patched: CadNativeEntity = layer === null ? entity : ({ ...entity, layer } as CadNativeEntity);
  patched = { ...patched, ...mergePresentation(patched, entries) } as CadNativeEntity;

  switch (patched.type) {
    case "line":
      return {
        ...patched,
        start: point3(dxfPointAt(entries, 10), patched.start),
        end: point3(dxfPointAt(entries, 11), patched.end),
      };
    case "circle": {
      const radius = dxfNumber(entries, 40);
      return {
        ...patched,
        center: point3(dxfPointAt(entries, 10), patched.center),
        ...(radius === null ? {} : { radius }),
      };
    }
    case "arc": {
      const radius = dxfNumber(entries, 40);
      const start = dxfNumber(entries, 50);
      const end = dxfNumber(entries, 51);
      return {
        ...patched,
        center: point3(dxfPointAt(entries, 10), patched.center),
        ...(radius === null ? {} : { radius }),
        ...(start === null ? {} : { startAngle: start }),
        ...(end === null ? {} : { endAngle: end }),
      };
    }
    case "polyline": {
      const vertices = readVertices(entries);
      const flags = dxfNumber(entries, 70);
      return {
        ...patched,
        ...(vertices.length >= 2 ? { vertices } : {}),
        ...(flags === null ? {} : { closed: (Math.trunc(flags) & 1) === 1 }),
      };
    }
    case "ellipse": {
      const ratio = dxfNumber(entries, 40);
      const startParameter = dxfNumber(entries, 41);
      const endParameter = dxfNumber(entries, 42);
      return {
        ...patched,
        center: point3(dxfPointAt(entries, 10), patched.center),
        majorAxis: point3(dxfPointAt(entries, 11), patched.majorAxis),
        ...(ratio === null || ratio <= 0 || ratio > 1 ? {} : { ratio }),
        ...(startParameter === null ? {} : { startParameter }),
        ...(endParameter === null ? {} : { endParameter }),
      };
    }
    case "mtext": {
      const text = dxfText(entries, 1);
      const height = dxfNumber(entries, 40);
      const width = dxfNumber(entries, 41);
      const rotation = dxfNumber(entries, 50);
      const style = dxfText(entries, 7);
      return {
        ...patched,
        insertion: point3(dxfPointAt(entries, 10), patched.insertion),
        ...(text === null ? {} : { text }),
        ...(height === null ? {} : { height }),
        ...(width === null ? {} : { width }),
        ...(rotation === null ? {} : { rotation }),
        ...(style === null ? {} : { style }),
      };
    }
    case "insert": {
      const block = dxfText(entries, 2);
      const rotation = dxfNumber(entries, 50);
      return {
        ...patched,
        insertion: point3(dxfPointAt(entries, 10), patched.insertion),
        ...(block === null ? {} : { block }),
        ...(rotation === null ? {} : { rotation }),
        scale: {
          x: dxfNumber(entries, 41) ?? patched.scale.x,
          y: dxfNumber(entries, 42) ?? patched.scale.y,
          z: dxfNumber(entries, 43) ?? patched.scale.z,
        },
      };
    }
    default:
      /**
       * SPLINE, HATCH, DIMENSION y MULTILEADER admiten los cambios COMUNES
       * —capa, color, tipo de línea— y nada más. Aceptar en silencio una
       * modificación geométrica que luego no se aplica sería la peor de las
       * opciones: la rutina creería haber movido la cota.
       */
      if (hasGeometricCodes(entries))
        throw new LispError(
          `entmod sólo admite cambios de capa y presentación en ${expectedDxfType(entity)}. ` +
            `Su geometría lleva asociatividad que esta lista DXF no transporta.`,
        );
      return patched;
  }
}

/** Códigos que cambiarían geometría. Se usan para rechazar antes de mentir. */
function hasGeometricCodes(entries: readonly DxfEntry[]): boolean {
  return entries.some((entry) => entry.code >= 10 && entry.code <= 59 && entry.code !== 48);
}

export function expectedDxfType(entity: CadNativeEntity): string {
  const names: Record<CadNativeEntity["type"], string> = {
    line: "LINE",
    polyline: "LWPOLYLINE",
    circle: "CIRCLE",
    arc: "ARC",
    ellipse: "ELLIPSE",
    spline: "SPLINE",
    mtext: "MTEXT",
    hatch: "HATCH",
    dimension: "DIMENSION",
    mleader: "MULTILEADER",
    insert: "INSERT",
    // Esquema 4. Los nombres son los del propio DXF; que el exportador todavía
    // no los escriba no cambia CÓMO se llaman, y dejar el mapa incompleto haría
    // que AutoLISP devolviera `undefined` como tipo de entidad.
    point: "POINT",
    xline: "XLINE",
    ray: "RAY",
    solid: "SOLID",
    wipeout: "WIPEOUT",
    image: "IMAGE",
    attdef: "ATTDEF",
    table: "ACAD_TABLE",
  };
  return names[entity.type];
}

/** Presentación combinada: lo que traiga la lista gana; lo demás se conserva. */
function mergePresentation(
  entity: CadNativeEntity,
  entries: readonly DxfEntry[],
): { context?: CadNativeEntity["context"] } {
  const incoming = presentationOf(entries).context;
  if (!incoming) return {};
  return {
    context: {
      ...entity.context,
      ...incoming,
      presentation: { ...entity.context?.presentation, ...incoming.presentation },
    },
  };
}
