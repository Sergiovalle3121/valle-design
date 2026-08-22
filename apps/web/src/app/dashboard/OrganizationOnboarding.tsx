"use client";

import { useState } from "react";
import { ArrowRight, Building2, LogOut, User } from "lucide-react";
import type { OrganizationList } from "@valle/design-sdk";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button, Input, Surface, cx } from "@/components/ui";
import {
  isValidOrganizationSlug,
  organizationSlugFromName,
  ORGANIZATION_SLUG_LIMITS,
  personalOrganizationName,
} from "@/lib/organization-slug";

type OrganizationItem = OrganizationList["items"][number];

/**
 * EL PRIMER ACCESO — sin jerga.
 *
 * Lo que había: dos campos obligatorios, «Nombre» e «Identificador», el segundo
 * con `pattern="[a-z0-9]+(?:-[a-z0-9]+)*"`. A un arquitecto que acaba de
 * verificar su correo se le pedía teclear un slug conforme a una expresión
 * regular; si repetía lo que había escrito arriba, el formulario lo rechazaba
 * sin explicar nada. Y no había forma de decir «trabajo solo»: había que
 * inventarse un nombre de despacho igualmente.
 *
 * Ahora hay DOS caminos y ninguno pide jerga:
 *
 *   1. «Trabajo por mi cuenta» — un botón. Crea la organización personal con el
 *      nombre derivado del correo, que es el único dato que el usuario ya dio.
 *      Cero preguntas, cero campos.
 *   2. «Tengo un despacho» — UN campo, el nombre. El identificador se deriva y
 *      se ENSEÑA (no se esconde: quien vaya a compartir enlaces querrá saber
 *      cuál es), y se edita sólo si alguien pulsa «personalizar».
 *
 * Se extrajo del `page.tsx` del tablero en vez de crecer dentro: eran 120
 * líneas de formulario dentro de un archivo de 712 que ya hacía otras seis
 * cosas.
 */
