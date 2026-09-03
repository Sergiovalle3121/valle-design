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
import { CadAnnotationScaleSelect } from "./CadAnnotationScaleSelect";
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
  /**
   * CANNOSCALE: la escala de anotación del espacio modelo.
   *
   * El estado vive en `CadAnnotationScaleSelect` y no en el editor porque el
   * monolito tiene un TECHO DE `useState` (131) que sólo puede bajar. Aquí sólo
   * viaja qué hacer cuando cambia: reescalar las anotativas del modelo por el
   * mismo embudo de mutación que todo lo demás.
   */
  onAnnotationScale?(denominator: number): void;
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
  onAnnotationScale,
}: CadStatusBarProps) {
  const nativeRenderStats = diagnostics.nativeRenderStats;
  return (
    // Franja propia bajo el área de dibujo, ancho completo, como la barra de
    // estado de AutoCAD. Ya no es `absolute` dentro del lienzo: montada así se
    // comía el pointerdown de los arrastres de selección que empezaban abajo a
    // la derecha (auditoría 2026-09-01; golden 68). El gancho `cad-status-bar`
    // se conserva: `globals.css` lo lee para dejarla en un solo renglón.
    // Envuelve en DOS renglones apretados (gap-y-0.5, py-0.5): a 1280 px el
    // contenido mide ~1000 px y no cabe en uno; sin envolver, los conmutadores
    // de dibujo quedaban debajo del panel derecho, visibles y sin poder
    // pulsarse (golden 67). Medido: 36 px de barra frente a los 75 de antes.
    // `@container` + `@max-[40rem]:hidden` en los elementos de segundo
    // orden: con el panel derecho ancho (Bloques, 538 px) el lienzo baja a 502
    // px y la barra envolvía en TRES renglones (62 px), que a 720 px de alto
    // dejan el lienzo en 494 (mínimo 520, golden 19). Por debajo de 40 rem se
    // ocultan los avisos y accesos que no son de dibujo; los conmutadores F3/
    // F8/F10/F11, el guardado, la capa y las coordenadas se quedan siempre.
    //
    // Todos los elementos miden lo mismo (`.cad-status-bar > *` en
    // globals.css, capa `components` para que `hidden` la gane). Sin esto, un
    // renglón con el <select> del incremento polar medía 3 px más que uno de
    // texto, y al reenvolver tras una designación la barra cambiaba de alto,
    // el lienzo con ella y la cámara «se movía» 33 unidades (golden 72).
    <div className="cad-status-bar @container flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border bg-surface px-3 py-0.5 type-micro text-foreground">
      {/* Las coordenadas van PRIMERO, a la izquierda: es lo primero que un
          dibujante de AutoCAD busca en la barra, y estaban en medio. */}
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
      <span>{unit}</span>
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
        className={`@max-[40rem]:hidden ${
          saveState.connectionState === "online"
            ? "text-success-ink"
            : saveState.connectionState === "offline"
              ? "text-danger-ink"
              : "text-muted-foreground"
        }`}
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
      <span className="@max-[40rem]:hidden">
        Grilla {layersInfo.gridOn ? "on" : "off"} / Snap{" "}
        {layersInfo.snapOn ? "grid" : "free"}
      </span>
      <CadAnnotationScaleSelect onChange={onAnnotationScale} />
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
      {/* Modelo · revisión · versión CAS va al final y truncado: en un renglón
          sin envolver, un nombre largo (o el UUID que el backend simulado usa
          como modelo: 377 px medidos) desplazaba fuera de la vista los
          conmutadores de dibujo, que se usan cien veces por sesión. */}
      <span
        className="max-w-48 truncate @max-[40rem]:hidden"
        title={`Modelo, revisión funcional y versión CAS: ${documentInfo.model} · ${documentInfo.revision} · v${documentInfo.version}`}
      >
        {documentInfo.model} · {documentInfo.revision} · v{documentInfo.version}
      </span>
      <button
        onClick={validation.onOpenChecks}
        className={`${validation.releaseTone} hover:text-foreground`}
      >
        Release {validation.releaseState}
      </button>
      {validation.report && (
        <span
          className={`@max-[40rem]:hidden ${
            validation.report.score === "error"
              ? "text-danger-ink"
              : validation.report.score === "warn"
                ? "text-warning-ink"
                : "text-success-ink"
          }`}
        >
          Validación {validation.report.score}
        </span>
      )}
      {validation.cadValidationReport && (
        <span
          className={`@max-[40rem]:hidden ${
            validation.cadValidationReport.severity === "critical"
              ? "text-danger-ink"
              : validation.cadValidationReport.severity === "warning"
                ? "text-warning-ink"
                : "text-success-ink"
          }`}
        >
          CAD {validation.cadValidationReport.severity}
        </span>
      )}
      {validation.clearanceIssuesCount > 0 && (
        <span className="text-warning-ink @max-[40rem]:hidden">
          Clearance {validation.clearanceIssuesCount}
        </span>
      )}
      {validation.safetyIssuesCount > 0 && (
        <span className="text-warning-ink @max-[40rem]:hidden">
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
        <span className="text-warning-ink @max-[40rem]:hidden">DXF {misc.dxfWarningsCount}</span>
      )}
      {misc.snapshotsCount > 0 && (
        <span className="@max-[40rem]:hidden">Instantáneas {misc.snapshotsCount}</span>
      )}
      {/* La BANDEJA: el chrome del estudio que no es del dibujo (videollamada
          hoy) se posa aquí, en el extremo derecho, como la bandeja de la barra
          de estado de AutoCAD. Medido el 2026-09-02 en los goldens 19 y 72: la
          barra de llamada vivía en `fixed right-3 top-[11.5rem]` y tapaba el
          botón «Cerrar panel profesional» del panel de workspace (x=1256,
          y=184 a 1280×720); en el lienzo la rechaza el golden 68 y en las
          columnas de paneles cualquier altura tapa algo. La barra de estado es
          el único sitio donde no hay nada debajo. Los anfitriones se montan
          FUERA del editor (`CadStudioHost`) y llegan por portal
          (`use-studio-tray.ts`). */}
      <span
        data-testid="cad-status-tray"
        className="ml-auto inline-flex items-center gap-1.5 [&>*]:pointer-events-auto"
      />
    </div>
  );
}
