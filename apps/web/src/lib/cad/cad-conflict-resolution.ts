/**
 * Qué se guarda —y contra qué versión— al resolver un conflicto CAS.
 *
 * Cuando el servidor rechaza un guardado por 409 hay tres documentos en juego:
 *
 *   base    el último que el servidor reconoció a esta pestaña
 *   mine    lo que hay en memoria, con las ediciones sin confirmar
 *   theirs  lo que el servidor tiene ahora, guardado por otra sesión
 *
 * Y tres salidas posibles, que NO son intercambiables: cada una destruye
 * trabajo distinto. Este módulo decide el documento resultante y la versión
 * contra la que se guarda; no dibuja nada y no habla con la red, para que la
 * parte que puede borrar el plano de alguien sea comprobable.
 *
 * DOS INVARIANTES QUE NO SE NEGOCIAN.
 *
 * 1. Se guarda SIEMPRE contra la versión del servidor, nunca contra la
 *    obsoleta. Sobrescribir no es saltarse el control de concurrencia: es
 *    reapuntarlo a la versión vigente. Si mientras tanto entra un tercer
 *    guardado, vuelve a haber 409 — que es exactamente lo que debe pasar.
 *
 * 2. Fusionar con colisiones sin resolver NO produce plan. `mergeCadDocuments`
 *    se niega a elegir cuando ambas ramas tocaron la misma entidad, y esa
 *    negativa tiene que llegar hasta aquí: completar el hueco con un lado
 *    cualquiera sería descartar trabajo ajeno con apariencia de éxito.
 */
import {
  mergeCadDocuments,
  type CadMergeCollision,
  type CadMergeReferenceBreak,
  type CadMergeResolution,
  type CadSectionCollision,
  type CadSectionResolution,
} from './cad-collaboration';
import type { CadDocument } from './cad-document';

export type CadConflictStrategy = 'merge' | 'reload' | 'overwrite';

export interface CadConflictInputs {
  /** Último documento reconocido por el servidor a esta pestaña. */
  base: CadDocument;
  /** Documento en memoria, con las ediciones que el 409 dejó sin guardar. */
  mine: CadDocument;
  /** Documento que el servidor tiene ahora. */
  theirs: CadDocument;
  /** Versión de `theirs`. Es contra ésta contra la que se guarda. */
  theirsVersion: number;
  /** Elección por entidad para las colisiones (sólo la usa `merge`). */
  resolutions?: Record<string, CadMergeResolution>;
  /**
   * Elección por recurso NO-entidad (`capas:WALLS`, `bloques:DOOR`…). Un plano
   * no son sólo sus entidades: una fusión también decide capas, bloques,
   * estilos y layouts.
   */
  sectionResolutions?: Record<string, CadSectionResolution>;
}

/** Lo que hay que enseñar antes de que alguien elija. */
export interface CadConflictSummary {
  /** Entidades que se fusionaron solas porque sólo cambió un lado. */
  autoMerged: number;
  /** Entidades que ambos tocaron y exigen una elección. */
  collisions: CadMergeCollision[];
  /** Colisiones todavía sin decidir. */
  unresolved: string[];
  /** Recursos no-entidad que ambos tocaron y exigen una elección. */
  sectionCollisions: CadSectionCollision[];
  /** Claves `sección:recurso` todavía sin decidir. */
  unresolvedSections: string[];
  /**
   * Referencias que el documento fusionado no resolvería. Con una sola de
   * éstas la fusión no puede aplicarse: el validador del servidor la rechaza.
   */
  referenceBreaks: CadMergeReferenceBreak[];
  /** ¿Puede aplicarse la fusión ya? */
  mergeReady: boolean;
}

function merge(inputs: CadConflictInputs) {
  return mergeCadDocuments(
    inputs.base,
    inputs.mine,
    inputs.theirs,
    inputs.resolutions ?? {},
    inputs.sectionResolutions ?? {},
  );
}

export function summarizeCadConflict(inputs: CadConflictInputs): CadConflictSummary {
  const result = merge(inputs);
  return {
    autoMerged: result.autoMergedIds.length,
    collisions: result.collisions,
    unresolved: result.unresolved,
    sectionCollisions: result.sectionCollisions,
    unresolvedSections: result.unresolvedSections,
    referenceBreaks: result.referenceBreaks,
    mergeReady: result.ok,
  };
}

export interface CadConflictPlan {
  strategy: CadConflictStrategy;
  /** Documento que queda en el editor tras aplicar el plan. */
  document: CadDocument;
  /**
   * Versión contra la que guardar, o `null` cuando el plan NO guarda.
   * Recargar no escribe: adopta lo del servidor tal cual.
   */
  saveAgainstVersion: number | null;
  /**
   * ¿Puede descartarse el borrador de recuperación local al terminar?
   *
   * Sólo cuando el trabajo local llega al servidor. Recargar lo descarta de la
   * pantalla, así que el journal es lo único que queda de él: borrarlo ahí
   * convertiría «tus cambios siguen en la recuperación local» en mentira.
   */
  clearsRecovery: boolean;
}

export type CadConflictPlanResult =
  | { ok: true; plan: CadConflictPlan }
  | {
      ok: false;
      /**
       * `unresolved-collisions`: falta decidir. `reference-breaks`: ya está
       * todo decidido pero el resultado dejaría algo apuntando a lo que no
       * existe —típicamente una capa o un bloque que un lado borró mientras el
       * otro lo seguía usando— y el servidor rechazaría ese documento.
       */
      reason: 'unresolved-collisions' | 'reference-breaks';
      unresolved: string[];
      unresolvedSections: string[];
      referenceBreaks: CadMergeReferenceBreak[];
    };

export function planCadConflictResolution(
  strategy: CadConflictStrategy,
  inputs: CadConflictInputs,
): CadConflictPlanResult {
  if (strategy === 'reload') {
    return {
      ok: true,
      plan: {
        strategy,
        document: inputs.theirs,
        // No se escribe nada: el servidor ya tiene esto.
        saveAgainstVersion: null,
        clearsRecovery: false,
      },
    };
  }

  if (strategy === 'overwrite') {
    return {
      ok: true,
      plan: {
        strategy,
        document: inputs.mine,
        saveAgainstVersion: inputs.theirsVersion,
        clearsRecovery: true,
      },
    };
  }

  const result = merge(inputs);
  if (!result.ok) {
    const pending =
      result.unresolved.length > 0 || result.unresolvedSections.length > 0;
    return {
      ok: false,
      reason: pending ? 'unresolved-collisions' : 'reference-breaks',
      unresolved: result.unresolved,
      unresolvedSections: result.unresolvedSections,
      referenceBreaks: result.referenceBreaks,
    };
  }
  return {
    ok: true,
    plan: {
      strategy,
      document: result.document,
      saveAgainstVersion: inputs.theirsVersion,
      clearsRecovery: true,
    },
  };
}

/**
 * Qué pierde cada opción, en las palabras que verá quien decide. Vive junto a
 * la lógica a propósito: si una salida cambia de comportamiento y su texto se
 * queda atrás, el diálogo pasa a mentir sobre lo que va a borrar.
 */
export const CAD_CONFLICT_CONSEQUENCE: Record<CadConflictStrategy, string> = {
  merge: 'Conserva ambos trabajos; decides tú las entidades en disputa.',
  reload:
    'Descarta tus cambios locales de la pantalla. Siguen en la recuperación local del navegador.',
  overwrite: 'Descarta lo que guardó la otra sesión.',
};
