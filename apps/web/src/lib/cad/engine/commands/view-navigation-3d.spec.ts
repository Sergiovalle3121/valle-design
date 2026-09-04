/**
 * La navegación 3D, TECLEADA en el registro real, y aplicada de verdad.
 *
 * Dos tramos que se prueban juntos porque por separado no demuestran nada:
 *
 *  1. **Del teclado a la petición.** `3DORBIT -45 35` en el registro que usa el
 *     producto tiene que producir la petición exacta, no una parecida. Es lo que
 *     separa «hay aritmética de órbita» de «el usuario puede orbitar».
 *  2. **De la petición a la cámara.** El anfitrión de navegación toma esa
 *     petición y mueve un `CadViewController` de verdad. Si el enrutado se
 *     rompiera, el tramo 1 seguiría verde y la cámara no se movería — que es
 *     exactamente la avería que este spec existe para impedir.
 */
import { strict as assert } from "node:assert";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
  type CadCommandEngineState,
} from "../command-engine";
import type { CadCommandContext } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadViewRequest } from "../../view/view-navigation";
import {
  CAD_ISOMETRIC_ELEVATION_DEG,
  cadStandardView,
  cadStandardViewPosition,
  orbitStateFromPosition,
} from "../../view/view-3d";
import { CadViewController } from "../../view/view-controller";
import { CadNavigationHost } from "@/components/cad/command-line/navigation-host";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

const registry = CAD_COMMAND_REGISTRY_V2;

function context(): CadCommandContext {
  let counter = 0;
  return {
    entityIds: [],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `id-${(counter += 1)}`,
  };
}

function type(tokens: readonly string[]): {
  state: CadCommandEngineState;
  effects: CadCommandEffect[];
} {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  for (const token of tokens) {
    const reduction = cadCommandEngineReduce(
      state,
      token === "\x1b"
        ? { kind: "input", input: { kind: "cancel" } }
        : token === "\r"
          ? { kind: "input", input: { kind: "enter" } }
          : token.startsWith("@")
            ? {
                kind: "input",
                input: {
                  kind: "point",
                  point: {
                    x: Number(token.slice(1).split(",")[0]),
                    y: Number(token.slice(1).split(",")[1]),
                  },
                  source: "typed",
                },
              }
            : { kind: "token", value: token },
      context(),
      registry,
    );
    state = reduction.state;
    effects.push(...reduction.effects);
  }
  return { state, effects };
}

function viewRequests(effects: readonly CadCommandEffect[]): CadViewRequest[] {
  return effects.flatMap((effect) => (effect.kind === "view" ? [effect.request] : []));
}

function messages(effects: readonly CadCommandEffect[]): string[] {
  return effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : []));
}

// ---------------------------------------------------------------------------
// 1. Los cinco comandos existen y son tecleables
// ---------------------------------------------------------------------------
{
  for (const name of ["3DORBIT", "3DFORBIT", "3DPAN", "3DZOOM", "VPOINT"])
    assert.ok(registry.get(name), `${name} tiene que estar en el registro del producto`);
  // Los alias, incluidos los que empiezan por dígito.
  assert.equal(registry.get("3DO")?.name, "3DORBIT");
  assert.equal(registry.get("ORBIT")?.name, "3DORBIT");
  assert.equal(registry.get("3DF")?.name, "3DFORBIT");
  assert.equal(registry.get("3DP")?.name, "3DPAN");
  assert.equal(registry.get("3DZ")?.name, "3DZOOM");
  assert.equal(registry.get("VP")?.name, "VPOINT");
  // El guion de AutoCAD sigue siendo decorativo cuando nadie reclama el nombre.
  assert.equal(registry.get("-VPOINT")?.name, "VPOINT");
  // Los cinco son TRANSPARENTES: girar la vista a mitad de un LINE no lo aborta.
  for (const name of ["3DORBIT", "3DFORBIT", "3DPAN", "3DZOOM", "VPOINT"])
    assert.ok(registry.get(name)?.transparent, `${name} tiene que ser transparente`);
  // Y ninguno muta el documento: una vista no ensucia el dibujo.
  for (const name of ["3DORBIT", "3DFORBIT", "3DPAN", "3DZOOM", "VPOINT"])
    assert.equal(registry.get(name)?.mutates, false, `${name} no puede mutar el documento`);
}

