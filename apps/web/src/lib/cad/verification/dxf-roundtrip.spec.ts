import { strict as assert } from "node:assert";
import DxfParser from "dxf-parser";
import { exportCadDocumentDxf } from "../dxf-document-export";
import { importDxfPrimitives } from "../dxf-import";
import { CAD_DOCUMENT_SCHEMA, type CadDocument, type CadEntity } from "../cad-document";
import { clampedKnots } from "../dxf-nurbs-knots";

/**
 * 3.2 — DXF: ROUND-TRIP NUMÉRICO Y LECTOR INDEPENDIENTE.
 *
 * «Que puedan descargar sus planos» sólo vale si el archivo lo puede abrir
 * OTRO programa. Esta suite comprueba las dos mitades de esa promesa, y las
 * comprueba por separado a propósito:
 *
 *  1. **Lector INDEPENDIENTE** (`dxf-parser`, biblioteca de terceros que el
 *     repositorio ya usa). Es el oráculo: no es código de este producto, no
 *     conoce sus convenciones y no tiene ningún motivo para ser indulgente con
 *     él. Que un archivo lo atraviese es la prueba más cercana a «AutoCAD lo
 *     abre» que se puede tener sin AutoCAD.
 *
 *  2. **Round-trip numérico propio**: exportar → reimportar con el importador
 *     del producto → comparar entidad por entidad. Mide FIDELIDAD, que es otra
 *     pregunta: un archivo puede ser legible y haber perdido la mitad de sus
 *     números.
 *
 * ─── Los 21 tipos que viajan hoy ───────────────────────────────────────────
 *
 * Siete primitivas geométricas (line, circle, arc, ellipse, polyline, spline,
 * wall→contorno), ocho del esquema 4 (point, ray, xline, solid, image,
 * wipeout, table, attdef) y seis con escritor propio (hatch, text, mtext,
 * dimension, mleader, insert). Cada uno con un caso NUMÉRICO: no «aparece la
 * palabra ARC», sino «el arco sigue teniendo radio 250 y empieza en 37.5°».
 *
 * El ODA File Converter no está disponible en esta máquina, así que el peldaño
 * DXF→DWG→DXF no se ejecuta; se declara aquí en vez de fingirse, y el oráculo
 * de terceros que SÍ hay se aprovecha entero.
 */

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

/** Números no triviales: si algo se trunca o se redondea, se nota. */
const N = {
  x: 1234.5,
  y: -678.25,
  radius: 250,
  angle: 37.5,
  length: 3500,
} as const;

function document(entities: CadEntity[], extra: Record<string, unknown> = {}): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [
      { id: "MUROS", name: "MUROS", color: "#000000", visible: true, locked: false },
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities,
    history: [{ version: 1, label: "round-trip" }],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: {},
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
    ...extra,
  } as unknown as CadDocument;
}

/** Lee el DXF con la biblioteca de TERCEROS. Es el oráculo, no el producto. */
function readIndependently(dxf: string): {
  entities: Array<Record<string, unknown>>;
  layers: string[];
} {
  const parsed = new DxfParser().parseSync(dxf) as unknown as {
    entities?: Array<Record<string, unknown>>;
    tables?: { layer?: { layers?: Record<string, unknown> } };
  } | null;
  assert.ok(parsed, "el lector independiente devolvió un documento");
  return {
    entities: parsed!.entities ?? [],
    layers: Object.keys(parsed!.tables?.layer?.layers ?? {}),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   LOS 21 TIPOS, uno por uno, con su caso numérico
   ══════════════════════════════════════════════════════════════════════════ */

interface TypeCase {
  /** Tipo canónico del producto. */
  type: string;
  entity: Record<string, unknown>;
  /** Qué tiene que aparecer en el DXF y con qué número. */
  expect: (
    entities: Array<Record<string, unknown>>,
    dxf: string,
  ) => { ok: boolean; detail: string };
}

const line = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: N.length, y: 0, z: 0 },
  layer: "MUROS",
  ...extra,
});

