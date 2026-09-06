/**
 * ORÁCULO D contra `toolset-map3d.georreferencia`: el lector de PRODUCCIÓN
 * (`readShapefile`) abre un shapefile PÚBLICO de terceros —Natural Earth,
 * dominio público— y las coordenadas que reproyecta `crs.ts` se contrastan
 * contra PROJ (envuelto por `pyproj`).
 *
 * ## Por qué hacía falta esto, y por qué no bastaba con `geo.crs`
 *
 * `crs-pyproj.spec.ts` ya prueba que `crs.ts` reproyecta como PROJ sobre una
 * malla sintética. Lo que le falta a la fila `toolset-map3d` es más concreto:
 * que el CAMINO COMPLETO del toolset —leer un archivo ajeno de verdad,
 * reconocerlo por sus bytes, extraer sus vértices, reproyectarlos— funcione
 * sobre material que **este proyecto no escribió**. `docs/cad/evidence/independencia-por-fila.json`
 * lo dice así: «Importar un shapefile público real y comprobar las
 * coordenadas transformadas contra PROJ. Comparte oráculo con la fila `geo`,
 * así que el mismo trabajo sirve para las dos.»
 *
 * Natural Earth es dominio público (`docs/cad/corpus/terceros-gis-manifest.json`
 * y `docs/cad/corpus/licencias/natural-earth-vector-PUBLIC-DOMAIN.md`), así que
 * es material de terceros admisible con derechos limpios — no un escaneo que la
 * propia suite generó, que es justo la trampa que este frente ya se comió una
 * vez con `toolset-raster.vectorizacion` (ver PROMPT_MAESTRO_FABLE.md §Ola 0,
 * T-03).
 *
 * ## Qué se ejercita, de verdad, del producto
 *
 * 1. `readShapefile()` de `apps/web/src/lib/geo/shapefile.ts` — el mismo lector
 *    que usa `MAPIMPORT` (`engine/commands/map-import.ts` → `geo-import-plan.ts`)
 *    — sobre los bytes REALES de `ne_110m_populated_places_simple.shp/.shx`.
 * 2. `parseGeoCrsWkt()` de `crs-prj.ts` sobre el `.prj` real del archivo, que
 *    declara WGS84 geográfico: es lo que decide que (x, y) es (longitud,
 *    latitud) y no ya una proyección.
 * 3. `reprojectGeoPoint()` de `crs.ts`, de WGS84 geográfico a la zona UTM que
 *    le toca a cada punto — la misma función que usa el toolset para colocar
 *    un shapefile en el dibujo.
 *
 * Ninguno de los tres es un test unitario con datos inventados: los tres
 * bytes de entrada son un archivo descargado, con licencia e independiente.
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { reprojectGeoPoint, type GeoCrs } from "./crs";
import { geoUtmCrs } from "./crs";
import { readShapefile } from "./shapefile";

const RAIZ = path.resolve(process.cwd(), "../..");
const CORPUS_DIR = path.join(RAIZ, "docs/cad/corpus/terceros-gis/natural-earth");
const MANIFEST = path.join(RAIZ, "docs/cad/corpus/terceros-gis-manifest.json");
const LICENCIA = path.join(RAIZ, "docs/cad/corpus/licencias/natural-earth-vector-PUBLIC-DOMAIN.md");
const ARTEFACTO_PYPROJ = path.join(RAIZ, "docs/cad/corpus/oraculos/pyproj-3.7.2.json");

let comprobaciones = 0;
const ok = (condicion: boolean, mensaje: string) => {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
};

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

interface ManifestArchivo {
  id: string;
  ruta: string;
  sha256: string;
  bytes: number;
}
interface Manifest {
  derechos: { dictamenAutomatico: string; firmaHumana: { firmadoPor: string } };
  fuentes: Array<{ id: string; licencia: string; licenciaArchivo: string; licenciaSha256: string }>;
  archivos: ManifestArchivo[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 1 · La puerta de derechos: bytes íntegros, licencia identificada
// ─────────────────────────────────────────────────────────────────────────────

ok(fs.existsSync(MANIFEST), "falta terceros-gis-manifest.json");
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as Manifest;

ok(manifest.fuentes.length === 1 && manifest.fuentes[0].licencia.includes("Dominio público"), "la fuente no declara dominio público");
ok(fs.existsSync(LICENCIA), "falta el texto de la licencia de Natural Earth descargado");
const licenciaBytes = fs.readFileSync(LICENCIA);
ok(
  sha256(licenciaBytes) === manifest.fuentes[0].licenciaSha256,
  "el sha256 del texto de licencia en el árbol no coincide con el que declara el manifiesto",
);
ok(
  licenciaBytes.toString("utf8").includes("public domain"),
  "el texto guardado no dice «public domain»: puede haberse sustituido por otra cosa",
);

for (const archivo of manifest.archivos) {
  const ruta = path.join(RAIZ, "docs/cad/corpus", archivo.ruta);
  ok(fs.existsSync(ruta), `el manifiesto declara ${archivo.ruta} y no está en el árbol`);
  const bytes = fs.readFileSync(ruta);
  ok(bytes.length === archivo.bytes, `${archivo.id}: el manifiesto declara ${archivo.bytes} bytes y el archivo tiene ${bytes.length}`);
  ok(sha256(bytes) === archivo.sha256, `${archivo.id}: el sha256 del archivo no coincide con el del manifiesto`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 2 · El lector de PRODUCCIÓN abre el shapefile ajeno
// ─────────────────────────────────────────────────────────────────────────────

const shpBytes = fs.readFileSync(path.join(CORPUS_DIR, "ne_110m_populated_places_simple.shp"));
const shxBytes = fs.readFileSync(path.join(CORPUS_DIR, "ne_110m_populated_places_simple.shx"));
const prjText = fs.readFileSync(path.join(CORPUS_DIR, "ne_110m_populated_places_simple.prj"), "utf8");

const shapefile = readShapefile({
  shp: shpBytes,
  shx: shxBytes,
  prj: prjText,
  name: "ne_110m_populated_places_simple.shp",
});

ok(shapefile.kind === "point", `Natural Earth declara lugares poblados como puntos; el lector dice «${shapefile.kind}»`);
ok(shapefile.indexVerified, "el .shx no verificó: el lector de producción no confía en el índice ajeno sin comprobarlo");
ok(shapefile.shapes.length === 243, `el lector de producción cuenta ${shapefile.shapes.length} lugares; Natural Earth declara 243`);
ok(shapefile.crs !== undefined && shapefile.crs.kind === "geographic", "el .prj de Natural Earth es geográfico y el lector no lo reconoció así");
ok(shapefile.crs!.id === "EPSG:4326", `el .prj de Natural Earth es WGS84 y el lector resolvió «${shapefile.crs!.id}»`);

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 3 · Reproyección del producto contra PROJ, punto a punto
// ─────────────────────────────────────────────────────────────────────────────

interface CensoNaturalEarthPunto {
  numeroRegistro: number;
  lonDeg: number;
  latDeg: number;
  zone: number;
  easting: number;
  northing: number;
}
interface CensoPyproj {
  naturalEarth: { puntosEnRangoMexico: number; resultados: CensoNaturalEarthPunto[] };
}

ok(fs.existsSync(ARTEFACTO_PYPROJ), "falta el censo congelado de pyproj: corre censo-pyproj.py");
const censo = JSON.parse(fs.readFileSync(ARTEFACTO_PYPROJ, "utf8")) as CensoPyproj;
ok(censo.naturalEarth.resultados.length >= 10, "muy pocos puntos de referencia en el censo de pyproj");

/** 1 mm: el mismo margen que crs-pyproj.spec.ts usa contra el mismo oráculo. */
const TOLERANCIA_M = 1e-3;

