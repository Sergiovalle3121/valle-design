import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ProductFrame } from "@/components/marketing/ProductFrame";
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
 * la derecha —una captura real del editor, con información de acceso debajo—.
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
  hint,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  error?: string | null;
  message?: ReactNode | null;
  footer?: ReactNode;
  titleId?: string;
  showcase?: boolean;
  hint?: ReactNode;
}) {
  return (
    <main
      id="contenido"
      className="relative grid min-h-screen place-items-center px-5 py-10"
    >
      <div
        className={
          showcase
            ? "grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
            : "w-full max-w-md"
        }
      >
        <section
          aria-labelledby={titleId}
          className="w-full rounded-surface border border-border bg-card p-6 sm:p-9"
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
          {hint ? (
            <p className="type-small mt-2 text-muted-foreground">{hint}</p>
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
            <p className="type-eyebrow text-primary-ink">
              Tu espacio de dibujo
            </p>
            <ProductFrame
              src="/product/estudio-esencial-dark.png"
              alt="Planta de ejemplo abierta en el editor de ValleCAD"
              caption="Dibuja, guarda y prepara tus entregables en un mismo espacio."
              float={false}
              halo={false}
              sizes="(min-width: 1024px) 35rem, 100vw"
              className="mt-5"
            />
            <TrustSeals className="mt-8" />
          </aside>
        ) : null}
      </div>
    </main>
  );
}
