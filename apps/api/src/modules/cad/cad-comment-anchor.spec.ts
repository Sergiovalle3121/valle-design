import { BadRequestException } from '@nestjs/common';
import {
  MAX_CAD_COMMENT_ANCHOR_BYTES,
  assertCadCommentAnchor,
  cadCommentAnchorProblem,
} from './cad-comment-anchor';

describe('CAD comment anchor domain validation', () => {
  it('accepts a compact JSON anchor and preserves it', () => {
    const anchor = {
      x: 12.5,
      y: -4,
      entityId: 'line-1',
      path: [0, 1, 2],
    };

    expect(cadCommentAnchorProblem(anchor)).toBeNull();
    expect(assertCadCommentAnchor(anchor)).toBe(anchor);
    expect(assertCadCommentAnchor(null)).toBeNull();
  });

  it('rejects oversized, excessive-depth, non-finite and circular anchors', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const cases: unknown[] = [
      { text: 'x'.repeat(MAX_CAD_COMMENT_ANCHOR_BYTES) },
      { a: { b: { c: { d: { e: { f: { g: { x: 1 } } } } } } } },
      { x: Number.POSITIVE_INFINITY },
      circular,
      ['not', 'a', 'record'],
    ];

    for (const anchor of cases) {
      expect(cadCommentAnchorProblem(anchor)).not.toBeNull();
      expect(() => assertCadCommentAnchor(anchor)).toThrow(BadRequestException);
    }
  });

  it('rejects dangerous keys even for null-prototype internal objects', () => {
    const anchor = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(anchor, '__proto__', {
      enumerable: true,
      value: { polluted: true },
    });

    expect(() => assertCadCommentAnchor(anchor)).toThrow(BadRequestException);
  });
});