export function OrganizationOnboarding({
  organizations,
  email,
  busy,
  error,
  onCreate,
  onActivate,
  onLogout,
}: {
  organizations: OrganizationItem[];
  /** Correo de la sesión: de él sale el nombre de la organización personal. */
  email: string | undefined;
  busy: boolean;
  error: string | null;
  onCreate: (input: { name: string; slug: string }) => void;
  onActivate: (organizationId: string) => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState("");
  const [customSlug, setCustomSlug] = useState<string | null>(null);

  // El identificador SIGUE al nombre mientras nadie lo toque. En cuanto alguien
  // pulsa «personalizar», deja de seguirlo: si siguiera, cada letra del nombre
  // pisaría lo que la persona acaba de escribir a mano.
  const derived = organizationSlugFromName(name);
  const slug = customSlug ?? derived;
  const slugOk = isValidOrganizationSlug(slug);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim() || !slugOk) return;
    onCreate({ name: name.trim(), slug });
  };

  const workAlone = () => {
    if (busy) return;
    const personal = personalOrganizationName(email);
    onCreate({ name: personal, slug: organizationSlugFromName(personal) });
  };

  return (
    <main
      id="contenido"
      className="relative mx-auto min-h-screen w-full max-w-3xl px-5 py-10 sm:px-8"
    >
      <div aria-hidden="true" className="aurora-bg fixed inset-0 -z-10" />

      <header className="flex items-center justify-between gap-4">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" onClick={onLogout} iconLeft={<LogOut className="h-4 w-4" />}>
            Cerrar sesión
          </Button>
        </div>
      </header>

      <div className="mt-14">
        <p className="type-eyebrow text-primary-ink">Primer acceso</p>
        <h1 className="type-title mt-3">¿Dónde van a vivir tus planos?</h1>
        <p className="type-lead mt-4 max-w-xl text-muted-foreground">
          Tus documentos se guardan dentro de una organización: es lo que aísla
          tu trabajo del de cualquier otro despacho y lo que decide con quién se
          comparte. Puedes cambiar el nombre después.
        </p>
      </div>

      {organizations.length > 0 && (
        <section className="mt-10" aria-labelledby="orgs-disponibles">
          <h2 id="orgs-disponibles" className="type-heading">
            Organizaciones a las que perteneces
          </h2>
          <div className="mt-4 grid gap-2">
            {organizations.map((organization) => (
              <button
                key={organization.id}
                type="button"
                disabled={busy}
                onClick={() => onActivate(organization.id)}
                data-testid={`organization-open-${organization.slug}`}
                className={cx(
                  "flex items-center justify-between gap-4 rounded-card border border-border bg-card px-5 py-4 text-left",
                  "transition-[border-color,box-shadow] duration-200 ease-out-expo",
                  "hover:border-primary/50 hover:shadow-elevated",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "disabled:pointer-events-none disabled:opacity-60",
                )}
              >
                <span className="min-w-0">
                  <strong className="type-small block font-semibold text-foreground">
                    {organization.name}
                  </strong>
                  <span className="type-mono type-caption text-muted-foreground">
                    {organization.slug} · {organization.role}
                  </span>
                </span>
                <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-ink" />
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 grid gap-5 md:grid-cols-2 md:items-start">
        {/* ── Camino 1: sin preguntas ─────────────────────────────────────── */}
        <Surface className="flex h-full flex-col" padded>
          <User aria-hidden="true" className="h-7 w-7 text-primary-ink" />
          <h2 className="type-heading mt-4">Trabajo por mi cuenta</h2>
          <p className="type-small mt-2 text-muted-foreground">
            Creamos tu espacio personal con tu nombre y entras a dibujar. Sin
            más preguntas, y puedes renombrarlo cuando quieras.
          </p>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-auto pt-0"
            onClick={workAlone}
            loading={busy}
            data-testid="organization-solo"
            iconRight={<ArrowRight className="h-4 w-4" />}
          >
            Empezar a dibujar
          </Button>
        </Surface>

        {/* ── Camino 2: un solo campo ─────────────────────────────────────── */}
        <Surface as="form" onSubmit={submit} className="flex h-full flex-col" padded>
          <Building2 aria-hidden="true" className="h-7 w-7 text-primary-ink" />
          <h2 className="type-heading mt-4">Tengo un despacho</h2>
          <p className="type-small mt-2 text-muted-foreground">
            El nombre con el que tu equipo lo reconoce. Es lo único que
            necesitamos.
          </p>

          <Input
            label="Nombre del despacho"
            id="organization-name"
            name="organizationName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={160}
            required
            autoComplete="organization"
            placeholder="Estudio Valle"
            wrapperClassName="mt-5"
            hint={
              derived || customSlug ? (
                <SlugHint
                  slug={slug}
                  editing={customSlug !== null}
                  onEdit={() => setCustomSlug(derived)}
                />
              ) : (
                "El identificador se genera solo a partir del nombre."
              )
            }
          />

          {customSlug !== null && (
            <Input
              label="Identificador"
              id="organization-slug"
              name="organizationSlug"
              mono
              value={customSlug}
              onChange={(event) =>
                setCustomSlug(event.target.value.toLowerCase())
              }
              minLength={ORGANIZATION_SLUG_LIMITS.min}
              maxLength={ORGANIZATION_SLUG_LIMITS.max}
              wrapperClassName="mt-4"
              error={
                customSlug && !slugOk
                  ? "Sólo minúsculas, cifras y guiones, y sin empezar ni terminar en guion."
                  : null
              }
              hint="Aparece en los enlaces que compartes. Cámbialo sólo si lo necesitas."
            />
          )}

          <Button
            type="submit"
            variant="secondary"
            size="lg"
            fullWidth
            className="mt-6"
            loading={busy}
            disabled={!name.trim() || !slugOk}
            data-testid="organization-create"
          >
            Crear organización
          </Button>
        </Surface>
      </div>

      {error && (
        <p role="alert" className="type-small mt-5 text-danger-ink">
          {error}
        </p>
      )}

      <p className="type-caption mt-8 text-muted-foreground">
        La primera organización recibe un periodo de prueba con acceso CAD; no
        se cobra nada desde esta pantalla.
      </p>
    </main>
  );
}

/**
 * El identificador derivado, visible pero no editable hasta que se pide.
 *
 * Enseñarlo importa: quien vaya a compartir un enlace de revisión querrá saber
 * qué aparece en él. Esconderlo del todo convierte un dato que el usuario verá
 * de todos modos en una sorpresa.
 */
function SlugHint({
  slug,
  editing,
  onEdit,
}: {
  slug: string;
  editing: boolean;
  onEdit: () => void;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>Identificador:</span>
      <span className="type-mono text-foreground">{slug || "—"}</span>
      {editing ? null : (
        <button
          type="button"
          onClick={onEdit}
          data-testid="organization-slug-customize"
          className="underline underline-offset-4 hover:text-foreground"
        >
          personalizar
        </button>
      )}
    </span>
  );
}
