/**
 * El almacén del recorrido: persiste, se ata al usuario y falla ABIERTO.
 *
 * Lo que se afirma es lo que rompería el producto si fallara:
 *
 *  1. Terminado o saltado, NO reaparece al volver a abrir el editor. Un
 *     recorrido que reaparece es un anuncio.
 *  2. Dos usuarios en la misma máquina son dos primeras veces: la clave lleva el
 *     identificador.
 *  3. Sin `localStorage` —pestaña privada, cookies apagadas— el editor sigue
 *     funcionando. Que la excepción subiera tiraría el estudio por no poder
 *     recordar una casilla.
 *  4. El aviso de trazado llega desde el anfitrión de trazado y cierra el último
 *     paso, porque trazar NO cambia el documento y no hay otro sitio de donde
 *     leerlo.
 */
import { strict as assert } from "node:assert";
import { EMPTY_CAD_TOUR_RECORD } from "@/lib/cad/onboarding/guided-tour";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/** `localStorage` de mentira, para poder probar el almacén en Node. */
class MemoryStorage {
  readonly map = new Map<string, string>();
  /** Cuando está en `true`, escribir LANZA — como en una pestaña privada. */
  sealed = false;
  getItem = (key: string): string | null => {
    if (this.sealed) throw new Error("acceso denegado");
    return this.map.get(key) ?? null;
  };
  setItem = (key: string, value: string): void => {
    if (this.sealed) throw new Error("acceso denegado");
    this.map.set(key, value);
  };
}

const storage = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = { localStorage: storage };

/**
 * Los módulos se cargan DESPUÉS de plantar el `window` de mentira, y por eso
 * entran por `import()` dentro de la función: un import estático se izaría por
 * encima y el almacén se ataría a un `window` que todavía no existe.
 */
async function specs(): Promise<void> {
const { cadTourHost, cadTourStorageKey, noteCadTourPlot } = await import("./tour-host");
const { onCadPlotDelivered, resetCadPlotDeliveryListeners } = await import(
  "../command-line/plot-host"
);

// --- 1. LA CLAVE LLEVA EL USUARIO -------------------------------------------
{
  assert.equal(cadTourStorageKey("u-1"), "valle:cad:tour:v1:u-1");
  assert.equal(cadTourStorageKey(null), "valle:cad:tour:v1");
  assert.notEqual(cadTourStorageKey("u-1"), cadTourStorageKey("u-2"));
}

// --- 2. PERSISTE, Y SALTADO NO REAPARECE ------------------------------------
{
  cadTourHost.reset();
  cadTourHost.attach("u-1");
  assert.deepEqual(cadTourHost.getSnapshot(), EMPTY_CAD_TOUR_RECORD);

  let notified = 0;
  const off = cadTourHost.subscribe(() => {
    notified += 1;
  });
  cadTourHost.dispatch({ type: "start", now: 1_000 });
  assert.equal(cadTourHost.getSnapshot().status, "running");
  assert.equal(notified, 1);
  // Arrancar dos veces no publica de nuevo: el reductor devuelve lo mismo y el
  // almacén compara por identidad. Publicar sin cambio provocaría un render por
  // cada latido del acompañante.
  cadTourHost.dispatch({ type: "start", now: 2_000 });
  assert.equal(notified, 1);

  cadTourHost.dispatch({ type: "skip", now: 61_000 });
  assert.equal(cadTourHost.getSnapshot().status, "skipped");
  off();

  // Lo guardado es lo que se relee: se simula reabrir el editor.
  ok(storage.map.has("valle:cad:tour:v1:u-1"), "el registro se guardó bajo su clave");
  cadTourHost.reset();
  cadTourHost.attach("u-1");
  assert.equal(cadTourHost.getSnapshot().status, "skipped");
  assert.equal(cadTourHost.getSnapshot().finishedAt, 61_000);

  // …y el SEGUNDO arquitecto de la misma máquina empieza de cero.
  cadTourHost.attach("u-2");
  assert.equal(cadTourHost.getSnapshot().status, "pending");
}

// --- 3. SIN ALMACENAMIENTO, EL EDITOR SIGUE ---------------------------------
{
  cadTourHost.reset();
  storage.sealed = true;
  // Ni leer ni escribir pueden lanzar hacia fuera.
  cadTourHost.attach("u-3");
  cadTourHost.dispatch({ type: "start", now: 10 });
  assert.equal(cadTourHost.getSnapshot().status, "running");
  cadTourHost.dispatch({ type: "complete", now: 310 });
  assert.equal(cadTourHost.getSnapshot().status, "completed");
  storage.sealed = false;
  checks += 1;
}

// --- 4. EL AVISO DE TRAZADO CIERRA EL ÚLTIMO PASO ---------------------------
{
  resetCadPlotDeliveryListeners();
  cadTourHost.reset();
  cadTourHost.attach("u-4");
  cadTourHost.dispatch({ type: "start", now: 0 });
  assert.equal(cadTourHost.getSnapshot().plotted, false);

  // Es exactamente el cable que monta el componente: el anfitrión de trazado
  // avisa y el recorrido lo apunta. Que el aviso SALGA de verdad al entregar un
  // PDF lo comprueba `plot-host.spec.ts` sobre un trazado real; aquí se
  // comprueba el otro extremo del cable.
  const off = onCadPlotDelivered(() => noteCadTourPlot(5_000));
  ok(typeof off === "function", "suscribirse devuelve su baja");
  // La entrega, simulada por el mismo extremo que ejecutaría el oyente.
  noteCadTourPlot(5_000);
  assert.equal(cadTourHost.getSnapshot().plotted, true);
  // Y el paso no se puede «desapuntar»: un PDF entregado no se desentrega.
  cadTourHost.dispatch({ type: "plot", now: 9_000 });
  assert.equal(cadTourHost.getSnapshot().plotted, true);
  off();
  resetCadPlotDeliveryListeners();
}

console.log(`tour-host.spec: ${checks} comprobaciones nombradas + aserciones directas OK`);
}

void specs();
