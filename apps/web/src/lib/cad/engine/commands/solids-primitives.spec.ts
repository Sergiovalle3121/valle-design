/**
 * Las ocho primitivas de sólido, medidas por su VOLUMEN contra fórmulas en
 * papel (Ola C, 2026-09-02).
 *
 * El volumen lo calcula el kernel B-rep sobre el árbol PERSISTIDO —lo que
 * viaja al servidor—, y se contrasta con la aritmética cerrada de cada
 * cuerpo. Para los facetados (cono, toro) la fórmula es la del cuerpo
 * facetado, no la del exacto: un cono de N caras es una pirámide de base
 * N-gonal, y su volumen es `N·r²·h·sin(2π/N)/6`, no `π·r²·h/3`. Escribirlo
 * así deja dicho cuánto se queda por debajo el facetado (0,3 % con N = 48).
 *
 * Desde 2026-09-04 se miden además los MODOS: 2P, 3P y Elíptico de
 * CYLINDER/CONE, Arista de PYRAMID y Arco de POLYSOLID. Dos cosas se
 * comprueban de cada uno y las dos importan: que el sólido sea el que se pidió
 * —el mismo que por el camino de siempre, cuando describe la misma pieza— y
 * cuánto vale su corrección de faceta, escrita como número y no como adjetivo.
 */
import { strict as assert } from "node:assert";
import { planarBodyVolume } from "../../../brep";
import { solid3dBody } from "../../solid3d-build";
import type { CadEntity } from "../../cad-document";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_PRIMITIVE_SEGMENTS, CAD_SOLID_PRIMITIVE_COMMANDS, __testables } from "./solids-primitives";
import { cadCircumcircle, cadEdgeBase, ellipseProfile, polysolidFootprint, tangentBulge, tessellatePath } from "./solids-primitive-modes";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (a: number, b: number, relative = 1e-9) => Math.abs(a - b) <= Math.max(1, Math.abs(b)) * relative;

const N = CAD_PRIMITIVE_SEGMENTS;
const SIN = Math.sin((2 * Math.PI) / N);

function makeContext(entities: CadEntity[] = []): CadCommandContext {
  let ids = 0;
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => entities.find((entity) => entity.id === id),
    selection: [],
    activeLayer: "SOLIDOS",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `id${++ids}`,
  };
}

const command = (name: string) => {
  const descriptor = CAD_SOLID_PRIMITIVE_COMMANDS.find((entry) => entry.name === name);
  assert.ok(descriptor, `${name} está registrado`);
  return descriptor!;
};

function drive(name: string, inputs: readonly CadCommandInput[], entities: CadEntity[] = []) {
  const descriptor = command(name);
  const context = makeContext(entities);
  let step = descriptor.begin(context);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state as never, input, context);
    prompts.push(step.prompt.message);
  }
  return { result: step.result, prompts, options: step.prompt.options.map((option) => option.keyword) };
}

const point = (x: number, y: number, z?: number): CadCommandInput => ({
  kind: "point",
  point: z === undefined ? { x, y } : ({ x, y, z } as { x: number; y: number }),
  source: "typed",
});
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const enter: CadCommandInput = { kind: "enter" };

/** El sólido insertado por la orden, o falla con el mensaje que la orden dio. */
function solidOf(driven: ReturnType<typeof drive>): CadSolid3dEntity {
  const result = driven.result;
  assert.ok(result && result.kind === "document", `debía producir documento, dio ${result?.kind}${result?.kind === "message" ? `: ${result.text}` : ""}`);
  const insert = result.commands.find((entry) => entry.type === "insert");
  assert.ok(insert && insert.type === "insert" && insert.entity.type === "solid3d", "inserta un SOLID3D");
  if (!insert || insert.type !== "insert" || insert.entity.type !== "solid3d") throw new Error("tipo");
  return insert.entity as CadSolid3dEntity;
}
const volumeOf = (solid: CadSolid3dEntity) => Math.abs(planarBodyVolume(solid3dBody(solid)));
function messageOf(driven: ReturnType<typeof drive>): string {
  assert.ok(driven.result?.kind === "message", `debía terminar con mensaje, dio ${driven.result?.kind}`);
  return driven.result!.kind === "message" ? driven.result!.text : "";
}

