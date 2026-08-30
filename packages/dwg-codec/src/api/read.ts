import type { DwgLimitOverrides } from "./limits.js";
import {
  readAc1015Database,
  type Ac1015DatabaseBlock,
  type Ac1015DatabaseEntityRecord,
  type Ac1015DatabaseLayer,
  type Ac1015NeutralDatabase,
  type Ac1015UnsupportedDatabaseObject,
} from "../reader/ac1015-database-reader.js";
import { readR2004Database } from "../reader/r2004-database-reader.js";
import {
  DwgParseError,
  normalizeDwgError,
  throwDwgError,
} from "../security/parse-error.js";
import type { ResourceBudgetOptions } from "../security/resource-budget.js";

/**
 * Base neutral que `readDwg` devuelve. El contrato es el MISMO para todas
 * las versiones que el laboratorio decodifica; el despacho por firma vive
 * aquí dentro.
 */
export type DwgDatabase = Ac1015NeutralDatabase;
export type DwgDatabaseLayer = Ac1015DatabaseLayer;
export type DwgDatabaseBlock = Ac1015DatabaseBlock;
export type DwgDatabaseEntityRecord = Ac1015DatabaseEntityRecord;
export type DwgUnsupportedDatabaseObject = Ac1015UnsupportedDatabaseObject;

/** Firmas de la familia R2004 que despachan al lector R2004. */
const R2004_FAMILY_SIGNATURES = ["AC1018", "AC1024", "AC1027", "AC1032"];
/** Firma del contenedor R2007, estructuralmente distinto (Reed-Solomon). */
const R2007_SIGNATURE = "AC1021";

/**
 * Lee un archivo DWG completo a la base neutral del laboratorio,
 * despachando por firma: AC1015 al lector R2000, la familia
 * AC1018/AC1024/AC1027/AC1032 al lector R2004 (hoy decodifica objetos sólo
 * en AC1018), y AC1021 se rechaza tipado — su contenedor R2007 usa
 * Reed-Solomon y flujos propios que este laboratorio no abre.
 *
 * Falla cerrado con `DwgParseError` tipado: firma ajena o versión sin
 * decodificador (`DWG_VERSION_DECODER_UNSUPPORTED`), estructura corrupta con
 * offset (`DWG_STRUCTURE_CORRUPT`), o presupuesto agotado. Nunca lanza un
 * error crudo del runtime.
 *
 * `cancellation` (`{clock?, signal?, deadlineMs?}`, mismo contrato que
 * `probeDwg`) es ADITIVO y se reenvía tal cual al lector que corresponda.
 */
export function readDwg(
  input: Uint8Array,
  limits?: DwgLimitOverrides,
  cancellation?: ResourceBudgetOptions,
): DwgDatabase {
  // La promesa de la cabecera —«nunca lanza un error crudo del runtime»— se
  // cumple AQUÍ, no por fe en los lectores: un DwgParseError propio pasa tal
  // cual; cualquier otra cosa (un RangeError de una reserva imposible, un
  // TypeError inesperado) sale normalizada como DWG_INTERNAL_ERROR, sin
  // detalles de implementación en el mensaje.
  try {
    return dispatchRead(input, limits, cancellation);
  } catch (error) {
    if (error instanceof DwgParseError) throw error;
    throw new DwgParseError(normalizeDwgError(error));
  }
}

function dispatchRead(
  input: Uint8Array,
  limits?: DwgLimitOverrides,
  cancellation?: ResourceBudgetOptions,
): DwgDatabase {
  const code = peekSignature(input);
  if (code !== null && R2004_FAMILY_SIGNATURES.includes(code)) {
    return limits === undefined
      ? readR2004Database(input, undefined, cancellation)
      : readR2004Database(input, limits, cancellation);
  }
  if (code === R2007_SIGNATURE) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      0,
      "AC1021 uses the R2007 Reed-Solomon container, which this laboratory does not open; AC1015 and the R2004 family are the decoded versions.",
    );
  }
  // Todo lo demás — AC1015 incluido — sigue el camino R2000, que valida la
  // firma con su propio gate y rechaza tipado las versiones que no abre.
  return limits === undefined
    ? readAc1015Database(input, undefined, cancellation)
    : readAc1015Database(input, limits, cancellation);
}

/**
 * Mira los seis bytes de la firma SIN validar nada: el gate de verdad vive en
 * cada lector (presupuesto incluido). Devuelve `null` si no alcanza.
 */
function peekSignature(input: Uint8Array): string | null {
  if (!(input instanceof Uint8Array) || input.length < 6) return null;
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += String.fromCharCode(input[index]!);
  }
  return code;
}
