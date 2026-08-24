import { expect, test } from "@playwright/test";
import { API_ORIGIN } from "./fixtures/constants";
import {
  firstPartyRequestFailure,
  loginAsStandaloneOwner,
} from "./fixtures/standalone-identity";

/**
 * Beta `AC1015_MODELSPACE_2D_V1` (ADR-0009 §6-bis): la ruta vertical real,
 * en un navegador de verdad, no en Node. Lo que un spec de Node NO puede
 * probar es exactamente lo que este spec existe para probar: que el bundle
 * de producción de Next.js resuelve el códec DWG propio dentro de un Web
 * Worker real y que `File.arrayBuffer()` —nunca `File.text()`— es la vía que
 * toca los bytes.
 *
 * Bytes del fixture: un AC1015 sintético (LINE+CIRCLE+TEXT, capa MUROS)
 * escrito con el propio `writeDwg` del laboratorio, en base64. Nace y muere
 * en este archivo: no hay derechos que pedir.
 *
 * Requiere `NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA=true` en el entorno del
 * servidor de Next que Playwright arranca (variable de build, no de
 * runtime) — sin ella el input ni siquiera ofrece `.dwg` y el gate rechaza
 * el archivo con su mensaje de siempre. Ver README de este directorio o
 * correr con:
 *   NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA=true npx playwright test dashboard-dwg-import-beta
 */
const SYNTHETIC_AC1015_LINE_CIRCLE_TEXT_BASE64 =
  "QUMxMDE1AAAAAAAGAdwAAAAAAB4ABgAAAAABAQAAOgIAAAE7AwAAzQAAAAKuDwAAXgAAAAMMEAAANQAAAATqEAAABAAAAAVhAAAA" +
  "ewAAADXglaBOKJmCGuVeQeBfnTpNAP93ARcABgABAAAA/////wEAAAAAAAAAFwAGABcABgAFAJMIBQCTCAAAAQAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAFmOJQDByXgDWY4lAMnJeAMqAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAB8lbQfU" +
  "NigonVfKP51EECsBAAAAAODakvgrydfXYqg1wGK779TPex8j/d44qV98aLhObTNfFAIAAAAABwAfv1XQlUBbaqUM1DRATMC0CQSk" +
  "BqqQhBkGQZBkGQZA1GlAQSTJJqZmZmZmck/JqZmZmZmak/JqZmZmZmbk/qqqqoAAAAAAAA4D9UBLhZjiUAMHJeAMWY4lADJyXgDk" +
  "BkBwEqURBREVEUUSBRGKoQIy1eB2vFUQQIy1eB2vFUQQIy1eB2vFUQQIy1eB2vFcQQIy1eB2vFcQQIy1eB2vFcQAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAKEAAAAAAAAAiQKpqZQUJQqqqqqqqECMtXgdrxVEECMtXgdrxVEECMtXgdrxVEECMtXgdrxXEECMtXgdrxXEE" +
  "CMtXgdrxXEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAChAAAAAAAAAIkCqamUFCUKqqqqqqQK16NwPQrHPwAAAAAAACwPxSuB6F61HYP" +
  "wK16NwPQrHP6oyoCtejcD0Kxz8CtejcD0Ktz+GZmZmZmZjlAZArXo3A9Crc/iBBVIIgiBIFSBJcgUIDUQNREVBQUFA/v8/v8xATE" +
  "CMQMxBTEGMQcxCDEJMQoxC1ENURcxDEBUalEaURlRDgdKgAApJnswZTJkZWMwMS05ZDQwLTQ0Y2EtYjY0OC1iZGQ2NDkyOThlY2Z" +
  "9SZ7RkFFQjFDMzItRTAxOS0xMUQ1LTkyOUItMDBDMERGMjU2RUM0fVEbUR1RFVEUURY//8//8//8//+tSDCE4NwCIcdWoIOXR7GS" +
  "zKCNocS4xKn4xcDc9F/nz7aKpwAAAD0AZEU9iamVjdERCWCBDbGFzc2VzRlBY0RiRGljdGlvbmFyeVdpdGhEZWZhdWx0RNBQ0RCR" +
  "ElDVElPTkFSWVdERkxUHmAnqAyIp7E1MrG6IiEsECG2MLm5srmh6CxojEoNjCxsqQ3tjIyuSHoKGiISgmIKGipCemIiKpDzAT2AZ" +
  "EU9iamVjdERCWCBDbGFzc2VzQpBY0RiTGF5b3V0QZMQVlPVVQeYC6D9yXjtHO1YHOj8jC6AYMEl1AAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAEwQAAAAAEBqQDAxHTEb7XsPAEySAAAAAECpAkAw" +
  "IRAhIr4NDQBNEgAAAABA6QFAMCERfk4RAE4SAAAAAEFpAUAwIRYxFDEVcy4KAE8QAAAAAEGqQDDgdQoAT5AAAAAAQepAMIBnDQBQ" +
  "EgAAAABCKQFAMCEhYUcNAFCSAAAAAEJpAUAwIRIt7A4AURQAAAAAQqkBAEAwISAEBAoAUZAAAAAAQupAMOBDZQBKsQCAAABDKQVA" +
  "QBCkFDQURfR1JPVVBEkFDQURfUExPVFNUWUxFTkFNRUPQUNBRF9NTElORVNUWUxFRFBQ0FEX1BMT1RTRVRUSU5HU0LQUNBRF9MQV" +
  "lPVVRAMCENIQ4hFyEZIRoH3KEQBKloAAAABDZAZAQBBDEEMMAH3HHgA9AGkAAAAAQ6QFAUBAEGTm9ybWFsQQxBDDAhD1EPD5FQ8A" +
  "PUBTgAAAAEPkBQQ5BDjAUAAWAEzcAAAAAEQpATDDwA0HQQIwUFEPURa9EiUATUCAQAAARGkIU3RhbmRhcmTCYAJqZmZmZmck/QN0" +
  "eHSQQMwUAHbmEwBQ3QAAAABEqQRBQ0FEwAQQkwUAUDoXAU5mAgAAAEUpB0J5QmxvY2vKQQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAQQUwUPeXFwFOZgIAAABFaQdCeUxheWVyykEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEEFMFC1RCUB" +
  "TkICQAAARakKQ29udGludW91c8QpTb2xpZCBsaW5lkEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "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";

