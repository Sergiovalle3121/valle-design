import {
  cadViewPanByPixels,
  cadViewZoomAtCursor,
  type CadView,
} from "../view/cad-view";

export interface ReviewPinch {
  x: number;
  y: number;
  distance: number;
}

/** Keep the point under two fingers fixed while their midpoint moves. */
export function cadReviewPinchUpdate(
  view: CadView,
  previous: ReviewPinch,
  next: ReviewPinch,
): CadView {
  // Los contactos casi coincidentes no dan una escala fiable: un temblor
  // de 1 px no debe acercar el plano decenas de veces.
  if (!(previous.distance >= 12) || !(next.distance >= 12)) return view;
  const zoomed = cadViewZoomAtCursor(
    view,
    previous.x,
    previous.y,
    next.distance / previous.distance,
  );
  return cadViewPanByPixels(
    zoomed,
    next.x - previous.x,
    next.y - previous.y,
  );
}
