/**
 * El registro es el único hilo entre el editor y la colaboración. Lo que se
 * defiende aquí es la parte que puede fallar EN SILENCIO: que al desmontar el
 * editor los suscriptores se enteren, para que nadie siga pintando chinchetas
 * sobre una cámara muerta.
 */
import assert from "node:assert/strict";
import {
  activeCadCollabSurface,
  onCadViewportPublished,
  publishCadViewport,
  resetCadViewportRegistryForTests,
  type CadCollabSurface,
  type CadCollabViewport,
} from "./viewport-registry";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function fakeViewport(widthPx = 800, heightPx = 600): CadCollabViewport {
  return {
    worldToScreen: (point) => point,
    screenToWorld: (x, y) => ({ x, y }),
    view: { widthPx, heightPx },
    onChange: () => () => undefined,
  };
}

/** Doble del lienzo: el registro sólo lo transporta, no lo toca. */
const container = { tagName: "DIV" } as unknown as HTMLElement;
const otherContainer = { tagName: "SECTION" } as unknown as HTMLElement;

resetCadViewportRegistryForTests();
ok(activeCadCollabSurface() === null, "sin editor montado no hay superficie");

// ── Suscribirse ANTES del montaje ───────────────────────────────────────────
const seen: (CadCollabSurface | null)[] = [];
const unsubscribe = onCadViewportPublished((surface) => seen.push(surface));
ok(seen.length === 1 && seen[0] === null, "la suscripción recibe el estado actual de inmediato");

const first = fakeViewport();
ok(
  publishCadViewport(first, container) === first,
  "publicar DEVUELVE el viewport: envuelve una asignación que ya existía",
);
ok(activeCadCollabSurface()?.viewport === first, "y queda activo");
ok(activeCadCollabSurface()?.container === container, "con su lienzo al lado");
ok(seen.length === 2 && seen[1]?.viewport === first, "el suscriptor se entera del montaje");

// Publicar lo MISMO no vuelve a notificar: si lo hiciera, el efecto de React
// que se suscribe se reiniciaría en bucle.
publishCadViewport(first, container);
ok(seen.length === 2, "republicar la misma superficie no notifica");

// Cambiar de lienzo con la misma cámara SÍ es un cambio: el overlay tiene que
// mudarse o se quedaría colgado del nodo viejo.
publishCadViewport(first, otherContainer);
ok(seen.length === 3 && seen[2]?.container === otherContainer, "cambiar de lienzo notifica");
publishCadViewport(first, container);

// ── Una cámara sin lienzo no es media superficie: es ninguna ────────────────
publishCadViewport(first, null);
ok(activeCadCollabSurface() === null, "sin contenedor no hay superficie que publicar");
publishCadViewport(first, container);

// ── Suscribirse DESPUÉS del montaje ─────────────────────────────────────────
const late: (CadCollabSurface | null)[] = [];
const unsubscribeLate = onCadViewportPublished((surface) => late.push(surface));
ok(
  late.length === 1 && late[0]?.viewport === first,
  "quien llega tarde recibe la superficie ya montada, sin carrera",
);

// ── Relevo ──────────────────────────────────────────────────────────────────
const second = fakeViewport(1_024, 768);
publishCadViewport(second, container);
ok(activeCadCollabSurface()?.viewport === second, "un editor nuevo releva al anterior");

// ── Desmontaje: la señal que impide el fallo silencioso ─────────────────────
ok(publishCadViewport(null) === null, "retirar también devuelve su argumento");
ok(activeCadCollabSurface() === null, "tras el desmontaje no queda cámara");
ok(
  seen.at(-1) === null && late.at(-1) === null,
  "TODOS los suscriptores reciben el null: es la orden de apagarse",
);

// ── Darse de baja mientras se notifica ──────────────────────────────────────
// La capa de colaboración se da de baja al recibir `null`. Si el registro
// recorriera el Set en vivo, el suscriptor siguiente se saltaría sin aviso.
resetCadViewportRegistryForTests();
const notified: string[] = [];
let dropSelf: (() => void) | null = null;
dropSelf = onCadViewportPublished(() => {
  notified.push("a");
  dropSelf?.();
});
onCadViewportPublished(() => notified.push("b"));
notified.length = 0;
publishCadViewport(fakeViewport(), container);
assert.deepEqual(notified, ["a", "b"], "darse de baja dentro del aviso no se salta al siguiente");
checks += 1;

unsubscribe();
unsubscribeLate();
resetCadViewportRegistryForTests();

console.log(`ok collab viewport-registry: ${checks} comprobaciones`);
