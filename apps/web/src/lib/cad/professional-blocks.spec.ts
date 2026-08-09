import assert from 'node:assert/strict';
import { layoutToCadDocument, type CadBlockDefinition, type CadDocument, type CadEntity } from './cad-document';
import {
  analyzeCadBlocks,
  buildCadBlockThumbnail,
  buildCadInsertBatches,
  defineCadBlock,
  explodeCadInsert,
  insertCadBlock,
  purgeUnusedCadBlocks,
  redefineCadBlock,
  replaceCadBlock,
  resolveCadInsert,
  searchCadBlocks,
} from './professional-blocks';
import { CAD_ENTITY_REGISTRY } from './entity-runtime';
import { executeCadEntityCommand } from './entity-commands';

const line = (id: string, x1: number, y1: number, x2: number, y2: number, layer = '0'): CadEntity => ({
  id, type: 'line', start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 }, layer,
  context: { presentation: { color: { source: 'byBlock' } } },
});
const empty = (): CadDocument => layoutToCadDocument({ layers: [{ id: 'E', name: 'Equipment', color: '#00ffff', visible: true, locked: false }] });

let document = empty();
document = { ...document, entities: [line('source-a', 10, 20, 30, 20, 'E')], modelSpace: { entityIds: ['source-a'] } };
document = defineCadBlock(document, {
  id: 'door', name: 'DOOR', entityIds: ['source-a'], basePoint: { x: 10, y: 20, z: 0 },
  attributes: { MARK: { required: true, defaultValue: 'D-01', prompt: 'Door mark', position: { x: 10, y: 22, z: 0 }, height: 2 } },
  description: 'Steel access door', keywords: ['architecture', 'door'], library: { scope: 'tenant', tenantId: 'tenant-a' },
  businessLink: { tenantId: 'tenant-a', entityType: 'assetType', entityId: 'door-standard' },
});
assert.equal(document.blocks[0].version, 1, 'definition starts at version 1');
assert.equal(document.entities[0].type, 'insert', 'BLOCK replaces selected geometry with one live INSERT');
assert.equal(resolveCadInsert(document, document.entities[0].id).entities.length, 2, 'resolves geometry plus visible attribute');

document = insertCadBlock(document, {
  id: 'door-2', block: 'DOOR', insertion: { x: 100, y: 50, z: 0 }, scale: { x: 2, y: 2, z: 1 }, rotation: 90,
  layer: 'E', attributes: { MARK: 'D-02' }, context: { presentation: { color: { source: 'explicit', value: '#f97316' } }, businessLink: { entityType: 'workOrder', entityId: 'wo-42' } },
});
const resolved = resolveCadInsert(document, 'door-2');
const resolvedLine = resolved.entities.find((entity) => entity.type === 'line');
assert.ok(resolvedLine?.type === 'line');
assert.ok(Math.abs(resolvedLine.start.x - 100) < 1e-8 && Math.abs(resolvedLine.start.y - 50) < 1e-8, 'base point lands on insertion');
assert.ok(Math.abs(resolvedLine.end.x - 100) < 1e-8 && Math.abs(resolvedLine.end.y - 90) < 1e-8, 'scale and rotation are exact');
assert.equal(resolvedLine.context?.presentation?.color?.source, 'explicit', 'ByBlock resolves from instance override');
assert.ok(resolved.entities.some((entity) => entity.type === 'text' && entity.text === 'D-02'), 'per-instance attribute is rendered');
const nativeInsert = document.entities.find((entity) => entity.id === 'door-2')!;
assert.ok(CAD_ENTITY_REGISTRY.supports(nativeInsert), 'INSERT is a first-class native selectable entity');
if (!CAD_ENTITY_REGISTRY.supports(nativeInsert)) throw new Error('expected native INSERT');
const insertAdapter = CAD_ENTITY_REGISTRY.adapter(nativeInsert);
assert.ok(insertAdapter.renderer.paths(nativeInsert, 64, document).length > 0, 'registry renders the live definition without exploding it');
assert.equal(insertAdapter.hitTester.hitTest(nativeInsert, { x: 100, y: 70 }, 1, document), true, 'unitary hit-test follows transformed child geometry');
assert.equal(insertAdapter.properties.read(nativeInsert)['attribute:MARK'], 'D-02', 'per-instance attributes are editable properties');
const moved = executeCadEntityCommand(document, { type: 'transform', entityId: 'door-2', transform: { translation: { x: 25, y: 0 } } });
const movedInsert = moved.document.entities.find((entity) => entity.id === 'door-2');
assert.ok(movedInsert?.type === 'insert');
assert.equal(movedInsert.insertion.x, 125, 'command bus transforms INSERT without exploding it');
assert.equal(resolveCadInsert(document, 'door').diagnostics[0]?.severity, 'error', 'unknown insert id is honest');

