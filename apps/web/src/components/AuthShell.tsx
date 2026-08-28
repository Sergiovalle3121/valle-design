import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { PlanDrawing } from "@/components/brand/PlanDrawing";
import { TrustSeals } from "@/components/marketing/TrustSeals";
import { COMMERCIAL_LINKS } from "@/config/commercial";

/**
 * LA PANTALLA DONDE EL CLIENTE ENTREGA SUS DATOS.
 *
 * ── EL ENCARGO ──────────────────────────────────────────────────────────────
 * «Que la creación de cuenta sea lo más segura Y lo más bella posible, porque
 * ahí van los datos de sus clientes». Las dos mitades tiran en la misma
 * dirección más de lo que parece: una pantalla de alta que se ve improvisada
 * hace dudar de todo lo que hay detrás, y el visitante que duda no teclea su
 * correo — no porque haya evaluado la criptografía, sino porque el cuidado
 * visible es la única señal de cuidado que puede ver desde fuera.
 *
 * ── LA COMPOSICIÓN ──────────────────────────────────────────────────────────
 * Pantalla partida en escritorio: el formulario a la izquierda y el PRODUCTO a
 * la derecha —el plano dibujándose solo, con los sellos de confianza debajo—.
 * La mitad derecha no es decoración: responde a las dos preguntas que se hace
 * quien está a punto de registrarse («¿qué es esto exactamente?» y «¿puedo
 * fiarme?») justo mientras las está pensando, en vez de obligarle a volver a la
 * portada a buscarlas.
 *
 * En móvil desaparece entera. Un panel decorativo que en un teléfono empuja el
 * formulario por debajo del pliegue convierte una ayuda en un obstáculo; el
 * formulario es lo único que importa en 390 puntos de ancho, y ahí se queda
 * solo, centrado y sin competencia.
 *
 * ── EL CONTRATO QUE NO SE TOCA ──────────────────────────────────────────────
 * Cuatro cosas de las que dependen las pruebas de navegador y la accesibilidad,
 * y que sobreviven al rediseño exactamente igual:
 *
 *   · `id="contenido"` en `<main>` — es el destino del enlace de salto.
 *   · `error` → `role="alert"`; `message` → `role="status"`.
 *   · UNA sola región `role="status"` por pantalla. Las suites de navegador
 *     consultan `getByRole("status")` en modo estricto, así que una segunda
 *     región viva en la misma vista las rompe. Por eso el medidor de fortaleza
 *     de `PasswordField` se enlaza con `aria-describedby` en vez de anunciarse
 *     como región propia.
 *   · `titleId` sigue gobernando `aria-labelledby`.
 */

export function AuthShell({
  title,
  description,
  children,
  error,
  message,
  footer,
  titleId = "auth-title",
  /**
   * El panel del producto. Se apaga en las pantallas que NO son el embudo de
   * alta —verificar un correo, recuperar una contraseña— porque ahí el
   * visitante ya decidió: llega desde un enlace con una tarea concreta, y
   * ponerle argumentos de venta al lado es ruido.
   */
  showcase = false,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  error?: string | null;
  message?: ReactNode | null;
  footer?: ReactNode;
  titleId?: string;
  showcase?: boolean;
}) {
  return (
    <main
      id="contenido"
      className="relative grid min-h-screen place-items-center px-5 py-10"
    >
      {/*
        El fondo del embudo: retícula de plano sobre el sustrato del tema, con
        la veladura de ambiente encima. Todo decorativo, todo detrás, y nada
        captura el puntero — un fondo que intercepta un clic en la pantalla de
        alta es un alta perdida.
      */}
      <div aria-hidden="true" className="aurora-bg fixed inset-0 -z-10" />
      <div
        aria-hidden="true"
        className="blueprint-grid pointer-events-none fixed inset-0 -z-10 opacity-50 dark:opacity-40"
        style={{
          maskImage:
            "radial-gradient(120% 90% at 50% 0%, black 20%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(120% 90% at 50% 0%, black 20%, transparent 78%)",
        }}
      />

      <div
        className={
          showcase
            ? "grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
            : "w-full max-w-md"
        }
      >
        <section
          aria-labelledby={titleId}
          className="corner-marks w-full rounded-surface border border-border bg-card p-6 shadow-floating sm:p-9"
        >
          <Link href="/" className="inline-flex">
            <Logo />
          </Link>
          <h1 id={titleId} className="type-title mt-8 text-foreground">
            {title}
          </h1>
          <p className="type-small mt-2 text-muted-foreground">{description}</p>
          {children}
          {error ? (
            <p role="alert" className="type-small mt-4 text-danger-ink">
              {error}
            </p>
          ) : null}
          {message ? (
            <div role="status" className="type-small mt-4 text-success-ink">
              {message}
            </div>
          ) : null}
          {footer}
          <p className="type-caption mt-5 text-center text-muted-foreground">
            ¿Necesitas ayuda?{" "}
            <a
              className="underline underline-offset-4 hover:text-foreground"
              href={COMMERCIAL_LINKS.support}
            >
              Contacta con soporte
            </a>
            .
          </p>
        </section>

        {showcase ? (
          // `hidden lg:block`: en móvil no existe, ni siquiera para el lector de
          // pantalla, porque su contenido está también en la portada y repetirlo
          // aquí alargaría el recorrido hasta el campo de correo.
          <aside className="hidden lg:block">
            <p className="type-eyebrow flex items-center gap-3 text-primary-ink">
              <span className="type-sheet-number opacity-60">00</span>
              Lo que vas a abrir
            </p>
            <div className="mt-5 overflow-hidden rounded-surface border border-border bg-background p-6">
              <PlanDrawing className="h-auto w-full" title={null} />
            </div>
            <TrustSeals className="mt-8" />
          </aside>
        ) : null}
      </div>
    </main>
  );
}
