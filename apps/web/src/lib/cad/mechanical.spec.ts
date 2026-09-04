/**
 * Los normalizados, los símbolos y la lista de materiales contra papel
 * (Ola I). npx tsx src/lib/cad/mechanical.spec.ts
 *
 *   - Tornillo ISO 4017 M10 × 40: cabeza de 6,4 × e (e = 16 / cos 30°), vástago
 *     con chaflán de 1 mm y rosca en el diámetro menor (d − 1,2269 p).
 *   - Tuerca ISO 4032 y rondana ISO 7089 por sus tablas.
 *   - Perfiles por medidas: sección y peso lineal en papel (PTR 50,8 × 50,8 × 3
 *     → 573,6 mm², 4,50 kg/m).
 *   - Globo, soldadura y acabado: cuántas piezas, dónde, con qué marca.
 *   - La lista: el globo da la posición, lo insertado da la cantidad.
 *   - Y la tabla queda MARCADA y localizable, con su id forzado: es lo que
 *     permite que «Actualizar» la sustituya sin cambiarle la identidad.
 */
import { strict as assert } from "node:assert";
import type { CadBlockDefinition, CadEntity } from "./cad-document";
import {
  BOM_HEADERS,
  CAD_BOM_MARK,
  buildCadMechanicalBom,
  buildCadMechanicalBomTable,
  findCadMechanicalBomTables,
  readCadMechanicalBomTable,
} from "./mechanical-bom";
import {
  CAD_METRIC_LIST,
  CAD_STEEL_SHAPES,
  cadHexagon,
  cadMechanicalBlockDefinition,
  cadMechanicalBolt,
  cadMechanicalNut,
  cadMechanicalPartOf,
  cadMechanicalSteelShape,
  cadMechanicalWasher,
  cadMetricMinorDiameter,
  cadSteelKgPerMetre,
  cadSteelShapeFor,
} from "./mechanical-parts";
import { cadBalloonEntities, cadBalloonMetadata, cadSurfaceSymbolEntities, cadWeldSymbolEntities } from "./mechanical-symbols";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;
let ids = 0;
const newId = () => `m${++ids}`;

