/**
 * Mapeo PURO base-neutral ↔ documento canónico — campaña 2026-08-21, OLA 4.
 *
 * Convierte la base neutral del lector DWG a un JSON con la FORMA del
 * `CadDocument` canónico del producto (apps/web/src/lib/cad/cad-document.ts,
 * esquema 9) y de vuelta. ADR-0007 prohíbe importar el producto desde el
 * laboratorio, así que este módulo declara TIPOS ESPEJO estructurales: el
 * adaptador de integración (futuro, del lado del producto) consumirá este
 * JSON directamente. Cualquier divergencia entre el espejo y el canónico es
 * un hallazgo del paquete de promoción, no un parche silencioso.
 *
 * Contrato de honestidad: TODO lo que no viaja se declara en el manifiesto
 * de pérdidas — por entidad y por propiedad, en ambos sentidos. El
 * round-trip DWG→canónico→DWG sólo puede diferir dentro de esas pérdidas
 * declaradas (spec sobre el corpus del laboratorio).
 */
import type {
  Ac1015DatabaseEntityRecord,
  Ac1015NeutralDatabase,
} from "../reader/ac1015-database-reader.js";
import type { DwgGeometryEntity, DwgPoint3 } from "../model/entity-geometry.js";
import { projectAcisOpaqueEntity } from "./canonical-acis.js";
import { mapCanonicalLayers } from "./canonical-layers.js";
import { ALINEACION_POR_ANCLAJE } from "./canonical-mtext-anchor.js";

// ---------------------------------------------------------------------------
// Tipos espejo del documento canónico (subconjunto que este mapeo produce)
// ---------------------------------------------------------------------------

export interface CanonicalPoint3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CanonicalLossEntry {
  readonly code: string;
  readonly entityId?: string;
  readonly sourceType?: string;
  readonly detail: string;
  readonly severity: "info" | "warning" | "error";
}

export interface CanonicalOpaqueEntity {
  readonly id: string;
  readonly provider: string;
  readonly sourceType: string;
  readonly layer?: string;
  readonly raw: string;
  readonly editable: false;
}

/** Documento canónico en su forma JSON (espejo estructural del esquema 9). */
export interface CanonicalCadDocumentJson {
  readonly meta: {
    readonly version: number;
    readonly schema: number;
    readonly unit: string;
    readonly linetypeScale?: number;
  };
  readonly layers: {
    readonly id: string;
    readonly name: string;
    readonly color: string;
    readonly visible: boolean;
    readonly locked: boolean;
    /**
     * CONGELADA, que NO es apagada: ni se dibuja, ni se regenera, ni entra en
     * selección. Se separa de `visible` porque el estado que este laboratorio
     * mide es la congelación —el bit 0, contra el oráculo DXF— y el apagado
     * NO: plegar una en la otra afirmaría de más.
     */
    readonly frozen?: boolean;
    /**
     * NOMBRE del tipo de línea de la capa, leído del archivo. Ausente cuando
     * no se pudo resolver: nunca se rellena con `CONTINUOUS`, que es un tipo
     * de línea real y no un «no sé».
     */
    readonly linetype?: string;
  }[];
  readonly entities: Record<string, unknown>[];
  readonly history: { readonly version: number; readonly label: string }[];
  readonly modelSpace: { readonly entityIds: string[] };
  readonly paperSpaces: never[];
  readonly styles: {
    readonly text: Record<string, { fontFamily?: string; height?: number }>;
    readonly dimension: Record<string, Record<string, unknown>>;
    readonly table: Record<string, never>;
    readonly plot: Record<string, never>;
    readonly linetype?: Record<
      string,
      { pattern: number[]; description?: string }
    >;
  };
  readonly blocks: {
    readonly id: string;
    readonly name: string;
    readonly basePoint: CanonicalPoint3;
    readonly entities: Record<string, unknown>[];
    readonly attributes?: Record<
      string,
      {
        defaultValue?: string;
        prompt?: string;
        position?: CanonicalPoint3;
        height?: number;
      }
    >;
  }[];
  readonly constraints: never[];
  readonly externalReferences: never[];
  readonly unsupportedEntities: CanonicalOpaqueEntity[];
  readonly lossManifest: CanonicalLossEntry[];
  readonly publications: never[];
}

