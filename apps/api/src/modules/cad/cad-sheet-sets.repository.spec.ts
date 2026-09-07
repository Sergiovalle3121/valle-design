import { ConflictException } from '@nestjs/common';
import { FindOperator, type UpdateResult } from 'typeorm';
import {
  TenantContextService,
  type TenantContext,
} from '../../common/tenant/tenant-context.service';
import type { TenantScopedRepository } from '../../common/tenant/tenant-scoped.repository';
import type { CadSheetSet } from '../cad-documents/entities/cad-sheet-set.entity';
import {
  CadSheetSetsRepository,
  type SheetSetContent,
  type SheetSetRow,
} from './cad-sheet-sets.repository';

/**
 * El CAS del conjunto de planos bajo CARRERA, con un repositorio falso.
 *
 * Con SQLite real la carrera no se puede provocar a voluntad: si el primer
 * guardado termina antes de que el segundo lea, el segundo ve la versión 2 y
 * recibe 409 por la comparación en memoria, y la prueba pasa aunque el CAS
 * SQL no exista. Aquí la tabla falsa modela exactamente lo que hace el motor
 * —cada `findOne` devuelve una INSTANTÁNEA, `update` aplica su predicado de
 * forma atómica y `save` es el `UPDATE … WHERE id = $1` sin versión de
 * TypeORM— y una barrera obliga a que las dos lecturas terminen antes de
 * cualquier escritura. Ése es el entrelazado que perdía la numeración entera
 * de una de las dos personas (hallazgo «Sheet-set CAS is check-then-write»).
 */

type Fila = Record<string, unknown>;
type Predicado = Record<string, unknown>;

const coincideCampo = (actual: unknown, esperado: unknown): boolean => {
  if (esperado instanceof FindOperator) {
    if (esperado.type === 'isNull')
      return actual === null || actual === undefined;
    throw new Error(`operador no modelado en la tabla falsa: ${esperado.type}`);
  }
  return actual === esperado;
};

/** `() => 'version + 1'` es la única expresión cruda que el repositorio emite. */
const evaluarExpresion = (expresion: string, fila: Fila): number => {
  const partes = /^(\w+) \+ (\d+)$/.exec(expresion);
  if (!partes) throw new Error(`expresión SQL no modelada: ${expresion}`);
  return Number(fila[partes[1]]) + Number(partes[2]);
};

class TablaFalsa {
  private readonly filas = new Map<string, Fila>();
  /** Predicados de cada UPDATE, para comprobar que el CAS y el tenant van en SQL. */
  readonly predicados: Predicado[] = [];
  /** Lecturas que deben coincidir antes de soltar la primera (0 = sin barrera). */
  lectoresEnBarrera = 0;
  private enEspera: Array<() => void> = [];

  sembrar(fila: Fila): void {
    this.filas.set(String(fila.id), structuredClone(fila));
  }

  fila(id: string): Fila {
    const fila = this.filas.get(id);
    if (!fila) throw new Error(`no existe la fila ${id}`);
    return structuredClone(fila);
  }

  private esperarBarrera(): Promise<void> {
    if (this.lectoresEnBarrera <= 1) return Promise.resolve();
    return new Promise((resolver) => {
      this.enEspera.push(resolver);
      if (this.enEspera.length >= this.lectoresEnBarrera) {
        const listos = this.enEspera;
        this.enEspera = [];
        this.lectoresEnBarrera = 0;
        for (const soltar of listos) soltar();
      }
    });
  }

  /** SELECT: una instantánea independiente por lectura, como un motor real. */
  async findOne(options: { where: Predicado }): Promise<CadSheetSet | null> {
    await this.esperarBarrera();
    const fila = this.filas.get(String(options.where.id));
    return fila ? (structuredClone(fila) as unknown as CadSheetSet) : null;
  }

  /** UPDATE condicional: atómico por sentencia, afecta 0 o 1 filas. */
  update(where: Predicado, set: Fila): Promise<UpdateResult> {
    this.predicados.push(where);
    const fila = this.filas.get(String(where.id));
    const coincide =
      fila !== undefined &&
      Object.entries(where).every(([campo, esperado]) =>
        coincideCampo(fila[campo], esperado),
      );
    if (!coincide || !fila) {
      return Promise.resolve({ affected: 0, raw: [], generatedMaps: [] });
    }
    for (const [campo, valor] of Object.entries(set)) {
      fila[campo] =
        typeof valor === 'function'
          ? evaluarExpresion(String((valor as () => string)()), fila)
          : structuredClone(valor);
    }
    fila.updated_at = new Date();
    return Promise.resolve({ affected: 1, raw: [], generatedMaps: [] });
  }

  /** Lo que TypeORM emite en `save()`: `UPDATE … WHERE id = $1`, sin versión. */
  save(entidad: CadSheetSet): Promise<CadSheetSet> {
    const fila = structuredClone(entidad as unknown as Fila);
    this.filas.set(String(fila.id), fila);
    return Promise.resolve(structuredClone(fila) as unknown as CadSheetSet);
  }
}

