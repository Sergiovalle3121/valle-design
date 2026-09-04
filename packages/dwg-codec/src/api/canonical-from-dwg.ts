/**
 * LA DIRECCIÓN DWG→CANÓNICO, ENTIDAD A ENTIDAD.
 *
 * Vive aparte de `canonical.ts` desde el 2026-09-04, cuando el intake del
 * ESPACIO PAPEL empujó aquel archivo por encima del presupuesto de 800 líneas
 * del monorepo. La costura tiene sentido propio y no es un corte por tamaño:
 * allá queda la FORMA del documento canónico —sus tipos espejo y el ensamblado
 * del documento entero, con capas, bloques, estilos y manifiesto— y aquí queda
 * la traducción de UNA entidad, que es la parte que crece cada vez que el
 * laboratorio aprende a leer una clase más.
 *
 * `PROVIDER`, `decodeBytes`, `handleId` y `point3` se vienen con ella porque
 * son suyas: las usa cada rama de la traducción, y dejarlas allá habría hecho
 * que los dos módulos se importaran el uno al otro para nada.
 */
import type { Ac1015DatabaseEntityRecord } from "../reader/ac1015-database-reader.js";
import type {
  DwgAttribEntity,
  DwgGeometryEntity,
  DwgPoint3,
} from "../model/entity-geometry.js";
import { projectAcisOpaqueEntity } from "./canonical-acis.js";
import { ALINEACION_POR_ANCLAJE } from "./canonical-mtext-anchor.js";
import type {
  CanonicalLossEntry,
  CanonicalOpaqueEntity,
  CanonicalPoint3,
} from "./canonical.js";

export const PROVIDER = "valle-dwg-codec";

/** ACI básicos exactos; el resto se aproxima y se DECLARA como pérdida. */
export const decodeBytes = (bytes: readonly number[] | undefined): string =>
  (bytes ?? []).map((b) => String.fromCharCode(b)).join("");

export const handleId = (handle: number): string => `h${handle.toString(16)}`;

export const point3 = (p: DwgPoint3): CanonicalPoint3 =>
  Object.freeze({ x: p.x, y: p.y, z: p.z });

