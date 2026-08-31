"use client";

import type { RefObject } from "react";
import {
  CadDiagnosticsReadout,
} from "@/components/cad/editor/CadDiagnosticsReadout";
import {
  CadRenderPipelineBadge,
  CadRenderPipelineStats,
} from "@/components/cad/viewport/RenderPipelineBadge";
import { Cad3DSolidDiagnostics } from "@/components/cad/viewport/Cad3DSolidDiagnostics";
import { CadNativeMassHosts } from "@/components/cad/viewport/native-mass-hosts";
import { CadRenderHostSlot } from "@/components/cad/viewport/render-pipeline-host";
import type { CadRenderPipelineChoice } from "@/lib/cad/render-pipeline-preference";
import { CadSaveStatus } from "./CadSaveStatus";
import { cadConflictIncidentLabel } from "@/lib/cad/cad-conflict-incident";
import type { AutosaveStatus } from "@/components/cad/document-lifecycle/autosave";
import { CadDraftStatusBar } from "@/components/cad/palettes/CadDraftStatusBar";
import { CAD_POLAR_INCREMENTS } from "@/components/cad/palettes/draft-settings-host";
import {
  useCadDraftSettings,
  useCadDraftSettingsHost,
  useCadPaletteHost,
} from "@/components/cad/palettes/use-palettes";
import { summarizeCadLayers, type CadLayer, type CadLayerId } from "@/lib/cad/layers";
import type { DesignReport } from "@/lib/cad/design-checks";
import type { CadValidationReport } from "@/lib/cad/validation-report";

/**
 * LA BARRA DE ESTADO. Extraída de `Layout3DEditor.tsx` (ver
 * `docs/execution/DEUDA-MONOLITO.md`, candidato "la barra de estado y los
 * conmutadores"): ~40 identificadores del cierre agrupados en objetos con
 * nombre, no un componente de cuarenta props sueltas — el mismo patrón que ya
 * usa `CadPaletteOverlays` para las paletas montadas.
 *
 * Invariante: ningún `data-testid` se movió, ningún texto cambió. Es la misma
 * marca de esta pieza, sólo que ahora vive fuera del trinquete de tamaño.
 */

export interface CadStatusBarDiagnostics {
  enabled: boolean;
  tool: string;
  selectionCount: number;
  nativeEntityCount: number;
  renderPipelineRef: RefObject<CadRenderPipelineChoice>;
  renderPipelineSlotRef: RefObject<CadRenderHostSlot | null>;
  nativeMassHostsRef: RefObject<CadNativeMassHosts | null>;
  historyUndo: number;
  historyRedo: number;
  nativeRenderStats: {
    total: number;
    visible: number;
    rendered: number;
    omitted: number;
    batching: boolean;
  };
}

export interface CadStatusBarDocumentInfo {
  model: string;
  revision: string;
  version: number;
}

export interface CadStatusBarSaveState {
  saving: boolean;
  dirty: boolean;
  saveStatus: AutosaveStatus;
  saveIssue: {
    kind: "conflict" | "offline" | "server";
    message: string;
    serverVersion?: number;
  } | null;
  documentId: string | null | undefined;
  recoverySavedAt: string | null;
  recoveryWarning: string | null;
  connectionState: "checking" | "online" | "offline";
}

export interface CadStatusBarLayersInfo {
  cadLayers: CadLayer[];
  activeCadLayer: CadLayerId;
  cadLayerSummary: ReturnType<typeof summarizeCadLayers>;
  gridOn: boolean;
  snapOn: boolean;
}

export interface CadStatusBarValidation {
  onOpenChecks: () => void;
  releaseTone: string;
  releaseState: string;
  report: DesignReport | null;
  cadValidationReport: CadValidationReport | null;
  clearanceIssuesCount: number;
  safetyIssuesCount: number;
  validationHighlightCount: number;
  onClearHighlights: () => void;
}

export interface CadStatusBarMisc {
  dxfWarningsCount: number;
  snapshotsCount: number;
}

export interface CadStatusBarProps {
  diagnostics: CadStatusBarDiagnostics;
  unit: string;
  cursorCoordinateRef: RefObject<HTMLSpanElement | null>;
  documentInfo: CadStatusBarDocumentInfo;
  saveState: CadStatusBarSaveState;
  layersInfo: CadStatusBarLayersInfo;
  draftSettings: ReturnType<typeof useCadDraftSettings>;
  draftSettingsHost: ReturnType<typeof useCadDraftSettingsHost>;
  paletteHost: ReturnType<typeof useCadPaletteHost>;
  validation: CadStatusBarValidation;
  misc: CadStatusBarMisc;
}