// ---------------------------------------------------------------------------
// 2. 3DORBIT: azimut y elevación, restringida y libre
// ---------------------------------------------------------------------------
{
  assert.deepEqual(viewRequests(type(["3DORBIT", "-45", "35"]).effects), [
    {
      kind: "view3d",
      request: { kind: "orbit", mode: "constrained", azimuthDeg: -45, elevationDeg: 35 },
    },
  ]);
  // Enter tras el azimut vale por «sin elevación»: el giro horizontal puro.
  assert.deepEqual(viewRequests(type(["3DORBIT", "90", "\r"]).effects), [
    {
      kind: "view3d",
      request: { kind: "orbit", mode: "constrained", azimuthDeg: 90, elevationDeg: 0 },
    },
  ]);
  // 3DFORBIT es la misma orden con el modo LIBRE de fábrica.
  assert.deepEqual(viewRequests(type(["3DFORBIT", "20", "10"]).effects), [
    { kind: "view3d", request: { kind: "orbit", mode: "free", azimuthDeg: 20, elevationDeg: 10 } },
  ]);
  // Y se puede conmutar el modo desde 3DORBIT sin cambiar de orden.
  assert.deepEqual(viewRequests(type(["3DORBIT", "LI", "20", "10"]).effects), [
    { kind: "view3d", request: { kind: "orbit", mode: "free", azimuthDeg: 20, elevationDeg: 10 } },
  ]);
  assert.deepEqual(viewRequests(type(["3DFORBIT", "RE", "20", "10"]).effects), [
    {
      kind: "view3d",
      request: { kind: "orbit", mode: "constrained", azimuthDeg: 20, elevationDeg: 10 },
    },
  ]);

  // Enter en el primer paso NO orbita: dice que ese gesto es del ratón, igual
  // que hacen ZOOM y PAN con su tiempo real.
  const interactive = type(["3DORBIT", "\r"]);
  assert.equal(viewRequests(interactive.effects).length, 0, "Enter no mueve la cámara");
  assert.ok(
    messages(interactive.effects).some((text) => text.includes("interactivo")),
    "y lo explica en vez de callarse",
  );

  // Un giro nulo se rechaza con motivo, en vez de emitir una petición vacía.
  const still = type(["3DORBIT", "0", "0"]);
  assert.equal(viewRequests(still.effects).length, 0, "0,0 no emite petición");
  assert.ok(messages(still.effects).some((text) => text.includes("sin giro")));

  // Cancelar no emite nada y cierra el comando.
  const cancelled = type(["3DORBIT", "\x1b"]);
  assert.equal(viewRequests(cancelled.effects).length, 0);
  assert.equal(cancelled.state.active, null);
}

// ---------------------------------------------------------------------------
// 3. 3DPAN y 3DZOOM
// ---------------------------------------------------------------------------
{
  // Mismo signo que PAN: la vista se mueve al contrario que el punto.
  assert.deepEqual(viewRequests(type(["3DPAN", "@100,50", "@130,20"]).effects), [
    { kind: "view3d", request: { kind: "pan-drawing", dx: -30, dy: 30 } },
  ]);
  assert.deepEqual(viewRequests(type(["3DZOOM", "2"]).effects), [
    { kind: "view3d", request: { kind: "zoom", factor: 2 } },
  ]);
  assert.deepEqual(viewRequests(type(["3DZ", "0.5"]).effects), [
    { kind: "view3d", request: { kind: "zoom", factor: 0.5 } },
  ]);
  // Fallo cerrado: un factor imposible NO mueve la cámara y lo dice.
  const bad = type(["3DZOOM", "-3"]);
  assert.equal(viewRequests(bad.effects).length, 0, "un factor negativo no emite petición");
  assert.ok(messages(bad.effects).some((text) => text.includes("mayor que cero")));
}

// ---------------------------------------------------------------------------
// 4. VPOINT: las diez vistas y los ángulos
// ---------------------------------------------------------------------------
{
  const shortcuts: Record<string, string> = {
    SU: "top",
    IN: "bottom",
    FR: "front",
    PO: "back",
    IZ: "left",
    DE: "right",
    SO: "sw-iso",
    SE: "se-iso",
    NE: "ne-iso",
    NO: "nw-iso",
  };
  for (const [shortcut, id] of Object.entries(shortcuts))
    assert.deepEqual(
      viewRequests(type(["VPOINT", shortcut]).effects),
      [{ kind: "view3d", request: { kind: "standard-view", view: id } }],
      `VPOINT ${shortcut} tiene que llevar a ${id}`,
    );

  // El nombre completo también, sin acentos ni mayúsculas.
  assert.deepEqual(viewRequests(type(["VPOINT", "isometrica ne"]).effects), [
    { kind: "view3d", request: { kind: "standard-view", view: "ne-iso" } },
  ]);

  // VPOINT Rotar: ángulo en el plano XY desde el eje X, luego desde el plano.
  // 0° (este) tiene que dar azimut 90, que es el este de este motor.
  assert.deepEqual(viewRequests(type(["VPOINT", "R", "0", "0"]).effects), [
    { kind: "view3d", request: { kind: "orbit-to", azimuthDeg: 90, elevationDeg: 0 } },
  ]);
  // Y 90° (norte) da azimut 0.
  assert.deepEqual(viewRequests(type(["VPOINT", "R", "90", "30"]).effects), [
    { kind: "view3d", request: { kind: "orbit-to", azimuthDeg: 0, elevationDeg: 30 } },
  ]);
  // Pedir el polo por sus ángulos se acota, y se AVISA: la vista cenital exacta
  // se pide por su nombre.
  const polar = type(["VPOINT", "R", "0", "90"]);
  const request = viewRequests(polar.effects)[0];
  assert.ok(request && request.kind === "view3d" && request.request.kind === "orbit-to");
  if (request.kind === "view3d" && request.request.kind === "orbit-to")
    assert.equal(request.request.elevationDeg, 89.9, "la elevación se acota justo bajo el polo");

  // Una vista inexistente no mueve nada y nombra las que hay.
  const wrong = type(["VPOINT", "cenital-raro"]);
  assert.equal(viewRequests(wrong.effects).length, 0);
  assert.ok(wrong.state.active, "el comando sigue esperando una vista válida");
}

