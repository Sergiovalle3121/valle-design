import {
  TenantContextService,
  type TenantContext,
} from '../../common/tenant/tenant-context.service';
import {
  ConfigEntitlementClient,
  NoopUsageMeter,
  TenantContextIdentityClient,
  resolveEntitlementsMode,
} from './platform-client.adapter';
import type { UsageMeter } from './ports/platform-client.ports';

const context: TenantContext = {
  tenant_id: 'tenant-a',
  organization_id: null,
  plant_id: 'plant-1',
  user_email: 'cad@test',
  role: null,
  permissions: null,
  scopes: null,
};

describe('platform-client adapters (Design)', () => {
  const originalMode = process.env.ENTITLEMENTS_MODE;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalMode === undefined) delete process.env.ENTITLEMENTS_MODE;
    else process.env.ENTITLEMENTS_MODE = originalMode;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('la identidad refleja el contexto autenticado y queda vacía fuera de él', () => {
    const ctx = new TenantContextService();
    const identity = new TenantContextIdentityClient(ctx);

    expect(identity.currentTenantId()).toBeUndefined();
    expect(identity.currentUserEmail()).toBeUndefined();
    expect(identity.currentPlantId()).toBeUndefined();

    ctx.run(context, () => {
      expect(identity.currentTenantId()).toBe('tenant-a');
      expect(identity.currentUserEmail()).toBe('cad@test');
      expect(identity.currentPlantId()).toBe('plant-1');
    });
  });

  it('el modo por defecto es allow-all en dev y platform-api (fail-closed) en prod', () => {
    delete process.env.ENTITLEMENTS_MODE;
    process.env.NODE_ENV = 'test';
    expect(resolveEntitlementsMode()).toBe('allow-all');

    process.env.NODE_ENV = 'production';
    expect(resolveEntitlementsMode()).toBe('platform-api');

    process.env.ENTITLEMENTS_MODE = 'allow-all';
    expect(resolveEntitlementsMode()).toBe('allow-all');
  });

  it('allow-all concede; platform-api niega fail-closed hasta el cliente real (TODO-R3)', async () => {
    const client = new ConfigEntitlementClient();

    process.env.ENTITLEMENTS_MODE = 'allow-all';
    await expect(client.hasEntitlement('design.cad')).resolves.toBe(true);

    process.env.ENTITLEMENTS_MODE = 'platform-api';
    await expect(client.hasEntitlement('design.cad')).resolves.toBe(false);
  });

  it('el medidor de uso no-op no truena (metering design.* llega después)', () => {
    const meter: UsageMeter = new NoopUsageMeter();
    expect(() => meter.track('design.document.saved', 1)).not.toThrow();
    expect(() => meter.track('design.document.opened')).not.toThrow();
  });
});
