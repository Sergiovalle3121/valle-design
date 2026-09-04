/**
 * El ÚNICO sitio donde una longitud se vuelve texto (F4, 2026-09-04).
 *
 * Antes de este archivo había dos, y ninguno de los dos sabía lo suficiente:
 *
 * - `unit-format.ts` sabe escribir arquitectónico, ingeniería y fraccionario,
 *   pero no sabe nada del DOCUMENTO: interpreta su argumento en pulgadas
 *   siempre, como AutoCAD, así que un muro de 3200.4 en un dibujo en milímetros
 *   le sale «266'-8 3/8"» — el número correcto de una pregunta que nadie hizo.
 * - `dimension-format.ts` sabe de cotas y de conversión de unidad, pero su
 *   `LengthUnit` es `'mm' | 'cm' | 'm'`: en el rótulo de una cota no hay pie ni
 *   pulgada, y `LUNITS` no llega hasta ahí.
 *
 * El resultado medido era que el ajuste arquitectónico del dibujo se veía en
 * DIST y en LIST (que pasan por `inquiry/reports.ts`) y NO se veía en la cota,
 * que es donde el cliente lo lee. Dos formateadores que discrepan sobre el mismo
 * número es exactamente el defecto que la regla 4 de cimientos prohíbe.
 *
 * Aquí entra un valor **en unidades de dibujo** y sale el rótulo, con la unidad
 * del documento y las variables vivas (`LUNITS`, `LUPREC`, `INSUNITS`) como
 * únicos parámetros. Módulo puro.
 *
 * **La desviación deliberada respecto de AutoCAD.** AutoCAD asume que una
 * unidad de dibujo es una pulgada cuando `LUNITS` está en arquitectónico o
 * ingeniería, porque su documento no siempre declara su unidad. El nuestro sí
 * —`INSUNITS` es obligatorio en el DXF que emitimos—, así que aquí se convierte:
 * 3200.4 mm con `LUNITS 4` se rotulan `10'-6"`, que es la medida que el muro
 * tiene de verdad. Escribir `266'-8 3/8"` sería mentir en el vocabulario del
 * propio formato, porque la comilla ya declara «esto son pulgadas».
 *
 * El fraccionario NO se convierte, y eso también es deliberado: no lleva marca
 * de unidad, es sólo una manera de escribir un número, y en AutoCAD se aplica a
 * la unidad de dibujo tal cual. Convertirlo dejaría `3200 13/32` en un plano en
 * milímetros, que no significa nada para nadie.
 *
 * Correr:  npx tsx src/lib/cad/units-label.spec.ts
 */
import {
  UNIT_SYSTEM_BY_LUNITS,
  denominatorFromLuprec,
  type CadVariableAccess,
} from "./system-variables";
import { formatLength, type UnitSystem } from "./unit-format";
import {
  cadDrawingUnitFromInsunits,
  convertCadLength,
  drawingUnitsToInches,
  type CadDrawingUnit,
} from "./units-imperial";

export interface CadLengthLabelOptions {
  /** Unidad de las coordenadas del documento. Por defecto mm. */
  drawingUnit?: CadDrawingUnit;
  /**
   * Unidad en la que se quiere LEER el número, cuando el sistema la admite
   * (decimal, científico, fraccionario). Es la elección de la cota —«esta
   * planta se acota en metros»— y no cambia lo que el documento guarda.
   * Arquitectónico e ingeniería la ignoran: su unidad es la pulgada por
   * definición del formato.
   */
  labelUnit?: CadDrawingUnit;
  /** `LUNITS`: 1 científico, 2 decimal, 3 ingeniería, 4 arquitectónico, 5 fraccionario. */
  lunits?: number;
  /** `LUPREC`: decimales (decimal/ingeniería) o exponente del denominador. */
  luprec?: number;
  /** Añadir « mm», « m»… al final. Apagado por defecto, como en AutoCAD. */
  showUnitSuffix?: boolean;
  /** Sufijo literal, si el que llama quiere uno propio (gana sobre el anterior). */
  suffix?: string;
}

const DEFAULT_LUNITS = 2;
const DEFAULT_LUPREC = 4;

function clampPrecision(value: number): number {
  return Math.max(0, Math.min(8, Math.trunc(value)));
}

/**
 * El menos cero.
 *
 * `-0.4"` con `LUPREC 0` redondea a cero, y `unit-format.ts` escribe entonces
 * `-0'-0"` porque decide el signo ANTES de redondear (lo mismo hace `toFixed`,
 * que da «-0» para -0.4). Un menos delante de una medida nula no es una
 * longitud: es un artefacto del orden de las operaciones, y además rompe la ida
 * y vuelta, porque al releerlo y volver a escribirlo el signo desaparece.
 *
 * Se corrige tocando sólo eso: si la magnitud redondea a cero en la rejilla que
 * toca, el valor se sustituye por cero limpio; en cualquier otro caso el número
 * pasa intacto y quien redondea sigue siendo el formateador. La comprobación de
 * rango evita escalar un número enorme y perder dígitos por el camino.
 */
function withoutNegativeZero(value: number, step: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const scaled = Math.abs(value) * step;
  if (scaled < Number.MAX_SAFE_INTEGER && Math.round(scaled) === 0) return 0;
  return value;
}

