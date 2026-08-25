/**
 * `CanonicalHistory` es lógica de documento pura (sin React), así que vive en
 * `lib/cad/canonical-history.ts` junto al resto del modelo canónico — y desde
 * ahí la usa también `lib/cad/block-edit-session.ts`, que no puede depender de
 * `components/` sin invertir la capa. Se reexporta entera aquí para que
 * ningún consumidor existente cambie de import.
 */
export {
  CanonicalHistory,
  cancelActiveCommand,
  type CancelableCommand,
  type CanonicalHistoryEntry,
  type CanonicalHistoryEvent,
  type CanonicalHistoryMetrics,
  type CanonicalHistoryOptions,
  type CanonicalHistoryRecordOptions,
  type CanonicalHistoryRecoveryPoint,
} from "@/lib/cad/canonical-history";
