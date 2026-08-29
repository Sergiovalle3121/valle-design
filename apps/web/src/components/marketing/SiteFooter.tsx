/**
 * EL PIE DE SITIO SERIO — el mapa que la barra pública no es.
 *
 * La barra de arriba lleva CUATRO enlaces a propósito (la ruta corta de
 * decisión); el pie es lo contrario: el mapa completo, donde se busca lo que
 * no se decide. Cuatro columnas con dueño claro —producto, recursos,
 * confianza, legal— más la identidad, el correo de soporte VISIBLE (una
 * dirección escrita, no un «contáctanos» que esconde el correo) y la línea de
 * marcas que `check:surface` autoriza solo aquí.
 *
 * Un solo componente para todas las públicas: la portada y el shell de
 * documentación lo montan igual, así que añadir una página al mapa es tocar
 * UNA lista.
 */
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { TrademarkNotice } from "./TrademarkNotice";
import { BRAND } from "@/config/brand";
import { COMMERCIAL_CONTACTS, COMMERCIAL_LINKS } from "@/config/commercial";
import { PRICING_PATH } from "@/config/site-routes";

const COLUMNS: ReadonlyArray<{
  title: string;
  links: ReadonlyArray<[label: string, href: string]>;
}> = [
  {
    title: "Producto",
    links: [
      ["Plantillas", "/plantillas"],
      ["Demostración", "/demo"],
      ["Precios", PRICING_PATH],
      ["Novedades", "/novedades"],
      ["Estado del sistema", COMMERCIAL_LINKS.status],
    ],
  },
  {
    title: "Recursos",
    links: [
      ["Guías", COMMERCIAL_LINKS.documentation],
      ["API", "/docs/api"],
      ["Casos de uso", "/casos-de-uso"],
      ["Educación", "/educacion"],
      ["Soporte", COMMERCIAL_LINKS.support],
    ],
  },
  {
    title: "Confianza",
    links: [
      ["Seguridad", "/seguridad"],
      ["Privacidad", COMMERCIAL_LINKS.privacy],
      ["Términos", COMMERCIAL_LINKS.terms],
      ["Licencias", COMMERCIAL_LINKS.licenses],
    ],
  },
  {
    title: "Contacto",
    links: [["Escríbenos", COMMERCIAL_LINKS.contact]],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border px-5 py-14 sm:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
        <div>
          <Logo />
          <p className="type-small mt-3 max-w-xs text-muted-foreground">
            CAD 2D profesional en el navegador: dibuja, acota y publica láminas
            a escala sin instalar nada.
          </p>
          <p className="type-small mt-4 text-muted-foreground">{BRAND.copyright}</p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="type-micro font-semibold text-foreground">{column.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map(([label, href]) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="type-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {label}
                  </Link>
                </li>
              ))}
              {column.title === "Contacto" ? (
                <>
                  {COMMERCIAL_CONTACTS.support ? (
                    <li>
                      <a
                        href={`mailto:${COMMERCIAL_CONTACTS.support}`}
                        className="type-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {COMMERCIAL_CONTACTS.support}
                      </a>
                    </li>
                  ) : null}
                  {COMMERCIAL_CONTACTS.sales ? (
                    <li>
                      <a
                        href={`mailto:${COMMERCIAL_CONTACTS.sales}`}
                        className="type-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {COMMERCIAL_CONTACTS.sales}
                      </a>
                    </li>
                  ) : null}
                </>
              ) : null}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto mt-10 max-w-7xl border-t border-border pt-6">
        <TrademarkNotice className="type-small max-w-2xl text-muted-foreground" />
      </div>
    </footer>
  );
}
