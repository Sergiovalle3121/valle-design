/**
 * Anfitrión del VOLUMEN 3D de piso, cielorraso y cubierta.
 *
 * Mismo patrón que `CadWallSolidHost`, pero con una diferencia de fondo: un
 * muro se reconcilia UNO A UNO porque cada uno es su propia entidad; piso,
 * cielorraso y cubierta no son entidades del documento — son tres masas
 * DERIVADAS del grafo de ejes de TODOS los muros a la vez
 * (`detectCadRooms(walls).exteriorRing`), así que las tres se reconstruyen
 * juntas o ninguna. La firma de cambio es la lista de muros del documento,
 * por referencia y en orden: si ningún muro se creó, borró o mutó, el grafo
 * no pudo haber cambiado, y reconstruir tres booleanas en cada `sync()` —la
 * mayoría llamadas por un cambio que no toca ni un muro— sería exactamente
 * el patrón de "tirar todo en cada render" que este anfitrión existe para
 * evitar.
 *
 * Los grosores son constantes de módulo, no un campo del documento: el
 * esquema de muro/vano todavía no tiene dónde guardar un espesor de losa por
 * edificio. Son valores conservadores de obra corriente (piso de hormigón,
 * cubierta plana ligera) y quedan exportados para que una futura ampliación
 * del esquema los sustituya sin tocar la lógica de reconciliación.
 */
import * as THREE from "three";
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadWallEntity } from "@/lib/cad/cad-entities-v6";
import { detectCadRooms } from "@/lib/cad/bim-schedule";
import { conservativeWallTop } from "@/lib/cad/room-solid";
import {
  buildCadArchitecturalMassObject,
  disposeCadArchitecturalMassObject,
  type CadArchitecturalMassKind,
} from "@/lib/cad/room-solid-three";
import type { CadThreeViewport } from "@/lib/cad/entity-three";

/** Losa de piso terminado, hacia abajo desde el nivel 0 del dibujo. */
export const CAD_FLOOR_SLAB_THICKNESS = 150;
/** Cielorraso, apoyado en la altura de muro. */
export const CAD_CEILING_SLAB_THICKNESS = 100;
/** Cubierta plana, sobre el cielorraso. */
export const CAD_ROOF_SLAB_THICKNESS = 200;

function sameWalls(
  a: readonly CadWallEntity[],
  b: readonly CadWallEntity[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((entity, index) => entity === b[index]);
}

export class CadArchitecturalMassHost {
  readonly group = new THREE.Group();
  private walls: CadWallEntity[] = [];
  private objects: THREE.Object3D[] = [];

  constructor(private readonly viewport: () => CadThreeViewport) {
    this.group.name = "cad-architectural-mass";
  }

  /**
   * Reconcilia contra el documento: si la lista de muros no cambió por
   * referencia, no hace nada. Si cambió, tira las tres losas anteriores (las
   * que hubiera) y reconstruye desde el anillo exterior actual — que puede
   * ser `null` si los muros ya no cierran ningún contorno, en cuyo caso no
   * queda ninguna losa, no una a medio construir.
   */
  sync(document: CadDocument): void {
    const walls: CadWallEntity[] = [];
    for (const entity of document.entities)
      if (entity.type === "wall") walls.push(entity);
    if (sameWalls(walls, this.walls)) return;
    this.teardown();
    this.walls = walls;

    const { exteriorRing } = detectCadRooms(walls);
    if (!exteriorRing) return;
    const wallTop = conservativeWallTop(walls);
    if (wallTop === null) return;

    const viewport = this.viewport();
    this.build("floor", exteriorRing, -CAD_FLOOR_SLAB_THICKNESS, 0, viewport);
    const ceilingTop = wallTop + CAD_CEILING_SLAB_THICKNESS;
    this.build("ceiling", exteriorRing, wallTop, ceilingTop, viewport);
    this.build(
      "roof",
      exteriorRing,
      ceilingTop,
      ceilingTop + CAD_ROOF_SLAB_THICKNESS,
      viewport,
    );
  }

  private build(
    kind: CadArchitecturalMassKind,
    ring: Parameters<typeof buildCadArchitecturalMassObject>[1],
    z0: number,
    z1: number,
    viewport: CadThreeViewport,
  ): void {
    const object = buildCadArchitecturalMassObject(
      kind,
      ring,
      z0,
      z1,
      viewport,
    );
    this.group.add(object);
    this.objects.push(object);
  }

  private teardown(): void {
    for (const object of this.objects)
      disposeCadArchitecturalMassObject(object);
    this.objects = [];
  }

  get count(): number {
    return this.objects.length;
  }

  /**
   * Qué masas (de las que se intentó construir) no produjeron un sólido
   * válido (`group.userData.invalid`, ver `buildCadArchitecturalMassObject`)
   * — para que quien reconcilie la escena pueda avisar en vez de dejarlas
   * desaparecer en silencio (`validation-report.ts`). Cada objeto se
   * etiqueta con su propio `architecturalMassKind`, así que no hace falta
   * llevar cuenta aparte de cuál es cuál.
   */
  invalidKinds(): CadArchitecturalMassKind[] {
    return this.objects
      .filter((object) => object.userData.invalid === true)
      .map(
        (object) =>
          object.userData.architecturalMassKind as CadArchitecturalMassKind,
      );
  }

  dispose(): void {
    this.teardown();
    this.walls = [];
    this.group.removeFromParent();
  }
}
