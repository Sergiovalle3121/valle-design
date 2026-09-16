import { strict as assert } from "node:assert";
import {
  isDwgAc1018ImportBetaEnabled,
  isDwgNativeImportBetaEnabled,
} from "@/lib/cad/document-import-client";
import { dwgClaim, dwgClaimFor } from "./dwg-claim";

/**
 * EL TEXTO SOBRE DWG DICE LO QUE HACE ESTA BUILD, y sólo eso.
 *
 * Cuatro estados de banderas, cuatro textos; y tres reglas que valen en los
 * cuatro: la versión del formato se nombra, el límite («sólo importación»,
 * «beta» o «no abre») va en la misma frase que «DWG», y nunca se afirma que
 * se escriba DWG ni se nombra a un fabricante — `check:surface` lo prohíbe
 * en la superficie pública y esta cadena viaja a ella.
 */

const off = dwgClaimFor({ nativeBeta: false, ac1018Beta: false });
const base = dwgClaimFor({ nativeBeta: true, ac1018Beta: false });
const both = dwgClaimFor({ nativeBeta: true, ac1018Beta: true });
const onlySecond = dwgClaimFor({ nativeBeta: false, ac1018Beta: true });

assert.equal(off.importEnabled, false);
assert.deepEqual(off.versions, []);
assert.match(off.short, /no abre ni escribe DWG/u, "apagada, la línea corta dice que no abre");
assert.match(off.long, /^No en este despliegue/u);

assert.equal(base.importEnabled, true);
assert.deepEqual(base.versions, ["AC1015 (R2000)"]);
assert.match(base.short, /Lee DWG AC1015/u);
assert.doesNotMatch(base.short, /AC1018/u, "sin la segunda bandera no se promete AC1018");

assert.equal(both.importEnabled, true);
assert.deepEqual(both.versions, ["AC1015 (R2000)", "AC1018 (R2004)"]);
assert.match(both.short, /AC1015 \(R2000\) y AC1018 \(R2004\)/u);

// AC1018 amplía la beta base, nunca la sustituye: es la conjunción del
// importador (`dwgAc1018BetaImportIsEnabled`) y aquí se vuelve texto.
assert.deepEqual(onlySecond, off, "la segunda bandera sola no abre nada");

for (const claim of [off, base, both]) {
  for (const text of [claim.short, claim.long]) {
    assert.match(
      text,
      /\bDWG\b/u,
      "el texto nombra el formato: si no lo nombra, no está declarando nada",
    );
    assert.match(
      text,
      /no abre ni escribe DWG|sólo importación|sólo de importación|sólo para importar/u,
      "el límite va en la misma frase que DWG",
    );
    assert.match(
      text,
      /no abre ni escribe|[Nn]unca (lo )?escribe/u,
      "nunca se afirma escritura de DWG",
    );
    assert.doesNotMatch(text, /\b(?:autocad|autodesk)\b/iu, "se nombra el formato, no al fabricante");
    assert.doesNotMatch(
      text,
      /(?:exporta|escribimos|escritura de) DWG/iu,
      "ninguna forma de «exportar DWG» puede colarse",
    );
  }
}

// `dwgClaim()` lee EXACTAMENTE las banderas del importador: si alguien
// cambiara el nombre de una variable en `document-import-client.ts`, la
// portada dejaría de decir la verdad de la build. Se cruza contra las mismas
// funciones que usa el importador, con el entorno de este proceso.
assert.deepEqual(
  dwgClaim(),
  dwgClaimFor({
    nativeBeta: isDwgNativeImportBetaEnabled(),
    ac1018Beta: isDwgAc1018ImportBetaEnabled(),
  }),
);

console.log(
  `dwg-claim: 4 estados de bandera, texto derivado (esta build: ${dwgClaim().importEnabled ? dwgClaim().versions.join(" + ") : "sin DWG"})`,
);
