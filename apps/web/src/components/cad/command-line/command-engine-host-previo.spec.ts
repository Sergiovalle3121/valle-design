/**
 * «PREVIO» RECUERDA DE VERDAD (T-21, petición F3-P-02).
 *
 * `selection-keywords.ts` resuelve «Previo» leyendo `session.lastSelectionIds`,
 * y el motor —un reductor puro— no puede escribirlo: lo anota el anfitrión
 * cuando un conjunto entra a un comando (`select`) o cuando un comando lo
 * designa (`QSELECT`/`FILTER`). Sin este cableado «Previo» resolvía siempre a
 * vacío, honesto pero inútil. Los comandos se cargan a demanda: se calientan
 * antes de invocarlos, como hace `runCadScript`.
 */
import assert from "node:assert/strict";
import type { CadEntity } from "@/lib/cad/cad-document";
import { CAD_COMMAND_REGISTRY_V2 } from "@/lib/cad/engine";
import { CadCommandEngineHost } from "./command-engine-host";

async function principal() {
  const entities = new Map<string, CadEntity>([
    ["l1", { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 }, layer: "0" }],
    ["l2", { id: "l2", type: "line", start: { x: 0, y: 500, z: 0 }, end: { x: 1_000, y: 500, z: 0 }, layer: "0" }],
  ]);
  const host = new CadCommandEngineHost(CAD_COMMAND_REGISTRY_V2, {
    context: () => ({
      entityIds: [...entities.keys()],
      entity: (entityId) => entities.get(entityId),
      selection: [],
      activeLayer: "0",
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => "nuevo",
    }),
    apply: () => {},
    preview: () => {},
    osnapOverride: () => {},
    cursor: () => {},
  });
  await host.warmCommands(["COPY", "MOVE"]);
  let checks = 0;

  // Sin ningún conjunto anterior, «Previo» resuelve a nada: no rompe, no miente.
  host.invoke("MOVE");
  assert.match(host.getSnapshot().prompt?.message ?? "", /Designe objetos/i, "MOVE arranca designando");
  host.submit("Previo");
  host.accept();
  assert.doesNotMatch(
    host.getSnapshot().prompt?.message ?? "",
    /punto base/i,
    "sin selección previa, «Previo» + Intro no designa nada: MOVE no pasa al punto base (vacío honesto)",
  );
  checks += 2;
  host.cancel();

  // Un comando recibe l1 y l2: ese conjunto es lo que «Previo» tiene que
  // recordar, termine el comando o se cancele después.
  host.invoke("COPY");
  host.select(["l1", "l2"]);
  host.cancel();

  host.invoke("MOVE");
  host.submit("Previo");
  host.accept();
  assert.match(
    host.getSnapshot().prompt?.message ?? "",
    /punto base/i,
    "con el conjunto de COPY recordado, «Previo» + Intro designa y MOVE pasa al punto base",
  );
  checks += 1;
  host.cancel();
  console.log(`ok command-engine-host-previo: ${checks} comprobaciones`);
}

principal().catch((error) => {
  console.error(error);
  process.exit(1);
});
