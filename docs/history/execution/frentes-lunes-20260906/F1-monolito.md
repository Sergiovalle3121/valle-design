# F1 · El monolito — bitácora y plan de extracción (2026-09-06)

Frente F1 (coordinador, en exclusiva sobre `Layout3DEditor.tsx`). El plan de
abajo lo produjo el reconocimiento de la Ola 0: dos exploradores de sólo
lectura mapearon los cuatro controladores (guardado/versiones, importación,
exportación, pinzamientos) con sus rangos, dependencias de cierre y riesgos,
y un planificador los reconcilió. Los números de línea son del árbol en el
momento de escribirlo y se desplazan con cada paso: **cada agente vuelve a
buscar sus anclas por texto antes de cortar.**

## Estado

| Paso | Qué | Estado |
| --- | --- | --- |
| 0 | Once símbolos muertos y su cascada (−555) | HECHO · `ba975d3` |
| 1 | `export-host.ts` (PNG/GLB/DXF + estado del cuadro de exportación; −5 `useState`) | en curso |
| 2 | `versions-host.ts` (−6 `useState`) | pendiente |
| 3 | `dxf-backdrop-host.ts` (−4 `useState`) | pendiente |
| 4 | `recovery-host.ts` (opcional) | pendiente |

Regla de cada paso: sin cambio de comportamiento; `typecheck`, eslint del
fichero, `check-monolith-budget --update` y `check-lint-budget` en el mismo
commit; los specs que leen el monolito en verde; `diff -w` del bloque movido
contra HEAD.

---

# Extraction plan — `apps/web/src/components/cad/editor/Layout3DEditor.tsx`

## 0. Verified ground truth (read-only checks, 2026-09-06)

| Fact | Value |
|---|---|
| HEAD (`1af7113`) size | 18 453 lines, 131 `useState` |
| **Working tree right now** | **17 898 lines, 131 `useState`, file is `M` (uncommitted)** — Step 0 is already applied by another agent: `git diff --stat` = 5 insertions, 560 deletions |
| Budget manifests | `scripts/cad/monolith-budget.json` still says 18454 / 131; `scripts/lint-budget.json` untouched (`@typescript-eslint/no-unused-vars: 14`) |
| Target | ≥ 1 200 lines out of 18 453 → allowance ≤ 17 253 (task T-00 says ≤ 17 250). Remaining after Step 0: **≥ 648 more lines** |
| Gate rules | `check-monolith-budget.mjs`: new files ≤ 800 lines; allowance/ceiling only go down; must `--update` when ≥ 200 under. `ui-wiring.spec.ts` audits only `*.tsx` `const [x, setX] = useState` — hosts in `.ts` are outside its regex, and `const [, setX]` does not match. `check-no-industrial-domain.mjs` scans the monolith AND any new file the same way (`residueBacklog = []`, monolith is not a permitted path) — content that passes today passes after the move. `check-import-direction.mjs` only constrains `lib/` → irrelevant for `components/cad/editor/*.ts`. |
| House pattern | `components/cad/palettes/paper-spaces-host.ts`: class + `subscribe/getSnapshot` + `CadStateSetter<T>` (React two-overload signature) + `useCadXHost()` (`useMemo(() => new Host(), [])`) + `useCadX(host)` (`useSyncExternalStore`). Monolith destructures with its old names (lines 1356-1370 today). |

**All line numbers below are for the CURRENT working tree (post-Step-0).** Every step shifts the numbers of the steps after it: each agent must re-grep the anchors given in backticks before cutting.

Corrections to the scout reports:
- Dead-symbol cascade was larger than reported: `applyCommandOperation` + `isMutatingCommandOperation` + `canApplyCommandOperation` (old 11412-11675, 264 lines) were only referenced from `applyCommand` and are gone too. Total Step 0 = −555 net, not −285.
- `commandHistoryCursor` and `precisionText` became orphan states (only reads were inside dead code); the Step-0 agent kept them as `const [, setCommandHistoryCursor] = useState(-1)` / `const [, setPrecisionText] = useState("")` (lines 1521, 2047) — so the `useState` count is still 131.
- `CadDxfExportDialog.tsx` already exports `CadDxfExportOptions`, `CadDxfExportSummary`, `CadDxfPreflight` — structurally identical to the monolith's private `DxfExportOptions`/`DxfExportSummary`/preflight literal. The export host reuses them; no type duplication.
- `restoreRecoveryCandidate` and `discardRecoveryCandidate` are `useCallback`s and the recovery block contains three `useEffect`s → real hook-order surface (flagged in Step 4).

Budget arithmetic (net, after subtracting the ~10-15 lines of hook call + destructure each step adds back):

| Step | Net lines | Running total | `useState` |
|---|---:|---:|---:|
| 0 dead code (done) | −555 | 17 898 | 131 (→129 with 0b) |
| 1 export host | ≈ −540 | ≈ 17 358 | 126 |
| 2 versions host | ≈ −125 | ≈ 17 233 | 120 |
| 3 DXF backdrop host | ≈ −165 | ≈ 17 068 | 116 |
| 4 recovery host (stretch) | ≈ −145 | ≈ 16 923 | 112 |

