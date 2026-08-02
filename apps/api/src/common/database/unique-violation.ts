/**
 * Violación de índice/constraint único, en los motores que usa el producto.
 *
 * Existía copiado literalmente en varios servicios (plans, quality, ai-runs,
 * integration-outbox…), cada copia con su propio comentario diciendo que era
 * «el patrón del integration outbox». Cuando la detección vive en cinco sitios
 * basta con que uno se quede corto para que una carrera se convierta en un 500
 * en vez de en el error de negocio que corresponde: la deduplicación por
 * constraint deja de ser un contrato y pasa a ser una costumbre.
 *
 * Es el ÚNICO lugar donde se decide qué cuenta como duplicado.
 */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string; driverError?: unknown };
  if (!e) return false;
  // PostgreSQL 23505 / SQLite SQLITE_CONSTRAINT(_UNIQUE|_PRIMARYKEY).
  if (e.code === '23505' || e.code?.startsWith('SQLITE_CONSTRAINT')) {
    return true;
  }
  // TypeORM envuelve el error del driver: el código vive un nivel más abajo.
  const driver = e.driverError as
    { code?: string; message?: string } | undefined;
  if (
    driver?.code === '23505' ||
    driver?.code?.startsWith('SQLITE_CONSTRAINT')
  ) {
    return true;
  }
  return /duplicate key|UNIQUE constraint/i.test(
    e.message ?? driver?.message ?? '',
  );
}
