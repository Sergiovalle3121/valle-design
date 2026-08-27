/**
 * El SEGUNDO punto autorizado del producto que importa el códec DWG — el de
 * ESCRITURA. Autorizado por ADR-0009 §8 (firma del titular 2026-08-25):
 * exportación AC1015 acotada al subconjunto que el writer del laboratorio
 * escribe hoy (LINE/POINT/CIRCLE/ARC/LWPOLYLINE/TEXT/INSERT), con manifiesto
 * de pérdidas y NUNCA omisión silenciosa. `scripts/dwg/check-product-boundary.mjs`
 * lo nombra igual que nombra al adaptador de LECTURA; nadie más toca el
 * códec, y a este archivo sólo lo consume su spec — el botón del producto
 * llega cuando el oráculo externo de §8.2 esté corrido (OWNER ACTION), no
 * antes: `exportCadDocumentToDwg` es fallo cerrado contra ese gate.
 *
 * TRES ESTADOS, nunca dos. «éxito» = todos los tipos del documento viajaron;
 * «éxito con pérdidas» = el archivo salió y el manifiesto dice EXACTAMENTE
 * qué no viajó y por qué; «rechazado» = no hay archivo — porque el gate está
 * cerrado, o porque ninguna entidad del documento es escribible (un DWG
 * vacío que dice ser tu plano es peor que un error). El documento original
 * NUNCA se toca: esta función es pura — bytes nuevos o nada.
 */
import {
  writeCanonicalDwg,
  type CanonicalCadDocumentJson,
  type CanonicalLossEntry,
} from "@valle-design/dwg-codec";
import type { CadDocument } from "./cad-document";
import {
  DWG_EXPORT_GATES,
  dwgBetaExportIsEnabled,
  dwgExportBlockers,
  type DwgExportGates,
} from "./dwg-export-flag";

const RADIANS_PER_DEGREE = Math.PI / 180;

/**
 * El documento del producto guarda ángulos en GRADOS (confirmado por
 * `dxf-roundtrip.spec.ts`); el canónico del laboratorio los espera en
 * RADIANES (`packages/dwg-codec/src/model/entity-geometry.ts`, que documenta
 * el binario real). El lado de LECTURA ya convierte
 * (`dwg-document-bridge-primitives.ts:38`, `degrees()`); este lado de
 * ESCRITURA no lo hacía — pasaba el valor crudo, grados etiquetados como
 * radianes. Explícito por tipo, no un `map` genérico sobre todos los campos
 * numéricos: sólo ARC e INSERT tienen un ángulo en el subconjunto que este
 * writer escribe (`DWG_EXPORT_WRITABLE_TYPES` no incluye `ellipse`).
 */
function toCanonicalEntity(entity: CadDocument["entities"][number]): Record<string, unknown> {
  if (entity.type === "arc")
    return {
      ...entity,
      startAngle: entity.startAngle * RADIANS_PER_DEGREE,
      endAngle: entity.endAngle * RADIANS_PER_DEGREE,
    };
  if (entity.type === "insert")
    return { ...entity, rotation: entity.rotation * RADIANS_PER_DEGREE };
  return { ...entity };
}

/** El subconjunto §8.1 — el preflight cuenta contra ESTA lista, no adivina. */
export const DWG_EXPORT_WRITABLE_TYPES = new Set([
  "line",
  "point",
  "circle",
  "arc",
  "polyline",
  "text",
  "insert",
]);

export interface CadDwgExportPreflight {
  /** Cuántas entidades del documento caen dentro del subconjunto §8.1. */
  readonly writableCount: number;
  /** Cuántas quedarán declaradas en el manifiesto, por tipo. */
  readonly unwritableByType: Readonly<Record<string, number>>;
}

export type CadDwgExportResult =
  | {
      readonly estado: "rechazado";
      readonly motivo: "gate_cerrado" | "sin_entidades_escribibles";
      readonly bloqueos: readonly string[];
      readonly preflight: CadDwgExportPreflight;
    }
  | {
      readonly estado: "exito" | "exito_con_perdidas";
      readonly bytes: Uint8Array;
      readonly manifiestoDePerdidas: readonly CanonicalLossEntry[];
      readonly preflight: CadDwgExportPreflight;
    };

