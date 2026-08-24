/**
 * Mapeo de una sola entidad neutral DWG a su forma intermedia canónica.
 *
 * Extraído de `dwg-document-bridge.ts` (presupuesto de monolito, Fase 3 de
 * la campaña de producto DWG): funciones puras, sin agregación de base de
 * datos ni manejo de pérdidas por archivo — cada función traduce UNA
 * entidad ya decodificada y, cuando corresponde, declara qué de ella no cupo
 * en el intermedio. El agregador (`mapRecords`/`mapLayers`/`mapBlocks` en el
 * módulo principal) decide qué hacer con `null` y con las listas de
 * propiedades descartadas.
 */
import type {
  CadDxfHatch,
  CadDxfMText,
  CadDxfPoint,
  CadDxfPrimitive,
  CadDxfSemanticDimension,
} from "./dxf-import";
import { decodeMTextContent, mtextAlignment } from "./dxf-read-annotations";
import type {
  DwgNeutralDimension,
  DwgNeutralGeometry,
  DwgNeutralHatch,
  DwgNeutralMText,
} from "./dwg-neutral-model";

export function decodeCodePageBytes(bytes: readonly number[]): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte & 0xff);
  return out;
}

export const point2 = (value: { readonly x: number; readonly y: number }): CadDxfPoint => ({
  x: value.x,
  y: value.y,
});

export const degrees = (radians: number): number => (radians * 180) / Math.PI;

// ---------------------------------------------------------------------------
// Geometría neutral → primitiva intermedia
// ---------------------------------------------------------------------------

/**
 * Traduce una entidad neutral a la primitiva que el pipeline canónico consume.
 *
 * Devuelve `null` cuando la entidad no tiene primitiva equivalente; el llamador
 * la anota como pérdida. Los INSERT no pasan por aquí: son referencias entre
 * objetos y viajan por el canal de bloques.
 */
export function dwgGeometryToPrimitive(
  entity: DwgNeutralGeometry,
  layer: string,
): CadDxfPrimitive | null {
  switch (entity.kind) {
    case "line":
      return { kind: "line", layer, points: [point2(entity.start), point2(entity.end)] };
    case "point":
      return {
        kind: "point",
        layer,
        points: [point2(entity.position)],
        schema4: { kind: "point" },
      };
    case "circle":
      return {
        kind: "circle",
        layer,
        points: [point2(entity.center)],
        radius: entity.radius,
      };
    case "arc":
      // El modelo neutral guarda radianes porque así viajan en el archivo; la
      // primitiva canónica habla en grados. La conversión se hace UNA vez, aquí.
      return {
        kind: "arc",
        layer,
        points: [point2(entity.center)],
        radius: entity.radius,
        startAngle: degrees(entity.startAngle),
        endAngle: degrees(entity.endAngle),
      };
    case "lwpolyline":
      return {
        kind: "polyline",
        layer,
        closed: entity.closed,
        // El bulge pertenece al vértice donde ARRANCA el segmento, igual que el
        // grupo 42 de DXF: los dos modelos coinciden y no hay que desplazarlo.
        points: entity.vertices.map((vertex, index) => {
          const bulge = entity.bulges?.[index];
          return bulge === undefined || bulge === 0
            ? point2(vertex)
            : { ...point2(vertex), bulge };
        }),
      };
    case "text":
      return {
        kind: "text",
        layer,
        points: [point2(entity.insertion)],
        text: decodeCodePageBytes(entity.valueBytes),
        textHeight: entity.height,
      };
    case "ellipse":
      // `majorAxisEndpoint` ya es el vector relativo al centro que la
      // primitiva espera: mismo contrato que el DXF, sólo cambia de dónde
      // sale el radián que hay que pasar a grados.
      return {
        kind: "ellipse",
        layer,
        points: [point2(entity.center)],
        majorAxis: point2(entity.majorAxisEndpoint),
        axisRatio: entity.axisRatio,
        startAngle: degrees(entity.startAngle),
        endAngle: degrees(entity.endAngle),
      };
    case "spline": {
      // El perfil ya filtró a escenario 1 (nudos + puntos de control) en
      // `toBetaProfileGeometry`; esta comprobación es sólo por el `undefined`
      // que el tipo sigue permitiendo (escenario 2 lo deja así), no una
      // segunda validación de negocio.
      const controlPoints = entity.controlPoints;
      if (controlPoints === undefined || controlPoints.length < 2) return null;
      return {
        kind: "spline",
        layer,
        points: controlPoints.map(point2),
        degree: entity.degree,
        ...(entity.knots !== undefined && entity.knots.length > 0
          ? { knots: [...entity.knots] }
          : {}),
      };
    }
    default:
      return null;
  }
}

