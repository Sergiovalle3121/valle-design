"use client";

/**
 * Landing mínima del producto Valle Design: identidad + entrada al estudio.
 * El login real vive en VALLE Platform (`NEXT_PUBLIC_PLATFORM_LOGIN_URL`);
 * aquí sólo se refleja el estado de la sesión y se ofrece la redirección.
 */

import Link from "next/link";
import { ArrowRight, DraftingCompass, LogIn, LogOut } from "lucide-react";
import { glass } from "@/lib/glass";
import { BRAND, PRODUCT_LABEL } from "@/config/brand";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { useToast } from "@/contexts/ToastContext";

export default function LandingPage() {
  const { isAuthenticated, isLoading, user, login, logout } = useDesignAuth();
  const toast = useToast();

  const onLogin = () => {
    if (!login()) {
      toast.error(
        "Configura NEXT_PUBLIC_PLATFORM_LOGIN_URL para iniciar sesión con VALLE Platform.",
        "Sesión",
      );
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-16 text-foreground">
      <div className={`${glass} w-full max-w-xl rounded-[24px] p-8`}>
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-500/15 text-cyan-500">
            <DraftingCompass className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold leading-tight">
              {PRODUCT_LABEL.design}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {BRAND.tagline.es}
            </p>
          </div>
        </div>

        <p className="mt-6 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          CAD universal 2D/3D: dibujo de precisión, capas y bloques
          profesionales, planos DXF de fondo, hojas de publicación vectorial y
          copiloto de dibujo. Tus documentos viven en tu cuenta de{" "}
          {BRAND.brandName} Platform.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-primary-strong,#4f46e5)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Abrir mis proyectos <ArrowRight className="h-4 w-4" />
          </Link>
          {!isLoading && !isAuthenticated && (
            <button
              onClick={onLogin}
              className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-4 py-2.5 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              <LogIn className="h-4 w-4" /> Iniciar sesión con Platform
            </button>
          )}
          {!isLoading && isAuthenticated && user && (
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-4 py-2.5 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              title={user.email}
            >
              <LogOut className="h-4 w-4" /> Cerrar sesión ({user.email})
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {BRAND.copyright}
      </p>
    </main>
  );
}
