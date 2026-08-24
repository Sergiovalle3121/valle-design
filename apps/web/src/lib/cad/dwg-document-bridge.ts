/**
 * El puente entre la base de datos neutral DWG y el documento canónico.
 *
 * POR QUÉ EXISTE HOY, CON LA PUERTA CERRADA. El laboratorio clean-room ya
 * ensambla una base neutral —capas, bloques con contenido, entidades de model
 * space y los tipos que aún no decodifica, ENUMERADOS— y el producto tiene un
 * documento canónico maduro. Lo único que faltaba entre los dos era este
 * mapeo, y escribirlo no requiere ninguna firma: mapear una estructura de datos
 * a otra no lee un solo byte de DWG y no habilita nada. Lo que sí requiere
 * firma —decodificar bytes de un archivo real— vive detrás del gate y hoy está
 * cerrado.
 *
 * LA SEPARACIÓN ES DELIBERADA, y es lo que permite que esto esté PROBADO hoy:
 *
 * - `dwgNeutralDatabaseToCadDocument` es PURA y siempre invocable. Recibe una
 *   base ya decodificada y produce el informe de importación canónico. Sus
 *   specs corren contra estructuras sintéticas y demuestran el mapeo entero.
 * - `importDwgDocumentBytes` es la única que tocaría bytes, y falla cerrado
 *   mientras el gate no esté abierto. Hoy falla siempre.
 *
 * Sin esa separación el puente sería código muerto sin evidencia ejecutable, y
 * en este repositorio nada cuenta sin evidencia ejecutable.
 *
 * CÓMO MAPEA. No inventa un segundo mapeo canónico: traduce la geometría
 * neutral a los mismos intermedios que el importador DXF ya usa —la
 * primitiva plana para geometría simple, y `CadDxfMText`/
 * `CadDxfSemanticDimension`/`CadDxfHatch` para las tres que no caben en una
 * primitiva— y delega en `cadDxfPrimitivesToCanonicalEntities`,
 * `cadDxfBlocksToCadDocumentParts` y sus tres análogos
 * (`cadDxfMTextsToNativeEntities` y compañía), que están probados y son los
 * que producen entidades canónicas de verdad. Un segundo camino hacia
 * `CadEntity` sería un segundo conjunto de errores.
 *
 * LO QUE SE PIERDE SE DECLARA. Los nombres y los textos viajan como BYTES en la
 * página de códigos del dibujo, que el límite binario no interpreta a propósito.
 * El puente los lee como Latin-1 —lo único que puede hacer sin adivinar— y
 * anota una pérdida por cada uno. Un acento mal leído que nadie declara es peor
 * que un acento mal leído que aparece en el informe.
 *
 * No importa nada del laboratorio: el guardián `check:dwg` debe seguir contando
 * cero importaciones en runtime. Los tipos son el espejo estructural de
 * `dwg-neutral-model`.
 */
import {
  layoutToCadDocument,
  migrateCadDocument,
  type CadEntity,
  type CadLayerDef,
  type CadLossManifestEntry,
} from "./cad-document";
import { MAX_DWG_IMPORT_BYTES, type DocumentImportReport } from "./document-import";
import {
  cadDxfBlocksToCadDocumentParts,
  cadDxfHatchesToNativeEntities,
  cadDxfMTextsToNativeEntities,
  cadDxfPrimitivesToCanonicalEntities,
  cadDxfSemanticDimensionsToNativeEntities,
} from "./dxf-cad-document";
import type {
  CadDxfHatch,
  CadDxfMText,
  CadDxfPoint,
  CadDxfPrimitive,
  CadDxfSemanticBlock,
  CadDxfSemanticDimension,
  CadDxfSemanticInsert,
} from "./dxf-import";
// El formato de MTEXT (negrita, fuente, alineación de párrafo…) viaja
// incrustado como códigos de escape dentro del propio texto, igual en DXF
// que en DWG: el mismo decodificador sirve a los dos sin tocarlo.
import { decodeMTextContent, mtextAlignment } from "./dxf-read-annotations";
import {
  DWG_IMPORT_DISABLED_REASON,
  dwgImportIsEnabled,
  dwgPromotionBlockers,
  type DwgPromotionGates,
} from "./dwg-interop-flag";
import type {
  DwgNeutralBlock,
  DwgNeutralDatabase,
  DwgNeutralDatabaseReader,
  DwgNeutralDimension,
  DwgNeutralEntityRecord,
  DwgNeutralGeometry,
  DwgNeutralHatch,
  DwgNeutralLayer,
  DwgNeutralMText,
} from "./dwg-neutral-model";