/**
 * Qué propiedades de un TEXT/LWPOLYLINE neutral no caben en `CadDxfPrimitive`
 * y por tanto se descartan al mapear — lista vacía si no hay ninguna pérdida
 * real (todo estaba en su valor por defecto). Un archivo por defecto no debe
 * generar ruido; uno que sí usaba rotación/ancho/elevación sí.
 *
 * Compartido con el importador DXF: `CadDxfPrimitive` es la MISMA primitiva
 * intermedia para los dos formatos, así que esta limitación no es específica
 * de DWG — pero DWG es quien la está reportando aquí por ahora.
 */
export function droppedTextProperties(
  entity: Extract<DwgNeutralGeometry, { kind: "text" }>,
): string[] {
  const dropped: string[] = [];
  if (entity.rotation !== undefined && entity.rotation !== 0) {
    dropped.push(`rotación (${degrees(entity.rotation).toFixed(2)}°)`);
  }
  if (entity.widthFactor !== undefined && entity.widthFactor !== 1) {
    dropped.push(`factor de ancho (${entity.widthFactor})`);
  }
  if (entity.obliqueAngle !== undefined && entity.obliqueAngle !== 0) {
    dropped.push(`ángulo oblicuo (${degrees(entity.obliqueAngle).toFixed(2)}°)`);
  }
  if (
    (entity.horizontalAlignment !== undefined && entity.horizontalAlignment !== 0) ||
    (entity.verticalAlignment !== undefined && entity.verticalAlignment !== 0) ||
    entity.alignment !== undefined
  ) {
    dropped.push("alineación de texto");
  }
  if (entity.generation !== undefined && entity.generation !== 0) {
    dropped.push("generación (invertido/al revés)");
  }
  return dropped;
}

export function droppedLwPolylineProperties(
  entity: Extract<DwgNeutralGeometry, { kind: "lwpolyline" }>,
): string[] {
  const dropped: string[] = [];
  if (entity.elevation !== undefined && entity.elevation !== 0) {
    dropped.push(`elevación (${entity.elevation})`);
  }
  if (entity.thickness !== undefined && entity.thickness !== 0) {
    dropped.push(`grosor/extrusión 3D (thickness ${entity.thickness})`);
  }
  if (entity.constantWidth !== undefined && entity.constantWidth !== 0) {
    dropped.push(`ancho constante (${entity.constantWidth})`);
  }
  if (entity.widths !== undefined && entity.widths.some((w) => w.start !== 0 || w.end !== 0)) {
    dropped.push("anchos por vértice (inicio/fin distintos)");
  }
  return dropped;
}

// ---------------------------------------------------------------------------
// MTEXT, DIMENSION y HATCH: no tienen primitiva plana, cada uno su propio
// canal intermedio, cada uno su propio conjunto de entidades canónicas ya
// probado (`cadDxfMTextsToNativeEntities` y compañía en dxf-cad-document.ts).
// ---------------------------------------------------------------------------

export function dwgMTextToCadDxfMText(entity: DwgNeutralMText, layer: string): CadDxfMText {
  // El contenido con formato llega en la misma sintaxis de escape que un
  // MTEXT de DXF una vez decodificada la página de códigos: mismo
  // decodificador, sin adaptarlo.
  const decoded = decodeMTextContent(decodeCodePageBytes(entity.valueBytes));
  return {
    layer,
    insertion: point2(entity.insertion),
    width: entity.rectWidth,
    height: entity.height,
    // `xAxisDirection` es el vector de dirección del formato; el ángulo es
    // su atan2, en radianes como todo lo demás del modelo neutral.
    rotation: degrees(Math.atan2(entity.xAxisDirection.y, entity.xAxisDirection.x)),
    alignment: mtextAlignment(entity.attachment),
    lineSpacing: entity.lineSpacingFactor,
    ...decoded,
  };
}

