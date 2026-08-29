"use client";

import { CircleAlert, CircleCheck, FileDown } from "lucide-react";
import type {
  CadDxfExportLayerSummary,
  CadDxfExportReadinessIssue,
} from "@/lib/cad/dxf-export-readiness";
import type { CadLossManifestEntry } from "@/lib/cad/cad-document";
import { CadDialogShell } from "./CadDialogShell";

/**
 * EXPORTAR DXF, FUERA DEL MONOLITO.
 *
 * Doscientas sesenta y tres líneas: las opciones del fichero, el resumen de lo
 * que sale, las capas incluidas, los avisos de exportabilidad y —lo importante—
 * el MANIFIESTO DE PÉRDIDAS, que se enseña ANTES de descargar y no después.
 *
 * ## Por qué el manifiesto va aquí y no en el editor
 *
 * Porque la decisión de exportar «de todos modos» es del usuario, y este cuadro
 * es donde la toma. El editor calcula qué se pierde; este componente lo pone
 * delante y no deja pulsar el botón hasta que quien mira haya aceptado el
 * token concreto de esa comprobación. El token importa: aceptar unas pérdidas
 * no acepta las siguientes, porque el dibujo cambió entre medias.
 */

/** Opciones del fichero que se va a escribir. */
export interface CadDxfExportOptions {
  scope: "all" | "selection";
  includeHidden: boolean;
  includeMeasurements: boolean;
  includeLabels: boolean;
  units: "mm" | "m";
  fileName: string;
}

/** Lo que va a salir, ya contado por el editor. */
export interface CadDxfExportSummary {
  objects: number;
  connectors: number;
  measurements: number;
  labels: number;
  layers: number;
  canExport: boolean;
  includedLayers: string[];
  layerSummary: CadDxfExportLayerSummary[];
  issues: CadDxfExportReadinessIssue[];
}

/** La comprobación previa, con su token de aceptación. */
export interface CadDxfPreflight {
  token: string;
  losses: CadLossManifestEntry[];
  blocking: boolean;
}

