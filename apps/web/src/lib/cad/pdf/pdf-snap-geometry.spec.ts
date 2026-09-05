/**
 * Calcar de verdad: el cursor se engancha a la lámina, y en el sitio EXACTO.
 *
 * Todo pasa por el documento real: se adjunta un PDF vectorial del corpus con
 * `cadPdfAttachCommands`, se aplica el lote con `executeCadEntityCommandBatch`
 * —la única ruta de mutación— y se pregunta por la geometría enganchable del
 * documento resultante. Comprobar la extracción sin adjuntar probaría que
 * sabemos leer un PDF; lo que hay que saber es que lo que se ofrece al cursor
 * cae DONDE la lámina está puesta.
 *
 * Con anclas absolutas y aritmética escrita a mano, no con «es parecido». La
 * lámina del corpus es Carta (612 × 792 puntos) y su contenido está en
 * coordenadas conocidas: el rectángulo exterior arranca en (72, 72) puntos, que
 * son exactamente 25,4 mm —una pulgada— desde la esquina del papel. Ese número
 * se escribe aquí y se exige.
 *
 * Correr:  npx tsx src/lib/cad/pdf/pdf-snap-geometry.spec.ts
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument } from "../cad-document";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../entity-commands";
import { snap, type SnapScene } from "../snap-engine";
import { cadPdfCorpus } from "./pdf-corpus";
import { readCadPdfPageList } from "./pdf-import";
import {
  CAD_PDF_UNDERLAY_MM_PER_POINT,
  cadFindPdfUnderlay,
  cadPdfAttachCommands,
  cadPdfClipCommands,
  cadPdfClipRectangle,
  cadPdfScaleToDistanceCommands,
  cadPdfUnloadCommands,
  type CadPdfUnderlaySource,
} from "./pdf-underlay";
import {
  CAD_PDF_SNAP_ARC_TOLERANCE,
  cadPdfArcCenterOf,
  cadPdfPageToWorld,
  cadPdfSnapCandidateCount,
  cadPdfSnapGeometry,
  cadPdfSnapSceneAdd,
} from "./pdf-snap-geometry";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (actual: number, expected: number, tolerance: number, message: string) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: se esperaba ${expected} ± ${tolerance} y se midió ${actual}`,
  );
  checks += 1;
};

/** ¿Hay un candidato en este punto del dibujo? Con tolerancia declarada. */
const has = (
  points: ReadonlyArray<{ x: number; y: number }>,
  x: number,
  y: number,
  tolerance = 1e-6,
) => points.some((point) => Math.abs(point.x - x) <= tolerance && Math.abs(point.y - y) <= tolerance);

const emptyDocument = (): CadDocument =>
  migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [],
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
  });

const bytesOf = (id: string) => {
  const entry = cadPdfCorpus().find((file) => file.id === id);
  assert.ok(entry, `falta ${id} en el corpus`);
  return entry.bytes;
};

const sourceFrom = (id: string, fileName: string): CadPdfUnderlaySource => ({
  uri: `tenant-asset://levantamientos/${fileName}`,
  fileName,
  pages: readCadPdfPageList(bytesOf(id)),
  contentHash: "sha256:levantamiento",
});

const apply = (document: CadDocument, commands: CadEntityCommand[], label: string) =>
  executeCadEntityCommandBatch(document, commands, label).document;

type AttachInput = Omit<Parameters<typeof cadPdfAttachCommands>[1], "id" | "source">;

/** El sustrato del corpus, adjuntado donde se diga. */
function attached(corpusId: string, fileName: string, input: AttachInput = {}): CadDocument {
  const document = emptyDocument();
  return apply(
    document,
    cadPdfAttachCommands(document, {
      id: "levantamiento",
      source: sourceFrom(corpusId, fileName),
      ...input,
    }),
    "adjuntar sustrato",
  );
}

const MM_PER_POINT = CAD_PDF_UNDERLAY_MM_PER_POINT;