/** ¿El anillo se corta a sí mismo? Cruce estricto entre lados no contiguos. */
function simpleRing(ring: readonly { x: number; y: number }[]): boolean {
  const side = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const count = ring.length;
  for (let i = 0; i < count; i += 1)
    for (let j = i + 1; j < count; j += 1) {
      if (j === i + 1 || (i === 0 && j === count - 1)) continue;
      const [a1, a2, b1, b2] = [ring[i], ring[(i + 1) % count], ring[j], ring[(j + 1) % count]];
      const d1 = side(b1, b2, a1);
      const d2 = side(b1, b2, a2);
      const d3 = side(a1, a2, b1);
      const d4 = side(a1, a2, b2);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return false;
    }
  return true;
}

/* ── BOX ──────────────────────────────────────────────────────────────────── */
{
  const box = solidOf(drive("BOX", [point(0, 0), point(2000, 1500), distance(500)]));
  ok(box.nodes.length === 1 && box.nodes[0].op === "box" && box.root === box.nodes[0].id, "BOX es UN nodo `box`, reeditable");
  ok(box.layer === "SOLIDOS", "en la capa activa");
  ok(near(volumeOf(box), 2000 * 1500 * 500), "2000 × 1500 × 500");
  const node = box.nodes[0];
  ok(node.op === "box" && node.min.z === 0 && node.max.z === 500, "de z = 0 a z = 500");

  const elevated = solidOf(drive("BOX", [point(0, 0, 3000), point(100, 100), distance(10)]));
  ok(elevated.nodes[0].op === "box" && elevated.nodes[0].min.z === 3000, "la cota del primer punto es la base (SCU elevado)");
  const down = solidOf(drive("BOX", [point(0, 0), point(100, 100), distance(-40)]));
  ok(down.nodes[0].op === "box" && down.nodes[0].min.z === -40 && down.nodes[0].max.z === 0, "altura negativa: la caja crece hacia abajo");
  const reversed = solidOf(drive("BOX", [point(100, 100), point(0, 0), distance(10)]));
  ok(reversed.nodes[0].op === "box" && reversed.nodes[0].min.x === 0 && reversed.nodes[0].max.x === 100, "las esquinas se ordenan");

  const centered = solidOf(drive("BOX", [keyword("Centro"), point(0, 0), point(100, 50), distance(40)]));
  const c = centered.nodes[0];
  ok(c.op === "box" && c.min.x === -100 && c.max.x === 100 && c.min.y === -50 && c.min.z === -20 && c.max.z === 20, "Centro: la caja se centra en las tres direcciones");
  const cube = solidOf(drive("BOX", [point(0, 0), keyword("Cubo"), distance(100)]));
  ok(near(volumeOf(cube), 100 ** 3), "Cubo: 100³");
  const sized = solidOf(drive("BOX", [point(0, 0), keyword("Longitud"), distance(100), distance(50), distance(20)]));
  ok(near(volumeOf(sized), 100 * 50 * 20), "Longitud: longitud, anchura y altura tecleadas");
  const byPoints = solidOf(drive("BOX", [point(0, 0), point(100, 100), keyword("2Puntos"), point(0, 0, 0), point(0, 0, 70)]));
  ok(byPoints.nodes[0].op === "box" && near(byPoints.nodes[0].max.z, 70), "2Puntos: la altura es la distancia (3D) entre los dos puntos");

  ok(/alineadas/.test(messageOf(drive("BOX", [point(0, 0), point(0, 100)]))), "esquinas alineadas: se dice, no se dibuja una caja plana");
  ok(/altura distinta de cero/.test(messageOf(drive("BOX", [point(0, 0), point(100, 100), distance(0)]))), "altura cero: se dice");
  ok(command("BOX").spatial === "elevation", "BOX declara `spatial: \"elevation\"`");
}

