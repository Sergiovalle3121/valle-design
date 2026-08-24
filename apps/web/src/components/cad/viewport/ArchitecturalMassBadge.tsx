"use client";

import type { RefObject } from "react";
import type { CadArchitecturalMassHost } from "./architectural-mass-host";

export interface CadArchitecturalMassBadgeProps {
  hostRef: RefObject<CadArchitecturalMassHost | null>;
}

export function CadArchitecturalMassBadge({
  hostRef,
}: CadArchitecturalMassBadgeProps) {
  const rooms = hostRef.current?.roomCount ?? 0;
  return (
    <span
      data-testid="cad-architectural-mass-count"
      data-rooms={rooms}
      data-roof={hostRef.current?.hasRoof ? "true" : "false"}
      title="Piso/cielorraso por habitación cerrada y techo, extruidos desde los muros"
    >
      Masa {rooms}
    </span>
  );
}
