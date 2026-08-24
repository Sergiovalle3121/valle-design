/**
 * La bandera de importación DWG y los gates que la gobiernan.
 *
 * POR QUÉ EXISTE APAGADA. Admitir archivos DWG es la razón número uno por la
 * que un despacho mexicano no se cambia de AutoCAD, y hay un laboratorio
 * clean-room en este repositorio que ya sabe leer una base de datos R2000. La
 * tentación evidente es enchufarlo. ADR-0004 y ADR-0007 lo prohíben con
 * nombres y apellidos: habilitar DWG en el producto exige otro ADR que
 * resuelva revisión jurídica y de seguridad, corpus redistribuible
 * independiente, fuzzing, límites, fidelidad, pérdidas, tenancy, mapping al
 * documento canónico, importación real, CI/E2E y operación. Nada de eso lo
 * puede firmar un programa.
 *
 * Lo que SÍ se puede construir sin firma es todo el cableado, con la bandera
 * apagada, para que el día que el dueño firme el trabajo sea de horas y no de
 * meses. Eso es este módulo.
 *
 * LA BANDERA NO BASTA. `dwgImportIsEnabled` exige la bandera Y cero bloqueos.
 * Encenderla a mano no habilita nada: el gate sigue cerrado porque los gates
 * son declaraciones de hechos que hoy son falsos. Es fallo cerrado ante lo
 * ambiguo, y es deliberado que la bandera sea condición NECESARIA y no
 * suficiente: una bandera que por sí sola abre la puerta es una bandera que
 * alguien enciende «un momento, para probar».
 *
 * Puro y sin DOM: los gates son datos, no lecturas de disco. Quién los firma y
 * con qué evidencia es asunto del ADR de promoción y de la spec que cruza esta
 * declaración con los artefactos de evidencia del repositorio.
 */

/**
 * La bandera. Nace apagada y permanece apagada.
 *
 * Tipada como `boolean` y no como `false` a propósito: si fuera literal, el
 * compilador estrecharía cada comprobación a `never` y las specs que vigilan el
 * encendido dejarían de compilar en cuanto alguien la cambiara. Se prefiere que
 * el spec FALLE a que el spec no compile.
 */
export const DWG_IMPORT_FLAG: boolean = false;

/**
 * Los hechos que el ADR de promoción tendrá que declarar ciertos.
 *
 * Son hechos, no opiniones: cada uno se puede contrastar contra un artefacto
 * del repositorio o contra un documento firmado. Ninguno se puede marcar cierto
 * «porque el código ya funciona».
 */
export interface DwgPromotionGates {
  /** Existe el ADR posterior que autoriza la promoción (ADR-0007 lo exige). */
  readonly promotionAdrSigned: boolean;
  /** Revisión jurídica externa resuelta sobre el formato y el corpus. */
  readonly legalReviewCleared: boolean;
  /** Revisión de seguridad del límite binario, con fuzzing y límites. */
  readonly securityReviewCleared: boolean;
  /** Bundles admitidos en el corpus independiente (commit y hash fijados). */
  readonly admittedCorpusBundles: number;
  /** Validaciones independientes autorizadas; la política exige dos. */
  readonly independentValidations: number;
  /** El laboratorio declara `entityImport` soportado en su propia matriz. */
  readonly labEntityImportSupported: boolean;
  /** El mapping al documento canónico tiene evidencia de fidelidad y pérdidas. */
  readonly canonicalMappingVerified: boolean;
}

/**
 * El estado de HOY. Todo falso, todo cero, y así consta por escrito.
 *
 * Congelado para que nadie lo mute en caliente desde otro módulo: cambiar un
 * gate tiene que ser un cambio de código revisable, no una asignación.
 */
export const DWG_PROMOTION_GATES: DwgPromotionGates = Object.freeze({
  promotionAdrSigned: false,
  legalReviewCleared: false,
  securityReviewCleared: false,
  admittedCorpusBundles: 0,
  independentValidations: 0,
  labEntityImportSupported: false,
  canonicalMappingVerified: false,
});

/** Dos validaciones independientes: el reader de Valle nunca es único oráculo. */
export const DWG_REQUIRED_INDEPENDENT_VALIDATIONS = 2;

/**
 * Qué falta, en español y por su nombre.
 *
 * Devuelve una lista y no un booleano porque «no se puede» sin el motivo es lo
 * que empuja a la gente a saltarse el gate: quien lee esto tiene que poder
 * decir exactamente qué firma falta.
 */
