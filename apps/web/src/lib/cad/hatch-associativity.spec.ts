import assert from 'node:assert/strict';
import type { CadEntity } from './cad-document';
import {
  hatchRegionContainsPoint,
  regenerateAssociativeHatches,
  resolveCadHatchRegion,
  resolveCadHatchRegionWithSources,
  stitchCadBoundaryPaths,
  type CadBoundaryPath,
} from './hatch-associativity';

const paths: CadBoundaryPath[] = [
  { sourceId: 'a', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false },
  { sourceId: 'b', points: [{ x: 10, y: 10 }, { x: 0, y: 10 }], closed: false },
  { sourceId: 'c', points: [{ x: 10, y: 0 }, { x: 10, y: 10 }], closed: false },
  { sourceId: 'd', points: [{ x: 0, y: 10 }, { x: 0, y: 0 }], closed: false },
];
const stitched = stitchCadBoundaryPaths(paths);
assert.equal(stitched.loops.length, 1);
assert.deepEqual(new Set(stitched.sourceIds), new Set(['a', 'b', 'c', 'd']));
assert.deepEqual(stitched.loopSourceIds, [['a', 'c', 'b', 'd']]);

const outer = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
const hole = [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }];
const island = [{ x: 8, y: 8 }, { x: 12, y: 8 }, { x: 12, y: 12 }, { x: 8, y: 12 }];
const normal = resolveCadHatchRegion([outer, hole, island], { x: 2, y: 2 }, 'normal');
assert.equal(normal.length, 3);
assert.equal(hatchRegionContainsPoint(normal, { x: 2, y: 2 }, 'normal'), true);
assert.equal(hatchRegionContainsPoint(normal, { x: 6, y: 6 }, 'normal'), false);
assert.equal(hatchRegionContainsPoint(normal, { x: 10, y: 10 }, 'normal'), true);
assert.deepEqual(resolveCadHatchRegion([outer, hole], { x: 6, y: 6 }, 'normal')[0], hole);
const sourcedRegion = resolveCadHatchRegionWithSources({
  loops: [outer, hole], loopSourceIds: [['outer'], ['hole']], sourceIds: ['outer', 'hole'], openSourceIds: [],
}, { x: 2, y: 2 }, 'normal');
assert.deepEqual(new Set(sourcedRegion.sourceIds), new Set(['outer', 'hole']));

const source: CadEntity = { id: 'source', type: 'spline', degree: 1, controlPoints: [], knots: [], closed: true, layer: '0' };
const hatch: CadEntity = { id: 'hatch', type: 'hatch', pattern: 'ANSI31', solid: false, boundaries: [], layer: '0', associative: true, boundaryRefs: ['source'], associationStatus: 'associated' };
const regenerated = regenerateAssociativeHatches([source, hatch], ['source'], (entity) => [{
  sourceId: entity.id,
  points: outer.map((point) => ({ x: point.x + 5, y: point.y })),
  closed: true,
}]);
assert.deepEqual(regenerated.regeneratedIds, ['hatch']);
assert.equal(regenerated.entities.find((entity) => entity.id === 'hatch')?.type, 'hatch');
const broken = regenerateAssociativeHatches([hatch], ['source'], () => []);
assert.deepEqual(broken.brokenIds, ['hatch']);
assert.equal((broken.entities[0].type === 'hatch' && broken.entities[0].associationStatus), 'broken');

console.log("hatch-associativity: el sombreado se regenera con su contorno y se marca broken al perderlo");