/** Códigos de pérdida del puente. Estables: la interfaz los agrupa por código. */
export const DWG_BRIDGE_LOSS_CODES = Object.freeze({
  codePage: "dwg_codepage_undecoded",
  unsupportedObject: "dwg_unsupported_object",
  diagnostic: "dwg_decoder_diagnostic",
  danglingLayer: "dwg_layer_handle_unresolved",
  danglingBlock: "dwg_insert_block_unresolved",
  hatchCurvedBoundary: "dwg_hatch_curved_boundary_dropped",
});

/** Error tipado del puente: nunca un `Error` genérico, nunca un éxito a medias. */
export class DwgBridgeError extends Error {
  readonly code: "DWG_IMPORT_DISABLED" | "DWG_NO_DECODER" | "DWG_INPUT_REJECTED";
  readonly blockers: readonly string[];

  constructor(
    code: "DWG_IMPORT_DISABLED" | "DWG_NO_DECODER" | "DWG_INPUT_REJECTED",
    message: string,
    blockers: readonly string[] = [],
  ) {
    super(message);
    this.name = "DwgBridgeError";
    this.code = code;
    this.blockers = Object.freeze([...blockers]);
  }
}

// ---------------------------------------------------------------------------
// Bytes de la página de códigos → cadena, con la pérdida declarada
// ---------------------------------------------------------------------------

/**
 * Latin-1, y consta que es una suposición.
 *
 * La capa binaria NO decodifica texto a propósito: la página de códigos del
 * dibujo vive en las variables de cabecera y ésas siguen opacas. Latin-1 es la
 * única lectura que no requiere adivinar nada (byte ↔ code point), acierta en
 * los planos latinoamericanos habituales y falla de forma VISIBLE en el resto.
 * Cada uso anota una pérdida: el usuario tiene que poder ver por qué un nombre
 * de capa salió raro en vez de creer que su archivo estaba mal.
 */
function decodeCodePageBytes(bytes: readonly number[]): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte & 0xff);
  return out;
}

const point2 = (value: { readonly x: number; readonly y: number }): CadDxfPoint => ({
  x: value.x,
  y: value.y,
});

const degrees = (radians: number): number => (radians * 180) / Math.PI;

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

// ---------------------------------------------------------------------------
// Base neutral → informe de importación canónico
// ---------------------------------------------------------------------------

export interface DwgBridgeOptions {
  /** Prefijo de los ids generados. Por defecto `dwg`. */
  readonly idPrefix?: string;
}

interface MappedEntities {
  readonly primitives: CadDxfPrimitive[];
  readonly inserts: CadDxfSemanticInsert[];
  readonly mtexts: CadDxfMText[];
  readonly dimensions: CadDxfSemanticDimension[];
  readonly hatches: CadDxfHatch[];
  readonly losses: CadLossManifestEntry[];
}

function layerNameFor(
  record: DwgNeutralEntityRecord,
  layerNames: Map<number, string>,
  losses: CadLossManifestEntry[],
): string {
  if (record.layerHandle === undefined) return "0";
  const name = layerNames.get(record.layerHandle);
  if (name !== undefined) return name;
  // Una capa que no resuelve NO se inventa: la entidad cae a "0" y consta.
  losses.push({
    code: DWG_BRIDGE_LOSS_CODES.danglingLayer,
    sourceType: record.entity.kind,
    detail: `La entidad ${record.handle} apunta a una capa (${record.layerHandle}) que no está en la tabla; se coloca en la capa 0.`,
    severity: "warning",
  });
  return "0";
}