const shapeByRecord = new Map(shapefile.shapes.map((shape) => [shape.recordNumber, shape]));
let comparados = 0;
let worstErrorM = 0;
for (const punto of censo.naturalEarth.resultados) {
  const shape = shapeByRecord.get(punto.numeroRegistro);
  ok(shape !== undefined, `el shapefile del árbol no trae el registro ${punto.numeroRegistro} que el censo de pyproj sí midió`);
  if (!shape) continue;
  ok(shape.vertices.length === 1, `el registro ${punto.numeroRegistro} debería ser un único punto`);
  const vertex = shape.vertices[0];
  ok(
    Math.abs(vertex.x - punto.lonDeg) < 1e-8 && Math.abs(vertex.y - punto.latDeg) < 1e-8,
    `registro ${punto.numeroRegistro}: el shapefile del árbol trae (${vertex.x}, ${vertex.y}) y el censo esperaba (${punto.lonDeg}, ${punto.latDeg}) — ¿cambiaron los bytes del corpus?`,
  );

  const destino = geoUtmCrs(punto.zone);
  const reproyectado = reprojectGeoPoint({ x: vertex.x, y: vertex.y }, shapefile.crs as GeoCrs, destino);
  const error = Math.hypot(reproyectado.x - punto.easting, reproyectado.y - punto.northing);
  worstErrorM = Math.max(worstErrorM, error);
  ok(
    error <= TOLERANCIA_M,
    `registro ${punto.numeroRegistro} (zona ${punto.zone}N): el toolset da (${reproyectado.x}, ${reproyectado.y}), ` +
      `PROJ dio (${punto.easting}, ${punto.northing}); ${error} m > ${TOLERANCIA_M} m`,
  );
  comparados += 1;
}
ok(comparados === censo.naturalEarth.puntosEnRangoMexico, "no se compararon todos los puntos que el censo de pyproj midió");

console.log(
  `shapefile-pyproj: ${comprobaciones} comprobaciones · shapefile ajeno de Natural Earth (243 lugares, dominio ` +
    `público) leído por readShapefile() de producción · ${comparados} puntos reproyectados por reprojectGeoPoint() ` +
    `contra PROJ (peor error ${worstErrorM.toExponential(2)} m)`,
);
