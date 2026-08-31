/**
 * GUARDIÁN: Valle Design no tiene inteligencia artificial, y este spec lo sostiene.
 *
 * ## Por qué existe
 *
 * La IA de este árbol se llamaba CIDE y **no era de Valle Design**: era el motor
 * de **Axos OS**, el ERP industrial del que este producto nació y del que se
 * separó en 2026 (ver `IDENTITY.md`). Cuando el CAD se llevó a su propio
 * repositorio, el copiloto en lenguaje natural y la visión plano→muros vinieron
 * de polizones. Se retiraron enteros —proveedor, servicios, rutas `/v1/cad/intent`
 * y `/v1/cad/vision`, panel «Copiloto CAD», el bloque del monolito y la fila de
 * rúbrica que los puntuaba—, y este spec impide que vuelvan por la puerta de
 * atrás.
 *
 * El titular lo pidió con todas sus letras: *«valle design no tiene que tener
 * AI»*. Lo que sí quiere para trabajar en equipo es mensajería, videollamada y
 * pantalla compartida — que es comunicación entre personas, no un modelo
 * proponiendo geometría.
 *
 * ## Qué NO prohíbe, y por qué la distinción importa
 *
 * Sigue existiendo —y debe seguir— un **registro local de frases**
 * (`lib/cad/commands/registry.ts`): un parser DETERMINISTA que convierte
 * «coloca una puerta en 3000,2000» en una operación. No es IA: no hay modelo,
 * no hay inferencia, no sale un byte del navegador y la misma frase da siempre
 * el mismo resultado. Por eso la paleta lo etiqueta «Frase» y no «Copiloto»:
 * el nombre viejo describía la IA que ya no está, y un nombre que miente sobre
 * lo que hay dentro es exactamente lo que este guardián existe para evitar.
 *
 * ## Dónde está la frontera
 *
 * En lo que el usuario VE o TECLEA, y en lo que el producto EJECUTA. Un
 * comentario histórico que explique por qué se retiró la IA es documentación y
 * no promete nada; un botón que diga «IA», un alias `COPILOTO` o un `fetch` a
 * un motor de inferencia sí son el producto afirmando que tiene IA.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { CAD_COMMAND_DESCRIPTORS } from "./engine";
import { CAD_COMMAND_ALIASES } from "./engine/alias-table";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizWeb = path.join(aqui, "..", "..", "..");
const raizRepo = path.join(raizWeb, "..", "..");

/**
 * En un IDENTIFICADOR tecleado la palabra no necesita bordes para ser un
 * anuncio. En PROSA sí: el español tiene «copiloto» dentro de nada, pero «IA»
 * aparece dentro de mil palabras («familia», «materia», «geometría»), así que
 * sin bordes el guardián gritaría por todo y acabaría desactivado —que es la
 * peor forma de fallar.
 */
const RECLAMA_EN_IDENTIFICADOR = /\b(?:copilot|copiloto|cide)\b/iu;
const RECLAMA_EN_PROSA = /\b(?:IA|AI|copiloto|copilot|CIDE|inteligencia artificial)\b/u;

// --- 1. lo que se teclea: órdenes y alias del motor --------------------------
{
  const tecleable: string[] = [];
  for (const d of CAD_COMMAND_DESCRIPTORS) {
    tecleable.push(d.name, ...(d.aliases ?? []));
  }
  tecleable.push(...Object.keys(CAD_COMMAND_ALIASES));

  const culpables = tecleable.filter((n) => RECLAMA_EN_IDENTIFICADOR.test(n));
  assert.deepEqual(
    culpables,
    [],
    `hay órdenes o alias que anuncian IA: ${culpables.join(", ")}`,
  );

  // Controles en los dos extremos: un guardián que no puede fallar no defiende
  // nada, y uno que falla siempre se acaba borrando.
  assert.ok(RECLAMA_EN_IDENTIFICADOR.test("COPILOTO"), "no detectaría una orden llamada COPILOTO");
  assert.ok(RECLAMA_EN_IDENTIFICADOR.test("CIDE"), "no detectaría una orden llamada CIDE");
  assert.ok(!RECLAMA_EN_IDENTIFICADOR.test("COINCIDE"), "gritaría por COINCIDE, que no es IA");
  assert.ok(!RECLAMA_EN_IDENTIFICADOR.test("LINE"), "detecta de más en identificadores");
  assert.ok(RECLAMA_EN_PROSA.test("propuesta de la IA"), "no detectaría el claim en prosa");
  assert.ok(!RECLAMA_EN_PROSA.test("la geometría de la familia"), "gritaría por «geometría»");
}

// --- 2. los módulos retirados siguen retirados ------------------------------
{
  const retirados = [
    "apps/api/src/modules/ai/cide-provider.ts",
    "apps/api/src/modules/cad-documents/cide-ai-provider.adapter.ts",
    "apps/api/src/modules/cad-documents/cad-intent.service.ts",
    "apps/api/src/modules/cad-documents/cad-vision.service.ts",
    "apps/api/src/modules/cad-documents/ports/cad-ai-provider.port.ts",
    "apps/web/src/lib/cad/cad-intent.ts",
    "apps/web/src/lib/cad/cad-vision.ts",
    "apps/web/src/lib/cad/copilot-contract.ts",
    "apps/web/src/components/cad/palettes/CadCommandDock.tsx",
  ];
  const listado = execFileSync("git", ["ls-files", "--", ...retirados], {
    cwd: raizRepo,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  assert.deepEqual(
    listado,
    [],
    `la IA volvió al árbol: ${listado.join(", ")}. Se retiró a propósito (IDENTITY.md), no por descuido.`,
  );
}

// --- 3. el contrato HTTP no ofrece asistencia por modelo --------------------
{
  const spec = readFileSync(
    path.join(raizRepo, "packages/contracts/specs/design-api.v1.yaml"),
    "utf8",
  );
  for (const ruta of ["/v1/cad/vision:", "/v1/cad/documents/{documentId}/intent:"]) {
    assert.ok(
      !spec.includes(ruta),
      `el contrato volvió a publicar ${ruta}, que era una ruta de IA`,
    );
  }
  assert.ok(
    !/operationId:\s*(interpretCadIntent|vectorizeCadImage)/u.test(spec),
    "el contrato volvió a declarar una operación de IA",
  );
}

console.log(
  "OK frontera sin IA: ninguna orden, alias, módulo ni ruta del contrato ofrece inteligencia artificial",
);
