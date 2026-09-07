/**
 * EL CONTROLADOR DE EXPORTACIÓN (F1 · paso 1 del plan de extracción).
 *
 * Dueño del estado del cuadro «Exportar DXF» (abierto, opciones, resumen,
 * preflight de pérdidas y su aceptación) y de las tres salidas del editor:
 * PNG y GLB (en `export-scene-actions.ts`, por presupuesto de tamaño) y DXF.
 * Mismo patrón que `palettes/paper-spaces-host.ts`: clase +
 * `useSyncExternalStore`, setters con la firma de React para que los puntos
 * del monolito que los llaman no cambien ni uno.
 *
 * ## Las acciones NO llaman a ningún hook, a propósito
 *
 * `useCadExportActions` devuelve cierres planos que el editor vuelve a crear
 * en cada render, exactamente como hacía cuando eran `const` dentro de la
 * función del componente: leen los valores de ESE render (estado, props) y
 * los refs en el momento de ejecutarse. No invoca `useState`, `useMemo` ni
 * ningún otro hook, así que no registra nada en React y el orden de hooks
 * del editor no cambia. Lleva prefijo `use` sólo porque la regla
 * `react-hooks/refs` del compilador de React marca «pasar un ref a una
 * función durante el render» para cualquier función SIN ese prefijo, y el
 * trinquete de lint del workspace está exactamente en su techo (163/163):
 * una fábrica `createCadExportActions` idéntica lo rompería por +1. Si el
 * trinquete baja, renombrarla es un cambio de un identificador.
 */
import { useMemo, useSyncExternalStore, type RefObject } from "react";
import type {
  CadDxfExportOptions,
  CadDxfExportSummary,
  CadDxfPreflight,
} from "../dialogs/CadDxfExportDialog";
import { nativeEntityReadinessKind } from "./export-readiness-kind";
import {
  createCadSceneExportActions,
  type CadSceneExportInputs,
} from "./export-scene-actions";
import { assetMeta } from "@/components/cad/viewport/asset-catalog";
import type { Ann, Asset } from "@/components/cad/viewport/scene-objects";
import { defaultCadLayerForAssetKind } from "@/lib/cad/architecture";
import type { CadDocument, CadEntity } from "@/lib/cad/cad-document";
import type { CadCollisionHit } from "@/lib/cad/collisions";
import type { DesignReport } from "@/lib/cad/design-checks";
import {
  cadDocumentNativeDxfHatches,
  cadDocumentDxfBlocks,
  cadDocumentDxfInserts,
  cadDocumentNativeDxfMTexts,
  cadDocumentNativeDxfMleaders,
  cadDocumentDxfExportLosses,
  cadDocumentNativeDxfPrimitives,
  cadDocumentNativeDxfSemanticDimensions,
} from "@/lib/cad/dxf-cad-document";
import {
  evaluateCadDxfExportReadiness,
  type CadDxfExportReadinessEntity,
} from "@/lib/cad/dxf-export-readiness";
import type { CadDxfImportWarning } from "@/lib/cad/dxf-import";
import { CAD_ENTITY_REGISTRY } from "@/lib/cad/entity-runtime";
import { exportCadLayoutDxf } from "@/lib/cad/layout-export-adapter";
import type {
  CadLayer,
  CadLayerAssignments,
  CadLayerId,
} from "@/lib/cad/layers";
import type { CadSafetyIssue } from "@/lib/cad/safety-zones";

export type { CadEditorNotifier } from "./export-scene-actions";

type Updater<T> = T | ((previous: T) => T);

/**
 * La firma de un setter de React, calcada: dos sobrecargas para que el
 * parámetro de la función actualizadora INFIERA su tipo en el sitio de
 * llamada (`setX(current => …)`).
 */
interface CadStateSetter<T> {
  (value: T): void;
  (updater: (previous: T) => T): void;
}

