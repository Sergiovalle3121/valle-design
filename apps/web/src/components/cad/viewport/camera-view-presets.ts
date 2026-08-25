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
import { boundsIntersect } from "@/lib/cad/entity-hit-geometry";

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

/** Caja mundo (unidades de planta) — el mismo shape que `worldBounds()`. */
export interface CadWorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Posiciona `camera` y apunta `controls` según `preset`. Todas las vistas
 * laterales/alzado comparten la misma altura y distancia que "front" — sólo
 * cambia de qué lado se mira.
 *
 * `content`, si se da y NO se toca en absoluto con el footprint (p. ej. un
 * documento a magnitud UTM sobre un footprint de sitio normal — el mismo
 * caso de P0-3), sustituye al footprint como lo que el preset encuadra: la
 * DIRECCIÓN nombrada del preset se conserva, pero apunta y mide distancia
 * sobre el contenido real en vez de sobre un footprint que no lo contiene.
 * Sin `content`, o cuando se superpone al footprint, el resultado es
 * bit-idéntico al de antes de P0-3 (el footprint sigue siendo el default).
 */
export function applyCadCameraViewPreset(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  ctx: CadCameraSceneContext,
  preset: CadCameraViewPreset,
  content?: CadWorldBounds | null,
): void {
  const footprint: CadWorldBounds = { minX: 0, minY: 0, maxX: ctx.W, maxY: ctx.H };
  const frame = content && !boundsIntersect(content, footprint) ? content : footprint;
  const cx = ((frame.minX + frame.maxX) / 2 - ctx.W / 2) * ctx.s;
  const cz = ((frame.minY + frame.maxY) / 2 - ctx.H / 2) * ctx.s;
  const d = Math.max(frame.maxX - frame.minX, frame.maxY - frame.minY) * ctx.s;
  if (preset === "top") camera.position.set(cx, d * 1.5, cz + 0.01);
  else if (preset === "front") camera.position.set(cx, d * 0.5, cz + d * 1.3);
  else if (preset === "back") camera.position.set(cx, d * 0.5, cz - d * 1.3);
  else if (preset === "left") camera.position.set(cx - d * 1.3, d * 0.5, cz);
  else if (preset === "right") camera.position.set(cx + d * 1.3, d * 0.5, cz);
  else camera.position.set(cx + d * 0.6, d * 0.85, cz + d * 1.0);
  controls.target.set(cx, 0, cz);
  controls.update();
}
