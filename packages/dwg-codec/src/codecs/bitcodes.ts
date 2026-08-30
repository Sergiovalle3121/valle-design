/**
 * Códigos de bits del cuerpo de datos DWG.
 *
 * Todo lo que un archivo DWG guarda dentro de sus secciones viaja en un flujo
 * de BITS, no de bytes: un entero puede ocupar dos bits si vale cero y
 * dieciocho si no, y un double puede ser un solo par de bits cuando vale 0.0
 * o 1.0. Este módulo implementa esos códigos como lecturas puras sobre el
 * `BitCursor` acotado del laboratorio, con las mismas tres reglas de todo el
 * paquete:
 *
 * - **Fallo cerrado**: una bandera reservada, un contador imposible o un flujo
 *   truncado lanzan un `DwgParseError` tipado; jamás se devuelve un valor a
 *   medias ni se adivina.
 * - **Presupuesto cobrado**: cada bit leído pasa por el cursor acotado, que
 *   cobra al `ResourceBudget`; no existe camino de lectura que no pague.
 * - **Sin dependencias**: TypeScript original desde los hechos registrados en
 *   `SOURCE_REGISTER.json` (ODA-ODS-DWG-5.4.1-PUBLIC). Ninguna implementación
 *   externa se consultó ni se tradujo (CLEAN_ROOM_POLICY).
 *
 * El flujo DWG lee los bits del más significativo al menos significativo
 * dentro de cada byte; los tipos crudos multibyte (RS/RL/RD) se componen en
 * orden little-endian de bytes, y los bytes del contador de un handle en
 * big-endian. Esa asimetría es del formato, no nuestra.
 */
import { BitCursor } from "../binary/bit-cursor.js";
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { throwDwgError } from "../security/parse-error.js";

/** Referencia de handle tal como viene en el flujo: código + valor crudo. */
export interface DwgHandleReference {
  /** Código de 4 bits (0x0–0xC observables); su semántica la da el consumidor. */
  readonly code: number;
  /** Bytes del contador, ya compuestos big-endian. Cero cuando el contador es 0. */
  readonly value: number;
  /** Cuántos bytes ocupó el valor; útil para diagnósticos y límites. */
  readonly byteLength: number;
}

/** Resultado de una cadena TV: bytes crudos, sin fingir una decodificación. */
export interface DwgTextValue {
  /** Longitud declarada por el BS previo. */
  readonly declaredLength: number;
  /** Bytes exactos del flujo. La página de códigos la decide una capa superior. */
  readonly bytes: Uint8Array;
}

/** Color CmC en su forma R2000: un índice BS. Las formas 2004+ vendrán después. */
export interface DwgColorReference {
  readonly index: number;
}

/** Extrusión BE: el caso común (0,0,1) viaja en un solo bit. */
export interface DwgExtrusion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const FLOAT_SCRATCH = new DataView(new ArrayBuffer(8));

/** Tope de bytes de un entero modular: más de 8 no cabe en ningún campo real. */
const MODULAR_CHAR_MAX_BYTES = 8;
/** Tope de palabras de un modular short: dos palabras cubren 30 bits. */
const MODULAR_SHORT_MAX_WORDS = 2;
/** Tope de bytes del contador de un handle que cabe en un entero seguro. */
const HANDLE_MAX_COUNTER_BYTES = 7;

/**
 * Lector de códigos de bits sobre un flujo DWG.
 *
 * Se construye desde el cursor de BYTES acotado —no desde un `BitCursor`
 * suelto— para que el orden de bits (el del formato: primero el más
 * significativo) quede fijado aquí y no pueda elegirse mal en cada sitio.
 */
export class DwgBitReader {
  readonly #bits: BitCursor;

