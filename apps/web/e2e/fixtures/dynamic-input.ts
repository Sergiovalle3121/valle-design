/**
 * Entrada dinámica del CAD, a prueba del re-montaje.
 *
 * EL PROBLEMA, QUE YA ESTABA DIAGNOSTICADO EN EL REPO. El panel de entrada
 * dinámica se REMONTA al cambiar de fase (`anchored|origin`, centro→radio,
 * ABS→REL→POLAR). Rellenar un campo justo en ese instante pierde el valor en
 * silencio: la herramienta recibe dos veces la misma coordenada, o un radio
 * vacío, y la figura se rechaza por degenerada. No falla el `fill` — falla que
 * el valor no llega a cuajar antes de «Aplicar».
 *
 * El golden 32 ya lo había resuelto en su helper `point()`, con un comentario
 * largo explicando exactamente esto, y envolvía relleno+comprobación en un
 * `toPass` para que el paso espere a su PROPIO estado. Pero esa solución no se
 * propagó: los goldens 26, 31 y 33 seguían con la versión ingenua
 * —`fill()` y directo a «Aplicar»—, y son justamente los specs que arrastran
 * historial de rojos intermitentes junto al 32.
 *
 * Este módulo es esa misma solución, una sola vez, para todos.
 *
 * POR QUÉ ESTO NO ES «SUBIR UN RETRY PARA QUE PASE». Lo que se reintenta es la
 * PRECONDICIÓN del paso —que el campo sostenga el valor que se acaba de
 * escribir—, nunca la aserción bajo prueba. El recuento de entidades, el
 * historial y la versión se siguen afirmando fuera, una sola vez y sin
 * reintento. Si el producto no acepta el valor, el `toPass` agota su plazo y la
 * prueba falla igual: no puede tapar un defecto, sólo deja de medir el
 * instante equivocado.
 */
import { expect, type Page } from "@playwright/test";

/** Plazo por intento de relleno. Corto a propósito: si no cuaja, se reintenta. */
const ATTEMPT_MS = 1_000;
/** Plazo total. Si en 15 s el campo nunca sostiene el valor, es del producto. */
const SETTLE_MS = 15_000;

export interface DynamicInputOptions {
  /**
   * Botón de modo a pulsar ANTES de rellenar (`ABS`, `REL`, `POLAR`, `Ø`…).
   * Va dentro del reintento porque un re-montaje también resetea el modo, y
   * rellenar con el modo equivocado escribe el valor en otra coordenada.
   */
  mode?: string;
  /** Pulsar «Aplicar» al final. Falso para dejar el panel abierto. */
  apply?: boolean;
}

/**
 * Rellena los campos indicados y aplica cuando TODOS sostienen su valor.
 *
 * Las claves son el sufijo del testid: `x` → `cad-dynamic-field-x`.
 */
export async function applyDynamicInput(
  page: Page,
  fields: Record<string, string>,
  options: DynamicInputOptions = {},
): Promise<void> {
  const dynamic = page.getByTestId("cad-dynamic-input");
  const entries = Object.entries(fields);

  await expect(async () => {
    if (options.mode)
      await dynamic.getByRole("button", { name: options.mode, exact: true }).click();
    for (const [name, value] of entries) {
      const field = page.getByTestId(`cad-dynamic-field-${name}`);
      await expect(field).toBeVisible({ timeout: ATTEMPT_MS });
      await field.fill(value);
    }
    // Se comprueban DESPUÉS de escribirlos todos: rellenar el segundo campo
    // puede remontar el panel y vaciar el primero, y eso hay que verlo.
    for (const [name, value] of entries)
      await expect(page.getByTestId(`cad-dynamic-field-${name}`)).toHaveValue(value, {
        timeout: ATTEMPT_MS,
      });
  }).toPass({ timeout: SETTLE_MS });

  if (options.apply !== false)
    await dynamic.getByRole("button", { name: "Aplicar" }).click();
}

/** Un punto por coordenadas absolutas: el caso más común. */
export async function applyDynamicPoint(
  page: Page,
  x: string,
  y: string,
  options: DynamicInputOptions = {},
): Promise<void> {
  await applyDynamicInput(page, { x, y }, { mode: "ABS", ...options });
}

/**
 * Un campo del panel de PROPIEDADES nativas, con la misma garantía.
 *
 * Aquí el patrón vulnerable es `fill()` + `blur()` y a continuación afirmar
 * sobre el documento. Si el panel se reconstruye entre el relleno y el blur
 * —cosa que pasa al recalcular la entidad seleccionada—, el valor no se aplica
 * y la prueba mide el estado ANTERIOR. Eso es lo que hacía intermitente al
 * golden 14: afirmaba que el borde regenerado del HATCH pasaba de x=8000 y
 * recibía 7804.97, que es exactamente la elipse SIN redimensionar.
 *
 * Igual que arriba: se reintenta la precondición —que el campo sostenga el
 * valor—, nunca la aserción bajo prueba.
 */
export async function applyNativeProperty(
  page: Page,
  name: string,
  value: string,
): Promise<void> {
  const field = page.getByTestId(`cad-native-property-${name}`);
  await expect(async () => {
    await expect(field).toBeVisible({ timeout: ATTEMPT_MS });
    await field.fill(value);
    await field.blur();
    await expect(field).toHaveValue(value, { timeout: ATTEMPT_MS });
  }).toPass({ timeout: SETTLE_MS });
}
