/**
 * DÓNDE SE ABRE LO QUE FLOTA SOBRE LA CINTA — el desplegable de un panel y la
 * etiqueta de ayuda de un botón.
 *
 * Los casos salen de lo medido en la vista previa de la PR #209 a 1366×768
 * (AUDITORIA-MIMO-20260919, «Cinta»): la tira de paneles va de y=74 a 151;
 * el panel Modificar empieza en x=273; su desplegable medía 1175×187 px y se
 * salía por la derecha hasta x=1448; la etiqueta de «Línea» empezaba en
 * x=-59; y el `focus()` del primer comando desplazaba la cinta 78 px.
 *
 * Sin navegador: la geometría es pura y lo que toca el DOM recibe dobles con
 * la forma mínima que usa (`ribbon-floating.ts`).
 *
 * Correr: npx tsx src/components/cad/ribbon/ribbon-floating.spec.ts
 */
import { strict as assert } from "node:assert";
import {
  CAD_RIBBON_FIRST_COMMAND_SELECTOR,
  CAD_RIBBON_FLOATING_MARGIN,
  CAD_RIBBON_FLYOUT_METRICS,
  cadRibbonFlyoutRows,
  cadRibbonFocusIsVisible,
  focusFirstCadRibbonCommand,
  isInsideCadRibbonFloating,
  openCadRibbonFlyout,
  placeCadRibbonFloating,
  positionCadRibbonFloating,
  type CadRibbonFloatingElement,
  type CadRibbonFloatingRect,
} from "./ribbon-floating";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const VIEW = { width: 1366, height: 768 };
const rect = (left: number, top: number, right: number, bottom: number): CadRibbonFloatingRect => ({ left, top, right, bottom });
/** El panel Modificar a 1366×768, medido: de x=273, bajo la tira que acaba en y=151. */
const MODIFICAR = rect(273, 74, 520, 151);

// ── 1 · El desplegable ancho no se sale por la derecha ──────────────────────
{
  const p = placeCadRibbonFloating(MODIFICAR, { width: 1175, height: 187 }, VIEW);
  ok(p.left + 1175 <= VIEW.width - CAD_RIBBON_FLOATING_MARGIN, `el borde derecho queda dentro (${p.left + 1175} ≤ ${VIEW.width - 8}); antes x=1448`);
  ok(p.left === VIEW.width - CAD_RIBBON_FLOATING_MARGIN - 1175, `se empuja hacia la izquierda lo justo: left=${p.left}`);
  ok(p.top === 153 && p.side === "bottom", `se abre bajo el panel, no dentro de la tira: top=${p.top}`);
  ok(p.maxHeight === VIEW.height - 8 - 153, `el tope de alto es lo que queda hasta el borde inferior (${p.maxHeight})`);
}
{
  const p = placeCadRibbonFloating(MODIFICAR, { width: 788, height: 245 }, VIEW);
  ok(p.left === 273, "si cabe, se alinea con el borde izquierdo de su panel, como el slide-out de AutoCAD");
}
{
  const p = placeCadRibbonFloating(rect(1300, 74, 1360, 151), { width: 300, height: 100 }, VIEW);
  ok(p.left === 1058 && p.left + 300 === 1358, `un panel pegado a la derecha abre su desplegable hacia dentro (left=${p.left})`);
}
{
  const p = placeCadRibbonFloating(MODIFICAR, { width: 2000, height: 100 }, VIEW);
  ok(p.left === 8 && p.maxWidth === 1350, "más ancho que la ventana: pegado al margen y con la ventana como tope (se desplaza por dentro)");
}
{
  const p = placeCadRibbonFloating(MODIFICAR, { width: 100, height: 100 }, { width: 10, height: 10 });
  ok(p.maxWidth === 0 && p.maxHeight >= 0 && p.left >= 0, "en una ventana diminuta los topes no son negativos");
}

// ── 2 · La etiqueta de ayuda, centrada y dentro de la ventana ──────────────
{
  const linea = rect(12, 76, 80, 136);
  const p = placeCadRibbonFloating(linea, { width: 150, height: 65 }, VIEW, { align: "center", gap: 8 });
  ok(p.left === 8, `la etiqueta de «Línea» no empieza fuera de la pantalla (left=${p.left}; antes -59)`);
  ok(p.top === 144, "va 8 px bajo el botón (el mt-2 de siempre)");
  const centro = rect(600, 76, 668, 136);
  const q = placeCadRibbonFloating(centro, { width: 150, height: 65 }, VIEW, { align: "center", gap: 8 });
  ok(q.left === 559, `con sitio, centrada bajo su botón (left=${q.left})`);
}

