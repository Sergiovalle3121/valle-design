/**
 * La consola pública NO puede quedarse atrás del contrato.
 *
 * POR QUÉ ESTE SPEC EXISTE. `operations.generated.json` es una TERCERA copia de
 * la superficie de la API (las otras dos son el YAML y el SDK generado), y una
 * copia sin gate se desincroniza el día que alguien añade una ruta con prisa.
 * El daño no es cosmético: un integrador que abre la consola, copia una
 * operación retirada y la mete en su ERP descubre el error en producción, no
 * aquí. Este spec regenera desde el YAML y compara byte a byte.
 *
 * También ancla los DOS recuentos que el repositorio publica —83 operaciones
 * totales, 43 bajo /v1/cad— para que añadir superficie sea un cambio
 * DELIBERADO: si sube el número, este spec obliga a mirarlo y a actualizar
 * también `check-design-contract.mjs` y el spec del router standalone.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const SPEC_PATH = path.join(
  REPO_ROOT,
  "packages/contracts/specs/design-api.v1.yaml",
);
const GENERATED_PATH = path.join(
  REPO_ROOT,
  "apps/web/src/app/docs/api/operations.generated.json",
);
const BUILDER_PATH = path.join(REPO_ROOT, "scripts/cad/build-api-console.mjs");

void (async () => {
  const builder = (await import(pathToFileURL(BUILDER_PATH).href)) as {
    buildConsoleData: (source: string) => {
      operationCount: number;
      cadOperationCount: number;
      operations: {
        operationId: string;
        method: string;
        path: string;
        summary: string;
        authentication: string;
      }[];
    };
  };

  const source = readFileSync(SPEC_PATH, "utf8");
  const regenerated = builder.buildConsoleData(source);
  const committed = readFileSync(GENERATED_PATH, "utf8").replaceAll(
    "\r\n",
    "\n",
  );

  assert.equal(
    `${JSON.stringify(regenerated, null, 2)}\n`,
    committed,
    "operations.generated.json no coincide con el contrato: ejecuta `node scripts/cad/build-api-console.mjs`",
  );

  // 79 + las 3 de /v1/legal (documentos, listar y registrar aceptación)
  // + 1 de /v1/support (el botón «algo salió mal» del estudio)
  // + las 7 del segundo factor y la actividad de la cuenta (campaña de firma
  //   propia, 2026-08-28)
  // + las 4 del centro de comentarios: crear, los míos, todos (operador) y
  //   cambiar estado (operador).
  // − las 2 de asistencia por IA (`/v1/cad/documents/{id}/intent` y
  //   `/v1/cad/vision`): se retiraron con el motor CIDE, que era de Axos OS y
  //   no de este producto (`IDENTITY.md`). Valle Design no tiene IA.
  // + las 6 de /v1/messaging: listar/crear canales, listar/enviar mensajes,
  //   marcar leído y el flujo @Sse de eventos en vivo. Es el trabajo en equipo
  //   entre PERSONAS que sustituye a lo que se fue.
  // + las 4 de /v1/calls: crear/unirse a sala, publicar señal, colgar y el
  //   flujo @Sse que reparte oferta, respuesta y candidatos ICE.
  // + las 2 de /v1/cad/presence: publicar el propio cursor/encuadre y el
  //   flujo @Sse que reparte el de los demás.
  assert.equal(
    regenerated.operationCount,
    104,
    "cambió el número de operaciones del contrato; actualiza este spec Y los recuentos de check-design-contract.mjs / standalone-contract-router.spec.ts",
  );
  assert.equal(
    regenerated.cadOperationCount,
    43,
    "cambió el número de operaciones /v1/cad; el gate de contrato tiene su propio recuento que también hay que mover",
  );

  // Toda operación tiene identidad utilizable: sin operationId la consola no
  // puede referenciarla y sin resumen el integrador no sabe qué hace.
  for (const operation of regenerated.operations) {
    assert.ok(
      /^[a-zA-Z]\w*$/.test(operation.operationId),
      `operationId inválido: ${operation.operationId}`,
    );
    assert.ok(
      operation.summary.length > 0,
      `${operation.operationId} sin summary: la consola mostraría una fila muda`,
    );
    assert.ok(
      ["public", "sessionCookie", "reviewToken"].includes(
        operation.authentication,
      ),
      `${operation.operationId}: autenticación desconocida ${operation.authentication}`,
    );
  }

  const ids = regenerated.operations.map((operation) => operation.operationId);
  assert.equal(
    new Set(ids).size,
    ids.length,
    "operationId duplicado en la consola",
  );

  // La superficie anónima publicada son los dos catálogos: el comercial y el
  // del SAT. El fiscal entra aquí porque el formulario de alta lo necesita
  // ANTES de que exista organización, y porque no hay nada que proteger:
  // `c_RegimenFiscal` y el subconjunto de `c_UsoCFDI` son idénticos para todo
  // México y se sirven desde constantes del producto, sin un solo dato de nadie.
  // Si algún día otra operación declara `security: []`, que sea decisión vista.
  //
  // DECISIÓN VISTA (campaña de firma propia, 2026-08-28):
  // `completeIdentityMfaLogin` es el segundo acto del inicio de sesión y por
  // definición ocurre ANTES de que exista sesión — exigirla sería exigir lo que
  // esa llamada viene a crear. No queda desprotegida: para llegar hay que
  // presentar un desafío de un solo uso, emitido sólo tras validar la
  // contraseña, que caduca en cinco minutos, se consume al primer intento y
  // lleva su propio techo de peticiones. Las otras cinco rutas del segundo
  // factor (estado, alta, activación, baja y códigos de respaldo) y la
  // actividad reciente SÍ exigen sesión, y por eso no aparecen en esta lista.
  const anonymous = regenerated.operations.filter(
    (operation) => operation.authentication === "public",
  );
  assert.deepEqual(
    anonymous.map((operation) => operation.operationId).sort(),
    [
      "completeIdentityMfaLogin",
      "listLegalDocuments",
      "listPublicCommercialPlans",
      "listSatTaxCatalogs",
      "loginIdentity",
      "receiveStripeWebhook",
      "registerIdentity",
      "requestIdentityPasswordReset",
      "resendIdentityVerification",
      "resetIdentityPassword",
      "verifyIdentityEmail",
    ],
    "cambió el conjunto de operaciones sin sesión; revísalo antes de publicarlo",
  );

  console.log(
    `console-contract: ${regenerated.operationCount} operaciones (${regenerated.cadOperationCount} CAD) sincronizadas con el contrato`,
  );
})();
