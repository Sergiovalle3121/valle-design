import type { Metadata } from "next";
import { PublicPageShell, PublicSection } from "../PublicPageShell";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import { ApiConsole } from "./ApiConsole";
import operations from "./operations.generated.json";

/**
 * CONSOLA PÚBLICA de la API — la puerta del integrador.
 *
 * POR QUÉ ES UNA PÁGINA PÚBLICA Y NO UNA PANTALLA DEL PANEL. Quien evalúa si
 * puede automatizar Valle Design todavía no tiene cuenta. Si para ver qué
 * operaciones existen hay que registrarse, la evaluación termina antes de
 * empezar: el despacho que compara herramientas cierra la pestaña y abre la de
 * la competencia. La superficie se publica entera —las 73 operaciones, con su
 * autenticación, su entitlement y su permiso— porque el contrato ya es público
 * y esconderlo sólo protegería de clientes.
 *
 * POR QUÉ LA LISTA NO SE ESCRIBE AQUÍ. `operations.generated.json` lo genera
 * `scripts/cad/build-api-console.mjs` desde el YAML del contrato, y
 * `console-contract.spec.ts` falla si difieren. Una consola que promete una
 * operación retirada es peor que no tener consola.
 */
export const metadata: Metadata = publicPageMetadata({
  path: "/docs/api",
  title: "Consola de la API y automatización",
  description:
    "Explora y prueba las operaciones de la API de Valle Design: contrato OpenAPI 3.1, permisos por operación, SDK generado y política de extensiones de terceros.",
});

export default function ApiConsolePage() {
  return (
    <PublicPageShell
      eyebrow="API"
      title="Consola de la API de Valle Design"
      intro="Todas las operaciones publicadas del contrato v1, con su autenticación, su permiso y su entitlement. Puedes lanzarlas contra tu propio despliegue desde aquí: la consola no guarda credenciales ni envía nada a terceros."
    >
      <PublicSection title="Qué estás viendo">
        <p>
          Esta lista se genera desde{" "}
          <code>packages/contracts/specs/design-api.v1.yaml</code>, el mismo
          archivo del que sale el SDK de TypeScript y contra el que se verifica
          el enrutador del servidor. Si una operación aparece aquí, existe en el
          contrato; si desaparece del contrato, desaparece de esta página en el
          mismo cambio.
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>{operations.operationCount} operaciones</strong> en total,{" "}
            {operations.cadOperationCount} de ellas bajo <code>/v1/cad</code>.
          </li>
          <li>
            Autenticación por <strong>cookie de sesión propia</strong>. Las
            mutaciones exigen además la cabecera <code>X-CSRF-Token</code>, que
            la consola toma de la cookie legible <code>valle_csrf</code>.
          </li>
          <li>
            Las operaciones CAD exigen el entitlement{" "}
            <code>design.cad</code> vigente y un permiso <code>cad:*</code>{" "}
            derivado de tu membresía en el servidor. Ningún permiso enviado por
            el cliente se acepta.
          </li>
          <li>
            Las pruebas de límite y carga publicadas están en{" "}
            <code>docs/cad/evidence/api-load-tests.json</code>, con la máquina
            declarada y la mediana de tres corridas.
          </li>
        </ul>
      </PublicSection>

      <PublicSection title="Antes de lanzar tu primera petición">
        <p>
          La consola llama al origen que escribas abajo desde{" "}
          <em>tu navegador</em>. Para que el navegador acepte la respuesta, ese
          despliegue tiene que declarar el origen de esta página en{" "}
          <code>ALLOWED_ORIGIN</code>; si no, verás un error de CORS y no un
          fallo de la API. Es la misma restricción que tendrá tu propia
          aplicación.
        </p>
        <p>
          Inicia sesión primero en el despliegue al que apuntes: la consola
          reutiliza tu cookie de sesión y <strong>nunca</strong> pide, guarda ni
          transmite contraseñas ni claves.
        </p>
      </PublicSection>

      <ApiConsole data={operations} />

      <PublicSection title="Extensiones de terceros">
        <p>
          Lo que un tercero puede y no puede hacer hoy con Valle Design está
          escrito, sin adornos, en{" "}
          <code>docs/cad/third-party-extension-policy.md</code>: qué superficies
          hay, con qué límites y qué garantías se dan. La primera línea dice lo
          más importante — que no existe un proceso de revisión ni un mercado de
          extensiones — porque un integrador necesita saberlo antes de invertir,
          no después.
        </p>
      </PublicSection>
    </PublicPageShell>
  );
}
