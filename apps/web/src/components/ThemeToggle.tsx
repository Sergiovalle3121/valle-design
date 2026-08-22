"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ColorScheme } from "@/contexts/ThemeContext";
import { cx, focusRing, motionBase } from "@/components/ui";

/**
 * CONMUTADOR DE TEMA — global, no escondido en el estudio.
 *
 * El único de toda la aplicación vivía dentro de `CadWorkspaceDock`, es decir:
 * había que crear una cuenta, verificarla, crear una organización, un proyecto y
 * un documento, entrar al editor y abrir un muelle de preferencias para poder
 * cambiar el tema. En la portada, en el login y en el tablero no había forma.
 * El sistema entero está construido en dos temas; enseñar sólo uno es tirar la
 * mitad del trabajo.
 *
 * TRES ESTADOS, NO DOS. «Sistema» es un estado de pleno derecho y no el hueco
 * entre los otros dos: quien tiene el equipo en modo noche automático quiere que
 * la web lo siga, y un conmutador binario le obliga a elegir uno de los dos
 * bandos para siempre.
 *
 * SIN PARPADEO. Hasta que el componente monta en el cliente no se sabe qué
 * eligió el usuario —el servidor no lee `localStorage`—, así que se pinta el
 * armazón con los tres botones y sin ninguno marcado. Marcar uno «por defecto»
 * y corregirlo al hidratar produce el salto de estado que se ve como un error.
 */

const OPTIONS: ReadonlyArray<{
  value: ColorScheme;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: "light", label: "Tema claro", Icon: Sun },
  { value: "dark", label: "Tema oscuro", Icon: Moon },
  { value: "system", label: "Seguir al sistema", Icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { colorScheme, setColorScheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      role="group"
      aria-label="Apariencia"
      data-testid="theme-toggle"
      className={cx(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && colorScheme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setColorScheme(value)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={cx(
              "grid h-8 w-8 place-items-center rounded-full",
              motionBase,
              focusRing,
              active
                ? "bg-brand-strong text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