/** Qué viajaría y qué no — SIN escribir nada. Es lo que la interfaz enseña
 * antes de que la persona confirme, para que la pérdida nunca sorprenda. */
export function preflightCadDwgExport(
  document: CadDocument,
): CadDwgExportPreflight {
  let writableCount = 0;
  const unwritableByType: Record<string, number> = {};
  for (const entity of document.entities) {
    if (DWG_EXPORT_WRITABLE_TYPES.has(entity.type)) writableCount += 1;
    else unwritableByType[entity.type] = (unwritableByType[entity.type] ?? 0) + 1;
  }
  return { writableCount, unwritableByType };
}

/**
 * Proyección explícita del documento del producto al canónico del
 * laboratorio — campo a campo, nada de `as`: lo que el canónico de esta fase
 * no modela (espacios de papel, restricciones, referencias externas) se
 * VACÍA aquí y se declara como pérdida, no se cuela tipado a la fuerza.
 */
function toCanonicalDocument(document: CadDocument): {
  canonical: CanonicalCadDocumentJson;
  droppedLosses: CanonicalLossEntry[];
} {
  const droppedLosses: CanonicalLossEntry[] = [];
  if (document.paperSpaces.length > 0) {
    droppedLosses.push({
      code: "paper-spaces-not-written",
      sourceType: "PAPER_SPACE",
      detail: `El documento tiene ${document.paperSpaces.length} espacio(s) de papel; el DWG de esta fase escribe SOLO model space — las hojas siguen intactas en el documento y en el PDF/DXF.`,
      severity: "warning",
    });
  }
  const canonical: CanonicalCadDocumentJson = {
    meta: {
      version: document.meta.version,
      schema: document.meta.schema,
      unit: document.meta.unit,
    },
    layers: document.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      color: layer.color,
      visible: layer.visible,
      locked: layer.locked,
    })),
    entities: document.entities.map(toCanonicalEntity),
    history: [],
    modelSpace: { entityIds: [...document.modelSpace.entityIds] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: document.blocks.map((block) => ({
      id: block.id,
      name: block.name,
      basePoint: { ...block.basePoint },
      entities: block.entities.map(toCanonicalEntity),
    })),
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
  return { canonical, droppedLosses };
}

/**
 * La exportación completa: gate → preflight → escritura → estado. `gates` es
 * inyectable SOLO para que la spec pueda ejercitar el camino post-oráculo
 * sin fingir que el oráculo corrió: producción usa el congelado.
 */
export function exportCadDocumentToDwg(
  document: CadDocument,
  options: { betaFlagOn: boolean; gates?: DwgExportGates },
): CadDwgExportResult {
  const gates = options.gates ?? DWG_EXPORT_GATES;
  const preflight = preflightCadDwgExport(document);
  if (!dwgBetaExportIsEnabled(options.betaFlagOn, gates)) {
    return {
      estado: "rechazado",
      motivo: "gate_cerrado",
      bloqueos: options.betaFlagOn
        ? dwgExportBlockers(gates)
        : ["la bandera de exportación DWG está apagada en este entorno", ...dwgExportBlockers(gates)],
      preflight,
    };
  }
  if (preflight.writableCount === 0) {
    return {
      estado: "rechazado",
      motivo: "sin_entidades_escribibles",
      bloqueos: [
        "ninguna entidad del documento cae en el subconjunto AC1015_EXPORT_2D_V1 — un DWG vacío que dice ser tu plano sería peor que este aviso",
      ],
      preflight,
    };
  }
  const { canonical, droppedLosses } = toCanonicalDocument(document);
  const { bytes, lossManifest } = writeCanonicalDwg(canonical);
  const manifiestoDePerdidas = [...droppedLosses, ...lossManifest];
  return {
    estado: manifiestoDePerdidas.length === 0 ? "exito" : "exito_con_perdidas",
    bytes,
    manifiestoDePerdidas,
    preflight,
  };
}
