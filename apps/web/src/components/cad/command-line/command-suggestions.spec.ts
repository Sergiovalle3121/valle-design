/**
 * Lo que la línea de órdenes sugiere mientras escribes.
 *
 * Estaba dentro de `CadCommandLine.tsx` y no se podía probar sin montar la
 * línea entera; sale a su propio módulo cuando ese archivo roza su techo de
 * 800 líneas, y de paso gana esto. Lo que se fija aquí es lo que un dibujante
 * nota en los dedos: que teclear «L» ofrezca LINE lo PRIMERO, y no la séptima
 * de una lista alfabética cortada.
 *
 * Correr: npx tsx src/components/cad/command-line/command-suggestions.spec.ts
 */
import { strict as assert } from "node:assert";
import { sugerirComandos } from "./command-suggestions";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

// ── Nada escrito, nada que sugerir ──────────────────────────────────────────
eq(sugerirComandos("").length, 0, "sin texto no se sugiere nada");
eq(sugerirComandos("   ").length, 0, "ni con espacios");

// ── El alias exacto manda ───────────────────────────────────────────────────
{
  const conL = sugerirComandos("L");
  ok(conL.length > 0, "teclear «L» sugiere algo");
  eq(conL[0].nombre, "LINE", "«L» ofrece LINE LO PRIMERO: es la memoria muscular de cualquiera que venga de AutoCAD");
  const conRec = sugerirComandos("REC");
  eq(conRec[0].nombre, "RECTANG", "«REC» ofrece RECTANG lo primero");
}

// ── Por prefijo, y sin pasarse de seis ──────────────────────────────────────
{
  const conC = sugerirComandos("C");
  ok(conC.length <= 6, `la lista no pasa de seis (dio ${conC.length}): una lista que no cabe no se lee`);
  ok(
    conC.every((s) => s.nombre.startsWith("C")),
    "todas empiezan por lo tecleado",
  );
  const nombres = conC.map((s) => s.nombre);
  eq(new Set(nombres).size, nombres.length, "sin repetidos: el manifiesto y la paleta pueden dar el mismo rótulo dos veces");
}

// ── Da igual cómo se teclee ─────────────────────────────────────────────────
{
  eq(
    sugerirComandos("lin")[0]?.nombre,
    sugerirComandos("LIN")[0]?.nombre,
    "minúsculas y mayúsculas sugieren lo mismo",
  );
  eq(
    sugerirComandos("  line  ")[0]?.nombre,
    "LINE",
    "los espacios de sobra no estorban",
  );
}

// ── Lo que no existe no se inventa ──────────────────────────────────────────
eq(sugerirComandos("ZZZQQ").length, 0, "un prefijo que no es de nadie no sugiere nada");

// ── Cada sugerencia se puede pintar: nombre y descripción, siempre ──────────
{
  const muestra = sugerirComandos("A");
  ok(muestra.length > 0, "«A» sugiere algo");
  ok(
    muestra.every((s) => s.nombre.length > 0 && typeof s.descripcion === "string"),
    "toda sugerencia trae nombre y resumen: la lista los pinta sin comprobar nada",
  );
}

console.log(`✔ sugerencias de la línea de órdenes: ${verdes} aserciones verdes`);