const contexto = (tenant: string | null): TenantContext => ({
  tenant_id: tenant,
  organization_id: null,
  plant_id: null,
  user_email: 'planos@test',
  role: null,
  permissions: null,
  scopes: null,
});

const hoja = (id: string, number: string): SheetSetRow => ({
  id,
  order: 0,
  documentId: 'doc-1',
  layoutId: 'layout:planta',
  title: 'Planta',
  number,
  revision: 'P01',
});

function armar(tenant: string | null = 'tenant-a') {
  const tabla = new TablaFalsa();
  const ctx = new TenantContextService();
  const repositorio = new CadSheetSetsRepository(
    tabla as unknown as TenantScopedRepository<CadSheetSet>,
    ctx,
  );
  tabla.sembrar({
    id: 'set-1',
    tenant_id: tenant,
    organization_id: null,
    plant_id: null,
    projectId: null,
    name: 'Conjunto',
    description: null,
    content: {
      fields: {},
      numbering: { prefix: 'A-', start: 101, step: 1, padding: 0, suffix: '' },
      sheets: [],
    },
    version: 1,
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
    deleted_at: null,
    created_by: null,
  });
  const como = <T>(fn: () => Promise<T>): Promise<T> =>
    ctx.run(contexto(tenant), fn);
  return { tabla, repositorio, como };
}

describe('CadSheetSetsRepository — CAS en SQL, no en memoria', () => {
  it('dos guardados que leyeron la misma versión: exactamente uno gana y el otro recibe 409 con la vigente', async () => {
    const { tabla, repositorio, como } = armar();
    tabla.lectoresEnBarrera = 2;

    const resultados = await Promise.allSettled([
      como(() =>
        repositorio.save('set-1', {
          expectedVersion: 1,
          sheets: [hoja('s1', 'A-101')],
        }),
      ),
      como(() =>
        repositorio.save('set-1', {
          expectedVersion: 1,
          sheets: [hoja('s2', 'A-201')],
        }),
      ),
    ]);

    const ganadores = resultados.filter(
      (r): r is PromiseFulfilledResult<CadSheetSet> => r.status === 'fulfilled',
    );
    const perdedores = resultados.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(ganadores).toHaveLength(1);
    expect(perdedores).toHaveLength(1);

    const motivo: unknown = perdedores[0].reason;
    expect(motivo).toBeInstanceOf(ConflictException);
    expect((motivo as ConflictException).getResponse()).toMatchObject({
      error: 'version_conflict',
      currentVersion: 2,
      expectedVersion: 1,
    });

    // Lo guardado es la numeración del ganador, no la del último en escribir,
    // y lo que el ganador recibe es la fila releída con la versión avanzada.
    const guardado = tabla.fila('set-1');
    expect(guardado.version).toBe(2);
    expect((guardado.content as SheetSetContent).sheets).toEqual(
      (ganadores[0].value.content as unknown as SheetSetContent).sheets,
    );
    expect(ganadores[0].value.version).toBe(2);
  });

  it('el UPDATE lleva id, tenant, deleted_at y la versión esperada en el predicado', async () => {
    const { tabla, repositorio, como } = armar('tenant-a');

    await como(() =>
      repositorio.save('set-1', {
        expectedVersion: 1,
        name: 'Renombrado',
        sheets: [hoja('s1', 'A-101')],
      }),
    );

    expect(tabla.predicados).toHaveLength(1);
    expect(tabla.predicados[0]).toMatchObject({
      id: 'set-1',
      tenant_id: 'tenant-a',
      version: 1,
    });
    expect(tabla.predicados[0].deleted_at).toBeInstanceOf(FindOperator);
    expect((tabla.predicados[0].deleted_at as FindOperator<unknown>).type).toBe(
      'isNull',
    );
    expect(tabla.fila('set-1')).toMatchObject({
      name: 'Renombrado',
      version: 2,
    });

    // La versión vieja, ya en secuencia, sigue siendo 409 con la vigente.
    await expect(
      como(() => repositorio.save('set-1', { expectedVersion: 1, sheets: [] })),
    ).rejects.toMatchObject({
      response: { error: 'version_conflict', currentVersion: 2 },
    });
  });

  it('sin tenant en contexto el predicado cae al carril de sistema (tenant IS NULL), nunca sin filtro', async () => {
    const { tabla, repositorio, como } = armar(null);

    await como(() =>
      repositorio.save('set-1', { expectedVersion: 1, sheets: [] }),
    );

    const tenantPredicado = tabla.predicados[0].tenant_id;
    expect(tenantPredicado).toBeInstanceOf(FindOperator);
    expect((tenantPredicado as FindOperator<unknown>).type).toBe('isNull');
  });
});
