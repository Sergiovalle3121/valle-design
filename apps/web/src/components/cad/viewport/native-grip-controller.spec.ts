/** Controlador de grips nativos: paridad del arrastre + ciclo + menú (Ola ratón). */
import assert from "node:assert/strict";
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import type { CadNativeEntity } from "@/lib/cad/entity-runtime";
import type { CadGripAction, CadGripActionKind } from "@/lib/cad/grip-actions";
import {
  CadNativeGripController,
  type CadGripMenuSurface,
  type CadNativeGripDeps,
} from "./native-grip-controller";

const polyline: CadNativeEntity = {
  id: "p",
  type: "polyline",
  closed: false,
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
    { x: 100, y: 100, z: 0 },
  ],
  layer: "0",
};

const baseDocument: CadDocument = {
  meta: { version: 1, schema: 3, unit: "mm" },
  layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
  entities: [polyline],
  history: [],
  modelSpace: { entityIds: ["p"] },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
  blocks: [],
  constraints: [],
  externalReferences: [],
  unsupportedEntities: [],
  lossManifest: [],
  publications: [],
};

class FakeMenu implements CadGripMenuSurface {
  openedWith: readonly CadGripAction[] | null = null;
  isOpen = false;
  badge: { action: CadGripActionKind } | null = null;
  open(_x: number, _y: number, actions: readonly CadGripAction[]): void {
    this.openedWith = actions;
    this.isOpen = true;
  }
  close(): void {
    this.isOpen = false;
  }
  showBadge(_x: number, _y: number, action: CadGripAction): void {
    this.badge = { action: action.kind };
  }
  hideBadge(): void {
    this.badge = null;
  }
}

interface Recorded {
  histories: { groupKey?: string }[];
  committed: { commands: CadEntityCommand[]; groupKey?: string }[];
  notices: string[];
  orbit: boolean[];
}

function makeController(overrides: Partial<CadNativeGripDeps> = {}) {
  let current: CadDocument = structuredClone(baseDocument);
  const menu = new FakeMenu();
  const recorded: Recorded = { histories: [], committed: [], notices: [], orbit: [] };
  const deps: CadNativeGripDeps = {
    document: () => current,
    setDocument: (document) => {
      current = document;
    },
    snapshotDocument: () => current,
    readOnly: () => false,
    worldPoint: (event) => ({
      wx: (event as unknown as { worldX: number }).worldX,
      wy: (event as unknown as { worldY: number }).worldY,
    }),
    snapPoint: (wx, wy) => ({ wx, wy }),
    localPoint: (event) => ({ x: event.clientX, y: event.clientY }),
    selectNative: () => {},
    setNativeEntities: () => {},
    bumpDocumentRevision: () => {},
    syncScene: () => {},
    recordHistory: (_document, groupKey) => {
      recorded.histories.push({ groupKey });
    },
    markDirty: () => {},
    commitCommands: (commands, groupKey) => {
      recorded.committed.push({ commands, groupKey });
      return true;
    },
    setOrbitEnabled: (enabled) => recorded.orbit.push(enabled),
    capturePointer: () => {},
    releasePointer: () => {},
    notify: (message) => recorded.notices.push(message),
    menu,
    ...overrides,
  };
  const controller = new CadNativeGripController(deps);
  return {
    controller,
    menu,
    recorded,
    document: () => current,
    at: (x: number, y: number) =>
      ({ pointerId: 1, clientX: x, clientY: y, worldX: x, worldY: y }) as never,
  };
}