export interface CanonicalMappingResult {
  readonly document: CanonicalCadDocumentJson;
  readonly lossManifest: readonly CanonicalLossEntry[];
}

const PROVIDER = "valle-dwg-codec";
const CANONICAL_SCHEMA = 9;

/** ACI básicos exactos; el resto se aproxima y se DECLARA como pérdida. */
const decodeBytes = (bytes: readonly number[] | undefined): string =>
  (bytes ?? []).map((b) => String.fromCharCode(b)).join("");

const handleId = (handle: number): string => `h${handle.toString(16)}`;

const point3 = (p: DwgPoint3): CanonicalPoint3 =>
  Object.freeze({ x: p.x, y: p.y, z: p.z });

// ---------------------------------------------------------------------------
// DWG → canónico
// ---------------------------------------------------------------------------

/**
 * Proyecta la base neutral a un documento canónico JSON con su manifiesto de
 * pérdidas. Función pura: mismos datos, mismo documento.
 */
export function dwgDatabaseToCanonicalDocument(
  database: Ac1015NeutralDatabase,
): CanonicalMappingResult {
  const losses: CanonicalLossEntry[] = [];
  const layers = mapCanonicalLayers(database, losses);

  const layerNameByHandle = new Map<number, string>();
  for (const layer of database.layers) {
    layerNameByHandle.set(layer.handle, decodeBytes(layer.name));
  }
  const layerOf = (record: Ac1015DatabaseEntityRecord): string =>
    record.layerHandle === undefined
      ? "0"
      : (layerNameByHandle.get(record.layerHandle) ?? "0");

  const entities: Record<string, unknown>[] = [];
  const opaque: CanonicalOpaqueEntity[] = [];
  const entityIds: string[] = [];

  for (const record of database.modelSpaceEntities) {
    const mapped = mapEntity(record, layerOf(record), losses, opaque);
    if (mapped !== null) {
      entities.push(mapped);
      entityIds.push(mapped["id"] as string);
    }
  }

  const blocks = database.blocks
    .filter((block) => {
      const name = decodeBytes(block.name);
      return !name.startsWith("*");
    })
    .map((block) => {
      const blockEntities: Record<string, unknown>[] = [];
      const attributes: Record<
        string,
        {
          defaultValue?: string;
          prompt?: string;
          position?: CanonicalPoint3;
          height?: number;
        }
      > = {};
      for (const record of block.entities) {
        if (record.entity.kind === "attdef") {
          const attdef = record.entity;
          attributes[decodeBytes(attdef.tagBytes)] = {
            defaultValue: decodeBytes(attdef.valueBytes),
            prompt: decodeBytes(attdef.promptBytes),
            position: Object.freeze({
              x: attdef.insertion.x,
              y: attdef.insertion.y,
              z: 0,
            }),
            height: attdef.height,
          };
          continue;
        }
        const mapped = mapEntity(record, layerOf(record), losses, opaque);
        if (mapped !== null) blockEntities.push(mapped);
      }
      const name = decodeBytes(block.name);
      return {
        id: handleId(block.handle),
        name,
        basePoint: Object.freeze({ x: 0, y: 0, z: 0 }),
        entities: blockEntities,
        ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
      };
    });

  // Los bloques anónimos (*D..., *Model_Space...) no se proyectan como
  // bloques del documento; sus cotas ya viajan como entidades dimension.
  const anonymous = database.blocks.filter((b) =>
    decodeBytes(b.name).startsWith("*"),
  ).length;
  if (anonymous > 0) {
    losses.push({
      code: "anonymous-blocks-not-projected",
      detail: `${anonymous} bloque(s) anónimo(s) (*D, espacios) no se proyectan: las cotas viajan como entidades y los espacios son estructura del formato.`,
      severity: "info",
    });
  }

  const unsupportedCounts = new Map<number, number>();
  for (const item of database.unsupported) {
    unsupportedCounts.set(
      item.type,
      (unsupportedCounts.get(item.type) ?? 0) + 1,
    );
    const className =
      item.className === undefined ? undefined : decodeBytes(item.className);
    opaque.push({
      id: handleId(item.handle),
      provider: PROVIDER,
      sourceType:
        className === undefined
          ? `dwg-type-0x${item.type.toString(16)}`
          : `dwg-class:${className}`,
      raw: `handle=0x${item.handle.toString(16)};type=0x${item.type.toString(16)}`,
      editable: false,
    });
  }
  for (const [type, count] of [...unsupportedCounts.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    losses.push({
      code: "object-type-not-decoded",
      sourceType: `0x${type.toString(16)}`,
      detail: `${count} objeto(s) de tipo 0x${type.toString(16)} enumerados sin decodificar; viajan como opacos.`,
      severity: "info",
    });
  }

  // Las tablas de símbolos de la fase D5 viajan al catálogo de estilos del
  // documento: tipos de línea con su patrón .lin (49 firmados), estilos de
  // texto con su altura fija y los NOMBRES de los estilos de cota (el núcleo
  // de DIMVARs se proyecta en la integración; pérdida declarada).
  const linetypeStyles: Record<
    string,
    { pattern: number[]; description?: string }
  > = {};
  for (const entry of database.tables?.linetypes ?? []) {
    const name = decodeBytes(entry.name);
    const dashes = entry.fields["dashLengths"];
    linetypeStyles[name] = {
      pattern: Array.isArray(dashes) ? dashes.map((d) => Number(d)) : [],
      ...(entry.fields["description"] !== undefined &&
      Array.isArray(entry.fields["description"]) &&
      (entry.fields["description"] as readonly number[]).length > 0
        ? {
            description: decodeBytes(
              entry.fields["description"] as readonly number[],
            ),
          }
        : {}),
    };
  }
  const textStyles: Record<string, { height?: number }> = {};
  for (const entry of database.tables?.styles ?? []) {
    const height = entry.fields["fixedHeight"];
    textStyles[decodeBytes(entry.name)] = {
      ...(typeof height === "number" && height !== 0 ? { height } : {}),
    };
  }
  const dimensionStyles: Record<string, Record<string, unknown>> = {};
  for (const entry of database.tables?.dimstyles ?? []) {
    dimensionStyles[decodeBytes(entry.name)] = {};
  }
  if (Object.keys(dimensionStyles).length > 0) {
    losses.push({
      code: "dimstyle-variables-not-projected",
      sourceType: "DIMSTYLE",
      detail: `${Object.keys(dimensionStyles).length} estilo(s) de cota se proyectan por NOMBRE; el núcleo de DIMVARs al CadDimensionStyleDefinition es del adaptador de integración.`,
      severity: "info",
    });
  }

  const document: CanonicalCadDocumentJson = {
    meta: { version: 1, schema: CANONICAL_SCHEMA, unit: "mm" },
    layers,
    entities,
    history: [{ version: 1, label: "importado por valle-dwg-codec" }],
    modelSpace: { entityIds },
    paperSpaces: [],
    styles: {
      text: textStyles,
      dimension: dimensionStyles,
      table: {},
      plot: {},
      ...(Object.keys(linetypeStyles).length > 0
        ? { linetype: linetypeStyles }
        : {}),
    },
    blocks,
    constraints: [],
    externalReferences: [],
    unsupportedEntities: opaque,
    lossManifest: losses,
    publications: [],
  };
  return { document, lossManifest: losses };
}

/** Mapea una entidad de la base; null = viajó al manifiesto/opacos. */
function mapEntity(
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
      const attributes: Record<string, string> = {};
      for (const attribute of record.attributes ?? []) {
        if (attribute.entity.kind === "attrib") {
          attributes[decodeBytes(attribute.entity.tagBytes)] = decodeBytes(
            attribute.entity.valueBytes,
          );
        }
      }
      return {
        id,
        type: "insert",
        block: decodeBytes(record.insertedBlockName ?? []),
        insertion: point3(entity.position),
        scale: point3(entity.scale),
        rotation: entity.rotation,
        ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
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

// ---------------------------------------------------------------------------
// canónico → DWG (subconjunto escribible)
// ---------------------------------------------------------------------------

/** Una entidad neutral lista para el writer, con su capa por nombre. */
export interface CanonicalToDwgEntity {
  readonly entity: DwgGeometryEntity;
  readonly layerName: string;
  readonly blockName?: string;
  readonly canonicalId: string;
}

export interface CanonicalToDwgResult {
  readonly entities: readonly CanonicalToDwgEntity[];
  readonly layerNames: readonly string[];
  readonly lossManifest: readonly CanonicalLossEntry[];
}

export { canonicalDocumentToDwgEntities } from "./canonical-to-dwg.js";