/** Mapea una entidad de la base; null = viajó al manifiesto/opacos. */
export function mapEntity(
  record: Ac1015DatabaseEntityRecord,
  layer: string,
  losses: CanonicalLossEntry[],
  opaque: CanonicalOpaqueEntity[],
): Record<string, unknown> | null {
  const id = handleId(record.handle);
  const entity = record.entity;
  switch (entity.kind) {
    case "line":
      return {
        id,
        type: "line",
        start: point3(entity.start),
        end: point3(entity.end),
        layer,
      };
    case "circle":
      return {
        id,
        type: "circle",
        center: point3(entity.center),
        radius: entity.radius,
        layer,
      };
    case "arc":
      return {
        id,
        type: "arc",
        center: point3(entity.center),
        radius: entity.radius,
        startAngle: entity.startAngle,
        endAngle: entity.endAngle,
        layer,
      };
    case "point":
      return { id, type: "point", position: point3(entity.position), layer };
    case "ray":
      return {
        id,
        type: "ray",
        basePoint: point3(entity.basePoint),
        direction: point3(entity.direction),
        layer,
      };
    case "xline":
      return {
        id,
        type: "xline",
        basePoint: point3(entity.basePoint),
        direction: point3(entity.direction),
        layer,
      };
    case "lwpolyline": {
      const vertices = entity.vertices.map((v, index) => ({
        x: v.x,
        y: v.y,
        z: 0,
        ...(entity.bulges?.[index] ? { bulge: entity.bulges[index] } : {}),
        ...(entity.widths?.[index]
          ? {
              startWidth: entity.widths[index]!.start,
              endWidth: entity.widths[index]!.end,
            }
          : {}),
      }));
      return { id, type: "polyline", vertices, closed: entity.closed, layer };
    }
    case "polyline2d": {
      const children = record.vertices ?? [];
      const vertices = children
        .filter((v) => v.entity.kind === "vertex2d")
        .map((v) => {
          const vertex = v.entity as Extract<
            DwgGeometryEntity,
            { kind: "vertex2d" }
          >;
          return {
            x: vertex.position.x,
            y: vertex.position.y,
            z: 0,
            ...(vertex.bulge !== 0 ? { bulge: vertex.bulge } : {}),
          };
        });
      return {
        id,
        type: "polyline",
        vertices,
        closed: (entity.flags & 1) === 1,
        layer,
      };
    }
    case "polyline3d": {
      const children = record.vertices ?? [];
      const vertices = children
        .filter((v) => v.entity.kind === "vertex3d")
        .map((v) =>
          point3(
            (v.entity as Extract<DwgGeometryEntity, { kind: "vertex3d" }>)
              .position,
          ),
        );
      return {
        id,
        type: "polyline",
        vertices,
        closed: (entity.closedFlags & 1) === 1,
        layer,
      };
    }
    case "text":
      return {
        id,
        type: "text",
        x: entity.insertion.x,
        y: entity.insertion.y,
        text: decodeBytes(entity.valueBytes),
        height: entity.height,
        ...(entity.rotation !== undefined && entity.rotation !== 0
          ? { rotation: entity.rotation }
          : {}),
        layer,
      };
    case "mtext": {
      const rotation = Math.atan2(
        entity.xAxisDirection.y,
        entity.xAxisDirection.x,
      );
      // EL ANCLAJE Y EL INTERLINEADO DEJAN DE PERDERSE. Hasta este corte la
      // proyección se quedaba con la geometría y el texto, y tiraba en
      // silencio el punto de anclaje —que es lo que decide DÓNDE queda el
      // párrafo respecto de su inserción— y el interlineado. Un MTEXT anclado
      // al centro volvía anclado arriba-izquierda del round-trip, desplazado
      // por media caja, sin que nada lo declarase. La correspondencia entre
      // anclaje y alineación está medida: ver `canonical-mtext-anchor.ts`.
      const alignment = ALINEACION_POR_ANCLAJE[entity.attachment];
      if (alignment === undefined) {
        // Fuera de los nueve anclajes conocidos no se elige uno «parecido»:
        // se declara y el consumidor aplica su propio defecto sabiéndolo.
        losses.push({
          code: "mtext-attachment-unknown",
          entityId: id,
          sourceType: "mtext",
          detail: `El MTEXT ${id} trae el anclaje ${entity.attachment}, que no es ninguno de los nueve del formato: no se traduce a ninguna alineación y el documento canónico viaja sin ella.`,
          severity: "warning",
        });
      }
      return {
        id,
        type: "mtext",
        insertion: point3(entity.insertion),
        text: decodeBytes(entity.valueBytes),
        ...(entity.rectWidth !== 0 ? { width: entity.rectWidth } : {}),
        height: entity.height,
        ...(rotation !== 0 ? { rotation } : {}),
        ...(alignment !== undefined ? { alignment } : {}),
        ...(entity.lineSpacingFactor !== 1
          ? { lineSpacing: entity.lineSpacingFactor }
          : {}),
        layer,
      };
    }
    case "insert": {
      // DOS PROYECCIONES DEL MISMO ATRIBUTO, Y LAS DOS HACEN FALTA. El mapa
      // plano dice QUÉ VALE cada etiqueta —es lo que el editor consulta— y
      // `positionedAttributes` dice DÓNDE SE DIBUJA. Hasta el 2026-09-04 sólo
      // viajaba el mapa, y la vuelta al DWG no podía escribir los ATTRIB:
      // recomponer la posición desde la definición del bloque los habría
      // puesto en otro sitio del que el archivo de origen decía. La geometría
      // está aquí, medida; sólo faltaba llevarla.
      const attributes: Record<string, string> = {};
      const positioned: Record<string, unknown>[] = [];
      for (const attribute of record.attributes ?? []) {
        if (attribute.entity.kind !== "attrib") continue;
        const attrib = attribute.entity;
        const tag = decodeBytes(attrib.tagBytes);
        attributes[tag] = decodeBytes(attrib.valueBytes);
        positioned.push({
          tag,
          value: decodeBytes(attrib.valueBytes),
          insertion: Object.freeze({
            x: attrib.insertion.x,
            y: attrib.insertion.y,
            z: attrib.elevation ?? 0,
          }),
          height: attrib.height,
          ...(attrib.rotation === undefined ? {} : { rotation: attrib.rotation }),
        });
      }
      return {
        id,
        type: "insert",
        block: decodeBytes(record.insertedBlockName ?? []),
        insertion: point3(entity.position),
        scale: point3(entity.scale),
        rotation: entity.rotation,
        ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
        ...(positioned.length > 0 ? { positionedAttributes: positioned } : {}),
        layer,
      };
    }
    case "ellipse": {
      // LA EXTRUSIÓN DE LA ELIPSE SE PIERDE, Y DESDE 2026-09-01 SE DICE. El
      // canónico no modela el plano de una elipse, así que al proyectar se
      // descarta; hasta este corte se descartaba EN SILENCIO, y una elipse
      // inclinada volvía tumbada del round-trip sin que nada lo declarase. Se
      // declara sólo cuando NO es el plano XY: hacerlo siempre llenaría el
      // manifiesto de ruido en el caso normal, que es el de las dos elipses
      // del corpus admitido, ambas con (0,0,1).
      const { x, y, z } = entity.extrusion;
      if (x !== 0 || y !== 0 || z !== 1) {
        losses.push({
          code: "ellipse-extrusion-dropped",
          entityId: id,
          sourceType: "ellipse",
          detail: `La elipse ${id} vive en un plano inclinado (extrusión ${x}, ${y}, ${z}) que el documento canónico no representa: se importa en el plano XY.`,
          severity: "warning",
        });
      }
      return {
        id,
        type: "ellipse",
        center: point3(entity.center),
        majorAxis: point3(entity.majorAxisEndpoint),
        ratio: entity.axisRatio,
        startParameter: entity.startAngle,
        endParameter: entity.endAngle,
        layer,
      };
    }
    case "spline": {
      if (entity.scenario !== 1) {
        losses.push({
          code: "spline-fit-scenario-opaque",
          entityId: id,
          sourceType: "SPLINE",
          detail:
            "La spline viaja en escenario de puntos de ajuste (2); el canónico modela control+nudos, así que se conserva opaca.",
          severity: "warning",
        });
        opaque.push({
          id,
          provider: PROVIDER,
          sourceType: "SPLINE-scenario-2",
          layer,
          raw: JSON.stringify({ fitPoints: entity.fitPoints ?? [] }),
          editable: false,
        });
        return null;
      }
      return {
        id,
        type: "spline",
        degree: entity.degree,
        controlPoints: (entity.controlPoints ?? []).map(point3),
        knots: [...(entity.knots ?? [])],
        ...(entity.weights !== undefined
          ? { weights: [...entity.weights] }
          : {}),
        ...(entity.closed ? { closed: true } : {}),
        layer,
      };
    }
    case "solid":
    case "trace": {
      // El formato guarda las esquinas en orden de "pajarita" (la 3.ª y la
      // 4.ª cruzadas); el canónico pide orden de CONTORNO: [0,1,3,2].
      const corners = entity.corners;
      const points = [corners[0], corners[1], corners[3], corners[2]].map(
        (c) => ({
          x: c.x,
          y: c.y,
          z: entity.elevation,
        }),
      );
      if (entity.kind === "trace") {
        losses.push({
          code: "trace-projected-as-solid",
          entityId: id,
          sourceType: "TRACE",
          detail:
            "TRACE se proyecta como solid canónico (misma geometría de relleno).",
          severity: "info",
        });
      }
      return { id, type: "solid", points, layer };
    }
    case "hatch": {
      const boundaries: CanonicalPoint3[][] = [];
      let nonPolyline = 0;
      for (const path of entity.paths ?? []) {
        const anyPath = path as {
          kind?: string;
          vertices?: { x: number; y: number }[];
        };
        if (anyPath.kind === "polyline" && anyPath.vertices) {
          boundaries.push(
            anyPath.vertices.map((v) => ({
              x: v.x,
              y: v.y,
              z: entity.elevation ?? 0,
            })),
          );
        } else {
          nonPolyline += 1;
        }
      }
      if (nonPolyline > 0) {
        losses.push({
          code: "hatch-non-polyline-boundary",
          entityId: id,
          sourceType: "HATCH",
          detail: `${nonPolyline} camino(s) de contorno con segmentos línea/arco/spline no se proyectan como polígonos; el canónico modela contornos por vértices.`,
          severity: "warning",
        });
      }
      // LA TRAMA VIAJA CON LA ENTIDAD (2026-09-04). Hasta este corte esta
      // proyección se quedaba con el NOMBRE del patrón y tiraba su
      // definición —ángulo, escala, doble trama y las líneas con sus
      // trazos—, de modo que un sombreado ajeno leído y vuelto a escribir
      // por el camino canónico salía sin trama. El nombre no basta: el
      // catálogo de tramas de cada programa es suyo, y «ANSI31» dibujado con
      // la tabla de otro no es el mismo dibujo. Se copia lo MEDIDO en el
      // archivo, sin interpretarlo, en la misma forma que el camino de
      // vuelta (`canonical-to-dwg.ts`) sabe leer.
      const source = entity as {
        angle?: number;
        scaleOrSpacing?: number;
        doubleHatch?: boolean;
        definitionLines?: readonly {
          angle: number;
          basePoint: { x: number; y: number };
          offset: { x: number; y: number };
          dashes: readonly number[];
        }[];
      };
      const patternDefinition =
        source.angle !== undefined &&
        source.scaleOrSpacing !== undefined &&
        source.definitionLines !== undefined
          ? {
              angle: source.angle,
              scale: source.scaleOrSpacing,
              double: source.doubleHatch === true,
              lines: source.definitionLines.map((line) => ({
                angle: line.angle,
                basePoint: { x: line.basePoint.x, y: line.basePoint.y },
                offset: { x: line.offset.x, y: line.offset.y },
                dashes: [...line.dashes],
              })),
            }
          : undefined;
      return {
        id,
        type: "hatch",
        pattern: decodeBytes(
          (entity as { nameBytes?: readonly number[] }).nameBytes ?? [],
        ),
        solid: Boolean((entity as { solidFill?: boolean }).solidFill),
        boundaries,
        ...(patternDefinition === undefined ? {} : { patternDefinition }),
        layer,
      };
    }
    case "dimension": {
      const a = entity.point13 ?? entity.definitionPoint;
      const b = entity.point14 ?? entity.definitionPoint;
      const kindMap: Record<string, string> = {
        linear: "linear",
        aligned: "aligned",
        angular3pt: "angular",
        angular2ln: "angular",
        radius: "radius",
        diameter: "diameter",
        ordinate: "ordinate",
      };
      losses.push({
        code: "dimension-style-not-projected",
        entityId: id,
        sourceType: "DIMENSION",
        detail:
          "El estilo de cota y su bloque anónimo no se proyectan: el canónico regenera la representación desde sus estilos.",
        severity: "info",
      });
      return {
        id,
        type: "dimension",
        a: { x: a.x, y: a.y },
        b: { x: b.x, y: b.y },
        ...(entity.point15 !== undefined
          ? { c: { x: entity.point15.x, y: entity.point15.y } }
          : {}),
        dimensionKind: kindMap[entity.dimensionKind] ?? "linear",
        ...(entity.userTextBytes.length > 0
          ? { text: decodeBytes(entity.userTextBytes) }
          : {}),
        textPosition: { x: entity.textMidpoint.x, y: entity.textMidpoint.y },
        layer,
      };
    }
    case "seqend":
      return null;
    case "acisOpaque": {
      // Extraído a `canonical-acis.ts` por presupuesto de líneas: es la
      // única rama que necesita su propia forma de payload bit-exacto.
      const projection = projectAcisOpaqueEntity(
        entity,
        id,
        layer,
        PROVIDER,
        decodeBytes(entity.classNameBytes),
      );
      losses.push(projection.loss);
      opaque.push(projection.opaque);
      return null;
    }
    default: {
      losses.push({
        code: "entity-kind-not-projected",
        entityId: id,
        sourceType: entity.kind.toUpperCase(),
        detail: `La entidad "${entity.kind}" no tiene proyección canónica en este mapeo; se conserva opaca.`,
        severity: "warning",
      });
      opaque.push({
        id,
        provider: PROVIDER,
        sourceType: `dwg-${entity.kind}`,
        layer,
        raw: JSON.stringify(entity),
        editable: false,
      });
      return null;
    }
  }
}
