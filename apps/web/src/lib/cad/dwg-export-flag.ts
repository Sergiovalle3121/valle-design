/**
 * La bandera de EXPORTACIÓN DWG (M5) y los gates que la gobiernan.
 *
 * Es el espejo de escritura de `dwg-interop-flag.ts` y sigue exactamente su
 * filosofía: lo que se puede construir sin nueva firma es el cableado con la
 * bandera apagada; la bandera es condición NECESARIA y nunca suficiente; los
 * gates son hechos contrastables, no opiniones.
 *
 * AUTORIZACIÓN. ADR-0009 §8 (firmada por el titular 2026-08-25) autoriza
 * DISEÑAR Y CONSTRUIR la exportación DWG acotada a AC1015 y al subconjunto
 * LINE/POINT/CIRCLE/ARC/LWPOLYLINE/TEXT/INSERT, con manifiesto de pérdidas
 * (nunca omisión silenciosa) y con su PROPIO flag apagado por defecto —
 * distinto de los dos de lectura, porque escribir arriesga otra cosa:
 * entregarle al cliente un archivo que dice ser DWG y no lo es del todo.
 *
 * EL GATE QUE HOY ESTÁ ABIERTO… ES EL QUE CIERRA TODO. §8.2 exige, antes de
 * cablear nada al producto, que la salida de la función pública de escritura
 * (`writeCanonicalDwg`, ya fusionada) se verifique contra el oráculo EXTERNO
 * (ODA File Converter) sobre el corpus admitido, con la disciplina de
 * `check:dwg`. Ese oráculo sólo puede correrlo el titular con el conversor
 * instalado: OWNER ACTION registrada en la bitácora de COMMERCIAL-RC1.
 * Mientras `externalOracleVerified` sea falso, `dwgBetaExportIsEnabled`
 * devuelve falso CON la bandera encendida — fallo cerrado, igual que la
 * promoción general de importación.
 */

/** La bandera. Nace apagada; `boolean` y no literal por la razón del import. */
export const DWG_EXPORT_FLAG: boolean = false;

/** Los hechos que §8.2 exige ciertos antes de cablear la exportación. */
export interface DwgExportGates {
  /** `writeCanonicalDwg` existe como contrato público del laboratorio. */
  readonly publicWriterExists: boolean;
  /**
   * La salida de ESE contrato se verificó contra ODA File Converter sobre el
   * corpus admitido (§8.2). El caso está listo en `oda-roundtrip.mjs`; el
   * conversor sólo lo puede correr el titular. OWNER ACTION.
   */
  readonly externalOracleVerified: boolean;
}

/** El estado de HOY, congelado: el writer existe; el oráculo espera al titular. */
export const DWG_EXPORT_GATES: DwgExportGates = Object.freeze({
  publicWriterExists: true,
  externalOracleVerified: false,
});

/** Autorización del titular para CONSTRUIR M5 (no para darlo por cumplido). */
export interface DwgExportBetaAuthorization {
  readonly ownerSigned: true;
  readonly adrRef: "0009";
  readonly sectionRef: "8";
  readonly signedDate: "2026-08-25";
  /** Subconjunto de §8.1 — el que el writer escribe HOY, no el perfil V3. */
  readonly profile: "AC1015_EXPORT_2D_V1";
  readonly legalReviewStatus: "pending_parallel";
}

export const DWG_EXPORT_BETA_AUTHORIZATION: DwgExportBetaAuthorization =
  Object.freeze({
    ownerSigned: true,
    adrRef: "0009",
    sectionRef: "8",
    signedDate: "2026-08-25",
    profile: "AC1015_EXPORT_2D_V1",
    legalReviewStatus: "pending_parallel",
  });

/** Qué falta, en español y por su nombre — mismo contrato que el de lectura. */
export function dwgExportBlockers(
  gates: DwgExportGates = DWG_EXPORT_GATES,
): string[] {
  const blockers: string[] = [];
  if (!gates.publicWriterExists)
    blockers.push(
      "falta la función pública de escritura del laboratorio (writeCanonicalDwg)",
    );
  if (!gates.externalOracleVerified)
    blockers.push(
      "la salida de writeCanonicalDwg no está verificada contra el oráculo externo (ODA File Converter) sobre el corpus admitido — §8.2; OWNER ACTION",
    );
  return blockers;
}

/**
 * ¿Está habilitada la exportación DWG en ESTE entorno? Conjunción de tres:
 * bandera del entorno (quien llama la resuelve, igual que en la lectura),
 * firma del titular, y CERO bloqueos de §8.2. Encender la bandera sin el
 * oráculo deja esto en falso y el producto sigue exportando sólo DXF/PDF.
 */
export function dwgBetaExportIsEnabled(
  betaFlagOn: boolean,
  gates: DwgExportGates = DWG_EXPORT_GATES,
): boolean {
  return (
    betaFlagOn === true &&
    DWG_EXPORT_BETA_AUTHORIZATION.ownerSigned &&
    dwgExportBlockers(gates).length === 0
  );
}

/** La razón honesta que la interfaz puede enseñar mientras tanto. */
export const DWG_EXPORT_DISABLED_REASON =
  "Este editor todavía no exporta .dwg. Exporta a DXF (R12 o posterior): " +
  "entra en cualquier CAD, con su informe de lo que se conserva y lo que se " +
  "pierde.";