// ---------------------------------------------------------------------------
// 1. La lámina cae donde se dijo, y su contenido con ella
// ---------------------------------------------------------------------------
{
  const document = attached("cad-vector-compressed", "levantamiento.pdf", {
    insertion: { x: 1000, y: 500 },
  });
  const found = cadFindPdfUnderlay(document, "levantamiento.pdf");
  ok(!!found, "el sustrato quedó adjuntado y se encuentra por su nombre de archivo");
  const toWorld = cadPdfPageToWorld(found!.entity);

  // ANCLA 1: la esquina inferior izquierda del PAPEL cae en la inserción.
  const corner = toWorld({ x: 0, y: 0 });
  near(corner.x, 1000, 1e-9, "la esquina inferior izquierda de la lámina cae en la inserción (x)");
  near(corner.y, 500, 1e-9, "la esquina inferior izquierda de la lámina cae en la inserción (y)");

  // ANCLA 2: la esquina opuesta, a tamaño de papel Carta. 612 × 792 puntos son
  // 215,9 × 279,4 mm, que son 8,5 × 11 pulgadas. Aritmética, no aproximación.
  const opposite = toWorld({ x: 612, y: 792 });
  near(opposite.x, 1000 + 612 * MM_PER_POINT, 1e-9, "la lámina Carta mide 215,9 mm de ancho");
  near(opposite.y, 500 + 792 * MM_PER_POINT, 1e-9, "la lámina Carta mide 279,4 mm de alto");
  near(612 * MM_PER_POINT, 215.9, 1e-9, "612 puntos son 215,9 mm, escrito con todas sus letras");

  const geometry = cadPdfSnapGeometry(document, "levantamiento.pdf", bytesOf("cad-vector-compressed"));
  eq(geometry.status, "ok", "un sustrato vectorial cargado sí ofrece geometría");
  near(geometry.placement.unitsPerPoint, MM_PER_POINT, 1e-12, "a tamaño de papel, un punto es 25,4/72 mm");
  near(geometry.placement.rotation, 0, 1e-12, "sin giro pedido, el sustrato no gira");

  // ANCLA 3: el extremo conocido del contenido. El rectángulo exterior de la
  // lámina arranca en (72, 72) puntos = una pulgada = 25,4 mm del papel.
  const x0 = 1000 + 72 * MM_PER_POINT;
  const y0 = 500 + 72 * MM_PER_POINT;
  near(x0, 1025.4, 1e-9, "72 puntos son 25,4 mm exactos");
  ok(has(geometry.endpoints, x0, y0), `el extremo (72,72) pt del contenido cae en (${x0}, ${y0})`);
  ok(
    has(geometry.endpoints, 1000 + 288 * MM_PER_POINT, 500 + 216 * MM_PER_POINT),
    "la esquina opuesta del rectángulo, (288,216) pt, también cae donde dice la escala",
  );

  // El punto medio de la línea inferior: (180, 72) puntos.
  ok(
    has(geometry.midpoints, 1000 + 180 * MM_PER_POINT, y0),
    "el punto medio de la línea de abajo cae en (180,72) pt",
  );

  // El rótulo «PLANTA BAJA» arranca en (90, 240) puntos.
  ok(
    has(geometry.insertions, 1000 + 90 * MM_PER_POINT, 500 + 240 * MM_PER_POINT),
    "el origen del rótulo del plano entra como punto de inserción",
  );

  // Los doce vértices del contenido, contados a mano sobre el flujo del corpus:
  // 4 del rectángulo exterior, 4 del `re`, 2 cabos de la Bézier y 2 de la línea
  // azul. Ni uno más: los puntos repetidos entre trazos se funden.
  eq(geometry.endpoints.length, 12, "los doce vértices del contenido, sin repetir");
  eq(geometry.midpoints.length, 9, "nueve puntos medios: cuatro, cuatro y el de la línea azul");
  ok(geometry.segments.length > geometry.perpendicularSegments.length, "la Bézier aporta tramos que NO son aristas");
  eq(geometry.clippedAway, 0, "sin recorte, no se queda nada fuera");
  ok(geometry.note.includes("levantamiento.pdf"), `la nota dice de qué sustrato habla: ${geometry.note}`);

  // El `re` del corpus es un camino CERRADO, y tiene que llegar al motor
  // marcado como tal: es lo que le dice que el primer tramo y el último son
  // vecinos. Sin eso inventaría una intersección en esa esquina, que es
  // justamente el ruido que `pathId`/`ordinal` existen para evitar.
  const porCamino = new Map<string, typeof geometry.segments>();
  for (const segment of geometry.segments) {
    const lista = porCamino.get(segment.pathId!) ?? [];
    lista.push(segment);
    porCamino.set(segment.pathId!, lista);
  }
  const cerrados = [...porCamino.values()].filter((lista) => lista.every((s) => s.closed === true));
  eq(cerrados.length, 1, "un solo camino cerrado: el rectángulo `re` de la lámina");
  eq(cerrados[0].length, 4, "y son cuatro tramos, no cinco: el vértice repetido del cierre se funde");
  eq(
    cerrados[0].map((s) => s.ordinal).sort((a, b) => a! - b!),
    [0, 1, 2, 3],
    "con sus ordinales seguidos, que es lo que el motor lee para saber quién es vecino de quién",
  );
  ok(
    cerrados[0].every((s) => s.pathLength === 4),
    "y su longitud declarada es 4: el último tramo y el primero se tocan",
  );
}

