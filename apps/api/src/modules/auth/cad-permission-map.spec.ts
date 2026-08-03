import { CAD_PERMISSIONS, type CadPermission } from '@valle-design/contracts';
import { allCadPermissions, expandCadPermissions } from './cad-permission-map';

describe('cad-permission-map (first-party memberships)', () => {
  it('preserves server-derived values without legacy translation', () => {
    const granted = ['cad:view', 'cad:edit', 'unknown:diagnostic'];
    expect([...expandCadPermissions(granted)]).toEqual(granted);
    expect(expandCadPermissions(['unknown:read']).has('cad:view')).toBe(
      false,
    );
  });

  it('tolerates null/undefined without granting anything', () => {
    expect(expandCadPermissions(null).size).toBe(0);
    expect(expandCadPermissions(undefined).size).toBe(0);
    expect(expandCadPermissions([]).size).toBe(0);
  });

  it('pins the complete cad:* permission space and its order', () => {
    const expected: CadPermission[] = [
      'cad:view',
      'cad:edit',
      'cad:review',
      'cad:publish',
      'cad:admin',
    ];
    expect([...CAD_PERMISSIONS]).toEqual(expected);
    expect(allCadPermissions()).toEqual(expected);
  });

  it('returns a copy of the permission contract', () => {
    const first = allCadPermissions();
    first.pop();
    expect(allCadPermissions()).toHaveLength(CAD_PERMISSIONS.length);
  });
});
