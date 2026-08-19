/**
 * Del levantamiento al dibujo: shapefile → entidades canónicas.
 *
 * ## El caso que esto resuelve
 *
 * Un arquitecto tiene el proyecto empezado y le llega el shapefile del predio.
 * Quiere el polígono del terreno DENTRO de su plano de conjunto, a la misma
 * escala que los muros que ya dibujó, para poder acotar el retranqueo contra el
 * lindero de verdad. Ese es el uso real del GIS en un despacho mexicano: no es
 * cartografía, es la línea que dice hasta dónde se puede construir.
 *
 * ## Las dos decisiones que hacen que el predio SIRVA
 *
 * 1. **Se traslada a un origen local.** Las coordenadas UTM de Guadalajara son
 *    el este 660 000 y el norte 2 140 000. Metidas tal cual, la geometría queda
 *    a 2 140 kilómetros del origen del dibujo, y a esa distancia el `float` de
 *    32 bits que llega a la tarjeta gráfica tiene un paso de unos 20 cm: los
 *    vértices del lindero saltan en pantalla al hacer zoom. El traslado es a un
 *    kilómetro redondo, se DECLARA en el manifiesto y es reversible al bit.
 * 2. **Se convierte a las unidades del dibujo.** El shapefile viene en metros y
 *    el documento canónico se crea en milímetros, como el que sale de importar
 *    un DXF. Sin la conversión, un predio de 40 m mediría 40 unidades junto a un
 *    muro de 3 000, y el conjunto sería ilegible sin que nada avisara.
 *
 * ## Lo que NO hace
 *
 * No reproyecta. Si el archivo viene en la zona 14N y el dibujo estaba en la
 * 15N, este módulo no lo arregla: coloca lo que hay y declara en qué sistema
 * está. Reproyectar en silencio al importar es la clase de amabilidad que mueve
 * un lindero dos metros sin que nadie lo pida.
 *
 * No lee nubes de puntos hacia el documento. Un LAS de diez millones de puntos
 * no son diez millones de entidades canónicas: eso es un subsistema de render
 * propio, no una importación, y prometerlo aquí sería prometer lo que no hay.
 */
import type { CadEntity, CadLayerDef, CadLossManifestEntry } from "./cad-document";
import type { GeoDbfTable, GeoPlacement, GeoShape, GeoShapefile } from "../geo";
import { geoPlace, geoPlacementFor } from "../geo";

/** Nombre de la capa cuando el archivo no sugiere ninguno. */
export const CAD_GEO_DEFAULT_LAYER = "TOPOGRAFIA";

export interface CadGeoImportResult {
  entities: CadEntity[];
  layers: CadLayerDef[];
  placement: GeoPlacement;
  /** Qué se trasladó, qué se escaló y qué NO se reproyectó. Todo declarado. */
  losses: CadLossManifestEntry[];
  /** Cuántos registros del archivo NO produjeron entidad, y por qué. */
  skipped: number;
}

export interface CadGeoImportOptions {
  /** Prefijo de los identificadores. Igual que en la importación DXF. */
  idPrefix?: string;
  /** Nombre de la capa donde entra todo el conjunto. */
  layer?: string;
  /** Unidad del documento destino. El shapefile siempre viene en metros. */
  unit?: "mm" | "cm" | "m";
  /** Tabla de atributos, para rotular con la clave catastral. */
  attributes?: GeoDbfTable;
}

/**
 * Convierte la geometría de un shapefile en entidades canónicas colocadas.
 *
 * Cada anillo de un polígono entra como una POLILÍNEA CERRADA independiente.
 * Podría parecer mejor fabricar un contorno con huecos, pero el documento
 * canónico no tiene esa entidad y fingirla uniendo los anillos con un puente
 * inventaría un lindero que no existe. Dos polilíneas dicen la verdad: hay un
 * contorno y hay un patio, y el que mida sabrá restar.
 */
export function shapefileToCadEntities(
  shapefile: GeoShapefile,
  options: CadGeoImportOptions = {},
): CadGeoImportResult {
  const prefix = options.idPrefix ?? "geo";
  const layerName = sanitizeLayerName(options.layer) ?? CAD_GEO_DEFAULT_LAYER;
  const unit = options.unit ?? "mm";
  const placement = geoPlacementFor(shapefile.measuredBounds, { unit });

  const entities: CadEntity[] = [];
  let skipped = 0;
  let sequence = 0;
  const nextId = () => `${prefix}-${(sequence += 1)}`;

  for (const shape of shapefile.shapes) {
    if (shape.kind === "null" || shape.vertices.length === 0) {
      skipped += 1;
      continue;
    }
    if (shape.kind === "point" || shape.kind === "multipoint") {
      for (const vertex of shape.vertices) {
        const placed = geoPlace(vertex.x, vertex.y, placement);
        entities.push({
          id: nextId(),
          type: "point",
          position: { x: placed.x, y: placed.y, z: elevation(vertex.z, placement) },
          layer: layerName,
        });
      }
      continue;
    }
    for (const ring of ringsOf(shape)) {
      // Un anillo de polígono llega con el primer vértice repetido al final: es
      // como el formato expresa «cerrado». La polilínea canónica lo expresa con
      // la bandera, así que el vértice repetido SOBRA — dejarlo metería un tramo
      // de longitud cero que ensucia OSNAP y el cálculo de perímetro.
      const closed = shape.kind === "polygon";
      const vertices = (closed ? ring.slice(0, -1) : ring).map((vertex) => {
        const placed = geoPlace(vertex.x, vertex.y, placement);
        return { x: placed.x, y: placed.y, z: elevation(vertex.z, placement) };
      });
      if (vertices.length < 2) {
        skipped += 1;
        continue;
      }
      entities.push({ id: nextId(), type: "polyline", vertices, closed, layer: layerName });
    }
  }

  return {
    entities,
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: layerName, name: layerName, color: "#8bc34a", visible: true, locked: false },
    ],
    placement,
    losses: declareTransformations(shapefile, placement, unit, skipped, options.attributes),
    skipped,
  };
}

