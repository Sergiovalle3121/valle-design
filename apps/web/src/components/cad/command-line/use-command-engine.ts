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
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";
import type { CadView } from "@/lib/cad/view/cad-view";
import { cadDocumentExtents, cadEntityExtents } from "@/lib/cad/view/document-extents";
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
  /** Trabajo fuera del documento: trazar, publicar, cambiar de espacio. */
  host?(request: CadHostRequest): string;
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
  options: Pick<CadStudioCommandEngineOptions, "document">,
): CadPlotHost {
  const live = useRef(options);
  live.current = options;
  return useMemo(
    () =>
      new CadPlotHost({
        document: () => live.current.document.current,
        download: downloadCadFile,
      }),
    [],
  );
}

export function useCadStudioCommandEngine(
  options: CadStudioCommandEngineOptions,
): CadCommandEngineHost {
  const navigation = useCadStudioNavigation(options);
  const plot = useCadStudioPlotHost(options);
  const live = useRef(options);
  live.current = options;
  return useCadCommandEngineHost({
    context: () =>
      cadStudioCommandContext({
        document: options.document.current,
        selection: options.selection.current,
        activeLayer: options.activeLayer,
        view: options.view.current?.view ?? null,
        // El puntero todavía no pasa por el motor: mientras no pase, no hay
        // cursor que ofrecer. Se dice que no lo hay en vez de fingir el origen,
        // para que la entrada directa de distancia responda «mueve el cursor»
        // en lugar de dar un punto medido desde un sitio inventado.
        cursor: null,
        newEntityId: options.newEntityId,
        activeLayout: options.activeLayout ?? null,
      }),
    apply: options.apply,
    view: navigation.apply,
    // El anfitrión del estudio traza de verdad. Un `host` propio en las
    // opciones lo sustituye, que es lo que hace un guion sin navegador.
    host: (request) => live.current.host?.(request) ?? plot.handle(request),
    // Previsualización, captura forzada y forma del cursor pertenecen al
    // puntero. Se ignoran a conciencia hasta que el puntero llegue.
    preview: () => {},
    osnapOverride: () => {},
    cursor: () => {},
  });
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
