import { resolveTrialDays } from './organization-commercial.configuration';

describe('organization commercial configuration', () => {
  it('uses the documented default only when TRIAL_DAYS is absent', () => {
    expect(resolveTrialDays(undefined)).toBe(14);
  });

  it.each([
    ['1', 1],
    ['14', 14],
    ['90', 90],
  ])('accepts TRIAL_DAYS=%s', (raw, expected) => {
    expect(resolveTrialDays(raw)).toBe(expected);
  });

  it.each(['', '0', '91', '14.5', 'not-a-number'])(
    'fails closed for invalid TRIAL_DAYS=%j',
    (raw) => {
      expect(() => resolveTrialDays(raw)).toThrow(/TRIAL_DAYS/u);
    },
  );
});
