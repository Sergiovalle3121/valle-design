/**
 * Un conflicto CAS pertenece a UN documento, y tiene identidad propia.
 *
 * EL DEFECTO QUE CIERRA. El enclavamiento vivía en un único `saveConflictRef` y
 * se comparaba sólo por número de versión (`cad-save-conflict.ts`). Los números
 * de versión NO son únicos entre documentos: cada dibujo tiene su contador y
 * todos arrancan en 0. Así que un conflicto en el plano A con base v3 detenía
 * el autosave del plano B en cuanto B pasaba por su propia v3 — un dibujo sin
 * ningún conflicto, cuyo trabajo dejaba de subir al servidor con la única señal
 * de una etiqueta que hablaba de otro plano.
 *
 * La corrección es de contabilidad: un registro de incidentes indexado por
 * `documentId`. El enclavamiento sigue atándose a la versión base que lo
 * provocó —así deja de aplicar solo en cuanto esa base se mueve—, pero sólo
 * dentro de su documento.
 *
 */

export interface CadConflictIncident {
  documentId: string;
  /** Versión local con la que se guardó y que el servidor rechazó. */
  baseVersion: number;
  /** Versión que el servidor dijo tener, si la informó. */
  serverVersion: number | null;
}

/** Incidentes vivos, indexados por documento. */
export type CadConflictRegistry = Readonly<Record<string, CadConflictIncident>>;

export interface CadConflictOpenInput {
  documentId: string;
  baseVersion: number;
  serverVersion: number | null | undefined;
}

/**
 * Abre un incidente. Si el documento ya tenía uno, éste lo SUSTITUYE: un
 * segundo 409 es una ronda nueva y la anterior deja de aplicar. Nunca se
 * resuelve en automático.
 */
export function openCadConflictIncident(
  registry: CadConflictRegistry,
  input: CadConflictOpenInput,
): CadConflictRegistry {
  return {
    ...registry,
    [input.documentId]: {
      documentId: input.documentId,
      baseVersion: input.baseVersion,
      serverVersion:
        typeof input.serverVersion === 'number' && Number.isFinite(input.serverVersion)
          ? input.serverVersion
          : null,
    },
  };
}

export function cadConflictIncidentFor(
  registry: CadConflictRegistry,
  documentId: string | null | undefined,
): CadConflictIncident | null {
  if (!documentId) return null;
  return registry[documentId] ?? null;
}

/**
 * ¿Debe el autosave de ESTE documento abstenerse? Sólo cuando reintentaría
 * exactamente la versión que el servidor ya rechazó PARA ESTE DOCUMENTO.
 * Cualquier otra base —o cualquier otro dibujo— es un intento nuevo y legítimo.
 */
export function cadAutosaveBlockedForDocument(
  registry: CadConflictRegistry,
  documentId: string | null | undefined,
  baseVersion: number,
): boolean {
  const incident = cadConflictIncidentFor(registry, documentId);
  return incident !== null && incident.baseVersion === baseVersion;
}

/** Cierra el incidente de un documento sin tocar los de los demás. */
export function closeCadConflictIncident(
  registry: CadConflictRegistry,
  documentId: string | null | undefined,
): CadConflictRegistry {
  if (!documentId || !(documentId in registry)) return registry;
  const next = { ...registry };
  delete next[documentId];
  return next;
}

/**
 * Deja vivo sólo el incidente del documento abierto. Al cambiar de dibujo —o al
 * cerrar el editor, con `null`— el panel y las referencias del anterior tienen
 * que desaparecer: seguir mostrándolos sobre otro documento es ofrecer
 * decisiones destructivas sobre un plano que no es el que se está viendo.
 */
export function archiveCadConflictsExcept(
  registry: CadConflictRegistry,
  documentId: string | null | undefined,
): CadConflictRegistry {
  if (!documentId) return {};
  const incident = registry[documentId];
  return incident ? { [documentId]: incident } : {};
}

/**
 * Texto de la barra de estado. Tiene que decir que el autosave está DETENIDO:
 * dejarlo en «conflicto» a secas mientras ya no se reintenta insinúa que algo
 * sigue trabajando de fondo, y no es verdad.
 */
export function cadConflictIncidentLabel(incident: CadConflictIncident): string {
  const server = incident.serverVersion === null ? '' : ` · servidor v${incident.serverVersion}`;
  return `Conflicto CAS${server} · autosave detenido`;
}
