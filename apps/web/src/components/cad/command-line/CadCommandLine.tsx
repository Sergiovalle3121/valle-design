"use client";

/**
 * La línea de comandos.
 *
 * Sustituye a `CadCommandDock`, que a pesar del nombre es un **copiloto en
 * lenguaje natural**: su marcador de posición dice «pasillo 1.2 entre SMT e
 * inspección», su botón principal dice *Preview* y para que algo ocurra hay que
 * pulsar después *Aplicar*. Tres gestos y una lectura donde AutoCAD tiene cero.
 *
 * Esto es lo contrario: se escribe `L`, se pulsa Enter y se dibuja. El prompt y
 * sus opciones se muestran en el mismo renglón —`Precise el punto siguiente o
 * [Cerrar/desHacer]:`— y las opciones son pulsables, porque leerlas y no poder
 * tocarlas es peor que no mostrarlas.
 *
 * Componente **presentacional**: no conoce el motor ni el documento. Recibe el
 * prompt y emite lo tecleado. Así se pueden probar por separado el tacto (aquí)
 * y la semántica (en las specs del motor).
 *
 * ## OLA «comando» — de píldora flotante a franja acoplada
 *
 * Hasta esta ola la raíz de este componente era una píldora de `w-[min(30rem,
 * 42vw)]` anclada con `absolute bottom-3 left-3` DENTRO de `cad-canvas`: 480 px
 * (33 % de la ventana a 1366 px) flotando sobre el dibujo, con el prompt en un
 * renglón y la caja en otro — dos filas donde AutoCAD tiene una.
 *
 * El armazón (`CadShellFrame`) saca la línea de comandos de `cad-canvas` y la
 * monta en su propia ranura (`commandDock`, fila 4 de la rejilla). Esta raíz ya
 * NO se posiciona a sí misma —nada de `absolute`, `fixed`, `bottom-`, `left-`
 * ni `w-[min(`— y por eso puede ser `w-full`: ancho de ventana entera, como la
 * ventana de comandos real. Prompt y caja de entrada comparten AHORA un único
 * renglón de `CAD_SHELL_METRICS.commandRow` (26 px); el diálogo (el registro,
 * `cad-command-line-log`) se plegó a 0 px por defecto y sólo crece la franja
 * hasta `commandExpanded` (78 px) cuando alguien lo pide, con F2 o con el botón
 * `cad-command-log-toggle` — nunca los dos números sueltos, siempre importados
 * de `cad-shell-layout.ts`, la única fuente de esos px.
 *
 * El desplegable de sugerencias (T-74c, más abajo) y el de historial completo
 * flotan HACIA ARRIBA por un portal a `<body>`: la franja vive pegada al fondo
 * de la ventana, así que cualquier lista que necesite espacio no puede
 * crecer hacia abajo sin salirse de la pantalla.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, History as HistoryIcon } from "lucide-react";
import type { CadPrompt } from "@/lib/cad/engine/command-types";
import { formatCadKeyword, formatCadPrompt } from "@/lib/cad/engine/prompt";
import { formatCadPromptFor, type CadPromptWording } from "@/lib/cad/engine/prompt-plain";
// Lectura DIRECTA del catálogo, no `cadCommandIcon()`: una llamada a función
// que DEVUELVE un componente dispara `react-hooks/static-components` («se
// crea un componente durante el render») aunque el catálogo sea estático —
// el lector del acceso a `[]` sobre un objeto literal SÍ lo reconoce como
// estable, que es exactamente como ya lo lee `CadRibbonButton.tsx`.
import { CAD_COMMAND_ICONS } from "@/components/cad/ribbon/command-icons";
import { CAD_SHELL_METRICS } from "@/components/cad/shell/cad-shell-layout";
import {
  readCommandLogExpanded,
  toggleCommandLogExpanded,
  writeCommandLogExpanded,
} from "./command-log-preference";
// El menú contextual (botón derecho) vive en su propio módulo — ver el
// comentario junto a `{menu && ...}` más abajo — para mantener este archivo
// bajo el presupuesto de 800 líneas (`check:monolith-budget`).
import { CadCommandContextMenu } from "./CadCommandContextMenu";
import { sugerirComandos } from "./command-suggestions";

export interface CadCommandLineEntry {
  /**
   * Identidad estable del renglón, ajena a su posición. `history` se recorta
   * a los últimos `MAX_HISTORY` (`command-engine-host.ts`) — con una clave
   * de React basada en el índice, CADA renglón cambia de índice al caer el
   * más viejo del principio, así que React remonta el diálogo COMPLETO en
   * cada paso de cada comando. Para un lector de pantalla en la región viva
   * (`role="log"`, `aria-live="polite"`) eso significa volver a anunciar los
   * sesenta renglones enteros por cada línea nueva, no sólo la que se sumó.
   */
  id: number;
  /** Lo que se escribió, o el prompt que se resolvió. */
  text: string;
  level: "prompt" | "input" | "info" | "error";
}

