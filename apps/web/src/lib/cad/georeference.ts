/**
 * LA GEORREFERENCIA DEL DIBUJO (Ola G, 2026-09-02).
 *
 * Un dibujo georreferenciado sabe DÓNDE está en el mundo: qué sistema de
 * coordenadas (EPSG) y qué este/norte corresponde a un punto suyo. Con eso,
 * ID puede decir la coordenada UTM y la latitud/longitud de cualquier punto,
 * y MAPIMPORT puede meter un predio de un shapefile en su sitio exacto en
 * vez de en un origen local nuevo.
 *
 * ## Dónde se guarda, y por qué así
 *
 * El formato del documento no tiene tabla de georreferencia, y añadirla es
 * tocar el formato persistido: decisión del titular, no tomada. Lo que el
 * formato SÍ tiene es entidades con `context.metadata`. Así que la
 * georreferencia es un MARCADOR: un POINT en la capa GEO cuyos metadatos
 * dicen el sistema y el este/norte de su posición — lo mismo que hace
 * AutoCAD con su marcador geográfico, que se ve en el plano y se mueve con
 * él. Se lee buscándolo; si hay más de uno manda el primero y se dice.
 *
 * Las cuentas —UTM ↔ geográficas, datums, zonas 11N a 16N— son las de
 * `lib/geo/crs.ts`, que tiene su spec contra cuadraturas; aquí sólo se
 * traduce entre unidades del dibujo y metros.
 */
import type { CadEntity, CadPoint2, CadPoint3 } from "./cad-document";
import type { CadPointEntity } from "./cad-entities-v4";
import type { GeoPlacement } from "../geo";
import { resolveGeoCrs, utmToGeodetic, type GeoCrs } from "../geo/crs";
import { cadMillimetresPerUnit } from "./engine/commands/architecture-support";

/** Capa del marcador; se da de alta si falta. */
export const CAD_GEO_LAYER = "GEO";
/** `context.metadata.geo` del marcador. */
export const CAD_GEO_MARKER = "marker";

export interface CadGeoreference {
  crs: GeoCrs;
  /** El punto del dibujo que corresponde a `east`/`north` (o lon/lat en un sistema geográfico). */
  anchor: CadPoint2;
  east: number;
  north: number;
  /** Id del marcador que la sostiene. */
  markerId: string;
}

type View = { entities: readonly CadEntity[]; meta?: { unit?: string } };

/** La georreferencia del documento, o `null` si no hay marcador válido. */
export function cadGeoreferenceOf(view: View): CadGeoreference | null {
  for (const entity of view.entities) {
    if (entity.type !== "point") continue;
    const metadata = entity.context?.metadata;
    if (!metadata || metadata.geo !== CAD_GEO_MARKER) continue;
    const crsId = typeof metadata.crs === "string" ? metadata.crs : "";
    const east = typeof metadata.east === "number" ? metadata.east : NaN;
    const north = typeof metadata.north === "number" ? metadata.north : NaN;
    if (!crsId || !Number.isFinite(east) || !Number.isFinite(north)) continue;
    let crs: GeoCrs;
    try {
      crs = resolveGeoCrs(crsId);
    } catch {
      continue;
    }
    return { crs, anchor: { x: entity.position.x, y: entity.position.y }, east, north, markerId: entity.id };
  }
  return null;
}

/** Los marcadores presentes (para reemplazarlos al georreferenciar de nuevo). */
export function cadGeoreferenceMarkerIds(view: View): string[] {
  return view.entities
    .filter((entity) => entity.type === "point" && entity.context?.metadata?.geo === CAD_GEO_MARKER)
    .map((entity) => entity.id);
}

/** El marcador: un POINT con aspa y círculo (PDMODE 34) y la receta en metadatos. */
export function cadGeoreferenceMarker(id: string, anchor: CadPoint2 | CadPoint3, crs: GeoCrs, east: number, north: number): CadPointEntity {
  return {
    id,
    type: "point",
    position: { x: anchor.x, y: anchor.y, z: 0 },
    style: 34,
    layer: CAD_GEO_LAYER,
    context: { metadata: { geo: CAD_GEO_MARKER, crs: crs.id, east, north } },
  };
}

/** Unidades del dibujo por metro. */
export function cadUnitsPerMetre(unit: string | undefined): number {
  return 1000 / cadMillimetresPerUnit(unit);
}

/**
 * La colocación (origen local y escala) que `lib/geo` usa para poner un
 * conjunto en el dibujo, derivada de la georreferencia: el origen del
 * archivo que cae en el punto (0, 0) del dibujo.
 */
export function cadGeoreferencePlacement(georeference: CadGeoreference, unit: string | undefined): GeoPlacement {
  const unitScale = georeference.crs.kind === "geographic" ? 1 : cadUnitsPerMetre(unit);
  return {
    originX: georeference.east - georeference.anchor.x / unitScale,
    originY: georeference.north - georeference.anchor.y / unitScale,
    unitScale,
    unit: unit === "m" || unit === "cm" ? unit : "mm",
  };
}

/** Un punto del dibujo en el sistema del dibujo (este/norte en m, o lon/lat en grados). */
export function cadGeoreferenceWorld(georeference: CadGeoreference, point: CadPoint2, unit: string | undefined): { x: number; y: number } {
  const placement = cadGeoreferencePlacement(georeference, unit);
  return { x: point.x / placement.unitScale + placement.originX, y: point.y / placement.unitScale + placement.originY };
}

/** Latitud y longitud de un punto del dibujo, en grados. */
export function cadGeoreferenceGeographic(georeference: CadGeoreference, point: CadPoint2, unit: string | undefined): { latitudeDeg: number; longitudeDeg: number } {
  const world = cadGeoreferenceWorld(georeference, point, unit);
  if (georeference.crs.kind === "geographic") return { latitudeDeg: world.y, longitudeDeg: world.x };
  return utmToGeodetic(world.x, world.y, georeference.crs);
}

/** «20.6714° N, 103.3500° O», como se lee en un plano. */
export function cadFormatLatLon(latitudeDeg: number, longitudeDeg: number): string {
  const lat = `${Math.abs(latitudeDeg).toFixed(4)}° ${latitudeDeg >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(longitudeDeg).toFixed(4)}° ${longitudeDeg >= 0 ? "E" : "O"}`;
  return `${lat}, ${lon}`;
}

/** «E 660,000.00 N 2,140,000.00 (WGS 84 / UTM zona 14N, EPSG:32614)». */
export function cadFormatGeoreferenced(georeference: CadGeoreference, point: CadPoint2, unit: string | undefined): string {
  const world = cadGeoreferenceWorld(georeference, point, unit);
  const metres = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const where =
    georeference.crs.kind === "geographic"
      ? cadFormatLatLon(world.y, world.x)
      : `E ${metres(world.x)} N ${metres(world.y)} · ${cadFormatLatLon(...latLon(cadGeoreferenceGeographic(georeference, point, unit)))}`;
  return `${where} (${georeference.crs.name}, ${georeference.crs.id})`;
}

function latLon(geographic: { latitudeDeg: number; longitudeDeg: number }): [number, number] {
  return [geographic.latitudeDeg, geographic.longitudeDeg];
}
