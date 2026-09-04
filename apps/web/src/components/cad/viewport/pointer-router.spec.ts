/**
 * Spec del enrutado del puntero al motor de comandos.
 *
 * Lo que se comprueba aquí es la REGLA DURA: cuando el motor tiene un comando
 * activo, el clic es suyo y de nadie más. Y que lo que produce el ratón es el
 * mismo lote de comandos de entidad que produce el teclado — que es el motivo
 * entero de que exista este enrutador.
 *
 * El cursor vivo es DOM y no se puede montar en Node; se sustituye por un doble
 * que registra lo que recibiría. Lo que sí es real: el motor, su registro de 63
 * comandos y los `CadEntityCommand` que emite.
 */
import assert from "node:assert/strict";
import { CadCommandEngineHost } from "@/components/cad/command-line/command-engine-host";
import { CAD_COMMAND_REGISTRY_V2 } from "@/lib/cad/engine";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import type { CadNativeEntity } from "@/lib/cad/entity-runtime";
import type { CadPoint2 } from "@/lib/cad/cad-document";
import type { CadPreviewPath } from "@/lib/cad/engine/command-types";
import type { SnapType } from "@/lib/cad/snap-engine";
import type { CadLiveCursorField } from "./live-cursor";
import {
  CAD_ENGINE_POINTER_COMMANDS,
  CAD_LEGACY_POINTER_TOOLS,
  CadEnginePointerRouter,
  cadEngineCommandForTool,
  type CadPointerCursorSurface,
  type CadPointerPreviewSurface,
} from "./pointer-router";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

class FakePreview implements CadPointerPreviewSurface {
  paths: readonly CadPreviewPath[] = [];
  draws = 0;
  draw(paths: readonly CadPreviewPath[]): void {
    this.paths = paths;
    this.draws += 1;
  }
  clear(): void {
    this.paths = [];
  }
}

class FakeCursor implements CadPointerCursorSurface {
  position = { x: 0, y: 0 };
  snap: SnapType | null = null;
  measurements: { distance: number; angle: number } | null = null;
  dynamicVisible = false;
  focusedField: CadLiveCursorField | null = null;
  menuOpen = false;
  menuKeywords: string[] = [];
  hidden = 0;
  owns = false;
  pointerKind = "mouse";
  moveTo(x: number, y: number): void {
    this.position = { x, y };
  }
  setPointerKind(kind: "mouse" | "touch"): void {
    this.pointerKind = kind;
  }
  setSnap(snap: SnapType | null): void {
    this.snap = snap;
  }
  setMeasurements(distance: number, angleDeg: number): void {
    this.measurements = { distance, angle: angleDeg };
  }
  setDynamicVisible(visible: boolean): void {
    this.dynamicVisible = visible;
  }
  focusField(field: CadLiveCursorField): void {
    this.focusedField = field;
  }
  openMenu(_x: number, _y: number, keywords: readonly { keyword: string }[]): boolean {
    this.menuOpen = true;
    this.menuKeywords = keywords.map((option) => option.keyword);
    return true;
  }
  closeMenu(): void {
    this.menuOpen = false;
    this.menuKeywords = [];
  }
  hide(): void {
    this.hidden += 1;
    this.dynamicVisible = false;
    this.menuOpen = false;
    this.snap = null;
  }
}

interface Harness {
  router: CadEnginePointerRouter;
  host: CadCommandEngineHost;
  preview: FakePreview;
  cursor: FakeCursor;
  applied: CadEntityCommand[];
  /** Punto que devolverá la captura en la próxima designación. */
  snapTo: { point: CadPoint2; snap?: SnapType } | null;
  /** Entidad que devolverá el hit-test en el próximo clic. */
  hitTo: string | null;
  at(x: number, y: number): PointerEvent;
}

let entityCounter = 0;

