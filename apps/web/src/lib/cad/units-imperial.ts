/**
 * Pies y pulgadas: la mitad de ENTRADA de las unidades imperiales (F4, 2026-09-04).
 *
 * `unit-format.ts` ya sabía ESCRIBIR `1'-6 1/2"` desde hace tiempo. Lo que no
 * existía —medido con sonda el 2026-09-04 y anotado en la bitácora del frente—
 * era leerlo: `parseCoordinate` de `precision-input.ts` convierte con
 * `Number(s)`, y `Number("1'-6 1/2\"")` es `NaN`. Las seis formas que un
 * dibujante teclea sin pensar (`1'-6 1/2"`, `12'`, `6"`, `6 1/2`, `1'6`,
 * `@1'-0",0`) devolvían todas `{ok:false}`. Un CAD que escribe en pulgadas y no
 * las acepta al teclado no sirve en Estados Unidos, por muy correcto que sea su
 * formateador.
 *
 * Este módulo es puro: sin editor, sin documento, sin React. Dos capas, y la
 * frontera entre ellas es la decisión más importante del archivo:
 *
 *  1. `parseImperialLength` devuelve **PULGADAS**, siempre. Es la gramática.
 *  2. `parseCadLengthInDrawingUnits` devuelve **UNIDADES DE DIBUJO**, y para eso
 *     necesita saber en qué unidad está el documento.
 *
 * **La marca manda.** `6"` son seis pulgadas se teclee donde se teclee; `6` a
 * secas son seis unidades de dibujo. No se adivina por el tamaño del número ni
 * por la pinta del dibujo: un `6` interpretado como pulgada en un plano en
 * milímetros mete un error de 152.4 mm que nadie ve hasta que la pieza no entra.
 * La única forma de que un número desnudo signifique pulgadas es que el DIBUJO
 * lo diga —`LUNITS` 3 o 4, que es como AutoCAD se comporta con unidades
 * arquitectónicas—, y eso viaja explícito en `assumeInches`.
 *
 * Correr:  npx tsx src/lib/cad/units-imperial.spec.ts
 */

/** Unidades en las que un dibujo puede tener sus coordenadas. */
export type CadDrawingUnit = "mm" | "cm" | "m" | "in" | "ft";

/**
 * Milímetros por unidad. La pulgada son 25.4 mm EXACTOS por definición
 * internacional desde 1959; no es una aproximación que se pueda afinar.
 *
 * El pie se escribe `304.8` y NO `CAD_INCH_MM * 12`, que es lo que pedía el
 * dedo: en coma flotante binaria ese producto da 304.79999999999995, y una
 * tabla de factores con error en el último bit contamina todas las conversiones
 * que pasan por ella. Los dos números son exactos en decimal y ninguno se
 * deduce del otro.
 */
export const CAD_INCH_MM = 25.4;
export const CAD_FOOT_MM = 304.8;

export const CAD_DRAWING_UNIT_TO_MM: Readonly<Record<CadDrawingUnit, number>> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: CAD_INCH_MM,
  ft: CAD_FOOT_MM,
};

/**
 * `$INSUNITS` del DXF → unidad del dibujo.
 *
 * La tabla del DXF tiene veinte valores (millas, angstroms, años luz); aquí
 * viven los cinco que el producto sabe dibujar. Un código fuera de la lista
 * devuelve `null` y NO se sustituye por milímetros en silencio: quien pregunta
 * merece saber que el fichero declaró una unidad que no entendemos, para poder
 * avisar en vez de escalar mal el plano.
 */
export const CAD_DRAWING_UNIT_BY_INSUNITS: Readonly<Record<number, CadDrawingUnit>> = {
  1: "in",
  2: "ft",
  4: "mm",
  5: "cm",
  6: "m",
};

/** Unidad del dibujo → `$INSUNITS`. El 0 («sin unidad») no se emite nunca. */
export const CAD_INSUNITS_BY_DRAWING_UNIT: Readonly<Record<CadDrawingUnit, number>> = {
  in: 1,
  ft: 2,
  mm: 4,
  cm: 5,
  m: 6,
};

export function cadDrawingUnitFromInsunits(code: number): CadDrawingUnit | null {
  return CAD_DRAWING_UNIT_BY_INSUNITS[Math.trunc(code)] ?? null;
}

/** Convierte una longitud entre dos unidades de dibujo, pasando por mm. */
export function convertCadLength(
  value: number,
  from: CadDrawingUnit,
  to: CadDrawingUnit,
): number {
  if (from === to) return value;
  return (value * CAD_DRAWING_UNIT_TO_MM[from]) / CAD_DRAWING_UNIT_TO_MM[to];
}

/** Pulgadas → unidades de dibujo. `126"` en un plano en mm son 3200.4. */
export function inchesToDrawingUnits(inches: number, unit: CadDrawingUnit): number {
  return convertCadLength(inches, "in", unit);
}

