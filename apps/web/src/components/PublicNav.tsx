"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PRICING_PATH } from "@/config/site-routes";
import { buttonClass, cx, focusRing, motionBase } from "@/components/ui";

/**
 * LA NAVEGACIÓN PÚBLICA.
 *
 * Lo que había: texto plano sin fondo, sin `sticky`, y en móvil los cuatro
 * enlaces se partían en dos renglones con el logotipo descolgado encima. En
 * cuanto alguien bajaba media pantalla, la única salida hacia «Crear cuenta»
 * desaparecía — que es exactamente el momento en que un visitante convencido
 * quiere pulsarla.
 *
 * `sticky` con VIDRIO AL DESPLAZAR, no siempre. Una barra con blur permanente
 * pone una lámina turbia sobre el hero desde el primer píxel; aquí la barra es
 * transparente arriba y se materializa al bajar 8 px. El resultado: el hero
 * respira y la barra sólo existe cuando hace falta.
 *
 * El menú de móvil es un menú de verdad —panel a pantalla completa, Escape
 * cierra, scroll bloqueado— y no cuatro enlaces envueltos en dos renglones.
 */

const LINKS: ReadonlyArray<[label: string, href: string]> = [
  ["Precios", PRICING_PATH],
  ["Guías", "/docs"],
];

export function PublicNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    // `passive: true` porque este oyente NUNCA llama a preventDefault: se lo
    // dice al navegador para que no tenga que esperar al manejador antes de
    // desplazar. Sin él, el scroll de la portada se siente pegajoso en móvil.
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <header
      data-testid="public-nav"
      className={cx(
        "sticky top-0 z-50 w-full",
        motionBase,
        scrolled
          ? "border-b border-border bg-background/80 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent",
      )}
    >
      <nav
        aria-label="Navegación principal"
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8"
      >
        <Link href="/" className={cx("inline-flex rounded-control", focusRing)}>
          <Logo />
        </Link>

        {/* ── Escritorio ────────────────────────────────────────────────── */}
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className={buttonClass({ variant: "ghost" })}
            >
              {label}
            </Link>
          ))}
          <Link href="/login" className={buttonClass({ variant: "ghost" })}>
            Iniciar sesión
          </Link>
          <ThemeToggle className="ml-2" />
          <Link
            href="/register"
            className={cx(buttonClass({ variant: "primary" }), "ml-1")}
          >
            Crear cuenta
          </Link>
        </div>

        {/* ── Móvil ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="menu-movil"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            data-testid="public-nav-toggle"
            className={cx(
              "grid h-11 w-11 place-items-center rounded-control border border-border bg-card text-foreground",
              motionBase,
              focusRing,
            )}
          >
            {open ? (
              <X aria-hidden="true" className="h-5 w-5" />
            ) : (
              <Menu aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
        </div>
      </nav>

      {open ? (
        <div
          id="menu-movil"
          data-testid="public-nav-menu"
          className="border-t border-border bg-background px-5 pb-6 pt-3 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {[...LINKS, ["Iniciar sesión", "/login"] as const].map(
              ([label, href]) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cx(
                      buttonClass({ variant: "ghost", size: "lg" }),
                      "w-full justify-start",
                    )}
                  >
                    {label}
                  </Link>
                </li>
              ),
            )}
          </ul>
          <Link
            href="/register"
            onClick={() => setOpen(false)}
            className={cx(
              buttonClass({ variant: "primary", size: "lg", fullWidth: true }),
              "mt-3",
            )}
          >
            Crear cuenta gratis
          </Link>
        </div>
      ) : null}
    </header>
  );
}