/* ── Tornillería ────────────────────────────────────────────────────────── */
eq(CAD_METRIC_LIST, [6, 8, 10, 12, 16, 20, 24], "las siete métricas del catálogo");
ok(near(cadMetricMinorDiameter(10, 1.5), 8.15965), "d3 de M10 = 10 − 1,2269 · 1,5");
{
  const bolt = cadMechanicalBolt(10, 40)!;
  eq([bolt.id, bolt.name, bolt.standard, bolt.family, bolt.areaMm2], ["MECH-TORNILLO-M10x40", "Tornillo hexagonal M10 × 40", "ISO 4017", "tornillo", null], "id estable, denominación y norma");
  eq(bolt.entities.length, 6, "cabeza, dos aristas, vástago y dos líneas de rosca");
  const head = bolt.entities[0];
  assert.ok(head.type === "polyline");
  const e = 16 / Math.cos(Math.PI / 6);
  ok(near(Math.min(...head.vertices.map((v) => v.x)), -6.4) && near(Math.max(...head.vertices.map((v) => v.y)), e / 2), `la cabeza ocupa x ∈ [−k, 0] y mide e = ${e.toFixed(3)} entre vértices`);
  const edge = bolt.entities[1];
  assert.ok(edge.type === "line");
  ok(near(edge.start.y, e / 4) && near(edge.end.y, e / 4), "la arista vista de canto va a e/4");
  const shank = bolt.entities[3];
  assert.ok(shank.type === "polyline");
  eq(shank.vertices.length, 6, "el vástago con su chaflán");
  ok(near(Math.max(...shank.vertices.map((v) => v.x)), 40) && near(Math.max(...shank.vertices.map((v) => v.y)), 5), "largo 40, radio 5");
  ok(shank.vertices.some((v) => near(v.x, 39) && near(v.y, 5)) && shank.vertices.some((v) => near(v.x, 40) && near(v.y, 4)), "chaflán de 0,1 d en la punta");
  const thread = bolt.entities[4];
  assert.ok(thread.type === "line");
  ok(near(thread.start.y, cadMetricMinorDiameter(10, 1.5) / 2) && near(thread.end.x, 39), "la rosca en el diámetro menor, hasta el chaflán");
  ok(bolt.entities.every((entity) => entity.layer === "0"), "todo en capa 0: hereda la de la inserción");
  eq(cadMechanicalBolt(11, 40), null, "M11 no existe");
  eq(cadMechanicalBolt(10, 0), null, "sin largo no hay tornillo");
  eq(cadMechanicalBolt(12, 37.5)!.id, "MECH-TORNILLO-M12x37.5", "el largo con decimales va tal cual en el id");
}
{
  const nut = cadMechanicalNut(12)!;
  eq([nut.id, nut.name, nut.standard], ["MECH-TUERCA-M12", "Tuerca hexagonal M12", "ISO 4032"], "tuerca");
  eq(nut.entities.length, 3, "hexágono y dos círculos");
  const hex = nut.entities[0];
  assert.ok(hex.type === "polyline");
  eq(hex.vertices.length, 6, "seis vértices");
  ok(near(Math.hypot(hex.vertices[0].x, hex.vertices[0].y), 18 / 2 / Math.cos(Math.PI / 6)), "entrecaras ISO de 18 (no 19 de DIN)");
  ok(near(Math.hypot(hex.vertices[1].x, hex.vertices[1].y), Math.hypot(hex.vertices[0].x, hex.vertices[0].y)), "regular");
  const major = nut.entities[2];
  assert.ok(major.type === "circle");
  eq(major.radius, 6, "el círculo de la rosca a d/2");
  eq(cadHexagon({ x: 0, y: 0 }, 10).length, 6, "el hexágono de un M6");
}
{
  const washer = cadMechanicalWasher(6)!;
  eq([washer.id, washer.standard], ["MECH-RONDANA-M6", "ISO 7089"], "rondana");
  const radii = washer.entities.map((entity) => (entity.type === "circle" ? entity.radius : -1));
  eq(radii, [3.2, 6], "agujero 6,4 y exterior 12");
  eq(cadMechanicalWasher(7), null, "M7 no está");
}

/* ── El bloque ──────────────────────────────────────────────────────────── */
{
  const block = cadMechanicalBlockDefinition(cadMechanicalBolt(10, 40)!);
  eq([block.id, block.name, block.basePoint, block.description, block.keywords], ["MECH-TORNILLO-M10x40", "MECH-TORNILLO-M10x40", { x: 0, y: 0, z: 0 }, "Tornillo hexagonal M10 × 40 · ISO 4017", ["MECH", "tornillo"]], "denominación y norma en description, que ya existía");
  eq(cadMechanicalPartOf(block), { name: "Tornillo hexagonal M10 × 40", standard: "ISO 4017" }, "…y se leen de vuelta");
  eq(cadMechanicalPartOf({ id: "MEP-VALVULA", name: "MEP-VALVULA" }), null, "un bloque MEP no es normalizado");
  eq(cadMechanicalPartOf({ id: "MECH-X", name: "MECH-X" }), { name: "MECH-X", standard: "—" }, "un MECH sin description sale por su nombre");
  eq(cadMechanicalPartOf({ id: "MECH-X", name: "MECH-X", description: "Placa" }), { name: "Placa", standard: "—" }, "…o por su description sin norma");
  eq(cadMechanicalPartOf(undefined), null, "sin bloque, nada");
}

