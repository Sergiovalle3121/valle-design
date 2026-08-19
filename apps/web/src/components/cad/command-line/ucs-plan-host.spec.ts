/**
 * `PLAN` aplicado: que la vista GIRE de verdad, y que se niegue cuando no puede.
 *
 * La prueba que importa no es que `cadUcsPlanView` calcule bien —eso lo mide el
 * golden de `lib/cad/ucs-3d.spec.ts` en milímetros—, sino que el renglón que
 * sale y la vista que queda son los correctos. Se comprueba proyectando el eje
 * X del SCU con la MISMA función que usa el visor: si tras `PLAN` ese eje no
 * sale hacia la derecha de la pantalla, el giro está puesto con el signo
 * cambiado, que es el error que una comprobación sobre `twistDeg` a secas no
 * distinguiría.
 */
import { strict as assert } from "node:assert";
import { cadUcsFromRotation, cadUcsFromPlane } from "@/lib/cad/ucs";
import { cadUcsPlanView } from "@/lib/cad/ucs-view";
import { cadViewFromViewport, cadViewWorldToScreen, type CadView } from "@/lib/cad/view/cad-view";
import { handleCadUcsPlanRequest } from "./ucs-plan-host";

let checks = 0;
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

function controller(): { view: CadView; setView(view: CadView): void } {
  return {
    view: cadViewFromViewport(800, 600, 0, 0, 2),
    setView(view: CadView) {
      this.view = view;
    },
  };
}

// --- SCU de planta: la vista gira y encuadra el origen -----------------------
{
  const live = controller();
  const ucs = cadUcsFromRotation("PLANTA", { x: 100, y: 50 }, 23.5);
  const answer = handleCadUcsPlanRequest(
    { kind: "ucs-plan", plan: cadUcsPlanView(ucs) },
    { controller: () => live },
  );
  ok(answer !== null && answer.includes("PLANTA"), "el renglón nombra el SCU");
  near(live.view.centerX, 100, 1e-9, "la vista se centra en el origen del SCU");
  near(live.view.centerY, 50, 1e-9, "en las dos coordenadas");
  near(live.view.twistDeg, 23.5, 1e-9, "y gira lo que gira el SCU");

  // La comprobación de verdad: el eje X del SCU sale hacia la derecha.
  const centro = cadViewWorldToScreen(live.view, { x: 100, y: 50 });
  const sobreX = cadViewWorldToScreen(live.view, {
    x: 100 + ucs.xAxis.x * 10,
    y: 50 + ucs.xAxis.y * 10,
  });
  near(sobreX.y - centro.y, 0, 1e-9, "el eje X del SCU sale horizontal en pantalla");
  ok(sobreX.x > centro.x, "y hacia la DERECHA, no hacia la izquierda");
}

// --- SCU inclinado: se niega, y no toca la vista -----------------------------
{
  const live = controller();
  const antes = live.view;
  const inclinado = cadUcsFromPlane("FALDÓN", { x: 0, y: 0, z: 0 }, { x: 0.15, y: 0.1, z: 1 });
  ok(inclinado.ok, "el SCU de faldón se construye");
  if (!inclinado.ok) throw new Error(inclinado.message);
  const answer = handleCadUcsPlanRequest(
    { kind: "ucs-plan", plan: cadUcsPlanView(inclinado.ucs) },
    { controller: () => live },
  );
  ok(answer !== null && answer.includes("mover la cámara"), "dice por qué no puede");
  ok(live.view === antes, "y deja la vista exactamente como estaba");
}

// --- Sin escena, y con otra petición ----------------------------------------
{
  const sinVista = handleCadUcsPlanRequest(
    { kind: "ucs-plan", plan: cadUcsPlanView(cadUcsFromRotation("", { x: 0, y: 0 }, 0)) },
    { controller: () => null },
  );
  ok(sinVista !== null && sinVista.includes("vista activa"), "sin escena lo dice");
  const ajena = handleCadUcsPlanRequest(
    { kind: "space", space: "paper" },
    { controller: () => controller() },
  );
  ok(ajena === null, "una petición que no es suya se deja pasar al siguiente anfitrión");
}

console.log(`ucs-plan-host: ${checks} comprobaciones verdes.`);
