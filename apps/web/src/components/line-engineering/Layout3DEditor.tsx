'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Loader2, X, Save, Move3d, Grid3x3, Grid2x2, ShieldAlert, RotateCw, RotateCcw, Trash2, Download, FileDown, Magnet, FlipHorizontal, FlipVertical, BrickWall,
  Box as BoxIcon, Eye, MapPin, Maximize2, Layers, Copy, Crosshair, Settings2,
  Boxes, ChevronRight, Ruler, MousePointer2, SlidersHorizontal, Undo2, Redo2, Spline,
  ClipboardList, Package, StickyNote, PersonStanding, HelpCircle,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, RulerDimensionLine, Rows3, Waypoints,
  ShieldCheck, CircleCheck, CircleAlert, Printer, ChartLine, FileText, WandSparkles, Stamp, Upload, ImageOff, Activity, History, Group, Search,
} from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/contexts/ToastContext';
import { setWorkbenchChrome } from '@/lib/operatorChrome';
import { ASSET_CATEGORIES, assetMeta, type AssetArchetype } from './asset-catalog';
import { parseDxf, type DxfModel } from './dxf';
import { dxfPointToFootprint, dxfToWalls } from './dxf-walls';
import { dxfSnapPoints, nearestSnapPoint } from './dxf-snap';
import { autoDimensions, type DimBox } from './auto-dimensions';
import { arrangeLine, type ArrangeStation } from './arrange-line';
import { connectLine, type ConnStation } from './connect-line';
import { designChecks, type CheckBox, type DesignReport } from './design-checks';
import { flowMetrics, type FlowCenter } from './flow-metrics';
import { plotSheetModel } from './plot-sheet';
import {
  createHistoryItem as createCadHistoryItem,
  executeCadCommand,
  parseCadCommand,
  previewCadCommand,
  type CadCommandHistoryItem,
  type CadCommandInput,
  type CadCommandPreview,
  type CadOperation,
} from '@/lib/cad/commands';
import { measureBoxes, measurementLabel, type CadMeasureMode } from '@/lib/cad/measurements';
import { maybeSnapScalarToGrid } from '@/lib/cad/snapping';
import {
  assignObjectsToLayer,
  DEFAULT_CAD_LAYERS,
  isolateCadLayerVisibility,
  isObjectLayerLocked,
  showAllCadLayers,
  summarizeCadLayers,
  toggleCadLayerLocked,
  toggleCadLayerVisible,
  type CadLayer,
  type CadLayerAssignments,
  type CadLayerId,
} from '@/lib/cad/layers';
import { CAD_TOOLBAR_ACTIONS, type CadToolbarActionId } from '@/lib/cad/toolbar';
import { searchCadPalette, type CadPaletteEntry } from '@/lib/cad/command-palette';
import { suggestCadCommands, type CadCommandSuggestion } from '@/lib/cad/command-line-assist';
import { matchCadShortcut } from '@/lib/cad/keyboard-shortcuts';
import { exportCadLayoutDxf } from '@/lib/cad/layout-export-adapter';
import { evaluateCadDxfExportReadiness, type CadDxfExportLayerSummary, type CadDxfExportReadinessEntity, type CadDxfExportReadinessIssue } from '@/lib/cad/dxf-export-readiness';
import { importDxfPrimitives, summarizeDxfImportWarnings, type CadDxfImportResult, type CadDxfImportWarning, type CadDxfPoint, type CadDxfPrimitive } from '@/lib/cad/dxf-import';
import { CAD_SYMBOL_LIBRARY, getCadSymbol, type CadSymbolCategory } from '@/lib/cad/symbols';
import { CAD_LAYOUT_TEMPLATES, instantiateCadLayoutTemplate, type CadLayoutTemplateId } from '@/lib/cad/templates';
import { generateWarehouseRackRows, type CadRackRowGeneratorInput } from '@/lib/cad/warehouse-generators';
import { type CadClearanceIssue, type CadCollisionHit } from '@/lib/cad/collisions';
import { buildFlowSegments, scoreFlowLayout, type CadFlowNode, type CadFlowScore, type CadFlowSegment } from '@/lib/cad/flow-optimization';
import type { CadSafetyIssue, CadSafetyZone, CadSafetyZoneKind } from '@/lib/cad/safety-zones';
import { createCadSnapshot, diffCadSnapshots, pushCadSnapshot, restoreCadSnapshot, type CadSnapshotDiff, type CadSnapshotHistory } from '@/lib/cad/snapshots';
import {
  describeCadObjectProperties,
  summarizeCadSelectionProperties,
  type CadObjectProperties,
  type CadPropertyObject,
  type CadSelectionProperties,
} from '@/lib/cad/object-properties';
import {
  buildCadValidationReport,
  type CadValidationIssueRow,
  type CadValidationReport,
} from '@/lib/cad/validation-report';
import dynamic from 'next/dynamic';

// Analysis panels — the same modal components the 2D host shipped, lazy-loaded so
// they don't bloat the CAD chunk. Unified here so the 3D CAD has every 2D tool.
const WhatIfSimulator = dynamic(() => import('./WhatIfSimulator'), { ssr: false });
const YamazumiChart = dynamic(() => import('./YamazumiChart'), { ssr: false });
const LayoutHistory = dynamic(() => import('./LayoutHistory'), { ssr: false });
const BufferPlanner = dynamic(() => import('./BufferPlanner'), { ssr: false });
const OperatorLoops = dynamic(() => import('./OperatorLoops'), { ssr: false });
const ClearanceAnalysis = dynamic(() => import('./ClearanceAnalysis'), { ssr: false });
const LayoutScorecard = dynamic(() => import('./LayoutScorecard'), { ssr: false });
const LineContinuity = dynamic(() => import('./LineContinuity'), { ssr: false });
const LineCohesion = dynamic(() => import('./LineCohesion'), { ssr: false });
const LineDensity = dynamic(() => import('./LineDensity'), { ssr: false });
const CostEstimator = dynamic(() => import('./CostEstimator'), { ssr: false });
const SensitivityChart = dynamic(() => import('./SensitivityChart'), { ssr: false });
const ScenarioCompare = dynamic(() => import('./ScenarioCompare'), { ssr: false });
const StandardWork = dynamic(() => import('./StandardWork'), { ssr: false });
const DossierExport = dynamic(() => import('./DossierExport'), { ssr: false });
const FlexLine = dynamic(() => import('./FlexLine'), { ssr: false });
// Local, deterministic line-balance surface for the existing buildCadLineBalanceReport
// helper (no server call) — reads the stations on the plan. Distinct from the
// server-backed Yamazumi panel above.
const LineBalancePanel = dynamic(() => import('./LineBalancePanel'), { ssr: false });

/* eslint-disable @typescript-eslint/no-explicit-any */
const ANALYSIS_PANELS: { key: string; label: string; Comp: React.ComponentType<any> }[] = [
  { key: 'scorecard', label: 'Tarjeta de salud del layout', Comp: LayoutScorecard },
  { key: 'yamazumi', label: 'Yamazumi (balanceo)', Comp: YamazumiChart },
  { key: 'linebalance', label: 'Balance de línea (local)', Comp: LineBalancePanel },
  { key: 'sim', label: 'Simulador de capacidad', Comp: WhatIfSimulator },
  { key: 'buffers', label: 'Inventario de desacople (WIP)', Comp: BufferPlanner },
  { key: 'loops', label: 'Bucles de operador', Comp: OperatorLoops },
  { key: 'clearance', label: 'Holguras y pasillos', Comp: ClearanceAnalysis },
  { key: 'continuity', label: 'Continuidad de línea', Comp: LineContinuity },
  { key: 'cohesion', label: 'Cohesión de líneas', Comp: LineCohesion },
  { key: 'density', label: 'Mapa de ocupación / densidad', Comp: LineDensity },
  { key: 'cost', label: 'Costo por unidad', Comp: CostEstimator },
  { key: 'sensitivity', label: 'Sensibilidad a la demanda', Comp: SensitivityChart },
  { key: 'compare', label: 'Comparar escenarios A/B', Comp: ScenarioCompare },
  { key: 'stdwork', label: 'Trabajo estándar', Comp: StandardWork },
  { key: 'flex', label: 'Línea flexible', Comp: FlexLine },
  { key: 'dossier', label: 'Expediente analítico (JSON/CSV)', Comp: DossierExport },
  { key: 'history', label: 'Bitácora de auditoría', Comp: LayoutHistory },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Full-screen interactive 3D layout editor — the "CAD" view of the plant floor.
 *
 * Stations are extruded, labelled blocks; non-station equipment (benches,
 * conveyors, racks, robots, walls, columns, AGVs, operators…) are placed from a
 * categorised palette and rendered with distinctive geometry per archetype.
 * Anything on the floor can be dragged (a raycast against the ground gives the
 * new world x/y — exactly the placement data the 2D editor uses, so both views
 * stay in sync), selected, nudged, rotated, duplicated, resized from the
 * properties panel, or removed. Saves back through the shared layout endpoint:
 * stations via positions/cleared, equipment via the additive `assets` array.
 *
 * three.js + OrbitControls, lazy-loaded so the engine only ships when opened.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');

// Approval / sign-off (ported from the 2D host, unify)
type ApprovalStatus = 'draft' | 'in_review' | 'approved';
interface LayoutApproval { status: ApprovalStatus; by: string | null; at: string | null; note: string | null }
const APPROVAL_META: Record<ApprovalStatus, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: '#94a3b8' },
  in_review: { label: 'En revisión', color: '#f59e0b' },
  approved: { label: 'Aprobado', color: '#10b981' },
};

// Live station-status overlays (ported from the 2D host, unify). Each colours the
// station blocks by a per-station value from its API; we use the solid stroke hex.
type OverlayKind = 'mes' | 'heat' | 'completeness' | 'bays' | 'quality';
const hexToInt = (h: string): number => parseInt(h.replace('#', ''), 16);
const OVERLAY_DEFS: { key: OverlayKind; label: string; endpoint: string; legend: { label: string; hex: string }[] }[] = [
  { key: 'mes', label: 'MES en vivo', endpoint: 'status', legend: [{ label: 'Paro', hex: '#ef4444' }, { label: 'Alerta', hex: '#f59e0b' }, { label: 'OK', hex: '#10b981' }, { label: 'Inactivo', hex: '#94a3b8' }] },
  { key: 'heat', label: 'Calor de ciclo / utilización', endpoint: 'heatmap', legend: [{ label: 'Holgado', hex: '#3b82f6' }, { label: 'Ligero', hex: '#06b6d4' }, { label: 'Medio', hex: '#f59e0b' }, { label: 'Alto', hex: '#f97316' }, { label: 'Sobre takt', hex: '#ef4444' }] },
  { key: 'completeness', label: 'Completitud documental', endpoint: 'completeness', legend: [{ label: 'Completa', hex: '#10b981' }, { label: 'Incompleta', hex: '#f59e0b' }] },
  { key: 'bays', label: 'Bahía que surte', endpoint: 'bays', legend: [{ label: 'B1', hex: '#3b82f6' }, { label: 'B2', hex: '#8b5cf6' }, { label: 'B3', hex: '#ec4899' }, { label: 'B4', hex: '#f59e0b' }, { label: 'B5', hex: '#10b981' }, { label: 'B6', hex: '#06b6d4' }] },
  { key: 'quality', label: 'Calidad acumulada', endpoint: 'quality', legend: [{ label: 'OK', hex: '#10b981' }, { label: 'Menor', hex: '#f59e0b' }, { label: 'Mayor', hex: '#ef4444' }] },
];
const MES_HEX: Record<string, string> = { down: '#ef4444', warn: '#f59e0b', ok: '#10b981', idle: '#94a3b8', unknown: '#cbd5e1' };
const HEAT_HEX: Record<string, string> = { cold: '#3b82f6', cool: '#06b6d4', warm: '#f59e0b', hot: '#f97316', over: '#ef4444' };
const BAY_HEX: Record<number, string> = { 1: '#3b82f6', 2: '#8b5cf6', 3: '#ec4899', 4: '#f59e0b', 5: '#10b981', 6: '#06b6d4' };
const QUAL_HEX: Record<string, string> = { ok: '#10b981', minor: '#f59e0b', major: '#ef4444' };
/* eslint-disable @typescript-eslint/no-explicit-any */
// Build a stationName→hex map from an overlay response (shapes mirror the 2D host).
function overlayColorMap(kind: OverlayKind, d: any): Map<string, string> {
  const m = new Map<string, string>();
  const rows: any[] = Array.isArray(d?.stations) ? d.stations : [];
  for (const s of rows) {
    if (!s || typeof s.station !== 'string') continue;
    let hex: string | undefined;
    if (kind === 'mes') hex = MES_HEX[s.status];
    else if (kind === 'heat') hex = HEAT_HEX[s.level];
    else if (kind === 'completeness') hex = s.complete ? '#10b981' : '#f59e0b';
    else if (kind === 'bays') hex = s.bahia != null ? BAY_HEX[s.bahia as number] : '#94a3b8';
    else if (kind === 'quality') hex = QUAL_HEX[s.level];
    if (hex) m.set(s.station, hex);
  }
  return m;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface St {
  id: string; station: string; line: string; ctq: boolean;
  x: number | null; y: number | null; w: number | null; h: number | null; rotation: number | null;
}
interface Cell { id: string; name: string; color: string; stationIds: string[] }
interface Conn { from: string; to: string; kind?: string }
interface Asset { id: string; kind: string; x: number; y: number; w: number; h: number; rotation: number; label?: string }
/** A pair of objects flagged by the clearance analysis (Fase 43). */
interface ClearancePair { a: string; b: string; aLabel: string; bLabel: string; gap: number }
/** A free-text note or a dimension line (cota) on the plan — world coords. */
interface Ann { id: string; type: 'text' | 'dim'; x: number; y: number; x2?: number; y2?: number; text?: string; color?: string }
interface Footprint { footprintW: number; footprintH: number; unit: string; gridSize: number }
/** Placement of the read-only DXF floor plan behind the layout (Fase 2). */
interface DxfMeta { offsetX: number; offsetY: number; scale: number; rotation: number; visible: boolean; opacity: number }
interface Layout {
  footprint: Footprint;
  stations: St[];
  cells?: Cell[];
  connectors?: Conn[];
  assets?: Asset[];
  annotations?: Ann[];
  dxf?: DxfMeta | null;
}
interface Placement { x: number; y: number; w: number; h: number; rotation: number }
/** One selectable object (a station block or an equipment asset). */
interface SelItem { type: 'station' | 'asset'; id: string }
const sameSel = (a: SelItem, b: SelItem) => a.type === b.type && a.id === b.id;
/** A point-in-time copy of every editable collection, for undo/redo. */
interface Snapshot { placements: [string, Placement][]; assets: Asset[]; annotations: Ann[]; connectors: Conn[] }
interface CommandPreviewState { input: CadCommandInput; preview: CadCommandPreview }
interface DxfExportOptions { scope: 'all' | 'selection'; includeHidden: boolean; includeMeasurements: boolean; includeLabels: boolean; units: 'mm' | 'm'; fileName: string }
interface DxfExportSummary { objects: number; connectors: number; measurements: number; labels: number; layers: number; canExport: boolean; includedLayers: string[]; layerSummary: CadDxfExportLayerSummary[]; issues: CadDxfExportReadinessIssue[] }
interface MeasurementRow { id: string; label: string; length: string }
/** Live quantity take-off computed from the editor's current state. */
interface LocalTakeoff {
  unit: string; footprintArea: number; totalStations: number; placedStations: number;
  stationArea: number; equipmentCount: number; equipArea: number; usedArea: number;
  util: number; wallLen: number; dimCount: number;
  flowLen: number; flowMaxHop: number; flowCount: number;
  byKind: { kind: string; label: string; count: number; area: number }[];
  byLayer: { id: CadLayerId; label: string; count: number; area: number }[];
}
/** A render-safe snapshot of the current selection for the properties panel. */
interface SelSnap {
  type: 'station' | 'asset';
  id: string;
  x: number; y: number; w: number; h: number; rotation: number;
  title: string; subtitle: string;
  kind?: string; height?: number; canDuplicate: boolean;
}

function assetSafetyZoneKind(asset: Asset, tagsValue: string | undefined): CadSafetyZoneKind | null {
  const meta = assetMeta(asset.kind);
  const text = `${asset.kind} ${asset.label ?? ''} ${tagsValue ?? ''}`.toLowerCase().replace(/_/g, '-');
  if (text.includes('no-go')) return 'no_go';
  if (text.includes('restricted')) return 'restricted';
  if (text.includes('esd')) return 'esd_zone';
  if (text.includes('emergency') || text.includes('egress') || text.includes('evacuation')) return 'emergency_exit';
  if (text.includes('forklift') || text.includes('montacargas')) return 'forklift_path';
  if (text.includes('aisle') || text.includes('pasillo')) return 'aisle';
  if (text.includes('clearance')) return 'safety_clearance';
  return meta.archetype === 'zone' && text.includes('safety') ? 'restricted' : null;
}

function cadTags(value: string | undefined): string[] {
  return (value ?? '').split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean);
}

const ROSE = 0xf43f5e;
const AMBER = 0xf59e0b;
const SELECT = 0x22d3ee;

function makeLabel(text: string, scale = 1.5): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const fontSize = 46;
  const m = canvas.getContext('2d')!;
  m.font = `bold ${fontSize}px sans-serif`;
  const tw = m.measureText(text).width;
  canvas.width = Math.ceil(tw + 30);
  canvas.height = fontSize + 24;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.arcTo(canvas.width, 0, canvas.width, canvas.height, r);
  ctx.arcTo(canvas.width, canvas.height, 0, canvas.height, r);
  ctx.arcTo(0, canvas.height, 0, 0, r); ctx.arcTo(0, 0, canvas.width, 0, r); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(scale * aspect, scale, 1);
  sprite.renderOrder = 10;
  sprite.userData.isLabel = true; // so the "Etiquetas" layer can hide every label
  return sprite;
}

/** Visual theme presets for the scene (background / fog / floor / grid). */
type Theme3D = 'dark' | 'light' | 'night' | 'studio';
const THEMES: Record<Theme3D, { bg: number; ground: number; gridA: number; gridB: number; fog: number; label: string }> = {
  dark: { bg: 0x0a0f1e, ground: 0x14203a, gridA: 0x2a3a5c, gridB: 0x1b2640, fog: 0x0a0f1e, label: 'Oscuro' },
  light: { bg: 0xeaf0f8, ground: 0xd7e2f1, gridA: 0x9db4d6, gridB: 0xbccce4, fog: 0xeaf0f8, label: 'Claro' },
  night: { bg: 0x05070d, ground: 0x0b1322, gridA: 0x1e2c47, gridB: 0x121a2e, fog: 0x05070d, label: 'Noche' },
  studio: { bg: 0x202329, ground: 0x2b2f37, gridA: 0x3c424d, gridB: 0x2f343d, fog: 0x202329, label: 'Estudio' },
};

/** Keyboard + tool reference shown in the help overlay. */
const HELP_SECTIONS: { title: string; rows: [string, string][] }[] = [
  { title: 'Herramientas', rows: [
    ['V', 'Seleccionar / mover'],
    ['M', 'Medir / acotar'],
    ['A', 'Preparar pasillo / holgura'],
    ['L', 'Conectar flujo'],
    ['Z', 'Insertar zona'],
    ['I', 'Abrir equipo / simbolos'],
    ['T', 'Agregar nota'],
    ['W', 'Dibujar muros (Shift = 45°)'],
    ['F', 'Enfocar layout'],
    ['G', 'Mostrar / ocultar grilla'],
    ['O', 'Activar / desactivar object snap'],
    ['Shift+V', 'Validar layout'],
    ['E', 'Exportar DXF'],
    ['Recorrido', 'Caminar en primera persona'],
  ] },
  { title: 'Selección', rows: [
    ['Clic', 'Seleccionar un objeto'],
    ['Shift+clic', 'Agregar / quitar de la selección'],
    ['Ctrl/⌘+A', 'Seleccionar todo'],
    ['Esc', 'Deseleccionar / salir / cerrar'],
  ] },
  { title: 'Edición', rows: [
    ['Arrastrar', 'Mover (en grupo si hay varios)'],
    ['← → ↑ ↓', 'Ajustar (Shift = ×5)'],
    ['R / Shift+R', 'Rotar ±15°'],
    ['Ctrl/⌘+D', 'Duplicar'],
    ['Supr', 'Borrar selección'],
    ['Ctrl/⌘+Z / ⇧+Z', 'Deshacer / Rehacer'],
  ] },
  { title: 'Vista', rows: [
    ['Arrastrar fondo', 'Orbitar'],
    ['Rueda', 'Acercar / alejar'],
    ['Recorrido', 'Arrastrar = mirar · WASD = caminar'],
    ['?', 'Mostrar esta ayuda'],
  ] },
];

const TOOLBAR_SHORTCUT_IDS = new Set<CadToolbarActionId>([
  'select',
  'measure',
  'aisle',
  'connector',
  'zone',
  'equipment',
  'text',
  'fit_view',
  'undo',
  'redo',
]);

const DXF_LABEL_REQUIRED_ASSET_KINDS = new Set([
  'workbench',
  'conveyor',
  'rack',
  'robot',
  'aoi',
  'oven',
  'printer',
  'machine',
  'gantry',
  'cabinet',
  'pallet',
  'desk',
  'bin',
  'safety',
  'fence',
  'agv',
  'agvpath',
  'zone',
]);

function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const mesh = c as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((mm) => {
      const t = (mm as THREE.Material & { map?: THREE.Texture | null }).map;
      if (t) t.dispose();
      mm.dispose();
    });
  });
}

/** An amber "sticky note" sprite for a free-text annotation on the plan. */
function makeNoteLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const fontSize = 40;
  const m = canvas.getContext('2d')!;
  m.font = `600 ${fontSize}px sans-serif`;
  const tw = Math.min(520, m.measureText(text).width);
  canvas.width = Math.ceil(tw + 34);
  canvas.height = fontSize + 22;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(251,191,36,0.94)';
  const r = 9;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.arcTo(canvas.width, 0, canvas.width, canvas.height, r);
  ctx.arcTo(canvas.width, canvas.height, 0, canvas.height, r);
  ctx.arcTo(0, canvas.height, 0, 0, r); ctx.arcTo(0, 0, canvas.width, 0, r); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#422006'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const scale = 1.3;
  sprite.scale.set(scale * (canvas.width / canvas.height), scale, 1);
  sprite.renderOrder = 11;
  return sprite;
}

// ── 3D asset geometry factory ────────────────────────────────────────────────
// Builds a distinctive mesh group per archetype. Geometry is centred in X/Z with
// its base at y=0; the caller positions the group on the floor and rotates it.
function mat(color: THREE.ColorRepresentation, rough = 0.6, metal = 0.15, emissive: THREE.ColorRepresentation = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive });
}
function part(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}

function buildArchetype(archetype: AssetArchetype, wS: number, dS: number, H: number, colorHex: string): THREE.Object3D[] {
  const c = new THREE.Color(colorHex);
  const dark = c.clone().multiplyScalar(0.6);
  const light = c.clone().lerp(new THREE.Color(0xffffff), 0.25);
  const out: THREE.Object3D[] = [];
  const leg = Math.max(0.04, Math.min(wS, dS) * 0.08);

  switch (archetype) {
    case 'table': {
      const top = Math.max(0.05, H * 0.07);
      out.push(part(new THREE.BoxGeometry(wS, top, dS), mat(c, 0.55, 0.1), 0, H - top / 2, 0));
      const lx = wS / 2 - leg, lz = dS / 2 - leg;
      [[lx, lz], [-lx, lz], [lx, -lz], [-lx, -lz]].forEach(([x, z]) =>
        out.push(part(new THREE.BoxGeometry(leg, H - top, leg), mat(dark, 0.7, 0.3), x, (H - top) / 2, z)));
      break;
    }
    case 'belt': {
      const deckY = H * 0.78, deckT = Math.max(0.05, H * 0.12);
      out.push(part(new THREE.BoxGeometry(wS, deckT, dS * 0.78), mat(c, 0.5, 0.2), 0, deckY, 0));
      // side rails
      out.push(part(new THREE.BoxGeometry(wS, deckT * 0.9, leg), mat(dark, 0.5, 0.3), 0, deckY + deckT * 0.6, dS / 2 - leg / 2));
      out.push(part(new THREE.BoxGeometry(wS, deckT * 0.9, leg), mat(dark, 0.5, 0.3), 0, deckY + deckT * 0.6, -dS / 2 + leg / 2));
      // rollers (visual hint of belt direction)
      const rollers = Math.max(3, Math.min(9, Math.round(wS / Math.max(0.4, dS * 0.6))));
      const rr = Math.max(0.03, dS * 0.14);
      const rg = new THREE.CylinderGeometry(rr, rr, dS * 0.7, 10);
      for (let i = 0; i < rollers; i++) {
        const rx = -wS / 2 + (wS / (rollers - 1 || 1)) * i;
        const rm = part(rg, mat(light, 0.4, 0.6), rx, deckY + deckT * 0.5, 0);
        rm.rotation.x = Math.PI / 2; out.push(rm);
      }
      // legs
      const lx = wS / 2 - leg, lz = dS * 0.78 / 2 - leg;
      [[lx, lz], [-lx, lz], [lx, -lz], [-lx, -lz]].forEach(([x, z]) =>
        out.push(part(new THREE.BoxGeometry(leg, deckY, leg), mat(dark, 0.7, 0.3), x, deckY / 2, z)));
      break;
    }
    case 'shelf': {
      const post = Math.max(0.05, Math.min(wS, dS) * 0.09);
      const lx = wS / 2 - post / 2, lz = dS / 2 - post / 2;
      [[lx, lz], [-lx, lz], [lx, -lz], [-lx, -lz]].forEach(([x, z]) =>
        out.push(part(new THREE.BoxGeometry(post, H, post), mat(dark, 0.6, 0.35), x, H / 2, z)));
      const shelves = 4; const st = Math.max(0.04, H * 0.04);
      for (let i = 0; i < shelves; i++) {
        const y = (H / (shelves - 1)) * i;
        out.push(part(new THREE.BoxGeometry(wS, st, dS), mat(c, 0.65, 0.1), 0, Math.min(H - st / 2, Math.max(st / 2, y)), 0));
      }
      break;
    }
    case 'arm': {
      const baseH = H * 0.18, baseR = Math.min(wS, dS) * 0.42;
      out.push(part(new THREE.CylinderGeometry(baseR, baseR * 1.1, baseH, 18), mat(dark, 0.5, 0.5), 0, baseH / 2, 0));
      const col = part(new THREE.CylinderGeometry(baseR * 0.55, baseR * 0.6, H * 0.42, 14), mat(c, 0.45, 0.5), 0, baseH + H * 0.21, 0);
      out.push(col);
      // upper arm tilted out
      const upper = part(new THREE.BoxGeometry(wS * 0.7, H * 0.12, H * 0.1), mat(c, 0.4, 0.6), wS * 0.18, baseH + H * 0.46, 0);
      upper.rotation.z = -0.5; out.push(upper);
      const fore = part(new THREE.BoxGeometry(wS * 0.5, H * 0.09, H * 0.08), mat(light, 0.4, 0.6), wS * 0.42, baseH + H * 0.6, 0);
      fore.rotation.z = 0.35; out.push(fore);
      out.push(part(new THREE.SphereGeometry(baseR * 0.4, 12, 10), mat(dark, 0.4, 0.7), wS * 0.55, baseH + H * 0.52, 0));
      break;
    }
    case 'machine': {
      const bodyH = H * 0.82;
      out.push(part(new THREE.BoxGeometry(wS, bodyH, dS), mat(c, 0.5, 0.25), 0, bodyH / 2, 0));
      out.push(part(new THREE.BoxGeometry(wS * 0.96, H * 0.16, dS * 0.96), mat(dark, 0.55, 0.3), 0, bodyH + H * 0.08, 0));
      // viewing window / control panel on the +Z face
      out.push(part(new THREE.BoxGeometry(wS * 0.5, bodyH * 0.4, leg * 0.6), mat(0x0f172a, 0.2, 0.7, 0x0b1220), 0, bodyH * 0.6, dS / 2));
      out.push(part(new THREE.BoxGeometry(wS * 0.22, bodyH * 0.3, leg * 0.6), mat(light, 0.3, 0.5), wS * 0.32, bodyH * 0.45, dS / 2));
      // feet
      const lx = wS / 2 - leg, lz = dS / 2 - leg;
      [[lx, lz], [-lx, lz], [lx, -lz], [-lx, -lz]].forEach(([x, z]) =>
        out.push(part(new THREE.BoxGeometry(leg * 1.2, H * 0.05, leg * 1.2), mat(dark, 0.7, 0.3), x, H * 0.025, z)));
      break;
    }
    case 'wall': {
      out.push(part(new THREE.BoxGeometry(wS, H, dS), mat(c, 0.9, 0.02), 0, H / 2, 0));
      out.push(part(new THREE.BoxGeometry(wS, H * 0.03, dS * 1.15), mat(dark, 0.8, 0.05), 0, H, 0));
      break;
    }
    case 'cabinet': {
      out.push(part(new THREE.BoxGeometry(wS, H, dS), mat(c, 0.5, 0.3), 0, H / 2, 0));
      // door seam + handle
      out.push(part(new THREE.BoxGeometry(leg * 0.4, H * 0.9, leg * 0.3), mat(dark, 0.4, 0.5), 0, H / 2, dS / 2));
      out.push(part(new THREE.BoxGeometry(leg, H * 0.16, leg * 0.5), mat(light, 0.3, 0.6), wS * 0.22, H * 0.5, dS / 2));
      break;
    }
    case 'column': {
      const r = Math.min(wS, dS) * 0.5;
      out.push(part(new THREE.CylinderGeometry(r, r * 1.1, H, 20), mat(c, 0.85, 0.1), 0, H / 2, 0));
      out.push(part(new THREE.BoxGeometry(r * 2.4, H * 0.04, r * 2.4), mat(dark, 0.8, 0.1), 0, H * 0.02, 0));
      break;
    }
    case 'pallet': {
      const deck = Math.max(0.05, H * 0.45);
      out.push(part(new THREE.BoxGeometry(wS, deck, dS), mat(c, 0.85, 0.02), 0, H - deck / 2, 0));
      // 3 runners
      [-dS / 2 + leg, 0, dS / 2 - leg].forEach((z) =>
        out.push(part(new THREE.BoxGeometry(wS, H - deck, leg * 2), mat(c.clone().multiplyScalar(0.85), 0.9, 0.02), 0, (H - deck) / 2, z)));
      break;
    }
    case 'fence': {
      const posts = Math.max(2, Math.round(wS / Math.max(0.6, dS * 4)) + 1);
      const pw = Math.max(0.05, dS * 0.5);
      for (let i = 0; i < posts; i++) {
        const x = -wS / 2 + (wS / (posts - 1 || 1)) * i;
        out.push(part(new THREE.BoxGeometry(pw, H, pw), mat(c, 0.6, 0.3), x, H / 2, 0));
      }
      out.push(part(new THREE.BoxGeometry(wS, H * 0.08, pw * 0.6), mat(c, 0.6, 0.3), 0, H * 0.9, 0));
      out.push(part(new THREE.BoxGeometry(wS, H * 0.08, pw * 0.6), mat(c, 0.6, 0.3), 0, H * 0.45, 0));
      break;
    }
    case 'cart': {
      out.push(part(new THREE.BoxGeometry(wS, H * 0.7, dS), mat(c, 0.45, 0.4), 0, H * 0.45, 0));
      out.push(part(new THREE.BoxGeometry(wS * 0.6, H * 0.3, dS * 0.6), mat(light, 0.4, 0.5), 0, H * 0.85, 0));
      // wheels
      const wr = H * 0.18; const wg = new THREE.CylinderGeometry(wr, wr, leg, 12);
      const lx = wS / 2 - leg, lz = dS / 2 - leg;
      [[lx, lz], [-lx, lz], [lx, -lz], [-lx, -lz]].forEach(([x, z]) => {
        const w = part(wg, mat(0x111827, 0.6, 0.2), x, wr, z); w.rotation.x = Math.PI / 2; out.push(w);
      });
      break;
    }
    case 'person': {
      const r = Math.min(wS, dS) * 0.3;
      out.push(part(new THREE.CylinderGeometry(r * 0.9, r, H * 0.58, 14), mat(c, 0.7, 0.05), 0, H * 0.32, 0));
      out.push(part(new THREE.SphereGeometry(r * 0.7, 14, 12), mat(light, 0.6, 0.05), 0, H * 0.74, 0));
      break;
    }
    case 'desk': {
      const top = Math.max(0.05, H * 0.08), deskY = H * 0.62;
      out.push(part(new THREE.BoxGeometry(wS, top, dS), mat(c, 0.55, 0.1), 0, deskY, 0));
      const lx = wS / 2 - leg, lz = dS / 2 - leg;
      [[lx, lz], [-lx, lz], [lx, -lz], [-lx, -lz]].forEach(([x, z]) =>
        out.push(part(new THREE.BoxGeometry(leg, deskY, leg), mat(dark, 0.7, 0.3), x, deskY / 2, z)));
      // monitor: panel on a small stand
      out.push(part(new THREE.BoxGeometry(leg, H * 0.12, leg), mat(dark, 0.5, 0.4), 0, deskY + top + H * 0.06, -dS * 0.2));
      out.push(part(new THREE.BoxGeometry(wS * 0.42, H * 0.26, leg * 0.5), mat(0x0f172a, 0.2, 0.6, 0x0b1220), 0, deskY + top + H * 0.22, -dS * 0.2));
      break;
    }
    case 'bin': {
      const wall = Math.max(0.04, Math.min(wS, dS) * 0.08);
      out.push(part(new THREE.BoxGeometry(wS, Math.max(0.04, H * 0.08), dS), mat(dark, 0.8, 0.05), 0, H * 0.04, 0)); // floor
      out.push(part(new THREE.BoxGeometry(wS, H, wall), mat(c, 0.7, 0.05), 0, H / 2, dS / 2 - wall / 2));
      out.push(part(new THREE.BoxGeometry(wS, H, wall), mat(c, 0.7, 0.05), 0, H / 2, -dS / 2 + wall / 2));
      out.push(part(new THREE.BoxGeometry(wall, H, dS - wall * 2), mat(c, 0.7, 0.05), wS / 2 - wall / 2, H / 2, 0));
      out.push(part(new THREE.BoxGeometry(wall, H, dS - wall * 2), mat(c, 0.7, 0.05), -wS / 2 + wall / 2, H / 2, 0));
      break;
    }
    case 'gantry': {
      const legW = Math.max(0.1, dS * 0.5), beamH = Math.max(0.15, H * 0.12);
      // two end legs (span along X)
      [wS / 2 - legW / 2, -wS / 2 + legW / 2].forEach((x) =>
        out.push(part(new THREE.BoxGeometry(legW, H - beamH, legW), mat(dark, 0.6, 0.35), x, (H - beamH) / 2, 0)));
      // top beam spanning the legs
      out.push(part(new THREE.BoxGeometry(wS, beamH, legW * 0.9), mat(c, 0.5, 0.4), 0, H - beamH / 2, 0));
      // trolley/hoist hanging from the beam
      out.push(part(new THREE.BoxGeometry(wS * 0.12, beamH * 1.4, legW * 1.1), mat(light, 0.4, 0.5), wS * 0.1, H - beamH * 1.1, 0));
      break;
    }
    case 'zone':
    case 'path':
    default: {
      // flat translucent footprint with a coloured border
      const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(wS, dS),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: archetype === 'path' ? 0.22 : 0.14, side: THREE.DoubleSide }),
      );
      fill.rotation.x = -Math.PI / 2; fill.position.y = 0.04; out.push(fill);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(wS, dS)),
        new THREE.LineBasicMaterial({ color: c }),
      );
      edge.rotation.x = -Math.PI / 2; edge.position.y = 0.05; out.push(edge);
      break;
    }
  }
  return out;
}

/** Build a positioned, rotated, pickable asset group (base at floor). */
function buildAssetGroup(a: Asset, s: number, W: number, H: number, selected: boolean, alert = false): THREE.Group {
  const def = assetMeta(a.kind);
  const wS = Math.max(0.2, a.w * s);
  const dS = Math.max(0.2, a.h * s);
  const h3d = Math.max(0.05, def.height * s);
  const group = new THREE.Group();
  buildArchetype(def.archetype, wS, dS, h3d, def.color).forEach((o) => group.add(o));

  // invisible, forgiving hit box covering the whole bounding volume
  const flat = def.archetype === 'zone' || def.archetype === 'path';
  const hb = new THREE.Mesh(
    new THREE.BoxGeometry(wS, flat ? Math.max(0.4, h3d) : h3d, dS),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hb.position.y = (flat ? Math.max(0.4, h3d) : h3d) / 2;
  hb.userData.assetId = a.id;
  group.add(hb);

  if (selected || alert) {
    const oh = Math.max(0.3, h3d);
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(wS * (alert ? 1.08 : 1.04), oh * 1.04, dS * (alert ? 1.08 : 1.04))),
      new THREE.LineBasicMaterial({ color: alert ? 0xf87171 : SELECT }),
    );
    outline.position.y = oh / 2; group.add(outline);
  }
  if (a.label) {
    const lab = makeLabel(a.label, 1.2);
    lab.position.set(0, (flat ? 0.6 : h3d) + 0.9, 0);
    group.add(lab);
  }

  group.userData.assetId = a.id;
  const cx = (a.x + a.w / 2 - W / 2) * s;
  const cz = (a.y + a.h / 2 - H / 2) * s;
  group.position.set(cx, 0, cz);
  group.rotation.y = -((a.rotation || 0) * Math.PI) / 180;
  return group;
}

