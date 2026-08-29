import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { PublicNav } from "@/components/PublicNav";
import { SkipLink } from "@/components/SkipLink";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { buttonClass } from "@/components/ui";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd } from "@/lib/seo/structured-data";

/**
 * /seguridad — la página que un despacho exige antes de subir sus planos.
 *
 * REGLA DURA: aquí solo hay mecanismos CONSTRUIDOS Y PROBADOS en este
 * repositorio, cada uno con su detalle técnico plegado que nombra el módulo o
 * el spec que lo respalda. Lo que no está construido no aparece — ni como
 * «próximamente». Un despacho que confía su trabajo por una promesa
 * incumplida no vuelve, y con razón.
 *
 * Nota de precisión deliberada: el aislamiento entre organizaciones se
 * describe como lo que ES (verificación de pertenencia en cada petición, en
 * el guard de acceso) y no como «RLS», porque no es row-level security de
 * base de datos y esta página no redondea hacia arriba.
 */
export const metadata: Metadata = publicPageMetadata({
  path: "/seguridad",
  title: "Seguridad: cómo cuidamos tus planos",
  description:
    "Contraseñas con Argon2id, MFA, sesiones revocables, aislamiento por " +
    "organización, respaldos con restauración verificada y el modo sin " +
    "rehenes: ver y exportar no caducan.",
});

const FACTS: ReadonlyArray<{
  titulo: string;
  cliente: string;
  tecnico: string;
}> = [
  {
    titulo: "Tu contraseña no se puede leer, ni aquí",
    cliente:
      "Las contraseñas se guardan con Argon2id, el estándar actual de " +
      "hashing con memoria dura: ni un volcado completo de la base de datos " +
      "las revela.",
    tecnico:
      "Argon2id con parámetros de memoria/iteraciones fijados en el servicio " +
      "de identidad (apps/api/src/modules/identity/identity.service.ts) y " +
      "spec de seguridad propio (identity.security.spec.ts). El algoritmo " +
      "viaja versionado con la credencial para poder endurecerlo sin " +
      "invalidar cuentas.",
  },
  {
    titulo: "Segundo factor de verdad",
    cliente:
      "Puedes exigir un código además de la contraseña (aplicación " +
      "autenticadora TOTP). Activarlo y desactivarlo pide la contraseña — " +
      "una sesión robada no puede bajarte la defensa.",
    tecnico:
      "TOTP RFC 6238 en identity-mfa.service.ts, con códigos de respaldo de " +
      "un solo uso y el alta protegida por confirmación de contraseña. La " +
      "pantalla de cuenta enseña el estado y el proceso completo.",
  },
  {
    titulo: "Ves tus sesiones y las puedes cortar",
    cliente:
      "La cuenta lista las sesiones abiertas con su dispositivo aproximado. " +
      "Un botón cierra cada una; otro cierra TODAS las demás — y cambiar la " +
      "contraseña revoca el resto de sesiones solo.",
    tecnico:
      "Sesiones revocables individualmente y en bloque " +
      "(identity.controller.ts); el cambio de contraseña invalida las demás " +
      "sesiones por diseño. La superficie vive en /cuenta (AccountSecurity).",
  },
  {
    titulo: "Tu organización no comparte pared con nadie",
    cliente:
      "Cada petición verifica que quien pide pertenece a la organización " +
      "dueña del documento. No hay consulta que cruce de una organización a " +
      "otra.",
    tecnico:
      "Guard de acceso CAD con resolución de tenant en cada petición " +
      "(apps/api/src/modules/auth/guards/cad-auth.guard.ts) y mapa de " +
      "permisos por rol (cad-permission-map.ts) con specs de integración " +
      "sobre Postgres real. Es verificación de pertenencia a nivel de " +
      "aplicación — lo decimos así porque eso es lo que es.",
  },
  {
    titulo: "Respaldos que se PRUEBAN, no que se suponen",
    cliente:
      "Los respaldos existen y además se restauran de prueba: un respaldo " +
      "que nunca se ha restaurado es una esperanza, no un respaldo.",
    tecnico:
      "scripts/ops/backup.mjs genera el respaldo y " +
      "scripts/ops/restore-verify.mjs lo restaura en una base aparte y " +
      "verifica el contenido. El procedimiento completo está en el RUNBOOK " +
      "del repositorio.",
  },
  {
    titulo: "El modo sin rehenes: ver y exportar no caducan",
    cliente:
      "Si tu periodo gratuito o tu suscripción terminan, conservas el " +
      "acceso de lectura: abres tus planos y los exportas a DXF o PDF " +
      "cuando quieras. Un producto que secuestra tu trabajo para retenerte " +
      "no merece tenerte.",
    tecnico:
      "El permiso cad:view sobrevive al vencimiento por contrato de guard " +
      "(entitlement-read-only.pg.spec.ts: «con la prueba VENCIDA, ABRE Y " +
      "EXPORTA»). No es política de soporte: es un spec que CI hace cumplir.",
  },
  {
    titulo: "El navegador recibe reglas estrictas",
    cliente:
      "La aplicación se sirve con cabeceras de seguridad que impiden que " +
      "otros sitios la embeban o inyecten código: la superficie de ataque " +
      "del navegador está acotada por configuración, no por suerte.",
    tecnico:
      "Content-Security-Policy, HSTS, Referrer-Policy, Permissions-Policy y " +
      "X-Content-Type-Options se emiten desde el propio servidor de la " +
      "aplicación (apps/web/next.config.ts), con cada permiso de la CSP " +
      "justificado en comentario. frame-ancestors 'none': nadie embebe el " +
      "editor.",
  },
  {
    titulo: "Sin secretos de terceros para compilar",
    cliente:
      "El producto se construye y corre sin depender de descargas de " +
      "terceros en tiempo de build — menos piezas ajenas, menos superficie " +
      "de cadena de suministro.",
    tecnico:
      "Fuentes autohospedadas (gate check:fonts), SBOM CycloneDX generado " +
      "del árbol real de dependencias (npm run sbom), licencias verificadas " +
      "(check:licenses) y escaneo de secretos (gitleaks) en el repositorio.",
  },
];

