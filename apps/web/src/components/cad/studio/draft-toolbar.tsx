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
import { CadDynamicInput } from "@/components/cad/palettes/CadDynamicInput";

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
    // `pointer-events-none` en el contenedor, `pointer-events-auto` sólo en
    // los controles: la píldora flota SOBRE el lienzo y su fondo/padding se
    // tragaba el pick que cayera debajo — un segundo punto de LINE bajo la
    // barra nunca llegaba al motor (medido: golden 46, test 2; el tamaño del
    // área muerta dependía hasta de la métrica de la fuente). El mismo patrón
    // que ya usa el dock del tour guiado.
    // DOS RENGLONES COMO MUCHO. Con `flex-wrap` a secas la píldora se partía en
    // tres filas y bajaba hasta y≈340 px: los dos clics de LINE del golden 46
    // (mundo y=2000 → pantalla y≈322) caían sobre sus etiquetas y su botón
    // «REL». La causa no era el wrap sino el ANCHO: un absoluto en `left-1/2`
    // sólo dispone de media anchura del lienzo para encoger, así que envolvía
    // a la mitad. `w-max` le da su anchura de contenido y `max-w` la acota al
    // lienzo; la entrada dinámica es UNA unidad sin partir, y sólo «Terminar»
    // y «Cerrar» bajan a una segunda fila cuando no caben. Con `flex-nowrap`
    // (medido el 2026-09-02, golden 33, PLINE con «Cerrar»): la fila medía más
    // que el lienzo, se centraba y su botón «ABS» quedaba fuera, bajo el panel
    // izquierdo, sin que ningún clic pudiera alcanzarlo.
    <div className="pointer-events-none absolute top-12 left-1/2 z-20 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 whitespace-nowrap rounded-card border border-border bg-surface/90 px-2 py-1.5 backdrop-blur">
      <button
        onClick={onToggleOrtho}
        title="Orto: restringe los muros a 0/90/180/270 (como F8 de AutoCAD)"
        className={`pointer-events-auto rounded-full px-2 py-0.5 type-micro font-semibold ${orthoLock ? "bg-amber-400 text-gray-900" : "bg-muted/60 text-foreground hover:bg-muted"}`}
      >
        ORTO
      </button>
      {dynamicInputEnabled && (
        <span className="pointer-events-auto flex min-w-0 max-w-full items-center gap-1.5">
          <CadDynamicInput key={dynamicInputKey} {...dynamicInput} />
        </span>
      )}
      {chaining && (
        <button
          // Su hermano «Cerrar» ya llevaba testid; éste no, y por eso los
          // goldens lo pedían por rol y nombre. Cuando la campaña de la cinta
          // añadió «Terminar COMANDO» al editor,
          // `getByRole('button', { name: 'Terminar' })` pasó a resolver a dos
          // elementos y rompió cuatro goldens de golpe — el mismo defecto que
          // el ViewCube con los presets de cámara. Un testid es un nombre que
          // no colisiona con la prosa de la interfaz.
          data-testid="cad-draft-finish"
          onClick={onFinish}
          className="pointer-events-auto rounded-control border border-border px-2 py-1 type-micro text-foreground hover:bg-muted"
        >
          Terminar
        </button>
      )}
      {chaining && canClose && (
        <button
          data-testid="cad-polyline-close"
          onClick={onClose}
          className="pointer-events-auto rounded-control border border-primary/30 bg-primary/15 px-2 py-1 type-micro font-semibold text-primary-ink hover:bg-primary/15"
        >
          Cerrar
        </button>
      )}
    </div>
  );
}