const newId = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const fmtDist = (d: number, unit: string) => `${Math.round(d).toLocaleString('es-MX')} ${unit}`;
const fmtArea = (v: number, unit: string) => {
  const m2 = unit === 'mm' ? v / 1e6 : unit === 'cm' ? v / 1e4 : v; // → m²
  return `${m2.toLocaleString('es-MX', { maximumFractionDigits: m2 < 100 ? 2 : 0 })} m²`;
};
const fmtLen = (v: number, unit: string) => {
  const m = unit === 'mm' ? v / 1000 : unit === 'cm' ? v / 100 : v; // → m
  return `${m.toLocaleString('es-MX', { maximumFractionDigits: 2 })} m`;
};
const defaultCadClearance = (unit: string) => {
  if (unit === 'm') return 0.8;
  if (unit === 'cm') return 80;
  if (unit === 'in') return 32;
  if (unit === 'ft') return 2.6;
  return 800;
};

/** Floor-plane line + end ticks + distance label for a dimension annotation. */
function buildDim(a: Ann, s: number, W: number, H: number, unit: string): THREE.Object3D[] {
  if (a.x2 === undefined || a.y2 === undefined) return [];
  const y = 0.06;
  const ax = (a.x - W / 2) * s, az = (a.y - H / 2) * s;
  const bx = (a.x2 - W / 2) * s, bz = (a.y2 - H / 2) * s;
  const color = a.color || '#22d3ee';
  const out: THREE.Object3D[] = [];
  const lineMat = () => new THREE.LineBasicMaterial({ color });
  out.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz)]), lineMat()));
  const dx = bx - ax, dz = bz - az; const len = Math.hypot(dx, dz) || 1;
  const px = -dz / len, pz = dx / len; const t = 0.4;
  [[ax, az], [bx, bz]].forEach(([cx, cz]) =>
    out.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(cx + px * t, y, cz + pz * t), new THREE.Vector3(cx - px * t, y, cz - pz * t)]), lineMat())));
  const dist = Math.hypot(a.x2 - a.x, a.y2 - a.y);
  const label = makeLabel(a.text || fmtDist(dist, unit), 1.1);
  label.position.set((ax + bx) / 2, y + 0.85, (az + bz) / 2);
  label.userData.dimId = a.id;
  out.push(label);
  return out;
}

