import { PostgresEntitlementService } from './adapters/postgres.adapters';
describe('commercial policy', () => {
  beforeEach(() => {
    process.env.ENTITLEMENTS_MODE = 'platform-api';
  });
  afterAll(() => {
    delete process.env.ENTITLEMENTS_MODE;
  });
  it('fails closed without organization and isolates the lookup by organization and tenant', async () => {
    const db = { query: jest.fn() } as any;
    const service = new PostgresEntitlementService(db);
    await expect(
      service.hasEntitlement('design.cad', { tenantId: 't' }),
    ).resolves.toBe(false);
    expect(db.query).not.toHaveBeenCalled();
    db.query.mockResolvedValue([{ one: 1 }]);
    await expect(
      service.hasEntitlement('design.cad', {
        organizationId: 'o',
        tenantId: 't',
      }),
    ).resolves.toBe(true);
    expect(db.query.mock.calls[0][1].slice(0, 3)).toEqual([
      'o',
      't',
      'design.cad',
    ]);
  });
  it('evaluates trials against an explicit clock so an expired trial is denied', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) } as any;
    const service = new PostgresEntitlementService(db);
    const now = new Date('2026-08-02T00:00:00Z');
    await expect(
      service.hasEntitlement('design.cad', {
        organizationId: 'o',
        tenantId: 't',
        now,
      }),
    ).resolves.toBe(false);
    expect(db.query.mock.calls[0][0]).toContain('s.trial_ends_at > $4');
    expect(db.query.mock.calls[0][1][3]).toBe(now);
  });
  it('requires the requested entitlement to be attached to the selected plan', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) } as any;
    await new PostgresEntitlementService(db).hasEntitlement('design.export', {
      organizationId: 'o',
      tenantId: 't',
    });
    expect(db.query.mock.calls[0][0]).toContain('e.entitlement_code=$3');
    expect(db.query.mock.calls[0][1][2]).toBe('design.export');
  });
});
