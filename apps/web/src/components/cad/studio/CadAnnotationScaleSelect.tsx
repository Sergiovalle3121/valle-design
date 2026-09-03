"use client";

import { useState } from "react";
import { CAD_MEXICAN_SCALES } from "@/lib/cad/standards/mexican-annotation";

/**
 * EL SELECTOR DE ESCALA DE ANOTACIÓN DE LA BARRA DE ESTADO.
 *
 * ## Qué faltaba, medido
 *
 * `docs/competitive/distancia-autocad-completo-20260903.md` lo cuenta entre los
 * cinco reflejos abiertos: **0 apariciones** de un selector de escala de
 * anotación en todo `components/cad/`. En AutoCAD es el control más a la
 * derecha de la barra de estado y es lo primero que se toca al empezar un
 * plano: decide cuánto mide EN EL MODELO un rótulo que tiene que salir a 2,5 mm
 * sobre el papel. Sin él, la anotatividad existía en el documento
 * (`context.metadata.annotativeHeightMm`) y no había forma de ejercerla desde
 * el espacio modelo.
 *
 * ## De dónde sale la lista
 *
 * De `CAD_MEXICAN_SCALES`, que ya declara con qué escalas se dibuja en México y
 * cuáles están en ISO 5455 y cuáles son costumbre — con su fuente cada una. Una
 * lista nueva aquí sería una segunda verdad sobre lo mismo.
 *
 * ## Por qué el estado vive aquí
 *
 * Porque `Layout3DEditor.tsx` tiene un techo de 131 `useState` que sólo puede
 * bajar, y porque la escala elegida no es del dibujo: hoy es de la SESIÓN.
 * Persistirla en el documento (`CadDocumentMeta.annotationScale`, como AutoCAD
 * guarda CANNOSCALE) es tocar el formato persistido, y eso es decisión del
 * titular: queda propuesto en el informe de la ola. Mientras tanto, la escala
 * arranca en 1:50 —la que `CAD_MEXICAN_SCALES` declara «la escala por
 * defecto»— y se pierde al recargar, que es un límite dicho, no un descuido.
 */
export function CadAnnotationScaleSelect({
  onChange,
}: {
  onChange?: (denominator: number) => void;
}) {
  const [denominator, setDenominator] = useState(50);
  return (
    <label
      className="inline-flex items-center gap-1 @max-[40rem]:hidden"
      title="Escala de anotación del espacio modelo (CANNOSCALE): decide cuánto mide en el modelo un rótulo anotativo"
    >
      <span className="text-muted-foreground">Anotación</span>
      <select
        data-testid="cad-status-annotation-scale"
        value={String(denominator)}
        onChange={(event) => {
          const next = Number(event.target.value);
          setDenominator(next);
          onChange?.(next);
        }}
        className="rounded border border-border bg-surface px-1 py-0 font-mono type-micro text-foreground"
      >
        {CAD_MEXICAN_SCALES.map((scale) => (
          <option key={scale.denominator} value={String(scale.denominator)}>
            1:{scale.denominator}
          </option>
        ))}
      </select>
    </label>
  );
}
