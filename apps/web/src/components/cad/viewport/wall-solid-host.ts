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
 *
 * La SELECCIÓN y el MATERIAL no entran en la firma a propósito: designar o
 * soltar un muro, o cambiarle el material, no mueven un solo vértice de su
 * malla — sólo qué color pinta su cara —, así que `sync()` los resuelve
 * recoloreando el sólido ya construido (`recolorCadWallSolidObject`) en vez
 * de tratarlos como cambios que ameriten retesellar el B-rep entero.
 * `wallGeometryUnchanged` es deliberadamente explícita sobre qué campos SÍ
 * importan (eje, grosor, altura) en vez de comparar el objeto entero: un
 * campo nuevo que afecte la malla tiene que sumarse ahí a mano, y eso es
 * más seguro que un `===` de referencia que se volvería falso —y forzaría
 * una reconstrucción de sobra— por cualquier campo que cambie, geometría o
 * no.
 */
import * as THREE from "three";
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadWallEntity } from "@/lib/cad/cad-entities-v6";
import type { CadOpeningEntity } from "@/lib/cad/cad-entities-v7";
import {
  buildCadWallSolidObject,
  disposeCadWallSolidObject,
  recolorCadWallSolidObject,
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

/**
 * Sólo los campos que de verdad mueven un vértice de la malla del muro:
 * eje, grosor, altura. `material`/`layer`/`context` cambian la entidad
 * (nueva referencia) pero no la geometría — ver la cabecera del archivo.
 */
function wallGeometryUnchanged(a: CadWallEntity, b: CadWallEntity): boolean {
  return (
    a.start.x === b.start.x &&
    a.start.y === b.start.y &&
    a.start.z === b.start.z &&
    a.end.x === b.end.x &&
    a.end.y === b.end.y &&
    a.end.z === b.end.z &&
    a.thickness === b.thickness &&
    a.height === b.height
  );
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
        sameOpenings(next.openings, entry.openings) &&
        wallGeometryUnchanged(next.wall, entry.wall)
      ) {
        // Ni los vanos ni la geometría del muro cambiaron: la malla sigue
        // siendo válida. Lo que pudo cambiar —selección, material— es un
        // color, no un vértice: se recolorea el sólido ya construido en vez
        // de retesellarlo entero (`recolorCadWallSolidObject`).
        if (selected !== entry.selected || next.wall.material !== entry.wall.material) {
          recolorCadWallSolidObject(entry.object, next.wall, selected);
        }
        // La entrada se refresca a las referencias MÁS RECIENTES aunque no
        // haga falta recolorear (p. ej. sólo cambió `layer`): si no, una
        // futura llamada compararía contra una entidad ya obsoleta.
        entry.wall = next.wall;
        entry.openings = next.openings;
        entry.selected = selected;
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

  /**
   * Ids de los muros cuya receta no produjo un sólido válido
   * (`group.userData.invalid`, ver `buildCadWallSolidObject`) — para que
   * quien reconcilie la escena pueda avisar en vez de dejarlos desaparecer
   * en silencio (`validation-report.ts`).
   */
  invalidIds(): string[] {
    const ids: string[] = [];
    for (const [id, entry] of this.built)
      if (entry.object.userData.invalid === true) ids.push(id);
    return ids;
  }

  dispose(): void {
    for (const entry of this.built.values())
      disposeCadWallSolidObject(entry.object);
    this.built.clear();
    this.group.removeFromParent();
  }
}
