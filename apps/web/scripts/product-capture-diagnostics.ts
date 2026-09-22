import type { Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Progress and private failure evidence for the standalone capture script. */
export function createProductCaptureDiagnostics(directory?: string) {
  let page: Page | undefined;
  let stage = "inicio";
  const mark = (next: string) => {
    stage = next;
    console.log(`[captura ${new Date().toISOString()}] ${stage}`);
  };
  return {
    mark,
    watchPage(next: Page) {
      page = next;
      page.setDefaultTimeout(30_000);
    },
    async reportRenderer(next: Page) {
      const metadata = await next
        .getByTestId("cad-canvas")
        .evaluate((element) => {
          const canvas =
            element instanceof HTMLCanvasElement
              ? element
              : element.querySelector("canvas");
          const gl =
            canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
          if (!gl)
            return {
              renderer: "unavailable",
              devicePixelRatio: window.devicePixelRatio,
            };
          const debug = gl.getExtension("WEBGL_debug_renderer_info");
          return {
            renderer: gl.getParameter(
              debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
            ),
            vendor: gl.getParameter(
              debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR,
            ),
            devicePixelRatio: window.devicePixelRatio,
          };
        });
      console.log(`[captura GPU] ${JSON.stringify(metadata)}`);
    },
    async failure(error: unknown) {
      console.error(`[captura] Fallo en etapa: ${stage}`);
      if (!directory || !page || page.isClosed()) return;
      try {
        await mkdir(directory, { recursive: true });
        const prefix = path.join(directory, `captura-${Date.now()}`);
        await writeFile(
          `${prefix}.json`,
          JSON.stringify(
            {
              stage,
              url: page.url(),
              error: error instanceof Error ? error.message : String(error),
            },
            null,
            2,
          ),
        );
        await page.screenshot({ path: `${prefix}.png`, timeout: 5_000 });
        console.error(`[captura] Diagnóstico privado: ${prefix}.png`);
      } catch (diagnosticError) {
        console.error(
          "[captura] No se pudo completar el diagnóstico:",
          diagnosticError,
        );
      }
    },
  };
}