// ---------------------------------------------------------------------------
// 2. Las cuerdas de una curva NO son aristas del dibujo
// ---------------------------------------------------------------------------
{
  const document = attached("cad-vector-uncompressed", "curvas.pdf");
  const geometry = cadPdfSnapGeometry(document, "curvas.pdf", bytesOf("cad-vector-uncompressed"));
  const toWorld = cadPdfPageToWorld(cadFindPdfUnderlay(document, "curvas.pdf")!.entity);

  // La Bézier del corpus va de (180,180) a (288,180) puntos. Sus dos cabos SÍ
  // son extremos; sus vértices intermedios son teselación y no lo son.
  const start = toWorld({ x: 180, y: 180 });
  const end = toWorld({ x: 288, y: 180 });
  ok(has(geometry.endpoints, start.x, start.y), "el arranque de la curva es un extremo");
  ok(has(geometry.endpoints, end.x, end.y), "el final de la curva es un extremo");

  // El punto más alto de esa Bézier, en t = ½, es (234, 234) puntos: está en la
  // curva, hay un tramo que pasa por ahí, y NO es ni extremo ni punto medio.
  const top = toWorld({ x: 234, y: 234 });
  ok(!has(geometry.endpoints, top.x, top.y, 0.2), "un punto de teselación no se ofrece como extremo");
  ok(!has(geometry.midpoints, top.x, top.y, 0.2), "una cuerda de la curva no aporta punto medio");
  ok(
    geometry.segments.some(
      (segment) =>
        Math.abs(segment.a.y - top.y) < 0.6 || Math.abs(segment.b.y - top.y) < 0.6,
    ),
    "pero la curva SÍ está en los tramos: se puede enganchar por cercanía y por intersección",
  );

  // Ningún tramo perpendicular pertenece a la curva: todos los pies de
  // perpendicular caen sobre rectas del dibujo.
  ok(
    geometry.perpendicularSegments.every(
      (segment) => Math.abs(segment.a.x - segment.b.x) < 1e-9 || Math.abs(segment.a.y - segment.b.y) < 1e-9,
    ),
    "los nueve tramos aptos para perpendicular son las rectas horizontales y verticales del plano",
  );
}

