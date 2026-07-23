/**
 * Bloques (BLOCK / INSERT) del CAD (AXOS-CAD-DEPTH-B1).
 *
 * El bloque es el contenido reutilizable de AutoCAD: defines una vez una puerta,
 * un mueble o un símbolo (un conjunto de geometría con un punto base) y lo
 * INSERTAS muchas veces con posición, escala y rotación. Editas la definición y
 * cambian todas las inserciones. La caja rectangular no tenía nada de esto.
 * Este módulo define bloques e instancia sus inserciones transformando la
 * geometría a coordenadas de mundo. Geometría pura, sin dependencias del editor.
 */
import {
  rotatePrimitive,
  scalePrimitive,
  translatePrimitive,
  type CadPrimitive,
  type CadVec2,
} from "./primitives";

export interface BlockDefinition {
  name: string;
  /** Punto base de inserción (origen del bloque). */
  basePoint: CadVec2;
  /** Geometría del bloque, relativa al punto base. */
  primitives: CadPrimitive[];
}

export interface BlockInsert {
  /** Nombre del bloque a insertar. */
  block: string;
  position: CadVec2;
  /** Escala uniforme (por defecto 1). */
  scale?: number;
  /** Rotación en grados CCW (por defecto 0). */
  rotation?: number;
}

const ORIGIN: CadVec2 = { x: 0, y: 0 };

/**
 * Instancia una inserción de `def`: devuelve la geometría del bloque
 * transformada a coordenadas de mundo (base → origen, escala, rotación,
 * traslación al punto de inserción). Escala uniforme; para escala no uniforme
 * de círculos/arcos hará falta la primitiva elipse (fase posterior).
 */
export function instantiateBlock(
  def: BlockDefinition,
  insert: BlockInsert,
): CadPrimitive[] {
  const scale = insert.scale ?? 1;
  const rotation = insert.rotation ?? 0;
  const bx = def.basePoint.x;
  const by = def.basePoint.y;
  return def.primitives.map((prim) => {
    let p = translatePrimitive(prim, -bx, -by);
    if (scale !== 1) p = scalePrimitive(p, ORIGIN, scale);
    if (rotation !== 0) p = rotatePrimitive(p, ORIGIN, rotation);
    return translatePrimitive(p, insert.position.x, insert.position.y);
  });
}

/**
 * Instancia una inserción resolviendo el bloque por nombre en un registro.
 * Devuelve [] si el bloque no existe (referencia colgante).
 */
export function instantiateInsert(
  registry: Map<string, BlockDefinition> | Record<string, BlockDefinition>,
  insert: BlockInsert,
): CadPrimitive[] {
  const def =
    registry instanceof Map ? registry.get(insert.block) : registry[insert.block];
  return def ? instantiateBlock(def, insert) : [];
}

/** ¿La inserción referencia un bloque que existe en el registro? */
export function isInsertResolvable(
  registry: Map<string, BlockDefinition> | Record<string, BlockDefinition>,
  insert: BlockInsert,
): boolean {
  return registry instanceof Map
    ? registry.has(insert.block)
    : Object.prototype.hasOwnProperty.call(registry, insert.block);
}

/** Cuenta cuántas veces se inserta cada bloque (para depurar/limpiar). */
export function countBlockUsage(inserts: BlockInsert[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const insert of inserts) {
    counts[insert.block] = (counts[insert.block] ?? 0) + 1;
  }
  return counts;
}