/**
 * Distancia con signo del punto `p` a la recta `a`→`b`, sobre la normal
 * `(-dir.y, dir.x)`. Es la misma convención que usa la reconstrucción de
 * cotas DXF ajenas (`dxf-read-foreign-dimensions.ts`), portada aquí porque
 * DWG entrega puntos ya tipados en vez de pares de código de grupo: no hay
 * pares que leer, pero la geometría que reconstruye es la misma.
 */
function signedOffset(a: CadDxfPoint, b: CadDxfPoint, p: CadDxfPoint): number {
  const direction = { x: b.x - a.x, y: b.y - a.y };
  const length = Math.hypot(direction.x, direction.y);
  if (length <= 1e-9) return 0;
  const normal = { x: -direction.y / length, y: direction.x / length };
  const delta = { x: p.x - a.x, y: p.y - a.y };
  return delta.x * normal.x + delta.y * normal.y;
}

/**
 * Reconstruye una cota DWG como cota VIVA: sus propios puntos medidos, sin
 * XDATA (DWG no la tiene). Entra DESLIGADA, igual que una cota DXF ajena —
 * mide lo suyo, no se entera de que movieron el muro — y por la misma razón:
 * la asociatividad real vive en reactores por handle que no nombran nada de
 * este documento.
 *
 * `null` cuando a la variante le faltan los puntos que la definen o su
 * geometría es degenerada (longitud/radio cero, giro no alineado a eje).
 * ANGULAR DE DOS LÍNEAS no entra nunca: el perfil ya la excluye antes de
 * llegar aquí (intersecar dos rectas es la misma reconstrucción que
 * `dxf-read-foreign-dimensions.ts` declina para DXF, por el mismo riesgo de
 * mandar el vértice al infinito con un par casi paralelo).
 */
export function dwgDimensionToCadDxfSemanticDimension(
  entity: DwgNeutralDimension,
  layer: string,
): CadDxfSemanticDimension | null {
  const text = decodeCodePageBytes(entity.userTextBytes).trim();
  const common = {
    layer,
    // No usado por `cadDxfSemanticDimensionsToNativeEntities` (lo borra
    // antes de construir la entidad): el tipo lo exige, DWG no tiene nada
    // parecido, y el mismo "" es lo que ya usa la cota DXF ajena.
    blockName: "",
    // "<>" es el marcador de AutoCAD para «usa la medida»: copiarlo como
    // texto dejaría una cota que muestra literalmente esos dos caracteres.
    ...(text && text !== "<>" ? { text } : {}),
  };
  switch (entity.dimensionKind) {
    case "aligned": {
      if (!entity.point13 || !entity.point14) return null;
      const a = point2(entity.point13);
      const b = point2(entity.point14);
      if (Math.hypot(b.x - a.x, b.y - a.y) <= 1e-9) return null;
      return {
        ...common,
        dimensionKind: "aligned",
        a,
        b,
        offset: signedOffset(a, b, point2(entity.definitionPoint)),
      };
    }
    case "linear": {
      if (!entity.point13 || !entity.point14) return null;
      // El modelo canónico sólo tiene eje X o eje Y; un giro intermedio no
      // cabe y no se aproxima — igual que para una cota DXF ajena.
      const rotationDeg = ((degrees(entity.dimensionRotation ?? 0) % 180) + 180) % 180;
      const axis = Math.abs(rotationDeg) < 1e-6 ? "x" : Math.abs(rotationDeg - 90) < 1e-6 ? "y" : null;
      if (!axis) return null;
      const a = point2(entity.point13);
      const b = point2(entity.point14);
      if (axis === "x" && Math.abs(b.x - a.x) <= 1e-9) return null;
      if (axis === "y" && Math.abs(b.y - a.y) <= 1e-9) return null;
      const d = point2(entity.definitionPoint);
      const offset = axis === "x" ? d.y - Math.max(a.y, b.y) : d.x - Math.max(a.x, b.x);
      return { ...common, dimensionKind: "linear", axis, a, b, offset };
    }
    case "radius": {
      if (!entity.point15) return null;
      const center = point2(entity.point15);
      const arrow = point2(entity.definitionPoint);
      const radius = Math.hypot(arrow.x - center.x, arrow.y - center.y);
      if (!(radius > 1e-9)) return null;
      return { ...common, dimensionKind: "radius", a: center, b: arrow, radius };
    }
    case "diameter": {
      if (!entity.point15) return null;
      const p15 = point2(entity.point15);
      const p10 = point2(entity.definitionPoint);
      const diameter = Math.hypot(p10.x - p15.x, p10.y - p15.y);
      if (!(diameter > 1e-9)) return null;
      const center = { x: (p10.x + p15.x) / 2, y: (p10.y + p15.y) / 2 };
      return { ...common, dimensionKind: "diameter", a: center, b: p10, radius: diameter / 2 };
    }
    case "angular3pt": {
      if (!entity.point15 || !entity.point13 || !entity.point14) return null;
      return {
        ...common,
        dimensionKind: "angular",
        a: point2(entity.point15),
        b: point2(entity.point13),
        c: point2(entity.point14),
      };
    }
    case "ordinate": {
      if (!entity.point13) return null;
      return {
        ...common,
        dimensionKind: "ordinate",
        axis: (entity.flags & 64) === 64 ? "x" : "y",
        a: point2(entity.definitionPoint),
        b: point2(entity.point13),
        ...(entity.point14 ? { c: point2(entity.point14) } : {}),
      };
    }
    case "angular2ln":
      return null;
    default:
      return null;
  }
}