// ---------------------------------------------------------------------------
// 3. Escalar a medida conocida: los puntos se mueven CON la lámina
// ---------------------------------------------------------------------------
{
  const before = attached("cad-vector-compressed", "levantamiento.pdf", {
    insertion: { x: 1000, y: 500 },
  });
  const bytes = bytesOf("cad-vector-compressed");
  const geometryBefore = cadPdfSnapGeometry(before, "levantamiento.pdf", bytes);

  // Los dos extremos del rectángulo exterior, (72,72) y (288,72) puntos: 216
  // puntos = 76,2 mm sobre el papel. El arquitecto dice que en la realidad son
  // 5 000 mm, así que la lámina crece por 5000/76,2.
  const from = { x: 1000 + 72 * MM_PER_POINT, y: 500 + 72 * MM_PER_POINT };
  const to = { x: 1000 + 288 * MM_PER_POINT, y: 500 + 72 * MM_PER_POINT };
  ok(has(geometryBefore.endpoints, from.x, from.y), "antes de escalar, el extremo está a tamaño de papel");

  const scaled = cadPdfScaleToDistanceCommands(before, "levantamiento.pdf", from, to, 5000);
  near(scaled.measured, 216 * MM_PER_POINT, 1e-9, "lo designado medía 76,2 mm sobre el papel");
  near(scaled.factor, 5000 / (216 * MM_PER_POINT), 1e-9, "el factor es la medida real entre la medida");
  const after = apply(before, scaled.commands, "escalar a medida conocida");

  const geometryAfter = cadPdfSnapGeometry(after, "levantamiento.pdf", bytes);
  eq(geometryAfter.status, "ok", "el sustrato reescalado sigue ofreciendo geometría");
  near(
    geometryAfter.placement.unitsPerPoint,
    MM_PER_POINT * scaled.factor,
    1e-9,
    "la escala del sustrato es la de la lámina, no una copia que se quedó atrás",
  );

  // El punto designado se queda QUIETO: la homotecia tiene su centro ahí.
  ok(has(geometryAfter.endpoints, from.x, from.y, 1e-6), "el punto designado no se movió");
  // Y el otro está ahora a 5 000 mm exactos, que es lo que el arquitecto dijo.
  ok(
    has(geometryAfter.endpoints, from.x + 5000, from.y, 1e-6),
    "el otro extremo quedó a 5 000 mm: la lámina está a medida real",
  );
  // Y lo que NO se designó también se movió: la esquina superior del rectángulo
  // sube por el mismo factor. Si la geometría se hubiera quedado con la escala
  // vieja, este punto seguiría donde estaba.
  const cornerBefore = { x: 1000 + 288 * MM_PER_POINT, y: 500 + 216 * MM_PER_POINT };
  ok(has(geometryBefore.endpoints, cornerBefore.x, cornerBefore.y), "la esquina, antes, a tamaño de papel");
  ok(
    !has(geometryAfter.endpoints, cornerBefore.x, cornerBefore.y, 1),
    "la esquina YA NO está donde estaba: la geometría siguió a la lámina",
  );
  ok(
    has(geometryAfter.endpoints, from.x + 5000, from.y + (216 - 72) * MM_PER_POINT * scaled.factor, 1e-6),
    "la esquina está donde el nuevo factor dice, al milímetro",
  );

  eq(
    geometryBefore.endpoints.length,
    geometryAfter.endpoints.length,
    "escalar no inventa ni pierde extremos: son los mismos puntos en otro sitio",
  );
}

// ---------------------------------------------------------------------------
// 4. Giro: el sustrato girado engancha girado
// ---------------------------------------------------------------------------
{
  const document = attached("cad-vector-compressed", "girado.pdf", {
    insertion: { x: 0, y: 0 },
    rotation: Math.PI / 2,
  });
  const geometry = cadPdfSnapGeometry(document, "girado.pdf", bytesOf("cad-vector-compressed"));
  eq(geometry.status, "ok", "un sustrato girado sigue ofreciendo geometría");
  near(geometry.placement.rotation, Math.PI / 2, 1e-12, "el giro sale de los vectores de la entidad");
  // (72,72) puntos girado 90°: (−25,4 ; 25,4) mm.
  ok(
    has(geometry.endpoints, -72 * MM_PER_POINT, 72 * MM_PER_POINT, 1e-9),
    "el extremo (72,72) pt, con la lámina girada un cuarto de vuelta, cae en (−25,4 ; 25,4)",
  );
}

