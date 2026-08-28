"use client";

/**
 * ThemeProvider de Valle Design — adaptación del origen.
 *
 * Conserva EXACTAMENTE la superficie que consume el workbench CAD extraído
 * (`useTheme` → { colorScheme, resolvedScheme, setColorScheme, toggleTheme }
 * y el tipo `ColorScheme`), la clave de persistencia `valle_theme` y la clase
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

/** Clave de persistencia (compartida con el script anti-flash). */
const THEME_STORAGE_KEY = "valle_theme";
/**
 * Clave ANTERIOR, del nombre de producto que ya no se usa. Vive en el
 * navegador de quien ya visitó el producto: renombrar sin leerla le devolvería
 * el tema por defecto sin explicación. Se lee una vez, se migra y se borra.
 */
const LEGACY_THEME_STORAGE_KEY = "axos_theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * EL DEFAULT DEL PRODUCTO (campaña de firma propia, 2026-08-28).
 *
 * Antes, sin preferencia guardada, esto devolvía `"system"` y la app abría en
 * el tema del sistema operativo. Como la mayoría de los equipos vienen en
 * claro de fábrica, la primera impresión del producto acababa siendo la cara
 * que menos lo representa: un CAD se dibuja sobre fondo oscuro, ésa es la
 * convención del oficio, y el modo oscuro es donde esta paleta cuenta su
 * historia.
 *
 * `"system"` NO desaparece: sigue siendo una de las tres opciones y quien la
 * elige la ve respetada, incluidos los cambios del SO en vivo. Lo que cambia
 * es que ahora hay que PEDIRLA en vez de recibirla por silencio.
 *
 * El mismo default está escrito en el script anti-flash de `layout.tsx`. Son
 * dos sitios y no uno porque el script tiene que correr antes de que exista
 * React; si alguna vez divergen, el síntoma es un parpadeo de tema en la
 * primera carga.
 */
const DEFAULT_SCHEME: ColorScheme = "dark";

function readStoredScheme(): ColorScheme {
  if (typeof window === "undefined") return DEFAULT_SCHEME;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
    const legacy = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacy === "light" || legacy === "dark" || legacy === "system") {
      window.localStorage.setItem(THEME_STORAGE_KEY, legacy);
      window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
      return legacy;
    }
  } catch {
    /* almacenamiento no disponible */
  }
  return DEFAULT_SCHEME;
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
