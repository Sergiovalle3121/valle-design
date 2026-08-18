/**
 * RFC — validación de FORMA, y nada más que de forma.
 *
 * Este módulo NO consulta al SAT. Es importante decirlo aquí y repetirlo en el
 * contrato y en la interfaz: un RFC bien formado puede no existir, puede estar
 * cancelado o puede pertenecer a otra persona. Lo único que se afirma es que
 * la cadena tiene la estructura que el SAT define, que es exactamente lo que
 * evita el 90% de los CFDI rechazados por captura: dígitos donde van letras,
 * una fecha imposible, doce caracteres en un RFC de persona física.
 *
 * Estructura real (RFC = clave del Registro Federal de Contribuyentes):
 *
 *   Persona MORAL  — 12 caracteres: 3 letras + AAMMDD + homoclave (3)
 *   Persona FÍSICA — 13 caracteres: 4 letras + AAMMDD + homoclave (3)
 *
 * Las letras iniciales admiten `&` y `Ñ` porque el SAT las genera a partir de
 * la denominación social ("Ñ" en apellidos, "&" en razones sociales tipo
 * "GONZÁLEZ & ASOCIADOS"). La homoclave son dos caracteres alfanuméricos más
 * un dígito verificador que el SAT calcula en base 11 y que puede ser `0-9` o
 * `A` (valor 10).
 *
 * Por qué NO se comprueba el dígito verificador: el algoritmo es público y
 * determinista, pero el SAT ha emitido históricamente RFC que no lo cumplen
 * (altas antiguas, correcciones manuales). Rechazar uno de ésos dejaría a un
 * cliente legítimo sin poder pagar, y el precio de equivocarse en esa
 * dirección es perder la venta entera. Se valida la forma —que es lo que la
 * captura estropea— y se deja la existencia real al PAC, que sí la consulta
 * cuando timbra. Fingir aquí una validación contra el SAT sería mentir sobre
 * la única garantía que el cliente necesita para deducir su gasto.
 */

export type TaxPersonType = 'fisica' | 'moral';

export type RfcRejection =
  /** Cadena vacía tras normalizar. */
  | 'rfc_empty'
  /** Longitud distinta de 12 (moral) o 13 (física). */
  | 'rfc_length'
  /** Las posiciones no son letras/dígitos donde el SAT los exige. */
  | 'rfc_shape'
  /** El bloque AAMMDD no es una fecha de calendario. */
  | 'rfc_date'
  /** RFC genérico (público en general o extranjero): no identifica al cliente. */
  | 'rfc_generic';

export type RfcValidation =
  | { valid: true; rfc: string; personType: TaxPersonType }
  | { valid: false; rejection: RfcRejection };

/**
 * RFC genéricos del SAT. Son válidos en un CFDI, pero SÓLO para facturas al
 * «público en general» (uso S01), que por definición NO son deducibles para
 * quien las recibe. Capturarlos aquí sería recoger un dato que garantiza que
 * el cliente no podrá deducir la suscripción — justo lo contrario de por qué
 * se le piden los datos fiscales. Se rechazan con un mensaje que lo explica.
 */
const GENERIC_RFCS = new Set(['XAXX010101000', 'XEXX010101000']);

/** Letras iniciales: alfabeto latino más `&` y `Ñ`. */
const NAME_LETTER = /^[A-Z&Ñ]$/;
const HOMOCLAVE_ALNUM = /^[A-Z0-9]$/;
/** Dígito verificador en base 11: `A` representa el valor 10. */
const CHECK_CHARACTER = /^[0-9A]$/;

/**
 * Normaliza lo que el cliente teclea: mayúsculas y sin los separadores con
 * los que casi todo el mundo escribe su RFC (`VECJ-880326-XXX`). Se limpian
 * espacios y guiones y NADA más: un carácter raro debe hacer fallar la
 * validación, no desaparecer en silencio.
 */
export function normalizeRfc(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}

export function validateRfc(raw: string): RfcValidation {
  const rfc = normalizeRfc(raw);
  if (!rfc) return { valid: false, rejection: 'rfc_empty' };
  if (rfc.length !== 12 && rfc.length !== 13) {
    return { valid: false, rejection: 'rfc_length' };
  }
  if (GENERIC_RFCS.has(rfc)) {
    return { valid: false, rejection: 'rfc_generic' };
  }

  const personType: TaxPersonType = rfc.length === 13 ? 'fisica' : 'moral';
  const letterCount = personType === 'fisica' ? 4 : 3;

  for (let index = 0; index < letterCount; index += 1) {
    if (!NAME_LETTER.test(rfc[index])) {
      return { valid: false, rejection: 'rfc_shape' };
    }
  }
  const date = rfc.slice(letterCount, letterCount + 6);
  if (!/^\d{6}$/.test(date)) {
    return { valid: false, rejection: 'rfc_shape' };
  }
  const homoclave = rfc.slice(letterCount + 6);
  if (
    !HOMOCLAVE_ALNUM.test(homoclave[0]) ||
    !HOMOCLAVE_ALNUM.test(homoclave[1]) ||
    !CHECK_CHARACTER.test(homoclave[2])
  ) {
    return { valid: false, rejection: 'rfc_shape' };
  }
  if (!isCalendarDate(date)) {
    return { valid: false, rejection: 'rfc_date' };
  }
  return { valid: true, rfc, personType };
}

/**
 * AAMMDD como fecha real.
 *
 * El siglo es ambiguo por diseño del RFC (un `88` es 1988 y un `05` puede ser
 * 1905 o 2005), así que el 29 de febrero se acepta cuando `AA % 4 === 0`: en
 * el rango que un RFC puede representar eso coincide con año bisiesto tanto en
 * 19AA como en 20AA salvo por 1900, y 2000 SÍ fue bisiesto. Preferir el falso
 * positivo aquí es deliberado: rechazar un cumpleaños legítimo cuesta una
 * venta; aceptar una fecha imposible una vez cada cien años no cuesta nada,
 * porque el PAC lo verá al timbrar.
 */
function isCalendarDate(yymmdd: string): boolean {
  const year = Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  const day = Number(yymmdd.slice(4, 6));
  if (month < 1 || month > 12 || day < 1) return false;
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maximum = month === 2 && year % 4 === 0 ? 29 : lengths[month - 1];
  return day <= maximum;
}

/** Mensaje en español que el cliente puede ACTUAR, no un código pelado. */
export function rfcRejectionMessage(rejection: RfcRejection): string {
  switch (rejection) {
    case 'rfc_empty':
      return 'Escribe tu RFC: sin él no podemos emitir un CFDI a tu nombre.';
    case 'rfc_length':
      return 'El RFC tiene 13 caracteres si eres persona física y 12 si eres persona moral, incluyendo la homoclave.';
    case 'rfc_shape':
      return 'El RFC no tiene la estructura del SAT: letras iniciales, fecha AAMMDD y homoclave de tres caracteres.';
    case 'rfc_date':
      return 'La fecha dentro del RFC (los seis dígitos centrales) no existe en el calendario.';
    case 'rfc_generic':
      return 'Ése es el RFC genérico de público en general: con él la factura no es deducible. Escribe el RFC de tu persona o de tu despacho.';
  }
}
