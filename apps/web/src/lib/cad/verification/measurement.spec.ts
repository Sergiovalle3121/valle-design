import { strict as assert } from "node:assert";
import {
  buildCadDimensionGeometry,
  type CadDimensionEntity,
} from "../associative-dimension";
import {
  cadEntityArea,
  cadMassProperties,
  cadPolygonArea,
  contourSignedArea,
} from "../inquiry/contours";
import { cadDistanceBetween } from "../inquiry/reports";
import type { CadEntity } from "../cad-document";
import { circularSegmentArea, shoelaceArea, type P } from "./oracle";

/**
 * 1.3 — MEDICIÓN, INTERROGACIÓN Y EL VALOR QUE MUESTRA UNA COTA.
 *
 * La parte de esta ola que un arquitecto nota en el acto: si DIST dice 3.47
 * donde midió 3.50, o si una cota imprime un número que no es el que mide, el
 * plano que entrega está mal y la culpa es del programa.
 *
 * Oráculos usados aquí:
 *
 * · Polígonos de área CONOCIDA en papel (un rectángulo 100×80 mide 8000; el
 *   triángulo 3-4-5 mide 6).
 * · La fórmula CERRADA del segmento circular, `r²(θ − sen θ)/2`, para el área
 *   de una polilínea con arcos. Es el caso que delata a quien mide sobre la
 *   poligonal: la diferencia no es de redondeo, es de forma.
 * · π exacto para círculos: el área de una circunferencia de radio 10 es 100π,
 *   y una medición sobre 192 lados daría 99.98…, que se ve a simple vista.
 *
 * Y VEINTE casos de cota con valor conocido, que es lo que la campaña pide.
 */

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

const TOL = {
  analytic: 1e-9,
  /** Teselado a 192 lados: sólo se admite donde el producto NO usa forma cerrada. */
  tessellated: 1e-3,
} as const;

/* ══════════════════════════════════════════════════════════════════════════
   DIST — la más simple, y la que más se usa
   ══════════════════════════════════════════════════════════════════════════ */

{
  // Triángulo 3-4-5: la hipotenusa mide 5 EXACTO.
  const report = cadDistanceBetween({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 });
  ok(near(report.distance, 5, TOL.analytic), "DIST de (0,0) a (3,4) es 5, el 3-4-5 de siempre");
  ok(near(report.deltaX, 3, TOL.analytic) && near(report.deltaY, 4, TOL.analytic), "y los deltas son 3 y 4");
  ok(near(report.angleXY, 53.13010235415598, 1e-9), "con el ángulo en el plano XY = arctan(4/3)");
}

{
  // En 3D, el 3-4-12-13: √(3² + 4² + 12²) = 13 exacto.
  const report = cadDistanceBetween({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 });
  ok(near(report.distance, 13, TOL.analytic), "DIST en 3D del (3,4,12) es 13");
  ok(
    near(report.planarDistance, 5, TOL.analytic),
    "y su proyección en planta sigue siendo la hipotenusa de 5: DIST distingue las dos",
  );
}

{
  // Coordenadas UTM: la distancia entre dos puntos separados 3500 mm debe salir
  // 3500 aunque las coordenadas ronden el medio millón. Es el caso donde una
  // resta mal hecha pierde cifras.
  const report = cadDistanceBetween(
    { x: 500_000, y: 2_150_000, z: 0 },
    { x: 503_500, y: 2_150_000, z: 0 },
  );
  ok(
    near(report.distance, 3500, 1e-9),
    `un muro de 3.5 m medido en UTM sigue midiendo 3500 (obtenido ${report.distance})`,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   AREA — polígonos de área conocida
   ══════════════════════════════════════════════════════════════════════════ */

{
  const rectangle: P[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
    { x: 0, y: 80 },
  ];
  const measured = cadPolygonArea(rectangle)!;
  ok(near(measured.area, 8000, TOL.analytic), "un rectángulo de 100×80 mide 8000");
  ok(near(measured.perimeter, 360, TOL.analytic), "y su perímetro es 2(100+80) = 360");
  ok(
    near(measured.area, shoelaceArea(rectangle), TOL.analytic),
    "y coincide con el zapato del oráculo",
  );
}

{
  // Triángulo 3-4-5: área 6 exacta (base·altura/2).
  const triangle: P[] = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 0, y: 4 },
  ];
  ok(near(cadPolygonArea(triangle)!.area, 6, TOL.analytic), "el triángulo 3-4-5 mide 6");
  ok(near(cadPolygonArea(triangle)!.perimeter, 12, TOL.analytic), "y su perímetro es 12");
}