/**
 * Proyecta un HATCH a su primitiva, camino por camino. Sólo los caminos
 * POLILÍNEA tienen forma en `CadDxfHatch` — ningún campo representa un
 * contorno curvo, ahí ninguno; los de segmentos (línea/arco/arco
 * elíptico/spline) se cuentan y se descartan, exactamente lo que ya hace el
 * lector de HATCH de DXF con un contorno curvo (`dxf-import.ts`, aviso
 * `hatch_edge_path_partial`). `hatch: null` sólo cuando NINGÚN camino
 * sobrevive: ahí no hay relleno que colocar, no una versión a medias.
 */
export function dwgHatchToCadDxfHatch(
  entity: DwgNeutralHatch,
  layer: string,
): { hatch: CadDxfHatch | null; droppedPaths: number } {
  const boundaries: CadDxfPoint[][] = [];
  let droppedPaths = 0;
  for (const path of entity.paths) {
    if (path.kind !== "polyline") {
      droppedPaths += 1;
      continue;
    }
    const boundary = path.vertices.map((vertex, index) => {
      const bulge = path.bulges?.[index];
      return bulge === undefined || bulge === 0 ? point2(vertex) : { ...point2(vertex), bulge };
    });
    if (boundary.length >= 3) boundaries.push(boundary);
  }
  if (boundaries.length === 0) return { hatch: null, droppedPaths };
  // El primer punto semilla es también la PRIMERA fuente que usa el lector
  // de HATCH de DXF para el origen del patrón (antes que el grupo 43/44, que
  // DWG no decodifica aparte): no es una suposición nueva, es la misma.
  const origin = entity.seedPoints[0];
  return {
    hatch: {
      layer,
      pattern: decodeCodePageBytes(entity.nameBytes),
      solid: entity.solidFill,
      boundaries,
      ...(entity.scaleOrSpacing !== undefined && entity.scaleOrSpacing > 0
        ? { scale: entity.scaleOrSpacing }
        : {}),
      ...(entity.angle !== undefined ? { angle: degrees(entity.angle) } : {}),
      ...(origin !== undefined ? { origin: point2(origin) } : {}),
      islandStyle: entity.style === 1 ? "outer" : entity.style === 2 ? "ignore" : "normal",
    },
    droppedPaths,
  };
}