const nested: CadBlockDefinition = {
  id: 'assembly', name: 'ASSEMBLY', basePoint: { x: 0, y: 0, z: 0 }, version: 1,
  entities: [{ id: 'nested-door', type: 'insert', block: 'door', insertion: { x: 10, y: 20, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, attributes: { MARK: 'N-1' }, layer: '0' }],
};
document = { ...document, blocks: [...document.blocks, nested], entities: [...document.entities, { id: 'assembly-1', type: 'insert', block: 'assembly', insertion: { x: 500, y: 600, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: 'E' }], modelSpace: { entityIds: [...document.modelSpace.entityIds, 'assembly-1'] } };
assert.equal(resolveCadInsert(document, 'assembly-1').entities.length, 2, 'nested block resolves without exploding the stored instance');
assert.equal(analyzeCadBlocks(document).length, 0, 'valid nesting and attributes pass validation');

const cyclic: CadDocument = { ...document, blocks: document.blocks.map((block) => block.id === 'door' ? { ...block, entities: [...block.entities, { id: 'cycle', type: 'insert', block: 'assembly', insertion: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: '0' }] } : block) };
assert.ok(analyzeCadBlocks(cyclic).some((item) => item.code === 'block_cycle'), 'cycle detection traverses nested definitions');
assert.throws(() => redefineCadBlock(document, 'door', cyclic.blocks[0].entities), /Cycle/, 'redefine rejects a new cycle');

document = redefineCadBlock(document, 'door', [line('replacement', 10, 20, 50, 20)]);
assert.equal(document.blocks.find((block) => block.id === 'door')?.version, 2, 'redefine increments version');
const redefined = resolveCadInsert(document, 'door-2').entities.find((entity) => entity.type === 'line');
assert.ok(redefined?.type === 'line' && Math.abs(redefined.end.y - 130) < 1e-8, 'existing instance reads live redefined geometry');

const target: CadBlockDefinition = { id: 'window', name: 'WINDOW', basePoint: { x: 0, y: 0, z: 0 }, entities: [line('window-line', 0, 0, 5, 0)], attributes: { CODE: { defaultValue: 'W' } }, version: 1 };
document = { ...document, blocks: [...document.blocks, target] };
document = replaceCadBlock(document, 'door', 'window', { CODE: 'MARK' });
assert.ok(document.entities.filter((entity) => entity.type === 'insert' && entity.block === 'window').length >= 2, 'replace retargets every source instance');
assert.ok(document.entities.some((entity) => entity.type === 'insert' && entity.attributes?.CODE === 'D-02'), 'replace maps per-instance attributes');

const toExplode = document.entities.find((entity) => entity.type === 'insert' && entity.id === 'door-2');
assert.ok(toExplode);
document = explodeCadInsert(document, 'door-2');
assert.ok(!document.entities.some((entity) => entity.id === 'door-2'), 'explode removes the INSERT');
assert.ok(document.entities.some((entity) => entity.id.startsWith('door-2:root')), 'explode creates independently editable geometry');

assert.deepEqual(searchCadBlocks(document.blocks, 'steel door').map((block) => block.id), ['door'], 'search covers description and keywords');
assert.ok(buildCadBlockThumbnail(document.blocks.find((block) => block.id === 'door')!).includes('<path'), 'thumbnail is deterministic SVG geometry');
const batches = buildCadInsertBatches(document);
assert.ok(batches.every((batch) => batch.insertIds.length > 0 && batch.matrices.length === batch.insertIds.length), 'batch plan groups instance matrices');

const purge = purgeUnusedCadBlocks({ ...document, blocks: [...document.blocks, { id: 'unused', name: 'UNUSED', basePoint: { x: 0, y: 0, z: 0 }, entities: [line('u', 0, 0, 1, 0)] }] });
assert.ok(purge.purged.includes('unused'), 'purge removes unreachable definitions');
assert.ok(purge.document.blocks.some((block) => block.id === 'window'), 'purge preserves blocks referenced by live inserts');

// --- INSERT ESPEJADO ----------------------------------------------------------
//
// Hasta aquí este archivo sólo probaba `scale: {x:1,y:1}` y `{x:2,y:2}`: ni un
// solo caso con escala negativa. Y `transformedEntity` consultaba
// `metrics.reflected` en UN sitio —el `bulge` de la polilínea—; todo lo demás le
// sumaba el ángulo a la geometría como si la matriz fuera un giro. Con
// `resolveCadInsert` alimentando render, selección, límites y exportación DXF a
// la vez, el bloque espejado salía mal por los cuatro sitios.
//
// Las afirmaciones son ABSOLUTAS. La involución no bastaría: `transformedEntity`
// no es una operación que se pueda aplicar dos veces sobre su propio resultado,
// y aunque lo fuera, un campo que el código no toca sobrevive a cualquier ida y
// vuelta. Los números de abajo dicen qué tiene que salir.
{
  const mirrored: CadBlockDefinition = {
    id: 'ala', name: 'ALA', basePoint: { x: 0, y: 0, z: 0 }, version: 1,
    entities: [
      { id: 'ala-arco', type: 'arc', center: { x: 100, y: 0, z: 0 }, radius: 50, startAngle: 30, endAngle: 200, layer: '0' },
      { id: 'ala-poli', type: 'polyline', vertices: [{ x: 0, y: 0, z: 0 }, { x: 200, y: 0, z: 0, bulge: 0.5 }, { x: 200, y: 120, z: 0 }], closed: false, layer: '0' },
      { id: 'ala-texto', type: 'mtext', insertion: { x: 10, y: 10, z: 0 }, text: 'ALA OESTE', height: 20, rotation: 15, layer: '0' },
      { id: 'ala-sombra', type: 'hatch', pattern: 'ANSI31', solid: false, boundaries: [[{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 80, z: 0 }]], angle: 45, scale: 3, layer: '0' },
      { id: 'ala-sombra-defecto', type: 'hatch', pattern: 'ANSI31', solid: false, boundaries: [[{ x: 300, y: 0, z: 0 }, { x: 400, y: 0, z: 0 }, { x: 400, y: 80, z: 0 }]], layer: '0' },
      { id: 'ala-elipse', type: 'ellipse', center: { x: 0, y: 200, z: 0 }, majorAxis: { x: 60, y: 0, z: 0 }, ratio: 0.5, startParameter: 30, endParameter: 200, layer: '0' },
      { id: 'ala-circulo', type: 'circle', center: { x: 0, y: 300, z: 0 }, radius: 25, layer: '0' },
    ],
  };
  const canvas: CadDocument = {
    ...empty(), blocks: [mirrored],
    entities: [
      { id: 'ala-1', type: 'insert', block: 'ala', insertion: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: '0' },
      // `scale.x = −1` es el espejo sobre el eje Y: la matriz queda reflectante
      // y `2φ = 180°`, así que todo ángulo almacenado α acaba en `180 − α`.
      { id: 'ala-espejo', type: 'insert', block: 'ala', insertion: { x: 0, y: 0, z: 0 }, scale: { x: -1, y: 1, z: 1 }, rotation: 0, layer: '0' },
    ],
    modelSpace: { entityIds: ['ala-1', 'ala-espejo'] },
  };
  const plain = resolveCadInsert(canvas, 'ala-1').entities;
  const flipped = resolveCadInsert(canvas, 'ala-espejo').entities;
  const pick = <T extends CadEntity['type']>(entities: CadEntity[], type: T, index = 0) =>
    entities.filter((entity) => entity.type === type)[index] as Extract<CadEntity, { type: T }>;
  const around = (value: number) => ((value % 360) + 360) % 360;

  // El espejo no explota nada ni pierde entidades por el camino.
  assert.equal(flipped.length, plain.length, 'un INSERT espejado resuelve las mismas entidades');

  // Arco: sigue siendo un ARCO —un espejo puro conserva los ángulos, así que la
  // matriz es conforme y no hay motivo para degradarlo a polilínea— y sus
  // extremos se INTERCAMBIAN además de reflejarse: de 30°…200° salen
  // 180−200 = −20 ≡ 340 y 180−30 = 150.
  const arc = pick(flipped, 'arc');
  assert.equal(arc.type, 'arc', 'un espejo puro NO degrada el arco a segmentos');
  assert.ok(Math.abs(arc.center.x + 100) < 1e-9, `el centro se refleja: ${arc.center.x}`);
  assert.ok(Math.abs(arc.radius - 50) < 1e-9, `y el radio no cambia: ${arc.radius}`);
  assert.ok(Math.abs(around(arc.startAngle) - 340) < 1e-9, `el inicio sale del FINAL reflejado: ${arc.startAngle}`);
  assert.ok(Math.abs(around(arc.endAngle) - 150) < 1e-9, `y el final del inicio reflejado: ${arc.endAngle}`);
  // Sin espejo el arco se queda exactamente como estaba.
  assert.ok(Math.abs(around(pick(plain, 'arc').startAngle) - 30) < 1e-9, 'sin espejo el arco no se mueve');

  // Polilínea: el `bulge` codifica el sentido del arco y se NIEGA.
  const polyline = pick(flipped, 'polyline');
  assert.equal(polyline.vertices[1].bulge, -0.5, 'el bulge se niega al espejar el bloque');
  assert.ok(Math.abs(polyline.vertices[1].x + 200) < 1e-9, `y el vértice se refleja: ${polyline.vertices[1].x}`);

  // MTEXT: el rótulo se re-orienta RESTANDO. 180 − 15 = 165. Sumar dejaba 195,
  // o sea el texto inclinado hacia el lado contrario al de su geometría.
  assert.ok(Math.abs(around(pick(flipped, 'mtext').rotation ?? 0) - 165) < 1e-9, `el rótulo se re-orienta restando: ${pick(flipped, 'mtext').rotation}`);
  assert.ok(Math.abs(around(pick(plain, 'mtext').rotation ?? 0) - 15) < 1e-9, 'y sin espejo se queda como estaba');

  // Sombreado: el ángulo del patrón pasa de α a 2φ − α. 180 − 45 = 135. Sumarlo
  // dejaba las dos alas rayadas igual — sólo se ve comparándolas en la lámina.
  assert.ok(Math.abs(around(pick(flipped, 'hatch').angle ?? 0) - 135) < 1e-9, `el patrón se refleja: ${pick(flipped, 'hatch').angle}`);
  assert.equal(pick(flipped, 'hatch').scale, 3, 'el espaciado no cambia bajo un espejo puro');
  // El sombreado SIN ángulo explícito parte del 45° que dibuja el renderizador,
  // no del 0 que materializaba este camino. Reflejado: 180 − 45 = 135.
  assert.ok(Math.abs(around(pick(flipped, 'hatch', 1).angle ?? 0) - 135) < 1e-9, `el defecto correcto es 45°: ${pick(flipped, 'hatch', 1).angle}`);
  // Y sin espejo ni giro sigue AUSENTE: resolver un bloque no debe escribirle un
  // patrón que nadie eligió.
  assert.equal(pick(plain, 'hatch', 1).angle, undefined, 'sin transformada angular el ángulo sigue ausente');
  assert.equal(pick(plain, 'hatch', 1).scale, undefined, 'y el espaciado también');

  // Arco elíptico: los parámetros están en grados, se reflejan y se
  // intercambian. 360 − 200 = 160 y 360 − 30 = 330.
  const ellipse = pick(flipped, 'ellipse');
  assert.ok(Math.abs(ellipse.startParameter - 160) < 1e-9, `parámetro inicial: ${ellipse.startParameter}`);
  assert.ok(Math.abs(ellipse.endParameter - 330) < 1e-9, `parámetro final: ${ellipse.endParameter}`);
  assert.ok(Math.abs(pick(plain, 'ellipse').startParameter - 30) < 1e-9, 'sin espejo los parámetros no se tocan');

  // Círculo: un espejo tiene |det| = 1, así que el radio no se mueve. Con la
  // media aritmética de antes salía lo mismo; con `scale` anisótropa no.
  assert.ok(Math.abs(pick(flipped, 'circle').radius - 25) < 1e-9, `radio ${pick(flipped, 'circle').radius}`);

  // --- el lote instanciado y la resolución dicen LO MISMO ----------------------
  //
  // `buildCadInsertBatches` manda la matriz cruda a la GPU, así que el camino
  // instanciado refleja bien los PUNTOS por construcción; `transformedEntity`
  // los recompone campo a campo. Son dos implementaciones de la misma
  // transformada, y pueden discrepar: una dibujando bien y la otra seleccionando
  // y exportando mal. Esta comprobación las ata.
  const batch = buildCadInsertBatches(canvas).find((entry) => entry.insertIds.includes('ala-espejo'));
  assert.ok(batch, 'el INSERT espejado entra en un lote');
  const [ma, mb, mc, md, me, mf] = batch.matrices[batch.insertIds.indexOf('ala-espejo')];
  assert.ok(ma * md - mb * mc < 0, 'la matriz que va a la GPU es reflectante');
  const throughMatrix = (value: { x: number; y: number }) => ({ x: ma * value.x + mc * value.y + me, y: mb * value.x + md * value.y + mf });
  const source = mirrored.entities.find((entity) => entity.id === 'ala-poli');
  assert.ok(source?.type === 'polyline');
  source.vertices.forEach((vertex, index) => {
    const expected = throughMatrix(vertex);
    assert.ok(
      Math.abs(polyline.vertices[index].x - expected.x) < 1e-9 && Math.abs(polyline.vertices[index].y - expected.y) < 1e-9,
      `vértice ${index}: el lote dice ${expected.x},${expected.y} y la resolución ${polyline.vertices[index].x},${polyline.vertices[index].y}`,
    );
  });
  const sourceArc = mirrored.entities.find((entity) => entity.id === 'ala-arco');
  assert.ok(sourceArc?.type === 'arc');
  const arcTip = throughMatrix({ x: sourceArc.center.x + Math.cos(Math.PI / 6) * sourceArc.radius, y: sourceArc.center.y + Math.sin(Math.PI / 6) * sourceArc.radius });
  // El extremo inicial del arco resuelto es ahora `endAngle`, porque el espejo
  // intercambió los extremos: el punto de partida del original es el de
  // llegada del reflejado. Si los ángulos se hubieran sumado, este punto
  // caería en el otro lado de la circunferencia.
  const arcEnd = { x: arc.center.x + Math.cos(arc.endAngle * Math.PI / 180) * arc.radius, y: arc.center.y + Math.sin(arc.endAngle * Math.PI / 180) * arc.radius };
  assert.ok(
    Math.abs(arcEnd.x - arcTip.x) < 1e-9 && Math.abs(arcEnd.y - arcTip.y) < 1e-9,
    `el extremo del arco reflejado debe caer donde la matriz manda el original: ${arcEnd.x},${arcEnd.y} vs ${arcTip.x},${arcTip.y}`,
  );
}

console.log('cad professional block specs passed (incluido INSERT espejado y acuerdo lote/resolución)');
