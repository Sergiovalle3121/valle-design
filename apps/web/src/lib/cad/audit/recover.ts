/**
 * RECOVER: abrir lo que `migrateCadDocument` se niega a abrir, y decir qué se perdió.
 *
 * ## El límite, dicho antes que el código
 *
 * Esto recupera el documento CANÓNICO de Valle Design (el JSON que persiste
 * `/v1/cad/documents`), no un DWG ni un DXF binario corrupto — reconstruir un
 * formato binario ajeno es trabajo de `lib/cad/interop/` y de
 * `dwg-native-reader.ts`, con su propia frontera legal (ADR-0009). «Todavía
 * no» para eso, nunca «nunca»: si un día hay un lector de bytes DWG que
 * produzca una estructura parcial, este módulo es donde ese resultado parcial
 * se termina de salvar, no donde se decodifican bytes.
 *
 * ## Por qué migrar-o-nada no basta
 *
 * `migrateCadDocument` es deliberadamente FAIL-CLOSED: si CUALQUIER valor
 * numérico del documento entero no es finito, o si dos entidades comparten
 * id, rechaza el documento COMPLETO — la propiedad correcta para abrir un
 * archivo sano, y la propiedad que convierte un archivo con una sola entidad
 * mala en un archivo que no abre NADA. RECOVER hace lo que AutoCAD hace de
 * verdad: intenta salvar entidad por entidad, y publica —con índice, id y
 * motivo— exactamente lo que no pudo, en vez de una barra de progreso verde.
 *
 * Al final, el resultado (sano o salvado a medias) pasa SIEMPRE por
 * `migrateCadDocument`: RECOVER no inventa una segunda forma de construir un
 * `CadDocument` válido, arma el mejor candidato que puede y deja que la
 * misma puerta de siempre decida si de verdad lo es.
 */
import type { CadDocument, CadEntity, CadLayerDef } from "../cad-document";
import { migrateCadDocument } from "../cad-document";

export interface CadRecoverLoss {
  /** Posición en el array `entities` de origen; `-1` cuando el fallo es global. */
  index: number;
  entityId?: string;
  type?: string;
  reason: string;
}

export interface CadRecoverManifest {
  totalEntities: number;
  recoveredEntities: number;
  lost: readonly CadRecoverLoss[];
  /** Capas que las entidades nombraban sin declarar: se crean con apariencia por defecto. */
  layersSynthesized: readonly string[];
}

export interface CadRecoverResult {
  document: CadDocument | null;
  manifest: CadRecoverManifest;
  /** `true` si se obtuvo un documento abrible, sano o salvado a medias. */
  recovered: boolean;
}

/**
 * Tipos que este salvamento sabe reconocer y comprobar. Deliberadamente NO
 * incluye `solid3d`/`region`: un árbol de construcción B-rep corrupto no se
 * arregla campo a campo, y fingir que sí sería la clase exacta de resultado
 * plausible-y-falso que el corpus de geometría degenerada prohíbe.
 */
// `dimension` y `mleader` quedan FUERA a propósito: son asociativas por
// `references[].entityId`, y remendar esas referencias entidad por entidad
// exigiría el mismo trabajo de `associative-dimension.ts` duplicado aquí. Se
// pierden y se declaran —«tipo desconocido o no salvable»— en vez de
// arriesgar una cota que apunta a un id que el salvamento acaba de inventar.
const KNOWN_TYPES = new Set([
  "line", "circle", "arc", "polyline", "text", "mtext", "insert", "ellipse", "spline",
  "hatch", "point", "xline", "ray", "solid", "wipeout", "wall", "opening",
]);

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finitePoint(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return finiteNumber(point.x) && finiteNumber(point.y);
}

/** Comprobación mínima por tipo: ¿tiene los campos que su geometría exige, y son finitos? */
function entityDefect(raw: Record<string, unknown>): string | null {
  switch (raw.type) {
    case "line":
      return finitePoint(raw.start) && finitePoint(raw.end) ? null : "extremos no finitos";
    case "circle":
      return finitePoint(raw.center) && finiteNumber(raw.radius) ? null : "centro o radio no finitos";
    case "arc":
      return finitePoint(raw.center) && finiteNumber(raw.radius) &&
        finiteNumber(raw.startAngle) && finiteNumber(raw.endAngle)
        ? null : "centro, radio o ángulos no finitos";
    case "polyline": {
      const vertices = raw.vertices;
      if (!Array.isArray(vertices) || vertices.length === 0) return "sin vértices";
      return vertices.every((vertex) => finitePoint(vertex)) ? null : "un vértice no es finito";
    }
    case "text":
    case "mtext":
      return typeof raw.text === "string" ? null : "sin texto";
    case "insert":
      return finitePoint(raw.insertion) && typeof raw.block === "string" && raw.block
        ? null : "sin punto de inserción o sin nombre de bloque";
    default:
      // Tipos conocidos sin comprobación geométrica dedicada aquí: se aceptan
      // por la forma mínima (id/type/layer), que ya se comprobó antes de llegar.
      return null;
  }
}

function validLayer(raw: unknown): CadLayerDef | null {
  if (!raw || typeof raw !== "object") return null;
  const layer = raw as Record<string, unknown>;
  if (typeof layer.id !== "string" || !layer.id || typeof layer.name !== "string" || !layer.name) return null;
  return {
    id: layer.id,
    name: layer.name,
    color: typeof layer.color === "string" ? layer.color : "#ffffff",
    visible: layer.visible !== false,
    locked: layer.locked === true,
  };
}

const DEFAULT_LAYER_APPEARANCE = "#808080";

