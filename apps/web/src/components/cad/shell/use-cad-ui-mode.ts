"use client";

/**
 * Puerta corta al hook del modo de interfaz.
 *
 * La implementación vive junto al anfitrión, en `./ui-mode-host.ts`, que es
 * de donde la importan la cinta, los rieles, la barra de estado y el
 * monolito. Este módulo sólo la reexporta para quien prefiera el nombre
 * `use-<cosa>.ts` de sus vecinos (`lisp/use-lisp.ts`,
 * `command-line/use-command-engine.ts`); no hay dos hooks.
 */
export { useCadUiMode } from "./ui-mode-host";