function harness(entities: readonly CadNativeEntity[] = []): Harness {
  const applied: CadEntityCommand[] = [];
  const preview = new FakePreview();
  const cursor = new FakeCursor();
  let cursorPoint: CadPoint2 | null = null;
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const state: {
    snapTo: { point: CadPoint2; snap?: SnapType } | null;
    hitTo: string | null;
  } = { snapTo: null, hitTo: null };
  const host = new CadCommandEngineHost(CAD_COMMAND_REGISTRY_V2, {
    context: () => ({
      entityIds: [...byId.keys()],
      entity: (entityId: string) => byId.get(entityId),
      selection: [],
      activeLayer: "0",
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      ...(cursorPoint ? { cursor: cursorPoint } : {}),
      newEntityId: () => `e${(entityCounter += 1)}`,
    }),
    apply: (commands) => applied.push(...commands),
    preview: (paths) => preview.draw(paths),
    osnapOverride: () => {},
    cursor: () => {},
  });
  const router = new CadEnginePointerRouter({
    host,
    preview,
    cursor,
    // El evento lleva sus coordenadas de dibujo directamente: la conversión de
    // pantalla a mundo es del editor y ya tiene su propio spec.
    worldPoint: (event) => ({
      x: (event as unknown as { worldX: number }).worldX,
      y: (event as unknown as { worldY: number }).worldY,
    }),
    snap: (point) => state.snapTo ?? { point },
    hitEntity: () => state.hitTo,
    setCursor: (point) => {
      cursorPoint = point;
    },
    localPoint: (event) => ({
      x: (event as unknown as { clientX: number }).clientX,
      y: (event as unknown as { clientY: number }).clientY,
    }),
    session: { current: { anchor: null, pointerStarted: false } },
  });
  return {
    router,
    host,
    preview,
    cursor,
    applied,
    get snapTo() {
      return state.snapTo;
    },
    set snapTo(value) {
      state.snapTo = value;
    },
    get hitTo() {
      return state.hitTo;
    },
    set hitTo(value) {
      state.hitTo = value;
    },
    at: (x, y) =>
      ({ worldX: x, worldY: y, clientX: x / 10, clientY: y / 10, button: 0 }) as
        unknown as PointerEvent,
  };
}

// ---------------------------------------------------------------------------
// 1. La tabla de enrutado es EXPLÍCITA en las dos direcciones.
// ---------------------------------------------------------------------------
assert.deepEqual(
  Object.keys(CAD_ENGINE_POINTER_COMMANDS).sort(),
  ["circle", "copy", "line", "move", "offset", "polyline", "rect"],
  "las cuatro de DIBUJO y las tres de MODIFICACIÓN van al motor",
);
for (const command of Object.values(CAD_ENGINE_POINTER_COMMANDS))
  assert.ok(
    CAD_COMMAND_REGISTRY_V2.get(command),
    `${command} tiene que existir en el registro del motor`,
  );
assert.deepEqual(
  Object.keys(CAD_LEGACY_POINTER_TOOLS).sort(),
  ["measure", "select", "wall"],
  "y la lista blanca del camino viejo se puede leer entera",
);
// La intersección vacía es la propiedad: ninguna herramienta va a los dos.
for (const legacy of Object.keys(CAD_LEGACY_POINTER_TOOLS))
  assert.equal(
    cadEngineCommandForTool(legacy),
    null,
    `${legacy} no puede estar además en el motor`,
  );
assert.equal(cadEngineCommandForTool("line"), "LINE");
assert.equal(cadEngineCommandForTool("move"), "MOVE");
assert.equal(cadEngineCommandForTool("copy"), "COPY");
assert.equal(cadEngineCommandForTool("offset"), "OFFSET");
assert.equal(cadEngineCommandForTool("inventada"), null);
ok(true, "enrutado explícito: 7 al motor, 3 al camino viejo con su motivo, cero solapes");

// ---------------------------------------------------------------------------
// 2. Sin comando activo el enrutador NO toca el puntero: es del camino viejo.
// ---------------------------------------------------------------------------
const idle = harness();
assert.equal(idle.router.active, false);
assert.equal(idle.router.move(idle.at(10, 10)), false, "no consume el movimiento");
assert.equal(idle.router.click(idle.at(10, 10)), false, "no consume el clic");
assert.equal(
  idle.router.contextMenu(idle.at(10, 10) as unknown as MouseEvent),
  false,
  "no consume el botón derecho",
);
assert.equal(idle.applied.length, 0, "y no dibuja nada");
ok(true, "en reposo el puntero sigue siendo del camino heredado, sin excepciones");

// ---------------------------------------------------------------------------
// 3. LINE con el RATÓN produce el mismo documento que LINE tecleado.
// ---------------------------------------------------------------------------
const drawing = harness();
assert.equal(drawing.router.invoke("LINE"), true, "LINE arranca");
assert.equal(drawing.router.active, true, "y a partir de aquí el motor manda");
assert.equal(drawing.cursor.dynamicVisible, true, "la entrada dinámica aparece con el comando");

