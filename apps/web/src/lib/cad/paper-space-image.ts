/**
 * LA IMAGEN EN LA LÁMINA (Ola H, 2026-09-02).
 *
 * Medido antes: `buildCadPublishPlan` trazaba de una imagen su MARCO (el
 * registro dibuja sus caminos) y `rasterCommandCount` era un `0` literal: el
 * plano escaneado que se calcó no salía en el PDF. Aquí nace el comando
 * `image` del plan: las cuatro esquinas de la imagen en milímetros de papel,
 * el recorte si lo hay, el ajuste y el URI. `plot-pdf.ts` lo lleva al PDF
 * con `addImage` de jsPDF dentro de un estado gráfico con el recorte.
 *
 * Sólo se emite lo que un PDF puede llevar: un `data:image/…` o un `http(s)`
 * a un archivo de imagen (`cadImageIsRaster`). Lo demás sigue siendo su
 * marco, y el plan lo dice en un aviso en vez de callarlo.
 */
import type { CadDocument, CadPoint2 } from "./cad-document";
import type { CadImageEntity } from "./cad-entities-v4";
import {
  CAD_IMAGE_BRIGHTNESS_NEUTRAL,
  CAD_IMAGE_CONTRAST_NEUTRAL,
  CAD_IMAGE_FADE_NONE,
  cadImageClipWorld,
  cadImageCorners,
  cadImageFileName,
  cadImageIsRaster,
} from "./image-geometry";

export interface CadImagePlotCommand {
  kind: "image";
  entityId: string;
  viewportId: string;
  /** `data:` o `http(s)`: lo que jsPDF sabe incrustar. */
  uri: string;
  name: string;
  pixelWidth: number;
  pixelHeight: number;
  /** Inserción, +U, +U+V, +V en milímetros de papel. */
  corners: CadPoint2[];
  /** El recorte en milímetros de papel, si lo hay. */
  clip?: CadPoint2[];
  brightness: number;
  contrast: number;
  fade: number;
}

export interface CadImagePlotSkipped {
  code: "image_not_plottable";
  entityId: string;
  detail: string;
}

/**
 * El comando `image` de una entidad, o por qué no lo hay.
 *
 * `toPaper` es la misma transformación que usa el resto del plan para esa
 * ventana, así que la imagen cae exactamente bajo las líneas que se calcaron
 * sobre ella.
 */
export function cadImagePlotCommand(
  entity: CadImageEntity,
  document: Pick<CadDocument, "imageDefinitions">,
  viewportId: string,
  toPaper: (point: CadPoint2) => CadPoint2,
): { command: CadImagePlotCommand | null; skipped: CadImagePlotSkipped | null } {
  const definition = (document.imageDefinitions ?? []).find((candidate) => candidate.id === entity.definition);
  if (!definition)
    return { command: null, skipped: { code: "image_not_plottable", entityId: entity.id, detail: `IMAGE ${entity.id}: la definición «${entity.definition}» no existe en el documento; sale sólo su marco.` } };
  if (entity.showImage === false) return { command: null, skipped: null };
  if (!cadImageIsRaster(definition))
    return {
      command: null,
      skipped: {
        code: "image_not_plottable",
        entityId: entity.id,
        detail: `IMAGE «${cadImageFileName(definition)}»: el URI «${definition.uri.slice(0, 48)}» no apunta a píxeles que la lámina pueda incrustar (hace falta un data:image/… o un http(s) a PNG/JPEG); sale sólo su marco.`,
      },
    };
  const clip = cadImageClipWorld(entity);
  return {
    command: {
      kind: "image",
      entityId: entity.id,
      viewportId,
      uri: definition.uri,
      name: cadImageFileName(definition),
      pixelWidth: entity.size.width,
      pixelHeight: entity.size.height,
      corners: cadImageCorners(entity).map(toPaper),
      ...(clip ? { clip: clip.map(toPaper) } : {}),
      brightness: entity.brightness ?? CAD_IMAGE_BRIGHTNESS_NEUTRAL,
      contrast: entity.contrast ?? CAD_IMAGE_CONTRAST_NEUTRAL,
      fade: entity.fade ?? CAD_IMAGE_FADE_NONE,
    },
    skipped: null,
  };
}

/**
 * Cómo se coloca en el PDF: jsPDF sólo sabe girar una imagen alrededor de su
 * esquina inferior izquierda, en el papel (y hacia abajo). Una imagen sesgada
 * o reflejada no tiene esa forma, y se dice en vez de trazarla mal.
 */
export function cadImagePlotPlacement(command: CadImagePlotCommand): { x: number; y: number; width: number; height: number; rotationDeg: number } | { reason: string } {
  const [origin, right, , top] = command.corners;
  const u = { x: right.x - origin.x, y: right.y - origin.y };
  const v = { x: top.x - origin.x, y: top.y - origin.y };
  const width = Math.hypot(u.x, u.y);
  const height = Math.hypot(v.x, v.y);
  if (!(width > 1e-6) || !(height > 1e-6)) return { reason: `IMAGE «${command.name}»: sin área en el papel; no se traza.` };
  const dot = u.x * v.x + u.y * v.y;
  if (Math.abs(dot) > 1e-6 * width * height) return { reason: `IMAGE «${command.name}»: está sesgada (U y V no son perpendiculares) y el PDF sólo la gira; sale su marco.` };
  // En papel la Y crece hacia abajo: una imagen derecha tiene V hacia −Y y el
  // producto cruzado NEGATIVO. Positivo es una imagen reflejada.
  if (u.x * v.y - u.y * v.x > 0) return { reason: `IMAGE «${command.name}»: está reflejada (MIRROR) y jsPDF no refleja imágenes; sale su marco.` };
  // jsPDF gira en sentido antihorario sobre el papel; el ángulo de U medido
  // con la Y hacia abajo tiene el signo contrario.
  const rotationDeg = (-Math.atan2(u.y, u.x) * 180) / Math.PI;
  return { x: origin.x, y: origin.y - height, width, height, rotationDeg };
}
