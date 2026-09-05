/**
 * La aritmética del levantamiento, contra un cuadro de cinco lados.
 *
 *   - Los rumbos van y vuelven en los CUATRO cuadrantes y en los cuatro
 *     límites (0°, 90°, 180° y 270°), que es donde un rumbo con dos
 *     escrituras posibles pierde una cifra.
 *   - Los grados-minutos-segundos van y vuelven sin perder cifra, y el
 *     redondeo que produce «60"» acarrea en vez de escribirlo.
 *   - Un rumbo mal escrito se rechaza CON SU MOTIVO. Ninguno degrada a 0:
 *     un cero inventado es un lindero al norte.
 *   - La poligonal de cinco lados —rumbos a segundo entero y distancias al
 *     milímetro, como las publica un cuadro— cierra por debajo de 1 mm, y su
 *     superficie coincide con la de Gauss calculada aquí, a mano, sobre los
 *     vértices.
 *   - El cierre angular se mide contra los ángulos LEÍDOS: 20" mal leídos en
 *     una estación salen como 20" de error angular y como centímetros de
 *     error lineal.
 *   - La regla del compás cierra exacto y dice cuánto movió cada vértice.
 *   - El cuadro de construcción escribe las siete columnas del Registro.
 */
import { strict as assert } from "node:assert";
import {
  CAD_CONSTRUCTION_TABLE_HEADER,
  cadAngularClosure,
  cadAzimuthBearing,
  cadAzimuthToRadians,
  cadBearingAzimuth,
  cadBearingBetween,
  cadCompensateTraverse,
  cadConstructionTable,
  cadCoursesFromAngles,
  cadDegreesToDms,
  cadDmsToDegrees,
  cadFormatBearing,
  cadFormatDms,
  cadFormatPrecision,
  cadInteriorAngles,
  cadNormalizeAzimuth,
  cadParseBearing,
  cadParseCourse,
  cadParseCourses,
  cadParseDms,
  cadRadiansToAzimuth,
  cadTraverse,
  type CadBearing,
} from "./geo-cogo";
import type { CadPoint2 } from "./cad-document";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (actual: number, expected: number, tolerance: number, message: string) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} (era ${actual}, se esperaba ${expected} ± ${tolerance})`);
  checks += 1;
};

/* ── 1. Grados, minutos y segundos ──────────────────────────────────────── */
{
  eq(cadDegreesToDms(45.5055555555556), { degrees: 45, minutes: 30, seconds: 20 }, "45.50555…° son 45°30'20\"");
  near(cadDmsToDegrees({ degrees: 45, minutes: 30, seconds: 20 }), 45.505555555555556, 1e-12, "y la vuelta");
  eq(cadFormatDms(45.5055555555556), "45°30'20\"", "el formato de plano, con minutos y segundos a dos cifras");
  eq(cadFormatDms(5.085), "5°05'06\"", "un solo dígito se rellena con cero: 5°05'06\"");
  eq(cadFormatDms(0), "0°00'00\"", "el cero se escribe entero");
  // El acarreo: sin él saldría 44°59'60", que no es una hora del reloj ni un
  // ángulo de un plano.
  eq(cadFormatDms(44.99999999), "45°00'00\"", "redondear los segundos acarrea a los minutos y a los grados");
  eq(cadFormatDms(9.999999 / 60 + 30), "30°10'00\"", "y el acarreo se queda en los minutos cuando toca");
  eq(cadFormatDms(45.5055555555556, 2), "45°30'20.00\"", "con decimales de segundo");
  eq(cadFormatDms(-12.5), "-12°30'00\"", "el signo va delante");

  // Ida y vuelta por texto, campo a campo, sin perder cifra.
  for (const [d, m, s] of [[0, 0, 0], [1, 2, 3], [45, 30, 20], [89, 59, 59], [12, 4, 10], [78, 22, 45], [62, 15, 30], [90, 0, 0]] as const) {
    const degrees = cadDmsToDegrees({ degrees: d, minutes: m, seconds: s });
    const text = cadFormatDms(degrees);
    const parsed = cadParseDms(text);
    ok(parsed.ok, `«${text}» se vuelve a leer`);
    if (parsed.ok) {
      eq(cadDegreesToDms(parsed.value), { degrees: d, minutes: m, seconds: s }, `${text} vuelve entero`);
      near(parsed.value, degrees, 1e-12, `${text} vuelve al mismo número`);
    }
  }

  // Las formas con que se teclea de verdad dan todas el mismo ángulo.
  for (const text of ["45°30'20\"", "45d30m20s", "45-30-20", "45 30 20", "45:30:20"]) {
    const parsed = cadParseDms(text);
    ok(parsed.ok, `«${text}» se entiende`);
    if (parsed.ok) near(parsed.value, 45.5055555555556, 1e-9, `«${text}» son 45°30'20"`);
  }
  const decimal = cadParseDms("45.5");
  ok(decimal.ok && Math.abs(decimal.value - 45.5) < 1e-12, "un ángulo decimal a secas también entra");

  // Y lo que no es un ángulo se rechaza CON MOTIVO.
  const badMinutes = cadParseDms("45°70'00\"");
  ok(!badMinutes.ok && badMinutes.reason.includes("minutos van de 0 a 59"), `70 minutos se rechazan diciéndolo: ${JSON.stringify(badMinutes)}`);
  const badSeconds = cadParseDms("45°30'60\"");
  ok(!badSeconds.ok && badSeconds.reason.includes("segundos van de 0"), "60 segundos escritos a mano se rechazan");
  const tooMany = cadParseDms("45 30 20 10");
  ok(!tooMany.ok && tooMany.reason.includes("tres como mucho"), "cuatro campos no son un ángulo");
  ok(!cadParseDms("").ok, "vacío no es un ángulo");
  ok(!cadParseDms("abc").ok, "letras no son un ángulo");
}