/**
 * `context` distingue model space de contenido de bloque. MTEXT/DIMENSION/
 * HATCH sólo se proyectan en model space: `CadDxfSemanticBlock` no tiene
 * campo para ninguno de los tres —ni siquiera para DXF, donde un bloque sólo
 * lleva primitivas planas e INSERTs—, así que dentro de un bloque caen al
 * mismo diagnóstico que cualquier tipo sin representación ahí.
 */
function mapRecords(
  records: readonly DwgNeutralEntityRecord[],
  layerNames: Map<number, string>,
  context: "modelSpace" | "block",
): MappedEntities {
  const primitives: CadDxfPrimitive[] = [];
  const inserts: CadDxfSemanticInsert[] = [];
  const mtexts: CadDxfMText[] = [];
  const dimensions: CadDxfSemanticDimension[] = [];
  const hatches: CadDxfHatch[] = [];
  const losses: CadLossManifestEntry[] = [];

  for (const record of records) {
    const layer = layerNameFor(record, layerNames, losses);
    if (record.entity.kind === "insert") {
      if (record.insertedBlockName === undefined) {
        losses.push({
          code: DWG_BRIDGE_LOSS_CODES.danglingBlock,
          sourceType: "insert",
          detail: `El INSERT ${record.handle} no resuelve a ningún bloque; no se coloca.`,
          severity: "error",
        });
        continue;
      }
      inserts.push({
        block: decodeCodePageBytes(record.insertedBlockName),
        insertion: point2(record.entity.position),
        scaleX: record.entity.scale.x,
        scaleY: record.entity.scale.y,
        rotation: degrees(record.entity.rotation),
        layer,
        // Los ATTRIB del formato no los decodifica el laboratorio: la bandera
        // se conserva como pérdida en vez de fingir un mapa de atributos vacío.
        attributes: {},
      });
      if (record.entity.attributesFollow) {
        losses.push({
          code: DWG_BRIDGE_LOSS_CODES.unsupportedObject,
          sourceType: "attrib",
          detail: `El INSERT ${record.handle} declara atributos que el decodificador todavía no lee.`,
          severity: "warning",
        });
      }
      continue;
    }

    if (
      (record.entity.kind === "mtext" ||
        record.entity.kind === "dimension" ||
        record.entity.kind === "hatch") &&
      context === "block"
    ) {
      losses.push({
        code: DWG_BRIDGE_LOSS_CODES.unsupportedObject,
        sourceType: record.entity.kind,
        detail: `El objeto ${record.handle} de tipo ${record.entity.kind} no se coloca dentro del bloque: el modelo de bloques del producto todavía no representa este tipo ahí (tampoco lo hace para DXF).`,
        severity: "warning",
      });
      continue;
    }

    if (record.entity.kind === "mtext") {
      mtexts.push(dwgMTextToCadDxfMText(record.entity, layer));
      continue;
    }

    if (record.entity.kind === "dimension") {
      const dimension = dwgDimensionToCadDxfSemanticDimension(record.entity, layer);
      if (dimension === null) {
        losses.push({
          code: DWG_BRIDGE_LOSS_CODES.unsupportedObject,
          sourceType: "dimension",
          detail: `La cota ${record.handle} (${record.entity.dimensionKind}) no se pudo reconstruir: le faltan los puntos que la definen o su geometría es degenerada.`,
          severity: "warning",
        });
        continue;
      }
      dimensions.push(dimension);
      continue;
    }

    if (record.entity.kind === "hatch") {
      const { hatch, droppedPaths } = dwgHatchToCadDxfHatch(record.entity, layer);
      if (hatch === null) {
        losses.push({
          code: DWG_BRIDGE_LOSS_CODES.unsupportedObject,
          sourceType: "hatch",
          detail: `El HATCH ${record.handle} no tiene ningún contorno poligonal: todos sus caminos son curvos y el perfil todavía no los representa.`,
          severity: "warning",
        });
        continue;
      }
      hatches.push(hatch);
      if (droppedPaths > 0) {
        losses.push({
          code: DWG_BRIDGE_LOSS_CODES.hatchCurvedBoundary,
          sourceType: "hatch",
          detail: `El HATCH ${record.handle} conserva sus contornos poligonales; ${droppedPaths} contorno(s) curvo(s) no se importaron.`,
          severity: "warning",
        });
      }
      continue;
    }

    const primitive = dwgGeometryToPrimitive(record.entity, layer);
    if (primitive === null) {
      losses.push({
        code: DWG_BRIDGE_LOSS_CODES.unsupportedObject,
        sourceType: record.entity.kind,
        detail: `El objeto ${record.handle} de tipo ${record.entity.kind} no tiene equivalente canónico.`,
        severity: "warning",
      });
      continue;
    }
    primitives.push(primitive);
  }

  return { primitives, inserts, mtexts, dimensions, hatches, losses };
}

