"use client";

import { ClipboardList, Copy } from "lucide-react";
import type { CadLayerId } from "@/lib/cad/layers";
import type { CadArchitectureTakeoffSummary } from "@/lib/cad/architecture";
import { Stat } from "../studio/field-controls";
import { fmtArea, fmtLen } from "../studio/format-units";
import { CadDialogShell } from "./CadDialogShell";

/**
 * EL PANEL DE CANTIDADES, FUERA DEL MONOLITO.
 *
 * Doscientas noventa y ocho líneas de JSX que sólo leían un objeto —el
 * `LocalTakeoff` que el editor calcula— y llamaban a dos formateadores. Era el
 * más extraíble de los cinco cuadros grandes que quedaban, y por eso salió
 * primero: la costura ya estaba, sólo había que nombrarla.
 *
 * ## El contrato
 *
 * Recibe el recuento ya calculado y dos devoluciones de llamada para el
 * resultado de copiar. NO calcula nada, NO lee estado del editor y NO conoce el
 * portapapeles como efecto del editor: copiar es cosa suya, avisar es cosa de
 * quien lo monta. Por eso el aviso llega como `onCopiado` / `onFalloAlCopiar` en
 * vez de un `toast` importado — un componente de presentación que decide cómo
 * se avisa al usuario es un componente que no se puede reusar ni probar.
 *
 * ## Lo que no cambia
 *
 * El marcado es el mismo línea por línea. Lo que gana, por venir de
 * `CadDialogShell`: `role="dialog"`, título anunciado y cierre con Escape.
 */

/** El recuento en vivo que calcula el editor. */
export interface CadLocalTakeoff {
  unit: string;
  footprintArea: number;
  totalStations: number;
  placedStations: number;
  stationArea: number;
  equipmentCount: number;
  equipArea: number;
  usedArea: number;
  util: number;
  wallLen: number;
  dimCount: number;
  architecture: CadArchitectureTakeoffSummary;
  byKind: { kind: string; label: string; count: number; area: number }[];
  byLayer: { id: CadLayerId; label: string; count: number; area: number }[];
}

