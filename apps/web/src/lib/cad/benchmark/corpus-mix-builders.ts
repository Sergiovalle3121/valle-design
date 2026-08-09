/**
 * Los CUATRO generadores de mezcla, y el vocabulario que comparten.
 *
 * Viven aparte de `corpus-mixes.ts` porque el registro, el reparto por resto
 * mayor y el ensamblado del documento son una cosa —y cambian poco— mientras
 * que los generadores son la parte que crece cada vez que alguien quiere
 * probar un dibujo nuevo. Juntos pasaban de las 750 líneas y el trinquete de
 * tamaño del repositorio corta en 800: extraer ahora es más barato que
 * extraer con el gate en rojo.
 *
 * Cada generador declara PESOS ENTEROS que suman 1.000. No son probabilidades:
 * `buildCadCorpusMixSchedule` los reparte de forma exacta e intercalada, así
 * que «200» significa exactamente el 20% de las entidades, en los dos
 * escalones versionados y sea cual sea la semilla.
 */
import type {
  CadBlockDefinition,
  CadEntity,
  CadLayerDef,
} from "../cad-document";
import { roundCadBenchmarkCoordinate as round } from "./corpus";
import type {
  CadCorpusMixEntityBuilder,
  CadCorpusMixSlot,
} from "./corpus-mixes";

// ---------------------------------------------------------------------------
// Vocabulario compartido
// ---------------------------------------------------------------------------

export function layer(id: string, name: string, color: string): CadLayerDef {
  return { id, name, color, visible: true, locked: false };
}

function point(x: number, y: number) {
  return { x: round(x), y: round(y), z: 0 };
}

/**
 * Alfabeto del texto generado.
 *
 * Es ANCHO a propósito: el atlas de glifos escala con el número de caracteres
 * DISTINTOS, no con el número de rótulos. Un corpus que sólo escribiera dígitos
 * llenaría 10 huecos del atlas y declararía «el atlas aguanta», que es
 * precisamente la medida vacía que hay que evitar. Con acentos y símbolos de
 * cota se pasa de 10 glifos a ~90, que es lo que tiene un plano en castellano.
 */
const CAD_CORPUS_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÁÉÍÓÚÑáéíóúñ°±ØΔ%·/-().,:";

function word(rng: () => number, length: number): string {
  let text = "";
  for (let index = 0; index < length; index += 1)
    text += CAD_CORPUS_ALPHABET[
      Math.floor(rng() * CAD_CORPUS_ALPHABET.length) %
        CAD_CORPUS_ALPHABET.length
    ];
  return text;
}

// ---------------------------------------------------------------------------
// Mezcla ARQUITECTÓNICA
// ---------------------------------------------------------------------------

/**
 * Tres definiciones de bloque para decenas de miles de INSERT. Esa asimetría
 * ES el caso arquitectónico: la puerta se dibuja una vez y se coloca 30.000
 * veces, así que lo que se mide es la expansión del bloque por instancia y no
 * la complejidad del bloque.
 */
export function architectureBlocks(): CadBlockDefinition[] {
  return [
    {
      id: "BLK-DOOR",
      name: "PUERTA-90",
      basePoint: point(0, 0),
      entities: [
        {
          id: "BLK-DOOR-LEAF",
          type: "line",
          start: point(0, 0),
          end: point(90, 0),
          layer: "ARQ-CARP",
        },
        {
          id: "BLK-DOOR-SWING",
          type: "arc",
          center: point(0, 0),
          radius: 90,
          startAngle: 0,
          endAngle: 90,
          layer: "ARQ-CARP",
        },
        {
          id: "BLK-DOOR-JAMB",
          type: "line",
          start: point(0, 0),
          end: point(0, 12),
          layer: "ARQ-CARP",
        },
      ] as CadEntity[],
    },
    {
      id: "BLK-WINDOW",
      name: "VENTANA-120",
      basePoint: point(0, 0),
      entities: [
        {
          id: "BLK-WINDOW-OUT",
          type: "polyline",
          vertices: [point(0, 0), point(120, 0), point(120, 24), point(0, 24)],
          closed: true,
          layer: "ARQ-CARP",
        },
        {
          id: "BLK-WINDOW-GLASS",
          type: "line",
          start: point(0, 12),
          end: point(120, 12),
          layer: "ARQ-CARP",
        },
      ] as CadEntity[],
    },
    {
      id: "BLK-COLUMN",
      name: "PILAR-30",
      basePoint: point(0, 0),
      entities: [
        {
          id: "BLK-COLUMN-RING",
          type: "circle",
          center: point(0, 0),
          radius: 30,
          layer: "ARQ-ESTR",
        },
        {
          id: "BLK-COLUMN-CROSS-X",
          type: "line",
          start: point(-30, 0),
          end: point(30, 0),
          layer: "ARQ-ESTR",
        },
        {
          id: "BLK-COLUMN-CROSS-Y",
          type: "line",
          start: point(0, -30),
          end: point(0, 30),
          layer: "ARQ-ESTR",
        },
      ] as CadEntity[],
    },
  ];
}

