/**
 * Anfitrión del visor de piso, cielorraso y techo extruidos desde los muros.
 *
 * Mismo patrón que `solid-shade-host.ts`: un grupo THREE que este anfitrión
 * posee y reconcilia contra el documento en cada `sync`, fuera de React.
 *
 * ## Por qué la reconciliación no es por identidad de REFERENCIA
 *
 * `CadSolidShadeHost` reconcilia comparando `next === entry.entity`: le vale
 * porque el sólido YA es una entidad persistida y las mutaciones canónicas no
 * clonan lo que no tocan. Una habitación no es una entidad — es el resultado
 * de coser muros — así que `buildArchitecturalMassPlan` la recalcula entera en
 * cada `sync`, y dos cálculos sucesivos del MISMO cuarto nunca son el mismo
 * objeto aunque no haya cambiado nada. La identidad estable es el conjunto de
 * muros que lo delimitan (`room.id`, ver `roof-floor-generation.ts`), y lo que
 * decide si hay que reconstruir la malla es una firma del contenido —el
 * polígono y las alturas— comparada contra la última con la que se construyó.
 */
import * as THREE from "three";
import type { CadDocument } from "@/lib/cad/cad-document";
import {
  buildArchitecturalMassPlan,
  type RoofFloorEnvelope,
  type RoofFloorRoom,
} from "@/lib/cad/roof-floor-generation";
import {
  buildCadRoofObject,
  buildCadRoomMassObject,
  disposeCadArchitecturalMassObject,
} from "@/lib/cad/roof-floor-three";
import type { CadThreeViewport } from "@/lib/cad/entity-three";

function roomSignature(room: RoofFloorRoom): string {
  return JSON.stringify([room.polygon, room.levelZ, room.height]);
}

function envelopeSignature(envelope: RoofFloorEnvelope): string {
  return JSON.stringify([envelope.polygon, envelope.roofZ]);
}

interface BuiltMass {
  signature: string;
  object: THREE.Object3D;
}

export class CadArchitecturalMassHost {
  readonly group = new THREE.Group();
  private readonly rooms = new Map<string, BuiltMass>();
  private envelope: BuiltMass | null = null;

  constructor(private readonly viewport: () => CadThreeViewport) {
    this.group.name = "cad-architectural-mass";
  }

  /**
   * Reconcilia contra el documento: crea lo que falta, reconstruye lo que
   * cambió de forma o de altura y libera lo que ya no cierra un cuarto ni una
   * envolvente.
   */
  sync(document: CadDocument): void {
    const plan = buildArchitecturalMassPlan(document);
    const wanted = new Map(plan.rooms.map((room) => [room.id, room]));
    for (const [id, built] of [...this.rooms]) {
      const room = wanted.get(id);
      if (room && roomSignature(room) === built.signature) {
        wanted.delete(id);
        continue;
      }
      disposeCadArchitecturalMassObject(built.object);
      this.rooms.delete(id);
    }
    for (const [id, room] of wanted) this.addRoom(id, room);

    const signature = plan.envelope ? envelopeSignature(plan.envelope) : null;
    if (signature === null) {
      if (this.envelope) {
        disposeCadArchitecturalMassObject(this.envelope.object);
        this.envelope = null;
      }
      return;
    }
    if (this.envelope && this.envelope.signature === signature) return;
    if (this.envelope) disposeCadArchitecturalMassObject(this.envelope.object);
    const object = buildCadRoofObject(plan.envelope!, this.viewport());
    this.group.add(object);
    this.envelope = { signature, object };
  }

  private addRoom(id: string, room: RoofFloorRoom): void {
    const object = buildCadRoomMassObject(room, this.viewport());
    this.group.add(object);
    this.rooms.set(id, { signature: roomSignature(room), object });
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  get hasRoof(): boolean {
    return this.envelope !== null;
  }

  dispose(): void {
    for (const built of this.rooms.values()) disposeCadArchitecturalMassObject(built.object);
    this.rooms.clear();
    if (this.envelope) disposeCadArchitecturalMassObject(this.envelope.object);
    this.envelope = null;
    this.group.removeFromParent();
  }
}
