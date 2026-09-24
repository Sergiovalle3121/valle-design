/** La barra de Esencial habla de la capa de dibujo sin exponer IDs internos. */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CAD_LAYERS, summarizeCadLayers } from "@/lib/cad/layers";
import { CadStatusBar, type CadStatusBarProps } from "./CadStatusBar";

const noop = () => undefined;
const storage = new Map<string, string>([
  ["valle_cad_status_pins:v1", JSON.stringify(["document-info"])],
]);
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  },
});

function render(mode: "esencial" | "pro", activeCadLayer = "layout", label = "Layout") {
  const layers = DEFAULT_CAD_LAYERS.map((layer) =>
    layer.id === activeCadLayer ? { ...layer, label } : layer,
  );
  const props = {
    uiMode: mode,
    diagnostics: {
      enabled: false,
      tool: "select",
      selectionCount: 0,
      nativeEntityCount: 25,
      renderPipelineRef: { current: "batched" },
      renderPipelineSlotRef: { current: { subscribe: () => noop, getSnapshot: () => ({}) } },
      nativeMassHostsRef: { current: null },
      historyUndo: 0,
      historyRedo: 0,
      nativeRenderStats: { total: 25, visible: 25, rendered: 25, omitted: 0, batching: false },
    },
    unit: "mm",
    cursorCoordinateRef: { current: null },
    documentInfo: { model: "AXOS-CAD-STUDIO", revision: "R0", version: 25 },
    saveState: {
      saving: false, dirty: false, saveStatus: "saved", saveIssue: null,
      documentId: null, recoverySavedAt: null, recoveryWarning: null,
      connectionState: "online",
    },
    layersInfo: {
      cadLayers: layers, activeCadLayer, cadLayerSummary: summarizeCadLayers(layers),
      gridOn: false, snapOn: false,
    },
    draftSettings: {
      osnap: true, ortho: false, polar: false, polarIncrement: 45,
      objectSnapTracking: false, acquiredTrackingPoints: 0,
    },
    draftSettingsHost: {
      toggleOsnap: noop, toggleOrtho: noop, togglePolar: noop,
      setPolarIncrement: noop, toggleObjectSnapTracking: noop, clearTrackingPoints: noop,
    },
    paletteHost: { toggleDraftSettings: noop, toggleStyles: noop },
    validation: {
      onOpenChecks: noop, releaseTone: "", releaseState: "pendiente", report: null,
      cadValidationReport: null, clearanceIssuesCount: 0, safetyIssuesCount: 0,
      validationHighlightCount: 0, onClearHighlights: noop,
    },
    misc: { dxfWarningsCount: 0, snapshotsCount: 0 },
    spaceTabs: {
      isModelActive: true, spaces: [], activeSpaceId: null,
      onSelectModel: noop, onSelectSpace: noop, onManage: noop,
    },
  } as unknown as CadStatusBarProps;
  return renderToStaticMarkup(createElement(CadStatusBar, props));
}

const esencial = render("esencial");
assert.match(esencial, /data-testid="cad-current-layer"[^>]*>Capa Dibujo</);
assert.doesNotMatch(esencial, /Capa Layout|AXOS-CAD-STUDIO|R0 · v25|versión CAS/);
assert.match(esencial, /data-testid="cad-save-status"[^>]*>[\s\S]*?Guardado</);
assert.match(esencial, /data-testid="cad-cursor-coordinate"/);
assert.match(esencial, /data-testid="cad-status-annotation-scale"/);
assert.match(esencial, /data-testid="cad-diagnostics" data-enabled="false" aria-hidden="true" class="sr-only"/);

const personalizada = render("esencial", "architecture", "Mi estudio");
assert.match(personalizada, /data-testid="cad-current-layer"[^>]*>Capa Mi estudio</);

const pro = render("pro");
assert.match(pro, /data-testid="cad-current-layer"[^>]*>Capa Layout</);
assert.match(pro, /AXOS-CAD-STUDIO · R0 · v25/);
assert.match(pro, /data-testid="cad-draft-status-osnap"/);

console.log("cad-status-human: Esencial sin IDs, capa personalizada y Pro intacto");