drawing.router.move(drawing.at(0, 0));
assert.equal(drawing.router.anchor, null, "moverse no fija ningún punto");
drawing.router.click(drawing.at(0, 0));
assert.deepEqual(drawing.router.anchor, { x: 0, y: 0 }, "el primer clic fija el origen");

// BANDA ELÁSTICA: al mover con un punto fijado, el comando previsualiza SU
// geometría entre el último punto y el cursor. Sin esto no hay nada que ver
// mientras se dibuja, que es la mitad de la sensación de un CAD.
drawing.preview.draws = 0;
drawing.router.move(drawing.at(2_000, 0));
ok(drawing.preview.draws > 0, "mover con un punto fijado repinta la banda elástica");
const rubber = drawing.preview.paths;
ok(rubber.length > 0, "y la banda elástica tiene trazo");
assert.deepEqual(
  rubber[0].points[0],
  { x: 0, y: 0 },
  "la banda arranca en el último punto CONFIRMADO",
);
assert.deepEqual(
  rubber[0].points[rubber[0].points.length - 1],
  { x: 2_000, y: 0 },
  "y termina en el cursor",
);
// La entrada dinámica mide desde el ancla: 2.000 unidades a 0°.
assert.deepEqual(drawing.cursor.measurements, { distance: 2_000, angle: 0 });

drawing.router.click(drawing.at(2_000, 0));
drawing.router.move(drawing.at(2_000, 1_500));
drawing.router.click(drawing.at(2_000, 1_500));
assert.deepEqual(
  drawing.cursor.measurements,
  { distance: 1_500, angle: 90 },
  "el ángulo se mide desde el último punto confirmado",
);

// PALABRA CLAVE por menú contextual: las opciones salen del prompt del motor.
const menuOpened = drawing.router.contextMenu(
  drawing.at(2_000, 1_500) as unknown as MouseEvent,
);
assert.equal(menuOpened, true);
ok(
  drawing.cursor.menuKeywords.length > 0,
  `el menú del botón derecho ofrece ${drawing.cursor.menuKeywords.join("/")}`,
);
ok(
  drawing.cursor.menuKeywords.some((keyword) => /cerrar/i.test(keyword)),
  "y con tres puntos trazados ofrece Cerrar, igual que la línea de comandos",
);
drawing.router.keyword("C");

assert.equal(drawing.router.active, false, "cerrar termina el comando");
assert.equal(drawing.preview.paths.length, 0, "y apaga la banda elástica");
ok(drawing.cursor.hidden > 0, "y el cursor vivo se retira");

// LA COMPROBACIÓN QUE JUSTIFICA TODO: el ratón emitió comandos de entidad
// canónicos, no acciones de dibujo de la máquina vieja.
ok(
  drawing.applied.length > 0,
  `dibujar con el ratón emitió ${drawing.applied.length} comandos de entidad`,
);
const created = drawing.applied.filter((command) => command.type === "insert");
assert.equal(created.length, 3, "0,0 → 2000,0 → 2000,1500 → 0,0 son TRES segmentos");
ok(true, "el ratón produce el mismo lote canónico que el teclado, con Cerrar incluido");

// ---------------------------------------------------------------------------
// 4. La CAPTURA A OBJETO viaja con el punto. Es lo que hace que el ratón sea
//    tan exacto como una coordenada tecleada.
// ---------------------------------------------------------------------------
const snapping = harness();
snapping.router.invoke("LINE");
snapping.snapTo = { point: { x: 500, y: 500 }, snap: "endpoint" };
snapping.router.move(snapping.at(497, 503));
assert.equal(snapping.cursor.snap, "endpoint", "la insignia muestra el modo resuelto");
assert.deepEqual(
  snapping.router.resolved?.point,
  { x: 500, y: 500 },
  "y el punto usado es el CAPTURADO, no el crudo del ratón",
);
snapping.router.click(snapping.at(497, 503));
assert.deepEqual(
  snapping.router.anchor,
  { x: 500, y: 500 },
  "designar fija el punto capturado, no dónde cayó el ratón",
);
ok(true, "la captura a objeto entra en el motor con su modo, no como un punto suelto");