/**
 * Salvamento entidad por entidad.
 *
 * Se corre SIEMPRE, no sólo cuando `migrateCadDocument` rechaza el documento
 * entero. Ese chequeo global es deliberadamente grueso —números finitos e
 * ids únicos, nada más— y por eso mismo es INSUFICIENTE para RECOVER: trata
 * `null` como finito (una coordenada ausente no es un número, pero tampoco es
 * `NaN`) y no mira la FORMA de cada entidad, así que un documento con un
 * `INSERT` a un bloque inexistente o una entidad de tipo inventado pasaría su
 * comprobación sin que nadie lo note. Repetir el escaneo entidad por entidad
 * siempre —y sólo delegar en `migrateCadDocument` la reconstrucción FINAL, ya
 * con los supervivientes— es lo que impide ese resultado plausible y falso.
 */
function salvage(raw: Record<string, unknown>): CadRecoverResult {
  const rawEntities = Array.isArray(raw.entities) ? raw.entities : [];
  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : [];

  const knownBlockKeys = new Set<string>();
  const survivingBlocks: CadDocument["blocks"] = [];
  for (const item of rawBlocks) {
    if (!item || typeof item !== "object") continue;
    const block = item as Record<string, unknown>;
    if (typeof block.id !== "string" || !block.id || typeof block.name !== "string" || !block.name) continue;
    knownBlockKeys.add(block.id);
    knownBlockKeys.add(block.name);
    survivingBlocks.push({
      id: block.id,
      name: block.name,
      basePoint: finitePoint(block.basePoint)
        ? { x: (block.basePoint as { x: number }).x, y: (block.basePoint as { y: number }).y, z: 0 }
        : { x: 0, y: 0, z: 0 },
      // El CONTENIDO del bloque no se audita recursivamente en esta versión:
      // un bloque cuya definición está corrupta se conserva VACÍO en vez de
      // arriesgar geometría inventada dentro de él.
      entities: [],
    });
  }

  const declaredLayers = (Array.isArray(raw.layers) ? raw.layers : [])
    .map(validLayer)
    .filter((layer): layer is CadLayerDef => layer !== null);
  const declaredLayerIds = new Set(declaredLayers.map((layer) => layer.id));

  const lost: CadRecoverLoss[] = [];
  const survivingEntities: CadEntity[] = [];
  const seenIds = new Set<string>();
  const layersSynthesized = new Set<string>();

  rawEntities.forEach((item: unknown, index: number) => {
    if (!item || typeof item !== "object") {
      lost.push({ index, reason: "no es un objeto interpretable como entidad." });
      return;
    }
    const entity = item as Record<string, unknown>;
    if (typeof entity.id !== "string" || !entity.id) {
      lost.push({ index, reason: "sin id." });
      return;
    }
    if (seenIds.has(entity.id)) {
      lost.push({ index, entityId: entity.id, reason: "id duplicado: ya se recuperó otra entidad con el mismo id." });
      return;
    }
    if (typeof entity.type !== "string" || !KNOWN_TYPES.has(entity.type)) {
      lost.push({
        index,
        entityId: entity.id,
        type: typeof entity.type === "string" ? entity.type : undefined,
        reason: `tipo desconocido o no salvable: «${String(entity.type)}».`,
      });
      return;
    }
    const defect = entityDefect(entity);
    if (defect) {
      lost.push({ index, entityId: entity.id, type: entity.type, reason: defect });
      return;
    }
    if (entity.type === "insert" && !knownBlockKeys.has(String(entity.block))) {
      lost.push({ index, entityId: entity.id, type: "insert", reason: `bloque «${String(entity.block)}» inexistente.` });
      return;
    }
    const layer = typeof entity.layer === "string" && entity.layer ? entity.layer : "0";
    if (layer !== "0" && !declaredLayerIds.has(layer)) layersSynthesized.add(layer);
    seenIds.add(entity.id);
    survivingEntities.push({ ...entity, layer } as CadEntity);
  });

  const layers: CadLayerDef[] = [
    { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ...declaredLayers.filter((layer) => layer.id !== "0"),
    ...[...layersSynthesized].map((id): CadLayerDef => ({
      id, name: id, color: DEFAULT_LAYER_APPEARANCE, visible: true, locked: false,
    })),
  ];

  const meta = raw.meta && typeof raw.meta === "object" ? (raw.meta as Record<string, unknown>) : {};

  try {
    const document = migrateCadDocument({
      meta: { version: 1, schema: 4, unit: typeof meta.unit === "string" ? meta.unit : "mm" },
      layers,
      entities: survivingEntities,
      blocks: survivingBlocks,
    });
    return {
      document,
      manifest: {
        totalEntities: rawEntities.length,
        recoveredEntities: survivingEntities.length,
        lost,
        layersSynthesized: [...layersSynthesized],
      },
      recovered: true,
    };
  } catch (error) {
    return {
      document: null,
      manifest: {
        totalEntities: rawEntities.length,
        recoveredEntities: 0,
        lost: [
          ...lost,
          { index: -1, reason: `lo que sobrevivió tampoco forma un documento válido: ${String(error)}` },
        ],
        layersSynthesized: [...layersSynthesized],
      },
      recovered: false,
    };
  }
}

export function recoverCadDocument(candidate: unknown): CadRecoverResult {
  if (!candidate || typeof candidate !== "object") {
    return {
      document: null,
      manifest: {
        totalEntities: 0,
        recoveredEntities: 0,
        lost: [{ index: -1, reason: "el archivo no es un objeto JSON interpretable." }],
        layersSynthesized: [],
      },
      recovered: false,
    };
  }
  return salvage(candidate as Record<string, unknown>);
}