export function architectureSlots(): CadCorpusMixSlot[] {
  const wall: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => {
    const width = round(cellSize * (0.5 + rng() * 0.4));
    const height = round(cellSize * (0.4 + rng() * 0.4));
    const thickness = round(10 + rng() * 15);
    return {
      id,
      type: "polyline",
      vertices: [
        { ...point(baseX, baseY), startWidth: thickness, endWidth: thickness },
        { ...point(baseX + width, baseY), startWidth: thickness, endWidth: thickness },
        { ...point(baseX + width, baseY + height), startWidth: thickness, endWidth: thickness },
        { ...point(baseX, baseY + height), startWidth: thickness, endWidth: thickness },
      ],
      closed: true,
      layer: "ARQ-MUROS",
    };
  };
  const door: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "insert",
    block: "BLK-DOOR",
    insertion: point(baseX + cellSize * 0.2 + rng() * 40, baseY + rng() * 40),
    scale: { x: 1, y: 1, z: 1 },
    rotation: Math.round(rng() * 4) * 90,
    layer: "ARQ-CARP",
  });
  const windowInsert: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "insert",
    block: "BLK-WINDOW",
    insertion: point(baseX + cellSize * 0.55, baseY + cellSize * 0.15 + rng() * 60),
    scale: { x: round(0.8 + rng() * 0.6), y: 1, z: 1 },
    rotation: Math.round(rng() * 2) * 90,
    layer: "ARQ-CARP",
  });
  const column: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize }) => ({
    id,
    type: "insert",
    block: "BLK-COLUMN",
    insertion: point(baseX + cellSize * 0.5, baseY + cellSize * 0.5),
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    layer: "ARQ-ESTR",
  });
  const floorHatch: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => {
    const width = round(cellSize * (0.35 + rng() * 0.3));
    const height = round(cellSize * (0.3 + rng() * 0.3));
    return {
      id,
      type: "hatch",
      pattern: rng() < 0.5 ? "ANSI31" : "AR-CONC",
      solid: false,
      boundaries: [
        [
          point(baseX + 20, baseY + 20),
          point(baseX + 20 + width, baseY + 20),
          point(baseX + 20 + width, baseY + 20 + height),
          point(baseX + 20, baseY + 20 + height),
        ],
      ],
      scale: round(1 + rng()),
      angle: Math.round(rng() * 3) * 45,
      islandStyle: "outer",
      layer: "ARQ-SUELO",
    };
  };
  const roomDimension: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "dimension",
    a: { x: round(baseX + 20), y: round(baseY + 10) },
    b: { x: round(baseX + cellSize * (0.5 + rng() * 0.4)), y: round(baseY + 10) },
    dimensionKind: "linear",
    axis: "x",
    offset: round(40 + rng() * 30),
    units: "mm",
    precision: 0,
    extensionLines: true,
    arrowhead: "architectural-tick",
    layer: "ARQ-COTAS",
  });
  const roomLabel: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "mtext",
    insertion: point(baseX + cellSize * 0.25, baseY + cellSize * 0.6),
    text: `${word(rng, 6)}\n${round(8 + rng() * 30)} m²`,
    width: round(cellSize * 0.4),
    height: round(28 + rng() * 8),
    rotation: 0,
    alignment: "top-left",
    layer: "ARQ-ROTUL",
  });
  const axis: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "line",
    start: point(baseX - 30, baseY + cellSize * rng()),
    end: point(baseX + cellSize + 30, baseY + cellSize * rng()),
    layer: "ARQ-EJES",
  });
  // Suma 1.000. Inserts = 340: «muchos inserts, pocas definiciones» medido.
  return [
    { weight: 180, build: wall },
    { weight: 190, build: door },
    { weight: 100, build: windowInsert },
    { weight: 50, build: column },
    { weight: 140, build: floorHatch },
    { weight: 170, build: roomDimension },
    { weight: 100, build: roomLabel },
    { weight: 70, build: axis },
  ];
}

