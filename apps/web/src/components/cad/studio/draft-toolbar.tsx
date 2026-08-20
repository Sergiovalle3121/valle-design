"use client";

/**
 * La barra flotante del dibujo en curso: ORTO, entrada dinámica y los botones
 * de terminar/cerrar de la polilínea.
 *
 * Presentacional. Recibe el estado y devuelve gestos; no sabe qué es un
 * documento canónico ni una caja heredada. Estaba escrita en línea dentro del
 * JSX del monolito, que es donde una barra de herramientas es más difícil de
 * encontrar y de tocar.
 *
 * `chaining` merece explicación: los botones «Terminar» y «Cerrar» sólo tienen
 * sentido para los comandos que ENCADENAN puntos —línea y polilínea—, no para
 * los que se cierran solos al segundo clic. La decisión de qué comandos
 * encadenan es del editor y llega ya resuelta, para que esta barra no tenga que
 * conocer la lista de comandos.
 */
import React from "react";
import { CadDynamicInput } from "@/components/line-engineering/cad-workbench/CadDynamicInput";

type DynamicInputProps = React.ComponentProps<typeof CadDynamicInput>;

export interface CadDraftToolbarProps {
  orthoLock: boolean;
  onToggleOrtho(): void;
  /** Entrada dinámica, con sus props tal cual las define el propio control. */
  dynamicInput: DynamicInputProps;
  /**
   * Identidad de la entrada dinámica. `key` no viaja dentro de un objeto de
   * props, y aquí no es decoración: cambiarla es lo que RESETEA los campos al
   * pasar de absoluto a relativo o de punto a radio. Sin esto, el control
   * conservaría los valores del comando anterior.
   */
  dynamicInputKey: string;
  /**
   * F12: con la entrada dinámica apagada el control no se pinta. Teclear
   * coordenadas sigue disponible por la línea de comandos — el mismo reparto
   * que AutoCAD con DYNMODE en 0. Opcional para no tocar a los montajes que
   * no conocen el interruptor: ausente significa encendida, que era el único
   * comportamiento que existía antes.
   */
  dynamicInputEnabled?: boolean;
  /**
   * El comando en curso encadena puntos, así que se puede terminar a mano.
   * `false` también cuando no hay comando en curso.
   */
  chaining: boolean;
  /** Además hay vértices suficientes para cerrar la polilínea. */
  canClose: boolean;
  onFinish(): void;
  onClose(): void;
}

export function CadDraftToolbar({
  orthoLock,
  onToggleOrtho,
  dynamicInput,
  dynamicInputKey,
  dynamicInputEnabled = true,
  chaining,
  canClose,
  onFinish,
  onClose,
}: CadDraftToolbarProps) {
  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full border border-white/10 bg-gray-900/90 px-2 py-1.5 backdrop-blur">
      <button
        onClick={onToggleOrtho}
        title="Orto: restringe los muros a 0/90/180/270 (como F8 de AutoCAD)"
        className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${orthoLock ? "bg-amber-400 text-gray-900" : "bg-white/[0.08] text-gray-300 hover:bg-white/[0.15]"}`}
      >
        ORTO
      </button>
      {dynamicInputEnabled && (
        <CadDynamicInput key={dynamicInputKey} {...dynamicInput} />
      )}
      {chaining && (
        <button
          onClick={onFinish}
          className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-gray-300 hover:bg-white/10"
        >
          Terminar
        </button>
      )}
      {chaining && canClose && (
        <button
          data-testid="cad-polyline-close"
          onClick={onClose}
          className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-400/20"
        >
          Cerrar
        </button>
      )}
    </div>
  );
}