/* ── Perfiles ───────────────────────────────────────────────────────────── */
eq(CAD_STEEL_SHAPES.map((shape) => shape.kind), ["PTR", "OC", "LI", "CPS", "IPR"], "los cinco perfiles IMCA");
eq(cadSteelShapeFor("ángulo LI")?.kind, "LI", "por palabra clave");
eq(cadSteelShapeFor("cps")?.kind, "CPS", "por designación");
eq(cadSteelShapeFor("HSS"), undefined, "HSS no es designación IMCA");
{
  const ptr = cadMechanicalSteelShape("PTR", { b: 50.8, h: 50.8, t: 3 });
  assert.ok(typeof ptr !== "string", String(ptr));
  eq([ptr.id, ptr.name, ptr.standard, ptr.family], ["MECH-PTR-50.8x50.8x3", "PTR 50.8 × 50.8 × 3", "ASTM A500 / IMCA", "perfil"], "PTR 2\" × 2\" cal. 11");
  ok(near(ptr.areaMm2!, 573.6), `sección 573,6 mm² (dio ${ptr.areaMm2})`);
  ok(near(cadSteelKgPerMetre(ptr.areaMm2!), 4.50276), "4,50 kg/m a 7 850 kg/m³");
  eq(ptr.entities.length, 2, "contorno exterior e interior");
  const inner = ptr.entities[1];
  assert.ok(inner.type === "polyline");
  ok(near(inner.vertices[0].x, 3) && near(inner.vertices[2].x, 47.8), "el hueco a t de la pared");
  ok(String(cadMechanicalSteelShape("PTR", { b: 50.8, h: 50.8, t: 30 })).includes("no deja hueco"), "una pared que se come el hueco se rechaza");
}
{
  const oc = cadMechanicalSteelShape("OC", { d: 60.3, t: 3.9 });
  assert.ok(typeof oc !== "string");
  eq(oc.id, "MECH-OC-60.3x3.9", "tubo de 2\" cédula 40");
  ok(near(oc.areaMm2!, Math.PI * (30.15 ** 2 - 26.25 ** 2), 1e-6), "sección de la corona");
  const li = cadMechanicalSteelShape("LI", { b: 50.8, t: 6.4 });
  assert.ok(typeof li !== "string");
  ok(near(li.areaMm2!, 2 * 50.8 * 6.4 - 6.4 * 6.4), "sección del ángulo: 2bt − t²");
  eq((li.entities[0] as Extract<CadEntity, { type: "polyline" }>).vertices.length, 6, "seis vértices en L");
  const cps = cadMechanicalSteelShape("CPS", { d: 100, bf: 50, tw: 5, tf: 7.5 });
  assert.ok(typeof cps !== "string");
  eq([cps.id, cps.areaMm2], ["MECH-CPS-100x50x5x7.5", 1175], "canal: 2·bf·tf + (d − 2tf)·tw");
  const ipr = cadMechanicalSteelShape("IPR", { d: 150, bf: 100, tw: 5, tf: 7 });
  assert.ok(typeof ipr !== "string");
  eq([ipr.id, ipr.areaMm2], ["MECH-IPR-150x100x5x7", 2080], "viga I: la misma cuenta");
  const section = ipr.entities[0] as Extract<CadEntity, { type: "polyline" }>;
  eq(section.vertices.length, 12, "doce vértices");
  ok(near(Math.min(...section.vertices.map((v) => v.y)), -75) && near(Math.max(...section.vertices.map((v) => v.y)), 75), "la I va centrada en su eje");
  ok(String(cadMechanicalSteelShape("IPR", { d: 150, bf: 100, tw: 100, tf: 7 })).includes("no dejan alma"), "un alma tan ancha como el patín se rechaza");
  ok(String(cadMechanicalSteelShape("LI", { b: 50, t: -1 })).includes("mayores que cero"), "una medida negativa se rechaza");
}