export function CadDxfExportDialog({
  onClose,
  opciones,
  onOpcionChange,
  resumen,
  filasDeCapa,
  filasDeAviso,
  preflight,
  preflightAceptado,
  onAceptarPreflight,
  onExportar,
}: {
  onClose: () => void;
  opciones: CadDxfExportOptions;
  /** Parche parcial: el editor recalcula el resumen al aplicarlo. */
  onOpcionChange: (parche: Partial<CadDxfExportOptions>) => void;
  resumen: CadDxfExportSummary;
  filasDeCapa: CadDxfExportLayerSummary[];
  filasDeAviso: CadDxfExportReadinessIssue[];
  preflight: CadDxfPreflight | null;
  preflightAceptado: string | null;
  onAceptarPreflight: (token: string | null) => void;
  onExportar: (opciones: CadDxfExportOptions) => void;
}) {
  return (
    <CadDialogShell
      id="cad-exportar-dxf"
      onClose={onClose}
      icon={<FileDown className="h-4 w-4 text-primary-ink" />}
      titulo="Exportar DXF"
      insignia={
        <span
          className={`rounded-full px-2 py-0.5 type-micro font-semibold ${resumen.canExport ? "bg-emerald-400/10 text-success-ink" : "bg-rose-400/10 text-danger-ink"}`}
        >
          {resumen.canExport ? "Listo" : "Bloqueado"}
        </span>
      }
      ancho="w-[520px]"
      alto="max-h-[82vh] overflow-y-auto"
    >
      <div className="space-y-3 p-4 type-caption">
        <label className="block text-muted-foreground dark:text-muted-foreground">
          Nombre de archivo
          <input
            value={opciones.fileName}
            onChange={(e) => onOpcionChange({ fileName: e.target.value })}
            className="mt-1 w-full rounded-lg border border-border bg-surface/80 px-2.5 py-2 text-foreground outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="rounded-lg bg-muted/40 p-2 text-foreground">
            <span className="mb-1 block text-muted-foreground">
              Alcance
            </span>
            <select
              value={opciones.scope}
              onChange={(e) =>
                onOpcionChange({
                  scope: e.target.value as CadDxfExportOptions["scope"],
                })
              }
              className="w-full bg-transparent text-foreground outline-none"
            >
              <option className="text-foreground" value="all">
                Todo
              </option>
              <option className="text-foreground" value="selection">
                Selección
              </option>
            </select>
          </label>
          <label className="rounded-lg bg-muted/40 p-2 text-foreground">
            <span className="mb-1 block text-muted-foreground">
              Unidades
            </span>
            <select
              value={opciones.units}
              onChange={(e) =>
                onOpcionChange({
                  units: e.target.value as CadDxfExportOptions["units"],
                })
              }
              className="w-full bg-transparent text-foreground outline-none"
            >
              <option className="text-foreground" value="mm">
                mm
              </option>
              <option className="text-foreground" value="m">
                m
              </option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["includeHidden", "Incluir capas ocultas"],
              ["includeMeasurements", "Incluir cotas"],
              ["includeLabels", "Incluir notas"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="inline-flex items-center gap-2 rounded-lg bg-muted/40 px-2 py-1.5 text-foreground"
            >
              <input
                type="checkbox"
                checked={opciones[key]}
                onChange={(e) =>
                  onOpcionChange({ [key]: e.target.checked })
                }
                className="accent-indigo-500"
              />
              {label}
            </label>
          ))}
        </div>
        <div className="rounded-xl border border-indigo-400/15 bg-indigo-400/[0.05] p-3">
          <div className="mb-2 type-micro font-semibold uppercase tracking-wide text-primary-ink">
            Resumen
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-foreground">
            <span>Objetos</span>
            <b className="text-right">{resumen.objects}</b>
            <span>Conectores</span>
            <b className="text-right">{resumen.connectors}</b>
            <span>Cotas</span>
            <b className="text-right">{resumen.measurements}</b>
            <span>Notas</span>
            <b className="text-right">{resumen.labels}</b>
            <span>Capas</span>
            <b className="text-right">{resumen.layers}</b>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="type-micro font-semibold uppercase tracking-wide text-primary-ink">
              Paquete de capas
            </div>
            <span className="type-micro text-muted-foreground">
              {resumen.includedLayers.join(" · ") || "Sin capas"}
            </span>
          </div>
          {filasDeCapa.length ? (
            <div className="space-y-1">
              {filasDeCapa.map((layer) => (
                <div
                  key={layer.layer}
                  className="flex items-center justify-between gap-2 rounded-lg bg-surface/80 px-2 py-1.5 type-micro"
                >
                  <span className="truncate text-foreground">
                    {layer.layer}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {layer.included}/{layer.total} incl.
                    {layer.hidden ? ` · ${layer.hidden} ocultas` : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-surface/80 px-2 py-1.5 type-micro text-muted-foreground">
              No hay entidades exportables con estas opciones.
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <div className="mb-2 type-micro font-semibold uppercase tracking-wide text-primary-ink">
            Preflight
          </div>
          {filasDeAviso.length ? (
            <div className="space-y-1">
              {filasDeAviso.map((issue) => (
                <div
                  key={issue.code}
                  className={`flex items-start gap-2 rounded-lg px-2 py-1.5 type-micro ${issue.level === "blocker" ? "bg-rose-400/10 text-rose-100" : issue.level === "warning" ? "bg-amber-400/10 text-warning-ink" : "bg-muted/40 text-foreground"}`}
                >
                  {issue.level === "blocker" ? (
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : issue.level === "warning" ? (
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    {issue.message}
                    {issue.count ? ` (${issue.count})` : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-400/10 px-2 py-1.5 type-micro text-success-ink">
              <CircleCheck className="h-3.5 w-3.5" />
              DXF listo para descargar.
            </div>
          )}
        </div>
        {/* MANIFIESTO DE PÉRDIDAS — se muestra ANTES de descargar, no
            después. Cada fila dice qué entidad, de qué gravedad y por
            qué, para que la decisión sea informada y no un mensaje que
            llega cuando el fichero ya está en la carpeta de descargas. */}
        {preflight && (
          <div
            data-testid="cad-dxf-loss-manifest"
            data-blocking={preflight.blocking ? "true" : "false"}
            data-losses={preflight.losses.length}
            className={`space-y-1.5 rounded-lg border px-2 py-2 type-micro ${preflight.blocking ? "border-rose-400/30 bg-rose-400/10 text-rose-100" : "border-amber-400/30 bg-amber-400/10 text-warning-ink"}`}
          >
            <div className="font-semibold">
              {preflight.blocking
                ? "Este DXF perdería geometría"
                : "Este DXF degrada parte del dibujo"}
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {preflight.losses.slice(0, 40).map((loss, index) => (
                <div
                  key={`${loss.code}:${loss.entityId ?? index}`}
                  data-testid="cad-dxf-loss-row"
                  className="flex items-start gap-1.5"
                >
                  <span className="mt-0.5 shrink-0 font-mono type-micro uppercase opacity-70">
                    {loss.severity}
                  </span>
                  <span className="min-w-0 flex-1">
                    {loss.entityId ? (
                      <b className="font-mono type-micro">
                        {loss.entityId}
                      </b>
                    ) : null}{" "}
                    {loss.detail}
                  </span>
                </div>
              ))}
              {preflight.losses.length > 40 && (
                <div className="opacity-70">
                  …y {preflight.losses.length - 40} más.
                </div>
              )}
            </div>
            <label className="flex items-start gap-1.5">
              <input
                data-testid="cad-dxf-loss-accept"
                type="checkbox"
                checked={preflightAceptado === preflight.token}
                onChange={(event) =>
                  onAceptarPreflight(
                    event.target.checked ? preflight.token : null,
                  )
                }
                className="mt-0.5"
              />
              <span>
                Entiendo lo que este DXF no representa y quiero
                descargarlo igualmente. El documento de Valle Design sigue
                siendo el original.
              </span>
            </label>
          </div>
        )}
        <button
          data-testid="cad-dxf-download"
          disabled={
            !resumen.canExport ||
            (preflight?.blocking === true &&
              preflightAceptado !== preflight.token)
          }
          onClick={() => onExportar(opciones)}
          className={`w-full rounded-lg px-3 py-2 type-caption font-semibold text-foreground ${resumen.canExport && !(preflight?.blocking === true && preflightAceptado !== preflight.token) ? "bg-indigo-600 hover:bg-indigo-500" : "cursor-not-allowed bg-gray-700 text-muted-foreground dark:text-muted-foreground"}`}
        >
          {preflight && preflightAceptado === preflight.token
            ? "Descargar DXF de todos modos"
            : "Descargar DXF"}
        </button>
      </div>
    </CadDialogShell>
  );
}