// ---------------------------------------------------------------------------
// Mezcla MECÁNICA
// ---------------------------------------------------------------------------

export function mechanicalSlots(): CadCorpusMixSlot[] {
  const smallArc: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => {
    const start = round(rng() * 360);
    return {
      id,
      type: "arc",
      center: point(baseX + cellSize * rng(), baseY + cellSize * rng()),
      // Radios PEQUEÑOS: es lo que hace que el escalón de LOD cambie con
      // cualquier muesca de rueda, que es el caso caro del teselado.
      radius: round(0.8 + rng() * 4),
      startAngle: start,
      endAngle: round(start + 30 + rng() * 200),
      layer: "MEC-CONT",
    };
  };
  const spline: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => {
    const controlPoints = Array.from({ length: 6 }, (_, vertex) =>
      point(
        baseX + (cellSize * vertex) / 5 + rng() * 6,
        baseY + cellSize * 0.5 + Math.sin(vertex) * 12 + rng() * 6,
      ),
    );
    return {
      id,
      type: "spline",
      degree: 3,
      controlPoints,
      // Nudos clampeados de un B-spline cúbico con 6 puntos de control:
      // multiplicidad grado+1 en los extremos. Un vector de nudos inventado
      // dibuja una curva plausible y distinta en cada runtime.
      knots: [0, 0, 0, 0, 1, 2, 3, 3, 3, 3],
      closed: false,
      layer: "MEC-CONT",
    };
  };
  const ellipse: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "ellipse",
    center: point(baseX + cellSize * 0.5, baseY + cellSize * 0.5),
    majorAxis: point(round(8 + rng() * 20), round(rng() * 6)),
    ratio: round(0.25 + rng() * 0.6),
    startParameter: 0,
    endParameter: round(Math.PI * 2),
    layer: "MEC-CONT",
  });
  const tolerancedDimension: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "dimension",
    a: { x: round(baseX + 4), y: round(baseY + 4) },
    b: { x: round(baseX + cellSize * (0.4 + rng() * 0.5)), y: round(baseY + 4) },
    dimensionKind: rng() < 0.3 ? "diameter" : "linear",
    axis: "x",
    offset: round(8 + rng() * 10),
    // La tolerancia es LO QUE SE VIENE A MEDIR: prefijo, sufijo y unidades
    // alternas triplican los glifos de una cota respecto a un número pelado.
    prefix: rng() < 0.4 ? "Ø" : "",
    suffix: ` ±${round(0.01 + rng() * 0.2)} H7`,
    units: "mm",
    alternateUnits: "in",
    precision: 3,
    radius: round(2 + rng() * 8),
    extensionLines: true,
    arrowhead: "closed-filled",
    layer: "MEC-COTAS",
  });
  const edge: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "line",
    start: point(baseX + cellSize * rng(), baseY + cellSize * rng()),
    end: point(baseX + cellSize * rng(), baseY + cellSize * rng()),
    layer: "MEC-CONT",
  });
  const bore: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "circle",
    center: point(baseX + cellSize * rng(), baseY + cellSize * rng()),
    radius: round(1 + rng() * 5),
    layer: "MEC-EJES",
  });
  return [
    { weight: 380, build: smallArc },
    { weight: 140, build: spline },
    { weight: 100, build: ellipse },
    { weight: 160, build: tolerancedDimension },
    { weight: 140, build: edge },
    { weight: 80, build: bore },
  ];
}

