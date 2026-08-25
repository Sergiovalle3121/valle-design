/**
 * Encuadres de cámara del visor 3D en vivo: seis posiciones fijas alrededor
 * del origen, a una distancia proporcional al footprint de la planta.
 *
 * Vive fuera de `Layout3DEditor.tsx` porque el monolito ya está en su tope
 * de líneas presupuestadas (`scripts/cad/monolith-budget.json`) — y porque
 * esta lógica no depende de React ni del propio componente, sólo de la
 * cámara, los controles de órbita y el contexto de escena `{s, W, H}` que el
 * editor ya calcula.
 *
 * "back"/"left"/"right" comparten el signo de eje de sus pares en planta de
 * SOLVIEW (`CAD_VIEWPORT_ORTHO_VIEWS` en `lib/cad/layout/viewport-view.ts`):
 * X de escena es X de planta sin invertir (sólo Y/Z de planta se
 * intercambian al pasar a espacio de escena, ver `room-solid-three.ts`), así
 * que "left" cae en X negativo igual que "izquierda" cae en X negativo allá.
 */
import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LucideIcon } from "lucide-react";
import {
  Maximize2,
  Eye,
  Layers,
  SquareStack,
  ArrowLeftToLine,
  ArrowRightToLine,
} from "lucide-react";

export type CadCameraViewPreset =
  | "top"
  | "iso"
  | "front"
  | "back"
  | "left"
  | "right";

/**
 * Los botones de la barra del visor 3D para estos presets: preset, tooltip
 * en español, ícono — en el orden en que aparecen en la barra.
 */
export const CAD_CAMERA_VIEW_PRESET_BUTTONS: readonly (readonly [
  CadCameraViewPreset,
  string,
  LucideIcon,
])[] = [
  ["iso", "Vista isométrica", Maximize2],
  ["top", "Vista superior (planta)", Eye],
  ["front", "Vista frontal", Layers],
  ["back", "Vista posterior", SquareStack],
  ["left", "Vista lateral izquierda", ArrowLeftToLine],
  ["right", "Vista lateral derecha", ArrowRightToLine],
];

/** El mismo contexto de escena que el editor guarda en `ctxRef`. */
export interface CadCameraSceneContext {
  /** Escala mundo→escena. */
  s: number;
  /** Ancho del footprint, en unidades de planta. */
  W: number;
  /** Alto del footprint, en unidades de planta. */
  H: number;
}

/**
 * Posiciona `camera` y apunta `controls` al origen según `preset`. Todas las
 * vistas laterales/alzado comparten la misma altura y distancia que
 * "front" — sólo cambia de qué lado del origen se mira.
 */
export function applyCadCameraViewPreset(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  ctx: CadCameraSceneContext,
  preset: CadCameraViewPreset,
): void {
  const d = Math.max(ctx.W, ctx.H) * ctx.s;
  if (preset === "top") camera.position.set(0, d * 1.5, 0.01);
  else if (preset === "front") camera.position.set(0, d * 0.5, d * 1.3);
  else if (preset === "back") camera.position.set(0, d * 0.5, -d * 1.3);
  else if (preset === "left") camera.position.set(-d * 1.3, d * 0.5, 0);
  else if (preset === "right") camera.position.set(d * 1.3, d * 0.5, 0);
  else camera.position.set(d * 0.6, d * 0.85, d * 1.0);
  controls.target.set(0, 0, 0);
  controls.update();
}