/* ── Globo ──────────────────────────────────────────────────────────────── */
{
  const entities = cadBalloonEntities({ item: 3, target: { x: 0, y: 0 }, center: { x: 300, y: 400 }, height: 100, layer: "GLOBOS", part: "MECH-TUERCA-M10", targetId: "i1" }, newId);
  eq(entities.map((entity) => entity.type), ["line", "polyline", "circle", "mtext"], "directriz, flecha, círculo y número");
  const [leader, arrow, circle, label] = entities;
  assert.ok(leader.type === "line" && arrow.type === "polyline" && circle.type === "circle" && label.type === "mtext");
  ok(near(Math.hypot(leader.start.x - 300, leader.start.y - 400), 100) && near(leader.end.x, 0) && near(leader.end.y, 0), "la directriz arranca en el borde del círculo y llega a la pieza");
  eq([circle.radius, label.text, label.alignment], [100, "3", "middle-center"], "radio h, el número centrado");
  ok(arrow.closed && arrow.vertices.length === 3 && near(arrow.vertices[0].x, 0), "la flecha cerrada apunta a la pieza");
  eq(cadBalloonMetadata({ item: 3, part: "MECH-TUERCA-M10", targetId: "i1" }), { mechanical: "balloon", balloon: 3, balloonPart: "MECH-TUERCA-M10", balloonTarget: "i1" }, "la marca");
  ok(entities.every((entity) => entity.context?.metadata?.balloon === 3 && entity.layer === "GLOBOS"), "las cuatro piezas con la marca y la capa");
  eq(cadBalloonEntities({ item: 1, target: { x: 5, y: 5 }, center: { x: 5, y: 5 }, height: 10, layer: "0" }, newId).map((entity) => entity.type), ["circle", "mtext"], "flecha y centro coincidentes: sólo el círculo y el número");
}

/* ── Soldadura ──────────────────────────────────────────────────────────── */
{
  const base = { type: "fillet" as const, side: "arrow" as const, size: 0, length: 0, allAround: false, field: false, tail: "", arrow: { x: 0, y: 0 }, reference: { x: 1000, y: 500 }, height: 100, layer: "SOLD" };
  const fillet = cadWeldSymbolEntities(base, newId);
  assert.ok(typeof fillet !== "string");
  eq(fillet.map((entity) => entity.type), ["line", "line", "polyline", "polyline"], "referencia, flecha, punta y el triángulo del filete");
  const reference = fillet[0];
  assert.ok(reference.type === "line");
  ok(near(reference.start.x, 1000) && near(reference.end.x, 1800) && near(reference.end.y, 500), "la referencia sale de la unión hacia la derecha (la flecha está a la izquierda), 8 h");
  const glyph = fillet[3];
  assert.ok(glyph.type === "polyline");
  ok(glyph.closed && glyph.vertices.every((v) => v.y <= 500 + 1e-9) && glyph.vertices.some((v) => near(v.y, 500 - 160)), "el filete del lado de la flecha va DEBAJO, de 1,6 h");
  ok(fillet.every((entity) => entity.context?.metadata?.mechanical === "weld" && entity.context.metadata.weldType === "fillet"), "la marca");

  const full = cadWeldSymbolEntities({ ...base, type: "v", side: "both", size: 6, length: 100, allAround: true, field: true, tail: "E7018" }, newId);
  assert.ok(typeof full !== "string");
  eq(full.map((entity) => entity.type), ["line", "line", "polyline", "polyline", "polyline", "mtext", "mtext", "circle", "line", "polyline", "line", "line", "mtext"], "V a ambos lados, tamaño, longitud, círculo, bandera y cola");
  const texts = full.filter((entity): entity is Extract<CadEntity, { type: "mtext" }> => entity.type === "mtext").map((entity) => entity.text);
  eq(texts, ["6", "100", "E7018"], "tamaño a la izquierda, longitud a la derecha, la nota en la cola");
  const above = full[4];
  assert.ok(above.type === "polyline");
  ok(above.vertices.some((v) => v.y > 500 + 1), "la V del otro lado va ENCIMA");
  const circle = full[7];
  assert.ok(circle.type === "circle");
  ok(near(circle.center.x, 1000) && near(circle.center.y, 500) && near(circle.radius, 35), "«todo alrededor» en la unión");

  const mirrored = cadWeldSymbolEntities({ ...base, arrow: { x: 2000, y: 0 } }, newId);
  assert.ok(typeof mirrored !== "string");
  const mirroredReference = mirrored[0];
  assert.ok(mirroredReference.type === "line");
  ok(near(mirroredReference.end.x, 200), "con la flecha a la derecha, la referencia sale hacia la izquierda");
  ok(typeof cadWeldSymbolEntities({ ...base, arrow: base.reference }, newId) === "string", "flecha y unión coincidentes se rechazan");
}