// ---------------------------------------------------------------------------
// 5. La página con `/Rotate 90` ya viene girada del archivo
// ---------------------------------------------------------------------------
{
  const document = attached("rotated-90", "apaisado.pdf");
  const geometry = cadPdfSnapGeometry(document, "apaisado.pdf", bytesOf("rotated-90"));
  eq(geometry.status, "ok", "la página girada por el propio PDF se lee igual");
  const found = cadFindPdfUnderlay(document, "apaisado.pdf")!;
  // El giro del papel ya está dentro del tamaño de la lámina: Carta girada mide
  // 792 × 612 puntos, y todos los candidatos caen dentro de ese rectángulo.
  near(found.entity.size.width, 792, 1e-6, "la lámina girada mide 792 puntos de ancho");
  near(found.entity.size.height, 612, 1e-6, "la lámina girada mide 612 puntos de alto");
  ok(
    geometry.endpoints.every(
      (point) =>
        point.x >= -1e-6 &&
        point.y >= -1e-6 &&
        point.x <= 792 * MM_PER_POINT + 1e-6 &&
        point.y <= 612 * MM_PER_POINT + 1e-6,
    ),
    "ningún candidato se sale del papel girado: el `/Rotate` se aplicó una sola vez",
  );
}

// ---------------------------------------------------------------------------
// 6. Un sustrato DESCARGADO no ofrece nada, y lo dice
// ---------------------------------------------------------------------------
{
  const document = attached("cad-vector-compressed", "levantamiento.pdf");
  const bytes = bytesOf("cad-vector-compressed");
  ok(cadPdfSnapCandidateCount(cadPdfSnapGeometry(document, "levantamiento.pdf", bytes)) > 0, "cargado ofrece");

  const unloaded = apply(
    document,
    cadPdfUnloadCommands(document, "levantamiento.pdf"),
    "descargar sustrato",
  );
  const geometry = cadPdfSnapGeometry(unloaded, "levantamiento.pdf", bytes);
  eq(geometry.status, "unloaded", "el sustrato descargado se declara descargado");
  eq(cadPdfSnapCandidateCount(geometry), 0, "y ofrece CERO candidatos");
  eq(geometry.segments.length, 0, "ni un tramo");
  eq(geometry.endpoints.length, 0, "ni un extremo");
  ok(geometry.note.includes("PDFRELOAD"), `la nota dice cómo volver: ${geometry.note}`);
}

// ---------------------------------------------------------------------------
// 7. Lo que el recorte deja fuera NO aparece
// ---------------------------------------------------------------------------
{
  const document = attached("cad-vector-compressed", "recortado.pdf", {
    insertion: { x: 0, y: 0 },
  });
  const bytes = bytesOf("cad-vector-compressed");
  const world = (x: number, y: number) => ({ x: x * MM_PER_POINT, y: y * MM_PER_POINT });

  const dentro = world(72, 72);
  const fuera = world(288, 216);
  const antes = cadPdfSnapGeometry(document, "recortado.pdf", bytes);
  ok(has(antes.endpoints, dentro.x, dentro.y), "sin recortar, la esquina de abajo está");
  ok(has(antes.endpoints, fuera.x, fuera.y), "sin recortar, la esquina de arriba también");

  // Se recorta a la mitad inferior izquierda de la zona dibujada: de (60,60) a
  // (200,200) puntos. (72,72) queda dentro; (288,216) queda fuera.
  const clipped = apply(
    document,
    cadPdfClipCommands(
      document,
      "recortado.pdf",
      cadPdfClipRectangle(world(60, 60), world(200, 200)),
    ),
    "recortar sustrato",
  );
  const geometry = cadPdfSnapGeometry(clipped, "recortado.pdf", bytes);
  eq(geometry.status, "ok", "con recorte sigue habiendo geometría: la de dentro");
  ok(has(geometry.endpoints, dentro.x, dentro.y), "el extremo de dentro del recorte SIGUE estando");
  ok(!has(geometry.endpoints, fuera.x, fuera.y, 0.5), "el extremo de FUERA del recorte no aparece");
  ok(geometry.clippedAway > 0, `el recorte dejó fuera ${geometry.clippedAway} punto(s), y se cuenta`);
  ok(
    geometry.endpoints.length < antes.endpoints.length,
    "recortar ofrece menos, nunca más",
  );
  // Y los TRAMOS también se cortan: ninguno se sale de la ventana del recorte.
  const limit = 200 * MM_PER_POINT + 1e-6;
  ok(
    geometry.segments.every(
      (segment) => segment.a.x <= limit && segment.b.x <= limit && segment.a.y <= limit && segment.b.y <= limit,
    ),
    "ni un tramo asoma por fuera del recorte: los que cruzaban salieron cortados",
  );

  // Un recorte que no toca nada dibujado deja el sustrato mudo, con su motivo.
  const blanco = attached("cad-vector-compressed", "vacio.pdf", { insertion: { x: 0, y: 0 } });
  const vacio = apply(
    blanco,
    cadPdfClipCommands(blanco, "vacio.pdf", cadPdfClipRectangle(world(400, 400), world(560, 560))),
    "recortar a una zona en blanco",
  );
  const mudo = cadPdfSnapGeometry(vacio, "vacio.pdf", bytes);
  eq(mudo.status, "clipped_out", "un recorte sobre papel en blanco no ofrece nada");
  eq(cadPdfSnapCandidateCount(mudo), 0, "cero candidatos");
  ok(mudo.note.includes("recorte"), `y la nota dice que la culpa es del recorte: ${mudo.note}`);
}

