"use client";

import { cx } from "@/components/ui";
import {
  CAD_CAMERA_VIEW_PRESET_BUTTONS,
  type CadCameraViewPreset,
} from "./camera-view-presets";

/**
 * EL VIEWCUBE. Cara nueva sobre navegación 3D que YA EXISTE y YA ESTÁ
 * PROBADA: `applyCadCameraViewPreset` (`camera-view-presets.ts`) mueve la
 * cámara real y ya está cableada en `Layout3DEditor` (`viewPreset`). Este
 * componente no mueve un solo píxel de cámara por sí mismo — sólo pinta un
 * cubo y llama a `onSelect(preset)`, que el editor conecta a la MISMA función
 * que ya usan los botones de vista existentes.
 *
 * ## Dos capas: decoración y clics
 *
 * La cara `right` lleva `rotateY(90deg)` que, combinada con la rotación del
 * padre, deja su normal a 125° del observador — de espaldas. `front` la tapa
 * en el paint order y `elementFromPoint` nunca la devuelve. En vez de
 * reescribir la geometría 3D (que depende de cómo el navegador ordena en
 * profundidad), las caras 3D son decorativas (`pointer-events-none`) y las
 * zonas de clic son rectángulos planos superpuestos, posicionados donde cae
 * cada cara en la proyección isométrica.
 */
const FACE_LABEL: Readonly<Record<CadCameraViewPreset, string>> = Object.fromEntries(
  CAD_CAMERA_VIEW_PRESET_BUTTONS.map(([preset, title]) => [preset, title]),
) as Record<CadCameraViewPreset, string>;

/** Estilo base de las zonas de clic y los satélites. */
const FACE_BASE =
  "flex items-center justify-center border border-border/70 bg-surface/95 type-micro font-medium text-muted-foreground transition-colors duration-150 hover:bg-brand-strong hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CadViewCube({
  active,
  onSelect,
  className,
}: {
  /** Preset activo, si se conoce — no todos los editores lo rastrean. */
  active?: CadCameraViewPreset;
  onSelect: (preset: CadCameraViewPreset) => void;
  className?: string;
}) {
  return (
    <div
      data-testid="cad-viewcube"
      className={cx("flex flex-col items-end gap-1.5", className)}
    >
      {/* Cubo visual decorativo: perspectiva CSS fija, tres caras
          reconocibles. `pointer-events-none` para no interferir con las
          zonas de clic planas que están encima. */}
      <div
        className="pointer-events-none relative h-16 w-16"
        style={{ perspective: "220px" }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            transform: "rotateX(-18deg) rotateY(35deg)",
          }}
        >
          <div
            className={cx(
              "absolute left-1 top-0 flex h-11 w-11 items-center justify-center border border-border/70 bg-surface/95 type-micro font-medium text-muted-foreground",
              active === "top" && "bg-brand-strong text-primary-foreground",
            )}
            style={{ transform: "rotateX(90deg) translateZ(22px)" }}
          >
            Sup
          </div>
          <div
            className={cx(
              "absolute left-1 top-3 flex h-11 w-11 items-center justify-center border border-border/70 bg-surface/95 type-micro font-medium text-muted-foreground",
              active === "front" && "bg-brand-strong text-primary-foreground",
            )}
            style={{ transform: "translateZ(22px)" }}
          >
            Fte
          </div>
          <div
            className={cx(
              "absolute left-1 top-3 flex h-11 w-11 items-center justify-center border border-border/70 bg-surface/95 type-micro font-medium text-muted-foreground",
              active === "right" && "bg-brand-strong text-primary-foreground",
            )}
            style={{ transform: "rotateY(90deg) translateZ(22px)" }}
          >
            Der
          </div>
        </div>
      </div>
      {/* Zonas de clic planas: rectángulos posicionados donde cada cara cae
          en la proyección isométrica. DOM ordenado de atrás a delante para
          que `elementFromPoint` devuelva la cara correcta en zonas
          solapadas. */}
      <div className="pointer-events-auto absolute inset-0">
        {(["top", "front", "right"] as const).map((preset) => (
          <button
            key={preset}
            type="button"
            data-testid={`cad-viewcube-face-${preset}`}
            title={FACE_LABEL[preset]}
            aria-label={FACE_LABEL[preset]}
            aria-pressed={active === preset}
            onClick={() => onSelect(preset)}
            className={cx(
              FACE_BASE,
              "absolute rounded-sm",
              active === preset && "bg-brand-strong text-primary-foreground",
              preset === "top" && "left-[18px] top-[2px] h-[18px] w-[38px]",
              preset === "front" && "left-[13px] top-[22px] h-[32px] w-[36px]",
              preset === "right" && "left-[38px] top-[12px] h-[30px] w-[24px]",
            )}
          />
        ))}
      </div>
      {/* Satélites: las tres vistas que un cubo fijo no puede enseñar de
          frente (posterior, izquierda) más el home isométrico. */}
      <div className="flex gap-1">
        {(["left", "back", "iso"] as const).map((preset) => (
          <button
            key={preset}
            type="button"
            data-testid={`cad-viewcube-face-${preset}`}
            title={FACE_LABEL[preset]}
            aria-label={FACE_LABEL[preset]}
            aria-pressed={active === preset}
            onClick={() => onSelect(preset)}
            className={cx(
              "rounded-control border border-border/70 bg-surface/95 px-1.5 py-1 type-micro font-medium text-muted-foreground",
              "transition-colors duration-150 hover:bg-brand-strong hover:text-primary-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active === preset && "bg-brand-strong text-primary-foreground",
            )}
          >
            {preset === "left" ? "Izq" : preset === "back" ? "Post" : "Iso"}
          </button>
        ))}
      </div>
    </div>
  );
}
