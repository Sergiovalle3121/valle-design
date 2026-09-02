/**
 * EL PLAN DE MAPIMPORT: de los archivos elegidos al lote de órdenes, puro y
 * probable (Ola G, 2026-09-02).
 *
 * Medido antes (`distancia-autocad-completo-20260901.md`, §4 3º MAP 3D): el
 * shapefile entraba SÓLO como documento nuevo por el cuadro «Importar», a un
 * origen local propio, sin atributos y sin saber dónde estaba el dibujo. Un
 * predio no se importa a un plano vacío: se importa DENTRO del plano de
 * conjunto que ya tiene los muros, en su sitio.
 *
 * ## Las cuatro situaciones, decididas aquí y dichas
 *
 *   A. El dibujo está georreferenciado y el archivo trae `.prj`: se reproyecta
 *      al sistema del dibujo (si hace falta) y se coloca con SU colocación —el
 *      predio cae exactamente donde está.
 *   B. El dibujo está georreferenciado y el archivo NO trae `.prj`: se
 *      rechaza. Colocarlo sería adivinar en qué sistema está, y un lindero
 *      adivinado es peor que ninguno.
 *   C. El dibujo no está georreferenciado y el archivo sí sabe dónde está: se
 *      coloca a un origen local redondo (como hasta hoy) y el dibujo QUEDA
 *      georreferenciado con un marcador en (0, 0). Un GeoJSON (grados) se
 *      proyecta a la zona UTM de su centro, porque un grado no es una unidad
 *      de dibujo.
 *   D. Ni el dibujo ni el archivo saben dónde están: se coloca al origen local
 *      y se avisa, como hasta hoy.
 *
 * Cada rasgo entra con su fila de atributos en `context.metadata` (lo que el
 * formato ya tiene): la clave catastral viaja con el polígono y DATAEXTRACTION
 * o LIST la leen sin tabla aparte.
 */
import type { CadLayerDef, CadLossManifestEntry } from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";
import type { CadNativeEntity } from "./entity-runtime";
import type { CadCommandDocumentView } from "./engine/command-types";
import { geoUtmCrs, geoUtmZoneForLongitude, isGeoError, readGeoDataset, type GeoCrs, type GeoPlacement, type GeoShapefile, GEO_LOCAL_ORIGIN_STEP_M } from "../geo";
import { shapefileToCadEntities } from "./geo-cad-document";
import { CAD_GEO_LAYER, cadGeoreferenceMarker, cadGeoreferenceOf, cadGeoreferencePlacement, cadUnitsPerMetre } from "./georeference";
import type { CadGeoBundleFile } from "./geo-import-bundle";

export interface CadGeoImportPlanInput {
  files: readonly CadGeoBundleFile[];
  unit: string | undefined;
  newEntityId: () => string;
  document: CadCommandDocumentView | undefined;
}

export type CadGeoImportPlan =
  | {
      ok: true;
      commands: CadEntityCommand[];
      source: string;
      layer: string;
      entityCount: number;
      /** `kept`: se usó la del dibujo; `created`: el dibujo queda georreferenciado; `none`: sin sistema. */
      georeference: "kept" | "created" | "none";
      crs: GeoCrs | null;
      losses: CadLossManifestEntry[];
      /** Lo que se le enseña antes de confirmar: una línea por hecho. */
      lines: string[];
      /** Lo que se registra al aplicar. */
      notice: string;
    }
  | { ok: false; reason: string };

const TEXT_SIDECARS = new Set(["prj", "cpg"]);