/* ── WEDGE ────────────────────────────────────────────────────────────────── */
{
  const wedge = solidOf(drive("WEDGE", [point(0, 0), point(200, 100), distance(50)]));
  ok(wedge.nodes[0].op === "extrude", "WEDGE es un triángulo extruido de canto");
  ok(near(volumeOf(wedge), (200 * 100 * 50) / 2), "200 × 100 × 50 / 2");
  const back = solidOf(drive("WEDGE", [point(200, 0), point(0, 100), distance(50)]));
  ok(near(volumeOf(back), (200 * 100 * 50) / 2), "recorrida al revés, el mismo volumen");
  const frame = __testables.wedgeNode({ first: { x: 200, y: 0 }, opposite: { x: 0, y: 100 }, centered: false }, 50);
  ok(frame.op === "extrude" && frame.frame?.xAxis?.x === -1, "y la cara alta queda en la primera esquina: la X del marco apunta hacia la opuesta");
  ok(near(volumeOf(solidOf(drive("WEDGE", [point(0, 0), point(200, 100), distance(-50)]))), 500_000), "altura negativa: cuña hacia abajo, mismo volumen");
}

/* ── CYLINDER ─────────────────────────────────────────────────────────────── */
{
  const cylinder = solidOf(drive("CYLINDER", [point(0, 0), distance(10), distance(100)]));
  ok(cylinder.nodes[0].op === "extrude", "CYLINDER es un perfil circular extruido");
  // `circleProfile` iguala el área del polígono a π·r², así que el volumen es EXACTO.
  ok(near(volumeOf(cylinder), Math.PI * 100 * 100, 1e-9), "π·r²·h exacto (el polígono iguala el área)");
  const byDiameter = solidOf(drive("CYLINDER", [point(0, 0), keyword("Diámetro"), distance(20), distance(100)]));
  ok(near(volumeOf(byDiameter), Math.PI * 100 * 100, 1e-9), "Diámetro 20 es radio 10");
  const byPoint = solidOf(drive("CYLINDER", [point(0, 0), point(10, 0), distance(100)]));
  ok(near(volumeOf(byPoint), Math.PI * 100 * 100, 1e-9), "un punto fija el radio por su distancia al centro");
  const elevated = solidOf(drive("CYLINDER", [point(5, 5, 3000), distance(10), distance(100)]));
  ok(elevated.nodes[0].op === "extrude" && elevated.nodes[0].frame?.origin.z === 3000, "la base está a la cota del centro");
  ok(/radio mayor que cero/.test(messageOf(drive("CYLINDER", [point(0, 0), distance(0)]))), "radio cero: se dice");
  const driven = drive("CYLINDER", [point(0, 0)]);
  ok(driven.options.join(",") === "Diámetro", "pedido el centro, sólo se ofrece Diámetro");
}

