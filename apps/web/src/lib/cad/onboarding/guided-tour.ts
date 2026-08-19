/**
 * RECORRIDO GUIADO DE UNA VEZ: cinco pasos hasta un plano de verdad.
 *
 * ## Qué tiene que pasar en cinco minutos
 *
 * Que el arquitecto DIBUJE UN MURO, COLOQUE UNA PUERTA de la biblioteca, ACOTE
 * y EXPORTE UN PDF. No que vea cinco globos explicando la interfaz. Un recorrido
 * que sólo señala botones enseña dónde están los botones; éste termina con un
 * archivo que se puede mandar por correo, y ése es el momento en el que alguien
 * decide que el producto sirve.
 *
 * ## Por qué el progreso se lee del DIBUJO y no de los clics
 *
 * Porque hay tres caminos para colocar una puerta —la paleta de bloques, `I` en
 * la línea de comandos y arrastrarla del catálogo— y un recorrido que sólo
 * reconociera uno le diría «todavía no» a quien acaba de hacerlo bien. Se mira
 * el resultado: ¿hay un muro?, ¿hay una inserción de puerta?, ¿hay una cota? Da
 * igual por dónde entraron.
 *
 * El trazado es la excepción y no puede ser de otra forma: **trazar no cambia el
 * dibujo**. Un PDF no deja rastro en el documento —y es correcto que no lo
 * deje—, así que ese paso se cierra con una señal explícita del anfitrión que
 * entregó el archivo.
 *
 * ## Por qué es SALTABLE y de una sola vez
 *
 * Un recorrido que reaparece es un anuncio. Se puede saltar en cualquier paso,
 * y saltarlo cuenta como haberlo terminado a efectos de no volver a salir: quien
 * lo salta ya decidió.
 *
 * ## Por qué se mide
 *
 * «Cinco minutos» es una afirmación falsable, y este módulo la deja medir: el
 * anfitrión sella el inicio y el final, y `cadGuidedTourDuration` da el número.
 * Sin eso, «el recorrido es rápido» es una opinión.
 */
import type { CadCommandDocumentView } from "../engine/command-types";

export type CadTourStepId = "lamina" | "muro" | "puerta" | "cota" | "pdf";

export interface CadTourStep {
  id: CadTourStepId;
  title: string;
  /** Qué tiene que hacer, en una frase. */
  instruction: string;
  /** Lo que se teclea, si hay una forma de teclearlo. */
  command?: string;
  /** El detalle que evita el atasco típico de ese paso. */
  hint: string;
}

export const CAD_GUIDED_TOUR_STEPS: readonly CadTourStep[] = [
  {
    id: "lamina",
    title: "Tu lámina ya está puesta",
    instruction:
      "La plantilla trajo las capas, el estilo de cota, la escala y el cajetín. No hay nada que configurar.",
    hint: "Mira abajo a la derecha: la lámina, su escala y su cajetín están hechos.",
  },
  {
    id: "muro",
    title: "Dibuja un muro",
    instruction:
      "Teclea WA, pincha el arranque, teclea 4000 y pulsa Intro. Sale un muro de 4 m con su grosor.",
    command: "WA",
    hint: "El grosor por defecto son 200 mm; se cambia con G sin salir del comando.",
  },
  {
    id: "puerta",
    title: "Coloca una puerta",
    instruction:
      "Abre la paleta de bloques y elige «Puerta abatible 0.90 m». Se engancha por el quicial.",
    command: "I",
    hint: "El punto de inserción es el eje de giro: engánchalo al extremo del vano.",
  },
  {
    id: "cota",
    title: "Acota el muro",
    instruction:
      "Teclea DIM y designa los dos extremos del muro. La cota sale con el estilo de la plantilla.",
    command: "DIM",
    hint: "La cota es asociativa: si mueves el muro, la medida se corrige sola.",
  },
  {
    id: "pdf",
    title: "Exporta el PDF",
    instruction:
      "Teclea PLOT y elige tu lámina. Sale un PDF con el cajetín relleno y la escala real.",
    command: "PLOT",
    hint: "El PDF sale a la escala de la ventana, no a «ajustar a la hoja».",
  },
];

