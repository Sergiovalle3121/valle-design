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
 * Un ViewCube de verdad se orienta con la cámara y se arrastra; eso exige
 * llevar el azimut/elevación vivos hasta aquí, que hoy sólo vive dentro del
 * efecto de escena de Three.js. Lo que SÍ se puede dar sin reimplementar nada
 * es la forma reconocible — tres caras en perspectiva isométrica fija, más
 * las tres vistas que un cubo estático no puede mostrar (posterior, izquierda
 * y home) como botones satélite — y las seis vistas son EXACTAMENTE los seis
 * presets reales, ni uno inventado.
 */
const FACE_LABEL: Readonly<Record<CadCameraViewPreset, string>> = Object.fromEntries(
  CAD_CAMERA_VIEW_PRESET_BUTTONS.map(([preset, title]) => [preset, title]),
) as Record<CadCameraViewPreset, string>;

function CubeFace({
  preset,
  onSelect,
  active,
  short,
  className,
  style,
}: {
  preset: CadCameraViewPreset;
  onSelect: (preset: CadCameraViewPreset) => void;
  active: boolean;
  short: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      data-testid={`cad-viewcube-face-${preset}`}
      title={FACE_LABEL[preset]}
      aria-label={FACE_LABEL[preset]}
      aria-pressed={active}
      onClick={() => onSelect(preset)}
      style={style}
      className={cx(
        "absolute flex items-center justify-center border border-border/70 bg-surface/95 type-micro font-medium text-muted-foreground",
        "transition-colors duration-150 hover:bg-brand-strong hover:text-primary-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-brand-strong text-primary-foreground",
        className,
      )}
    >
      {short}
    </button>
  );
}

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
      {/* El cubo: perspectiva CSS fija, tres caras visibles como en el
          arranque de cualquier ViewCube de AutoCAD (SO isométrico). */}
      <div
        className="relative h-16 w-16"
        style={{ perspective: "220px" }}
      >
        <div
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            transform: "rotateX(-18deg) rotateY(35deg)",
          }}
        >
          <CubeFace
            preset="top"
            short="Sup"
            active={active === "top"}
            onSelect={onSelect}
            className="left-1 top-0 h-11 w-11"
            style={{ transform: "rotateX(90deg) translateZ(22px)" }}
          />
          <CubeFace
            preset="front"
            short="Fte"
            active={active === "front"}
            onSelect={onSelect}
            className="left-1 top-3 h-11 w-11"
            style={{ transform: "translateZ(22px)" }}
          />
          <CubeFace
            preset="right"
            short="Der"
            active={active === "right"}
            onSelect={onSelect}
            className="left-1 top-3 h-11 w-11"
            style={{ transform: "rotateY(90deg) translateZ(22px)" }}
          />
        </div>
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
