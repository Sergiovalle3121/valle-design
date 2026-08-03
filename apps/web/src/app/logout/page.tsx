"use client";

import { useEffect } from "react";
import { useDesignAuth } from "@/contexts/DesignAuthContext";

export default function LogoutPage() {
  const { logout } = useDesignAuth();

  useEffect(() => {
    void logout().finally(() => window.location.assign("/login"));
  }, [logout]);

  return (
    <main className="grid min-h-screen place-items-center p-8">
      <p role="status">Cerrando sesiÃ³nâ€¦</p>
    </main>
  );
}
