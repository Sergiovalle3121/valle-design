/**
 * Fachada única sobre los dos anfitriones de volumen 3D que derivan del
 * mismo grafo de ejes de muro: `CadWallSolidHost` (los muros) y
 * `CadArchitecturalMassHost` (piso, cielorraso y cubierta).
 *
 * El editor los usa SIEMPRE juntos —se construyen juntos, se sincronizan en
 * el mismo punto del bucle de render, se liberan juntos—, así que separarlos
 * en el monolito obligaría a repetir ese acoplamiento en cada uno de esos
 * cuatro sitios en vez de declararlo una sola vez aquí. La asimetría real
 * entre los dos —los muros SÍ toman `selectedIds` para resaltar la
 * selección, las masas no, porque todavía no son seleccionables— queda a la
 * vista en el cuerpo de `sync`, no oculta detrás de un parámetro fantasma.
 */
import * as THREE from "three";
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadThreeViewport } from "@/lib/cad/entity-three";
import { CadWallSolidHost } from "./wall-solid-host";
import { CadArchitecturalMassHost } from "./room-solid-host";

export class CadNativeMassHosts {
  readonly group = new THREE.Group();
  private readonly walls: CadWallSolidHost;
  private readonly masses: CadArchitecturalMassHost;

  constructor(viewport: () => CadThreeViewport) {
    this.group.name = "cad-native-mass-hosts";
    this.walls = new CadWallSolidHost(viewport);
    this.masses = new CadArchitecturalMassHost(viewport);
    this.group.add(this.walls.group, this.masses.group);
  }

  sync(document: CadDocument, selectedIds: ReadonlySet<string>): void {
    this.walls.sync(document, selectedIds);
    this.masses.sync(document);
  }

  dispose(): void {
    this.walls.dispose();
    this.masses.dispose();
    this.group.removeFromParent();
  }
}
