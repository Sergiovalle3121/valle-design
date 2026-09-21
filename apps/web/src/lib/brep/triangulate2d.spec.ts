/**
 * Triangulación con VARIOS agujeros — la regresión que descubrió la vivienda de
 * la demostración (2026-09-16).
 *
 * Un muro con dos ventanas alineadas se teselaba con un triángulo del revés y el
 * volumen por malla salía distinto del volumen por caras, sin ningún aviso. Dos
 * defectos, los dos en los puentes que cosen los agujeros al contorno:
 *
 *  1. El vértice del contorno al que llega un puente queda DUPLICADO en el
 *     polígono; el segundo agujero que llegaba al mismo vértice se cosía en una
 *     aparición cualquiera, y la frontera se cruzaba a sí misma en ese punto.
 *     Ahora se cose en el paso cuyo ángulo interior contiene el puente.
 *  2. Cuando el rayo del segundo agujero pegaba en el puente del primero, el
 *     puente nuevo podía quedar SOBRE una arista del propio agujero. Ahora un
 *     puente se comprueba (ni cruza, ni toca, ni solapa) y, si no sirve, se toma
 *     el vértice visible más cercano que sí sirva.
 *
 * Además el recorte de orejas ya no salta las apariciones duplicadas de una
 * esquina: comprueba que ninguna de sus aristas entre en la oreja.
 *
 * El oráculo es el área: la suma de los triángulos tiene que dar el área del
 * contorno menos la de los agujeros, sin triángulos negativos ni cortes
 * degenerados, en las tres proyecciones con las que el teselador presenta una
 * cara (directa, espejada y con los ejes permutados).
 */
import { check, checkClose, report } from "./spec-support";
import { triangulateWithHoles } from "./triangulate2d";
import { extrudeProfile, makeFrame, vec3 } from "./index";
import { compareMassProperties } from "./mass-properties";

type P = { x: number; y: number };

function triangulatedArea(outer: P[], holes: P[][]): { area: number; negatives: number; degenerate: boolean } {
  const points = [...outer, ...holes.flat()];
  const result = triangulateWithHoles(outer, holes);
  let area = 0;
  let negatives = 0;
  for (const [a, b, c] of result.triangles) {
    const signed =
      ((points[b].x - points[a].x) * (points[c].y - points[a].y) -
        (points[b].y - points[a].y) * (points[c].x - points[a].x)) /
      2;
    area += signed;
    if (signed < -1e-9) negatives += 1;
  }
  return { area, negatives, degenerate: result.degenerate };
}

const rect = (w: number, h: number): P[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];
/** Agujero HORARIO, como llega del convenio de perfiles. */
const hole = (x0: number, y0: number, w: number, h: number): P[] => [
  { x: x0, y: y0 },
  { x: x0, y: y0 + h },
  { x: x0 + w, y: y0 + h },
  { x: x0 + w, y: y0 },
];
const mirror = (pts: P[]): P[] => pts.map((p) => ({ x: -p.y, y: p.x }));
const permute = (pts: P[]): P[] => pts.map((p) => ({ x: p.y, y: p.x })).reverse();

function checkCase(label: string, outer: P[], holes: P[][], expected: number): void {
  const variants: [string, P[], P[][]][] = [
    ["directa", outer, holes],
    ["espejo", mirror(outer), holes.map(mirror)],
    ["permutada", permute(outer), holes.map(permute)],
  ];
  for (const [name, o, hs] of variants) {
    const result = triangulatedArea(o, hs);
    checkClose(`${label} (${name}): área exacta`, result.area, expected, 1e-6);
    check(`${label} (${name}): sin triángulos del revés`, result.negatives === 0);
    check(`${label} (${name}): sin cortes degenerados`, !result.degenerate);
  }
}

// --- los dos muros de la vivienda que fallaban ---------------------------------
checkCase("dos ventanas alineadas", rect(10600, 2500), [hole(1300, 900, 1200, 1200), hole(5200, 900, 1200, 1200)], 10600 * 2500 - 2 * 1200 * 1200);
checkCase("dos ventanas una sobre otra", rect(2500, 6100), [hole(900, 850, 1200, 1200), hole(900, 3950, 1200, 1200)], 2500 * 6100 - 2 * 1200 * 1200);
checkCase(
  "tres ventanas con antepechos distintos",
  rect(10600, 2500),
  [hole(3400, 900, 1200, 1200), hole(5700, 1500, 600, 600), hole(8100, 900, 1200, 1200)],
  10600 * 2500 - 2 * 1200 * 1200 - 600 * 600,
);
checkCase("un agujero, el caso que siempre funcionó", rect(4000, 3000), [hole(500, 500, 1000, 1000)], 4000 * 3000 - 1000 * 1000);

// --- corpus reproducible: hasta cuatro agujeros rectangulares sin solapar --------
let seed = 7;
const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
let corpusFailures = 0;
let corpusCases = 0;
for (let trial = 0; trial < 150; trial += 1) {
  const W = 10000;
  const H = 3000;
  const boxes: { x0: number; y0: number; w: number; h: number }[] = [];
  const count = 1 + Math.floor(random() * 4);
  for (let i = 0; i < count; i += 1) {
    const w = 300 + Math.floor(random() * 1500);
    const h = 300 + Math.floor(random() * 1500);
    const x0 = 100 + Math.floor(random() * (W - w - 200));
    const y0 = 100 + Math.floor(random() * (H - h - 200));
    if (boxes.some((b) => x0 < b.x0 + b.w + 50 && x0 + w + 50 > b.x0 && y0 < b.y0 + b.h + 50 && y0 + h + 50 > b.y0)) continue;
    boxes.push({ x0, y0, w, h });
  }
  const holes = boxes.map((b) => hole(b.x0, b.y0, b.w, b.h));
  const expected = W * H - boxes.reduce((sum, b) => sum + b.w * b.h, 0);
  for (const [o, hs] of [
    [rect(W, H), holes],
    [mirror(rect(W, H)), holes.map(mirror)],
    [permute(rect(W, H)), holes.map(permute)],
  ] as const) {
    corpusCases += 1;
    const result = triangulatedArea(o, [...hs]);
    if (Math.abs(result.area - expected) > 1e-6 || result.negatives > 0 || result.degenerate) corpusFailures += 1;
  }
}
check(`corpus aleatorio: 0 fallos de ${corpusCases}`, corpusFailures === 0, `${corpusFailures} fallos`);

// --- y el sólido de verdad: un muro extruido en plano vertical con tres ventanas --
{
  const body = extrudeProfile({
    profile: {
      outer: rect(10600, 2500),
      inners: [hole(1300, 900, 1200, 1200), hole(5200, 900, 1200, 1200), hole(8300, 900, 1200, 1200)],
    },
    height: -250,
    frame: makeFrame(vec3(0, 0, 0), vec3(0, -1, 0), vec3(1, 0, 0)),
  });
  const mass = compareMassProperties(body);
  checkClose("muro con tres ventanas: volumen por malla = volumen por caras", mass.byMesh.volume, mass.byFaces.volume, 1e-3);
  checkClose("muro con tres ventanas: volumen = región × grosor", mass.byFaces.volume, (10600 * 2500 - 3 * 1200 * 1200) * 250, 1e-3);
}

report("brep/triangulate2d", 30);
