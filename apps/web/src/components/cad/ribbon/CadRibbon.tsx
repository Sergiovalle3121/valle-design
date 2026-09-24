"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cx, Tabs, TabPanel } from "@/components/ui";
import { CAD_RIBBON_DATA, type CadRibbonTabId } from "@/lib/cad/ribbon";
import { planCadRibbonLayout } from "@/lib/cad/ribbon-layout";
import { cadRibbonBodySlot } from "@/components/cad/shell/ribbon-body-slot";
import { attachCadDraftToolbarSlot } from "@/components/cad/shell/draft-toolbar-slot";
import { cadUiModeHost, useCadUiMode } from "@/components/cad/shell/ui-mode-host";
import { CadUiModeSwitch } from "@/components/cad/shell/CadUiModeSwitch";
import { CadEssentialBar } from "@/components/cad/essential/CadEssentialBar";
import { CadActiveCommandContext } from "./active-command";
import { CadRibbonPanel } from "./CadRibbonPanel";

/**
 * T-74(j): «la cinta no recuerda nada» — cada carga volvía a Inicio y
 * desplegada, aunque quien dibuja viva en Anotar o prefiera la cinta
 * minimizada. Una clave de `localStorage` sin repartir por tenant/usuario a
 * propósito: es cosmético (qué pestaña se ve), no un dato — el mismo nivel
 * que `render-pipeline-preference.ts`, no el de `guided-tour.ts` (que sí
 * necesita saber QUIÉN ya vio algo).
 */
const RIBBON_ACTIVE_TAB_KEY = "valle_cad_ribbon_active_tab";
const RIBBON_COLLAPSED_KEY = "valle_cad_ribbon_collapsed";
/**
 * Paneles plegados a mano, como «pestaña/panel»; misma naturaleza cosmética.
 *
 * `_v2`: con la clave anterior, pulsar el RÓTULO de un panel lo plegaba y lo
 * guardaba — quien sólo quería abrir «Dibujo» se quedaba sin sus botones en
 * cada visita. Ahora el rótulo abre el desplegable y plegar se pide a
 * propósito; lo guardado con la clave vieja fueron, casi siempre, esos
 * plegados sin querer, así que no se hereda y se borra.
 */
export const CAD_RIBBON_PANELS_KEY = "valle_cad_ribbon_panels_collapsed_v2";
export const CAD_RIBBON_PANELS_LEGACY_KEY = "valle_cad_ribbon_panels_collapsed";

function leerPestanaGuardada(): CadRibbonTabId | null {
  try {
    const stored = window.localStorage.getItem(RIBBON_ACTIVE_TAB_KEY);
    return stored && CAD_RIBBON_DATA.some((tab) => tab.id === stored)
      ? (stored as CadRibbonTabId)
      : null;
  } catch {
    // Privado, bloqueado o inexistente: se sigue con el defecto, nunca se rompe la cinta por esto.
    return null;
  }
}

function leerColapsoGuardado(): boolean | null {
  try {
    const stored = window.localStorage.getItem(RIBBON_COLLAPSED_KEY);
    return stored === null ? null : stored === "true";
  } catch {
    return null;
  }
}

