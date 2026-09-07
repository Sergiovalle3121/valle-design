/**
 * LAS SALIDAS DE ESCENA: PNG y GLB (F1 · paso 1 del plan de extracción).
 *
 * Separadas de `export-host.ts` sólo por el presupuesto de 800 líneas por
 * fichero (`scripts/cad/monolith-budget.json`): son las dos acciones que leen
 * el renderer, la escena y la cámara del editor, y ninguna toca el estado del
 * cuadro de exportar DXF. Los cuerpos están movidos tal cual del monolito;
 *
 * ## T-12·2 · El PNG sale con la cámara ACTIVA
 *
 * `exportPng` pintaba con la `PerspectiveCamera` cruda del editor aunque el
 * visor estuviera en planta, donde la cámara activa es la ORTOGRÁFICA: el PNG
 * que se mandaba al cliente no era lo que había en pantalla y llevaba la
 * deformación que `lib/cad/view/perspective-distortion.spec.ts` declara
 * inaceptable. Ahora pide la cámara al controlador de vista —la misma que usa
 * el bucle de render— y sólo cae a la de perspectiva si aún no hay controlador.
 */
import type { RefObject } from "react";
import type * as THREE from "three";
import type { CadNativeMassHosts } from "@/components/cad/viewport/native-mass-hosts";
import type { CadSolidShadeHost } from "@/components/cad/viewport/solid-shade-host";
import type { CadDocument } from "@/lib/cad/cad-document";
import {
  hideCadGlbOverlays,
  planCadGlbExport,
  serializeCadGlbBlob,
} from "@/lib/cad/glb-export";
import { unitToMeters, type WorldUnit } from "@/lib/cad/world-scale";

/** Lo que las acciones dicen al usuario: el `toast` del editor, sin `info`. */
export interface CadEditorNotifier {
  success(message: string, title?: string): void;
  error(message: string, title?: string): void;
}

export interface CadSceneExportInputs {
  // Props del editor.
  model: string;
  revision: string;
  // Estado del RENDER en curso: sólo se lee `footprint.unit`.
  data: { footprint: { unit: string } } | null;
  // Refs del editor: se derreferencian sólo dentro de cada acción.
  rendererRef: RefObject<THREE.WebGLRenderer | null>;
  sceneRef: RefObject<THREE.Scene | null>;
  cameraRef: RefObject<THREE.PerspectiveCamera | null>;
  /** El controlador de vista: su `camera` es la activa (ortográfica en planta). */
  viewControllerRef: RefObject<{ camera: THREE.Camera } | null>;
  ctxRef: RefObject<{ s: number; W: number; H: number } | null>;
  previewLineRef: RefObject<THREE.Line | null>;
  blocksRef: RefObject<THREE.Group | null>;
  assetsGroupRef: RefObject<THREE.Group | null>;
  connsGroupRef: RefObject<THREE.Group | null>;
  groundRef: RefObject<THREE.Mesh | null>;
  nativeMassHostsRef: RefObject<CadNativeMassHosts | null>;
  solidShadeHostRef: RefObject<CadSolidShadeHost | null>;
  loadedCadDocumentRef: RefObject<CadDocument | null>;
  toast: CadEditorNotifier;
}

export interface CadSceneExportActions {
  exportPng: () => void;
  exportGltf: () => Promise<void>;
}

/**
 * La cámara con la que se pinta el PNG: la activa del controlador de vista
 * (ortográfica en planta, perspectiva en volumen) y, si todavía no hay
 * controlador montado, la de perspectiva del editor. Pura, para su spec.
 */
export function pickCadExportCamera(
  active: THREE.Camera | null | undefined,
  fallback: THREE.Camera | null,
): THREE.Camera | null {
  return active ?? fallback;
}

/**
 * NO es un hook: cierres planos, recreados en cada render del editor, como
 * los `const` que eran.
 */
export function createCadSceneExportActions(
  inputs: CadSceneExportInputs,
): CadSceneExportActions {
  const {
    model,
    revision,
    data,
    rendererRef,
    sceneRef,
    cameraRef,
    viewControllerRef,
    ctxRef,
    previewLineRef,
    blocksRef,
    assetsGroupRef,
    connsGroupRef,
    groundRef,
    nativeMassHostsRef,
    solidShadeHostRef,
    loadedCadDocumentRef,
    toast,
  } = inputs;
  const exportPng = () => {
    const r = rendererRef.current,
      sc = sceneRef.current,
      cam = pickCadExportCamera(viewControllerRef.current?.camera, cameraRef.current);
    if (!r || !sc || !cam) return;
    r.render(sc, cam);
    const a = document.createElement("a");
    a.href = r.domElement.toDataURL("image/png");
    a.download = `layout3d-${model}-${revision}.png`.replace(/[^\w.\-]+/g, "_");
    a.click();
  };
  // El PDF de la Fase 65 (render + cajetín a mano con jsPDF) se retiró: era
  // código de rollback sin llamadas y duplicaba a mano lo que lib/cad/plot
  // hace con contrato y specs. La única salida PDF del producto es
  // publishSheetSetPdf (conjunto de hojas).
  // Export the 3D model as binary glTF (.glb) — opens in Blender, other CAD, etc.
  const exportGltf = async () => {
    // Lista, plan y serialización viven en `lib/cad/glb-export.ts` con su
    // spec de round-trip: el GLB lleva el modelo heredado Y la arquitectura
    // nativa — antes sólo viajaban los grupos heredados y ningún spec miraba.
    const plan = planCadGlbExport(
      {
        legacy: [
          blocksRef.current,
          assetsGroupRef.current,
          connsGroupRef.current,
          groundRef.current,
        ],
        architecture: [
          nativeMassHostsRef.current?.group,
          solidShadeHostRef.current?.group,
        ],
      },
      (loadedCadDocumentRef.current?.entities ?? []).some(
        (entity) => entity.type === "wall" || entity.type === "solid3d",
      ),
    );
    if (plan.kind === "empty") return;
    if (plan.kind === "architecture-missing") {
      toast.error(
        "La vista 3D aún no materializó la arquitectura; abre la vista 3D y reintenta.",
        "Vista 3D",
      );
      return;
    }
    try {
      // `s` es la escala de AJUSTE DE CÁMARA con la que se construyó TODA la
      // geometría de la escena (línea 6032: `s = 30 / Math.max(W, H)`), no una
      // conversión de unidades: un predio de 4 m y uno de 400 m ocupan el
      // mismo cubo de cámara. Exportar esas coordenadas tal cual entregaba un
      // GLB cuyo metro no medía un metro real — glTF declara 1 unidad = 1
      // metro — y la distorsión cambiaba con el tamaño de CADA predio. Se
      // deshace aquí, no en el visor: el visor necesita el ajuste de cámara.
      const unit = (data?.footprint.unit || "mm") as WorldUnit;
      const exportScale = ctxRef.current
        ? unitToMeters(1, unit) / ctxRef.current.s
        : 1;
      const blob = await serializeCadGlbBlob(plan.objects, {
        // Etiquetas y línea de previsualización fuera: geometría limpia.
        hide: () =>
          hideCadGlbOverlays(
            sceneRef.current,
            (object) =>
              !!object.userData?.isLabel || object === previewLineRef.current,
          ),
        exportScale,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `layout3d-${model}-${revision}.glb`.replace(
        /[^\w.\-]+/g,
        "_",
      );
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Modelo 3D exportado (.glb).", "Modelo 3D");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo exportar el modelo 3D.", "Modelo 3D");
    }
  };
  return { exportPng, exportGltf };
}