export function CadStatusBar({
  diagnostics,
  unit,
  cursorCoordinateRef,
  documentInfo,
  saveState,
  layersInfo,
  draftSettings,
  draftSettingsHost,
  paletteHost,
  validation,
  misc,
}: CadStatusBarProps) {
  const nativeRenderStats = diagnostics.nativeRenderStats;
  return (
    <div className="cad-status-bar absolute bottom-3 right-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/80 px-3 py-1.5 type-micro text-foreground shadow-xl backdrop-blur">
      {/* 5.2 · Lo que sigue es telemetría de DESARROLLADOR: qué
          herramienta está activa, cuántas entidades nativas hay, qué
          pipeline dibuja y cuánta profundidad tiene el historial. Un
          arquitecto no puede hacer nada con ninguna de las cuatro, y
          la barra de estado de un CAD se mira cien veces por sesión.

          NO se borra: dieciséis goldens la leen por `textContent` y
          por atributo, y es la forma más barata de afirmar que una
          acción de dibujo dejó exactamente una entrada de historial.
          Se esconde tras `?cadDiag=1`. Ver CadDiagnosticsReadout. */}
      <CadDiagnosticsReadout enabled={diagnostics.enabled}>
        <span className="text-primary-ink">Tool: {diagnostics.tool}</span>
        <span data-testid="cad-selection-status-count">
          {diagnostics.selectionCount} sel
        </span>
        <span
          data-testid="cad-native-document-count"
          title="Entidades nativas en el documento canónico"
        >
          Native {diagnostics.nativeEntityCount}
        </span>
        {/* QUÉ pipeline dibuja y CUÁNTO lleva materializado. El benchmark
          midió un camino que el producto no ejecutaba; publicarlo en el
          DOM es lo que impide que vuelva a pasar sin que nadie lo note. */}
        <CadRenderPipelineBadge
          pipeline={diagnostics.renderPipelineRef.current}
          slot={diagnostics.renderPipelineSlotRef.current!}
        />
        {diagnostics.renderPipelineRef.current === "batched" && (
          <CadRenderPipelineStats slot={diagnostics.renderPipelineSlotRef.current!} />
        )}
        <Cad3DSolidDiagnostics hostsRef={diagnostics.nativeMassHostsRef} />
        {/* La profundidad del historial es OBSERVABLE: una acción de
          dibujo tiene que dejar exactamente una entrada, y una acción
          rechazada ninguna. Sin esto, "el primer Undo no deshace nada"
          sólo se nota a mano. */}
        <span
          data-testid="cad-history-depth"
          data-undo={diagnostics.historyUndo}
          data-redo={diagnostics.historyRedo}
          title="Profundidad de deshacer/rehacer"
        >
          U{diagnostics.historyUndo}/R{diagnostics.historyRedo}
        </span>
        {/* El indicador HEREDADO. Con el pipeline por lotes lo sirve
          `CadRenderPipelineStats` con las cifras del índice de tiles;
          aquí se apaga para que el `data-testid` no salga dos veces. */}
        {diagnostics.renderPipelineRef.current !== "batched" &&
          nativeRenderStats.omitted > 0 && (
            <span
              data-testid="cad-native-render-stats"
              data-total={nativeRenderStats.total}
              data-visible={nativeRenderStats.visible}
              data-rendered={nativeRenderStats.rendered}
              data-batching={nativeRenderStats.batching ? "true" : "false"}
              className="text-warning-ink"
              title={`${nativeRenderStats.visible.toLocaleString()} entidades en bounds visibles; ${nativeRenderStats.omitted.toLocaleString()} permanecen sólo en overview/canónico`}
            >
              Viewport {nativeRenderStats.rendered.toLocaleString()}/
              {nativeRenderStats.visible.toLocaleString()} visibles ·{" "}
              {nativeRenderStats.total.toLocaleString()} total
              {nativeRenderStats.batching ? " · cargando…" : ""}
            </span>
          )}
      </CadDiagnosticsReadout>
      <span>{unit}</span>
      <span
        ref={cursorCoordinateRef}
        data-testid="cad-cursor-coordinate"
        data-x=""
        data-y=""
        className="font-mono tabular-nums"
        title="Coordenadas del cursor en el dibujo"
      >
        X — · Y —
      </span>
      <span title="Modelo, revisión funcional y versión CAS">
        {documentInfo.model} · {documentInfo.revision} · v{documentInfo.version}
      </span>
      <CadSaveStatus
        saving={saveState.saving}
        dirty={saveState.dirty}
        scheduled={saveState.saveStatus === "scheduled"}
        issue={saveState.saveIssue}
        issueLabel={cadConflictIncidentLabel({
          documentId: saveState.documentId ?? "",
          baseVersion: 0,
          serverVersion:
            saveState.saveIssue?.kind === "conflict"
              ? (saveState.saveIssue.serverVersion ?? null)
              : null,
        })}
      />
      {saveState.dirty && saveState.recoverySavedAt && (
        <span className="text-primary-ink" title={saveState.recoverySavedAt}>
          Recovery local activo
        </span>
      )}
      {saveState.dirty && saveState.recoveryWarning && (
        <span className="text-danger-ink" title={saveState.recoveryWarning}>
          Recovery local en riesgo
        </span>
      )}
      <span
        className={
          saveState.connectionState === "online"
            ? "text-success-ink"
            : saveState.connectionState === "offline"
              ? "text-danger-ink"
              : "text-muted-foreground"
        }
      >
        {saveState.connectionState === "online"
          ? "API online"
          : saveState.connectionState === "offline"
            ? "API offline"
            : "API…"}
      </span>
      <span>
        Layer{" "}
        {layersInfo.cadLayers.find((layer) => layer.id === layersInfo.activeCadLayer)
          ?.label ?? layersInfo.activeCadLayer}
      </span>
      {layersInfo.cadLayerSummary.hiddenObjectCount > 0 && (
        <span className="text-warning-ink">
          Objetos en capas ocultas {layersInfo.cadLayerSummary.hiddenObjectCount}
        </span>
      )}
      {layersInfo.cadLayerSummary.lockedObjectCount > 0 && (
        <span className="text-warning-ink">
          Objetos en capas bloqueadas{" "}
          {layersInfo.cadLayerSummary.lockedObjectCount}
        </span>
      )}
      <span>
        Grilla {layersInfo.gridOn ? "on" : "off"} / Snap{" "}
        {layersInfo.snapOn ? "grid" : "free"}
      </span>
      <CadDraftStatusBar
        settings={draftSettings}
        polarIncrements={CAD_POLAR_INCREMENTS}
        onToggleOsnap={draftSettingsHost.toggleOsnap}
        onToggleOrtho={draftSettingsHost.toggleOrtho}
        onTogglePolar={draftSettingsHost.togglePolar}
        onPolarIncrement={draftSettingsHost.setPolarIncrement}
        onToggleObjectSnapTracking={draftSettingsHost.toggleObjectSnapTracking}
        onClearTracking={draftSettingsHost.clearTrackingPoints}
        onOpenSettings={paletteHost.toggleDraftSettings}
        onOpenStyles={paletteHost.toggleStyles}
      />
      <button
        onClick={validation.onOpenChecks}
        className={`${validation.releaseTone} hover:text-foreground`}
      >
        Release {validation.releaseState}
      </button>
      {validation.report && (
        <span
          className={
            validation.report.score === "error"
              ? "text-danger-ink"
              : validation.report.score === "warn"
                ? "text-warning-ink"
                : "text-success-ink"
          }
        >
          Validación {validation.report.score}
        </span>
      )}
      {validation.cadValidationReport && (
        <span
          className={
            validation.cadValidationReport.severity === "critical"
              ? "text-danger-ink"
              : validation.cadValidationReport.severity === "warning"
                ? "text-warning-ink"
                : "text-success-ink"
          }
        >
          CAD {validation.cadValidationReport.severity}
        </span>
      )}
      {validation.clearanceIssuesCount > 0 && (
        <span className="text-warning-ink">
          Clearance {validation.clearanceIssuesCount}
        </span>
      )}
      {validation.safetyIssuesCount > 0 && (
        <span className="text-warning-ink">
          Safety {validation.safetyIssuesCount}
        </span>
      )}
      {validation.validationHighlightCount > 0 && (
        <button
          onClick={validation.onClearHighlights}
          className="text-danger-ink hover:text-foreground"
        >
          Highlights {validation.validationHighlightCount}
        </button>
      )}
      {misc.dxfWarningsCount > 0 && (
        <span className="text-warning-ink">DXF {misc.dxfWarningsCount}</span>
      )}
      {misc.snapshotsCount > 0 && (
        <span>Instantáneas {misc.snapshotsCount}</span>
      )}
    </div>
  );
}
