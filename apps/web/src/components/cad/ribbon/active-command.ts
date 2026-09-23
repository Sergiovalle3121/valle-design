"use client";

import { createContext, useContext } from "react";

/**
 * Qué comando está corriendo AHORA, para que los botones puedan decirlo.
 *
 * ## El defecto que cierra
 *
 * Medido el 2026-09-22 contra producción: se pulsa «Línea» en la cinta, el
 * motor abre el comando y acepta los clics… y el botón no cambia ni un píxel.
 * El único realce que se veía era `:hover`, que desaparece en cuanto el ratón
 * se va al lienzo — que es exactamente adonde va. Nada en la pantalla decía
 * qué herramienta estaba en la mano; de ahí «el ribbon no sirve, sólo está de
 * adorno». En AutoCAD el botón del comando en curso se queda encendido.
 *
 * ## Por qué un contexto y no una prop
 *
 * Los botones cuelgan de tres sitios distintos —el panel, el desplegable del
 * panel (que se pinta en un PORTAL) y la barra del modo Esencial— y ninguno
 * de los tres necesita saber nada de comandos activos para hacer su trabajo.
 * Pasar la prop por los tres obligaría a tocar ocho puntos de paso para una
 * señal que es global a la cinta; un contexto la deja donde se consume. Los
 * portales siguen dentro del árbol de React, así que el desplegable también
 * la recibe.
 *
 * El valor es el NOMBRE del comando (`"LINE"`, `"RECTANG"`), tal y como lo
 * publica `CadCommandEngineHost.activeCommand`, o `null` cuando no hay ninguno
 * —que es el estado de reposo y el que enciende «Seleccionar» en Esencial.
 */
export const CadActiveCommandContext = createContext<string | null>(null);

/** El comando en curso, o `null` en reposo. */
export function useCadActiveCommand(): string | null {
  return useContext(CadActiveCommandContext);
}