// ---------------------------------------------------------------------------
// Mezcla CARTOGRÁFICA
// ---------------------------------------------------------------------------

export function cartographySlots(): CadCorpusMixSlot[] {
  const contour: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => {
    // 8..31 vértices por curva de nivel. A 100.000 entidades con 92% de
    // polilíneas eso pasa de 700.000 segmentos: el orden de magnitud que el
    // enunciado pedía y que el corpus de LINE/CIRCLE/ARC no alcanza nunca.
    const vertexCount = 8 + Math.floor(rng() * 24);
    const vertices = Array.from({ length: vertexCount }, (_, vertex) => {
      const t = vertex / (vertexCount - 1);
      return point(
        baseX + cellSize * t,
        baseY + cellSize * 0.5 + Math.sin(t * Math.PI * 3) * cellSize * 0.2 + rng() * cellSize * 0.05,
      );
    });
    return { id, type: "polyline", vertices, closed: false, layer: "TOP-CURVAS" };
  };
  const elevationLabel: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "mtext",
    insertion: point(baseX + cellSize * 0.5, baseY + cellSize * 0.5),
    text: `${Math.round(100 + rng() * 2_400)}`,
    width: round(cellSize * 0.1),
    height: round(cellSize * 0.02),
    rotation: round(rng() * 30),
    alignment: "middle-center",
    layer: "TOP-COTAS",
  });
  const boundary: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "line",
    start: point(baseX, baseY + cellSize * rng()),
    end: point(baseX + cellSize, baseY + cellSize * rng()),
    layer: "TOP-LIMITES",
  });
  return [
    { weight: 920, build: contour },
    { weight: 30, build: elevationLabel },
    { weight: 50, build: boundary },
  ];
}

// ---------------------------------------------------------------------------
// Mezcla HOSTIL (texto)
// ---------------------------------------------------------------------------

export function textHostileSlots(): CadCorpusMixSlot[] {
  const label: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => {
    // Párrafos de 3 a 6 líneas: un MTEXT de un renglón subestima el atlas y el
    // coste de maquetar. Los textos son distintos entre sí a propósito —un
    // corpus que repitiera la misma cadena mediría la caché, no el atlas.
    const lines = 3 + Math.floor(rng() * 4);
    const text = Array.from({ length: lines }, () =>
      `${word(rng, 5 + Math.floor(rng() * 9))} ${word(rng, 3 + Math.floor(rng() * 6))}`,
    ).join("\n");
    return {
      id,
      type: "mtext",
      insertion: point(baseX + rng() * cellSize * 0.3, baseY + rng() * cellSize * 0.3),
      text,
      width: round(cellSize * 0.7),
      height: round(9 + rng() * 9),
      rotation: rng() < 0.15 ? 90 : 0,
      alignment: "top-left",
      backgroundMask: rng() < 0.25,
      layer: "TXT-NOTAS",
    };
  };
  const leaderRule: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "line",
    start: point(baseX, baseY + cellSize * rng()),
    end: point(baseX + cellSize * rng(), baseY + cellSize * rng()),
    layer: "TXT-GUIAS",
  });
  const frame: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "polyline",
    vertices: [
      point(baseX, baseY),
      point(baseX + cellSize * (0.6 + rng() * 0.3), baseY),
      point(baseX + cellSize * (0.6 + rng() * 0.3), baseY + cellSize * 0.5),
      point(baseX, baseY + cellSize * 0.5),
    ],
    closed: true,
    layer: "TXT-MARCOS",
  });
  // 200/1.000 → 20.000 MTEXT EXACTOS en el escalón de 100k, que es la carga
  // que el enunciado señala como la que reventaba el montón.
  return [
    { weight: 200, build: label },
    { weight: 600, build: leaderRule },
    { weight: 200, build: frame },
  ];
}

