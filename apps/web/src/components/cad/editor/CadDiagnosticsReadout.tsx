"use client";

import type { ReactNode } from "react";

/**
 * LA TELEMETRÍA DE DESARROLLADOR, FUERA DE LA VISTA DEL CLIENTE.
 *
 * Lo que la barra de estado le enseñaba a un arquitecto: «Tool: select»,
 * «Native 7», «U0/R0» y el distintivo del pipeline de render. Ninguna de esas
 * cuatro cosas significa nada para quien está dibujando un plano; las cuatro
 * significan mucho para quien depura el editor. La barra de estado de un CAD es
 * una superficie cara —se mira cien veces por sesión— y estaba gastada en datos
 * que su lector no puede usar.
 *
 * LO QUE ESTE COMPONENTE NO HACE: borrarlas. Las cifras son OBSERVABLES y hay
 * dieciséis goldens que las leen — «Native 1» tras dibujar una línea, `data-undo`
 * tras deshacer— porque son la única forma barata de afirmar que una acción de
 * dibujo dejó exactamente una entrada de historial. Borrarlas del DOM sería
 * cambiar el producto para que las pruebas dejen de poder mirarlo.
 *
 * Así que siguen EN EL DOM, con sus `data-testid` y sus atributos intactos, y lo
 * que cambia es si se ven:
 *
 *   · Modo normal → `sr-only` + `aria-hidden`. El texto sigue siendo legible por
 *     `textContent`, que es exactamente lo que usan las aserciones (ninguna de
 *     las dieciséis pide `toBeVisible`, comprobado), y desaparece tanto de la
 *     pantalla como del árbol de accesibilidad, donde «U0/R0» sería ruido.
 *   · Modo diagnóstico → visible, con la misma pinta de siempre.
 *
 * CÓMO SE ENCIENDE: `?cadDiag=1` en la dirección. Es el mismo mecanismo que ya
 * usa el editor para `?cadRenderPipeline=legacy`, así que no inventa una
 * convención nueva ni añade un control a una barra que ya va llena.
 */
export function CadDiagnosticsReadout({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <span
      data-testid="cad-diagnostics"
      data-enabled={enabled ? "true" : "false"}
      aria-hidden={enabled ? undefined : true}
      className={
        enabled
          ? "flex flex-wrap items-center gap-2"
          : // `sr-only` y no `hidden`: conserva el nodo medible y su texto para
            // quien lo lee por `textContent`, sin ocupar un píxel de la barra.
            "sr-only"
      }
    >
      {children}
    </span>
  );
}

/**
 * ¿Está pedido el modo diagnóstico?
 *
 * Se lee de la dirección en cada render en vez de guardarse en estado: es una
 * bandera de sesión de soporte, no una preferencia del usuario, y guardarla
 * obligaría a decidir cuándo caduca.
 */
export function cadDiagnosticsRequested(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("cadDiag") === "1";
  } catch {
    return false;
  }
}
