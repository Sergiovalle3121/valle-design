/**
 * Anfitrión del visor SOMBREADO de sólidos.
 *
 * `solid3d-three.ts` sabía construir la malla de un sólido con sus cuatro
 * estilos visuales y no tenía ni un consumidor: los sólidos se veían siempre
 * como su proyección alámbrica 2D aplanada. Este anfitrión les da el grupo de
 * escena que faltaba, con el MISMO patrón que los INSERT por lotes: los ids de
 * sólido se EXCLUYEN del pipeline por lotes (que vive comprimido en una lámina
 * de profundidad NDC, incompatible con la z real de una pieza) y se proyectan
 * aquí como mallas con profundidad de verdad y luz.
 *
 * El estilo (VSCURRENT/SHADEMODE) es estado del visor: cambiarlo reconstruye
 * las mallas y no toca el documento. Estado fuera de React, como todos los
 * anfitriones del viewport.
 */
import * as THREE from "three";
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadSolid3dEntity } from "@/lib/cad/cad-entities-v5";
import {
  buildCadSolidObject,
  disposeCadSolidObject,
} from "@/lib/cad/solid3d-three";
import {
  CAD_DEFAULT_VISUAL_STYLE,
  cadVisualStyle,
  type CadVisualStyleId,
} from "@/lib/cad/view/visual-styles";
import type { CadThreeViewport } from "@/lib/cad/entity-three";

/** Ids de los sólidos del documento: lo que se excluye del pipeline de líneas. */
export function cadSolidEntityIds(document: CadDocument): string[] {
  return document.entities
    .filter((entity) => entity.type === "solid3d")
    .map((entity) => entity.id);
}

export class CadSolidShadeHost {
  readonly group = new THREE.Group();
  private style: CadVisualStyleId = CAD_DEFAULT_VISUAL_STYLE;
  private readonly built = new Map<
    string,
    { entity: CadSolid3dEntity; selected: boolean; object: THREE.Object3D }
  >();

  constructor(private readonly viewport: () => CadThreeViewport) {
    this.group.name = "cad-solids-shaded";
  }

  get visualStyle(): CadVisualStyleId {
    return this.style;
  }

  /** Cambia el estilo y reconstruye. Devuelve el estilo por si hay que anunciarlo. */
  setStyle(style: CadVisualStyleId): CadVisualStyleId {
    if (style === this.style) return this.style;
    this.style = style;
    const entries = [...this.built.values()];
    this.clear();
    for (const entry of entries) this.add(entry.entity, entry.selected);
    return this.style;
  }

  /** Para el renglón de la línea de comandos: aplica y devuelve la ETIQUETA. */
  applyVisualStyle(style: CadVisualStyleId): string {
    return cadVisualStyle(this.setStyle(style)).label;
  }

  /**
   * Reconcilia contra el documento: crea lo que falta, reconstruye lo que
   * cambió (por identidad de referencia — las mutaciones canónicas no clonan
   * lo que no tocan) y libera lo que ya no está.
   */
  sync(document: CadDocument, selectedIds: ReadonlySet<string>): void {
    const wanted = new Map<string, CadSolid3dEntity>();
    for (const entity of document.entities)
      if (entity.type === "solid3d") wanted.set(entity.id, entity);
    for (const [id, entry] of [...this.built]) {
      const next = wanted.get(id);
      const selected = selectedIds.has(id);
      if (next && next === entry.entity && selected === entry.selected) {
        wanted.delete(id);
        continue;
      }
      disposeCadSolidObject(entry.object);
      this.built.delete(id);
      if (!next) wanted.delete(id);
    }
    for (const [id, entity] of wanted) this.add(entity, selectedIds.has(id));
  }

  private add(entity: CadSolid3dEntity, selected: boolean): void {
    const object = buildCadSolidObject(entity, this.viewport(), {
      style: this.style,
      selected,
    });
    this.group.add(object);
    this.built.set(entity.id, { entity, selected, object });
  }

  private clear(): void {
    for (const entry of this.built.values()) disposeCadSolidObject(entry.object);
    this.built.clear();
  }

  get count(): number {
    return this.built.size;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
