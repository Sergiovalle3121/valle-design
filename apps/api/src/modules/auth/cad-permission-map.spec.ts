import {
  CAD_PERMISSIONS,
  LEGACY_ENGINEERING_PERMISSION_MAP,
  type CadPermission,
} from '@valle-design/contracts';
import { allCadPermissions, expandCadPermissions } from './cad-permission-map';

/**
 * RED DE SEGURIDAD del mapa de transición RBAC `engineering:* → cad:*`.
 *
 * Este spec FIJA el comportamiento tal como está HOY, antes de cualquier
 * poda o renombre de `packages/contracts`. Los tokens que Platform emite
 * durante la transición traen permisos `engineering:*` del producto
 * industrial: si el mapa cambia (o se pierde al mover el módulo a
 * `legacy/`), tenants reales pierden acceso silenciosamente.
 *
 * REGLA: los literales de este spec describen DATOS de tokens ya emitidos.
 * No se "actualizan" para que pase el test; si un cambio los rompe, el
 * cambio está mal.
 */
describe('cad-permission-map (transición engineering:* → cad:*)', () => {
  it('engineering:read concede exactamente cad:view (además de sí mismo)', () => {
    expect([...expandCadPermissions(['engineering:read'])].sort()).toEqual([
      'cad:view',
      'engineering:read',
    ]);
  });

  it('engineering:write concede cad:edit + cad:review + cad:publish', () => {
    expect([...expandCadPermissions(['engineering:write'])].sort()).toEqual([
      'cad:edit',
      'cad:publish',
      'cad:review',
      'engineering:write',
    ]);
  });

  it('el mapa declarado en legacy/ es exactamente este y no otro', () => {
    expect(LEGACY_ENGINEERING_PERMISSION_MAP).toEqual({
      'engineering:read': ['cad:view'],
      'engineering:write': ['cad:edit', 'cad:review', 'cad:publish'],
    });
  });

  it('el mapa de transición completo es exactamente el declarado', () => {
    const expansion = (permission: string) =>
      [...expandCadPermissions([permission])]
        .filter((entry) => entry !== permission)
        .sort();
    expect({
      'engineering:read': expansion('engineering:read'),
      'engineering:write': expansion('engineering:write'),
    }).toEqual({
      'engineering:read': ['cad:view'],
      'engineering:write': ['cad:edit', 'cad:publish', 'cad:review'],
    });
  });

  it('la expansión solo AGREGA: nunca quita el permiso original', () => {
    const granted = ['engineering:read', 'cad:admin', 'algo:desconocido'];
    const expanded = expandCadPermissions(granted);
    for (const permission of granted) {
      expect(expanded.has(permission)).toBe(true);
    }
  });

  it('un permiso desconocido no concede nada del espacio cad:*', () => {
    const expanded = expandCadPermissions(['algo:desconocido']);
    expect([...expanded]).toEqual(['algo:desconocido']);
  });

  it('ni engineering:read ni engineering:write conceden cad:admin', () => {
    const expanded = expandCadPermissions([
      'engineering:read',
      'engineering:write',
    ]);
    expect(expanded.has('cad:admin')).toBe(false);
  });

  it('tolera null/undefined sin conceder nada', () => {
    expect(expandCadPermissions(null).size).toBe(0);
    expect(expandCadPermissions(undefined).size).toBe(0);
    expect(expandCadPermissions([]).size).toBe(0);
  });

  it('fija el espacio completo de permisos cad:* y su orden', () => {
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

  it('allCadPermissions devuelve una copia: mutarla no altera el contrato', () => {
    const first = allCadPermissions();
    first.pop();
    expect(allCadPermissions()).toHaveLength(CAD_PERMISSIONS.length);
  });
});
