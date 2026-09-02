import assert from "node:assert/strict";
import { CadRenderPipeline, type CadOffThreadTessellator } from "./pipeline";
import { CadTessellationCache } from "./tessellation-cache";
import { tessellateCadEntityBatch } from "./tessellate.worker";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../entity-runtime";
import { defaultCadRenderStyle } from "./render-style";
import { cadEntityIsTextOnly, cadTextQuadRequestsFor } from "./text-requests";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const COLOR = 0x60a5fa;
const DEPTH = 0.25;
const plain = () => COLOR;

// El corpus medido ANTES del módulo: seis rótulos, de los que sólo el MTEXT
// llegaba al atlas (`visibleTextRequests()` = 1, TEXT y ATTDEF teselados como
// un marco de 4 segmentos cada uno).
const rotulo = { id: "rotulo", type: "mtext", insertion: { x: 6000, y: 6000, z: 0 }, text: "PLANTA BAJA", height: 400, layer: "0" } as CadNativeEntity;
const texto = { id: "texto", type: "text", x: 1000, y: 8000, text: "NIVEL +0.00", height: 300, layer: "0" } as CadNativeEntity;
const cota = { id: "cota", type: "dimension", a: { x: 1000, y: 1000 }, b: { x: 5000, y: 1000 }, offset: 600, dimensionKind: "linear", axis: "x", layer: "0" } as CadNativeEntity;
const directriz = { id: "directriz", type: "mleader", vertices: [{ x: 7000, y: 3000, z: 0 }, { x: 8000, y: 4000, z: 0 }], text: "VER DETALLE", textPosition: { x: 8200, y: 4000, z: 0 }, layer: "0" } as CadNativeEntity;
const tabla = { id: "tabla", type: "table", insertion: { x: 1000, y: 9500, z: 0 }, rows: 2, columns: 2, rowHeights: [400, 400], columnWidths: [1500, 1500], cells: [
  { row: 0, column: 0, text: "CLAVE" }, { row: 0, column: 1, text: "AREA" }, { row: 1, column: 0, text: "A-1" }, { row: 1, column: 1, text: "12.50" },
], layer: "0" } as CadNativeEntity;
const atributo = { id: "atributo", type: "attdef", tag: "PROYECTO", defaultValue: "CASA", insertion: { x: 9000, y: 9000, z: 0 }, height: 200, layer: "0" } as CadNativeEntity;
const linea = { id: "linea", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: "0" } as CadNativeEntity;
const corpus = [rotulo, texto, cota, directriz, tabla, atributo];
const VIEW = { bounds: { minX: 0, minY: 0, maxX: 12000, maxY: 11000 }, pixelsPerUnit: 0.1 };

// ---------------------------------------------------------------------------
// 1. Contrato de conteo: cinco tipos rotulan, uno por rótulo y uno por celda.
// ---------------------------------------------------------------------------
assert.deepEqual(
  corpus.map((entity) => cadTextQuadRequestsFor(entity, plain, DEPTH).length),
  [1, 1, 1, 1, 4, 1],
  "mtext, text, cota, directriz, cuatro celdas y attdef: cada uno con su petición",
);
checks += 1;
ok(cadTextQuadRequestsFor(linea, plain, DEPTH).length === 0, "una línea no rotula nada");

// La marca `textOnly` del REGISTRO coincide con la realidad en los dos
// sentidos: quien la lleva rotula y su `paths` es sólo una caja cerrada de 4
// puntos; quien no la lleva, o no rotula, o su geometría es más que una caja.
const textOnlyTypes: string[] = [];
for (const entity of [...corpus, linea]) {
  const adapter = CAD_ENTITY_REGISTRY.adapter(entity);
  const flagged = cadEntityIsTextOnly(entity);
  if (flagged) textOnlyTypes.push(entity.type);
  const paths = adapter.renderer.paths(entity);
  const onlyBox = paths.length === 1 && paths[0].closed === true && paths[0].points.length === 4;
  const labels = cadTextQuadRequestsFor(entity, plain, DEPTH).length > 0;
  ok(flagged === (labels && onlyBox), `${entity.type}: textOnly=${flagged} pero rotula=${labels} y caja=${onlyBox}`);
}
assert.deepEqual(textOnlyTypes.sort(), ["attdef", "mtext", "text"], "mtext, text y attdef son los rótulos puros del registro");
checks += 1;