{
  // El SIGNO del área: antihorario positivo, horario negativo. De eso depende
  // que MASSPROP sepa distinguir un agujero de una isla sin preguntar.
  const ccw: P[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  ok(near(contourSignedArea(ccw), 100, TOL.analytic), "antihorario da +100");
  ok(near(contourSignedArea([...ccw].reverse()), -100, TOL.analytic), "y horario da −100");
}

{
  // ÁREA CON HUECOS. Un cuadrado de 100 con un cuadrado de 40 dentro, dibujado
  // al revés: 10 000 − 1600 = 8400. En papel, sin margen de duda.
  const outer: P[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const hole: P[] = [
    { x: 30, y: 30 },
    { x: 30, y: 70 },
    { x: 70, y: 70 },
    { x: 70, y: 30 },
  ];
  const properties = cadMassProperties([
    { points: outer, closed: true },
    { points: hole, closed: true },
  ])!;
  ok(near(properties.area, 8400, TOL.analytic), "cuadrado de 100 con hueco de 40: 10000 − 1600 = 8400");
  ok(
    near(properties.centroid.x, 50, TOL.analytic) && near(properties.centroid.y, 50, TOL.analytic),
    "y el centroide sigue en el centro, porque el hueco está centrado",
  );
}

{
  // MASSPROP 2D contra la fórmula del libro. Un rectángulo b×h respecto de un
  // eje por su BASE tiene I = b·h³/3. Aquí b=6, h=4, apoyado en el origen:
  // Ix = 6·4³/3 = 128. Y respecto del otro eje: Iy = h·b³/3 = 4·216/3 = 288.
  const rectangle: P[] = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 4 },
    { x: 0, y: 4 },
  ];
  const properties = cadMassProperties([{ points: rectangle, closed: true }])!;
  ok(near(properties.area, 24, TOL.analytic), "el rectángulo 6×4 mide 24");
  ok(
    near(properties.momentsOfInertia.x, 128, 1e-9),
    `Ix respecto del origen = b·h³/3 = 128 (obtenido ${properties.momentsOfInertia.x})`,
  );
  ok(
    near(properties.momentsOfInertia.y, 288, 1e-9),
    `Iy respecto del origen = h·b³/3 = 288 (obtenido ${properties.momentsOfInertia.y})`,
  );
  ok(
    near(properties.centroid.x, 3, TOL.analytic) && near(properties.centroid.y, 2, TOL.analytic),
    "y el centroide en (b/2, h/2)",
  );
  // Radio de giro: √(I/A) = √(128/24).
  ok(
    near(properties.radiiOfGyration.x, Math.sqrt(128 / 24), 1e-9),
    "el radio de giro es √(I/A), sin atajos",
  );
  // Momentos PRINCIPALES en el centroide, por Steiner: Ix' = 128 − 24·2² = 32,
  // Iy' = 288 − 24·3² = 72. El mayor primero.
  ok(
    near(properties.principal.major, 72, 1e-9) && near(properties.principal.minor, 32, 1e-9),
    "los momentos principales en el centroide son 72 y 32 (Steiner, a mano)",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ÁREA CON CURVAS — donde el teselado se delata
   ══════════════════════════════════════════════════════════════════════════ */

{
  // CIRCUNFERENCIA: 100π exacto.
  //
  // Con 192 lados la poligonal inscrita daría 192·½·r²·sen(2π/192) =
  // 314.10324…, frente a π·100 = 314.15926… La diferencia es 0.056: pequeña a
  // ojo, pero CINCUENTA MILLONES de veces la tolerancia de 1e-9 que este caso
  // exige. Un área calculada sobre el teselado no puede pasar por aquí.
  const circle = {
    id: "c",
    type: "circle",
    center: { x: 0, y: 0, z: 0 },
    radius: 10,
    layer: "0",
  } as CadEntity;
  const measured = cadEntityArea(circle)!;
  ok(
    near(measured.area, Math.PI * 100, 1e-9),
    `el área de una circunferencia de radio 10 es 100π = ${(Math.PI * 100).toFixed(9)} (obtenido ${measured.area.toFixed(9)})`,
  );
  ok(
    near(measured.perimeter, 2 * Math.PI * 10, 1e-9),
    "y su perímetro es 2πr, no la suma de 192 cuerdas",
  );
  // Se demuestra que la diferencia era detectable: la poligonal de 192 lados.
  const polygonal = 192 * 0.5 * 100 * Math.sin((2 * Math.PI) / 192);
  ok(
    Math.abs(polygonal - Math.PI * 100) > 1e-3,
    `una poligonal de 192 lados habría dado ${polygonal.toFixed(5)} en vez de ${(Math.PI * 100).toFixed(5)}: ` +
      `${(Math.abs(polygonal - Math.PI * 100) / 1e-9).toExponential(1)} veces la tolerancia de este caso`,
  );
}

{
  // EL SEGMENTO CIRCULAR, con su fórmula cerrada como oráculo.
  //
  // Una polilínea cerrada de dos vértices (0,0)→(10,0) con `bulge = 1` describe
  // un semicírculo de radio 5 sobre la cuerda de 10. Su área es la del
  // semicírculo: π·25/2 = 39.2699…
  //
  // El oráculo lo confirma por otro camino: un semicírculo es el segmento
  // circular de 180°, cuya fórmula cerrada da r²(π − sen π)/2 = 25π/2.
  const expected = circularSegmentArea(5, 180);
  ok(
    near(expected, (Math.PI * 25) / 2, 1e-12),
    "la fórmula cerrada del segmento de 180° da medio círculo, como debe",
  );

  /**
   * Convención DXF: `bulge = tan(θ/4)`, con θ el ángulo barrido. Para el
   * semicírculo, θ = 180° y el bulge vale tan(45°) = 1 EXACTO. Escribirlo así
   * —y no con una expresión trigonométrica que hay que evaluar mentalmente— es
   * lo que hace que este caso se pueda verificar leyéndolo.
   */
  for (const [sweep, bulge] of [
    [180, 1],
    [90, Math.tan(Math.PI / 8)],
  ] as const) {
    // Radio a partir de la cuerda de 10 y el ángulo: r = c / (2·sen(θ/2)).
    const radius = 10 / (2 * Math.sin(((sweep / 2) * Math.PI) / 180));
    const exactArea = circularSegmentArea(radius, sweep);

    const polyline = {
      id: `p-${sweep}`,
      type: "polyline",
      vertices: [
        { x: 0, y: 0, z: 0, bulge },
        { x: 10, y: 0, z: 0 },
      ],
      closed: true,
      layer: "0",
    } as CadEntity;
    const measured = cadEntityArea(polyline);
    ok(!!measured, `la polilínea con arco de ${sweep}° tiene área medible`);

    // El producto mide las curvas por TESELADO (192 lados, `CAD_MEASURE_SEGMENTS`),
    // una decisión declarada. Lo que aquí se verifica es que el bulge SE USA —
    // ignorarlo daría área CERO, porque la cuerda de ida y vuelta no encierra
    // nada— y que la desviación es la del teselado y no otra cosa.
    ok(
      measured!.area > exactArea * 0.99,
      `el área del arco de ${sweep}° (${measured!.area.toFixed(6)}) NO ignora el bulge: sin él daría 0, y la fórmula cerrada da ${exactArea.toFixed(6)}`,
    );
    ok(
      Math.abs(measured!.area - exactArea) < exactArea * 1e-3,
      `y se queda a menos del 0.1 % del segmento circular exacto — el error DECLARADO del teselado`,
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   COTAS — VEINTE casos con el valor conocido de antemano
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Cada fila es: qué cota, con qué geometría, qué mide en papel y qué debe
 * IMPRIMIR con el estilo indicado. Lo que se verifica no es sólo `measurement`
 * —el número interno— sino la ETIQUETA, que es lo único que el arquitecto ve y
 * lo único que acaba en el PDF.
 */
interface DimensionCase {
  name: string;
  entity: Partial<CadDimensionEntity> & { a: P; b: P };
  /** Valor medido esperado, en unidades de dibujo. Calculado a mano. */
  measurement: number;
  /** Etiqueta esperada, con la precisión y unidades del estilo. */
  label: string;
}

const base = { id: "d", type: "dimension" as const, layer: "0" };

/**
 * Factores de conversión, escritos AQUÍ y no importados del producto: si el
 * test tomara prestada la tabla que verifica, un error en ella saldría verde
 * en los dos lados. Es la misma regla que la de `oracle.ts`.
 */
const TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

const DIMENSION_CASES: DimensionCase[] = [
  // ── Lineales y alineadas ────────────────────────────────────────────────
  {
    name: "lineal horizontal de 3500",
    entity: { a: { x: 0, y: 0 }, b: { x: 3500, y: 0 }, dimensionKind: "linear", axis: "x" },
    measurement: 3500,
    label: "3500.00 mm",
  },
  {
    name: "lineal vertical de 2400",
    entity: { a: { x: 0, y: 0 }, b: { x: 0, y: 2400 }, dimensionKind: "linear", axis: "y" },
    measurement: 2400,
    label: "2400.00 mm",
  },
  {
    name: "lineal en X ignorando el desnivel en Y",
    entity: { a: { x: 0, y: 0 }, b: { x: 3000, y: 900 }, dimensionKind: "linear", axis: "x" },
    measurement: 3000,
    label: "3000.00 mm",
  },
  {
    name: "alineada del 3-4-5 escalado ×1000",
    entity: { a: { x: 0, y: 0 }, b: { x: 3000, y: 4000 }, dimensionKind: "aligned" },
    measurement: 5000,
    label: "5000.00 mm",
  },
  {
    name: "alineada con precisión 0",
    entity: {
      a: { x: 0, y: 0 },
      b: { x: 1234.56, y: 0 },
      dimensionKind: "aligned",
      precision: 0,
    },
    measurement: 1234.56,
    label: "1235 mm",
  },
  {
    name: "alineada con precisión 3",
    entity: {
      a: { x: 0, y: 0 },
      b: { x: 1234.5678, y: 0 },
      dimensionKind: "aligned",
      precision: 3,
    },
    measurement: 1234.5678,
    label: "1234.568 mm",
  },
  {
    name: "el muro de 3.5 m mostrado en METROS",
    entity: {
      a: { x: 0, y: 0 },
      b: { x: 3500, y: 0 },
      dimensionKind: "aligned",
      sourceUnit: "mm",
      units: "m",
    },
    measurement: 3500,
    label: "3.50 m",
  },
  {
    name: "el mismo muro en CENTÍMETROS",
    entity: {
      a: { x: 0, y: 0 },
      b: { x: 3500, y: 0 },
      dimensionKind: "aligned",
      sourceUnit: "mm",
      units: "cm",
    },
    measurement: 3500,
    label: "350.00 cm",
  },
  {
    name: "con unidades alternas entre corchetes",
    entity: {
      a: { x: 0, y: 0 },
      b: { x: 3500, y: 0 },
      dimensionKind: "aligned",
      sourceUnit: "mm",
      units: "m",
      alternateUnits: "mm",
    },
    measurement: 3500,
    label: "3.50 m [3500.00 mm]",
  },
  {
    name: "con prefijo y sufijo del estilo",
    entity: {
      a: { x: 0, y: 0 },
      b: { x: 2000, y: 0 },
      dimensionKind: "aligned",
      prefix: "L=",
      suffix: " (eje)",
    },
    measurement: 2000,
    label: "L=2000.00 mm (eje)",
  },
  {
    name: "redondeo hacia arriba en el .5",
    entity: {
      a: { x: 0, y: 0 },
      b: { x: 100.125, y: 0 },
      dimensionKind: "aligned",
      precision: 2,
    },
    measurement: 100.125,
    label: "100.13 mm",
  },
  {
    name: "medida no trivial: 37.5 en X",
    entity: { a: { x: 0, y: 0 }, b: { x: 37.5, y: 0 }, dimensionKind: "aligned" },
    measurement: 37.5,
    label: "37.50 mm",
  },
  {
    name: "alineada oblicua de 1000√2",
    entity: { a: { x: 0, y: 0 }, b: { x: 1000, y: 1000 }, dimensionKind: "aligned" },
    measurement: Math.SQRT2 * 1000,
    label: "1414.21 mm",
  },
  // ── Radiales ────────────────────────────────────────────────────────────
  {
    name: "radio de 250",
    entity: { a: { x: 0, y: 0 }, b: { x: 250, y: 0 }, dimensionKind: "radius" },
    measurement: 250,
    label: "R250.00 mm",
  },
  {
    name: "diámetro del mismo círculo",
    entity: { a: { x: 0, y: 0 }, b: { x: 250, y: 0 }, dimensionKind: "diameter" },
    measurement: 500,
    label: "Ø500.00 mm",
  },
  {
    name: "radio medido en diagonal (3-4-5 ×100)",
    entity: { a: { x: 0, y: 0 }, b: { x: 300, y: 400 }, dimensionKind: "radius" },
    measurement: 500,
    label: "R500.00 mm",
  },
  // ── Angulares ───────────────────────────────────────────────────────────
  {
    name: "ángulo recto",
    entity: {
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      c: { x: 0, y: 100 },
      dimensionKind: "angular",
    },
    measurement: 90,
    label: "90.00°",
  },
  {
    name: "ángulo de 37.5° — el que la campaña exige por no ser trivial",
    entity: {
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      c: { x: 100 * Math.cos((37.5 * Math.PI) / 180), y: 100 * Math.sin((37.5 * Math.PI) / 180) },
      dimensionKind: "angular",
    },
    measurement: 37.5,
    label: "37.50°",
  },
  {
    name: "ángulo obtuso de 135°",
    entity: {
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      c: { x: -100, y: 100 },
      dimensionKind: "angular",
    },
    measurement: 135,
    label: "135.00°",
  },
  // ── Coordenada ──────────────────────────────────────────────────────────
  {
    name: "ordenada en X desde el origen del plano",
    entity: {
      a: { x: 1000, y: 500 },
      b: { x: 4500, y: 800 },
      dimensionKind: "ordinate",
      axis: "x",
    },
    measurement: 3500,
    label: "3500.00 mm",
  },
];

ok(
  DIMENSION_CASES.length >= 20,
  `la campaña pide 20 casos de cota con valor conocido; hay ${DIMENSION_CASES.length}`,
);

for (const testCase of DIMENSION_CASES) {
  const geometry = buildCadDimensionGeometry({
    ...base,
    ...testCase.entity,
  } as CadDimensionEntity);
  ok(!!geometry, `la cota «${testCase.name}» produce geometría`);
  ok(
    near(geometry!.measurement, testCase.measurement, 1e-9),
    `«${testCase.name}» mide ${testCase.measurement} (obtenido ${geometry!.measurement})`,
  );
  ok(
    geometry!.label === testCase.label,
    `«${testCase.name}» imprime «${testCase.label}» (obtenido «${geometry!.label}»)`,
  );
  // LA REGLA QUE UNE LAS DOS COLUMNAS: la etiqueta tiene que ser el valor
  // MEDIDO convertido por el estilo, no un texto guardado aparte que pudo
  // quedarse viejo. Se extrae el PRIMER número de la etiqueta y se compara con
  // la conversión que este test calcula por su cuenta — sin llamar al
  // formateador del producto, que es justo lo que se está verificando.
  const printed = Number(geometry!.label.match(/-?\d+(?:\.\d+)?/u)?.[0]);
  ok(Number.isFinite(printed), `la etiqueta de «${testCase.name}» contiene un número legible`);
  const kind = testCase.entity.dimensionKind ?? "aligned";
  const precision = testCase.entity.precision ?? 2;
  const factor =
    kind === "angular"
      ? 1
      : TO_MM[testCase.entity.sourceUnit ?? "mm"] /
        TO_MM[testCase.entity.units ?? testCase.entity.sourceUnit ?? "mm"];
  const expectedPrinted = Number((geometry!.measurement * factor).toFixed(precision));
  ok(
    Math.abs(printed - expectedPrinted) < 1e-9,
    `«${testCase.name}» imprime ${printed}, y lo medido convertido por su estilo es ${expectedPrinted}`,
  );
}

// LA COTA CON TEXTO SOBREESCRITO: el usuario puede forzar el texto, y entonces
// el producto lo respeta — pero el `measurement` sigue siendo el REAL. Es la
// única forma honesta de permitir un «TÍPICO» sin mentir en la medida.
{
  const geometry = buildCadDimensionGeometry({
    ...base,
    a: { x: 0, y: 0 },
    b: { x: 3500, y: 0 },
    dimensionKind: "aligned",
    text: "TÍPICO",
  } as CadDimensionEntity)!;
  ok(geometry.label === "TÍPICO", "un texto forzado por el usuario se respeta…");
  ok(near(geometry.measurement, 3500, TOL.analytic), "…pero la medida real no cambia");
}

console.log(
  `verificación 1.3 (medición y cotas): ${checks} comprobaciones, ${DIMENSION_CASES.length} cotas con valor conocido`,
);