/** Unidades de dibujo → pulgadas. Lo que el rótulo arquitectónico necesita. */
export function drawingUnitsToInches(value: number, unit: CadDrawingUnit): number {
  return convertCadLength(value, unit, "in");
}

/* ── La gramática ─────────────────────────────────────────────────────────── */

export type CadImperialParse =
  | {
      ok: true;
      /** El valor, SIEMPRE en pulgadas. */
      inches: number;
      /**
       * Si el texto traía marca de pie o de pulgada. Es lo que distingue `6"`
       * (seis pulgadas, dígalo quien lo diga) de `6` (seis unidades de lo que
       * sea que el dibujo mida).
       */
      explicit: boolean;
    }
  | { ok: false; error: string };

/**
 * Comillas tipográficas → comillas rectas.
 *
 * Un iPad, un Mac con sustitución automática o un texto pegado desde Word
 * convierten `6"` en `6”` sin avisar y sin que el usuario pueda verlo. AutoCAD
 * rechaza esas formas; nosotros las aceptamos porque el fallo que producen es
 * invisible: el dibujante ve lo que tecleó y no entiende el error. No introduce
 * ninguna ambigüedad — ni `’` ni `”` significan otra cosa en una longitud.
 */
const SMART_FEET_MARKS = /[‘’ʼ′]/g;
const SMART_INCH_MARKS = /[“”″]/g;

/** Un decimal sin signo: `6`, `6.5`, `.5`. El signo se lee aparte. */
const DECIMAL = /^\d*\.?\d+$/;
/** Una fracción de enteros: `1/2`, `3/2` (impropia, y legal). */
const FRACTION = /^(\d+)\s*\/\s*(\d+)$/;

