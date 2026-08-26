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
 * (el hueco se recorta ahí, no en una capa aparte), y sus UNIONES L/T contra
 * los vecinos también (el inglete vive en sus vértices). Que el MURO no haya
 * cambiado de referencia no basta para saltarse la reconstrucción — un vano
 * suyo o un VECINO pudieron cambiar. La firma es la terna (referencia del
 * muro, referencias de sus vanos en orden, uniones por VALOR): las dos
 * primeras por referencia porque las mutaciones canónicas no clonan lo que
 * no tocan; las uniones por valor porque se rederivan en cada sync y es su
 * contenido el que dice si la esquina cambió (`sameJoins`).
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
  wallJoins,
  type CadWallJoinEnd,
  type CadWallJoins,
} from "@/lib/cad/wall-joins";
import {
  buildCadWallSolidObject,
  disposeCadWallSolidObject,
  recolorCadWallSolidObject,
} from "@/lib/cad/wall-solid-three";
import type { CadThreeViewport } from "@/lib/cad/entity-three";
import type {
  CadWallOpeningCutDiagnostic,
  CadWallOpeningCutReport,
} from "@/lib/cad/wall-solid-diagnostics";
import { cadHiddenLayerIds } from "@/lib/cad/cad-layer-visibility";

interface CadWallSolidEntry {
  wall: CadWallEntity;
  openings: CadOpeningEntity[];
  joins: CadWallJoins | null;
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
 * Las uniones se comparan por VALOR, no por referencia: se rederivan en cada
 * `sync()` (son función pura de los ejes vecinos) y compararlas campo a campo
 * es lo que detecta que un VECINO movido cambió la esquina de este muro sin
 * que este muro cambiara de referencia — la dependencia que la firma por
 * referencias no puede ver.
 */
function sameJoinEnd(a: CadWallJoinEnd, b: CadWallJoinEnd): boolean {
  return (
    a.kind === b.kind &&
    a.otherId === b.otherId &&
    a.leftExtension === b.leftExtension &&
    a.rightExtension === b.rightExtension &&
    a.cap === b.cap
  );
}

function sameJoins(a: CadWallJoins | null, b: CadWallJoins | null): boolean {
  if (a === null || b === null) return a === b;
  return sameJoinEnd(a.start, b.start) && sameJoinEnd(a.end, b.end);
}

/**
 * Uniones del muro contra los demás muros del documento, o `null` si ningún
 * extremo une — el MISMO contrato que `wallDocumentJoins` en el adaptador de
 * planta (`wall-entity-adapter.ts`), incluida la decisión de NO filtrar por
 * capa: un muro de capa apagada no se construye, pero sigue dando forma a la
 * esquina de su vecino, igual que en 2D. Con `null` el sólido es la caja de
 * siempre: el muro solitario no paga las uniones.
 */
function wallSolidJoins(
  entity: CadWallEntity,
  allWalls: readonly CadWallEntity[],
): CadWallJoins | null {
  if (allWalls.length < 2) return null;
  const joins = wallJoins(entity, allWalls);
  if (joins.start.kind === "free" && joins.end.kind === "free") return null;
  return joins;
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
    // Capas: un muro en capa apagada o congelada no se construye (y si ya
    // estaba construido, se libera — el bucle de abajo lo trata como ausente).
    // Los VANOS cortan a su anfitrión sin mirar su propia capa, igual que la
    // planta 2D (`wallHostedOpenings` tampoco filtra): la capa del vano
    // gobierna su símbolo, no el agujero del muro que lo aloja.
    const hiddenLayers = cadHiddenLayerIds(document.layers);
    const openingsByHost = new Map<string, CadOpeningEntity[]>();
    // TODOS los muros — también los de capa apagada — porque las uniones se
    // derivan contra el documento entero, como en planta (`wallSolidJoins`).
    // El coste es O(muros²) por sync, el mismo barrido lineal por muro que ya
    // paga el adaptador 2D al derivar cada uno.
    const allWalls: CadWallEntity[] = [];
    for (const entity of document.entities) {
      if (entity.type === "wall") allWalls.push(entity);
      if (entity.type !== "opening") continue;
      const list = openingsByHost.get(entity.hostId);
      if (list) list.push(entity);
      else openingsByHost.set(entity.hostId, [entity]);
    }
    const wanted = new Map<
      string,
      {
        wall: CadWallEntity;
        openings: CadOpeningEntity[];
        joins: CadWallJoins | null;
      }
    >();
    for (const entity of allWalls) {
      if (hiddenLayers.has(entity.layer)) continue;
      wanted.set(entity.id, {
        wall: entity,
        openings: openingsByHost.get(entity.id) ?? [],
        joins: wallSolidJoins(entity, allWalls),
      });
    }
    for (const [id, entry] of [...this.built]) {
      const next = wanted.get(id);
      const selected = selectedIds.has(id);
      if (
        next &&
        sameOpenings(next.openings, entry.openings) &&
        wallGeometryUnchanged(next.wall, entry.wall) &&
        sameJoins(next.joins, entry.joins)
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
        entry.joins = next.joins;
        entry.selected = selected;
        wanted.delete(id);
        continue;
      }
      disposeCadWallSolidObject(entry.object);
      this.built.delete(id);
      if (!next) wanted.delete(id);
    }
    for (const [id, entry] of wanted)
      this.add(id, entry.wall, entry.openings, entry.joins, selectedIds.has(id));
  }

  private add(
    id: string,
    wall: CadWallEntity,
    openings: CadOpeningEntity[],
    joins: CadWallJoins | null,
    selected: boolean,
  ): void {
    const object = buildCadWallSolidObject(wall, openings, this.viewport(), {
      selected,
      joins,
    });
    this.group.add(object);
    this.built.set(id, { wall, openings, joins, selected, object });
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

  /**
   * Vanos que NO se recortaron en el volumen de su muro, con identidad
   * completa (muro + vano + motivo tipado + causa). Sale de los diagnósticos
   * que `buildCadWallSolidObject` dejó en `userData.openingCutDiagnostics`;
   * el índice se traduce aquí al id real del vano porque el anfitrión es
   * quien conserva la lista con la que se construyó cada muro.
   */
  openingCutReports(): CadWallOpeningCutReport[] {
    const reports: CadWallOpeningCutReport[] = [];
    for (const [wallId, entry] of this.built) {
      const diagnostics = entry.object.userData.openingCutDiagnostics as
        | CadWallOpeningCutDiagnostic[]
        | undefined;
      if (!diagnostics) continue;
      for (const diagnostic of diagnostics)
        reports.push({
          ...diagnostic,
          wallId,
          openingId: entry.openings[diagnostic.openingIndex]?.id ?? null,
        });
    }
    return reports;
  }

  dispose(): void {
    for (const entry of this.built.values())
      disposeCadWallSolidObject(entry.object);
    this.built.clear();
    this.group.removeFromParent();
  }
}
