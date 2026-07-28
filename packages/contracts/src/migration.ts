/**
 * CENTRO DE MIGRACIÓN — cargar los datos del primer cliente sin apostar.
 *
 * Importar los maestros de una empresa es la operación más peligrosa de toda la
 * puesta en marcha: se hace una sola vez, con un archivo que nadie ha visto
 * antes, sobre una base vacía que en unos días ya no lo estará. El importador
 * anterior validaba fila por fila y escribía las válidas, reportando las malas.
 * Eso deja el peor de los estados posibles: media carga hecha, sin registro de
 * QUÉ se escribió, y sin forma de volver atrás salvo borrar a mano.
 *
 * Este contrato define el vocabulario de un import que se puede DESHACER:
 *
 *   • un LOTE con identidad y estado, no una llamada suelta;
 *   • un ENSAYO que ejecuta la escritura real dentro de una transacción que
 *     siempre se revierte — descubre los choques que la validación de formato
 *     no puede ver (duplicados, referencias ausentes, restricciones);
 *   • una CONFIRMACIÓN atómica: o entran todas las filas o no entra ninguna;
 *   • una REVERSIÓN posterior que se apoya en el registro de lo escrito.
 *
 * ─── El límite honesto de la reversión ───────────────────────────────────────
 * Revertir no es viajar en el tiempo. Si tras la carga alguien fabricó contra
 * un material importado, ese material ya no se puede borrar sin destruir el
 * trabajo que vino después. La reversión se NIEGA en ese caso y dice cuál es
 * la fila que la bloquea. Una reversión que borrase igual sería una pérdida de
 * datos disfrazada de función.
 */

import type { ProductCapabilityId } from "./product-catalog";

/* ────────────────────────────────── Destinos ──────────────────────────────── */

/** Objetos que el centro de migración sabe cargar. */
export const MIGRATION_TARGETS = [
  "MODEL",
  "MATERIAL",
  "BOM",
  "ROUTING",
] as const;

export type MigrationTarget = (typeof MIGRATION_TARGETS)[number];

export function isMigrationTarget(value: unknown): value is MigrationTarget {
  return (
    typeof value === "string" &&
    (MIGRATION_TARGETS as readonly string[]).includes(value)
  );
}

/**
 * Capacidades que habilitan cada destino. Basta UNA.
 *
 * Un destino de importación es una puerta de escritura a un módulo de pago, y
 * por lo tanto pertenece a un producto. Sin esta tabla, un tenant que sólo
 * contrató Documentos podría llenar el maestro de materiales del ERP que no
 * compró: el importador escribe con permisos de rol (`engineering:write`), y un
 * permiso de rol dice qué puede hacer una persona DENTRO de lo contratado, no
 * qué contrató la empresa. Son dos preguntas distintas y hacen falta las dos.
 *
 * `ROUTING` es el único que no admite ERP: una hoja de ruta son operaciones,
 * centros de trabajo y tiempos de ejecución. Sin MES no hay dónde ejecutarla.
 */
export const MIGRATION_TARGET_CAPABILITIES: Readonly<
  Record<MigrationTarget, readonly ProductCapabilityId[]>
> = {
  MODEL: ["erp.core", "mes.masterdata"],
  MATERIAL: ["erp.core", "mes.masterdata"],
  BOM: ["erp.core", "mes.masterdata"],
  ROUTING: ["mes.masterdata"],
};

/** ¿Las capacidades vigentes del tenant habilitan este destino? */
export function migrationTargetAllowed(
  target: MigrationTarget,
  capabilities: readonly ProductCapabilityId[],
): boolean {
  return MIGRATION_TARGET_CAPABILITIES[target].some((capability) =>
    capabilities.includes(capability),
  );
}

/** Destinos que un tenant con estas capacidades puede usar hoy. */
export function allowedMigrationTargets(
  capabilities: readonly ProductCapabilityId[],
): MigrationTarget[] {
  return MIGRATION_TARGETS.filter((target) =>
    migrationTargetAllowed(target, capabilities),
  );
}

/* ─────────────────────────────── Estado del lote ──────────────────────────── */

/**
 * Estados de un lote.
 *
 *   draft       → creado, con filas y mapeo, sin ejecutar nada.
 *   dry_run_ok  → el ensayo escribió y revirtió sin un solo error.
 *   dry_run_failed → el ensayo encontró errores; se conservan para corregir.
 *   committed   → confirmado; existe registro de todo lo escrito.
 *   rolled_back → revertido; el registro queda como historia.
 *   failed      → la confirmación falló y la transacción se revirtió entera.
 */
export const MIGRATION_BATCH_STATUSES = [
  "draft",
  "dry_run_ok",
  "dry_run_failed",
  "committed",
  "rolled_back",
  "failed",
] as const;