/** Los dos sistemas cuyo texto lleva la unidad dentro: `1'-6 1/2"`, `1'-6.50"`. */
export function cadLengthSystemIsImperial(system: UnitSystem): boolean {
  return system === "architectural" || system === "engineering";
}

/** `LUNITS` → sistema. Fuera de rango cae en decimal, como la tabla de variables. */
export function cadLengthSystemFromLunits(lunits: number): UnitSystem {
  return UNIT_SYSTEM_BY_LUNITS[Math.trunc(lunits)] ?? "decimal";
}

/**
 * Ingeniería, con el acarreo hecho ANTES de partir en pies.
 *
 * `unit-format.ts` parte primero y redondea después, y por eso emite `1'-12"`
 * para 23.6 pulgadas con `LUPREC 0` (medido el 2026-09-04). Es un rótulo que
 * ningún plano lleva, y además rompe la ida y vuelta: `1'-12"` se relee como 24
 * y se vuelve a escribir `2'-0"`, así que formatear dos veces daría dos cadenas
 * distintas. Redondeando primero, el acarreo cae del lado correcto.
 *
 * El arreglo vive aquí y no allí porque `unit-format.ts` está fuera del
 * territorio de este frente; va en la petición `P-express-07` con el parche
 * exacto, y mientras tanto el rótulo del producto ya sale bien.
 */
function engineeringLabel(inches: number, precision: number): string {
  const sign = inches < 0 ? "-" : "";
  const rounded = Number(Math.abs(inches).toFixed(precision));
  if (rounded === 0) return `0'-${(0).toFixed(precision)}"`;
  const feet = Math.floor(rounded / 12 + 1e-9);
  const remainder = Math.max(0, rounded - feet * 12);
  return `${sign}${feet}'-${remainder.toFixed(precision)}"`;
}

/**
 * Una longitud en unidades de dibujo → el rótulo que el usuario lee.
 *
 * Es la función que la entrada, la cota y el DXF deben llamar. Cualquier sitio
 * que vuelva a escribir `value.toFixed(n)` por su cuenta es un formateador
 * nuevo que discrepará con éste en cuanto alguien toque `UNITS`.
 */
export function cadLengthLabel(value: number, options: CadLengthLabelOptions = {}): string {
  const drawingUnit = options.drawingUnit ?? "mm";
  const system = cadLengthSystemFromLunits(options.lunits ?? DEFAULT_LUNITS);
  const luprec = clampPrecision(options.luprec ?? DEFAULT_LUPREC);

  if (cadLengthSystemIsImperial(system)) {
    const inches = drawingUnitsToInches(value, drawingUnit);
    // Ni sufijo ni unidad de lectura: la comilla y el apóstrofo ya lo dicen.
    if (system === "engineering") return engineeringLabel(inches, luprec);
    const denominator = denominatorFromLuprec(luprec);
    return formatLength(withoutNegativeZero(inches, denominator), {
      system,
      denominator,
    });
  }

  const labelUnit = options.labelUnit ?? drawingUnit;
  const shown = convertCadLength(value, drawingUnit, labelUnit);
  const body =
    system === "fractional"
      ? formatLength(withoutNegativeZero(shown, denominatorFromLuprec(luprec)), {
          system,
          denominator: denominatorFromLuprec(luprec),
        })
      : formatLength(
          system === "scientific" ? shown : withoutNegativeZero(shown, 10 ** luprec),
          { system, precision: luprec },
        );
  const suffix = options.suffix ?? (options.showUnitSuffix ? ` ${labelUnit}` : "");
  return `${body}${suffix}`;
}

/**
 * Las opciones que corresponden a las variables VIVAS del dibujo.
 *
 * `INSUNITS` es la unidad del documento y `LUNITS`/`LUPREC` cómo se escribe.
 * Un `INSUNITS` que no sabemos traducir (millas, angstroms) NO se convierte en
 * milímetros a la brava: se queda con lo que el que llama haya declarado, y si
 * no declaró nada, con milímetros — pero el fallo queda en un solo sitio en vez
 * de repartido por cada rótulo del producto.
 */
export function cadLengthLabelOptions(
  variables: CadVariableAccess,
  extra: CadLengthLabelOptions = {},
): CadLengthLabelOptions {
  const insunits = Number(variables.get("INSUNITS") ?? 4);
  // Lo que el que llama declara gana sobre `INSUNITS`, y no al revés: quien
  // rotula desde un documento tiene `meta.unit` en la mano, que es la unidad
  // con la que ese documento se guardó. `INSUNITS` es la respuesta cuando nadie
  // la trae.
  return {
    drawingUnit: extra.drawingUnit ?? cadDrawingUnitFromInsunits(insunits) ?? "mm",
    lunits: extra.lunits ?? Number(variables.get("LUNITS") ?? DEFAULT_LUNITS),
    luprec: extra.luprec ?? Number(variables.get("LUPREC") ?? DEFAULT_LUPREC),
    labelUnit: extra.labelUnit,
    showUnitSuffix: extra.showUnitSuffix,
    suffix: extra.suffix,
  };
}

/** Atajo: rotular leyendo la configuración viva del dibujo. */
export function cadLengthLabelFromVariables(
  value: number,
  variables: CadVariableAccess,
  extra: CadLengthLabelOptions = {},
): string {
  return cadLengthLabel(value, cadLengthLabelOptions(variables, extra));
}