function leerPanelesPlegados(): ReadonlySet<string> {
  try {
    const stored = window.localStorage.getItem(CAD_RIBBON_PANELS_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

/**
 * Ancho inicial de la tira ANTES de que el ResizeObserver mida: la cinta
 * ocupa todo el ancho del estudio (`cad-shell` es `fixed inset-0`), así que
 * la ventana es la mejor estimación y evita pintar un primer cuadro con todos
 * los paneles desplegados y luego plegarlos. En el servidor no hay ventana
 * (y este componente no se renderiza ahí), pero `renderToStaticMarkup` en
 * las specs sí lo llama: 1280, el viewport de los goldens.
 */
function anchoInicial(): number {
  return typeof window === "undefined" ? 1280 : window.innerWidth;
}

/** `px-1` de la tira de paneles: lo que la ventana no da a los paneles. */
const STRIP_PADDING = 8;

/**
 * Todos los nombres de comando que SÍ tocan el documento — calculado una vez,
 * no en cada render: el registro entero no cambia en caliente.
 */
const CAD_MUTATING_COMMANDS: ReadonlySet<string> = new Set(
  CAD_RIBBON_DATA.flatMap((tab) =>
    tab.panels.flatMap((panel) =>
      panel.commands
        .filter((command) => command.mutates)
        .map((command) => command.name),
    ),
  ),
);

/**
 * LA CINTA. Pestañas al estilo AutoCAD sobre el registro real de comandos —
 * ver `docs/execution/DEUDA-MONOLITO.md` y `lib/cad/ribbon.ts` para el cómo y
 * el porqué. Se monta una vez, arriba del todo del estudio (`Layout3DEditor`
 * usa `flex flex-col`, así que un hijo nuevo aquí sólo empuja el lienzo hacia
 * abajo — no reordena nada de lo que ya existía).
 *
 * `dispatch` es el MISMO punto de entrada que la línea de comandos
 * (`commandEngineRef.current.invoke`): un clic en un botón de la cinta no es
 * un camino nuevo, es el camino de siempre con un mouse en vez de un teclado.
 *
 * ## Sin scroll horizontal
 *
 * La tira de paneles medía ~10 700 px con la barra de scroll oculta. Ahora
 * un `ResizeObserver` mide el ancho real y `planCadRibbonLayout` decide qué
 * paneles pierden columnas, se reducen a sus botones grandes o se pliegan a
 * un botón (de derecha a izquierda, como AutoCAD). La tira conserva
 * `overflow-x-auto` sólo como red para ventanas de tableta, donde ni el
 * plan mínimo cabe: ahí se desplaza en vez de amputar botones. Ese
 * `overflow-x` fuerza `overflow-y: auto` y recorta todo lo que cuelgue por
 * debajo de la tira: por eso nada de lo que se abre desde un panel vive
 * dentro de ella.
 */
export function CadRibbon({
  dispatch,
  readOnly,
  disabledCommands,
  className,
  quickAccess,
  trailing,
  trailingFixed,
  onSelectTool,
  onOpenPalette,
  activeCommand,
}: {
  dispatch: (commandName: string) => void;
  readOnly?: boolean;
  disabledCommands?: ReadonlySet<string>;
  className?: string;
  /**
   * Ola «armazón» — el `appBar` de `CadShellFrame` es UNA fila de 32 px que
   * junta título, pestañas de la cinta, cierre y accesos 2D/3D: ya no hay una
   * barra de 48/56 px propia encima. `quickAccess` es lo que va ANTES de las
   * pestañas (título, insignias de sólo-lectura); `trailing`, lo que
   * va DESPUÉS (2D/3D, Modelo/Presentación, Guardar, Cerrar editor). Ninguno
   * de los dos es un comando de dibujo: ver `docs/execution/DEUDA-
   * MONOLITO.md`, sección «armazón», para por qué el resto de la barra vieja
   * no vino con ellos (ya vive en la cinta o en el nuevo riel derecho).
   */
  quickAccess?: ReactNode;
  trailing?: ReactNode;
  /**
   * La COLA FIJA: lo que no puede exigir un desplazamiento para llegar — el
   * estado de aprobación, «Guardar» y «Cerrar editor». Se pinta al final, en
   * un bloque que NO cede, detrás de la banda de iconos que sí lo hace.
   */
  trailingFixed?: ReactNode;
  /** Modo Esencial: «Seleccionar» vuelve al puntero (no es un comando del motor). */
  onSelectTool?: () => void;
  /** Modo Esencial: «Buscar · Ctrl K» abre la paleta de comandos. */
  onOpenPalette?: () => void;
  /**
   * El comando que el motor tiene ABIERTO, o `null` en reposo. Enciende su
   * botón —en la cinta y en la barra de Esencial— para que la pantalla diga
   * qué herramienta hay en la mano: `ribbon/active-command.ts` guarda la
   * medición del defecto que esto cierra.
   */
  activeCommand?: string | null;
}) {
  // MODO ESENCIAL (Tanda 1, 22-sep-2026): la cinta se ESCONDE, no se borra. En
  // Esencial la fila superior conserva accesos rápidos, interruptor y cola
  // fija (Guardar / Cerrar), y el cuerpo que va a la ranura `ribbon` es la
  // barra de doce herramientas. Los tres estados de la cinta (pestaña,
  // plegado, paneles) no se tocan: al volver a Pro reaparece como estaba.
  const mode = useCadUiMode();
  const esencial = mode === "esencial";
  // DÓNDE VA EL CUERPO — ver `shell/ribbon-body-slot.ts`. Sin ranura montada
  // (una spec que renderiza `CadRibbon` aislado, por ejemplo) el cuerpo se
  // pinta inline, debajo de las pestañas, como antes de la ola «armazón».
  const bodyContainer = useSyncExternalStore(
    cadRibbonBodySlot.subscribe,
    cadRibbonBodySlot.getSnapshot,
    cadRibbonBodySlot.getServerSnapshot,
  );
  // T-74(j): la lectura de `localStorage` va en el INICIALIZADOR perezoso
  // de `useState`, no en un efecto — `CadStudioHost` monta `Layout3DEditor`
  // (y por tanto esta cinta) con `ssr: false` en las dos rutas que existen
  // (`app/studio/[documentId]/page.tsx`, `app/demo/DemoStudio.tsx`), así que
  // este componente NUNCA se renderiza en el servidor: no hay HTML de
  // servidor con el que desajustarse al hidratar. Sincronizar desde un
  // efecto habría disparado `react-hooks/set-state-in-effect` (la regla
  // NO distingue «restaurar una vez al montar» de un `setState` reactivo) y
  // habría costado un re-render extra visible al abrir el estudio.
  const [activeTab, setActiveTab] = useState<CadRibbonTabId>(
    () => leerPestanaGuardada() ?? "inicio",
  );
  const [collapsed, setCollapsed] = useState<boolean>(
    () => leerColapsoGuardado() ?? false,
  );
  const [manuallyCollapsed, setManuallyCollapsed] = useState<
    ReadonlySet<string>
  >(() => leerPanelesPlegados());
  const [stripWidth, setStripWidth] = useState<number>(anchoInicial);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(RIBBON_ACTIVE_TAB_KEY, activeTab);
    } catch {
      // Almacenamiento privado o lleno: recordar la pestaña es una
      // comodidad, no una promesa — no hay nada que avisar aquí.
    }
  }, [activeTab]);
  useEffect(() => {
    try {
      window.localStorage.setItem(RIBBON_COLLAPSED_KEY, String(collapsed));
    } catch {
      // Igual que arriba.
    }
  }, [collapsed]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        CAD_RIBBON_PANELS_KEY,
        JSON.stringify([...manuallyCollapsed]),
      );
      window.localStorage.removeItem(CAD_RIBBON_PANELS_LEGACY_KEY);
    } catch {
      // Igual que arriba.
    }
  }, [manuallyCollapsed]);

  // El ancho real de la tira, medido; el `setState` va en la llamada del
  // observador, no en el cuerpo del efecto. El envoltorio observado
  // sobrevive al cambio de pestaña y al minimizado, así que se observa una
  // sola vez al montar.
  useEffect(() => {
    // En Esencial no hay tira que medir; al volver a Pro el efecto se rehace
    // (dependencia `mode`) y vuelve a observar la tira recién montada.
    if (mode === "esencial") return;
    const element = stripRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setStripWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [mode]);

  // T-74(i): sólo lectura apagaba la cinta ENTERA (`pointer-events-none`
  // sobre la tira completa) — incluidos comandos como LIST o DIST, que no
  // tocan el documento y deberían seguir funcionando igual que en un dibujo
  // editable. Ahora sólo se apagan los que SÍ mutan, botón por botón, con la
  // misma señal visual (`disabled:opacity-40`) que ya usa `CadRibbonButton`
  // para cualquier otro comando deshabilitado.
  const effectiveDisabledCommands = useMemo(() => {
    if (!readOnly) return disabledCommands;
    if (!disabledCommands || disabledCommands.size === 0)
      return CAD_MUTATING_COMMANDS;
    return new Set([...CAD_MUTATING_COMMANDS, ...disabledCommands]);
  }, [disabledCommands, readOnly]);

  const activeTabData =
    CAD_RIBBON_DATA.find((tab) => tab.id === activeTab) ?? CAD_RIBBON_DATA[0];
  const manualForTab = useMemo(
    () =>
      new Set(
        [...manuallyCollapsed]
          .filter((entry) => entry.startsWith(`${activeTabData.id}/`))
          .map((entry) => entry.slice(activeTabData.id.length + 1)),
      ),
    [activeTabData.id, manuallyCollapsed],
  );
  const plan = useMemo(
    () =>
      planCadRibbonLayout(
        activeTabData,
        stripWidth - STRIP_PADDING,
        manualForTab,
      ),
    [activeTabData, manualForTab, stripWidth],
  );
  const togglePanel = (label: string) => {
    const key = `${activeTabData.id}/${label}`;
    setManuallyCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Sin insignia de conteo en la pestaña: AutoCAD no la tiene, y «159» al
  // lado de «Inicio» era ruido que no ayudaba a encontrar nada.
  const tabs = CAD_RIBBON_DATA.map((tab) => ({
    id: tab.id,
    label: tab.label,
    "data-testid": `cad-ribbon-tab-${tab.id}`,
  }));

  // EL CUERPO — los grupos de botones. Se manda por portal a `bodyContainer`
  // (la ranura `ribbon` de `CadShellFrame`, 0/72 px); sin contenedor (una
  // spec que renderiza `CadRibbon` aislado, por ejemplo) se pinta inline,
  // debajo de las pestañas, como ANTES de la ola «armazón». `data-testid=
  // "cad-ribbon"` y `data-collapsed` viven AQUÍ, no en la fila de pestañas:
  // es el alto de ESTA caja el que le importa al lienzo (golden 214), y es
  // este booleano el que golden 163 comprueba que sobrevive a un reload.
  const body = esencial ? (
    <CadEssentialBar
      dispatch={dispatch}
      onSelectTool={onSelectTool ?? (() => undefined)}
      onOpenPalette={onOpenPalette ?? (() => undefined)}
      onMore={() => cadUiModeHost.set("pro")}
      readOnly={readOnly}
      attachToolsSlot={attachCadDraftToolbarSlot}
    />
  ) : (
    <div
      ref={stripRef}
      data-testid="cad-ribbon"
      data-collapsed={collapsed ? "true" : "false"}
      className={cx(
        "w-full",
        // Sin `bodyContainer` no hay rejilla que reparta el alto: el borde y
        // el fondo propios evitan que el cuerpo se confunda con el lienzo.
        !bodyContainer && "border-b border-border bg-surface/90 backdrop-blur",
        className,
      )}
    >
      {!collapsed &&
        CAD_RIBBON_DATA.map((tab) => (
          <TabPanel key={tab.id} id={tab.id} active={tab.id === activeTab}>
            {tab.id === activeTab ? (
              <div
                data-testid={`cad-ribbon-panels-${tab.id}`}
                data-strip-width={Math.round(stripWidth)}
                className={cx(
                  "flex items-stretch overflow-x-auto px-1 py-0",
                  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                )}
              >
                {tab.panels.map((panel) => (
                  <CadRibbonPanel
                    key={panel.label}
                    panel={panel}
                    onRun={dispatch}
                    disabledCommands={effectiveDisabledCommands}
                    layout={plan.get(panel.label)}
                    manuallyCollapsed={manualForTab.has(panel.label)}
                    onToggleCollapsed={() => togglePanel(panel.label)}
                  />
                ))}
              </div>
            ) : null}
          </TabPanel>
        ))}
    </div>
  );

  // LA FILA DE PESTAÑAS — el `appBar` del armazón. Antes de la ola «armazón»
  // esta fila era sólo las pestañas; la barra de cerrar/título/2D-3D vivía en
  // un `div[data-testid="cad-top-toolbar"]` propio de 48/56 px ENCIMA de
  // ella. Las dos se fusionaron en ÉSTA — de ahí que el testid y el `h-8`
  // (32 px, el presupuesto de `CAD_SHELL_METRICS.appBar`) se hayan mudado
  // aquí. `data-cad-appbar="true"` es el gancho nuevo para quien necesite
  // distinguir "la fila que hace de appBar" sin depender del testid heredado.
  const header = (
    <div
      data-testid="cad-top-toolbar"
      data-cad-appbar="true"
      // Lo leen «Compartir» y «Guardar», que en Pro por debajo de 1440 px se
      // quedan en su icono: las diez pestañas no ceden desde 1280 (golden
      // 215) y la cola fija no cabía con las dos palabras. En Esencial sobra
      // sitio y se leen siempre.
      data-cad-ui={esencial ? "esencial" : "pro"}
      className={cx(
        "flex h-8 items-center gap-1.5 overflow-x-auto border-b border-border bg-surface/90 pr-1 backdrop-blur",
        "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      {quickAccess ? (
        // CEDE, con un mínimo que conserva cerrar + logotipo (3,25 rem):
        // el título ya venía con `truncate`, pero este envoltorio era
        // `shrink-0`, así que nunca cedía de verdad. Medido en la CI (Linux)
        // de la #224 el 2026-09-22 a 1280 px: la fila pedía 1292 px —doce por
        // encima de la ventana; en Windows la misma fila mide 1243, por el
        // trazado de la fuente— y el golden 215 la daba por desbordada. Con el título cediendo, «el título se trunca y
        // los controles secundarios ceden el espacio» pasa de comentario a
        // comportamiento.
        <div className="flex min-w-[3.25rem] max-w-40 shrink items-center gap-1.5">
          {quickAccess}
        </div>
      ) : null}
      {esencial ? null : (
      <Tabs
        items={tabs}
        value={activeTab}
        onChange={(id) => setActiveTab(id as CadRibbonTabId)}
        label="Pestañas de la cinta"
        size="sm"
        // `[&_button]:py-1`: la fila de pestañas medía 34 px con el py-2 de
        // `size="sm"`; a 720 px de alto cada píxel de cinta se lo come el
        // lienzo (golden 19: lienzo 511 px con 520 de mínimo, medido).
        //
        // Y LA BARRA DE DESPLAZAMIENTO, OCULTA. `Tabs` lleva `overflow-x-auto`
        // y con diez pestañas su contenido no cabe, así que Windows le pintaba
        // una barra horizontal que suma 14,3 px de ALTO: medido el 2026-09-20
        // en la vista previa, el botón mide 27,4 px y la fila 41,7 — dentro de
        // un `appBar` de 32. Sobresalía 5,2 px por arriba y empujaba «Guardar»
        // y «Cerrar editor» a `y = -0,3`, fuera del viewport (golden 215). La
        // fila de fuera ya se oculta la suya con estas tres reglas; a ésta se
        // le olvidó. Se desplaza igual, sin gastar alto ni pintar una franja
        // gris encima del dibujo.
        //
        // Desde 1280 px las diez pestañas conservan su ancho completo; el
        // título se trunca y los controles secundarios ceden el espacio.
        // En ventanas menores la cinta conserva el desplazamiento horizontal.
        className="min-w-[12rem] shrink min-[1280px]:shrink-0 border-b-0 px-2 [&_button]:py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      />
      )}
      {trailing && !esencial ? (
        // `border-l`: separa la cola de la fila de pestañas — antes las dos
        // sólo compartían un `gap-1.5`, sin ancla visual entre "pestañas" y
        // "el resto de controles" (sistema-visual, regla 1: barra ordenada
        // en grupos, no una masa).
        //
        // ESTE BLOQUE CEDE Y SE DESPLAZA, ya no es `shrink-0`. Medido el
        // 2026-09-20 a 1280 px: pedía 1834 px —más ancho que la ventana
        // entera— y al no ceder empujaba la barra a 2292 px de contenido en
        // 1280 de hueco. Trece de sus cuarenta y cinco botones quedaban fuera
        // de la pantalla, sin barra que avisara. Ahora cede lo que haga falta
        // y desplaza dentro de sí (con su barra oculta, como la de fuera): la
        // barra superior deja de desbordar la ventana. Que haya que
        // desplazarse para llegar a un icono sigue siendo un problema, pero es
        // el de vaciar esta cola —mudarla a la cinta y al riel—, no el de
        // romper el ancho de la ventana.
        <div className="flex min-w-12 flex-1 items-center gap-1.5 overflow-x-auto border-l border-border pl-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {trailing}
        </div>
      ) : null}
      {/* El interruptor Esencial/Pro va en la cola FIJA, junto a Guardar: siempre a la vista en los dos modos. */}
      {trailingFixed ? (
        // NO CEDE. Todo lo demás de esta fila se encoge o se desplaza cuando la
        // ventana aprieta; esto no, porque es «Guardar» y «Cerrar editor».
        <div className="flex shrink-0 items-center gap-1.5 border-l border-border pl-2">
          <CadUiModeSwitch />
          {trailingFixed}
        </div>
      ) : (
        <CadUiModeSwitch />
      )}
      {esencial ? null : (
      <button
        type="button"
        data-testid="cad-ribbon-collapse"
        onClick={() => setCollapsed((value) => !value)}
        title={collapsed ? "Mostrar la cinta" : "Minimizar la cinta"}
        aria-label={collapsed ? "Mostrar la cinta" : "Minimizar la cinta"}
        className="shrink-0 rounded-control p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {collapsed ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
      )}
    </div>
  );

  return (
    // El proveedor envuelve cabecera Y cuerpo: los desplegables de panel se
    // pintan en un portal, y un portal sigue dentro del árbol de React, así
    // que sus botones también saben cuál está encendido.
    <CadActiveCommandContext value={activeCommand ?? null}>
      {header}
      {bodyContainer ? createPortal(body, bodyContainer) : body}
    </CadActiveCommandContext>
  );
}