// ---------------------------------------------------------------------------
// 2. El MTEXT de una línea es EXACTAMENTE la petición que el pipeline emitía
//    antes (más `align: "left"`, que el atlas trata como ausente).
// ---------------------------------------------------------------------------
assert.deepEqual(cadTextQuadRequestsFor(rotulo, plain, DEPTH), [
  { text: "PLANTA BAJA", fontKey: "Arial", fontSize: 400, x: 6000, y: 6000, rotationDeg: 0, align: "left", color: COLOR, depth: DEPTH },
]);
checks += 1;
assert.deepEqual(cadTextQuadRequestsFor(texto, plain, DEPTH), [
  { text: "NIVEL +0.00", fontKey: "Arial", fontSize: 300, x: 1000, y: 8000, rotationDeg: 0, align: "left", color: COLOR, depth: DEPTH },
]);
checks += 1;

// ---------------------------------------------------------------------------
// 3. Anclas numéricas. La Y del dibujo crece hacia abajo en pantalla (medido);
//    la base sube una línea entera en bottom-*, media en middle-*, y el
//    centrado horizontal lo hace el atlas con la métrica real (`align`).
// ---------------------------------------------------------------------------
const [rotuloCota] = cadTextQuadRequestsFor(cota, plain, DEPTH);
ok(rotuloCota.text === "4000.00 mm", `la cota rotula su medida: ${rotuloCota.text}`);
ok(near(rotuloCota.fontSize, 99), "sin DIMTXT el rótulo mide 0,55 × DIMASZ (180) = 99");
ok(near(rotuloCota.x, 3000) && rotuloCota.align === "center", `middle-center: el ancla ES el origen y el atlas centra: x=${rotuloCota.x}`);
ok(near(rotuloCota.y, 1690 + (99 * 1.2) / 2), `middle-* sube media línea: y=${rotuloCota.y}`);
const [cotaGirada] = cadTextQuadRequestsFor({ ...cota, textPosition: { x: 3000, y: 1690 }, a: { x: 1000, y: 1000 }, b: { x: 1000, y: 5000 }, axis: "y" } as CadNativeEntity, plain, DEPTH);
ok(cotaGirada.rotationDeg !== 0 && near(cotaGirada.x, 3000 - 59.4 * Math.sin((cotaGirada.rotationDeg! * Math.PI) / 180)),
  `girada, el desplazamiento vertical gira con el rótulo (${cotaGirada.rotationDeg}°, x=${cotaGirada.x})`);

const [atributoBase] = cadTextQuadRequestsFor(atributo, plain, DEPTH);
ok(atributoBase.text === "CASA", "el attdef dibuja su valor por defecto");
ok(near(atributoBase.x, 9000) && near(atributoBase.y, 9240) && atributoBase.align === "left", `bottom-left sube una línea entera (1,2 × 200): (${atributoBase.x}, ${atributoBase.y})`);
const [atributoGirado] = cadTextQuadRequestsFor({ ...atributo, rotation: 90 } as CadNativeEntity, plain, DEPTH);
ok(near(atributoGirado.x, 8760) && near(atributoGirado.y, 9000) && atributoGirado.rotationDeg === 90,
  `a 90° el desplazamiento vertical gira con el rótulo: (${atributoGirado.x}, ${atributoGirado.y})`);
const [etiqueta] = cadTextQuadRequestsFor({ ...atributo, defaultValue: undefined } as CadNativeEntity, plain, DEPTH);
ok(etiqueta.text === "PROYECTO", "sin valor por defecto se dibuja la etiqueta");

