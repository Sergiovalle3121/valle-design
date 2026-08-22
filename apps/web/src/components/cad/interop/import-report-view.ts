/**
 * Cómo se ORDENA y se TITULA el informe de importación en pantalla.
 *
 * El qué —qué entró, qué entró peor, qué no entró— lo decide
 * `lib/cad/dxf-import-report.ts`, que es puro y no sabe que existe React. Aquí
 * sólo vive la presentación: en qué orden se leen las tres secciones, cómo se
 * llaman en español y cuál va abierta de entrada.
 *
 * Está en un módulo aparte del componente porque es la parte que se puede
 * probar en Node. Un `.tsx` con la ordenación dentro obligaría a montar un DOM
 * para comprobar que lo perdido sale ANTES que lo conservado, y esa es
 * exactamente la regla que no puede romperse sin que nadie se entere: un
 * informe que empieza celebrando lo que sí entró es un informe que se cierra
 * antes de llegar a lo que no.
 */
import type {
  CadDxfFidelity,
  CadDxfImportReport,
  CadDxfImportReportRow,
} from "@/lib/cad/dxf-import-report";

export interface CadDxfImportReportSection {
  fidelity: CadDxfFidelity;
  /** Encabezado en español. Sin siglas y sin nombres de código. */
  title: string;
  /** Cuántas entidades cubre la sección entera. */
  count: number;
  rows: readonly CadDxfImportReportRow[];
  /**
   * Si la sección se muestra desplegada. Lo que se pierde va abierto: esconder
   * una pérdida detrás de un clic es la forma educada de no decirla.
   */
  open: boolean;
}

/**
 * El orden es el mensaje. Primero lo que NO está —es lo único que obliga a
 * hacer algo—, después lo que está peor, y al final lo que salió bien, que es
 * tranquilizador pero no accionable.
 */
const SECTIONS: ReadonlyArray<{
  fidelity: CadDxfFidelity;
  title: string;
  open: boolean;
}> = [
  { fidelity: "lost", title: "No entró en el dibujo", open: true },
  { fidelity: "degraded", title: "Entró con menos información", open: true },
  { fidelity: "kept", title: "Entró íntegro", open: false },
];

/** Agrupa las filas del informe en las tres secciones. Vacías se omiten. */
export function groupCadDxfImportReport(
  report: CadDxfImportReport,
): CadDxfImportReportSection[] {
  return SECTIONS.flatMap((section) => {
    const rows = report.rows.filter((row) => row.fidelity === section.fidelity);
    if (rows.length === 0) return [];
    return [
      {
        ...section,
        rows,
        count: rows.reduce((total, row) => total + row.count, 0),
      },
    ];
  });
}

/**
 * Tono del titular. `alert` cuando falta algo en el dibujo, `warn` cuando todo
 * está pero peor, `ok` cuando no hay nada que declarar.
 *
 * No es cosmética: es lo que decide si el arquitecto mira el panel o lo cierra,
 * y equivocarlo hacia el verde es peor que no enseñarlo.
 */
export type CadDxfImportTone = "ok" | "warn" | "alert";

export function cadDxfImportTone(report: CadDxfImportReport): CadDxfImportTone {
  if (report.rows.some((row) => row.fidelity === "lost")) return "alert";
  if (report.rows.some((row) => row.fidelity === "degraded")) return "warn";
  return "ok";
}