// ---------------------------------------------------------------------------
// 7-bis. Un recorte CÓNCAVO no deja pasar el tramo por la escotadura
// ---------------------------------------------------------------------------
{
  // El atajo «todos los vértices dentro, luego el camino entero está dentro» es
  // un teorema en un contorno convexo y una mentira en uno cóncavo. Aquí se
  // mide con el caso que lo distingue: una línea cuyos DOS extremos están
  // dentro de una «L» y que cruza la escotadura por el medio.
  const bytes = minimalPdf("q 1 w 0 0 0 RG\n10 90 m 190 10 l S\nQ\n");
  const base = apply(
    emptyDocument(),
    cadPdfAttachCommands(emptyDocument(), {
      id: "ele",
      source: { uri: "mem://ele.pdf", fileName: "ele.pdf", pages: readCadPdfPageList(bytes) },
      insertion: { x: 0, y: 0 },
    }),
    "adjuntar la línea",
  );
  const world = (x: number, y: number) => ({ x: x * MM_PER_POINT, y: y * MM_PER_POINT });
  const antes = cadPdfSnapGeometry(base, "ele.pdf", bytes);
  const arranque = world(10, 90);
  ok(has(antes.endpoints, arranque.x, arranque.y), "sin recorte, el arranque de la línea está");

  // La «L»: todo x < 60, más la franja y < 40. La escotadura es x > 60 e y > 40.
  const ele = apply(
    base,
    cadPdfClipCommands(base, "ele.pdf", [
      world(0, 0),
      world(200, 0),
      world(200, 40),
      world(60, 40),
      world(60, 200),
      world(0, 200),
    ]),
    "recortar en L",
  );
  const geometry = cadPdfSnapGeometry(ele, "ele.pdf", bytes);
  const inLeft = 60 * MM_PER_POINT + 1e-6;
  const inBottom = 40 * MM_PER_POINT + 1e-6;
  ok(
    geometry.endpoints.every((point) => point.x <= inLeft || point.y <= inBottom),
    "los extremos de la línea siguen dentro de la L",
  );
  ok(
    geometry.segments.length > 0,
    `la línea sigue ofreciendo tramos dentro de la L: ${geometry.segments.length}`,
  );
  ok(
    geometry.segments.every(
      (segment) =>
        (segment.a.x <= inLeft || segment.a.y <= inBottom) &&
        (segment.b.x <= inLeft || segment.b.y <= inBottom),
    ),
    "y NINGÚN tramo cruza la escotadura: el atajo de vértices no se tomó donde no vale",
  );
  ok(
    geometry.segments.length >= 2,
    "la línea salió partida en dos trozos, uno por cada brazo de la L",
  );
}