export default function Layout3DEditor({
  model, revision, open, onClose, onSaved, models = [],
}: {
  model: string;
  revision: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  models?: { model: string; revision: string }[];
}) {
  const toast = useToast();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<Layout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState(true);
  const [osnap, setOsnap] = useState(true); // object snap: align to other objects' edges/centers (Fase 54)
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverBusy, setServerBusy] = useState(false); // server auto-arrange/optimize in flight (unify)
  const [approval, setApproval] = useState<LayoutApproval | null>(null); // sign-off status (unify)
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [dxfBusy, setDxfBusy] = useState(false); // DXF backdrop upload/remove in flight (unify)
  const [dxfWarnings, setDxfWarnings] = useState<CadDxfImportWarning[]>([]);
  const [dxfImportPreview, setDxfImportPreview] = useState<CadDxfImportResult | null>(null);
  const [showDxfExport, setShowDxfExport] = useState(false);
  const [dxfExportOptions, setDxfExportOptions] = useState<DxfExportOptions>({ scope: 'all', includeHidden: true, includeMeasurements: true, includeLabels: true, units: 'mm', fileName: '' });
  const [dxfExportSummary, setDxfExportSummary] = useState<DxfExportSummary>({ objects: 0, connectors: 0, measurements: 0, labels: 0, layers: 0, canExport: false, includedLayers: [], layerSummary: [], issues: [] });
  const dxfInputRef = useRef<HTMLInputElement | null>(null);
  const [showVersions, setShowVersions] = useState(false); // versions/scenarios modal (unify)
  const [localSnapshots, setLocalSnapshots] = useState<CadSnapshotHistory<Snapshot>>({ snapshots: [] });
  const [snapshotDiff, setSnapshotDiff] = useState<CadSnapshotDiff | null>(null);
  const [versions, setVersions] = useState<{ id: string; name: string; createdAt: string; stationCount: number; assetCount: number }[]>([]);
  const [versName, setVersName] = useState('');
  const [versBusy, setVersBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0); // bump to re-run the load effect (after restore)
  const [cellsView, setCellsView] = useState<Cell[]>([]);
  const [showCells, setShowCells] = useState(false); // cells/zones panel
  const [showClone, setShowClone] = useState(false); // clone-from-template modal
  const [cloneSrc, setCloneSrc] = useState('');
  const [cloneBusy, setCloneBusy] = useState(false);
  const [showCommand, setShowCommand] = useState(false); // natural-language command dock (local function-calling scaffold)
  const [showPalette, setShowPalette] = useState(false); // Cmd-K CAD palette (local registry/search)
  const [paletteQuery, setPaletteQuery] = useState('');
  const [recentPaletteActions, setRecentPaletteActions] = useState<string[]>([]);
  const paletteOpenRef = useRef(false);
  const [commandText, setCommandText] = useState('');
  const [commandPreview, setCommandPreview] = useState<CommandPreviewState | null>(null);
  const [commandLog, setCommandLog] = useState<CadCommandHistoryItem[]>([]);
  const [selList, setSelList] = useState<SelItem[]>([]);
  const [selSnap, setSelSnap] = useState<SelSnap | null>(null);
  const [selSummary, setSelSummary] = useState<CadSelectionProperties | null>(null);
  const [placedIds, setPlacedIds] = useState<Set<string>>(new Set());
  const [assetIds, setAssetIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'stations' | 'equipment'>('stations');
  const [symbolSearch, setSymbolSearch] = useState('');
  const [symbolCategory, setSymbolCategory] = useState<CadSymbolCategory | 'all'>('all');
  const [rackGenerator, setRackGenerator] = useState<CadRackRowGeneratorInput>({
    rows: 2,
    baysPerRow: 4,
    bayWidth: 2400,
    rackDepth: 1100,
    aisleWidth: 3000,
    orientation: 'horizontal',
    labelPrefix: 'R',
  });
  const [tool, setTool] = useState<'select' | 'measure' | 'wall'>('select');
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d'); // 2D = locked top-down plan view (CAD unificado)
  const [walk, setWalk] = useState(false); // first-person walkthrough mode
  const [showHelp, setShowHelp] = useState(false); // keyboard shortcuts overlay
  const [measureLive, setMeasureLive] = useState<string | null>(null);
  const [dimCount, setDimCount] = useState(0);
  const [measurementRowsView, setMeasurementRowsView] = useState<MeasurementRow[]>([]);
  const [theme, setTheme] = useState<Theme3D>('dark');
  const [sun, setSun] = useState({ az: 35, el: 55 }); // sun azimuth/elevation (deg)
  const [showView, setShowView] = useState(false);
  const [fpDraft, setFpDraft] = useState<{ w: number; h: number; g: number }>({ w: 0, h: 0, g: 0 });
  const [layers, setLayers] = useState({ stations: true, equipment: true, connectors: true, dims: true, notes: true, labels: true, grid: true, dxf: true });
  const [cadLayers, setCadLayers] = useState<CadLayer[]>(DEFAULT_CAD_LAYERS);
  const [layerAssignments, setLayerAssignments] = useState<CadLayerAssignments>({});
  const [activeCadLayer, setActiveCadLayer] = useState<CadLayerId>('equipment');
  const cadLayersRef = useRef<CadLayer[]>(DEFAULT_CAD_LAYERS);
  const layerAssignmentsRef = useRef<CadLayerAssignments>({});
  const [objectTags, setObjectTags] = useState<Record<string, string>>({});
  const [objectNotes, setObjectNotes] = useState<Record<string, string>>({});
  const objectTagsRef = useRef<Record<string, string>>({});
  const objectNotesRef = useRef<Record<string, string>>({});
  const [aisleWidth, setAisleWidth] = useState(1200);
  const [hist, setHist] = useState({ undo: 0, redo: 0 }); // depths, for button enablement
  const [takeoff, setTakeoff] = useState<LocalTakeoff | null>(null); // quantities panel (null = closed)
  const [report, setReport] = useState<DesignReport | null>(null); // design-check report (null = closed) (Fase 63)
  const [collisionHits, setCollisionHits] = useState<CadCollisionHit[]>([]);
  const [clearanceIssues, setClearanceIssues] = useState<CadClearanceIssue[]>([]);
  const [safetyIssues, setSafetyIssues] = useState<CadSafetyIssue[]>([]);
  const [cadValidationReport, setCadValidationReport] = useState<CadValidationReport | null>(null);
  const [validationHighlightIds, setValidationHighlightIds] = useState<Set<string>>(new Set());
  const [flowHealth, setFlowHealth] = useState<CadFlowScore | null>(null);
  const [flowSequence, setFlowSequence] = useState<CadFlowNode[]>([]);
  const [flowSegments, setFlowSegments] = useState<CadFlowSegment[]>([]);
  const [analysisPanel, setAnalysisPanel] = useState<string | null>(null); // active analysis panel key (unify)
  const [showAnalysis, setShowAnalysis] = useState(false); // analysis dropdown open
  const analysisMenuRef = useRef<HTMLDivElement | null>(null);
  const [overlay, setOverlay] = useState<OverlayKind | null>(null); // active station-status overlay (unify)
  const [showOverlayMenu, setShowOverlayMenu] = useState(false);
  const overlayMenuRef = useRef<HTMLDivElement | null>(null);
  const overlayColorRef = useRef<Map<string, number>>(new Map()); // stationName → hex int (empty = no overlay)
  const validationHighlightRef = useRef<Set<string>>(new Set());
  const [showHeat, setShowHeat] = useState(false); // occupancy heat-map overlay on the floor (Fase 51)
  const [arr, setArr] = useState({ cols: 3, rows: 1, gap: 500, dx: 1000, dy: 0 }); // array/offset params (Fase 55)
  const [showGaps, setShowGaps] = useState(false); // clearance/safety gap markers overlay (Fase 52)
  useEffect(() => { paletteOpenRef.current = showPalette; }, [showPalette]);

  // three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const blocksRef = useRef<THREE.Group | null>(null);
  const assetsGroupRef = useRef<THREE.Group | null>(null);
  const dimsGroupRef = useRef<THREE.Group | null>(null);
  const notesGroupRef = useRef<THREE.Group | null>(null);
  const connsGroupRef = useRef<THREE.Group | null>(null);
  const cellsGroupRef = useRef<THREE.Group | null>(null); // rebuildable cell tints (unify)
  const rebuildCellsRef = useRef<() => void>(() => {});
  const connectorsRef = useRef<Conn[]>([]); // mutable line connectors (auto-connect, Fase 62)
  const cellsRef = useRef<Cell[]>([]); // mutable cells/zones (unify — editable + round-trip)
  const gridGroupRef = useRef<THREE.Group | null>(null);
  const dxfGroupRef = useRef<THREE.Group | null>(null);
  const heatGroupRef = useRef<THREE.Group | null>(null); // occupancy heat-map tiles
  const heatLoadedRef = useRef(false); // lazy-load the density grid only once per scene
  const showHeatRef = useRef(false); // current toggle, read inside the scene-init effect
  const loadHeatRef = useRef<() => void>(() => {}); // latest loadHeat, callable from init
  const gapsGroupRef = useRef<THREE.Group | null>(null); // clearance gap markers
  const gapsLoadedRef = useRef(false);
  const showGapsRef = useRef(false);
  const loadGapsRef = useRef<() => void>(() => {});
  const guidesGroupRef = useRef<THREE.Group | null>(null); // object-snap alignment guides (Fase 54)
  const dxfModelRef = useRef<DxfModel | null>(null);
  const dxfMetaRef = useRef<DxfMeta | null>(null);
  const rebuildDxfRef = useRef<() => void>(() => {});
  const [hasDxf, setHasDxf] = useState(false); // a DXF backdrop is loaded → can trace it into walls (Fase 58)
  const groundRef = useRef<THREE.Mesh | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const walkRef = useRef(false);
  const walkYawRef = useRef(0);
  const walkPitchRef = useRef(0);
  const walkKeysRef = useRef({ f: false, b: false, l: false, r: false });
  const savedCamRef = useRef<{ px: number; py: number; pz: number; tx: number; ty: number; tz: number } | null>(null);
  const previewLineRef = useRef<THREE.Line | null>(null);
  const snapMarkerRef = useRef<THREE.Mesh | null>(null); // ring shown when the cursor snaps to the DXF underlay (Fase 60)
  const dxfSnapRef = useRef<{ x: number; y: number }[]>([]); // precomputed DXF snap targets (footprint coords)
  const meshByIdRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const groupByAssetRef = useRef<Map<string, THREE.Group>>(new Map());
  const layersRef = useRef(layers);
  const applyLayersRef = useRef<() => void>(() => {});
  const undoStackRef = useRef<Snapshot[]>([]);
  const redoStackRef = useRef<Snapshot[]>([]);

  // layout state refs (drive both the scene and the save)
  const placementsRef = useRef<Map<string, Placement>>(new Map());
  const assetsRef = useRef<Map<string, Asset>>(new Map());
  const annotationsRef = useRef<Map<string, Ann>>(new Map());
  const stationsByIdRef = useRef<Map<string, St>>(new Map());
  const loadedPlacedRef = useRef<Set<string>>(new Set());
  const ctxRef = useRef<{ s: number; W: number; H: number } | null>(null);
  const measureARef = useRef<{ wx: number; wy: number } | null>(null);
  const wallChainRef = useRef<{ wx: number; wy: number } | null>(null);
  const selRef = useRef<SelItem[]>([]);
  const snapRef = useRef(snap);
  const osnapRef = useRef(osnap);
  const toolRef = useRef(tool);
  const themeRef = useRef(theme);
  const sunRef = useRef(sun);
  useEffect(() => { snapRef.current = snap; }, [snap]);
  useEffect(() => { osnapRef.current = osnap; }, [osnap]);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  // Workbench full-screen: el CAD (`fixed inset-0`) se monta DENTRO de una ruta
  // standard (pestaña CAD de line-engineering). Mientras está abierto se declara
  // workbench para que el shell oculte el dock y los widgets flotantes (que si no
  // quedan ENCIMA del lienzo). Se restablece al cerrarse/desmontarse.
  useEffect(() => {
    setWorkbenchChrome(open);
    return () => setWorkbenchChrome(false);
  }, [open]);

  // ---- sun position (azimuth/elevation) → directional light + shadows ----
  const applySun = useCallback(() => {
    const L = dirLightRef.current; const ctx = ctxRef.current;
    if (!L || !ctx) return;
    const { az, el } = sunRef.current;
    const D = Math.max(ctx.W, ctx.H) * ctx.s * 1.4;
    const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
    L.position.set(D * Math.cos(e) * Math.sin(a), Math.max(0.5, D * Math.sin(e)), D * Math.cos(e) * Math.cos(a));
  }, []);
  useEffect(() => { sunRef.current = sun; applySun(); }, [sun, applySun]);

  // ---- layer visibility (cheap: toggles object/group visibility, no rebuild) ----
  const applyLayers = useCallback(() => {
    const L = layersRef.current;
    const cadVisible = (objectId: string, fallback: CadLayerId) => {
      const layerId = layerAssignmentsRef.current[objectId] ?? fallback;
      return cadLayersRef.current.find((layer) => layer.id === layerId)?.visible ?? true;
    };
    const cadLayerVisible = (layerId: CadLayerId) =>
      cadLayersRef.current.find((layer) => layer.id === layerId)?.visible ?? true;
    if (blocksRef.current) {
      blocksRef.current.visible = true;
      blocksRef.current.children.forEach((child) => {
        const stationId = child.userData?.stationId as string | undefined;
        const labelFor = child.userData?.labelFor as string | undefined;
        if (stationId) child.visible = L.stations && cadVisible(stationId, 'layout');
        else if (labelFor) child.visible = L.labels && L.stations && cadVisible(labelFor, 'layout');
      });
    }
    if (assetsGroupRef.current) {
      assetsGroupRef.current.visible = true;
      assetsGroupRef.current.children.forEach((child) => {
        const assetId = child.userData?.assetId as string | undefined;
        if (assetId) child.visible = L.equipment && cadVisible(assetId, 'equipment');
      });
    }
    if (connsGroupRef.current) connsGroupRef.current.visible = L.connectors && cadLayerVisible('flow');
    if (dimsGroupRef.current) dimsGroupRef.current.visible = L.dims && cadLayerVisible('measurements');
    if (notesGroupRef.current) notesGroupRef.current.visible = L.notes;
    if (dxfGroupRef.current) dxfGroupRef.current.visible = L.dxf;
    if (gridGroupRef.current) gridGroupRef.current.visible = L.grid;
    sceneRef.current?.traverse((o) => {
      if (!o.userData?.isLabel) return;
      const labelFor = o.userData?.labelFor as string | undefined;
      o.visible = labelFor ? L.labels && L.stations && cadVisible(labelFor, 'layout') : L.labels;
    });
  }, []);
  useEffect(() => { applyLayersRef.current = applyLayers; }, [applyLayers]);
  useEffect(() => { layersRef.current = layers; applyLayers(); }, [layers, applyLayers]);
  useEffect(() => { cadLayersRef.current = cadLayers; applyLayers(); }, [cadLayers, applyLayers]);
  useEffect(() => { layerAssignmentsRef.current = layerAssignments; applyLayers(); }, [layerAssignments, applyLayers]);
  useEffect(() => { objectTagsRef.current = objectTags; }, [objectTags]);
  useEffect(() => { objectNotesRef.current = objectNotes; }, [objectNotes]);

  // close the view/layers popover when clicking outside it
  useEffect(() => {
    if (!showView) return;
    const onDoc = (e: MouseEvent) => { if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setShowView(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showView]);
  useEffect(() => {
    if (!showAnalysis) return;
    const onDoc = (e: MouseEvent) => { if (analysisMenuRef.current && !analysisMenuRef.current.contains(e.target as Node)) setShowAnalysis(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showAnalysis]);

  // ---- visual theme (background / fog / floor / grid colours) ----
  const applyTheme = useCallback(() => {
    const sc = sceneRef.current; const ctx = ctxRef.current; const gg = gridGroupRef.current;
    if (!sc || !ctx) return;
    const th = THEMES[themeRef.current];
    sc.background = new THREE.Color(th.bg);
    if (sc.fog instanceof THREE.Fog) sc.fog.color.setHex(th.fog);
    const ground = groundRef.current;
    if (ground) (ground.material as THREE.MeshStandardMaterial).color.setHex(th.ground);
    if (gg) {
      while (gg.children.length) { const o = gg.children[gg.children.length - 1]; gg.remove(o); disposeObject(o); }
      const { s, W, H } = ctx;
      const fpGrid = data?.footprint.gridSize || 1;
      const grid = new THREE.GridHelper(Math.max(W * s, H * s), Math.min(60, Math.max(8, Math.round(Math.max(W, H) / fpGrid / 2))), th.gridA, th.gridB);
      (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.6;
      grid.position.y = 0.01; gridHelperRef.current = grid; gg.add(grid);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(W * s, H * s)), new THREE.LineBasicMaterial({ color: 0x64748b }));
      edge.rotation.x = -Math.PI / 2; edge.position.y = 0.02; gg.add(edge);
      gg.visible = layersRef.current.grid;
    }
  }, [data]);
  useEffect(() => { applyTheme(); }, [theme, applyTheme]);

  const getPlaceRef = useCallback((it: SelItem) => (it.type === 'station' ? placementsRef.current.get(it.id) : assetsRef.current.get(it.id)), []);
  const computePropertyObject = useCallback((item: SelItem): CadPropertyObject | null => {
    const place = getPlaceRef(item);
    if (!place) return null;
    const fallbackLayer: CadLayerId = item.type === 'station' ? 'layout' : 'equipment';
    const layerId = layerAssignmentsRef.current[item.id] ?? fallbackLayer;
    const layer = cadLayersRef.current.find((candidate) => candidate.id === layerId);

    if (item.type === 'station') {
      const station = stationsByIdRef.current.get(item.id);
      return {
        id: item.id,
        type: 'station',
        label: station?.station ?? item.id,
        kind: station?.line,
        x: place.x,
        y: place.y,
        width: place.w,
        height: place.h,
        rotation: place.rotation,
        layerId,
        layerLabel: layer?.label ?? layerId,
        layerVisible: layer?.visible ?? true,
        layerLocked: layer?.locked ?? false,
        tags: objectTagsRef.current[item.id],
        notes: objectNotesRef.current[item.id],
      };
    }

    const asset = assetsRef.current.get(item.id);
    if (!asset) return null;
    const meta = assetMeta(asset.kind);
    return {
      id: item.id,
      type: 'asset',
      label: asset.label || meta.label,
      kind: asset.kind,
      x: place.x,
      y: place.y,
      width: place.w,
      height: place.h,
      rotation: place.rotation,
      layerId,
      layerLabel: layer?.label ?? layerId,
      layerVisible: layer?.visible ?? true,
      layerLocked: layer?.locked ?? false,
      tags: objectTagsRef.current[item.id],
      notes: objectNotesRef.current[item.id],
    };
  }, [getPlaceRef]);

  // Snapshot the selection's geometry into render-safe state (reads refs only
  // from event handlers, never during render — the Minimap/2D editor pattern).
  const computeSnap = useCallback((next: SelItem): SelSnap | null => {
    if (next.type === 'station') {
      const p = placementsRef.current.get(next.id);
      const st = stationsByIdRef.current.get(next.id);
      if (!p || !st) return null;
      return { type: 'station', id: next.id, x: p.x, y: p.y, w: p.w, h: p.h, rotation: p.rotation, title: st.station, subtitle: `Estación · ${st.line}${st.ctq ? ' · CTQ' : ''}`, canDuplicate: false };
    }
    const a = assetsRef.current.get(next.id);
    if (!a) return null;
    const def = assetMeta(a.kind);
    return { type: 'asset', id: next.id, x: a.x, y: a.y, w: a.w, h: a.h, rotation: a.rotation, title: a.label || def.label, subtitle: `Equipo · ${a.kind}${a.label ? ` · ${def.label}` : ''}`, kind: a.kind, height: def.height, canDuplicate: true };
  }, []);
  const refreshSelectionSnapshot = useCallback((next: SelItem[]) => {
    setSelSnap(next.length === 1 ? computeSnap(next[0]) : null);
    const objects = next.map(computePropertyObject).filter((item): item is CadPropertyObject => !!item);
    setSelSummary(summarizeCadSelectionProperties(objects));
  }, [computePropertyObject, computeSnap]);
  // Replace the whole selection (selSnap mirrors the single-object case).
  const select = useCallback((next: SelItem[]) => {
    selRef.current = next; setSelList(next);
    refreshSelectionSnapshot(next);
  }, [refreshSelectionSnapshot]);
  const refreshSnap = useCallback(() => refreshSelectionSnapshot(selRef.current), [refreshSelectionSnapshot]);

  // ---- first-person walkthrough: drop to eye level, look by dragging, WASD ----
  const toggleWalk = useCallback(() => {
    const cam = cameraRef.current; const ctrl = controlsRef.current; const ctx = ctxRef.current;
    if (!cam || !ctrl || !ctx) return;
    setWalk((prev) => {
      const next = !prev; walkRef.current = next;
      if (next) {
        savedCamRef.current = { px: cam.position.x, py: cam.position.y, pz: cam.position.z, tx: ctrl.target.x, ty: ctrl.target.y, tz: ctrl.target.z };
        ctrl.enabled = false;
        const eyeY = Math.max(ctx.W, ctx.H) * ctx.s * 0.06;
        cam.position.set(0, eyeY, Math.max(ctx.W, ctx.H) * ctx.s * 0.4);
        walkYawRef.current = 0; walkPitchRef.current = -0.05; // looking toward -Z (the plant), slightly down
        walkKeysRef.current = { f: false, b: false, l: false, r: false };
        selRef.current = []; setSelList([]); setSelSnap(null);
      } else {
        const s = savedCamRef.current;
        if (s) { cam.position.set(s.px, s.py, s.pz); ctrl.target.set(s.tx, s.ty, s.tz); }
        ctrl.enabled = true; ctrl.update();
      }
      return next;
    });
  }, []);

  // ---- data ----
  useEffect(() => {
    if (!open || !model) return;
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setData(null); setError(null); setSelList([]); setSelSnap(null); setDirty(false); setTab('stations');
      setOverlay(null); setTool('select'); setMeasureLive(null); setWalk(false); setHist({ undo: 0, redo: 0 }); setCellsView([]); setValidationHighlightIds(new Set()); setCollisionHits([]); setClearanceIssues([]); setSafetyIssues([]); setCadValidationReport(null); setFlowHealth(null); setFlowSequence([]); setFlowSegments([]); setSnapshotDiff(null); setReport(null);
    });
    selRef.current = []; overlayColorRef.current = new Map(); validationHighlightRef.current = new Set(); toolRef.current = 'select'; measureARef.current = null; wallChainRef.current = null;
    walkRef.current = false; savedCamRef.current = null; undoStackRef.current = []; redoStackRef.current = [];
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/line-engineering/layout?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`);
        if (!alive) return;
        if (!r.ok) { setError('No se pudo cargar el layout.'); return; }
        const d = (await r.json()) as Layout;
        const pl = new Map<string, Placement>();
        d.stations.forEach((s) => {
          if (s.x !== null && s.y !== null) {
            pl.set(s.id, {
              x: s.x, y: s.y,
              w: s.w ?? Math.round(d.footprint.footprintW * 0.06),
              h: s.h ?? Math.round(d.footprint.footprintH * 0.08),
              rotation: s.rotation ?? 0,
            });
          }
        });
        const am = new Map<string, Asset>();
        (d.assets ?? []).forEach((a) => am.set(a.id, { ...a, rotation: a.rotation ?? 0 }));
        const an = new Map<string, Ann>();
        (d.annotations ?? []).forEach((a) => { if (a && a.id) an.set(a.id, a); });
        placementsRef.current = pl;
        assetsRef.current = am;
        annotationsRef.current = an;
        stationsByIdRef.current = new Map(d.stations.map((s) => [s.id, s]));
        connectorsRef.current = (d.connectors ?? []).map((c) => ({ ...c }));
        cellsRef.current = (d.cells ?? []).map((c) => ({ ...c }));
        setCellsView(cellsRef.current.map((c) => ({ ...c, stationIds: [...c.stationIds] })));
        setApproval((d as { approval?: LayoutApproval }).approval ?? { status: 'draft', by: null, at: null, note: null });
        loadedPlacedRef.current = new Set(pl.keys());
        setPlacedIds(new Set(pl.keys()));
        setAssetIds(new Set(am.keys()));
        setDimCount([...an.values()].filter((a) => a.type === 'dim').length);
        setData(d);
        // fetch + parse the read-only DXF backdrop (the endpoint already serves
        // the raw drawing); render it on the floor once ready.
        dxfModelRef.current = null; dxfMetaRef.current = null; dxfSnapRef.current = []; setHasDxf(false); setDxfWarnings([]); setDxfImportPreview(null);
        if (d.dxf) {
          try {
            const rd = await apiFetch(`${API_BASE}/line-engineering/layout/dxf?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`);
            if (alive && rd.ok) {
              const raw = (await rd.json()) as { data?: string } | null;
              dxfModelRef.current = raw?.data ? parseDxf(raw.data) : null;
              dxfMetaRef.current = d.dxf;
              setHasDxf(!!dxfModelRef.current && !!dxfMetaRef.current);
              dxfSnapRef.current = dxfModelRef.current && dxfMetaRef.current ? dxfSnapPoints(dxfModelRef.current, dxfMetaRef.current) : [];
              rebuildDxfRef.current();
            }
          } catch { /* ignore — backdrop is optional */ }
        }
      } catch {
        if (alive) setError('No se pudo cargar el layout.');
      }
    })();
    return () => { alive = false; };
  }, [open, model, revision, reloadTick]);

  const snapWorld = useCallback((v: number) => {
    const g = data?.footprint.gridSize || 1;
    return maybeSnapScalarToGrid(v, g, snapRef.current);
  }, [data]);

  // ---- (re)build the station blocks + connectors ----
  const rebuildBlocks = useCallback(() => {
    const blocks = blocksRef.current; const conns = connsGroupRef.current; const ctx = ctxRef.current;
    if (!blocks || !ctx || !data) return;
    while (blocks.children.length) { const o = blocks.children[blocks.children.length - 1]; blocks.remove(o); disposeObject(o); }
    if (conns) while (conns.children.length) { const o = conns.children[conns.children.length - 1]; conns.remove(o); disposeObject(o); }
    meshByIdRef.current = new Map();
    const { s, W, H } = ctx;
    const byId = new Map(data.stations.map((st) => [st.id, st]));
    placementsRef.current.forEach((p, id) => {
      const st = byId.get(id); if (!st) return;
      const hgt = Math.max(0.6, Math.min(p.w * s, p.h * s) * 0.7);
      const isSel = selRef.current.some((s) => s.type === 'station' && s.id === id);
      const isAlert = validationHighlightRef.current.has(id);
      const ov = overlayColorRef.current.get(st.station); // station-status overlay tint (unify)
      const color = isAlert ? 0xf87171 : isSel ? SELECT : ov !== undefined ? ov : st.ctq ? AMBER : ROSE;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(p.w * s, hgt, p.h * s),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.12, emissive: isAlert ? 0x7f1d1d : isSel ? 0x0e7490 : 0x000000 }),
      );
      mesh.castShadow = true;
      mesh.userData.stationId = id;
      const cx = (p.x + p.w / 2 - W / 2) * s;
      const cz = (p.y + p.h / 2 - H / 2) * s;
      mesh.position.set(cx, hgt / 2, cz);
      mesh.rotation.y = -(p.rotation * Math.PI) / 180;
      blocks.add(mesh);
      meshByIdRef.current.set(id, mesh);
      const label = makeLabel(st.station);
      label.position.set(cx, hgt + 1.1, cz);
      label.userData.labelFor = id;
      blocks.add(label);
    });
    // connectors as arched tubes between placed block tops
    connectorsRef.current.forEach((cn) => {
      const a = placementsRef.current.get(cn.from); const b = placementsRef.current.get(cn.to);
      if (!a || !b) return;
      const ha = Math.max(0.6, Math.min(a.w * s, a.h * s) * 0.7);
      const hb = Math.max(0.6, Math.min(b.w * s, b.h * s) * 0.7);
      const start = new THREE.Vector3((a.x + a.w / 2 - W / 2) * s, ha + 0.2, (a.y + a.h / 2 - H / 2) * s);
      const end = new THREE.Vector3((b.x + b.w / 2 - W / 2) * s, hb + 0.2, (b.y + b.h / 2 - H / 2) * s);
      const mid = start.clone().add(end).multiplyScalar(0.5); mid.y += start.distanceTo(end) * 0.22 + 0.8;
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start, mid, end), 24, 0.09, 7, false),
        new THREE.MeshStandardMaterial({ color: cn.kind === 'conveyor' ? 0x7c3aed : cn.kind === 'return' ? 0x94a3b8 : 0x3b82f6, roughness: 0.4 }),
      );
      (conns ?? blocks).add(tube);
    });
    applyLayersRef.current();
  }, [data]);

  // ---- (re)build the equipment/asset group ----
  const rebuildAssets = useCallback(() => {
    const group = assetsGroupRef.current; const ctx = ctxRef.current;
    if (!group || !ctx) return;
    while (group.children.length) { const o = group.children[group.children.length - 1]; group.remove(o); disposeObject(o); }
    groupByAssetRef.current = new Map();
    const { s, W, H } = ctx;
    assetsRef.current.forEach((a) => {
      const isSel = selRef.current.some((s) => s.type === 'asset' && s.id === a.id);
      const g = buildAssetGroup(a, s, W, H, isSel, validationHighlightRef.current.has(a.id));
      group.add(g);
      groupByAssetRef.current.set(a.id, g);
    });
  }, []);

  // ---- (re)build the dimension/cota overlay (preserves the live preview line) ----
  const rebuildDims = useCallback(() => {
    const group = dimsGroupRef.current; const ctx = ctxRef.current;
    if (!group || !ctx) return;
    const preview = previewLineRef.current;
    for (let i = group.children.length - 1; i >= 0; i--) {
      const o = group.children[i];
      if (o === preview) continue;
      group.remove(o); disposeObject(o);
    }
    const { s, W, H } = ctx;
    const unit = data?.footprint.unit || 'mm';
    annotationsRef.current.forEach((a) => {
      if (a.type !== 'dim') return;
      buildDim(a, s, W, H, unit).forEach((o) => group.add(o));
    });
    if (preview && !group.children.includes(preview)) group.add(preview);
  }, [data]);
  const refreshMeasurementRows = useCallback(() => {
    const unit = data?.footprint.unit || 'mm';
    setMeasurementRowsView([...annotationsRef.current.values()]
      .filter((ann) => ann.type === 'dim' && ann.x2 != null && ann.y2 != null)
      .map((ann) => ({
        id: ann.id,
        label: ann.text || fmtDist(Math.hypot((ann.x2 ?? ann.x) - ann.x, (ann.y2 ?? ann.y) - ann.y), unit),
        length: fmtDist(Math.hypot((ann.x2 ?? ann.x) - ann.x, (ann.y2 ?? ann.y) - ann.y), unit),
      }))
      .slice(0, 8));
  }, [data]);
  useEffect(() => { refreshMeasurementRows(); }, [dimCount, refreshMeasurementRows]);

  // ---- (re)build the free-text notes overlay ----
  const rebuildNotes = useCallback(() => {
    const group = notesGroupRef.current; const ctx = ctxRef.current;
    if (!group || !ctx) return;
    while (group.children.length) { const o = group.children[group.children.length - 1]; group.remove(o); disposeObject(o); }
    const { s, W, H } = ctx;
    annotationsRef.current.forEach((a) => {
      if (a.type !== 'text' || !a.text) return;
      const lab = makeNoteLabel(a.text);
      lab.position.set((a.x - W / 2) * s, 1.2, (a.y - H / 2) * s);
      lab.userData.noteId = a.id;
      group.add(lab);
    });
  }, []);

  // ---- (re)build the read-only DXF floor-plan overlay (lines on the floor) ----
  const rebuildDxf = useCallback(() => {
    const group = dxfGroupRef.current; const ctx = ctxRef.current;
    if (!group || !ctx) return;
    while (group.children.length) { const o = group.children[group.children.length - 1]; group.remove(o); disposeObject(o); }
    const model = dxfModelRef.current; const meta = dxfMetaRef.current;
    if (!model || !meta) return;
    group.visible = layersRef.current.dxf && meta.visible !== false;
    const { s, W, H } = ctx;
    const { scale, offsetX: ox, offsetY: oy } = meta;
    const cx = (model.width * scale) / 2 + ox, cy = (model.height * scale) / 2 + oy; // rotation pivot (world)
    const rad = ((meta.rotation || 0) * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const mat3 = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: Math.min(1, Math.max(0.15, meta.opacity ?? 0.6)) });
    model.polylines.forEach((flat) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        const wx0 = flat[i] * scale + ox, wy0 = flat[i + 1] * scale + oy;
        const dx = wx0 - cx, dy = wy0 - cy;
        const wx = cx + dx * cos - dy * sin, wy = cy + dx * sin + dy * cos; // footprint world coords
        pts.push(new THREE.Vector3((wx - W / 2) * s, 0.045, (wy - H / 2) * s));
      }
      if (pts.length >= 2) group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat3));
    });
  }, []);
  useEffect(() => { rebuildDxfRef.current = rebuildDxf; }, [rebuildDxf]);

  // ---- occupancy heat-map: paint the floor by zone density (Fase 51) ----
  // Reuses the density grid (Fase 48) and the same rose intensity ramp as the 2D
  // panel, so a packed corner glows solid and dead floor stays bare.
  const buildHeatTiles = useCallback((grid: number[][]) => {
    const group = heatGroupRef.current; const ctx = ctxRef.current;
    if (!group || !ctx) return;
    group.children.slice().forEach((c) => {
      group.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose?.();
      (m.material as THREE.Material)?.dispose?.();
    });
    const { s, W, H } = ctx;
    const rows = grid.length; const cols = grid[0]?.length ?? 0;
    if (!rows || !cols) return;
    const cw = W / cols, ch = H / rows; // footprint units per cell
    const rose = new THREE.Color(0xf43f5e);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const pct = grid[r][c];
        if (pct < 1) continue; // bare floor stays bare
        const t = Math.min(1, pct / 100);
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(cw * s * 0.92, ch * s * 0.92),
          new THREE.MeshBasicMaterial({ color: rose, transparent: true, opacity: 0.12 + 0.6 * t, depthWrite: false }),
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(((c + 0.5) * cw - W / 2) * s, 0.05, ((r + 0.5) * ch - H / 2) * s);
        group.add(plane);
      }
    }
  }, []);

  const loadHeat = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/line-engineering/layout/density?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`);
      if (!r.ok) return;
      const d = (await r.json()) as { grid?: number[][] };
      buildHeatTiles(d.grid ?? []);
    } catch {
      /* heat-map is a non-critical overlay — ignore fetch errors */
    }
  }, [model, revision, buildHeatTiles]);

  useEffect(() => { loadHeatRef.current = loadHeat; }, [loadHeat]);
  // Toggle visibility; lazy-load the grid the first time it's switched on.
  useEffect(() => {
    showHeatRef.current = showHeat;
    const group = heatGroupRef.current;
    if (!group) return;
    group.visible = showHeat;
    if (showHeat && !heatLoadedRef.current) {
      heatLoadedRef.current = true;
      loadHeat();
    }
  }, [showHeat, loadHeat]);

  // ---- clearance / safety gap markers on the floor (Fase 52) ----
  // Reuses the clearance analysis (Fase 43): draws a link between each pair of
  // objects flagged as too close (amber, with the gap) or overlapping (red), so
  // the safety problems the 2D panel lists become visible in the 3D scene.
  const buildGapMarkers = useCallback((tightPairs: ClearancePair[], overlaps: ClearancePair[]) => {
    const group = gapsGroupRef.current; const ctx = ctxRef.current;
    if (!group || !ctx) return;
    group.children.slice().forEach((c) => {
      group.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x?.dispose?.()); else mat?.dispose?.();
    });
    const { s, W, H } = ctx;
    const centerOf = (id: string): { cx: number; cy: number } | null => {
      const p = placementsRef.current.get(id);
      if (p) return { cx: p.x + p.w / 2, cy: p.y + p.h / 2 };
      const a = assetsRef.current.get(id);
      if (a) return { cx: a.x + a.w / 2, cy: a.y + a.h / 2 };
      return null;
    };
    const y = 0.08;
    const draw = (pair: ClearancePair, color: number, withLabel: boolean) => {
      const ca = centerOf(pair.a); const cb = centerOf(pair.b);
      if (!ca || !cb) return;
      const ax = (ca.cx - W / 2) * s, az = (ca.cy - H / 2) * s;
      const bx = (cb.cx - W / 2) * s, bz = (cb.cy - H / 2) * s;
      group.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz)]),
        new THREE.LineBasicMaterial({ color }),
      ));
      [[ax, az], [bx, bz]].forEach(([px, pz]) => {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), new THREE.MeshBasicMaterial({ color }));
        dot.position.set(px, y, pz); group.add(dot);
      });
      if (withLabel) {
        const label = makeLabel(`${Math.round(pair.gap)}`, 0.85);
        label.position.set((ax + bx) / 2, y + 0.7, (az + bz) / 2);
        group.add(label);
      }
    };
    overlaps.forEach((p) => draw(p, 0xef4444, false)); // red = overlap (most severe)
    tightPairs.forEach((p) => draw(p, 0xf59e0b, true)); // amber = too close, with the gap
  }, []);

  const loadGaps = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/line-engineering/layout/clearance?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`);
      if (!r.ok) return;
      const d = (await r.json()) as { tightPairs?: ClearancePair[]; overlaps?: ClearancePair[] };
      buildGapMarkers(d.tightPairs ?? [], d.overlaps ?? []);
    } catch {
      /* clearance overlay is non-critical — ignore fetch errors */
    }
  }, [model, revision, buildGapMarkers]);

  useEffect(() => { loadGapsRef.current = loadGaps; }, [loadGaps]);
  useEffect(() => {
    showGapsRef.current = showGaps;
    const group = gapsGroupRef.current;
    if (!group) return;
    group.visible = showGaps;
    if (showGaps && !gapsLoadedRef.current) {
      gapsLoadedRef.current = true;
      loadGaps();
    }
  }, [showGaps, loadGaps]);

  const rebuildAll = useCallback(() => { rebuildBlocks(); rebuildAssets(); rebuildDims(); rebuildNotes(); rebuildCellsRef.current(); }, [rebuildBlocks, rebuildAssets, rebuildDims, rebuildNotes]);

  // ---- live station-status overlay: colour blocks by MES / heat / etc. (unify) ----
  const loadOverlay = useCallback(async (kind: OverlayKind | null) => {
    setOverlay(kind); setShowOverlayMenu(false);
    if (!kind || !model) { overlayColorRef.current = new Map(); rebuildBlocks(); return; }
    const def = OVERLAY_DEFS.find((o) => o.key === kind);
    if (!def) return;
    try {
      const r = await apiFetch(`${API_BASE}/line-engineering/layout/${def.endpoint}?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`);
      if (!r.ok) { toast.error('No se pudo cargar la capa de estado.', '3D'); return; }
      const cm = overlayColorMap(kind, await r.json());
      overlayColorRef.current = new Map([...cm.entries()].map(([name, hex]) => [name, hexToInt(hex)]));
      rebuildBlocks();
    } catch { toast.error('No se pudo cargar la capa de estado.', '3D'); }
  }, [model, revision, rebuildBlocks, toast]);
  useEffect(() => {
    if (!showOverlayMenu) return;
    const onDoc = (e: MouseEvent) => { if (overlayMenuRef.current && !overlayMenuRef.current.contains(e.target as Node)) setShowOverlayMenu(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showOverlayMenu]);

  // ---- cells / zones: rebuildable tints + create/remove (ported from 2D, unify) ----
  const rebuildCells = useCallback(() => {
    const group = cellsGroupRef.current; const ctx = ctxRef.current;
    if (!group || !ctx) return;
    while (group.children.length) { const o = group.children[group.children.length - 1]; group.remove(o); disposeObject(o); }
    const { s, W, H } = ctx; const pad = data?.footprint.gridSize || 0;
    cellsRef.current.forEach((c) => {
      const members = c.stationIds.map((id) => placementsRef.current.get(id)).filter(Boolean) as Placement[];
      if (!members.length) return;
      const x0 = Math.min(...members.map((m) => m.x)) - pad, y0 = Math.min(...members.map((m) => m.y)) - pad;
      const x1 = Math.max(...members.map((m) => m.x + m.w)) + pad, y1 = Math.max(...members.map((m) => m.y + m.h)) + pad;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry((x1 - x0) * s, (y1 - y0) * s),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(c.color), transparent: true, opacity: 0.18 }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(((x0 + x1) / 2 - W / 2) * s, 0.03, ((y0 + y1) / 2 - H / 2) * s);
      group.add(plane);
    });
  }, [data]);
  useEffect(() => { rebuildCellsRef.current = rebuildCells; }, [rebuildCells]);
  const createCellFromSelection = () => {
    const ids = selRef.current.filter((it) => it.type === 'station').map((it) => it.id);
    if (ids.length === 0) { toast.error('Selecciona estaciones para agrupar en una celda.', '3D'); return; }
    const palette = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#60a5fa', '#fb7185', '#4ade80'];
    const color = palette[cellsRef.current.length % palette.length];
    cellsRef.current = [...cellsRef.current, { id: newId('cell'), name: `Celda ${cellsRef.current.length + 1}`, color, stationIds: [...new Set(ids)] }];
    setCellsView(cellsRef.current.map((c) => ({ ...c, stationIds: [...c.stationIds] }))); setDirty(true); rebuildCells();
    toast.success('Celda creada.', '3D');
  };
  const deleteCell = (id: string) => {
    cellsRef.current = cellsRef.current.filter((c) => c.id !== id);
    setCellsView(cellsRef.current.map((c) => ({ ...c, stationIds: [...c.stationIds] }))); setDirty(true); rebuildCells();
  };

  // ---- undo / redo (memento of the editable collections) ----
  const snapshot = useCallback((): Snapshot => ({
    placements: [...placementsRef.current.entries()].map(([id, p]) => [id, { ...p }]),
    assets: [...assetsRef.current.values()].map((a) => ({ ...a })),
    annotations: [...annotationsRef.current.values()].map((a) => ({ ...a })),
    connectors: connectorsRef.current.map((c) => ({ ...c })),
  }), []);
  const recordLocalSnapshot = useCallback((label: string, reason: 'manual' | 'command' | 'import' | 'restore' = 'manual') => {
    const snap = createCadSnapshot(snapshot(), label, reason, `local-${Date.now()}`);
    setLocalSnapshots((history) => pushCadSnapshot(history, snap, 20));
    return snap.id;
  }, [snapshot]);
  const pushHistory = useCallback(() => {
    undoStackRef.current.push(snapshot());
    if (undoStackRef.current.length > 80) undoStackRef.current.shift();
    redoStackRef.current = [];
    setHist({ undo: undoStackRef.current.length, redo: 0 });
  }, [snapshot]);
  const restore = useCallback((s: Snapshot) => {
    placementsRef.current = new Map(s.placements.map(([id, p]) => [id, { ...p }]));
    assetsRef.current = new Map(s.assets.map((a) => [a.id, { ...a }]));
    annotationsRef.current = new Map(s.annotations.map((a) => [a.id, { ...a }]));
    connectorsRef.current = (s.connectors ?? []).map((c) => ({ ...c }));
    setPlacedIds(new Set(placementsRef.current.keys()));
    setAssetIds(new Set(assetsRef.current.keys()));
    setDimCount([...annotationsRef.current.values()].filter((a) => a.type === 'dim').length);
    // drop any selected items that no longer exist after the restore
    const kept = selRef.current.filter((c) => c.type === 'station' ? placementsRef.current.has(c.id) : assetsRef.current.has(c.id));
    selRef.current = kept; setSelList(kept);
    setSelSnap(kept.length === 1 ? computeSnap(kept[0]) : null);
    setDirty(true); rebuildAll();
  }, [computeSnap, rebuildAll]);
  const undo = useCallback(() => {
    if (!undoStackRef.current.length) return;
    redoStackRef.current.push(snapshot());
    restore(undoStackRef.current.pop()!);
    setHist({ undo: undoStackRef.current.length, redo: redoStackRef.current.length });
  }, [snapshot, restore]);
  const redo = useCallback(() => {
    if (!redoStackRef.current.length) return;
    undoStackRef.current.push(snapshot());
    restore(redoStackRef.current.pop()!);
    setHist({ undo: undoStackRef.current.length, redo: redoStackRef.current.length });
  }, [snapshot, restore]);

  // ---- scene lifecycle ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!open || !data || !mount) return;
    let raf = 0; let disposed = false;
    const width = mount.clientWidth || 1200;
    const height = mount.clientHeight || 700;
    const fp = data.footprint;
    const W = fp.footprintW || 1; const H = fp.footprintH || 1;
    const s = 30 / Math.max(W, H);
    ctxRef.current = { s, W, H };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1e);
    scene.fog = new THREE.Fog(0x0a0f1e, Math.max(W, H) * s * 1.4, Math.max(W, H) * s * 3.4);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 4000);
    camera.position.set(W * s * 0.45, Math.max(W, H) * s * 0.8, H * s * 1.0 + 10);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const hemi = new THREE.HemisphereLight(0x9bbcff, 0x1e293b, 0.5); scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.15);
    dir.position.set(W * s * 0.6, Math.max(W, H) * s * 1.2, H * s * 0.4);
    dir.castShadow = true;
    const sh = Math.max(W, H) * s;
    dir.shadow.camera.left = -sh; dir.shadow.camera.right = sh;
    dir.shadow.camera.top = sh; dir.shadow.camera.bottom = -sh;
    dir.shadow.camera.near = 0.1; dir.shadow.camera.far = sh * 4;
    dir.shadow.mapSize.set(2048, 2048);
    scene.add(dir);
    dirLightRef.current = dir;

    // floor + grid + footprint outline (grid built by applyTheme so it follows the theme)
    const deco = new THREE.Group(); scene.add(deco);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W * s, H * s),
      new THREE.MeshStandardMaterial({ color: 0x14203a, roughness: 0.95, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2; ground.position.y = 0; ground.receiveShadow = true;
    groundRef.current = ground; deco.add(ground);
    const gridGroup = new THREE.Group(); deco.add(gridGroup); gridGroupRef.current = gridGroup;
    // cell floor tints — rebuildable so cells can be created/removed live (unify)
    const cellsGroup = new THREE.Group(); deco.add(cellsGroup); cellsGroupRef.current = cellsGroup;
    rebuildCellsRef.current();

    const assetsGroup = new THREE.Group(); scene.add(assetsGroup); assetsGroupRef.current = assetsGroup;
    const connsGroup = new THREE.Group(); scene.add(connsGroup); connsGroupRef.current = connsGroup;
    const dimsGroup = new THREE.Group(); scene.add(dimsGroup); dimsGroupRef.current = dimsGroup;
    const previewLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xfcd34d }),
    );
    previewLine.visible = false; previewLineRef.current = previewLine; dimsGroup.add(previewLine);
    // Snap-to-underlay marker — a flat ring that lights up on a DXF snap target.
    // Added to the scene (not dimsGroup) so dim rebuilds never dispose it.
    const snapMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.28, 24),
      new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false }),
    );
    snapMarker.rotation.x = -Math.PI / 2; snapMarker.renderOrder = 999; snapMarker.visible = false;
    snapMarkerRef.current = snapMarker; scene.add(snapMarker);
    const notesGroup = new THREE.Group(); scene.add(notesGroup); notesGroupRef.current = notesGroup;
    const dxfGroup = new THREE.Group(); scene.add(dxfGroup); dxfGroupRef.current = dxfGroup;
    const heatGroup = new THREE.Group(); heatGroup.visible = showHeatRef.current; scene.add(heatGroup); heatGroupRef.current = heatGroup; heatLoadedRef.current = false;
    if (showHeatRef.current) { heatLoadedRef.current = true; loadHeatRef.current(); }
    const gapsGroup = new THREE.Group(); gapsGroup.visible = showGapsRef.current; scene.add(gapsGroup); gapsGroupRef.current = gapsGroup; gapsLoadedRef.current = false;
    if (showGapsRef.current) { gapsLoadedRef.current = true; loadGapsRef.current(); }
    const guidesGroup = new THREE.Group(); scene.add(guidesGroup); guidesGroupRef.current = guidesGroup;
    const blocks = new THREE.Group(); scene.add(blocks); blocksRef.current = blocks;
    rebuildAssets();
    rebuildDims();
    rebuildNotes();
    rebuildDxf();
    rebuildBlocks();
    applyTheme();
    applyLayers();
    applySun();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.1;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, 0, 0); controls.update();
    controlsRef.current = controls;

    // ---- drag a station block or an asset on the floor ----
    const raycaster = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    let drag: { lead: SelItem; items: SelItem[]; grabDX: number; grabDZ: number; start: Map<string, { x: number; y: number }>; xEdges: number[]; yEdges: number[] } | null = null;
    // Snap a moving box's edges/centre to other objects' edges/centres + the
    // footprint, returning the offset to apply and the world axis to draw a guide.
    const snap1D = (lo: number, len: number, edges: number[], tol: number): { off: number; axis: number } | null => {
      const pts = [lo, lo + len / 2, lo + len];
      let best: { off: number; axis: number; d: number } | null = null;
      for (const p of pts) for (const ed of edges) {
        const d = Math.abs(p - ed);
        if (d <= tol && (!best || d < best.d)) best = { off: ed - p, axis: ed, d };
      }
      return best ? { off: best.off, axis: best.axis } : null;
    };
    const setGuides = (vx: number | null, hy: number | null) => {
      const grp = guidesGroupRef.current; const ctx = ctxRef.current;
      if (!grp || !ctx) return;
      grp.children.slice().forEach((c) => { grp.remove(c); (c as THREE.Line).geometry?.dispose?.(); });
      const { s, W, H } = ctx; const yy = 0.06;
      const mat = () => new THREE.LineBasicMaterial({ color: 0x22d3ee });
      if (vx !== null) {
        const x = (vx - W / 2) * s;
        grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, yy, (-H / 2) * s), new THREE.Vector3(x, yy, (H / 2) * s)]), mat()));
      }
      if (hy !== null) {
        const z = (hy - H / 2) * s;
        grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3((-W / 2) * s, yy, z), new THREE.Vector3((W / 2) * s, yy, z)]), mat()));
      }
    };
    let downX = 0, downY = 0;
    let dragMoved = false;
    let dragSnap: Snapshot | null = null;
    const unit = data.footprint.unit || 'mm';

    const resolveAssetId = (o: THREE.Object3D | null): string | null => {
      let cur: THREE.Object3D | null = o;
      while (cur) { if (cur.userData?.assetId) return cur.userData.assetId as string; cur = cur.parent; }
      return null;
    };
    const getPlace = (it: SelItem) => (it.type === 'station' ? placementsRef.current.get(it.id) : assetsRef.current.get(it.id));
    // Move an item's three.js object to match its current placement (no rebuild).
    const repositionItem = (it: SelItem) => {
      const ctx = ctxRef.current!; const p = getPlace(it); if (!p) return;
      const ncx = (p.x + p.w / 2 - ctx.W / 2) * ctx.s, ncz = (p.y + p.h / 2 - ctx.H / 2) * ctx.s;
      if (it.type === 'station') {
        const mesh = meshByIdRef.current.get(it.id); if (mesh) { mesh.position.x = ncx; mesh.position.z = ncz; }
        const lab = blocks.children.find((o) => (o as THREE.Sprite).userData?.labelFor === it.id);
        if (lab) { lab.position.x = ncx; lab.position.z = ncz; }
      } else {
        const g = groupByAssetRef.current.get(it.id); if (g) { g.position.x = ncx; g.position.z = ncz; }
      }
    };
    const eyeY = Math.max(W, H) * s * 0.06;
    let walkLook = false, lookX = 0, lookY = 0;
    const setPtr = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    /** World (x,y) of the floor point under the pointer, or null. */
    const floorWorld = (e: PointerEvent): { wx: number; wy: number } | null => {
      setPtr(e); raycaster.setFromCamera(ptr, camera);
      if (!raycaster.ray.intersectPlane(floorPlane, hit)) return null;
      const ctx = ctxRef.current!;
      return { wx: hit.x / ctx.s + ctx.W / 2, wy: hit.z / ctx.s + ctx.H / 2 };
    };
    /**
     * Snap a raw floor point to the nearest DXF underlay target (object-snap to
     * underlay) when osnap is on and a plan is loaded; otherwise grid-snap. (Fase 60)
     */
    const snapFloor = (wx: number, wy: number): { wx: number; wy: number; onDxf: boolean } => {
      const ctx = ctxRef.current!;
      if (osnapRef.current && dxfSnapRef.current.length) {
        const tol = Math.max(ctx.W, ctx.H) * 0.012;
        const hit = nearestSnapPoint(dxfSnapRef.current, wx, wy, tol);
        if (hit) return { wx: hit.x, wy: hit.y, onDxf: true };
      }
      return { wx: snapWorld(wx), wy: snapWorld(wy), onDxf: false };
    };
    const showSnapMarker = (wx: number | null, wy?: number) => {
      const m = snapMarkerRef.current; const ctx = ctxRef.current; if (!m || !ctx) return;
      if (wx === null || wy === undefined) { m.visible = false; return; }
      m.position.set((wx - ctx.W / 2) * ctx.s, 0.07, (wy - ctx.H / 2) * ctx.s);
      m.visible = true;
    };
    const onDown = (e: PointerEvent) => {
      downX = e.clientX; downY = e.clientY;
      if (walkRef.current) { walkLook = true; lookX = e.clientX; lookY = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); return; }
      if (toolRef.current !== 'select') return; // measure/wall resolve on click (pointerup); drag still orbits
      setPtr(e); raycaster.setFromCamera(ptr, camera);
      // clicking a dimension label removes that cota
      const dimHit = raycaster.intersectObjects(dimsGroup.children, false).find((h) => (h.object as THREE.Sprite).userData?.dimId);
      if (dimHit) {
        const id = (dimHit.object as THREE.Sprite).userData.dimId as string;
        pushHistory();
        annotationsRef.current.delete(id);
        setDimCount([...annotationsRef.current.values()].filter((x) => x.type === 'dim').length);
        setDirty(true); rebuildDims(); toast.success('Cota eliminada.', '3D');
        return;
      }
      // clicking a text note removes it
      const noteHit = raycaster.intersectObjects(notesGroup.children, false).find((h) => (h.object as THREE.Sprite).userData?.noteId);
      if (noteHit) {
        const id = (noteHit.object as THREE.Sprite).userData.noteId as string;
        pushHistory();
        annotationsRef.current.delete(id);
        setDirty(true); rebuildNotes(); toast.success('Nota eliminada.', '3D');
        return;
      }
      const stationHits = raycaster.intersectObjects(blocks.children, false)
        .filter((h) => (h.object as THREE.Mesh).userData?.stationId)
        .map((h) => ({ d: h.distance, type: 'station' as const, id: (h.object as THREE.Mesh).userData.stationId as string, obj: h.object }));
      const assetHits = raycaster.intersectObjects(assetsGroup.children, true)
        .map((h) => ({ d: h.distance, id: resolveAssetId(h.object) }))
        .filter((h) => h.id)
        .map((h) => ({ d: h.d, type: 'asset' as const, id: h.id as string, obj: groupByAssetRef.current.get(h.id as string)! }));
      const all = [...stationHits, ...assetHits].sort((a, b) => a.d - b.d);
      if (all.length) {
        const top = all[0];
        const item: SelItem = { type: top.type, id: top.id };
        // Shift+click toggles membership without starting a drag
        if (e.shiftKey) {
          const exists = selRef.current.some((s) => sameSel(s, item));
          select(exists ? selRef.current.filter((s) => !sameSel(s, item)) : [...selRef.current, item]);
          rebuildAll();
          return;
        }
        const inSel = selRef.current.some((s) => sameSel(s, item));
        const items = inSel && selRef.current.length > 1 ? [...selRef.current] : [item];
        if (!inSel) select([item]);
        if (isObjectLayerLocked(cadLayersRef.current, layerAssignmentsRef.current, item.id, item.type === 'station' ? 'layout' : 'equipment')) {
          toast.error('El objeto está en una capa bloqueada. Desbloquea la capa para moverlo.', 'Capas');
          rebuildAll();
          return;
        }
        const unlockedItems = items.filter((it) => !isObjectLayerLocked(cadLayersRef.current, layerAssignmentsRef.current, it.id, it.type === 'station' ? 'layout' : 'equipment'));
        if (unlockedItems.length !== items.length) toast.error('Algunos objetos no se moverán porque su capa está bloqueada.', 'Capas');
        raycaster.ray.intersectPlane(floorPlane, hit);
        const start = new Map<string, { x: number; y: number }>();
        unlockedItems.forEach((it) => { const p = getPlace(it); if (p) start.set(`${it.type}:${it.id}`, { x: p.x, y: p.y }); });
        // Collect alignment candidates from every OTHER object + the footprint.
        const ctxD = ctxRef.current!;
        const excl = new Set(unlockedItems.map((it) => `${it.type}:${it.id}`));
        const xEdges: number[] = [0, ctxD.W / 2, ctxD.W];
        const yEdges: number[] = [0, ctxD.H / 2, ctxD.H];
        placementsRef.current.forEach((p, id) => {
          if (excl.has(`station:${id}`)) return;
          xEdges.push(p.x, p.x + p.w / 2, p.x + p.w); yEdges.push(p.y, p.y + p.h / 2, p.y + p.h);
        });
        assetsRef.current.forEach((a) => {
          if (excl.has(`asset:${a.id}`)) return;
          xEdges.push(a.x, a.x + a.w / 2, a.x + a.w); yEdges.push(a.y, a.y + a.h / 2, a.y + a.h);
        });
        drag = { lead: item, items: unlockedItems, grabDX: top.obj.position.x - hit.x, grabDZ: top.obj.position.z - hit.z, start, xEdges, yEdges };
        dragMoved = false; dragSnap = snapshot();
        controls.enabled = false;
        rebuildAll();
        renderer.domElement.setPointerCapture(e.pointerId);
      } else if (e.button === 0 && !e.shiftKey) {
        select([]); rebuildAll();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (walkRef.current) {
        if (!walkLook) return;
        walkYawRef.current -= (e.clientX - lookX) * 0.005;
        walkPitchRef.current = Math.max(-1.3, Math.min(1.3, walkPitchRef.current - (e.clientY - lookY) * 0.005));
        lookX = e.clientX; lookY = e.clientY;
        return;
      }
      if (toolRef.current === 'measure' || toolRef.current === 'wall') {
        const w = floorWorld(e); if (!w) { showSnapMarker(null); return; }
        const s = snapFloor(w.wx, w.wy); // snap the live endpoint to the underlay
        showSnapMarker(s.onDxf ? s.wx : null, s.wy);
        const a = toolRef.current === 'measure' ? measureARef.current : wallChainRef.current;
        if (!a) return; // marker shown for the first point; wait for the anchor to draw a segment
        const ctx = ctxRef.current!;
        const ax = (a.wx - ctx.W / 2) * ctx.s, az = (a.wy - ctx.H / 2) * ctx.s;
        const ex = (s.wx - ctx.W / 2) * ctx.s, ez = (s.wy - ctx.H / 2) * ctx.s;
        const pl = previewLineRef.current;
        if (pl) { (pl.geometry as THREE.BufferGeometry).setFromPoints([new THREE.Vector3(ax, 0.06, az), new THREE.Vector3(ex, 0.06, ez)]); pl.visible = true; }
        const dist = Math.hypot(s.wx - a.wx, s.wy - a.wy);
        const tag = s.onDxf ? ' · plano' : '';
        if (toolRef.current === 'wall') {
          const deg = (((Math.atan2(s.wy - a.wy, s.wx - a.wx) * 180) / Math.PI) % 360 + 360) % 360;
          setMeasureLive(`${fmtDist(dist, unit)} · ${Math.round(deg)}°${tag}`);
        } else setMeasureLive(`${fmtDist(dist, unit)}${tag}`);
        return;
      }
      if (!drag) return;
      setPtr(e); raycaster.setFromCamera(ptr, camera);
      if (!raycaster.ray.intersectPlane(floorPlane, hit)) return;
      const ctx = ctxRef.current!;
      const leadP = getPlace(drag.lead); const startLead = drag.start.get(`${drag.lead.type}:${drag.lead.id}`);
      if (!leadP || !startLead) return;
      const worldCX = (hit.x + drag.grabDX) / ctx.s + ctx.W / 2;
      const worldCY = (hit.z + drag.grabDZ) / ctx.s + ctx.H / 2;
      // group delta from the lead's snapped position, clamped so all stay in bounds
      let targetX = snapWorld(worldCX - leadP.w / 2);
      let targetY = snapWorld(worldCY - leadP.h / 2);
      // Object snap: align the lead's edges/centre to other objects + the footprint.
      let gvx: number | null = null, ghy: number | null = null;
      if (osnapRef.current && drag.xEdges) {
        const tol = Math.max(ctx.W, ctx.H) * 0.012;
        const sx = snap1D(targetX, leadP.w, drag.xEdges, tol);
        if (sx) { targetX += sx.off; gvx = sx.axis; }
        const sy = snap1D(targetY, leadP.h, drag.yEdges, tol);
        if (sy) { targetY += sy.off; ghy = sy.axis; }
      }
      setGuides(gvx, ghy);
      let dx = targetX - startLead.x;
      let dy = targetY - startLead.y;
      let dxLo = -Infinity, dxHi = Infinity, dyLo = -Infinity, dyHi = Infinity;
      drag.items.forEach((it) => {
        const sp = drag!.start.get(`${it.type}:${it.id}`); const pp = getPlace(it); if (!sp || !pp) return;
        dxLo = Math.max(dxLo, -sp.x); dxHi = Math.min(dxHi, ctx.W - pp.w - sp.x);
        dyLo = Math.max(dyLo, -sp.y); dyHi = Math.min(dyHi, ctx.H - pp.h - sp.y);
      });
      dx = Math.min(Math.max(dx, dxLo), dxHi); dy = Math.min(Math.max(dy, dyLo), dyHi);
      if (dx !== 0 || dy !== 0) dragMoved = true;
      drag.items.forEach((it) => {
        const sp = drag!.start.get(`${it.type}:${it.id}`); const pp = getPlace(it); if (!sp || !pp) return;
        pp.x = sp.x + dx; pp.y = sp.y + dy; repositionItem(it);
      });
    };
    const onUp = (e: PointerEvent) => {
      if (walkRef.current) { walkLook = false; try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* ignore */ } return; }
      const isClick = Math.hypot(e.clientX - downX, e.clientY - downY) < 5;
      if (toolRef.current === 'measure') {
        if (isClick) {
          const w = floorWorld(e);
          if (w) {
            const sp = snapFloor(w.wx, w.wy);
            const pt = { wx: sp.wx, wy: sp.wy };
            if (!measureARef.current) { measureARef.current = pt; setMeasureLive(fmtDist(0, unit)); }
            else {
              const a = measureARef.current;
              if (Math.hypot(pt.wx - a.wx, pt.wy - a.wy) > 1) {
                pushHistory();
                const id = newId('dim');
                annotationsRef.current.set(id, { id, type: 'dim', x: a.wx, y: a.wy, x2: pt.wx, y2: pt.wy });
                setDimCount([...annotationsRef.current.values()].filter((x) => x.type === 'dim').length);
                setDirty(true); rebuildDims();
              }
              measureARef.current = null; setMeasureLive(null);
              if (previewLineRef.current) previewLineRef.current.visible = false;
            }
          }
        }
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        return;
      }
      if (toolRef.current === 'wall') {
        if (isClick) {
          const w = floorWorld(e);
          if (w) {
            const sp = snapFloor(w.wx, w.wy);
            let pt = { wx: sp.wx, wy: sp.wy };
            const prev = wallChainRef.current;
            // hold Shift to constrain to 45° — but an explicit DXF snap wins (you
            // clicked that point on the plan, so honour it over the angle lock).
            if (prev && e.shiftKey && !sp.onDxf) {
              const len0 = Math.hypot(pt.wx - prev.wx, pt.wy - prev.wy);
              const ang = Math.round(Math.atan2(pt.wy - prev.wy, pt.wx - prev.wx) / (Math.PI / 4)) * (Math.PI / 4);
              pt = { wx: Math.round(prev.wx + Math.cos(ang) * len0), wy: Math.round(prev.wy + Math.sin(ang) * len0) };
            }
            if (prev && Math.hypot(pt.wx - prev.wx, pt.wy - prev.wy) > 1) {
              const thick = assetMeta('wall').h;
              const len = Math.hypot(pt.wx - prev.wx, pt.wy - prev.wy);
              const cx = (prev.wx + pt.wx) / 2, cy = (prev.wy + pt.wy) / 2;
              const angle = (Math.atan2(pt.wy - prev.wy, pt.wx - prev.wx) * 180) / Math.PI;
              pushHistory();
              const id = newId('as');
              assetsRef.current.set(id, { id, kind: 'wall', x: cx - len / 2, y: cy - thick / 2, w: len, h: thick, rotation: angle });
              setAssetIds((s) => new Set(s).add(id));
              setDirty(true); rebuildAssets();
            }
            wallChainRef.current = pt; setMeasureLive(fmtDist(0, unit));
          }
        }
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        return;
      }
      if (drag) {
        if (dragMoved && dragSnap) {
          undoStackRef.current.push(dragSnap);
          if (undoStackRef.current.length > 80) undoStackRef.current.shift();
          redoStackRef.current = [];
          setHist({ undo: undoStackRef.current.length, redo: 0 });
          setDirty(true);
        }
        drag = null; dragSnap = null; controls.enabled = true; setGuides(null, null); refreshSnap(); rebuildAll();
      }
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    // WASD movement while walking
    const onWalkKey = (down: boolean) => (e: KeyboardEvent) => {
      if (!walkRef.current) return;
      const k = walkKeysRef.current; const key = e.key.toLowerCase();
      if (key === 'w') k.f = down; else if (key === 's') k.b = down; else if (key === 'a') k.l = down; else if (key === 'd') k.r = down; else return;
      e.preventDefault();
    };
    const walkKd = onWalkKey(true), walkKu = onWalkKey(false);
    window.addEventListener('keydown', walkKd);
    window.addEventListener('keyup', walkKu);

    const onResize = () => {
      const w = mount.clientWidth || width; const hh = mount.clientHeight || height;
      renderer.setSize(w, hh); camera.aspect = w / hh; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize); ro.observe(mount);

    const animate = () => {
      if (disposed) return;
      if (walkRef.current) {
        const yaw = walkYawRef.current, pitch = walkPitchRef.current, k = walkKeysRef.current;
        const sp = Math.max(W, H) * s * 0.006;
        const fx = Math.sin(yaw), fz = -Math.cos(yaw); // forward (flat); rx,rz = right
        const rx = -fz, rz = fx;
        if (k.f) { camera.position.x += fx * sp; camera.position.z += fz * sp; }
        if (k.b) { camera.position.x -= fx * sp; camera.position.z -= fz * sp; }
        if (k.l) { camera.position.x -= rx * sp; camera.position.z -= rz * sp; }
        if (k.r) { camera.position.x += rx * sp; camera.position.z += rz * sp; }
        const lim = Math.max(W, H) * s * 0.62;
        camera.position.x = Math.max(-lim, Math.min(lim, camera.position.x));
        camera.position.z = Math.max(-lim, Math.min(lim, camera.position.z));
        camera.position.y = eyeY;
        camera.lookAt(camera.position.x + Math.sin(yaw) * Math.cos(pitch), camera.position.y + Math.sin(pitch), camera.position.z - Math.cos(yaw) * Math.cos(pitch));
      } else {
        controls.update();
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true; cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', walkKd);
      window.removeEventListener('keyup', walkKu);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      sceneRef.current = null; rendererRef.current = null; cameraRef.current = null;
      blocksRef.current = null; assetsGroupRef.current = null; controlsRef.current = null;
      dimsGroupRef.current = null; previewLineRef.current = null; snapMarkerRef.current = null;
      connsGroupRef.current = null; gridGroupRef.current = null; groundRef.current = null; gridHelperRef.current = null;
      dirLightRef.current = null; notesGroupRef.current = null; dxfGroupRef.current = null;
      heatGroupRef.current = null; heatLoadedRef.current = false;
      gapsGroupRef.current = null; gapsLoadedRef.current = false;
      guidesGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  // selection highlight refresh
  useEffect(() => { if (open && data) rebuildAll(); }, [selList, open, data, rebuildAll]);

  // cancels any half-drawn cota or wall chain (called when leaving a draw tool)
  const endDraw = useCallback(() => {
    measureARef.current = null; wallChainRef.current = null; setMeasureLive(null);
    if (previewLineRef.current) previewLineRef.current.visible = false;
    if (snapMarkerRef.current) snapMarkerRef.current.visible = false;
  }, []);
  const setToolMode = useCallback((next: 'select' | 'measure' | 'wall') => {
    setTool((prev) => {
      const t = prev === next && next !== 'select' ? 'select' : next;
      toolRef.current = t;
      if (t === 'select') endDraw();
      else { endDraw(); select([]); }
      return t;
    });
  }, [endDraw, select]);
  const toggleMeasure = useCallback(() => setToolMode('measure'), [setToolMode]);
  const toggleWall = useCallback(() => setToolMode('wall'), [setToolMode]);
  // Live quantity take-off from the current (possibly unsaved) editor state.
  const openTakeoff = useCallback(() => {
    const fp = data?.footprint; if (!fp) return;
    const placements = [...placementsRef.current.values()];
    const stationArea = placements.reduce((a, p) => a + p.w * p.h, 0);
    const assets = [...assetsRef.current.values()];
    const map = new Map<string, { count: number; area: number }>();
    let equipArea = 0, wallLen = 0;
    for (const a of assets) {
      const area = a.w * a.h;
      const c = map.get(a.kind) ?? { count: 0, area: 0 };
      c.count += 1; c.area += area; map.set(a.kind, c);
      if (a.kind !== 'zone' && a.kind !== 'agvpath') equipArea += area;
      if (a.kind === 'wall') wallLen += Math.max(a.w, a.h);
    }
    const byKind = [...map.entries()]
      .map(([kind, v]) => ({ kind, label: assetMeta(kind).label, count: v.count, area: v.area }))
      .sort((p, q) => q.count - p.count || p.label.localeCompare(q.label));
    const layerMap = new Map<CadLayerId, { count: number; area: number }>();
    const addLayer = (layerId: CadLayerId, area: number) => {
      const row = layerMap.get(layerId) ?? { count: 0, area: 0 };
      row.count += 1; row.area += area; layerMap.set(layerId, row);
    };
    placementsRef.current.forEach((p, id) => addLayer(layerAssignmentsRef.current[id] ?? 'layout', p.w * p.h));
    assets.forEach((asset) => addLayer(layerAssignmentsRef.current[asset.id] ?? 'equipment', asset.w * asset.h));
    const byLayer = cadLayers
      .map((layer) => ({ id: layer.id, label: layer.label, count: layerMap.get(layer.id)?.count ?? 0, area: layerMap.get(layer.id)?.area ?? 0 }))
      .filter((layer) => layer.count > 0);
    const footprintArea = fp.footprintW * fp.footprintH;
    const usedArea = stationArea + equipArea;
    // material-flow travel metrics from the line connectors (Fase 64)
    const centers: Record<string, FlowCenter> = {};
    placementsRef.current.forEach((p, id) => { centers[id] = { x: p.x + p.w / 2, y: p.y + p.h / 2 }; });
    const flow = flowMetrics(connectorsRef.current, centers);
    setTakeoff({
      unit: fp.unit || 'mm', footprintArea, totalStations: data!.stations.length,
      placedStations: placements.length, stationArea, equipmentCount: assets.length,
      equipArea, usedArea, util: footprintArea > 0 ? Math.min(100, (usedArea / footprintArea) * 100) : 0,
      wallLen, dimCount: [...annotationsRef.current.values()].filter((a) => a.type === 'dim').length,
      flowLen: flow.totalLen, flowMaxHop: flow.maxHop, flowCount: flow.count, byKind, byLayer,
    });
  }, [data, cadLayers]);


  const currentCollisionBoxes = useCallback(() => {
    const boxes = [
      ...[...placementsRef.current.entries()].map(([id, p]) => ({
        id,
        label: stationsByIdRef.current.get(id)?.station ?? id,
        x: p.x + p.w / 2,
        y: p.y + p.h / 2,
        width: p.w,
        height: p.h,
        layer: layerAssignments[id] ?? 'layout',
        tags: cadTags(objectTags[id]),
      })),
      ...[...assetsRef.current.values()].filter((asset) => {
        const arch = assetMeta(asset.kind).archetype;
        return arch !== 'zone' && arch !== 'path' && !assetSafetyZoneKind(asset, objectTags[asset.id]);
      }).map((asset) => ({
        id: asset.id,
        label: asset.label || assetMeta(asset.kind).label,
        x: asset.x + asset.w / 2,
        y: asset.y + asset.h / 2,
        width: asset.w,
        height: asset.h,
        layer: layerAssignments[asset.id] ?? 'equipment',
        tags: cadTags(objectTags[asset.id]),
      })),
    ];
    return boxes;
  }, [layerAssignments, objectTags]);
  const currentSafetyZones = useCallback((): CadSafetyZone[] => {
    const zones: CadSafetyZone[] = [];
    assetsRef.current.forEach((asset) => {
      const tags = (objectTags[asset.id] ?? '').toLowerCase();
      const kind = assetSafetyZoneKind(asset, tags);
      if (!kind) return;
      zones.push({
        id: asset.id,
        kind,
        label: asset.label || assetMeta(asset.kind).label,
        x: asset.x + asset.w / 2,
        y: asset.y + asset.h / 2,
        width: asset.w,
        height: asset.h,
        layer: 'Safety',
        requiredClearance: kind === 'safety_clearance' ? Math.max(asset.w, asset.h) / 2 : undefined,
      });
    });
    return zones;
  }, [objectTags]);
  const currentFlowNodes = useCallback((): CadFlowNode[] => {
    return [...placementsRef.current.entries()]
      .map(([id, p]) => ({
        id,
        label: stationsByIdRef.current.get(id)?.station ?? id,
        x: p.x + p.w / 2,
        y: p.y + p.h / 2,
        sequence: data?.stations.findIndex((s) => s.id === id) ?? 0,
      }))
      .sort((a, b) => a.sequence - b.sequence)
      .map((node) => ({ id: node.id, label: node.label, x: node.x, y: node.y }));
  }, [data]);
  const selectCollisionPair = (hit: CadCollisionHit) => {
    const pair: SelItem[] = [hit.aId, hit.bId].map((id) => placementsRef.current.has(id) ? { type: 'station' as const, id } : assetsRef.current.has(id) ? { type: 'asset' as const, id } : null).filter((item): item is SelItem => !!item);
    if (!pair.length) return;
    select(pair);
    rebuildAll();
    toast.success(`${hit.aLabel} ↔ ${hit.bLabel} seleccionado.`, 'Colisiones');
  };
  const selectClearanceIssue = (issue: CadClearanceIssue) => {
    const pair: SelItem[] = [issue.aId, issue.bId].map((id) => placementsRef.current.has(id) ? { type: 'station' as const, id } : assetsRef.current.has(id) ? { type: 'asset' as const, id } : null).filter((item): item is SelItem => !!item);
    if (!pair.length) return;
    select(pair);
    rebuildAll();
    toast.success('Par de holgura seleccionado.', 'Clearance');
  };
  const selectSafetyIssue = (issue: CadSafetyIssue) => {
    const items: SelItem[] = [issue.objectId, issue.zoneId].map((id) => placementsRef.current.has(id) ? { type: 'station' as const, id } : assetsRef.current.has(id) ? { type: 'asset' as const, id } : null).filter((item): item is SelItem => !!item);
    if (!items.length) return;
    select(items);
    rebuildAll();
    toast.success('Issue de seguridad seleccionado.', 'Safety');
  };
  const selectValidationIssue = (issue: CadValidationIssueRow) => {
    if (issue.category === 'flow') {
      if (cadValidationReport?.flow) {
        setFlowHealth(cadValidationReport.flow);
        setReport(null);
        toast.success('Flow Health abierto desde validacion.', 'CAD validation');
      }
      return;
    }
    const items: SelItem[] = issue.affectedObjectIds
      .map((id) =>
        placementsRef.current.has(id)
          ? { type: 'station' as const, id }
          : assetsRef.current.has(id)
            ? { type: 'asset' as const, id }
            : null,
      )
      .filter((item): item is SelItem => !!item);
    if (!items.length) return;
    select(items);
    rebuildAll();
    toast.success(issue.actionLabel, 'CAD validation');
  };
  const analyzeFlowHealth = () => {
    const nodes = currentFlowNodes();
    if (nodes.length < 2) { toast.error('Coloca al menos 2 estaciones para analizar flujo.', 'Flow Health'); return; }
    setFlowSequence(nodes);
    setFlowSegments(buildFlowSegments(nodes));
    setFlowHealth(scoreFlowLayout(nodes));
  };

  // Design-check / validation review of the current (possibly unsaved) state (Fase 63).
  const openChecks = useCallback(() => {
    const fp = data?.footprint; if (!fp) return;
    const stations: CheckBox[] = [];
    placementsRef.current.forEach((p, id) => {
      stations.push({ id, label: stationsByIdRef.current.get(id)?.station ?? id, x: p.x, y: p.y, w: p.w, h: p.h });
    });
    const assets: CheckBox[] = [];
    assetsRef.current.forEach((a) => {
      const arch = assetMeta(a.kind).archetype;
      if (arch === 'zone' || arch === 'path') return; // floor tints / lanes are meant to be large
      assets.push({ id: a.id, label: a.label || assetMeta(a.kind).label, x: a.x, y: a.y, w: a.w, h: a.h });
    });
    const unplaced = Math.max(0, (data?.stations.length ?? 0) - placementsRef.current.size);
    const collisionBoxes = currentCollisionBoxes();
    const flowNodes = currentFlowNodes();
    const cadReport = buildCadValidationReport({
      boxes: collisionBoxes,
      zones: currentSafetyZones(),
      flowNodes: flowNodes.length >= 2 ? flowNodes : undefined,
      requiredClearance: defaultCadClearance(fp.unit || 'mm'),
    });
    const highlightIds = new Set<string>();
    cadReport.collisions.forEach((hit) => { highlightIds.add(hit.aId); highlightIds.add(hit.bId); });
    cadReport.clearances.forEach((issue) => { highlightIds.add(issue.aId); highlightIds.add(issue.bId); });
    cadReport.safety.forEach((issue) => { highlightIds.add(issue.objectId); highlightIds.add(issue.zoneId); });
    validationHighlightRef.current = highlightIds;
    setValidationHighlightIds(highlightIds);
    setCadValidationReport(cadReport);
    setCollisionHits(cadReport.collisions);
    setClearanceIssues(cadReport.clearances);
    setSafetyIssues(cadReport.safety);
    rebuildAll();
    setReport(designChecks({ stations, assets, unplacedStations: unplaced, footprintW: fp.footprintW, footprintH: fp.footprintH, connectors: connectorsRef.current }));
  }, [data, currentCollisionBoxes, currentFlowNodes, currentSafetyZones, rebuildAll]);
  const clearValidationHighlights = () => {
    validationHighlightRef.current = new Set();
    setValidationHighlightIds(new Set());
    rebuildAll();
  };
  const selectFlowNode = (id: string) => {
    if (!placementsRef.current.has(id)) return;
    select([{ type: 'station', id }]);
    rebuildAll();
  };
  const selectFlowSequence = () => {
    const items: SelItem[] = flowSequence.filter((node) => placementsRef.current.has(node.id)).map((node) => ({ type: 'station', id: node.id }));
    if (!items.length) return;
    select(items);
    rebuildAll();
    toast.success(`${items.length} estación(es) del flujo seleccionadas.`, 'Flow Health');
  };
  const selectFlowSegment = (segment: CadFlowSegment) => {
    const items: SelItem[] = [segment.from.id, segment.to.id]
      .filter((id) => placementsRef.current.has(id))
      .map((id) => ({ type: 'station', id }));
    if (items.length < 2) return;
    select(items);
    rebuildAll();
    toast.success(`Tramo seleccionado: ${segment.from.label ?? segment.from.id} → ${segment.to.label ?? segment.to.id}.`, 'Flow Health');
  };

  const applyFlowReorderPreview = () => {
    const preview = flowHealth?.reorderPreview;
    if (!preview?.improves) return;
    const moves = preview.moves.filter((move) => placementsRef.current.has(move.id));
    if (moves.length < 2) { toast.error('No hay suficientes estaciones movibles para aplicar la recomendacion.', 'Flow Health'); return; }
    const locked = moves.filter((move) => isItemLayerLocked({ type: 'station', id: move.id }));
    if (locked.length) {
      select(locked.map((move) => ({ type: 'station', id: move.id })));
      rebuildAll();
      toast.error(`${locked.length} estacion(es) estan en capas bloqueadas; desbloquealas antes de reordenar.`, 'Flow Health');
      return;
    }
    const fp = data?.footprint;
    recordLocalSnapshot('Auto - antes de aplicar orden Flow Health', 'command');
    pushHistory();
    let moved = 0;
    moves.forEach((move) => {
      const placement = placementsRef.current.get(move.id);
      if (!placement) return;
      const maxX = Math.max(0, (fp?.footprintW ?? move.to.x + placement.w) - placement.w);
      const maxY = Math.max(0, (fp?.footprintH ?? move.to.y + placement.h) - placement.h);
      placement.x = Math.max(0, Math.min(maxX, snapWorld(move.to.x - placement.w / 2)));
      placement.y = Math.max(0, Math.min(maxY, snapWorld(move.to.y - placement.h / 2)));
      moved += 1;
    });
    const nextNodes = currentFlowNodes();
    setFlowSequence(nextNodes);
    setFlowSegments(buildFlowSegments(nextNodes));
    setFlowHealth(scoreFlowLayout(nextNodes));
    select(moves.map((move) => ({ type: 'station', id: move.id })));
    setDirty(true); refreshSnap(); rebuildAll();
    toast.success(`Orden Flow Health aplicado en eje ${preview.axis.toUpperCase()} (${moved} estaciones).`, 'Flow Health');
  };

  // Resize the plant footprint / grid from the CAD; the scene rebuilds at the
  // new scale and the change persists on save (objects keep their world coords).
  const applyFootprint = useCallback(() => {
    setData((d) => {
      if (!d) return d;
      const w = Math.max(1000, Math.round(fpDraft.w) || d.footprint.footprintW);
      const h = Math.max(1000, Math.round(fpDraft.h) || d.footprint.footprintH);
      const g = Math.max(50, Math.round(fpDraft.g) || d.footprint.gridSize);
      return { ...d, footprint: { ...d.footprint, footprintW: w, footprintH: h, gridSize: g } };
    });
    setDirty(true); setShowView(false);
  }, [fpDraft]);

  // Add a free-text note at the point the camera is looking at (round-trips 2D).
  const addNote = () => {
    const ctx = ctxRef.current; const ctrl = controlsRef.current; if (!ctx) return;
    const text = (typeof window !== 'undefined' ? window.prompt('Texto de la nota:') : '')?.trim();
    if (!text) return;
    const tx = ctrl ? ctrl.target.x / ctx.s + ctx.W / 2 : ctx.W / 2;
    const ty = ctrl ? ctrl.target.z / ctx.s + ctx.H / 2 : ctx.H / 2;
    pushHistory();
    const id = newId('nt');
    annotationsRef.current.set(id, {
      id, type: 'text', text: text.slice(0, 240),
      x: Math.max(0, Math.min(ctx.W, snapWorld(tx))),
      y: Math.max(0, Math.min(ctx.H, snapWorld(ty))),
    });
    setDirty(true); rebuildNotes();
  };

  const clearDims = useCallback(() => {
    const hasDim = [...annotationsRef.current.values()].some((a) => a.type === 'dim');
    if (!hasDim) return;
    pushHistory();
    annotationsRef.current.forEach((a, id) => { if (a.type === 'dim') annotationsRef.current.delete(id); });
    setDimCount(0); setDirty(true); rebuildDims();
  }, [rebuildDims, pushHistory]);

  // ---- actions ----
  const placeStation = (st: St) => {
    const ctx = ctxRef.current; if (!ctx || !data) return;
    pushHistory();
    const w = Math.round(data.footprint.footprintW * 0.06);
    const h = Math.round(data.footprint.footprintH * 0.08);
    const x = snapWorld(ctx.W / 2 - w / 2);
    const y = snapWorld(ctx.H / 2 - h / 2);
    placementsRef.current.set(st.id, { x, y, w, h, rotation: 0 });
    setPlacedIds((prev) => new Set(prev).add(st.id));
    select([{ type: 'station', id: st.id }]);
    setDirty(true); rebuildAll();
  };
  const addAsset = (kind: string, overrides?: { label?: string; w?: number; h?: number }) => {
    const ctx = ctxRef.current; if (!ctx) return null;
    pushHistory();
    const def = assetMeta(kind);
    const w = overrides?.w ?? def.w; const h = overrides?.h ?? def.h;
    const x = snapWorld(ctx.W / 2 - w / 2);
    const y = snapWorld(ctx.H / 2 - h / 2);
    const id = newId('as');
    assetsRef.current.set(id, { id, kind, x, y, w, h, rotation: 0, label: overrides?.label });
    setAssetIds((prev) => new Set(prev).add(id));
    setLayerAssignments((cur) => assignObjectsToLayer(cur, [id], activeCadLayer));
    select([{ type: 'asset', id }]);
    setDirty(true); rebuildAll();
    return id;
  };
  const addCadSymbol = (symbolId: string) => {
    const symbol = getCadSymbol(symbolId);
    if (!symbol) return;
    const kindBySymbol: Record<string, string> = {
      'smt-line': 'conveyor', inspection: 'machine', aoi: 'aoi', 'warehouse-rack': 'rack', packing: 'workbench', 'forklift-path': 'agvpath', 'operator-station': 'operator', 'esd-area': 'zone', 'safety-zone': 'zone', conveyor: 'conveyor', 'test-station': 'machine', 'rework-station': 'workbench',
    };
    const kind = kindBySymbol[symbol.id] ?? 'machine';
    const id = addAsset(kind, { label: symbol.label, w: symbol.defaultWidth, h: symbol.defaultHeight });
    if (id) {
      const layer = symbol.layer as CadLayerId;
      if (DEFAULT_CAD_LAYERS.some((item) => item.id === layer)) setLayerAssignments((cur) => assignObjectsToLayer(cur, [id], layer));
      toast.success(`${symbol.label} agregado al layout.`, 'Símbolos CAD');
    }
  };
  const applyCadTemplate = (templateId: CadLayoutTemplateId) => {
    const ctx = ctxRef.current; const fp = data?.footprint;
    if (!ctx || !fp) { toast.error('No hay footprint listo para aplicar la plantilla.', 'Plantillas CAD'); return; }
    const generated = instantiateCadLayoutTemplate(templateId, { width: fp.footprintW || ctx.W, height: fp.footprintH || ctx.H, gridSize: fp.gridSize || 100 });
    recordLocalSnapshot(`Auto · antes de plantilla ${generated.template.label}`, 'command');
    pushHistory();
    const created: SelItem[] = [];
    const idByRef = new Map<string, string>();
    const layerUpdates: Record<string, CadLayerId> = {};
    const tagUpdates: Record<string, string> = {};
    for (const item of generated.assets) {
      const id = newId('as');
      assetsRef.current.set(id, {
        id,
        kind: item.kind,
        label: item.label,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        rotation: item.rotation ?? 0,
      });
      idByRef.set(item.ref, id);
      created.push({ type: 'asset', id });
      layerUpdates[id] = item.layer;
      tagUpdates[id] = [generated.template.id, ...item.tags].join(', ');
    }
    let noteCount = 0;
    for (const item of generated.annotations) {
      const id = newId('nt');
      annotationsRef.current.set(id, {
        id,
        type: 'text',
        text: item.text,
        x: item.x,
        y: item.y,
        color: cadLayersRef.current.find((layer) => layer.id === item.layer)?.color,
      });
      noteCount++;
    }
    let connectorCount = 0;
    for (const connector of generated.connectors) {
      const from = idByRef.get(connector.fromRef);
      const to = idByRef.get(connector.toRef);
      if (!from || !to) continue;
      connectorsRef.current = [...connectorsRef.current, { from, to, kind: connector.kind }];
      connectorCount++;
    }
    const flowRefs = generated.connectors.flatMap((connector, idx) => idx === 0 ? [connector.fromRef, connector.toRef] : [connector.toRef]);
    const flowNodes = [...new Set(flowRefs)]
      .map((ref): CadFlowNode | null => {
        const id = idByRef.get(ref);
        if (!id) return null;
        const item = assetsRef.current.get(id);
        return item ? { id, label: item.label ?? item.id, x: item.x + item.w / 2, y: item.y + item.h / 2 } : null;
      })
      .filter((node): node is CadFlowNode => !!node);
    if (flowNodes.length >= 2) {
      setFlowSequence(flowNodes);
      setFlowSegments(buildFlowSegments(flowNodes));
      setFlowHealth(scoreFlowLayout(flowNodes));
    }
    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => ({ ...cur, ...layerUpdates }));
    setObjectTags((cur) => ({ ...cur, ...tagUpdates }));
    if (created.length) select(created.slice(0, 80));
    setDirty(true); rebuildAll(); refreshSnap();
    const scaled = generated.scale < 1 ? ` · escala ${Math.round(generated.scale * 100)}%` : '';
    toast.success(`${generated.template.label}: ${created.length} objetos, ${connectorCount} flujos, ${noteCount} notas${scaled}.`, 'Plantillas CAD');
    if (generated.warnings[0]) toast.error(generated.warnings[0], 'Plantillas CAD');
  };
  const setRackGeneratorField = <K extends keyof CadRackRowGeneratorInput>(field: K, value: CadRackRowGeneratorInput[K]) => {
    setRackGenerator((state) => ({ ...state, [field]: value }));
  };
  const applyRackRowGenerator = () => {
    const ctx = ctxRef.current; const fp = data?.footprint;
    if (!ctx || !fp) { toast.error('No hay footprint listo para generar racks.', 'Generador warehouse'); return; }
    const generated = generateWarehouseRackRows(rackGenerator, { width: fp.footprintW || ctx.W, height: fp.footprintH || ctx.H, gridSize: fp.gridSize || 100 });
    recordLocalSnapshot('Auto - antes de generar racks warehouse', 'command');
    pushHistory();
    const created: SelItem[] = [];
    const layerUpdates: Record<string, CadLayerId> = {};
    const tagUpdates: Record<string, string> = {};

    for (const item of generated.assets) {
      const id = newId('as');
      assetsRef.current.set(id, {
        id,
        kind: item.kind,
        label: item.label,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        rotation: item.rotation ?? 0,
      });
      created.push({ type: 'asset', id });
      layerUpdates[id] = item.layer;
      tagUpdates[id] = item.tags.join(', ');
    }
    for (const item of generated.annotations) {
      const id = newId('nt');
      annotationsRef.current.set(id, {
        id,
        type: 'text',
        text: item.text,
        x: item.x,
        y: item.y,
        color: cadLayersRef.current.find((layer) => layer.id === item.layer)?.color,
      });
    }

    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => ({ ...cur, ...layerUpdates }));
    setObjectTags((cur) => ({ ...cur, ...tagUpdates }));
    if (created.length) select(created.slice(0, 120));
    setDirty(true); rebuildAll(); refreshSnap();
    const scaled = generated.scale < 1 ? ` - escala ${Math.round(generated.scale * 100)}%` : '';
    toast.success(`${generated.summary.rackCount} racks, ${generated.summary.aisleCount} pasillos y ${generated.summary.labelCount} etiquetas${scaled}.`, 'Generador warehouse');
    if (generated.warnings[0]) toast.error(generated.warnings[0], 'Generador warehouse');
  };
  const fallbackLayerForItem = (item: SelItem): CadLayerId => item.type === 'station' ? 'layout' : 'equipment';
  const isItemLayerLocked = (item: SelItem) => isObjectLayerLocked(cadLayersRef.current, layerAssignmentsRef.current, item.id, fallbackLayerForItem(item));
  const editableItems = (items: SelItem[], action: string) => {
    const locked = items.filter(isItemLayerLocked);
    if (locked.length) toast.error(`${locked.length} objeto(s) omitido(s): su capa está bloqueada para ${action}.`, 'Capas');
    return items.filter((item) => !isItemLayerLocked(item));
  };

  const removeSelected = () => {
    const items = editableItems(selRef.current, 'eliminar'); if (!items.length) return;
    pushHistory();
    let delSt = false, delAs = false;
    items.forEach((it) => {
      if (it.type === 'station') { placementsRef.current.delete(it.id); delSt = true; }
      else { assetsRef.current.delete(it.id); delAs = true; }
    });
    if (delSt) setPlacedIds(new Set(placementsRef.current.keys()));
    if (delAs) setAssetIds(new Set(assetsRef.current.keys()));
    select([]); setDirty(true); rebuildAll();
  };
  const rotateSelected = (deg: number) => {
    const items = editableItems(selRef.current, 'rotar'); if (!items.length) return;
    pushHistory();
    items.forEach((it) => { const p = getPlaceRef(it); if (p) p.rotation = (((p.rotation + deg) % 360) + 360) % 360; });
    setDirty(true); refreshSnap(); rebuildAll();
  };
  const duplicateSelected = () => {
    const assets = editableItems(selRef.current.filter((s) => s.type === 'asset'), 'duplicar');
    if (!assets.length) return;
    const ctx = ctxRef.current!;
    const off = data?.footprint.gridSize || 200;
    pushHistory();
    const created: SelItem[] = [];
    assets.forEach((it) => {
      const src = assetsRef.current.get(it.id); if (!src) return;
      const id = newId('as');
      assetsRef.current.set(id, { ...src, id, x: Math.max(0, Math.min(ctx.W - src.w, src.x + off)), y: Math.max(0, Math.min(ctx.H - src.h, src.y + off)) });
      created.push({ type: 'asset', id });
    });
    setAssetIds(new Set(assetsRef.current.keys()));
    if (created.length) select(created);
    setDirty(true); rebuildAll();
  };
  // ---- array / mirror / offset of the selected equipment (Fase 55) ----
  // Stations can't be cloned (they're tied to routing), so these act on assets.
  const commitCreated = (created: SelItem[], msg: string) => {
    setAssetIds(new Set(assetsRef.current.keys()));
    if (created.length) { select(created); setDirty(true); rebuildAll(); toast.success(`${created.length} ${msg}`, '3D'); }
  };
  // ---- trace the DXF backdrop into editable walls (Fase 58) ----
  // Turns the read-only plan behind the layout into real `wall` assets placed
  // exactly over it — the leap from "drawing on top of a plan" to editing it.
  const importDxfWalls = () => {
    const dm = dxfModelRef.current; const meta = dxfMetaRef.current;
    if (!dm || !meta) { toast.error('Primero carga un plano DXF de fondo.', 'DXF'); return; }
    const { walls, truncated, segmentsConsidered } = dxfToWalls(dm, meta, { thickness: assetMeta('wall').h });
    if (!walls.length) {
      toast.error(segmentsConsidered ? 'El plano sólo tiene tramos muy cortos para muros.' : 'El plano no tiene líneas para convertir.', 'DXF');
      return;
    }
    pushHistory();
    const created: SelItem[] = [];
    for (const wl of walls) {
      const id = newId('as');
      assetsRef.current.set(id, { id, kind: 'wall', x: wl.x, y: wl.y, w: wl.w, h: wl.h, rotation: wl.rotation, label: 'Muro (plano)' });
      created.push({ type: 'asset', id });
    }
    commitCreated(created, truncated ? `muros del plano (recortado a ${walls.length})` : 'muros importados del plano');
  };
  const dxfPrimitiveBounds = (primitives: CadDxfPrimitive[]) => {
    const points = primitives.flatMap((primitive) => primitive.points);
    if (!points.length) return null;
    return {
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxY: Math.max(...points.map((point) => point.y)),
    };
  };
  const projectDxfPoint = (point: CadDxfPoint, bounds: NonNullable<ReturnType<typeof dxfPrimitiveBounds>>, modelRef: DxfModel, meta: DxfMeta) =>
    dxfPointToFootprint(point.x - bounds.minX, bounds.maxY - point.y, modelRef, meta);
  const createDxfWallAsset = (a: { x: number; y: number }, b: { x: number; y: number }, label: string) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 60) return null;
    const thick = assetMeta('wall').h;
    const id = newId('as');
    assetsRef.current.set(id, {
      id,
      kind: 'wall',
      label,
      x: (a.x + b.x) / 2 - len / 2,
      y: (a.y + b.y) / 2 - thick / 2,
      w: len,
      h: thick,
      rotation: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    });
    return id;
  };
  const convertDxfPrimitivesToEditable = () => {
    const preview = dxfImportPreview; const dm = dxfModelRef.current; const meta = dxfMetaRef.current;
    if (!preview || !dm || !meta) { toast.error('Carga un DXF antes de convertir entidades.', 'DXF'); return; }
    const bounds = dxfPrimitiveBounds(preview.primitives);
    if (!bounds) { toast.error('El DXF no tiene entidades soportadas para convertir.', 'DXF'); return; }
    recordLocalSnapshot('Auto · antes de convertir DXF', 'import');
    pushHistory();
    const created: SelItem[] = [];
    const layerUpdates: Record<string, CadLayerId> = {};
    const tagUpdates: Record<string, string> = {};
    let notes = 0;
    let truncated = false;
    const cap = 850;
    for (const primitive of preview.primitives) {
      if (created.length >= cap) { truncated = true; break; }
      const points = primitive.points.map((point) => projectDxfPoint(point, bounds, dm, meta));
      if (primitive.kind === 'text' && points[0] && primitive.text) {
        const id = newId('nt');
        annotationsRef.current.set(id, { id, type: 'text', x: snapWorld(points[0].x), y: snapWorld(points[0].y), text: primitive.text.slice(0, 80) });
        notes++;
        continue;
      }
      if (primitive.kind === 'rect' && points.length >= 4) {
        const minX = Math.min(...points.map((point) => point.x)); const maxX = Math.max(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y)); const maxY = Math.max(...points.map((point) => point.y));
        if (maxX - minX >= 80 && maxY - minY >= 80) {
          const id = newId('as');
          assetsRef.current.set(id, { id, kind: 'zone', label: `DXF zone · ${primitive.layer}`, x: snapWorld(minX), y: snapWorld(minY), w: snapWorld(maxX - minX), h: snapWorld(maxY - minY), rotation: 0 });
          created.push({ type: 'asset', id }); layerUpdates[id] = 'layout'; tagUpdates[id] = `dxf, dxf-layer:${primitive.layer}, editable-zone`;
        }
        continue;
      }
      for (let i = 0; i + 1 < points.length; i++) {
        if (created.length >= cap) { truncated = true; break; }
        const id = createDxfWallAsset(points[i], points[i + 1], `DXF line · ${primitive.layer}`);
        if (id) { created.push({ type: 'asset', id }); layerUpdates[id] = 'layout'; tagUpdates[id] = `dxf, dxf-layer:${primitive.layer}, editable-wall`; }
      }
    }
    if (!created.length && !notes) { toast.error('No se encontraron entidades DXF seguras para convertir.', 'DXF'); return; }
    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => ({ ...cur, ...layerUpdates }));
    setObjectTags((cur) => ({ ...cur, ...tagUpdates }));
    if (notes) { setDimCount([...annotationsRef.current.values()].filter((ann) => ann.type === 'dim').length); rebuildDims(); }
    if (created.length) select(created.slice(0, 80));
    setDirty(true); rebuildAll();
    toast.success(`${created.length} objeto(s) y ${notes} nota(s) convertidos${truncated ? ' (recortado por seguridad)' : ''}.`, 'DXF editable');
  };
  // ---- auto-dimension the layout into a measured drawing (Fase 59) ----
  // Acota lo seleccionado (o todo el layout): medidas generales + cotas
  // encadenadas centro a centro, fuera del recuadro — un plano acotado de un clic.
  const autoDimension = () => {
    const ctx = ctxRef.current; if (!ctx) return;
    const sel = selRef.current;
    const boxes: DimBox[] = [];
    const add = (b: { x: number; y: number; w: number; h: number } | undefined) => { if (b) boxes.push({ x: b.x, y: b.y, w: b.w, h: b.h }); };
    if (sel.length > 0) {
      sel.forEach((it) => add(it.type === 'station' ? placementsRef.current.get(it.id) : assetsRef.current.get(it.id)));
    } else {
      placementsRef.current.forEach((p) => add(p));
      assetsRef.current.forEach((a) => add(a));
    }
    const fp = data?.footprint;
    const dims = autoDimensions(
      { boxes, footprintW: fp?.footprintW ?? ctx.W, footprintH: fp?.footprintH ?? ctx.H, gridSize: fp?.gridSize },
      {},
    );
    if (!dims.length) { toast.error('No hay nada que acotar todavía.', '3D'); return; }
    pushHistory();
    for (const d of dims) {
      const id = newId('dim');
      annotationsRef.current.set(id, { id, type: 'dim', x: d.x, y: d.y, x2: d.x2, y2: d.y2 });
    }
    setDimCount([...annotationsRef.current.values()].filter((a) => a.type === 'dim').length);
    setDirty(true); rebuildDims();
    toast.success(`${dims.length} ${dims.length === 1 ? 'cota generada' : 'cotas generadas'}${sel.length ? ' (selección)' : ''}`, '3D');
  };
  // ---- auto-arrange the placed stations into a tidy line (Fase 61) ----
  // Reacomoda las estaciones colocadas, en el orden en que las entrega el modelo
  // (secuencia de línea), en filas equiespaciadas dentro de la huella.
  const arrangeLineLayout = () => {
    const fp = data?.footprint; if (!fp) return;
    const list: ArrangeStation[] = [];
    data!.stations.forEach((st, idx) => {
      const p = placementsRef.current.get(st.id);
      if (p) list.push({ id: st.id, sequence: idx, w: p.w, h: p.h }); // idx = orden de secuencia del API
    });
    if (list.length < 2) { toast.error('Coloca al menos 2 estaciones para acomodar la línea.', '3D'); return; }
    const pos = arrangeLine({ stations: list, footprintW: fp.footprintW, footprintH: fp.footprintH, gridSize: fp.gridSize }, {});
    recordLocalSnapshot('Auto · antes de acomodar línea', 'command');
    pushHistory();
    let moved = 0;
    for (const [id, p] of Object.entries(pos)) {
      const pl = placementsRef.current.get(id);
      if (pl) { pl.x = p.x; pl.y = p.y; moved++; }
    }
    setDirty(true); rebuildBlocks(); refreshSnap();
    toast.success(`Línea acomodada — ${moved} ${moved === 1 ? 'estación' : 'estaciones'}`, '3D');
  };
  // ---- auto-connect the placed stations in sequence (material flow) (Fase 62) ----
  // Crea un conector de cada estación a la siguiente en secuencia, fusionando con
  // los conectores existentes (sin duplicar) — el flujo de la línea de un clic.
  const connectLineLayout = () => {
    const list: ConnStation[] = [];
    data?.stations.forEach((st, idx) => { if (placementsRef.current.has(st.id)) list.push({ id: st.id, sequence: idx }); });
    if (list.length < 2) { toast.error('Coloca al menos 2 estaciones para conectar la línea.', '3D'); return; }
    const next = connectLine(list, connectorsRef.current, 'flow');
    if (next.length === connectorsRef.current.length) { toast.success('La línea ya estaba conectada.', '3D'); return; }
    const added = next.length - connectorsRef.current.length;
    pushHistory();
    connectorsRef.current = next;
    setDirty(true); rebuildBlocks();
    toast.success(`Línea conectada — ${added} ${added === 1 ? 'enlace nuevo' : 'enlaces nuevos'}`, '3D');
  };
  // ---- server-side optimisation: minimise material travel (ported from 2D, unify) ----
  const runOptimize = async () => {
    if (!model) return;
    setServerBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/line-engineering/layout/optimize?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`);
      if (!r.ok) { toast.error('No se pudo optimizar.', '3D'); return; }
      const d = (await r.json()) as { positions: { id: string; x: number; y: number; w: number; h: number; rotation: number }[]; improvedPct: number };
      if (!d.positions?.length) { toast.error('No hay estaciones para optimizar.', '3D'); return; }
      recordLocalSnapshot('Auto · antes de optimizar flujo', 'command');
      pushHistory();
      d.positions.forEach((p) => placementsRef.current.set(p.id, { x: p.x, y: p.y, w: p.w, h: p.h, rotation: p.rotation }));
      setPlacedIds(new Set(placementsRef.current.keys()));
      setDirty(true); rebuildBlocks(); refreshSnap();
      toast.success(d.improvedPct > 0 ? `Flujo optimizado: −${d.improvedPct}% de recorrido — revisa y guarda.` : 'El layout ya estaba óptimo para el flujo.', '3D');
    } catch { toast.error('No se pudo optimizar.', '3D'); }
    finally { setServerBusy(false); }
  };
  // ---- DXF backdrop upload / remove (ported from 2D, unify) ----
  const onDxfFile = async (file: File) => {
    if (!data) return;
    setDxfBusy(true);
    try {
      const text = await file.text();
      if (text.length > 12_000_000) { toast.error('El DXF supera 12 MB.', '3D'); return; }
      const importPreview = importDxfPrimitives(text);
      setDxfImportPreview(importPreview);
      setDxfWarnings(importPreview.warnings);
      if (importPreview.warnings.length) toast.error(`DXF cargado con ${importPreview.warnings.length} advertencia(s); revisa el panel DXF para detalles.`, 'DXF');
      const dxfModel = parseDxf(text);
      if (!dxfModel) { toast.error('No se reconocieron líneas en el DXF.', '3D'); return; }
      const res = await apiFetch(`${API_BASE}/line-engineering/layout/dxf`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, revision, name: file.name, data: text }),
      });
      if (!res.ok) { toast.error('No se pudo guardar el DXF.', '3D'); return; }
      const fp = data.footprint;
      const scale = Math.min(fp.footprintW / dxfModel.width, fp.footprintH / dxfModel.height) * 0.9 || 1;
      const meta: DxfMeta = {
        offsetX: Math.max(0, (fp.footprintW - dxfModel.width * scale) / 2),
        offsetY: Math.max(0, (fp.footprintH - dxfModel.height * scale) / 2),
        scale, rotation: 0, visible: true, opacity: 0.5,
      };
      dxfModelRef.current = dxfModel; dxfMetaRef.current = meta; setHasDxf(true);
      dxfSnapRef.current = dxfSnapPoints(dxfModel, meta);
      rebuildDxfRef.current(); setDirty(true);
      toast.success('Plano DXF cargado de fondo.', '3D');
    } catch { toast.error('No se pudo leer el archivo DXF.', '3D'); }
    finally { setDxfBusy(false); }
  };
  const removeDxf = async () => {
    setDxfBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/line-engineering/layout/dxf?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`, { method: 'DELETE' });
      if (!res.ok) { toast.error('No se pudo quitar el DXF.', '3D'); return; }
      dxfModelRef.current = null; dxfMetaRef.current = null; dxfSnapRef.current = []; setHasDxf(false); setDxfWarnings([]); setDxfImportPreview(null);
      rebuildDxfRef.current(); setDirty(true);
      toast.success('Plano DXF quitado.', '3D');
    } catch { toast.error('Error de red.', '3D'); }
    finally { setDxfBusy(false); }
  };
  // ---- versions / scenarios (ported from 2D, unify) ----
  const scopeQs = `model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`;
  const loadVersions = async () => {
    if (!model) return;
    try {
      const r = await apiFetch(`${API_BASE}/line-engineering/layout/snapshots?${scopeQs}`);
      if (r.ok) setVersions((await r.json()) as typeof versions);
    } catch { /* transient */ }
  };
  const openVersions = () => { setShowVersions(true); loadVersions(); };

  const saveLocalSnapshot = (reason: 'manual' | 'command' | 'import' | 'restore' = 'manual') => {
    const label = versName.trim() || `Local ${localSnapshots.snapshots.length + 1}`;
    recordLocalSnapshot(label, reason);
    setVersName('');
    toast.success('Snapshot local guardado en esta sesión.', 'Snapshots CAD');
  };
  const restoreLocalSnapshot = (id: string) => {
    const restored = restoreCadSnapshot(localSnapshots, id);
    if (!restored.layout) { toast.error('No se encontró el snapshot local.', 'Snapshots CAD'); return; }
    pushHistory();
    restore(restored.layout);
    setLocalSnapshots(restored.history);
    setShowVersions(false);
    toast.success('Snapshot local restaurado.', 'Snapshots CAD');
  };
  const compareLocalSnapshot = (id: string) => {
    const base = localSnapshots.snapshots.find((item) => item.id === id);
    if (!base) { toast.error('No se encontró el snapshot local.', 'Snapshots CAD'); return; }
    const current = createCadSnapshot(snapshot(), 'Actual', 'manual', 'current');
    const diff = diffCadSnapshots(base, current);
    setSnapshotDiff(diff);
    toast.success(diff.changed ? 'El layout cambió desde ese snapshot.' : 'El layout coincide con ese snapshot.', 'Snapshots CAD');
  };
  const deleteLocalSnapshot = (id: string) => {
    setLocalSnapshots((history) => ({
      activeId: history.activeId === id ? undefined : history.activeId,
      snapshots: history.snapshots.filter((item) => item.id !== id),
    }));
  };
  const saveVersion = async () => {
    if (!model) return;
    setVersBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/line-engineering/layout/snapshots`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, revision, name: versName.trim() || undefined }),
      });
      if (!r.ok) { toast.error('No se pudo guardar la versión.', '3D'); return; }
      setVersName(''); toast.success('Versión guardada.', '3D'); loadVersions();
    } catch { toast.error('Error de red.', '3D'); } finally { setVersBusy(false); }
  };
  const restoreVersion = async (id: string) => {
    if (!model) return;
    setVersBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/line-engineering/layout/snapshots/${id}/restore?${scopeQs}`, { method: 'POST' });
      if (!r.ok) { toast.error('No se pudo restaurar la versión.', '3D'); return; }
      toast.success('Versión restaurada.', '3D'); setShowVersions(false);
      setReloadTick((t) => t + 1); // re-run the load effect
    } catch { toast.error('Error de red.', '3D'); } finally { setVersBusy(false); }
  };
  const deleteVersion = async (id: string) => {
    if (!model) return;
    try {
      const r = await apiFetch(`${API_BASE}/line-engineering/layout/snapshots/${id}?${scopeQs}`, { method: 'DELETE' });
      if (r.ok) setVersions((await r.json()) as typeof versions);
    } catch { /* transient */ }
  };
  // ---- clone from another model's layout as a template (ported from 2D, unify) ----
  const cloneFrom = async () => {
    if (!cloneSrc || !model) return;
    const [fromModel, fromRevision] = cloneSrc.split('|');
    setCloneBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/line-engineering/layout/clone`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromModel, fromRevision, toModel: model, toRevision: revision }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(d?.message || 'No se pudo clonar.', '3D'); return; }
      toast.success('Layout clonado desde la plantilla.', '3D'); setShowClone(false);
      setReloadTick((t) => t + 1);
    } catch { toast.error('Error de red.', '3D'); } finally { setCloneBusy(false); }
  };
  // ---- approval / sign-off (ported from 2D, unify) ----
  const setApprovalStatus = async (status: ApprovalStatus) => {
    if (!model) return;
    setApprovalBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/line-engineering/layout/approval`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, revision, status }),
      });
      if (!r.ok) { toast.error('No se pudo cambiar el estado.', '3D'); return; }
      const d = (await r.json()) as { approval?: LayoutApproval };
      setApproval(d.approval ?? { status, by: null, at: null, note: null });
      toast.success(`Layout: ${APPROVAL_META[status].label}.`, '3D');
    } catch { toast.error('Error de red.', '3D'); } finally { setApprovalBusy(false); }
  };
  // ---- export the station schedule as CSV (ported from 2D, unify) ----
  const exportCsvSchedule = () => {
    if (!data) return;
    const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const unit = data.footprint.unit || 'mm';
    const header = ['estacion', 'linea', 'colocada', `x_${unit}`, `y_${unit}`, `w_${unit}`, `h_${unit}`, 'rotacion_deg', 'ctq'];
    const rows = data.stations.map((s) => {
      const p = placementsRef.current.get(s.id);
      return [s.station, s.line, p ? 'si' : 'no', p?.x ?? '', p?.y ?? '', p?.w ?? '', p?.h ?? '', p?.rotation ?? '', s.ctq ? 'si' : 'no'].map(esc).join(',');
    });
    const csv = [header.join(','), ...rows].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `estaciones-${model}-${revision}.csv`.replace(/[^\w.\-]+/g, '_');
    a.click(); URL.revokeObjectURL(a.href);
    toast.success('Estaciones exportadas (CSV).', '3D');
  };
  const arrayAssets = (cols: number, rows: number, gap: number) => {
    const sel = selRef.current.filter((s) => s.type === 'asset');
    const c = Math.max(1, Math.min(50, Math.round(cols))), r = Math.max(1, Math.min(50, Math.round(rows)));
    if (!sel.length || c * r <= 1) return;
    const ctx = ctxRef.current!; const g = Math.max(0, Math.round(gap) || 0);
    pushHistory();
    const created: SelItem[] = [];
    sel.forEach((it) => {
      const src = assetsRef.current.get(it.id); if (!src) return;
      for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) {
        if (i === 0 && j === 0) continue; // keep the original in place
        const nx = src.x + i * (src.w + g), ny = src.y + j * (src.h + g);
        if (nx + src.w > ctx.W || ny + src.h > ctx.H) continue; // skip copies off the plan
        const id = newId('as');
        assetsRef.current.set(id, { ...src, id, x: nx, y: ny });
        created.push({ type: 'asset', id });
      }
    });
    commitCreated(created, 'copia(s) en arreglo.');
  };
  const mirrorAssets = (axis: 'h' | 'v') => {
    const sel = editableItems(selRef.current.filter((s) => s.type === 'asset'), 'crear espejos');
    if (!sel.length) return;
    const ctx = ctxRef.current!;
    pushHistory();
    const created: SelItem[] = [];
    sel.forEach((it) => {
      const src = assetsRef.current.get(it.id); if (!src) return;
      const id = newId('as');
      const nx = axis === 'h' ? ctx.W - src.x - src.w : src.x;
      const ny = axis === 'v' ? ctx.H - src.y - src.h : src.y;
      const rot = axis === 'h' ? (180 - src.rotation + 360) % 360 : (360 - src.rotation) % 360;
      assetsRef.current.set(id, { ...src, id, x: Math.max(0, Math.min(ctx.W - src.w, nx)), y: Math.max(0, Math.min(ctx.H - src.h, ny)), rotation: rot });
      created.push({ type: 'asset', id });
    });
    commitCreated(created, 'copia(s) en espejo.');
  };
  const offsetAssets = (dx: number, dy: number) => {
    const sel = editableItems(selRef.current.filter((s) => s.type === 'asset'), 'crear copias desfasadas');
    const ox = Math.round(dx) || 0, oy = Math.round(dy) || 0;
    if (!sel.length || (ox === 0 && oy === 0)) return;
    const ctx = ctxRef.current!;
    pushHistory();
    const created: SelItem[] = [];
    sel.forEach((it) => {
      const src = assetsRef.current.get(it.id); if (!src) return;
      const id = newId('as');
      assetsRef.current.set(id, { ...src, id, x: Math.max(0, Math.min(ctx.W - src.w, src.x + ox)), y: Math.max(0, Math.min(ctx.H - src.h, src.y + oy)) });
      created.push({ type: 'asset', id });
    });
    commitCreated(created, 'copia(s) desfasada(s).');
  };
  const nudgeSelected = (dx: number, dy: number) => {
    const items = editableItems(selRef.current, 'mover'); const ctx = ctxRef.current; if (!items.length || !ctx) return;
    pushHistory();
    // clamp the group delta so everything stays in bounds
    let dxLo = -Infinity, dxHi = Infinity, dyLo = -Infinity, dyHi = Infinity;
    items.forEach((it) => { const p = getPlaceRef(it); if (!p) return; dxLo = Math.max(dxLo, -p.x); dxHi = Math.min(dxHi, ctx.W - p.w - p.x); dyLo = Math.max(dyLo, -p.y); dyHi = Math.min(dyHi, ctx.H - p.h - p.y); });
    const ndx = Math.min(Math.max(dx, dxLo), dxHi), ndy = Math.min(Math.max(dy, dyLo), dyHi);
    items.forEach((it) => { const p = getPlaceRef(it); if (p) { p.x += ndx; p.y += ndy; } });
    setDirty(true); refreshSnap(); rebuildAll();
  };
  const selectedMeasureBox = (item: SelItem) => {
    const p = getPlaceRef(item);
    if (!p) return null;
    return {
      id: item.id,
      label: item.type === 'station' ? stationsByIdRef.current.get(item.id)?.station ?? item.id : assetsRef.current.get(item.id)?.label || assetMeta(assetsRef.current.get(item.id)?.kind || 'machine').label,
      x: p.x, y: p.y, w: p.w, h: p.h,
    };
  };
  const createSelectionMeasurement = (mode: CadMeasureMode = 'direct') => {
    const dimensionKind = mode.startsWith('edge-') ? 'borde-a-borde' : 'centro-a-centro';
    if (selRef.current.length !== 2) { toast.error(`Selecciona exactamente 2 objetos para crear una cota ${dimensionKind}.`, 'Medición'); return; }
    const [aItem, bItem] = selRef.current;
    const a = selectedMeasureBox(aItem); const b = selectedMeasureBox(bItem);
    if (!a || !b) { toast.error('No pude medir la selección actual.', 'Medición'); return; }
    const unit = data?.footprint.unit === 'm' ? 'm' : 'mm';
    const measurement = measureBoxes(a, b, mode, unit);
    pushHistory();
    const id = newId('dim');
    annotationsRef.current.set(id, { id, type: 'dim', x: measurement.from.x, y: measurement.from.y, x2: measurement.to.x, y2: measurement.to.y, text: measurementLabel(a, b, measurement) });
    setDimCount([...annotationsRef.current.values()].filter((ann) => ann.type === 'dim').length);
    setDirty(true); rebuildDims(); refreshMeasurementRows();
    toast.success(`Cota creada: ${measurement.label}`, 'Medición');
  };
  const updateMeasurementText = (id: string, text: string) => {
    const ann = annotationsRef.current.get(id);
    if (!ann || ann.type !== 'dim') return;
    ann.text = text;
    setDirty(true); rebuildDims(); refreshMeasurementRows();
  };
  const deleteMeasurement = (id: string) => {
    const ann = annotationsRef.current.get(id);
    if (!ann || ann.type !== 'dim') return;
    pushHistory();
    annotationsRef.current.delete(id);
    setDimCount([...annotationsRef.current.values()].filter((item) => item.type === 'dim').length);
    setDirty(true); rebuildDims(); refreshMeasurementRows();
    toast.success('Cota eliminada.', 'Medición');
  };
  const focusMeasurement = (id: string) => {
    const ann = annotationsRef.current.get(id); const ctx = ctxRef.current; const ctrl = controlsRef.current;
    if (!ann || ann.type !== 'dim' || ann.x2 == null || ann.y2 == null || !ctx || !ctrl) return;
    const mx = (ann.x + ann.x2) / 2; const my = (ann.y + ann.y2) / 2;
    ctrl.target.set((mx - ctx.W / 2) * ctx.s, 0, (my - ctx.H / 2) * ctx.s);
    ctrl.update();
    select([]); rebuildAll();
    toast.success('Vista centrada en la cota.', 'Medición');
  };

  const createAisleBetweenSelection = () => {
    if (selRef.current.length !== 2) { toast.error('Selecciona 2 objetos para crear un pasillo entre ellos.', 'Pasillos'); return; }
    const [aItem, bItem] = selRef.current;
    const a = selectedMeasureBox(aItem); const b = selectedMeasureBox(bItem);
    const ctx = ctxRef.current;
    if (!a || !b || !ctx) { toast.error('No pude calcular el pasillo para esta selección.', 'Pasillos'); return; }
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const len = Math.hypot(bc.x - ac.x, bc.y - ac.y);
    if (len < 1) { toast.error('Los objetos están demasiado cerca para crear un pasillo.', 'Pasillos'); return; }
    const width = Math.max(100, Math.round(aisleWidth) || 1200);
    const angle = (Math.atan2(bc.y - ac.y, bc.x - ac.x) * 180) / Math.PI;
    pushHistory();
    const id = newId('as');
    assetsRef.current.set(id, { id, kind: 'agvpath', label: `Pasillo ${Math.round(width).toLocaleString('es-MX')}`, x: Math.max(0, Math.min(ctx.W - len, (ac.x + bc.x) / 2 - len / 2)), y: Math.max(0, Math.min(ctx.H - width, (ac.y + bc.y) / 2 - width / 2)), w: len, h: width, rotation: angle });
    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => assignObjectsToLayer(cur, [id], 'aisles'));
    setObjectTags((cur) => ({ ...cur, [id]: 'aisle, clearance, material-flow' }));
    select([{ type: 'asset', id }]);
    setDirty(true); rebuildAll();
    toast.success('Pasillo editable creado entre la selección.', 'Pasillos');
  };
  const createSafetyZoneAsset = (kind: 'no-go' | 'restricted' | 'esd') => {
    const ctx = ctxRef.current; const ctrl = controlsRef.current; if (!ctx) return;
    const w = kind === 'esd' ? 4200 : kind === 'no-go' ? 2400 : 3000; const h = kind === 'esd' ? 2800 : kind === 'no-go' ? 1800 : 2200;
    const cx = ctrl ? ctrl.target.x / ctx.s + ctx.W / 2 : ctx.W / 2;
    const cy = ctrl ? ctrl.target.z / ctx.s + ctx.H / 2 : ctx.H / 2;
    pushHistory();
    const id = newId('as');
    const label = kind === 'esd' ? 'ESD controlled zone' : kind === 'no-go' ? 'No-go zone' : 'Restricted zone';
    assetsRef.current.set(id, { id, kind: 'zone', label, x: Math.max(0, Math.min(ctx.W - w, snapWorld(cx - w / 2))), y: Math.max(0, Math.min(ctx.H - h, snapWorld(cy - h / 2))), w, h, rotation: 0 });
    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => assignObjectsToLayer(cur, [id], 'safety'));
    setObjectTags((cur) => ({ ...cur, [id]: kind === 'esd' ? 'esd, safety, controlled-area' : `${kind}, safety, controlled-area` }));
    select([{ type: 'asset', id }]);
    setDirty(true); rebuildAll();
    toast.success(`${label} creada.`, 'Safety');
  };
  const createSafetyPathAsset = (kind: 'forklift' | 'emergency') => {
    const ctx = ctxRef.current; const ctrl = controlsRef.current; if (!ctx) return;
    const w = kind === 'forklift' ? 6200 : 5200; const h = kind === 'forklift' ? 1800 : 1100;
    const cx = ctrl ? ctrl.target.x / ctx.s + ctx.W / 2 : ctx.W / 2;
    const cy = ctrl ? ctrl.target.z / ctx.s + ctx.H / 2 : ctx.H / 2;
    pushHistory();
    const id = newId('as');
    const label = kind === 'forklift' ? 'Forklift safety path' : 'Emergency exit path';
    assetsRef.current.set(id, { id, kind: 'agvpath', label, x: Math.max(0, Math.min(ctx.W - w, snapWorld(cx - w / 2))), y: Math.max(0, Math.min(ctx.H - h, snapWorld(cy - h / 2))), w, h, rotation: 0 });
    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => assignObjectsToLayer(cur, [id], 'safety'));
    setObjectTags((cur) => ({ ...cur, [id]: kind === 'forklift' ? 'forklift, safety, aisle, keep-clear' : 'emergency, exit, safety, keep-clear' }));
    select([{ type: 'asset', id }]);
    setDirty(true); rebuildAll();
    toast.success(`${label} creado.`, 'Safety');
  };

  const setField = (field: 'x' | 'y' | 'w' | 'h' | 'rotation', value: number) => {
    const cur = selList[0]; if (!cur) return;
    if (isItemLayerLocked(cur)) { toast.error('La capa del objeto está bloqueada. Desbloquéala para editar propiedades.', 'Capas'); return; }
    const p = cur.type === 'station' ? placementsRef.current.get(cur.id) : assetsRef.current.get(cur.id);
    const ctx = ctxRef.current; if (!p || !ctx) return;
    const v = Number.isFinite(value) ? value : 0;
    if (field === 'rotation') p.rotation = ((v % 360) + 360) % 360;
    else if (field === 'w') p.w = Math.max(50, Math.min(ctx.W, Math.round(v)));
    else if (field === 'h') p.h = Math.max(50, Math.min(ctx.H, Math.round(v)));
    else if (field === 'x') p.x = Math.max(0, Math.min(ctx.W - p.w, Math.round(v)));
    else if (field === 'y') p.y = Math.max(0, Math.min(ctx.H - p.h, Math.round(v)));
    setDirty(true); refreshSnap(); rebuildAll();
  };
  const updateSelectedAssetLabel = (value: string) => {
    const cur = selList[0];
    if (!cur || cur.type !== 'asset') return;
    if (isItemLayerLocked(cur)) { toast.error('La capa del objeto está bloqueada. Desbloquéala para renombrar.', 'Capas'); return; }
    const asset = assetsRef.current.get(cur.id); if (!asset) return;
    asset.label = value.trim() || undefined;
    setDirty(true); refreshSnap(); rebuildAll();
  };
  const updateSelectedTags = (value: string) => {
    const cur = selList[0]; if (!cur) return;
    if (isItemLayerLocked(cur)) { toast.error('La capa del objeto está bloqueada. Desbloquéala para editar tags.', 'Capas'); return; }
    setObjectTags((state) => {
      const next = { ...state, [cur.id]: value };
      objectTagsRef.current = next;
      return next;
    });
    refreshSnap();
    setDirty(true);
  };
  const updateSelectedNotes = (value: string) => {
    const cur = selList[0]; if (!cur) return;
    if (isItemLayerLocked(cur)) { toast.error('La capa del objeto esta bloqueada. Desbloqueala para editar notas.', 'Capas'); return; }
    setObjectNotes((state) => {
      const next = { ...state, [cur.id]: value };
      objectNotesRef.current = next;
      return next;
    });
    refreshSnap();
    setDirty(true);
  };
  const assignSelectedToActiveLayer = () => {
    const cur = selList[0]; if (!cur) return;
    if (isItemLayerLocked(cur)) { toast.error('La capa actual del objeto está bloqueada. Desbloquéala antes de recategorizar.', 'Capas'); return; }
    setLayerAssignments((state) => assignObjectsToLayer(state, [cur.id], activeCadLayer));
    toast.success(`Objeto asignado a ${cadLayers.find((layer) => layer.id === activeCadLayer)?.label ?? activeCadLayer}.`, 'Capas');
  };
  const resetSelectedRotation = () => {
    const cur = selList[0]; if (!cur) return;
    if (isItemLayerLocked(cur)) { toast.error('La capa del objeto está bloqueada. Desbloquéala para rotar.', 'Capas'); return; }
    const p = getPlaceRef(cur); if (!p) return;
    pushHistory(); p.rotation = 0; setDirty(true); refreshSnap(); rebuildAll();
  };
  const centerSelectedInFootprint = () => {
    const cur = selList[0]; const ctx = ctxRef.current; if (!cur || !ctx) return;
    if (isItemLayerLocked(cur)) { toast.error('La capa del objeto está bloqueada. Desbloquéala para mover.', 'Capas'); return; }
    const p = getPlaceRef(cur); if (!p) return;
    pushHistory();
    p.x = Math.max(0, Math.min(ctx.W - p.w, Math.round(ctx.W / 2 - p.w / 2)));
    p.y = Math.max(0, Math.min(ctx.H - p.h, Math.round(ctx.H / 2 - p.h / 2)));
    setDirty(true); refreshSnap(); rebuildAll();
  };
  // Align the selected objects to the selection's bounding box (≥2 objects).
  const alignSelected = (mode: 'left' | 'right' | 'top' | 'bottom' | 'cx' | 'cy') => {
    const places = editableItems(selRef.current, 'alinear').map(getPlaceRef).filter(Boolean) as Placement[];
    if (places.length < 2) return;
    pushHistory();
    const minX = Math.min(...places.map((p) => p.x)), maxX = Math.max(...places.map((p) => p.x + p.w));
    const minY = Math.min(...places.map((p) => p.y)), maxY = Math.max(...places.map((p) => p.y + p.h));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    places.forEach((p) => {
      if (mode === 'left') p.x = minX;
      else if (mode === 'right') p.x = maxX - p.w;
      else if (mode === 'cx') p.x = Math.round(cx - p.w / 2);
      else if (mode === 'top') p.y = minY;
      else if (mode === 'bottom') p.y = maxY - p.h;
      else if (mode === 'cy') p.y = Math.round(cy - p.h / 2);
    });
    setDirty(true); refreshSnap(); rebuildAll();
  };
  // Distribute the selection with EQUAL GAPS along an axis (Fase 56): keeps the
  // first and last fixed and evens the edge-to-edge spacing between the rest —
  // the standard "distribute" that align (above) doesn't do. Needs >= 3 objects.
  const distributeSelected = (axis: 'h' | 'v') => {
    const places = editableItems(selRef.current, 'distribuir').map(getPlaceRef).filter(Boolean) as Placement[];
    if (places.length < 3) return;
    const ctx = ctxRef.current!;
    pushHistory();
    const sorted = [...places].sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y));
    const n = sorted.length;
    const size = (p: Placement) => (axis === 'h' ? p.w : p.h);
    const start = axis === 'h' ? sorted[0].x : sorted[0].y;
    const end = axis === 'h' ? sorted[n - 1].x + sorted[n - 1].w : sorted[n - 1].y + sorted[n - 1].h;
    const gap = (end - start - sorted.reduce((s, p) => s + size(p), 0)) / (n - 1);
    let cursor = start;
    sorted.forEach((p) => {
      const pos = Math.round(cursor);
      if (axis === 'h') p.x = Math.max(0, Math.min(ctx.W - p.w, pos));
      else p.y = Math.max(0, Math.min(ctx.H - p.h, pos));
      cursor += size(p) + gap;
    });
    setDirty(true); refreshSnap(); rebuildAll();
  };
  const buildCommandContext = () => ({
    unit: data?.footprint.unit || 'mm',
    footprintW: data?.footprint.footprintW || ctxRef.current?.W || 0,
    footprintH: data?.footprint.footprintH || ctxRef.current?.H || 0,
    selectedIds: selRef.current.map((it) => it.id),
    connectors: connectorsRef.current.map((c) => ({ ...c })),
    objects: [
      ...[...placementsRef.current.entries()].map(([id, p]) => {
        const st = stationsByIdRef.current.get(id);
        return { id, type: 'station' as const, label: st?.station ?? id, x: p.x, y: p.y, w: p.w, h: p.h, rotation: p.rotation, sequence: data?.stations.findIndex((s) => s.id === id) ?? 0 };
      }),
      ...[...assetsRef.current.values()].map((a) => ({ id: a.id, type: 'asset' as const, label: a.label || assetMeta(a.kind).label, x: a.x, y: a.y, w: a.w, h: a.h, rotation: a.rotation })),
    ],
  });
  const previewCommandText = (rawText: string) => {
    const raw = rawText.trim();
    if (!raw) return;
    const parsed = parseCadCommand(raw);
    if (!parsed.ok || !parsed.input) {
      toast.error(parsed.clarification || parsed.error || 'No reconocí el comando CAD.', 'Comando CAD');
      setCommandPreview(null);
      return false;
    }
    const preview = previewCadCommand(parsed.input, buildCommandContext());
    setCommandPreview({ input: parsed.input, preview });
    setCommandLog((items) => [createCadHistoryItem(parsed.input!, 'previewed', preview.summary, preview), ...items].slice(0, 12));
    return true;
  };
  const interpretCommand = () => {
    previewCommandText(commandText);
  };
  const applyCommandSuggestion = (suggestion: CadCommandSuggestion) => {
    setCommandText(suggestion.example);
    if (!suggestion.ready) {
      setCommandPreview(null);
      toast.error(suggestion.reason, 'Comando CAD');
      return;
    }
    previewCommandText(suggestion.example);
  };
  const applyCommandOperation = (op: CadOperation) => {
    if (op.type === 'move') {
      const type = placementsRef.current.has(op.objectId) ? 'station' : assetsRef.current.has(op.objectId) ? 'asset' : null;
      if (type && isItemLayerLocked({ type, id: op.objectId })) {
        toast.error(`Movimiento omitido: ${op.objectId} está en una capa bloqueada.`, 'Capas');
        return false;
      }
      const p = placementsRef.current.get(op.objectId);
      if (p) { p.x = op.after.x; p.y = op.after.y; p.w = op.after.w; p.h = op.after.h; p.rotation = op.after.rotation ?? p.rotation; return true; }
      const a = assetsRef.current.get(op.objectId);
      if (a) { a.x = op.after.x; a.y = op.after.y; a.w = op.after.w; a.h = op.after.h; a.rotation = op.after.rotation ?? a.rotation; return true; }
    } else if (op.type === 'connect') {
      if (!connectorsRef.current.some((c) => c.from === op.from && c.to === op.to && (c.kind ?? 'flow') === op.kind)) connectorsRef.current = [...connectorsRef.current, { from: op.from, to: op.to, kind: op.kind }];
      return true;
    } else if (op.type === 'focus') {
      const items: SelItem[] = op.objectIds.map((id) => placementsRef.current.has(id) ? { type: 'station' as const, id } : assetsRef.current.has(id) ? { type: 'asset' as const, id } : null).filter((it): it is SelItem => !!it);
      if (items.length) select(items);
    }
    return false;
  };
  const applyCommand = () => {
    if (!commandPreview) return;
    const result = executeCadCommand(commandPreview.input, buildCommandContext());
    if (!result.applied) {
      toast.error(result.issues.find((i) => i.level === 'error')?.message || 'El comando no es válido.', 'Comando CAD');
      setCommandLog((items) => [createCadHistoryItem(commandPreview.input, 'failed', result.historyLabel, commandPreview.preview, result), ...items].slice(0, 12));
      return;
    }
    const mutates = result.operations.some((op) => op.type === 'move' || op.type === 'connect');
    if (mutates) { recordLocalSnapshot(`Auto · ${result.historyLabel}`, 'command'); pushHistory(); }
    const changed = result.operations.some(applyCommandOperation);
    setCommandLog((items) => [createCadHistoryItem(commandPreview.input, 'applied', result.historyLabel, commandPreview.preview, result), ...items].slice(0, 12));
    if (changed) { setDirty(true); refreshSnap(); rebuildAll(); }
    setCommandPreview(null); setCommandText('');
    toast.success(result.historyLabel, 'Comando CAD');
  };
  const undoLastCommand = () => {
    const item = commandLog.find((c) => c.status === 'applied');
    if (!item || hist.undo === 0) return;
    undo();
    setCommandLog((items) => items.map((c) => c.id === item.id ? { ...c, status: 'undone' } : c));
    toast.success(`Deshecho: ${item.label}`, 'Comando CAD');
  };
  const redoLastCommand = () => {
    const item = commandLog.find((c) => c.status === 'undone');
    if (!item || hist.redo === 0) return;
    redo();
    setCommandLog((items) => items.map((c) => c.id === item.id ? { ...c, status: 'applied' } : c));
    toast.success(`Rehecho: ${item.label}`, 'Comando CAD');
  };
  const toggleCadLayerVisibility = (id: CadLayerId) => {
    setCadLayers((cur) => toggleCadLayerVisible(cur, id));
  };
  const updateCadLayerLabel = (id: CadLayerId, label: string) => setCadLayers((cur) => cur.map((layer) => layer.id === id ? { ...layer, label } : layer));
  const updateCadLayerColor = (id: CadLayerId, color: string) => setCadLayers((cur) => cur.map((layer) => layer.id === id ? { ...layer, color } : layer));
  const resetCadLayerPresentation = () => {
    setLayers((cur) => ({ ...cur, stations: true, equipment: true, connectors: true, dims: true }));
    setCadLayers(DEFAULT_CAD_LAYERS.map((layer) => ({ ...layer })));
    toast.success('Capas CAD restauradas a la presentación estándar.', 'Capas');
  };
  const assignSelectionToCadLayer = (id: CadLayerId) => {
    const ids = selRef.current.map((it) => it.id);
    if (!ids.length) { toast.error('Selecciona objetos para asignarlos a una capa.', 'Capas'); return; }
    setLayerAssignments((cur) => assignObjectsToLayer(cur, ids, id));
    toast.success(`${ids.length} objeto(s) asignados a ${cadLayers.find((l) => l.id === id)?.label ?? id}.`, 'Capas');
  };
  const selectCadLayerObjects = (id: CadLayerId) => {
    const items: SelItem[] = [];
    placementsRef.current.forEach((_, objectId) => { if ((layerAssignmentsRef.current[objectId] ?? 'layout') === id) items.push({ type: 'station', id: objectId }); });
    assetsRef.current.forEach((_, objectId) => { if ((layerAssignmentsRef.current[objectId] ?? 'equipment') === id) items.push({ type: 'asset', id: objectId }); });
    if (!items.length) { toast.error('No hay objetos visibles en esa capa.', 'Capas'); return; }
    select(items.slice(0, 200));
    toast.success(`${items.length} objeto(s) seleccionados en la capa.`, 'Capas');
  };
  const isolateCadLayer = (id: CadLayerId) => {
    setLayers((cur) => ({
      ...cur,
      stations: id === 'layout',
      equipment: id === 'equipment' || id === 'aisles' || id === 'safety',
      connectors: id === 'flow',
      dims: id === 'measurements',
    }));
    setCadLayers((cur) => isolateCadLayerVisibility(cur, id));
    toast.success(`Capa ${cadLayers.find((layer) => layer.id === id)?.label ?? id} aislada.`, 'Capas');
  };
  const showAllCadLayerVisibility = () => {
    setLayers((cur) => ({
      ...cur,
      stations: true,
      equipment: true,
      connectors: true,
      dims: true,
    }));
    setCadLayers((cur) => showAllCadLayers(cur));
    toast.success('Todas las capas CAD visibles.', 'Capas');
  };
  const defaultLayerFor = (item: SelItem): CadLayerId => item.type === 'station' ? 'layout' : 'equipment';
  const selectionLayer = (item: SelItem): CadLayerId => layerAssignments[item.id] ?? defaultLayerFor(item);
  const setSelectionLayer = (item: SelItem, layerId: CadLayerId) => setLayerAssignments((cur) => assignObjectsToLayer(cur, [item.id], layerId));
  const runToolbarAction = (id: CadToolbarActionId) => {
    if (id === 'select' || id === 'pan') setToolMode('select');
    else if (id === 'measure') setToolMode('measure');
    else if (id === 'aisle') { setShowCommand(true); setCommandText('haz un pasillo de 1.2m entre '); }
    else if (id === 'connector') connectLineLayout();
    else if (id === 'zone') { setTab('equipment'); addAsset('zone'); }
    else if (id === 'equipment') setTab('equipment');
    else if (id === 'text') addNote();
    else if (id === 'fit_view') viewPreset('iso');
    else if (id === 'undo') undo();
    else if (id === 'redo') redo();
  };
  const rememberPaletteAction = (entry: CadPaletteEntry) => {
    setRecentPaletteActions((items) => [`${entry.kind}:${entry.id}`, ...items.filter((item) => item !== `${entry.kind}:${entry.id}`)].slice(0, 5));
  };
  const runPaletteEntry = (entry: CadPaletteEntry) => {
    setShowPalette(false); setPaletteQuery(''); rememberPaletteAction(entry);
    if (entry.kind === 'tool') { runToolbarAction(entry.id as CadToolbarActionId); return; }
    if (entry.kind === 'command') {
      const example = entry.keywords.find((kw) => kw.includes(' ')) ?? entry.label;
      const parsed = parseCadCommand(example);
      setShowCommand(true); setCommandText(example);
      if (parsed.ok && parsed.input) {
        const preview = previewCadCommand(parsed.input, buildCommandContext());
        setCommandPreview({ input: parsed.input, preview });
        setCommandLog((items) => [createCadHistoryItem(parsed.input!, 'previewed', preview.summary, preview), ...items].slice(0, 12));
        toast.success('Preview listo en el Copiloto CAD.', 'Cmd-K CAD');
      } else {
        setCommandPreview(null);
        toast.error(parsed.clarification || parsed.error || 'El comando necesita más contexto.', 'Cmd-K CAD');
      }
      return;
    }
    addCadSymbol(entry.id);
    setTab('equipment');
    toast.success(`${entry.label} insertado desde Cmd-K.`, 'Cmd-K CAD');
  };
  const selectAll = () => {
    const items: SelItem[] = [
      ...[...placementsRef.current.keys()].map((id) => ({ type: 'station' as const, id })),
      ...[...assetsRef.current.keys()].map((id) => ({ type: 'asset' as const, id })),
    ];
    select(items); rebuildAll();
  };
  const viewPreset = (preset: 'top' | 'iso' | 'front') => {
    const cam = cameraRef.current; const ctrl = controlsRef.current; const ctx = ctxRef.current;
    if (!cam || !ctrl || !ctx) return;
    const d = Math.max(ctx.W, ctx.H) * ctx.s;
    if (preset === 'top') cam.position.set(0, d * 1.5, 0.01);
    else if (preset === 'front') cam.position.set(0, d * 0.5, d * 1.3);
    else cam.position.set(d * 0.6, d * 0.85, d * 1.0);
    ctrl.target.set(0, 0, 0); ctrl.update();
  };
  // ---- 2D⇄3D view toggle: the CAD unifica plano (2D) y modelo (3D) (unify) ----
  // 2D = vista superior bloqueada (solo pan+zoom), como un plano CAD; 3D = órbita libre.
  const applyViewMode = useCallback((mode: '3d' | '2d') => {
    const cam = cameraRef.current; const ctrl = controlsRef.current; const ctx = ctxRef.current;
    if (!cam || !ctrl || !ctx) return;
    const d = Math.max(ctx.W, ctx.H) * ctx.s;
    if (mode === '2d') {
      // exit walkthrough if active, lock to a straight-down plan view
      if (walkRef.current) { setWalk(false); walkRef.current = false; }
      cam.position.set(0, d * 1.6, 0.01); // straight above, due-south → footprint axis-aligned (no 45° diamond)
      ctrl.minPolarAngle = 0; ctrl.maxPolarAngle = 0.05; // pinned looking down
      ctrl.enableRotate = false;
      ctrl.mouseButtons.LEFT = THREE.MOUSE.PAN; // arrastrar el fondo = paneo (estilo 2D)
      ctrl.touches.ONE = THREE.TOUCH.PAN;
    } else {
      ctrl.minPolarAngle = 0; ctrl.maxPolarAngle = Math.PI / 2.05;
      ctrl.enableRotate = true;
      ctrl.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      ctrl.touches.ONE = THREE.TOUCH.ROTATE;
      cam.position.set(d * 0.6, d * 0.85, d * 1.0);
    }
    ctrl.target.set(0, 0, 0); ctrl.update();
  }, []);
  const toggleViewMode = useCallback(() => {
    setViewMode((m) => { const next = m === '3d' ? '2d' : '3d'; applyViewMode(next); return next; });
  }, [applyViewMode]);
  const exportPng = () => {
    const r = rendererRef.current, sc = sceneRef.current, cam = cameraRef.current;
    if (!r || !sc || !cam) return;
    r.render(sc, cam);
    const a = document.createElement('a');
    a.href = r.domElement.toDataURL('image/png');
    a.download = `layout3d-${model}-${revision}.png`.replace(/[^\w.\-]+/g, '_');
    a.click();
  };
  // Plot a printable PDF sheet: the rendered view + a title block (Fase 65).
  const exportPdf = async () => {
    const r = rendererRef.current, sc = sceneRef.current, cam = cameraRef.current, fp = data?.footprint;
    if (!r || !sc || !cam || !fp) return;
    try {
      r.render(sc, cam);
      const img = r.domElement.toDataURL('image/png');
      const placements = [...placementsRef.current.values()];
      const stationArea = placements.reduce((acc, p) => acc + p.w * p.h, 0);
      const assets = [...assetsRef.current.values()];
      const equipArea = assets.reduce((acc, x) => (x.kind !== 'zone' && x.kind !== 'agvpath' ? acc + x.w * x.h : acc), 0);
      const footprintArea = fp.footprintW * fp.footprintH;
      const util = footprintArea > 0 ? Math.min(100, ((stationArea + equipArea) / footprintArea) * 100) : 0;
      const centers: Record<string, FlowCenter> = {};
      placementsRef.current.forEach((p, id) => { centers[id] = { x: p.x + p.w / 2, y: p.y + p.h / 2 }; });
      const flow = flowMetrics(connectorsRef.current, centers);
      const annotations = [...annotationsRef.current.values()];
      const dimensionCount = annotations.filter((item) => item.type === 'dim').length;
      const labelCount = annotations.filter((item) => item.type === 'text').length;
      const validationIssueCount = cadValidationReport
        ? cadValidationReport.collisions.length + cadValidationReport.clearances.length + cadValidationReport.safety.length
        : 0;
      const activeLayerLabel = cadLayers.find((layer) => layer.id === activeCadLayer)?.label ?? activeCadLayer;
      const approvalLabel = approval ? APPROVAL_META[approval.status].label : 'Borrador';
      const sheet = plotSheetModel({
        model, revision, unit: fp.unit || 'mm', footprintW: fp.footprintW, footprintH: fp.footprintH,
        placedStations: placements.length, totalStations: data!.stations.length, equipmentCount: assets.length,
        utilPct: util, flowLen: flow.totalLen, date: new Date(),
        sheetSize: 'A4 landscape',
        exportFormat: 'PDF',
        approvalStatus: approvalLabel,
        activeLayer: activeLayerLabel,
        layerCount: cadLayers.length,
        visibleLayerCount: cadLayers.filter((layer) => layer.visible).length,
        lockedLayerCount: cadLayers.filter((layer) => layer.locked).length,
        connectorCount: connectorsRef.current.length,
        dimensionCount,
        labelCount,
        validationSeverity: cadValidationReport?.severity ?? 'pending',
        validationIssueCount,
        dxfWarningCount: dxfWarnings.length,
      });
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = 297, pageH = 210, margin = 10;
      // header band
      doc.setFillColor(17, 24, 39); doc.rect(0, 0, pageW, 16, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text(`AXOS OS · ${sheet.title}`, margin, 11);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text(sheet.subtitle, pageW - margin, 11, { align: 'right' });
      // title block (right column)
      const tbW = 70, tbX = pageW - margin - tbW, tbY = 22, rowH = 9;
      const tbH = sheet.fields.length * rowH + 6;
      doc.setDrawColor(150); doc.setFillColor(246, 248, 250); doc.rect(tbX, tbY, tbW, tbH, 'FD');
      doc.setFontSize(8.5);
      let y = tbY + 7;
      for (const f of sheet.fields) {
        doc.setFont('helvetica', 'normal'); doc.setTextColor(110, 116, 128); doc.text(f.label, tbX + 3, y);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 24, 32); doc.text(f.value, tbX + tbW - 3, y, { align: 'right' });
        y += rowH;
      }
      // drawing area (left) — fit the captured view preserving aspect
      const imgX = margin, imgY = 22, imgW = tbX - margin - 6, imgH = pageH - imgY - margin;
      const props = doc.getImageProperties(img);
      const ar = (props.width || 4) / (props.height || 3);
      let w = imgW, h = w / ar; if (h > imgH) { h = imgH; w = h * ar; }
      doc.setDrawColor(205); doc.rect(imgX, imgY, imgW, imgH);
      doc.addImage(img, 'PNG', imgX + (imgW - w) / 2, imgY + (imgH - h) / 2, w, h);
      doc.save(`layout-${model}-${revision}.pdf`.replace(/[^\w.\-]+/g, '_'));
      toast.success('Plano PDF generado.', '3D');
    } catch (e) { console.error(e); toast.error('No se pudo generar el PDF.', '3D'); }
  };
  // Export the 3D model as binary glTF (.glb) — opens in Blender, other CAD, etc.
  const exportGltf = async () => {
    const groups = [blocksRef.current, assetsGroupRef.current, connsGroupRef.current, groundRef.current].filter(Boolean) as THREE.Object3D[];
    if (!groups.length) return;
    try {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      // hide labels + the live preview line so the model is clean geometry
      const hidden: THREE.Object3D[] = [];
      sceneRef.current?.traverse((o) => {
        if ((o.userData?.isLabel || o === previewLineRef.current) && o.visible) { o.visible = false; hidden.push(o); }
      });
      const restore = () => hidden.forEach((o) => { o.visible = true; });
      new GLTFExporter().parse(
        groups,
        (result) => {
          restore();
          const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `layout3d-${model}-${revision}.glb`.replace(/[^\w.\-]+/g, '_');
          a.click();
          URL.revokeObjectURL(url);
          toast.success('Modelo 3D exportado (.glb).', '3D');
        },
        (err) => { restore(); console.error(err); toast.error('No se pudo exportar el modelo 3D.', '3D'); },
        { binary: true, onlyVisible: true },
      );
    } catch { toast.error('No se pudo exportar el modelo 3D.', '3D'); }
  };
  const computeDxfExportSummary = (options: DxfExportOptions): DxfExportSummary => {
    const selectedIds = new Set(selRef.current.map((item) => item.id));
    const layerLabel = (id: CadLayerId) => cadLayers.find((layer) => layer.id === id)?.label ?? id;
    const layerVisible = (id: CadLayerId) => cadLayers.find((layer) => layer.id === id)?.visible ?? true;
    const entities: CadDxfExportReadinessEntity[] = [
      ...[...placementsRef.current.keys()].map((id) => {
        const layerId = layerAssignments[id] ?? 'layout';
        return {
          id,
          kind: 'object' as const,
          layer: layerLabel(layerId),
          label: stationsByIdRef.current.get(id)?.station,
          requiresLabel: true,
          selected: selectedIds.has(id),
          visible: layerVisible(layerId),
        };
      }),
      ...[...assetsRef.current.values()].map((asset) => {
        const layerId = layerAssignments[asset.id] ?? 'equipment';
        return {
          id: asset.id,
          kind: 'object' as const,
          layer: layerLabel(layerId),
          label: asset.label,
          requiresLabel: DXF_LABEL_REQUIRED_ASSET_KINDS.has(asset.kind),
          selected: selectedIds.has(asset.id),
          visible: layerVisible(layerId),
        };
      }),
      ...connectorsRef.current.map((conn) => ({
        id: `${conn.from}:${conn.to}`,
        kind: 'connector' as const,
        layer: layerLabel('flow'),
        selected: selectedIds.has(conn.from) && selectedIds.has(conn.to),
        visible: layerVisible('flow'),
      })),
      ...[...annotationsRef.current.values()]
        .filter((ann) => ann.type === 'dim' && ann.x2 != null && ann.y2 != null)
        .map((ann) => ({ id: ann.id, kind: 'measurement' as const, layer: layerLabel('measurements'), label: ann.text, selected: true, visible: layerVisible('measurements') })),
      ...[...annotationsRef.current.values()]
        .filter((ann) => ann.type === 'text')
        .map((ann) => ({ id: ann.id, kind: 'label' as const, layer: 'Text', label: ann.text, selected: true, visible: layersRef.current.notes })),
    ];
    const readiness = evaluateCadDxfExportReadiness({
      scope: options.scope,
      includeHidden: options.includeHidden,
      includeMeasurements: options.includeMeasurements,
      includeLabels: options.includeLabels,
      selectedObjectCount: selectedIds.size,
      entities,
      validationBlockers: (report?.errors ?? 0) + collisionHits.length + safetyIssues.length,
      validationWarnings: (report?.warnings ?? 0) + dxfWarnings.length + (flowHealth && flowHealth.score < 80 ? 1 : 0),
      dxfImportWarnings: dxfWarnings.length,
      selectionKeepsAnnotations: true,
    });
    return {
      objects: readiness.counts.object,
      connectors: readiness.counts.connector,
      measurements: readiness.counts.measurement,
      labels: readiness.counts.label,
      layers: readiness.includedLayers.length,
      canExport: readiness.canExport,
      includedLayers: readiness.includedLayers,
      layerSummary: readiness.layerSummary,
      issues: readiness.issues,
    };
  };
  const setDxfOption = (patch: Partial<DxfExportOptions>) => {
    setDxfExportOptions((cur) => {
      const next = { ...cur, ...patch };
      setDxfExportSummary(computeDxfExportSummary(next));
      return next;
    });
  };
  const openDxfExport = () => {
    const next = { ...dxfExportOptions, units: data?.footprint.unit === 'm' ? 'm' as const : 'mm' as const, fileName: `layout-${model}-${revision}`.replace(/[^\w.\-]+/g, '_') };
    setDxfExportOptions(next);
    setDxfExportSummary(computeDxfExportSummary(next));
    setShowDxfExport(true);
  };
  const exportDxf = async (options: DxfExportOptions = dxfExportOptions) => {
    try {
      const summary = computeDxfExportSummary(options);
      setDxfExportSummary(summary);
      const blocker = summary.issues.find((issue) => issue.level === 'blocker');
      if (blocker) { toast.error(blocker.message, 'DXF'); return; }
      const layerLabel = (id: CadLayerId) => cadLayers.find((layer) => layer.id === id)?.label ?? id;
      const layerVisible = (id: CadLayerId) => cadLayers.find((layer) => layer.id === id)?.visible ?? true;
      const includeLayer = (id: CadLayerId) => options.includeHidden || layerVisible(id);
      const centerFor = (id: string): { x: number; y: number } | null => {
        const p = placementsRef.current.get(id);
        if (p) return { x: p.x, y: p.y };
        const asset = assetsRef.current.get(id);
        if (asset) return { x: asset.x, y: asset.y };
        return null;
      };
      const selectedIds = new Set(selRef.current.map((item) => item.id));
      const includeObject = (id: string, fallback: CadLayerId) => {
        if (options.scope === 'selection' && !selectedIds.has(id)) return false;
        return includeLayer(layerAssignments[id] ?? fallback);
      };
      const boxes = [
        ...[...placementsRef.current.entries()]
          .filter(([id]) => includeObject(id, 'layout'))
          .map(([id, p]) => ({ id, label: stationsByIdRef.current.get(id)?.station ?? id, x: p.x, y: p.y, width: p.w, height: p.h, layer: layerLabel(layerAssignments[id] ?? 'layout') })),
        ...[...assetsRef.current.values()]
          .filter((asset) => includeObject(asset.id, 'equipment'))
          .map((asset) => ({ id: asset.id, label: asset.label || assetMeta(asset.kind).label, x: asset.x, y: asset.y, width: asset.w, height: asset.h, layer: layerLabel(layerAssignments[asset.id] ?? 'equipment') })),
      ];
      const connectors = connectorsRef.current.map((conn) => {
        if (!includeLayer('flow')) return null;
        if (options.scope === 'selection' && (!selectedIds.has(conn.from) || !selectedIds.has(conn.to))) return null;
        const from = centerFor(conn.from); const to = centerFor(conn.to);
        return from && to ? { from, to, layer: layerLabel('flow') } : null;
      }).filter((conn): conn is { from: { x: number; y: number }; to: { x: number; y: number }; layer: string } => !!conn);
      const labels = options.includeLabels && (options.includeHidden || layersRef.current.notes) ? [...annotationsRef.current.values()].filter((ann) => ann.type === 'text').map((ann) => ({ text: ann.text || 'Nota', x: ann.x, y: ann.y, layer: 'Text' })) : [];
      const measurements = options.includeMeasurements && includeLayer('measurements') ? [...annotationsRef.current.values()].filter((ann) => ann.type === 'dim' && ann.x2 != null && ann.y2 != null).map((ann) => ({ from: { x: ann.x, y: ann.y }, to: { x: ann.x2!, y: ann.y2! }, label: ann.text, layer: layerLabel('measurements') })) : [];
      const exported = exportCadLayoutDxf({ boxes, connectors, labels, measurements }, { units: options.units, fileComment: `AXOS CAD ${model} ${revision}` });
      const blob = new Blob([exported.content], { type: 'application/dxf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(options.fileName.trim() || `layout-${model}-${revision}`).replace(/[^\w.\-]+/g, '_')}.dxf`;
      a.click();
      URL.revokeObjectURL(url);
      setShowDxfExport(false);
      toast.success(`Layout exportado a DXF (${exported.entityCount} entidades).`, 'DXF');
    } catch { toast.error('No se pudo exportar el DXF.', 'DXF'); }
  };
  const save = async () => {
    if (!model || !data) return;
    setSaving(true);
    try {
      const positions = [...placementsRef.current.entries()].map(([id, p]) => ({ id, ...p }));
      const cleared = [...loadedPlacedRef.current].filter((id) => !placementsRef.current.has(id));
      const assets = [...assetsRef.current.values()];
      const annotations = [...annotationsRef.current.values()];
      const r = await apiFetch(`${API_BASE}/line-engineering/layout`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, revision, footprint: data.footprint, positions, cleared,
          connectors: connectorsRef.current, assets,
          annotations, cells: cellsRef.current,
          // persist the DXF backdrop placement so saving from the CAD never drops it (unify fix)
          ...(dxfMetaRef.current ? { dxf: dxfMetaRef.current } : {}),
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(d?.message || 'No se pudo guardar.', '3D'); return; }
      toast.success('Layout 3D guardado.', '3D');
      loadedPlacedRef.current = new Set(placementsRef.current.keys());
      setDirty(false);
      onSaved?.();
    } catch { toast.error('Error de red.', '3D'); } finally { setSaving(false); }
  };

  // ---- keyboard shortcuts ----
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      const cadShortcut = matchCadShortcut(e);
      if (cadShortcut?.id === 'palette') { e.preventDefault(); setShowPalette(true); return; }
      // in walkthrough mode WASD/look take over; only Esc (exit) reaches here
      if (walkRef.current) { if (e.key === 'Escape') { e.preventDefault(); toggleWalk(); } return; }
      if (cadShortcut && TOOLBAR_SHORTCUT_IDS.has(cadShortcut.id as CadToolbarActionId)) {
        e.preventDefault();
        runToolbarAction(cadShortcut.id as CadToolbarActionId);
        return;
      }
      if (cadShortcut?.id === 'grid_toggle') {
        e.preventDefault();
        setLayers((cur) => ({ ...cur, grid: !cur.grid }));
        return;
      }
      if (cadShortcut?.id === 'object_snap_toggle') {
        e.preventDefault();
        setOsnap((cur) => !cur);
        return;
      }
      if (cadShortcut?.id === 'validate_layout') {
        e.preventDefault();
        openChecks();
        return;
      }
      if (cadShortcut?.id === 'export_dxf') {
        e.preventDefault();
        openDxfExport();
        return;
      }
      const g = data?.footprint.gridSize || 100;
      const step = e.shiftKey ? g * 5 : g;
      const hasSel = selRef.current.length > 0;
      if (e.key === 'Escape') {
        if (paletteOpenRef.current) { setShowPalette(false); setPaletteQuery(''); }
        else if (toolRef.current !== 'select') { endDraw(); setTool('select'); toolRef.current = 'select'; }
        else if (hasSel) { select([]); rebuildAll(); }
        else onClose();
      }
      else if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); setShowHelp((v) => !v); }
      else if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); selectAll(); }
      else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey) || ((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey))) { e.preventDefault(); redo(); }
      else if ((e.key === 'm' || e.key === 'M')) { e.preventDefault(); toggleMeasure(); }
      else if ((e.key === 'w' || e.key === 'W')) { e.preventDefault(); toggleWall(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && hasSel) { e.preventDefault(); removeSelected(); }
      else if ((e.key === 'r' || e.key === 'R') && hasSel) { e.preventDefault(); rotateSelected(e.shiftKey ? -15 : 15); }
      else if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey) && hasSel) { e.preventDefault(); duplicateSelected(); }
      else if (e.key === 'ArrowLeft' && hasSel) { e.preventDefault(); nudgeSelected(-step, 0); }
      else if (e.key === 'ArrowRight' && hasSel) { e.preventDefault(); nudgeSelected(step, 0); }
      else if (e.key === 'ArrowUp' && hasSel) { e.preventDefault(); nudgeSelected(0, -step); }
      else if (e.key === 'ArrowDown' && hasSel) { e.preventDefault(); nudgeSelected(0, step); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  if (!open || typeof document === 'undefined') return null;

  const paletteResults = searchCadPalette(paletteQuery).slice(0, 9);
  const commandAssistLabels = selList.map((item) => {
    if (item.type === 'station') return data?.stations.find((station) => station.id === item.id)?.station ?? item.id;
    if (selSnap?.type === 'asset' && selSnap.id === item.id) return selSnap.title;
    return item.id;
  });
  const commandAssistSuggestions = showCommand ? suggestCadCommands({
    query: commandText,
    selectedCount: selList.length,
    selectedObjectLabels: commandAssistLabels,
    maxItems: commandText.trim() ? 4 : 3,
  }) : [];
  const tray = (data?.stations ?? []).filter((s) => !placedIds.has(s.id));
  const placedCount = placedIds.size;
  const assetCount = assetIds.size;
  const dxfWarningSummary = summarizeDxfImportWarnings(dxfWarnings).slice(0, 6);
  const dxfPrimitiveSummary = dxfImportPreview
    ? dxfImportPreview.primitives.reduce<Record<string, number>>((acc, primitive) => { acc[primitive.kind] = (acc[primitive.kind] ?? 0) + 1; return acc; }, {})
    : null;
  const symbolCategories: Array<CadSymbolCategory | 'all'> = ['all', 'equipment', 'flow', 'safety', 'storage', 'operator'];
  const filteredSymbols = CAD_SYMBOL_LIBRARY.filter((symbol) => {
    const q = symbolSearch.trim().toLowerCase();
    const matchesCategory = symbolCategory === 'all' || symbol.category === symbolCategory;
    const matchesSearch = !q || [symbol.label, symbol.id, symbol.layer, symbol.category, ...symbol.tags].join(' ').toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });
  const cadLayerCounts = cadLayers.reduce<Record<CadLayerId, number>>((acc, layer) => ({ ...acc, [layer.id]: 0 }), {} as Record<CadLayerId, number>);
  placedIds.forEach((id) => { cadLayerCounts[layerAssignments[id] ?? 'layout'] += 1; });
  assetIds.forEach((id) => { cadLayerCounts[layerAssignments[id] ?? 'equipment'] += 1; });
  const cadLayerSummary = summarizeCadLayers(cadLayers, cadLayerCounts);
  const selectedObjectProperties: CadObjectProperties | null = selSnap && selList[0] ? (() => {
    const layerId = selectionLayer(selList[0]);
    const layer = cadLayers.find((candidate) => candidate.id === layerId);
    return describeCadObjectProperties({
      id: selSnap.id,
      type: selSnap.type,
      label: selSnap.title,
      kind: selSnap.kind,
      x: selSnap.x,
      y: selSnap.y,
      width: selSnap.w,
      height: selSnap.h,
      rotation: selSnap.rotation,
      layerId,
      layerLabel: layer?.label ?? layerId,
      layerVisible: layer?.visible ?? true,
      layerLocked: layer?.locked ?? false,
      tags: objectTags[selSnap.id],
      notes: objectNotes[selSnap.id],
    });
  })() : null;
  const validationFlow = cadValidationReport?.flow ?? flowHealth;
  const safetyBlockers = safetyIssues.filter((issue) => issue.code === 'zone_invasion').length;
  const safetyWarnings = safetyIssues.length - safetyBlockers;
  const releaseBlockers = (report?.errors ?? 0) + collisionHits.length + safetyBlockers;
  const releaseWarnings = (report?.warnings ?? 0) + clearanceIssues.length + safetyWarnings + dxfWarnings.length + (validationFlow && validationFlow.score < 80 ? 1 : 0);

  const releaseState = !report ? 'Sin validar' : releaseBlockers > 0 ? 'Bloqueado' : releaseWarnings > 0 ? 'Con avisos' : 'Listo';
  const releaseTone = releaseState === 'Listo' ? 'text-emerald-300' : releaseState === 'Bloqueado' ? 'text-rose-300' : releaseState === 'Con avisos' ? 'text-amber-300' : 'text-gray-500 dark:text-gray-400';
  const releaseChecks = [
    { label: 'Diseño base', value: report ? `${report.errors} errores · ${report.warnings} avisos` : 'Pendiente', tone: report?.score === 'error' ? 'text-rose-300' : report?.score === 'warn' ? 'text-amber-300' : report ? 'text-emerald-300' : 'text-gray-500 dark:text-gray-400' },
    { label: 'CAD validation', value: cadValidationReport ? cadValidationReport.severity === 'critical' ? 'Critico' : cadValidationReport.severity === 'warning' ? 'Con avisos' : 'OK' : 'Pendiente', tone: cadValidationReport?.severity === 'critical' ? 'text-rose-300' : cadValidationReport?.severity === 'warning' ? 'text-amber-300' : cadValidationReport ? 'text-emerald-300' : 'text-gray-500 dark:text-gray-400' },
    { label: 'Colisiones', value: collisionHits.length ? `${collisionHits.length} choque(s)` : 'Sin choques activos', tone: collisionHits.length ? 'text-rose-300' : 'text-emerald-300' },
    { label: 'Holguras', value: clearanceIssues.length ? `${clearanceIssues.length} bajo minimo` : 'Dentro de minimo', tone: clearanceIssues.length ? 'text-amber-300' : 'text-emerald-300' },
    { label: 'Safety zones', value: safetyIssues.length ? `${safetyIssues.length} issue(s)` : 'Sin invasiones activas', tone: safetyBlockers ? 'text-rose-300' : safetyIssues.length ? 'text-amber-300' : 'text-emerald-300' },
    { label: 'Flow Health', value: validationFlow ? `${validationFlow.score}/100` : 'No analizado', tone: !validationFlow ? 'text-gray-500 dark:text-gray-400' : validationFlow.score >= 80 ? 'text-emerald-300' : validationFlow.score >= 55 ? 'text-amber-300' : 'text-rose-300' },
    { label: 'DXF import', value: dxfWarnings.length ? `${dxfWarnings.length} warning(s)` : 'Sin warnings activos', tone: dxfWarnings.length ? 'text-amber-300' : 'text-emerald-300' },
  ];
  const flowSegmentRows = [...flowSegments].sort((a, b) => b.distance - a.distance).slice(0, 5);
  const flowReorderPreview = flowHealth?.reorderPreview;
  const flowReorderMoveRows = flowReorderPreview?.moves.filter((move) => move.from.x !== move.to.x || move.from.y !== move.to.y).slice(0, 5) ?? [];
  const dxfExportLayerRows = dxfExportSummary.layerSummary.filter((layer) => layer.included > 0 || layer.hidden > 0).slice(0, 5);
  const dxfExportIssueRows = dxfExportSummary.issues.slice(0, 5);

  // Portal to <body> so the full-screen overlay escapes the editor's glass
  // container (backdrop-filter would otherwise be the containing block for our
  // position:fixed and trap it inside the box instead of the viewport).
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-950 text-white">
      {/* top bar (relative z-30 so dropdown popovers paint above the 3D content,
          which would otherwise stack over the backdrop-blur'd bar) */}
      <div className="relative z-30 flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-white/10 shrink-0 bg-gray-900/80 backdrop-blur">
        {/* Cierre persistente y SIEMPRE visible (X clara) anclado al inicio de la
            barra. La barra usa flex-wrap para que las herramientas NUNCA recorten
            ni choquen. Regla: ninguna pantalla a foco total puede atrapar. */}
        <button
          onClick={onClose}
          title="Cerrar el CAD — volver al dashboard (Esc)"
          aria-label="Cerrar el CAD"
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-rose-500/90 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <X className="w-4 h-4" /> Cerrar
        </button>
        <div className="w-px h-5 bg-white/10" />
        <BoxIcon className="w-4 h-4" style={{ color: '#f43f5e' }} />
        <span className="font-semibold text-sm">CAD · {model} · {revision}</span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">{placedCount} estaciones · {assetCount} equipos</span>
        <div className="inline-flex items-center rounded-lg bg-white/[0.06] p-0.5 text-[12px] font-semibold ml-1">
          <button onClick={() => { if (viewMode !== '2d') toggleViewMode(); }} className={`px-2.5 py-1 rounded-md transition-colors ${viewMode === '2d' ? 'bg-white/15 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-200'}`} title="Vista de plano 2D (superior, solo paneo y zoom)">2D</button>
          <button onClick={() => { if (viewMode !== '3d') toggleViewMode(); }} className={`px-2.5 py-1 rounded-md transition-colors ${viewMode === '3d' ? 'bg-white/15 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-200'}`} title="Vista 3D (órbita libre)">3D</button>
        </div>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T3Btn active={tool === 'select'} onClick={() => setToolMode('select')} title="Seleccionar / mover (V)"><MousePointer2 className="w-4 h-4" /></T3Btn>
        <T3Btn active={tool === 'measure'} onClick={toggleMeasure} title="Medir / acotar (M)"><Ruler className="w-4 h-4" /></T3Btn>
        <T3Btn active={tool === 'wall'} onClick={toggleWall} title="Dibujar muros (W) — clic en puntos, Esc termina"><Spline className="w-4 h-4" /></T3Btn>
        <T3Btn onClick={addNote} title="Agregar nota de texto (T)"><StickyNote className="w-4 h-4" /></T3Btn>
        <T3Btn onClick={autoDimension} title="Acotar automáticamente — medidas generales y pasos del layout (o de la selección)"><RulerDimensionLine className="w-4 h-4" /></T3Btn>
        {dimCount > 0 && (
          <button onClick={clearDims} title="Quitar todas las cotas" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-gray-300 hover:bg-white/10">
            {dimCount} {dimCount === 1 ? 'cota' : 'cotas'} <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T3Btn onClick={undo} disabled={hist.undo === 0} title="Deshacer (Ctrl+Z)"><Undo2 className="w-4 h-4" /></T3Btn>
        <T3Btn onClick={redo} disabled={hist.redo === 0} title="Rehacer (Ctrl+Shift+Z)"><Redo2 className="w-4 h-4" /></T3Btn>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T3Btn active={layers.grid} onClick={() => setLayers((v) => ({ ...v, grid: !v.grid }))} title={layers.grid ? 'Ocultar grilla del plano' : 'Mostrar grilla del plano'}><Grid3x3 className="w-4 h-4" /></T3Btn>
        <T3Btn active={snap} onClick={() => setSnap((v) => !v)} title="Snap a grilla"><Crosshair className="w-4 h-4" /></T3Btn>
        <T3Btn active={osnap} onClick={() => setOsnap((v) => !v)} title="Snap a objetos y al plano DXF — alinea con bordes/centros y engancha a vértices y puntos medios del plano al medir o trazar muros"><Magnet className="w-4 h-4" /></T3Btn>
        <div className="w-px h-5 bg-white/10 mx-1" />
        {viewMode === '3d' && (<>
          <T3Btn onClick={() => viewPreset('iso')} title="Vista isométrica"><Maximize2 className="w-4 h-4" /></T3Btn>
          <T3Btn onClick={() => viewPreset('top')} title="Vista superior (planta)"><Eye className="w-4 h-4" /></T3Btn>
          <T3Btn onClick={() => viewPreset('front')} title="Vista frontal"><Layers className="w-4 h-4" /></T3Btn>
          <T3Btn active={walk} onClick={toggleWalk} title="Recorrido en primera persona — arrastra para mirar, WASD para caminar, Esc para salir"><PersonStanding className="w-4 h-4" /></T3Btn>
        </>)}
        <T3Btn active={showHeat} onClick={() => setShowHeat((v) => !v)} title="Mapa de calor de ocupación en el piso"><Grid2x2 className="w-4 h-4" /></T3Btn>
        <T3Btn active={showGaps} onClick={() => setShowGaps((v) => !v)} title="Holguras de seguridad — marca los objetos demasiado juntos (ámbar) o traslapados (rojo)"><ShieldAlert className="w-4 h-4" /></T3Btn>
        <div className="relative" ref={overlayMenuRef}>
          <T3Btn active={showOverlayMenu || !!overlay} onClick={() => setShowOverlayMenu((v) => !v)} title="Estado de estación — MES en vivo, calor de ciclo, completitud, bahías, calidad"><Activity className="w-4 h-4" /></T3Btn>
          {showOverlayMenu && (
            <div className="absolute top-full mt-1 left-0 z-50 w-60 rounded-xl border border-white/10 bg-gray-900 shadow-2xl py-1">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-500">Estado de estación</div>
              <button onClick={() => loadOverlay(null)} className={`w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-white/[0.08] ${overlay === null ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`}>Ninguno</button>
              {OVERLAY_DEFS.map((o) => (
                <button key={o.key} onClick={() => loadOverlay(o.key)} className={`w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-white/[0.08] ${overlay === o.key ? 'text-white' : 'text-gray-200'}`}>{o.label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="relative" ref={viewMenuRef}>
          <T3Btn active={showView} onClick={() => setShowView((v) => { const nv = !v; if (nv && data) setFpDraft({ w: data.footprint.footprintW, h: data.footprint.footprintH, g: data.footprint.gridSize }); return nv; })} title="Vista, capas y plano"><SlidersHorizontal className="w-4 h-4" /></T3Btn>
          {showView && (
            <div className="absolute left-0 top-full mt-1.5 w-56 rounded-xl border border-white/10 bg-gray-900 shadow-2xl p-3 z-10 text-[12px]">
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">Capas</div>
              {([['stations', 'Estaciones'], ['equipment', 'Equipo'], ['connectors', 'Conexiones'], ['dims', 'Cotas'], ['notes', 'Notas'], ['labels', 'Etiquetas'], ['dxf', 'Plano DXF'], ['grid', 'Grilla']] as const).map(([k, lbl]) => (
                <label key={k} className="flex items-center gap-2 py-1 cursor-pointer text-gray-300 hover:text-white">
                  <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((st) => ({ ...st, [k]: e.target.checked }))} className="accent-cyan-500" />
                  {lbl}
                </label>
              ))}
              <div className="mt-2.5 mb-1.5 flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-wide text-gray-500">Capas CAD</div>
                <div className={`text-[10px] ${cadLayerSummary.hidden ? 'text-amber-300' : 'text-gray-500'}`}>
                  {cadLayerSummary.visible}/{cadLayerSummary.total} visibles
                </div>
              </div>
              <div className="space-y-1">
                {cadLayers.map((layer) => (
                  <div key={layer.id} className={`rounded-lg px-2 py-1 ${activeCadLayer === layer.id ? 'bg-cyan-400/[0.10] ring-1 ring-cyan-400/20' : 'bg-white/[0.04]'}`}>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => toggleCadLayerVisibility(layer.id)} className={`h-2.5 w-2.5 rounded-full ${layer.visible ? '' : 'opacity-30'}`} style={{ background: layer.color }} title={layer.visible ? 'Ocultar capa' : 'Mostrar capa'} />
                      <button onClick={() => setActiveCadLayer(layer.id)} className={`min-w-0 flex-1 truncate text-left ${layer.visible ? 'text-gray-200' : 'text-gray-500'}`} title="Definir como capa activa">{layer.label}</button>
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">{cadLayerCounts[layer.id]}</span>
                      <button onClick={() => setCadLayers((cur) => toggleCadLayerLocked(cur, layer.id))} className={`text-[10px] ${layer.locked ? 'text-amber-300' : 'text-gray-500'}`}>{layer.locked ? 'Lock' : 'Open'}</button>
                    </div>
                    <div className="mt-1 grid grid-cols-[1fr_auto] gap-1.5">
                      <input value={layer.label} onChange={(e) => updateCadLayerLabel(layer.id, e.target.value)} className="min-w-0 rounded-md border border-white/10 bg-gray-950/70 px-1.5 py-0.5 text-[10.5px] text-gray-200 outline-none focus:ring-1 focus:ring-cyan-500/40" title="Renombrar capa local" />
                      <input type="color" value={layer.color} onChange={(e) => updateCadLayerColor(layer.id, e.target.value)} className="h-6 w-7 rounded border border-white/10 bg-transparent p-0" title="Color local de capa" />
                    </div>
                    <div className="mt-1 flex items-center justify-end gap-2 text-[10px]">
                      <button onClick={() => selectCadLayerObjects(layer.id)} className="text-gray-500 dark:text-gray-400 hover:text-white">Sel</button>
                      <button onClick={() => isolateCadLayer(layer.id)} className="text-gray-500 dark:text-gray-400 hover:text-white">Solo</button>
                      <button onClick={() => assignSelectionToCadLayer(layer.id)} className="text-cyan-300 hover:text-cyan-100">Asignar</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-gray-500">
                <span>{Object.keys(layerAssignments).length} asignados · {cadLayerSummary.hiddenObjectCount} ocultos · {cadLayerSummary.lockedObjectCount} bloqueados</span>
                <div className="inline-flex items-center gap-2">
                  <button onClick={showAllCadLayerVisibility} className="text-gray-500 dark:text-gray-400 hover:text-white">All</button>
                  <button onClick={resetCadLayerPresentation} className="text-gray-500 dark:text-gray-400 hover:text-white">Reset</button>
                </div>
              </div>
              {cadLayerSummary.hiddenObjectCount > 0 && (
                <div className="mt-1 rounded-lg border border-amber-400/15 bg-amber-400/[0.06] px-2 py-1 text-[10.5px] text-amber-100">
                  {cadLayerSummary.hiddenObjectCount} objeto(s) ocultos por capas CAD. Usa All para recuperar la vista completa.
                </div>
              )}
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-2.5 mb-1.5">Tema</div>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(THEMES) as Theme3D[]).map((t) => (
                  <button key={t} onClick={() => setTheme(t)} className={`px-2 py-1 rounded-md text-[12px] ${theme === t ? 'bg-cyan-600 text-white' : 'bg-white/[0.06] text-gray-300 hover:bg-white/[0.12]'}`}>{THEMES[t].label}</button>
                ))}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-2.5 mb-1.5">Plano ({data?.footprint.unit ?? 'mm'})</div>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                <DimInput label="Ancho" value={fpDraft.w} onChange={(v) => setFpDraft((s) => ({ ...s, w: v }))} />
                <DimInput label="Largo" value={fpDraft.h} onChange={(v) => setFpDraft((s) => ({ ...s, h: v }))} />
                <DimInput label="Rejilla" value={fpDraft.g} onChange={(v) => setFpDraft((s) => ({ ...s, g: v }))} />
              </div>
              <button onClick={applyFootprint} className="w-full px-2 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-[12px] font-medium">Aplicar tamaño</button>
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-2.5 mb-1">Sol / sombras</div>
              <label className="block mb-1.5">
                <span className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400"><span>Azimut</span><span>{sun.az}°</span></span>
                <input type="range" min={0} max={360} value={sun.az} onChange={(e) => setSun((s) => ({ ...s, az: Number(e.target.value) }))} className="w-full accent-amber-400" />
              </label>
              <label className="block">
                <span className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400"><span>Altura</span><span>{sun.el}°</span></span>
                <input type="range" min={12} max={88} value={sun.el} onChange={(e) => setSun((s) => ({ ...s, el: Number(e.target.value) }))} className="w-full accent-amber-400" />
              </label>
            </div>
          )}
        </div>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T3Btn onClick={arrangeLineLayout} title="Acomodar la línea — ordena las estaciones por secuencia en filas equiespaciadas"><Rows3 className="w-4 h-4" /></T3Btn>
        <T3Btn onClick={connectLineLayout} title="Conectar la línea — enlaza cada estación con la siguiente en secuencia (flujo)"><Waypoints className="w-4 h-4" /></T3Btn>
        <T3Btn onClick={runOptimize} disabled={serverBusy} title="Optimizar flujo — reordena para minimizar el recorrido (servidor)"><WandSparkles className="w-4 h-4" /></T3Btn>
        <T3Btn active={showCommand} onClick={() => setShowCommand((v) => !v)} title="Comandos en lenguaje natural — scaffold local para function calling"><ChevronRight className="w-4 h-4" /></T3Btn>
        <T3Btn active={showPalette} onClick={() => setShowPalette((v) => !v)} title="Paleta de comandos (⌘K / Ctrl K) — busca comandos, herramientas y símbolos"><Search className="w-4 h-4" /></T3Btn>
        <T3Btn onClick={openChecks} title="Revisión de diseño — valida colocación, límites, traslapes y flujo"><ShieldCheck className="w-4 h-4" /></T3Btn>
        <T3Btn active={!!flowHealth} onClick={analyzeFlowHealth} title="Flow Health — score, cruces y backtracking"><ChartLine className="w-4 h-4" /></T3Btn>
        <T3Btn onClick={openTakeoff} title="Cantidades / lista de materiales"><ClipboardList className="w-4 h-4" /></T3Btn>
        <div className="relative" ref={analysisMenuRef}>
          <T3Btn active={showAnalysis || !!analysisPanel} onClick={() => setShowAnalysis((v) => !v)} title="Análisis del layout — balanceo, costos, flujo, escenarios, salud…"><ChartLine className="w-4 h-4" /></T3Btn>
          {showAnalysis && (
            <div className="absolute top-full mt-1 left-0 z-50 w-64 max-h-[62vh] overflow-y-auto rounded-xl border border-white/10 bg-gray-900 shadow-2xl py-1">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-500">Análisis del layout</div>
              {ANALYSIS_PANELS.map((p) => (
                <button key={p.key} onClick={() => { setAnalysisPanel(p.key); setShowAnalysis(false); }} className="w-full text-left px-3 py-1.5 text-[12.5px] text-gray-200 hover:bg-white/[0.08] transition-colors">{p.label}</button>
              ))}
            </div>
          )}
        </div>
        <T3Btn onClick={exportPdf} title="Imprimir plano a PDF — vista + cajetín (modelo, revisión, huella, fecha)"><Printer className="w-4 h-4" /></T3Btn>
        <T3Btn onClick={exportPng} title="Exportar imagen (PNG)"><Download className="w-4 h-4" /></T3Btn>
        <T3Btn onClick={exportGltf} title="Exportar modelo 3D (.glb) — Blender, otros CAD"><Package className="w-4 h-4" /></T3Btn>
        <input ref={dxfInputRef} type="file" accept=".dxf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onDxfFile(f); e.target.value = ''; }} />
        <T3Btn onClick={() => dxfInputRef.current?.click()} disabled={dxfBusy} title="Cargar plano DXF de fondo (calcar el plano del cliente)"><Upload className="w-4 h-4" /></T3Btn>
        {hasDxf && <T3Btn onClick={importDxfWalls} title="Convertir el plano DXF de fondo en muros editables"><BrickWall className="w-4 h-4" /></T3Btn>}
        {hasDxf && <T3Btn onClick={removeDxf} disabled={dxfBusy} title="Quitar el plano DXF de fondo"><ImageOff className="w-4 h-4" /></T3Btn>}
        <T3Btn onClick={openDxfExport} title="Exportar a DXF (AutoCAD) — opciones de capas, selección y cotas"><FileDown className="w-4 h-4" /></T3Btn>
        <T3Btn onClick={exportCsvSchedule} title="Exportar estaciones a CSV (Excel)"><FileText className="w-4 h-4" /></T3Btn>
        {dxfWarnings.length > 0 && (
          <div className="ml-1 inline-flex items-center gap-1 rounded-lg border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-100" title="Advertencias del último DXF importado">
            <CircleAlert className="h-3.5 w-3.5" />
            DXF {dxfWarnings.length}
          </div>
        )}
        <T3Btn active={showVersions} onClick={openVersions} title="Versiones / escenarios — guardar, restaurar"><History className="w-4 h-4" /></T3Btn>
        <T3Btn active={showCells} onClick={() => setShowCells((v) => !v)} title="Celdas / zonas — agrupar estaciones en celdas"><Group className="w-4 h-4" /></T3Btn>
        {models.length > 1 && <T3Btn active={showClone} onClick={() => setShowClone((v) => !v)} title="Clonar layout desde otro modelo (plantilla)"><Copy className="w-4 h-4" /></T3Btn>}
        <T3Btn active={showHelp} onClick={() => setShowHelp((v) => !v)} title="Atajos y ayuda (?)"><HelpCircle className="w-4 h-4" /></T3Btn>
        <div className="flex-1" />
        {approval && (
          <div className="inline-flex items-center gap-1.5 mr-1.5" title="Estado de aprobación del layout">
            <Stamp className="w-3.5 h-3.5" style={{ color: APPROVAL_META[approval.status].color }} />
            <select value={approval.status} disabled={approvalBusy} onChange={(e) => setApprovalStatus(e.target.value as ApprovalStatus)} className="text-[12px] rounded-md px-1.5 py-1 bg-white/[0.06] border border-white/10 outline-none" style={{ color: APPROVAL_META[approval.status].color }}>
              <option value="draft" className="text-gray-900">Borrador</option>
              <option value="in_review" className="text-gray-900">En revisión</option>
              <option value="approved" className="text-gray-900">Aprobado</option>
            </select>
          </div>
        )}
        <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium text-white disabled:opacity-50" style={{ background: '#e11d48' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
        </button>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 ml-1" title="Cerrar (Esc)"><X className="w-5 h-5" /></button>
      </div>

      {error ? (
        <div className="flex-1 grid place-items-center text-amber-400 text-sm">{error}</div>
      ) : !data ? (
        <div className="flex-1 grid place-items-center text-gray-500 dark:text-gray-400"><Loader2 className="w-7 h-7 animate-spin" /></div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* left: stations tray + equipment palette */}
          <div className="w-60 shrink-0 border-r border-white/10 bg-gray-900/60 flex flex-col">
            {showCommand && (
              <div className="border-b border-cyan-400/20 bg-cyan-400/[0.06] p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
                  <WandSparkles className="w-3.5 h-3.5" /> Copiloto CAD local
                </div>
                <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                  Interpreta comandos determinísticos hoy; mañana un modelo OpenAI-compatible puede llamar estas mismas acciones.
                </p>
                <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); interpretCommand(); }}>
                  <input
                    value={commandText}
                    onChange={(e) => setCommandText(e.target.value)}
                    placeholder="pasillo 1.2 entre SMT e inspección"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white placeholder:text-gray-600 outline-none focus:border-cyan-400/60"
                  />
                  <button type="submit" className="rounded-lg bg-cyan-500 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-cyan-400">Preview</button>
                </form>
                {commandPreview && (
                  <div className="mt-2 rounded-xl border border-white/10 bg-gray-950/70 p-2">
                    <div className="text-[11px] font-semibold text-white">{commandPreview.preview.summary}</div>
                    <div className="mt-1 text-[10.5px] text-gray-500 dark:text-gray-400">{commandPreview.preview.affectedObjectIds.length} objeto(s) · {commandPreview.preview.operations.length} operación(es)</div>
                    {commandPreview.preview.operations.slice(0, 3).map((op, idx) => (
                      <div key={`${op.type}-${idx}`} className="mt-1 rounded-md bg-white/[0.04] px-1.5 py-1 text-[10.5px] text-gray-300">
                        {op.type === 'report' ? (
                          <div>
                            <div className="font-semibold text-cyan-100">{op.title}</div>
                            {op.rows.slice(0, 3).map((row) => <div key={`${row.label}-${row.value}`} className="mt-0.5 flex justify-between gap-2 text-gray-500 dark:text-gray-400"><span className="truncate">{row.label}</span><span className="shrink-0 text-gray-200">{row.value}</span></div>)}
                          </div>
                        ) : op.type === 'move' ? `Mover ${op.objectId} → (${Math.round(op.after.x)}, ${Math.round(op.after.y)})` : op.type === 'connect' ? `Conectar ${op.from} → ${op.to}` : op.type === 'measure' ? `Medir ${Math.round(op.distance)} ${op.unit}` : op.type === 'focus' ? `Enfocar ${op.objectIds.length || 'todo'}` : ''}
                      </div>
                    ))}
                    {commandPreview.preview.issues.slice(0, 2).map((issue) => (
                      <div key={`${issue.code}-${issue.message}`} className={`mt-1 text-[10.5px] ${issue.level === 'error' ? 'text-rose-300' : issue.level === 'warning' ? 'text-amber-300' : 'text-cyan-200'}`}>{issue.message}</div>
                    ))}
                    <div className="mt-2 flex gap-1.5">
                      <button onClick={applyCommand} className="rounded-lg bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600">Aplicar</button>
                      <button onClick={() => setCommandPreview(null)} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10">Cancelar</button>
                      <button onClick={() => setCommandPreview(null)} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10">Editar</button>
                    </div>
                  </div>
                )}
                {commandAssistSuggestions.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-500">
                      <span>Sugerencias</span>
                      <span>{selList.length} sel</span>
                    </div>
                    {commandAssistSuggestions.map((hint) => (
                      <button key={hint.id} onClick={() => applyCommandSuggestion(hint)} title={hint.example} className={`w-full rounded-lg border px-2 py-1.5 text-left hover:bg-white/[0.08] ${hint.ready ? 'border-cyan-400/20 bg-cyan-400/[0.05]' : 'border-amber-400/20 bg-amber-400/[0.05]'}`}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] font-semibold text-gray-100">{hint.label}</span>
                          <span className={`shrink-0 text-[9.5px] uppercase tracking-wide ${hint.ready ? 'text-cyan-200' : 'text-amber-200'}`}>{hint.ready ? 'Preview' : 'Pendiente'}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[10.5px] text-gray-400">{hint.example}</span>
                        <span className={`mt-0.5 block truncate text-[10px] ${hint.ready ? 'text-cyan-200/70' : 'text-amber-200/80'}`}>{hint.reason}</span>
                      </button>
                    ))}
                  </div>
                )}
                {commandLog.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-500">
                      <span>Historial</span>
                      <span>{commandLog.length}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={undoLastCommand} disabled={!commandLog.some((c) => c.status === 'applied') || hist.undo === 0} className="flex-1 rounded-lg border border-white/10 px-2 py-1 text-[10.5px] text-gray-300 disabled:opacity-40 hover:bg-white/10">Deshacer cmd</button>
                      <button onClick={redoLastCommand} disabled={!commandLog.some((c) => c.status === 'undone') || hist.redo === 0} className="flex-1 rounded-lg border border-white/10 px-2 py-1 text-[10.5px] text-gray-300 disabled:opacity-40 hover:bg-white/10">Rehacer cmd</button>
                    </div>
                    {commandLog.slice(0, 3).map((item) => (
                      <div key={item.id} className="rounded-lg bg-white/[0.04] px-2 py-1 text-[10.5px] text-gray-300">
                        <span className={item.status === 'failed' ? 'text-rose-300' : item.status === 'applied' ? 'text-emerald-300' : 'text-cyan-200'}>{item.status}</span> · {item.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex shrink-0 text-[12px] font-medium border-b border-white/10">
              <button onClick={() => setTab('stations')} className={`flex-1 px-3 py-2 inline-flex items-center justify-center gap-1.5 ${tab === 'stations' ? 'text-white bg-white/[0.06]' : 'text-gray-500 dark:text-gray-400 hover:text-gray-200'}`}><MapPin className="w-3.5 h-3.5" /> Estaciones</button>
              <button onClick={() => setTab('equipment')} className={`flex-1 px-3 py-2 inline-flex items-center justify-center gap-1.5 ${tab === 'equipment' ? 'text-white bg-white/[0.06]' : 'text-gray-500 dark:text-gray-400 hover:text-gray-200'}`}><Boxes className="w-3.5 h-3.5" /> Equipo</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {tab === 'stations' ? (
                <>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Por colocar ({tray.length})</div>
                  {tray.length === 0 ? (
                    <p className="text-[12px] text-gray-500">Todas las estaciones están en el plano.</p>
                  ) : tray.map((st) => (
                    <button key={st.id} onClick={() => placeStation(st)} className="w-full text-left mb-1.5 px-2.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] transition-colors">
                      <div className="text-sm font-medium">{st.station}</div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">{st.line} · clic para colocar</div>
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <div className="mb-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] p-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-cyan-200"><Stamp className="h-3.5 w-3.5" /> Plantillas CAD</div>
                      <span className="text-[10px] text-cyan-100/60">{CAD_LAYOUT_TEMPLATES.length}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {CAD_LAYOUT_TEMPLATES.map((template) => (
                        <button key={template.id} onClick={() => applyCadTemplate(template.id)} title={template.description} className="rounded-lg bg-cyan-400/[0.08] px-2 py-1.5 text-left text-[11px] text-cyan-100 hover:bg-cyan-400/[0.14]">
                          <span className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{template.label}</span><span className="shrink-0 text-[10px] text-cyan-200/70">{template.assets.length} obj</span></span>
                          <span className="mt-0.5 block truncate text-[10px] text-cyan-200/70">{template.category} · {template.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mb-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-amber-200"><Rows3 className="h-3.5 w-3.5" /> Generador de racks</div>
                      <span className="text-[10px] text-amber-100/60">editable</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <DimInput label="Filas" value={rackGenerator.rows} onChange={(v) => setRackGeneratorField('rows', v)} />
                      <DimInput label="Bahias" value={rackGenerator.baysPerRow} onChange={(v) => setRackGeneratorField('baysPerRow', v)} />
                      <DimInput label="Bay mm" value={rackGenerator.bayWidth} onChange={(v) => setRackGeneratorField('bayWidth', v)} />
                      <DimInput label="Rack mm" value={rackGenerator.rackDepth} onChange={(v) => setRackGeneratorField('rackDepth', v)} />
                      <DimInput label="Pasillo" value={rackGenerator.aisleWidth} onChange={(v) => setRackGeneratorField('aisleWidth', v)} />
                      <label className="block">
                        <span className="block text-[9px] uppercase tracking-wide text-gray-500 mb-0.5">Prefijo</span>
                        <input value={rackGenerator.labelPrefix} onChange={(e) => setRackGeneratorField('labelPrefix', e.target.value)} className="w-full px-1.5 py-1 rounded-md bg-white/[0.06] border border-white/10 text-[12px] text-white focus:outline-none focus:border-amber-300/60" />
                      </label>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                      {(['horizontal', 'vertical'] as const).map((orientation) => (
                        <button key={orientation} onClick={() => setRackGeneratorField('orientation', orientation)} className={`rounded-lg border px-2 py-1.5 font-semibold ${rackGenerator.orientation === orientation ? 'border-amber-300/50 bg-amber-400/15 text-amber-100' : 'border-white/10 text-gray-400 hover:text-white'}`}>{orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}</button>
                      ))}
                    </div>
                    <button onClick={applyRackRowGenerator} className="mt-2 w-full rounded-lg bg-amber-500/90 px-2 py-1.5 text-[11px] font-semibold text-gray-950 hover:bg-amber-400">Generar racks editables</button>
                    <div className="mt-1.5 text-[10px] leading-snug text-amber-100/60">Crea racks, pasillos forklift y etiquetas en capas CAD existentes.</div>
                  </div>
                  <div className="mb-3 rounded-xl border border-rose-400/15 bg-rose-400/[0.05] p-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-rose-200 mb-1.5">Safety zones</div>
                    <p className="mb-2 text-[10.5px] leading-snug text-rose-100/70">Crea zonas y rutas editables en Safety. Validacion detecta bloqueos, invasiones y objetos sin clasificacion ESD.</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button onClick={() => createSafetyZoneAsset('no-go')} className="rounded-lg border border-rose-300/20 bg-rose-400/[0.10] px-2 py-1.5 text-left text-[11px] font-semibold text-rose-100 hover:bg-rose-400/[0.16]">No-go zone</button>
                      <button onClick={() => createSafetyZoneAsset('restricted')} className="rounded-lg border border-amber-300/20 bg-amber-400/[0.10] px-2 py-1.5 text-left text-[11px] font-semibold text-amber-100 hover:bg-amber-400/[0.16]">Restricted</button>
                      <button onClick={() => createSafetyZoneAsset('esd')} className="rounded-lg border border-cyan-300/20 bg-cyan-400/[0.10] px-2 py-1.5 text-left text-[11px] font-semibold text-cyan-100 hover:bg-cyan-400/[0.16]">ESD zone</button>
                      <button onClick={() => createSafetyPathAsset('forklift')} className="rounded-lg border border-emerald-300/20 bg-emerald-400/[0.10] px-2 py-1.5 text-left text-[11px] font-semibold text-emerald-100 hover:bg-emerald-400/[0.16]">Forklift path</button>
                      <button onClick={() => createSafetyPathAsset('emergency')} className="rounded-lg border border-sky-300/20 bg-sky-400/[0.10] px-2 py-1.5 text-left text-[11px] font-semibold text-sky-100 hover:bg-sky-400/[0.16]">Emergency exit</button>
                    </div>
                  </div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Biblioteca CAD industrial</div>
                    <span className="text-[10px] text-gray-500">{filteredSymbols.length}/{CAD_SYMBOL_LIBRARY.length}</span>
                  </div>
                  <input value={symbolSearch} onChange={(e) => setSymbolSearch(e.target.value)} placeholder="Buscar SMT, AOI, safety…" className="mb-2 w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white placeholder:text-gray-600 outline-none focus:border-cyan-400/60" />
                  <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
                    {symbolCategories.map((category) => (
                      <button key={category} onClick={() => setSymbolCategory(category)} className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] ${symbolCategory === category ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-100' : 'border-white/10 text-gray-500 dark:text-gray-400 hover:text-white'}`}>{category}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 mb-3">
                    {filteredSymbols.map((symbol) => (
                      <button key={symbol.id} onClick={() => addCadSymbol(symbol.id)} title={`Agregar ${symbol.label}`} className="rounded-lg bg-cyan-400/[0.08] px-2 py-1.5 text-left text-[11px] text-cyan-100 hover:bg-cyan-400/[0.14]">
                        <span className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{symbol.label}</span><span className="shrink-0 text-[10px] text-cyan-200/70">{Math.round(symbol.defaultWidth)}×{Math.round(symbol.defaultHeight)}</span></span>
                        <span className="mt-0.5 block truncate text-[10px] text-cyan-200/70">{symbol.category} · {symbol.layer} · {symbol.tags.join(', ')}</span>
                      </button>
                    ))}
                    {filteredSymbols.length === 0 && <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-3 text-center text-[11px] text-gray-500">Sin símbolos para ese filtro.</div>}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Agregar equipo</div>
                  {ASSET_CATEGORIES.map((cat) => (
                    <div key={cat.category} className="mb-3">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1"><ChevronRight className="w-3 h-3" /> {cat.label}</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {cat.items.map((it) => (
                          <button key={it.kind} onClick={() => addAsset(it.kind)} title={`Agregar ${it.label}`} className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.10] text-[12px] transition-colors">
                            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: it.color }} />
                            <span className="truncate">{it.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* 3D viewport */}
          <div className="relative flex-1 min-w-0">
            <div ref={mountRef} className="absolute inset-0" />
            {showHeat && (
              <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-xl bg-gray-900/80 backdrop-blur border border-white/10 text-[11px] text-gray-300 inline-flex items-center gap-2 pointer-events-none">
                <Grid2x2 className="w-3.5 h-3.5" /> Ocupación del piso
                <span className="inline-flex items-center gap-1">
                  menos
                  <span className="inline-block w-12 h-2 rounded-sm" style={{ background: 'linear-gradient(90deg, rgba(244,63,94,0.15), rgba(244,63,94,1))' }} />
                  más
                </span>
              </div>
            )}
            {showGaps && (
              <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-xl bg-gray-900/80 backdrop-blur border border-white/10 text-[11px] text-gray-300 inline-flex items-center gap-3 pointer-events-none" style={{ bottom: showHeat ? '3.25rem' : undefined }}>
                <ShieldAlert className="w-3.5 h-3.5" /> Holguras
                <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm" style={{ background: '#f59e0b' }} /> juntos</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm" style={{ background: '#ef4444' }} /> traslape</span>
              </div>
            )}
            {(dxfWarnings.length > 0 || dxfImportPreview) && (
              <div className="absolute right-3 top-16 z-20 w-80 rounded-2xl border border-amber-400/20 bg-gray-950/90 p-3 shadow-2xl backdrop-blur">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-amber-100"><CircleAlert className="h-4 w-4" />Import DXF</div>
                  <button onClick={() => { setDxfWarnings([]); setDxfImportPreview(null); }} className="rounded-md px-1.5 py-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:bg-white/10 hover:text-white">Ocultar</button>
                </div>
                {dxfImportPreview && dxfPrimitiveSummary && (
                  <div className="mb-2 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] p-2 text-[11px] text-cyan-100">
                    <div className="font-semibold">{dxfImportPreview.primitives.length} entidades soportadas · {dxfImportPreview.layers.length || 1} capa(s)</div>
                    <div className="mt-1 text-cyan-100/75">{Object.entries(dxfPrimitiveSummary).map(([kind, count]) => `${kind}: ${count}`).join(' · ')}</div>
                    <button onClick={convertDxfPrimitivesToEditable} className="mt-2 w-full rounded-lg bg-cyan-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-cyan-500">Convertir entidades soportadas</button>
                  </div>
                )}
                {dxfWarnings.length > 0 ? (
                  <>
                    <div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">Se cargó el plano; estas entidades se ignoraron o simplificaron localmente.</div>
                    <div className="max-h-44 space-y-1 overflow-y-auto">
                      {dxfWarningSummary.map((warning) => (
                        <div key={warning.key} className="rounded-lg bg-white/[0.04] px-2 py-1.5 text-[11px]">
                          <div className="flex items-center justify-between gap-2 text-amber-100"><span className="truncate">{warning.message}</span><span className="shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5">×{warning.count}</span></div>
                          <div className="mt-0.5 text-[10px] text-gray-500">{warning.entityType ?? warning.code}{warning.layer ? ` · capa ${warning.layer}` : ''}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div className="text-[11px] text-gray-500">Sin advertencias críticas en el escaneo local.</div>}
              </div>
            )}
            <div className="absolute bottom-3 right-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-gray-950/85 px-3 py-1.5 text-[11px] text-gray-300 shadow-xl backdrop-blur">
              <span className="text-cyan-200">Tool: {tool}</span>
              <span>{selList.length} sel</span>
              <span>{data?.footprint.unit ?? 'mm'}</span>
              <span>Layer {cadLayers.find((layer) => layer.id === activeCadLayer)?.label ?? activeCadLayer}</span>
              {cadLayerSummary.hiddenObjectCount > 0 && <span className="text-amber-300">Hidden layer objs {cadLayerSummary.hiddenObjectCount}</span>}
              {cadLayerSummary.lockedObjectCount > 0 && <span className="text-amber-300">Locked layer objs {cadLayerSummary.lockedObjectCount}</span>}
              <span>Grilla {layers.grid ? 'on' : 'off'} / Snap {snap ? 'grid' : 'free'} / {osnap ? 'obj' : 'obj off'}</span>
              <button onClick={openChecks} className={`${releaseTone} hover:text-white`}>Release {releaseState}</button>
              {report && <span className={report.score === 'error' ? 'text-rose-300' : report.score === 'warn' ? 'text-amber-300' : 'text-emerald-300'}>Validación {report.score}</span>}
              {cadValidationReport && <span className={cadValidationReport.severity === 'critical' ? 'text-rose-300' : cadValidationReport.severity === 'warning' ? 'text-amber-300' : 'text-emerald-300'}>CAD {cadValidationReport.severity}</span>}
              {flowHealth && <span className={flowHealth.score >= 80 ? 'text-emerald-300' : flowHealth.score >= 55 ? 'text-amber-300' : 'text-rose-300'}>Flow {flowHealth.score}</span>}
              {clearanceIssues.length > 0 && <span className="text-amber-300">Clearance {clearanceIssues.length}</span>}
              {safetyIssues.length > 0 && <span className="text-amber-300">Safety {safetyIssues.length}</span>}
              {validationHighlightIds.size > 0 && <button onClick={clearValidationHighlights} className="text-rose-300 hover:text-white">Highlights {validationHighlightIds.size}</button>}
              {dxfWarnings.length > 0 && <span className="text-amber-300">DXF {dxfWarnings.length}</span>}
              {localSnapshots.snapshots.length > 0 && <span>Snapshots {localSnapshots.snapshots.length}</span>}
            </div>
            {walk && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-emerald-700/95 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 pointer-events-none">
                <PersonStanding className="w-3.5 h-3.5" /> Recorrido · arrastra para mirar · WASD para caminar · Esc para salir
              </div>
            )}
            {!walk && (tool === 'measure' || tool === 'wall') && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-amber-400/95 text-gray-900 text-[12px] font-semibold inline-flex items-center gap-1.5 pointer-events-none">
                {tool === 'measure' ? <Ruler className="w-3.5 h-3.5" /> : <Spline className="w-3.5 h-3.5" />}
                {measureLive ? measureLive : (tool === 'measure' ? 'Clic en dos puntos para medir' : 'Clic para trazar muros · Esc termina')}
              </div>
            )}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-gray-900/80 backdrop-blur border border-white/10 text-[11px] text-gray-300 inline-flex items-center gap-2 pointer-events-none">
              <Move3d className="w-3.5 h-3.5" />
              {walk
                ? 'Arrastra para mirar · W A S D para caminar · Esc para salir del recorrido'
                : tool === 'measure'
                  ? 'Clic en dos puntos para medir · arrastra el fondo para orbitar · Esc cancela'
                  : tool === 'wall'
                    ? 'Clic en cada esquina para trazar muros · Shift = ángulos de 45° · arrastra el fondo para orbitar · Esc termina'
                    : 'Arrastra para mover · Shift+clic multiselecciona · fondo = orbitar · rueda = zoom · R rota · Supr borra'}
            </div>
            {showPalette && (
              <div className="absolute top-3 right-3 z-30 w-[22rem] rounded-2xl border border-cyan-400/20 bg-gray-950/95 p-3 shadow-2xl backdrop-blur">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2">
                  <Search className="h-4 w-4 text-cyan-200" />
                  <input autoFocus value={paletteQuery} onChange={(e) => setPaletteQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setShowPalette(false); setPaletteQuery(''); } }} placeholder="Buscar comando, herramienta o símbolo..." className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-gray-500 outline-none" />
                  <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-gray-500">Ctrl K</span>
                </div>
                {recentPaletteActions.length > 0 && !paletteQuery.trim() && (
                  <div className="mt-2 flex flex-wrap gap-1 border-b border-white/10 pb-2">
                    <span className="mr-1 self-center text-[10px] uppercase tracking-wide text-gray-500">Recientes</span>
                    {recentPaletteActions.map((key) => {
                      const [, id] = key.split(':');
                      return <span key={key} className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">{id}</span>;
                    })}
                  </div>
                )}
                <div className="mt-2 max-h-80 overflow-y-auto space-y-1">
                  {paletteResults.map((entry) => (
                    <button key={`${entry.kind}-${entry.id}`} onClick={() => runPaletteEntry(entry)} className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-white/[0.07]">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-white">{entry.label}</span>
                        <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">{entry.description}</span>
                      </span>
                      <span className="shrink-0 text-right"><span className="block rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">{entry.kind}</span>{entry.shortcut && <span className="mt-1 block text-[10px] text-gray-500">{entry.shortcut}</span>}</span>
                    </button>
                  ))}
                  {paletteResults.length === 0 && <div className="px-2 py-6 text-center text-[12px] text-gray-500">Sin resultados CAD.</div>}
                </div>
              </div>
            )}
            <div className="absolute top-3 left-3 z-20 rounded-2xl border border-white/10 bg-gray-900/85 p-1.5 shadow-2xl backdrop-blur">
              <div className="grid grid-cols-1 gap-1">
                {CAD_TOOLBAR_ACTIONS.map((action) => (
                  <button key={action.id} onClick={() => runToolbarAction(action.id)} title={`${action.label}${action.shortcut ? ` · ${action.shortcut}` : ''} — ${action.description}`} className={`h-7 min-w-9 rounded-lg px-2 text-[10.5px] font-semibold transition-colors ${tool === action.id || (action.id === 'select' && tool === 'select') ? 'bg-cyan-500 text-white' : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.12] hover:text-white'}`}>
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
            {overlay && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-gray-900/85 backdrop-blur border border-white/10 text-[11px] text-gray-200 flex items-center gap-3 pointer-events-none">
                <span className="font-medium">{OVERLAY_DEFS.find((o) => o.key === overlay)?.label}</span>
                {OVERLAY_DEFS.find((o) => o.key === overlay)?.legend.map((l) => (
                  <span key={l.label} className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: l.hex }} />{l.label}</span>
                ))}
              </div>
            )}
          </div>

          {/* right: properties */}
          <div className="w-64 shrink-0 border-l border-white/10 bg-gray-900/60 overflow-y-auto">
            {selList.length === 0 ? (
              <div className="p-4 text-[12px] text-gray-500 flex flex-col gap-3">
                <div className="flex flex-col items-center gap-2 pt-4">
                  <Crosshair className="w-6 h-6 text-gray-600" />
                  <p className="text-center">Selecciona objetos para ver y editar sus propiedades. <b>Shift</b>+clic agrega o quita.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-cyan-200"><Ruler className="h-3.5 w-3.5" /> Cotas guardadas</div>
                    <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-300">{dimCount}</span>
                  </div>
                  {measurementRowsView.length ? (
                    <div className="space-y-2">
                      {measurementRowsView.map((measurement) => (
                        <div key={measurement.id} className="rounded-lg border border-white/10 bg-gray-950/50 p-2">
                          <input value={measurement.label} onFocus={pushHistory} onChange={(e) => updateMeasurementText(measurement.id, e.target.value)} className="mb-1 w-full rounded-md bg-white/[0.05] px-2 py-1 text-[11px] text-white outline-none focus:ring-1 focus:ring-cyan-500/40" />
                          <div className="flex items-center justify-between gap-2 text-[10.5px] text-gray-500 dark:text-gray-400">
                            <span>{measurement.length}</span>
                            <div className="flex gap-1">
                              <button onClick={() => focusMeasurement(measurement.id)} className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-cyan-100 hover:bg-cyan-500/20">Ver</button>
                              <button onClick={() => deleteMeasurement(measurement.id)} className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-rose-200 hover:bg-rose-500/20">Borrar</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-gray-500">Selecciona dos objetos y usa “Cota entre objetos” para guardar distancias centro-a-centro o borde-a-borde. Las cotas exportan a DXF cuando la opción está activa.</p>
                  )}
                </div>
              </div>
            ) : selList.length > 1 || !selSnap ? (
              <div className="p-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <Boxes className="w-4 h-4" style={{ color: '#22d3ee' }} />
                  <span className="text-sm font-semibold">{selList.length} seleccionados</span>
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">Alinea, mide o mueve el grupo en bloque.</div>
                {selSummary && (
                  <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-cyan-200">Resumen CAD</span>
                      <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-300">{selSummary.stationCount} st · {selSummary.assetCount} eq</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <ReadField label="Bounds" value={`${Math.round(selSummary.bounds.width)} × ${Math.round(selSummary.bounds.height)}`} />
                      <ReadField label="Area" value={fmtArea(selSummary.area, 'mm')} />
                      <ReadField label="Capas" value={`${selSummary.layers.length}`} />
                      <ReadField label="Protegidos" value={`${selSummary.lockedCount}`} />
                    </div>
                    {selSummary.layers.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {selSummary.layers.slice(0, 3).map((layer) => (
                          <div key={layer.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-950/50 px-2 py-1 text-[10.5px] text-gray-300">
                            <span className={layer.visible ? 'truncate' : 'truncate text-gray-500'}>{layer.label}</span>
                            <span className={layer.locked ? 'text-amber-200' : 'text-gray-500'}>{layer.count} obj{layer.locked ? ' · lock' : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {selSummary.warnings.length > 0 && (
                      <div className="mt-2 rounded-lg border border-amber-300/15 bg-amber-400/[0.06] px-2 py-1 text-[10.5px] text-amber-100">{selSummary.warnings[0]}</div>
                    )}
                  </div>
                )}
                {selList.length === 2 && (
                  <div className="mb-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-2.5">
                    <div className="mb-2 text-[10px] uppercase tracking-wide text-cyan-200">Cota entre objetos</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button onClick={() => createSelectionMeasurement('direct')} className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]">Directa</button>
                      <button onClick={() => createSelectionMeasurement('horizontal')} className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]">Horizontal</button>
                      <button onClick={() => createSelectionMeasurement('vertical')} className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]">Vertical</button>
                      <button onClick={() => createSelectionMeasurement('edge-horizontal')} className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]">Borde H</button>
                      <button onClick={() => createSelectionMeasurement('edge-vertical')} className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]">Borde V</button>
                    </div>
                  </div>
                )}
                {selList.length === 2 && (
                  <div className="mb-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-2.5">
                    <div className="mb-2 text-[10px] uppercase tracking-wide text-amber-200">Pasillo / clearance</div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-300">
                      <span>Ancho</span>
                      <input type="number" min={100} value={aisleWidth} onChange={(e) => setAisleWidth(Number(e.target.value) || 1200)} className="w-20 rounded-md bg-white/[0.06] px-2 py-1 text-right outline-none" />
                      <button onClick={createAisleBetweenSelection} className="ml-auto rounded-lg bg-amber-500/20 px-2 py-1 text-amber-100 hover:bg-amber-500/30">Crear pasillo</button>
                    </div>
                  </div>
                )}
                <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">Alinear</div>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  <AlignBtn title="Alinear a la izquierda" onClick={() => alignSelected('left')}><AlignHorizontalJustifyStart className="w-4 h-4" /></AlignBtn>
                  <AlignBtn title="Centrar horizontal" onClick={() => alignSelected('cx')}><AlignHorizontalJustifyCenter className="w-4 h-4" /></AlignBtn>
                  <AlignBtn title="Alinear a la derecha" onClick={() => alignSelected('right')}><AlignHorizontalJustifyEnd className="w-4 h-4" /></AlignBtn>
                  <AlignBtn title="Alinear arriba" onClick={() => alignSelected('top')}><AlignVerticalJustifyStart className="w-4 h-4" /></AlignBtn>
                  <AlignBtn title="Centrar vertical" onClick={() => alignSelected('cy')}><AlignVerticalJustifyCenter className="w-4 h-4" /></AlignBtn>
                  <AlignBtn title="Alinear abajo" onClick={() => alignSelected('bottom')}><AlignVerticalJustifyEnd className="w-4 h-4" /></AlignBtn>
                </div>
                {selList.length >= 3 && (
                  <>
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">Distribuir (espaciado parejo)</div>
                    <div className="flex gap-1.5 mb-3">
                      <AlignBtn title="Distribuir horizontal" onClick={() => distributeSelected('h')}><AlignHorizontalDistributeCenter className="w-4 h-4" /></AlignBtn>
                      <AlignBtn title="Distribuir vertical" onClick={() => distributeSelected('v')}><AlignVerticalDistributeCenter className="w-4 h-4" /></AlignBtn>
                    </div>
                  </>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => rotateSelected(15)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"><RotateCw className="w-3.5 h-3.5" /> +15°</button>
                  <button onClick={() => rotateSelected(-15)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"><RotateCcw className="w-3.5 h-3.5" /> −15°</button>
                  <button onClick={duplicateSelected} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"><Copy className="w-3.5 h-3.5" /> Duplicar</button>
                  <button onClick={removeSelected} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-[12px]"><Trash2 className="w-3.5 h-3.5" /> Quitar</button>
                </div>
                <p className="text-[10.5px] text-gray-500 mt-3 leading-relaxed"><b>Shift</b>+clic agrega/quita · <b>Ctrl+A</b> todo · flechas mueven el grupo.</p>
              </div>
            ) : (
              <div className="p-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <Settings2 className="w-4 h-4" style={{ color: '#22d3ee' }} />
                  <span className="text-sm font-semibold">{selSnap.title}</span>
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">{selSnap.subtitle}</div>
                {selList[0] && isObjectLayerLocked(cadLayers, layerAssignments, selList[0].id, defaultLayerFor(selList[0])) && (
                  <div className="mb-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-200">Capa bloqueada: las propiedades, drag y comandos destructivos quedan protegidos.</div>
                )}

                {selList[0] && (
                  <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <ReadField label="Tipo" value={selSnap.type === 'station' ? 'Estación' : 'Equipo'} />
                      <ReadField label="ID" value={selSnap.id} />
                    </div>
                    {selSnap.type === 'asset' ? (
                      <label className="block text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="block mb-1">Nombre visible</span>
                        <input value={selSnap.title} onChange={(e) => updateSelectedAssetLabel(e.target.value)} placeholder="Nombre del equipo o zona" className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white placeholder:text-gray-600 outline-none" />
                      </label>
                    ) : (
                      <ReadField label="Nombre" value={selSnap.title} />
                    )}
                    <label className="block text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="block mb-1">Capa</span>
                      <select value={selectionLayer(selList[0])} onChange={(e) => setSelectionLayer(selList[0], e.target.value as CadLayerId)} className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white outline-none">
                        {cadLayers.map((layer) => <option key={layer.id} value={layer.id} className="text-gray-900">{layer.label}{layer.locked ? ' (lock)' : ''}</option>)}
                      </select>
                    </label>
                    <label className="block text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="block mb-1">Tags</span>
                      <input value={objectTags[selSnap.id] ?? ''} onChange={(e) => updateSelectedTags(e.target.value)} placeholder="esd, safety, smt…" className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white placeholder:text-gray-600 outline-none" />
                    </label>
                    <label className="block text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="block mb-1">Notas</span>
                      <textarea value={objectNotes[selSnap.id] ?? ''} onChange={(e) => updateSelectedNotes(e.target.value)} rows={2} placeholder="Owner, restriccion, pendiente..." className="w-full resize-none rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white placeholder:text-gray-600 outline-none" />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <ReadField label="Área" value={`${Math.round((selSnap.w * selSnap.h) / 1000).toLocaleString('es-MX')}k mm²`} />
                      <ReadField label="Footprint" value={`${Math.round(selSnap.w)} × ${Math.round(selSnap.h)}`} />
                    </div>
                    {selectedObjectProperties && (
                      <div className="rounded-lg border border-white/10 bg-gray-950/45 p-2">
                        <div className="mb-2 text-[10px] uppercase tracking-wide text-gray-500">Metadata CAD</div>
                        <div className="grid grid-cols-2 gap-2">
                          <ReadField label="Centro" value={`${Math.round(selectedObjectProperties.center.x)}, ${Math.round(selectedObjectProperties.center.y)}`} />
                          <ReadField label="Origen" value={selectedObjectProperties.source.source === 'dxf' ? 'DXF editable' : selectedObjectProperties.source.source === 'generated' ? 'Generado' : 'Manual'} />
                          {selectedObjectProperties.source.dxfLayer && <ReadField label="DXF layer" value={selectedObjectProperties.source.dxfLayer} />}
                          <ReadField label="Safety" value={selectedObjectProperties.safetyClassification} />
                        </div>
                        {selectedObjectProperties.warnings.length > 0 && (
                          <div className="mt-2 rounded-md border border-amber-300/15 bg-amber-400/[0.06] px-2 py-1 text-[10.5px] text-amber-100">{selectedObjectProperties.warnings[0]}</div>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      <button onClick={assignSelectedToActiveLayer} className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[10.5px] text-gray-200 hover:bg-white/[0.12]">Capa activa</button>
                      <button onClick={centerSelectedInFootprint} className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[10.5px] text-gray-200 hover:bg-white/[0.12]">Centrar</button>
                      <button onClick={resetSelectedRotation} className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[10.5px] text-gray-200 hover:bg-white/[0.12]">Rot. 0°</button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <NumField label="X" value={Math.round(selSnap.x)} onBegin={pushHistory} onChange={(v) => setField('x', v)} />
                  <NumField label="Y" value={Math.round(selSnap.y)} onBegin={pushHistory} onChange={(v) => setField('y', v)} />
                  <NumField label="Ancho" value={Math.round(selSnap.w)} onBegin={pushHistory} onChange={(v) => setField('w', v)} />
                  <NumField label="Largo" value={Math.round(selSnap.h)} onBegin={pushHistory} onChange={(v) => setField('h', v)} />
                  <NumField label="Rotación°" value={Math.round(selSnap.rotation)} onBegin={pushHistory} onChange={(v) => setField('rotation', v)} />
                  {selSnap.height !== undefined && <ReadField label="Alto" value={`${selSnap.height}`} />}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => rotateSelected(15)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"><RotateCw className="w-3.5 h-3.5" /> +15°</button>
                  <button onClick={() => rotateSelected(-15)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"><RotateCcw className="w-3.5 h-3.5" /> −15°</button>
                  {selSnap.canDuplicate && <button onClick={duplicateSelected} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"><Copy className="w-3.5 h-3.5" /> Duplicar</button>}
                  <button onClick={removeSelected} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-[12px]"><Trash2 className="w-3.5 h-3.5" /> Quitar</button>
                </div>

                {selSnap.canDuplicate && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <div className="text-[10.5px] uppercase tracking-wide text-gray-500">Copiar equipo</div>
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <span className="text-gray-500 dark:text-gray-400 w-12 shrink-0">Arreglo</span>
                      <input type="number" min={1} max={50} value={arr.cols} onChange={(e) => setArr((a) => ({ ...a, cols: Number(e.target.value) }))} className="w-11 bg-white/[0.06] rounded px-1 py-0.5 text-center tabular-nums outline-none focus:ring-1 ring-cyan-500/40" title="columnas" />
                      <span className="text-gray-500">×</span>
                      <input type="number" min={1} max={50} value={arr.rows} onChange={(e) => setArr((a) => ({ ...a, rows: Number(e.target.value) }))} className="w-11 bg-white/[0.06] rounded px-1 py-0.5 text-center tabular-nums outline-none focus:ring-1 ring-cyan-500/40" title="filas" />
                      <span className="text-gray-500">sep</span>
                      <input type="number" min={0} value={arr.gap} onChange={(e) => setArr((a) => ({ ...a, gap: Number(e.target.value) }))} className="w-14 bg-white/[0.06] rounded px-1 py-0.5 text-center tabular-nums outline-none focus:ring-1 ring-cyan-500/40" title="separación" />
                      <button onClick={() => arrayAssets(arr.cols, arr.rows, arr.gap)} className="ml-auto px-2 py-0.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium">Crear</button>
                    </div>
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <span className="text-gray-500 dark:text-gray-400 w-12 shrink-0">Espejo</span>
                      <button onClick={() => mirrorAssets('h')} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12]"><FlipHorizontal className="w-3.5 h-3.5" /> Horizontal</button>
                      <button onClick={() => mirrorAssets('v')} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12]"><FlipVertical className="w-3.5 h-3.5" /> Vertical</button>
                    </div>
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <span className="text-gray-500 dark:text-gray-400 w-12 shrink-0">Desfasar</span>
                      <span className="text-gray-500">dx</span>
                      <input type="number" value={arr.dx} onChange={(e) => setArr((a) => ({ ...a, dx: Number(e.target.value) }))} className="w-14 bg-white/[0.06] rounded px-1 py-0.5 text-center tabular-nums outline-none focus:ring-1 ring-cyan-500/40" />
                      <span className="text-gray-500">dy</span>
                      <input type="number" value={arr.dy} onChange={(e) => setArr((a) => ({ ...a, dy: Number(e.target.value) }))} className="w-14 bg-white/[0.06] rounded px-1 py-0.5 text-center tabular-nums outline-none focus:ring-1 ring-cyan-500/40" />
                      <button onClick={() => offsetAssets(arr.dx, arr.dy)} className="ml-auto px-2 py-0.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium">Crear</button>
                    </div>
                  </div>
                )}

                <p className="text-[10.5px] text-gray-500 mt-3 leading-relaxed">
                  Unidades en {data.footprint.unit}. Usa las flechas para ajustar y <b>R</b> para rotar.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quantities / take-off panel */}
      {takeoff && (
        <div className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={() => setTakeoff(null)}>
          <div className="w-[420px] max-w-full max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <ClipboardList className="w-4 h-4" style={{ color: '#22d3ee' }} />
              <span className="text-sm font-semibold">Cantidades · {model} · {revision}</span>
              <div className="flex-1" />
              <button onClick={() => setTakeoff(null)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Stat label="Estaciones" value={`${takeoff.placedStations}/${takeoff.totalStations}`} />
                <Stat label="Equipos" value={`${takeoff.equipmentCount}`} />
                <Stat label="Área huella" value={fmtArea(takeoff.footprintArea, takeoff.unit)} />
                <Stat label="Aprovechamiento" value={`${takeoff.util.toFixed(1)} %`} highlight />
                <Stat label="Área usada" value={fmtArea(takeoff.usedArea, takeoff.unit)} />
                <Stat label="Muro total" value={fmtLen(takeoff.wallLen, takeoff.unit)} />
                {takeoff.flowCount > 0 && <Stat label="Flujo total" value={fmtLen(takeoff.flowLen, takeoff.unit)} />}
                {takeoff.flowCount > 0 && <Stat label="Tramo más largo" value={fmtLen(takeoff.flowMaxHop, takeoff.unit)} />}
              </div>
              {takeoff.byKind.length > 0 ? (
                <div className="rounded-xl border border-white/10 overflow-hidden">
                  <table className="w-full text-[12.5px]">
                    <thead><tr className="text-gray-500 dark:text-gray-400 bg-white/[0.04]"><th className="text-left font-medium px-3 py-1.5">Equipo</th><th className="text-right font-medium px-3 py-1.5">Cant.</th><th className="text-right font-medium px-3 py-1.5">Área</th></tr></thead>
                    <tbody>
                      {takeoff.byKind.map((r) => (
                        <tr key={r.kind} className="border-t border-white/[0.06]">
                          <td className="px-3 py-1.5">{r.label}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.count}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400">{fmtArea(r.area, takeoff.unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[12px] text-gray-500 text-center py-3">Aún no hay equipo en el layout.</p>
              )}
              {takeoff.byLayer.length > 0 && (
                <div className="mt-3 rounded-xl border border-white/10 overflow-hidden">
                  <div className="bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Uso por capa CAD</div>
                  <table className="w-full text-[12.5px]">
                    <tbody>
                      {takeoff.byLayer.map((r) => (
                        <tr key={r.id} className="border-t border-white/[0.06]">
                          <td className="px-3 py-1.5">{r.label}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.count}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400">{fmtArea(r.area, takeoff.unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex items-center justify-between mt-3">
                <span className="text-[11px] text-gray-500">{takeoff.dimCount} {takeoff.dimCount === 1 ? 'cota' : 'cotas'}</span>
                <button
                  onClick={() => {
                    const rows = [['Concepto', 'Cantidad', 'Área (m²)']];
                    takeoff.byKind.forEach((r) => rows.push([r.label, String(r.count), fmtArea(r.area, takeoff.unit).replace(' m²', '')]));
                    rows.push(['--- Capas CAD ---', '', '']);
                    takeoff.byLayer.forEach((r) => rows.push([`Capa: ${r.label}`, String(r.count), fmtArea(r.area, takeoff.unit).replace(' m²', '')]));
                    rows.push(['Estaciones colocadas', `${takeoff.placedStations}/${takeoff.totalStations}`, fmtArea(takeoff.stationArea, takeoff.unit).replace(' m²', '')]);
                    rows.push(['Aprovechamiento', `${takeoff.util.toFixed(1)}%`, '']);
                    rows.push(['Muro total', fmtLen(takeoff.wallLen, takeoff.unit), '']);
                    if (takeoff.flowCount > 0) {
                      rows.push(['Flujo total', fmtLen(takeoff.flowLen, takeoff.unit), '']);
                      rows.push(['Tramo más largo', fmtLen(takeoff.flowMaxHop, takeoff.unit), '']);
                    }
                    const csv = rows.map((r) => r.join(',')).join('\n');
                    navigator.clipboard?.writeText(csv).then(() => toast.success('Cantidades copiadas (CSV).', '3D'), () => toast.error('No se pudo copiar.', '3D'));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {showDxfExport && (
        <div className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={() => setShowDxfExport(false)}>
          <div className="max-h-[82vh] w-[520px] max-w-full overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <FileDown className="h-4 w-4 text-cyan-300" />
              <span className="text-sm font-semibold">Exportar DXF</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${dxfExportSummary.canExport ? 'bg-emerald-400/10 text-emerald-200' : 'bg-rose-400/10 text-rose-200'}`}>{dxfExportSummary.canExport ? 'Listo' : 'Bloqueado'}</span>
              <div className="flex-1" />
              <button onClick={() => setShowDxfExport(false)} className="rounded-lg p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 p-4 text-[12px]">
              <label className="block text-gray-500 dark:text-gray-400">Nombre de archivo
                <input value={dxfExportOptions.fileName} onChange={(e) => setDxfOption({ fileName: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-gray-950/70 px-2.5 py-2 text-white outline-none" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="rounded-lg bg-white/[0.04] p-2 text-gray-300"><span className="mb-1 block text-gray-500">Scope</span><select value={dxfExportOptions.scope} onChange={(e) => setDxfOption({ scope: e.target.value as DxfExportOptions['scope'] })} className="w-full bg-transparent text-white outline-none"><option className="text-gray-900" value="all">Todo</option><option className="text-gray-900" value="selection">Selección</option></select></label>
                <label className="rounded-lg bg-white/[0.04] p-2 text-gray-300"><span className="mb-1 block text-gray-500">Unidades</span><select value={dxfExportOptions.units} onChange={(e) => setDxfOption({ units: e.target.value as DxfExportOptions['units'] })} className="w-full bg-transparent text-white outline-none"><option className="text-gray-900" value="mm">mm</option><option className="text-gray-900" value="m">m</option></select></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([['includeHidden', 'Incluir capas ocultas'], ['includeMeasurements', 'Incluir cotas'], ['includeLabels', 'Incluir notas']] as const).map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5 text-gray-300"><input type="checkbox" checked={dxfExportOptions[key]} onChange={(e) => setDxfOption({ [key]: e.target.checked })} className="accent-cyan-500" />{label}</label>
                ))}
              </div>
              <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">Resumen</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300"><span>Objetos</span><b className="text-right">{dxfExportSummary.objects}</b><span>Conectores</span><b className="text-right">{dxfExportSummary.connectors}</b><span>Cotas</span><b className="text-right">{dxfExportSummary.measurements}</b><span>Notas</span><b className="text-right">{dxfExportSummary.labels}</b><span>Layers</span><b className="text-right">{dxfExportSummary.layers}</b></div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200">Paquete de capas</div>
                  <span className="text-[10.5px] text-gray-500">{dxfExportSummary.includedLayers.join(' Â· ') || 'Sin layers'}</span>
                </div>
                {dxfExportLayerRows.length ? (
                  <div className="space-y-1">
                    {dxfExportLayerRows.map((layer) => (
                      <div key={layer.layer} className="flex items-center justify-between gap-2 rounded-lg bg-gray-950/50 px-2 py-1.5 text-[11px]">
                        <span className="truncate text-gray-300">{layer.layer}</span>
                        <span className="shrink-0 text-gray-500">{layer.included}/{layer.total} incl.{layer.hidden ? ` Â· ${layer.hidden} ocultas` : ''}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg bg-gray-950/50 px-2 py-1.5 text-[11px] text-gray-500">No hay entidades exportables con estas opciones.</div>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">Preflight</div>
                {dxfExportIssueRows.length ? (
                  <div className="space-y-1">
                    {dxfExportIssueRows.map((issue) => (
                      <div key={issue.code} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] ${issue.level === 'blocker' ? 'bg-rose-400/10 text-rose-100' : issue.level === 'warning' ? 'bg-amber-400/10 text-amber-100' : 'bg-white/[0.04] text-gray-300'}`}>
                        {issue.level === 'blocker' ? <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : issue.level === 'warning' ? <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                        <span className="min-w-0 flex-1">{issue.message}{issue.count ? ` (${issue.count})` : ''}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-400/10 px-2 py-1.5 text-[11px] text-emerald-100"><CircleCheck className="h-3.5 w-3.5" />DXF listo para descargar.</div>
                )}
              </div>
              <button disabled={!dxfExportSummary.canExport} onClick={() => exportDxf(dxfExportOptions)} className={`w-full rounded-lg px-3 py-2 text-[12px] font-semibold text-white ${dxfExportSummary.canExport ? 'bg-cyan-600 hover:bg-cyan-500' : 'cursor-not-allowed bg-gray-700 text-gray-500 dark:text-gray-400'}`}>Descargar DXF</button>
            </div>
          </div>
        </div>
      )}

      {flowHealth && (
        <div className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={() => setFlowHealth(null)}>
          <div className="w-[420px] max-w-full max-h-[86vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <ChartLine className="h-4 w-4 text-cyan-300" />
              <span className="text-sm font-semibold">Flow Health</span>
              <div className="flex-1" />
              <button onClick={() => setFlowHealth(null)} className="rounded-lg p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 p-4 text-[12px]">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Score" value={`${flowHealth.score}/100`} highlight />
                <Stat label="Distancia total" value={fmtLen(flowHealth.totalDistance, data?.footprint.unit || 'mm')} />
                <Stat label="Cruces" value={`${flowHealth.crossingCount}`} />
                <Stat label="Backtracking" value={`${flowHealth.backtrackingCount}`} />
              </div>
              {flowSequence.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200">Secuencia de flujo</div>
                    <button onClick={selectFlowSequence} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10">Seleccionar ruta</button>
                  </div>
                  <div className="max-h-32 space-y-1 overflow-y-auto">
                    {flowSequence.map((node, idx) => (
                      <button key={node.id} onClick={() => selectFlowNode(node.id)} className="flex w-full items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1 text-left hover:bg-white/[0.09]">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cyan-400/15 text-[10px] font-semibold text-cyan-100">{idx + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-gray-200">{node.label ?? node.id}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-[10.5px] text-gray-500">{flowSegments.length} tramo(s) · clic en una estación para ubicarla.</div>
                </div>
              )}
              {flowSegmentRows.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">Tramos críticos por distancia</div>
                  <div className="space-y-1">
                    {flowSegmentRows.map((segment, idx) => (
                      <button key={`${segment.from.id}-${segment.to.id}`} onClick={() => selectFlowSegment(segment)} className="flex w-full items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5 text-left hover:bg-white/[0.09]">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-400/15 text-[10px] font-semibold text-amber-100">{idx + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-gray-200">{segment.from.label ?? segment.from.id} → {segment.to.label ?? segment.to.id}</span>
                        <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">{fmtLen(segment.distance, data?.footprint.unit || 'mm')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {flowReorderPreview?.improves && (
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-100">Vista previa de mejora</div>
                      <div className="text-[11px] text-cyan-50/80">Reordenar slots en eje {flowReorderPreview.axis.toUpperCase()} sin cambiar la secuencia de proceso.</div>
                    </div>
                    <button onClick={applyFlowReorderPreview} className="shrink-0 rounded-lg bg-cyan-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500">Aplicar</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-gray-950/40 px-2 py-1.5">
                      <div className="text-gray-400">Score</div>
                      <div className="tabular-nums text-white">{flowReorderPreview.before.score} -&gt; {flowReorderPreview.after.score} <span className="text-emerald-300">+{flowReorderPreview.deltas.score}</span></div>
                    </div>
                    <div className="rounded-lg bg-gray-950/40 px-2 py-1.5">
                      <div className="text-gray-400">Distancia</div>
                      <div className="tabular-nums text-white">{flowReorderPreview.deltas.totalDistance >= 0 ? '-' : '+'}{fmtLen(Math.abs(flowReorderPreview.deltas.totalDistance), data?.footprint.unit || 'mm')}</div>
                    </div>
                    <div className="rounded-lg bg-gray-950/40 px-2 py-1.5">
                      <div className="text-gray-400">Cruces</div>
                      <div className="tabular-nums text-white">{flowReorderPreview.before.crossingCount} -&gt; {flowReorderPreview.after.crossingCount}</div>
                    </div>
                    <div className="rounded-lg bg-gray-950/40 px-2 py-1.5">
                      <div className="text-gray-400">Backtracking</div>
                      <div className="tabular-nums text-white">{flowReorderPreview.before.backtrackingCount} -&gt; {flowReorderPreview.after.backtrackingCount}</div>
                    </div>
                  </div>
                  {flowReorderMoveRows.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {flowReorderMoveRows.map((move) => (
                        <div key={move.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-950/40 px-2 py-1 text-[11px]">
                          <span className="min-w-0 flex-1 truncate text-cyan-50">{move.label ?? move.id}</span>
                          <span className="shrink-0 tabular-nums text-gray-400">{Math.round(move.to.x)}, {Math.round(move.to.y)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {flowHealth.suggestions.length ? (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-amber-100">
                  <div className="mb-1 font-semibold">Recomendaciones</div>
                  <ul className="list-disc space-y-1 pl-4">{flowHealth.suggestions.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              ) : <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-emerald-100">Flujo sano: sin cruces ni backtracking detectado.</div>}
              <button onClick={() => { setShowCommand(true); setCommandText('acomoda la línea de izquierda a derecha'); setFlowHealth(null); }} className="w-full rounded-lg bg-cyan-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-cyan-500">Preparar comando arrange_line con preview</button>
            </div>
          </div>
        </div>
      )}

      {/* Design-check / validation report */}
      {report && (
        <div className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={() => setReport(null)}>
          <div className="w-[440px] max-w-full max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <ShieldCheck className="w-4 h-4" style={{ color: report.score === 'ok' ? '#34d399' : report.score === 'warn' ? '#fbbf24' : '#f87171' }} />
              <span className="text-sm font-semibold">Revisión de diseño · {model} · {revision}</span>
              <div className="flex-1" />
              {validationHighlightIds.size > 0 && <button onClick={clearValidationHighlights} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10">Ocultar highlights</button>}
              <button onClick={() => setReport(null)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-2">
              <div className="text-[12.5px] mb-1">
                {report.score === 'ok'
                  ? <span className="text-emerald-400">Sin problemas detectados.</span>
                  : <span className={report.score === 'error' ? 'text-rose-400' : 'text-amber-400'}>{report.errors} {report.errors === 1 ? 'error' : 'errores'} · {report.warnings} {report.warnings === 1 ? 'aviso' : 'avisos'}</span>}
              </div>
              <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-500">Release readiness</div>
                    <div className={`text-sm font-semibold ${releaseTone}`}>{releaseState}</div>
                  </div>
                  <div className="text-right text-[11px] text-gray-500 dark:text-gray-400">
                    <div>{releaseBlockers} bloqueos</div>
                    <div>{releaseWarnings} avisos</div>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  {releaseChecks.map((check) => (
                    <div key={check.label} className="flex items-center justify-between gap-2 rounded-lg bg-gray-950/50 px-2 py-1.5 text-[11.5px]">
                      <span className="text-gray-300">{check.label}</span>
                      <span className={check.tone}>{check.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              {cadValidationReport && (
                <div className="mb-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-[12px] font-semibold text-cyan-100">
                    <span>CAD validation center</span>
                    <span className={cadValidationReport.severity === 'critical' ? 'text-rose-300' : cadValidationReport.severity === 'warning' ? 'text-amber-300' : 'text-emerald-300'}>{cadValidationReport.severity}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11.5px]">
                    <div className="rounded-lg bg-gray-950/50 px-2 py-1.5"><span className="text-gray-500">Collisions</span><b className="ml-2 tabular-nums text-white">{cadValidationReport.collisions.length}</b></div>
                    <div className="rounded-lg bg-gray-950/50 px-2 py-1.5"><span className="text-gray-500">Clearance</span><b className="ml-2 tabular-nums text-white">{cadValidationReport.clearances.length}</b></div>
                    <div className="rounded-lg bg-gray-950/50 px-2 py-1.5"><span className="text-gray-500">Safety</span><b className="ml-2 tabular-nums text-white">{cadValidationReport.safety.length}</b></div>
                    <div className="rounded-lg bg-gray-950/50 px-2 py-1.5"><span className="text-gray-500">Flow</span><b className="ml-2 tabular-nums text-white">{cadValidationReport.flow ? `${cadValidationReport.flow.score}/100` : 'n/a'}</b></div>
                  </div>
                  {cadValidationReport.issues.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {cadValidationReport.issues.slice(0, 4).map((issue) => (
                        <button
                          key={issue.id}
                          onClick={() => selectValidationIssue(issue)}
                          className={`w-full rounded-lg border px-2 py-1.5 text-left text-[11.5px] transition ${issue.severity === 'critical' ? 'border-rose-400/20 bg-rose-400/10 hover:bg-rose-400/15' : 'border-amber-400/20 bg-amber-400/10 hover:bg-amber-400/15'}`}
                        >
                          <span
                            className={issue.severity === 'critical' ? 'block font-medium text-rose-100' : 'block font-medium text-amber-100'}
                          >
                            {issue.title}
                          </span>
                          <span className="block text-gray-300">{issue.suggestedFix}</span>
                          <span className="block pt-0.5 text-[10.5px] text-gray-500">{issue.actionLabel}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {collisionHits.length > 0 && (
                <div className="mb-3 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-[12px] font-semibold text-rose-100">
                    <span>Colisiones detectadas · {collisionHits.length}</span>
                    <button onClick={() => setCollisionHits([])} className="text-[11px] text-rose-200/70 hover:text-white">Ocultar</button>
                  </div>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {collisionHits.slice(0, 8).map((hit) => (
                      <button key={`${hit.aId}-${hit.bId}`} onClick={() => selectCollisionPair(hit)} className="w-full rounded-lg bg-white/[0.05] px-2 py-1.5 text-left text-[11.5px] hover:bg-white/[0.1]">
                        <span className="block text-rose-100">{hit.aLabel} ↔ {hit.bLabel}</span>
                        <span className="text-gray-500 dark:text-gray-400">Área aprox. {Math.round(hit.area).toLocaleString('es-MX')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {clearanceIssues.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-[12px] font-semibold text-amber-100">
                    <span>Clearance warnings - {clearanceIssues.length}</span>
                    <button onClick={() => setClearanceIssues([])} className="text-[11px] text-amber-200/70 hover:text-white">Ocultar</button>
                  </div>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {clearanceIssues.slice(0, 8).map((issue) => (
                      <button key={`${issue.aId}-${issue.bId}`} onClick={() => selectClearanceIssue(issue)} className="w-full rounded-lg bg-white/[0.05] px-2 py-1.5 text-left text-[11.5px] hover:bg-white/[0.1]">
                        <span className="block text-amber-100">{issue.message}</span>
                        <span className="text-gray-500 dark:text-gray-400">Actual {fmtLen(issue.distance, data?.footprint.unit || 'mm')} - minimo {fmtLen(issue.required, data?.footprint.unit || 'mm')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {safetyIssues.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-[12px] font-semibold text-amber-100">
                    <span>Safety issues - {safetyIssues.length}</span>
                    <button onClick={() => setSafetyIssues([])} className="text-[11px] text-amber-200/70 hover:text-white">Ocultar</button>
                  </div>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {safetyIssues.slice(0, 8).map((issue) => (
                      <button key={`${issue.zoneId}-${issue.objectId}-${issue.code}`} onClick={() => selectSafetyIssue(issue)} className="w-full rounded-lg bg-white/[0.05] px-2 py-1.5 text-left text-[11.5px] hover:bg-white/[0.1]">
                        <span className="block text-amber-100">{issue.message}</span>
                        <span className="text-gray-500 dark:text-gray-400">Seleccionar objeto + zona/ruta</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {report.items.map((it) => {
                const Icon = it.level === 'ok' ? CircleCheck : it.level === 'warn' ? CircleAlert : ShieldAlert;
                const color = it.level === 'ok' ? '#34d399' : it.level === 'warn' ? '#fbbf24' : '#f87171';
                return (
                  <div key={it.key} className="flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                    <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">{it.label}{it.count > 0 ? ` · ${it.count}` : ''}</div>
                      <div className="text-[11.5px] text-gray-500 dark:text-gray-400 leading-snug">{it.detail}</div>
                    </div>
                  </div>
                );
              })}
              <p className="text-[10.5px] text-gray-500 pt-1 leading-relaxed">Traslapes y límites se evalúan sobre la caja sin rotación (aproximado).</p>
            </div>
          </div>
        </div>
      )}

      {/* Versions / scenarios modal (unify) */}
      {showVersions && (
        <div className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={() => setShowVersions(false)}>
          <div className="w-[460px] max-w-full max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <History className="w-4 h-4" style={{ color: '#22d3ee' }} />
              <span className="text-sm font-semibold">Versiones · {model} · {revision}</span>
              <div className="flex-1" />
              <button onClick={() => setShowVersions(false)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <input value={versName} onChange={(e) => setVersName(e.target.value)} placeholder="Nombre de la versión/snapshot (opcional)" className="flex-1 bg-white/[0.06] rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:ring-1 ring-cyan-500/40" />
                <button onClick={saveVersion} disabled={versBusy} className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[12px] font-medium disabled:opacity-50">Guardar versión</button>
                <button onClick={() => saveLocalSnapshot('manual')} className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white text-[12px] font-medium">Snapshot local</button>
              </div>
              <div className="mb-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200">Snapshots locales de sesión</div>
                  <span className="text-[10px] text-gray-500">{localSnapshots.snapshots.length}/20</span>
                </div>
                {snapshotDiff && (
                  <div className={`mb-2 rounded-lg px-2 py-1.5 text-[11px] ${snapshotDiff.changed ? 'bg-amber-400/10 text-amber-100' : 'bg-emerald-400/10 text-emerald-100'}`}>
                    Comparación: {snapshotDiff.changed ? 'hay cambios vs snapshot' : 'sin cambios'} · {snapshotDiff.beforeHash} → {snapshotDiff.afterHash}
                  </div>
                )}
                {localSnapshots.snapshots.length === 0 ? (
                  <p className="text-[11.5px] text-gray-500">Guarda puntos de restauración rápidos antes de importar, acomodar o probar comandos. No salen del navegador.</p>
                ) : (
                  <div className="space-y-1.5">
                    {[...localSnapshots.snapshots].reverse().map((snap) => (
                      <div key={snap.id} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-medium text-gray-100">{snap.label}</div>
                          <div className="text-[10.5px] text-gray-500">{new Date(snap.createdAt).toLocaleString('es-MX')} · {snap.reason}</div>
                        </div>
                        <button onClick={() => compareLocalSnapshot(snap.id)} className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-gray-200 hover:bg-white/[0.12]">Comparar</button>
                        <button onClick={() => restoreLocalSnapshot(snap.id)} className="rounded-md bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/25">Restaurar</button>
                        <button onClick={() => deleteLocalSnapshot(snap.id)} className="rounded-md px-1.5 py-1 text-rose-300 hover:bg-rose-500/20"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {versions.length === 0 ? (
                <p className="text-[12px] text-gray-500 text-center py-4">Aún no hay versiones guardadas.</p>
              ) : (
                <div className="space-y-1.5">
                  {versions.map((v) => (
                    <div key={v.id} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate">{v.name || 'Sin nombre'}</div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">{new Date(v.createdAt).toLocaleString('es-MX')} · {v.stationCount} est · {v.assetCount} eq</div>
                      </div>
                      <button onClick={() => restoreVersion(v.id)} disabled={versBusy} className="px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px] disabled:opacity-50">Restaurar</button>
                      <button onClick={() => deleteVersion(v.id)} className="p-1 rounded-md text-rose-300 hover:bg-rose-500/20"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clone-from-template modal (unify) */}
      {showClone && (
        <div className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={() => setShowClone(false)}>
          <div className="w-[420px] max-w-full rounded-2xl border border-white/10 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <Copy className="w-4 h-4" style={{ color: '#22d3ee' }} />
              <span className="text-sm font-semibold">Clonar desde plantilla</span>
              <div className="flex-1" />
              <button onClick={() => setShowClone(false)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4">
              <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-3">Copia el layout (estaciones, equipo, conexiones, celdas y plano) de otro modelo a <b className="text-gray-200">{model} · {revision}</b>. Reemplaza el actual.</p>
              <select value={cloneSrc} onChange={(e) => setCloneSrc(e.target.value)} className="w-full bg-white/[0.06] rounded-lg px-2.5 py-2 text-[13px] outline-none mb-3 focus:ring-1 ring-cyan-500/40">
                <option value="" className="text-gray-900">Elige un modelo origen…</option>
                {models.filter((m) => !(m.model === model && m.revision === revision)).map((m) => (
                  <option key={`${m.model}|${m.revision}`} value={`${m.model}|${m.revision}`} className="text-gray-900">{m.model} · {m.revision}</option>
                ))}
              </select>
              <button onClick={cloneFrom} disabled={!cloneSrc || cloneBusy} className="w-full px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[12px] font-medium disabled:opacity-50">{cloneBusy ? 'Clonando…' : 'Clonar layout'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Cells / zones modal (unify) */}
      {showCells && (
        <div className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={() => setShowCells(false)}>
          <div className="w-[440px] max-w-full max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <Group className="w-4 h-4" style={{ color: '#22d3ee' }} />
              <span className="text-sm font-semibold">Celdas / zonas · {model} · {revision}</span>
              <div className="flex-1" />
              <button onClick={() => setShowCells(false)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4">
              <button onClick={createCellFromSelection} className="w-full mb-3 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[12px] font-medium">Crear celda con la selección</button>
              {cellsView.length === 0 ? (
                <p className="text-[12px] text-gray-500 text-center py-3">Selecciona estaciones (Shift+clic) y crea una celda para agruparlas.</p>
              ) : (
                <div className="space-y-1.5">
                  {cellsView.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                      <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: c.color }} />
                      <div className="min-w-0 flex-1">
                        <input defaultValue={c.name} onBlur={(e) => { const v = e.target.value.trim(); if (v) { cellsRef.current = cellsRef.current.map((cell) => cell.id === c.id ? { ...cell, name: v } : cell); setCellsView(cellsRef.current.map((cell) => ({ ...cell, stationIds: [...cell.stationIds] }))); setDirty(true); } }} className="w-full bg-transparent text-[13px] font-medium outline-none focus:bg-white/[0.06] rounded px-1" />
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 px-1">{c.stationIds.length} estaciones</div>
                      </div>
                      <button onClick={() => deleteCell(c.id)} className="p-1 rounded-md text-rose-300 hover:bg-rose-500/20"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10.5px] text-gray-500 mt-3">Las celdas tiñen el piso bajo sus estaciones agrupadas.</p>
            </div>
          </div>
        </div>
      )}

      {/* Analysis panels — mounted on demand from the Análisis menu (unify) */}
      {analysisPanel && (() => {
        const it = ANALYSIS_PANELS.find((a) => a.key === analysisPanel);
        if (!it) return null;
        const C = it.Comp;
        // Local line-balance panel runs on the on-screen stations (no server call),
        // so it takes the placed stations in sequence order instead of model/revision.
        if (analysisPanel === 'linebalance') {
          const lbStations = (data?.stations ?? [])
            .filter((s) => placementsRef.current.has(s.id))
            .map((s) => ({ id: s.id, label: s.station }));
          return <C stations={lbStations} unit={data?.footprint.unit || 'mm'} open onClose={() => setAnalysisPanel(null)} />;
        }
        return <C model={model} revision={revision} open onClose={() => setAnalysisPanel(null)} />;
      })()}

      {/* Keyboard shortcuts / help overlay */}
      {showHelp && (
        <div className="absolute inset-0 z-[80] grid place-items-center bg-black/55 p-4" onClick={() => setShowHelp(false)}>
          <div className="w-[640px] max-w-full max-h-[82vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <HelpCircle className="w-4 h-4" style={{ color: '#22d3ee' }} />
              <span className="text-sm font-semibold">Atajos y herramientas · CAD 3D</span>
              <div className="flex-1" />
              <button onClick={() => setShowHelp(false)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4 text-[12.5px]">
              {HELP_SECTIONS.map((sec) => (
                <div key={sec.title}>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">{sec.title}</div>
                  <div className="space-y-1">
                    {sec.rows.map(([k, d]) => (
                      <div key={d} className="flex items-baseline justify-between gap-3">
                        <span className="text-gray-300">{d}</span>
                        <kbd className="shrink-0 px-1.5 py-0.5 rounded-md bg-white/[0.08] border border-white/10 text-[11px] text-gray-200 font-mono">{k}</kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4 text-[11px] text-gray-500">Abre esta ayuda con <kbd className="px-1 py-0.5 rounded bg-white/[0.08] border border-white/10 font-mono">?</kbd> en cualquier momento.</div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function T3Btn({ active, onClick, title, children, disabled }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled} className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent ${active ? 'text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-white/10'}`} style={active ? { background: '#0e7490' } : undefined}>
      {children}
    </button>
  );
}

function NumField({ label, value, onChange, onBegin }: { label: string; value: number; onChange: (v: number) => void; onBegin?: () => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">{label}</span>
      <input
        type="number"
        value={value}
        onFocus={onBegin}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full px-2 py-1 rounded-md bg-white/[0.06] border border-white/10 text-[13px] text-white focus:outline-none focus:border-cyan-400/60"
      />
    </label>
  );
}

function DimInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-[9px] uppercase tracking-wide text-gray-500 mb-0.5">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-1.5 py-1 rounded-md bg-white/[0.06] border border-white/10 text-[12px] text-white focus:outline-none focus:border-cyan-400/60"
      />
    </label>
  );
}

function AlignBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className="inline-flex items-center justify-center py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-gray-200">
      {children}
    </button>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? 'bg-cyan-500/15' : 'bg-white/[0.04]'}`}>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-[15px] font-semibold ${highlight ? 'text-cyan-300' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">{label}</span>
      <div className="w-full px-2 py-1 rounded-md bg-white/[0.03] border border-white/5 text-[13px] text-gray-500 dark:text-gray-400">{value}</div>
    </div>
  );
}
