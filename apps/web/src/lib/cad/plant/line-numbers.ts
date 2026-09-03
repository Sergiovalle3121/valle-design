/**
 * EL NÚMERO DE LÍNEA: la columna vertebral de un P&ID.
 *
 * ## Qué se midió antes de escribir esto
 *
 * `docs/competitive/distancia-autocad-completo-20260901.md`: *«**Plant 3D =
 * 0 %.** Cero aciertos de `p&id`, `isogen`, `piping`, `pipespec`. No hay P&ID,
 * ni especificación, ni catálogo, ni isométricos, ni gestor de datos.»* Lo
 * volví a medir el 3 de septiembre: catorce nombres de la familia sondeados
 * contra `engine/` —PLANTPROJECT, PIPESPEC, ISOGEN, PLANTPID, PIDLINE,
 * LINENUMBER, EQUIPMENT, NOZZLE, VALVEADD, INSTRUMENT, SPECEDITOR,
 * PLANTDATAMANAGER, ROUTEPIPE, ISOCONFIG— y **cero aciertos**; `p&id`,
 * `isogen`, `pipespec`, «especificación de tubería», «instrumento» y «servicio
 * de línea» no aparecen en `lib/cad`. Lo único de tubería es `PIPE`, del
 * paquete MEP, que dibuja en planta por servicio.
 *
 * ## Qué identifica una línea de proceso, y por qué es lo primero
 *
 * En una planta industrial una tubería no se llama «esa de allá»: se llama
 * `6"-P-1001-CS150`. Cuatro cosas en un solo nombre —diámetro, servicio,
 * número correlativo y especificación— y ese nombre es la clave con la que la
 * línea aparece en el P&ID, en el isométrico, en la lista de líneas, en la
 * requisición de material y en la prueba hidrostática. Sin número de línea no
 * hay proyecto de planta: hay dibujos.
 *
 * ## La especificación es DEL CLIENTE, y por eso no se trae ninguna
 *
 * AutoCAD Plant 3D vende catálogos y especificaciones. Aquí no se transcribe
 * ninguna, y no es por pereza: cada ingeniería tiene la suya —`CS150`, `SS300`,
 * lo que el cliente haya aprobado— y traer una ajena sería a la vez un problema
 * de derechos y un estorbo. Lo que se comprueba es lo que SÍ es universal y
 * verificable sin catálogo: que el nombre esté bien formado, que no haya dos
 * líneas con el mismo número, que un mismo servicio no use dos
 * especificaciones distintas —eso es un error de proyecto, no una opción— y que
 * el diámetro sea una medida comercial.
 *
 * ## Fallo cerrado
 *
 * Un número de línea que no se puede leer NO se convierte en uno a medias: se
 * cuenta con su motivo. Una lista de líneas a la que le faltan tres porque
 * estaban mal escritas es peor que no tener lista: la lista se firma.
 */
import type { CadDocument, CadEntity } from "../cad-document";

/** Número de línea completo, tal como se rotula: `6"-P-1001-CS150`. */
export const CAD_PL_LINE = "pl:linea";
/** Servicio o fluido: `P` proceso, `V` vapor, `A` agua… Lo define el proyecto. */
export const CAD_PL_SERVICE = "pl:servicio";
/** Especificación de tubería del proyecto: `CS150`, `SS300`… */
export const CAD_PL_SPEC = "pl:especificacion";

/** Capa de las líneas de proceso. Código `TU` (tubería) del estándar del árbol. */
export const CAD_PL_LINE_LAYER = "TU-PROC";

/**
 * Medidas comerciales de diámetro nominal, en pulgadas.
 *
 * Son las que se fabrican y se piden, de uso corriente en cualquier planta; no
 * se transcribe ninguna tabla con derechos. Se declaran aquí para que quien
 * mida sepa contra qué se comprueba, y en el orden en que crecen.
 */
export const CAD_PL_NPS: readonly string[] = [
  '1/2"', '3/4"', '1"', '1-1/2"', '2"', '3"', '4"', '6"', '8"',
  '10"', '12"', '14"', '16"', '18"', '20"', '24"',
];

export interface CadPlantLine {
  entityId: string;
  /** El número completo, normalizado. */
  line: string;
  size: string;
  service: string;
  number: number;
  spec: string;
}

/** Normaliza las comillas y los espacios que una persona teclea de mil formas. */
const tidy = (raw: string): string =>
  raw.trim().toUpperCase().replace(/[″”“]/gu, '"').replace(/\s+/gu, "");

/**
 * Parte un número de línea en sus cuatro trozos, o `null` si no tiene la forma.
 *
 * `6"-P-1001-CS150` → tamaño `6"`, servicio `P`, número `1001`, spec `CS150`.
 * El tamaño admite fracción (`1-1/2"`), que es como se escribe una pulgada y
 * media y la razón por la que no basta con partir por guiones.
 */
export function cadParsePlantLine(
  raw: string,
): { size: string; service: string; number: number; spec: string } | null {
  const limpio = tidy(raw);
  const partido = /^(\d+(?:-\d+\/\d+)?"|\d+\/\d+")-([A-Z]{1,3})-(\d{1,5})-([A-Z0-9]{2,10})$/u.exec(
    limpio,
  );
  if (!partido) return null;
  const number = Number(partido[3]);
  if (!Number.isInteger(number) || number <= 0) return null;
  return { size: partido[1], service: partido[2], number, spec: partido[4] };
}

