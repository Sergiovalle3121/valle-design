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
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { CAD_COMMAND_REGISTRY_V2 } from "@/lib/cad/engine";
import type { CadCommandRegistry } from "@/lib/cad/engine/command-engine";
import { registerCadUiHandler, requestCadUi } from "@/components/cad/palettes/palette-command-bus";
import { cadActionScript } from "@/lib/cad/automation/action-recorder";
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import { runCadScript } from "@/lib/cad/script-runner";
import type { CadVariableAccess } from "@/lib/cad/system-variables";
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";
import type { CadView } from "@/lib/cad/view/cad-view";
import type { CadVisualStyleId } from "@/lib/cad/view/visual-styles";
import { cadDocumentExtents, cadEntityExtents } from "@/lib/cad/view/document-extents";
import type { CadPreviewPath } from "@/lib/cad/engine/command-types";
import type { SnapType } from "@/lib/cad/snap-engine";
import { useCadFileCommandHandlers, useCadSessionState } from "./session-catalogs";
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
import {
  CadNavigationHost,
  type CadNavigationSnapshot,
  type CadViewControllerLike,
} from "./navigation-host";
import { CadPlotHost, downloadCadFile } from "./plot-host";
import { cadStudioSheetSetBridge, type CadStudioSheetSetPort } from "./sheet-set-host";
import { createDesignSheetSetPort } from "./sheet-set-design-port";
import { CadPlotStyleCatalog } from "@/lib/cad/plot/plot-style-catalog";
import type { CadPlotStyleTable } from "@/lib/cad/plot/plot-style-table";
import { handleCadDxfHostRequest } from "./dxf-host";
import { handleCadEtransmitHostRequest } from "./etransmit-host";
import { handleCadDataExtractionHostRequest } from "./data-extraction-host";
import { handleCadUcsPlanRequest } from "./ucs-plan-host";
import { handleCadHistoryHostRequest } from "./history-host";
import { handleCadXrefHostRequest, type CadXrefHostBridge } from "./xref-host";
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
  /**
   * `LTSCALE` ES `document.meta.linetypeScale` (Ola F, 2026-09-02).
   *
   * Medido antes: `LTSCALE 500` escribía la variable de SESIÓN y el visor, la
   * lámina y el DXF seguían leyendo `meta.linetypeScale`, así que la orden no
   * movía un solo guion —justo el «LTSCALE 2 que no mueve nada» contra el que
   * avisa `settings-variables.ts`. Por la fachada, como `CLAYER`: leer la
   * variable devuelve la del documento y escribirla la aplica con su entrada
   * de deshacer. Opcional: sin editor (un guion, una prueba) queda en sesión.
   */
  linetypeScale?: { get: () => number; set: (value: number) => void };
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
  /**
   * Organización y usuario, para la biblioteca de rutinas `.lsp`.
   *
   * Opcional porque el editor todavía no la pasa: mientras no lo haga, la
   * biblioteca vive bajo `anon` y es la misma para todo el mundo en ese
   * navegador. Es un límite declarado, no un descuido; pasarla es una línea en
   * el punto de montaje y está pedida en el PR.
   */
  identity?: CadLispIdentity;
  /**
   * Aplica un estilo visual del visor (VSCURRENT/SHADEMODE) y devuelve la
   * etiqueta aplicada, o `null` si este espacio de trabajo no tiene visor de
   * sólidos. Opcional: un guion sin lienzo simplemente dice que no hay visor.
   */
  visualStyle?(styleId: CadVisualStyleId): string | null;
  /**
   * Cambia el espacio activo del editor (MSPACE/PSPACE/MODEL/LAYOUT).
   * Devuelve si de verdad cambió; sin él, el anfitrión de trazado responde que
   * el cambio no está disponible en vez de afirmarlo.
   */
  setSpace?(space: "model" | "paper", layoutId?: string): boolean;
  /**
   * Lleva al usuario a la configuración de página de esa presentación
   * (PAGESETUP por cuadro). Sin él, PAGESETUP lo dice y ofrece sus opciones
   * por línea de comandos, que siguen completas.
   */
  openPageSetup?(layoutId: string): void;
  /**
   * La pila de deshacer del editor, un paso cada vez (`U`, `UNDO`, `REDO`).
   *
   * Opcional: un guion o una prueba sin editor no tiene historial, y entonces
   * las tres órdenes responden que no hay pila en vez de afirmar que
   * deshicieron algo. Cada función devuelve si de verdad DIO el paso, que es lo
   * que permite al anfitrión contar los que dio en vez de decir «Hecho».
   */
  history?: { undo(): boolean; redo(): boolean };
  /**
   * Trae un dibujo del inquilino y lo proyecta como referencia externa
   * (`XATTACH`). Opcional: sin él la orden dice qué falta en vez de fingir.
   */
  attachXref?: CadXrefHostBridge;
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
  options: Pick<
    CadStudioCommandEngineOptions,
    "document" | "visualStyle" | "setSpace" | "openPageSetup"
  > & {
    /** Adónde va el renglón del trazado cuando termina. */
    note?: (text: string, level: "info" | "error") => void;
    /**
     * La red de los conjuntos de planos. Se inyecta para poder montar este
     * anfitrión en una prueba sin tocar la API; en el estudio real es
     * `createDesignSheetSetPort()`.
     */
    sheetSetPort?: CadStudioSheetSetPort;
    /**
     * Tablas de plumas de la SESIÓN: las tres de fábrica más el `.ctb` del
     * despacho que `STYLESMANAGER Cargar` haya traído. Sin ellas, elegir una
     * tabla con `PAGESETUP Estilos` dejaba la hoja sin poder trazarse.
     */
    plotStyles?: { tables(): ReadonlyMap<string, CadPlotStyleTable> };
  },
): CadPlotHost {
  const live = useRef(options);
  live.current = options;
  return useMemo(() => {
    // El renglón de resultado se nombra UNA vez: lo comparten el anfitrión de
    // trazado y el puente de conjuntos, y así la ref viva se lee en un solo
    // sitio en vez de en dos.
    const note = (text: string, level: "info" | "error") =>
      live.current.note?.(text, level);
    // El conjunto de planos, por fin enchufado (`P1-8`): hasta ahora nadie
    // aportaba `sheetSet()`, así que PUBLISH y SHEETSET respondían siempre «el
    // conjunto no está cargado en este estudio». El puente vive en
    // `sheet-set-host.ts` porque el monolito sólo puede encoger; aquí se ata una
    // sola vez, para que su caché sobreviva a los renders.
    const sheetSets = cadStudioSheetSetBridge(
      options.sheetSetPort ?? createDesignSheetSetPort(),
    );
    // Las tablas de plumas de la sesión. Sin este puente, `PAGESETUP Estilos
    // monochrome` dejaba escrita en la hoja una tabla que PLOT no podía
    // encontrar, y trazar esa hoja pasaba a ser imposible.
    const plotStyles = options.plotStyles ?? new CadPlotStyleCatalog();
    return new CadPlotHost({
      document: () => live.current.document.current,
      download: downloadCadFile,
      onResult: note,
      plotStyleTables: () => plotStyles.tables(),
      sheetSet: (sheetSetId) => sheetSets.sheetSet(sheetSetId),
      loadSheetSet: (sheetSetId) => sheetSets.loadSheetSet(sheetSetId, note),
      saveSheetSet: (set) => sheetSets.saveSheetSet(set, note),
      setVisualStyle: (styleId) => live.current.visualStyle?.(styleId) ?? null,
      // Los puentes de espacio y de configuración de página sólo existen si
      // el editor los aporta: pasarlos como funciones que devuelven «no» los
      // convertiría en éxitos falsos otra vez, que es lo que se acaba de
      // arreglar. `undefined` deja que el anfitrión de trazado diga la verdad.
      ...(options.setSpace
        ? {
            setSpace: (space: "model" | "paper", layoutId?: string) =>
              live.current.setSpace?.(space, layoutId) ?? false,
          }
        : {}),
      ...(options.openPageSetup
        ? {
            openPageSetup: (layoutId: string) =>
              live.current.openPageSetup?.(layoutId),
          }
        : {}),
    });
  }, []);
}