// ---------------------------------------------------------------------------
// 8. Un escaneo no tiene vectores, y se dice sin rodeos
// ---------------------------------------------------------------------------
{
  const document = attached("scanned-image-only", "escaneo-1980.pdf");
  const geometry = cadPdfSnapGeometry(document, "escaneo-1980.pdf", bytesOf("scanned-image-only"));
  eq(geometry.status, "raster", "un escaneo se declara escaneo");
  eq(cadPdfSnapCandidateCount(geometry), 0, "y no ofrece ni un candidato");
  ok(geometry.note.includes("escaneo"), `la nota lo dice en español: ${geometry.note}`);

  const ninguno = cadPdfSnapGeometry(document, "no-existe.pdf", bytesOf("scanned-image-only"));
  eq(ninguno.status, "no_underlay", "preguntar por un sustrato que no está no es un error");
  eq(cadPdfSnapCandidateCount(ninguno), 0, "es cero candidatos con su motivo");
}

// ---------------------------------------------------------------------------
// 9. El centro de un arco: se recupera cuando lo hay y NO se inventa
// ---------------------------------------------------------------------------
{
  // La Bézier canónica de un cuarto de círculo: la que emite todo exportador al
  // escribir un arco, porque el PDF no tiene operador de arco.
  const K = 0.5522847498307936;
  const quarter = cadPdfArcCenterOf(
    { x: 1, y: 0 },
    { x: 1, y: K },
    { x: K, y: 1 },
    { x: 0, y: 1 },
  );
  ok(!!quarter, "un cuarto de círculo escrito como Bézier sí tiene centro");
  near(quarter!.center.x, 0, 1e-9, "el centro del cuarto de círculo unidad está en x = 0");
  near(quarter!.center.y, 0, 1e-9, "y en y = 0");
  near(quarter!.radius, 1, 1e-9, "con radio 1");

  // La curva del corpus NO es un arco: sus controles están donde el escritor
  // quiso, no donde la circunferencia manda. No se le fabrica un centro.
  const libre = cadPdfArcCenterOf(
    { x: 180, y: 180 },
    { x: 216, y: 252 },
    { x: 252, y: 252 },
    { x: 288, y: 180 },
  );
  eq(libre, null, "una curva libre no regala un centro inventado");
  ok(CAD_PDF_SNAP_ARC_TOLERANCE < 0.05, "la tolerancia de circularidad es estrecha y está publicada");

  // Y de punta a punta: un PDF cuyo contenido es un círculo escrito con cuatro
  // Béziers ofrece SU centro, en coordenadas del dibujo.
  const bytes = minimalPdf(circleContent(100, 100, 50));
  const document = apply(
    emptyDocument(),
    cadPdfAttachCommands(emptyDocument(), {
      id: "circulo",
      source: { uri: "mem://circulo.pdf", fileName: "circulo.pdf", pages: readCadPdfPageList(bytes) },
      insertion: { x: 10, y: 20 },
    }),
    "adjuntar el círculo",
  );
  const geometry = cadPdfSnapGeometry(document, "circulo.pdf", bytes);
  eq(geometry.status, "ok", "el PDF del círculo se lee");
  eq(geometry.centers.length, 1, "los cuatro cuartos dan UN centro, no cuatro");
  near(geometry.centers[0].x, 10 + 100 * MM_PER_POINT, 1e-6, "el centro cae donde la escala dice (x)");
  near(geometry.centers[0].y, 20 + 100 * MM_PER_POINT, 1e-6, "y donde dice (y)");
  eq(geometry.midpoints.length, 0, "un círculo no tiene puntos medios de arista");
  eq(geometry.perpendicularSegments.length, 0, "ni tramos aptos para pie de perpendicular");
  ok(geometry.endpoints.length === 4, "los cuatro cuadrantes son los cabos de las cuatro Béziers");
}

