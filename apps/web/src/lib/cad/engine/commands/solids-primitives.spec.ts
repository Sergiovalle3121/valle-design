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
 */
import { strict as assert } from "node:assert";
import { planarBodyVolume } from "../../../brep";
import { solid3dBody } from "../../solid3d-build";
import type { CadEntity } from "../../cad-document";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_PRIMITIVE_SEGMENTS, CAD_SOLID_PRIMITIVE_COMMANDS, polysolidFootprint, __testables } from "./solids-primitives";

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
  const frame = __testables.wedgeNode({ first: { x: 200, y: 0 }, opposite: { x: 0, y: 100 }, centered: false, pending: "none", length: null, twoPoints: null }, 50);
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
  ok(driven.options.join(",") === "Diámetro", "sólo se ofrece lo que existe: Diámetro (3P/2P/Ttr/Elíptico no se anuncian)");
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
  const curved: CadEntity = { id: "curva", type: "polyline", layer: "0", closed: false, vertices: [{ x: 0, y: 0, z: 0, bulge: 0.5 }, { x: 500, y: 0, z: 0 }] } as CadEntity;
  ok(/todavía no engrosa tramos curvos/.test(messageOf(drive("POLYSOLID", [keyword("Objeto"), { kind: "entityPick", entityId: "curva", point: { x: 100, y: 0 } }], [curved]))), "una polilínea con arcos: límite declarado");
  ok(!drive("POLYSOLID", [point(0, 0)]).options.includes("Arco"), "Arco no se ofrece: los tramos son rectos");
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