/* ── CYLINDER · 2P, 3P y Elíptico ─────────────────────────────────────────── */
{
  ok(drive("CYLINDER", []).options.join(",") === "3Puntos,2Puntos,Elíptico", "el primer prompt anuncia los tres modos que existen");
  ok(!drive("CYLINDER", []).options.includes("Ttr"), "y NO anuncia Ttr, que no está: pide tangencias contra objetos designados");

  // 2Puntos: los dos puntos son el DIÁMETRO. Un cilindro entre (0,0) y (100,0)
  // es el mismo que el de centro (50,0) y radio 50 — el mismo nodo, no uno
  // parecido: dos modos de la misma orden no pueden dar dos sólidos.
  const byTwo = solidOf(drive("CYLINDER", [keyword("2Puntos"), point(0, 0), point(100, 0), distance(40)]));
  const byCenter = solidOf(drive("CYLINDER", [point(50, 0), distance(50), distance(40)]));
  ok(JSON.stringify(byTwo.nodes) === JSON.stringify(byCenter.nodes), "2Puntos (0,0)-(100,0) da el MISMO nodo que centro (50,0) radio 50");
  ok(near(volumeOf(byTwo), Math.PI * 2500 * 40, 1e-9), "y mide π·50²·40 exacto");
  ok(/no tiene radio/.test(messageOf(drive("CYLINDER", [keyword("2Puntos"), point(0, 0), point(0, 0)]))), "dos puntos coincidentes: se dice");

  // 3Puntos: circuncentro. Por (0,0), (100,0) y (50,50) pasa la circunferencia
  // de centro (50,0) y radio 50.
  const byThree = solidOf(drive("CYLINDER", [keyword("3Puntos"), point(0, 0), point(100, 0), point(50, 50), distance(40)]));
  const frame = byThree.nodes[0].op === "extrude" ? byThree.nodes[0].frame : undefined;
  ok(frame !== undefined && near(frame.origin.x, 50) && near(frame.origin.y, 0), "3Puntos: el centro es el circuncentro (50, 0)");
  ok(near(volumeOf(byThree), Math.PI * 2500 * 40, 1e-9), "y el radio, 50");
  const circle = cadCircumcircle({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 50 })!;
  ok(near(circle.center.x, 50) && near(circle.center.y, 0) && near(circle.radius, 50), "el circuncentro, medido aparte");
  ok(cadCircumcircle({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }) === null, "tres puntos en línea no tienen circunferencia");
  ok(/COLINEALES/.test(messageOf(drive("CYLINDER", [keyword("3Puntos"), point(0, 0), point(50, 0), point(100, 0)]))), "y la orden lo dice con esa palabra, en vez de dibujar un cilindro a kilómetros");

  // Elíptico: dos ejes. 60 × 40 de eje entero son semiejes 30 y 20.
  const elliptic = solidOf(drive("CYLINDER", [keyword("Elíptico"), point(-30, 0), point(30, 0), point(0, 20), distance(40)]));
  ok(elliptic.nodes[0].op === "extrude" && elliptic.nodes[0].profile.outer.length === N, `el perfil elíptico es un polígono de ${N} lados: es FACETADO`);
  ok(near(volumeOf(elliptic), Math.PI * 30 * 20 * 40, 1e-9), "π·a·b·h EXACTO: el perfil corrige el área como `circleProfile`");
  // La faceta, en número: sin la corrección, el polígono INSCRITO encerraría
  // sen θ/θ del área de la elipse (θ = 2π/48 = 7,5°), un 0,285 % menos.
  const theta = (2 * Math.PI) / N;
  const inscribed = (N / 2) * 30 * 20 * SIN * 40;
  ok(near(volumeOf(elliptic), inscribed / (Math.sin(theta) / theta), 1e-9), `la corrección de faceta es sen θ/θ = ${(Math.sin(theta) / theta).toFixed(5)} con θ = 2π/48`);
  const ringArea = (r: readonly { x: number; y: number }[]) =>
    Math.abs(r.reduce((sum, p, i) => sum + p.x * r[(i + 1) % r.length].y - r[(i + 1) % r.length].x * p.y, 0)) / 2;
  ok(near(ringArea(ellipseProfile(30, 20, N)), Math.PI * 600, 1e-12), "el polígono corregido encierra exactamente π·a·b");
  ok(near(ringArea(ellipseProfile(30, 20, N, false)), Math.PI * 600 * (Math.sin(theta) / theta), 1e-12), "y el inscrito, sen θ/θ de esa área — la faceta, en número");
  const round = solidOf(drive("CYLINDER", [point(0, 0), distance(25), distance(40)]));
  const roundByAxes = solidOf(drive("CYLINDER", [keyword("Elíptico"), point(-25, 0), point(25, 0), point(0, 25), distance(40)]));
  ok(JSON.stringify(roundByAxes.nodes) === JSON.stringify(round.nodes), "con los dos semiejes iguales, Elíptico da el cilindro circular bit a bit");
  ok(/ejes quedó en cero/.test(messageOf(drive("CYLINDER", [keyword("Elíptico"), point(-30, 0), point(30, 0), point(0, 0)]))), "un eje nulo: se dice");
  ok(/puntos que definen la base/.test(messageOf(drive("CYLINDER", [keyword("3Puntos"), point(0, 0), enter]))), "Intro a media designación: se dice lo que falta, no «necesita un centro»");
  const elevated = solidOf(drive("CYLINDER", [keyword("2Puntos"), point(0, 0, 3000), point(100, 0), distance(40)]));
  ok(elevated.nodes[0].op === "extrude" && elevated.nodes[0].frame?.origin.z === 3000, "la cota sale del PRIMER punto designado, también en los modos");
}

