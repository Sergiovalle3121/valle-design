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
import type { CadVariableAccess } from "@/lib/cad/system-variables";
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";
import type { CadView } from "@/lib/cad/view/cad-view";
import { cadDocumentExtents, cadEntityExtents } from "@/lib/cad/view/document-extents";
import type { CadPreviewPath } from "@/lib/cad/engine/command-types";
import type { SnapType } from "@/lib/cad/snap-engine";
import { useCadFileCommandHandlers, useCadSessionState } from "./session-catalogs";
import {
  CadCommandEngineHost,
  type CadCommandEngineBridge,
  type CadCommandEngineSnapshot,
} from "./command-engine-host";
import {
  CadNavigationHost,
  type CadNavigationSnapshot,
  type CadViewControllerLike,
} from "./navigation-host";
import { CadPlotHost, downloadCadFile } from "./plot-host";
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
        // `view` y `host` SE REENVÍAN. Olvidarlos aquí dejaba a ZOOM y a PLOT
        // llegando hasta el motor, emitiendo su efecto y muriendo en un
        // «no está disponible en este contexto» — la clase de fallo que sólo
        // destapa un recorrido de punta a punta, porque cada pieza estaba bien.
        view: (request) => live.current.view?.(request) ?? null,
        host: (request) => live.current.host?.(request) ?? null,
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
  /**
   * Controlador de vista vivo. El editor ya guardaba aquí su
   * `CadViewController`, así que ZOOM, PAN y VIEW encuadran la cámara REAL sin
   * que el editor tenga que cablear nada nuevo: el controlador que ya pasaba
   * para leer `pixelsPerUnit` es el mismo que ahora recibe `setView`.
   */
  view: { current: (CadViewControllerLike & { view: CadView }) | null };
  activeLayer: string;
  /** Pestaña abierta, si el editor está en espacio papel. */
  activeLayout?: string | null;
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
  /** Trabajo fuera del documento: trazar, publicar, cambiar de espacio. */
  host?(request: CadHostRequest): string;
  /**
   * Posición viva del puntero, en unidades de dibujo.
   *
   * Antes era siempre `null` con un comentario diciendo que el puntero no
   * pasaba por el motor. Ya pasa: lo publica el enrutador del viewport en cada
   * movimiento. Sigue pudiendo ser `null` —el ratón fuera del lienzo—, y en ese
   * caso el motor responde «mueve el cursor» en vez de medir desde un origen
   * inventado.
   */
  cursor?: { current: { x: number; y: number } | null };
  /** Banda elástica: los trazos del paso actual, ya con su geometría real. */
  preview?(paths: readonly CadPreviewPath[]): void;
  /** Modos de captura forzados por el paso actual. */
  osnapOverride?(modes: readonly SnapType[] | null): void;
  /** Forma del cursor del viewport. */
  cursorShape?(shape: "crosshair" | "pick" | "none"): void;
}

/**
 * Anfitrión de navegación del estudio.
 *
 * Se crea UNA vez, igual que el del motor: lleva dentro la pila de vistas
 * previas y las vistas con nombre, y recrearlo en un render las borraría. El
 * puente delega en las opciones vivas a través de una `ref`, por lo mismo que
 * el del motor.
 */
export function useCadStudioNavigation(
  options: Pick<CadStudioCommandEngineOptions, "document" | "view">,
): CadNavigationHost {
  const live = useRef(options);
  live.current = options;
  return useMemo(
    () =>
      new CadNavigationHost({
        controller: () => live.current.view.current,
        // La envolvente se recalcula por petición y no se memoriza: ZOOM
        // Extensión se teclea unas pocas veces por sesión, y una caché que
        // envejece encuadraría el dibujo de hace tres órdenes.
        extents: () => {
          const document = live.current.document.current;
          return document ? cadDocumentExtents(document) : null;
        },
        entityBounds: (entityId) => {
          const document = live.current.document.current;
          return document ? cadEntityExtents(document, entityId) : null;
        },
      }),
    [],
  );
}

/**
 * Anfitrión de trazado del estudio.
 *
 * Se crea una vez, igual que los otros dos, y lee el documento vivo por `ref`.
 * La descarga va por `downloadCadFile`, que es lo único de aquí que necesita
 * DOM — inyectado para que el anfitrión se pueda probar en Node.
 */
export function useCadStudioPlotHost(
  options: Pick<CadStudioCommandEngineOptions, "document"> & {
    /** Adónde va el renglón del trazado cuando termina. */
    note?: (text: string, level: "info" | "error") => void;
  },
): CadPlotHost {
  const live = useRef(options);
  live.current = options;
  return useMemo(
    () =>
      new CadPlotHost({
        document: () => live.current.document.current,
        download: downloadCadFile,
        onResult: (text, level) => live.current.note?.(text, level),
      }),
    [],
  );
}

