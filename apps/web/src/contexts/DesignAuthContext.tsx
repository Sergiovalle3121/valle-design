"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { API_BASE, rawApiFetch } from "@/lib/apiFetch";
import { loginUrl, readSession, type DesignSession } from "@/lib/session";

interface DesignAuthValue {
  session: DesignSession | null;
  user: { id: string; email: string } | null;
  tenantId: string | null;
  organizationId: string | null;
  role: string | null;
  permissions: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const DesignAuthContext = createContext<DesignAuthValue | null>(null);

export function DesignAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<DesignSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setSession(await readSession());
  }, []);

  useEffect(() => {
    void refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  const login = useCallback((): boolean => {
    window.location.assign(loginUrl());
    return true;
  }, []);

  const logout = useCallback(async () => {
    try {
      await rawApiFetch(`${API_BASE}/v1/auth/logout`, { method: "POST" });
    } finally {
      setSession(null);
    }
  }, []);

  const value = useMemo<DesignAuthValue>(
    () => ({
      session,
      user: session ? { id: session.userId, email: session.email } : null,
      tenantId: session?.tenantId ?? null,
      organizationId: session?.organizationId ?? null,
      role: session?.role ?? null,
      permissions: session?.permissions ?? [],
      isLoading,
      isAuthenticated: !!session,
      login,
      logout,
      refresh,
    }),
    [session, isLoading, login, logout, refresh],
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
