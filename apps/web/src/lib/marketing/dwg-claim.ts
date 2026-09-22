import {
  isDwgAc1018ImportBetaEnabled,
  isDwgModernImportBetaEnabled,
  isDwgNativeImportBetaEnabled,
} from "@/lib/cad/document-import-client";
import {
  dwgAc1018BetaImportIsEnabled,
  dwgBetaImportIsEnabled,
  dwgModernBetaImportIsEnabled,
} from "@/lib/cad/dwg-interop-flag";

/**
 * LO QUE LA PORTADA DICE SOBRE DWG, derivado de las banderas del despliegue.
 *
 * La verdad sobre DWG no es una frase: depende de cómo se construyó ESTE
 * despliegue. `lib/cad/dwg-interop-flag.ts` tiene firmadas por el titular tres
 * betas de sólo importación —`AC1015_MODELSPACE_2D_V3` (ADR-0009 §6-bis) y
 * `AC1018_MODELSPACE_2D_V1` (§7) y la familia AC1024/AC1027/AC1032— que
 * se encienden con `NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA`,
 * `NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA` y `NEXT_PUBLIC_DWG_MODERN_IMPORT_BETA`,
 * inlineadas en tiempo de build. Un despliegue sin esas variables no abre
 * ningún DWG; la primera habilita AC1015 y las otras amplían esa beta base.
 * La exportación DWG sigue apagada en todos (`dwg-export-flag.ts`).
 *
 * La portada, el FAQ, los pilares, la comparativa y la lista de precios
 * escribían esa verdad A MANO, y por eso se contradecían: «no abrimos DWG»
 * en el hero mientras el importador de la misma build aceptaba AC1015. Aquí
 * hay UNA función que lee las mismas banderas que el importador y devuelve
 * el texto; todas las superficies la llaman. Si mañana el titular enciende
 * una variable en Railway, la portada cambia sola y en la misma build.
 *
 * Reglas del texto, vigiladas por `dwg-claim.spec.ts`:
 *  · nombra la VERSIÓN del formato, nunca a su fabricante;
 *  · «sólo importación» y «beta» van en la misma frase que «DWG»;
 *  · nunca afirma que se escriba DWG.
 */

export interface DwgClaimInput {
  /** `NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA === "true"` en esta build. */
  readonly nativeBeta: boolean;
  /** `NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA === "true"` en esta build. */
  readonly ac1018Beta: boolean;
  /** `NEXT_PUBLIC_DWG_MODERN_IMPORT_BETA === "true"` en esta build. */
  readonly modernBeta: boolean;
}

export interface DwgClaim {
  /** Si esta build abre algún DWG. */
  readonly importEnabled: boolean;
  /** Versiones del formato que la beta acepta, con su nombre de edición. */
  readonly versions: readonly string[];
  /** Una línea para pilares, comparativa y lista de precios. */
  readonly short: string;
  /** La respuesta completa para el centro de preguntas y las guías. */
  readonly long: string;
}

const AC1015 = "AC1015 (R2000)";
const AC1018 = "AC1018 (R2004)";
const MODERN = ["AC1024 (R2010)", "AC1027 (R2013)", "AC1032 (R2018)"];

const NEVER_WRITES =
  "Nunca escribe DWG: la salida es DXF con manifiesto de pérdidas.";

/** Puro: mismas banderas ⇒ mismo texto. Es lo que prueba el spec. */
export function dwgClaimFor({ nativeBeta, ac1018Beta, modernBeta }: DwgClaimInput): DwgClaim {
  // La conjunción es la del importador: AC1018 amplía la beta base, nunca la
  // sustituye. Encender sólo la segunda variable no abre nada.
  const base = dwgBetaImportIsEnabled(nativeBeta);
  const ac1018 = dwgAc1018BetaImportIsEnabled(ac1018Beta, nativeBeta);
  const modern = dwgModernBetaImportIsEnabled(modernBeta, nativeBeta);

  if (!base) {
    return {
      importEnabled: false,
      versions: [],
      short:
        "Este despliegue no abre ni escribe DWG: el editor detecta el formato y lo rechaza con un mensaje claro.",
      long:
        "No en este despliegue. La lectura DWG en beta, sólo de importación, está apagada. " +
        "Exporta tu dibujo a DXF desde tu CAD para importarlo aquí y consulta el informe de pérdidas. " +
        NEVER_WRITES,
    };
  }

  const versions = [AC1015, ...(ac1018 ? [AC1018] : []), ...(modern ? MODERN : [])];
  const lista = versions.length === 1
    ? versions[0]
    : `${versions.slice(0, -1).join(", ")} y ${versions[versions.length - 1]}`;
  return {
    importEnabled: true,
    versions,
    short: `Lee DWG ${lista}, sólo importación y en beta; nunca lo escribe.`,
    long:
      `Sí, en beta y sólo para importar: este despliegue lee DWG en las versiones ${lista} ` +
      "—espacio modelo y geometría 2D— y rechaza cualquier otra versión con un mensaje claro en vez de " +
      `devolverte un dibujo roto. ${NEVER_WRITES}`,
  };
}

/** La verdad de ESTA build: lee las mismas banderas que el importador. */
export function dwgClaim(): DwgClaim {
  return dwgClaimFor({
    nativeBeta: isDwgNativeImportBetaEnabled(),
    ac1018Beta: isDwgAc1018ImportBetaEnabled(),
    modernBeta: isDwgModernImportBetaEnabled(),
  });
}
