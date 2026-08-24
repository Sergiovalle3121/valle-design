/**
 * Spec del anfitrión de piso/cielorraso/techo extruidos desde muros.
 *
 * La reconciliación aquí NO es por referencia de entidad —no hay una entidad
 * "habitación" que perdure entre `sync`s— sino por FIRMA de contenido del
 * cuarto recalculado. Lo que se afirma en Node es exactamente eso: que una
 * misma geometría de muros no reconstruye nada aunque el documento sea un
 * objeto distinto en cada llamada, que tocar un muro reconstruye sólo lo que
 * depende de él, y que el grupo se vacía cuando ya no hay nada que cerrar.
 */
import assert from "node:assert/strict";
import type { CadDocument } from "@/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "@/lib/cad/cad-document";
import type { CadWallEntity } from "@/lib/cad/cad-entities-v6";
import { CadArchitecturalMassHost } from "./architectural-mass-host";

const layer = { id: "0", name: "0", color: "#94a3b8", visible: true, locked: false };

function wall(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
  thickness = 200,
  height = 2400,
): CadWallEntity {
  return { id, type: "wall", start: { ...start, z: 0 }, end: { ...end, z: 0 }, thickness, height, layer: "0" };
}

function documentWith(entities: readonly CadWallEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [layer],
    entities: [...entities],
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as CadDocument;
}

function rectangularRoom(height = 2400): CadWallEntity[] {
  return [
    wall("n", { x: 0, y: 0 }, { x: 4000, y: 0 }, 200, height),
    wall("e", { x: 4000, y: 0 }, { x: 4000, y: 3000 }, 200, height),
    wall("s", { x: 4000, y: 3000 }, { x: 0, y: 3000 }, 200, height),
    wall("w", { x: 0, y: 3000 }, { x: 0, y: 0 }, 200, height),
  ];
}

const viewport = { scale: 0.01, width: 1_000, height: 800, elevation: 0.11 };

// --- dorado: una habitación cerrada por muros produce piso + cielorraso + techo en el visor
{
  const host = new CadArchitecturalMassHost(() => viewport);
  host.sync(documentWith(rectangularRoom()));
  assert.equal(host.roomCount, 1, "un objeto de masa por habitación cerrada");
  assert.equal(host.hasRoof, true, "la envolvente exterior produce techo");
  assert.equal(host.group.children.length, 2, "un grupo de cuarto + un grupo de techo cuelgan del visor");
  host.dispose();
}

// --- documento reconstruido (objeto distinto, misma geometría) no reconstruye nada
{
  const host = new CadArchitecturalMassHost(() => viewport);
  host.sync(documentWith(rectangularRoom()));
  const before = [...host.group.children];
  host.sync(documentWith(rectangularRoom())); // documento y entidades NUEVAS, geometría idéntica
  assert.deepEqual([...host.group.children], before, "misma firma de contenido → mismos objetos, aunque el documento sea otro");
  host.dispose();
}

// --- cambiar la altura de un muro reconstruye el cuarto Y el techo que se apoyaba en él
{
  const host = new CadArchitecturalMassHost(() => viewport);
  host.sync(documentWith(rectangularRoom(2400)));
  const beforeRoom = host.group.children.find((child) => child.name.startsWith("cad-room-mass"));
  const beforeRoof = host.group.children.find((child) => child.name === "cad-roof");
  host.sync(documentWith(rectangularRoom(2600)));
  assert.equal(host.roomCount, 1, "sigue habiendo un solo cuarto");
  const afterRoom = host.group.children.find((child) => child.name.startsWith("cad-room-mass"));
  const afterRoof = host.group.children.find((child) => child.name === "cad-roof");
  assert.notEqual(afterRoom, beforeRoom, "la altura cambió: el cuarto se reconstruye");
  assert.notEqual(afterRoof, beforeRoof, "el roofZ dependía de ese cielorraso: el techo también se reconstruye");
  host.dispose();
}

// --- borrar los muros vacía el grupo, sin dejar ni el techo -----------------
{
  const host = new CadArchitecturalMassHost(() => viewport);
  host.sync(documentWith(rectangularRoom()));
  host.sync(documentWith([]));
  assert.equal(host.roomCount, 0);
  assert.equal(host.hasRoof, false);
  assert.equal(host.group.children.length, 0, "sin muros que cierren nada, el grupo queda vacío");
  host.dispose();
}

// --- dispose libera todo y deja el grupo listo para desmontarse -------------
{
  const host = new CadArchitecturalMassHost(() => viewport);
  host.sync(documentWith(rectangularRoom()));
  host.dispose();
  assert.equal(host.roomCount, 0);
  assert.equal(host.hasRoof, false);
  assert.equal(host.group.children.length, 0);
}

console.log("architectural-mass-host.spec: reconciliación por firma de contenido y dorado de piso+cielorraso+techo");
