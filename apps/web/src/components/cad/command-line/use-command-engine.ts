"use client";

/**
 * El anfitrión del motor, sostenido desde React sin ocupar un `useState`.
 *
 * Dos problemas concretos se resuelven aquí, y ninguno es de estilo.
 *
 * **El anfitrión debe crearse UNA vez.** Lleva dentro el comando en curso, sus
 * puntos y la pila de transparentes. Recrearlo en un render dejaría a medias el
 * `LINE` que el usuario está trazando. Por eso el `useMemo` no tiene
 * dependencias.
 *
 * **Y aun así el puente debe estar vivo.** Lo que el motor pregunta al despachar
 * —selección, capa activa, cursor— cambia en cada render, y una función
 * capturada al montar devolvería la selección de hace diez minutos. La salida
 * habitual es meter el puente en las dependencias, pero eso recrea el anfitrión
 * y vuelve al primer problema.
 *
 * Se separan las dos cosas: el anfitrión se queda con un puente estable que en
 * cada llamada delega en el último puente recibido, guardado en una `ref`. Se
 * escribe en el cuerpo del render, no en un efecto, porque el motor puede
 * despacharse desde un manejador que corre ANTES de que los efectos de ese
 * render se hayan ejecutado.
 */
import { useMemo, useRef, useSyncExternalStore } from "react";
import { CAD_COMMAND_REGISTRY_V2 } from "@/lib/cad/engine";
import type { CadCommandRegistry } from "@/lib/cad/engine/command-engine";
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import type { CadView } from "@/lib/cad/view/cad-view";
import {
  attachCadLisp,
  useCadLispAttachment,
  type CadLispIdentity,
} from "../lisp/use-lisp";
import {
  CadCommandEngineHost,
  type CadCommandEngineBridge,
  type CadCommandEngineSnapshot,
} from "./command-engine-host";
import { cadStudioCommandContext } from "./studio-context";

/**
 * El registro entra por parámetro con el del producto por defecto.
 *
 * Lo aprovecha el estudio para pasar el registro COMPUESTO —los 63 nativos más
 * los comandos `c:` que aporten las rutinas `.lsp` cargadas—. Componer en el
 * punto de montaje, en vez de añadir comandos en caliente a
 * `CAD_COMMAND_REGISTRY_V2`, mantiene la propiedad que `registry.ts` protege:
 * el registro del producto no cambia según qué se haya importado antes.
 */
export function useCadCommandEngineHost(
  bridge: CadCommandEngineBridge,
  registry: CadCommandRegistry = CAD_COMMAND_REGISTRY_V2,
): CadCommandEngineHost {
  const live = useRef(bridge);
  live.current = bridge;
  const table = useRef(registry);
  return useMemo(
    () =>
      new CadCommandEngineHost(table.current, {
        context: () => live.current.context(),
        apply: (commands, label) => live.current.apply(commands, label),
        preview: (paths) => live.current.preview(paths),
        osnapOverride: (modes) => live.current.osnapOverride(modes),
        cursor: (shape) => live.current.cursor(shape),
      }),
    [],
  );
}

/**
 * El anfitrión tal y como lo necesita el estudio.
 *
 * Es el `useCadCommandEngineHost` de arriba con el puente ya armado a partir de
 * lo que el editor tiene a mano: refs vivas para lo que cambia sin renderizar
 * —documento y selección— y valores normales para lo que sí renderiza.
 *
 * Existe para que montar el motor cueste diez líneas en el editor y no
 * cuarenta. En un componente de 23.000 líneas eso no es cosmética: el
 * presupuesto de `npm run check:cad` sólo permite que ese número baje.
 */
export interface CadStudioCommandEngineOptions {
  document: { current: CadDocument | null };
  selection: { current: readonly string[] };
  view: { current: { view: CadView } | null };
  activeLayer: string;
  newEntityId: () => string;
  /** Aplica el lote por la ruta canónica del editor. */
  apply(commands: readonly CadEntityCommand[], label: string): void;
  /**
   * Organización y usuario, para la biblioteca de rutinas `.lsp`.
   *
   * Opcional porque el editor todavía no la pasa: mientras no lo haga, la
   * biblioteca vive bajo `anon` y es la misma para todo el mundo en ese
   * navegador. Es un límite declarado, no un descuido; pasarla es una línea en
   * el punto de montaje y está pedida en el PR.
   */
  identity?: CadLispIdentity;
}

export function useCadStudioCommandEngine(
  options: CadStudioCommandEngineOptions,
): CadCommandEngineHost {
  /**
   * El subsistema AutoLISP, enchufado.
   *
   * `lib/lisp/` existía entero desde la ola 1 y nadie lo importaba: un veterano
   * no podía cargar ni ejecutar una sola de sus rutinas. Estas tres líneas son
   * el enchufe: el registro compuesto hace que un `(defun c:MICOMANDO …)` se
   * teclee como cualquier nativo, y el runtime queda atado al anfitrión para que
   * la consola lo encuentre.
   *
   * La geometría de una rutina sale por el efecto `execute` del motor y acaba en
   * el `apply` de abajo, que es `commitNativeCommands`. No hay segunda ruta de
   * mutación: el subsistema LISP hereda la disciplina CAS por construcción.
   */
  const lisp = useCadLispAttachment(options.identity ?? {});
  // Se ata en el cuerpo del render y no en un efecto, porque el motor puede
  // despacharse desde un manejador que corre ANTES de que los efectos de ese
  // render se hayan ejecutado. No notifica a nadie, así que no puede desgarrar.
  lisp.runtime.bind({
    document: () => options.document.current,
    activeLayer: () => options.activeLayer,
    newEntityId: options.newEntityId,
  });

  const host = useCadCommandEngineHost(
    {
      context: () =>
        cadStudioCommandContext({
          document: options.document.current,
          selection: options.selection.current,
          activeLayer: options.activeLayer,
          view: options.view.current?.view ?? null,
          // El puntero todavía no pasa por el motor: mientras no pase, no hay
          // cursor que ofrecer. Se dice que no lo hay en vez de fingir el
          // origen, para que la entrada directa de distancia responda «mueve el
          // cursor» en lugar de dar un punto medido desde un sitio inventado.
          cursor: null,
          newEntityId: options.newEntityId,
        }),
      apply: options.apply,
      // Previsualización, captura forzada y forma del cursor pertenecen al
      // puntero. Se ignoran a conciencia hasta que el puntero llegue.
      preview: () => {},
      osnapOverride: () => {},
      cursor: () => {},
    },
    lisp.registry,
  );
  attachCadLisp(host, lisp);
  return host;
}

/**
 * Lectura del estado del motor.
 *
 * `getSnapshot` devuelve el MISMO objeto mientras nada cambie —es lo que
 * `CadCommandEngineHost` garantiza y lo que su spec comprueba—, así que sirve
 * igual como instantánea de servidor: en SSR no hay comando en curso y el
 * objeto inicial es el correcto.
 */
export function useCadCommandEngine(
  host: CadCommandEngineHost,
): CadCommandEngineSnapshot {
  return useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
}