export function dwgPromotionBlockers(
  gates: DwgPromotionGates = DWG_PROMOTION_GATES,
): string[] {
  const blockers: string[] = [];
  if (!gates.promotionAdrSigned)
    blockers.push("falta el ADR de promoción que autorice habilitarlo en el producto");
  if (!gates.legalReviewCleared)
    blockers.push("falta la revisión jurídica externa");
  if (!gates.securityReviewCleared)
    blockers.push("falta la revisión de seguridad del límite binario");
  if (gates.admittedCorpusBundles < 1)
    blockers.push("cero bundles admitidos en el corpus independiente");
  if (gates.independentValidations < DWG_REQUIRED_INDEPENDENT_VALIDATIONS)
    blockers.push(
      `faltan validaciones independientes autorizadas (${gates.independentValidations} de ${DWG_REQUIRED_INDEPENDENT_VALIDATIONS})`,
    );
  if (!gates.labEntityImportSupported)
    blockers.push("la matriz del laboratorio no declara soportada la importación de entidades");
  if (!gates.canonicalMappingVerified)
    blockers.push("el mapping al documento canónico no tiene evidencia de fidelidad y pérdidas");
  return blockers;
}

/**
 * ¿Está habilitada la importación DWG? Bandera encendida Y cero bloqueos.
 *
 * El orden importa poco; lo que importa es la conjunción: encender la bandera
 * sin los gates deja esto en `false` y el producto sigue rechazando `.dwg`.
 */
export function dwgImportIsEnabled(
  flag: boolean = DWG_IMPORT_FLAG,
  gates: DwgPromotionGates = DWG_PROMOTION_GATES,
): boolean {
  return flag && dwgPromotionBlockers(gates).length === 0;
}

/**
 * La razón honesta que la interfaz puede enseñar.
 *
 * No promete fechas, no insinúa que «ya casi», y no menciona ninguna capacidad
 * que el producto no tenga. Lo accionable de verdad —exporta a DXF— va primero
 * porque es lo que resuelve el problema del arquitecto hoy.
 */
export const DWG_IMPORT_DISABLED_REASON =
  "Este editor todavía no lee archivos .dwg. Expórtalo a DXF (R12 o posterior) " +
  "desde tu CAD e impórtalo: DXF entra completo, con su informe de lo que se " +
  "conserva y lo que se pierde.";

// ---------------------------------------------------------------------------
// Beta acotada AC1015_MODELSPACE_2D_V2 — firmada 2026-08-24 (ADR-0009
// §6-bis), ampliada el mismo día (§6-ter)
// ---------------------------------------------------------------------------

/**
 * Autorización del titular para la beta de SÓLO IMPORTACIÓN. NO es
 * `DWG_PROMOTION_GATES`: es un mecanismo DISTINTO y más estrecho, con el
 * mismo patrón de riesgo aceptado por escrito que la Enmienda 2026-08-20 de
 * `CORPUS_POLICY.md` en el repositorio de conformidad — el titular decidió
 * encargar el dictamen jurídico externo EN PARALELO en vez de antes, y
 * acotó lo que autoriza mientras tanto a un perfil, una versión y un
 * sentido (importar, no exportar).
 *
 * El perfil es V2 desde §6-ter: §6-bis fijó V1 (LINE/POINT/CIRCLE/ARC/
 * LWPOLYLINE/TEXT/INSERT) y autorizó, como parte de la misma firma, una
 * hoja de ruta secuencial de ampliaciones (M2/M3/M4/M5) condicionada a que
 * cada hito tuviera su propio end-to-end en verde antes del siguiente. V2
 * es M2a: suma ELLIPSE y SPLINE no racional de escenario 1.
 *
 * `legalReviewStatus` se queda en `"pending_parallel"` a propósito: cambiar
 * este archivo no puede convertirlo en `legalReviewCleared: true` en
 * `DWG_PROMOTION_GATES` de arriba, que sigue exigiendo la revisión real para
 * la promoción general/GA. Los dos gates son preguntas distintas.
 */
export interface DwgBetaAuthorization {
  readonly ownerSigned: true;
  readonly adrRef: "0009";
  readonly signedDate: "2026-08-24";
  readonly profile: "AC1015_MODELSPACE_2D_V2";
  readonly legalReviewStatus: "pending_parallel";
}

export const DWG_BETA_AUTHORIZATION: DwgBetaAuthorization = Object.freeze({
  ownerSigned: true,
  adrRef: "0009",
  signedDate: "2026-08-24",
  profile: "AC1015_MODELSPACE_2D_V2",
  legalReviewStatus: "pending_parallel",
});

/**
 * ¿Está autorizada la beta de importación DWG en ESTE entorno?
 *
 * `betaFlagOn` lo decide quien llama, no este módulo: un módulo que no lee
 * DOM ni proceso no puede saber si el entorno actual es público o de beta.
 * Quien SÍ lo sabe (`document-import-client.ts`, a partir de una variable de
 * build) pasa el booleano ya resuelto. Igual que `dwgImportIsEnabled`, es una
 * conjunción: la bandera sola no basta si el titular no hubiera firmado.
 */
export function dwgBetaImportIsEnabled(betaFlagOn: boolean): boolean {
  return betaFlagOn === true && DWG_BETA_AUTHORIZATION.ownerSigned;
}
