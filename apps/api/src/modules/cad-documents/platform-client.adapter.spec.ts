import {
  TenantContextService,
  type TenantContext,
} from '../../common/tenant/tenant-context.service';
import {
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

/**
 * Adaptadores in-proc restantes (identidad + usage). El puerto de
 * entitlements se prueba en platform-entitlement.client.spec.ts contra un
 * servidor HTTP REAL del contrato platform-api.v1.yaml (Fase 5).
 */
describe('platform-client adapters (Design)', () => {
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

  it('el medidor de uso no-op no truena (metering design.* llega después)', () => {
    const meter: UsageMeter = new NoopUsageMeter();
    expect(() => meter.track('design.document.saved', 1)).not.toThrow();
    expect(() => meter.track('design.document.opened')).not.toThrow();
  });
});
