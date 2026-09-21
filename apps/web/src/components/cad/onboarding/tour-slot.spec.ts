/**
 * El hueco del recorrido en el muelle izquierdo: se publica SÓLO si se ve.
 *
 * Lo que se afirma es lo que devolvería el recorrido a flotar encima de la
 * paleta —o lo haría desaparecer— si fallara:
 *
 *  1. Con el muelle a la vista, el hueco se publica: el recorrido se pinta ahí
 *     y deja el lienzo libre.
 *  2. Con el muelle montado pero OCULTO por CSS (tableta, modo enfoque), no se
 *     publica: un hueco sin caja se tragaría el recorrido entero.
 *  3. Cuando el muelle se oculta o vuelve, el observador de tamaño lo nota sin
 *     que nadie vuelva a montar nada.
 *  4. Plegado a su riel o apagado, el hueco se desmonta y el recorrido vuelve a
 *     flotar; y publicar sin cambio no despierta a nadie.
 */
import { strict as assert } from "node:assert";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/** Un elemento de mentira: sólo lo que el hueco mira. */
class FakeElement {
  shown = true;
  getClientRects = () => (this.shown ? [{ width: 224, height: 0 }] : []);
}

/** `ResizeObserver` de mentira: guarda a quién observa para dispararlo a mano. */
class FakeResizeObserver {
  static live = new Set<FakeResizeObserver>();
  readonly targets = new Set<unknown>();
  constructor(private readonly callback: () => void) {
    FakeResizeObserver.live.add(this);
  }
  observe = (target: unknown) => {
    this.targets.add(target);
  };
  disconnect = () => {
    this.targets.clear();
    FakeResizeObserver.live.delete(this);
  };
  static resize(target: unknown) {
    for (const observer of FakeResizeObserver.live)
      if (observer.targets.has(target)) observer.callback();
  }
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;

async function specs(): Promise<void> {
  const { cadTourSlot } = await import("./tour-slot");
  const asElement = (fake: FakeElement) => fake as unknown as HTMLElement;

  let published = 0;
  cadTourSlot.subscribe(() => {
    published += 1;
  });

  // --- 0. SIN MUELLE, EL RECORRIDO FLOTA ------------------------------------
  ok(cadTourSlot.getSnapshot() === null, "sin muelle montado no hay hueco");
  ok(cadTourSlot.getServerSnapshot() === null, "en el servidor no hay muelle");

  // --- 1. MUELLE A LA VISTA: SE PUBLICA EL HUECO ----------------------------
  const dock = new FakeElement();
  cadTourSlot.attach(asElement(dock));
  ok(cadTourSlot.getSnapshot() === asElement(dock), "con el muelle visible, el recorrido va al muelle");
  ok(published === 1, "montar el hueco avisa una vez");

  // React vuelve a llamar al ref con el mismo nodo: no es un cambio.
  cadTourSlot.attach(asElement(dock));
  ok(published === 1, "el mismo hueco dos veces no vuelve a publicar");

  // --- 2 y 3. EL MUELLE SE OCULTA POR CSS Y VUELVE ---------------------------
  dock.shown = false;
  FakeResizeObserver.resize(dock);
  ok(cadTourSlot.getSnapshot() === null, "muelle oculto (tableta, modo enfoque): el recorrido vuelve a flotar");
  ok(published === 2, "ocultarse avisa");

  FakeResizeObserver.resize(dock);
  ok(published === 2, "otra medida sin cambio no despierta a nadie");

  dock.shown = true;
  FakeResizeObserver.resize(dock);
  ok(cadTourSlot.getSnapshot() === asElement(dock), "el muelle vuelve y el recorrido regresa a él");
  ok(published === 3, "volver avisa");

  // --- 2b. MONTADO YA OCULTO: nunca se publica -------------------------------
  cadTourSlot.attach(null);
  const hiddenDock = new FakeElement();
  hiddenDock.shown = false;
  cadTourSlot.attach(asElement(hiddenDock));
  ok(cadTourSlot.getSnapshot() === null, "un muelle que nace oculto no se traga el recorrido");

  // --- 4. PLEGADO AL RIEL: EL HUECO SE DESMONTA ------------------------------
  cadTourSlot.attach(asElement(dock));
  ok(cadTourSlot.getSnapshot() === asElement(dock), "otro hueco visible se publica");
  cadTourSlot.attach(null);
  ok(cadTourSlot.getSnapshot() === null, "muelle plegado o apagado: el recorrido flota");
  ok(FakeResizeObserver.live.size === 0, "al desmontar no queda ningún observador vivo");

  // Un hueco desmontado ya no puede publicar aunque su observador dispare tarde.
  const before = published;
  dock.shown = true;
  FakeResizeObserver.resize(dock);
  ok(published === before && cadTourSlot.getSnapshot() === null, "un hueco desmontado no vuelve solo");

  console.log(`tour-slot.spec: ${checks}/${checks} comprobaciones verdes`);
}

void specs();
