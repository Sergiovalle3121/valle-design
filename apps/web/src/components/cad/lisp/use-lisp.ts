"use client";

/**
 * El subsistema LISP sostenido desde React, sin ocupar un `useState`.
 *
 * Mismo patrón que `use-command-engine.ts` y `use-palettes.ts`, y por la misma
 * razón: el presupuesto de `npm run check:cad` fija el número de `useState` del
 * monolito y **sólo permite bajarlo**. El estado vive fuera de React —una rutina
 * a medio ejecutar, esperando un punto, no puede perderse porque el editor
 * renderice— y se lee con `useSyncExternalStore`.
 *
 * ## Por qué el runtime se ata al anfitrión del motor con un `WeakMap`
 *
 * Dos sitios necesitan el MISMO runtime: quien construye el registro compuesto
 * (`use-command-engine.ts`, antes de crear el anfitrión) y quien pinta la
 * consola (el dock, que sólo recibe el anfitrión). Un singleton de módulo lo
 * resolvería y traería el problema de siempre: dos editores en la misma página
 * compartirían biblioteca y variables, y una spec ensuciaría a la siguiente.
 *
 * Con un `WeakMap` el runtime queda atado a la instancia del anfitrión, que es
 * exactamente su ámbito de vida, y se recoge con él.
 */
import { useMemo, useRef, useSyncExternalStore } from "react";
import type { CadCommandEngineHost } from "../command-line/command-engine-host";
import { CadLispCommandRegistry } from "./lisp-registry";
import {
  CadLispRuntime,
  type CadLispIdentity,
  type CadLispRuntimeOptions,
  type CadLispSnapshot,
} from "./lisp-runtime";

export type { CadLispIdentity };

/** El par que todo el mundo necesita junto: quién ejecuta y quién despacha. */
export interface CadLispAttachment {
  runtime: CadLispRuntime;
  registry: CadLispCommandRegistry;
}

const ATTACHED = new WeakMap<CadCommandEngineHost, CadLispAttachment>();

export function attachCadLisp(
  host: CadCommandEngineHost,
  attachment: CadLispAttachment,
): void {
  ATTACHED.set(host, attachment);
}

export function cadLispOf(host: CadCommandEngineHost): CadLispAttachment | undefined {
  return ATTACHED.get(host);
}

/**
 * Crea runtime y registro, ya atados el uno al otro.
 *
 * El registro necesita el runtime para preguntarle qué comandos hay; el runtime
 * necesita el registro para que `(command "MICOMANDO")` alcance las rutinas del
 * estudio. Es una referencia mutua real y se resuelve donde toca: aquí, en una
 * función, y no repartida por dos constructores.
 */
export function createCadLispAttachment(
  options: CadLispRuntimeOptions = {},
): CadLispAttachment {
  const runtime = new CadLispRuntime(options);
  const registry = new CadLispCommandRegistry(runtime);
  runtime.attachCommandRegistry(registry);
  return { runtime, registry };
}

/**
 * El par, creado UNA vez. Sin dependencias en el `useMemo`: dentro hay una
 * rutina que puede estar suspendida esperando un punto, y recrearlo la perdería.
 */
export function useCadLispAttachment(
  identity: CadLispIdentity,
  options: Omit<CadLispRuntimeOptions, "identity"> = {},
): CadLispAttachment {
  // La identidad llega tarde —la sesión se resuelve por red— y cambia sin que el
  // runtime pueda recrearse. Se lee a través de una referencia viva, igual que
  // hace el puente del motor de comandos con la selección y la capa activa.
  const live = useRef(identity);
  live.current = identity;
  const stable = useRef(options);
  return useMemo(
    () => createCadLispAttachment({ identity: () => live.current, ...stable.current }),
    [],
  );
}

/**
 * Lectura del estado. `getSnapshot` devuelve el MISMO objeto mientras nada
 * cambie, así que sirve igual como instantánea de servidor: en SSR no hay
 * biblioteca cargada y el objeto inicial es el correcto.
 */
export function useCadLisp(runtime: CadLispRuntime): CadLispSnapshot {
  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
}

/**
 * Envía lo tecleado por la ÚNICA puerta que hay: el anfitrión del motor.
 *
 * Tanto la línea de comandos como la consola LISP pasan por aquí. Es lo que
 * garantiza que una expresión evaluada desde la consola siga saliendo por el
 * efecto `execute` del motor y por `commitNativeCommands`: si la consola
 * ejecutase por su cuenta habría dos rutas de mutación, y deshacer después de
 * usarla dejaría el dibujo en un estado que nadie compuso.
 *
 * Lo único que hace de más es APUNTAR el texto original antes de mandarlo,
 * porque el motor normaliza a mayúsculas y eso destrozaría las cadenas de una
 * expresión. La explicación completa está en `lisp-registry.ts`.
 */
export function submitCadLisp(
  host: CadCommandEngineHost,
  value: string,
): void {
  cadLispOf(host)?.registry.remember(value);
  host.submit(value);
}
