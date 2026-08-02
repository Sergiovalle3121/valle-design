"use client";

/**
 * ThemeProvider de Valle Design — adaptación del origen.
 *
 * Conserva EXACTAMENTE la superficie que consume el workbench CAD extraído
 * (`useTheme` → { colorScheme, resolvedScheme, setColorScheme, toggleTheme }
 * y el tipo `ColorScheme`), la clave de persistencia `axos_theme` y la clase
 * `.dark` en <html> como única fuente de verdad de las utilidades `dark:`.
 *
 * DIFERENCIA DELIBERADA con el origen: sin branding por tenant vía
 * `/tenant/branding` (la API de Design no lo expone); las variables de marca
 * CSS se fijan a los defaults del sistema de diseño.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/** Preferencia de apariencia elegida por el usuario. */
export type ColorScheme = "light" | "dark" | "system";
/** Esquema efectivamente aplicado (tras resolver "system"). */
export type ResolvedScheme = "light" | "dark";

type ThemeContextValue = {
  /** Preferencia cruda: light | dark | system. */
  colorScheme: ColorScheme;
  /** Esquema aplicado (system ya resuelto a light/dark). */
  resolvedScheme: ResolvedScheme;
  /** Fija la preferencia (persiste en localStorage). */
  setColorScheme: (next: ColorScheme) => void;
  /** Alterna claro ↔ oscuro de forma explícita (ignora "system"). */
  toggleTheme: () => void;
};

/** Clave de persistencia del origen (compartida con el script anti-flash). */
const THEME_STORAGE_KEY = "axos_theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStoredScheme(): ColorScheme {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* almacenamiento no disponible */
  }
  return "system";
}

function resolveScheme(scheme: ColorScheme): ResolvedScheme {
  if (scheme === "system") return systemPrefersDark() ? "dark" : "light";
  return scheme;
}

/** Aplica/retira la clase `.dark` en <html>. */
function applyResolvedScheme(resolved: ResolvedScheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorScheme, setColorSchemeState] =
    useState<ColorScheme>(readStoredScheme);
  const [resolvedScheme, setResolvedScheme] = useState<ResolvedScheme>(() =>
    resolveScheme(readStoredScheme()),
  );

  const setColorScheme = useCallback((next: ColorScheme) => {
    setColorSchemeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* persistencia best-effort */
    }
    const resolved = resolveScheme(next);
    setResolvedScheme(resolved);
    applyResolvedScheme(resolved);
  }, []);

  const toggleTheme = useCallback(() => {
    setColorScheme(resolvedScheme === "dark" ? "light" : "dark");
  }, [resolvedScheme, setColorScheme]);

  // Sincroniza el DOM al montar y cuando cambia la preferencia (idempotente).
  useEffect(() => {
    applyResolvedScheme(resolveScheme(colorScheme));
  }, [colorScheme]);

  // En modo "system", reacciona a los cambios del SO en vivo.
  useEffect(() => {
    if (colorScheme !== "system") return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved: ResolvedScheme = mq.matches ? "dark" : "light";
      setResolvedScheme(resolved);
      applyResolvedScheme(resolved);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [colorScheme]);

  const value = useMemo(
    () => ({ colorScheme, resolvedScheme, setColorScheme, toggleTheme }),
    [colorScheme, resolvedScheme, setColorScheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
