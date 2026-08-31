/**
 * LAYTRANS: el mapa de capas del DXF ajeno hacia la capa del despacho.
 *
 * ## Lo que este módulo NO hace
 *
 * No inventa una norma de nomenclatura: `mexican-layers.ts` ya deja escrito,
 * en su sección `noSeAfirma`, que no existe una norma mexicana de capas CAD y
 * que los nombres son COSTUMBRE. LAYTRANS traduce a esa costumbre —o a
 * cualquier otra que el despacho use— nunca a una norma que no existe. Si el
 * destino coincide con un id de `CAD_MEXICAN_LAYERS`, se reutiliza su
 * apariencia completa (color, tipo de línea, grosor); si no, se crea una capa
 * mínima con la apariencia por defecto y el usuario la ajusta después con
 * LAYER, como haría con cualquier capa nueva.
 *
 * ## Por qué el mapa es datos, no estado de sesión
 *
 * `CadSessionCatalogs` (en `command-types.ts`, que otra sesión de esta misma
 * campaña tiene bajo llave para los sólidos 3D) ya tiene cuatro catálogos con
 * nombre y no se le puede añadir un quinto sin tocar ese contrato compartido.
 * Un mapa de traducción de capas es, de cabo a rabo, un `{ entries: [{from,
 * to}] }` serializable: `serializeCadLayerTranslationMap` lo vuelve texto y
 * `parseCadLayerTranslationMap` lo reconstruye, así que "guardable y
 * reutilizable" se cumple sin necesitar un catálogo nuevo — el despacho
 * guarda el texto donde ya guarda cualquier otro archivo suyo.
 */
import type { CadDocument, CadLayerDef } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import { cadLayerIdFromName } from "../cad-layer-manager";
import { CadMexicanLayerError, cadMexicanLayerDefs } from "./mexican-layers";

export interface CadLayerTranslationEntry {
  /** Id de la capa de ORIGEN, tal como llegó en el documento importado. */
  from: string;
  /** Nombre/id deseado en el despacho. Coincide con un id de la norma si aplica. */
  to: string;
}

export interface CadLayerTranslationMap {
  name?: string;
  entries: readonly CadLayerTranslationEntry[];
}

export class CadLayerTranslationMapError extends Error {
  readonly code = "cad_laytrans_map_invalid";
  constructor(reason: string) {
    super(`El mapa de traducción de capas no es válido: ${reason}`);
    this.name = "CadLayerTranslationMapError";
  }
}

export function serializeCadLayerTranslationMap(map: CadLayerTranslationMap): string {
  return JSON.stringify(map);
}

export function parseCadLayerTranslationMap(json: string): CadLayerTranslationMap {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    throw new CadLayerTranslationMapError(`no es JSON válido (${error instanceof Error ? error.message : String(error)}).`);
  }
  if (!raw || typeof raw !== "object") throw new CadLayerTranslationMapError("se esperaba un objeto.");
  const candidate = raw as Record<string, unknown>;
  if (!Array.isArray(candidate.entries))
    throw new CadLayerTranslationMapError('falta «entries» (una lista de {"from": …, "to": …}).');
  const entries = candidate.entries.map((entry, index): CadLayerTranslationEntry => {
    if (
      !entry || typeof entry !== "object" ||
      typeof (entry as Record<string, unknown>).from !== "string" || !(entry as Record<string, unknown>).from ||
      typeof (entry as Record<string, unknown>).to !== "string" || !(entry as Record<string, unknown>).to
    )
      throw new CadLayerTranslationMapError(`la correspondencia #${index + 1} no tiene «from»/«to» válidos.`);
    return { from: (entry as { from: string }).from, to: (entry as { to: string }).to };
  });
  return {
    ...(typeof candidate.name === "string" ? { name: candidate.name } : {}),
    entries,
  };
}

export interface CadLayerTranslationPlan {
  commands: readonly CadEntityCommand[];
  /** Cuántas entidades se movieron por cada correspondencia, con clave `from→to`. */
  movedCounts: Readonly<Record<string, number>>;
  /** Correspondencias cuya capa de origen no existe en el documento: se ignoran. */
  missingSourceLayers: readonly string[];
  /** Correspondencias cuyo destino no es un nombre de capa válido: se ignoran. */
  invalidDestinations: readonly { to: string; reason: string }[];
  /** Capas de destino que hubo que crear porque el despacho no las tenía. */
  createdLayers: readonly string[];
}

function destinationLayerDef(id: string): CadLayerDef {
  try {
    return cadMexicanLayerDefs([id])[0];
  } catch (error) {
    if (!(error instanceof CadMexicanLayerError)) throw error;
    return { id, name: id, color: "#ffffff", visible: true, locked: false };
  }
}

/**
 * Construye el lote: un `layer upsert` por destino nuevo, y un `properties`
 * por cada entidad que cambia de capa — la misma vía que usan las
 * herramientas de capa existentes (`settings-layer-tools.ts`), no una ruta
 * de mutación propia.
 */
export function planCadLayerTranslation(
  document: Pick<CadDocument, "entities" | "layers">,
  map: CadLayerTranslationMap,
): CadLayerTranslationPlan {
  const existingLayerIds = new Set(document.layers.map((layer) => layer.id));
  const commands: CadEntityCommand[] = [];
  const movedCounts: Record<string, number> = {};
  const missingSourceLayers: string[] = [];
  const invalidDestinations: { to: string; reason: string }[] = [];
  const createdLayers: string[] = [];
  const alreadyEnsured = new Set<string>();

  for (const entry of map.entries) {
    if (!existingLayerIds.has(entry.from)) {
      missingSourceLayers.push(entry.from);
      continue;
    }
    let destinationId: string;
    try {
      destinationId = cadLayerIdFromName(entry.to);
    } catch (error) {
      invalidDestinations.push({ to: entry.to, reason: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (!existingLayerIds.has(destinationId) && !alreadyEnsured.has(destinationId)) {
      commands.push({ type: "layer", op: "upsert", layer: destinationLayerDef(destinationId) });
      createdLayers.push(destinationId);
    }
    alreadyEnsured.add(destinationId);

    let moved = 0;
    for (const entity of document.entities) {
      if (entity.layer !== entry.from) continue;
      commands.push({ type: "properties", entityId: entity.id, patch: { layer: destinationId } });
      moved += 1;
    }
    movedCounts[`${entry.from}→${destinationId}`] = moved;
  }

  return { commands, movedCounts, missingSourceLayers, invalidDestinations, createdLayers };
}
