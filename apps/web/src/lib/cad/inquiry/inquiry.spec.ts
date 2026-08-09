/**
 * Geometría y volcados de las consultas.
 *
 * ## Anclas absolutas, no propiedades vacías
 *
 * El área de un rectángulo de 40×30 es 1200. No «aproximadamente 1200», ni «lo
 * mismo que devuelva la otra rama del código»: 1200. Todas las figuras de esta
 * spec tienen momentos de inercia con forma cerrada conocida, así que cada
 * número se compara contra la fórmula del prontuario y no contra sí mismo.
 *
 * Eso mata dos fallos que una comprobación relativa no vería: un centroide que
 * se calcula sobre el rectángulo delimitador en vez de sobre la figura (mismo
 * valor en un rectángulo, distinto en un triángulo) y unos momentos que se dan
 * respecto del centroide cuando el informe dice «respecto del origen».
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../cad-document";
import {
  cadEntityArea,
  cadEntityContours,
  cadMassProperties,
  cadPolygonArea,
  contourPerimeter,
  contourSignedArea,
} from "./contours";
import {
  accumulateCadArea,
  cadDistanceBetween,
  cadInquiryLens,
  describeCadEntity,
  EMPTY_CAD_AREA,
  formatCadAreaReport,
  formatCadDistanceReport,
  formatCadMassProperties,
  formatCadPoint,
} from "./reports";
import { createCadVariableAccess } from "../system-variables";

let checks = 0;
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}
function equal(actual: unknown, expected: unknown, what: string) {
  checks += 1;
  assert.equal(actual, expected, `${what}: se esperaba ${String(expected)}, salió ${String(actual)}`);
}
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}

const rectangle = (id: string, x: number, y: number, w: number, h: number): CadEntity => ({
  id,
  type: "polyline",
  vertices: [
    { x, y, z: 0 },
    { x: x + w, y, z: 0 },
    { x: x + w, y: y + h, z: 0 },
    { x, y: y + h, z: 0 },
  ],
  closed: true,
  layer: "0",
});

// ---------------------------------------------------------------------------
// Áreas: valores exactos
// ---------------------------------------------------------------------------

{
  const measured = cadEntityArea(rectangle("r", 0, 0, 40, 30));
  ok(measured !== null, "un rectángulo cerrado tiene área");
  near(measured!.area, 1200, 1e-9, "40×30 = 1200");
  near(measured!.perimeter, 140, 1e-9, "perímetro 2·(40+30)");
  equal(measured!.assumedClosed, false, "una polilínea cerrada no se cierra por suposición");
}

// El círculo va por forma cerrada: la teselación de 192 lados se quedaría un
// 0,014 % corta y una medición no puede depender de cuántos lados se dibujaron.
{
  const circle: CadEntity = { id: "c", type: "circle", center: { x: 5, y: 5, z: 0 }, radius: 10, layer: "0" };
  const measured = cadEntityArea(circle);
  near(measured!.area, Math.PI * 100, 1e-9, "área del círculo es exactamente πr²");
  near(measured!.perimeter, 2 * Math.PI * 10, 1e-9, "y su longitud, 2πr");
  const tessellated = Math.abs(contourSignedArea(cadEntityContours(circle)[0].points));
  ok(tessellated < Math.PI * 100 - 1e-4, "la teselación SÍ se queda corta: por eso hay caso especial");
}

// Una polilínea ABIERTA se cierra para medir, y el resultado lo declara.
{
  const open: CadEntity = {
    id: "open",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 40, y: 0, z: 0 },
      { x: 40, y: 30, z: 0 },
    ],
    closed: false,
    layer: "0",
  };
  const measured = cadEntityArea(open);
  near(measured!.area, 600, 1e-9, "el triángulo que resulta de cerrarla mide 600");
  equal(measured!.assumedClosed, true, "y se DECLARA que se ha cerrado: AREA tiene que decirlo");
}

// Lo que no encierra nada no da un número: da `null`.
for (const entity of [
  { id: "l", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" },
  { id: "p", type: "point", position: { x: 1, y: 1, z: 0 }, layer: "0" },
] as CadEntity[])
  equal(cadEntityArea(entity), null, `un ${entity.type} no encierra área`);

equal(cadPolygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }]), null, "dos puntos no son un polígono");
near(
  cadPolygonArea([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }])!.area,
  1200,
  1e-9,
  "el AREA por puntos da lo mismo que por objeto",
);

// ---------------------------------------------------------------------------
// MASSPROP: contra el prontuario
// ---------------------------------------------------------------------------

// Rectángulo b×h con la esquina en el origen. Del prontuario:
//   A = bh, centroide (b/2, h/2), Ixx = bh³/3, Iyy = hb³/3, Ixy = b²h²/4.
{
  const b = 40;
  const h = 30;
  const properties = cadMassProperties(cadEntityContours(rectangle("r", 0, 0, b, h)));
  ok(properties !== null, "el rectángulo tiene propiedades de masa");
  near(properties!.area, b * h, 1e-9, "área");
  near(properties!.centroid.x, b / 2, 1e-9, "centroide X");
  near(properties!.centroid.y, h / 2, 1e-9, "centroide Y");
  near(properties!.momentsOfInertia.x, (b * h ** 3) / 3, 1e-6, "Ixx respecto del origen = bh³/3");
  near(properties!.momentsOfInertia.y, (h * b ** 3) / 3, 1e-6, "Iyy respecto del origen = hb³/3");
  near(properties!.productOfInertia, (b ** 2 * h ** 2) / 4, 1e-6, "Ixy respecto del origen = b²h²/4");
  near(properties!.radiiOfGyration.x, Math.sqrt(h ** 2 / 3), 1e-9, "radio de giro X = h/√3");
  // Principales en el centroide: bh³/12 y hb³/12. El mayor es el del lado largo.
  near(properties!.principal.major, (h * b ** 3) / 12, 1e-6, "momento principal mayor");
  near(properties!.principal.minor, (b * h ** 3) / 12, 1e-6, "momento principal menor");
  // El eje del momento MAYOR de un rectángulo tumbado es el VERTICAL: el mayor
  // es Iyy = ∫x²dA, y su eje es el Y. Que salga 90 y no 0 es lo que distingue
  // un cálculo correcto de uno que devuelve siempre el eje X.
  near(properties!.principal.angleDeg, 90, 1e-9, "rectángulo tumbado: eje principal vertical");
}

// El mismo rectángulo de pie da 0: el eje principal es el horizontal.
{
  const properties = cadMassProperties(cadEntityContours(rectangle("v", 0, 0, 30, 40)))!;
  near(properties.principal.angleDeg, 0, 1e-9, "rectángulo de pie: eje principal horizontal");
  near(properties.principal.major, (30 * 40 ** 3) / 12, 1e-6, "y el mayor es Ixx");
}

// Un cuadrado no tiene dirección privilegiada: los dos principales coinciden.
{
  const properties = cadMassProperties(cadEntityContours(rectangle("q", 0, 0, 20, 20)))!;
  near(
    properties.principal.major - properties.principal.minor,
    0,
    1e-6,
    "en un cuadrado los momentos principales son iguales",
  );
}

// Triángulo (0,0)-(b,0)-(0,h): centroide en (b/3, h/3), que NO es el centro del
// rectángulo delimitador. Es el ancla que caza un centroide calculado sobre la
// caja en vez de sobre la figura.
{
  const triangle: CadEntity = {
    id: "t",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 60, y: 0, z: 0 },
      { x: 0, y: 30, z: 0 },
    ],
    closed: true,
    layer: "0",
  };
  const properties = cadMassProperties(cadEntityContours(triangle))!;
  near(properties.area, (60 * 30) / 2, 1e-9, "área del triángulo = bh/2");
  near(properties.centroid.x, 20, 1e-9, "centroide X = b/3, no b/2");
  near(properties.centroid.y, 10, 1e-9, "centroide Y = h/3, no h/2");
  near(properties.momentsOfInertia.x, (60 * 30 ** 3) / 12, 1e-6, "Ixx del triángulo = bh³/12");
}

// Una región con AGUJERO: el contorno interior dibujado al revés se resta.
{
  const outer = rectangle("o", 0, 0, 40, 40);
  const holeVertices = [
    { x: 10, y: 10, z: 0 },
    { x: 10, y: 30, z: 0 },
    { x: 30, y: 30, z: 0 },
    { x: 30, y: 10, z: 0 },
  ];
  const contours = [
    ...cadEntityContours(outer),
    { points: holeVertices, closed: true },
  ];
  const properties = cadMassProperties(contours)!;
  near(properties.area, 1600 - 400, 1e-9, "el hueco se resta: 40² − 20²");
  near(properties.centroid.x, 20, 1e-9, "y el centroide sigue en el centro, por simetría");
}

equal(cadMassProperties([]), null, "sin contornos no hay propiedades de masa");
near(contourPerimeter([{ x: 0, y: 0 }, { x: 3, y: 4 }], false), 5, 1e-12, "3-4-5 abierto");
near(contourPerimeter([{ x: 0, y: 0 }, { x: 3, y: 4 }], true), 10, 1e-12, "y cerrado, ida y vuelta");

// ---------------------------------------------------------------------------
// Volcados: DIST con SCU, LIST y MASSPROP
// ---------------------------------------------------------------------------

{
  const report = cadDistanceBetween({ x: 0, y: 0, z: 0 }, { x: 30, y: 40, z: 0 });
  near(report.distance, 50, 1e-12, "3-4-5 escalado");
  near(report.angleXY, 53.13010235415598, 1e-9, "ángulo en el plano");
  const lines = formatCadDistanceReport(report, cadInquiryLens(createCadVariableAccess()).format);
  ok(lines[0].includes("Distancia = 50.0000"), `el primer renglón lleva la distancia: ${lines[0]}`);
  ok(lines[1].includes("Delta X = 30.0000"), `y el segundo los deltas: ${lines[1]}`);
}

// El SCU cambia lo que se INFORMA: mismo punto del mundo, otras coordenadas.
{
  const lens = cadInquiryLens(
    createCadVariableAccess({ UCSNAME: "PLANTA", UCSORGX: 100, UCSORGY: 50, UCSANGLE: 90 }),
  );
  const local = lens.point({ x: 100, y: 60, z: 0 });
  near(local.x, 10, 1e-9, "el punto (100,60) está 10 arriba del origen del SCU, que gira 90°");
  near(local.y, 0, 1e-9, "y a cero de su eje Y");
  // Un desplazamiento GIRA pero no se traslada: es el error clásico de DIST.
  const delta = lens.vector({ x: 10, y: 0 });
  near(delta.x, 0, 1e-9, "un delta hacia el este es un delta hacia −Y en un SCU girado 90°");
  near(delta.y, -10, 1e-9, "y no se le suma el origen");
  near(lens.angle(90), 0, 1e-9, "un ángulo del mundo de 90° es 0° en el SCU");
}

// AREA acumula sumando y restando, y lo dice.
{
  let accumulator = EMPTY_CAD_AREA;
  accumulator = accumulateCadArea(accumulator, 1200, 140, "add");
  accumulator = accumulateCadArea(accumulator, 200, 60, "subtract");
  near(accumulator.total, 1000, 1e-9, "1200 menos 200");
  near(accumulator.perimeterTotal, 80, 1e-9, "y los perímetros también se restan");
  const text = formatCadAreaReport(accumulator, cadInquiryLens().format);
  ok(text.includes("1000.0000"), `el total sale escrito: ${text}`);
  ok(text.includes("1 sumada(s), 1 restada(s)"), `y el desglose también: ${text}`);
}

// LIST vuelca las propiedades que da el REGISTRO, no una lista escrita a mano.
{
  const circle: CadEntity = {
    id: "c1",
    type: "circle",
    center: { x: 5, y: 5, z: 0 },
    radius: 10,
    layer: "MUROS",
    context: { handle: "2F", presentation: { color: { source: "explicit", value: "#ff0000" } } },
  };
  const lines = describeCadEntity(circle, cadInquiryLens().format);
  const dump = lines.join("\n");
  ok(dump.startsWith("CIRCLE"), "encabeza con el tipo");
  ok(dump.includes(`Capa: "MUROS"`), "y con la capa");
  ok(dump.includes("Handle: 2F"), "el handle sale si lo hay");
  ok(dump.includes("#ff0000"), "el color explícito sale como color, no como PorCapa");
  ok(dump.includes("radius: 10.0000"), "la propiedad `radius` sale del adaptador");
  ok(dump.includes("centerX: 5.0000"), "y `centerX` también");
  ok(dump.includes("Área:"), "un círculo encierra un área y LIST la da");
  ok(dump.includes("Extensión:"), "y su rectángulo delimitador");
}

{
  const properties = cadMassProperties(cadEntityContours(rectangle("r", 0, 0, 40, 30)))!;
  const lines = formatCadMassProperties(properties, cadInquiryLens().format);
  ok(lines.some((line) => line.includes("Centroide")), "el volcado nombra el centroide");
  ok(lines.some((line) => line.includes("Radios de giro")), "y los radios de giro");
  ok(lines.some((line) => line.includes("Momentos principales")), "y los momentos principales");
}

equal(
  formatCadPoint({ x: 1.5, y: -2.25, z: 0 }, cadInquiryLens().format),
  "X = 1.5000  Y = -2.2500  Z = 0.0000",
  "ID escribe las tres coordenadas con el formato del dibujo",
);

console.log(`inquiry.spec: ${checks} comprobaciones verdes.`);