  constructor(bytes: BoundedByteCursor) {
    if (!(bytes instanceof BoundedByteCursor)) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A DWG bit reader requires a bounded byte cursor.",
      );
    }
    this.#bits = new BitCursor(bytes, "most-significant-first");
  }

  /** Posición en BITS desde el arranque del cursor de bytes. */
  get bitPosition(): number {
    return this.#bits.position;
  }

  get bitsRemaining(): number {
    return this.#bits.remaining;
  }

  #byteOffset(): number {
    return Math.floor(this.#bits.position / 8);
  }

  #corrupt(message: string): never {
    throwDwgError("DWG_STRUCTURE_CORRUPT", "input", this.#byteOffset(), message);
  }

  /** B: un bit. */
  readB(): 0 | 1 {
    this.#ensureBits(1, "a B bit");
    return this.#bits.readBit();
  }

  /** BB: dos bits, primero el más significativo. */
  readBB(): number {
    this.#ensureBits(2, "a BB pair");
    return this.#bits.readBits(2);
  }

  /** 3B: tres bits crudos. */
  read3B(): number {
    this.#ensureBits(3, "a 3B triplet");
    return this.#bits.readBits(3);
  }

  /** RC: un byte crudo dentro del flujo de bits (no exige alineación). */
  readRC(): number {
    this.#ensureBits(8, "an RC byte");
    return this.#bits.readBits(8);
  }

  /** RS: short crudo de 16 bits, bytes en little-endian. */
  readRS(): number {
    const low = this.readRC();
    const high = this.readRC();
    return low + high * 0x100;
  }

  /** RL: long crudo de 32 bits, bytes en little-endian. */
  readRL(): number {
    const low = this.readRS();
    const high = this.readRS();
    return low + high * 0x1_0000;
  }

  /** RD: double IEEE-754 de 8 bytes, little-endian. */
  readRD(): number {
    for (let index = 0; index < 8; index += 1) {
      FLOAT_SCRATCH.setUint8(index, this.readRC());
    }
    return FLOAT_SCRATCH.getFloat64(0, true);
  }

  /**
   * BS: la bandera de dos bits elige entre un RS literal (00), un byte (01),
   * el cero (10) y el valor 256 (11) — ese último caso existe porque 256 es
   * frecuente en los dibujos reales y el formato le dio su propio atajo.
   */
  readBS(): number {
    const flag = this.readBB();
    if (flag === 0) return this.readRS();
    if (flag === 1) return this.readRC();
    if (flag === 2) return 0;
    return 256;
  }

  /** BL: como BS pero de 32 bits; la bandera 11 no existe y es corrupción. */
  readBL(): number {
    const flag = this.readBB();
    if (flag === 0) return this.readRL();
    if (flag === 1) return this.readRC();
    if (flag === 2) return 0;
    this.#corrupt("A BL flag of 0b11 is not defined by the format.");
  }

  /** BD: 00 → RD literal; 01 → 1.0; 10 → 0.0; 11 no existe. */
  readBD(): number {
    const flag = this.readBB();
    if (flag === 0) return this.readRD();
    if (flag === 1) return 1;
    if (flag === 2) return 0;
    this.#corrupt("A BD flag of 0b11 is not defined by the format.");
  }

  /** 2BD: par (x, y). */
  read2BD(): { x: number; y: number } {
    const x = this.readBD();
    const y = this.readBD();
    return { x, y };
  }

  /** 3BD: trío (x, y, z). */
  read3BD(): { x: number; y: number; z: number } {
    const x = this.readBD();
    const y = this.readBD();
    const z = this.readBD();
    return { x, y, z };
  }

  /**
   * DD: double contra un valor por defecto. 00 devuelve el defecto intacto;
   * 01 parchea los 4 bytes BAJOS de su representación little-endian; 10
   * parchea 6; 11 trae el RD completo.
   *
   * En la forma 10 el ORDEN no es secuencial: los 2 primeros bytes del flujo
   * van a las posiciones 4-5 y los 4 siguientes a las posiciones 0-3 (ODS
   * §2.2). Lo confirmó el corpus real, no solo la especificación: en
   * 19-dim-radial-diameter.dwg (bundle entity-wave-2-ac1015) las dos únicas
   * DD 0b10 del corpus producen con este orden líneas de flecha de longitud
   * EXACTA 3.0 (141−138 y 71.578…−68.578…, misma cola de mantisa), y con el
   * orden secuencial que había antes producían 2.0000000012 y 0.83… — basura
   * flotante silenciosa. Ver VALLE-CORPUS-INTAKE-A60EBE2 en
   * SOURCE_REGISTER.json. El writer sólo emite 00/11, así que ningún
   * round-trip propio ejercitaba este camino: por eso el test de esta función
   * usa bytes del corpus, no la aritmética de la implementación.
   */
  readDD(defaultValue: number): number {
    const flag = this.readBB();
    if (flag === 0) return defaultValue;
    if (flag === 3) return this.readRD();
    FLOAT_SCRATCH.setFloat64(0, defaultValue, true);
    if (flag === 1) {
      for (let index = 0; index < 4; index += 1) {
        FLOAT_SCRATCH.setUint8(index, this.readRC());
      }
    } else {
      FLOAT_SCRATCH.setUint8(4, this.readRC());
      FLOAT_SCRATCH.setUint8(5, this.readRC());
      for (let index = 0; index < 4; index += 1) {
        FLOAT_SCRATCH.setUint8(index, this.readRC());
      }
    }
    return FLOAT_SCRATCH.getFloat64(0, true);
  }

  /** BT (R2000+): un bit a 1 significa grosor cero; a 0 le sigue un BD. */
  readBT(): number {
    return this.readB() === 1 ? 0 : this.readBD();
  }

  /** BE (R2000+): un bit a 1 significa extrusión (0,0,1); a 0 le sigue 3BD. */
  readBE(): DwgExtrusion {
    if (this.readB() === 1) return { x: 0, y: 0, z: 1 };
    return this.read3BD();
  }

  /**
   * Modular char sin signo: bytes de 7 bits útiles con bit alto de
   * continuación; el primer byte aporta los 7 bits MENOS significativos.
   */
  readUnsignedMC(): number {
    let value = 0;
    let factor = 1;
    for (let index = 0; index < MODULAR_CHAR_MAX_BYTES; index += 1) {
      const byte = this.readRC();
      value += (byte & 0x7f) * factor;
      if (value > Number.MAX_SAFE_INTEGER) {
        this.#corrupt("A modular char exceeds the safe integer range.");
      }
      if ((byte & 0x80) === 0) return value;
      factor *= 0x80;
    }
    this.#corrupt("A modular char does not terminate within eight bytes.");
  }

  /**
   * Modular char con signo: como el anterior, pero en el ÚLTIMO byte el bit
   * 0x40 es el signo y no aporta magnitud.
   */
  readSignedMC(): number {
    let value = 0;
    let factor = 1;
    for (let index = 0; index < MODULAR_CHAR_MAX_BYTES; index += 1) {
      const byte = this.readRC();
      if ((byte & 0x80) !== 0) {
        value += (byte & 0x7f) * factor;
        if (value > Number.MAX_SAFE_INTEGER) {
          this.#corrupt("A modular char exceeds the safe integer range.");
        }
        factor *= 0x80;
        continue;
      }
      const negative = (byte & 0x40) !== 0;
      value += (byte & 0x3f) * factor;
      if (value > Number.MAX_SAFE_INTEGER) {
        this.#corrupt("A modular char exceeds the safe integer range.");
      }
      return negative ? -value : value;
    }
    this.#corrupt("A modular char does not terminate within eight bytes.");
  }

  /**
   * Modular short: palabras de 16 bits little-endian cuyos 15 bits bajos
   * aportan magnitud; el bit alto de la palabra marca continuación. La
   * primera palabra aporta los bits menos significativos.
   */
  readMS(): number {
    let value = 0;
    let factor = 1;
    for (let index = 0; index < MODULAR_SHORT_MAX_WORDS; index += 1) {
      const word = this.readRS();
      value += (word & 0x7fff) * factor;
      if (value > Number.MAX_SAFE_INTEGER) {
        this.#corrupt("A modular short exceeds the safe integer range.");
      }
      if ((word & 0x8000) === 0) return value;
      factor *= 0x8000;
    }
    this.#corrupt("A modular short does not terminate within two words.");
  }

  /**
   * H: código de 4 bits + contador de 4 bits + bytes del valor en big-endian.
   * Aquí sólo se DESCODIFICA; resolver una referencia relativa contra su
   * handle base es una operación pura aparte (`resolveDwgHandleReference`).
   */
  readH(): DwgHandleReference {
    this.#ensureBits(8, "a handle header");
    const code = this.#bits.readBits(4);
    const counter = this.#bits.readBits(4);
    if (counter > HANDLE_MAX_COUNTER_BYTES) {
      this.#corrupt(
        "A handle counter above seven bytes exceeds the safe integer range.",
      );
    }
    let value = 0;
    for (let index = 0; index < counter; index += 1) {
      value = value * 0x100 + this.readRC();
    }
    return Object.freeze({ code, value, byteLength: counter });
  }

  /**
   * TV: longitud BS seguida de esa cantidad de bytes en la página de códigos
   * del dibujo. Se devuelven los BYTES: decidir una decodificación aquí sería
   * fingir una fidelidad de texto que esta capa no puede prometer.
   */
  readTV(): DwgTextValue {
    const declaredLength = this.readBS();
    if (declaredLength < 0) {
      this.#corrupt("A text length cannot be negative.");
    }
    if (declaredLength * 8 > this.#bits.remaining) {
      this.#corrupt("A text value extends outside the input.");
    }
    const bytes = new Uint8Array(declaredLength);
    for (let index = 0; index < declaredLength; index += 1) {
      bytes[index] = this.readRC();
    }
    return Object.freeze({ declaredLength, bytes });
  }

  /** CmC en su forma R2000: un índice BS. */
  readCmC(): DwgColorReference {
    return Object.freeze({ index: this.readBS() });
  }

  #ensureBits(bitCount: number, what: string): void {
    if (bitCount > this.#bits.remaining) {
      this.#corrupt(`Reading ${what} extends outside the input.`);
    }
  }
}

