/**
 * Proyección 2D del CAD — la definición única de cómo una coordenada de dibujo
 * se convierte en un píxel y al revés.
 *
 * ## Por qué existe
 *
 * Hoy el dibujo 2D se hace con **una cámara en perspectiva de 50°** mirando casi
 * vertical (`Layout3DEditor.tsx:7024`; el "modo 2D" sólo limita OrbitControls a
 * `maxPolarAngle = 0.05`). Bajo un frustum en perspectiva:
 *
 * - las paralelas convergen;
 * - el "zoom" es un *dolly* de cámara, no un cambio de escala, así que no existe
 *   un factor de escala que se pueda leer ni fijar;
 * - el grosor aparente de una línea cambia según dónde caiga en la pantalla;
 * - la barra de escala tiene que **deducir** la escala proyectando una base de
 *   10 m, y su propio comentario admite que una regla exacta "es frágil bajo una
 *   cámara en perspectiva";
 * - la tolerancia de snap deriva con la distancia de cámara en vez de ser un
 *   número fijo de píxeles.
 *
 * Ningún CAD 2D funciona así. Este módulo define la proyección **ortográfica**
 * que sí lo permite, y lo hace en TypeScript puro —sin THREE, sin DOM— para que
 * se pueda probar exhaustivamente en Node antes de que ninguna cámara cambie.
 *
 * ## La cantidad que lo ordena todo
 *
 * `pixelsPerUnit` **es** el zoom: píxeles de pantalla por unidad de dibujo. De
 * tenerlo explícito salen gratis cosas que hoy son imposibles o aproximadas:
 * la barra de escala exacta, `ZOOM nXP`, el escalado anotativo como una simple
 * multiplicación, el grosor de línea en píxeles invariante al zoom, y una
 * apertura de snap que mide lo mismo a cualquier acercamiento.
 */
import type { CadBounds } from "../entity-runtime";
import type { CadPoint2 } from "../cad-document";

/**
 * Límites de zoom. Fuera de este rango la aritmética de coma flotante deja de
 * ser fiable y la escena degenera; son barandillas, no preferencias.
 */
export const CAD_VIEW_MIN_PIXELS_PER_UNIT = 1e-4;
export const CAD_VIEW_MAX_PIXELS_PER_UNIT = 1e5;

export interface CadView {
  mode: "2d" | "3d";
  /** Centro de la vista, en unidades de DIBUJO (no de escena THREE). */
  centerX: number;
  centerY: number;
  /** El zoom: píxeles de pantalla por unidad de dibujo. Siempre > 0. */
  pixelsPerUnit: number;
  /** Tamaño del lienzo en píxeles CSS. */
  widthPx: number;
  heightPx: number;
  /**
   * Giro de la vista en grados, en sentido antihorario. Reservado para UCS y
   * VIEWTWIST; hoy siempre 0. Se implementa desde el principio porque meterlo
   * después obligaría a revisar cada fórmula de este archivo.
   */
  twistDeg: number;
  /**
   * Signo del desplazamiento en Y de PANTALLA por unidad de Y de DIBUJO,
   * sabiendo que la Y de pantalla crece hacia abajo.
   *
   * - `1`  → la +Y del dibujo se ve hacia ABAJO. **Es el comportamiento actual**:
   *   la cámara vive en `(tx, d, tz + 0.01)` con `up = (0,1,0)`, así que la
   *   pantalla-arriba proyecta a −Z y, como la Y del dibujo mapea a Z, subir en
   *   pantalla baja la Y del dibujo.
   * - `-1` → la +Y del dibujo se ve hacia ARRIBA, que es la convención de
   *   AutoCAD.
   *
   * Se modela explícitamente porque invertirlo es un cambio visible para el
   * usuario: cada golden que hace clic en una coordenada se voltea. Cambiarlo
   * merece su propio PR y su propia nota de versión, no colarse dentro de la
   * migración a ortográfica.
   */
  yScreenSign: 1 | -1;
}

