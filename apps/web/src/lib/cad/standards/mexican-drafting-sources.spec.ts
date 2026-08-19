/**
 * LA SPEC DE LA HONESTIDAD.
 *
 * Es la que sostiene todo lo demás. La ventaja de venir de fábrica con lo que se
 * dibuja en México se pierde ENTERA el día que un arquitecto abre la tabla de
 * capas y detecta una norma inventada — lo detecta al instante, porque a él se
 * lo revisa una ventanilla. Así que lo que se comprueba aquí no es el aspecto de
 * un plano: es que cada convención diga de dónde sale y que ninguna mienta.
 *
 * Las cinco reglas:
 *
 *  1. **Ninguna `norma` sin documento y sin cláusula.** Una norma citada «en
 *     general» no es una cita, es una insinuación.
 *  2. **Ninguna `costumbre` sin la práctica descrita y sin decir en qué varía.**
 *     Una costumbre presentada como unánime es una norma inventada con otro
 *     nombre.
 *  3. **Una `norma` separa lo que el documento DICE de lo que nosotros HACEMOS.**
 *     ISO 129-1 admite la garrapata; no obliga a usarla en arquitectura.
 *     Confundir «lo admite» con «lo exige» es el claim falso típico.
 *  4. **Toda convención de las tablas cita una fuente que existe.** Si una capa
 *     pierde su cita, esta spec falla.
 *  5. **El artefacto publicado dice lo mismo que el código.** Sin esto, la
 *     documentación y el producto se separan y nadie se entera.
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  CAD_MEXICAN_DRAFTING_SOURCES,
  CadStandardSourceError,
  cadStandardCitation,
  cadStandardIsNormative,
  cadStandardSource,
  cadStandardSourceOrNull,
  cadStandardsPendingVerification,
} from "./mexican-drafting-sources";
import { buildCadMexicanDraftingEvidence } from "./mexican-drafting-evidence";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// --- CADA FUENTE ES LO QUE DICE SER -----------------------------------------
{
  const ids = CAD_MEXICAN_DRAFTING_SOURCES.map((source) => source.id);
  assert.equal(new Set(ids).size, ids.length, "hay un id de fuente repetido");

  for (const source of CAD_MEXICAN_DRAFTING_SOURCES) {
    ok(source.rule.trim().length > 20, `${source.id}: dice qué se aplica por su causa`);
    ok(!!source.jurisdiction, `${source.id}: declara hasta dónde llega`);

    if (source.kind === "norma") {
      ok(source.document.trim().length > 0, `${source.id}: una norma sin documento no es una cita`);
      ok(source.clause.trim().length > 0, `${source.id}: una norma sin cláusula tampoco`);
      ok(
        source.says.trim().length > 30,
        `${source.id}: hay que decir qué dice el documento, aparte de qué hacemos nosotros`,
      );
      // Lo que la norma DICE y lo que nosotros HACEMOS no pueden ser el mismo
      // texto: si lo fueran, estaríamos citando nuestra propia decisión.
      assert.notEqual(source.says.trim(), source.rule.trim(), `${source.id}: says == rule`);
      continue;
    }

    ok(
      source.practice.trim().length > 30,
      `${source.id}: una costumbre sin la práctica descrita es una afirmación vacía`,
    );
    ok(
      source.caveat.trim().length > 0,
      `${source.id}: hay que decir en qué varía; una costumbre unánime no existe`,
    );
    // Y una costumbre NO puede colar un documento por la puerta de atrás: el
    // tipo lo impide en compilación, y esto lo impide en ejecución.
    ok(
      !Object.prototype.hasOwnProperty.call(source, "document"),
      `${source.id}: una costumbre no cita documento`,
    );
  }
}

// --- LAS PROPORCIONES, ANCLADAS ---------------------------------------------
//
// No es un número decorativo. Si un día quedara UNA costumbre y veintiséis
// normas, alguien habría convertido costumbres en normas — que es exactamente el
// fallo que este trabajo existe para impedir, y el que nadie notaría solo.
{
  const normas = CAD_MEXICAN_DRAFTING_SOURCES.filter((source) => source.kind === "norma");
  const costumbres = CAD_MEXICAN_DRAFTING_SOURCES.filter((source) => source.kind === "costumbre");
  assert.equal(normas.length, 13);
  assert.equal(costumbres.length, 14);
  ok(
    costumbres.length >= normas.length,
    "la mayor parte del dibujo mexicano es costumbre y no norma; si esto se invierte, algo se inventó",
  );

  // Ninguna norma mexicana de NOMENCLATURA de capas. Es el hecho central y va
  // anclado: no existe, y decir que existe sería el error más caro del módulo.
  const capas = cadStandardSource("capas-nombre-espanol");
  assert.equal(capas.kind, "costumbre");
  ok(
    capas.kind === "costumbre" && /ISO 13567/.test(capas.ignoredStandard ?? ""),
    "se dice que la única norma de capas que existe es ISO 13567 y que no se sigue",
  );

  // El RCDF es de la Ciudad de México, no nacional. Decir «cumple la norma» sin
  // decir cuál sería falso en Monterrey y en Guadalajara.
  assert.equal(cadStandardSource("rcdf-dro").jurisdiction, "cdmx");
  assert.equal(cadStandardSource("nom-001-sede").jurisdiction, "nacional-mx");
  assert.equal(cadStandardSource("iso-216").jurisdiction, "internacional");
}

// --- LO QUE UNA PERSONA TIENE QUE CONFIRMAR ---------------------------------
{
  const pending = cadStandardsPendingVerification();
  ok(pending.length >= 5, "hay una lista explícita de lo que falta confirmar");
  for (const source of pending)
    ok(
      (source.verify ?? "").trim().length > 20,
      `${source.id}: dice QUÉ hay que confirmar, no sólo que hay algo`,
    );
  // Las dos más importantes: el artículo del RCDF y la edición de la NOM.
  const ids = new Set(pending.map((source) => source.id));
  ok(ids.has("rcdf-dro"), "se pide confirmar el articulado del RCDF con un D.R.O.");
  ok(ids.has("nom-001-sede"), "se pide confirmar la edición vigente de la NOM eléctrica");
}

// --- CÓMO SE CITA ------------------------------------------------------------
{
  // Una norma se cita con su designación…
  assert.match(cadStandardCitation("iso-129-1-terminacion"), /^ISO 129-1 — /);
  assert.equal(cadStandardIsNormative("iso-129-1-terminacion"), true);
  // …y una costumbre se cita DICIENDO que es costumbre. Este es el único
  // formateador que existe, para que no haya un segundo sitio donde una
  // costumbre pueda acabar rotulada como norma.
  assert.equal(
    cadStandardCitation("garrapata-arquitectonica"),
    "Uso común de despacho mexicano; sin norma escrita",
  );
  assert.equal(cadStandardIsNormative("garrapata-arquitectonica"), false);
  for (const source of CAD_MEXICAN_DRAFTING_SOURCES) {
    const citation = cadStandardCitation(source.id);
    if (source.kind === "costumbre")
      ok(/costumbre|sin norma/i.test(citation), `${source.id} se cita como lo que es`);
    else ok(citation.includes(source.document), `${source.id} se cita con su documento`);
  }
}

// --- FALLO CERRADO -----------------------------------------------------------
{
  assert.equal(cadStandardSourceOrNull("norma-inventada"), null);
  assert.throws(
    () => cadStandardSource("norma-inventada"),
    (error: unknown) => {
      assert.ok(error instanceof CadStandardSourceError);
      assert.equal(error.code, "cad_standard_source_unknown");
      assert.equal(error.sourceId, "norma-inventada");
      assert.match(error.message, /norma o declararse costumbre/);
      return true;
    },
  );
  checks += 1;
}

// --- EL ARTEFACTO PUBLICADO DICE LO MISMO QUE EL CÓDIGO ---------------------
//
// Ésta es la mitad que impide que la documentación y el producto se separen. El
// artefacto NO se escribe a mano: lo genera `scripts/cad/…-evidence.mjs` desde
// estos mismos módulos. Si alguien cambia una capa, una escala o una cita y no
// regenera, esta comprobación lo dice con el comando exacto para arreglarlo.
{
  const evidence = buildCadMexicanDraftingEvidence();
  assert.deepEqual(
    evidence.integridad.problemas,
    [],
    "hay una convención sin fuente declarada; el artefacto no se puede publicar así",
  );

  const candidates = [
    path.resolve(process.cwd(), "../../docs/cad/evidence/mexican-drafting-standards.json"),
    path.resolve(process.cwd(), "docs/cad/evidence/mexican-drafting-standards.json"),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(
    file,
    `No se encontró el artefacto de evidencia. Genéralo con «npm run evidence:normas-mx».\n` +
      `Buscado en:\n${candidates.join("\n")}`,
  );

  // Saltos de línea normalizados: con `core.autocrlf=true` git entrega el
  // archivo con CRLF, y un gate que falla por el final de línea acaba
  // desactivado.
  const published = JSON.parse(fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n"));
  assert.deepEqual(
    published,
    JSON.parse(JSON.stringify(evidence)),
    "docs/cad/evidence/mexican-drafting-standards.json ya no dice lo que dice el código. " +
      "Regenéralo con «npm run evidence:normas-mx».",
  );

  // Y el artefacto lleva la sección que lo hace creíble: dónde termina lo que
  // sabemos. Un artefacto sólo con afirmaciones es propaganda con formato JSON.
  ok(evidence.noSeAfirma.length >= 6, "el artefacto declara lo que NO afirma");
  ok(
    evidence.noSeAfirma.some((line) => /arquitecto mexicano/.test(line)),
    "el artefacto dice que ningún arquitecto lo ha revisado todavía",
  );
  ok(
    evidence.noSeAfirma.some((line) => /ISO 13567/.test(line)),
    "el artefacto dice que la nomenclatura de capas no está normada en México",
  );
}

console.log(
  `mexican-drafting-sources.spec: ${CAD_MEXICAN_DRAFTING_SOURCES.length} fuentes ` +
    `(${CAD_MEXICAN_DRAFTING_SOURCES.filter((s) => s.kind === "norma").length} normas citadas, ` +
    `${CAD_MEXICAN_DRAFTING_SOURCES.filter((s) => s.kind === "costumbre").length} costumbres declaradas), ` +
    `${checks} comprobaciones nombradas OK`,
);
