import { sha256Hex, stableSha256, stableStringify } from './stable-json';

describe('stable-json — huellas independientes del orden de claves', () => {
  it('produce el mismo canónico para objetos con claves en distinto orden', () => {
    const a = { z: 1, a: { c: [3, { y: 1, x: 2 }], b: 'ñ' } };
    const b = { a: { b: 'ñ', c: [3, { x: 2, y: 1 }] }, z: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(stableSha256(a)).toBe(stableSha256(b));
  });

  it('NO reordena arreglos (el orden de entidades es contenido)', () => {
    expect(stableSha256({ e: [1, 2] })).not.toBe(stableSha256({ e: [2, 1] }));
  });

  it('distingue contenidos distintos', () => {
    expect(stableSha256({ a: 1 })).not.toBe(stableSha256({ a: 2 }));
  });

  it('conserva unicode intacto en el canónico', () => {
    const doc = { texto: 'Línea Ñandú 🏭 — 大きい図面' };
    expect(stableStringify(doc)).toContain('Línea Ñandú 🏭');
  });

  it('sha256Hex coincide con el vector conocido de "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
