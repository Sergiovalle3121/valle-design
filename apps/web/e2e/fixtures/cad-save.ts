import { expect, type Page } from "@playwright/test";

/**
 * Confirma explícitamente el dibujo y espera a que no quede trabajo pendiente.
 *
 * El autosave (debounce 2 s) y el guardado manual comparten la misma cola de un
 * solo escritor y el mismo token CAS. Por eso el número EXACTO de versiones que
 * produce un lote de ediciones depende de cuánto tardó el usuario en hacerlas,
 * no del contrato del producto: un recorrido que tarda más de 2 s entre dos
 * ediciones persiste legítimamente dos veces. Afirmar `version === 1` ahí no
 * afirmaba CAS, afirmaba «el autosave no llegó a dispararse».
 *
 * Lo que el producto sí garantiza —y lo que este helper comprueba— es que al
 * terminar NO queda nada sin persistir: el editor lo declara con «Guardado» en
 * `cad-save-status`. El spec que llama afirma después el CONTENIDO persistido,
 * que es la sustancia de la prueba.
 *
 * Donde el número de versiones SÍ es el contrato se sigue afirmando directo, sin
 * este helper:
 *  - conflicto CAS tipado entre dos sesiones (10-cad-native-entities),
 *  - idempotencia del guardado explícito tras el autosave y avance de exactamente
 *    una versión por edición nueva (30-cad-save-affordance).
 *
 * Devuelve la versión CAS persistida para que el spec pueda encadenar
 * aserciones de avance si las necesita.
 */
export async function saveAndSettle(
  page: Page,
  backend: { snapshot(): { version: number } },
): Promise<number> {
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado");
  const { version } = backend.snapshot();
  expect(version).toBeGreaterThan(0);
  return version;
}