export function useCadStudioCommandEngine(
  options: CadStudioCommandEngineOptions,
): CadCommandEngineHost {
  const session = useCadSessionState();
  const navigation = useCadStudioNavigation(options);
  // El anfitrión del motor todavía no existe cuando se crea el de trazado, así
  // que el renglón del resultado se enruta por una `ref` que se rellena justo
  // después. Es la misma técnica del puente vivo, y evita el orden imposible.
  const engineRef = useRef<CadCommandEngineHost | null>(null);
  const plot = useCadStudioPlotHost({
    document: options.document,
    note: (text, level) => engineRef.current?.note(text, level),
  });
  const live = useRef(options);
  live.current = options;
  // `CLAYER` sin tocar ES la capa del editor.
  //
  // La tabla de variables nace con `CLAYER = "0"`, y el contexto del estudio da
  // preferencia a `CLAYER` cuando nombra una capa que existe. La capa «0»
  // existe SIEMPRE, así que ese valor de fábrica tapaba la capa que el usuario
  // acababa de elegir en el panel: con el puntero enrutado al motor, dibujar
  // tras cambiar de capa escribía en «0» (golden 33).
  //
  // Aquí `CLAYER` se lee como la capa activa del editor mientras nadie la haya
  // escrito — que es exactamente lo que ya hacía `(getvar "CLAYER")` en el
  // intérprete LISP, `host.activeLayer()`—, y en cuanto un comando o un `.scr`
  // la fija, manda el valor fijado. Así `-LAYER definir` sigue mandando sobre
  // el dibujo de un guion, y el panel de capas sigue mandando sobre el ratón.
  //
  // LÍMITE, dicho en voz alta: una vez escrita, `CLAYER` gana aunque después se
  // cambie de capa en el panel. Cerrar ese círculo es la ligadura inversa
  // —el editor observando la variable— y pertenece a quien traiga el panel de
  // capas al motor, no a este PR.
  const clayerWritten = useRef(false);
  const variables = useMemo<CadVariableAccess>(
    () => ({
      get: (name) =>
        name.toUpperCase() === "CLAYER" && !clayerWritten.current
          ? live.current.activeLayer
          : session.variables.get(name),
      set: (name, value) => {
        if (name.toUpperCase() === "CLAYER") clayerWritten.current = true;
        return session.variables.set(name, value);
      },
      publish: (name, value) => {
        if (name.toUpperCase() === "CLAYER") clayerWritten.current = true;
        return session.variables.publish(name, value);
      },
    }),
    [session],
  );
  const engine = useCadCommandEngineHost({
    context: () =>
      cadStudioCommandContext({
        document: options.document.current,
        selection: options.selection.current,
        activeLayer: options.activeLayer,
        variables,
        catalogs: session.catalogs,
        view: options.view.current?.view ?? null,
        // El puntero YA pasa por el motor: esto es lo que el enrutador del
        // viewport publica en cada movimiento. Sigue pudiendo faltar —el ratón
        // fuera del lienzo—, y entonces se dice que no lo hay en vez de fingir
        // el origen, para que la entrada directa de distancia responda «mueve
        // el cursor» en lugar de medir desde un sitio inventado.
        cursor: options.cursor?.current ?? null,
        newEntityId: options.newEntityId,
        activeLayout: options.activeLayout ?? null,
      }),
    apply: options.apply,
    view: navigation.apply,
    // El anfitrión del estudio traza de verdad. Un `host` propio en las
    // opciones lo sustituye, que es lo que hace un guion sin navegador.
    host: (request) => live.current.host?.(request) ?? plot.handle(request),
    // Previsualización, captura forzada y forma del cursor pertenecen al
    // puntero, y el puntero YA llegó: las tres las sirve el enrutador del
    // viewport a través de estas opciones. Sin enrutador —un guion, una
    // prueba— siguen siendo opcionales y no pasa nada.
    preview: (paths) => options.preview?.(paths),
    osnapOverride: (modes) => options.osnapOverride?.(modes),
    cursor: (shape) => options.cursorShape?.(shape),
    variables: (patch, system) => {
      const lines: string[] = [];
      for (const [name, value] of Object.entries(patch)) {
        // Por la fachada, no por la tabla: es lo que apunta que `CLAYER` ya
        // tiene dueño y deja de ser un espejo de la capa del editor.
        const outcome = system
          ? variables.publish(name, value)
          : variables.set(name, value);
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
  engineRef.current = engine;

  // Los dos manejadores que necesitan leer un archivo. Van aquí porque SCRIPT
  // tiene que volver a entrar por el MISMO anfitrión: un script es entrada
  // tecleada, y meterla por otra puerta sería un segundo intérprete.
  useCadFileCommandHandlers(
    session,
    useCallback(
      (name: string, text: string) => {
        const report = runCadScript(text, engine);
        for (const warning of report.warnings) engine.note(warning, "error");
        engine.note(`${name}: ${report.executed} renglón(es) ejecutado(s).`, "info");
      },
      [engine],
    ),
  );

  return engine;
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

/**
 * Lectura del estado de navegación: vistas con nombre, profundidad de la pila
 * de `ZOOM Previo` y regeneraciones. Mismo patrón que el del motor.
 */
export function useCadNavigation(host: CadNavigationHost): CadNavigationSnapshot {
  return useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
}