function resolve<T>(value: Updater<T>, previous: T): T {
  return typeof value === "function"
    ? (value as (previous: T) => T)(previous)
    : value;
}

export interface CadExportSnapshot {
  /** El cuadro «Exportar DXF» está abierto. */
  showDxfExport: boolean;
  dxfExportOptions: CadDxfExportOptions;
  dxfExportSummary: CadDxfExportSummary;
  /**
   * PREFLIGHT de pérdidas del DXF.
   *
   * El flujo era: generar Blob → `a.click()` → cerrar el modal → decir "listo"
   * → y SÓLO entonces calcular qué se había perdido. El usuario recibía el
   * fichero y el mensaje de éxito antes de saber que había geometría dentro
   * que el DXF no representa, y con el modal ya cerrado no quedaba superficie
   * donde leer el detalle.
   *
   * Ahora las pérdidas se calculan ANTES de existir el Blob, con exactamente
   * el mismo alcance, selección, capas y opciones con los que se exportaría.
   * `token` describe esa entrada: si cambia el documento, la selección, el
   * alcance o las opciones, la aceptación anterior deja de ser válida.
   */
  dxfPreflight: CadDxfPreflight | null;
  dxfPreflightAccepted: string | null;
}

const INITIAL: CadExportSnapshot = {
  showDxfExport: false,
  dxfExportOptions: {
    scope: "all",
    includeHidden: true,
    includeMeasurements: true,
    includeLabels: true,
    units: "mm",
    fileName: "",
  },
  dxfExportSummary: {
    objects: 0,
    connectors: 0,
    measurements: 0,
    labels: 0,
    layers: 0,
    canExport: false,
    includedLayers: [],
    layerSummary: [],
    issues: [],
  },
  dxfPreflight: null,
  dxfPreflightAccepted: null,
};

export class CadExportHost {
  private snapshot: CadExportSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Estable por identidad: `useSyncExternalStore` compara así. */
  getSnapshot = (): CadExportSnapshot => this.snapshot;

