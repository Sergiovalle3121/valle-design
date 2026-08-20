/**
 * LÁMINAS: SERIE A, MARGEN DE ARCHIVO Y DOBLADO A A4.
 *
 * ## Por qué la serie A y no la ANSI
 *
 * AutoCAD llega con papeles ANSI y ARCH porque es un producto estadounidense.
 * En México se dibuja, se imprime y se archiva en serie A: A1 para la planta,
 * A3 para la copia de revisión, A4 para el oficio que la acompaña. Un despacho
 * que arranca una lámina en «ANSI D» descubre el problema en la copiadora.
 *
 * ## El margen ancho de la izquierda no es estético
 *
 * ISO 5457 deja 20 mm en el borde de encuadernación y 10 en los otros tres. Ese
 * borde ancho es la ZONA DE ARCHIVO: por ahí se perfora el plano o se pega la
 * cinta del portaplanos. Un plano con 10 mm a la izquierda se agujerea encima
 * del dibujo, y no hay forma de arreglarlo después.
 *
 * ## Doblar a A4 es un requisito, no una manía
 *
 * El plano se entrega y se archiva DOBLADO a A4, y el cajetín tiene que quedar
 * en la cara que se ve. Si cae al dorso, la carpeta del cliente son veinte
 * rectángulos idénticos que hay que desplegar uno a uno para saber cuál es cuál.
 * Por eso el cajetín se ancla abajo a la derecha, y por eso aquí se COMPRUEBA
 * —no se supone— que cabe entero dentro del panel A4 que queda a la vista.
 *
 * ## Lo que este módulo no afirma
 *
 * No afirma un patrón de pliegues. El orden concreto de dobleces lo detalla DIN
 * 824, que es alemana; ISO 5457 pide que el resultado sea A4 con el cajetín
 * visible y no dibuja los pliegues. Aquí se modela el RESULTADO —cuántos paneles
 * A4 salen y si el cajetín queda a la vista— y se dice que el patrón queda
 * fuera. Inventar una secuencia de dobleces y llamarla norma sería justo el
 * claim falso que este trabajo existe para evitar.
 */
import { CAD_SHEET_PAPERS, type CadSheetPaper } from "../paper-space";
import { cadStandardSource } from "./mexican-drafting-sources";

/** Los papeles que se ofrecen para una lámina mexicana: serie A y sólo serie A. */
export const CAD_MEXICAN_PAPERS: readonly CadSheetPaper[] = ["A0", "A1", "A2", "A3", "A4"];

/** Márgenes ISO 5457: 20 mm en el borde de archivo, 10 en los otros tres. */
export const CAD_ISO_SHEET_MARGINS_MM = {
  top: 10,
  right: 10,
  bottom: 10,
  left: 20,
} as const;

/** Tamaño del panel al que se dobla toda lámina para archivarla: A4 vertical. */
export const CAD_A4_PANEL_MM = { width: 210, height: 297 } as const;

export interface CadMexicanPaperFact {
  paper: CadSheetPaper;
  /** Tamaño en vertical, en milímetros. */
  width: number;
  height: number;
  /** Paneles A4 que salen al doblarla. A0 = 16, A4 = 1. */
  a4Panels: number;
  /** Para qué se usa esa hoja en un despacho mexicano. */
  purpose: string;
  sources: readonly string[];
}

/**
 * Paneles A4 que salen de una hoja.
 *
 * Se calcula por ÁREA y se comprueba que el resultado es una potencia de dos:
 * la serie A está construida para que cada formato sea la mitad del anterior, y
 * si un día alguien mete un papel que no cumple eso, esta función lo dice en vez
 * de devolver un número redondeado que parece correcto.
 *
 * No se calcula como rejilla de columnas × filas a propósito: por la alternancia
 * de la razón √2 un A1 no se parte en una rejilla entera de A4, y modelarlo así
 * daría una geometría falsa. Lo que importa —y lo que se afirma— es cuántos
 * paneles salen.
 */
export function cadA4PanelCount(paper: CadSheetPaper): number {
  const base = CAD_SHEET_PAPERS[paper];
  const ratio = (base.width * base.height) / (CAD_A4_PANEL_MM.width * CAD_A4_PANEL_MM.height);
  const rounded = 2 ** Math.round(Math.log2(ratio));
  return rounded;
}

/**
 * Desviación relativa entre el área real de la hoja y la de sus paneles A4.
 *
 * La serie A se redondea a milímetros enteros, así que un A0 no son exactamente
 * dieciséis A4: son 16,03. Publicar la desviación permite afirmar que es
 * despreciable en lugar de fingir una exactitud que el redondeo no tiene.
 */
export function cadA4PanelDeviation(paper: CadSheetPaper): number {
  const base = CAD_SHEET_PAPERS[paper];
  const area = base.width * base.height;
  const panels = cadA4PanelCount(paper) * CAD_A4_PANEL_MM.width * CAD_A4_PANEL_MM.height;
  return Math.abs(area - panels) / panels;
}