test("beta DWG_NATIVE_IMPORT: sube un .dwg real, el worker lo lee y el documento abre en el estudio", async ({
  context,
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA !== "true",
    "requiere NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA=true en el servidor de Next " +
      "que arrancó Playwright (variable de build); ver el comentario del archivo",
  );

  await loginAsStandaloneOwner(context);
  const projects: Array<{ id: string; name: string; status: string }> = [];
  const documents: Array<{
    id: string;
    projectId: string;
    name: string;
    model: null;
    revision: null;
    cadDocumentVersion: number;
    cadDocument: unknown;
  }> = [];

  await context.route(`${API_ORIGIN}/v1/cad/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const authFailure = firstPartyRequestFailure(request);
    if (authFailure) return json(authFailure.body, authFailure.status);
    if (url.pathname === "/v1/cad/projects" && method === "GET")
      return json({ items: projects });
    if (url.pathname === "/v1/cad/projects" && method === "POST") {
      const body = request.postDataJSON() as { name: string };
      const project = {
        id: "10000000-0000-4000-8000-000000000001",
        name: body.name,
        status: "active",
      };
      projects.push(project);
      return json(project, 201);
    }
    if (url.pathname === "/v1/cad/documents" && method === "GET")
      return json({ items: documents });
    if (url.pathname === "/v1/cad/documents" && method === "POST") {
      const body = request.postDataJSON() as { name: string; projectId: string };
      const document = {
        id: "20000000-0000-4000-8000-000000000001",
        projectId: body.projectId,
        name: body.name,
        model: null,
        revision: null,
        cadDocumentVersion: 0,
        cadDocument: null,
      };
      documents.push(document);
      return json(document, 201);
    }
    if (url.pathname === "/v1/cad/blocks" && method === "GET")
      return json({ items: [] });
    const match = url.pathname.match(/^\/v1\/cad\/documents\/([^/]+)(\/content)?$/);
    if (match && !match[2] && method === "GET") {
      const document = documents.find((item) => item.id === match[1]);
      return document ? json(document) : json({ message: "not found" }, 404);
    }
    if (match?.[2] && method === "PUT") {
      const document = documents.find((item) => item.id === match[1])!;
      const body = request.postDataJSON() as {
        expectedCadDocumentVersion: number;
        cadDocument: unknown;
      };
      expect(body.expectedCadDocumentVersion).toBe(document.cadDocumentVersion);
      document.cadDocument = body.cadDocument;
      document.cadDocumentVersion += 1;
      return json({ cadDocumentVersion: document.cadDocumentVersion });
    }
    return json({ message: "not found" }, 404);
  });

  await page.goto("/dashboard");
  await expect(page.getByText("Valle Design E2E")).toBeVisible();
  await page.getByLabel("Nombre del proyecto").fill("Organización / Beta DWG");
  await page.getByLabel("Crear proyecto").click();

  await test.step("El picker ofrece .dwg sólo con la beta activada", async () => {
    const input = page.getByLabel("Importar como documento");
    await expect(input).toHaveAttribute("accept", /\.dwg/);
  });

  await test.step("Sube el AC1015 sintético: bytes reales, worker real", async () => {
    await page.getByLabel("Importar como documento").setInputFiles({
      name: "plano-beta.dwg",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(SYNTHETIC_AC1015_LINE_CIRCLE_TEXT_BASE64, "base64"),
    });
    // 3 entidades del perfil V1 (LINE, CIRCLE, TEXT) y los DOS bloques
    // estructurales que `writeDwg` siempre emite (*Model_Space,
    // *Paper_Space) aunque el fixture no declare ningún bloque de usuario:
    // exactamente lo que el archivo trae, ni una entidad perdida en
    // silencio ni una inventada.
    await expect(page.getByRole("status")).toHaveText(
      "Importado: 3 entidades y 2 bloques.",
      { timeout: 30_000 },
    );
  });

  await test.step("Abre el documento importado en el estudio", async () => {
    await page.getByRole("button", { name: "Abrir documento importado" }).click();
    await expect(page).toHaveURL(/\/studio\/20000000-0000-4000-8000-000000000001$/);
  });
});
