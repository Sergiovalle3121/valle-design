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
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { CAD_COMMAND_REGISTRY_V2 } from "@/lib/cad/engine";
import { requestCadUi } from "@/components/cad/palettes/palette-command-bus";
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import { runCadScript } from "@/lib/cad/script-runner";
import type { CadView } from "@/lib/cad/view/cad-view";
import { useCadFileCommandHandlers, useCadSessionState } from "./session-catalogs";
import {
  CadCommandEngineHost,
  type CadCommandEngineBridge,
  type CadCommandEngineSnapshot,
} from "./command-engine-host";
import { cadStudioCommandContext } from "./studio-context";

export function useCadCommandEngineHost(
  bridge: CadCommandEngineBridge,
): CadCommandEngineHost {
  const live = useRef(bridge);
  live.current = bridge;
  return useMemo(
    () =>
      new CadCommandEngineHost(CAD_COMMAND_REGISTRY_V2, {
        context: () => live.current.context(),
        apply: (commands, label) => live.current.apply(commands, label),
        preview: (paths) => live.current.preview(paths),
        osnapOverride: (modes) => live.current.osnapOverride(modes),
        cursor: (shape) => live.current.cursor(shape),
        variables: (patch, system) => live.current.variables?.(patch, system) ?? [],
        ui: (request) => live.current.ui?.(request) ?? false,
        select: (entityIds) => live.current.select?.(entityIds) ?? false,
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
   * Deja designado exactamente esto. Es lo que QSELECT y FILTER necesitan para
   * que designar por propiedades signifique algo.
   *
   * Opcional porque la selección la sostiene el editor y esta ola no puede
   * tocarlo. Sin ella los dos comandos siguen funcionando y CUENTAN cuántos
   * objetos casan; lo que no hacen es designarlos.
   */
  setSelection?(entityIds: readonly string[]): void;
}

export function useCadStudioCommandEngine(
  options: CadStudioCommandEngineOptions,
): CadCommandEngineHost {
  const session = useCadSessionState();
  const host = useCadCommandEngineHost({
    context: () =>
      cadStudioCommandContext({
        document: options.document.current,
        selection: options.selection.current,
        activeLayer: options.activeLayer,
        variables: session.variables,
        catalogs: session.catalogs,
        view: options.view.current?.view ?? null,
        // El puntero todavía no pasa por el motor: mientras no pase, no hay
        // cursor que ofrecer. Se dice que no lo hay en vez de fingir el origen,
        // para que la entrada directa de distancia responda «mueve el cursor»
        // en lugar de dar un punto medido desde un sitio inventado.
        cursor: null,
        newEntityId: options.newEntityId,
      }),
    apply: options.apply,
    // Previsualización, captura forzada y forma del cursor pertenecen al
    // puntero. Se ignoran a conciencia hasta que el puntero llegue.
    preview: () => {},
    osnapOverride: () => {},
    cursor: () => {},
    variables: (patch, system) => {
      const lines: string[] = [];
      for (const [name, value] of Object.entries(patch)) {
        const outcome = system
          ? session.variables.publish(name, value)
          : session.variables.set(name, value);
        if (!outcome.ok) lines.push(outcome.reason);
      }
      return lines;
    },
    ui: (request) => requestCadUi(request),
    select: (entityIds) => {
      if (!options.setSelection) return false;
      options.setSelection(entityIds);
      return true;
    },
  });

  // Los dos manejadores que necesitan leer un archivo. Van aquí porque SCRIPT
  // tiene que volver a entrar por el MISMO anfitrión: un script es entrada
  // tecleada, y meterla por otra puerta sería un segundo intérprete.
  useCadFileCommandHandlers(
    session,
    useCallback(
      (name: string, text: string) => {
        const report = runCadScript(text, host);
        for (const warning of report.warnings) host.note(warning, "error");
        host.note(`${name}: ${report.executed} renglón(es) ejecutado(s).`, "info");
      },
      [host],
    ),
  );

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