Steps 1-3 are required to land ≤ 17 250 with margin; Step 4 is optional.

---

## Step 0 — dead symbols (ALREADY IN WORKING TREE; needs commit + gates)

Removed (all with `grep -cw` = 1 at HEAD, i.e. declaration only): `submitPrecisionPoint` (60), `interpretCommand` (5), `navigateCommandLineHistory` (10), `applyCommand` (192), `undoLastCommand` (9), `redoLastCommand` (9), cascade `applyCommandOperation`/`isMutatingCommandOperation`/`canApplyCommandOperation` (264), unused imports `AssetArchetype`, `PlotLayout`, `attachCadXref`, `CadLayerFilterProperty`, `cadNlCommandsIfLoaded`, `navigateCadCommandHistory`, `parseCoordinate`, `CadOperation`, and `const ctx = ctxRef.current!` inside `snapFloor`. Verified now: every one of those names has 0 occurrences in the working tree; `hist`, `commandLog`, `setHist`, `setCommandLog`, `commandPreview` (read at 1734 ref-sync) all still have live readers.

**0b (optional, strictly unobservable, coordinator's call):** delete the two write-only states and their 8 remaining calls — `setCommandHistoryCursor(-1)` at 1521 (decl), 1762, 11319, 13000 and `setPrecisionText("")` at 2047 (decl), 8249, 8258, 8275, 13009, 15587. Initial value == every written value (`-1` / `""`), so React bails out on each call (`Object.is`): no re-render, no observable effect. Takes the ceiling 131 → 129. If not done, the `[, setX]` form is invisible to `ui-wiring.spec.ts`, so nothing fails either way.

Verify + commit:
```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx eslint src/components/cad/editor/Layout3DEditor.tsx
node scripts/check-lint-budget.mjs --update      # no-unused-vars fell; ratchet only fails on growth but keep it honest
node scripts/cad/check-monolith-budget.mjs --update && node scripts/cad/check-monolith-budget.mjs   # → 17898 / 131 (or 129)
cd apps/web && npx tsx src/components/cad/editor/ui-wiring.spec.ts
npm run check:no-industrial-domain
```

---

## Step 1 — Export controller → `apps/web/src/components/cad/editor/export-host.ts`

Best ratio in the file: **≈ 550 lines / 32 named deps**, removes 5 `useState`, and every consumer keeps its identifier.

### What moves (current lines)
- Module level: `DXF_LABEL_REQUIRED_ASSET_KINDS` 1025-1046 (anchor `const DXF_LABEL_REQUIRED_ASSET_KINDS = new Set([`; sole use is `computeDxfExportSummary`). Interfaces `DxfExportOptions` 923-930 and `DxfExportSummary` 931-941 are **deleted**, replaced by `CadDxfExportOptions` / `CadDxfExportSummary` / `CadDxfPreflight` imported from `../dialogs/CadDxfExportDialog` (verified identical shapes).
- State: 1353 `showDxfExport`; 1431-1438 `dxfExportOptions`; 1439-1449 `dxfExportSummary`; 1450-1468 doc comment + `dxfPreflight`; 1469-1471 `dxfPreflightAccepted`.
- Functions 11940-12439 verbatim: `exportPng` (11940-11950), comment 11951-11955, `exportGltf` (11956-12021), `computeDxfExportSummary` (12022-12125), `setDxfOption` (12126-12132), `openDxfExport` (12133-12142), comment 12143-12149, `dxfPreflightToken` (12150-12171), `exportDxf` (12172-12439). Anchors: `const exportPng = () => {` … `const captureCanonicalSaveRequest = ()` (first line that stays).
- Imports that move entirely (each has exactly 2 occurrences today = import + one use in the block): `hideCadGlbOverlays`, `planCadGlbExport`, `serializeCadGlbBlob` (284-288); `exportCadLayoutDxf` (305); `evaluateCadDxfExportReadiness`, `CadDxfExportReadinessEntity`, `CadDxfExportLayerSummary`, `CadDxfExportReadinessIssue` (306-311, whole block goes); from `@/lib/cad/dxf-cad-document` the 8 names `cadDocumentNativeDxfPrimitives/Hatches/MTexts/SemanticDimensions/Mleaders`, `cadDocumentDxfBlocks`, `cadDocumentDxfInserts`, `cadDocumentDxfExportLosses` (the `cadDxf*ToNativeEntities` siblings stay); `type CadLossManifestEntry` (~380). Imports that stay because used elsewhere (also imported by the host): `assetMeta` (21 uses), `defaultCadLayerForAssetKind` (19), `CAD_ENTITY_REGISTRY`, `unitToMeters` (4), `WorldUnit` (6), `CadDocument`, `CadEntity`, `CadLayerId`.

### Contract
```ts
// export-host.ts
import type { CadDxfExportOptions, CadDxfExportSummary, CadDxfPreflight } from "../dialogs/CadDxfExportDialog";

export interface CadExportSnapshot {
  showDxfExport: boolean;
  dxfExportOptions: CadDxfExportOptions;   // INITIAL: { scope:"all", includeHidden:true, includeMeasurements:true, includeLabels:true, units:"mm", fileName:"" }
  dxfExportSummary: CadDxfExportSummary;   // INITIAL: the zeroed literal from 1439-1449
  dxfPreflight: CadDxfPreflight | null;
  dxfPreflightAccepted: string | null;
}
export class CadExportHost { /* paper-spaces-host pattern */
  subscribe; getSnapshot;
  setShowDxfExport: CadStateSetter<boolean>;
  setDxfExportOptions: CadStateSetter<CadDxfExportOptions>;
  setDxfExportSummary: CadStateSetter<CadDxfExportSummary>;
  setDxfPreflight: CadStateSetter<CadDxfPreflight | null>;
  setDxfPreflightAccepted: CadStateSetter<string | null>;
}
export function useCadExportHost(): CadExportHost;          // useMemo(() => new CadExportHost(), [])
export function useCadExport(host: CadExportHost): CadExportSnapshot;  // useSyncExternalStore

export interface CadEditorNotifier { success(m: string, t?: string): void; error(m: string, t?: string): void; }

export interface CadExportInputs {
  // props
  model: string; revision: string; productLabel: string;                 // branding.productLabel (12376 fileComment)
  // state — RENDER-TIME VALUES (the closures read these exactly as today)
  exportState: CadExportSnapshot;                                         // the object returned by useCadExport this render (default param of exportDxf, dxfPreflight/dxfPreflightAccepted at 12391/12409)
  data: { footprint: { unit: string } } | null;                           // only .footprint.unit is read (11993, 12136)
  cadLayers: CadLayer[]; layerAssignments: CadLayerAssignments; objectTags: Record<string, string>;
  report: DesignReport | null; collisionHits: CadCollisionHit[]; safetyIssues: CadSafetyIssue[]; dxfWarnings: CadDxfImportWarning[];
  // refs (same generics as the monolith's useRef at 1818-1989, 1891, 1208, 1903, 1995, 1990, 1883)
  rendererRef: RefObject<THREE.WebGLRenderer | null>; sceneRef: RefObject<THREE.Scene | null>; cameraRef: RefObject<THREE.PerspectiveCamera | null>;
  ctxRef: RefObject<{ s: number; W: number; H: number } | null>; previewLineRef: RefObject<THREE.Line | null>;
  blocksRef: RefObject<THREE.Group | null>; assetsGroupRef: RefObject<THREE.Group | null>; connsGroupRef: RefObject<THREE.Group | null>; groundRef: RefObject<THREE.Mesh | null>;
  nativeMassHostsRef: RefObject<CadNativeMassHosts | null>; solidShadeHostRef: RefObject<CadSolidShadeHost | null>;
  loadedCadDocumentRef: RefObject<CadDocument | null>; currentDocumentIdRef: RefObject<string | undefined>;
  selRef: RefObject<SelItem[]>; nativeSelectionIdsRef: RefObject<string[]>;
  placementsRef: RefObject<Map<string, Placement>>; assetsRef: RefObject<Map<string, Asset>>; connectorsRef: RefObject<Conn[]>; annotationsRef: RefObject<Map<string, Ann>>;
  stationsByIdRef: RefObject<Map<string, St>>; layersRef: RefObject<{ notes: boolean; /* … the `layers` state shape, 1616 */ }>;
  // callbacks
  snapshotDocument: () => CadDocument; toast: CadEditorNotifier;
}
/** NOT a hook: plain closures re-created every render, so read timing is byte-identical to today. */
export function createCadExportActions(host: CadExportHost, inputs: CadExportInputs): {
  exportPng: () => void; exportGltf: () => Promise<void>;
  computeDxfExportSummary: (o: CadDxfExportOptions) => CadDxfExportSummary;
  setDxfOption: (patch: Partial<CadDxfExportOptions>) => void; openDxfExport: () => void;
  exportDxf: (options?: CadDxfExportOptions) => Promise<void>;
};
export function dxfPreflightToken(options, document: CadDocument, documentId: string | undefined, selectionIds: readonly string[]): string; // pure
```
`SelItem`/`Placement`/`Asset`/`Ann`/`Conn`/`St` — `SelItem` is module-private in the monolith (line ~889): either export it or type `selRef` as `RefObject<{ id: string; type: string }[]>` (only `.id` is read at 12024). Same for `St`/`Placement`: use the narrowest structural type the block actually reads.

### Monolith consumption
```ts
// at 1353 (replaces the 5 useState; delete 1431-1471 block)
const exportHost = useCadExportHost();
const { showDxfExport, dxfExportOptions, dxfExportSummary, dxfPreflight, dxfPreflightAccepted } = useCadExport(exportHost);
const { setShowDxfExport, setDxfPreflightAccepted } = exportHost;   // the only setters used outside the block (17767, 17775)
// at 11940 (replaces 11940-12439)
const { exportPng, exportGltf, computeDxfExportSummary, setDxfOption, openDxfExport, exportDxf } =
  createCadExportActions(exportHost, { model, revision, productLabel: branding.productLabel,
    exportState: { showDxfExport, dxfExportOptions, dxfExportSummary, dxfPreflight, dxfPreflightAccepted },
    data, cadLayers, layerAssignments, objectTags, report, collisionHits, safetyIssues, dxfWarnings,
    rendererRef, sceneRef, cameraRef, ctxRef, previewLineRef, blocksRef, assetsGroupRef, connsGroupRef, groundRef,
    nativeMassHostsRef, solidShadeHostRef, loadedCadDocumentRef, currentDocumentIdRef, selRef, nativeSelectionIdsRef,
    placementsRef, assetsRef, connectorsRef, annotationsRef, stationsByIdRef, layersRef, snapshotDocument, toast });
```
Consumers that stay untouched: `sheetPackageChecks` 13532-13534, `sheetPackageManifest` 13578-13581, `dxfExportLayerRows/IssueRows` 13869-13872, toolbar 14746 / 14750 / 14792, `executeEditorKeyAction` case `"open-dxf-export"` (~12983), `Preparar DXF` 17722, `<CadDxfExportDialog>` 17765-17777. (`computeDxfExportSummary` and `setDxfOption` are used only by the dialog wiring and inside the block — keep them in the destructure only if referenced; typecheck/eslint tells.)

### Flags
- **No hook-order change**: `createCadExportActions` contains zero hooks; `useCadExportHost` + `useCadExport` replace 5 `useState` at one position (consistent per render).
- `setDxfOption` keeps the nested `setDxfExportSummary` inside the `setDxfExportOptions` updater verbatim; the host's `resolve()` runs the updater once synchronously → summary patched, then options; identical end state (only the StrictMode dev double-invocation disappears).
- `exportDxf(options = dxfExportOptions)` must default to `inputs.exportState.dxfExportOptions` (render-time), never `host.getSnapshot()`.
- `exportPng` keeps `cameraRef` (PerspectiveCamera) — do not swap to the view controller camera. Both `layer: "Text"` literals (~12080, ~12268) stay. Download names / `fileComment` / all six toast strings unchanged.
- Expected file size ≈ 680 lines; if it crosses 800, split `exportPng`/`exportGltf` (82 lines, 15 deps) into `export-scene-actions.ts`.
- Lint budgets: no new `react-hooks/refs` reads (refs are only dereferenced inside handlers); `no-unused-vars` must drop, not rise — delete the listed import names.

### Verify
```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx eslint src/components/cad/editor/Layout3DEditor.tsx src/components/cad/editor/export-host.ts
node scripts/cad/check-monolith-budget.mjs --update && node scripts/cad/check-monolith-budget.mjs   # expect ≈17 35x / 126
node scripts/check-lint-budget.mjs
cd apps/web && npx tsx src/components/cad/editor/ui-wiring.spec.ts && node scripts/run-specs.mjs
npm run check:no-industrial-domain && npm run check:conventions
# moved-verbatim check (ignore indentation only):
diff -w <(git show HEAD:apps/web/src/components/cad/editor/Layout3DEditor.tsx | sed -n '12022,12125p') <(sed -n '/const computeDxfExportSummary/,/^  };/p' apps/web/src/components/cad/editor/export-host.ts)
```

---

## Step 2 — Versions host → `apps/web/src/components/cad/editor/versions-host.ts`

**≈ 140 lines / 19 named deps**, removes 6 `useState`. Functionally the server endpoints are dead (`layout/snapshots*` → adapter 404, verified in scout), but the button 14808 and dialog 17810-17831 are reachable: move verbatim, delete nothing.

### What moves
- State 1486-1503 (`showVersions`, `localSnapshots`, `snapshotDiff`, `versions`, `versName`, `versBusy`). **`reloadTick` (1504) stays** — it is a dependency of the load effect.
- Functions 10445-10566 verbatim (anchor `// ---- versions / scenarios` … up to the line before `// ---- clone from another model's layout`): `scopeQs`, `loadVersions`, `openVersions`, `saveLocalSnapshot`, `restoreLocalSnapshot`, `compareLocalSnapshot`, `deleteLocalSnapshot`, `saveVersion`, `restoreVersion`, `deleteVersion`.
- **`recordLocalSnapshot` (3701-3716) STAYS** in the monolith: it is a `useCallback` used at ~9366 and ~10016 (template instantiate, DXF convert) — before 10445, so it cannot live in the actions factory (TDZ). It just calls `versionsHost.setLocalSnapshots` (same name, same signature).
- Imports that move: `diffCadSnapshots`, `restoreCadSnapshot`, `CadSnapshotDiff`, `CadSnapshotHistory` (2 occurrences each). Stay in the monolith (also imported by host): `createCadSnapshot` (3 uses), `pushCadSnapshot`, `legacyCadFetch`.

### Contract (generic — the monolith's `Snapshot` interface stays private at 894)
```ts
export interface CadServerVersion { id: string; name: string; createdAt: string; stationCount: number; assetCount: number; } // or reuse CadVersionView from ../dialogs/CadVersionsDialog if exported
export interface CadVersionsSnapshot<S> {
  showVersions: boolean; localSnapshots: CadSnapshotHistory<S>; snapshotDiff: CadSnapshotDiff | null;
  versions: CadServerVersion[]; versName: string; versBusy: boolean;
}
export class CadVersionsHost<S> { subscribe; getSnapshot; setShowVersions; setLocalSnapshots; setSnapshotDiff; setVersions; setVersName; setVersBusy; }  // React-signature setters
export function useCadVersionsHost<S>(): CadVersionsHost<S>;
export function useCadVersions<S>(host): CadVersionsSnapshot<S>;

export interface CadVersionsInputs<S> {
  // props
  model: string; revision: string;
  // state (render-time)
  drawingReadOnly: boolean;
  versionsState: Pick<CadVersionsSnapshot<S>, "versName" | "localSnapshots">;   // read by saveLocalSnapshot/restoreLocalSnapshot/compareLocalSnapshot
  // setters (monolith-owned)
  setReloadTick: Dispatch<SetStateAction<number>>;                               // restoreVersion: setReloadTick((t) => t + 1) verbatim
  // callbacks
  snapshot: () => S; restore: (s: S) => void; pushHistory: () => void;
  recordLocalSnapshot: (label: string, reason: "manual" | "command" | "import" | "restore") => string;
  toast: CadEditorNotifier;
  fetch?: typeof legacyCadFetch;   // default = legacyCadFetch, so a spec can stub the 404
}
/** NOT a hook. */
export function createCadVersionsActions<S>(host, inputs): {
  openVersions; saveLocalSnapshot(reason?); restoreLocalSnapshot(id); compareLocalSnapshot(id); deleteLocalSnapshot(id);
  saveVersion(); restoreVersion(id); deleteVersion(id);
};
```

### Monolith consumption
```ts
// at 1486 (replaces 1486-1503)
const versionsHost = useCadVersionsHost<Snapshot>();
const { showVersions, localSnapshots, snapshotDiff, versions, versName, versBusy } = useCadVersions(versionsHost);
const { setShowVersions, setLocalSnapshots, setSnapshotDiff, setVersName } = versionsHost;  // used at 17811, 3712, 2605, 17816
// at 10445 (replaces 10445-10566)
const { openVersions, saveLocalSnapshot, restoreLocalSnapshot, compareLocalSnapshot, deleteLocalSnapshot, saveVersion, restoreVersion, deleteVersion } =
  createCadVersionsActions(versionsHost, { model, revision, drawingReadOnly, versionsState: { versName, localSnapshots },
    setReloadTick, snapshot, restore, pushHistory, recordLocalSnapshot, toast });
```
Untouched consumers: 2605 `setSnapshotDiff(null)` (load effect), 3712, 14808 `openVersions` (`active={showVersions}`), 15837 `snapshotsCount`, 17810-17831 dialog.

### Flags
- No hook-order change (host hooks replace 6 `useState` in place; the factory has no hooks).
- `(await r.json()) as typeof versions` → `as CadServerVersion[]` (type-only).
- `useCadVersionsHost<Snapshot>()` keeps `CadSnapshotHistory<Snapshot>` typing without exporting `Snapshot`.
- Toast strings ("Snapshots CAD", "Versiones", "No se pudo guardar la versión.", "Error de red.") and the `layout/snapshots…` URLs verbatim.

Verify: same command list as Step 1 (expect ≈ 17 23x / 120), plus `diff -w` of old 10446-10566 against the factory body.

---

## Step 3 — DXF backdrop host → `apps/web/src/components/cad/editor/dxf-backdrop-host.ts`

**≈ 180 lines / 14 named deps**, removes 4 `useState`; refs stay in the monolith (read synchronously by `snapFloor`, `importDxfWalls`, `convertDxfPrimitivesToEditable`, `saveLegacy`, and the scene effect).

### What moves
- State: 1349-1352 (`dxfBusy`, `dxfWarnings`, `dxfImportPreview`) and 1866 (`hasDxf`).
- `interface DxfMeta` 855-862 → `export interface DxfMeta` in the host; the monolith imports it (`Layout.dxf` at 870, `dxfMetaRef` 1864, `projectDxfPoint` ~9925 keep compiling).
- `rebuildDxf` + its ref-sync effect 3379-3424 (anchor `// ---- (re)build the read-only DXF floor-plan overlay` … `}, [rebuildDxf]);`) → **hook** `useCadDxfBackdropRebuild(refs)`.
- `onDxfFile` + `removeDxf` 10337-10444 (anchor `// ---- DXF backdrop upload / remove` … line before `// ---- versions / scenarios`) → plain factory.
- The load-effect slice 2849-2874 **stays verbatim** (it is inside the async load effect with the `alive` guard); it keeps calling `setHasDxf/setDxfWarnings/setDxfImportPreview` — now host setters with the same names.
- Refs staying: `dxfInputRef` 1485, `dxfGroupRef` 1857, `dxfModelRef` 1863, `dxfMetaRef` 1864, `rebuildDxfRef` 1865, `dxfSnapRef` 1880.
- Imports that move (2 occurrences each): `detectCadFormat` (179), `importDxfPrimitives` (313), `CadDxfImportResult`, `CadDxfImportWarning`. Stay + also imported by host: `parseDxf`/`DxfModel` (4/3), `dxfSnapPoints` (3), `DWG_UNAVAILABLE_REASON` (3), `legacyCadFetch`, `disposeObject` (533; 9 uses), `THREE`.

### Contract
```ts
export interface DxfMeta { offsetX: number; offsetY: number; scale: number; rotation: number; visible: boolean; opacity: number; }
export interface CadDxfBackdropSnapshot { dxfBusy: boolean; dxfWarnings: CadDxfImportWarning[]; dxfImportPreview: CadDxfImportResult | null; hasDxf: boolean; }
export class CadDxfBackdropHost { subscribe; getSnapshot; setDxfBusy; setDxfWarnings; setDxfImportPreview; setHasDxf; }
export function useCadDxfBackdropHost(); export function useCadDxfBackdrop(host);

/** HOOK (useCallback([]) + useEffect([rebuildDxf])) — call it exactly where lines 3380-3424 are today. */
export function useCadDxfBackdropRebuild(refs: {
  dxfGroupRef: RefObject<THREE.Group | null>; ctxRef: RefObject<{ s: number; W: number; H: number } | null>;
  dxfModelRef: RefObject<DxfModel | null>; dxfMetaRef: RefObject<DxfMeta | null>;
  layersRef: RefObject<{ dxf: boolean }>; rebuildDxfRef: MutableRefObject<() => void>;
}): () => void;   // returns rebuildDxf (stable identity, as today)

export interface CadDxfBackdropInputs {
  // props
  model: string; revision: string;
  // state (render-time) — `if (!data) return;` guard + data.footprint.footprintW/H (10339, 10383-10395)
  data: { footprint: { footprintW: number; footprintH: number } } | null;
  // refs
  dxfModelRef: MutableRefObject<DxfModel | null>; dxfMetaRef: MutableRefObject<DxfMeta | null>;
  dxfSnapRef: MutableRefObject<{ x: number; y: number }[]>; rebuildDxfRef: RefObject<() => void>;
  // callbacks
  markDirty: () => void; toast: CadEditorNotifier; fetch?: typeof legacyCadFetch;
}
/** NOT a hook. */
export function createCadDxfBackdropActions(host, inputs): { onDxfFile(file: File): Promise<void>; removeDxf(): Promise<void>; };
```

### Monolith consumption
```ts
// at 1349 (replaces 1349-1352; also delete 1866)
const dxfBackdropHost = useCadDxfBackdropHost();
const { dxfBusy, dxfWarnings, dxfImportPreview, hasDxf } = useCadDxfBackdrop(dxfBackdropHost);
const { setDxfBusy, setDxfWarnings, setDxfImportPreview, setHasDxf } = dxfBackdropHost;  // load effect 2852-2864 keeps using them
// at 3380 (replaces 3379-3424) — SAME POSITION
const rebuildDxf = useCadDxfBackdropRebuild({ dxfGroupRef, ctxRef, dxfModelRef, dxfMetaRef, layersRef, rebuildDxfRef });
// at 10337 (replaces 10337-10444)
const { onDxfFile, removeDxf } = createCadDxfBackdropActions(dxfBackdropHost, { model, revision, data, dxfModelRef, dxfMetaRef, dxfSnapRef, rebuildDxfRef, markDirty, toast });
```
Untouched consumers: 2849-2874 load slice, scene effect direct call `rebuildDxf()` (~6166), `snapFloor`/`importDxfWalls`/`convertDxfPrimitivesToEditable`/`saveLegacy` ref reads, 12110-12111 readiness counters, 13433-13456 `dxfWarningSummary`/`dxfPrimitiveSummary`, 13767/13856-13859 validation counters, toolbar 14755-14790, DXF panel ~15463-15544, status bar 15836.

### Flags
- **Effect timing**: `useCadDxfBackdropRebuild` moves one `useEffect` into a custom hook. It must be called at 3380's position (the scene effect at ~6166 calls the returned `rebuildDxf` directly during first mount, before the ref-sync effect has run — order preserved only if the hook sits where the original `useCallback` sat).
- `ctxRef` (1992) and `layersRef` (1883) are declared before 3380 — fine. `layersRef` is `useRef(layers)` where `layers` is the object state at 1616; type it structurally as `{ dxf: boolean }` (only `.dxf` is read at 3393).
- Refs stay `MutableRefObject`s written synchronously in the same tick (10406-10411: refs → `dxfSnapPoints` → `rebuildDxfRef.current()` → `markDirty()`); the host must not publish them as snapshot state.
- Array identity of `dxfWarnings`/`dxfImportPreview` preserved (set the same objects; never clone) so `dxfPrimitiveSummary` memo behaviour is unchanged.
- The `text.length > 12_000_000` UTF-16 check and the `detectCadFormat` → `DWG_UNAVAILABLE_REASON` ordering stay as-is; `validateImportFile` is NOT introduced (behaviour change; log as follow-up). `accept=".dxf,.dwg"` and `data-testid="cad-dxf-input"` stay in the monolith.
- All eight toast strings verbatim ("El DXF supera 12 MB.", "Plano DXF cargado de fondo.", "Plano DXF quitado.", "No se pudo leer el archivo DXF.", …).

Verify: Step 1 list (expect ≈ 17 07x / 116) + `diff -w` old 10338-10444 vs factory; `grep -n 'data-testid="cad-dxf-input"'` still exactly one hit in the monolith.

---

## Step 4 (stretch) — Recovery host → `apps/web/src/components/cad/editor/recovery-host.ts`

**≈ 150 lines / 30 named deps** (above the ~20 comfort line, below the 35 ceiling), removes 4 `useState`. Only do it if Steps 1-3 land green; skip otherwise — it is the one step with real hook/effect surface.

### What moves
- State 1276-1286 (`recoveryCandidate`, doc comment, `recoveryDivergent`, `recoverySavedAt`, `recoveryWarning`). **Refs `recoveryLaneRef`/`recoverySessionStartedAtRef` (1296-1297) stay** — `persistCanonicalSave`/`saveLegacy` read them.
- Block 4108-4260 → **hook** `useCadRecovery(host, inputs)`: lane effect 4111-4114, load effect 4116-4145, checkpoint-queue effect 4147-4195, `restoreRecoveryCandidate` 4197-4242 (useCallback), comment 4243-4248, `discardRecoveryCandidate` 4249-4260 (useCallback). Anchors: comment `// La sesión de recuperación se reinicia con el documento` … `}, [recoveryCandidate, recoveryScope]);`.
- Imports that move (2 occurrences each): `loadCadRecovery`, `saveCadRecovery`, `discardCadRecoveryThrough`, `CadRecoveryQuotaError`, `createCadCheckpointQueue` (234), `classifyCadRecoveryCandidate`, `LEGACY_LANE as LEGACY_RECOVERY_LANE`, `CadRecoveryRecord`. Stay: `cadRecoveryLaneId` (3), `clearCadRecoveryLaneThrough`, `migrateCadDocument` (7), `cadDocumentToEditorSnapshot` (10), `CAD_ENTITY_REGISTRY`, `CadNativeEntity`, `CadLayerId`.

### Contract
```ts
export interface CadRecoverySnapshot { recoveryCandidate: CadRecoveryRecord | null; recoveryDivergent: boolean; recoverySavedAt: string | null; recoveryWarning: string | null; }
export class CadRecoveryHost { subscribe; getSnapshot; setRecoveryCandidate; setRecoveryDivergent; setRecoverySavedAt; setRecoveryWarning; }
export function useCadRecoveryHost(); export function useCadRecovery(host);   // snapshot

export interface CadRecoveryInputs {
  // props
  open: boolean; documentId: string | undefined; model: string; revision: string;
  // state (render-time; several are effect deps — keep the identical identifiers)
  data: Layout | null /* structural: { cadDocumentVersion?: number } | null */; dirty: boolean; drawingReadOnly: boolean;
  recoveryScope: CadRecoveryScope | null; recoveryState: CadRecoverySnapshot;           // recoveryCandidate for the two callbacks
  // refs
  drawingReadOnlyRef: RefObject<boolean>; currentDocumentIdRef: RefObject<string | undefined>;
  savedGenerationByDocumentRef: RefObject<Map<string, number>>; editGenerationRef: RefObject<number>;
  loadedCadDocumentRef: MutableRefObject<CadDocument | null>;
  recoveryLaneRef: MutableRefObject<string | null>; recoverySessionStartedAtRef: MutableRefObject<number>;
  // setters (paperSpacesHost + monolith)
  setPaperSpaces; setActivePaperSpaceId; setActivePaperViewportId; setLayoutPreviewSheet;
  setCadXrefs; setPublicationRecords; setNativeEntities; setNativeDocumentRevision;
  // callbacks
  snapshotDocument: () => CadDocument; syncCadLayerState: (d: CadDocument) => void; applyDocumentFootprint: (d: CadDocument) => void;
  restore: (s: CadEditorSnapshot<CadLayerId>) => void; notifyReadOnly: () => void; toast: CadEditorNotifier;
}
/** HOOK: 3 useEffect + 2 useCallback, in this order: lane → load → checkpoint queue → restore → discard. */
export function useCadRecoveryController(host, inputs): { restoreRecoveryCandidate: () => void; discardRecoveryCandidate: () => void; };
```

### Monolith consumption
```ts
// at 1276 (replaces 1276-1286)
const recoveryHost = useCadRecoveryHost();
const { recoveryCandidate, recoveryDivergent, recoverySavedAt, recoveryWarning } = useCadRecovery(recoveryHost);
const { setRecoveryCandidate, setRecoveryDivergent, setRecoverySavedAt, setRecoveryWarning } = recoveryHost;  // load effect 2577-2579, persistCanonicalSave ~12523-12526, saveLegacy ~12711-12714
// at 4108 — SAME POSITION (after the `select` useCallback that ends at 4106, before the "Única frontera de mutación de celdas" comment)
const { restoreRecoveryCandidate, discardRecoveryCandidate } = useCadRecoveryController(recoveryHost, { open, documentId, model, revision, data, dirty, drawingReadOnly, recoveryScope,
  recoveryState: { recoveryCandidate, recoveryDivergent, recoverySavedAt, recoveryWarning }, drawingReadOnlyRef, currentDocumentIdRef, savedGenerationByDocumentRef, editGenerationRef, loadedCadDocumentRef,
  recoveryLaneRef, recoverySessionStartedAtRef, setPaperSpaces, setActivePaperSpaceId, setActivePaperViewportId, setLayoutPreviewSheet, setCadXrefs, setPublicationRecords, setNativeEntities, setNativeDocumentRevision,
  snapshotDocument, syncCadLayerState, applyDocumentFootprint, restore, notifyReadOnly, toast });
```
Untouched consumers: JSX 15392-15452 (`cad-recovery-panel`, `cad-recovery-restore` 15438, `cad-recovery-discard` 15445 — reads `recoveryCandidate.format/journalSequence/storedBytes/encoder/savedAt/baseCadDocumentVersion`), status bar 15810-15811, all save-path writers.

### Flags (hook order / effect timing — the reason this is the stretch step)
- Three `useEffect`s move into a custom hook: hook sequence stays consistent per render (legal), but **effect execution order relative to its neighbours changes if the call site moves** — it must be inserted exactly where line 4111 is today. Internal order lane → load → checkpoint must be preserved.
- Dependency arrays verbatim: `[documentId, model, revision]`, `[data, dirty, open, recoveryScope]`, `[data, dirty, drawingReadOnly, open, recoveryScope, snapshotDocument]`, and the 10-item list of `restoreRecoveryCandidate` (4231-4241), `[recoveryCandidate, recoveryScope]`. Destructure `inputs` at the top of the hook so `react-hooks/exhaustive-deps` sees the same identifiers (`lint-budget.json` allows 6 warnings — must not grow).
- `recoveryCandidate` object identity must be the one stored by `setRecoveryCandidate(candidate)` (JSX renders fields; `discardRecoveryCandidate` reads `.lane`/`.savedAtMs`).
- `dirty` stays a monolith `useState` (it is a dep here and in the save lifecycle).
- The scout's `applyCanonicalDocument` seam (5 duplicated blocks, incl. this hook's 4204-4224 copy) would cut 6 deps but touches the save path — NOT part of this campaign; note as follow-up.