  /**
   * Como `useState`: si ningún valor cambia (`Object.is`), no hay instantánea
   * nueva ni aviso a los suscriptores — el editor no vuelve a pintar por un
   * `setDxfPreflight(null)` que ya era `null`, igual que antes de la mudanza.
   */
  private patch(next: Partial<CadExportSnapshot>): void {
    const keys = Object.keys(next) as (keyof CadExportSnapshot)[];
    if (keys.every((key) => Object.is(next[key], this.snapshot[key]))) return;
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  setShowDxfExport: CadStateSetter<boolean> = (
    value: Updater<boolean>,
  ): void => {
    this.patch({ showDxfExport: resolve(value, this.snapshot.showDxfExport) });
  };

  setDxfExportOptions: CadStateSetter<CadDxfExportOptions> = (
    value: Updater<CadDxfExportOptions>,
  ): void => {
    this.patch({
      dxfExportOptions: resolve(value, this.snapshot.dxfExportOptions),
    });
  };

  setDxfExportSummary: CadStateSetter<CadDxfExportSummary> = (
    value: Updater<CadDxfExportSummary>,
  ): void => {
    this.patch({
      dxfExportSummary: resolve(value, this.snapshot.dxfExportSummary),
    });
  };

  setDxfPreflight: CadStateSetter<CadDxfPreflight | null> = (
    value: Updater<CadDxfPreflight | null>,
  ): void => {
    this.patch({ dxfPreflight: resolve(value, this.snapshot.dxfPreflight) });
  };

  setDxfPreflightAccepted: CadStateSetter<string | null> = (
    value: Updater<string | null>,
  ): void => {
    this.patch({
      dxfPreflightAccepted: resolve(value, this.snapshot.dxfPreflightAccepted),
    });
  };
}

/** Un anfitrión por montaje del editor (misma vida que el resto de hosts). */
export function useCadExportHost(): CadExportHost {
  return useMemo(() => new CadExportHost(), []);
}

/** El estado vivo, suscrito. El editor lo desestructura con sus nombres de siempre. */
export function useCadExport(host: CadExportHost): CadExportSnapshot {
  return useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
}

/**
 * Lo que el bloque lee de cada colección del editor — la forma MÍNIMA, no los
 * tipos privados del monolito (`Placement`, `SelItem`, `St`, `Conn`, `Layout`).
 */
export interface CadExportPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

export interface CadExportInputs extends CadSceneExportInputs {
  branding: { productLabel: string };
  // Estado del RENDER en curso: los cierres leen exactamente lo que leían.
  exportState: CadExportSnapshot;
  cadLayers: CadLayer[];
  layerAssignments: CadLayerAssignments;
  objectTags: Record<string, string>;
  report: DesignReport | null;
  collisionHits: CadCollisionHit[];
  safetyIssues: CadSafetyIssue[];
  dxfWarnings: CadDxfImportWarning[];
  // Refs del editor: se derreferencian sólo dentro de cada acción.
  currentDocumentIdRef: RefObject<string | undefined>;
  selRef: RefObject<{ id: string }[]>;
  nativeSelectionIdsRef: RefObject<string[]>;
  placementsRef: RefObject<Map<string, CadExportPlacement>>;
  assetsRef: RefObject<Map<string, Asset>>;
  connectorsRef: RefObject<{ from: string; to: string }[]>;
  annotationsRef: RefObject<Map<string, Ann>>;
  stationsByIdRef: RefObject<Map<string, { station: string }>>;
  layersRef: RefObject<{ notes: boolean }>;
  // Devoluciones de llamada.
  snapshotDocument: () => CadDocument;
}

export interface CadExportActions {
  exportPng: () => void;
  exportGltf: () => Promise<void>;
  computeDxfExportSummary: (
    options: CadDxfExportOptions,
  ) => CadDxfExportSummary;
  setDxfOption: (patch: Partial<CadDxfExportOptions>) => void;
  openDxfExport: () => void;
  exportDxf: (options?: CadDxfExportOptions) => Promise<void>;
}

const DXF_LABEL_REQUIRED_ASSET_KINDS = new Set([
  "workbench",
  "rack",
  "robot",
  "oven",
  "printer",
  "machine",
  "gantry",
  "cabinet",
  "pallet",
  "desk",
  "bin",
  "safety",
  "wall",
  "column",
  "door",
  "room",
  "fence",
  "agv",
  "agvpath",
  "zone",
]);

/**
 * Las acciones del editor, con los cuerpos movidos tal cual del monolito; lo
 * único que cambia es de dónde salen los identificadores del cierre. No
 * invoca ningún hook (ver la cabecera del fichero sobre el prefijo `use`).
 */
export function useCadExportActions(
  host: CadExportHost,
  inputs: CadExportInputs,
): CadExportActions {
  const { exportPng, exportGltf } = createCadSceneExportActions(inputs);
  const {
    model,
    revision,
    branding,
    exportState,
    data,
    cadLayers,
    layerAssignments,
    objectTags,
    report,
    collisionHits,
    safetyIssues,
    dxfWarnings,
    loadedCadDocumentRef,
    currentDocumentIdRef,
    selRef,
    nativeSelectionIdsRef,
    placementsRef,
    assetsRef,
    connectorsRef,
    annotationsRef,
    stationsByIdRef,
    layersRef,
    snapshotDocument,
    toast,
  } = inputs;
  const { dxfExportOptions, dxfPreflight, dxfPreflightAccepted } = exportState;
  const {
    setShowDxfExport,
    setDxfExportOptions,
    setDxfExportSummary,
    setDxfPreflight,
    setDxfPreflightAccepted,
  } = host;
  const computeDxfExportSummary = (
    options: CadDxfExportOptions,
  ): CadDxfExportSummary => {
    const selectedIds = new Set(selRef.current.map((item) => item.id));
    const selectedNativeIds = new Set(nativeSelectionIdsRef.current);
    const layerLabel = (id: CadLayerId) =>
      cadLayers.find((layer) => layer.id === id)?.label ?? id;
    const layerVisible = (id: CadLayerId) =>
      cadLayers.find((layer) => layer.id === id)?.visible ?? true;
    const entities: CadDxfExportReadinessEntity[] = [
      ...[...placementsRef.current.keys()].map((id) => {
        const layerId = layerAssignments[id] ?? "layout";
        return {
          id,
          kind: "object" as const,
          layer: layerLabel(layerId),
          label: stationsByIdRef.current.get(id)?.station,
          requiresLabel: true,
          selected: selectedIds.has(id),
          visible: layerVisible(layerId),
        };
      }),
      ...[...assetsRef.current.values()].map((asset) => {
        const layerId =
          layerAssignments[asset.id] ??
          defaultCadLayerForAssetKind(asset.kind, objectTags[asset.id]);
        return {
          id: asset.id,
          kind: "object" as const,
          layer: layerLabel(layerId),
          label: asset.label,
          requiresLabel: DXF_LABEL_REQUIRED_ASSET_KINDS.has(asset.kind),
          selected: selectedIds.has(asset.id),
          visible: layerVisible(layerId),
        };
      }),
      ...connectorsRef.current.map((conn) => ({
        id: `${conn.from}:${conn.to}`,
        kind: "connector" as const,
        layer: layerLabel("flow"),
        selected: selectedIds.has(conn.from) && selectedIds.has(conn.to),
        visible: layerVisible("flow"),
      })),
      ...[...annotationsRef.current.values()]
        .filter((ann) => ann.type === "dim" && ann.x2 != null && ann.y2 != null)
        .map((ann) => ({
          id: ann.id,
          kind: "measurement" as const,
          layer: layerLabel("measurements"),
          label: ann.text,
          selected: true,
          visible: layerVisible("measurements"),
        })),
      ...[...annotationsRef.current.values()]
        .filter((ann) => ann.type === "text")
        .map((ann) => ({
          id: ann.id,
          kind: "label" as const,
          layer: layerLabel(layerAssignments[ann.id] ?? "Text"),
          label: ann.text,
          selected: true,
          visible: layersRef.current.notes,
        })),
      ...(loadedCadDocumentRef.current?.entities ?? [])
        .filter((entity) => CAD_ENTITY_REGISTRY.supports(entity))
        .map((entity) => {
          const layer = loadedCadDocumentRef.current?.layers.find(
            (candidate) => candidate.id === entity.layer,
          );
          return {
            id: entity.id,
            kind: nativeEntityReadinessKind(entity.type),
            layer: layer?.name ?? entity.layer,
            label: entity.type.toUpperCase(),
            selected: selectedNativeIds.has(entity.id),
            visible: layer?.visible !== false,
          };
        }),
    ];
    const readiness = evaluateCadDxfExportReadiness({
      scope: options.scope,
      includeHidden: options.includeHidden,
      includeMeasurements: options.includeMeasurements,
      includeLabels: options.includeLabels,
      selectedObjectCount: selectedIds.size + selectedNativeIds.size,
      entities,
      validationBlockers:
        (report?.errors ?? 0) + collisionHits.length + safetyIssues.length,
      validationWarnings: (report?.warnings ?? 0) + dxfWarnings.length,
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
  const setDxfOption = (patch: Partial<CadDxfExportOptions>) => {
    setDxfExportOptions((cur) => {
      const next = { ...cur, ...patch };
      setDxfExportSummary(computeDxfExportSummary(next));
      return next;
    });
  };
  const openDxfExport = () => {
    const next = {
      ...dxfExportOptions,
      units: data?.footprint.unit === "m" ? ("m" as const) : ("mm" as const),
      fileName: `layout-${model}-${revision}`.replace(/[^\w.\-]+/g, "_"),
    };
    setDxfExportOptions(next);
    setDxfExportSummary(computeDxfExportSummary(next));
    setShowDxfExport(true);
  };
  /**
   * Huella de la ENTRADA del preflight: documento, alcance, selección, capas
   * ocultas y opciones. Aceptar unas pérdidas vale sólo para esta huella; en
   * cuanto cambia algo que puede alterar lo que se pierde, hay que volver a
   * mirar. Se usa la versión del documento —que sube en cada `commitChange`—
   * en vez de serializarlo entero, que en un plano grande sería caro.
   */
  const dxfPreflightToken = (
    options: CadDxfExportOptions,
    document: CadDocument,
  ) =>
    JSON.stringify({
      documentId: currentDocumentIdRef.current,
      version: document.meta.version,
      entities: document.entities.length,
      scope: options.scope,
      includeHidden: options.includeHidden,
      includeMeasurements: options.includeMeasurements,
      includeLabels: options.includeLabels,
      units: options.units,
      selection:
        options.scope === "selection"
          ? [...nativeSelectionIdsRef.current].sort()
          : null,
      hiddenLayers: document.layers
        .filter((layer) => layer.visible === false)
        .map((layer) => layer.id)
        .sort(),
    });
  const exportDxf = async (options: CadDxfExportOptions = dxfExportOptions) => {
    try {
      const summary = computeDxfExportSummary(options);
      setDxfExportSummary(summary);
      const blocker = summary.issues.find((issue) => issue.level === "blocker");
      if (blocker) {
        toast.error(blocker.message, "DXF");
        return;
      }
      const layerLabel = (id: CadLayerId) =>
        cadLayers.find((layer) => layer.id === id)?.label ?? id;
      const layerVisible = (id: CadLayerId) =>
        cadLayers.find((layer) => layer.id === id)?.visible ?? true;
      const includeLayer = (id: CadLayerId) =>
        options.includeHidden || layerVisible(id);
      const centerFor = (id: string): { x: number; y: number } | null => {
        const p = placementsRef.current.get(id);
        if (p) return { x: p.x, y: p.y };
        const asset = assetsRef.current.get(id);
        if (asset) return { x: asset.x, y: asset.y };
        return null;
      };
      const selectedIds = new Set(selRef.current.map((item) => item.id));
      const selectedNativeIds = new Set(nativeSelectionIdsRef.current);
      const includeObject = (id: string, fallback: CadLayerId) => {
        if (options.scope === "selection" && !selectedIds.has(id)) return false;
        return includeLayer(layerAssignments[id] ?? fallback);
      };
      const boxes = [
        ...[...placementsRef.current.entries()]
          .filter(([id]) => includeObject(id, "layout"))
          .map(([id, p]) => ({
            id,
            label: stationsByIdRef.current.get(id)?.station ?? id,
            x: p.x,
            y: p.y,
            width: p.w,
            height: p.h,
            rotation: p.rotation,
            layer: layerLabel(layerAssignments[id] ?? "layout"),
          })),
        ...[...assetsRef.current.values()]
          .filter((asset) =>
            includeObject(
              asset.id,
              defaultCadLayerForAssetKind(asset.kind, objectTags[asset.id]),
            ),
          )
          .map((asset) => ({
            id: asset.id,
            label: asset.label || assetMeta(asset.kind).label,
            x: asset.x,
            y: asset.y,
            width: asset.w,
            height: asset.h,
            rotation: asset.rotation,
            layer: layerLabel(
              layerAssignments[asset.id] ??
                defaultCadLayerForAssetKind(asset.kind, objectTags[asset.id]),
            ),
            ...(asset.shape === "circle" ? { shape: "circle" as const } : {}),
            ...(assetMeta(asset.kind).archetype === "zone"
              ? { hatch: true }
              : {}),
          })),
      ];
      const connectors = connectorsRef.current
        .map((conn) => {
          if (!includeLayer("flow")) return null;
          if (
            options.scope === "selection" &&
            (!selectedIds.has(conn.from) || !selectedIds.has(conn.to))
          )
            return null;
          const from = centerFor(conn.from);
          const to = centerFor(conn.to);
          return from && to ? { from, to, layer: layerLabel("flow") } : null;
        })
        .filter(
          (
            conn,
          ): conn is {
            from: { x: number; y: number };
            to: { x: number; y: number };
            layer: string;
          } => !!conn,
        );
      const labels =
        options.includeLabels &&
        (options.includeHidden || layersRef.current.notes)
          ? [...annotationsRef.current.values()]
              .filter((ann) => ann.type === "text")
              .map((ann) => ({
                text: ann.text || "Nota",
                x: ann.x,
                y: ann.y,
                layer: layerLabel(layerAssignments[ann.id] ?? "Text"),
              }))
          : [];
      const measurements =
        options.includeMeasurements && includeLayer("measurements")
          ? [...annotationsRef.current.values()]
              .filter(
                (ann) => ann.type === "dim" && ann.x2 != null && ann.y2 != null,
              )
              .map((ann) => ({
                from: { x: ann.x, y: ann.y },
                to: { x: ann.x2!, y: ann.y2! },
                label: ann.text,
                layer: layerLabel("measurements"),
              }))
          : [];
      const dxfDocument = snapshotDocument();
      // Un único predicado: el informe de pérdidas DEBE mirar exactamente las
      // mismas entidades que se exportan, o avisaría de cosas que no viajan.
      const dxfExportEntityFilter = (entity: CadEntity) => {
        if (!CAD_ENTITY_REGISTRY.supports(entity)) return false;
        if (options.scope === "selection" && !selectedNativeIds.has(entity.id))
          return false;
        const layer = loadedCadDocumentRef.current?.layers.find(
          (candidate) => candidate.id === entity.layer,
        );
        return options.includeHidden || layer?.visible !== false;
      };
      const primitives = cadDocumentNativeDxfPrimitives(
        dxfDocument,
        dxfExportEntityFilter,
      );
      const hatches = cadDocumentNativeDxfHatches(dxfDocument, (entity) => {
        if (options.scope === "selection" && !selectedNativeIds.has(entity.id))
          return false;
        const layer = loadedCadDocumentRef.current?.layers.find(
          (candidate) => candidate.id === entity.layer,
        );
        return options.includeHidden || layer?.visible !== false;
      });
      const mtexts = options.includeLabels
        ? cadDocumentNativeDxfMTexts(dxfDocument, (entity) => {
            if (
              options.scope === "selection" &&
              !selectedNativeIds.has(entity.id)
            )
              return false;
            const layer = loadedCadDocumentRef.current?.layers.find(
              (candidate) => candidate.id === entity.layer,
            );
            return options.includeHidden || layer?.visible !== false;
          })
        : [];
      const semanticDimensions = options.includeMeasurements
        ? cadDocumentNativeDxfSemanticDimensions(dxfDocument, (entity) => {
            if (
              options.scope === "selection" &&
              !selectedNativeIds.has(entity.id)
            )
              return false;
            const layer = loadedCadDocumentRef.current?.layers.find(
              (candidate) => candidate.id === entity.layer,
            );
            return options.includeHidden || layer?.visible !== false;
          })
        : [];
      const mleaders = options.includeLabels
        ? cadDocumentNativeDxfMleaders(dxfDocument, (entity) => {
            if (
              options.scope === "selection" &&
              !selectedNativeIds.has(entity.id)
            )
              return false;
            const layer = loadedCadDocumentRef.current?.layers.find(
              (candidate) => candidate.id === entity.layer,
            );
            return options.includeHidden || layer?.visible !== false;
          })
        : [];
      const blocks = cadDocumentDxfBlocks(dxfDocument);
      const inserts = cadDocumentDxfInserts(dxfDocument, (entity) => {
        if (options.scope === "selection" && !selectedNativeIds.has(entity.id))
          return false;
        const layer = dxfDocument.layers.find(
          (candidate) => candidate.id === entity.layer,
        );
        return options.includeHidden || layer?.visible !== false;
      });
      const exported = exportCadLayoutDxf(
        {
          boxes,
          connectors,
          labels,
          measurements,
          primitives,
          hatches,
          mtexts,
          semanticDimensions,
          mleaders,
          blocks,
          inserts,
          // Las capas con su tipo de línea y grosor, la tabla LTYPE y $LTSCALE
          // salen del DOCUMENTO (Ola F): sin él, GAS = GAS_LINE volvía como
          // 6 CONTINUOUS y el plano de instalaciones se abría continuo.
          document: dxfDocument,
        },
        {
          units: options.units,
          fileComment: `${branding.productLabel} ${model} ${revision}`,
        },
      );
      // ── PREFLIGHT ──────────────────────────────────────────────────────
      // Las pérdidas se calculan con el MISMO filtro que se acaba de usar para
      // construir el modelo, y ANTES de que exista el Blob. Un DXF limpio
      // descarga directamente; uno con pérdidas exige verlas primero, y si
      // alguna elimina geometría, aceptarlas explícitamente.
      const exportLosses = cadDocumentDxfExportLosses(
        dxfDocument,
        dxfExportEntityFilter,
      );
      const token = dxfPreflightToken(options, dxfDocument);
      if (exportLosses.length > 0) {
        const blocking = exportLosses.some((loss) => loss.severity === "error");
        const alreadyReported = dxfPreflight?.token === token;
        setDxfPreflight({ token, losses: exportLosses, blocking });
        // Primera pulsación sobre una entrada con pérdidas: se ENSEÑA el
        // informe y no se descarga nada. Nunca se anuncia éxito antes de que
        // el usuario haya podido ver lo que el DXF no representa.
        if (!alreadyReported) {
          toast.error(
            blocking
              ? `El DXF no puede representar ${exportLosses.filter((loss) => loss.severity === "error").length} entidad(es). Revisa el informe y confirma si quieres descargarlo igualmente.`
              : `El DXF degrada ${exportLosses.length} entidad(es). Revisa el informe antes de descargar.`,
            "DXF",
          );
          return;
        }
        // Una pérdida que ELIMINA geometría exige además aceptación explícita;
        // una degradación se descarga tras haberse mostrado. La aceptación es
        // de ESTA entrada: si cambió el documento, la selección, el alcance o
        // las opciones, el token cambia y vuelve a pedirse.
        if (blocking && dxfPreflightAccepted !== token) {
          toast.error(
            "Confirma que aceptas las pérdidas antes de descargar el DXF.",
            "DXF",
          );
          return;
        }
      } else {
        setDxfPreflight(null);
      }

      const blob = new Blob([exported.content], { type: "application/dxf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(options.fileName.trim() || `layout-${model}-${revision}`).replace(/[^\w.\-]+/g, "_")}.dxf`;
      a.click();
      URL.revokeObjectURL(url);
      setShowDxfExport(false);
      setDxfPreflight(null);
      setDxfPreflightAccepted(null);
      toast.success(
        exportLosses.length
          ? `Layout exportado a DXF (${exported.entityCount} entidades) con ${exportLosses.length} pérdida(s) aceptada(s). Conserva el documento de Valle Design como original.`
          : `Layout exportado a DXF (${exported.entityCount} entidades).`,
        "DXF",
      );
    } catch {
      toast.error("No se pudo exportar el DXF.", "DXF");
    }
  };
  return {
    exportPng,
    exportGltf,
    computeDxfExportSummary,
    setDxfOption,
    openDxfExport,
    exportDxf,
  };
}
