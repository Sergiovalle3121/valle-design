/**
 * GEOGRAPHICLOCATION: georreferenciar el dibujo (Ola G, 2026-09-02).
 *
 * Medido antes (`distancia-autocad-completo-20260901.md`, §4 3º MAP 3D):
 * `lib/geo` sabía leer shapefiles, datums y zonas UTM, y ningún dibujo sabía
 * dónde estaba: la fila `toolset-map3d.georreferencia` de la rúbrica decía
 * «todavía no».
 *
 * Se precisa un punto del dibujo y se dice qué coordenada del mundo es —el
 * este y el norte UTM en metros, o con `Geográfica` la latitud y la longitud
 * en grados— en la zona y el datum elegidos (`Zona` 11 a 16, las de México;
 * `Datum` WGS84, ITRF92, ITRF2008 o ITRF2020). La orden emite UN lote: la
 * capa GEO si falta, el marcador anterior fuera y el nuevo dentro
 * (`georeference.ts`: un POINT con la receta en metadatos, que es lo que el
 * formato ya tiene). `Informe` dice cómo está georreferenciado el dibujo sin
 * tocarlo. ID informa desde entonces el este/norte y la latitud/longitud de
 * cada punto.
 *
 * ## Lo que NO hace, dicho aquí
 *
 *   - Ni giro de la malla (convergencia de meridianos) ni escala de la
 *     proyección: el dibujo se supone alineado con el norte de cuadrícula y a
 *     escala 1, que es como se dibuja un predio a partir de un levantamiento
 *     UTM. El factor de escala UTM (0,9996) queda dentro de la proyección, no
 *     del dibujo.
 *   - Sólo el hemisferio norte y las zonas 11N a 16N: es lo que `lib/geo`
 *     verifica, y una cuenta sin verificar no vale más que no tenerla.
 *   - Sin mapa de fondo ni imágenes en línea: es el marcador, no el plano
 *     de la ciudad.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import { GEO_CRS_WGS84, GEO_MEXICO_UTM_ZONES, geoUtmCrs, geodeticToUtm, type GeoCrs, type GeoDatumId } from "../../../geo/crs";
import {
  CAD_GEO_LAYER,
  cadFormatGeoreferenced,
  cadFormatLatLon,
  cadGeoreferenceGeographic,
  cadGeoreferenceMarker,
  cadGeoreferenceMarkerIds,
  cadGeoreferenceOf,
} from "../../georeference";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const ZONE = { keyword: "Zona", shortcut: "Z" } as const;
const DATUM = { keyword: "Datum", shortcut: "D" } as const;
const GEOGRAPHIC = { keyword: "Geográfica", shortcut: "G" } as const;
const REPORT = { keyword: "Informe", shortcut: "I" } as const;
const DATUMS: readonly { keyword: GeoDatumId; shortcut: string }[] = [
  { keyword: "WGS84", shortcut: "W" },
  { keyword: "ITRF92", shortcut: "9" },
  { keyword: "ITRF2008", shortcut: "8" },
  { keyword: "ITRF2020", shortcut: "2" },
];

interface GeoState {
  zone: number;
  datum: GeoDatumId;
  geographic: boolean;
  anchor: CadPoint2 | null;
  first: number | null;
  pending: "none" | "zone" | "datum";
}

const EMPTY: GeoState = { zone: 14, datum: "WGS84", geographic: false, anchor: null, first: null, pending: "none" };

function message<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function crsOf(state: GeoState): GeoCrs {
  return state.geographic ? { ...GEO_CRS_WGS84 } : geoUtmCrs(state.zone, state.datum);
}

function ask(state: GeoState): CadCommandStep<GeoState> {
  if (state.pending === "zone")
    return { state, prompt: { message: `Precise la zona UTM (${GEO_MEXICO_UTM_ZONES[0]} a ${GEO_MEXICO_UTM_ZONES[GEO_MEXICO_UTM_ZONES.length - 1]})`, options: [], defaultValue: String(state.zone) }, accepts: CAD_ACCEPT_DISTANCE };
  if (state.pending === "datum")
    return { state, prompt: { message: "Indique el datum", options: [...DATUMS], defaultOption: state.datum }, accepts: CAD_ACCEPT_KEYWORD };
  const recipe = state.geographic ? "WGS 84 geográfico (latitud y longitud)" : `${state.datum} / UTM zona ${state.zone}N`;
  if (!state.anchor)
    return {
      state,
      prompt: { message: `${recipe}. Precise el punto del dibujo que va a georreferenciar`, options: [ZONE, DATUM, GEOGRAPHIC, REPORT] },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  if (state.first === null)
    return { state, prompt: { message: state.geographic ? "Precise la latitud de ese punto en grados (negativa al sur)" : "Precise el Este UTM de ese punto en metros", options: [] }, accepts: CAD_ACCEPT_DISTANCE };
  return { state, prompt: { message: state.geographic ? "Precise la longitud en grados (negativa al oeste)" : "Precise el Norte UTM en metros", options: [] }, accepts: CAD_ACCEPT_DISTANCE };
}

/** El lote que georreferencia: capa si falta, marcador viejo fuera, marcador nuevo dentro. */
export function cadGeoreferenceCommands(anchor: CadPoint2, crs: GeoCrs, east: number, north: number, context: CadCommandContext): CadEntityCommand[] {
  const commands: CadEntityCommand[] = [];
  const layers = context.layers?.();
  if (layers && !layers.some((layer) => layer.name.toUpperCase() === CAD_GEO_LAYER || layer.id.toUpperCase() === CAD_GEO_LAYER))
    commands.push({ type: "layer", op: "upsert", layer: { id: CAD_GEO_LAYER, name: CAD_GEO_LAYER, color: "#22c55e", visible: true, locked: false } });
  const view = context.document?.();
  if (view) for (const id of cadGeoreferenceMarkerIds(view)) commands.push({ type: "delete", entityId: id });
  commands.push({ type: "insert", entity: cadGeoreferenceMarker(context.newEntityId(), anchor, crs, east, north) as CadNativeEntity });
  return commands;
}

