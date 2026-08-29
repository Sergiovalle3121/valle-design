"use client";

import { History, Trash2 } from "lucide-react";
import { CadDialogShell } from "./CadDialogShell";

/**
 * VERSIONES Y SNAPSHOTS LOCALES, FUERA DEL MONOLITO.
 *
 * Ciento cuarenta y nueve líneas que pintaban dos listas —las versiones que
 * viven en el servidor y los puntos de restauración que no salen del
 * navegador— y disparaban ocho acciones del editor. Ninguna decisión, ningún
 * cálculo: presentación pura con un contrato explícito.
 *
 * ## Por qué las dos listas van juntas
 *
 * Porque para el usuario son la misma pregunta: «¿puedo volver atrás?». Una
 * versión sobrevive a cerrar el navegador y la otra no, y eso se dice en la
 * propia tarjeta («No salen del navegador»), pero separarlas en dos cuadros
 * obligaría a saber de antemano cuál de los dos mecanismos usó uno hace veinte
 * minutos.
 */

/** Un punto de restauración local, tal como lo pinta la lista. */
export interface CadLocalSnapshotView {
  id: string;
  label: string;
  createdAt: string | number;
  reason: string;
}

/** Una versión guardada en el servidor. */
export interface CadVersionView {
  id: string;
  name?: string | null;
  createdAt: string | number;
  stationCount: number;
  assetCount: number;
}

/** El resultado de comparar contra un snapshot. */
export interface CadSnapshotDiffView {
  changed: boolean;
  beforeHash: string;
  afterHash: string;
}

export function CadVersionsDialog({
  onClose,
  model,
  revision,
  versName,
  onVersNameChange,
  onSaveVersion,
  guardadoBloqueado,
  ocupado,
  onSaveLocalSnapshot,
  snapshots,
  snapshotDiff,
  onCompareSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  versions,
  onRestoreVersion,
  onDeleteVersion,
}: {
  onClose: () => void;
  model: string;
  revision: string;
  versName: string;
  onVersNameChange: (valor: string) => void;
  onSaveVersion: () => void;
  /** El documento está en sólo lectura: guardar versión se deshabilita. */
  guardadoBloqueado: boolean;
  ocupado: boolean;
  onSaveLocalSnapshot: () => void;
  snapshots: readonly CadLocalSnapshotView[];
  snapshotDiff: CadSnapshotDiffView | null;
  onCompareSnapshot: (id: string) => void;
  onRestoreSnapshot: (id: string) => void;
  onDeleteSnapshot: (id: string) => void;
  versions: readonly CadVersionView[];
  onRestoreVersion: (id: string) => void;
  onDeleteVersion: (id: string) => void;
}) {
  return (
    <CadDialogShell
      id="cad-versiones"
      onClose={onClose}
      icon={<History className="w-4 h-4" />}
      titulo={`Versiones · ${model} · ${revision}`}
      ancho="w-[460px]"
      alto="max-h-[80vh] overflow-y-auto"
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            value={versName}
            onChange={(e) => onVersNameChange(e.target.value)}
            placeholder="Nombre de la versión/snapshot (opcional)"
            className="flex-1 bg-muted/60 rounded-lg px-2.5 py-1.5 type-small outline-none focus:ring-1 ring-indigo-500/40"
          />
          <button
            onClick={onSaveVersion}
            disabled={guardadoBloqueado || ocupado}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-brand-strong text-primary-foreground type-caption font-medium disabled:opacity-50"
          >
            Guardar versión
          </button>
          <button
            onClick={onSaveLocalSnapshot}
            className="px-3 py-1.5 rounded-lg bg-muted/60 hover:bg-muted text-foreground type-caption font-medium"
          >
            Snapshot local
          </button>
        </div>
        <div className="mb-4 rounded-xl border border-indigo-400/15 bg-indigo-400/[0.04] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="type-micro font-semibold uppercase tracking-wide text-primary-ink">
              Snapshots locales de sesión
            </div>
            <span className="type-micro text-muted-foreground">
              {snapshots.length}/20
            </span>
          </div>
          {snapshotDiff && (
            <div
              className={`mb-2 rounded-lg px-2 py-1.5 type-micro ${snapshotDiff.changed ? "bg-amber-400/10 text-warning-ink" : "bg-emerald-400/10 text-success-ink"}`}
            >
              Comparación:{" "}
              {snapshotDiff.changed
                ? "hay cambios vs snapshot"
                : "sin cambios"}{" "}
              · {snapshotDiff.beforeHash} → {snapshotDiff.afterHash}
            </div>
          )}
          {snapshots.length === 0 ? (
            <p className="type-micro text-muted-foreground">
              Guarda puntos de restauración rápidos antes de importar,
              acomodar o probar comandos. No salen del navegador.
            </p>
          ) : (
            <div className="space-y-1.5">
              {[...snapshots].reverse().map((snap) => (
                <div
                  key={snap.id}
                  className="flex items-center gap-2 rounded-lg bg-muted/40 px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate type-caption font-medium text-foreground">
                      {snap.label}
                    </div>
                    <div className="type-micro text-muted-foreground">
                      {new Date(snap.createdAt).toLocaleString("es-MX")} ·{" "}
                      {snap.reason}
                    </div>
                  </div>
                  <button
                    onClick={() => onCompareSnapshot(snap.id)}
                    className="rounded-md bg-muted/60 px-2 py-1 type-micro text-foreground hover:bg-muted"
                  >
                    Comparar
                  </button>
                  <button
                    onClick={() => onRestoreSnapshot(snap.id)}
                    className="rounded-md bg-indigo-500/15 px-2 py-1 type-micro text-primary-ink hover:bg-indigo-500/25"
                  >
                    Restaurar
                  </button>
                  <button
                    onClick={() => onDeleteSnapshot(snap.id)}
                    className="rounded-md px-1.5 py-1 text-danger-ink hover:bg-rose-500/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {versions.length === 0 ? (
          <p className="type-caption text-muted-foreground text-center py-4">
            Aún no hay versiones guardadas.
          </p>
        ) : (
          <div className="space-y-1.5">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="type-small font-medium truncate">
                    {v.name || "Sin nombre"}
                  </div>
                  <div className="type-micro text-muted-foreground dark:text-muted-foreground">
                    {new Date(v.createdAt).toLocaleString("es-MX")} ·{" "}
                    {v.stationCount} est · {v.assetCount} eq
                  </div>
                </div>
                <button
                  onClick={() => onRestoreVersion(v.id)}
                  disabled={ocupado}
                  className="px-2 py-1 rounded-md bg-muted/60 hover:bg-muted type-caption disabled:opacity-50"
                >
                  Restaurar
                </button>
                <button
                  onClick={() => onDeleteVersion(v.id)}
                  className="p-1 rounded-md text-danger-ink hover:bg-rose-500/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </CadDialogShell>
  );
}