/* ── Acabado ────────────────────────────────────────────────────────────── */
{
  const h = 100;
  const at = { x: 1000, y: 2000 };
  const basic = cadSurfaceSymbolEntities({ type: "basic", ra: 0, lay: "", at, rotation: 0, height: h, layer: "ACAB" }, newId);
  eq(basic.map((entity) => entity.type), ["line", "line"], "básico: las dos patas");
  const [short, long] = basic;
  assert.ok(short.type === "line" && long.type === "line");
  ok(near(short.end.y, 2000 + 1.4 * h) && near(short.end.x, 1000 - 1.4 * h * Math.tan(Math.PI / 6)), "la pata corta a 60°, 1,4 h");
  ok(near(long.end.y, 2000 + 2.8 * h) && near(long.end.x, 1000 + 2.8 * h * Math.tan(Math.PI / 6)), "la pata larga a 60°, 2,8 h");
  const removal = cadSurfaceSymbolEntities({ type: "removal", ra: 3.2, lay: "⊥", at, rotation: 0, height: h, layer: "ACAB" }, newId);
  eq(removal.map((entity) => entity.type), ["line", "line", "line", "line", "mtext", "mtext"], "mecanizado: barra, línea de requisitos, Ra y estrías");
  const bar = removal[2];
  assert.ok(bar.type === "line");
  ok(near(bar.start.y, 2000 + 1.4 * h) && near(bar.end.y, 2000 + 1.4 * h) && near(bar.end.x, 1000 + 1.4 * h * Math.tan(Math.PI / 6)), "la barra cierra el triángulo a 1,4 h");
  eq(removal.filter((entity): entity is Extract<CadEntity, { type: "mtext" }> => entity.type === "mtext").map((entity) => entity.text), ["Ra 3.2", "⊥"], "Ra en a, la dirección en d");
  const prohibited = cadSurfaceSymbolEntities({ type: "prohibited", ra: 0, lay: "", at, rotation: 0, height: h, layer: "ACAB" }, newId);
  eq(prohibited.map((entity) => entity.type), ["line", "line", "circle"], "prohibido: el círculo inscrito");
  const rotated = cadSurfaceSymbolEntities({ type: "basic", ra: 0, lay: "", at, rotation: 90, height: h, layer: "ACAB" }, newId);
  const rotatedLong = rotated[1];
  assert.ok(rotatedLong.type === "line");
  ok(near(rotatedLong.end.x, 1000 - 2.8 * h) && near(rotatedLong.end.y, 2000 + 2.8 * h * Math.tan(Math.PI / 6)), "girado 90°: la pata larga sube por −X");
  ok(removal.every((entity) => entity.context?.metadata?.mechanical === "surface" && entity.context.metadata.surfaceRa === 3.2), "la marca con Ra");
}

