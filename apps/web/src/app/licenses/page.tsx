import type { Metadata } from "next";
import {
  PublicPageShell,
  PublicSection,
  publicActionClass,
} from "../docs/PublicPageShell";
import { publicPageMetadata } from "@/lib/seo/page-metadata";

const repositoryBase =
  "https://github.com/Sergiovalle3121/valle-design/blob/main";

export const metadata: Metadata = publicPageMetadata({
  path: "/licenses",
  title: "Licencias y avisos de terceros",
  description:
    "Licencia propietaria de Valle Design y avisos de las dependencias de terceros que utiliza el producto.",
});

export default function LicensesPage() {
  return (
    <PublicPageShell
      eyebrow="Información legal"
      title="Licencias y avisos de terceros"
      intro="Los textos versionados en el repositorio son la fuente autoritativa. Esta página sólo ayuda a encontrarlos y no modifica sus condiciones."
    >
      <PublicSection title="Valle Design">
        <p>
          El repositorio declara el producto como software propietario. La
          licencia indica que una evaluación, piloto o utilización comercial
          requiere un acuerdo escrito con el titular.
        </p>
        <a className={publicActionClass} href={`${repositoryBase}/LICENSE`}>
          Leer LICENSE
        </a>
      </PublicSection>

      <PublicSection title="Componentes de terceros">
        <p>
          Las dependencias conservan sus propias licencias. El inventario de una
          compilación se deriva de su lockfile y de su SBOM; no se reproduce
          aquí una lista que pueda quedar desactualizada.
        </p>
        <a
          className={publicActionClass}
          href={`${repositoryBase}/THIRD_PARTY_NOTICES.md`}
        >
          Leer THIRD_PARTY_NOTICES
        </a>
      </PublicSection>
    </PublicPageShell>
  );
}