function normalizeImperialText(raw: string): string {
  return raw
    .replace(SMART_FEET_MARKS, "'")
    .replace(SMART_INCH_MARKS, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function countOf(text: string, mark: string): number {
  let total = 0;
  for (const character of text) if (character === mark) total += 1;
  return total;
}

/**
 * ¿Este texto se lee como una longitud imperial?
 *
 * Lo usa quien tenga que decidir si conserva los espacios antes de analizar:
 * `1'-6 1/2"` sin el espacio es `1'-61/2"`, que TAMBIÉN se lee (una fracción
 * impropia: 61/2 = 30.5 pulgadas) y da 42.5 en vez de 18.5. Un número
 * silenciosamente equivocado es peor que un rechazo.
 */
export function cadTextLooksImperial(raw: string): boolean {
  const text = normalizeImperialText(raw);
  return text.includes("'") || text.includes('"') || text.includes("/");
}

/**
 * Analiza una longitud imperial y devuelve PULGADAS.
 *
 * Formas admitidas (las dieciocho de la tabla de la spec):
 *   `1'-6 1/2"`  `1'6"`  `1'-6"`  `1'-6 1/2`  `12'`  `1'`  `1.5'`
 *   `6"`  `6 1/2"`  `6 1/2`  `1/2"`  `1/2`  `1'-6.5"`  `6.5`  `.5`
 *   `-1'-6"`  `-6 1/2`  `18.5`
 *
 * Y se niega, con motivo, ante lo ambiguo: `1'2'` (dos marcas de pie),
 * `6"2`, `1/0`, `1 2 3`, `1 1/2'`.
 */
export function parseImperialLength(raw: string): CadImperialParse {
  const text = normalizeImperialText(raw);
  if (text === "") return { ok: false, error: "Vacío" };

  // El signo se lee UNA vez y por delante. Después del primer número, un `-`
  // ya no es un signo: es el separador de `1'-6"`, y confundirlos daría
  // `1'-6"` = 6 pulgadas menos un pie.
  let sign = 1;
  let body = text;
  if (body.startsWith("-") || body.startsWith("+")) {
    sign = body.startsWith("-") ? -1 : 1;
    body = body.slice(1).trim();
  }
  if (body === "") return { ok: false, error: "Falta el número después del signo" };

  const feetMarks = countOf(body, "'");
  const inchMarks = countOf(body, '"');
  if (feetMarks > 1)
    return {
      ok: false,
      error: `«${text}» tiene dos marcas de pie y no se puede leer: escribe 1'-6" o 1'6"`,
    };
  if (inchMarks > 1)
    return {
      ok: false,
      error: `«${text}» tiene dos marcas de pulgada y no se puede leer`,
    };
  if (feetMarks === 1 && inchMarks === 1 && body.indexOf('"') < body.indexOf("'"))
    return {
      ok: false,
      error: `«${text}»: la marca de pulgada va después de la de pie, no antes`,
    };
  if (inchMarks === 1 && !body.endsWith('"'))
    return {
      ok: false,
      error: `«${text}»: la marca de pulgada tiene que cerrar la medida`,
    };

  // El decimal de siempre, ANTES de la gramática imperial: así `1e3`, `+5` y
  // `0x10` siguen valiendo exactamente lo que valían con `Number()`, y esta
  // función es un superconjunto del analizador que sustituye en vez de un
  // cambio de comportamiento disfrazado de mejora.
  if (feetMarks === 0 && inchMarks === 0 && !body.includes("/")) {
    const plain = Number(body);
    if (Number.isFinite(plain)) return { ok: true, inches: sign * plain, explicit: false };
  }

  if (inchMarks === 1) body = body.slice(0, -1).trim();

  let feet = 0;
  let rest = body;
  if (feetMarks === 1) {
    const at = body.indexOf("'");
    const head = body.slice(0, at).trim();
    rest = body.slice(at + 1).trim();
    if (head === "")
      return { ok: false, error: `«${text}»: falta el número de pies antes de la comilla` };
    if (!DECIMAL.test(head))
      return {
        ok: false,
        // Cubre `1 1/2'`: los pies fraccionarios no se escriben así en ningún
        // plano, y aceptarlos haría ambiguo el `1 1/2` de las pulgadas.
        error: `«${head}» no es un número de pies: escribe 1' o 1.5', no una fracción`,
      };
    feet = Number(head);
    // El guion entre pies y pulgadas es un SEPARADOR y es opcional: `1'-6"` y
    // `1'6"` son la misma medida, y las dos se teclean.
    if (rest.startsWith("-")) rest = rest.slice(1).trim();
  }

  let inches = 0;
  if (rest !== "") {
    const parts = rest.split(/[\s-]+/).filter((part) => part !== "");
    if (parts.length > 2)
      return { ok: false, error: `«${text}» tiene demasiados números para una longitud` };
    if (parts.length === 2) {
      if (!/^\d+$/.test(parts[0]))
        return {
          ok: false,
          error: `«${parts[0]} ${parts[1]}»: delante de la fracción va un entero de pulgadas`,
        };
      const fraction = readFraction(parts[1], text);
      if (typeof fraction !== "number") return fraction;
      inches = Number(parts[0]) + fraction;
    } else {
      const only = parts[0];
      if (only.includes("/")) {
        const fraction = readFraction(only, text);
        if (typeof fraction !== "number") return fraction;
        inches = fraction;
      } else if (DECIMAL.test(only)) {
        inches = Number(only);
      } else {
        return { ok: false, error: `«${only}» no es una medida en pulgadas` };
      }
    }
  } else if (feetMarks === 0) {
    return { ok: false, error: `«${text}» no se pudo interpretar como longitud` };
  }

  return { ok: true, inches: sign * (feet * 12 + inches), explicit: feetMarks + inchMarks > 0 };
}

/** Lee `n/d` o devuelve el fallo con su motivo. */
function readFraction(token: string, whole: string): number | { ok: false; error: string } {
  const match = FRACTION.exec(token);
  if (!match) return { ok: false, error: `«${token}» no es una fracción de pulgada` };
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (denominator === 0)
    return { ok: false, error: `«${whole}»: el denominador de la fracción no puede ser cero` };
  return numerator / denominator;
}

/* ── La entrada del dibujo ────────────────────────────────────────────────── */

export interface CadLengthEntryOptions {
  /** La unidad en la que están las coordenadas del documento. Por defecto mm. */
  drawingUnit?: CadDrawingUnit;
  /**
   * Si un número DESNUDO se lee en pulgadas.
   *
   * Es lo que hace AutoCAD cuando `LUNITS` está en arquitectónico o ingeniería:
   * con unidades arquitectónicas, `6` tecleado son seis pulgadas. Viaja
   * explícito y por defecto apagado porque el que llama es el único que sabe
   * qué dice la variable viva del dibujo.
   */
  assumeInches?: boolean;
}

export type CadLengthEntry =
  | {
      ok: true;
      /** El número que se guarda: en unidades de dibujo. */
      value: number;
      /** El mismo número en pulgadas, por si el que llama lo quiere rotular. */
      inches: number;
      /** Si el texto traía marca de pie o de pulgada. */
      explicit: boolean;
    }
  | { ok: false; error: string };

/**
 * Analiza lo que el dibujante teclea y devuelve UNIDADES DE DIBUJO.
 *
 * Es el punto donde «el número que entra es el número que se guarda»: `10'-6"`
 * en un plano en milímetros son 3200.4, no 126 ni 10.5. Sin esta conversión, la
 * gramática de arriba sólo serviría para dibujos cuya unidad ya fuera la
 * pulgada, que es la mitad del problema.
 */
export function parseCadLengthInDrawingUnits(
  raw: string,
  options: CadLengthEntryOptions = {},
): CadLengthEntry {
  const parsed = parseImperialLength(raw);
  if (!parsed.ok) return parsed;
  const unit = options.drawingUnit ?? "mm";
  const asInches = parsed.explicit || options.assumeInches === true;
  const value = asInches ? inchesToDrawingUnits(parsed.inches, unit) : parsed.inches;
  return {
    ok: true,
    value,
    inches: asInches ? parsed.inches : drawingUnitsToInches(parsed.inches, unit),
    explicit: parsed.explicit,
  };
}