/** La vista que reproduce el plano actual: Y hacia abajo, sin giro. */
export function cadViewFromViewport(
  widthPx: number,
  heightPx: number,
  centerX: number,
  centerY: number,
  pixelsPerUnit: number,
): CadView {
  return {
    mode: "2d",
    centerX,
    centerY,
    pixelsPerUnit: clampPixelsPerUnit(pixelsPerUnit),
    widthPx,
    heightPx,
    twistDeg: 0,
    yScreenSign: 1,
  };
}

export function clampPixelsPerUnit(pixelsPerUnit: number): number {
  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0)
    return CAD_VIEW_MIN_PIXELS_PER_UNIT;
  return Math.min(
    CAD_VIEW_MAX_PIXELS_PER_UNIT,
    Math.max(CAD_VIEW_MIN_PIXELS_PER_UNIT, pixelsPerUnit),
  );
}

function twist(view: CadView): { cos: number; sin: number } {
  if (!view.twistDeg) return { cos: 1, sin: 0 };
  const radians = (view.twistDeg * Math.PI) / 180;
  return { cos: Math.cos(radians), sin: Math.sin(radians) };
}

export function cadViewWorldToScreen(view: CadView, point: CadPoint2): CadPoint2 {
  const dx = point.x - view.centerX;
  const dy = point.y - view.centerY;
  const { cos, sin } = twist(view);
  // El giro se aplica en espacio de dibujo, antes de escalar, para que el
  // factor de escala siga siendo isótropo y `pixelsPerUnit` conserve su
  // significado literal.
  const rx = dx * cos + dy * sin;
  const ry = -dx * sin + dy * cos;
  return {
    x: view.widthPx / 2 + rx * view.pixelsPerUnit,
    y: view.heightPx / 2 + ry * view.pixelsPerUnit * view.yScreenSign,
  };
}

export function cadViewScreenToWorld(view: CadView, screenX: number, screenY: number): CadPoint2 {
  const rx = (screenX - view.widthPx / 2) / view.pixelsPerUnit;
  const ry = (screenY - view.heightPx / 2) / (view.pixelsPerUnit * view.yScreenSign);
  const { cos, sin } = twist(view);
  return {
    x: view.centerX + rx * cos - ry * sin,
    y: view.centerY + rx * sin + ry * cos,
  };
}

/**
 * Rectángulo de dibujo visible, en forma cerrada.
 *
 * Hoy este dato se obtiene lanzando **nueve rayos** contra el plano del suelo
 * (`cadViewportBoundsFromCamera`) porque bajo perspectiva la huella visible es
 * un trapecio y no hay fórmula. Bajo ortográfica es un rectángulo y sale de una
 * división. El `overscan` se conserva: da margen para que un desplazamiento
 * pequeño no obligue a reconstruir el detalle.
 */
export function cadViewBounds(view: CadView, overscanRatio = 0.12): CadBounds {
  // Con giro, la huella es un rectángulo rotado; sus límites alineados a ejes
  // salen de las cuatro esquinas. Sin giro, las esquinas dan el resultado
  // exacto igualmente, así que no hace falta un caso especial.
  const corners = [
    cadViewScreenToWorld(view, 0, 0),
    cadViewScreenToWorld(view, view.widthPx, 0),
    cadViewScreenToWorld(view, 0, view.heightPx),
    cadViewScreenToWorld(view, view.widthPx, view.heightPx),
  ];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const overscan = Math.max(0, overscanRatio);
  const paddingX = overscan === 0 ? 0 : Math.max(1, (maxX - minX) * overscan);
  const paddingY = overscan === 0 ? 0 : Math.max(1, (maxY - minY) * overscan);
  return {
    minX: minX - paddingX,
    minY: minY - paddingY,
    maxX: maxX + paddingX,
    maxY: maxY + paddingY,
  };
}

