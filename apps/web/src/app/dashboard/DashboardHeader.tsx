import { LogOut, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button, buttonClass } from "@/components/ui";
import { FeedbackButton } from "@/components/feedback/FeedbackDialog";
import { formatRegionDate } from "@/lib/cad/region";
import { getClientRegion } from "@/lib/cad/region/client";
import type {
  CommercialSubscriptionResponse,
  OrganizationList,
} from "@valle/design-sdk";

type OrganizationItem = OrganizationList["items"][number];

/**
 * La cabecera del tablero, aparte de `DashboardPage` sólo porque ésta
 * pasaba el presupuesto de 800 líneas — es puramente presentacional, sin
 * estado propio: todo lo que necesita llega por props.
 */
export function DashboardHeader({
  organizationName,
  tenantId,
  subscription,
  entitlements,
  organizations,
  organizationId,
  busy,
  onActivateOrganization,
  onLogout,
}: {
  organizationName: string | null;
  tenantId: string | null;
  subscription: CommercialSubscriptionResponse["subscription"];
  entitlements: string[];
  organizations: OrganizationItem[];
  organizationId: string | null;
  busy: boolean;
  onActivateOrganization: (organizationId: string) => void;
  onLogout: () => Promise<void>;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <Logo markClassName="h-6 w-6" showWordmark={false} />
        <p className="type-eyebrow mt-3 text-primary-ink">Organización</p>
        <h1 className="type-title mt-1">{organizationName ?? tenantId}</h1>
        {subscription && (
          <p
            className="type-caption mt-2 text-muted-foreground"
            data-testid="subscription-status"
          >
            Suscripción {subscription.status}
            {subscription.status === "trialing" && subscription.trialEndsAt
              ? ` hasta ${formatRegionDate(new Date(subscription.trialEndsAt), getClientRegion())}`
              : ""}
            {entitlements.includes("design.cad") ? " · CAD habilitado" : ""}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ThemeToggle />
        {organizations.length > 1 && (
          <select
            aria-label="Organización activa"
            value={organizationId ?? ""}
            disabled={busy}
            onChange={(event) => onActivateOrganization(event.target.value)}
            className="type-small min-h-11 rounded-control border border-border bg-card px-3 text-foreground"
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        )}
        {/*
          La página de seguridad de la cuenta no era alcanzable desde
          NINGUNA navegación del producto: existía la ruta y no había cómo
          llegar. Una función de seguridad que el usuario no encuentra es
          una función que no protege a nadie.
        */}
        {/*
          El canal de vuelta, en el cromo y no flotando sobre nada. La
          lección del aviso de tableta: cualquier cosa encima del área de
          trabajo acaba robando un clic que el usuario quería dar.
        */}
        <FeedbackButton />
        {/*
          Misma lección que la de arriba, y el mismo hueco: el producto
          sabía invitar a una organización desde su primer día y no había
          una sola pantalla donde hacerlo.
        */}
        <Link href="/equipo" className={buttonClass({ variant: "ghost" })}>
          <Users aria-hidden="true" className="h-4 w-4" />
          Equipo
        </Link>
        <Link href="/cuenta" className={buttonClass({ variant: "ghost" })}>
          <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          Seguridad
        </Link>
        <Button
          variant="ghost"
          onClick={onLogout}
          iconLeft={<LogOut className="h-4 w-4" />}
        >
          Cerrar sesión
        </Button>
      </div>
    </header>
  );
}
