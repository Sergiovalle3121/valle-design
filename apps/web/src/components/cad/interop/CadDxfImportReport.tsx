"use client";

/**
 * Lo que el arquitecto ve al importar un DXF ajeno.
 *
 * ## Por qué este componente es producto y no adorno
 *
 * Hasta ahora, importar un DXF enseñaba «6 advertencias de interoperabilidad» y
 * debajo la lista cruda del importador: `unsupported_entity`,
 * `anisotropic_insert`, `hatch_edge_path_partial`. Un arquitecto no sabe qué
 * hacer con eso, así que cerraba el desplegable y se ponía a dibujar sin saber
 * que le faltaban tres cotas. Cuando lo descubría era en obra.
 *
 * AutoCAD tampoco dice qué perdió al abrir un archivo. Decirlo —en español,
 * con números y antes de empezar a trabajar— no es una disculpa por soportar
 * DXF parcialmente: es la única ventaja que un producto pequeño puede tener
 * sobre uno grande en el terreno donde se juega la decisión de cambiar.
 *
 * Presentacional puro y memoizado: el orden, los títulos y el tono los decide
 * `import-report-view.ts`, que se prueba en Node.
 */
import React from "react";
import type { CadDxfImportReport } from "@/lib/cad/dxf-import-report";
import {
  cadDxfImportTone,
  groupCadDxfImportReport,
  type CadDxfImportTone,
} from "./import-report-view";

export interface CadDxfImportReportPanelProps {
  report: CadDxfImportReport;
  /** Nombre del archivo, si se conoce. Ancla el informe a algo reconocible. */
  fileName?: string;
  /**
   * Formato de origen. Sólo cambia el nombre que se lee en voz alta y el
   * identificador de prueba.
   *
   * Existe porque el informe de importación de PDF tiene EXACTAMENTE la misma
   * forma —tres columnas, mismo orden, mismo tono— y duplicar este componente
   * habría dado dos paneles que se parecen y con el tiempo divergen: uno abre la
   * sección de pérdidas y el otro no. Lo que cambia entre un DXF y un PDF es el
   * vocabulario de las filas, y eso lo decide el módulo puro que las construye.
   */
  format?: "dxf" | "pdf";
}

const TONE_CLASS: Readonly<Record<CadDxfImportTone, string>> = {
  ok: "bg-emerald-500/10 text-emerald-200",
  warn: "bg-amber-500/10 text-amber-100",
  alert: "bg-red-500/10 text-red-100",
};

const SECTION_CLASS: Readonly<Record<string, string>> = {
  lost: "text-red-300",
  degraded: "text-amber-300",
  kept: "text-emerald-300",
};

export const CadDxfImportReportPanel = React.memo(
  function CadDxfImportReportPanel({
    report,
    fileName,
    format = "dxf",
  }: CadDxfImportReportPanelProps) {
    const sections = groupCadDxfImportReport(report);
    const tone = cadDxfImportTone(report);
    return (
      <section
        data-testid={`cad-${format}-import-report`}
        data-tone={tone}
        className={`rounded-xl p-3 text-sm ${TONE_CLASS[tone]}`}
        aria-label={`Qué se conservó al importar el ${format.toUpperCase()}`}
      >
        <p role="status" className="font-medium">
          {fileName ? `${fileName}: ` : ""}
          {report.headline}
        </p>
        <p className="mt-1 text-xs opacity-80">
          {report.layerCount} capa(s) reconocidas.
        </p>
        {sections.map((section) => (
          <details
            key={section.fidelity}
            open={section.open}
            data-testid={`cad-${format}-import-${section.fidelity}`}
            className="mt-2"
          >
            <summary
              className={`cursor-pointer text-xs uppercase tracking-wide ${SECTION_CLASS[section.fidelity]}`}
            >
              {section.title} · {section.count}
            </summary>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
              {section.rows.map((row) => (
                <li key={row.code}>{row.detail}</li>
              ))}
            </ul>
          </details>
        ))}
        {/*
        La frase final no es relleno. Un arquitecto que acaba de leer que perdió
        tres entidades necesita saber qué hacer, y la respuesta honesta es
        conservar el original: este documento ya no lo sustituye.
      */}
        {report.hasLosses && (
          <p className="mt-2 text-xs opacity-80">
            Conserva el archivo original: este dibujo ya no lo reemplaza.
          </p>
        )}
      </section>
    );
  },
);