export default function SeguridadPage() {
  return (
    <>
      <SkipLink />
      <PublicNav />
      <main id="contenido" className="text-foreground">
        <JsonLd data={breadcrumbJsonLd([["Seguridad", "/seguridad"]])} />
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-5 pb-12 pt-12 sm:px-8 lg:pt-16">
            <p className="flex items-center gap-2 type-eyebrow text-primary-ink">
              <ShieldCheck aria-hidden="true" className="h-4 w-4" />
              Seguridad
            </p>
            <h1 className="type-display mt-5 max-w-3xl">
              Tus planos son tu negocio. Así los cuidamos.
            </h1>
            <p className="type-lead mt-6 max-w-2xl text-muted-foreground">
              Todo lo que hay en esta página está construido y probado en el
              código del producto — cada afirmación trae su detalle técnico
              plegado con el módulo que la respalda. Lo que no está
              construido, no está en esta página.
            </p>
          </div>
        </section>

        <section aria-label="Mecanismos de seguridad" className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
          <ul className="space-y-5">
            {FACTS.map((fact, index) => (
              <RevealOnScroll as="li" key={fact.titulo} delayMs={Math.min(index, 3) * 60}>
                <div className="rounded-card border border-border bg-card p-6 shadow-resting">
                  <h2 className="text-lg font-semibold text-foreground">{fact.titulo}</h2>
                  <p className="type-body mt-3 text-muted-foreground">{fact.cliente}</p>
                  <details className="group mt-4">
                    <summary className="cursor-pointer type-small font-medium text-primary-ink underline-offset-4 hover:underline">
                      El detalle técnico
                    </summary>
                    <p className="type-small mt-3 rounded-control border border-border bg-muted/40 p-4 font-mono text-muted-foreground">
                      {fact.tecnico}
                    </p>
                  </details>
                </div>
              </RevealOnScroll>
            ))}
          </ul>

          <div className="mt-12 rounded-card border border-border bg-muted/30 p-6">
            <h2 className="font-semibold text-foreground">
              ¿Encontraste una vulnerabilidad?
            </h2>
            <p className="type-small mt-2 text-muted-foreground">
              La política de divulgación responsable y el canal de reporte
              están publicados en el repositorio (SECURITY.md) y en la página
              de contacto. Preferimos un aviso incómodo hoy que un incidente
              mañana.
            </p>
            <div className="mt-4">
              <Link href="/contact" className={buttonClass({ variant: "secondary", size: "md" })}>
                Reportar de forma responsable
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