/* ── CONE ─────────────────────────────────────────────────────────────────── */
{
  const cone = solidOf(drive("CONE", [point(0, 0), distance(10), distance(30)]));
  ok(cone.nodes[0].op === "revolve", "CONE es una revolución");
  // Pirámide de base N-gonal de circunradio r: V = N·r²·h·sin(2π/N)/6.
  ok(near(volumeOf(cone), (N * 100 * 30 * SIN) / 6, 1e-9), "el volumen es el del cono FACETADO, en papel");
  ok(volumeOf(cone) < (Math.PI * 100 * 30) / 3, "y queda por debajo del exacto, como se declara");
  const frustum = solidOf(drive("CONE", [point(0, 0), distance(10), keyword("radio Superior"), distance(5), distance(30)]));
  const area = (r: number) => (N / 2) * r * r * SIN;
  ok(near(volumeOf(frustum), (30 / 3) * (area(10) + area(5) + Math.sqrt(area(10) * area(5))), 1e-9), "Radio superior: tronco de cono, fórmula del prismatoide");

  // Elíptico: el abanico base→vértice de la pirámide, con la elipse INSCRITA
  // de anillo. Volumen = área del polígono × h / 3, y esa área es la de la
  // elipse por la MISMA corrección de faceta que declara el cono circular.
  const ellipticCone = solidOf(drive("CONE", [keyword("Elíptico"), point(-30, 0), point(30, 0), point(0, 20), distance(45)]));
  ok(ellipticCone.nodes[0].op === "brep", "el cono elíptico es el abanico de PYRAMID: no se estrena maquinaria");
  ok(near(volumeOf(ellipticCone), ((N / 2) * 30 * 20 * SIN * 45) / 3, 1e-9), "π·a·b·h/3 por sen θ/θ: el volumen del cono elíptico FACETADO, en papel");
  ok(volumeOf(ellipticCone) < (Math.PI * 30 * 20 * 45) / 3, "y queda por debajo del exacto, como su hermano circular");
  const circularAgain = volumeOf(solidOf(drive("CONE", [keyword("Elíptico"), point(-10, 0), point(10, 0), point(0, 10), distance(30)])));
  ok(near(circularAgain, volumeOf(cone), 1e-9), "con los dos semiejes iguales mide EXACTAMENTE lo que el cono circular facetado");
  const ellipticFrustum = solidOf(drive("CONE", [keyword("Elíptico"), point(-30, 0), point(30, 0), point(0, 20), keyword("radio Superior"), distance(15), distance(45)]));
  const base = (N / 2) * 30 * 20 * SIN;
  ok(near(volumeOf(ellipticFrustum), (45 / 3) * (base + base / 4 + Math.sqrt((base * base) / 4)), 1e-9), "con radio superior, la elipse de arriba es la misma a escala (15/30)");
  ok(drive("CONE", []).options.join(",") === "3Puntos,2Puntos,Elíptico", "CONE ofrece los mismos tres modos que CYLINDER");
  ok(drive("SPHERE", []).options.length === 0 && drive("TORUS", []).options.length === 0, "SPHERE y TORUS no los ofrecen: no tienen base que designar");
}

/* ── SPHERE ───────────────────────────────────────────────────────────────── */
{
  const sphere = solidOf(drive("SPHERE", [point(0, 0), distance(10)]));
  ok(sphere.nodes[0].op === "revolve", "SPHERE es una revolución");
  const exact = (4 / 3) * Math.PI * 1000;
  const volume = volumeOf(sphere);
  ok(volume < exact && volume > 0.97 * exact, `la esfera facetada queda entre el 97 % y el 100 % del exacto (${(volume / exact).toFixed(4)})`);
  ok(sphere.nodes[0].op === "revolve" && sphere.nodes[0].profile.outer.every((p) => p.x >= 0), "el perfil no cruza el eje");
}

/* ── TORUS ────────────────────────────────────────────────────────────────── */
{
  const torus = solidOf(drive("TORUS", [point(0, 0), distance(20), distance(5)]));
  ok(torus.nodes[0].op === "revolve", "TORUS es una revolución");
  const exact = 2 * Math.PI * Math.PI * 20 * 25;
  const volume = volumeOf(torus);
  ok(volume < exact && volume > 0.98 * exact, `el toro facetado queda entre el 98 % y el 100 % del exacto (${(volume / exact).toFixed(4)})`);
  ok(/debe ser menor que el radio del toro/.test(messageOf(drive("TORUS", [point(0, 0), distance(20), distance(20)]))), "tubo ≥ toro: se dice antes de intentarlo");
}