export type MigrationBatchStatus = (typeof MIGRATION_BATCH_STATUSES)[number];

/**
 * Transiciones permitidas. Las ausencias son las que importan:
 *
 *   • de `committed` NO se vuelve a `committed` — confirmar dos veces el mismo
 *     lote duplicaría los datos y dejaría un registro de reversión mentiroso;
 *   • de `rolled_back` no se sale — un lote revertido está cerrado; cargar otra
 *     vez es otro lote, con su propio registro.
 */
export const MIGRATION_BATCH_TRANSITIONS: Readonly<
  Record<MigrationBatchStatus, readonly MigrationBatchStatus[]>
> = {
  draft: ["dry_run_ok", "dry_run_failed", "committed", "failed"],
  dry_run_ok: ["dry_run_ok", "dry_run_failed", "committed", "failed"],
  dry_run_failed: ["dry_run_ok", "dry_run_failed", "committed", "failed"],
  committed: ["rolled_back"],
  rolled_back: [],
  failed: ["dry_run_ok", "dry_run_failed", "committed", "failed"],
};

export function canTransition(
  from: MigrationBatchStatus,
  to: MigrationBatchStatus,
): boolean {
  return MIGRATION_BATCH_TRANSITIONS[from].includes(to);
}

/** Sólo un lote confirmado puede revertirse. */
export function isRollbackable(status: MigrationBatchStatus): boolean {
  return canTransition(status, "rolled_back");
}

/* ───────────────────────────── Registro de escritura ──────────────────────── */

/**
 * Qué le pasó a cada entidad. `created` se revierte borrando; `updated` se
 * revierte restaurando el estado previo, que por eso se guarda entero.
 */
export const MIGRATION_RECORD_ACTIONS = ["created", "updated"] as const;

export type MigrationRecordAction = (typeof MIGRATION_RECORD_ACTIONS)[number];

/** Entidades que el centro de migración sabe escribir y deshacer. */
export const MIGRATION_ENTITY_TYPES = [
  "product_model",
  "material",
  "bom_node",
  "bom_line",
  "routing",
  "routing_operation",
] as const;

export type MigrationEntityType = (typeof MIGRATION_ENTITY_TYPES)[number];

/* ─────────────────────────────────── Límites ──────────────────────────────── */

/**
 * Tope de filas por lote. No es una restricción del motor: es el tamaño a
 * partir del cual una transacción larga empieza a bloquear al resto del tenant
 * y una reversión deja de ser rápida. Un maestro grande se carga en tandas, y
 * cada tanda se puede revertir por separado — que es justamente lo que se
 * quiere cuando la tanda 7 de 12 salió mal.
 */
export const MIGRATION_MAX_ROWS_PER_BATCH = 5000;

/**
 * Ventana de reversión. Pasado este plazo el lote sigue visible y auditable,
 * pero ya no se deshace desde la aplicación: a los treinta días los datos
 * importados forman parte de la operación y borrarlos en bloque es una
 * intervención con respaldo, no un botón.
 */
export const MIGRATION_ROLLBACK_WINDOW_DAYS = 30;

export function rollbackWindowOpen(
  committedAt: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (!committedAt) return false;
  const committed = new Date(committedAt).getTime();
  if (!Number.isFinite(committed)) return false;
  const limit =
    committed + MIGRATION_ROLLBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() <= limit;
}

/* ──────────────────────────────── Vistas de API ───────────────────────────── */

export interface MigrationBatchView {
  readonly id: string;
  readonly tenantId: string;
  readonly target: MigrationTarget;
  readonly source: string;
  readonly status: MigrationBatchStatus;
  readonly fileName: string | null;
  readonly totalRows: number;
  readonly validRows: number;
  readonly errorRows: number;
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly committedAt: string | null;
  readonly rolledBackAt: string | null;
  readonly rolledBackBy: string | null;
  /** Verdadero mientras la reversión siga siendo posible desde la aplicación. */
  readonly rollbackAvailable: boolean;
}

export interface MigrationRowIssue {
  readonly rowIndex: number;
  readonly field: string | null;
  readonly message: string;
}

export interface MigrationRunResult {
  readonly batch: MigrationBatchView;
  readonly dryRun: boolean;
  readonly issues: readonly MigrationRowIssue[];
}

/**
 * Resultado de una reversión. `blockedBy` no está vacío cuando algo escrito
 * después impide deshacer: se devuelve la lista concreta en vez de un error
 * genérico, porque «no se puede» sin decir qué lo impide obliga a adivinar.
 */
export interface MigrationRollbackResult {
  readonly batch: MigrationBatchView;
  readonly removed: number;
  readonly restored: number;
  readonly blockedBy: readonly {
    readonly entityType: MigrationEntityType;
    readonly entityId: string;
    readonly reason: string;
  }[];
}