export function cadGuidedTourStep(id: string): CadTourStep | undefined {
  return CAD_GUIDED_TOUR_STEPS.find((step) => step.id === id);
}

/**
 * Lo que el recorrido mira para saber si un paso está hecho.
 *
 * El documento entra como VISTA de sólo lectura —la misma que reciben los
 * comandos de gestión— porque un acompañante no tiene por qué poder escribir en
 * el dibujo, y dándole el documento entero podría.
 */
export interface CadTourEvidence {
  document?: CadCommandDocumentView | null;
  /** El anfitrión entregó un PDF. Trazar no deja rastro en el documento. */
  plotted?: boolean;
  /** El primer paso es de lectura: se cierra al decir «entendido». */
  acknowledged?: boolean;
}

/** ¿Este bloque es una puerta? Vale la sembrada, la dinámica y la propia. */
export function cadTourBlockIsDoor(block: { id: string; name?: string }): boolean {
  const haystack = `${block.id} ${block.name ?? ""}`.toLocaleLowerCase();
  return /puerta|door/.test(haystack);
}

function hasWall(document: CadCommandDocumentView): boolean {
  // El muro paramétrico es una entidad `wall` con su receta dentro. También se
  // acepta el que alguien dibuje a mano en la capa de muros: el recorrido
  // premia el RESULTADO, y decirle «eso no cuenta» a quien acaba de dibujar un
  // muro con LINE sería mentirle.
  return document.entities.some(
    (entity) =>
      entity.type === "wall" ||
      (entity.layer === "MURO" && (entity.type === "line" || entity.type === "polyline")),
  );
}

function hasDoor(document: CadCommandDocumentView): boolean {
  const doors = new Set(
    document.blocks.filter(cadTourBlockIsDoor).map((block) => block.id),
  );
  if (doors.size === 0) return false;
  return document.entities.some(
    (entity) => entity.type === "insert" && doors.has(entity.block),
  );
}

function hasDimension(document: CadCommandDocumentView): boolean {
  return document.entities.some(
    (entity) => entity.type === "dimension" || entity.type === "mleader",
  );
}

export function cadTourStepDone(id: CadTourStepId, evidence: CadTourEvidence): boolean {
  if (id === "lamina") return evidence.acknowledged === true;
  if (id === "pdf") return evidence.plotted === true;
  const document = evidence.document;
  if (!document) return false;
  if (id === "muro") return hasWall(document);
  if (id === "puerta") return hasDoor(document);
  return hasDimension(document);
}

export interface CadGuidedTourProgress {
  doneStepIds: CadTourStepId[];
  /** El primero sin hacer. `null` cuando están los cinco. */
  currentStepId: CadTourStepId | null;
  completed: boolean;
  /** Enteros de 0 a 100. Es lo que se pinta en la barra. */
  percent: number;
}

/**
 * Estado del recorrido a partir de la evidencia.
 *
 * El paso ACTUAL es el primero sin hacer, no «el siguiente al último hecho».
 * Distinguirlos importa: quien acota antes de poner la puerta no debe ver el
 * recorrido saltarse la puerta — el plano que se le prometió la lleva.
 */
export function cadGuidedTourProgress(evidence: CadTourEvidence): CadGuidedTourProgress {
  const doneStepIds = CAD_GUIDED_TOUR_STEPS.filter((step) =>
    cadTourStepDone(step.id, evidence),
  ).map((step) => step.id);
  const current = CAD_GUIDED_TOUR_STEPS.find((step) => !doneStepIds.includes(step.id));
  return {
    doneStepIds,
    currentStepId: current?.id ?? null,
    completed: doneStepIds.length === CAD_GUIDED_TOUR_STEPS.length,
    percent: Math.round((doneStepIds.length / CAD_GUIDED_TOUR_STEPS.length) * 100),
  };
}

// ---------------------------------------------------------------------------
// La medida
// ---------------------------------------------------------------------------

export type CadTourStatus = "pending" | "running" | "skipped" | "completed";

