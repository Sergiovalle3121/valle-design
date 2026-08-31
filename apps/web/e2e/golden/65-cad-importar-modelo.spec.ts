import { expect, test, type BrowserContext } from "@playwright/test";
import { API_ORIGIN } from "../fixtures/constants";
import {
  firstPartyRequestFailure,
  loginAsStandaloneOwner,
} from "../fixtures/standalone-identity";
import { installMockBackend } from "../fixtures/mock-backend";
import { planarBodyVolume, bodyIsClosed } from "../../src/lib/brep";
import { solid3dBody } from "../../src/lib/cad/solid3d-build";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import type { CadSolid3dEntity } from "../../src/lib/cad/cad-entities-v5";

/**
 * IMPORTAR UN MODELO 3D — la promesa entera del frente de interop, hecha
 * ejecutable: "exportas de SketchUp, lo abres aquí, y puedes empujarlo".
 *
 * Se sube un OBJ (el formato más común de exportación de terceros) con una
 * caja de 2×3×4 mm triangulada — dos triángulos por cara, como la entrega
 * cualquier exportador real — y se afirma sobre el DOCUMENTO QUE EL SERVIDOR
 * RECIBIÓ, no sobre una captura del visor 3D: una captura no distingue un
 * sólido de verdad de una malla decorativa que sólo se ve bien.
 *
 * Lo que separa esto de un visor:
 *   1. Sale un `solid3d`, no una entidad opaca.
 *   2. Su cuerpo tiene MÁS DE UNA CARA — si tuviera 12 (una por triángulo),
 *      la fusión de caras coplanarias no estaría conectada al camino real.
 *   3. Su volumen, calculado por el kernel B-rep real sobre el cuerpo
 *      persistido, es el de la caja: 2×3×4 = 24 mm³.
 *   4. El cuerpo CIERRA — sin eso, ni se puede exportar ni restar.
 */

const CUBE_VERTICES: [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
/** Doce triángulos, normales salientes verificadas a mano por producto cruzado. */
const CUBE_TRIANGLES: [number, number, number][] = [
  [0, 3, 2], [0, 2, 1],
  [4, 5, 6], [4, 6, 7],
  [0, 1, 5], [0, 5, 4],
  [3, 7, 6], [3, 6, 2],
  [0, 4, 7], [0, 7, 3],
  [1, 6, 5], [1, 2, 6],
];

function boxObjText(sx: number, sy: number, sz: number): string {
  const lines = ["o Caja"];
  for (const [x, y, z] of CUBE_VERTICES) lines.push(`v ${x * sx} ${y * sy} ${z * sz}`);
  for (const [a, b, c] of CUBE_TRIANGLES) lines.push(`f ${a + 1} ${b + 1} ${c + 1}`);
  return lines.join("\n");
}

async function installCadDashboardBackend(context: BrowserContext) {
  const projects: Array<{ id: string; name: string; status: string }> = [];
  const documents: Array<{
    id: string;
    projectId: string;
    name: string;
    model: null;
    revision: null;
    cadDocumentVersion: number;
    cadDocument: CadDocument | null;
  }> = [];

  await context.route(`${API_ORIGIN}/v1/cad/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const authFailure = firstPartyRequestFailure(request);
    if (authFailure) return json(authFailure.body, authFailure.status);
    if (url.pathname === "/v1/cad/projects" && method === "GET") return json({ items: projects });
    if (url.pathname === "/v1/cad/projects" && method === "POST") {
      const body = request.postDataJSON() as { name: string };
      const project = { id: "10000000-0000-4000-8000-000000000001", name: body.name, status: "active" };
      projects.push(project);
      return json(project, 201);
    }
    if (url.pathname === "/v1/cad/documents" && method === "GET") return json({ items: documents });
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
    if (url.pathname === "/v1/cad/blocks" && method === "GET") return json({ items: [] });
    const match = url.pathname.match(/^\/v1\/cad\/documents\/([^/]+)(\/content)?$/);
    if (match && !match[2] && method === "GET") {
      const document = documents.find((item) => item.id === match[1]);
      return document ? json(document) : json({ message: "not found" }, 404);
    }
    if (match?.[2] && method === "PUT") {
      const document = documents.find((item) => item.id === match[1])!;
      const body = request.postDataJSON() as { expectedCadDocumentVersion: number; cadDocument: CadDocument };
      expect(body.expectedCadDocumentVersion).toBe(document.cadDocumentVersion);
      document.cadDocument = body.cadDocument;
      document.cadDocumentVersion += 1;
      return json({ cadDocumentVersion: document.cadDocumentVersion });
    }
    return json({ message: "not found" }, 404);
  });

  return documents;
}

test("importar un OBJ produce un solid3d con más de una cara y el volumen correcto", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const documents = await installCadDashboardBackend(context);

  await page.goto("/dashboard");
  await page.getByLabel("Nombre del proyecto").fill("Migración SketchUp");
  await page.getByLabel("Crear proyecto").click();

  await page.getByLabel(/Importar como documento/).setInputFiles({
    name: "caja.obj",
    mimeType: "text/plain",
    buffer: Buffer.from(boxObjText(2, 3, 4)),
  });

  await expect(page.getByText(/Importado: 1 entidades/)).toBeVisible({ timeout: 60_000 });

  // Lo que importa no es la pantalla: es lo que el servidor guardó.
  await expect.poll(() => documents[0]?.cadDocumentVersion).toBe(1);
  const saved = documents[0].cadDocument!;
  expect(saved.entities).toHaveLength(1);

  const entity = saved.entities[0] as unknown as CadSolid3dEntity;
  expect(entity.type).toBe("solid3d");

  const body = solid3dBody(entity);
  // Doce triángulos de entrada, seis caras planas de verdad: si esto diera 12,
  // la fusión de caras coplanarias no estaría conectada al camino real.
  expect(body.faces.length).toBeGreaterThan(1);
  expect(body.faces.length).toBe(6);
  expect(bodyIsClosed(body)).toBe(true);
  expect(planarBodyVolume(body)).toBeCloseTo(2 * 3 * 4, 6);
});
