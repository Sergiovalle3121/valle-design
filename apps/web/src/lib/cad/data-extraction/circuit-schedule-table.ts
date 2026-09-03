/**
 * EL CUADRO DE CARGAS COMO TABLA DEL DIBUJO (Ola 5).
 *
 * ## Por qué esto es el entregable y no un extra
 *
 * Un proyecto eléctrico mexicano se entrega con su **cuadro de cargas**: una
 * fila por circuito con su protección, su calibre, su longitud y su caída de
 * tensión. Hoy ese cuadro se hace en una hoja de cálculo aparte, con las
 * longitudes medidas a mano sobre el plano — y en cuanto el plano cambia, la
 * hoja miente.
 *
 * Aquí sale del dibujo: las longitudes son las de las polilíneas, la caída se
 * calcula con ellas, y el cuadro es una TABLE del documento, así que se traza
 * en la lámina por el mismo camino que los demás cuadros y viaja al DXF.
 * Rehacerlo después de mover un conductor es volver a teclear la orden.
 *
 * ## El veredicto va EN la tabla
 *
 * La última columna dice `cumple`, `AVISO`, `NO CUMPLE` o `SIN DATOS`. Un
 * cuadro de cargas que sólo enseña números obliga a comprobarlos otra vez; éste
 * ya trae la comprobación, y la trae con el mismo criterio que `AECHECK` — es
 * el mismo módulo, no una segunda cuenta que se podría desincronizar.
 *
 * ## El límite, también en la tabla
 *
 * El título del cuadro dice lo que la revisión NO mira. Un cuadro de cargas con
 * una columna de veredictos y sin su límite se lee como un memorial de cálculo,
 * y no lo es: lo firma quien lo firma.
 */
import type { CadPoint2 } from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";
import type { CadCircuitCheck } from "../electrical/circuit-check";
import { scheduleTable } from "./data-extraction";

type CadTableEntity = Extract<CadNativeEntity, { type: "table" }>;

export const CIRCUIT_HEADERS = [
  "Circuito",
  "Conductores",
  "Calibre AWG",
  "Protección (A)",
  "Tensión (V)",
  "Fases",
  "Longitud (m)",
  "Caída (V)",
  "Caída (%)",
  "NOM-001-SEDE",
] as const;

const VERDICT_LABEL = {
  ok: "cumple",
  aviso: "AVISO",
  "no-cumple": "NO CUMPLE",
  "sin-datos": "SIN DATOS",
} as const;

/** Un guion cuando el dato no está: una celda vacía se lee como un cero. */
const dash = (value: string | number | null, digits = 0): string =>
  value === null || value === undefined
    ? "—"
    : typeof value === "number"
      ? value.toFixed(digits)
      : value;

export function buildCadCircuitScheduleTable(
  checks: readonly CadCircuitCheck[],
  insertion: CadPoint2,
  layer: string,
  newEntityId: () => string,
): CadTableEntity {
  const rows: string[][] = checks.map((check) => [
    check.circuit,
    String(check.wires),
    dash(check.gauge),
    dash(check.breakerAmps),
    dash(check.volts),
    check.phases === null ? "—" : check.phases === 3 ? "3F" : "1F",
    dash(check.lengthM, 1),
    dash(check.dropVolts, 2),
    dash(check.dropPercent, 1),
    VERDICT_LABEL[check.verdict],
  ]);
  return scheduleTable(
    // El límite viaja EN el título del cuadro: es lo que se imprime y lo que
    // alguien lee dentro de un año, cuando el renglón de la orden ya no está.
    "Cuadro de cargas: longitudes medidas sobre el dibujo; caída resistiva calculada con la protección. No sustituye el memorial de cálculo (sin temperatura, agrupamiento, 125 % de carga continua, tierra ni llenado de tubo)",
    CIRCUIT_HEADERS,
    rows,
    insertion,
    layer,
    newEntityId,
    1_400,
  );
}