/* ── 2. Rumbos: los cuatro cuadrantes y los cuatro límites ──────────────── */
{
  eq(cadNormalizeAzimuth(-30), 330, "un azimut negativo se normaliza, no se rechaza");
  eq(cadNormalizeAzimuth(370), 10, "y uno que pasa de la vuelta también");

  // Los ángulos se arman desde sus `d m s` para que el número de la prueba sea
  // el mismo que sale de leer el papel, y no un decimal tecleado a ojo.
  const dms = (d: number, m: number, s: number) => cadDmsToDegrees({ degrees: d, minutes: m, seconds: s });
  const cases: readonly (readonly [CadBearing, string])[] = [
    [{ quadrant: "NE", angleDeg: 0 }, "N"],
    [{ quadrant: "NE", angleDeg: 90 }, "E"],
    [{ quadrant: "SE", angleDeg: 0 }, "S"],
    [{ quadrant: "SW", angleDeg: 90 }, "W"],
    [{ quadrant: "NE", angleDeg: dms(45, 30, 20) }, "N 45°30'20\" E"],
    [{ quadrant: "SE", angleDeg: dms(12, 4, 10) }, "S 12°04'10\" E"],
    [{ quadrant: "SW", angleDeg: dms(78, 22, 45) }, "S 78°22'45\" W"],
    [{ quadrant: "NW", angleDeg: dms(62, 15, 30) }, "N 62°15'30\" W"],
  ];
  for (const [bearing, text] of cases) {
    const azimuth = cadBearingAzimuth(bearing);
    eq(cadFormatBearing(bearing), text, `el azimut ${azimuth.toFixed(6)} se escribe ${text}`);
    // Y el azimut vuelve a ser el mismo rumbo: los cuatro ejes tienen forma
    // canónica justamente para que esto valga también en 0°, 90°, 180° y 270°.
    eq(cadAzimuthBearing(azimuth).quadrant, bearing.quadrant, `el azimut ${azimuth.toFixed(6)} vuelve a su cuadrante`);
    near(cadAzimuthBearing(azimuth).angleDeg, bearing.angleDeg, 1e-12, `y a su ángulo`);
    const parsed = cadParseBearing(text);
    ok(parsed.ok, `«${text}» se vuelve a leer`);
    if (parsed.ok) {
      eq(parsed.value.quadrant, bearing.quadrant, `«${text}» devuelve el mismo cuadrante`);
      near(cadBearingAzimuth(parsed.value), azimuth, 1e-9, `«${text}» vuelve al azimut ${azimuth.toFixed(6)}`);
    }
  }
  // Los ejes con los tres campos, para la notaría que pide la columna pareja.
  eq(cadFormatBearing({ quadrant: "NE", angleDeg: 0 }, { cardinal: false }), "N 0°00'00\" E", "el norte con los tres campos");
  eq(cadFormatBearing({ quadrant: "SW", angleDeg: 90 }, { cardinal: false }), "S 90°00'00\" W", "y el oeste");
  const axis = cadParseBearing("N 0°00'00\" E");
  ok(axis.ok && cadBearingAzimuth(axis.value) === 0, "y esa escritura vuelve al azimut 0");

  // Las escrituras de campo, todas al mismo rumbo.
  for (const text of ["N 45°30'20\" E", "N45d30m20sE", "n 45-30-20 e", "N 45 30 20 E"]) {
    const parsed = cadParseBearing(text);
    ok(parsed.ok, `«${text}» se entiende`);
    if (parsed.ok) near(cadBearingAzimuth(parsed.value), 45.5055555555556, 1e-9, `«${text}» es N 45°30'20" E`);
  }
  const west = cadParseBearing("S 12°04'10\" O");
  ok(west.ok && west.value.quadrant === "SW", "la O de oeste se acepta junto a la W: media libreta mexicana la usa");
  const cardinal = cadParseBearing("sur");
  ok(cardinal.ok && cadBearingAzimuth(cardinal.value) === 180, "«sur» escrito con todas sus letras es el azimut 180");

  // Y lo mal escrito se rechaza CON MOTIVO, nunca degradando a 0.
  const badStart = cadParseBearing("X 45°30'20\" E");
  ok(!badStart.ok && badStart.reason.includes("empieza por N o por S"), `un rumbo que no empieza por meridiano se rechaza: ${JSON.stringify(badStart)}`);
  const badEnd = cadParseBearing("N 45°30'20\" Z");
  ok(!badEnd.ok && badEnd.reason.includes("termina en E, W u O"), "ni el cuadrante inventado");
  const tooWide = cadParseBearing("N 95°00'00\" E");
  ok(!tooWide.ok && tooWide.reason.includes("de 0° a 90°"), `95° no caben en un rumbo: ${JSON.stringify(tooWide)}`);
  const noAngle = cadParseBearing("NE");
  ok(!noAngle.ok && noAngle.reason.includes("no trae ángulo"), "«NE» no es un rumbo: le falta el ángulo");
  ok(!cadParseBearing("").ok, "un rumbo vacío no es un rumbo");
  const inner = cadParseBearing("N 45°70'00\" E");
  ok(!inner.ok && inner.reason.includes("minutos"), "el motivo del ángulo sube hasta el rumbo");
}

