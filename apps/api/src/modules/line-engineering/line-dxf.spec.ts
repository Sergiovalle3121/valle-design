import { buildDxf, DxfInput } from './line-dxf';

function input(over: Partial<DxfInput> = {}): DxfInput {
  return {
    footprintW: 1000,
    footprintH: 500,
    unit: 'mm',
    boxes: [],
    segments: [],
    texts: [],
    ...over,
  };
}

const countLine = (dxf: string) => (dxf.match(/\n0\nLINE\n/g) || []).length;
const countText = (dxf: string) => (dxf.match(/\n0\nTEXT\n/g) || []).length;
const countLayer = (dxf: string) => (dxf.match(/\n0\nLAYER\n/g) || []).length;
const countCircle = (dxf: string) => (dxf.match(/\n0\nCIRCLE\n/g) || []).length;
const countArc = (dxf: string) => (dxf.match(/\n0\nARC\n/g) || []).length;

describe('buildDxf (Fase 53)', () => {
  it('emits a valid R12 ASCII DXF skeleton with the footprint outline', () => {
    const dxf = buildDxf(input());
    expect(dxf.startsWith('0\nSECTION\n2\nHEADER')).toBe(true);
    expect(dxf).toContain('$ACADVER\n1\nAC1009'); // R12
    expect(dxf).toContain('$INSUNITS\n70\n4'); // mm
    expect(dxf.trimEnd().endsWith('0\nEOF')).toBe(true);
    expect(countLine(dxf)).toBe(4); // the footprint rectangle
    expect(dxf).toContain('8\nPLANO');
  });

  it('serialises a station box as 4 lines + a centred label, Y-flipped', () => {
    const dxf = buildDxf(input({ boxes: [{ x: 100, y: 100, w: 200, h: 100, label: 'EST-10', layer: 'ESTACIONES' }] }));
    expect(countLine(dxf)).toBe(8); // footprint (4) + box (4)
    expect(countText(dxf)).toBe(1);
    expect(dxf).toContain('1\nEST-10'); // the TEXT string
    expect(dxf).toContain('8\nESTACIONES');
    // box top/bottom edges land at y = H - 100 = 400 and y = H - 200 = 300
    expect(dxf).toContain('20\n400');
    expect(dxf).toContain('20\n300');
    // label centred at (200, H - 150 = 350)
    expect(dxf).toContain('20\n350');
  });

  it('declares one CAD layer per kind used', () => {
    const dxf = buildDxf(input({
      boxes: [{ x: 0, y: 0, w: 10, h: 10, label: 'A', layer: 'ESTACIONES' }],
      segments: [{ x1: 0, y1: 0, x2: 10, y2: 10, layer: 'COTAS' }],
    }));
    // PLANO (footprint) + ESTACIONES + TEXTO (label) + COTAS
    expect(countLayer(dxf)).toBe(4);
    expect(dxf).toContain('2\nESTACIONES');
    expect(dxf).toContain('2\nCOTAS');
    expect(dxf).toContain('2\nTEXTO');
  });

  it('emits flow/dimension segments as lines on their layer (Y-flipped)', () => {
    const dxf = buildDxf(input({ segments: [{ x1: 0, y1: 0, x2: 100, y2: 200, layer: 'FLUJO' }] }));
    expect(countLine(dxf)).toBe(5); // footprint (4) + 1 segment
    expect(dxf).toContain('8\nFLUJO');
    // endpoints flipped: y 0 -> 500, y 200 -> 300
    expect(dxf).toContain('20\n500');
    expect(dxf).toContain('21\n300');
  });

  it('rotates a box about its centre', () => {
    const dxf = buildDxf(input({ boxes: [{ x: 100, y: 100, w: 200, h: 100, rotation: 90, layer: 'EQUIPO' }] }));
    // a 90° rotation must move the corners off the axis-aligned positions
    expect(dxf).not.toContain('20\n400'); // would be the un-rotated top edge
    expect(countLine(dxf)).toBe(8);
  });

  it('maps units and strips control chars from text', () => {
    expect(buildDxf(input({ unit: 'cm' }))).toContain('$INSUNITS\n70\n5');
    expect(buildDxf(input({ unit: 'parsec' }))).toContain('$INSUNITS\n70\n0');
    const dxf = buildDxf(input({ texts: [{ x: 10, y: 10, text: 'línea1\nlínea2', layer: 'TEXTO' }] }));
    expect(dxf).toContain('1\nlínea1 línea2');
  });

  it('is safe with a degenerate footprint', () => {
    const dxf = buildDxf(input({ footprintW: 0, footprintH: 0 }));
    expect(dxf).toContain('AC1009');
    expect(countLine(dxf)).toBe(4); // still a (unit) footprint box
  });

  // ── Fase 68: alta fidelidad (circles, arcs, custom layers) ──
  it('emits a CIRCLE entity Y-flipped on its layer', () => {
    const dxf = buildDxf(input({ circles: [{ cx: 100, cy: 100, r: 40, layer: 'EQUIPO' }] }));
    expect(countCircle(dxf)).toBe(1);
    expect(dxf).toContain('8\nEQUIPO');
    expect(dxf).toContain('40\n40'); // radius
    expect(dxf).toContain('20\n400'); // center y flipped: 500 - 100
  });

  it('emits an ARC with start/end mirrored by the Y flip', () => {
    // a 0°→90° arc, mirrored about the horizontal axis, becomes 270°→360°
    const dxf = buildDxf(input({ arcs: [{ cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: 90, layer: 'MUROS' }] }));
    expect(countArc(dxf)).toBe(1);
    expect(dxf).toContain('50\n270'); // start' = -end = -90 → 270
    expect(dxf).toContain('51\n0'); // end' = -start = -0 → 0
    expect(dxf).toContain('20\n500'); // center y flipped: 500 - 0
  });

  it('registers custom CAD layers with their explicit color', () => {
    const dxf = buildDxf(input({
      circles: [{ cx: 10, cy: 10, r: 5, layer: 'Pasillos' }],
      layerDefs: [{ name: 'Pasillos', color: 30 }],
    }));
    expect(dxf).toContain('2\nPasillos');
    expect(dxf).toContain('62\n30'); // the custom color index wins
  });
});