export function CadTakeoffDialog({
  takeoff,
  onClose,
  model,
  revision,
  onCopiado,
  onFalloAlCopiar,
}: {
  takeoff: CadLocalTakeoff;
  onClose: () => void;
  model: string;
  revision: string;
  onCopiado: () => void;
  onFalloAlCopiar: () => void;
}) {
  return (
    <CadDialogShell
      id="cad-cantidades"
      onClose={onClose}
      icon={<ClipboardList className="w-4 h-4" />}
      titulo={`Cantidades · ${model} · ${revision}`}
      ancho="w-[420px]"
      alto="max-h-[80vh] overflow-y-auto"
    >
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Stat
            label="Puntos"
            value={`${takeoff.placedStations}/${takeoff.totalStations}`}
          />
          <Stat label="Equipos" value={`${takeoff.equipmentCount}`} />
          <Stat
            label="Área huella"
            value={fmtArea(takeoff.footprintArea, takeoff.unit)}
          />
          <Stat
            label="Aprovechamiento"
            value={`${takeoff.util.toFixed(1)} %`}
            highlight
          />
          <Stat
            label="Área usada"
            value={fmtArea(takeoff.usedArea, takeoff.unit)}
          />
          <Stat
            label="Muro total"
            value={fmtLen(takeoff.wallLen, takeoff.unit)}
          />
          <Stat
            label="Cuartos"
            value={`${takeoff.architecture.roomCount} - ${fmtArea(takeoff.architecture.roomArea, takeoff.unit)}`}
          />
          <Stat
            label="Piso libre"
            value={fmtArea(
              takeoff.architecture.openFloorArea,
              takeoff.unit,
            )}
          />
          <Stat
            label="Pasillos"
            value={fmtArea(takeoff.architecture.aisleArea, takeoff.unit)}
          />
          <Stat
            label="Safety/no-go"
            value={fmtArea(takeoff.architecture.safetyArea, takeoff.unit)}
          />
          <Stat
            label="Utilidades"
            value={`${takeoff.architecture.utilityCount} - ${fmtArea(takeoff.architecture.utilityArea, takeoff.unit)}`}
          />
          <Stat
            label="Puertas/cols"
            value={`${takeoff.architecture.doorCount}/${takeoff.architecture.columnCount}`}
          />
        </div>
        {takeoff.byKind.length > 0 ? (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full type-caption">
              <thead>
                <tr className="text-muted-foreground dark:text-muted-foreground bg-muted/40">
                  <th className="text-left font-medium px-3 py-1.5">
                    Equipo
                  </th>
                  <th className="text-right font-medium px-3 py-1.5">
                    Cant.
                  </th>
                  <th className="text-right font-medium px-3 py-1.5">
                    Área
                  </th>
                </tr>
              </thead>
              <tbody>
                {takeoff.byKind.map((r) => (
                  <tr key={r.kind} className="border-t border-border">
                    <td className="px-3 py-1.5">{r.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.count}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground dark:text-muted-foreground">
                      {fmtArea(r.area, takeoff.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="type-caption text-muted-foreground text-center py-3">
            Aún no hay equipo en el layout.
          </p>
        )}
        {takeoff.byLayer.length > 0 && (
          <div className="mt-3 rounded-xl border border-border overflow-hidden">
            <div className="bg-muted/40 px-3 py-1.5 type-micro font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
              Uso por capa CAD
            </div>
            <table className="w-full type-caption">
              <tbody>
                {takeoff.byLayer.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-1.5">{r.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.count}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground dark:text-muted-foreground">
                      {fmtArea(r.area, takeoff.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {takeoff.architecture.byRoomUse.length > 0 && (
          <div className="mt-3 rounded-xl border border-border overflow-hidden">
            <div className="bg-muted/40 px-3 py-1.5 type-micro font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
              Áreas por uso
            </div>
            <table className="w-full type-caption">
              <tbody>
                {takeoff.architecture.byRoomUse.map((r) => (
                  <tr key={r.key} className="border-t border-border">
                    <td className="px-3 py-1.5">{r.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.count}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground dark:text-muted-foreground">
                      {fmtArea(r.area, takeoff.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {takeoff.architecture.byDepartment.length > 0 && (
          <div className="mt-3 rounded-xl border border-border overflow-hidden">
            <div className="bg-muted/40 px-3 py-1.5 type-micro font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
              Áreas por departamento
            </div>
            <table className="w-full type-caption">
              <tbody>
                {takeoff.architecture.byDepartment.map((r) => (
                  <tr key={r.key} className="border-t border-border">
                    <td className="px-3 py-1.5">{r.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.count}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground dark:text-muted-foreground">
                      {fmtArea(r.area, takeoff.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between mt-3">
          <span className="type-micro text-muted-foreground">
            {takeoff.dimCount} {takeoff.dimCount === 1 ? "cota" : "cotas"}
          </span>
          <button
            onClick={() => {
              const rows = [["Concepto", "Cantidad", "Área (m²)"]];
              takeoff.byKind.forEach((r) =>
                rows.push([
                  r.label,
                  String(r.count),
                  fmtArea(r.area, takeoff.unit).replace(" m²", ""),
                ]),
              );
              rows.push(["--- Capas CAD ---", "", ""]);
              takeoff.byLayer.forEach((r) =>
                rows.push([
                  `Capa: ${r.label}`,
                  String(r.count),
                  fmtArea(r.area, takeoff.unit).replace(" m²", ""),
                ]),
              );
              rows.push([
                "Puntos colocados",
                `${takeoff.placedStations}/${takeoff.totalStations}`,
                fmtArea(takeoff.stationArea, takeoff.unit).replace(
                  " m²",
                  "",
                ),
              ]);
              rows.push([
                "Aprovechamiento",
                `${takeoff.util.toFixed(1)}%`,
                "",
              ]);
              rows.push([
                "Muro total",
                fmtLen(takeoff.wallLen, takeoff.unit),
                "",
              ]);
              rows.push([
                "Cuartos",
                `${takeoff.architecture.roomCount}`,
                fmtArea(
                  takeoff.architecture.roomArea,
                  takeoff.unit,
                ).replace(" m²", ""),
              ]);
              rows.push([
                "Piso libre",
                "",
                fmtArea(
                  takeoff.architecture.openFloorArea,
                  takeoff.unit,
                ).replace(" m²", ""),
              ]);
              rows.push([
                "Pasillos",
                "",
                fmtArea(
                  takeoff.architecture.aisleArea,
                  takeoff.unit,
                ).replace(" m²", ""),
              ]);
              rows.push([
                "Safety/no-go",
                "",
                fmtArea(
                  takeoff.architecture.safetyArea,
                  takeoff.unit,
                ).replace(" m²", ""),
              ]);
              rows.push([
                "Utilidades",
                `${takeoff.architecture.utilityCount}`,
                fmtArea(
                  takeoff.architecture.utilityArea,
                  takeoff.unit,
                ).replace(" m²", ""),
              ]);
              rows.push([
                "Puertas",
                `${takeoff.architecture.doorCount}`,
                "",
              ]);
              rows.push([
                "Columnas",
                `${takeoff.architecture.columnCount}`,
                "",
              ]);
              rows.push(["--- Uso de cuartos ---", "", ""]);
              takeoff.architecture.byRoomUse.forEach((r) =>
                rows.push([
                  `Uso: ${r.label}`,
                  String(r.count),
                  fmtArea(r.area, takeoff.unit).replace(" m²", ""),
                ]),
              );
              rows.push(["--- Departamentos ---", "", ""]);
              takeoff.architecture.byDepartment.forEach((r) =>
                rows.push([
                  `Dept: ${r.label}`,
                  String(r.count),
                  fmtArea(r.area, takeoff.unit).replace(" m²", ""),
                ]),
              );
              const csv = rows.map((r) => r.join(",")).join("\n");
              navigator.clipboard?.writeText(csv).then(
                () => onCopiado(),
                () => onFalloAlCopiar(),
              );
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/60 hover:bg-muted type-caption"
          >
            <Copy className="w-3.5 h-3.5" /> Copiar CSV
          </button>
        </div>
      </div>
    </CadDialogShell>
  );
}