// ---------------------------------------------------------------------------
// 5. ENTRADA DIRECTA DE DISTANCIA: se conserva la dirección del cursor y se
//    fija la longitud. Es el gesto más usado de AutoCAD.
// ---------------------------------------------------------------------------
const direct = harness();
direct.router.invoke("LINE");
direct.router.click(direct.at(0, 0));
direct.router.move(direct.at(10, 0)); // dirección: hacia +X
assert.equal(
  direct.router.commitMeasurements({ distance: 1_234, angle: null }),
  true,
);
assert.deepEqual(
  direct.router.anchor,
  { x: 1_234, y: 0 },
  "la distancia se aplica en la dirección que marcaba el cursor",
);
// Con ángulo explícito es una polar desde el último punto.
direct.router.commitMeasurements({ distance: 1_000, angle: 90 });
const polar = direct.router.anchor!;
ok(
  Math.abs(polar.x - 1_234) < 1e-9 && Math.abs(polar.y - 1_000) < 1e-9,
  `distancia+ángulo dan la polar exacta: (${polar.x}, ${polar.y})`,
);
// Sin ancla no se inventa un origen: se responde que no, como hace el contexto
// del motor cuando no hay cursor.
const orphan = harness();
orphan.router.invoke("LINE");
assert.equal(
  orphan.router.commitMeasurements({ distance: 100, angle: 45 }),
  false,
  "sin punto de partida, una distancia no puede producir un punto",
);
ok(true, "entrada directa de distancia y polar, sin inventar el origen cuando falta");

// ---------------------------------------------------------------------------
// 6. Esc cancela y el botón derecho SIN opciones vale por Enter.
// ---------------------------------------------------------------------------
const escaped = harness();
escaped.router.invoke("LINE");
escaped.router.click(escaped.at(0, 0));
escaped.router.cancel();
assert.equal(escaped.router.active, false, "Esc cierra el comando");
assert.equal(
  escaped.applied.filter((command) => command.type === "insert").length,
  0,
  "y no escribe nada",
);
assert.equal(escaped.preview.paths.length, 0, "la banda elástica se apaga al cancelar");

const rightEnter = harness();
rightEnter.router.invoke("LINE");
rightEnter.router.click(rightEnter.at(0, 0));
rightEnter.router.click(rightEnter.at(1_000, 0));
// LINE encadena: aquí sí hay opciones, así que el derecho abre menú. Se cierra
// y se comprueba el otro camino con un comando cuyo primer paso no las tiene.
rightEnter.router.contextMenu(rightEnter.at(1_000, 0) as unknown as MouseEvent);
assert.equal(rightEnter.cursor.menuOpen, true);
// Un clic con el menú abierto lo cierra en vez de designar a ciegas debajo.
const before = rightEnter.router.anchor;
rightEnter.router.click(rightEnter.at(9_999, 9_999));
assert.equal(rightEnter.cursor.menuOpen, false, "el clic cierra el menú");
assert.deepEqual(
  rightEnter.router.anchor,
  before,
  "y NO designa el punto que hay debajo del menú",
);
ok(true, "Esc cancela sin escribir; el menú abierto se cierra sin designar debajo");

// Espacio vale por Intro mientras el motor manda, como en AutoCAD: con LINE
// abierto y dos puntos designados, termina el comando y lo dice con
// preventDefault (medido antes: keyDown devolvía false para " ").
const spaceEnter = harness();
spaceEnter.router.invoke("LINE");
spaceEnter.router.click(spaceEnter.at(0, 0));
spaceEnter.router.click(spaceEnter.at(1_000, 0));
let spacePrevented = 0;
assert.equal(
  spaceEnter.router.keyDown({ key: " ", preventDefault: () => { spacePrevented += 1; } } as unknown as KeyboardEvent),
  true,
  "Espacio con LINE abierto vale por Intro",
);
assert.equal(spacePrevented, 1, "y se lo queda (preventDefault una vez)");
assert.equal(spaceEnter.router.active, false, "y termina el comando");
ok(true, "Espacio ≡ Intro para el motor");

// Un DEDO apoyado sobre un paso sin palabras clave no puede terminar el comando.
// El botón derecho del ratón sí lo hace —es el gesto de AutoCAD—, y por eso las
// dos entradas se distinguen por el `pointerType` que trae el evento.
const restingFinger = harness();
restingFinger.router.invoke("LINE");
const fingerContextMenu = {
  ...restingFinger.at(0, 0),
  pointerType: "touch",
} as unknown as MouseEvent;
restingFinger.router.contextMenu(fingerContextMenu);
assert.equal(
  restingFinger.router.active,
  true,
  "una pulsación larga sobre el primer punto de LINE no termina el comando",
);
assert.equal(restingFinger.cursor.menuOpen, false, "y tampoco abre un menú vacío");
const mouseRightClick = harness();
mouseRightClick.router.invoke("LINE");
mouseRightClick.router.contextMenu(mouseRightClick.at(0, 0) as unknown as MouseEvent);
assert.equal(
  mouseRightClick.router.active,
  false,
  "el botón derecho del ratón sigue valiendo por Enter sobre un paso sin opciones",
);
ok(true, "el dedo apoyado no termina comandos; el botón derecho del ratón sí");