function mapLayers(layers: readonly DwgNeutralLayer[]): {
  names: Map<number, string>;
  definitions: CadLayerDef[];
  losses: CadLossManifestEntry[];
} {
  const palette = ["#ffffff", "#ff5252", "#4fc3f7", "#ffd54f", "#81c784"];
  const names = new Map<number, string>();
  const losses: CadLossManifestEntry[] = [];
  const seen = new Set<string>(["0"]);
  const definitions: CadLayerDef[] = [
    { id: "0", name: "0", color: palette[0], visible: true, locked: false },
  ];

  for (const layer of layers) {
    const name = decodeCodePageBytes(layer.name);
    names.set(layer.handle, name);
    if (layer.name.some((byte) => byte > 0x7f)) {
      losses.push({
        code: DWG_BRIDGE_LOSS_CODES.codePage,
        sourceType: "layer",
        detail: `El nombre de la capa ${layer.handle} lleva bytes fuera de ASCII y la página de códigos del dibujo no se decodifica: se leyó como Latin-1.`,
        severity: "warning",
      });
    }
    if (seen.has(name)) continue;
    seen.add(name);
    definitions.push({
      id: name,
      name,
      color: palette[definitions.length % palette.length],
      visible: true,
      locked: false,
    });
  }
  return { names, definitions, losses };
}

function mapBlocks(
  blocks: readonly DwgNeutralBlock[],
  layerNames: Map<number, string>,
): { semantic: CadDxfSemanticBlock[]; losses: CadLossManifestEntry[] } {
  const semantic: CadDxfSemanticBlock[] = [];
  const losses: CadLossManifestEntry[] = [];
  for (const block of blocks) {
    const mapped = mapRecords(block.entities, layerNames, "block");
    losses.push(...mapped.losses);
    semantic.push({
      name: decodeCodePageBytes(block.name),
      // El punto base real vive en el registro del bloque, que el laboratorio
      // todavía no decodifica: el origen es la única suposición honesta.
      basePoint: { x: 0, y: 0 },
      primitives: mapped.primitives,
      inserts: mapped.inserts,
      attributes: {},
    });
  }
  return { semantic, losses };
}

/**
 * Mapea una base neutral ya decodificada al informe de importación canónico.
 *
 * PURA y siempre invocable: no decodifica nada, no lee bytes y por tanto no
 * habilita nada. Es la mitad del puente que se puede probar hoy.
 */
