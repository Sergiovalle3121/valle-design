/**
 * Tabla de atributos del shapefile (`.dbf`) — quién es el dueño del polígono.
 *
 * ## Por qué hace falta leerla
 *
 * El `.shp` sólo trae geometría. La clave catastral, la superficie registrada,
 * el nombre del propietario y el número de lote viven en el `.dbf`, y sin ellos
 * un plano de linderos es un dibujo de polígonos anónimos. La correspondencia
 * entre los dos archivos es POSICIONAL: el registro n de la tabla describe la
 * geometría n. No hay clave, no hay unión, no hay nada que verificar salvo que
 * los dos archivos tengan el mismo número de registros — y por eso ese conteo
 * se comprueba y su desajuste aborta.
 *
 * ## Fallo cerrado, con una excepción declarada
 *
 * La estructura se valida entera: longitud de cabecera coherente con el número
 * de campos, longitud de registro igual a la suma de los campos, y el archivo
 * exactamente del tamaño que anuncian sus propias cuentas.
 *
 * La EXCEPCIÓN es la codificación del texto. El formato no la declara de forma
 * fiable —hay un byte de «controlador de idioma» que media industria deja en
 * cero— y el sidecar `.cpg` es opcional. Aquí NO se falla: se usa
 * windows-1252, que es lo que escriben ArcGIS y QGIS en México, y se DECLARA en
 * el resultado que fue una suposición. La razón para tratarla distinto es que
 * una codificación equivocada produce un daño VISIBLE («Peña» sale «PeÃ±a») y
 * no toca ni un número; una geometría mal leída produce daño invisible. Fallar
 * cerrado se reserva para lo segundo.
 *
 * Fuente del formato: especificación dBASE III PLUS / dBASE IV, tal y como la
 * fija el «ESRI Shapefile Technical Description» (J-7855, 1998) al describir el
 * archivo dBASE que acompaña al shapefile.
 */
import { geoAssert } from "./errors";

/** Cabecera fija antes de los descriptores de campo. */
const DBF_HEADER_BYTES = 32;
/** Cada descriptor de campo ocupa 32 bytes. */
const DBF_FIELD_BYTES = 32;
/** Byte que cierra la lista de descriptores. */
const DBF_FIELD_TERMINATOR = 0x0d;
/** Marca de registro borrado (asterisco). Los vivos llevan un espacio. */
const DBF_DELETED = 0x2a;

/**
 * Versiones aceptadas.
 *
 * 0x03 es dBASE III+ sin campos memo, que es lo que escribe absolutamente todo
 * el mundo del shapefile. 0x30 es Visual FoxPro, que algún exportador antiguo
 * todavía produce. Las demás se rechazan POR SU NOMBRE, no por descarte: saber
 * que el archivo tiene campos memo dice qué hacer (quitarlos en el origen).
 */
const DBF_ACCEPTED_VERSIONS = new Set([0x03, 0x30]);
const DBF_MEMO_VERSIONS: Readonly<Record<number, string>> = {
  0x83: "dBASE III PLUS con campos memo",
  0x8b: "dBASE IV con campos memo",
  0x8e: "dBASE IV con SQL",
  0xf5: "FoxPro 2.x con campos memo",
  0xfb: "FoxPro sin cabecera de memo",
};

export type GeoDbfFieldType = "C" | "N" | "F" | "L" | "D";
export type GeoDbfValue = string | number | boolean | null;

export interface GeoDbfField {
  name: string;
  type: GeoDbfFieldType;
  /** Longitud en bytes del campo dentro del registro. */
  length: number;
  /** Decimales declarados. Sólo significa algo en N y F. */
  decimals: number;
}

export interface GeoDbfTable {
  fields: GeoDbfField[];
  /** Un objeto por registro VIVO, en el orden del archivo. */
  records: Array<Record<string, GeoDbfValue>>;
  /** Registros que el archivo declara, borrados incluidos. */
  declaredRecordCount: number;
  /** Registros marcados como borrados y por tanto omitidos. */
  deletedCount: number;
  /** Codificación con la que se decodificó el texto. */
  encoding: string;
  /** `false` si la codificación se supuso porque nadie la declaró. */
  encodingDeclared: boolean;
}

export interface GeoDbfInput {
  dbf: ArrayBuffer | Uint8Array;
  /** Contenido del `.cpg`, si el conjunto lo trae. Decide la codificación. */
  cpg?: string;
  /** Codificación explícita. Gana sobre el `.cpg`. */
  encoding?: string;
  name?: string;
}