// ── 3 · Arriba sólo si abajo no cabe ─────────────────────────────────────
{
  const p = placeCadRibbonFloating(rect(100, 700, 200, 720), { width: 100, height: 200 }, VIEW);
  ok(p.side === "top" && p.top === 498, `sin sitio abajo y con sitio arriba, se abre hacia arriba (top=${p.top})`);
  const q = placeCadRibbonFloating(rect(100, 100, 200, 120), { width: 100, height: 500 }, { width: 800, height: 300 });
  ok(q.side === "bottom" && q.maxHeight === 170, "sin sitio en ningún lado: el lado con más sitio, con tope de alto");
}

// ── 4 · La forma del desplegable ─────────────────────────────────────────
{
  const width = (count: number, rows: number) => {
    const columns = Math.ceil(count / rows);
    const m = CAD_RIBBON_FLYOUT_METRICS;
    return columns * m.column + (columns - 1) * m.gap + m.chrome;
  };
  ok(cadRibbonFlyoutRows(32, 1366) === 8, "Modificar (32 comandos) a 1366: ocho filas, cuatro columnas");
  ok(width(32, cadRibbonFlyoutRows(32, 1366)) === 788, `Modificar mide 788 px (antes 1175): ${width(32, 8)}`);
  ok(cadRibbonFlyoutRows(32, 1280) === 8, "a 1280 igual");
  ok(cadRibbonFlyoutRows(37, 1366) === 10, "37 comandos: las columnas se alargan, no se multiplican");
  ok(cadRibbonFlyoutRows(3, 1366) === 3, "pocos comandos: una columna");
  for (const count of [6, 7, 13, 24]) {
    ok(cadRibbonFlyoutRows(count, 1366) === 6, `${count} comandos: las seis filas de siempre`);
  }
  ok(cadRibbonFlyoutRows(32, 600) === 16, "en una ventana de 600 px caben dos columnas: 16 filas");
  ok(cadRibbonFlyoutRows(0, 1366) === 1, "sin comandos no hay división por cero");
  for (const viewport of [600, 800, 1024, 1280, 1366, 1920]) {
    for (let count = 1; count <= 60; count += 1) {
      const rows = cadRibbonFlyoutRows(count, viewport);
      const columns = Math.ceil(count / rows);
      assert.ok(columns <= CAD_RIBBON_FLYOUT_METRICS.maxColumns, `${count}@${viewport}: ${columns} columnas`);
      assert.ok(width(count, rows) <= viewport - 2 * CAD_RIBBON_FLOATING_MARGIN, `${count}@${viewport}: ${width(count, rows)} px no caben`);
    }
  }
  checks += 1;
}

// ── 5 · Lo que toca el DOM ───────────────────────────────────────────────
type FakeFloating = CadRibbonFloatingElement & {
  measuredWith: { left: string; top: string; maxWidth: string; maxHeight: string }[];
  contains(node: Node | null): boolean;
  querySelector(selector: string): Element | null;
};

function fakeFloating(natural: { width: number; height: number }, inside: readonly unknown[] = [], first: unknown = null): FakeFloating {
  const self: FakeFloating = {
    style: { position: "", left: "", top: "", maxWidth: "", maxHeight: "", visibility: "" },
    dataset: {},
    measuredWith: [],
    getBoundingClientRect() {
      const { left, top, maxWidth, maxHeight } = self.style;
      self.measuredWith.push({ left, top, maxWidth, maxHeight });
      return natural;
    },
    contains: (node) => node === (self as unknown) || inside.includes(node),
    querySelector: (selector) => (selector === CAD_RIBBON_FIRST_COMMAND_SELECTOR ? (first as Element | null) : null),
  };
  return self;
}

{
  const floating = fakeFloating({ width: 1175, height: 187 });
  floating.style.maxHeight = "50px";
  floating.style.left = "900px";
  const p = positionCadRibbonFloating(floating, { getBoundingClientRect: () => MODIFICAR }, { innerWidth: 1366, innerHeight: 768 });
  const at = floating.measuredWith[0];
  ok(at.left === "0px" && at.top === "0px" && at.maxWidth === "" && at.maxHeight === "", "mide su tamaño natural: en la esquina y sin los topes de la vez anterior");
  ok(floating.style.position === "fixed", "position: fixed (en un portal a <body>, fuera de la tira que lo recortaba)");
  ok(floating.style.left === `${p.left}px` && floating.style.top === "153px", `queda donde dice la geometría (${floating.style.left}, ${floating.style.top})`);
  ok(floating.style.maxWidth === "1350px" && floating.style.maxHeight === "607px", "con los topes de la ventana");
  ok(floating.style.visibility === "visible", "nace invisible y se enseña ya colocado");
  ok(floating.dataset.side === "bottom", "declara hacia dónde se abrió");
}