/* ── 3. El puente con el ángulo del motor ───────────────────────────────── */
{
  near(cadAzimuthToRadians(0), Math.PI / 2, 1e-15, "el norte son 90° del motor");
  near(cadAzimuthToRadians(90), 0, 1e-15, "el este son 0°");
  near(cadAzimuthToRadians(180), -Math.PI / 2, 1e-15, "el sur, −90°");
  for (const azimuth of [0, 12.5, 90, 137.25, 180, 264.75, 270, 359.5])
    near(cadRadiansToAzimuth(cadAzimuthToRadians(azimuth)), azimuth, 1e-12, `el azimut ${azimuth} va y vuelve por radianes`);
}

/* ── 4. El cuadro de cinco lados ────────────────────────────────────────── */
/**
 * Rumbos a segundo entero y distancias al milímetro, que es como se publica un
 * cuadro de construcción. El quinto lado es el que cierra: se calculó exacto y
 * se redondeó como los demás, así que el error de cierre que queda es
 * EXACTAMENTE el que produce redondear un cuadro real.
 */
const CUADRO = `
# predio de cinco lados, cuadro publicado
1 N 89°58'20" E 42.150
2 S 12°04'10" E 28.300
3 S 78°22'45" W 24.860
4 N 62°15'30" W 21.400
5 N 11°53'00" W 23.197
`;