/**
 * El manifiesto: todo lo que se le hizo a la geometría, dicho con números.
 *
 * Es la parte que un competidor no escribe. Trasladar y escalar son operaciones
 * legítimas y necesarias, pero un usuario que no sabe que ocurrieron no puede
 * devolver su medición al mundo real — y en un plano de linderos eso es la
 * diferencia entre un documento defendible y un dibujo bonito.
 */
function declareTransformations(
  shapefile: GeoShapefile,
  placement: GeoPlacement,
  unit: string,
  skipped: number,
  attributes: GeoDbfTable | undefined,
): CadLossManifestEntry[] {
  const losses: CadLossManifestEntry[] = [
    {
      code: "geo_local_origin",
      sourceType: "shapefile",
      severity: "info",
      detail:
        `El conjunto se trasladó al origen local (${placement.originX}, ${placement.originY}) del ` +
        "sistema del archivo. Para volver a coordenadas del terreno, suma esos dos números a " +
        `cualquier punto del dibujo dividido entre ${placement.unitScale}. El traslado es exacto: ` +
        "no pierde ninguna cifra.",
    },
    {
      code: "geo_unit_scale",
      sourceType: "shapefile",
      severity: "info",
      detail:
        `Un metro del terreno son ${placement.unitScale} unidad(es) de dibujo (documento en ${unit}). ` +
        "Es la misma escala que la del resto del proyecto, para que el predio y los muros se puedan " +
        "acotar entre sí.",
    },
  ];

  losses.push(
    shapefile.crs
      ? {
          code: "geo_crs_declared",
          sourceType: "shapefile",
          severity: "info",
          detail:
            `Las coordenadas están en ${shapefile.crs.name} (${shapefile.crs.id}) y NO se han ` +
            "reproyectado. Si el resto del proyecto está en otro sistema, reproyecta antes de acotar " +
            "contra el lindero.",
        }
      : {
          code: "geo_crs_missing",
          sourceType: "shapefile",
          severity: "warning",
          detail:
            "El conjunto llegó sin archivo .prj: no se sabe en qué sistema de referencia están sus " +
            "coordenadas. La geometría es correcta entre sí, pero no se puede georreferenciar ni " +
            "combinar con otro levantamiento hasta saberlo. Pide el .prj a quien te mandó el archivo.",
        },
  );

  if (!shapefile.indexVerified)
    losses.push({
      code: "geo_index_unverified",
      sourceType: "shapefile",
      severity: "info",
      detail:
        "No se aportó el índice .shx, así que la lectura no se pudo contrastar con él. El .shp se " +
        "validó consigo mismo, que es suficiente, pero con el .shx la comprobación es doble.",
    });

  if (attributes && !attributes.encodingDeclared)
    losses.push({
      code: "geo_encoding_assumed",
      sourceType: "dbf",
      severity: "warning",
      detail:
        `La tabla de atributos no declara codificación (falta el .cpg): se leyó como ` +
        `${attributes.encoding}. Si los nombres con acentos o eñes salen mal, ésa es la causa; la ` +
        "geometría no se ve afectada.",
    });

  if (skipped > 0)
    losses.push({
      code: "geo_empty_records",
      sourceType: "shapefile",
      severity: "warning",
      detail:
        `${skipped} registro(s) del archivo no produjeron geometría (nulos o con vértices ` +
        "insuficientes) y no están en el dibujo.",
    });

  return losses;
}

/** Los anillos o tramos de una geometría, ya partidos por sus índices. */
function ringsOf(shape: GeoShape): Array<GeoShape["vertices"]> {
  if (shape.parts.length <= 1) return [shape.vertices];
  const rings: Array<GeoShape["vertices"]> = [];
  for (let index = 0; index < shape.parts.length; index += 1) {
    const from = shape.parts[index];
    const to = index + 1 < shape.parts.length ? shape.parts[index + 1] : shape.vertices.length;
    rings.push(shape.vertices.slice(from, to));
  }
  return rings;
}

/**
 * La cota, escalada como las demás coordenadas pero SIN trasladar.
 *
 * El origen local mueve el plano horizontal; la altura no se toca porque una
 * cota de 1 540 m sobre el nivel del mar es un dato que el arquitecto lee tal
 * cual, y restarle un origen la convertiría en un número sin significado. La
 * escala sí se aplica: si no, la altura y la planta estarían en unidades
 * distintas dentro de la misma entidad.
 */
function elevation(z: number | undefined, placement: GeoPlacement): number {
  return z === undefined ? 0 : z * placement.unitScale;
}

/**
 * Nombre de capa utilizable a partir del del archivo.
 *
 * El documento canónico usa el nombre como identificador, así que un nombre con
 * caracteres raros o vacío rompería la tabla de capas. Se limpia y, si no queda
 * nada, se devuelve `undefined` para que decida el valor por omisión.
 */
function sanitizeLayerName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const clean = name
    .replace(/\.[^.]+$/, "")
    .toUpperCase()
    .replace(/[^A-ZÁÉÍÓÚÑ0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 31);
  return clean.length > 0 ? clean : undefined;
}
