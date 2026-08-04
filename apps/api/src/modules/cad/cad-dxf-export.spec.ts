import { buildDxfExportInput } from './cad-dxf-export';

describe('buildDxfExportInput — proyección documento canónico → DXF R12', () => {
  it('mapea cajas, líneas y textos a assets/anotaciones con huella del bbox', () => {
    const input = buildDxfExportInput(
      {
        meta: { schema: 3, version: 1, unit: 'mm' },
        entities: [
          {
            id: 'z1',
            type: 'box',
            kind: 'zone',
            x: 0,
            y: 0,
            w: 3000,
            h: 2000,
            label: 'Celda',
          },
          {
            id: 'l1',
            type: 'line',
            start: { x: 0, y: 0 },
            end: { x: 5000, y: 0 },
          },
          {
            id: 't1',
            type: 'text',
            position: { x: 100, y: 200 },
            text: 'LINEA 1',
          },
          { id: 'raro', type: 'spline' }, // sin geometría mapeable: se ignora
        ],
      },
      'Plano demo',
      'AXOS-CAD-STUDIO',
      'UNIVERSAL',
    );

    expect(input.model).toBe('AXOS-CAD-STUDIO');
    expect(input.revision).toBe('UNIVERSAL');
    expect(input.footprint.unit).toBe('mm');
    expect(input.footprint.footprintW).toBeGreaterThanOrEqual(5000);
    expect(input.footprint.footprintH).toBeGreaterThanOrEqual(2000);
    expect(input.assets).toEqual([
      expect.objectContaining({
        kind: 'zone',
        w: 3000,
        h: 2000,
        label: 'Celda',
      }),
    ]);
    // Una LINE es geometría, no una cota. Antes se proyectaba como
    // `{type:'dim'}` y salía del DXF en la capa COTAS; ahora viaja por el canal
    // de geometría y se emite como entidad LINE en su propia capa.
    expect(input.annotations).toEqual([
      expect.objectContaining({ type: 'text', text: 'LINEA 1' }),
    ]);
    expect(input.geometry?.lines).toEqual([
      expect.objectContaining({ x1: 0, y1: 0, x2: 5000, y2: 0, layer: '0' }),
    ]);
    expect(input.stations).toEqual([]);
    expect(input.connectors).toEqual([]);
  });

  it('emite ARC, CIRCLE y todos los vértices de una POLYLINE en su capa real', () => {
    const input = buildDxfExportInput(
      {
        meta: { schema: 3, version: 1, unit: 'mm' },
        entities: [
          {
            id: 'a1',
            type: 'arc',
            center: { x: 4000, y: 3000 },
            radius: 120,
            startAngle: 0,
            endAngle: 180,
            layer: 'REAL',
          },
          {
            id: 'c1',
            type: 'circle',
            center: { x: 1000, y: 1000 },
            radius: 250,
            layer: 'Capa con espacios',
          },
          {
            id: 'p1',
            type: 'polyline',
            closed: true,
            vertices: [
              { x: 0, y: 0 },
              { x: 1000, y: 0 },
              { x: 1000, y: 900 },
            ],
            layer: 'MUROS',
          },
        ],
      },
      'Plano',
      null,
      null,
    );

    expect(input.geometry?.arcs).toEqual([
      expect.objectContaining({
        cx: 4000,
        cy: 3000,
        r: 120,
        startAngle: 0,
        endAngle: 180,
        layer: 'REAL',
      }),
    ]);
    // El nombre de capa se normaliza a lo que admite R12, sin inventar capas.
    expect(input.geometry?.circles).toEqual([
      expect.objectContaining({
        cx: 1000,
        cy: 1000,
        r: 250,
        layer: 'Capa_con_espacios',
      }),
    ]);
    // Tres vértices cerrados ⇒ tres segmentos (incluido el de cierre). El
    // mapeo anterior conservaba únicamente el primero y el último punto.
    expect(input.geometry?.lines).toHaveLength(3);
    expect(input.geometry?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          x1: 1000,
          y1: 900,
          x2: 0,
          y2: 0,
          layer: 'MUROS',
        }),
      ]),
    );
    // La huella cubre el arco completo, no sólo su centro.
    expect(input.footprint.footprintW).toBeGreaterThanOrEqual(4120);
  });

  it('documento vacío/null produce una huella mínima estable (nunca 0×0)', () => {
    const input = buildDxfExportInput(null, 'Nuevo', null, null);
    expect(input.model).toBe('Nuevo');
    expect(input.revision).toBe('A');
    expect(input.footprint.footprintW).toBeGreaterThan(0);
    expect(input.footprint.footprintH).toBeGreaterThan(0);
    expect(input.assets).toEqual([]);
    expect(input.annotations).toEqual([]);
  });
});
