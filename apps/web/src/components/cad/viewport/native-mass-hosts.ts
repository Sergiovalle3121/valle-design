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
import type { CadVisualStyleId } from "@/lib/cad/view/visual-styles";
import type { CadWallOpeningCutReport } from "@/lib/cad/wall-solid-diagnostics";
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

  /**
   * VSCURRENT/SHADEMODE (T-10a). Antes de esta ficha, `applyVisualStyle`
   * sólo llegaba a `CadSolidShadeHost` (SOLID3D): la línea de comandos
   * confirmaba un cambio que sobre muros, pisos, cielorrasos y cubiertas NO
   * ocurría — el éxito falso que la auditoría midió como el más grave del
   * catálogo. Una sola fachada para los dos anfitriones de masa nativa
   * evita que quien cablee esto tenga que acordarse de los DOS.
   */
  applyVisualStyle(style: CadVisualStyleId): string {
    this.masses.setStyle(style);
    return this.walls.applyVisualStyle(style);
  }

  get visualStyle(): CadVisualStyleId {
    return this.walls.visualStyle;
  }

  /**
   * Evidencia REAL de que se construyó geometría 3D — no una lista de botones
   * recortada a 20, que existe independientemente de si una sola malla llegó
   * a montarse (campaña Paridad, OLA 0.2). Recorre `this.group` en vez de
   * fiarse de `this.walls.count`/`this.masses.count`: cuenta lo que
   * REALMENTE está en la escena Three.js, así que un anfitrión que reporte
   * "construido" sin agregar su objeto al grupo también queda en cero aquí.
   */
  getSnapshot(): { meshCount: number; vertexCount: number; visualStyle: CadVisualStyleId } {
    let meshCount = 0;
    let vertexCount = 0;
    this.group.traverse((object) => {
      // Alámbrico no construye NINGÚN `Mesh` (`applyCadVisualStyleToGroup` lo
      // libera) — sólo `LineSegments` de aristas. Sin contarlas también, este
      // estilo reportaría "0 mallas" con muros de verdad en la escena, que es
      // el mismo éxito falso al revés: parecería que el 3D desapareció.
      const mesh = object as THREE.Mesh;
      const lines = object as unknown as THREE.LineSegments;
      if (!mesh.isMesh && !lines.isLineSegments) return;
      meshCount += 1;
      vertexCount += mesh.geometry?.attributes?.position?.count ?? 0;
    });
    // T-10a: el estilo VIGENTE de la escena, no el que la línea de comandos
    // DIJO que aplicó — es lo que permite a un golden afirmar la escena
    // misma (`Cad3DSolidDiagnostics`, `data-visual-style`) en vez de leer de
    // vuelta la frase que el propio comando escribió.
    return { meshCount, vertexCount, visualStyle: this.visualStyle };
  }

  /**
   * Qué muros y qué masas, de los ya sincronizados, no tienen un volumen 3D
   * válido — para `buildCadValidationReport({ invalidGeometry })`, y así un
   * muro o una masa que no se pudo construir avisa en vez de desaparecer en
   * silencio.
   */
  invalidGeometry(): {
    wallIds: string[];
    massKinds: string[];
    openingCuts: CadWallOpeningCutReport[];
  } {
    return {
      wallIds: this.walls.invalidIds(),
      massKinds: this.masses.invalidKinds(),
      // Vanos no recortados con identidad completa (muro + vano + causa):
      // el informe de validación los enseña en vez de callarlos.
      openingCuts: this.walls.openingCutReports(),
    };
  }

  dispose(): void {
    this.walls.dispose();
    this.masses.dispose();
    this.group.removeFromParent();
  }
}
