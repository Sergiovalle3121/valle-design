/**
 * Anfitrión del VOLUMEN 3D de muros.
 *
 * Mismo patrón que `CadSolidShadeHost` para sólidos: un `wall` no tenía
 * ningún consumidor que lo dibujara con volumen real —se veía siempre como su
 * contorno de planta aplanado, igual que le pasaba a `SOLID3D` antes de ese
 * anfitrión—, y éste es el grupo de escena que le faltaba.
 *
 * ## Por qué reconcilia por FIRMA y no sólo por identidad de referencia
 *
 * Un muro no se dibuja solo: sus vanos alojados también entran en su malla
 * (el hueco se recorta ahí, no en una capa aparte). Que el MURO no haya
 * cambiado de referencia no basta para saltarse la reconstrucción — uno de
 * sus vanos sí pudo cambiar. La firma es el par (referencia del muro,
 * referencias de sus vanos en orden): comparar por referencia, elemento a
 * elemento, es barato porque las mutaciones canónicas no clonan lo que no
 * tocan, y es exacto porque cualquier vano nuevo, borrado o editado cambia al
 * menos una referencia de la lista.
 */
import * as THREE from "three";
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadWallEntity } from "@/lib/cad/cad-entities-v6";
import type { CadOpeningEntity } from "@/lib/cad/cad-entities-v7";
import {
  buildCadWallSolidObject,
  disposeCadWallSolidObject,
} from "@/lib/cad/wall-solid-three";
import type { CadThreeViewport } from "@/lib/cad/entity-three";

interface CadWallSolidEntry {
  wall: CadWallEntity;
  openings: CadOpeningEntity[];
  selected: boolean;
  object: THREE.Object3D;
}

function sameOpenings(
  a: readonly CadOpeningEntity[],
  b: readonly CadOpeningEntity[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((entity, index) => entity === b[index]);
}

export class CadWallSolidHost {
  readonly group = new THREE.Group();
  private readonly built = new Map<string, CadWallSolidEntry>();

  constructor(private readonly viewport: () => CadThreeViewport) {
    this.group.name = "cad-walls-solid";
  }

  /**
   * Reconcilia contra el documento: crea lo que falta, reconstruye lo que
   * cambió (por firma) y libera lo que ya no está.
   */
  sync(document: CadDocument, selectedIds: ReadonlySet<string>): void {
    const openingsByHost = new Map<string, CadOpeningEntity[]>();
    for (const entity of document.entities) {
      if (entity.type !== "opening") continue;
      const list = openingsByHost.get(entity.hostId);
      if (list) list.push(entity);
      else openingsByHost.set(entity.hostId, [entity]);
    }
    const wanted = new Map<
      string,
      { wall: CadWallEntity; openings: CadOpeningEntity[] }
    >();
    for (const entity of document.entities) {
      if (entity.type !== "wall") continue;
      wanted.set(entity.id, {
        wall: entity,
        openings: openingsByHost.get(entity.id) ?? [],
      });
    }
    for (const [id, entry] of [...this.built]) {
      const next = wanted.get(id);
      const selected = selectedIds.has(id);
      if (
        next &&
        next.wall === entry.wall &&
        selected === entry.selected &&
        sameOpenings(next.openings, entry.openings)
      ) {
        wanted.delete(id);
        continue;
      }
      disposeCadWallSolidObject(entry.object);
      this.built.delete(id);
      if (!next) wanted.delete(id);
    }
    for (const [id, entry] of wanted)
      this.add(id, entry.wall, entry.openings, selectedIds.has(id));
  }

  private add(
    id: string,
    wall: CadWallEntity,
    openings: CadOpeningEntity[],
    selected: boolean,
  ): void {
    const object = buildCadWallSolidObject(wall, openings, this.viewport(), {
      selected,
    });
    this.group.add(object);
    this.built.set(id, { wall, openings, selected, object });
  }

  get count(): number {
    return this.built.size;
  }

  dispose(): void {
    for (const entry of this.built.values())
      disposeCadWallSolidObject(entry.object);
    this.built.clear();
    this.group.removeFromParent();
  }
}
