/**
 * VPORTS en espacio MODELO: dividir el visor en varias ventanas, cada una con
 * su propia cámara.
 *
 * ## Por qué es de SESIÓN y no del documento
 *
 * `CadPaperViewport` (`cad-paper-viewport.ts`) es la ventana de una LÁMINA:
 * vive en el documento, viaja por disco y decide qué imprime. Una división del
 * visor de MODELO es lo contrario — es cómo UNA persona mira mientras dibuja,
 * como ya son de sesión los marcadores de vista (`viewport-bookmarks.ts`, del
 * que este módulo toma prestado `CadViewportCameraSnapshot`): dos personas con
 * el mismo plano abierto pueden tener cada una su propio reparto de pantalla,
 * y guardarlo en el documento lo haría viajar por la red y aparecer en el
 * diff de alguien que sólo movió una ventana de SU pantalla.
 *
 * ## Qué modela, y qué no — todavía
 *
 * Cuatro repartos fijos (uno, dos en columnas, dos en filas, cuatro iguales),
 * cada uno con sus rectángulos FRACCIONARIOS (0..1, independientes del tamaño
 * real del visor) y, al crearse, la MISMA cámara que tenía el visor único —
 * que es lo que hace `VPORTS` en cualquier CAD: parte de donde estabas, no de
 * un encuadre inventado. Reparto irregular o redimensionable a mano no entra
 * en esta ola; se declara la lista cerrada (`CAD_MODEL_VIEWPORT_LAYOUTS`) en
 * vez de fingir una API abierta que sólo cubre cuatro casos.
 */
import type { CadViewportCameraSnapshot } from "./viewport-bookmarks";

export const CAD_MODEL_VIEWPORT_LAYOUTS = ["1", "2-cols", "2-rows", "4"] as const;

export type CadModelViewportLayoutId = (typeof CAD_MODEL_VIEWPORT_LAYOUTS)[number];

/** Rectángulo FRACCIONARIO (0..1) de una ventana dentro del visor entero. */
export interface CadModelViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CadModelViewportTile {
  id: string;
  rect: CadModelViewportRect;
}

const LAYOUT_RECTS: Record<CadModelViewportLayoutId, readonly CadModelViewportRect[]> = {
  "1": [{ x: 0, y: 0, w: 1, h: 1 }],
  "2-cols": [
    { x: 0, y: 0, w: 0.5, h: 1 },
    { x: 0.5, y: 0, w: 0.5, h: 1 },
  ],
  "2-rows": [
    { x: 0, y: 0, w: 1, h: 0.5 },
    { x: 0, y: 0.5, w: 1, h: 0.5 },
  ],
  "4": [
    { x: 0, y: 0, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0, w: 0.5, h: 0.5 },
    { x: 0, y: 0.5, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
  ],
};

/** Los rectángulos fraccionarios de un reparto. Cubren el visor ENTERO, sin huecos ni solapes. */
export function cadModelViewportTiles(layout: CadModelViewportLayoutId): readonly CadModelViewportTile[] {
  return LAYOUT_RECTS[layout].map((rect, index) => ({ id: `vp${index + 1}`, rect }));
}

export interface CadModelViewport {
  id: string;
  rect: CadModelViewportRect;
  camera: CadViewportCameraSnapshot;
  /** La ventana con el foco de teclado/ratón; sólo ella dibuja con el cursor activo. */
  active: boolean;
}

/**
 * Construye el reparto ENTERO a partir de la cámara del visor único. Todas las
 * ventanas nuevas arrancan mirando lo mismo que se estaba mirando — es la
 * única forma de que dividir la pantalla no descoloque el dibujo — y la
 * PRIMERA queda activa, igual que hace `VPORTS` en cualquier CAD.
 */
export function createCadModelViewportSplit(
  layout: CadModelViewportLayoutId,
  currentCamera: CadViewportCameraSnapshot,
): CadModelViewport[] {
  return cadModelViewportTiles(layout).map((tile, index) => ({
    id: tile.id,
    rect: tile.rect,
    camera: { ...currentCamera, position: { ...currentCamera.position }, target: { ...currentCamera.target } },
    active: index === 0,
  }));
}

/** Cambia la cámara de UNA ventana del reparto, sin tocar las demás. */
export function setCadModelViewportCamera(
  viewports: readonly CadModelViewport[],
  viewportId: string,
  camera: CadViewportCameraSnapshot,
): CadModelViewport[] {
  return viewports.map((viewport) => (viewport.id === viewportId ? { ...viewport, camera } : viewport));
}

/** Mueve el foco a otra ventana del reparto; como máximo UNA está activa. */
export function setCadModelViewportActive(
  viewports: readonly CadModelViewport[],
  viewportId: string,
): CadModelViewport[] {
  if (!viewports.some((viewport) => viewport.id === viewportId)) return viewports as CadModelViewport[];
  return viewports.map((viewport) => ({ ...viewport, active: viewport.id === viewportId }));
}
