"use client";

import { cx } from "@/components/ui";

/**
 * EL PULSO DEL GUARDADO — lo que el editor sabía y no enseñaba.
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────────
 * La barra de estado ya decía la verdad: «Guardando…», «Modificado · autosave
 * pendiente», «Guardado». Tres palabras correctas y completamente inertes. Quien
 * pulsa guardar en un CAD no lee la barra de estado: mira el lienzo, y lo único
 * que le dice si su trabajo está a salvo es un cambio de texto de doce píxeles
 * que ocurre en un sitio al que no está mirando.
 *
 * ── QUÉ AÑADE ───────────────────────────────────────────────────────────────
 * Movimiento con significado, no decoración:
 *
 *   · MIENTRAS GUARDA, el indicador RESPIRA (`pulse-working`). Un latido lento
 *     es lo que distingue «trabajando» de «colgado», y es la pregunta real que
 *     se hace alguien cuyo plano lleva dos segundos sin confirmar.
 *   · AL TERMINAR, un pulso ÚNICO con la curva de confirmación de la casa
 *     (`ease-spring`: pasa de largo y vuelve). Es el gesto que el ojo lee como
 *     «hecho», y se dispara porque la `key` cambia con el estado, así que React
 *     remonta el elemento y la animación arranca sola — sin un efecto que
 *     compare el estado anterior, sin un temporizador que limpiar.
 *
 * Nada de esto roba el puntero ni tapa el lienzo. Es la lección que dejó escrita
 * el aviso de tableta: una notificación que captura clics en un editor de dibujo
 * es peor que no avisar.
 *
 * ── POR QUÉ ES UN MÓDULO PROPIO ─────────────────────────────────────────────
 * Porque `Layout3DEditor.tsx` sólo puede ENCOGER, y porque este bloque —cinco
 * estados excluyentes con su color y su texto— es exactamente el tipo de lógica
 * de presentación que dentro de un monolito de veinte mil líneas nadie vuelve a
 * mirar. Aquí se lee entero de una vez.
 *
 * `data-testid="cad-save-status"` NO cambia: es el contrato con las pruebas.
 */

/**
 * Los tres modos de fallo del guardado, tal y como los emite el editor.
 * `server` es cualquier error del servidor que no sea un conflicto de versión;
 * se escribe igual que en el origen para que el tipo no haya que traducirlo en
 * la frontera, que es donde las traducciones se olvidan.
 */
export type CadSaveIssueKind = "conflict" | "offline" | "server";

export function CadSaveStatus({
  saving,
  dirty,
  scheduled,
  issue,
  issueLabel,
}: {
  saving: boolean;
  dirty: boolean;
  /** Hay un autosave en cola aunque el documento ya no esté sucio. */
  scheduled: boolean;
  issue: { kind: CadSaveIssueKind; message?: string } | null;
  /** Texto ya resuelto del incidente de conflicto, que necesita el documento. */
  issueLabel: string;
}) {
  const estado = saving
    ? "guardando"
    : issue
      ? "problema"
      : dirty || scheduled
        ? "pendiente"
        : "guardado";

  const texto =
    estado === "guardando"
      ? "Guardando…"
      : issue?.kind === "conflict"
        ? issueLabel
        : issue?.kind === "offline"
          ? "Sin conexión · cambios pendientes"
          : issue
            ? "Error de guardado · cambios pendientes"
            : estado === "pendiente"
              ? "Modificado · autosave pendiente"
              : "Guardado";

  return (
    <span
      // La `key` es el estado: al cambiar, React remonta y la animación de
      // confirmación arranca sola. Sin ella habría que comparar el estado
      // anterior en un efecto y limpiar un temporizador — más código y una
      // fuga de memoria esperando a que alguien se olvide del `clearTimeout`.
      key={estado}
      data-testid="cad-save-status"
      data-state={estado}
      title={issue?.message}
      className={cx(
        estado === "guardando" && "pulse-working text-primary-ink",
        estado === "problema" && "text-danger-ink",
        estado === "pendiente" && "text-warning-ink",
        estado === "guardado" && "pulse-confirm text-success-ink",
      )}
    >
      {texto}
    </span>
  );
}