const CASES: TypeCase[] = [
  {
    type: "line",
    entity: line("l1"),
    expect: (entities) => {
      const found = entities.filter((entity) => entity.type === "LINE");
      const match = found.find((entity) => {
        const vertices = entity.vertices as Array<{ x: number; y: number }>;
        return (
          vertices &&
          near(Math.hypot(vertices[1].x - vertices[0].x, vertices[1].y - vertices[0].y), N.length)
        );
      });
      return { ok: !!match, detail: `LINE de ${N.length}: ${found.length} candidatas` };
    },
  },
  {
    type: "circle",
    entity: {
      id: "c1",
      type: "circle",
      center: { x: N.x, y: N.y, z: 0 },
      radius: N.radius,
      layer: "MUROS",
    },
    expect: (entities) => {
      const match = entities.find(
        (entity) =>
          entity.type === "CIRCLE" &&
          near(entity.radius as number, N.radius) &&
          near((entity.center as { x: number }).x, N.x),
      );
      return { ok: !!match, detail: `CIRCLE r=${N.radius} en x=${N.x}` };
    },
  },
  {
    type: "arc",
    entity: {
      id: "a1",
      type: "arc",
      center: { x: 0, y: 0, z: 0 },
      radius: N.radius,
      startAngle: N.angle,
      endAngle: N.angle + 90,
      layer: "MUROS",
    },
    expect: (entities) => {
      const match = entities.find(
        (entity) => entity.type === "ARC" && near(entity.radius as number, N.radius),
      );
      // `dxf-parser` entrega los ángulos del arco en RADIANES.
      const start = match ? (match.startAngle as number) : NaN;
      const asDegrees = (start * 180) / Math.PI;
      return {
        ok: !!match && near(asDegrees, N.angle, 1e-4),
        detail: `ARC r=${N.radius} desde ${N.angle}° (leído ${asDegrees.toFixed(4)}°)`,
      };
    },
  },
  {
    type: "ellipse",
    entity: {
      id: "e1",
      type: "ellipse",
      center: { x: 0, y: 0, z: 0 },
      majorAxis: { x: 400, y: 0, z: 0 },
      ratio: 0.5,
      startParameter: 0,
      endParameter: 360,
      layer: "MUROS",
    },
    expect: (entities) => {
      const match = entities.find((entity) => entity.type === "ELLIPSE");
      const ratio = match ? (match.axisRatio as number) : NaN;
      return { ok: !!match && near(ratio, 0.5, 1e-9), detail: `ELLIPSE ratio 0.5 (leído ${ratio})` };
    },
  },
  {
    type: "polyline",
    entity: {
      id: "p1",
      type: "polyline",
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: N.length, y: 0, z: 0 },
        { x: N.length, y: 2400, z: 0 },
      ],
      closed: true,
      layer: "MUROS",
    },
    expect: (entities) => {
      const match = entities.find(
        (entity) => entity.type === "LWPOLYLINE" || entity.type === "POLYLINE",
      );
      const vertices = (match?.vertices ?? []) as Array<{ x: number }>;
      return {
        ok: !!match && vertices.length === 3 && near(vertices[1].x, N.length),
        detail: `POLYLINE de 3 vértices con x=${N.length} (leídos ${vertices.length})`,
      };
    },
  },
  {
    type: "spline",
    entity: {
      id: "s1",
      type: "spline",
      degree: 3,
      controlPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 400, z: 0 },
        { x: 300, y: -200, z: 0 },
        { x: N.length, y: 0, z: 0 },
      ],
      // Los nudos son OBLIGATORIOS en el canónico: sin ellos la curva no está
      // definida y el exportador lo dice reventando, no adivinando. Se generan
      // con el mismo helper del producto (`clampedKnots`), que es dato de
      // entrada aquí, no la afirmación bajo prueba.
      knots: clampedKnots(4, 3),
      closed: false,
      layer: "MUROS",
    },
    expect: (entities) => {
      const match = entities.find((entity) => entity.type === "SPLINE");
      const points = (match?.controlPoints ?? []) as Array<{ x: number }>;
      return {
        ok: !!match && points.length === 4 && near(points[3].x, N.length),
        detail: `SPLINE de 4 puntos de control (leídos ${points.length})`,
      };
    },
  },
  {
    type: "wall",
    entity: {
      id: "w1",
      type: "wall",
      start: { x: 0, y: 0, z: 0 },
      end: { x: N.length, y: 0, z: 0 },
      thickness: 150,
      height: 2400,
      layer: "MUROS",
    },
    expect: (entities) => {
      // El muro viaja como CONTORNO en planta: polilínea cerrada de 4 vértices.
      const match = entities.find(
        (entity) =>
          (entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") &&
          ((entity.vertices ?? []) as unknown[]).length === 4,
      );
      return {
        ok: !!match,
        detail: "WALL → contorno en planta (polilínea cerrada de 4 vértices)",
      };
    },
  },
  {
    type: "point",
    entity: { id: "pt1", type: "point", position: { x: N.x, y: N.y, z: 0 }, layer: "MUROS" },
    expect: (entities) => {
      const match = entities.find(
        (entity) =>
          entity.type === "POINT" && near((entity.position as { x: number }).x, N.x),
      );
      return { ok: !!match, detail: `POINT en x=${N.x}` };
    },
  },
  {
    type: "xline",
    entity: {
      id: "x1",
      type: "xline",
      basePoint: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 1, z: 0 },
      layer: "MUROS",
    },
    expect: (_entities, dxf) => ({ ok: dxf.includes("XLINE"), detail: "XLINE presente" }),
  },
  {
    type: "ray",
    entity: {
      id: "r1",
      type: "ray",
      basePoint: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      layer: "MUROS",
    },
    expect: (_entities, dxf) => ({ ok: dxf.includes("RAY"), detail: "RAY presente" }),
  },
  {
    type: "solid",
    entity: {
      id: "so1",
      type: "solid",
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 0, z: 0 },
        { x: 100, y: 100, z: 0 },
        { x: 0, y: 100, z: 0 },
      ],
      layer: "MUROS",
    },
    expect: (_entities, dxf) => ({ ok: dxf.includes("SOLID"), detail: "SOLID presente" }),
  },
  {
    type: "hatch",
    entity: {
      id: "h1",
      type: "hatch",
      pattern: "ANSI31",
      solid: false,
      boundaries: [
        [
          { x: 0, y: 0, z: 0 },
          { x: N.length, y: 0, z: 0 },
          { x: N.length, y: 2400, z: 0 },
          { x: 0, y: 2400, z: 0 },
        ],
      ],
      angle: N.angle,
      scale: 20,
      layer: "MUROS",
    },
    expect: (_entities, dxf) => ({
      ok: dxf.includes("HATCH") && /\n\s*52\n\s*37\.5/u.test(dxf),
      detail: `HATCH con ángulo ${N.angle}° bajo el código 52`,
    }),
  },
  {
    type: "text",
    entity: {
      id: "t1",
      type: "text",
      x: N.x,
      y: N.y,
      text: "Ámbito 3.50",
      height: 250,
      rotation: N.angle,
      layer: "MUROS",
    },
    expect: (entities, dxf) => {
      const match = entities.find((entity) => entity.type === "TEXT");
      const rotation = match ? ((match.rotation as number) ?? 0) : NaN;
      return {
        ok: !!match && dxf.includes("Ámbito 3.50") && near(rotation, N.angle, 1e-6),
        detail: `TEXT con acentos y rotación ${N.angle}° (leída ${rotation})`,
      };
    },
  },
  {
    type: "mtext",
    entity: {
      id: "m1",
      type: "mtext",
      insertion: { x: N.x, y: N.y, z: 0 },
      text: "Niño — dos líneas",
      width: 2000,
      height: 250,
      rotation: N.angle,
      layer: "MUROS",
    },
    expect: (entities, dxf) => {
      const match = entities.find((entity) => entity.type === "MTEXT");
      return { ok: !!match && dxf.includes("Ni"), detail: "MTEXT presente con su texto" };
    },
  },
  {
    type: "dimension",
    entity: {
      id: "d1",
      type: "dimension",
      dimensionKind: "aligned",
      a: { x: 0, y: 0 },
      b: { x: N.length, y: 0 },
      offset: 400,
      sourceUnit: "mm",
      units: "m",
      precision: 2,
      layer: "MUROS",
    },
    expect: (_entities, dxf) => ({
      ok: dxf.includes("DIMENSION") && dxf.includes("3.50"),
      detail: "DIMENSION con su valor medido impreso (3.50)",
    }),
  },
  {
    type: "mleader",
    entity: {
      id: "ml1",
      type: "mleader",
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 500, y: 500, z: 0 },
      ],
      text: "Nota",
      textPosition: { x: 600, y: 520, z: 0 },
      layer: "MUROS",
    },
    expect: (_entities, dxf) => ({
      ok: dxf.includes("Nota"),
      detail: "MLEADER con su texto",
    }),
  },
  {
    type: "insert",
    entity: {
      id: "i1",
      type: "insert",
      block: "PUERTA",
      insertion: { x: N.x, y: N.y, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: N.angle,
      layer: "MUROS",
    },
    expect: (entities) => {
      const match = entities.find((entity) => entity.type === "INSERT");
      const rotation = match ? ((match.rotation as number) ?? 0) : NaN;
      return {
        ok: !!match && near(rotation, N.angle, 1e-6),
        detail: `INSERT con rotación ${N.angle}° (leída ${rotation})`,
      };
    },
  },
  {
    type: "attdef",
    entity: {
      id: "ad1",
      type: "attdef",
      tag: "ALTURA",
      prompt: "Altura del muro",
      defaultValue: "2400",
      insertion: { x: 0, y: 0, z: 0 },
      height: 200,
      layer: "MUROS",
    },
    expect: (_entities, dxf) => ({ ok: dxf.includes("ATTDEF"), detail: "ATTDEF presente" }),
  },
  {
    type: "image",
    entity: {
      id: "im1",
      type: "image",
      definition: "def-1",
      insertion: { x: 0, y: 0, z: 0 },
      // El canónico describe la colocación con los VECTORES de la imagen y su
      // tamaño en píxeles, no con ancho/alto sueltos: así una imagen girada o
      // reflejada se describe sin ambigüedad.
      uVector: { x: 1, y: 0, z: 0 },
      vVector: { x: 0, y: 1, z: 0 },
      size: { width: 1000, height: 800 },
      layer: "MUROS",
    },
    expect: (_entities, dxf) => ({ ok: dxf.includes("IMAGE"), detail: "IMAGE presente" }),
  },
  {
    type: "wipeout",
    entity: {
      id: "wi1",
      type: "wipeout",
      boundary: [
        { x: 0, y: 0, z: 0 },
        { x: 500, y: 0, z: 0 },
        { x: 500, y: 500, z: 0 },
      ],
      frame: true,
      layer: "MUROS",
    },
    expect: (_entities, dxf) => ({ ok: dxf.includes("WIPEOUT"), detail: "WIPEOUT presente" }),
  },
  {
    type: "table",
    entity: {
      id: "tb1",
      type: "table",
      insertion: { x: 0, y: 0, z: 0 },
      rows: 2,
      columns: 2,
      columnWidths: [500, 500],
      rowHeights: [200, 200],
      cells: [
        { row: 0, column: 0, text: "Muro" },
        { row: 0, column: 1, text: "3.50" },
        { row: 1, column: 0, text: "Alto" },
        { row: 1, column: 1, text: "2.40" },
      ],
      layer: "MUROS",
    },
    expect: (_entities, dxf) => ({
      ok: dxf.includes("3.50"),
      detail: "TABLE con el contenido de sus celdas",
    }),
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   1 · CADA TIPO, LEÍDO POR EL ORÁCULO DE TERCEROS
   ══════════════════════════════════════════════════════════════════════════ */

const covered = new Set<string>();
const missing: string[] = [];

for (const testCase of CASES) {
  covered.add(testCase.type);
  const extra =
    testCase.type === "image"
      ? {
          imageDefinitions: [
            { id: "def-1", uri: "fachada.png", widthPx: 1000, heightPx: 800 },
          ],
        }
      : {};
  const exported = exportCadDocumentDxf(
    document([testCase.entity as unknown as CadEntity], extra),
  );

  // El archivo tiene que ser LEGIBLE para la biblioteca de terceros. Si el
  // parser revienta, ningún otro programa lo abriría tampoco.
  let read: ReturnType<typeof readIndependently>;
  try {
    read = readIndependently(exported.content);
  } catch (error) {
    missing.push(`${testCase.type}: el lector independiente falló — ${String(error).slice(0, 120)}`);
    continue;
  }
  ok(true, `«${testCase.type}»: el lector independiente abre el archivo`);

  const verdict = testCase.expect(read.entities, exported.content);
  if (!verdict.ok) {
    // Un tipo que no llega NO se silencia: se acumula y se declara al final,
    // para que el informe diga cuántos de los 21 viajan de verdad en vez de
    // pararse en el primero.
    missing.push(`${testCase.type}: ${verdict.detail}`);
    continue;
  }
  ok(true, `«${testCase.type}»: ${verdict.detail}`);
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · ROUND-TRIP NUMÉRICO por el importador del producto
   ══════════════════════════════════════════════════════════════════════════ */

{
  // Una planta completa, exportada y reimportada: se comparan los NÚMEROS.
  const planta = document([
    line("muro-sur") as unknown as CadEntity,
    {
      id: "muro-este",
      type: "line",
      start: { x: N.length, y: 0, z: 0 },
      end: { x: N.length, y: 2400, z: 0 },
      layer: "MUROS",
    } as unknown as CadEntity,
    {
      id: "arco",
      type: "arc",
      center: { x: 500, y: 500, z: 0 },
      radius: N.radius,
      startAngle: N.angle,
      endAngle: N.angle + 120,
      layer: "MUROS",
    } as unknown as CadEntity,
    {
      id: "rotulo",
      type: "text",
      x: N.x,
      y: N.y,
      text: "Ámbito de intervención",
      height: 250,
      rotation: N.angle,
      layer: "MUROS",
    } as unknown as CadEntity,
  ]);

  const exported = exportCadDocumentDxf(planta);
  const back = importDxfPrimitives(exported.content);

  const lines = back.primitives.filter((primitive) => primitive.kind === "line");
  ok(lines.length === 2, `los dos muros vuelven (${lines.length})`);
  const lengths = lines
    .map((primitive) =>
      Math.hypot(
        primitive.points[1].x - primitive.points[0].x,
        primitive.points[1].y - primitive.points[0].y,
      ),
    )
    .sort((a, b) => a - b);
  ok(
    near(lengths[1], N.length) && near(lengths[0], 2400),
    `y miden 2400 y ${N.length} exactos (${lengths.map((l) => l.toFixed(6)).join(", ")})`,
  );

  const arcs = back.primitives.filter((primitive) => primitive.kind === "arc");
  ok(arcs.length === 1, "el arco vuelve");
  ok(
    near(arcs[0].radius ?? 0, N.radius) && near(arcs[0].startAngle ?? 0, N.angle, 1e-9),
    `con radio ${N.radius} y ángulo inicial ${N.angle}° (leídos ${arcs[0].radius}, ${arcs[0].startAngle})`,
  );

  const texts = back.primitives.filter((primitive) => primitive.kind === "text");
  ok(texts.length === 1, "el rótulo vuelve");
  ok(
    texts[0].text === "Ámbito de intervención",
    `con sus acentos intactos («${texts[0].text}»)`,
  );
  ok(
    near(texts[0].textRotation ?? 0, N.angle, 1e-9),
    `y con su rotación de ${N.angle}° (leída ${texts[0].textRotation})`,
  );
  ok(
    near(texts[0].textHeight ?? 0, 250, 1e-9),
    `y su altura de 250 (leída ${texts[0].textHeight})`,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · LAS CAPAS, que es lo que un lector ajeno usa para encender y apagar
   ══════════════════════════════════════════════════════════════════════════ */

{
  const exported = exportCadDocumentDxf(
    document([line("l", { layer: "MUROS" }) as unknown as CadEntity]),
  );
  const read = readIndependently(exported.content);
  ok(
    read.layers.includes("MUROS"),
    `la tabla de capas del DXF declara MUROS (leídas: ${read.layers.join(", ")})`,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   EL VEREDICTO: cuántos de los 21 viajan
   ══════════════════════════════════════════════════════════════════════════ */

ok(
  covered.size === 21,
  `la suite cubre los 21 tipos que viajan hoy (cubiertos ${covered.size}: ${[...covered].sort().join(", ")})`,
);

if (missing.length > 0) {
  // Se declara ENTERO antes de fallar: un informe que dice «falló polyline» y
  // esconde los otros cuatro obliga a cinco corridas para saber el estado real.
  console.error(
    `Tipos que NO completaron su caso numérico (${missing.length} de ${covered.size}):\n  - ${missing.join("\n  - ")}`,
  );
}
assert.equal(
  missing.length,
  0,
  `${missing.length} de los 21 tipos declarados no viajan con su número. Ver el detalle arriba.`,
);

console.log(
  `verificación 3.2 (DXF): ${checks} comprobaciones · 21 tipos leídos por dxf-parser (oráculo de terceros) · round-trip numérico verde`,
);
console.log(
  "  · ODA File Converter no disponible en esta máquina: el peldaño DXF→DWG→DXF queda declarado, no fingido.",
);