const [directrizBase] = cadTextQuadRequestsFor(directriz, plain, DEPTH);
ok(near(directrizBase.x, 8200) && near(directrizBase.y, 4000 + 72) && directrizBase.align === "left", `la directriz hacia la derecha cuelga middle-left del ancla: (${directrizBase.x}, ${directrizBase.y})`);
const izquierda = { ...directriz, vertices: [{ x: 9000, y: 3000, z: 0 }, { x: 8000, y: 4000, z: 0 }], textPosition: { x: 7800, y: 4000, z: 0 } } as CadNativeEntity;
const [directrizIzquierda] = cadTextQuadRequestsFor(izquierda, plain, DEPTH);
ok(near(directrizIzquierda.x, 7800) && directrizIzquierda.align === "right", `hacia la izquierda es middle-right: el atlas resta la anchura real (${directrizIzquierda.x}, ${directrizIzquierda.align})`);

const celdas = cadTextQuadRequestsFor(tabla, plain, DEPTH);
const celda11 = celdas.find((request) => request.text === "12.50");
ok(celda11 !== undefined && near(celda11.x, 2560) && near(celda11.y, 9020) && near(celda11.fontSize, 200) && celda11.align === "left",
  `la celda (1,1) es middle-left por defecto, como el escritor DXF: (${celda11?.x}, ${celda11?.y}) h=${celda11?.fontSize}`);
const [celdaArriba] = cadTextQuadRequestsFor({ ...tabla, cells: [{ row: 1, column: 1, text: "12.50", alignment: "top-left" }] } as CadNativeEntity, plain, DEPTH);
ok(near(celdaArriba.x, 2560) && near(celdaArriba.y, 9040), `top-left nace en la esquina más el relleno 0,15 × fila: (${celdaArriba.x}, ${celdaArriba.y})`);
const [celdaCentro] = cadTextQuadRequestsFor({ ...tabla, cells: [{ row: 0, column: 0, text: "X", alignment: "middle-center" }] } as CadNativeEntity, plain, DEPTH);
ok(near(celdaCentro.x, 1750) && celdaCentro.align === "center", `middle-center ancla en el centro de la celda: ${celdaCentro.x}`);

// Varias líneas: una petición por línea, y la siguiente BAJA en pantalla (+Y).
const dosLineas = cadTextQuadRequestsFor({ ...texto, text: "DOS\nLINEAS" } as CadNativeEntity, plain, DEPTH);
ok(dosLineas.length === 2 && dosLineas[1].text === "LINEAS" && near(dosLineas[1].x, 1000) && near(dosLineas[1].y, 8360),
  `TEXT de dos líneas: la segunda una línea más abajo (${dosLineas[1]?.x}, ${dosLineas[1]?.y})`);
const parrafos = cadTextQuadRequestsFor({ ...rotulo, text: "PLANTA\\PBAJA" } as CadNativeEntity, plain, DEPTH);
ok(parrafos.length === 2 && parrafos[0].text === "PLANTA" && near(parrafos[1].y, 6480), `MTEXT parte sus párrafos \\P: ${parrafos.map((r) => r.text).join("|")}`);

// Familia: TEXT/ATTDEF/celda y cota resuelven el estilo del documento igual.
const styles = { styles: { text: { Rotulos: { fontFamily: "Roboto" }, ROTULO: { fontFamily: "Verdana" } }, dimension: { ISO: { textStyle: "Rotulos" } }, mleader: {}, table: {}, plot: {} } };
const [conEstilo] = cadTextQuadRequestsFor({ ...cota, style: "ISO" } as CadNativeEntity, plain, DEPTH, styles as never);
ok(conEstilo.fontKey === "Roboto", `DIMTXSTY resuelve la familia por el documento: ${conEstilo.fontKey}`);
const [textoConEstilo] = cadTextQuadRequestsFor({ ...texto, style: "ROTULO" } as CadNativeEntity, plain, DEPTH, styles as never);
ok(textoConEstilo.fontKey === "Verdana", `TEXT con estilo del documento: ${textoConEstilo.fontKey}`);

// DIMCLRT tiñe el rótulo a través del MISMO resolutor que las líneas, así que
// la selección (que el anfitrión aplica antes que la presentación) gana.
const presentationColor = (entity: CadNativeEntity) => defaultCadRenderStyle(entity).color;
const [roja] = cadTextQuadRequestsFor({ ...cota, textColor: "#ff0000" } as CadNativeEntity, presentationColor, DEPTH);
ok(roja.color === 0xff0000, `DIMCLRT tiñe el rótulo: ${roja.color.toString(16)}`);
const [seleccionada] = cadTextQuadRequestsFor({ ...cota, textColor: "#ff0000" } as CadNativeEntity, () => 0xfbbf24, DEPTH);
ok(seleccionada.color === 0xfbbf24, `con la cota seleccionada, la selección gana a DIMCLRT: ${seleccionada.color.toString(16)}`);

