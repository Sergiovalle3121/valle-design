"use client";

/**
 * Indicador del pipeline de render — y la superficie que un golden puede leer.
 *
 * El benchmark de Node midió un camino que el producto no ejecutaba. Para que
 * eso no se repita, el editor publica en el DOM QUÉ pipeline está dibujando y
 * CUÁNTO ha materializado: `data-pipeline`, `data-rendered`, `data-visible`,
 * `data-batches`, `data-instances` y `data-glyphs`. Los glifos importan
 * especialmente — el atlas de texto nunca se había ejecutado de verdad, porque
 * en Node no hay canvas, así que un `data-glyphs` mayor que cero en Chromium es
 * la primera prueba de que `text-atlas.ts` rasteriza.
 *
 * Lee del anfitrión con `useSyncExternalStore`: cero `useState` añadidos al
 * monolito, y el bucle de cuadros no dispara un render de React por cuadro.
 */
import React, { useSyncExternalStore } from "react";
import type { CadRenderPipelineChoice } from "@/lib/cad/render-pipeline-preference";
import type {
  CadRenderHostSlot,
  CadViewportRenderDiagnostics,
} from "./render-pipeline-host";

const EMPTY: CadViewportRenderDiagnostics = {
  total: 0,
  visible: 0,
  rendered: 0,
  batches: 0,
  instances: 0,
  glyphs: 0,
  droppedGlyphs: 0,
  images: 0,
  imagesPending: 0,
  meshes: 0,
  visibleTiles: 0,
  residentTiles: 0,
  settled: true,
  tessellation: "none",
};

const empty = () => EMPTY;

export interface CadRenderPipelineBadgeProps {
  pipeline: CadRenderPipelineChoice;
  /**
   * Ranura estable del anfitrión: existe desde el primer render aunque el
   * lienzo THREE todavía no se haya montado.
   */
  slot: CadRenderHostSlot;
}

export function CadRenderPipelineBadge({ pipeline, slot }: CadRenderPipelineBadgeProps) {
  const diagnostics = useSyncExternalStore(slot.subscribe, slot.getSnapshot, empty);
  return (
    <span
      data-testid="cad-render-pipeline"
      data-pipeline={pipeline}
      data-rendered={diagnostics.rendered}
      data-visible={diagnostics.visible}
      data-total={diagnostics.total}
      data-batches={diagnostics.batches}
      data-instances={diagnostics.instances}
      data-glyphs={diagnostics.glyphs}
      data-dropped-glyphs={diagnostics.droppedGlyphs}
      data-images={diagnostics.images}
      data-images-pending={diagnostics.imagesPending}
      data-meshes={diagnostics.meshes}
      data-tiles={diagnostics.visibleTiles}
      data-settled={diagnostics.settled ? "true" : "false"}
      data-tessellation={diagnostics.tessellation}
      title={
        pipeline === "batched"
          ? "Pipeline por lotes y tiles: detalle para TODAS las entidades visibles"
          : "Pipeline heredado: una malla por entidad, con muestreo por presupuesto"
      }
      className={
        pipeline === "batched" ? "text-emerald-300" : "text-amber-300"
      }
    >
      {pipeline === "batched"
        ? `Lotes ${diagnostics.batches} · ${diagnostics.rendered}/${diagnostics.visible}`
        : "Render heredado"}
    </span>
  );
}

/**
 * El diagnóstico de viewport que el editor ya publicaba, servido por el
 * pipeline nuevo.
 *
 * `cad-native-render-stats` existía atado a `planCadNativeRenderBudget` y sólo
 * aparecía cuando ese plan OMITÍA entidades. El pipeline por lotes no omite
 * ninguna, así que el indicador desaparecía —y con él la prueba de rendimiento
 * a 100.000 entidades, que lo espera para medir la carga progresiva y el
 * reencuadre tras el zoom—. Perder la medida al mejorar lo medido es la peor
 * forma de mejorar algo.
 *
 * Se vuelve a publicar con los mismos nombres de atributo y el mismo
 * significado, sólo que ahora las cifras vienen del índice de tiles:
 * `data-visible` son las entidades dentro de la vista y `data-rendered` las que
 * ya tienen detalle. `data-batching` es «queda trabajo en cola».
 */
export function CadRenderPipelineStats({ slot }: { slot: CadRenderHostSlot }) {
  const diagnostics = useSyncExternalStore(slot.subscribe, slot.getSnapshot, empty);
  if (diagnostics.total === 0) return null;
  return (
    <span
      data-testid="cad-native-render-stats"
      data-total={diagnostics.total}
      data-visible={diagnostics.visible}
      data-rendered={diagnostics.rendered}
      data-batching={diagnostics.settled ? "false" : "true"}
      className="text-emerald-300"
      title={`${diagnostics.visible.toLocaleString()} entidades en la vista; ${diagnostics.rendered.toLocaleString()} con detalle materializado`}
    >
      Viewport {diagnostics.rendered.toLocaleString()}/
      {diagnostics.visible.toLocaleString()} visibles ·{" "}
      {diagnostics.total.toLocaleString()} total
      {diagnostics.settled ? "" : " · cargando…"}
    </span>
  );
}
