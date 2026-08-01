import {
  TenantContextService,
  type TenantContext,
} from '../../common/tenant/tenant-context.service';
import type { EntitlementsService } from '../entitlements/entitlements.service';
import {
  EnterpriseEntitlementClient,
  NoopUsageMeter,
  TenantContextIdentityClient,
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

describe('platform-client adapters (WP2c)', () => {
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

  it('entitlements delega en la autoridad comercial y es fail-closed', async () => {
    const ctx = new TenantContextService();
    const hasCapability = jest.fn().mockResolvedValue(true);
    const client = new EnterpriseEntitlementClient(ctx, {
      hasCapability,
    } as unknown as EntitlementsService);

    // Sin tenant en contexto → false sin consultar (fail-closed).
    await expect(client.hasEntitlement('design.editor')).resolves.toBe(false);
    expect(hasCapability).not.toHaveBeenCalled();

    // Con tenant → delega en EntitlementsService.hasCapability.
    await ctx.run(context, async () => {
      await expect(client.hasEntitlement('design.editor')).resolves.toBe(true);
    });
    expect(hasCapability).toHaveBeenCalledWith('tenant-a', 'design.editor');

    // Sin EntitlementsService disponible → false (nunca fail-open).
    const without = new EnterpriseEntitlementClient(ctx);
    await ctx.run(context, async () => {
      await expect(without.hasEntitlement('design.editor')).resolves.toBe(
        false,
      );
    });
  });

  it('el medidor de uso no-op no truena (Fase 2 lo sustituye por metering real)', () => {
    const meter: UsageMeter = new NoopUsageMeter();
    expect(() => meter.track('design.document.saved', 1)).not.toThrow();
    expect(() => meter.track('design.document.opened')).not.toThrow();
  });
});
