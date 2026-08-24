/**
 * Panel selector de material arquitectónico (madera/concreto/ladrillo/vidrio/
 * pintura) para el activo seleccionado.
 *
 * Componente de props limpias — lista de materiales, selección actual,
 * callback — sin conocer THREE, el documento canónico ni el editor: no lee
 * `architectural-material-library.ts` por su cuenta, lo recibe. Mismo patrón
 * que `CadHatchPalette.tsx` y el resto de `palettes/`. Vive fuera de
 * `Layout3DEditor.tsx` a propósito: conectarlo (el `onSelect` que escribe
 * `Asset.materialId`) es cableado del monolito y queda para cuando se
 * extraiga ese punto de la paleta de propiedades del activo.
 */
import type { ArchitecturalMaterialDef } from "@/lib/cad/materials/architectural-material-library";

export interface CadMaterialPaletteProps {
  docked?: boolean;
  materials: ArchitecturalMaterialDef[];
  /** `undefined` = sin textura (color plano del arquetipo). */
  selectedMaterialId?: string;
  onSelect: (materialId: string | undefined) => void;
}

export function CadMaterialPalette({
  docked,
  materials,
  selectedMaterialId,
  onSelect,
}: CadMaterialPaletteProps) {
  const optionClass = (active: boolean) =>
    `flex items-center gap-2 rounded-control border px-2 py-1.5 text-left ${
      active
        ? "border-primary/30 bg-primary/15 text-primary-ink"
        : "border-border text-foreground hover:bg-muted/60"
    }`;

  return (
    <div
      data-testid="cad-material-palette"
      className={
        docked
          ? "w-full p-3 type-micro"
          : "absolute right-0 top-full z-50 mt-1.5 w-72 rounded-card border border-border bg-surface p-3 type-micro shadow-2xl"
      }
    >
      <div className="mb-2 type-micro font-semibold uppercase tracking-wide text-primary-ink">
        Material de acabado
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          data-testid="cad-material-option-none"
          onClick={() => onSelect(undefined)}
          className={optionClass(selectedMaterialId === undefined)}
        >
          <span
            aria-hidden
            className="h-4 w-4 shrink-0 rounded-full border border-border bg-surface"
          />
          Sin textura
        </button>
        {materials.map((material) => (
          <button
            type="button"
            key={material.id}
            data-testid={`cad-material-option-${material.id}`}
            title={material.label}
            onClick={() => onSelect(material.id)}
            className={optionClass(selectedMaterialId === material.id)}
          >
            <span
              aria-hidden
              className="h-4 w-4 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: material.color }}
            />
            <span className="truncate">{material.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