export function dwgNeutralDatabaseToCadDocument(
  database: DwgNeutralDatabase,
  options: DwgBridgeOptions = {},
): DocumentImportReport {
  const prefix = options.idPrefix ?? "dwg";
  const provider = "dwg-neutral-bridge";
  const { names, definitions, losses: layerLosses } = mapLayers(database.layers);
  const model = mapRecords(database.modelSpaceEntities, names, "modelSpace");
  const blockMap = mapBlocks(database.blocks, names);

  const lossManifest: CadLossManifestEntry[] = [
    ...layerLosses,
    ...model.losses,
    ...blockMap.losses,
    // Lo que el decodificador enumeró sin decodificar se PUBLICA. Callarlo
    // dejaría al usuario creyendo que tiene el plano entero.
    ...database.unsupported.map((object) => ({
      code: DWG_BRIDGE_LOSS_CODES.unsupportedObject,
      sourceType: `type:${object.type}`,
      detail: `El objeto ${object.handle} es de un tipo (${object.type}) que el decodificador todavía no lee.`,
      severity: "warning" as const,
    })),
    ...database.diagnostics.map((diagnostic) => ({
      code: DWG_BRIDGE_LOSS_CODES.diagnostic,
      sourceType: diagnostic.code,
      detail: `${diagnostic.message} (offset ${diagnostic.offset})`,
      severity: diagnostic.severity,
    })),
  ];

  const blockParts = cadDxfBlocksToCadDocumentParts(blockMap.semantic, model.inserts, {
    idPrefix: prefix,
    provider,
  });
  const entities: CadEntity[] = [
    ...cadDxfPrimitivesToCanonicalEntities(model.primitives, {
      idPrefix: prefix,
      provider,
    }),
    ...blockParts.inserts,
    ...cadDxfMTextsToNativeEntities(model.mtexts, { idPrefix: prefix, provider }),
    ...cadDxfSemanticDimensionsToNativeEntities(model.dimensions, { idPrefix: prefix, provider }),
    ...cadDxfHatchesToNativeEntities(model.hatches, { idPrefix: prefix, provider }),
  ];

  const empty = layoutToCadDocument({}, { unit: "mm" });
  const document = migrateCadDocument({
    ...empty,
    layers: definitions,
    entities,
    // El orden del mapa de objetos ES el orden de dibujo del archivo.
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    blocks: blockParts.blocks,
    lossManifest,
  });

  return {
    format: "dwg",
    document,
    importedEntityCount: document.entities.length,
    importedBlockCount: document.blocks.length,
    warnings: lossManifest.map((entry) => ({ code: entry.code, message: entry.detail })),
  };
}

// ---------------------------------------------------------------------------
// La mitad que toca bytes: cerrada
// ---------------------------------------------------------------------------

/**
 * Importa un archivo binario DWG. Falla cerrado mientras el gate esté cerrado.
 *
 * `reader` es el puerto del decodificador y el producto no trae ninguno: la
 * implementación llegará del laboratorio DESPUÉS del ADR de promoción, y ni
 * siquiera pasándola por aquí se salta el gate — la bandera se comprueba antes
 * de mirar el argumento, y antes de mirar un solo byte.
 */
export function importDwgDocumentBytes(
  bytes: Uint8Array,
  reader: DwgNeutralDatabaseReader | null = null,
  options: DwgBridgeOptions & { readonly gates?: DwgPromotionGates; readonly flag?: boolean } = {},
): DocumentImportReport {
  const blockers = dwgPromotionBlockers(options.gates);
  if (!dwgImportIsEnabled(options.flag, options.gates)) {
    throw new DwgBridgeError("DWG_IMPORT_DISABLED", DWG_IMPORT_DISABLED_REASON, blockers);
  }
  if (reader === null) {
    throw new DwgBridgeError(
      "DWG_NO_DECODER",
      "No hay decodificador registrado: el gate está abierto pero nadie ha conectado el lector.",
      blockers,
    );
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new DwgBridgeError("DWG_INPUT_REJECTED", "El archivo está vacío o no son bytes.");
  }
  if (bytes.byteLength > MAX_DWG_IMPORT_BYTES) {
    throw new DwgBridgeError(
      "DWG_INPUT_REJECTED",
      `El archivo supera el límite de ${Math.floor(MAX_DWG_IMPORT_BYTES / 1_000_000)} MB.`,
    );
  }
  return dwgNeutralDatabaseToCadDocument(reader(bytes), options);
}

/** Estado del puente para la interfaz: qué pasa hoy y por qué, sin adornos. */
export function dwgBridgeStatus(
  flag?: boolean,
  gates?: DwgPromotionGates,
): { available: boolean; reason: string; blockers: string[] } {
  const blockers = dwgPromotionBlockers(gates);
  const available = dwgImportIsEnabled(flag, gates);
  return {
    available,
    reason: available ? "" : DWG_IMPORT_DISABLED_REASON,
    blockers,
  };
}
