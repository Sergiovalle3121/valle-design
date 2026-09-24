"use client";

import { Building2, FilePlus2, House, Store } from "lucide-react";
import { Button } from "@/components/ui";
import { FIRST_DRAWINGS, type FirstDrawingId } from "./first-drawing";

const ICONS = { house: House, apartment: Building2, shop: Store, blank: FilePlus2 } as const;

export function FirstDrawingChoice({ busy, onChoose }: {
  busy: boolean;
  onChoose: (id: FirstDrawingId) => void;
}) {
  return (
    <>
      <h2 id="primer-dibujo" className="type-title">¿Qué vas a dibujar?</h2>
      <p className="type-lead mt-3 text-muted-foreground">
        Elige un punto de partida. Podrás cambiar todo dentro del editor.
      </p>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FIRST_DRAWINGS.map((choice) => {
          const Icon = ICONS[choice.id];
          return (
            <Button
              key={choice.id}
              variant="secondary"
              size="lg"
              disabled={busy}
              onClick={() => onChoose(choice.id)}
              data-testid={`first-drawing-${choice.id}`}
              className="min-h-44 h-auto flex-col items-start justify-start gap-3 whitespace-normal rounded-card border border-border bg-card p-5 text-left hover:border-primary/60 hover:shadow-elevated"
            >
              <Icon aria-hidden="true" className="h-7 w-7 text-primary-ink" />
              <span className="type-heading block w-full">{choice.label}</span>
              <span className="type-small block w-full text-muted-foreground">{choice.detail}</span>
            </Button>
          );
        })}
      </div>
    </>
  );
}