/** Lo que se usa cuando nadie declara nada. Es lo que escriben ArcGIS y QGIS. */
export const GEO_DBF_DEFAULT_ENCODING = "windows-1252";

export function readDbf(input: GeoDbfInput): GeoDbfTable {
  const source = input.name ?? "(sin nombre)";
  const bytes =
    input.dbf instanceof Uint8Array ? input.dbf : new Uint8Array(input.dbf);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  geoAssert(
    bytes.byteLength >= DBF_HEADER_BYTES + 1,
    "archivo-truncado",
    `El .dbf tiene ${bytes.byteLength} bytes y no llega ni a la cabecera.`,
    { source, detail: { bytes: bytes.byteLength } },
  );

  const version = bytes[0];
  const memo = DBF_MEMO_VERSIONS[version];
  geoAssert(
    memo === undefined,
    "variante-no-soportada",
    `El .dbf es de tipo ${memo} (byte 0x${version.toString(16)}). Los campos memo viven en un ` +
      "archivo aparte que este producto no lee; exporta la tabla sin ellos.",
    { source, detail: { version } },
  );
  geoAssert(
    DBF_ACCEPTED_VERSIONS.has(version),
    "variante-no-soportada",
    `Versión de .dbf desconocida: 0x${version.toString(16)}.`,
    { source, detail: { version } },
  );

  const declaredRecordCount = view.getUint32(4, true);
  const headerBytes = view.getUint16(8, true);
  const recordBytes = view.getUint16(10, true);

  // La cabecera son 32 bytes + 32 por campo + el terminador. Si el número no
  // encaja en esa cuenta, los descriptores que se leerían no serían descriptores.
  const fieldCount = (headerBytes - DBF_HEADER_BYTES - 1) / DBF_FIELD_BYTES;
  geoAssert(
    Number.isInteger(fieldCount) && fieldCount > 0 && headerBytes <= bytes.byteLength,
    "longitud-incoherente",
    `La cabecera declara ${headerBytes} bytes, que no corresponden a un número entero de campos.`,
    { source, detail: { headerBytes } },
  );
  geoAssert(
    bytes[headerBytes - 1] === DBF_FIELD_TERMINATOR,
    "longitud-incoherente",
    `La lista de campos no acaba con el terminador 0x0D en el byte ${headerBytes - 1}.`,
    { source, detail: { headerBytes } },
  );

  const decoder = new TextDecoder(
    input.encoding ?? cpgToEncoding(input.cpg) ?? GEO_DBF_DEFAULT_ENCODING,
  );
  const ascii = new TextDecoder("ascii");

  const fields: GeoDbfField[] = [];
  let recordSum = 1; // el byte de la marca de borrado
  for (let index = 0; index < fieldCount; index += 1) {
    const at = DBF_HEADER_BYTES + index * DBF_FIELD_BYTES;
    const name = ascii.decode(bytes.subarray(at, at + 11)).replace(/\0.*$/, "").trim();
    const type = String.fromCharCode(bytes[at + 11]) as GeoDbfFieldType;
    const length = bytes[at + 16];
    const decimals = bytes[at + 17];
    geoAssert(
      name.length > 0,
      "longitud-incoherente",
      `El campo ${index + 1} del .dbf no tiene nombre.`,
      { source, detail: { field: index + 1 } },
    );
    geoAssert(
      type === "C" || type === "N" || type === "F" || type === "L" || type === "D",
      "variante-no-soportada",
      `El campo «${name}» es de tipo ${type}, que este producto no sabe leer. Los tipos ` +
        "soportados son texto (C), número (N y F), lógico (L) y fecha (D).",
      { source, detail: { field: name, type } },
    );
    geoAssert(
      length > 0,
      "longitud-incoherente",
      `El campo «${name}» declara longitud cero.`,
      { source, detail: { field: name } },
    );
    fields.push({ name, type, length, decimals });
    recordSum += length;
  }

  geoAssert(
    recordSum === recordBytes,
    "longitud-incoherente",
    `Los campos suman ${recordSum} bytes por registro y la cabecera declara ${recordBytes}.`,
    { source, detail: { recordSum, recordBytes } },
  );

  const dataBytes = declaredRecordCount * recordBytes;
  const trailing = bytes.byteLength - headerBytes - dataBytes;
  geoAssert(
    trailing >= 0,
    "archivo-truncado",
    `El .dbf declara ${declaredRecordCount} registros de ${recordBytes} bytes y el archivo se ` +
      `queda ${-trailing} bytes corto.`,
    { source, detail: { declaredRecordCount, recordBytes, trailing } },
  );
  // Al final puede ir el byte 0x1A que cierra el archivo, y nada más. Cualquier
  // otra cosa significa que las cuentas del archivo no describen el archivo.
  geoAssert(
    trailing === 0 || (trailing === 1 && bytes[bytes.byteLength - 1] === 0x1a),
    "longitud-incoherente",
    `Sobran ${trailing} bytes al final del .dbf.`,
    { source, detail: { trailing } },
  );

  const records: Array<Record<string, GeoDbfValue>> = [];
  let deletedCount = 0;
  for (let index = 0; index < declaredRecordCount; index += 1) {
    const at = headerBytes + index * recordBytes;
    if (bytes[at] === DBF_DELETED) {
      deletedCount += 1;
      continue;
    }
    const record: Record<string, GeoDbfValue> = {};
    let cursor = at + 1;
    for (const field of fields) {
      const raw = decoder.decode(bytes.subarray(cursor, cursor + field.length));
      record[field.name] = decodeValue(raw, field, index + 1, source);
      cursor += field.length;
    }
    records.push(record);
  }

  return {
    fields,
    records,
    declaredRecordCount,
    deletedCount,
    encoding: decoder.encoding,
    encodingDeclared: input.encoding !== undefined || cpgToEncoding(input.cpg) !== undefined,
  };
}