// ---------------------------------------------------------------------------
// 5. VIEW también ofrece las diez, sin perder Guardar/Restituir/Borrar
// ---------------------------------------------------------------------------
{
  assert.deepEqual(viewRequests(type(["VIEW", "SO"]).effects), [
    { kind: "view3d", request: { kind: "standard-view", view: "sw-iso" } },
  ]);
  // El guion es decorativo: `-VIEW` es la misma orden.
  assert.deepEqual(viewRequests(type(["-VIEW", "SU"]).effects), [
    { kind: "view3d", request: { kind: "standard-view", view: "top" } },
  ]);
  // Y lo que ya hacía sigue haciéndolo: guardar una vista con nombre.
  assert.deepEqual(viewRequests(type(["VIEW", "G", "PLANTA"]).effects), [
    { kind: "view", op: "save", name: "PLANTA" },
  ]);
  assert.deepEqual(viewRequests(type(["VIEW", "R", "PLANTA"]).effects), [
    { kind: "view", op: "restore", name: "PLANTA" },
  ]);
}

// ---------------------------------------------------------------------------
// 6. Y la cámara se mueve DE VERDAD: del token al controlador
// ---------------------------------------------------------------------------
{
  const controller = new CadViewController({ scale: 0.01, width: 1_000, height: 800 }, 1_200, 900);
  controller.setMode("3d");
  controller.perspective.position.set(0, 0, 300);
  const host = new CadNavigationHost({
    controller: () => controller,
    extents: () => null,
  });

  // VPOINT Frontal, tecleado, resuelto por el anfitrión.
  const front = viewRequests(type(["VPOINT", "FR"]).effects)[0];
  assert.ok(front, "VPOINT FR emite petición");
  const frontMessage = host.apply(front);
  assert.ok(frontMessage.includes("Frontal"), `el renglón nombra la vista: ${frontMessage}`);
  assert.ok(Math.abs(controller.perspective.position.z + 300) < 1e-6, "la cámara se fue a −Z");
  assert.ok(Math.abs(controller.perspective.position.x) < 1e-6);
  assert.ok(Math.abs(controller.perspective.position.y) < 1e-6);

  // Y desde ahí, 3DORBIT tecleado lleva a la isométrica SE con NÚMEROS.
  const orbit = viewRequests(
    type(["3DORBIT", "-45", String(CAD_ISOMETRIC_ELEVATION_DEG)]).effects,
  )[0];
  assert.ok(orbit, "3DORBIT emite petición");
  host.apply(orbit);
  const target = controller.orbitTarget;
  const state = orbitStateFromPosition(target, controller.perspective.position);
  assert.ok(Math.abs(state.azimuthDeg - 135) < 1e-6, `azimut ${state.azimuthDeg}, esperado 135`);
  assert.ok(
    Math.abs(state.elevationDeg - CAD_ISOMETRIC_ELEVATION_DEG) < 1e-6,
    `elevación ${state.elevationDeg}`,
  );
  // La invariante: orbitar no acerca.
  assert.ok(Math.abs(state.distance - 300) < 1e-6, `distancia ${state.distance}, esperada 300`);
  const expected = cadStandardViewPosition(
    { x: target.x, y: target.y, z: target.z },
    cadStandardView("se-iso"),
    300,
  );
  assert.ok(
    Math.hypot(
      controller.perspective.position.x - expected.x,
      controller.perspective.position.y - expected.y,
      controller.perspective.position.z - expected.z,
    ) < 1e-6,
    "la cámara cae en la isométrica SE de la tabla",
  );

  // 3DZOOM tecleado acerca a la mitad de la distancia.
  host.apply(viewRequests(type(["3DZOOM", "2"]).effects)[0]);
  assert.ok(
    Math.abs(controller.perspective.position.distanceTo(controller.orbitTarget) - 150) < 1e-6,
    "3DZOOM 2× deja la cámara a 150",
  );

  // Y un montaje SIN cámara en perspectiva lo dice, en vez de fingir que giró.
  const flat = new CadNavigationHost({
    controller: () => ({ view: controller.view, setView: () => undefined }),
    extents: () => null,
  });
  const refused = flat.apply({
    kind: "view3d",
    request: { kind: "orbit", mode: "constrained", azimuthDeg: 10, elevationDeg: 0 },
  });
  assert.ok(
    refused.includes("no tiene cámara en perspectiva"),
    `un anfitrión sin cámara tiene que decirlo: ${refused}`,
  );
}

console.log(
  "view-navigation-3d.spec: 3DORBIT, 3DFORBIT, 3DPAN, 3DZOOM y VPOINT tecleados mueven la cámara",
);