export function useCadStudioCommandEngine(
  options: CadStudioCommandEngineOptions,
): CadCommandEngineHost {
  /**
   * El subsistema AutoLISP, enchufado.
   *
   * `lib/lisp/` existía entero desde la ola 1 y nadie lo importaba: un veterano
   * no podía cargar ni ejecutar una sola de sus rutinas. Estas líneas son el
   * enchufe: el registro COMPUESTO hace que un `(defun c:MICOMANDO …)` se teclee
   * como cualquiera de los 96 nativos, y el runtime queda atado al anfitrión
   * para que la consola lo encuentre.
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

  const session = useCadSessionState();
  const navigation = useCadStudioNavigation(options);
  // El anfitrión del motor todavía no existe cuando se crea el de trazado, así
  // que el renglón del resultado se enruta por una `ref` que se rellena justo
  // después. Es la misma técnica del puente vivo, y evita el orden imposible.
  const engineRef = useRef<CadCommandEngineHost | null>(null);
  const plot = useCadStudioPlotHost({
    document: options.document,
    note: (text, level) => engineRef.current?.note(text, level),
    // Las tablas de plumas son de la SESIÓN, como los tipos de línea cargados:
    // el mismo plano se traza con la tabla del cliente A o la del B.
    plotStyles: session.plotStyles,
    visualStyle: options.visualStyle,
    ...(options.setSpace ? { setSpace: options.setSpace } : {}),
    ...(options.openPageSetup ? { openPageSetup: options.openPageSetup } : {}),
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
  // LTSCALE vive en el documento (ver `linetypeScale` en las opciones): la
  // tabla de sesión valida el valor (mínimo 1e-6) y, si lo admite, el editor
  // lo aplica al documento, que es lo que leen el visor, la lámina y el DXF.
  const applyLinetypeScale = (name: string, value: unknown) => {
    if (name.toUpperCase() !== "LTSCALE" || typeof value !== "number") return;
    live.current.linetypeScale?.set(value);
  };
  const variables = useMemo<CadVariableAccess>(
    () => ({
      get: (name) => {
        if (name.toUpperCase() === "CLAYER" && !clayerWritten.current) return live.current.activeLayer;
        if (name.toUpperCase() === "LTSCALE" && live.current.linetypeScale) return live.current.linetypeScale.get();
        return session.variables.get(name);
      },
      set: (name, value) => {
        if (name.toUpperCase() === "CLAYER") clayerWritten.current = true;
        const outcome = session.variables.set(name, value);
        if (outcome.ok) applyLinetypeScale(name, value);
        return outcome;
      },
      publish: (name, value) => {
        if (name.toUpperCase() === "CLAYER") clayerWritten.current = true;
        const outcome = session.variables.publish(name, value);
        if (outcome.ok) applyLinetypeScale(name, value);
        return outcome;
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
    // El anfitrión de INTERCAMBIO va antes que el de trazado: `DXFOUT` no
    // traza, entrega un archivo, y encadenarlos así deja cada uno con una sola
    // responsabilidad en vez de un anfitrión que lo hace todo.
    // El del SCU va antes que los otros dos por lo mismo que el de
    // intercambio: `PLAN` no traza ni entrega archivos, mueve la vista, y cada
    // anfitrión se queda con una sola responsabilidad.
    // ETRANSMIT y DATAEXTRACTION sólo necesitan `document()` y `download` —lo
    // mismo que DXFOUT ya usa— así que llegan al dibujo REAL sin que
    // `Layout3DEditor.tsx` tenga que aportar nada nuevo: ese archivo está en
    // su techo exacto (19.002/19.002 líneas) y `check:cad` prohíbe tocarlo.
    host: (request) =>
      live.current.host?.(request) ??
      handleCadXrefHostRequest(request, live.current.attachXref ?? null) ??
      handleCadHistoryHostRequest(request, {
        undo: () => live.current.history?.undo() ?? false,
        redo: () => live.current.history?.redo() ?? false,
      }) ??
      handleCadUcsPlanRequest(request, { controller: () => live.current.view.current ?? null }) ??
      handleCadDxfHostRequest(request, { download: downloadCadFile }) ??
      handleCadEtransmitHostRequest(request, { download: downloadCadFile }) ??
      handleCadDataExtractionHostRequest(request, { download: downloadCadFile }) ??
      plot.handle(request),
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
  },
  // El registro COMPUESTO: los nativos primero y, sólo si allí no está, lo que
  // aporten las rutinas `.lsp` cargadas. Un nativo nunca pierde.
  lisp.registry);
  engineRef.current = engine;
  attachCadLisp(engine, lisp);

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
    // DXFIN pidió el archivo y sigue vivo esperando su contenido: se le entrega
    // por la puerta de archivos, que no lo vuelca en el diálogo ni lo pasa por
    // el analizador de coordenadas. Si el usuario tardó tanto en elegir que el
    // comando ya no está, se vuelve a invocar en vez de tragarse el archivo.
    useCallback(
      (name: string, text: string) => {
        if (!engine.busy) engine.invoke("DXFIN");
        engine.feedFile(name, text);
      },
      [engine],
    ),
    // MAPIMPORT (Ola G): el mismo trato que DXFIN, con el sobre de archivos.
    useCallback(
      (name: string, text: string) => {
        if (!engine.busy) engine.invoke("MAPIMPORT");
        engine.feedFile(name, text);
      },
      [engine],
    ),
    // IMAGEATTACH (Ola H): ídem, con el sobre de la imagen.
    useCallback(
      (name: string, text: string) => {
        if (!engine.busy) engine.invoke("IMAGEATTACH");
        engine.feedFile(name, text);
      },
      [engine],
    ),
  );

  useCadActionRecorder(engine);

  return engine;
}

/**
 * Cierra el circuito del GRABADOR DE ACCIONES.
 *
 * Las órdenes (`engine/commands/automation-actions.ts`) piden; el anfitrión
 * graba —es el único que ve la sucesión de acciones—; y aquí se conectan las
 * dos cosas, más la REPETICIÓN, que vuelve a entrar por la misma puerta que
 * SCRIPT: `runCadScript` sobre el mismo anfitrión. Un macro repetido y un
 * guión ejecutado recorren exactamente el mismo camino, así que no hay dos
 * intérpretes que puedan divergir.
 */
function useCadActionRecorder(engine: CadCommandEngineHost): void {
  useEffect(
    () =>
      registerCadUiHandler("action-recorder", (request) => {
        const action = request.params?.action ?? "";
        const name = request.params?.name ?? "";
        if (action === "start") {
          engine.note(engine.startRecording(name), "info");
          return true;
        }
        if (action === "stop") {
          const result = engine.stopRecording();
          if ("message" in result) {
            engine.note(result.message, "error");
            return true;
          }
          // El macro se imprime ENTERO en el diálogo a propósito: es un `.scr`
          // legible, y verlo es lo que permite copiarlo a un archivo y llevarlo
          // a otro proyecto. Los macros viven en la sesión; el archivo, no.
          engine.note(
            `ACTSTOP: «${result.recording.name}» grabado con ${result.recording.commands} ` +
              `orden(es). Repítalo con ACTMANAGER, o cópielo a un .scr:`,
            "info",
          );
          engine.note(cadActionScript(result.recording), "info");
          return true;
        }
        if (action === "list") {
          const macros = engine.recordedMacros();
          engine.note(
            macros.length === 0
              ? "No hay ningún macro grabado en esta sesión. Grabe uno con ACTRECORD."
              : `Macros de esta sesión: ${macros
                  .map((macro) => `${macro.name} (${macro.commands} orden(es))`)
                  .join(" · ")}.`,
            "info",
          );
          return true;
        }
        if (action === "play") {
          const macro = engine.recordedMacro(name);
          if (!macro) {
            engine.note(
              `No hay ningún macro «${name}» en esta sesión. Liste los que hay con ACTMANAGER e Intro.`,
              "error",
            );
            return true;
          }
          engine.replay(() => {
            const report = runCadScript(cadActionScript(macro), engine);
            for (const warning of report.warnings) engine.note(warning, "error");
            engine.note(
              `ACTMANAGER: «${macro.name}» repetido, ${report.executed} renglón(es).`,
              "info",
            );
          });
          return true;
        }
        return false;
      }),
    [engine],
  );
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