{
  const calls: { selector: string; options?: FocusOptions }[] = [];
  const boton = { focus: (options?: FocusOptions) => calls.push({ selector: "boton", options }) };
  const focused = focusFirstCadRibbonCommand({
    querySelector: (selector) => {
      calls.push({ selector });
      return boton as unknown as Element;
    },
  });
  ok(focused === (boton as unknown), "enfoca el primer comando");
  ok(calls[0].selector === CAD_RIBBON_FIRST_COMMAND_SELECTOR && CAD_RIBBON_FIRST_COMMAND_SELECTOR.includes(":not([disabled])"), "salta los deshabilitados (sólo lectura): uno deshabilitado no toma el foco");
  ok(calls[1].options?.preventScroll === true, "focus({ preventScroll: true }): la cinta ya no salta 78 px al abrir");
  ok(focusFirstCadRibbonCommand(null) === null, "sin desplegable no hace nada");
}

{
  ok(!isInsideCadRibbonFloating(null, [{ contains: () => true }]), "sin objetivo no está dentro");
  ok(!isInsideCadRibbonFloating({} as EventTarget, [null, undefined]), "sin contenedores no está dentro");
  ok(cadRibbonFocusIsVisible({ matches: (s) => s === ":focus-visible" }), "foco de teclado: se ve");
  ok(!cadRibbonFocusIsVisible({ matches: () => { throw new Error("selector desconocido"); } }), "un navegador sin :focus-visible no rompe nada");
  ok(!cadRibbonFocusIsVisible(null), "sin objetivo no hay foco");
}

// ── 6 · El desplegable abierto: coloca, enfoca, escucha y limpia ───────────
{
  type Listener = (event: Event) => void;
  const listeners = (label: string) => {
    const map = new Map<string, Set<Listener>>();
    return {
      label,
      map,
      addEventListener: (type: string, listener: Listener) => {
        if (!map.has(type)) map.set(type, new Set());
        map.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: Listener) => {
        map.get(type)?.delete(listener);
      },
      fire: (type: string, target: unknown) => {
        for (const listener of map.get(type) ?? []) listener({ target } as unknown as Event);
      },
      count: () => [...map.values()].reduce((total, set) => total + set.size, 0),
    };
  };
  const doc = listeners("document");
  const view = Object.assign(listeners("window"), { innerWidth: 1366, innerHeight: 768 });
  const comando = {};
  const focusCalls: (FocusOptions | undefined)[] = [];
  const primero = { focus: (options?: FocusOptions) => focusCalls.push(options) };
  const popover = fakeFloating({ width: 788, height: 245 }, [comando], primero);
  const disparador = {};
  const root = { contains: (node: Node | null) => node === (disparador as unknown) };
  let dismissed = 0;

  const cleanup = openCadRibbonFlyout({
    popover,
    anchor: { getBoundingClientRect: () => MODIFICAR },
    root,
    view,
    doc,
    onDismiss: () => {
      dismissed += 1;
    },
  });
  ok(popover.style.position === "fixed" && popover.style.left === "273px" && popover.style.top === "153px", "al abrir queda colocado bajo su panel");
  ok(focusCalls.length === 1 && focusCalls[0]?.preventScroll === true, "y enfoca su primer comando sin desplazar la cinta");

  doc.fire("pointerdown", comando);
  doc.fire("pointerdown", popover);
  ok(dismissed === 0, "pulsar dentro del desplegable no lo cierra");
  doc.fire("pointerdown", disparador);
  ok(dismissed === 0, "pulsar el disparador lo gestiona el disparador (abrir/cerrar), no el clic fuera");
  doc.fire("pointerdown", {});
  ok(dismissed === 1, "pulsar fuera lo cierra");

  const medidas = popover.measuredWith.length;
  view.fire("scroll", comando);
  ok(popover.measuredWith.length === medidas, "desplazar el propio desplegable no lo recoloca (lo devolvería arriba del todo)");
  let anclaMovida = MODIFICAR;
  const popover2 = fakeFloating({ width: 788, height: 245 });
  const cleanup2 = openCadRibbonFlyout({
    popover: popover2,
    anchor: { getBoundingClientRect: () => anclaMovida },
    root: null,
    view,
    doc,
    onDismiss: () => undefined,
  });
  anclaMovida = rect(173, 74, 420, 151);
  view.fire("scroll", {});
  ok(popover.measuredWith.length === medidas + 1, "si se desplaza algo de fuera (la tira en una tableta), se recoloca");
  ok(popover2.style.left === "173px", `y sigue a su panel (left=${popover2.style.left})`);
  cleanup2();
  view.fire("resize", view);
  ok(dismissed === 2, "si la ventana cambia de tamaño se cierra: la cinta reparte sus paneles después y el panel ya no está donde estaba");

  ok(doc.count() === 1 && view.count() === 2, "escucha pointerdown, resize y scroll");
  cleanup();
  ok(doc.count() === 0 && view.count() === 0, "al cerrar no deja ningún oyente colgado");
}

console.log(`ribbon-floating: ${checks}/${checks} comprobaciones verdes`);