Verify: Step 1 list (expect ≈ 16 9xx / 112) + `grep -c 'cad-recovery-restore\|cad-recovery-discard\|cad-recovery-panel'` = 3 in the monolith.

---

## Explicitly NOT in this campaign (measured, rejected)
- **Save lifecycle** (old 812 lines, 89 closure identifiers): render-phase scheduler init, a no-deps effect, refs captured every render, 63 `markDirty` references — cannot be moved without changing "latest closure wins" semantics; needs the `applyCanonicalDocument` seam first.
- **Grip wiring** (6718-6758 + 7729-7731): 41 lines / 13 deps — poor ratio, and it lives inside the `[open, data !== null]` scene effect.
- **Marquee/pointer controller**: 810-line handler block with 94 deps and an interleaving contract with the grip controller (`handlePointerDown` before camera check, path commit before `handlePointerUp`, marquee commit after) — any facade changes behaviour.
- **`validateImportFile`** wiring in `onDxfFile`, `Ann.layer` preservation in the DXF export: both are behaviour changes; log as follow-ups.

## Per-step commit checklist (same for every step)
1. Cut ranges by anchor (re-grep; do not trust stale numbers), paste verbatim into the new module, re-indent only.
2. `cd apps/web && npx tsc --noEmit` — must be clean.
3. `cd apps/web && npx eslint src/components/cad/editor/Layout3DEditor.tsx src/components/cad/editor/<module>.ts`; `node scripts/check-lint-budget.mjs` (run `--update` if counts fell).
4. `node scripts/cad/check-monolith-budget.mjs --update && node scripts/cad/check-monolith-budget.mjs` — in the same commit; new file ≤ 800 lines.
5. `cd apps/web && npx tsx src/components/cad/editor/ui-wiring.spec.ts && node scripts/run-specs.mjs`; `npm run check:no-industrial-domain && npm run check:conventions`.
6. `diff -w` of every moved body against `git show HEAD:…` ranges; `grep -c` of the invariant testids (`cad-save`, `cad-dxf-input`, `cad-recovery-panel/restore/discard`) unchanged; `git diff` of the monolith shows only deletions, the hook call/destructure, and import-name removals.
7. Add a row to `docs/execution/DEUDA-MONOLITO.md` ("Lo que ya salió") with lines/deps per its convention.