/** El número de línea como se rotula en el plano. */
export const cadFormatPlantLine = (
  size: string,
  service: string,
  number: number,
  spec: string,
): string => `${tidy(size)}-${service.toUpperCase()}-${number}-${spec.toUpperCase()}`;

/** Las líneas de proceso del dibujo, leídas de sus metadatos. */
export function cadPlantLinesOf(
  document: Pick<CadDocument, "entities">,
): CadPlantLine[] {
  const lines: CadPlantLine[] = [];
  for (const entity of document.entities) {
    const raw = entity.context?.metadata?.[CAD_PL_LINE];
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const partido = cadParsePlantLine(raw);
    if (!partido) continue;
    lines.push({ entityId: entity.id, line: tidy(raw), ...partido });
  }
  return lines;
}

/** El siguiente correlativo libre del servicio: el mayor que hay, más uno. */
export function cadNextPlantLineNumber(
  document: Pick<CadDocument, "entities">,
  service: string,
): number {
  const clave = service.trim().toUpperCase();
  let mayor = 0;
  for (const line of cadPlantLinesOf(document))
    if (line.service === clave && line.number > mayor) mayor = line.number;
  // Las líneas de planta empiezan en 1001 por convención de proyecto: los
  // números de tres cifras se confunden con los de equipo.
  return mayor === 0 ? 1_001 : mayor + 1;
}

export type CadPlantFindingKind =
  | "numero-repetido"
  | "servicio-con-dos-especificaciones"
  | "diametro-no-comercial"
  | "numero-ilegible";

export interface CadPlantFinding {
  kind: CadPlantFindingKind;
  detail: string;
  entityIds: string[];
}

/**
 * Lo que está mal en la lista de líneas del dibujo, sin catálogo de nadie.
 *
 * Cuatro comprobaciones, y las cuatro son universales:
 *
 *  · **Número repetido**: dos tramos con el mismo número son la misma línea
 *    para el montador, y si no lo son, uno de los dos está mal.
 *  · **Un servicio con dos especificaciones**: no es una opción del proyecto,
 *    es un error — o el servicio se parte en dos, o una de las dos sobra.
 *  · **Diámetro no comercial**: un `5"` no se compra. Se caza aquí y no en la
 *    requisición.
 *  · **Número ilegible**: se cuenta en vez de desaparecer de la lista.
 */
export function cadPlantFindings(
  document: Pick<CadDocument, "entities">,
): CadPlantFinding[] {
  const findings: CadPlantFinding[] = [];
  const lines = cadPlantLinesOf(document);

  const porNumero = new Map<string, string[]>();
  const porServicio = new Map<string, Map<string, string[]>>();
  for (const line of lines) {
    const clave = `${line.service}-${line.number}`;
    porNumero.set(clave, [...(porNumero.get(clave) ?? []), line.entityId]);
    const especificaciones = porServicio.get(line.service) ?? new Map<string, string[]>();
    especificaciones.set(line.spec, [
      ...(especificaciones.get(line.spec) ?? []),
      line.entityId,
    ]);
    porServicio.set(line.service, especificaciones);
    if (!CAD_PL_NPS.includes(line.size))
      findings.push({
        kind: "diametro-no-comercial",
        detail: `${line.line}: ${line.size} no es una medida comercial`,
        entityIds: [line.entityId],
      });
  }

  for (const [clave, ids] of porNumero)
    if (ids.length > 1)
      findings.push({
        kind: "numero-repetido",
        detail: `dos o más tramos llevan el número ${clave}`,
        entityIds: [...ids].sort(),
      });

  for (const [service, especificaciones] of porServicio)
    if (especificaciones.size > 1)
      findings.push({
        kind: "servicio-con-dos-especificaciones",
        detail: `el servicio ${service} usa ${[...especificaciones.keys()].sort().join(" y ")}`,
        entityIds: [...especificaciones.values()].flat().sort(),
      });

  // Un número que no se pudo leer: se busca sobre las entidades, no sobre las
  // líneas, porque justamente no llegó a ser una.
  for (const entity of document.entities) {
    const raw = entity.context?.metadata?.[CAD_PL_LINE];
    if (typeof raw !== "string" || raw.trim() === "") continue;
    if (cadParsePlantLine(raw)) continue;
    findings.push({
      kind: "numero-ilegible",
      detail: `«${raw}» no tiene la forma diámetro-servicio-número-especificación`,
      entityIds: [entity.id],
    });
  }

  return findings.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.detail.localeCompare(b.detail),
  );
}

/** Los metadatos que marcan una polilínea como línea de proceso. */
export function cadPlantLineMetadata(input: {
  size: string;
  service: string;
  number: number;
  spec: string;
}): Record<string, string> {
  return {
    [CAD_PL_LINE]: cadFormatPlantLine(input.size, input.service, input.number, input.spec),
    [CAD_PL_SERVICE]: input.service.trim().toUpperCase(),
    [CAD_PL_SPEC]: input.spec.trim().toUpperCase(),
  };
}

/** Longitud recorrida de una entidad, en unidades de dibujo. */
export function cadPlantRunLength(entity: CadEntity): number {
  const puntos =
    entity.type === "polyline"
      ? entity.vertices
      : entity.type === "line"
        ? [entity.start, entity.end]
        : [];
  let total = 0;
  for (let i = 1; i < puntos.length; i += 1)
    total += Math.hypot(
      puntos[i].x - puntos[i - 1].x,
      puntos[i].y - puntos[i - 1].y,
      (puntos[i].z ?? 0) - (puntos[i - 1].z ?? 0),
    );
  return total;
}