/* ── La lista de materiales ─────────────────────────────────────────────── */
{
  const bolt = cadMechanicalBlockDefinition(cadMechanicalBolt(10, 40)!);
  const nut = cadMechanicalBlockDefinition(cadMechanicalNut(10)!);
  const insert = (id: string, block: string): CadEntity => ({ id, type: "insert", block, insertion: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "0" });
  const balloon = (id: string, item: number, part: string): CadEntity => ({ id, type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 10, layer: "0", context: { metadata: cadBalloonMetadata({ item, part }) } });
  const blocks: CadBlockDefinition[] = [bolt, nut, { id: "MEP-VALVULA", name: "MEP-VALVULA", basePoint: { x: 0, y: 0, z: 0 }, entities: [] }];
  const entities: CadEntity[] = [
    insert("i1", bolt.id), insert("i2", bolt.id), insert("i3", bolt.id),
    insert("i4", nut.id),
    insert("i5", "MEP-VALVULA"),
    balloon("g1", 2, nut.id),
    balloon("g2", 1, ""),
    { id: "g2t", type: "mtext", insertion: { x: 0, y: 0, z: 0 }, text: "1", layer: "0", context: { metadata: cadBalloonMetadata({ item: 1 }) } },
  ];
  const bom = buildCadMechanicalBom({ entities, blocks });
  eq(bom.balloons, 2, "dos globos (el número del globo no cuenta como globo)");
  eq(bom.rows, [
    { item: 1, count: 1, name: "Objeto designado sin normalizado", standard: "—", blockId: "", ballooned: true },
    { item: 2, count: 1, name: "Tuerca hexagonal M10", standard: "ISO 4032", blockId: nut.id, ballooned: true },
    { item: 3, count: 3, name: "Tornillo hexagonal M10 × 40", standard: "ISO 4017", blockId: bolt.id, ballooned: false },
  ], "el globo da la posición; el tornillo sin globo toma la siguiente; la válvula MEP no entra");
  const table = buildCadMechanicalBomTable(bom, { x: 5000, y: 100 }, "LISTA", newId);
  const cell = (row: number) => table.cells.filter((c) => c.row === row).sort((a, b) => a.column - b.column).map((c) => c.text);
  eq(cell(1), [...BOM_HEADERS], "cabecera");
  eq(cell(2), ["1", "1", "Objeto designado sin normalizado", "—", "—"], "fila 1");
  eq(cell(4), ["3", "3", "Tornillo hexagonal M10 × 40", "ISO 4017", "MECH-TORNILLO-M10x40"], "fila 3 con su bloque");
  eq([table.rows, table.columns, table.insertion, table.layer], [5, 5, { x: 5000, y: 100, z: 0 }, "LISTA"], "la tabla en su sitio");
  eq(buildCadMechanicalBom({ entities: [insert("i5", "MEP-VALVULA")], blocks }).rows, [], "sin normalizados ni globos, sin filas");
  eq(buildCadMechanicalBom({ entities: [insert("i9", "MECH-HUERFANO")], blocks }).rows[0], { item: 1, count: 1, name: "MECH-HUERFANO", standard: "—", blockId: "MECH-HUERFANO", ballooned: false }, "un MECH sin definición sale por su id");

  /* ── La tabla se deja encontrar, y se deja releer ──────────────────────── */
  eq(table.context?.metadata?.mechanical, CAD_BOM_MARK, "la tabla nace marcada: sin marca, nadie la vuelve a encontrar");
  const forzada = buildCadMechanicalBomTable(bom, { x: 0, y: 0 }, "LISTA", () => "NO-DEBERÍA-USARSE", "t-vieja");
  eq(forzada.id, "t-vieja", "el id forzado manda: actualizar conserva la identidad de la tabla de ayer");

  const otraTabla: CadEntity = { ...forzada, id: "otra", context: { metadata: { mechanical: "balloon" } } };
  const tablaMuda: CadEntity = { ...forzada, id: "muda", context: undefined };
  eq(findCadMechanicalBomTables({ entities: [tablaMuda, forzada as CadEntity, otraTabla, insert("i1", bolt.id)] }).map((t) => t.id), ["t-vieja"], "sólo la tabla marcada como lista; ni el cuadro de muros ni un globo");
  eq(findCadMechanicalBomTables({ entities: [] }).length, 0, "un dibujo sin lista no tiene ninguna");

  eq(readCadMechanicalBomTable(forzada), { items: 3, units: 5 }, "lo que la tabla DICE hoy sale de sus celdas: tres posiciones, 1 + 1 + 3 unidades");
  eq(readCadMechanicalBomTable(buildCadMechanicalBomTable({ rows: [], balloons: 0 }, { x: 0, y: 0 }, "LISTA", newId)), { items: 0, units: 0 }, "una lista vacía dice cero, no miente con la última que tuvo");
}

console.log(`✅ mechanical.spec: ${checks} comprobaciones`);