function finish(state: GeoState, second: number, context: CadCommandContext): CadCommandStep<GeoState> {
  const anchor = state.anchor!;
  let crs: GeoCrs;
  let east: number;
  let north: number;
  try {
    if (state.geographic) {
      // La latitud y la longitud se guardan como este/norte de la zona que
      // toca: el dibujo es métrico, y un grado no es una unidad de dibujo.
      const latitudeDeg = state.first!;
      const longitudeDeg = second;
      if (Math.abs(latitudeDeg) > 90 || Math.abs(longitudeDeg) > 180) return message(state, "GEOGRAPHICLOCATION: la latitud va de −90 a 90 y la longitud de −180 a 180.");
      const zone = Math.floor((longitudeDeg + 180) / 6) + 1;
      crs = geoUtmCrs(zone, state.datum);
      const projected = geodeticToUtm(longitudeDeg, latitudeDeg, crs);
      east = projected.easting;
      north = projected.northing;
    } else {
      crs = crsOf(state);
      east = state.first!;
      north = second;
    }
  } catch (error) {
    return message(state, `GEOGRAPHICLOCATION: ${error instanceof Error ? error.message : String(error)}`);
  }
  const commands = cadGeoreferenceCommands(anchor, crs, east, north, context);
  const preview = cadGeoreferenceOf({ entities: commands.flatMap((command) => (command.type === "insert" ? [command.entity] : [])), meta: { unit: context.unit } });
  const latLon = preview ? cadGeoreferenceGeographic(preview, anchor, context.unit) : null;
  const where = latLon ? `; ${cadFormatLatLon(latLon.latitudeDeg, latLon.longitudeDeg)}` : "";
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands,
      label: "GEOGRAPHICLOCATION",
      notice: `GEOGRAPHICLOCATION: el punto (${Math.round(anchor.x)}, ${Math.round(anchor.y)}) es E ${east.toFixed(2)} N ${north.toFixed(2)} en ${crs.name} (${crs.id})${where}. El marcador está en la capa ${CAD_GEO_LAYER}.`,
    },
  };
}

function report(state: GeoState, context: CadCommandContext): CadCommandStep<GeoState> {
  const view = context.document?.();
  const georeference = view ? cadGeoreferenceOf(view) : null;
  if (!georeference) return message(state, "El dibujo no está georreferenciado: no hay marcador en la capa GEO. Precise un punto y su coordenada para georreferenciarlo.");
  return message(state, `El dibujo está georreferenciado: el punto (${Math.round(georeference.anchor.x)}, ${Math.round(georeference.anchor.y)}) es ${cadFormatGeoreferenced(georeference, georeference.anchor, context.unit)}.`);
}

const geoLocationCommand: CadCommandDescriptor<GeoState> = {
  name: "GEOGRAPHICLOCATION",
  aliases: ["GEO", "GEOLOCATION", "MAPCSASSIGN", "GEORREFERENCIAR"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => ask(EMPTY),
  step: (state, input, context) => {
    if (input.kind === "cancel") return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (state.pending === "zone") {
      if (input.kind === "enter") return ask({ ...state, pending: "none" });
      if (input.kind !== "distance") return ask(state);
      const zone = Math.round(input.value);
      if (!GEO_MEXICO_UTM_ZONES.includes(zone)) return message(state, `GEOGRAPHICLOCATION: la zona ${input.value} no es de las verificadas (${GEO_MEXICO_UTM_ZONES.join(", ")}), y una reproyección sin comprobar no vale más que no tenerla.`);
      return ask({ ...state, zone, pending: "none" });
    }
    if (state.pending === "datum") {
      if (input.kind === "enter") return ask({ ...state, pending: "none" });
      if (input.kind !== "keyword") return ask(state);
      const datum = DATUMS.find((candidate) => candidate.keyword === input.keyword);
      return ask(datum ? { ...state, datum: datum.keyword, pending: "none" } : state);
    }
    if (!state.anchor) {
      if (input.kind === "keyword") {
        if (input.keyword === ZONE.keyword) return ask({ ...state, pending: "zone" });
        if (input.keyword === DATUM.keyword) return ask({ ...state, pending: "datum" });
        if (input.keyword === GEOGRAPHIC.keyword) return ask({ ...state, geographic: true });
        if (input.keyword === REPORT.keyword) return report(state, context);
        return ask(state);
      }
      if (input.kind === "enter") return report(state, context);
      if (input.kind !== "point") return ask(state);
      return ask({ ...state, anchor: input.point });
    }
    if (input.kind !== "distance") return input.kind === "enter" ? message(state, "GEOGRAPHICLOCATION necesita la coordenada del punto.") : ask(state);
    if (state.first === null) return ask({ ...state, first: input.value });
    return finish(state, input.value, context);
  },
};

export const CAD_GEO_LOCATION_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(geoLocationCommand)];
