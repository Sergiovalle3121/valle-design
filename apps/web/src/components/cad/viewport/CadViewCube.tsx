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
      {/* Cubo visual + zonas de clic planas. El wrapper es el contexto de
          posicionamiento para que los botones NO se desborden a los satélites. */}
      <div className="pointer-events-none relative h-16 w-16" style={{ perspective: "220px" }}>
        {/* Caras 3D decorativas. */}
        <div
          className="absolute inset-0"
          aria-hidden="true"
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
        {/* Zonas de clic planas dentro del cubo — no se desbordan. */}
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
              "pointer-events-auto",
              FACE_BASE,
              "absolute rounded-sm",
              active === preset && "bg-brand-strong text-primary-foreground",
              // Cada zona necesita 20×20 px LIBRES, y «libre» significa que ningún otro
              // rectángulo posterior en el DOM se los pise: éstos se pintan en orden
              // top → front → right, así que el último gana donde haya solape.
              //
              // Por eso «top» acaba en x=40 y «right» empieza en x=40 en vez de en 38: con el
              // solape anterior (x 38..56) el área limpia de «top» quedaba en x 18..38, o sea
              // 20 px justos, y el barrido del golden prueba esquinas en pasos de 4 px —0, 4,
              // 8, 12, 16, 20…— así que nunca pisaba el 18 y no encontraba el cuadrado aunque
              // existiera. Ahora cada una tiene 24 px de lado limpio y no depende de acertar
              // un píxel concreto. En vertical ya encajaban: top acaba en 22, que es donde
              // empieza front.
              // Y cada lado libre es de 24 px o más, no de 20 justos: el barrido prueba
              // esquinas en pasos de 4 px, así que una zona de 20 px exactos sólo se
              // encuentra si la rejilla cae clavada en su borde — y no cae, porque estas
              // zonas se posicionan dentro del cubo de 64×64 y el barrido recorre la caja
              // exterior del ViewCube, que tiene otro origen. Con 24 px de lado libre hay
              // al menos un punto de la rejilla dentro sea cual sea el desfase.
              preset === "top" && "left-[16px] top-[2px] h-[24px] w-[24px]",
              preset === "front" && "left-[13px] top-[26px] h-[28px] w-[36px]",
              preset === "right" && "left-[40px] top-[12px] h-[30px] w-[24px]",
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
              // 26×34 EXPLÍCITOS, no lo que dé el texto. Con `px-1.5 py-1`
              // sobre `type-micro` el alto salía de la caja de la fuente, y
              // eso lo decide el navegador: Chromium redondeaba a 20 px justos
              // y Firefox se quedaba por debajo. El golden 215 —que busca un
              // cuadrado de 20×20 donde TODO pertenezca a la cara— cantó la
              // diferencia el 2026-09-20 midiendo «Iso». No era una manía del
              // golden: 24×24 es el mínimo de zona pulsable de WCAG 2.2, y
              // estos tres botones estaban por debajo para cualquiera que use
              // el ratón con prisa. Se fija el tamaño y deja de depender de
              // cómo mida la fuente cada motor.
              "inline-flex min-h-[26px] min-w-[34px] items-center justify-center",
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