/* ── PYRAMID ──────────────────────────────────────────────────────────────── */
{
  // Circunscrito (por defecto): el radio es el apotema. 4 lados con apotema 10 = cuadrado de lado 20.
  const pyramid = solidOf(drive("PYRAMID", [point(0, 0), distance(10), distance(30)]));
  ok(pyramid.nodes[0].op === "brep", "PYRAMID es geometría explícita");
  ok(near(volumeOf(pyramid), (400 * 30) / 3), "base 20 × 20, altura 30: 4000");
  ok(near(__testables.vertexRadius(10, 4, false), 10 / Math.cos(Math.PI / 4)), "circunscrito: radio a los vértices = apotema / cos(π/n)");
  const hex = solidOf(drive("PYRAMID", [keyword("Lados"), distance(6), point(0, 0), keyword("Inscrito"), distance(10), distance(30)]));
  ok(near(volumeOf(hex), ((6 / 2) * 100 * Math.sin(Math.PI / 3) * 30) / 3), "6 lados inscritos en radio 10: hexágono regular");
  const frustum = solidOf(drive("PYRAMID", [point(0, 0), distance(10), keyword("radio Superior"), distance(5), distance(30)]));
  ok(near(volumeOf(frustum), (30 / 3) * (400 + 100 + Math.sqrt(400 * 100))), "Radio superior: tronco de pirámide");
  ok(near(volumeOf(solidOf(drive("PYRAMID", [point(0, 0), distance(10), distance(-30)]))), 4000), "altura negativa: la punta hacia abajo, mismo volumen, caras válidas");
  ok(/entre 3 y 32/.test(messageOf(drive("PYRAMID", [keyword("Lados"), distance(2)]))), "menos de tres lados: se dice");

  // Arista: los dos extremos de UN lado. Con 6 lados y L = 100, el radio a los
  // vértices es L/(2·sen(π/6)) = 100, y el hexágono mide 100 de lado.
  const edge = cadEdgeBase({ x: 0, y: 0 }, { x: 100, y: 0 }, 6)!;
  ok(near(edge.radius, 100 / (2 * Math.sin(Math.PI / 6))) && near(edge.radius, 100), "Arista: R = L/(2·sen(π/n)) = 100 con L = 100 y n = 6");
  ok(near(edge.center.x, 50) && near(edge.center.y, 100 / (2 * Math.tan(Math.PI / 6))), "el centro cae a la izquierda del recorrido, a un apotema");
  const byEdge = solidOf(drive("PYRAMID", [keyword("Lados"), distance(6), keyword("Arista"), point(0, 0), point(100, 0), distance(30)]));
  const ring = byEdge.nodes[0].op === "brep" ? byEdge.nodes[0].points.slice(0, 6) : [];
  ok(ring.length === 6, "la base tiene los seis vértices");
  ok(near(ring[0].x, 0, 1e-9) && near(ring[0].y, 0, 1e-9) && near(ring[1].x, 100, 1e-9) && near(ring[1].y, 0, 1e-9), "y la arista designada ESTÁ donde se designó, no girada");
  ok(ring.every((point, index) => near(Math.hypot(ring[(index + 1) % 6].x - point.x, ring[(index + 1) % 6].y - point.y), 100)), "los seis lados miden 100");
  ok(near(volumeOf(byEdge), (((3 * Math.sqrt(3)) / 2) * 100 * 100 * 30) / 3), "hexágono de lado 100, altura 30: (3√3/2)·L²·h/3");
  ok(/no mide nada/.test(messageOf(drive("PYRAMID", [keyword("Arista"), point(0, 0), point(0, 0)]))), "los dos extremos coincidentes: se dice");
  ok(drive("PYRAMID", []).options.join(",") === "Lados,Arista", "el primer prompt ofrece Lados y Arista");
  ok(drive("PYRAMID", []).prompts[0].startsWith("4 lados Circunscrito"), "el prompt dice el modo vigente, como AutoCAD");
}