// 1) Paridad del camino por defecto: start → move → up = recordHistory sin
// groupKey + commitChange con la etiqueta grip:{id}:{grip}, sin pasar por el
// embudo canónico.
{
  const t = makeController();
  assert.ok(t.controller.start("p", "vertex:1", t.at(100, 0)));
  assert.deepEqual(t.recorded.orbit, [false], "la órbita se apaga al arrancar");
  t.controller.handlePointerMove(t.at(140, 40));
  t.controller.handlePointerUp(t.at(140, 40));
  assert.equal(t.recorded.histories.length, 1, "UN recordHistory por arrastre");
  assert.equal(t.recorded.histories[0].groupKey, undefined, "sin groupKey, como el monolito");
  assert.equal(t.recorded.committed.length, 0, "el camino default no usa el embudo");
  const moved = t.document().entities[0];
  assert.ok(moved.type === "polyline" && moved.vertices[1].x === 140 && moved.vertices[1].y === 40);
  assert.match(
    t.document().history.at(-1)?.label ?? "",
    /^grip:p:vertex:1$/,
    "misma etiqueta de historia que el bloque original",
  );
  assert.deepEqual(t.recorded.orbit, [false, true], "la órbita vuelve al soltar");
}

// 2) Espacio cicla a add-vertex: la insignia lo anuncia y el commit sale por el
// embudo canónico con la clave de agrupación del arrastre.
{
  const t = makeController();
  t.controller.start("p", "vertex:1", t.at(100, 0));
  t.controller.handlePointerMove(t.at(120, 30));
  t.controller.keyDown({ key: " ", preventDefault: () => {} });
  assert.equal(t.menu.badge?.action, "add-vertex", "la insignia anuncia la acción ciclada");
  t.controller.handlePointerMove(t.at(150, 60));
  t.controller.handlePointerUp(t.at(150, 60));
  assert.equal(t.recorded.histories.length, 0, "el embudo canónico registra su propia historia");
  assert.equal(t.recorded.committed.length, 1);
  assert.equal(t.recorded.committed[0].groupKey, "grip:p:vertex:1:add-vertex");
  const command = t.recorded.committed[0].commands[0];
  assert.ok(command.type === "replace" && command.entity.type === "polyline");
  assert.equal(
    command.entity.type === "polyline" ? command.entity.vertices.length : 0,
    4,
    "añadir vértice produce una polilínea de 4 vértices desde el checkpoint",
  );
}

// 3) Clic sin arrastre abre el menú con las acciones reales del grip;
// remove-vertex (sin punto) commitea al instante.
{
  const t = makeController();
  t.controller.start("p", "vertex:1", t.at(100, 0));
  t.controller.handlePointerUp(t.at(100, 0));
  assert.ok(t.menu.isOpen, "clic sin mover = grip caliente");
  assert.deepEqual(
    t.menu.openedWith?.map((action) => action.kind),
    ["stretch", "add-vertex", "remove-vertex", "to-arc"],
    "el menú ofrece exactamente lo que cadGripActions declara",
  );
  t.controller.chooseMenuAction("remove-vertex");
  assert.equal(t.recorded.committed.length, 1);
  const command = t.recorded.committed[0].commands[0];
  assert.ok(command.type === "replace" && command.entity.type === "polyline");
  assert.equal(command.entity.type === "polyline" ? command.entity.vertices.length : 0, 2);
}

// 4) to-arc con el punto sobre la cuerda: error accionable y preview intacta.
{
  const t = makeController();
  t.controller.start("p", "vertex:0", t.at(0, 0));
  t.controller.handlePointerUp(t.at(0, 0));
  t.controller.chooseMenuAction("to-arc");
  // Modo pendiente: el punto llega con el siguiente clic — sobre la cuerda.
  t.controller.handlePointerDown(t.at(50, 0));
  assert.equal(t.recorded.committed.length, 0, "no se emite un lote inválido");
  assert.match(t.recorded.notices[0] ?? "", /cuerda/, "el motivo llega al usuario");
  assert.deepEqual(t.document().entities[0], baseDocument.entities[0], "checkpoint restaurado");
}

// 5) readOnly: el arranque se rechaza sin tocar nada.
{
  const t = makeController({ readOnly: () => true });
  assert.equal(t.controller.start("p", "vertex:1", t.at(100, 0)), false);
  assert.deepEqual(t.recorded.orbit, []);
}

console.log("native grip controller specs passed");
