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
    expect(input.annotations).toEqual([
      expect.objectContaining({ type: 'dim', x2: 5000 }),
      expect.objectContaining({ type: 'text', text: 'LINEA 1' }),
    ]);
    expect(input.stations).toEqual([]);
    expect(input.connectors).toEqual([]);
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