const block = cadParseCourses(CUADRO);
eq(block.errors, [], "el cuadro entero se entiende, comentario incluido");
eq(block.courses.length, 5, "cinco lados");
eq(block.courses.map((course) => course.label), ["1", "2", "3", "4", "5"], "la etiqueta de cada estación se conserva");
eq(block.courses.map((course) => cadFormatBearing(course.bearing)), ["N 89°58'20\" E", "S 12°04'10\" E", "S 78°22'45\" W", "N 62°15'30\" W", "N 11°53'00\" W"], "y los rumbos vuelven a escribirse igual que se pegaron");

const traverse = cadTraverse({ x: 0, y: 0 }, block.courses);
{
  eq(traverse.points.length, 6, "seis puntos: la estación 1 y el punto de cada tramo");
  eq(traverse.stations.length, 5, "cinco estaciones: el punto de retorno no es un vértice más");
  near(traverse.perimeter, 139.907, 1e-9, "el perímetro es la suma de las distancias");
  ok(traverse.closure.distance < 0.001, `el cierre queda por debajo de 1 mm: ${(traverse.closure.distance * 1000).toFixed(3)} mm`);
  near(traverse.closure.distance, 0.000401, 5e-6, "y vale 0.401 mm, el que deja redondear el quinto lado");
  ok(traverse.closure.precision > 300_000, `la precisión pasa de 1:300 000 — ${cadFormatPrecision(traverse.closure.precision)}`);
  eq(cadFormatPrecision(traverse.closure.precision), "1:348,787", "el 1:N que se rotula");
  eq(traverse.orientation, "cw", "el predio se recorrió en sentido horario");

  // La superficie, por Gauss, calculada AQUÍ sobre los vértices: camino
  // independiente del que usa el módulo.
  let twice = 0;
  for (let index = 0; index < traverse.stations.length; index += 1) {
    const a = traverse.stations[index];
    const b = traverse.stations[(index + 1) % traverse.stations.length];
    twice += a.x * b.y - b.x * a.y;
  }
  const gauss = Math.abs(twice / 2);
  near(traverse.area!, gauss, 1e-9, "la superficie del módulo es la de Gauss sobre los vértices");
  near(gauss, 1231.526, 1e-3, "y vale 1 231.53 m², el predio del cuadro");
}

/* ── 5. Cierre lineal declarado, no forzado ─────────────────────────────── */
{
  const last = traverse.points[traverse.points.length - 1];
  ok(last.x !== traverse.start.x || last.y !== traverse.start.y, "el último punto NO se pega al primero: el cierre se declara, no se fuerza");
  ok(traverse.closure.bearing !== null, "el error de cierre tiene su propio rumbo, que es por donde se fue");
  const open = cadTraverse({ x: 0, y: 0 }, block.courses.slice(0, 3), { closed: false });
  eq(open.area, null, "una poligonal abierta no encierra superficie y no se inventa una");
  eq(open.stations.length, 4, "y sus cuatro puntos son cuatro puntos");
  ok(open.closure.distance > 0, "el cierre se informa igual: saber a qué distancia quedó del origen sirve en las dos");
}