// ---------------------------------------------------------------------------
// 10. El motor de OSNAP engancha de verdad a la lámina
// ---------------------------------------------------------------------------
{
  const document = attached("cad-vector-compressed", "levantamiento.pdf", {
    insertion: { x: 1000, y: 500 },
  });
  const geometry = cadPdfSnapGeometry(document, "levantamiento.pdf", bytesOf("cad-vector-compressed"));
  const target = { x: 1000 + 72 * MM_PER_POINT, y: 500 + 72 * MM_PER_POINT };

  const scene: SnapScene = {};
  cadPdfSnapSceneAdd(scene, geometry);
  const result = snap({ x: target.x + 0.4, y: target.y + 0.3 }, scene, { tolerance: 2 });
  ok(!!result, "el motor encuentra algo a lo que engancharse sobre la lámina");
  eq(result!.type, "endpoint", "y gana el extremo, que es lo que manda la prioridad de AutoCAD");
  near(result!.point.x, target.x, 1e-6, "el cursor se pega a la esquina del plano de fondo (x)");
  near(result!.point.y, target.y, 1e-6, "y (y)");

  // La ventana por cursor deja fuera lo lejano sin cambiar lo cercano.
  const ventana: SnapScene = {};
  cadPdfSnapSceneAdd(ventana, geometry, { cursor: target, radius: 5 });
  ok(
    ventana.endpoints!.length > 0 && ventana.endpoints!.length < geometry.endpoints.length,
    `la ventana de 5 mm deja ${ventana.endpoints!.length} extremos de ${geometry.endpoints.length}`,
  );
  const conVentana = snap({ x: target.x + 0.4, y: target.y + 0.3 }, ventana, { tolerance: 2 });
  eq(conVentana?.type, "endpoint", "y el enganche de cerca sale igual con ventana que sin ella");
  near(conVentana!.point.x, target.x, 1e-6, "en el mismo punto");

  // Un sustrato descargado no mete NADA en la escena: el motor no lo ve.
  const apagado: SnapScene = {};
  const unloaded = apply(document, cadPdfUnloadCommands(document, "levantamiento.pdf"), "descargar");
  cadPdfSnapSceneAdd(apagado, cadPdfSnapGeometry(unloaded, "levantamiento.pdf", bytesOf("cad-vector-compressed")));
  eq(snap(target, apagado, { tolerance: 2 }), null, "sobre un sustrato descargado, el motor no engancha a nada");
}

// ---------------------------------------------------------------------------
// Utilería del spec: un PDF de una página escrito a mano
// ---------------------------------------------------------------------------

/**
 * PDF mínimo de una página, sin comprimir y con su tabla de referencias reales.
 *
 * El corpus no tiene ningún archivo con un círculo, y el centro de arco es
 * justo lo que hay que demostrar de punta a punta. Se escribe aquí en vez de
 * añadirlo al corpus porque el corpus mide el LECTOR —cada archivo suyo pone a
 * prueba una suposición del intérprete y la matriz lo cuenta— y esto no pone a
 * prueba al lector: pone a prueba la aritmética de este módulo.
 */
function minimalPdf(content: string, mediaBox = "[0 0 200 200]"): Uint8Array {
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox ${mediaBox} /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, body] of bodies.entries()) {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const startxref = out.length;
  out += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Uint8Array.from(out, (character) => character.charCodeAt(0) & 0xff);
}

/** Un círculo como lo escribe un exportador: cuatro Béziers y la constante κ. */
function circleContent(cx: number, cy: number, r: number): string {
  const k = 0.5522847498307936 * r;
  const n = (value: number) => value.toFixed(6);
  return (
    "q 1 w 0 0 0 RG\n" +
    `${n(cx + r)} ${n(cy)} m\n` +
    `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c\n` +
    `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c\n` +
    `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c\n` +
    `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c\n` +
    "S\nQ\n"
  );
}

console.log(
  `pdf-snap-geometry: ${checks} comprobaciones · la lámina del corpus se adjunta y su contenido engancha ` +
    "en coordenadas del dibujo con anclas absolutas (72 pt = 25,4 mm); escalar a medida conocida mueve los " +
    "puntos con la lámina; un sustrato descargado da cero candidatos y lo dice; lo que el recorte deja fuera " +
    "no aparece; el centro de un arco se recupera y el de una curva libre no se inventa",
);