export interface CadTourRecord {
  status: CadTourStatus;
  /** Epoch ms del arranque. `0` si no ha arrancado. */
  startedAt: number;
  /** Epoch ms del final —terminado o saltado—. `0` mientras corre. */
  finishedAt: number;
  acknowledged: boolean;
  plotted: boolean;
}

export const EMPTY_CAD_TOUR_RECORD: CadTourRecord = {
  status: "pending",
  startedAt: 0,
  finishedAt: 0,
  acknowledged: false,
  plotted: false,
};

/**
 * Cuánto tardó de verdad, en milisegundos. `null` si no hay dos sellos.
 *
 * Se calcula aquí, sobre el registro persistido, y no con un cronómetro en
 * memoria: un recorrido que se hace en dos sentadas —cosa normal— se mediría
 * como cero si el cronómetro muriera al recargar la pestaña.
 */
export function cadGuidedTourDuration(record: CadTourRecord): number | null {
  if (!(record.startedAt > 0) || !(record.finishedAt > record.startedAt)) return null;
  return record.finishedAt - record.startedAt;
}

/** `3 min 42 s`. Para enseñárselo a quien acaba de terminar. */
export function formatCadTourDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}

/** El objetivo declarado. Si no se cumple, el recorrido está mal, no el usuario. */
export const CAD_GUIDED_TOUR_TARGET_MS = 5 * 60 * 1000;

export function cadGuidedTourWithinTarget(record: CadTourRecord): boolean | null {
  const duration = cadGuidedTourDuration(record);
  return duration === null ? null : duration <= CAD_GUIDED_TOUR_TARGET_MS;
}

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

export type CadTourAction =
  | { type: "start"; now: number }
  | { type: "acknowledge" }
  | { type: "plot"; now: number }
  | { type: "skip"; now: number }
  | { type: "complete"; now: number }
  | { type: "reset" };

/**
 * Reductor puro del registro.
 *
 * Es puro y recibe el reloj por parámetro a propósito: así la spec puede afirmar
 * una duración exacta en vez de comprobar que «pasó algo de tiempo», que es la
 * clase de aserción que pasa aunque el sello no se escriba.
 *
 * Terminado o saltado NO vuelven a arrancar solos. Un recorrido que reaparece
 * después de haberlo cerrado es un anuncio, y la única forma de volver a verlo
 * es pedirlo (`reset`).
 */
export function cadGuidedTourReduce(
  record: CadTourRecord,
  action: CadTourAction,
): CadTourRecord {
  if (action.type === "reset") return { ...EMPTY_CAD_TOUR_RECORD };
  if (record.status === "completed" || record.status === "skipped") {
    // Ya cerrado: sólo `reset` lo reabre. Se devuelve el MISMO objeto para que
    // un almacén que compare por identidad no publique un cambio inexistente.
    return record;
  }
  if (action.type === "start")
    return record.status === "running"
      ? record
      : { ...record, status: "running", startedAt: action.now };
  if (action.type === "acknowledge")
    return record.acknowledged ? record : { ...record, acknowledged: true };
  if (action.type === "plot")
    return record.plotted ? record : { ...record, plotted: true };
  if (action.type === "skip")
    return { ...record, status: "skipped", finishedAt: action.now };
  return { ...record, status: "completed", finishedAt: action.now };
}

/** Serialización del registro para `localStorage`. Tolera basura. */
export function parseCadTourRecord(raw: string | null): CadTourRecord {
  if (!raw) return { ...EMPTY_CAD_TOUR_RECORD };
  try {
    const parsed = JSON.parse(raw) as Partial<CadTourRecord>;
    const status = parsed.status;
    return {
      status:
        status === "running" || status === "skipped" || status === "completed"
          ? status
          : "pending",
      startedAt: Number.isFinite(parsed.startedAt) ? Number(parsed.startedAt) : 0,
      finishedAt: Number.isFinite(parsed.finishedAt) ? Number(parsed.finishedAt) : 0,
      acknowledged: parsed.acknowledged === true,
      plotted: parsed.plotted === true,
    };
  } catch {
    // Un registro corrupto NO puede tirar el editor ni dejar al usuario sin
    // recorrido para siempre: se trata como si nunca hubiera existido.
    return { ...EMPTY_CAD_TOUR_RECORD };
  }
}
