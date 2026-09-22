"use client";

import { useState, type ComponentProps } from "react";
import { Magnet } from "lucide-react";
import { useCadUiMode } from "@/components/cad/shell/ui-mode-host";
import { CadDraftStatusBar } from "./CadDraftStatusBar";

/**
 * LAS AYUDAS DE DIBUJO, DETRÁS DE UN SOLO CONTROL EN EL MODO ESENCIAL.
 *
 * En Pro esto es exactamente `<CadDraftStatusBar>` (OSNAP / ORTO / POLAR /
 * OTRACK / rejilla / ajustes / estilos, con sus testids `cad-draft-status-*`
 * intactos). En Esencial la fila de estado enseña un único botón, «Ayudas de
 * dibujo», y la barra completa sólo aparece al desplegarlo: quien empieza no
 * necesita seis conmutadores a la vista para dibujar una habitación; quien los
 * conoce los tiene a un clic, con los mismos testids y los mismos atajos
 * (F3, F8, F10, F11 siguen funcionando aunque el botón esté plegado).
 *
 * Tanda 1 del encargo del 22-sep-2026: «barra de estado mínima: coordenadas,
 * escala y guardado; las ayudas quedan detrás de un solo control».
 */
export function CadDraftAidsDisclosure(props: ComponentProps<typeof CadDraftStatusBar>) {
  const mode = useCadUiMode();
  const [open, setOpen] = useState(false);
  if (mode !== "esencial") return <CadDraftStatusBar {...props} />;
  return (
    <span className="inline-flex h-full items-center gap-1.5">
      <button
        type="button"
        data-testid="cad-draft-aids-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title="Ayudas de dibujo: referencias a objetos, orto, polar y rejilla"
        className="inline-flex h-full items-center gap-1 rounded-sm px-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Magnet aria-hidden="true" className="h-3.5 w-3.5" />
        Ayudas de dibujo
      </button>
      {open ? <CadDraftStatusBar {...props} /> : null}
    </span>
  );
}
