"use client";

import { useState, type RefObject } from "react";
import { Ellipsis } from "lucide-react";
import { cadHistoryDepthHint } from "./history-depth-hint";
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
 *
 * ## Ola «estado»: el desplegable «Más»
 *
 * Nueve avisos de segundo orden (conexión, rejilla/forzcursor, modelo ·
 * revisión · versión, los dos resúmenes de validación, holguras, seguridad,
 * avisos DXF, instantáneas) vivían con `@max-[40rem]:hidden`: bajo 40 rem
 * desaparecían del DOM sin quedar alcanzables en ningún otro sitio — el
 * defecto exacto que esta ola prohíbe. Ahora viven SIEMPRE en el desplegable
 * `data-testid="cad-status-overflow"`, detrás del botón «Más»: alcanzables a
 * cualquier ancho, en vez de recortados por uno. Lo que SÍ tenía un
 * `data-testid` propio o un golden que lo localiza por texto directo
 * (coordenadas, guardado, recuperación, capa, «Revisión…», «Resaltados N») se
 * queda exactamente donde estaba — moverlo exigiría abrir el desplegable
 * antes de leerlo, y ningún golden lo hace hoy.
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
    /** T-75(a): el monolito todavía no lo rellena (petición P-04 en
     *  F9-peticiones.md) — `describeCadSaveFailure` ya lo produce. */
    title?: string;
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
  // T-24·2: cuando el presupuesto de memoria —no las acciones— fija la
  // profundidad, el indicador lo dice en vez de quedarse mudo en U1/R0.
  const historyHint = cadHistoryDepthHint(diagnostics.historyUndo, diagnostics.nativeEntityCount);
  const [overflowOpen, setOverflowOpen] = useState(false);
  return (
    // Franja propia bajo el área de dibujo, ancho completo, como la barra de
    // estado de AutoCAD. Ya no es `absolute` dentro del lienzo: montada así se
    // comía el pointerdown de los arrastres de selección que empezaban abajo a
    // la derecha (auditoría 2026-09-01; golden 68). El gancho `cad-status-bar`
    // se conserva: `globals.css` fija su contrato de altura (ola «armazón»,
    // `CAD_SHELL_METRICS.statusRow`, 26 px) — una fila `flex-nowrap`, no dos
    // renglones de texto (el `h-[1.625rem]` de aquí es el mismo número en
    // clase de Tailwind, no un segundo contrato). Antes envolvía a 1280 px
    // (~1000 px de contenido en una fila); ahora desplaza con
    // `overflow-x-auto` en vez de envolver, como ya hacía la fila superior —
    // la información no se pierde, sólo deja de empujar el lienzo hacia
    // arriba en pantallas apretadas. Los nueve avisos de segundo orden que
    // antes se ocultaban bajo 40 rem con `@max-[40rem]:hidden` sin quedar
    // alcanzables ahora viven siempre en el desplegable «Más»
    // (`cad-status-overflow`, ver más abajo); los conmutadores F3/F8/F10/F11,
    // el guardado, la capa y las coordenadas se quedan siempre en la fila.
    //
    // Todos los elementos miden lo mismo (`.cad-status-bar > *` en
    // globals.css, capa `components` para que `hidden` la gane). Sin esto, un
    // renglón con el <select> del incremento polar medía 3 px más que uno de
    // texto, y la cámara del lienzo «se movía» al cambiar de alto (golden 72).
    <div className="cad-status-bar @container flex h-[1.625rem] shrink-0 flex-nowrap items-center gap-x-2 overflow-x-auto whitespace-nowrap border-t border-border bg-surface px-3 py-0.5 type-micro text-foreground [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
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
          data-history-floor={historyHint.floor ? "true" : "false"}
          title={historyHint.title}
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
          Recuperación local activa
        </span>
      )}
      {saveState.dirty && saveState.recoveryWarning && (
        <span className="text-danger-ink" title={saveState.recoveryWarning}>
          Recuperación local en riesgo
        </span>
      )}
      <span>
        Capa{" "}
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
      {validation.report && (
        <button
          onClick={validation.onOpenChecks}
          className={`${validation.releaseTone} hover:text-foreground`}
        >
          Revisión {validation.releaseState}
        </button>
      )}
      {validation.validationHighlightCount > 0 && (
        <button
          onClick={validation.onClearHighlights}
          className="text-danger-ink hover:text-foreground"
        >
          Resaltados {validation.validationHighlightCount}
        </button>
      )}
      {/* EL DESPLEGABLE «MÁS»: los nueve avisos de segundo orden que antes se
          escondían con `@max-[40rem]:hidden` sin quedar alcanzables. Siempre
          en el DOM, siempre reachable — sólo su visibilidad depende de
          `overflowOpen`. No es la raíz de la ranura `statusBar` (esa es el
          `<div className="cad-status-bar …">` de más arriba), así que puede
          llevar `absolute`/`z-*` sin romper el contrato del armazón: es un
          menú transitorio, como cualquier popover del CAD, no una capa
          permanente sobre el lienzo. */}
      <span className="relative ml-auto inline-flex h-full items-center">
        <button
          type="button"
          data-testid="cad-status-overflow-trigger"
          aria-expanded={overflowOpen}
          aria-controls="cad-status-overflow"
          onClick={() => setOverflowOpen((open) => !open)}
          className="inline-flex h-full items-center gap-0.5 rounded-sm px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Ellipsis aria-hidden="true" className="h-3.5 w-3.5" />
          Más
        </button>
        {overflowOpen && (
          <div
            id="cad-status-overflow"
            data-testid="cad-status-overflow"
            role="group"
            aria-label="Más información de estado"
            className="absolute bottom-full right-0 z-10 mb-1 flex w-max max-w-xs flex-col gap-1 rounded-card border border-border bg-popover p-2 text-popover-foreground shadow-elevated"
          >
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
                ? "API en línea"
                : saveState.connectionState === "offline"
                  ? "API sin conexión"
                  : "API…"}
            </span>
            <span>
              Rejilla {layersInfo.gridOn ? "activada" : "desactivada"} / Forzcursor{" "}
              {layersInfo.snapOn ? "rejilla" : "libre"}
            </span>
            <span
              className="truncate"
              title={`Modelo, revisión funcional y versión CAS: ${documentInfo.model} · ${documentInfo.revision} · v${documentInfo.version}`}
            >
              {documentInfo.model} · {documentInfo.revision} · v{documentInfo.version}
            </span>
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
                Validación {validation.report.score === "ok" ? "correcta" : validation.report.score === "warn" ? "con avisos" : "con errores"}
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
                {validation.cadValidationReport.severity === "critical" ? "CAD crítico" : validation.cadValidationReport.severity === "warning" ? "CAD con avisos" : "CAD correcto"}
              </span>
            )}
            {validation.clearanceIssuesCount > 0 && (
              <span className="text-warning-ink">Holguras {validation.clearanceIssuesCount}</span>
            )}
            {validation.safetyIssuesCount > 0 && (
              <span className="text-warning-ink">Seguridad {validation.safetyIssuesCount}</span>
            )}
            {misc.dxfWarningsCount > 0 && (
              <span className="text-warning-ink">DXF {misc.dxfWarningsCount}</span>
            )}
            {misc.snapshotsCount > 0 && <span>Instantáneas {misc.snapshotsCount}</span>}
          </div>
        )}
      </span>
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
        className="inline-flex items-center gap-1.5 [&>*]:pointer-events-auto"
      />
    </div>
  );
}