/** Error tipado: pedir un papel fuera de la serie A no puede pasar callando. */
export class CadMexicanPaperError extends Error {
  readonly code = "cad_mexican_paper_unsupported";
  constructor(readonly paper: string) {
    super(
      `«${paper}» no es un papel de lámina mexicana. En México se dibuja en serie A: ` +
        `${CAD_MEXICAN_PAPERS.join(", ")}. La serie ANSI (Letter, Tabloid) no se usa para planos.`,
    );
    this.name = "CadMexicanPaperError";
  }
}

const PAPER_PURPOSE: Readonly<Record<string, string>> = {
  A0: "Plano de conjunto de obra grande y juegos de licitación.",
  A1: "La lámina de despacho por excelencia: planta, alzados y cortes de casa habitación.",
  A2: "Vivienda pequeña y planos de una sola planta.",
  A3: "Copia de revisión, plano de detalle y lo que se manda por correo.",
  A4: "Croquis, oficio y anexos del expediente.",
};

export function cadMexicanPaperFact(paper: CadSheetPaper): CadMexicanPaperFact {
  if (!CAD_MEXICAN_PAPERS.includes(paper)) throw new CadMexicanPaperError(paper);
  const base = CAD_SHEET_PAPERS[paper];
  return {
    paper,
    width: base.width,
    height: base.height,
    a4Panels: cadA4PanelCount(paper),
    purpose: PAPER_PURPOSE[paper] ?? "",
    sources: ["iso-216", "iso-5457-margenes", "iso-5457-doblado"],
  };
}

export function cadMexicanPaperFacts(): CadMexicanPaperFact[] {
  return CAD_MEXICAN_PAPERS.map(cadMexicanPaperFact);
}

/** Hoja ya orientada, en milímetros. */
export function cadSheetSize(
  paper: CadSheetPaper,
  orientation: "portrait" | "landscape",
): { width: number; height: number } {
  const base = CAD_SHEET_PAPERS[paper];
  return orientation === "portrait"
    ? { width: base.width, height: base.height }
    : { width: base.height, height: base.width };
}

/**
 * La franja de archivo: los 20 mm del borde por donde se perfora o se pega.
 *
 * Devuelve un rectángulo en milímetros desde la esquina superior izquierda, en
 * el mismo sistema que el cajetín y que el emisor de PDF. Nada del dibujo puede
 * entrar aquí; que sea un rectángulo y no un número es lo que permite
 * comprobarlo.
 */
export function cadSheetFilingZone(
  paper: CadSheetPaper,
  orientation: "portrait" | "landscape",
): { x: number; y: number; width: number; height: number } {
  const page = cadSheetSize(paper, orientation);
  return { x: 0, y: 0, width: CAD_ISO_SHEET_MARGINS_MM.left, height: page.height };
}

/**
 * El panel A4 que queda a la vista con la lámina doblada: el de abajo a la
 * derecha.
 *
 * Es donde tiene que caer el cajetín entero. Devolverlo como rectángulo permite
 * que una prueba lo afirme sobre la geometría real del cajetín en vez de
 * confiar en que «se ancla abajo a la derecha, así que seguro cabe».
 */
export function cadSheetFrontPanel(
  paper: CadSheetPaper,
  orientation: "portrait" | "landscape",
): { x: number; y: number; width: number; height: number } {
  const page = cadSheetSize(paper, orientation);
  const width = Math.min(CAD_A4_PANEL_MM.width, page.width);
  const height = Math.min(CAD_A4_PANEL_MM.height, page.height);
  return { x: page.width - width, y: page.height - height, width, height };
}

/** ¿El rectángulo cabe entero dentro del panel visible al doblar? */
export function cadFitsInFrontPanel(
  box: { x: number; y: number; width: number; height: number },
  paper: CadSheetPaper,
  orientation: "portrait" | "landscape",
): boolean {
  const panel = cadSheetFrontPanel(paper, orientation);
  return (
    box.x >= panel.x - 1e-9 &&
    box.y >= panel.y - 1e-9 &&
    box.x + box.width <= panel.x + panel.width + 1e-9 &&
    box.y + box.height <= panel.y + panel.height + 1e-9
  );
}

/** Comprobación de integridad de las citas de este módulo. */
export function cadMexicanSheetSourceProblems(): string[] {
  const problems: string[] = [];
  for (const fact of cadMexicanPaperFacts()) {
    if (fact.sources.length === 0) {
      problems.push(`${fact.paper}: no cita ninguna fuente.`);
      continue;
    }
    for (const id of fact.sources) {
      try {
        cadStandardSource(id);
      } catch {
        problems.push(`${fact.paper}: cita la fuente inexistente «${id}».`);
      }
    }
  }
  return problems;
}
