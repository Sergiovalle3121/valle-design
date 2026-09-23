import type { CadKeyword } from "@/lib/cad/engine/command-types";

/**
 * QUÉ OFRECE EL BOTÓN DERECHO a mitad de un comando.
 *
 * ## El defecto, medido
 *
 * El 2026-09-22, con LINE abierto y dos puntos puestos, el botón derecho abría
 * un menú con UNA opción: «desHacer». Ni aceptar ni cancelar. Quien viene de
 * AutoCAD pulsa el derecho para CERRAR lo que está dibujando —es el gesto que
 * sustituye a estirar la mano hasta Intro— y aquí ese gesto no existía: había
 * que soltar el ratón e ir al teclado.
 *
 * El caso sin palabras clave ya estaba bien resuelto (el derecho vale por
 * Intro, ver `pointer-router.ts`). El que fallaba era justo el contrario: en
 * cuanto el paso ofrecía UNA opción, aceptar desaparecía del menú.
 *
 * ## Qué ofrece ahora, y en qué orden
 *
 * Primero ACEPTAR, porque es lo que se viene a hacer con el derecho y porque
 * ponerlo primero lo deja bajo el cursor —el menú se abre donde está el ratón—.
 * Luego las palabras clave del paso, en el orden en que las publica el motor,
 * que es el mismo del aviso. Y al final CANCELAR, lejos del primero, porque
 * tirar el trabajo en curso no puede quedar a un píxel de aceptarlo.
 *
 * Esto es una función pura para poder comprobar ese orden sin un navegador: el
 * menú de verdad lo pinta `live-cursor.ts` sobre el DOM.
 */

/** Qué hace una entrada del menú cuando se pulsa. */
export type CadPointerMenuAction =
  | { readonly kind: "accept" }
  | { readonly kind: "cancel" }
  | { readonly kind: "keyword"; readonly shortcut: string };

export interface CadPointerMenuEntry {
  /** Sufijo del `data-testid`: `cad-pointer-menu-<id>`. */
  readonly id: string;
  readonly label: string;
  /** Lo que se enseña a la derecha: la tecla que hace lo mismo. */
  readonly hint: string;
  readonly action: CadPointerMenuAction;
}

/**
 * Las entradas del menú para las palabras clave de un paso. Devuelve lista
 * vacía si no hay ninguna: sin opciones, el botón derecho vale por Intro
 * directamente y abrir un menú de un solo renglón sería peor que no abrirlo.
 */
export function cadPointerMenuEntries(
  keywords: readonly CadKeyword[],
): readonly CadPointerMenuEntry[] {
  if (keywords.length === 0) return [];
  return [
    { id: "accept", label: "Aceptar", hint: "Intro", action: { kind: "accept" } },
    ...keywords.map((option) => ({
      id: `keyword-${option.keyword}`,
      label: option.label ?? option.keyword,
      hint: option.shortcut.toUpperCase(),
      action: { kind: "keyword", shortcut: option.shortcut } as const,
    })),
    { id: "cancel", label: "Cancelar", hint: "Esc", action: { kind: "cancel" } },
  ];
}

/** Keep the entire menu inside the canvas, including its last action. */
export function cadPointerMenuPosition(
  pointer: { readonly x: number; readonly y: number },
  canvas: { readonly width: number; readonly height: number },
  menu: { readonly width: number; readonly height: number },
  inset = 8,
): { x: number; y: number } {
  const axis = (coordinate: number, canvasSize: number, menuSize: number) => {
    const remaining = Math.max(0, canvasSize - menuSize);
    const margin = Math.min(inset, remaining / 2);
    return Math.round(Math.min(Math.max(coordinate, margin), remaining - margin));
  };
  return {
    x: axis(pointer.x, canvas.width, menu.width),
    y: axis(pointer.y, canvas.height, menu.height),
  };
}