// ---------------------------------------------------------------------------
// 7. El botón central y el secundario nunca designan.
// ---------------------------------------------------------------------------
const buttons = harness();
buttons.router.invoke("LINE");
const middle = { ...buttons.at(50, 50), button: 1 } as unknown as PointerEvent;
assert.equal(
  buttons.router.click(middle),
  false,
  "el botón central se deja pasar: es el paneo del editor",
);
assert.equal(buttons.router.anchor, null, "y no fija ningún punto");
ok(true, "sólo el botón primario designa");

// ---------------------------------------------------------------------------
// 8. DESIGNAR OBJETOS con el clic: el paso decide, no el enrutador.
// ---------------------------------------------------------------------------
const picking = harness();
picking.router.invoke("MOVE");
// «Designe objetos» NO acepta puntos: el clic al vacío no designa nada, y
// sobre todo NO se cuela como punto base (el paso se lo tragaría).
picking.router.click(picking.at(100, 100));
assert.equal(picking.router.active, true, "el comando sigue esperando su objeto");
assert.equal(picking.router.anchor, null, "y el clic al vacío no fijó ningún punto");
picking.hitTo = "e-objetivo";
picking.router.click(picking.at(100, 100));
assert.equal(picking.router.anchor, null, "designar una entidad tampoco es un punto");
picking.hitTo = null;
// El paso siguiente acepta PUNTOS y no objetos: el MISMO clic vuelve a ser un
// punto — el gate es del paso, no un modo pegajoso del enrutador.
picking.router.click(picking.at(0, 0));
assert.deepEqual(picking.router.anchor, { x: 0, y: 0 }, "el punto base entra como punto");
picking.router.click(picking.at(500, 250));
const displaced = picking.applied.find((command) => command.type === "transform");
assert.ok(displaced, "MOVE con el ratón emite el transform canónico");
assert.equal(picking.router.active, false, "y termina al segundo punto");
ok(true, "entityPick por clic con fallback a punto gobernado por la máscara del paso");

// ---------------------------------------------------------------------------
// 9. Un pick que TERMINA el comando también pasa por afterDispatch.
// ---------------------------------------------------------------------------
const erasing = harness();
erasing.router.invoke("ERASE");
erasing.hitTo = "e9";
erasing.router.click(erasing.at(50, 50));
assert.deepEqual(
  erasing.applied,
  [{ type: "delete", entityId: "e9" }],
  "designar la entidad la borra como comando canónico",
);
assert.equal(erasing.router.active, false, "el comando terminó");
ok(erasing.cursor.hidden > 0, "y el cursor vivo se retiró, como tras un punto final");

// ---------------------------------------------------------------------------
// 10. OFFSET de punta a punta con el puntero: distancia → objeto → Enter.
// ---------------------------------------------------------------------------
const offsetting = harness([
  { id: "muro", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 }, layer: "0" },
]);
offsetting.router.invoke("OFFSET");
offsetting.host.submit("250");
offsetting.hitTo = "muro";
offsetting.router.click(offsetting.at(500, 0));
assert.equal(offsetting.applied.length, 0, "designar no aplica todavía: OFFSET repite");
offsetting.router.accept();
assert.equal(
  offsetting.applied.filter((command) => command.type === "insert").length,
  1,
  "Enter emite el lote con UN desfase",
);
assert.equal(offsetting.router.active, false);
ok(true, "OFFSET entero con el puntero: distancia, objeto, Enter");

console.log(
  `pointer-router: ${checks} comprobaciones — enrutado explícito sin solapes, LINE con el ratón produce 3 comandos insert canónicos con Cerrar, banda elástica anclada al último punto, captura a objeto, entrada directa de distancia, y el clic designa ENTIDADES cuando el paso lo acepta (MOVE al vacío no fija puntos, ERASE termina al designar, OFFSET entero con el puntero).`,
);
