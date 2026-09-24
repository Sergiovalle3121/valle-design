/**
 * Antes: /demo montaba la casa sin preguntar. Ahora: cuatro elecciones sólo
 * en la primera visita; si no hay acción, abre un documento realmente vacío
 * en cinco segundos. El estudio que aparece conserva el límite de interfaz
 * del primer minuto, medido sobre el canvas, no sobre un contenedor ficticio.
 */
import { expect, test } from "@playwright/test";
import { chooseDemoStart } from "../fixtures/demo-start";

for (const choice of ["departamento", "local-comercial"] as const) {
  test(`elegir ${choice} abre su propia planta sin muros 3D de la casa`, async ({ page }, testInfo) => {
    await page.goto("/demo");
    if (choice === "departamento") {
      await expect(page.getByTestId("demo-first-choice")).toBeVisible();
      await testInfo.attach("selector-cuatro-tarjetas", { body: await page.screenshot(), contentType: "image/png" });
    }
    await chooseDemoStart(page, choice);
    await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 60_000 });
    const document = await page.evaluate(() => {
      const raw = localStorage.getItem("valle_demo_document");
      return raw ? JSON.parse(raw).document as { entities: Array<{ id: string }>; history: Array<{ label: string }> } : null;
    });
    expect(document?.entities.length).toBeGreaterThan(0);
    expect(document?.entities.some(({ id }) => id.startsWith("dv-wall-") || id.startsWith("dv-open-"))).toBe(false);
    expect(document?.history[0]?.label.toLowerCase()).toContain(choice === "departamento" ? "departamento" : "local comercial");
    await page.reload();
    await expect(page.getByTestId("demo-first-choice")).toHaveCount(0);
    await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Recuperar mi dibujo anterior" }),
      "una planta intacta no finge ser trabajo propio recuperable").toHaveCount(0);
  });
}

test("la primera visita ofrece cuatro tarjetas y a los cinco segundos abre En blanco sin ocultar el lienzo", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 769 });
  await page.addInitScript(() => {
    const timing: { shown?: number; hidden?: number } = {};
    (window as typeof window & { __demoFirstChoiceTiming?: typeof timing }).__demoFirstChoiceTiming = timing;
    const observer = new MutationObserver(() => {
      const showing = !!document.querySelector('[data-testid="demo-first-choice"]');
      if (showing && timing.shown === undefined) timing.shown = performance.now();
      if (!showing && timing.shown !== undefined && timing.hidden === undefined) {
        timing.hidden = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("valle:cad:ui-mode:v1"));
  await page.goto("/demo");

  const chooser = page.getByTestId("demo-first-choice");
  await expect(chooser).toBeVisible();
  await expect(chooser.getByRole("heading", { name: "¿Qué vas a dibujar?" })).toBeVisible();
  for (const [id, label] of [
    ["casa-habitacion", "Casa habitación"],
    ["departamento", "Departamento"],
    ["local-comercial", "Local comercial"],
    ["en-blanco", "En blanco"],
  ]) {
    await expect(page.getByTestId(`demo-choice-${id}`).getByRole("heading", { name: label })).toBeVisible();
  }
  await expect(chooser.getByTestId(/^demo-choice-/)).toHaveCount(4);
  await expect(chooser).toHaveCount(0, { timeout: 10_000 });
  const timing = await page.evaluate(() =>
    (window as typeof window & { __demoFirstChoiceTiming?: { shown?: number; hidden?: number } })
      .__demoFirstChoiceTiming);
  expect(timing?.shown).toEqual(expect.any(Number));
  expect(timing?.hidden).toEqual(expect.any(Number));
  expect(timing!.hidden! - timing!.shown!, "el selector desaparece dentro de cinco segundos en el navegador")
    .toBeLessThanOrEqual(5_000);
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem("valle_demo_document");
    return raw ? JSON.parse(raw).document.entities.length : -1;
  })).toBe(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("valle:cad:demo-first-choice:v1")))
    .toBe("en-blanco");

  const skip = page.getByTestId("cad-guided-tour-skip");
  if (await skip.count()) await skip.click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(3000);
  const measure = await page.evaluate(() => {
    const visible = (el: Element) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width >= 4 && box.height >= 4 && box.bottom >= 0 && box.right >= 0 &&
        box.top <= innerHeight && box.left <= innerWidth && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity) > 0.05;
    };
    const controls = [...document.querySelectorAll(
      "button, a[href], input, select, textarea, [role=button], [role=tab], [role=menuitem], [role=option]",
    )].filter(visible).length;
    const canvas = document.querySelector('[data-testid="cad-canvas"]');
    if (!canvas) return { controls, screenFree: 0, canvasCovered: 100 };
    const rect = canvas.getBoundingClientRect();
    let total = 0;
    let free = 0;
    for (let x = rect.left + 2; x < rect.right - 2; x += 8) {
      for (let y = rect.top + 2; y < rect.bottom - 2; y += 8) {
        total++;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit.tagName === "CANVAS" || hit === canvas || canvas.contains(hit))) free++;
      }
    }
    return {
      controls,
      screenFree: 100 * (free / total) * rect.width * rect.height / (innerWidth * innerHeight),
      canvasCovered: 100 * (1 - free / total),
    };
  });
  expect(measure.controls, JSON.stringify(measure)).toBeLessThanOrEqual(30);
  expect(measure.screenFree, JSON.stringify(measure)).toBeGreaterThanOrEqual(75);
  expect(measure.canvasCovered, JSON.stringify(measure)).toBeLessThanOrEqual(3);
  console.log(`demo elección: ${Math.round(timing!.hidden! - timing!.shown!)} ms; ${JSON.stringify(measure)}`);
  await testInfo.attach("lienzo-en-blanco-primer-minuto", { body: await page.screenshot(), contentType: "image/png" });
});