/** Códigos de handle observables y su relación con el handle base. */
export type DwgHandleKind = "null" | "absolute" | "relative";

export interface DwgResolvedHandle {
  readonly kind: DwgHandleKind;
  readonly handle: number;
}

/**
 * Resuelve una referencia de handle contra su handle BASE (normalmente el del
 * objeto que la contiene): 2–5 son absolutas, 6 es base+1, 8 es base−1, 0xA
 * suma el valor y 0xC lo resta. El código 0 con contador vacío es la
 * referencia nula. Cualquier otro código, o una resta que cruza el cero, es
 * corrupción y falla cerrado.
 */
export function resolveDwgHandleReference(
  reference: DwgHandleReference,
  baseHandle: number,
): DwgResolvedHandle {
  const { code, value } = reference;
  if (code === 0 && reference.byteLength === 0) {
    return Object.freeze({ kind: "null" as const, handle: 0 });
  }
  if (code >= 0x2 && code <= 0x5) {
    return Object.freeze({ kind: "absolute" as const, handle: value });
  }
  if (!Number.isSafeInteger(baseHandle) || baseHandle < 0) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A relative handle needs a non-negative safe base handle.",
    );
  }
  if (code === 0x6) {
    return Object.freeze({ kind: "relative" as const, handle: baseHandle + 1 });
  }
  if (code === 0x8) {
    if (baseHandle < 1) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        0,
        "A handle reference below zero is not representable.",
      );
    }
    return Object.freeze({ kind: "relative" as const, handle: baseHandle - 1 });
  }
  if (code === 0xa) {
    const handle = baseHandle + value;
    if (!Number.isSafeInteger(handle)) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        0,
        "A handle reference exceeds the safe integer range.",
      );
    }
    return Object.freeze({ kind: "relative" as const, handle });
  }
  if (code === 0xc) {
    const handle = baseHandle - value;
    if (handle < 0) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        0,
        "A handle reference below zero is not representable.",
      );
    }
    return Object.freeze({ kind: "relative" as const, handle });
  }
  throwDwgError(
    "DWG_STRUCTURE_CORRUPT",
    "input",
    0,
    "An unknown handle reference code cannot be resolved.",
  );
}
