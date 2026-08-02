import { parseArgs } from './main';

describe('migration-cli parseArgs', () => {
  it('parsea comando, flags con valor (repetibles) y booleanas', () => {
    const parsed = parseArgs([
      'export',
      '--out',
      '/tmp/x',
      '--tenant',
      'a',
      '--tenant=b',
      '--dry-run',
    ]);
    expect(parsed.command).toBe('export');
    expect(parsed.flags.get('--out')).toEqual(['/tmp/x']);
    expect(parsed.flags.get('--tenant')).toEqual(['a', 'b']);
    expect(parsed.booleans.has('--dry-run')).toBe(true);
    expect(parsed.errors).toHaveLength(0);
  });

  it('reporta flags desconocidas y valores faltantes', () => {
    const parsed = parseArgs(['import', '--archive', '--yolo']);
    expect(parsed.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('reporta argumento posicional duplicado', () => {
    const parsed = parseArgs(['export', 'extra']);
    expect(parsed.errors).toEqual([
      expect.stringContaining('Argumento inesperado'),
    ]);
  });
});