export interface CadCommandLineProps {
  /** Prompt activo. `null` cuando no hay comando en curso. */
  prompt: CadPrompt | null;
  /** Últimas líneas del diálogo, de la más antigua a la más reciente. */
  history: readonly CadCommandLineEntry[];
  /** Nombre del último comando repetible, para el marcador de posición. */
  lastCommand?: string | null;
  /**
   * Nombre canónico del comando EN CURSO (`LINE`, `TRIM`…), o `null` sin
   * ninguno activo. Antes había que LEER el prompt entero para saber qué
   * orden lo emitió («Precise el punto siguiente» no dice si es LINE o
   * PLINE); esto lo dice de un vistazo, como el título de la ventana de
   * comandos de AutoCAD.
   */
  activeCommand?: string | null;
  wording?: CadPromptWording; // modo de interfaz: "pro" (gramática del motor, controles de experto) o "esencial" (llana, sin ellos)
  disabled?: boolean;
  onSubmit(value: string): void;
  /** Pulsar una opción equivale a teclear su atajo. */
  onKeyword(keyword: string): void;
  onCancel(): void;
  /** Enter o Espacio con la caja vacía: repetir el último comando. */
  onRepeat(): void;
  /** La caja, para que el lienzo la enfoque al recibir un carácter (editor-keyboard.ts, fase 0). */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

const LEVEL_CLASS: Record<CadCommandLineEntry["level"], string> = {
  prompt: "text-muted-foreground",
  input: "text-primary-ink",
  info: "text-foreground",
  error: "text-danger-ink",
};

/** Alto del registro DESPLEGADO, restando el renglón que la franja ya cobra. */
const LOG_EXPANDED_HEIGHT = CAD_SHELL_METRICS.commandExpanded - CAD_SHELL_METRICS.commandRow;

/** Dónde debe flotar un desplegable que crece HACIA ARRIBA desde la franja. */
interface FloatingAnchor {
  left: number;
  width: number;
  bottom: number;
}

function measureAnchor(root: HTMLElement | null): FloatingAnchor | null {
  if (!root || typeof window === "undefined") return null;
  const rect = root.getBoundingClientRect();
  return { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top };
}

function floatingStyle(anchor: FloatingAnchor): CSSProperties {
  // Posición por `style`, no por clase de Tailwind: la raíz de la franja (y
  // este archivo entero) no puede declarar `fixed`/`bottom-`/`left-` — ver la
  // regla de oro del armazón — y lo que sigue vive en un portal a `<body>`,
  // fuera de esa raíz, así que necesita decir DÓNDE ponerse por sí mismo.
  return { position: "fixed", left: anchor.left, width: anchor.width, bottom: anchor.bottom };
}

export function CadCommandLine({
  prompt,
  history,
  lastCommand,
  activeCommand,
  wording = "pro",
  disabled,
  onSubmit,
  onKeyword,
  onCancel,
  onRepeat,
  inputRef: externalInputRef,
}: CadCommandLineProps) {
  const [value, setValue] = useState("");
  const [recallIndex, setRecallIndex] = useState<number | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  // El usuario navegó las sugerencias con flechas: sólo entonces Enter
  // "entrega" la sugerencia activa en vez de ejecutar lo tecleado.
  const [_navigated, setNavigated] = useState(false);
  // T-«comando»: el registro nace plegado (o como lo dejó la última visita:
  // ver `command-log-preference.ts`). El inicializador perezoso sólo corre
  // una vez y no toca `localStorage` durante el render del servidor.
  const [logExpanded, setLogExpandedState] = useState(() =>
    readCommandLogExpanded(typeof window === "undefined" ? null : window.localStorage),
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [anchor, setAnchor] = useState<FloatingAnchor | null>(null);
  // T-«comandos vivos»: el menú contextual del botón derecho. Coordenadas de
  // la propia pulsación — AutoCAD lo abre justo bajo el puntero, no anclado
  // a la franja — y `null` cuando está cerrado. El menú en sí, con su cierre
  // al pulsar fuera, vive en `CadCommandContextMenu`.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = externalInputRef ?? localInputRef;
  const logRef = useRef<HTMLDivElement | null>(null);
  /**
   * LA ÚLTIMA RESPUESTA, a la vista.
   *
   * El diálogo nace plegado a 0 px (ver la cabecera), así que todo lo que el
   * programa contesta —«Rectángulo · 23.60 m²», el resultado de DIST, el motivo
   * de un rechazo— caía dentro de un registro invisible. Para quien dibuja eso
   * es indistinguible de que no pasara nada, y es la mitad de «el ribbon no
   * sirve». AutoCAD, con su ventana de una línea, enseña siempre el último
   * renglón; aquí se enseña al final del MISMO renglón que ya existe, sin robar
   * un píxel de alto al lienzo y sin desplegar nada.
   */
  const dichoPorElPrograma = history.filter(
    (entry) => entry.level !== "input" && entry.text.trim().length > 0,
  );
  const ultimaRespuesta = dichoPorElPrograma.at(-1)?.text.trim() ?? "";
  const rootRef = useRef<HTMLDivElement | null>(null);

  const setLogExpanded = useCallback((next: boolean) => {
    setLogExpandedState(next);
    writeCommandLogExpanded(typeof window === "undefined" ? null : window.localStorage, next);
  }, []);

  /** Sólo lo tecleado por el usuario se recupera con las flechas. */
  const typed = useMemo(
    () => history.filter((entry) => entry.level === "input").map((entry) => entry.text),
    [history],
  );

  // T-74(c): sólo mientras se escribe el NOMBRE del comando — con un prompt
  // activo (coordenada, opción) o un espacio ya tecleado (argumentos), lo
  // que sigue no es un nombre de comando y sugerir aquí sería ruido, no
  // ayuda.
  const suggestions = useMemo(
    () => (prompt || value.includes(" ") ? [] : sugerirComandos(value)),
    [prompt, value],
  );
  // Cada tecla reinicia la navegación del desplegable: el usuario no ha
  // pulsado flechas sobre las nuevas sugerencias hasta que lo haga.
  useEffect(() => { setNavigated(false); }, [value]); // eslint-disable-line react-hooks/set-state-in-effect -- resetear navegación al teclear es intencional, no un error de sincronización
  // Sin efecto para "reiniciar" el índice en cada tecla (evita el aviso de
  // `react-hooks/set-state-in-effect` y una cascada de renders): en vez de
  // guardar un índice que hay que mantener sincronizado, se AJUSTA al leerlo
  // — válido siempre que haya sugerencias, sin más estado que sincronizar.
  const activeSuggestionIndex = suggestions.length > 0 ? suggestionIndex % suggestions.length : 0;

  useEffect(() => {
    // El diálogo se lee de abajo arriba, como cualquier consola.
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [history]);

  // T-«comandos vivos»: «el historial se ve» — con el registro PLEGADO (el
  // reposo de la franja, 26 px) ya no había ni un renglón de lo dicho o
  // tecleado antes; el usuario tenía que acordarse o pulsar F2. Este
  // asomo enseña los últimos 3 renglones SIN pedirlo, y desaparece solo en
  // cuanto F2 despliega el registro de verdad (dejaría de tener sentido
  // duplicar lo que ya se ve abajo) o se abre cualquier otro desplegable.
  // No puede crecer el `commandDock` (26 px es el contrato que
  // `cad-shell-layout.ts` mide para el 74 % de lienzo con los rieles
  // plegados) así que flota — el mismo truco que ya usan sugerencias e
  // historial completo, sólo lectura y `pointer-events-none`: el ratón del
  // lienzo pasa a través como si no estuviera.
  const showTranscriptPeek = !logExpanded && !historyOpen && suggestions.length === 0 && history.length > 0;
  const transcriptPeek = showTranscriptPeek ? history.slice(-3) : [];

  // T-«comando»: los desplegables (sugerencias, historial completo, el
  // asomo del diálogo) viven en un portal a `<body>` y crecen HACIA ARRIBA
  // desde la franja — la franja está pegada al fondo de la ventana, así que
  // no hay sitio debajo. Se remide al abrirse y en cada resize/scroll
  // mientras estén abiertos; sin ninguno abierto no hay nada que medir ni
  // escuchar.
  const floatingOpen = suggestions.length > 0 || historyOpen || showTranscriptPeek;
  useEffect(() => {
    if (!floatingOpen || typeof window === "undefined") return;
    const update = () => setAnchor(measureAnchor(rootRef.current));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [floatingOpen]);

  // El menú contextual (botón derecho) se cierra con un clic fuera de él —
  // igual que el de `cad-context-menu` del lienzo, resuelto dentro de
  // `CadCommandContextMenu` — o con Escape (más abajo, en `handleKeyDown`).

  /** Cortar/copiar/pegar del menú contextual — el mismo gesto que Ctrl+X/C/V. */
  const runClipboardAction = useCallback(
    (accion: "cut" | "copy" | "paste") => {
      if (disabled) return;
      const el = inputRef.current;
      el?.focus();
      try {
        // Sin `execCommand` no hay forma síncrona de cortar/pegar sobre un
        // <input> desde un menú propio; la Clipboard API async exige
        // permisos que un menú de clic derecho no puede pedir a tiempo.
        // Falla en silencio si el navegador lo bloquea (pestaña sin foco,
        // iframe sin permiso): el atajo de teclado real (Ctrl+X/C/V) sigue
        // funcionando siempre.
        document.execCommand(accion);
      } catch {
        /* bloqueado por el navegador: no hay nada más que intentar aquí */
      }
    },
    [disabled, inputRef],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (menu) {
        // El menú abierto se traga el Escape: un paso para cerrar el menú,
        // otro (ya con el menú cerrado) para lo de siempre.
        if (event.key === "Escape") {
          event.preventDefault();
          setMenu(null);
        }
        return;
      }
      if (event.key === "F2") {
        // Como en AutoCAD: F2 pliega/despliega el registro de la línea de
        // comandos. Al desplegarlo el foco se mueve al propio diálogo (ya es
        // `role="log"`, `tabIndex={0}`) para poder releerlo o desplazarlo con
        // las flechas sin robarle el ratón al lienzo — la razón por la que
        // esto existía antes de que el registro pudiera plegarse (T-73h).
        event.preventDefault();
        const next = toggleCommandLogExpanded(logExpanded);
        setLogExpanded(next);
        if (next) requestAnimationFrame(() => logRef.current?.focus());
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        // El historial completo se cierra en su propio paso: un Esc para
        // cerrar el desplegable, otro para lo de siempre.
        if (historyOpen) {
          setHistoryOpen(false);
          return;
        }
        // Esc con texto escrito lo borra; sin texto, cancela el comando. Es la
        // cascada de AutoCAD: primero se deshace lo tecleado, luego la orden.
        if (value) setValue("");
        else {
          onCancel();
          // El foco VUELVE al lienzo: la caja se enfoca sola con la siguiente
          // tecla imprimible, y Supr o Ctrl+Z vuelven a ser del dibujo.
          inputRef.current?.blur();
        }
        setRecallIndex(null);
        return;
      }
      // T-74(c): con sugerencias a la vista, las flechas navegan la lista
      // (como Ctrl+K) en vez de recuperar historial — las dos comparten
      // tecla y sólo una decisión tiene sentido a la vez: si hay nombres
      // que completar, eso es lo que se está mirando.
      if (suggestions.length > 0 && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        setNavigated(true);
        const total = suggestions.length;
        setSuggestionIndex((i) => {
          const next = event.key === "ArrowDown" ? i + 1 : i - 1;
          return ((next % total) + total) % total;
        });
        return;
      }
      if (suggestions.length > 0 && event.key === "Tab") {
        // Tab completa sin ejecutar — el gesto de autocompletar de toda la
        // vida, para quien quiere revisar u ordenar argumentos antes de
        // Intro.
        event.preventDefault();
        setValue(suggestions[activeSuggestionIndex].nombre);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        if (typed.length === 0) return;
        event.preventDefault();
        const current = recallIndex ?? typed.length;
        const next =
          event.key === "ArrowUp"
            ? Math.max(0, current - 1)
            : Math.min(typed.length, current + 1);
        setRecallIndex(next);
        setValue(next >= typed.length ? "" : typed[next]);
        return;
      }
      if (event.key === "Enter" || (event.key === " " && !value)) {
        event.preventDefault();
        setRecallIndex(null);
        // El foco VUELVE al lienzo (medido: Ctrl+Z dentro de la caja era el
        // historyUndo del navegador, no el del dibujo).
        inputRef.current?.blur();
        // Con la caja vacía, Enter y Espacio repiten. Es el gesto más usado de
        // AutoCAD y hoy no existe en ningún sitio del editor.
        if (!value.trim()) {
          onRepeat();
          return;
        }
        const submitted = value;
        setValue("");
        setNavigated(false);
        onSubmit(submitted);
      }
    },
    [
      activeSuggestionIndex,
      historyOpen,
      inputRef,
      logExpanded,
      menu,
      onCancel,
      onRepeat,
      onSubmit,
      recallIndex,
      setLogExpanded,
      suggestions,
      typed,
      value,
    ],
  );

  const line = prompt ? formatCadPromptFor(prompt, wording, activeCommand ?? null) : "";
  const suggestionListId = "cad-command-line-suggestions", historyListId = "cad-command-history", logId = "cad-command-line-log";
  const idlePlaceholder = lastCommand ? `Comando: Espacio repite ${lastCommand}` : "Comando: escribe una orden (L, C, TR, MI…)";
  // T-«comandos vivos»: qué orden está activa, SIN tener que leer el prompt
  // entero para adivinarlo — «Precise el punto siguiente» no dice si es
  // LINE o PLINE; este rótulo sí.
  const ActiveIcon = activeCommand ? CAD_COMMAND_ICONS[activeCommand.toUpperCase()] : undefined;

  return (
    <div
      ref={rootRef}
      data-testid="cad-command-line"
      // LA REGLA DE ORO DEL ARMAZÓN: esta raíz vive en la ranura `commandDock`
      // de `CadShellFrame` (ya no dentro de `cad-canvas`) y NO se posiciona a
      // sí misma. Nada de `absolute`, `fixed`, `bottom-`, `left-` ni
      // `w-[min(` en esta clase: `w-full` es la ventana entera, no una
      // píldora de 480 px. Los dos desplegables (sugerencias, historial) no
      // están sujetos a esta regla porque NO son hijos en el DOM final — se
      // portan a `<body>` (ver `floatingStyle`) precisamente para poder
      // flotar sin que su padre tenga que dejar de ser una franja acoplada.
      className="flex w-full flex-col border-t border-border bg-popover/95 text-popover-foreground type-caption"
    >
      <div
        // EL RENGLÓN ÚNICO: prompt (o el marcador «Comando:», vía
        // `placeholder`) y caja de entrada COMPARTEN esta fila — donde antes
        // había dos filas apiladas (prompt arriba, entrada abajo) ahora hay
        // una, y su alto es EXACTAMENTE `CAD_SHELL_METRICS.commandRow`: el
        // número que `cad-shell-layout.ts` publica y que el resto del
        // armazón usa para calcular cuánto lienzo queda.
        className="flex w-full items-center gap-1.5 px-2"
        style={{ height: CAD_SHELL_METRICS.commandRow }}
        // T-«comandos vivos»: el botón derecho abre el menú contextual de
        // AutoCAD (repetir, opciones de la orden en curso, portapapeles,
        // cancelar) en vez del menú nativo del navegador — el mismo trato
        // que ya recibe el lienzo en `cad-context-menu`.
        onContextMenu={(event) => {
          if (disabled) return;
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        {prompt && activeCommand && (
          <span
            data-testid="cad-command-active"
            title={`Orden activa: ${activeCommand}`}
            className="flex shrink-0 items-center gap-1 rounded-control border border-primary/30 bg-primary/15 px-1.5 py-0.5 font-mono type-micro font-semibold text-primary-ink"
          >
            {ActiveIcon && <ActiveIcon aria-hidden="true" className="h-3 w-3" />}
            {activeCommand}
          </span>
        )}
        {prompt && (
          <span
            data-testid="cad-command-prompt"
            title={formatCadPrompt(prompt)}
            className="min-w-0 shrink truncate font-mono text-foreground"
          >
            {line}
          </span>
        )}
        {prompt && prompt.options.length > 0 && (
          // `shrink` y el suelo del input: ver (j) en la spec de al lado.
          <span className="flex min-w-0 shrink items-center gap-1 overflow-x-auto">
            {prompt.options.map((option) => (
              <button
                key={option.keyword}
                type="button"
                data-testid={`cad-command-keyword-${option.keyword}`}
                onClick={() => {
                  onKeyword(option.shortcut);
                  inputRef.current?.focus();
                }}
                className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono type-micro text-primary-ink transition-colors hover:bg-muted"
                title={`Atajo: ${option.shortcut.toUpperCase()}`}
              >
                {formatCadKeyword(option)}
              </button>
            ))}
          </span>
        )}
        <input
          ref={inputRef}
          data-testid="cad-command-input"
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-label="Línea de comandos CAD"
          aria-describedby={logId}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={suggestions.length > 0}
          aria-controls={suggestions.length > 0 ? suggestionListId : undefined}
          aria-activedescendant={suggestions.length > 0 ? `${suggestionListId}-${activeSuggestionIndex}` : undefined}
          placeholder={prompt ? "coordenada, distancia u opción" : idlePlaceholder}
          className="min-w-[9rem] flex-1 bg-transparent font-mono text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground"
        />
        {!logExpanded && ultimaRespuesta ? (
          <span
            data-testid="cad-command-last-answer"
            // `title` completo: el renglón recorta, y una medida recortada sin
            // forma de leerla entera sería peor que no enseñarla.
            title={ultimaRespuesta}
            className="hidden min-w-0 max-w-[28rem] shrink truncate text-right font-mono type-micro text-muted-foreground md:block"
          >
            {ultimaRespuesta}
          </span>
        ) : null}
        <button
          type="button" hidden={wording === "esencial"}
          data-testid="cad-command-history-toggle"
          onClick={() => setHistoryOpen((open) => !open)}
          disabled={typed.length === 0}
          aria-label="Ver historial completo de comandos"
          aria-expanded={historyOpen}
          aria-haspopup="listbox"
          title="Historial completo de comandos"
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <HistoryIcon aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
        <button
          type="button" hidden={wording === "esencial"}
          data-testid="cad-command-log-toggle"
          onClick={() => setLogExpanded(toggleCommandLogExpanded(logExpanded))}
          aria-label={logExpanded ? "Ocultar el registro de comandos (F2)" : "Mostrar el registro de comandos (F2)"}
          aria-expanded={logExpanded}
          aria-controls={logId}
          title={logExpanded ? "Ocultar el registro (F2)" : "Mostrar el registro (F2)"}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {logExpanded ? (
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/*
        EL REGISTRO. Siempre montado —el `id`, el `role="log"` y el
        `aria-live` que la caja ya describe (`aria-describedby`) no pueden
        aparecer y desaparecer del documento sólo porque está plegado, o un
        lector de pantalla perdería la región viva entera cada vez— pero su
        alto lo decide `logExpanded`: 0 cuando está plegado (no gasta ni un
        píxel de la franja) y `LOG_EXPANDED_HEIGHT` cuando se despliega, que
        sumado al renglón de arriba da exactamente
        `CAD_SHELL_METRICS.commandExpanded`.
      */}
      <div
        ref={logRef}
        id={logId}
        data-testid="cad-command-line-log"
        role="log"
        aria-live="polite"
        aria-label="Diálogo de la línea de comandos"
        // T-73(h): sin `tabIndex` el diálogo no podía recibir foco — F2
        // lo despliega y manda el foco aquí para releerlo o desplazarlo con
        // las flechas. Escape lo devuelve a la caja.
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
        className="overflow-y-auto border-t border-border px-2 font-mono leading-snug type-micro"
        style={{
          height: logExpanded ? LOG_EXPANDED_HEIGHT : 0,
          paddingTop: logExpanded ? 4 : 0,
          paddingBottom: logExpanded ? 4 : 0,
          borderTopWidth: logExpanded ? 1 : 0,
        }}
      >
        {history.map((entry) => (
          <div key={entry.id} className={LEVEL_CLASS[entry.level]}>
            {entry.level === "input" ? `> ${entry.text}` : entry.text}
          </div>
        ))}
      </div>

      {/*
        T-74(c), reubicado por la ola «comando»: antes esta lista se pintaba
        DEBAJO de la caja, dentro de la píldora flotante — sitio que existía
        porque la píldora flotaba sobre el lienzo y podía crecer sin empujar
        nada. La franja acoplada no tiene ese margen (vive pegada al fondo de
        la ventana), así que la lista se porta a `<body>` y flota HACIA
        ARRIBA, anclada al ancho y a la posición de esta raíz.
      */}
      {suggestions.length > 0 && anchor && typeof document !== "undefined"
        ? createPortal(
            <ul
              id={suggestionListId}
              role="listbox"
              aria-label="Comandos sugeridos"
              style={floatingStyle(anchor)}
              className="z-40 flex max-h-[40vh] flex-col gap-0.5 overflow-y-auto rounded-control border border-border bg-popover/95 px-1 py-1 text-popover-foreground shadow-floating backdrop-blur"
            >
              {suggestions.map((s, i) => {
                // Icono + alias, como el autocompletado de AutoCAD: un
                // renglón muestra el DIBUJO del comando, su atajo corto
                // («L», no sólo «LINE») y el resumen — antes sólo había
                // nombre y resumen, y un veterano reconoce el comando por el
                // icono y el alias antes que por leer el nombre entero.
                const Icono = CAD_COMMAND_ICONS[s.nombre];
                return (
                  <li key={s.nombre}>
                    <button
                      type="button"
                      id={`${suggestionListId}-${i}`}
                      role="option"
                      aria-selected={i === activeSuggestionIndex}
                      data-testid={`cad-command-suggestion-${s.nombre}`}
                      onMouseEnter={() => setSuggestionIndex(i)}
                      onClick={() => {
                        setValue("");
                        setRecallIndex(null);
                        onSubmit(s.nombre);
                        inputRef.current?.focus();
                      }}
                      className={`flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left font-mono type-micro ${
                        i === activeSuggestionIndex ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {Icono ? (
                        <Icono aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="shrink-0 text-primary-ink">{s.nombre}</span>
                      {s.alias && (
                        <span className="type-micro shrink-0 rounded border border-border px-1 text-muted-foreground">
                          {s.alias}
                        </span>
                      )}
                      <span className="truncate text-muted-foreground">{s.descripcion}</span>
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}

      {/*
        EL HISTORIAL COMPLETO. Las flechas ya recuperan lo tecleado una línea
        a la vez (T-73h); esto es para cuando hace falta VER las últimas
        órdenes de un vistazo y elegir una directamente, en vez de contar
        pulsaciones de flecha. Mismo mecanismo de anclaje que las sugerencias
        — un desplegable a la vez, así que abrir uno no exige cerrar el otro
        a mano: rara vez coinciden (el historial es un clic explícito).
      */}
      {historyOpen && anchor && typeof document !== "undefined"
        ? createPortal(
            <div
              id={historyListId}
              data-testid="cad-command-history"
              role="listbox"
              aria-label="Historial de comandos"
              style={floatingStyle(anchor)}
              className="z-40 flex max-h-[40vh] flex-col gap-0.5 overflow-y-auto rounded-control border border-border bg-popover/95 px-1 py-1 text-popover-foreground shadow-floating backdrop-blur"
            >
              {typed.length === 0 ? (
                <p className="px-1.5 py-1 type-micro text-muted-foreground">
                  Todavía no se ha tecleado ningún comando.
                </p>
              ) : (
                [...typed].reverse().map((entry, i) => (
                  <button
                    key={`${i}-${entry}`}
                    type="button"
                    role="option"
                    aria-selected={false}
                    data-testid={`cad-command-history-item-${i}`}
                    onClick={() => {
                      setValue(entry);
                      setRecallIndex(null);
                      setHistoryOpen(false);
                      inputRef.current?.focus();
                    }}
                    className="block w-full truncate rounded px-1.5 py-0.5 text-left font-mono type-micro text-foreground hover:bg-muted"
                  >
                    {entry}
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}

      {/*
        EL ASOMO DEL DIÁLOGO — «el historial se ve». Con el registro plegado
        (el reposo, 26 px) ya no quedaba ni un renglón de lo último dicho o
        tecleado; había que ACORDARSE o pulsar F2. Esto enseña los últimos 3
        renglones sin que nadie lo pida, con el mismo tono que el registro
        real (`LEVEL_CLASS`: el aviso del motor en un gris, lo tecleado en la
        tinta de marca). No puede sumarse al alto de `commandDock` —ahí vive
        el 74 % de lienzo que esta ola no toca— así que flota, de sólo
        lectura (`aria-hidden`: el registro real de abajo, `role="log"`, es
        quien anuncia de verdad) y `pointer-events-none`: el ratón del
        lienzo pasa a través como si no estuviera, igual que el recorrido
        guiado y la consola LISP que ya flotan ahí (`CadCommandLineDock`).
      */}
      {transcriptPeek.length > 0 && anchor && typeof document !== "undefined"
        ? createPortal(
            <div
              data-testid="cad-command-transcript-peek"
              aria-hidden="true"
              style={floatingStyle(anchor)}
              className="pointer-events-none z-30 flex flex-col gap-0.5 overflow-hidden rounded-control border border-border bg-popover/90 px-2 py-1 font-mono type-micro leading-snug text-popover-foreground shadow-floating backdrop-blur"
            >
              {transcriptPeek.map((entry) => (
                <div key={entry.id} className={`truncate ${LEVEL_CLASS[entry.level]}`}>
                  {entry.level === "input" ? `> ${entry.text}` : entry.text}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}

      {/*
        EL MENÚ CONTEXTUAL — botón derecho, como en AutoCAD. Extraído a
        `CadCommandContextMenu` (mismo lenguaje visual que `cad-context-menu`
        del lienzo en `Layout3DEditor.tsx`) para mantener este archivo bajo
        el presupuesto de 800 líneas — el estado (`menu`, coordenadas del
        clic) sigue aquí porque `handleKeyDown` necesita saber si el menú
        está abierto para darle prioridad a Escape.
      */}
      {menu && (
        <CadCommandContextMenu
          point={menu}
          prompt={prompt}
          activeCommand={activeCommand}
          lastCommand={lastCommand}
          onClose={closeMenu}
          onRepeat={() => {
            onRepeat();
            closeMenu();
            inputRef.current?.focus();
          }}
          onKeyword={(shortcut) => {
            onKeyword(shortcut);
            closeMenu();
            inputRef.current?.focus();
          }}
          onCancel={() => {
            onCancel();
            closeMenu();
            inputRef.current?.blur();
          }}
          onClipboardAction={(accion) => {
            runClipboardAction(accion);
            closeMenu();
          }}
        />
      )}
    </div>
  );
}

export default CadCommandLine;
