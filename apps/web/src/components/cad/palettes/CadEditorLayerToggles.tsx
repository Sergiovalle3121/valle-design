"use client";

/**
 * Capas del EDITOR — no las del documento.
 *
 * Ocho interruptores de visibilidad que pertenecen a la vista y no al dibujo:
 * estaciones, biblioteca, conexiones, cotas, notas, etiquetas, plano DXF y
 * rejilla. No son `CadLayerDef`, no se guardan y no salen en DXF; conviven en
 * el mismo menú que el gestor de capas del documento y por eso se confunden.
 * Separarlos en su propio componente hace evidente cuál es cuál.
 *
 * Presentacional puro y memoizado.
 */
import React from "react";

export interface CadEditorLayerToggleState {
  stations: boolean;
  equipment: boolean;
  connectors: boolean;
  dims: boolean;
  notes: boolean;
  labels: boolean;
  grid: boolean;
  dxf: boolean;
}

export type CadEditorLayerKey = keyof CadEditorLayerToggleState;

export interface CadEditorLayerTogglesProps {
  layers: CadEditorLayerToggleState;
  /** «Estaciones» en el producto industrial, «Puntos» en el autónomo. */
  stationsLabel: string;
  onToggle: (key: CadEditorLayerKey, value: boolean) => void;
}

const ORDER: ReadonlyArray<[CadEditorLayerKey, string]> = [
  ["stations", ""],
  ["equipment", "Biblioteca"],
  ["connectors", "Conexiones"],
  ["dims", "Cotas"],
  ["notes", "Notas"],
  ["labels", "Etiquetas"],
  ["dxf", "Plano DXF"],
  ["grid", "Grilla"],
];

export const CadEditorLayerToggles = React.memo(function CadEditorLayerToggles({
  layers,
  stationsLabel,
  onToggle,
}: CadEditorLayerTogglesProps) {
  return (
    <div data-testid="cad-editor-layer-toggles">
      <div className="mb-1.5 type-micro uppercase tracking-wide text-muted-foreground">
        Capas
      </div>
      {ORDER.map(([key, label]) => (
        <label
          key={key}
          className="flex cursor-pointer items-center gap-2 py-1 text-foreground hover:text-foreground"
        >
          <input
            type="checkbox"
            data-testid={`cad-editor-layer-${key}`}
            checked={layers[key]}
            onChange={(event) => onToggle(key, event.target.checked)}
            className="accent-indigo-500"
          />
          {key === "stations" ? stationsLabel : label}
        </label>
      ))}
    </div>
  );
});