/* ── POLYSOLID ────────────────────────────────────────────────────────────── */
{
  const wall = solidOf(drive("POLYSOLID", [keyword("Altura"), distance(2400), keyword("Ancho"), distance(200), point(0, 0), point(1000, 0), enter]));
  ok(wall.nodes[0].op === "extrude" && wall.nodes[0].height === 2400, "POLYSOLID es la huella extruida a la altura");
  ok(near(volumeOf(wall), 1000 * 200 * 2400), "un tramo recto de 1000 con ancho 200: 1000 × 200 × 2400");
  const corner = solidOf(drive("POLYSOLID", [keyword("Altura"), distance(2400), keyword("Ancho"), distance(200), point(0, 0), point(1000, 0), point(1000, 1000), enter]));
  // La L con juntas a inglete es la unión de [0,1100]×[−100,100] y [900,1100]×[100,1000].
  ok(near(volumeOf(corner), (1100 * 200 + 200 * 900) * 2400), "una esquina en L con inglete: el volumen de la unión de los dos tramos");
  const left = polysolidFootprint([{ x: 0, y: 0 }, { x: 1000, y: 0 }], 200, "left", false)!;
  ok(left.outer.every((p) => p.y <= 1e-9 && p.y >= -200 - 1e-9), "justificación Izquierda: el recorrido es el borde izquierdo y el muro cae a su derecha");
  const closed = polysolidFootprint([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }], 100, "center", true)!;
  ok(closed.inners?.length === 1, "un recorrido cerrado engrosa a un anillo: contorno y hueco");
  const ring = solidOf(drive("POLYSOLID", [keyword("Ancho"), distance(100), point(0, 0), point(1000, 0), point(0, 1000), keyword("Cerrar")]));
  ok(volumeOf(ring) > 0 && volumeOf(ring) < 500_000 * 80, "Cerrar: el muro perimetral es un sólido con hueco, de menos volumen que el triángulo macizo");

  ok(drive("POLYSOLID", []).prompts[0].startsWith("Altura = 80, ancho = 5"), "sin variables, los defectos de AutoCAD (PSOLHEIGHT 80, PSOLWIDTH 5)");
  ok(/pliegan/.test(messageOf(drive("POLYSOLID", [point(0, 0), point(1000, 0), point(0, 0.0001), enter]))), "un recorrido que se pliega sobre sí mismo se rechaza diciéndolo");

  const line: CadEntity = { id: "eje", type: "line", layer: "0", start: { x: 0, y: 0, z: 0 }, end: { x: 500, y: 0, z: 0 } } as CadEntity;
  const fromLine = drive("POLYSOLID", [keyword("Objeto"), { kind: "entityPick", entityId: "eje", point: { x: 100, y: 0 } }], [line]);
  const fromLineSolid = solidOf(fromLine);
  ok(near(volumeOf(fromLineSolid), 500 * 5 * 80), "Objeto sobre una línea: la línea es el eje del muro");
  ok(fromLine.result?.kind === "document" && fromLine.result.commands.some((entry) => entry.type === "delete" && entry.entityId === "eje"), "y la línea se borra (DELOBJ = 1), como en EXTRUDE");
  // Objeto sobre una polilínea CON arcos: ya no se rechaza. `bulge = 0,5` es
  // θ = 4·atan(0,5) y sen(θ/2) = 0,8 exacto, así que la cuerda de 500 monta
  // sobre un radio de 312,5 y el arco mide R·θ. La banda de ancho constante w
  // sobre ese arco tiene área R·θ·w, y el muro, esa área por su altura.
  const curved: CadEntity = { id: "curva", type: "polyline", layer: "0", closed: false, vertices: [{ x: 0, y: 0, z: 0, bulge: 0.5 }, { x: 500, y: 0, z: 0 }] } as CadEntity;
  const fromCurve = solidOf(drive("POLYSOLID", [keyword("Objeto"), { kind: "entityPick", entityId: "curva", point: { x: 100, y: 0 } }], [curved]));
  const sweep = 4 * Math.atan(0.5);
  const radius = 500 / (2 * Math.sin(sweep / 2));
  ok(near(radius, 312.5, 1e-12), "el radio del arco de `bulge` 0,5 sobre una cuerda de 500 es 312,5");
  ok(Math.abs(volumeOf(fromCurve) / (radius * sweep * 5 * 80) - 1) < 0.005, `una polilínea con arco se engrosa: R·θ·w·h ±0,5 % (${(volumeOf(fromCurve) / (radius * sweep * 5 * 80)).toFixed(5)})`);

  // Arco al vuelo: tangente al tramo anterior. Desde (1000,0) con tangente +X
  // hasta (2000,1000) sale el cuarto de circunferencia de centro (1000,1000).
  ok(!drive("POLYSOLID", [point(0, 0)]).options.includes("Arco"), "Arco no se ofrece en el primer tramo: no hay dirección de entrada a la que ser tangente");
  ok(drive("POLYSOLID", [point(0, 0), point(1000, 0)]).options.includes("Arco"), "y sí en cuanto la hay");
  ok(drive("POLYSOLID", [point(0, 0), point(1000, 0), keyword("Arco")]).options.includes("Línea"), "dentro del arco se ofrece volver a Línea");
  ok(near(tangentBulge({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 1, y: 0 })!, Math.tan(Math.PI / 8)), "el `bulge` tangente de un cuarto de vuelta es tan(45°/2)");
  ok(tangentBulge({ x: 0, y: 0 }, { x: -100, y: 0 }, { x: 1, y: 0 }) === null, "un final justo detrás del tramo anterior no describe ningún arco");
  const bent = solidOf(drive("POLYSOLID", [keyword("Altura"), distance(2400), keyword("Ancho"), distance(200), point(0, 0), point(1000, 0), keyword("Arco"), point(2000, 1000), enter]));
  const arcArea = ((Math.PI / 2) * (1100 * 1100 - 900 * 900)) / 2;
  ok(Math.abs(volumeOf(bent) / ((1000 * 200 + arcArea) * 2400) - 1) < 0.005, `tramo recto + cuarto de anillo (1100²−900²)·π/4: el volumen cae dentro del ±0,5 % (${(volumeOf(bent) / ((1000 * 200 + arcArea) * 2400)).toFixed(5)})`);
  const outer = bent.nodes[0].op === "extrude" ? bent.nodes[0].profile.outer : [];
  // 2 puntos rectos + 12 tramitos de arco (90° a 48 por vuelta) = 14 por lado.
  ok(outer.length === 28, `el arco llega TESELADO a la huella: 14 puntos por lado, ${outer.length} en el contorno`);
  ok(simpleRing(outer), "y el perfil engrosado NO se auto-interseca");
  ok(!simpleRing([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }]), "(y el detector de cruces sabe ver un lazo, que si no la comprobación anterior no diría nada)");
  const undone = solidOf(drive("POLYSOLID", [keyword("Ancho"), distance(200), point(0, 0), point(1000, 0), keyword("Arco"), point(2000, 1000), keyword("desHacer"), point(2000, 0), enter]));
  ok(near(volumeOf(undone), 2000 * 200 * 80), "desHacer quita el arco ENTERO: el tramo siguiente vuelve a ser recto");
  const straight = tessellatePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], false, CAD_PRIMITIVE_SEGMENTS);
  ok(straight.length === 3 && straight[2].x === 10 && straight[2].y === 10, "un recorrido sin arcos no se tesela: sale idéntico");
}

/* ── Registro y forma común ───────────────────────────────────────────────── */
{
  const names = CAD_SOLID_PRIMITIVE_COMMANDS.map((descriptor) => descriptor.name);
  ok(names.join(",") === "BOX,WEDGE,CYLINDER,CONE,SPHERE,TORUS,PYRAMID,POLYSOLID", `las ocho primitivas: ${names.join(",")}`);
  ok(CAD_SOLID_PRIMITIVE_COMMANDS.every((descriptor) => descriptor.spatial === "elevation" && descriptor.mutates && descriptor.kind === "draw"), "todas mutan, dibujan y honran el SCU elevado");
  ok(drive("BOX", [{ kind: "cancel" }]).result?.kind === "none", "Esc cancela sin escribir");
  ok(/necesita una esquina/.test(messageOf(drive("BOX", [enter]))), "Intro sin esquina: se dice");
}

console.log(`solids-primitives: ${checks} comprobaciones sobre las ocho primitivas`);
