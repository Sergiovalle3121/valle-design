import { useState } from "react";

/** Estado de visibilidad de la paleta HATCH, extraído del monolito. */
export function useHatchPalette() {
  const [showHatchPalette, setShowHatchPalette] = useState(false);
  return { showHatchPalette, setShowHatchPalette } as const;
}