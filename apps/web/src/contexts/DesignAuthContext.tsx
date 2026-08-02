"use client";

/**
 * DesignAuthProvider — identidad de Valle Design (adaptación mínima del
 * AuthContext del origen).
 *
 * La identidad ES el bearer JWT de Platform (ver `src/lib/session.ts`):
 * - Al montar, adopta el handoff de Platform si viene en la URL
 *   (`#access_token=…`) y, si no, lee/valida el token almacenado.
 * - `login()` abre la ruta de acceso de Design.
 * - `logout()` borra la sesión local.
 *
 * Sin WorkspaceContext enterprise: el alcance de trabajo en Design es el
 * proyecto CAD y lo decide la página que monta el estudio.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  adoptSessionFromUrl,
  clearSession,
  platformLoginUrl,
  readSession,
  type DesignSession,
} from "@/lib/session";

interface DesignAuthValue {
  session: DesignSession | null;
  user: { id: string; email: string } | null;
  tenantId: string | null;
  role: string | null;
  permissions: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Abre la ruta de acceso. */
  login: () => boolean;
  logout: () => void;
}

const DesignAuthContext = createContext<DesignAuthValue | null>(null);

export function DesignAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<DesignSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Primero el handoff de Platform (si venimos del login), luego el storage.
    const adopted = adoptSessionFromUrl();
    setSession(adopted ?? readSession());
    setIsLoading(false);
  }, []);

  const login = useCallback((): boolean => {
    const url = platformLoginUrl();
    if (!url) return false;
    window.location.assign(url);
    return true;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo<DesignAuthValue>(
    () => ({
      session,
      user: session ? { id: session.userId, email: session.email } : null,
      tenantId: session?.tenantId ?? null,
      role: session?.role ?? null,
      permissions: session?.permissions ?? [],
      isLoading,
      isAuthenticated: !!session,
      login,
      logout,
    }),
    [session, isLoading, login, logout],
  );

  return (
    <DesignAuthContext.Provider value={value}>
      {children}
    </DesignAuthContext.Provider>
  );
}

export function useDesignAuth(): DesignAuthValue {
  const context = useContext(DesignAuthContext);
  if (!context) {
    throw new Error("useDesignAuth must be used inside DesignAuthProvider");
  }
  return context;
}