export function planCadGeoImport(input: CadGeoImportPlanInput): CadGeoImportPlan {
  const main = mainFileOf(input.files);
  if (!main) return { ok: false, reason: `MAPIMPORT: entre ${input.files.map((file) => `«${file.name}»`).join(", ") || "lo elegido"} no hay ningún .shp ni .geojson que importar.` };
  const sidecars = sidecarsOf(input.files, main.name);
  let shapefile: GeoShapefile;
  let attributes;
  try {
    const dataset = readGeoDataset({ bytes: main.bytes, name: main.name, ...sidecars });
    if (dataset.kind !== "shapefile") return { ok: false, reason: `MAPIMPORT: «${main.name}» es una nube de puntos; el plano no la representa como entidades.` };
    shapefile = dataset.shapefile;
    attributes = dataset.attributes;
  } catch (error) {
    return { ok: false, reason: `MAPIMPORT: ${messageOf(error)}` };
  }

  const georeference = input.document ? cadGeoreferenceOf(input.document) : null;
  let target: GeoCrs | null = null;
  let placement: GeoPlacement | undefined;
  let mode: "kept" | "created" | "none";
  try {
    if (georeference && shapefile.crs) {
      target = georeference.crs;
      placement = cadGeoreferencePlacement(georeference, input.unit);
      mode = "kept";
    } else if (georeference) {
      return {
        ok: false,
        reason: `MAPIMPORT: el dibujo está georreferenciado en ${georeference.crs.name} (${georeference.crs.id}) y «${main.name}» no trae .prj: no se sabe en qué sistema está, y colocarlo sería adivinar. Adjunta el .prj del conjunto.`,
      };
    } else if (shapefile.crs) {
      target = shapefile.crs.kind === "geographic" ? utmForCentre(shapefile) : shapefile.crs;
      mode = "created";
    } else {
      mode = "none";
    }
  } catch (error) {
    return { ok: false, reason: `MAPIMPORT: ${messageOf(error)}` };
  }

  let converted;
  try {
    converted = shapefileToCadEntities(shapefile, {
      newEntityId: input.newEntityId,
      layer: main.name,
      unit: geoUnitOf(input.unit),
      unitScale: cadUnitsPerMetre(input.unit),
      ...(attributes ? { attributes, attributesAsMetadata: true } : {}),
      ...(placement ? { placement } : {}),
      ...(target ? { reprojectTo: target } : {}),
    });
  } catch (error) {
    return { ok: false, reason: `MAPIMPORT: ${messageOf(error)}` };
  }
  if (converted.entities.length === 0)
    return { ok: false, reason: `MAPIMPORT: «${main.name}» se leyó, pero ninguna de sus geometrías produjo algo dibujable. El dibujo no ha cambiado.` };

  const layer = converted.layers[converted.layers.length - 1];
  const existing = input.document?.layers ?? [];
  const commands: CadEntityCommand[] = [];
  if (!hasLayer(existing, layer.name)) commands.push({ type: "layer", op: "upsert", layer });
  for (const entity of converted.entities) commands.push({ type: "insert", entity: entity as CadNativeEntity });
  if (mode === "created" && target) {
    if (!hasLayer(existing, CAD_GEO_LAYER))
      commands.push({ type: "layer", op: "upsert", layer: { id: CAD_GEO_LAYER, name: CAD_GEO_LAYER, color: "#22c55e", visible: true, locked: false } });
    commands.push({
      type: "insert",
      entity: cadGeoreferenceMarker(input.newEntityId(), { x: 0, y: 0 }, target, converted.placement.originX, converted.placement.originY) as CadNativeEntity,
    });
  }

  const count = converted.entities.length;
  const crsText = target ? `${target.name} (${target.id})` : "sin sistema de referencia (falta el .prj)";
  const reprojected = shapefile.crs && target && shapefile.crs.id !== target.id ? `, reproyectadas desde ${shapefile.crs.name} (${shapefile.crs.id})` : "";
  const fieldNames = attributes?.fields.map((field) => field.name) ?? [];
  const lines = [
    `«${main.name}»: ${count} entidad(es) → capa ${layer.name}`,
    `  · ${crsText}${reprojected}`,
    `  · origen local (${converted.placement.originX}, ${converted.placement.originY}): 1 m = ${converted.placement.unitScale} unidad(es) de dibujo`,
    fieldNames.length > 0 ? `  · ${fieldNames.length} atributo(s) por entidad en metadatos: ${fieldNames.join(", ")}` : "  · sin tabla de atributos",
    ...converted.losses.filter((loss) => loss.severity !== "info").map((loss) => `  · aviso: ${loss.detail}`),
  ];
  const georefText =
    mode === "created"
      ? `; el dibujo queda georreferenciado en ${target!.name} con el marcador en la capa ${CAD_GEO_LAYER}`
      : mode === "kept"
        ? "; colocadas con la georreferencia del dibujo"
        : "; sin .prj, al origen local y sin georreferencia";
  return {
    ok: true,
    commands,
    source: main.name,
    layer: layer.name,
    entityCount: count,
    georeference: mode,
    crs: target,
    losses: converted.losses,
    lines,
    notice: `MAPIMPORT: ${count} entidad(es) de «${main.name}» en la capa ${layer.name}${target ? ` (${target.id})` : ""}${reprojected}${georefText}.`,
  };
}

/** El archivo que manda: el `.shp` si lo hay, si no el GeoJSON. */
function mainFileOf(files: readonly CadGeoBundleFile[]): CadGeoBundleFile | undefined {
  return files.find((file) => extensionOf(file.name) === "shp") ?? files.find((file) => ["geojson", "json"].includes(extensionOf(file.name)));
}

/** Los acompañantes del `.shp`, por el mismo nombre base. Los de texto, decodificados. */
function sidecarsOf(files: readonly CadGeoBundleFile[], mainName: string): { shx?: Uint8Array; dbf?: Uint8Array; prj?: string; cpg?: string } {
  const base = baseNameOf(mainName);
  const out: { shx?: Uint8Array; dbf?: Uint8Array; prj?: string; cpg?: string } = {};
  for (const file of files) {
    if (file.name === mainName || baseNameOf(file.name) !== base) continue;
    const extension = extensionOf(file.name);
    if (extension === "shx") out.shx = file.bytes;
    else if (extension === "dbf") out.dbf = file.bytes;
    else if (TEXT_SIDECARS.has(extension)) out[extension as "prj" | "cpg"] = new TextDecoder("utf-8").decode(file.bytes).trim();
  }
  return out;
}

/** Zona UTM del centro de un conjunto geográfico; fuera de 11N–16N, `geoUtmCrs` lo dice. */
function utmForCentre(shapefile: GeoShapefile): GeoCrs {
  const { minX, maxX } = shapefile.measuredBounds;
  return geoUtmCrs(geoUtmZoneForLongitude((minX + maxX) / 2), shapefile.crs?.datum ?? "WGS84");
}

function geoUnitOf(unit: string | undefined): "mm" | "cm" | "m" {
  return unit === "m" || unit === "cm" ? unit : "mm";
}

function hasLayer(layers: readonly CadLayerDef[], name: string): boolean {
  const wanted = name.toUpperCase();
  return layers.some((layer) => layer.name.toUpperCase() === wanted || layer.id.toUpperCase() === wanted);
}

function extensionOf(name: string): string {
  return name.trim().toLowerCase().split(".").pop() ?? "";
}

function baseNameOf(name: string): string {
  return name.trim().toLowerCase().replace(/\.[^.]+$/, "");
}

function messageOf(error: unknown): string {
  if (isGeoError(error)) return error.message;
  return error instanceof Error ? error.message : String(error);
}

export { GEO_LOCAL_ORIGIN_STEP_M };
