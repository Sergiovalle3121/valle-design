/** A demo report opens a local mail draft; it never includes a drawing or its ID. */
export function demoSupportDraftHref(
  address: string | undefined,
  appVersion: string,
  userAgent: string,
  uiMode: "esencial" | "pro",
): string | null {
  if (!address) return null;
  const subject = encodeURIComponent("Fallo en la demostración de VALLECAD");
  const body = encodeURIComponent(
    [
      `Versión: ${appVersion}`,
      `Navegador: ${userAgent}`,
      `Modo: ${uiMode}`,
      "",
      "Describe el problema:",
    ].join("\n"),
  );
  return `mailto:${address}?subject=${subject}&body=${body}`;
}
