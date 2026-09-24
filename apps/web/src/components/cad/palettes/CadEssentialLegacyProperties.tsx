"use client";

import { CadHumanProperties } from "./CadHumanProperties";
import type { CadHumanPropertyModel } from "./human-property-model";

/** Snapshot de la selección histórica; sus medidas no son las del espacio entre muros. */
export interface CadLegacySelectionSnapshot {
  type: "station" | "asset";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  title: string;
  subtitle: string;
  kind?: string;
  /** Etiqueta escrita por el autor, sin el nombre genérico del catálogo. */
  label?: string;
  height?: number;
  canDuplicate: boolean;
}

function readableName(value: string | undefined, id: string): string | null {
  const name = value?.trim();
  if (
    !name ||
    name === id ||
    /^cad_[a-z\d_-]+$/i.test(name) ||
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(name)
  )
    return null;
  return name;
}

/** La selección heredada conserva edición técnica en Pro; Esencial sólo muestra datos fiables. */
export function CadEssentialLegacyProperties({
  count,
  snapshot,
}: {
  count: number;
  snapshot: CadLegacySelectionSnapshot | null;
}) {
  const name =
    snapshot &&
    readableName(
      snapshot.type === "asset" ? snapshot.label : snapshot.title,
      snapshot.id,
    );
  const heading =
    count > 1
      ? `${count} objetos seleccionados`
      : snapshot?.kind === "room"
        ? "Cuarto seleccionado"
        : snapshot?.kind === "wall"
          ? "Muro seleccionado"
          : snapshot?.type === "station"
            ? "Punto seleccionado"
            : "Objeto seleccionado";
  const model: CadHumanPropertyModel = {
    heading,
    fields:
      count === 1 && name
        ? [{ key: "name", label: "Nombre", value: name }]
        : [],
  };
  return (
    <div data-testid="cad-essential-legacy-properties" className="p-3.5">
      <CadHumanProperties model={model} />
    </div>
  );
}