/* ── 6. Ángulos interiores y cierre angular ─────────────────────────────── */
{
  const angles = cadInteriorAngles(block.courses, traverse.stations)!;
  ok(angles !== null, "los ángulos interiores salen de los rumbos");
  eq(angles.orientation, "cw", "el recorrido es horario y los interiores se toman del lado que toca");
  near(angles.sum, 540, 1e-9, "los cinco interiores suman (5−2)·180 = 540°");
  for (const angle of angles.angles) ok(angle > 0 && angle < 360, `cada interior cae en (0, 360): ${cadFormatDms(angle)}`);

  // El cierre angular DE VERDAD: contra los ángulos leídos en el aparato.
  const exact = cadAngularClosure(angles.angles);
  near(exact.errorSeconds, 0, 1e-6, "los ángulos que implican los rumbos cierran por construcción, y se dice");
  const misread = [...angles.angles];
  misread[2] += 20 / 3600;
  const closure = cadAngularClosure(misread);
  near(closure.errorSeconds, 20, 1e-6, "20\" mal leídos en una estación son 20\" de error angular");
  near(closure.perStationSeconds, 4, 1e-6, "que repartidos entre cinco estaciones son 4\" cada una");
  eq(closure.expected, 540, "y el patrón sigue siendo 540°");

  // Y esos 20" se propagan a los rumbos y salen como error de cierre LINEAL.
  const rebuilt = cadCoursesFromAngles(cadBearingAzimuth(block.courses[0].bearing), block.courses.map((course, index) => ({ distance: course.distance, interiorAngleDeg: angles.angles[index] })), { orientation: "cw" });
  const same = cadTraverse({ x: 0, y: 0 }, rebuilt);
  near(same.area!, traverse.area!, 1e-6, "reconstruir la poligonal desde sus ángulos devuelve el mismo predio");
  near(same.closure.distance, traverse.closure.distance, 1e-9, "y el mismo cierre");
  const bent = cadCoursesFromAngles(cadBearingAzimuth(block.courses[0].bearing), block.courses.map((course, index) => ({ distance: course.distance, interiorAngleDeg: misread[index] })), { orientation: "cw" });
  const bentTraverse = cadTraverse({ x: 0, y: 0 }, bent);
  near(bentTraverse.closure.distance * 1000, 5.66, 0.05, "20\" mal leídos en la estación 3 abren el cierre de 0.4 mm a 5.66 mm: el error angular sale como error lineal");
}

/* ── 7. La regla del compás ─────────────────────────────────────────────── */
{
  const compensated = cadCompensateTraverse(traverse)!;
  ok(compensated !== null, "la poligonal se puede compensar");
  eq(compensated.stations.length, 5, "siguen siendo cinco estaciones");
  const ring = compensated.stations;
  const closingLeg = cadBearingBetween(ring[ring.length - 1], ring[0])!;
  const closed = cadTraverse(ring[0], compensated.courses);
  near(closed.closure.distance, 0, 1e-9, "compensada, la poligonal cierra EXACTO");
  ok(closingLeg.distance > 23 && closingLeg.distance < 23.3, "el lado de cierre sigue midiendo lo suyo, no se comió el error");
  ok(compensated.maxShift < 0.0005, `ningún vértice se movió medio milímetro: ${(compensated.maxShift * 1000).toFixed(3)} mm`);
  eq(compensated.shifts[0], 0, "la estación 1 no se mueve: es el origen del reparto");
  near(compensated.area, traverse.area!, 0.02, "la superficie apenas cambia, y el cuánto queda escrito");
  near(compensated.perimeter, traverse.perimeter, 0.002, "y el perímetro también");
}

/* ── 8. Lo que se pega mal, se dice ─────────────────────────────────────── */
{
  const bad = cadParseCourses(["N 45°30'20\" E 25.40", "EST PV RUMBO DISTANCIA", "X 12°00'00\" E 10", "N 45°30'20\" E 1,240.50", "S 10°00'00\" W abc"].join("\n"));
  eq(bad.courses.length, 1, "sólo el renglón bueno produce tramo");
  eq(bad.errors.map((error) => error.line), [2, 3, 4, 5], "y los otros cuatro se devuelven con su número de renglón, no se tiran en silencio");
  ok(bad.errors[1].reason.includes("empieza por N o por S"), "el rumbo inventado dice qué falla");
  ok(bad.errors[2].reason.includes("separador de millares"), `«1,240.50» se rechaza en vez de leerse mil veces mal: ${bad.errors[2].reason}`);
  ok(bad.errors[3].reason.includes("no es un número"), "y «abc» tampoco es una distancia");

  const labelled = cadParseCourse("1 2 N 45°30'20\" E 25.40");
  ok(labelled.ok && labelled.value.label === "1 2", "las etiquetas de estación que trae un cuadro pegado se conservan");
  const byAzimuth = cadParseCourse("AZ 125°30'00\" 25.40");
  ok(byAzimuth.ok && Math.abs(cadBearingAzimuth(byAzimuth.value.bearing) - 125.5) < 1e-9, "y el tramo por azimut, para quien trabaja con el aparato");
}

