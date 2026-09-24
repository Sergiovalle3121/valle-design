/** The server error body can contain internal details; only stable codes reach the dialog. */
export function supportIncidentErrorMessage(error: unknown): string {
  const body =
    error && typeof error === "object" && "body" in error
      ? (error as { body?: unknown }).body
      : null;
  const code =
    body && typeof body === "object" && "code" in body
      ? (body as { code?: unknown }).code
      : null;
  if (code === "support_channel_unavailable") {
    return "El canal de reportes no está disponible todavía. Tu texto sigue aquí; inténtalo más tarde.";
  }
  if (code === "rate_limited") {
    return "Has enviado demasiados reportes. Espera un minuto antes de volver a intentarlo; tu texto sigue aquí.";
  }
  return "No se pudo enviar el reporte. Tu texto sigue aquí; inténtalo más tarde.";
}
