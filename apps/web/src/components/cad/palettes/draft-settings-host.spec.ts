/**
 * Anfitrión de las ayudas al dibujo.
 *
 * Lo que se comprueba aquí es lo que la interfaz no puede comprobar sola: que
 * la instantánea sea ESTABLE POR IDENTIDAD —sin eso `useSyncExternalStore`
 * entra en un bucle infinito de renders—, que el reparto de modos por defecto
 * sea BIT A BIT el que el editor tenía cableado antes de existir este módulo, y
 * que una captura forzada mande sobre la configuración.
 *
 * Correr:  npx tsx src/components/cad/palettes/draft-settings-host.spec.ts
 */
import { strict as assert } from "node:assert";
import { SNAP_PRIORITY } from "@/lib/cad/snap-engine";
import {
  CAD_OSNAP_MODES,
  CadDraftSettingsHost,
  defaultCadOsnapModes,
} from "./draft-settings-host";

// --- el reparto por defecto reproduce el cableado anterior --------------------
{
  const modes = defaultCadOsnapModes();
  assert.equal(
    Object.keys(modes).length,
    14,
    "los catorce modos de AutoCAD, ni uno menos",
  );
  assert.equal(
    modes.grid,
    false,
    "el editor llamaba con `{ grid: false }` fijo",
  );
  assert.equal(modes.endpoint, true);
  assert.equal(modes.intersection, true);
  assert.equal(modes.perpendicular, true);
  assert.equal(modes.nearest, true);
  assert.equal(modes["apparent-intersection"], true);
  assert.equal(
    SNAP_PRIORITY.every((mode) =>
      mode === "grid" ? !modes[mode] : modes[mode],
    ),
    true,
    "todo encendido salvo grid: el comportamiento de partida no cambia",
  );
  assert.deepEqual(
    [...CAD_OSNAP_MODES],
    [...SNAP_PRIORITY],
    "y en el orden del motor",
  );
}

// --- la instantánea es estable por identidad ---------------------------------
{
  const host = new CadDraftSettingsHost();
  const first = host.getSnapshot();
  assert.equal(host.getSnapshot(), first, "leer dos veces no reconstruye nada");
  host.setOsnap(true);
  assert.equal(
    host.getSnapshot(),
    first,
    "poner el valor que ya estaba tampoco: no hay cambio que publicar",
  );
  host.setOsnap(false);
  assert.notEqual(host.getSnapshot(), first, "y un cambio real sí publica");
  assert.equal(host.getSnapshot().osnap, false);
}

// --- los suscriptores reciben aviso sólo cuando algo cambia -------------------
{
  const host = new CadDraftSettingsHost();
  let calls = 0;
  const unsubscribe = host.subscribe(() => {
    calls += 1;
  });
  host.setPolarIncrement(45);
  assert.equal(calls, 0, "45 ya era el incremento");
  host.setPolarIncrement(30);
  assert.equal(calls, 1);
  host.setPolarIncrement(0);
  assert.equal(
    calls,
    1,
    "un incremento de 0 partiría el círculo en infinitos sectores",
  );
  assert.equal(host.polarIncrement, 30, "y se queda como estaba");
  host.setPolarIncrement(Number.NaN);
  assert.equal(host.polarIncrement, 30);
  unsubscribe();
  host.setPolarIncrement(90);
  assert.equal(calls, 1, "tras darse de baja ya no recibe");
}

// --- conmutadores ------------------------------------------------------------
{
  const host = new CadDraftSettingsHost();
  assert.equal(host.osnap, true);
  assert.equal(host.ortho, false);
  assert.equal(host.polar, true);
  assert.equal(host.objectSnapTracking, true);
  assert.equal(
    host.dynamicInput,
    true,
    "la entrada dinámica arranca encendida: era el único comportamiento antes de F12",
  );
  host.toggleOsnap();
  host.toggleOrtho();
  host.togglePolar();
  host.toggleObjectSnapTracking();
  host.toggleDynamicInput();
  assert.equal(host.osnap, false);
  assert.equal(host.ortho, true);
  assert.equal(host.polar, false);
  assert.equal(host.objectSnapTracking, false);
  assert.equal(host.dynamicInput, false);
  assert.deepEqual(
    {
      osnap: host.getSnapshot().osnap,
      ortho: host.getSnapshot().ortho,
      polar: host.getSnapshot().polar,
      otrack: host.getSnapshot().objectSnapTracking,
      dynamicInput: host.getSnapshot().dynamicInput,
    },
    { osnap: false, ortho: true, polar: false, otrack: false, dynamicInput: false },
    "y la instantánea dice lo mismo que los getters de la ruta del puntero",
  );
  // El toggle repetido publica una sola vez por cambio real, como el resto.
  const before = host.getSnapshot();
  host.setDynamicInput(false);
  assert.equal(host.getSnapshot(), before, "poner el valor que ya estaba no republica");
}

// --- modos por separado ------------------------------------------------------
{
  const host = new CadDraftSettingsHost();
  host.setOsnapMode("intersection", false);
  assert.equal(host.snapModes().intersection, false);
  assert.equal(
    host.snapModes().endpoint,
    true,
    "apagar uno no toca a los demás",
  );
  host.setAllOsnapModes(false);
  assert.equal(
    Object.values(host.snapModes()).some(Boolean),
    false,
    "«ninguno» apaga los catorce, grid incluido",
  );
  host.setAllOsnapModes(true);
  assert.equal(
    host.snapModes().grid,
    true,
    "«todos» enciende los catorce, grid incluido",
  );
  host.resetOsnapModes();
  assert.equal(host.snapModes().grid, false);
  assert.equal(host.snapModes().endpoint, true);
}

// --- la captura forzada de un comando MANDA ----------------------------------
{
  const host = new CadDraftSettingsHost();
  host.setAllOsnapModes(false);
  const forced = host.snapModes(["midpoint"]);
  assert.equal(
    forced.midpoint,
    true,
    "un `MID` tecleado captura al punto medio aunque el modo esté apagado",
  );
  assert.equal(forced.endpoint, false, "y sólo a ese");
  assert.equal(
    Object.keys(forced).length,
    14,
    "el override describe los catorce",
  );
  assert.equal(
    host.snapModes([]).midpoint,
    false,
    "un override vacío no es un override: manda la configuración",
  );
}

// --- puntos adquiridos por OTRACK --------------------------------------------
{
  const host = new CadDraftSettingsHost();
  const a = { x: 10, y: 20 };
  const b = { x: 30, y: 40 };
  assert.equal(host.getSnapshot().acquiredTrackingPoints, 0);
  host.setTrackingPoints([a]);
  assert.equal(host.getSnapshot().acquiredTrackingPoints, 1);
  const afterFirst = host.getSnapshot();
  host.setTrackingPoints([a]);
  assert.equal(
    host.getSnapshot(),
    afterFirst,
    "la misma lista no republica: el motor de rastreo la devuelve intacta en cada movimiento del ratón",
  );
  host.setTrackingPoints([a, b]);
  assert.equal(host.getSnapshot().acquiredTrackingPoints, 2);
  assert.deepEqual([...host.trackingPoints], [a, b]);
  host.clearTrackingPoints();
  assert.equal(host.getSnapshot().acquiredTrackingPoints, 0);
}

console.log(
  "cad draft settings host specs passed: 14 modos con grid apagado por defecto (bit a bit el cableado anterior), instantánea estable por identidad, override que manda y OTRACK que no republica sin cambio",
);
