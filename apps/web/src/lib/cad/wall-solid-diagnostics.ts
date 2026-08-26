/**
 * Diagnóstico TIPADO del recorte de vanos en el cuerpo 3D del muro.
 *
 * `wallSolidBodyLocal` aplicaba el criterio fail-closed correcto (un vano que
 * no encaja no corta; una booleana degenerada no tumba el muro) pero lo hacía
 * EN SILENCIO: un `catch { continue }` podía convertir un muro con ventana en
 * un muro macizo sin que nadie — ni el usuario, ni el informe de validación,
 * ni una prueba — pudiera distinguirlo de un muro sin vanos. Para una
 * representación comercial eso es pérdida silenciosa de geometría: la clase de
 * defecto que la campaña COMMERCIAL-RC1 prohíbe de plano.
 *
 * Este módulo da nombre a cada motivo por el que un vano NO se recortó y
 * conserva la causa original cuando la hay. Quién decide qué hacer con cada
 * clase es el consumidor:
 *
 *   · `degenerate-size`, `horizontal-misfit`, `vertical-misfit`: el vano es
 *     INVÁLIDO respecto de su anfitrión. La planta 2D aplica exactamente el
 *     mismo criterio (no corta), así que 2D y 3D siguen contando la misma
 *     historia; el diagnóstico existe para que el informe de validación lo
 *     diga en vez de callarlo.
 *   · `boolean-failed`: el vano es VÁLIDO y el kernel no pudo recortarlo. El
 *     muro NO debe presentarse macizo como si nada — el anfitrión lo marca
 *     inválido y el informe de validación lo hace visible con muro, vano y
 *     causa.
 */

export type CadWallOpeningCutDiagnosticKind =
  | "degenerate-size"
  | "horizontal-misfit"
  | "vertical-misfit"
  | "boolean-failed";

export interface CadWallOpeningCutDiagnostic {
  /** Posición del vano en la lista que recibió el constructor del cuerpo. */
  readonly openingIndex: number;
  readonly kind: CadWallOpeningCutDiagnosticKind;
  /** Mensaje del encaje o del kernel, conservado tal cual cuando existe. */
  readonly cause?: string;
}

/** Diagnóstico con la identidad completa, listo para el informe de validación. */
export interface CadWallOpeningCutReport extends CadWallOpeningCutDiagnostic {
  readonly wallId: string;
  readonly openingId: string | null;
}

/**
 * ¿Debe bloquearse la representación comercial del muro? Sólo cuando un vano
 * VÁLIDO no pudo recortarse: presentar el muro macizo mentiría. Los encajes
 * inválidos no bloquean — el vano no existe como hueco ni en 2D ni en 3D, y el
 * documento con solapes/desbordes ya lo rechaza el servidor en su frontera.
 */
export function cadWallOpeningCutBlocksSolid(
  diagnostics: readonly CadWallOpeningCutDiagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.kind === "boolean-failed");
}
