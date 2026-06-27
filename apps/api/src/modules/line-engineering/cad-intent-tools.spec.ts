import { CAD_INTENT_TOOLS, buildCadIntentSystemPrompt, buildOptimizePrompt } from './cad-intent-tools';

describe('cad-intent-tools (Fase 69)', () => {
  it('exposes well-formed OpenAI-compatible tool specs', () => {
    expect(CAD_INTENT_TOOLS.length).toBeGreaterThanOrEqual(6);
    for (const t of CAD_INTENT_TOOLS) {
      expect(typeof t.name).toBe('string');
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe('string');
      expect((t.parameters as { type?: string }).type).toBe('object');
    }
    expect(CAD_INTENT_TOOLS.map((t) => t.name)).toEqual(
      expect.arrayContaining(['setFootprint', 'placeAsset', 'drawWall', 'arrangeLine', 'connectLine']),
    );
  });

  it('placeAsset requires kind/x/y', () => {
    const place = CAD_INTENT_TOOLS.find((t) => t.name === 'placeAsset')!;
    expect((place.parameters as { required?: string[] }).required).toEqual(['kind', 'x', 'y']);
  });

  it('builds a system prompt with footprint and station context', () => {
    const sys = buildCadIntentSystemPrompt({
      unit: 'mm',
      footprintW: 20000,
      footprintH: 10000,
      stations: [{ station: 'EST-10', x: 1000, y: 2000 }],
    });
    expect(sys).toContain('20000');
    expect(sys).toContain('10000');
    expect(sys).toContain('mm');
    expect(sys).toContain('EST-10 @(1000,2000)');
    expect(sys.toLowerCase()).toContain('herramientas');
  });

  it('omits the station list when none are placed', () => {
    const sys = buildCadIntentSystemPrompt({ unit: 'm', footprintW: 20, footprintH: 10, stations: [] });
    expect(sys).not.toContain('Estaciones colocadas');
  });

  it('exposes a moveStation tool requiring station/x/y', () => {
    const mv = CAD_INTENT_TOOLS.find((t) => t.name === 'moveStation');
    expect(mv).toBeDefined();
    expect((mv!.parameters as { required?: string[] }).required).toEqual(['station', 'x', 'y']);
  });

  it('builds an optimize prompt with flow + footprint context (Fase 72)', () => {
    const sys = buildOptimizePrompt({
      unit: 'mm',
      footprintW: 20000,
      footprintH: 10000,
      stations: [{ station: 'EST-10', x: 1000, y: 2000 }],
      totalFlow: 12345,
      connectorCount: 3,
    });
    expect(sys).toContain('12345');
    expect(sys).toContain('3 conexiones');
    expect(sys).toContain('EST-10 @(1000,2000)');
    expect(sys.toLowerCase()).toContain('recorrido');
  });
});
