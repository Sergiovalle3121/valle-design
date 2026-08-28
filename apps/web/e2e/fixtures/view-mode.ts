import type { Page } from "@playwright/test";

/**
 * PONE EL ESTUDIO EN 3D.
 *
 * ── POR QUÉ HACE FALTA DECIRLO AHORA ────────────────────────────────────────
 * El estudio abría SIEMPRE en 3D, así que ningún golden tenía que pedirlo. La
 * campaña de firma lo cambió: un CAD de planos da la peor bienvenida posible
 * abriendo en volumen —el primer gesto del usuario era buscar el botón que lo
 * apaga—, y ahora abre en 2D y recuerda la elección.
 *
 * Los presets de cámara («Vista superior», «Vista frontal», isométrica) son
 * chrome del 3D y en 2D no existen, porque en 2D la vista YA es cenital: un
 * botón que no hace nada es peor que un botón ausente.
 *
 * ── POR QUÉ SE PIDE EL MODO EN VEZ DE QUITAR EL PRESET ──────────────────────
 * Estos goldens miden el pipeline de render, el motor de puntero y la inversión
 * mundo↔pantalla DEL VISOR 3D. Quitarles el preset y dejarlos correr en 2D los
 * dejaría verdes midiendo otra cosa, que es la peor forma de arreglar una
 * prueba. Piden el modo que ejercitan, explícitamente, y de paso ejercitan el
 * conmutador nuevo.
 */
export async function enter3DView(page: Page): Promise<void> {
  await page.getByRole("button", { name: "3D", exact: true }).click();
}