// Lo que NO rotula.
ok(cadTextQuadRequestsFor({ ...atributo, invisible: true } as CadNativeEntity, plain, DEPTH).length === 0, "un attdef invisible no se dibuja");
ok(cadTextQuadRequestsFor({ ...directriz, text: "   " } as CadNativeEntity, plain, DEPTH).length === 0, "una directriz sin texto no rotula");
ok(cadTextQuadRequestsFor({ ...cota, b: { x: 1000, y: 1000 } } as CadNativeEntity, plain, DEPTH).length === 0, "una cota degenerada no rotula");

// ---------------------------------------------------------------------------
// 4. A través del pipeline: nueve peticiones (antes, una) y TEXT/ATTDEF sin caja.
// ---------------------------------------------------------------------------
const pipeline = new CadRenderPipeline();
pipeline.replace(corpus, corpus.map((entity) => entity.id));
pipeline.setView(VIEW);
pipeline.settle();
const stats = pipeline.stats();
ok(pipeline.visibleTextRequests().length === 9, `nueve rótulos visibles (medido antes: 1): ${pipeline.visibleTextRequests().length}`);
ok(stats.glyphRequests === 11 + 11 + 10 + 11 + 17 + 4, `glifos pedidos = suma de longitudes: ${stats.glyphRequests}`);
ok(stats.renderedEntities === 6, `las seis entidades cuentan como dibujadas: ${stats.renderedEntities}`);

const soloTexto = new CadRenderPipeline();
soloTexto.replace([texto, atributo], ["texto", "atributo"]);
soloTexto.setView(VIEW);
soloTexto.settle();
ok(soloTexto.stats().instances === 0, `TEXT y ATTDEF ya no teselan su caja (medido antes: 8 instancias): ${soloTexto.stats().instances}`);
ok(soloTexto.stats().renderedEntities === 2, "y aun así cuentan como dibujadas");

// ---------------------------------------------------------------------------
// 5. Con worker: los rótulos puros NO viajan a teselarse, y el reencolado del
//    tile no duplica los rótulos de cota y directriz (si la llamada se moviera
//    antes de la guarda saldrían 3: la cota repetida).
// ---------------------------------------------------------------------------
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
async function conWorker(): Promise<void> {
  const dispatched: string[] = [];
  const offThread: CadOffThreadTessellator = (entities, segments) => {
    for (const entity of entities) dispatched.push(entity.id);
    return Promise.resolve({ results: tessellateCadEntityBatch(entities, segments).results, source: "worker" as const });
  };
  // Los cuatro en un MISMO tile (todos dentro de 8500×8500).
  const atributoCerca = { ...atributo, insertion: { x: 2000, y: 2500, z: 0 } } as CadNativeEntity;
  const textoCerca = { ...texto, y: 3000 } as CadNativeEntity;
  const conjunto = [cota, textoCerca, directriz, atributoCerca];
  const pipe = new CadRenderPipeline({ offThread, cache: new CadTessellationCache() });
  pipe.replace(conjunto, conjunto.map((entity) => entity.id));
  pipe.setView(VIEW);
  let guard = 0;
  while (!pipe.settled) {
    if (++guard > 100_000) throw new Error("el pipeline no asienta");
    if (pipe.runFrame().ran === 0) await flush();
  }
  assert.deepEqual([...dispatched].sort(), ["cota", "directriz"], `al worker viajan sólo cota y directriz (medido antes: también texto y atributo): ${dispatched.join(", ")}`);
  checks += 1;
  const textos = pipe.visibleTextRequests().map((request) => request.text);
  ok(textos.length === 4 && new Set(textos).size === 4, `cada rótulo aparece UNA vez con el worker: ${textos.join(" | ")}`);
}

conWorker().then(
  () => console.log(`text-requests: ${checks} comprobaciones verdes`),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