/* ── 9. El cuadro de construcción ───────────────────────────────────────── */
{
  // Las coordenadas ya en metros, como las publica el cuadro: aquí, las del
  // predio trasladado a un este/norte de la zona 14N.
  const coordinates: CadPoint2[] = traverse.stations.map((station) => ({ x: 660_000 + station.x, y: 2_140_000 + station.y }));
  const table = cadConstructionTable(coordinates)!;
  eq(table.header as string[], ["EST", "PV", "RUMBO", "DISTANCIA", "V", "X", "Y"], "las siete columnas que pide el Registro");
  eq(table.rows.length, 5, "un renglón por lado");
  eq(table.rows[0][0], "1", "EST 1");
  eq(table.rows[0][1], "2", "PV 2");
  eq(table.rows[0][2], "N 89°58'20\" E", "el rumbo del lado 1-2, recalculado sobre las coordenadas");
  eq(table.rows[0][3], "42.150", "y su distancia al milímetro");
  eq(table.rows[0][4], "1", "V 1");
  eq(table.rows[0][5], "660,000.000", "X del vértice 1, con el separador de millares de la región");
  eq(table.rows[0][6], "2,140,000.000", "Y del vértice 1");
  eq(table.rows[4][1], "1", "el último lado vuelve a la estación 1: el cuadro cierra la figura");
  eq(table.areaLabel, "1,231.53 m²", "la superficie por Gauss, en el renglón que la lámina lleva abajo");
  eq(table.perimeterLabel, "139.907 m", "y el perímetro");
  eq(table.orientation, "cw", "el sentido del recorrido queda dicho");
  near(table.area, traverse.area!, 1e-7, "es la misma superficie que la de la poligonal: trasladar no cambia el área");
  // Y el porqué del traslado, medido: el MISMO Gauss sobre las coordenadas UTM
  // sin trasladar pierde cifras, porque los productos valen 1,4 × 10¹² y el
  // área que sale de restarlos vale dos mil.
  let raw = 0;
  for (let index = 0; index < coordinates.length; index += 1) {
    const a = coordinates[index];
    const b = coordinates[(index + 1) % coordinates.length];
    raw += a.x * b.y - b.x * a.y;
  }
  const naive = Math.abs(raw / 2);
  ok(Math.abs(naive - table.area) > 1e-7, `sin trasladar, el mismo Gauss se aparta ${(Math.abs(naive - table.area) * 1e6).toFixed(1)} µm²: por eso el módulo traslada al primer vértice`);
  ok(Math.abs(naive - table.area) < 1e-3, "el desvío es de micras cuadradas, no de metros: es pérdida de cifras, no otro polígono");
  eq(CAD_CONSTRUCTION_TABLE_HEADER.length, 7, "y el encabezado es una constante, no una cadena suelta por ahí");

  // Los rumbos del cuadro son los del levantamiento: ida y vuelta completa.
  const written = table.rows.map((row) => row[2]);
  eq(written, block.courses.map((course) => cadFormatBearing(course.bearing)), "los cinco rumbos publicados son los cinco rumbos leídos");
  const back = written.map((text) => cadParseBearing(text));
  ok(back.every((parsed) => parsed.ok), "y todos se vuelven a leer del papel");

  eq(cadConstructionTable([{ x: 0, y: 0 }, { x: 1, y: 0 }]), null, "dos vértices no son un predio");
}

/* ── 10. La superficie por Gauss no depende del vértice de arranque ─────── */
{
  const rotated = [...traverse.stations.slice(2), ...traverse.stations.slice(0, 2)];
  const table = cadConstructionTable(rotated)!;
  near(table.area, traverse.area!, 1e-9, "empezar el cuadro por otro vértice no cambia la superficie");
  near(table.perimeter, traverse.perimeter, 2e-3, "ni el perímetro");
}

console.log(`geo-cogo.spec.ts: ${checks} comprobaciones en verde.`);