/**
 * Tolerancia en unidades de dibujo de una apertura expresada en píxeles.
 *
 * Una división. Hoy hace falta la distancia de cámara, el FOV vertical y la
 * altura del viewport para aproximar lo mismo, y el resultado deriva al
 * acercarse porque la relación píxel↔mundo no es constante en perspectiva.
 */
export function cadViewToleranceWorld(view: CadView, aperturePx: number): number {
  return Math.abs(aperturePx) / view.pixelsPerUnit;
}

/** Encuadra un rectángulo de dibujo dejando un margen relativo. */
export function cadViewZoomToBounds(view: CadView, bounds: CadBounds, marginRatio = 0.06): CadView {
  const spanX = Math.max(bounds.maxX - bounds.minX, Number.EPSILON);
  const spanY = Math.max(bounds.maxY - bounds.minY, Number.EPSILON);
  const margin = Math.max(0, marginRatio);
  const fitX = view.widthPx / (spanX * (1 + 2 * margin));
  const fitY = view.heightPx / (spanY * (1 + 2 * margin));
  return {
    ...view,
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
    pixelsPerUnit: clampPixelsPerUnit(Math.min(fitX, fitY)),
  };
}

/**
 * Zoom con la rueda dejando fijo el punto bajo el cursor — el gesto que todo
 * usuario de CAD tiene en los dedos. El punto de dibujo que estaba bajo el
 * puntero sigue estando bajo el puntero después.
 */
export function cadViewZoomAtCursor(
  view: CadView,
  screenX: number,
  screenY: number,
  factor: number,
): CadView {
  const anchor = cadViewScreenToWorld(view, screenX, screenY);
  const zoomed: CadView = { ...view, pixelsPerUnit: clampPixelsPerUnit(view.pixelsPerUnit * factor) };
  // Con el nuevo zoom, el mismo píxel cae en otro punto del dibujo; se corrige
  // el centro por esa diferencia. Funciona con giro porque `screenToWorld` ya
  // lo tiene en cuenta.
  const drifted = cadViewScreenToWorld(zoomed, screenX, screenY);
  return {
    ...zoomed,
    centerX: zoomed.centerX + (anchor.x - drifted.x),
    centerY: zoomed.centerY + (anchor.y - drifted.y),
  };
}

/** Desplaza la vista un número de píxeles de pantalla. */
export function cadViewPanByPixels(view: CadView, deltaXPx: number, deltaYPx: number): CadView {
  const origin = cadViewScreenToWorld(view, 0, 0);
  const moved = cadViewScreenToWorld(view, deltaXPx, deltaYPx);
  return {
    ...view,
    centerX: view.centerX - (moved.x - origin.x),
    centerY: view.centerY - (moved.y - origin.y),
  };
}

/**
 * `ZOOM nXP`: fija el zoom para que la pantalla muestre el dibujo a la misma
 * escala a la que se va a plotear. Es lo que convierte el WYSIWYG de ploteo en
 * algo comprobable en vez de una impresión.
 *
 * A 1:`denominator`, una unidad de dibujo mide `mmPerDrawingUnit / denominator`
 * milímetros sobre el papel, y en pantalla eso son tantos píxeles como diga
 * `screenPxPerMm`.
 */
export function cadViewForPlotScale(
  view: CadView,
  denominator: number,
  mmPerDrawingUnit: number,
  screenPxPerMm: number,
): CadView {
  if (!(denominator > 0) || !(mmPerDrawingUnit > 0) || !(screenPxPerMm > 0)) return view;
  return {
    ...view,
    pixelsPerUnit: clampPixelsPerUnit((mmPerDrawingUnit * screenPxPerMm) / denominator),
  };
}

/** Píxeles de pantalla que mide una longitud de dibujo. Para reglas y cotas. */
export function cadViewLengthToPixels(view: CadView, length: number): number {
  return length * view.pixelsPerUnit;
}

/** Longitud de dibujo que mide una distancia en pantalla. */
export function cadViewPixelsToLength(view: CadView, pixels: number): number {
  return pixels / view.pixelsPerUnit;
}
