import Link from "next/link";

/** Los borradores se muestran aparte de los textos versionados que el API pide aceptar. */
export function LegalDraftLinks() {
  return (
    <p className="type-small mt-4 text-muted-foreground">
      Textos para revisión:{" "}
      <Link className="underline underline-offset-4" href="/terminos">
        Borrador de términos
      </Link>
      {" · "}
      <Link className="underline underline-offset-4" href="/privacidad">
        Borrador de privacidad
      </Link>
      . Aún no son los textos aprobados.
    </p>
  );
}