/**
 * Convierte el texto crudo de un campo a su tipo.
 *
 * Todo va en ASCII con relleno: los números están alineados a la derecha, los
 * textos a la izquierda. Un campo en blanco es NULO —no cero, no cadena vacía—,
 * porque en catastro «superficie desconocida» y «superficie cero» son cosas muy
 * distintas y confundirlas se propaga a cualquier suma que se haga después.
 */
function decodeValue(
  raw: string,
  field: GeoDbfField,
  recordNumber: number,
  source: string,
): GeoDbfValue {
  const text = raw.trim();
  if (field.type === "C") return raw.replace(/\s+$/, "");
  if (text === "" || /^\*+$/.test(text)) return null;

  if (field.type === "N" || field.type === "F") {
    const value = Number(text);
    geoAssert(
      Number.isFinite(value),
      "atributo-ilegible",
      `El campo numérico «${field.name}» del registro ${recordNumber} contiene «${text}».`,
      { source, detail: { field: field.name, record: recordNumber, raw: text } },
    );
    return value;
  }
  if (field.type === "L") {
    if (/^[TtYy]$/.test(text)) return true;
    if (/^[FfNn]$/.test(text)) return false;
    if (text === "?") return null;
    geoAssert(
      false,
      "atributo-ilegible",
      `El campo lógico «${field.name}» del registro ${recordNumber} contiene «${text}».`,
      { source, detail: { field: field.name, record: recordNumber, raw: text } },
    );
  }
  // Tipo D: ocho dígitos AAAAMMDD. Se devuelve como AAAA-MM-DD para que quien
  // la muestre no tenga que volver a adivinar el orden de los componentes.
  geoAssert(
    /^\d{8}$/.test(text),
    "atributo-ilegible",
    `El campo fecha «${field.name}» del registro ${recordNumber} contiene «${text}» y se esperaba ` +
      "AAAAMMDD.",
    { source, detail: { field: field.name, record: recordNumber, raw: text } },
  );
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

/**
 * Traduce el contenido de un `.cpg` a una etiqueta que `TextDecoder` entienda.
 *
 * El archivo trae cosas como `UTF-8`, `ISO-8859-1` o `LATIN1`, y también
 * números de página de códigos sueltos. Lo que no se reconozca devuelve
 * `undefined` y se cae en el valor por omisión: aquí no se falla, porque una
 * codificación desconocida no puede mover un lindero.
 */
function cpgToEncoding(cpg: string | undefined): string | undefined {
  if (!cpg) return undefined;
  const text = cpg.trim().toUpperCase();
  if (/^(UTF-?8|65001)$/.test(text)) return "utf-8";
  if (/^(ISO-?8859-?1|LATIN\s?1|8859)$/.test(text)) return "iso-8859-1";
  if (/^(WINDOWS-?1252|CP-?1252|ANSI|1252)$/.test(text)) return "windows-1252";
  return undefined;
}
